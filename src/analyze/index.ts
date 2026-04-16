import { isInsideGitWorkTree, NotAGitRepositoryError } from '../lib/git.ts'
import {
  collectActivityByMonth,
  collectBugHotspots,
  collectChurn,
  collectFirefighting,
  collectRepositoryMeta,
  collectShortlog,
  patterns,
  windows,
} from './collect.ts'
import { buildInsights } from './insights.ts'
import { REPORT_SCHEMA_VERSION, type AnalysisReport } from './types.ts'

export interface AnalyzeOptions {
  verbose?: boolean
}

export async function analyzeRepository (repositoryPath: string, opts?: AnalyzeOptions): Promise<AnalysisReport> {
  const cwd = repositoryPath
  const verbose = opts?.verbose === true

  const inside = await isInsideGitWorkTree(cwd, verbose)
  if (!inside) {
    throw new NotAGitRepositoryError(cwd)
  }

  const meta = await collectRepositoryMeta(cwd, verbose)

  if (meta.head === null) {
    const emptyBase: Omit<AnalysisReport, 'insights'> = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      repository: {
        path: cwd,
        topLevel: meta.topLevel,
        head: null,
      },
      churn: {
        window: windows.churn,
        topFiles: [],
      },
      contributors: {
        allTime: [],
        lastYear: [],
        lastSixMonths: [],
      },
      bugHotspots: {
        pattern: patterns.bugGrep,
        topFiles: [],
      },
      activityByMonth: [],
      firefighting: {
        window: windows.firefighting,
        keywordPattern: patterns.firefighting,
        matches: [],
      },
    }

    return {
      ...emptyBase,
      insights: buildInsights(emptyBase),
    }
  }

  const [
    churnTopFiles,
    bugHotspotsTopFiles,
    activityByMonth,
    firefightingMatches,
    contributorsAllTime,
    contributorsLastYear,
    contributorsLastSixMonths,
  ] = await Promise.all([
    collectChurn(cwd, verbose),
    collectBugHotspots(cwd, verbose),
    collectActivityByMonth(cwd, verbose),
    collectFirefighting(cwd, verbose),
    collectShortlog(cwd, undefined, verbose),
    collectShortlog(cwd, windows.shortlogYear, verbose),
    collectShortlog(cwd, windows.shortlogSixMonths, verbose),
  ])

  const base: Omit<AnalysisReport, 'insights'> = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    repository: {
      path: cwd,
      topLevel: meta.topLevel,
      head: meta.head,
    },
    churn: {
      window: windows.churn,
      topFiles: churnTopFiles,
    },
    contributors: {
      allTime: contributorsAllTime,
      lastYear: contributorsLastYear,
      lastSixMonths: contributorsLastSixMonths,
    },
    bugHotspots: {
      pattern: patterns.bugGrep,
      topFiles: bugHotspotsTopFiles,
    },
    activityByMonth,
    firefighting: {
      window: windows.firefighting,
      keywordPattern: patterns.firefighting,
      matches: firefightingMatches,
    },
  }

  return {
    ...base,
    insights: buildInsights(base),
  }
}

export type { AnalysisReport } from './types.ts'
export { REPORT_SCHEMA_VERSION } from './types.ts'
