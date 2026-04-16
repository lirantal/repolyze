import type { AnalysisReport, MonthlyCommitCount, RankedPath } from '../analyze/types.ts'

const ansi = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
} as const

function useColor (): boolean {
  return process.stdout.isTTY === true && process.env.NO_COLOR === undefined
}

function paint (text: string, code: string, color: boolean): string {
  if (!color) return text
  return `${code}${text}${ansi.reset}`
}

function heatColor (level: number, color: boolean): string {
  const clamped = Math.max(0, Math.min(5, level))
  const palette = [
    '\x1b[38;5;235m',
    '\x1b[38;5;22m',
    '\x1b[38;5;28m',
    '\x1b[38;5;34m',
    '\x1b[38;5;40m',
    '\x1b[38;5;46m',
  ] as const
  return paint('█', palette[clamped] ?? palette[0], color)
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
  return `${paint(prefix, ansi.dim, color)}${paint(label, ansi.bold + ansi.cyan, color)}${paint(suffix + line, ansi.dim, color)}`
}

function bar (value: number, max: number, width: number, color: boolean): string {
  if (width <= 0) return ''
  if (max <= 0) return paint('░'.repeat(width), ansi.dim, color)
  const filled = Math.round((value / max) * width)
  const f = Math.max(0, Math.min(width, filled))
  const a = paint('█'.repeat(f), ansi.green, color)
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

function rankedPathsTable (
  rows: RankedPath[],
  opts: { color: boolean; width: number; bugPaths: Set<string> }
): string[] {
  if (rows.length === 0) return [paint('    (no data)', ansi.dim, opts.color)]

  const maxTouches = rows.reduce((m, r) => Math.max(m, r.touches), 0)
  // Rank | bar | touch count (fixed) | path — matches contributors-style alignment (bar column does not shift with label length).
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

  const lines: string[] = []
  let rank = 1
  for (const r of rows) {
    const bug = opts.bugPaths.has(r.path)
    const pathText = truncPath(r.path, pathCol)
    const pathStyled = bug ? paint(pathText, ansi.yellow + ansi.bold, opts.color) : pathText
    const rankStr = paint(String(rank).padStart(rankW, ' '), ansi.dim, opts.color)
    const b = bar(r.touches, maxTouches, barCol, opts.color)
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

  const max = rows.reduce((m, r) => Math.max(m, r.commits), 0)
  for (const r of rows.slice(0, limit)) {
    const b = bar(r.commits, max, 22, color)
    lines.push(`    ${paint(padRight(r.name, 28), ansi.white, color)} ${paint(String(r.commits).padStart(5, ' '), ansi.dim, color)}  ${b}`)
  }

  const more = rows.length - limit
  if (more > 0) lines.push(`    ${paint(`… ${String(more)} more`, ansi.dim, color)}`)

  return lines
}

function insightsBlock (report: AnalysisReport, color: boolean, width: number): string[] {
  if (report.insights.length === 0) return []

  const lines: string[] = [horizontalRule('Insights', width, color), '']
  for (const ins of report.insights) {
    const icon = ins.level === 'warn' ? paint('!', ansi.red + ansi.bold, color) : paint('i', ansi.blue, color)
    const msg = ins.level === 'warn' ? paint(ins.message, ansi.yellow, color) : ins.message
    lines.push(`    ${icon}  ${msg}`)
  }
  lines.push('')
  return lines
}

export function renderPrettyReport (report: AnalysisReport): string {
  const color = useColor()
  const width = termWidth()

  const bugPaths = new Set(report.bugHotspots.topFiles.map(f => f.path))

  const headerTop = `┌${'─'.repeat(Math.max(3, width - 2))}┐`
  const title = 'repolyze · repository signals'
  const subtitle = 'Git history · health signals'

  const lines: string[] = []
  lines.push(paint(headerTop, ansi.dim, color))
  lines.push(`${paint('│', ansi.dim, color)} ${paint(title, ansi.bold + ansi.cyan, color)}`)
  lines.push(`${paint('│', ansi.dim, color)} ${paint(subtitle, ansi.dim, color)}`)
  lines.push(paint(`└${'─'.repeat(Math.max(3, width - 2))}┘`, ansi.dim, color))
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
  lines.push(...rankedPathsTable(report.churn.topFiles, { color, width, bugPaths }))
  lines.push('')

  lines.push(horizontalRule(`Bug-keyword hotspots · grep ${report.bugHotspots.pattern}`, width, color))
  lines.push('')
  lines.push(...rankedPathsTable(report.bugHotspots.topFiles, { color, width, bugPaths: new Set() }))
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
    const max6 = report.contributors.lastSixMonths.reduce((m, r) => Math.max(m, r.commits), 0)
    for (const r of report.contributors.lastSixMonths.slice(0, 12)) {
      const b = bar(r.commits, max6, 22, color)
      lines.push(`    ${paint(padRight(r.name, 28), ansi.white, color)} ${paint(String(r.commits).padStart(5, ' '), ansi.dim, color)}  ${b}`)
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

  lines.push(...insightsBlock(report, color, width))

  return lines.join('\n')
}
