import type { AnalysisReport, MonthlyCommitCount, RankedPath } from '../analyze/types.ts'
import { getTheme } from './theme.ts'

const theme = getTheme()
const ansi = theme.ansi

function useColor (): boolean {
  return process.stdout.isTTY === true && process.env.NO_COLOR === undefined
}

function paint (text: string, code: string, color: boolean): string {
  if (!color) return text
  return `${code}${text}${ansi.reset}`
}

function heatColor (level: number, color: boolean): string {
  const clamped = Math.max(0, Math.min(5, level))
  const palette = theme.activity.heatFg
  return paint('█', palette[clamped] ?? palette[0] ?? '', color)
}

function termWidth (): number {
  const c = process.stdout.columns
  return typeof c === 'number' && c > 40 ? c : 100
}

function padRight (s: string, w: number): string {
  if (s.length >= w) return s
  return `${s}${' '.repeat(w - s.length)}`
}

function truncPath (p: string, max: number): string {
  if (p.length <= max) return p
  if (max <= 1) return '…'
  return `…${p.slice(-(max - 1))}`
}

function horizontalRule (label: string, width: number, color: boolean): string {
  const prefix = '── '
  const suffix = ' '
  const inner = width - prefix.length - suffix.length - label.length
  const line = inner > 0 ? '─'.repeat(inner) : ''
  // Titles: terminal default (no special color), but keep bold weight.
  return `${paint(prefix, ansi.dim, color)}${paint(label, ansi.bold, color)}${paint(suffix + line, ansi.dim, color)}`
}

function boxedHeader (title: string, subtitle: string, width: number, color: boolean): string[] {
  const w = Math.max(20, width)
  const top = `┌${'─'.repeat(Math.max(3, w - 2))}┐`
  const bottom = `└${'─'.repeat(Math.max(3, w - 2))}┘`

  const line = (content: string, contentPaint: (s: string) => string): string => {
    const pad = Math.max(0, w - content.length - 3)
    return `${paint('│', ansi.dim, color)} ${contentPaint(content)}${' '.repeat(pad)}${paint('│', ansi.dim, color)}`
  }

  return [
    paint(top, ansi.dim, color),
    // Title: terminal default (no special color), but bold.
    line(title, (s) => paint(s, ansi.bold, color)),
    line(subtitle, (s) => paint(s, ansi.dim, color)),
    paint(bottom, ansi.dim, color),
  ]
}

function bar (value: number, max: number, width: number, color: boolean, fillCode: string): string {
  if (width <= 0) return ''
  if (max <= 0) return paint('░'.repeat(width), ansi.dim, color)
  const filled = Math.round((value / max) * width)
  const f = Math.max(0, Math.min(width, filled))
  const a = paint('█'.repeat(f), fillCode, color)
  const b = paint('░'.repeat(width - f), ansi.dim, color)
  return `${a}${b}`
}

function monthIntensity (commits: number, max: number): number {
  if (commits <= 0) return 0
  if (max <= 0) return 0
  const ratio = commits / max
  return Math.max(1, Math.min(5, Math.ceil(ratio * 5)))
}

function renderContributionStrip (months: MonthlyCommitCount[], color: boolean, maxWidth: number): string[] {
  const slice = months.slice(-Math.min(120, months.length))
  const max = slice.reduce((m, x) => Math.max(m, x.commits), 0)

  const blocks: string[] = []
  for (const m of slice) {
    blocks.push(heatColor(monthIntensity(m.commits, max), color))
  }

  const out: string[] = []
  let row: string[] = []
  let rowLen = 0
  const prefix = '    '
  const budget = Math.max(20, maxWidth - prefix.length)

  for (const b of blocks) {
    const visible = 1
    if (rowLen + visible > budget && row.length > 0) {
      out.push(`${prefix}${row.join('')}${ansi.reset}`)
      row = []
      rowLen = 0
    }
    row.push(b)
    rowLen += visible
  }
  if (row.length > 0) out.push(`${prefix}${row.join('')}${ansi.reset}`)

  const first = slice[0]?.month
  const last = slice[slice.length - 1]?.month
  if (first !== undefined && last !== undefined) {
    out.push(`${prefix}${paint(`${first} → ${last}`, ansi.dim, color)}  ${paint(`peak ${String(max)} commits / month`, ansi.dim, color)}`)
  }

  return out
}

type TableTone = 'churn' | 'bugs' | 'security'

function toneColor (tone: TableTone): string {
  if (tone === 'bugs') return theme.rgb.bugs
  if (tone === 'security') return theme.rgb.security
  return theme.rgb.churn
}

function rankedPathsTable (
  rows: RankedPath[],
  opts: { color: boolean; width: number; highlightPaths: Set<string>; tone: TableTone }
): string[] {
  if (rows.length === 0) return [paint('    (no data)', ansi.dim, opts.color)]

  const maxTouches = rows.reduce((m, r) => Math.max(m, r.touches), 0)
  const barCol = 22
  const countW = 5
  const rankW = Math.max(2, String(rows.length).length)
  const prefix = '    '
  const gapAfterRank = 2
  const gapAfterBar = 1
  const gapAfterCount = 2
  const fixed =
    prefix.length +
    rankW +
    gapAfterRank +
    barCol +
    gapAfterBar +
    countW +
    gapAfterCount
  const pathCol = Math.max(8, opts.width - fixed)

  const fill = toneColor(opts.tone)
  const lines: string[] = []
  let rank = 1
  for (const r of rows) {
    const highlight = opts.highlightPaths.has(r.path)
    const pathText = truncPath(r.path, pathCol)
    const pathStyled = highlight ? paint(pathText, ansi.bold + fill, opts.color) : pathText
    const rankStr = paint(String(rank).padStart(rankW, ' '), ansi.dim, opts.color)
    const b = bar(r.touches, maxTouches, barCol, opts.color, fill)
    const countStr = paint(String(r.touches).padStart(countW, ' '), ansi.dim, opts.color)
    lines.push(
      `${prefix}${rankStr}${' '.repeat(gapAfterRank)}${b}${' '.repeat(gapAfterBar)}${countStr}${' '.repeat(gapAfterCount)}${pathStyled}`
    )
    rank += 1
  }

  return lines
}

function contributorsPreview (report: AnalysisReport, color: boolean, limit: number): string[] {
  const lines: string[] = []
  const rows = report.contributors.lastYear.length > 0 ? report.contributors.lastYear : report.contributors.allTime
  if (rows.length === 0) return [paint('    (no data)', ansi.dim, color)]

  const shownRows = rows.slice(0, limit)
  const rankW = Math.max(2, String(shownRows.length).length)
  const prefix = '    '
  const gapAfterRank = 2

  const max = rows.reduce((m, r) => Math.max(m, r.commits), 0)
  let rank = 1
  for (const r of shownRows) {
    const b = bar(r.commits, max, 22, color, theme.rgb.contributors)
    const rankStr = paint(String(rank).padStart(rankW, ' '), ansi.dim, color)
    lines.push(
      `${prefix}${rankStr}${' '.repeat(gapAfterRank)}${paint(padRight(r.name, 28), ansi.white, color)} ${paint(String(r.commits).padStart(5, ' '), ansi.dim, color)}  ${b}`
    )
    rank += 1
  }

  const more = rows.length - limit
  if (more > 0) lines.push(`    ${paint(`… ${String(more)} more`, ansi.dim, color)}`)

  return lines
}

function insightsBlock (report: AnalysisReport, color: boolean, width: number): string[] {
  if (report.insights.length === 0) return []

  const lines: string[] = [horizontalRule('Insights', width, color), '']
  for (const ins of report.insights) {
    // Insights colors should align with the report sections:
    // - warn → bug-fixes color
    // - info → terminal default (no tint)
    const icon = ins.level === 'warn'
      ? paint('!', ansi.bold + theme.rgb.bugs, color)
      : 'i'
    const msg = ins.level === 'warn'
      ? paint(ins.message, theme.rgb.bugs, color)
      : ins.message
    lines.push(`    ${icon}  ${msg}`)
  }
  lines.push('')
  return lines
}

export function renderPrettyReport (report: AnalysisReport): string {
  const color = useColor()
  const width = termWidth()

  const bugPaths = new Set(report.bugHotspots.topFiles.map(f => f.path))
  const churnPaths = new Set(report.churn.topFiles.map(f => f.path))

  const lines: string[] = []
  lines.push(...boxedHeader('repolyze · repository signals', 'Git history · health signals', width, color))
  lines.push('')

  const metaLine = [
    `${paint('path', ansi.dim, color)} ${report.repository.topLevel ?? report.repository.path}`,
    `${paint('head', ansi.dim, color)} ${report.repository.head ?? paint('(no commits)', ansi.dim, color)}`,
    `${paint('at', ansi.dim, color)} ${report.generatedAt}`,
  ].join(paint('  ·  ', ansi.dim, color))

  lines.push(metaLine)
  lines.push('')

  lines.push(horizontalRule(`Activity by month · ${String(report.activityByMonth.length)} buckets`, width, color))
  lines.push('')
  lines.push(...renderContributionStrip(report.activityByMonth, color, width))
  lines.push('')

  lines.push(horizontalRule(`Churn · top paths · since ${report.churn.window}`, width, color))
  lines.push('')
  lines.push(...rankedPathsTable(report.churn.topFiles, { color, width, highlightPaths: bugPaths, tone: 'churn' }))
  lines.push('')

  lines.push(horizontalRule(`Bug-keyword hotspots · grep ${report.bugHotspots.pattern}`, width, color))
  lines.push('')
  lines.push(...rankedPathsTable(report.bugHotspots.topFiles, { color, width, highlightPaths: churnPaths, tone: 'bugs' }))
  lines.push('')

  lines.push(horizontalRule('Contributors · non-merge commits', width, color))
  lines.push('')
  lines.push(paint('    Last year (or all-time if empty):', ansi.dim, color))
  lines.push(...contributorsPreview(report, color, 12))
  lines.push('')
  lines.push(paint('    Last 6 months:', ansi.dim, color))
  if (report.contributors.lastSixMonths.length === 0) {
    lines.push(paint('    (no data)', ansi.dim, color))
  } else {
    const sixRows = report.contributors.lastSixMonths.slice(0, 12)
    const rankW6 = Math.max(2, String(sixRows.length).length)
    const max6 = report.contributors.lastSixMonths.reduce((m, r) => Math.max(m, r.commits), 0)
    const prefix6 = '    '
    const gapAfterRank6 = 2
    let rank6 = 1
    for (const r of sixRows) {
      const b = bar(r.commits, max6, 22, color, theme.rgb.contributors)
      const rankStr = paint(String(rank6).padStart(rankW6, ' '), ansi.dim, color)
      lines.push(
        `${prefix6}${rankStr}${' '.repeat(gapAfterRank6)}${paint(padRight(r.name, 28), ansi.white, color)} ${paint(String(r.commits).padStart(5, ' '), ansi.dim, color)}  ${b}`
      )
      rank6 += 1
    }
  }
  lines.push('')

  lines.push(horizontalRule(`Firefighting · oneline · since ${report.firefighting.window} · ${report.firefighting.keywordPattern}`, width, color))
  lines.push('')
  if (report.firefighting.matches.length === 0) {
    lines.push(paint('    (no matches)', ansi.dim, color))
  } else {
    for (const m of report.firefighting.matches.slice(0, 18)) {
      lines.push(`    ${paint(m.hash, ansi.magenta, color)}  ${m.subject}`)
    }
    const more = report.firefighting.matches.length - 18
    if (more > 0) lines.push(`    ${paint(`… ${String(more)} more`, ansi.dim, color)}`)
  }
  lines.push('')

  const securityChurnOverlap = new Set(report.churn.topFiles.map(f => f.path))
  lines.push(horizontalRule(`Security-fix hotspots · ${String(report.securityHotspots.matches.length)} matching commits`, width, color))
  lines.push('')
  lines.push(...rankedPathsTable(report.securityHotspots.topFiles, { color, width, highlightPaths: securityChurnOverlap, tone: 'security' }))
  lines.push('')

  if (report.securityHotspots.matches.length > 0) {
    const tierLabel = (tier: 1 | 2 | 3): string => {
      if (tier === 1) return paint('T1', ansi.bold + theme.rgb.security, color)
      if (tier === 2) return paint('T2', theme.rgb.security, color)
      return paint('T3', ansi.dim, color)
    }
    const sorted = [...report.securityHotspots.matches].sort((a, b) => a.tier - b.tier)
    for (const m of sorted.slice(0, 18)) {
      lines.push(`    ${tierLabel(m.tier)}  ${paint(m.hash, ansi.magenta, color)}  ${m.subject}`)
    }
    const more = sorted.length - 18
    if (more > 0) lines.push(`    ${paint(`… ${String(more)} more`, ansi.dim, color)}`)
    lines.push('')
  }

  lines.push(...insightsBlock(report, color, width))

  return lines.join('\n')
}
