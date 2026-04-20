# Agents guide for repolyze

Short orientation for humans and coding agents working in this repository. For day-to-day commands and paths, prefer [DEVELOPMENT.md](./DEVELOPMENT.md).

## Purpose

**repolyze** is a published CLI and library that inspects a **git** repository and reports health-style signals derived from history (churn, contributors, bug- and security-keyword hotspots, activity over time, and related metrics). It prints either human-readable terminal output or **JSON** (`--json`) for tools and agents. It is **not** a general-purpose static analyzer; it shells out to the `git` binary and interprets its output.

## Quick commands

From the repo root (Node.js v24+, pnpm, git on `PATH`):

```bash
pnpm install
pnpm start -- --help
pnpm test
pnpm lint
pnpm build
```

Run the CLI against a path from source:

```bash
pnpm start -- --json .
```

See [DEVELOPMENT.md](./DEVELOPMENT.md) for `tsx`/`node` invocation details and build output under `dist/`.

## Where to change what

| Area | Location |
| --- | --- |
| CLI flags and argv handling | [src/cli/parseArgs.ts](./src/cli/parseArgs.ts) |
| CLI entry | [src/bin/cli.ts](./src/bin/cli.ts) |
| Orchestration and report shape | [src/analyze/index.ts](./src/analyze/index.ts), [src/analyze/types.ts](./src/analyze/types.ts) |
| Git collectors | [src/analyze/collect.ts](./src/analyze/collect.ts) |
| Derived insights | [src/analyze/insights.ts](./src/analyze/insights.ts) |
| Git subprocess helpers | [src/lib/git.ts](./src/lib/git.ts) |
| Terminal rendering | [src/render/pretty.ts](./src/render/pretty.ts) |
| Public API surface | [src/main.ts](./src/main.ts) |
| Tests and git fixtures | [`__tests__/`](./__tests__/), [`gitFixture.ts`](./__tests__/helpers/gitFixture.ts) |

## Constraints for agents

- Match **Node 24+** and **ESM**; follow existing import style (including `.ts` extensions in source as used elsewhere in this repo).
- **Do not** hand-edit `dist/` — it is produced by `pnpm build`.
- Tests use **real git** in temporary directories; see [DEVELOPMENT.md](./DEVELOPMENT.md).
- Follow the project’s **ESLint** / **neostandard** setup when changing code.

## Documentation (`docs/`)

The [docs/](./docs/) directory holds longer-form reference material. Start there when you need definitions, methodology, or caveats beyond the code.

- [docs/repository-analysis.md](./docs/repository-analysis.md) — what each signal means, article-based methodology, and how to interpret git-derived metrics.
- [docs/research/security-analysis.md](./docs/research/security-analysis.md) — supplementary security-oriented research notes.

Browse [docs/](./docs/) for any additional files added over time.

## Other project docs

- [DEVELOPMENT.md](./DEVELOPMENT.md) — local setup, running from source, tests, lint, build.
- [.github/CONTRIBUTING.md](./.github/CONTRIBUTING.md) — contribution guidelines and commit expectations.

## Filename note

This file is **`AGENT.md`**. Some tooling expects **`AGENTS.md`** instead; you can rename or duplicate if your environment requires that name.
