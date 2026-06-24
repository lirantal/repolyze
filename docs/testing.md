# Testing

## Test Command

Run the test suite with:

```sh
pnpm test
```

## Linting

Run lint checks with:

```sh
pnpm lint
```

## Markdown

Run Markdown linting with:

```sh
pnpm lint:markdown
```

## Expectations

- Add or update tests for behavior changes.
- Run the relevant package-level checks before opening a PR.
- Keep generated coverage, build output, and dependency folders out of commits.

## Git Fixtures

Tests use real git repositories created in temporary directories. Fixture helpers live in `__tests__/helpers/gitFixture.ts`, and test repositories are created under the system temp directory with a `repolyze-fixture-*` prefix.

When changing collectors, CLI behavior, or renderer output, prefer tests that exercise the real git-backed flow instead of mocking git output unless the unit boundary is intentionally narrow.
