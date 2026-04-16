import type { AnalysisInsight, AnalysisReport, ContributorRow } from './types.ts'

function nameKey (name: string): string {
  return name.trim().toLowerCase()
}

function busFactorShare (rows: ContributorRow[]): number | null {
  const total = rows.reduce((sum, r) => sum + r.commits, 0)
  if (total <= 0 || rows[0] === undefined) return null
  return rows[0].commits / total
}

export function buildInsights (report: Omit<AnalysisReport, 'insights'>): AnalysisInsight[] {
  const insights: AnalysisInsight[] = []

  if (report.repository.head === null) {
    insights.push({
      id: 'no_commits',
      level: 'info',
      message: 'No commits yet; history-based signals are empty.',
    })
    insights.push({
      id: 'squash_merge_caveat',
      level: 'info',
      message: 'Squash-merge workflows can make contributor counts reflect mergers more than authors.',
    })
    return insights
  }

  const churnSet = new Set(report.churn.topFiles.map(f => f.path))
  const overlap = report.bugHotspots.topFiles.filter(f => churnSet.has(f.path))
  if (overlap.length > 0) {
    const paths = overlap.map(o => o.path).slice(0, 8).join(', ')
    const extra = overlap.length > 8 ? ` (+${String(overlap.length - 8)} more)` : ''
    insights.push({
      id: 'churn_bug_overlap',
      level: 'warn',
      message: `Files appear in both high churn (${report.churn.window}) and bug-keyword hotspots: ${paths}${extra}.`,
    })
  }

  const share = busFactorShare(report.contributors.lastYear)
  const topLy = report.contributors.lastYear[0]
  if (share !== null && share >= 0.6 && topLy !== undefined) {
    insights.push({
      id: 'bus_factor_concentration',
      level: 'warn',
      message: `Top contributor in the last year authored about ${String(Math.round(share * 100))}% of non-merge commits (${topLy.name}).`,
    })
  }

  const topAll = report.contributors.allTime[0]
  if (topAll !== undefined) {
    const recent = new Set(report.contributors.lastSixMonths.map(c => nameKey(c.name)))
    if (!recent.has(nameKey(topAll.name))) {
      insights.push({
        id: 'top_contributor_inactive_recent',
        level: 'warn',
        message: `The overall top contributor (${topAll.name}) has no non-merge commits in the last 6 months.`,
      })
    }
  }

  if (report.firefighting.matches.length >= 10) {
    insights.push({
      id: 'high_firefighting_frequency',
      level: 'warn',
      message: `Many crisis-shaped commits in ${report.firefighting.window} (${String(report.firefighting.matches.length)} matches).`,
    })
  }

  if (report.bugHotspots.topFiles.length === 0) {
    insights.push({
      id: 'bug_keyword_signal_weak',
      level: 'info',
      message: 'No bug-keyword hotspots were detected; commit message hygiene may be hiding defect work.',
    })
  }

  if (report.firefighting.matches.length === 0) {
    insights.push({
      id: 'no_firefighting_keywords',
      level: 'info',
      message: 'No revert/hotfix/emergency/rollback keywords in the last year; either stability or non-descriptive messages.',
    })
  }

  insights.push({
    id: 'squash_merge_caveat',
    level: 'info',
    message: 'Squash-merge workflows can make contributor counts reflect mergers more than authors.',
  })

  return insights
}
