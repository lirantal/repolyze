# Architecture

## Overview

repolyze is a published CLI and library that inspects a git repository and reports health-style signals derived from repository history. It shells out to the `git` binary, interprets command output, and can render either human-readable terminal output, Markdown, or JSON for tools and agents.

It is not a general-purpose static analyzer. Keep analysis logic grounded in git history, commit metadata, and repository-derived metrics unless a feature explicitly expands that boundary.

## Repository Structure

- `src/cli/parseArgs.ts` - CLI flags and argv normalization.
- `src/bin/cli.ts` - CLI entrypoint.
- `src/analyze/index.ts` and `src/analyze/types.ts` - orchestration and report shape.
- `src/analyze/collect.ts` - git-backed collectors for churn, contributors, activity, and hotspots.
- `src/analyze/insights.ts` - derived insights built from the collected report.
- `src/analyze/aiToolingPatterns.ts` - AI tooling commit attribution patterns.
- `src/lib/git.ts` - git subprocess helpers and repository checks.
- `src/render/pretty.ts` - human-readable terminal output.
- `src/render/markdown.ts` - Markdown report output.
- `src/main.ts` - public API surface.
- `__tests__/` and `__tests__/helpers/gitFixture.ts` - tests and temporary git repository fixtures.
- `.changeset/` - Changesets configuration and pending release notes.
- `docs/` - project documentation for maintainers and coding agents.

## Report Flow

1. `src/bin/cli.ts` starts the CLI and passes argv through `src/cli/parseArgs.ts`.
2. `src/analyze/index.ts` verifies the target path is inside a git work tree and coordinates collectors.
3. Collectors in `src/analyze/collect.ts` run git commands for churn, contributors, activity, bug keywords, firefighting keywords, security keywords, and AI tooling attribution.
4. `src/analyze/insights.ts` derives higher-level warnings and informational insights from the report.
5. Renderers in `src/render/pretty.ts` and `src/render/markdown.ts` format the report; JSON output exposes the `AnalysisReport` shape from `src/analyze/types.ts`.

For signal definitions, methodology, and caveats, see [Repository analysis](./repository-analysis.md). For security-oriented research context, see [Security analysis research](./research/security-analysis.md).

## Boundaries

- Keep user-facing usage, installation, and examples in the root `README.md`.
- Keep contribution rules in `CONTRIBUTING.md`.
- Keep release workflow details in `RELEASE.md`.
- Keep deeper development and architecture notes in `docs/`.
- Do not hand-edit `dist/`; it is produced by `pnpm build`.
