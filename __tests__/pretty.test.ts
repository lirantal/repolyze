import { test, describe } from 'node:test'
import assert from 'node:assert'
import { renderPrettyReport } from '../src/render/pretty.ts'
import type { AnalysisReport } from '../src/analyze/types.ts'
import { REPORT_SCHEMA_VERSION } from '../src/analyze/types.ts'

function stripAnsi (s: string): string {
  return s.replace(/\u001b\[[0-9;]*m/g, '')
}

/** Stable substrings from `horizontalRule` titles in `renderPrettyReport` (order matters). */
function assertPrettySectionMarkerOrder (out: string, markers: readonly string[]): void {
  const plain = stripAnsi(out)
  const indices = markers.map((m, i) => {
    const idx = plain.indexOf(m)
    assert.ok(idx >= 0, `expected pretty output to contain section marker[${String(i)}]: ${JSON.stringify(m)}`)
    return idx
  })
  for (let i = 1; i < indices.length; i++) {
    assert.ok(
      indices[i]! > indices[i - 1]!,
      `section marker[${String(i)}] (${JSON.stringify(markers[i])}) should appear after marker[${String(i - 1)}] (${JSON.stringify(markers[i - 1])})`
    )
  }
}

const basePrettyFixture = (): Omit<AnalysisReport, 'insights'> => ({
  schemaVersion: REPORT_SCHEMA_VERSION,
  generatedAt: '2026-04-15T00:00:00.000Z',
  repository: {
    path: '/tmp/repo',
    topLevel: '/tmp/repo',
    head: 'deadbeef',
  },
  churn: { window: '1 year ago', topFiles: [{ path: 'src/app.ts', touches: 42 }] },
  contributors: {
    allTime: [{ name: 'Ada', commits: 10 }],
    lastYear: [{ name: 'Ada', commits: 10 }],
    lastSixMonths: [{ name: 'Ada', commits: 4 }],
  },
  bugHotspots: { pattern: 'fix|bug|broken', topFiles: [{ path: 'src/app.ts', touches: 3 }] },
  activityByMonth: [
    { month: '2026-01', commits: 2 },
    { month: '2026-02', commits: 6 },
    { month: '2026-03', commits: 4 },
  ],
  firefighting: {
    window: '1 year ago',
    keywordPattern: 'revert|hotfix|emergency|rollback',
    matches: [{ hash: 'abc1234', subject: 'hotfix: patch' }],
  },
  securityHotspots: {
    keywordPattern: 'GHSA-|CVE-|CWE-',
    topFiles: [{ path: 'src/app.ts', touches: 1 }],
    matches: [{ hash: 'def5678', subject: 'fix(security): CVE-2024-1234', tier: 1 }],
  },
  aiToolingHotspots: {
    window: '1 year ago',
    patternSetVersion: 6,
    topFiles: [{ path: 'src/agent.ts', touches: 2 }],
    topAuthors: [{ name: 'copilot-swe-agent[bot]', commits: 2 }],
    trackedBotContributors: [
      { name: 'copilot-swe-agent[bot]', commits: 2 },
      { name: 'Claude (Anthropic)', commits: 1 },
    ],
    matches: [],
  },
})

describe('renderPrettyReport', () => {
  test('renders a stable report without throwing', () => {
    const report: AnalysisReport = {
      ...basePrettyFixture(),
      insights: [
        { id: 'churn_bug_overlap', level: 'warn', message: 'example overlap' },
        { id: 'squash_merge_caveat', level: 'info', message: 'example caveat' },
      ],
    }

    const out = renderPrettyReport(report)
    assert.ok(out.includes('repolyze'))
    assert.ok(out.includes('src/app.ts'))
    assert.ok(out.includes('Activity by month'))
  })

  test('AI subsection uses commit-contributions headline without removed dim explainer', () => {
    const report: AnalysisReport = {
      ...basePrettyFixture(),
      insights: [],
    }
    const plain = stripAnsi(renderPrettyReport(report))
    assert.ok(plain.includes('Agent & bot identities · commit contributions'))
    assert.strictEqual(plain.includes('Non-merge commits in this window'), false)
    assert.strictEqual(plain.includes('curated signals'), false)
    assert.strictEqual(
      plain.includes('── Agent & bot identities'),
      false,
      'agent identities should stay under the AI section, not a second horizontal rule',
    )
  })

  test('main section titles appear in canonical order (with insights)', () => {
    const report: AnalysisReport = {
      ...basePrettyFixture(),
      insights: [
        { id: 'churn_bug_overlap', level: 'warn', message: 'example overlap' },
        { id: 'squash_merge_caveat', level: 'info', message: 'example caveat' },
      ],
    }
    const out = renderPrettyReport(report)
    assertPrettySectionMarkerOrder(out, [
      'Activity by month ·',
      'Contributors · non-merge commits',
      'Churn · top paths · since',
      'Bug-keyword hotspots · grep',
      'Firefighting · oneline · since',
      'AI / automation tooling · paths & agents · since',
      'Security-fix hotspots ·',
      '── Insights',
    ])
  })

  test('main section titles appear in canonical order (no insights block)', () => {
    const report: AnalysisReport = {
      ...basePrettyFixture(),
      insights: [],
    }
    const out = renderPrettyReport(report)
    assert.strictEqual(stripAnsi(out).includes('── Insights'), false)
    assertPrettySectionMarkerOrder(out, [
      'Activity by month ·',
      'Contributors · non-merge commits',
      'Churn · top paths · since',
      'Bug-keyword hotspots · grep',
      'Firefighting · oneline · since',
      'AI / automation tooling · paths & agents · since',
      'Security-fix hotspots ·',
    ])
  })
})
