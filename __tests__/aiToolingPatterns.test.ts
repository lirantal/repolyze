import { test, describe } from 'node:test'
import assert from 'node:assert'
import {
  agentToolingContributorKeysInCommit,
  classifyAiToolingCommit,
  cursorAgentEmailMatch,
  githubActionsCommitBotEmail,
  isAgentToolingContributorRow,
  isGithubAutomationActorEmail,
  isLikelyAiBotContributorName,
  resolveAiToolingContributorKey,
  windsurfAgentEmailMatch,
} from '../src/analyze/aiToolingPatterns.ts'

describe('classifyAiToolingCommit', () => {
  test('matches GitHub App author email for a listed coding-agent slug', () => {
    const via = classifyAiToolingCommit({
      authorName: 'copilot-swe-agent[bot]',
      authorEmail: '579311+copilot-swe-agent[bot]@users.noreply.github.com',
      subject: 'fix: patch',
      body: '',
    })
    assert.strictEqual(via, 'author:github-bot-email')
  })

  test('matches Co-authored-by trailer with listed bot email', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Dev',
      authorEmail: 'dev@example.com',
      subject: 'feat: add widget',
      body: '\nCo-authored-by: Copilot <123+copilot-swe-agent[bot]@users.noreply.github.com>\n',
    })
    assert.strictEqual(via, 'co-authored-by:github-bot-email')
  })

  test('matches Anthropic noreply with composite Claude display name', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Dev',
      authorEmail: 'dev@example.com',
      subject: 'feat: add widget',
      body: '\nCo-authored-by: Claude Code <noreply@anthropic.com>\n',
    })
    assert.strictEqual(via, 'co-authored-by:anthropic')
  })

  test('matches Co-Authored-By (mixed case) Claude Sonnet 4.6 + Anthropic noreply', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Human',
      authorEmail: 'human@example.com',
      subject: 'refactor: x',
      body: '\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>\n',
    })
    assert.strictEqual(via, 'co-authored-by:anthropic')
  })

  test('matches Windsurf / Codeium co-author email', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Human',
      authorEmail: 'human@example.com',
      subject: 'feat: x',
      body: '\nCo-authored-by: Windsurf Agent <windsurf@codeium.com>\n',
    })
    assert.strictEqual(via, 'co-authored-by:windsurf')
  })

  test('matches Cascade @windsurf.com co-author email', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Human',
      authorEmail: 'human@example.com',
      subject: 'feat: x',
      body: '\nCo-Authored-By: Cascade Agent <cascade@windsurf.com>\n',
    })
    assert.strictEqual(via, 'co-authored-by:windsurf')
  })

  test('matches Cursor agent co-author email', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Human',
      authorEmail: 'human@example.com',
      subject: 'feat: x',
      body: '\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>\n',
    })
    assert.strictEqual(via, 'co-authored-by:cursor')
  })

  test('does not match Claude Opus with a non-Anthropic email', () => {
    const via = classifyAiToolingCommit({
      authorName: 'Dev',
      authorEmail: 'dev@example.com',
      subject: 'feat: add widget',
      body: '\nCo-authored-by: Claude Opus <wrong@example.com>\n',
    })
    assert.strictEqual(via, null)
  })

  test('matches any GitHub App noreply bot on author line (e.g. github-actions)', () => {
    const via = classifyAiToolingCommit({
      authorName: 'GitHub Actions',
      authorEmail: '41898282+github-actions[bot]@users.noreply.github.com',
      subject: 'chore: ci',
      body: '',
    })
    assert.strictEqual(via, 'author:github-bot-email')
  })

  test('matches GitHub App email without numeric + prefix (github-actions[bot]@…)', () => {
    const via = classifyAiToolingCommit({
      authorName: 'GitHub Actions',
      authorEmail: 'github-actions[bot]@users.noreply.github.com',
      subject: 'chore: ci',
      body: '',
    })
    assert.strictEqual(via, 'author:github-bot-email')
  })

  test('matches built-in GitHub Actions committer (actions@github.com)', () => {
    const via = classifyAiToolingCommit({
      authorName: 'GitHub Actions',
      authorEmail: 'actions@github.com',
      subject: 'chore: Update CHANGELOG.md',
      body: '',
    })
    assert.strictEqual(via, 'author:github-bot-email')
  })

  test('matches arbitrary GitHub App slug not in the example slug list', () => {
    const via = classifyAiToolingCommit({
      authorName: 'some-unknown[bot]',
      authorEmail: '1+some-unknown[bot]@users.noreply.github.com',
      subject: 'chore: bot',
      body: '',
    })
    assert.strictEqual(via, 'author:github-bot-email')
  })
})

describe('githubActionsCommitBotEmail / isGithubAutomationActorEmail', () => {
  test('detects actions@github.com', () => {
    assert.strictEqual(githubActionsCommitBotEmail('actions@github.com'), true)
    assert.strictEqual(githubActionsCommitBotEmail('Actions@GITHUB.COM'), true)
    assert.strictEqual(githubActionsCommitBotEmail('noreply@github.com'), false)
  })

  test('isGithubAutomationActorEmail covers noreply and Actions commit bot', () => {
    assert.strictEqual(isGithubAutomationActorEmail('1+dependabot[bot]@users.noreply.github.com'), true)
    assert.strictEqual(isGithubAutomationActorEmail('actions@github.com'), true)
    assert.strictEqual(isGithubAutomationActorEmail('human@example.com'), false)
  })
})

describe('windsurfAgentEmailMatch / cursorAgentEmailMatch', () => {
  test('detects Codeium and Windsurf domains', () => {
    assert.strictEqual(windsurfAgentEmailMatch('windsurf@codeium.com'), true)
    assert.strictEqual(windsurfAgentEmailMatch('Cascade@WINDSURF.COM'), true)
    assert.strictEqual(windsurfAgentEmailMatch('human@gmail.com'), false)
  })

  test('detects Cursor agent email', () => {
    assert.strictEqual(cursorAgentEmailMatch('cursoragent@cursor.com'), true)
    assert.strictEqual(cursorAgentEmailMatch('CursorAgent@CURSOR.com'), true)
    assert.strictEqual(cursorAgentEmailMatch('other@cursor.com'), false)
  })
})

describe('agentToolingContributorKeysInCommit', () => {
  test('collects github-actions from author email even when display name is humanized', () => {
    const keys = agentToolingContributorKeysInCommit({
      authorEmail: '41898282+github-actions[bot]@users.noreply.github.com',
      body: '',
    })
    assert.deepStrictEqual(keys, ['github-actions[bot]'])
  })

  test('collects github-actions from bare noreply email (no numeric prefix)', () => {
    const keys = agentToolingContributorKeysInCommit({
      authorEmail: 'github-actions[bot]@users.noreply.github.com',
      body: '',
    })
    assert.deepStrictEqual(keys, ['github-actions[bot]'])
  })

  test('collects GitHub Actions from actions@github.com author', () => {
    const keys = agentToolingContributorKeysInCommit({
      authorEmail: 'actions@github.com',
      body: '',
    })
    assert.deepStrictEqual(keys, ['GitHub Actions'])
  })

  test('collects author slug and every listed Co-authored-by bot', () => {
    const keys = agentToolingContributorKeysInCommit({
      authorEmail: '9+copilot-swe-agent[bot]@users.noreply.github.com',
      body: [
        '',
        'Co-authored-by: Dep <1+dependabot[bot]@users.noreply.github.com>',
        'Co-authored-by: Cop <2+copilot-swe-agent[bot]@users.noreply.github.com>',
      ].join('\n'),
    })
    assert.deepStrictEqual(new Set(keys), new Set(['copilot-swe-agent[bot]', 'dependabot[bot]']))
  })

  test('collects Anthropic, Windsurf, and Cursor on one commit without dropping GitHub bots', () => {
    const keys = agentToolingContributorKeysInCommit({
      authorEmail: 'dev@example.com',
      body: [
        '',
        'Co-authored-by: Renovate <1+renovate[bot]@users.noreply.github.com>',
        'Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>',
        'Co-authored-by: Windsurf Agent <windsurf@codeium.com>',
        'Co-authored-by: Cursor Agent <cursoragent@cursor.com>',
      ].join('\n'),
    })
    assert.deepStrictEqual(new Set(keys), new Set([
      'renovate[bot]',
      'Claude (Anthropic)',
      'Windsurf',
      'Cursor',
    ]))
  })
})

describe('resolveAiToolingContributorKey', () => {
  test('uses canonical slug[bot] for trailer-attributed GitHub App bots', () => {
    const key = resolveAiToolingContributorKey({
      matchedVia: 'co-authored-by:github-bot-email',
      authorName: 'Dev',
      authorEmail: 'dev@example.com',
      body: '\nCo-authored-by: Copilot <123+copilot-swe-agent[bot]@users.noreply.github.com>\n',
    })
    assert.strictEqual(key, 'copilot-swe-agent[bot]')
  })

  test('uses email-derived slug[bot] for direct GitHub App commits (not git display name)', () => {
    const key = resolveAiToolingContributorKey({
      matchedVia: 'author:github-bot-email',
      authorName: 'GitHub Actions',
      authorEmail: '41898282+github-actions[bot]@users.noreply.github.com',
      body: '',
    })
    assert.strictEqual(key, 'github-actions[bot]')
  })

  test('uses GitHub Actions label for actions@github.com author', () => {
    const key = resolveAiToolingContributorKey({
      matchedVia: 'author:github-bot-email',
      authorName: 'GitHub Actions',
      authorEmail: 'actions@github.com',
      body: '',
    })
    assert.strictEqual(key, 'GitHub Actions')
  })

  test('uses Claude (Anthropic) for Anthropic trailers', () => {
    const key = resolveAiToolingContributorKey({
      matchedVia: 'co-authored-by:anthropic',
      authorName: 'Dev',
      authorEmail: 'dev@example.com',
      body: '\nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>\n',
    })
    assert.strictEqual(key, 'Claude (Anthropic)')
  })
})

describe('isAgentToolingContributorRow', () => {
  test('includes GitHub …[bot] rows and non-GitHub agent labels', () => {
    assert.strictEqual(isAgentToolingContributorRow('renovate[bot]'), true)
    assert.strictEqual(isAgentToolingContributorRow('Claude (Anthropic)'), true)
    assert.strictEqual(isAgentToolingContributorRow('Windsurf'), true)
    assert.strictEqual(isAgentToolingContributorRow('Cursor'), true)
    assert.strictEqual(isAgentToolingContributorRow('GitHub Actions'), true)
    assert.strictEqual(isAgentToolingContributorRow('DDSRem'), false)
  })
})

describe('isLikelyAiBotContributorName', () => {
  test('returns true for any GitHub-style …[bot] display name', () => {
    assert.strictEqual(isLikelyAiBotContributorName('copilot-swe-agent[bot]'), true)
    assert.strictEqual(isLikelyAiBotContributorName('dependabot[bot]'), true)
    assert.strictEqual(isLikelyAiBotContributorName('github-actions[bot]'), true)
    assert.strictEqual(isLikelyAiBotContributorName('renovate[bot]'), true)
  })

  test('returns true for humanized GitHub Actions shortlog name', () => {
    assert.strictEqual(isLikelyAiBotContributorName('GitHub Actions'), true)
    assert.strictEqual(isLikelyAiBotContributorName('GITHUB ACTIONS'), true)
  })

  test('returns false for normal human names', () => {
    assert.strictEqual(isLikelyAiBotContributorName('Ada Lovelace'), false)
  })

  test('returns false when [bot] is not a suffix', () => {
    assert.strictEqual(isLikelyAiBotContributorName('not-a-bot really'), false)
  })
})
