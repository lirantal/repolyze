export const REPORT_SCHEMA_VERSION = 1 as const

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
    matches: FirefightingRow[]
  }
  securityHotspots: {
    keywordPattern: string
    topFiles: RankedPath[]
    matches: SecurityFixRow[]
  }
  insights: AnalysisInsight[]
}
