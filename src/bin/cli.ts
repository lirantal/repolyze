#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { analyzeRepository } from '../analyze/index.ts'
import { dropIfEntryScriptPath, HELP_TEXT, parseCliArgv, stripForwardedArgvSeparator } from '../cli/parseArgs.ts'
import { GitCommandError, NotAGitRepositoryError } from '../lib/git.ts'
import { renderPrettyReport } from '../render/pretty.ts'

async function main (): Promise<void> {
  const argv = stripForwardedArgvSeparator(
    dropIfEntryScriptPath(process.argv.slice(2), fileURLToPath(import.meta.url))
  )
  let parsed
  try {
    parsed = parseCliArgv(argv)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`${msg}\n`)
    process.exitCode = 1
    return
  }

  if (parsed.help) {
    process.stdout.write(`${HELP_TEXT}\n`)
    return
  }

  const cwd = path.resolve(parsed.repositoryPath)

  try {
    const report = await analyzeRepository(cwd, { verbose: parsed.verbose })
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    } else {
      process.stdout.write(`${renderPrettyReport(report)}\n`)
    }
  } catch (err) {
    if (err instanceof NotAGitRepositoryError) {
      process.stderr.write(`${err.message}\n`)
      process.exitCode = 1
      return
    }
    if (err instanceof GitCommandError) {
      const details = err.stderr.trim().length > 0 ? `\n${err.stderr.trim()}` : ''
      process.stderr.write(`Git error: ${err.message}${details}\n`)
      process.exitCode = 1
      return
    }

    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`Error: ${msg}\n`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`${msg}\n`)
  process.exitCode = 1
})
