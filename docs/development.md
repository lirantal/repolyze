# Development

## Prerequisites

- Node.js v24 or newer.
- pnpm for dependency installation and scripts.
- git on `PATH`; repolyze shells out to the `git` binary during analysis and tests.

## Setup

```sh
pnpm install
```

## Common Commands

- `pnpm build` - builds the project.
- `pnpm start -- --help` - runs the CLI from source and prints help.
- `pnpm start -- --json .` - runs the CLI against the current repository and emits JSON.
- `pnpm lint` - runs lint checks.
- `pnpm test` - runs the test suite.

The `--` after `pnpm start` forwards the remaining arguments to the CLI. You can also invoke the entry directly:

```sh
node --import tsx src/bin/cli.ts --json .
```

Production output goes to `dist/`, including the package bin shim:

```sh
pnpm build
node dist/bin/cli.cjs --json .
```

## Repository Notes

This repository is organized around the root package `repolyze`.

Useful source paths:

- `src/bin/cli.ts` - CLI entrypoint.
- `src/cli/parseArgs.ts` - flags and argv normalization.
- `src/analyze/` - git collectors, report assembly, and derived insights.
- `src/render/pretty.ts` - terminal output.
- `src/render/markdown.ts` - Markdown output.
- `src/lib/git.ts` - git subprocess helpers.
- `__tests__/` - tests and git fixture helpers.
- `docs/repository-analysis.md` - signal definitions and methodology.
