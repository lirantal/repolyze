import { runGit } from '../lib/git.ts'
import {
  agentToolingContributorKeysInCommit,
  classifyAiToolingCommit,
  resolveAiToolingContributorKey,
} from './aiToolingPatterns.ts'
import type {
  AiToolingHotspotMatch,
  ContributorRow,
  FirefightingRow,
  MonthlyCommitCount,
  RankedPath,
  SecurityFixRow,
} from './types.ts'

const CHURN_WINDOW = '1 year ago'
const FIRE_WINDOW = '1 year ago'
const SHORTLOG_YEAR = '1 year ago'
const SHORTLOG_SIX_MONTHS = '6 months ago'
const BUG_GREP = 'fix|bug|broken'
const FIRE_KEYWORDS = 'revert|hotfix|emergency|rollback'
const FIRE_RE = new RegExp(FIRE_KEYWORDS, 'i')

const SECURITY_TIER1_GREP = 'GHSA-|CVE-|CWE-'
const SECURITY_TIER2_GREPS = [
  'fix\\(sec',
  'fix\\(security',
  'fix\\(vuln',
  '^sec:',
  '^security:',
]
const SECURITY_TIER3_GREP = 'SSRF|XSS|CSRF|injection|traversal|prototype.pollution|ReDoS|sandbox.escape|auth.bypass|command.injection|CRLF|deserialization|open.redirect'

const SECURITY_TIER1_RE = /GHSA-|CVE-|CWE-/i
const SECURITY_TIER2_RE = /fix\(sec|fix\(security|fix\(vuln|^sec:|^security:/im
const SECURITY_TIER3_RE = /SSRF|XSS|CSRF|injection|traversal|prototype.pollution|ReDoS|sandbox.escape|auth.bypass|command.injection|CRLF|deserialization|open.redirect/i
// "Merge commit from fork" is handled separately via a body-aware pass (Step 3)
const SECURITY_COMBINED_GREP = [SECURITY_TIER1_GREP, ...SECURITY_TIER2_GREPS, SECURITY_TIER3_GREP]

/** Delimits `git log` records in {@link collectAiToolingHotspots}; must not appear in commit metadata. */
const AI_LOG_MARKER_COMMIT = 'REP_COMMIT_V1'
const AI_LOG_MARKER_PATHS = 'REP_PATHS_V1'

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

export async function collectAiToolingHotspots (
  cwd: string,
  verbose?: boolean
): Promise<{
  topFiles: RankedPath[]
  topAuthors: ContributorRow[]
  trackedBotContributors: ContributorRow[]
  matches: AiToolingHotspotMatch[]
}> {
  const fmt = `${AI_LOG_MARKER_COMMIT}%n%H%n%an%n%ae%n%s%n%b%n${AI_LOG_MARKER_PATHS}%n`
  const raw = await runGit(
    ['log', `--since=${CHURN_WINDOW}`, '--no-merges', `--format=${fmt}`, '--name-only'],
    { cwd, verbose }
  )

  const pathCounts = new Map<string, number>()
  const authorCounts = new Map<string, number>()
  const trackedBotCounts = new Map<string, number>()
  const matches: AiToolingHotspotMatch[] = []
  const matchCap = 50

  const parts = raw.split(`${AI_LOG_MARKER_COMMIT}\n`)
  for (const part of parts) {
    const block = part.replace(/\s+$/, '')
    if (block.length === 0) continue

    const pathsMarker = `\n${AI_LOG_MARKER_PATHS}\n`
    const idx = block.indexOf(pathsMarker)
    if (idx === -1) continue

    const meta = block.slice(0, idx)
    const pathsSection = block.slice(idx + pathsMarker.length)

    const metaLines = meta.split('\n')
    const hash = metaLines[0]?.trim() ?? ''
    const authorName = metaLines[1]?.trim() ?? ''
    const authorEmail = metaLines[2]?.trim() ?? ''
    const subject = metaLines[3]?.trim() ?? ''
    const body = metaLines.slice(4).join('\n')

    if (!/^[0-9a-f]{7,40}$/i.test(hash)) continue

    const via = classifyAiToolingCommit({ authorName, authorEmail, subject, body })
    if (via === null) continue

    if (matches.length < matchCap) {
      matches.push({ hash: hash.slice(0, 7), matchedVia: via, subject })
    }

    const contributorKey = resolveAiToolingContributorKey({
      matchedVia: via,
      authorName,
      authorEmail,
      body,
    })
    authorCounts.set(contributorKey, (authorCounts.get(contributorKey) ?? 0) + 1)

    for (const rowKey of agentToolingContributorKeysInCommit({ authorEmail, body })) {
      trackedBotCounts.set(rowKey, (trackedBotCounts.get(rowKey) ?? 0) + 1)
    }

    for (const line of pathsSection.split('\n')) {
      const p = line.trim()
      if (p.length === 0) continue
      pathCounts.set(p, (pathCounts.get(p) ?? 0) + 1)
    }
  }

  const topFiles = [...pathCounts.entries()]
    .map(([path, touches]) => ({ path, touches }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 20)

  const topAuthors = [...authorCounts.entries()]
    .map(([name, commits]) => ({ name, commits }))
    .sort((a, b) => b.commits - a.commits)
    .slice(0, 12)

  const trackedBotContributors = [...trackedBotCounts.entries()]
    .filter(([, commits]) => commits > 0)
    .map(([name, commits]) => ({ name, commits }))
    .sort((a, b) => b.commits - a.commits)

  return { topFiles, topAuthors, trackedBotContributors, matches }
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

export async function collectSecurityHotspots (
  cwd: string,
  verbose?: boolean
): Promise<{ topFiles: RankedPath[]; matches: SecurityFixRow[] }> {
  const grepArgs = SECURITY_COMBINED_GREP.flatMap(g => [`--grep=${g}`])

  // Main pass: keyword grep across tiers 1/2/3 (excludes "Merge commit from fork")
  const raw = await runGit(
    ['log', '--all', '-i', '-E', ...grepArgs, '--oneline'],
    { cwd, verbose }
  )

  const seenHashes = new Set<string>()
  const matches: SecurityFixRow[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const space = trimmed.indexOf(' ')
    if (space === -1) continue
    const hash = trimmed.slice(0, space)
    const subject = trimmed.slice(space + 1)

    // "Merge commit from fork" commits matched here because the body
    // contained a keyword.  Defer them to the body-aware pass so they
    // are only included when an advisory ID is confirmed in the body.
    if (subject === 'Merge commit from fork') continue

    // git log --grep searches both subject and body.  We classify based on
    // the subject only: if a commit matched solely because the body contained
    // a keyword (e.g. "injection" in a changelog paragraph), but the subject
    // is unrelated, it would be a false positive.  Drop commits whose
    // subject does not match any tier.
    let tier: 1 | 2 | 3
    if (SECURITY_TIER1_RE.test(subject)) {
      tier = 1
    } else if (SECURITY_TIER2_RE.test(subject)) {
      tier = 2
    } else if (SECURITY_TIER3_RE.test(subject)) {
      tier = 3
    } else {
      continue
    }
    seenHashes.add(hash)
    matches.push({ hash, subject, tier })
  }

  // Step 3: body-aware pass for "Merge commit from fork" (GitHub security advisory merges).
  // These commits have a generic subject but the GHSA/CVE/CWE lives in the body.
  // Only promote to a match if the body actually contains an advisory identifier.
  const forkMergeRaw = await runGit(
    ['log', '--all', '--grep=Merge commit from fork', '--format=%H\t%s\t%b%x00'],
    { cwd, verbose }
  )

  for (const block of forkMergeRaw.split('\0')) {
    const trimmed = block.trim()
    if (trimmed.length === 0) continue
    const firstTab = trimmed.indexOf('\t')
    const secondTab = trimmed.indexOf('\t', firstTab + 1)
    if (firstTab === -1 || secondTab === -1) continue
    const hash = trimmed.slice(0, firstTab)
    const shortHash = hash.slice(0, 7)
    if (seenHashes.has(shortHash)) continue
    const subject = trimmed.slice(firstTab + 1, secondTab)
    const body = trimmed.slice(secondTab + 1)
    if (SECURITY_TIER1_RE.test(body)) {
      seenHashes.add(shortHash)
      matches.push({ hash: shortHash, subject, tier: 1 })
    }
  }

  // Collect file touches only from commits that passed subject-validation.
  // Using the validated hashes directly avoids counting files from commits
  // that matched via body-only keywords (false positives).
  let topFiles: RankedPath[] = []
  if (matches.length > 0) {
    const hashArgs = matches.map(m => m.hash)
    const rawFiles = await runGit(
      ['show', '--format=format:', '--name-only', ...hashArgs],
      { cwd, verbose }
    )
    topFiles = countPathTouches(rawFiles)
  }

  return { topFiles, matches }
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
  security: SECURITY_COMBINED_GREP.join(' | '),
} as const
