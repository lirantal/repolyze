/**
 * Example / documentation slugs for coding-agent style GitHub Apps (not an allowlist for
 * detection). GitHub automation: App noreply `+<slug>[bot]@…` / `slug[bot]@users.noreply.github.com`,
 * plus built-in Actions commits as `GitHub Actions <actions@github.com>`.
 * @see https://github.com/powerset-co/github-coding-agent-tracker
 */
export const CODING_AGENT_BOT_SLUGS: readonly string[] = [
  'amazon-q-developer',
  'blacksmith-sh',
  'chatgpt-codex-connector',
  'copilot-pull-request-reviewer',
  'copilot-swe-agent',
  'cursoragent',
  'dependabot',
  'devin-ai-integration',
  'factory-droid',
  'google-labs-jules',
  'greptile',
  'openhands',
  'renovate',
  'github-actions',
  'zed-industries-assistant',
] as const

export const AI_TOOLING_PATTERN_SET_VERSION = 7 as const

const ANTHROPIC_NOREPLY = 'noreply@anthropic.com'

/** Co-authored-by lines for Windsurf / Codeium agents (not GitHub noreply apps). */
export function windsurfAgentEmailMatch (email: string): boolean {
  const e = email.trim().toLowerCase()
  return e.endsWith('@codeium.com') || e.endsWith('@windsurf.com')
}

/** Cursor CLI / agent co-author email seen in practice. */
export function cursorAgentEmailMatch (email: string): boolean {
  return email.trim().toLowerCase() === 'cursoragent@cursor.com'
}

/** Cursor IDE appends this as the final non-blank line of the commit body when committing from the product. */
const MADE_WITH_CURSOR_LINE = /^Made-with:\s*Cursor\s*$/i

function bodyEndsWithMadeWithCursor (body: string): boolean {
  const lines = body.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i]?.trim() ?? ''
    if (t.length === 0) continue
    return MADE_WITH_CURSOR_LINE.test(t)
  }
  return false
}

const coAuthoredByRe = /^Co-authored-by:\s*(.+?)\s*<([^>]+)>\s*$/gim

/** GitHub: `123+app-slug[bot]@users.noreply.github.com` or `app-slug[bot]@users.noreply.github.com`. */
function slugFromGithubBotEmail (email: string): string | null {
  const e = email.trim()
  const withId = e.match(/^\d+\+([a-z0-9-]+)\[bot\]@users\.noreply\.github\.com$/i)
  if (withId?.[1] !== undefined) return withId[1].toLowerCase()
  const bare = e.match(/^([a-z0-9-]+)\[bot\]@users\.noreply\.github\.com$/i)
  if (bare?.[1] !== undefined) return bare[1].toLowerCase()
  return null
}

/** GitHub App noreply bot author or trailer email (with or without numeric `+` prefix). */
export function isGithubAppNoreplyBotEmail (email: string): boolean {
  return slugFromGithubBotEmail(email) !== null
}

/**
 * Commits authored as `GitHub Actions <actions@github.com>` (not the `[bot]@users.noreply`
 * address).
 */
export function githubActionsCommitBotEmail (email: string): boolean {
  return email.trim().toLowerCase() === 'actions@github.com'
}

/** Any GitHub automation identity we attribute on commits (noreply apps or Actions commit bot). */
export function isGithubAutomationActorEmail (email: string): boolean {
  return isGithubAppNoreplyBotEmail(email) || githubActionsCommitBotEmail(email)
}

function githubBotContributorLabel (email: string): string | null {
  const slug = slugFromGithubBotEmail(email)
  if (slug === null || slug.length === 0) return null
  return `${slug}[bot]`
}

/** Row label for GitHub automation from email (noreply `slug[bot]` or Actions commit bot). */
function githubAutomationContributorLabelForEmail (email: string): string | null {
  const noreply = githubBotContributorLabel(email)
  if (noreply !== null) return noreply
  if (githubActionsCommitBotEmail(email)) return 'GitHub Actions'
  return null
}

function anthropicCoAuthorMatch (displayName: string, email: string): boolean {
  const e = email.trim().toLowerCase()
  if (e !== ANTHROPIC_NOREPLY) return false
  const n = displayName.trim()
  if (n === 'Claude') return true
  if (/^Claude (Sonnet|Haiku|Opus)$/i.test(n)) return true
  if (n.startsWith('Claude ')) return true
  return false
}

function coAuthorLineAgentKind (
  displayName: string,
  email: string
): 'github-bot' | 'anthropic' | 'windsurf' | 'cursor' | null {
  if (isGithubAppNoreplyBotEmail(email)) return 'github-bot'
  if (githubActionsCommitBotEmail(email)) return 'github-bot'
  if (anthropicCoAuthorMatch(displayName, email)) return 'anthropic'
  if (windsurfAgentEmailMatch(email)) return 'windsurf'
  if (cursorAgentEmailMatch(email)) return 'cursor'
  return null
}

function scanCoAuthoredBy (body: string): string | null {
  coAuthoredByRe.lastIndex = 0
  for (const m of body.matchAll(coAuthoredByRe)) {
    const name = m[1]?.trim() ?? ''
    const email = m[2]?.trim() ?? ''
    if (name.length === 0 || email.length === 0) continue
    const kind = coAuthorLineAgentKind(name, email)
    if (kind === 'github-bot') return 'co-authored-by:github-bot-email'
    if (kind === 'anthropic') return 'co-authored-by:anthropic'
    if (kind === 'windsurf') return 'co-authored-by:windsurf'
    if (kind === 'cursor') return 'co-authored-by:cursor'
  }
  return null
}

/**
 * Classify a non-merge commit as agent/automation-assisted using trailers + known bot emails.
 */

/**
 * Label for ranking mixed identities — primary author for direct bot commits, otherwise the
 * first matching trailer identity (canonical `slug[bot]` for GitHub App emails).
 */
export function resolveAiToolingContributorKey (opts: {
  matchedVia: string
  authorName: string
  authorEmail: string
  body: string
}): string {
  if (opts.matchedVia === 'author:github-bot-email') {
    const label = githubAutomationContributorLabelForEmail(opts.authorEmail)
    if (label !== null) return label
    return opts.authorName.trim().length > 0 ? opts.authorName : 'unknown'
  }

  if (opts.matchedVia === 'body:made-with-cursor') return 'Cursor'

  coAuthoredByRe.lastIndex = 0
  for (const m of opts.body.matchAll(coAuthoredByRe)) {
    const name = (m[1] ?? '').trim()
    const email = (m[2] ?? '').trim()
    if (email.length === 0) continue

    if (opts.matchedVia === 'co-authored-by:github-bot-email') {
      const lab = githubAutomationContributorLabelForEmail(email)
      if (lab !== null) return lab
    }
    if (opts.matchedVia === 'co-authored-by:anthropic' && anthropicCoAuthorMatch(name, email)) {
      return 'Claude (Anthropic)'
    }
    if (opts.matchedVia === 'co-authored-by:windsurf' && windsurfAgentEmailMatch(email)) {
      return 'Windsurf'
    }
    if (opts.matchedVia === 'co-authored-by:cursor' && cursorAgentEmailMatch(email)) {
      return 'Cursor'
    }
  }

  const fallback = opts.authorName.trim()
  return fallback.length > 0 ? fallback : 'unknown'
}

export function classifyAiToolingCommit (opts: {
  authorName: string
  authorEmail: string
  subject: string
  body: string
}): string | null {
  const body = opts.body
  const trailerHit = scanCoAuthoredBy(body)
  if (trailerHit !== null) return trailerHit

  if (bodyEndsWithMadeWithCursor(body)) return 'body:made-with-cursor'

  if (isGithubAutomationActorEmail(opts.authorEmail)) return 'author:github-bot-email'

  return null
}

/**
 * Stable row labels for the agent-tooling contributor table: any GitHub App `slug[bot]`
 * noreply identity, plus Anthropic / Windsurf / Cursor when present on the author line or in any
 * `Co-authored-by` trailer. One commit can credit multiple identities.
 */
export function agentToolingContributorKeysInCommit (opts: { authorEmail: string; body: string }): string[] {
  const keys = new Set<string>()
  const authorLabel = githubAutomationContributorLabelForEmail(opts.authorEmail.trim())
  if (authorLabel !== null) keys.add(authorLabel)

  coAuthoredByRe.lastIndex = 0
  for (const m of opts.body.matchAll(coAuthoredByRe)) {
    const name = (m[1] ?? '').trim()
    const email = (m[2] ?? '').trim()
    if (email.length === 0) continue
    const kind = coAuthorLineAgentKind(name, email)
    if (kind === 'github-bot') {
      const label = githubAutomationContributorLabelForEmail(email)
      if (label !== null) keys.add(label)
    } else if (kind === 'anthropic') {
      keys.add('Claude (Anthropic)')
    } else if (kind === 'windsurf') {
      keys.add('Windsurf')
    } else if (kind === 'cursor') {
      keys.add('Cursor')
    }
  }
  if (bodyEndsWithMadeWithCursor(opts.body)) keys.add('Cursor')
  return [...keys]
}

/** Humanized `git shortlog` names for GitHub automation (no `[bot]` suffix in the name field). */
const SHORTLOG_GITHUB_AUTOMATION_NAMES = new Set(['github actions'])

/**
 * `git shortlog` only exposes display names. Treat `…[bot]` GitHub App accounts and known
 * humanized automation names (e.g. `GitHub Actions`) as bots for contributor highlighting.
 */
export function isLikelyAiBotContributorName (name: string): boolean {
  const t = name.trim()
  if (/^.+\[bot\]$/i.test(t)) return true
  return SHORTLOG_GITHUB_AUTOMATION_NAMES.has(t.toLowerCase())
}

/** Row labels produced for `agentToolingContributorKeysInCommit` (pretty-table highlighting). */
export function isAgentToolingContributorRow (name: string): boolean {
  if (isLikelyAiBotContributorName(name)) return true
  const t = name.trim()
  return t === 'Claude (Anthropic)' || t === 'Windsurf' || t === 'Cursor'
}
