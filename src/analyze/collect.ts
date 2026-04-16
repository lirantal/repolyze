import { runGit } from '../lib/git.ts'
import type { ContributorRow, FirefightingRow, MonthlyCommitCount, RankedPath } from './types.ts'

const CHURN_WINDOW = '1 year ago'
const FIRE_WINDOW = '1 year ago'
const SHORTLOG_YEAR = '1 year ago'
const SHORTLOG_SIX_MONTHS = '6 months ago'
const BUG_GREP = 'fix|bug|broken'
const FIRE_KEYWORDS = 'revert|hotfix|emergency|rollback'
const FIRE_RE = new RegExp(FIRE_KEYWORDS, 'i')

function countPathTouches (gitNameOnlyLog: string): RankedPath[] {
  const counts = new Map<string, number>()
  for (const line of gitNameOnlyLog.split('\n')) {
    const p = line.trim()
    if (p.length === 0) continue
    counts.set(p, (counts.get(p) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([path, touches]) => ({ path, touches }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 20)
}

export async function collectChurn (cwd: string, verbose?: boolean): Promise<RankedPath[]> {
  const raw = await runGit(
    ['log', '--format=format:', '--name-only', `--since=${CHURN_WINDOW}`],
    { cwd, verbose }
  )
  return countPathTouches(raw)
}

export async function collectBugHotspots (cwd: string, verbose?: boolean): Promise<RankedPath[]> {
  const raw = await runGit(
    ['log', '-i', '-E', `--grep=${BUG_GREP}`, '--name-only', '--format='],
    { cwd, verbose }
  )
  return countPathTouches(raw)
}

export async function collectActivityByMonth (cwd: string, verbose?: boolean): Promise<MonthlyCommitCount[]> {
  const raw = await runGit(
    ['log', '--format=%ad', '--date=format:%Y-%m'],
    { cwd, verbose }
  )

  const counts = new Map<string, number>()
  for (const line of raw.split('\n')) {
    const m = line.trim()
    if (m.length === 0) continue
    if (!/^\d{4}-\d{2}$/.test(m)) continue
    counts.set(m, (counts.get(m) ?? 0) + 1)
  }

  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, commits]) => ({ month, commits }))
}

export async function collectFirefighting (cwd: string, verbose?: boolean): Promise<FirefightingRow[]> {
  const raw = await runGit(
    ['log', '--oneline', `--since=${FIRE_WINDOW}`],
    { cwd, verbose }
  )

  const matches: FirefightingRow[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (!FIRE_RE.test(trimmed)) continue

    const space = trimmed.indexOf(' ')
    if (space === -1) continue
    const hash = trimmed.slice(0, space)
    const subject = trimmed.slice(space + 1)
    matches.push({ hash, subject })
  }

  return matches
}

function parseShortlog (raw: string): ContributorRow[] {
  const rows: ContributorRow[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue

    const tab = trimmed.indexOf('\t')
    if (tab === -1) continue

    const countRaw = trimmed.slice(0, tab).trim()
    const name = trimmed.slice(tab + 1).trim()
    const commits = Number.parseInt(countRaw, 10)
    if (!Number.isFinite(commits) || name.length === 0) continue
    rows.push({ name, commits })
  }

  return rows
}

export async function collectShortlog (
  cwd: string,
  since: string | undefined,
  verbose?: boolean
): Promise<ContributorRow[]> {
  // Always pass an explicit revision: without it, `git shortlog` reads from stdin when stdin is not a TTY
  // (common for Node subprocesses), which can hang indefinitely.
  const args = ['shortlog', '-sn', '--no-merges']
  if (since !== undefined) args.push(`--since=${since}`)
  args.push('HEAD')
  const raw = await runGit(args, { cwd, verbose })
  return parseShortlog(raw)
}

export async function collectRepositoryMeta (
  cwd: string,
  verbose?: boolean
): Promise<{ topLevel: string | null; head: string | null }> {
  let topLevel: string | null = null
  try {
    topLevel = (await runGit(['rev-parse', '--show-toplevel'], { cwd, verbose })).trim() || null
  } catch {
    topLevel = null
  }

  let head: string | null = null
  try {
    head = (await runGit(['rev-parse', 'HEAD'], { cwd, verbose })).trim() || null
  } catch {
    head = null
  }

  return { topLevel, head }
}

export const windows = {
  churn: CHURN_WINDOW,
  firefighting: FIRE_WINDOW,
  shortlogYear: SHORTLOG_YEAR,
  shortlogSixMonths: SHORTLOG_SIX_MONTHS,
} as const

export const patterns = {
  bugGrep: BUG_GREP,
  firefighting: FIRE_KEYWORDS,
} as const
