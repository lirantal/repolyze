/* eslint-disable security/detect-child-process -- test harness executes git against ephemeral repositories */
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export async function execGit (cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<void> {
  await execFile('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
}

export function isoDaysAgo (days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString()
}

export async function createEmptyTempRepo (prefix = 'repolyze-fixture-'): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  await execGit(dir, ['init', '-b', 'main'])
  await execGit(dir, ['config', 'user.email', 'dev@example.com'])
  await execGit(dir, ['config', 'user.name', 'Dev'])
  await execGit(dir, ['config', 'commit.gpgsign', 'false'])
  await execGit(dir, ['config', 'tag.gpgsign', 'false'])
  return {
    dir,
    async cleanup () {
      await fs.rm(dir, { recursive: true, force: true })
    },
  }
}

export async function writeAndCommit (
  dir: string,
  opts: {
    file: string
    content: string
    message: string
    date: string
    authorName?: string
    authorEmail?: string
  },
): Promise<void> {
  const fp = path.join(dir, opts.file)
  await fs.mkdir(path.dirname(fp), { recursive: true })
  await fs.writeFile(fp, opts.content, 'utf8')
  await execGit(dir, ['add', '--', opts.file])

  const name = opts.authorName ?? 'Dev'
  const email = opts.authorEmail ?? 'dev@example.com'

  await execGit(
    dir,
    ['-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '--no-verify', '-m', opts.message],
    {
      ...process.env,
      GIT_AUTHOR_DATE: opts.date,
      GIT_COMMITTER_DATE: opts.date,
    },
  )
}
