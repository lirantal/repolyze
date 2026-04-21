export const REPORT_SCHEMA_VERSION = 3 as const

/** Max directory segments (excluding filename) used for {@link AnalysisReport.churn} `topDirectories`. */
export const CHURN_DIRECTORY_DEPTH_MAX = 3 as const

export interface RankedPath {
  path: string
  touches: number
}

export interface ContributorRow {
  name: string
  commits: number
}

export interface MonthlyCommitCount {
  month: string
  commits: number
}

export interface FirefightingRow {
  hash: string
  subject: string
}

export interface SecurityFixRow {
  hash: string
  subject: string
  tier: 1 | 2 | 3
}

export interface AnalysisInsight {
  id: string
  level: 'info' | 'warn'
  message: string
}

export interface AiToolingHotspotMatch {
  hash: string
  matchedVia: string
  subject: string
}

export interface AnalysisReport {
  schemaVersion: typeof REPORT_SCHEMA_VERSION
  generatedAt: string
  repository: {
    path: string
    topLevel: string | null
    head: string | null
  }
  churn: {
    window: string
    topFiles: RankedPath[]
    /** Directory rollup of file touches; keys use at most `directoryDepthMax` path segments. */
    topDirectories: RankedPath[]
    directoryDepthMax: typeof CHURN_DIRECTORY_DEPTH_MAX
  }
  contributors: {
    allTime: ContributorRow[]
    lastYear: ContributorRow[]
    lastSixMonths: ContributorRow[]
  }
  bugHotspots: {
    pattern: string
    topFiles: RankedPath[]
  }
  activityByMonth: MonthlyCommitCount[]
  firefighting: {
    window: string
    keywordPattern: string
    topFiles: RankedPath[]
    matches: FirefightingRow[]
  }
  securityHotspots: {
    keywordPattern: string
    topFiles: RankedPath[]
    matches: SecurityFixRow[]
  }
  aiToolingHotspots: {
    window: string
    patternSetVersion: number
    topFiles: RankedPath[]
    /** One resolved primary identity per classified commit (for detail / tooling). */
    topAuthors: ContributorRow[]
    /**
     * Counts per tracked agent identity (any GitHub App `+<slug>[bot]@users.noreply.github.com`,
     * Anthropic, Windsurf/Codeium, Cursor): each classified commit increments every distinct
     * identity on the author line or in any `Co-authored-by` trailer.
     */
    trackedBotContributors: ContributorRow[]
    matches: AiToolingHotspotMatch[]
  }
  insights: AnalysisInsight[]
}
