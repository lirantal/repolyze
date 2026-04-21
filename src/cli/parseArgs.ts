import path from 'node:path'

export interface ParsedCli {
  help: boolean
  verbose: boolean
  json: boolean
  repositoryPath: string
}

export class CliParseError extends Error {
  constructor (message: string) {
    super(message)
    this.name = 'CliParseError'
  }
}

/**
 * `pnpm run … -- <args>` forwards a leading `--` into the child process so the script can receive
 * flags like `--json`. That separator is not meant to be parsed as POSIX "end of options" for us.
 */
export function stripForwardedArgvSeparator (argv: string[]): string[] {
  if (argv[0] === '--') return argv.slice(1)
  return argv
}

/**
 * When launched via `tsx src/bin/cli.ts …`, the first argv entry is the entry module path.
 * When launched via `node dist/bin/cli.cjs …`, `process.argv.slice(2)` usually omits the script,
 * but tsx keeps it — drop it when it resolves to the same file as `entryFilePath`.
 */
export function dropIfEntryScriptPath (argv: string[], entryFilePath: string): string[] {
  const first = argv[0]
  if (first === undefined) return argv

  try {
    if (path.resolve(process.cwd(), first) === path.resolve(entryFilePath)) {
      return argv.slice(1)
    }
  } catch {
    // ignore invalid paths
  }

  return argv
}

export function parseCliArgv (argv: string[]): ParsedCli {
  const positionals: string[] = []
  let help = false
  let verbose = false
  let json = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === undefined) continue

    if (a === '--') {
      for (const p of argv.slice(i + 1)) positionals.push(p)
      break
    }

    if (a === '--help' || a === '-h') {
      help = true
      continue
    }
    if (a === '--verbose' || a === '-v') {
      verbose = true
      continue
    }
    if (a === '--json') {
      json = true
      continue
    }

    if (a.startsWith('-')) {
      throw new CliParseError(`Unknown option: ${a}`)
    }

    positionals.push(a)
  }

  const repositoryPath = positionals[0] ?? '.'
  if (positionals.length > 1) {
    throw new CliParseError('Too many positional arguments (expected 0 or 1 repository paths).')
  }

  return { help, verbose, json, repositoryPath }
}

export const HELP_TEXT = `repolyze — scan a repository’s git history for maintainership and risk signals.

Usage:
  repolyze [options] [repository]

Options:
  -h, --help      Show help
  -v, --verbose   Print git commands to stderr
  --json          Emit JSON (schemaVersion: 3) on stdout

Arguments:
  repository      Path to analyze (defaults to the current working directory)
`
