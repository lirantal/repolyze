import path from 'node:path'
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { CliParseError, dropIfEntryScriptPath, parseCliArgv, stripForwardedArgvSeparator } from '../src/cli/parseArgs.ts'

describe('stripForwardedArgvSeparator', () => {
  test('removes a pnpm/npm forwarded leading `--`', () => {
    assert.deepStrictEqual(stripForwardedArgvSeparator(['--', '--json', '.']), ['--json', '.'])
  })
})

describe('dropIfEntryScriptPath', () => {
  test('drops a leading entry script path when it resolves to the same file', () => {
    const entry = path.join(process.cwd(), 'src', 'bin', 'cli.ts')
    assert.deepStrictEqual(dropIfEntryScriptPath(['src/bin/cli.ts', '--json', '.'], entry), ['--json', '.'])
  })
})

describe('parseCliArgv', () => {
  test('defaults repository path to "."', () => {
    const parsed = parseCliArgv([])
    assert.strictEqual(parsed.repositoryPath, '.')
    assert.strictEqual(parsed.help, false)
    assert.strictEqual(parsed.verbose, false)
    assert.strictEqual(parsed.json, false)
  })

  test('parses flags and repository path', () => {
    const parsed = parseCliArgv(['--verbose', '--json', '/tmp/repo'])
    assert.strictEqual(parsed.verbose, true)
    assert.strictEqual(parsed.json, true)
    assert.strictEqual(parsed.repositoryPath, '/tmp/repo')
  })

  test('supports short flags', () => {
    const parsed = parseCliArgv(['-v', '-h'])
    assert.strictEqual(parsed.verbose, true)
    assert.strictEqual(parsed.help, true)
  })

  test('supports -- separator for positional paths', () => {
    const parsed = parseCliArgv(['--', './my repo'])
    assert.strictEqual(parsed.repositoryPath, './my repo')
  })

  test('rejects unknown options', () => {
    assert.throws(() => parseCliArgv(['--nope']), CliParseError)
  })

  test('rejects extra positionals', () => {
    assert.throws(() => parseCliArgv(['a', 'b']), CliParseError)
  })

  test('matches pnpm start argv shape after normalization', () => {
    const entry = path.join(process.cwd(), 'src', 'bin', 'cli.ts')
    const argv = stripForwardedArgvSeparator(dropIfEntryScriptPath(['src/bin/cli.ts', '--', '--json', '.'], entry))
    const parsed = parseCliArgv(argv)
    assert.strictEqual(parsed.json, true)
    assert.strictEqual(parsed.repositoryPath, '.')
  })
})
