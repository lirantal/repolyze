import { test, describe, after } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { analyzeRepository } from '../src/analyze/index.ts'
import { NotAGitRepositoryError } from '../src/lib/git.ts'
import { createEmptyTempRepo, execGit, isoDaysAgo, writeAndCommit } from './helpers/gitFixture.ts'

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

  test('classifies security-fix commits into tiers and inspects fork-merge bodies', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    const secFile = 'src/auth.ts'
    const otherFile = 'src/utils.ts'

    await writeAndCommit(dir, {
      file: secFile,
      content: 'v0\n',
      message: 'init auth module',
      date: isoDaysAgo(30),
    })

    // Tier 1: commit with CVE in subject
    await writeAndCommit(dir, {
      file: secFile,
      content: 'v1\n',
      message: 'fix: patch query parsing for CVE-2024-1234',
      date: isoDaysAgo(25),
    })

    // Tier 2: conventional commit scope
    await writeAndCommit(dir, {
      file: secFile,
      content: 'v2\n',
      message: 'security: harden input validation',
      date: isoDaysAgo(20),
    })

    // Tier 3: vulnerability-class keyword
    await writeAndCommit(dir, {
      file: secFile,
      content: 'v3\n',
      message: 'fix: prevent path traversal in file uploads',
      date: isoDaysAgo(15),
    })

    // "Merge commit from fork" WITH advisory in body -> should be tier 1
    await fs.writeFile(path.join(dir, secFile), 'v4\n', 'utf8')
    await execGit(dir, ['add', '--', secFile])
    await execGit(dir, [
      'commit', '--no-verify',
      '-m', 'Merge commit from fork',
      '-m', 'GHSA-xxxx-yyyy-zzzz: fixed XSS in template rendering.',
    ], {
      GIT_AUTHOR_DATE: isoDaysAgo(10),
      GIT_COMMITTER_DATE: isoDaysAgo(10),
    })

    // "Merge commit from fork" WITHOUT advisory in body -> should be excluded
    await writeAndCommit(dir, {
      file: otherFile,
      content: 'cleanup\n',
      message: 'unrelated change',
      date: isoDaysAgo(8),
    })
    await fs.writeFile(path.join(dir, otherFile), 'v2\n', 'utf8')
    await execGit(dir, ['add', '--', otherFile])
    await execGit(dir, [
      'commit', '--no-verify',
      '-m', 'Merge commit from fork',
      '-m', 'Minor refactoring from contributor fork.',
    ], {
      GIT_AUTHOR_DATE: isoDaysAgo(5),
      GIT_COMMITTER_DATE: isoDaysAgo(5),
    })

    const report = await analyzeRepository(dir)

    // Two tier 1 (CVE subject + fork-merge with GHSA body), one tier 2, one tier 3
    const t1 = report.securityHotspots.matches.filter(m => m.tier === 1)
    const t2 = report.securityHotspots.matches.filter(m => m.tier === 2)
    const t3 = report.securityHotspots.matches.filter(m => m.tier === 3)

    assert.strictEqual(t1.length, 2, 'expected 2 tier-1 matches (CVE subject + fork-merge GHSA body)')
    assert.ok(t1.some(m => /CVE-2024-1234/.test(m.subject)), 'tier 1 should include CVE subject commit')
    assert.ok(t1.some(m => m.subject === 'Merge commit from fork'), 'tier 1 should include fork-merge with GHSA in body')

    assert.strictEqual(t2.length, 1, 'expected 1 tier-2 match (security: scope)')
    assert.ok(/harden/.test(t2[0].subject))

    assert.strictEqual(t3.length, 1, 'expected 1 tier-3 match (traversal keyword)')
    assert.ok(/traversal/.test(t3[0].subject))

    // The non-advisory "Merge commit from fork" should NOT appear in any tier
    const forkMatches = report.securityHotspots.matches.filter(m => m.subject === 'Merge commit from fork')
    assert.strictEqual(forkMatches.length, 1, 'only the fork-merge with GHSA in body should be included')
    assert.strictEqual(forkMatches[0].tier, 1)

    // secFile should appear in top files (touched by all security commits)
    assert.ok(report.securityHotspots.topFiles.some(f => f.path === secFile))

    // Advisory coverage insight
    assert.ok(report.insights.some(i => i.id === 'security_advisory_coverage'))
  })
})
