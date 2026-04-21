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

    assert.strictEqual(report.schemaVersion, 2)
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

    // Body-only keyword match -> should be EXCLUDED (subject has no security keyword)
    await fs.writeFile(path.join(dir, otherFile), 'serve\n', 'utf8')
    await execGit(dir, ['add', '--', otherFile])
    await execGit(dir, [
      'commit', '--no-verify',
      '-m', 'feat: add --serve flag to serve generated HTML',
      '-m', 'Uses injection of env vars for configuration.',
    ], {
      GIT_AUTHOR_DATE: isoDaysAgo(9),
      GIT_COMMITTER_DATE: isoDaysAgo(9),
    })

    // "Merge commit from fork" WITHOUT advisory in body -> should be excluded
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

    // Total: exactly 4 matches (no false positives from body-only or non-advisory fork merges)
    assert.strictEqual(report.securityHotspots.matches.length, 4,
      'expected exactly 4 security matches (2 T1 + 1 T2 + 1 T3)')

    // The non-advisory "Merge commit from fork" should NOT appear in any tier
    const forkMatches = report.securityHotspots.matches.filter(m => m.subject === 'Merge commit from fork')
    assert.strictEqual(forkMatches.length, 1, 'only the fork-merge with GHSA in body should be included')
    assert.strictEqual(forkMatches[0].tier, 1)

    // Body-only keyword match should NOT appear (subject has no security keyword)
    assert.ok(
      !report.securityHotspots.matches.some(m => /serve/.test(m.subject)),
      'commits matching only via body content should be excluded'
    )

    // secFile should appear in top files (touched by all security commits)
    assert.ok(report.securityHotspots.topFiles.some(f => f.path === secFile))

    // otherFile is only touched by excluded commits (body-only + non-advisory fork merge)
    // so it must NOT appear in topFiles
    assert.ok(
      !report.securityHotspots.topFiles.some(f => f.path === otherFile),
      'files touched only by excluded commits should not appear in topFiles'
    )

    // Advisory coverage insight
    assert.ok(report.insights.some(i => i.id === 'security_advisory_coverage'))
  })

  test('collects AI / automation tooling hotspots from trailers and GitHub bot authors', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    const agentFile = 'src/agent.ts'
    const otherFile = 'src/other.ts'

    await writeAndCommit(dir, {
      file: otherFile,
      content: 'x\n',
      message: 'init',
      date: isoDaysAgo(200),
    })

    await writeAndCommit(dir, {
      file: agentFile,
      content: 'v1\n',
      message: 'feat: sweep\n\nCo-authored-by: Copilot <123+copilot-swe-agent[bot]@users.noreply.github.com>',
      date: isoDaysAgo(100),
    })

    await writeAndCommit(dir, {
      file: agentFile,
      content: 'v2\n',
      message: 'chore: bot touch',
      date: isoDaysAgo(50),
      authorName: 'copilot-swe-agent[bot]',
      authorEmail: '999+copilot-swe-agent[bot]@users.noreply.github.com',
    })

    await writeAndCommit(dir, {
      file: otherFile,
      content: 'y\n',
      message: 'feat: human\n\nCo-authored-by: Claude Opus <wrong@example.com>',
      date: isoDaysAgo(40),
    })

    const report = await analyzeRepository(dir)

    const aiTop = report.aiToolingHotspots.topFiles.find(f => f.path === agentFile)
    assert.ok(aiTop !== undefined)
    assert.strictEqual(aiTop.touches, 2)

    const botAuthor = report.aiToolingHotspots.topAuthors.find(a => a.name.includes('copilot-swe-agent'))
    assert.ok(botAuthor !== undefined)
    assert.strictEqual(botAuthor.commits, 2)

    const tracked = report.aiToolingHotspots.trackedBotContributors.find(
      r => r.name === 'copilot-swe-agent[bot]',
    )
    assert.ok(tracked !== undefined)
    assert.strictEqual(tracked.commits, 2)

    assert.ok(
      !report.aiToolingHotspots.matches.some(m => /Claude Opus|wrong@example/.test(m.subject)),
      'spoofed Co-authored-by without a trusted bot identity should not be classified',
    )
  })

  test('counts GitHub Actions direct author commits in AI paths and agent identity rows', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    await writeAndCommit(dir, {
      file: 'ci.yml',
      content: 'on: push\n',
      message: 'init',
      date: isoDaysAgo(30),
    })

    await writeAndCommit(dir, {
      file: 'ci.yml',
      content: 'on: [push]\n',
      message: 'ci: bump',
      date: isoDaysAgo(5),
      authorName: 'GitHub Actions',
      authorEmail: '41898282+github-actions[bot]@users.noreply.github.com',
    })

    const report = await analyzeRepository(dir)
    const ci = report.aiToolingHotspots.topFiles.find(f => f.path === 'ci.yml')
    assert.ok(ci !== undefined)
    assert.strictEqual(ci.touches, 1)

    const ga = report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'github-actions[bot]')
    assert.ok(ga !== undefined)
    assert.strictEqual(ga.commits, 1)

    const top = report.aiToolingHotspots.topAuthors.find(r => r.name === 'github-actions[bot]')
    assert.ok(top !== undefined)
    assert.strictEqual(top.commits, 1)
  })

  test('counts GitHub Actions with actions@github.com (changelog / workflow commits)', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    await writeAndCommit(dir, {
      file: 'CHANGELOG.md',
      content: '# v1\n',
      message: 'init',
      date: isoDaysAgo(40),
    })

    await writeAndCommit(dir, {
      file: 'CHANGELOG.md',
      content: '# v1.1\n',
      message: 'chore: Update CHANGELOG.md',
      date: isoDaysAgo(2),
      authorName: 'GitHub Actions',
      authorEmail: 'actions@github.com',
    })

    const report = await analyzeRepository(dir)
    const ga = report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'GitHub Actions')
    assert.ok(ga !== undefined)
    assert.strictEqual(ga.commits, 1)
    const ch = report.aiToolingHotspots.topFiles.find(f => f.path === 'CHANGELOG.md')
    assert.ok(ch !== undefined)
    assert.strictEqual(ch.touches, 1)
  })

  test('counts GitHub Actions with bare noreply email (no numeric prefix)', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    await writeAndCommit(dir, {
      file: 'workflow.yml',
      content: 'on: push\n',
      message: 'init',
      date: isoDaysAgo(20),
    })

    await writeAndCommit(dir, {
      file: 'workflow.yml',
      content: 'on: workflow_dispatch\n',
      message: 'ci: dispatch',
      date: isoDaysAgo(3),
      authorName: 'GitHub Actions',
      authorEmail: 'github-actions[bot]@users.noreply.github.com',
    })

    const report = await analyzeRepository(dir)
    const ga = report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'github-actions[bot]')
    assert.ok(ga !== undefined)
    assert.strictEqual(ga.commits, 1)
  })

  test('credits every listed bot trailer on a single commit for trackedBotContributors', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    await writeAndCommit(dir, {
      file: 'README.md',
      content: '# hi\n',
      message: 'init',
      date: isoDaysAgo(10),
    })

    await writeAndCommit(dir, {
      file: 'README.md',
      content: '# hi2\n',
      message:
        'chore: bump\n\nCo-authored-by: Dependabot <1+dependabot[bot]@users.noreply.github.com>\nCo-authored-by: Copilot <2+copilot-swe-agent[bot]@users.noreply.github.com>',
      date: isoDaysAgo(5),
    })

    const report = await analyzeRepository(dir)
    const dep = report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'dependabot[bot]')
    const cop = report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'copilot-swe-agent[bot]')
    assert.ok(dep !== undefined && dep.commits === 1)
    assert.ok(cop !== undefined && cop.commits === 1)
  })

  test('tracks Anthropic, Windsurf, and Cursor co-authors in trackedBotContributors', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    await writeAndCommit(dir, {
      file: 'a.ts',
      content: '1\n',
      message: 'init',
      date: isoDaysAgo(20),
    })

    await writeAndCommit(dir, {
      file: 'a.ts',
      content: '2\n',
      message: 'feat: claude\n\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
      date: isoDaysAgo(15),
    })

    await writeAndCommit(dir, {
      file: 'a.ts',
      content: '3\n',
      message: 'feat: windsurf\n\nCo-authored-by: Windsurf Agent <windsurf@codeium.com>',
      date: isoDaysAgo(10),
    })

    await writeAndCommit(dir, {
      file: 'a.ts',
      content: '4\n',
      message: 'feat: cursor\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>',
      date: isoDaysAgo(5),
    })

    const report = await analyzeRepository(dir)
    const names = new Set(report.aiToolingHotspots.trackedBotContributors.map(r => r.name))
    assert.ok(names.has('Claude (Anthropic)'))
    assert.ok(names.has('Windsurf'))
    assert.ok(names.has('Cursor'))
    assert.strictEqual(
      report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'Claude (Anthropic)')?.commits,
      1,
    )
    assert.strictEqual(
      report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'Windsurf')?.commits,
      1,
    )
    assert.strictEqual(
      report.aiToolingHotspots.trackedBotContributors.find(r => r.name === 'Cursor')?.commits,
      1,
    )
  })
})
