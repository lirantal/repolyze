# Development

This document is for people working on **repolyze** in this repository. End-user usage of the published CLI is described in [README.md](./README.md).

## Prerequisites

- **Node.js** v24 or newer (see `engines` in `package.json`)
- **pnpm** (version pinned in `packageManager` in `package.json`)
- **git** on your `PATH` (the CLI shells out to the `git` binary)

## Install dependencies

```bash
pnpm install
```

## Run the CLI from source

The `start` script runs the TypeScript entry with `tsx`:

```bash
pnpm start -- --help
pnpm start -- --json .
pnpm start -- --verbose /path/to/repo
```

When you use `pnpm run … -- <args>`, the `--` tells pnpm to forward everything after it to the script. The CLI normalizes that shape (including the forwarded `--` and the `src/bin/cli.ts` argv token under `tsx`).

You can also invoke the entry directly:

```bash
node --import tsx src/bin/cli.ts --json .
```

## Build

Production output goes to `dist/` (including the `repolyze` bin shim used when the package is installed):

```bash
pnpm build
node dist/bin/cli.cjs --json .
```

## Tests

```bash
pnpm test
pnpm test:watch
```

Tests create **ephemeral git repositories** under the system temp directory (for example `os.tmpdir()` with a `repolyze-fixture-*` prefix). Nothing under those paths is committed to this repo.

## Lint

```bash
pnpm lint
pnpm lint:fix
```

`pnpm lint` also runs lockfile and markdown checks. If `lockfile-lint` fails to parse `pnpm-lock.yaml` in your environment, check the [lockfile-lint](https://github.com/lirantal/lockfile-lint) docs for a compatible `--type` flag or upgrade the tool.

## Useful paths

- `src/bin/cli.ts` — CLI entry
- `src/analyze/` — Git collectors and report assembly
- `src/render/pretty.ts` — Human-readable terminal output
- `src/cli/parseArgs.ts` — Flags and argv normalization
- `__tests__/` — Tests and git fixture helpers
- `docs/repository-analysis.md` — Signal definitions and article-based methodology

## Contributing

See [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md) for contribution guidelines.
