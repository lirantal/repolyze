import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)

export interface RunGitOptions {
  cwd: string
  verbose?: boolean
  env?: NodeJS.ProcessEnv
}

export class NotAGitRepositoryError extends Error {
  readonly repositoryPath: string

  constructor (repositoryPath: string) {
    super(`Not a git repository: ${repositoryPath}`)
    this.name = 'NotAGitRepositoryError'
    this.repositoryPath = repositoryPath
  }
}

export class GitCommandError extends Error {
  readonly command: string[]
  readonly exitCode: number | null
  readonly stderr: string

  constructor (message: string, opts: { command: string[]; exitCode: number | null; stderr: string }) {
    super(message)
    this.name = 'GitCommandError'
    this.command = opts.command
    this.exitCode = opts.exitCode
    this.stderr = opts.stderr
  }
}

export async function runGit (args: string[], opts: RunGitOptions): Promise<string> {
  const command = ['--no-pager', ...args]
  if (opts.verbose === true) {
    process.stderr.write(`[repolyze] git ${command.join(' ')}\n`)
  }

  try {
    const { stdout, stderr } = await execFile('git', command, {
      cwd: opts.cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 100,
      env: {
        ...process.env,
        GIT_PAGER: 'cat',
        PAGER: 'cat',
        ...opts.env,
      },
    })

    if (opts.verbose === true && stderr.trim().length > 0) {
      process.stderr.write(stderr)
    }

    return stdout
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string; code?: string | number | null }
    const stderr = typeof e.stderr === 'string' ? e.stderr : ''
    const exitCode = typeof e.code === 'number' ? e.code : null
    throw new GitCommandError(`git failed: ${stderr || e.message}`, {
      command,
      exitCode,
      stderr,
    })
  }
}

export async function isInsideGitWorkTree (cwd: string, verbose?: boolean): Promise<boolean> {
  try {
    const out = await runGit(['rev-parse', '--is-inside-work-tree'], { cwd, verbose })
    return out.trim() === 'true'
  } catch {
    return false
  }
}
