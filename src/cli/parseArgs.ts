import path from 'node:path'
import { parseArgs } from 'node:util'

export interface ParsedCli {
  help: boolean
  verbose: boolean
  json: boolean
  markdown: boolean
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
  let parsed
  try {
    parsed = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: true,
      options: {
        help: { type: 'boolean', short: 'h' },
        verbose: { type: 'boolean', short: 'v' },
        json: { type: 'boolean' },
        markdown: { type: 'boolean' },
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new CliParseError(msg)
  }

  const { values, positionals } = parsed
  if (positionals.length > 1) {
    throw new CliParseError('Too many positional arguments (expected 0 or 1 repository paths).')
  }

  return {
    help: values.help === true,
    verbose: values.verbose === true,
    json: values.json === true,
    markdown: values.markdown === true,
    repositoryPath: positionals[0] ?? '.',
  }
}

export const HELP_TEXT = `repolyze — scan a repository’s git history for maintainership and risk signals.

Usage:
  repolyze [options] [repository]

Options:
  -h, --help      Show help
  -v, --verbose   Print git commands to stderr
  --json          Emit JSON (schemaVersion: 3) on stdout
  --markdown      Emit Markdown report optimized for LLM consumption on stdout

Arguments:
  repository      Path to analyze (defaults to the current working directory)
`
