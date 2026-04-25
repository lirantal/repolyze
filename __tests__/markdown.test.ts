import { test, describe } from 'node:test'
import assert from 'node:assert'
import { renderMarkdownReport } from '../src/render/markdown.ts'
import type { AnalysisReport } from '../src/analyze/types.ts'
import { CHURN_DIRECTORY_DEPTH_MAX, REPORT_SCHEMA_VERSION } from '../src/analyze/types.ts'

function assertSectionOrder (out: string, markers: readonly string[]): void {
  const indices = markers.map((m, i) => {
    const idx = out.indexOf(m)
    assert.ok(idx >= 0, `expected markdown output to contain section marker[${String(i)}]: ${JSON.stringify(m)}`)
    return idx
  })
  for (let i = 1; i < indices.length; i++) {
    assert.ok(
      indices[i]! > indices[i - 1]!,
      `section marker[${String(i)}] (${JSON.stringify(markers[i])}) should appear after marker[${String(i - 1)}] (${JSON.stringify(markers[i - 1])})`
    )
  }
}

const baseFixture = (): Omit<AnalysisReport, 'insights'> => ({
  schemaVersion: REPORT_SCHEMA_VERSION,
  generatedAt: '2026-04-15T00:00:00.000Z',
  repository: {
    path: '/tmp/repo',
    topLevel: '/tmp/repo',
    head: 'deadbeef',
  },
  churn: {
    window: '1 year ago',
    topFiles: [{ path: 'src/app.ts', touches: 42 }],
    topDirectories: [{ path: 'src', touches: 42 }],
    directoryDepthMax: CHURN_DIRECTORY_DEPTH_MAX,
  },
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
    topFiles: [{ path: 'src/app.ts', touches: 2 }],
    matches: [{ hash: 'abc1234', subject: 'hotfix: patch' }],
  },
  securityHotspots: {
    keywordPattern: 'GHSA-|CVE-|CWE-',
    topFiles: [{ path: 'src/app.ts', touches: 1 }],
    matches: [{ hash: 'def5678', subject: 'fix(security): CVE-2024-1234', tier: 1 }],
  },
  aiToolingHotspots: {
    window: '1 year ago',
    patternSetVersion: 7,
    topFiles: [{ path: 'src/agent.ts', touches: 2 }],
    topAuthors: [{ name: 'copilot-swe-agent[bot]', commits: 2 }],
    trackedBotContributors: [
      { name: 'copilot-swe-agent[bot]', commits: 2 },
      { name: 'Claude (Anthropic)', commits: 1 },
    ],
    matches: [],
  },
})

describe('renderMarkdownReport', () => {
  test('renders without throwing and contains key strings', () => {
    const report: AnalysisReport = { ...baseFixture(), insights: [] }
    const out = renderMarkdownReport(report)
    assert.ok(out.includes('# repolyze'))
    assert.ok(out.includes('/tmp/repo'))
    assert.ok(out.includes('src/app.ts'))
    assert.ok(out.includes('deadbeef'))
  })

  test('section headings appear in canonical order', () => {
    const report: AnalysisReport = {
      ...baseFixture(),
      insights: [
        { id: 'churn_bug_overlap', level: 'warn', message: 'example overlap' },
        { id: 'squash_merge_caveat', level: 'info', message: 'example caveat' },
      ],
    }
    const out = renderMarkdownReport(report)
    assertSectionOrder(out, [
      '## Activity by month',
      '## Contributors',
      '### All time',
      '### Last year',
      '### Last 6 months',
      '## Churn — top files',
      '## Churn — top directories',
      '## Bug-keyword hotspots',
      '## Firefighting',
      '## AI / automation tooling',
      '## Security-fix hotspots',
      '## Insights',
    ])
  })

  test('no Insights section when empty', () => {
    const report: AnalysisReport = { ...baseFixture(), insights: [] }
    const out = renderMarkdownReport(report)
    assert.strictEqual(out.includes('## Insights'), false)
  })

  test('insights block renders warn and info markers', () => {
    const report: AnalysisReport = {
      ...baseFixture(),
      insights: [
        { id: 'a', level: 'warn', message: 'bad thing' },
        { id: 'b', level: 'info', message: 'good thing' },
      ],
    }
    const out = renderMarkdownReport(report)
    assert.ok(out.includes('⚠ bad thing'))
    assert.ok(out.includes('ℹ good thing'))
  })

  test('firefighting lists at most five recent commits and notes older matches', () => {
    const base = baseFixture()
    const matches = Array.from({ length: 7 }, (_, i) => ({
      hash: `abc000${String(i)}`,
      subject: `hotfix ${String(i)}`,
    }))
    const report: AnalysisReport = {
      ...base,
      firefighting: { ...base.firefighting, matches },
      insights: [],
    }
    const out = renderMarkdownReport(report)
    const commitLines = out.split('\n').filter(line => /^- `[0-9a-f]/.test(line))
    assert.strictEqual(commitLines.length, 5)
    assert.ok(out.includes('… and 2 older matching commits'))
  })

  test('security matches sorted by tier', () => {
    const base = baseFixture()
    const report: AnalysisReport = {
      ...base,
      securityHotspots: {
        ...base.securityHotspots,
        matches: [
          { hash: 'aaa', subject: 'T3 fix', tier: 3 },
          { hash: 'bbb', subject: 'T1 fix', tier: 1 },
        ],
      },
      insights: [],
    }
    const out = renderMarkdownReport(report)
    const t1idx = out.indexOf('T1')
    const t3idx = out.indexOf('T3')
    assert.ok(t1idx < t3idx, 'T1 should appear before T3')
  })

  test('markdown tables use pipe syntax', () => {
    const report: AnalysisReport = { ...baseFixture(), insights: [] }
    const out = renderMarkdownReport(report)
    const tableLines = out.split('\n').filter(l => l.startsWith('|'))
    assert.ok(tableLines.length > 0, 'should have at least one table row')
  })
})
