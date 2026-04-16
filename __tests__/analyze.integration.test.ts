import { test, describe, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { analyzeRepository } from '../src/analyze/index.ts'
import { NotAGitRepositoryError } from '../src/lib/git.ts'
import { createEmptyTempRepo, isoDaysAgo, writeAndCommit } from './helpers/gitFixture.ts'

describe('analyzeRepository (integration)', () => {
  test('throws when the target is not a git repository', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'repolyze-notgit-'))
    after(async () => {
      await fs.rm(dir, { recursive: true, force: true })
    })

    await assert.rejects(async () => await analyzeRepository(dir), NotAGitRepositoryError)
  })

  test('returns empty history signals for a repository with no commits', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    const report = await analyzeRepository(dir)
    assert.strictEqual(report.repository.head, null)
    assert.deepStrictEqual(report.churn.topFiles, [])
    assert.deepStrictEqual(report.activityByMonth, [])
    assert.ok(report.insights.some(i => i.id === 'no_commits'))
  })

  test('collects churn, bug hotspots, cadence, firefighting, and contributors', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    const hot = 'src/hot.ts'
    const cold = 'src/cold.ts'

    await writeAndCommit(dir, {
      file: hot,
      content: 'v0\n',
      message: 'init hot module',
      date: isoDaysAgo(900),
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
    })

    for (let i = 0; i < 20; i++) {
      await writeAndCommit(dir, {
        file: hot,
        content: `v${String(i + 1)}\n`,
        message: `iterate hot ${String(i)}`,
        date: isoDaysAgo(860 - i),
        authorName: 'Alice',
        authorEmail: 'alice@example.com',
      })
    }

    await writeAndCommit(dir, {
      file: cold,
      content: 'x\n',
      message: 'add cold file',
      date: isoDaysAgo(850),
      authorName: 'Alice',
      authorEmail: 'alice@example.com',
    })

    for (let i = 0; i < 5; i++) {
      await writeAndCommit(dir, {
        file: hot,
        content: `recent ${String(i)}\n`,
        message: `update hot ${String(i)}`,
        date: isoDaysAgo(28 - i),
        authorName: 'Bob',
        authorEmail: 'bob@example.com',
      })
    }

    await writeAndCommit(dir, {
      file: hot,
      content: "console.log('fixed')\n",
      message: 'fix broken behavior in hot module',
      date: isoDaysAgo(20),
      authorName: 'Bob',
      authorEmail: 'bob@example.com',
    })

    await writeAndCommit(dir, {
      file: 'README.md',
      content: '# ok\n',
      message: 'hotfix: patch release',
      date: isoDaysAgo(10),
      authorName: 'Bob',
      authorEmail: 'bob@example.com',
    })

    const report = await analyzeRepository(dir)

    assert.strictEqual(report.schemaVersion, 1)
    assert.ok(report.repository.head !== null)

    const churnTop = report.churn.topFiles[0]
    assert.ok(churnTop !== undefined)
    assert.strictEqual(churnTop.path, hot)

    const bugTop = report.bugHotspots.topFiles.find(f => f.path === hot)
    assert.ok(bugTop !== undefined)

    assert.ok(report.activityByMonth.length > 0)
    assert.ok(report.firefighting.matches.some(m => /hotfix/i.test(m.subject)))

    const bobLastYear = report.contributors.lastYear.find(c => c.name.includes('Bob'))
    const aliceLastYear = report.contributors.lastYear.find(c => c.name.includes('Alice'))
    assert.ok(bobLastYear !== undefined)
    assert.ok(aliceLastYear === undefined)

    assert.ok(report.insights.some(i => i.id === 'churn_bug_overlap'))
    assert.ok(report.insights.some(i => i.id === 'top_contributor_inactive_recent'))
  })
})
