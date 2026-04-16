/* eslint-disable security/detect-child-process -- integration tests execute the CLI entrypoint */
import { test, describe, after } from 'node:test'
import assert from 'node:assert'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'

const execFile = promisify(execFileCallback)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEmptyTempRepo, isoDaysAgo, writeAndCommit } from './helpers/gitFixture.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('repolyze CLI (integration)', () => {
  test('--json emits a parseable report', async () => {
    const { dir, cleanup } = await createEmptyTempRepo()
    after(async () => {
      await cleanup()
    })

    await writeAndCommit(dir, {
      file: 'README.md',
      content: '# hi\n',
      message: 'init',
      date: isoDaysAgo(1),
    })

    const { stdout } = await execFile(
      process.execPath,
      ['--import', 'tsx', path.join(repoRoot, 'src', 'bin', 'cli.ts'), '--json', dir],
      { cwd: repoRoot, encoding: 'utf8' },
    )

    const report = JSON.parse(String(stdout)) as { schemaVersion: number; repository: { head: string | null } }
    assert.strictEqual(report.schemaVersion, 1)
    assert.ok(report.repository.head !== null)
  })

  test('--help exits successfully', async () => {
    const { stdout, stderr } = await execFile(
      process.execPath,
      ['--import', 'tsx', path.join(repoRoot, 'src', 'bin', 'cli.ts'), '--help'],
      { encoding: 'utf8' },
    )

    assert.ok(String(stdout).includes('Usage:'))
    assert.strictEqual(String(stderr), '')
  })
})
