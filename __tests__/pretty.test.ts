import { test, describe } from 'node:test'
import assert from 'node:assert'
import { renderPrettyReport } from '../src/render/pretty.ts'
import type { AnalysisReport } from '../src/analyze/types.ts'
import { REPORT_SCHEMA_VERSION } from '../src/analyze/types.ts'

describe('renderPrettyReport', () => {
  test('renders a stable report without throwing', () => {
    const report: AnalysisReport = {
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
})
