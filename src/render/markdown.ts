import type { AnalysisReport, ContributorRow, RankedPath } from '../analyze/types.ts'

function mdTable (headers: string[], rows: string[][]): string[] {
  const sep = headers.map(() => '---')
  return [
    `| ${headers.join(' | ')} |`,
    `| ${sep.join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ]
}

function rankedPathsRows (paths: RankedPath[]): string[][] {
  return paths.map((p, i) => [String(i + 1), p.path, String(p.touches)])
}

function contributorRows (contributors: ContributorRow[]): string[][] {
  return contributors.map((c, i) => [String(i + 1), c.name, String(c.commits)])
}

function contributorNameKey (name: string): string {
  return name.trim().toLowerCase()
}

function rosterChangeText (report: AnalysisReport): string {
  const baseline = report.contributors.lastYear.length > 0 ? report.contributors.lastYear : report.contributors.allTime
  const recent = report.contributors.lastSixMonths

  const s1 = new Set(baseline.map(r => contributorNameKey(r.name)))
  const s2 = new Set(recent.map(r => contributorNameKey(r.name)))
  const union = new Set([...s1, ...s2])

  if (union.size === 0) return '(no contributor identities)'

  let symDiff = 0
  for (const k of union) {
    if (!(s1.has(k) && s2.has(k))) symDiff += 1
  }

  const pct = Math.round((100 * symDiff) / union.size)

  if (pct === 0 || recent.length === 0) {
    return 'Roster change: 0% — the same distinct contributors appear on both lists above'
  }
  return `Roster change: ${String(pct)}% of contributors appeared or disappeared in the last 6 months compared to the prior period.`
}

export function renderMarkdownReport (report: AnalysisReport): string {
  const repoLabel = report.repository.topLevel ?? report.repository.path
  const headLabel = report.repository.head ?? '(no commits)'

  const lines: string[] = []

  lines.push(`# repolyze — ${repoLabel}`)
  lines.push('')
  lines.push(`_Generated ${report.generatedAt} · HEAD ${headLabel}_`)
  lines.push('')

  // Activity by month
  lines.push(`## Activity by month (${String(report.activityByMonth.length)} buckets)`)
  lines.push('')
  if (report.activityByMonth.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Month', 'Commits'], report.activityByMonth.map(m => [m.month, String(m.commits)])))
  }
  lines.push('')

  // Contributors
  lines.push('## Contributors')
  lines.push('')
  lines.push('### All time')
  lines.push('')
  if (report.contributors.allTime.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Name', 'Commits'], contributorRows(report.contributors.allTime.slice(0, 20))))
  }
  lines.push('')
  lines.push('### Last year')
  lines.push('')
  if (report.contributors.lastYear.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Name', 'Commits'], contributorRows(report.contributors.lastYear.slice(0, 20))))
  }
  lines.push('')
  lines.push('### Last 6 months')
  lines.push('')
  if (report.contributors.lastSixMonths.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Name', 'Commits'], contributorRows(report.contributors.lastSixMonths.slice(0, 20))))
  }
  lines.push('')
  lines.push(rosterChangeText(report))
  lines.push('')

  // Churn — top files
  lines.push(`## Churn — top files (since ${report.churn.window})`)
  lines.push('')
  if (report.churn.topFiles.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Path', 'Touches'], rankedPathsRows(report.churn.topFiles)))
  }
  lines.push('')

  // Churn — top directories
  lines.push(`## Churn — top directories (max depth ${String(report.churn.directoryDepthMax)}, since ${report.churn.window})`)
  lines.push('')
  if (report.churn.topDirectories.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Path', 'Touches'], rankedPathsRows(report.churn.topDirectories)))
  }
  lines.push('')

  // Bug-keyword hotspots
  lines.push(`## Bug-keyword hotspots (grep: \`${report.bugHotspots.pattern}\`)`)
  lines.push('')
  if (report.bugHotspots.topFiles.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Path', 'Touches'], rankedPathsRows(report.bugHotspots.topFiles)))
  }
  lines.push('')

  // Firefighting
  lines.push(`## Firefighting (since ${report.firefighting.window}, grep: \`${report.firefighting.keywordPattern}\`)`)
  lines.push('')
  if (report.firefighting.matches.length === 0) {
    lines.push('_(no matches)_')
  } else {
    lines.push(...mdTable(['Rank', 'Path', 'Touches'], rankedPathsRows(report.firefighting.topFiles)))
    lines.push('')
    lines.push('**Recent matching commits (most recent first):**')
    lines.push('')
    for (const m of report.firefighting.matches.slice(0, 5)) {
      lines.push(`- \`${m.hash}\` ${m.subject}`)
    }
    const older = report.firefighting.matches.length - 5
    if (older > 0) {
      lines.push(`- _… and ${String(older)} older matching commit${older === 1 ? '' : 's'} (full list in JSON)_`)
    }
  }
  lines.push('')

  // AI / automation tooling
  lines.push(`## AI / automation tooling (since ${report.aiToolingHotspots.window})`)
  lines.push('')
  lines.push('_Paths ranked by touches in commits classified as agent/automation-assisted._')
  lines.push('')
  if (report.aiToolingHotspots.topFiles.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Path', 'Touches'], rankedPathsRows(report.aiToolingHotspots.topFiles)))
  }
  lines.push('')
  lines.push('**Agent & bot identities — commit contributions:**')
  lines.push('')
  if (report.aiToolingHotspots.trackedBotContributors.length === 0) {
    lines.push('_(none detected)_')
  } else {
    lines.push(...mdTable(['Rank', 'Name', 'Commits'], contributorRows(report.aiToolingHotspots.trackedBotContributors)))
  }
  lines.push('')

  // Security-fix hotspots
  lines.push(`## Security-fix hotspots (${String(report.securityHotspots.matches.length)} matching commits)`)
  lines.push('')
  if (report.securityHotspots.topFiles.length === 0) {
    lines.push('_(no data)_')
  } else {
    lines.push(...mdTable(['Rank', 'Path', 'Touches'], rankedPathsRows(report.securityHotspots.topFiles)))
  }
  lines.push('')
  if (report.securityHotspots.matches.length > 0) {
    const tierLabel = (tier: 1 | 2 | 3): string => {
      if (tier === 1) return 'T1'
      if (tier === 2) return 'T2'
      return 'T3'
    }
    const sorted = [...report.securityHotspots.matches].sort((a, b) => a.tier - b.tier)
    for (const m of sorted.slice(0, 18)) {
      lines.push(`- ${tierLabel(m.tier)} \`${m.hash}\` ${m.subject}`)
    }
    const more = sorted.length - 18
    if (more > 0) lines.push(`- _… ${String(more)} more_`)
    lines.push('')
  }

  // Insights
  if (report.insights.length > 0) {
    lines.push('## Insights')
    lines.push('')
    for (const ins of report.insights) {
      const icon = ins.level === 'warn' ? '⚠' : 'ℹ'
      lines.push(`- ${icon} ${ins.message}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
