<!-- markdownlint-disable -->

<p align="center">
  <h1 align="center">
    repolyze
  </h1>
</p>

<p align="center">
  Analyze a git source code repository for health signals and project vitals
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/repolyze"><img src="https://badgen.net/npm/v/repolyze" alt="npm version"/></a>
  <a href="https://www.npmjs.com/package/repolyze"><img src="https://badgen.net/npm/license/repolyze" alt="license"/></a>
  <a href="https://www.npmjs.com/package/repolyze"><img src="https://badgen.net/npm/dt/repolyze" alt="downloads"/></a>
  <a href="https://github.com/lirantal/repolyze/actions?workflow=CI"><img src="https://github.com/lirantal/repolyze/workflows/CI/badge.svg" alt="build"/></a>
  <a href="https://app.codecov.io/gh/lirantal/repolyze"><img src="https://badgen.net/codecov/c/github/lirantal/repolyze" alt="codecov"/></a>
  <a href="https://snyk.io/test/github/lirantal/repolyze"><img src="https://snyk.io/test/github/lirantal/repolyze/badge.svg" alt="Known Vulnerabilities"/></a>
  <a href="./SECURITY.md"><img src="https://img.shields.io/badge/Security-Responsible%20Disclosure-yellow.svg" alt="Responsible Disclosure Policy" /></a>
</p>

<p align="center">
  <img src="./.github/repolyze-screenshot.png" alt="repolyze screenshot" />
</p>

## Usage

Analyze the current directory as a git repository and print JSON (for tooling or AI agents):

```bash
npx repolyze --json .
```

Analyze another path:

```bash
npx repolyze --json /path/to/repo
```

Verbose mode (prints `git` invocations to stderr):

```bash
npx repolyze --verbose .
```

Help:

```bash
npx repolyze --help
```

When the package is installed globally, use the `repolyze` command the same way (for example `repolyze --json .`).

## Screenshots

<p align="center">
  <img src="./.github/repolyze-bugs-and-security-hotspots.png" alt="Bugs and security hotspots screenshot" />
</p>

<p align="center">
  <img src="./.github/repolyze-contributors.png" alt="Contributors screenshot" />
</p>

## Requirements

- [Node.js](https://nodejs.org/) v24 or newer
- [`git`](https://git-scm.com/) available on your `PATH`

## Install

Install globally (pick your package manager):

```sh
npm install -g repolyze
```

```sh
pnpm add -g repolyze
```

Or run **without** installing, using `npx` (downloads the package for that invocation):

```sh
npx repolyze --help
```

## Credits & References

The default signals this tool collects mirror the git workflow described by **Maciej Piechowski** in *[The Git Commands I Run Before Reading Any Code](https://piechowski.io/post/git-commands-before-reading-code/)*. See [docs/repository-analysis.md](./docs/repository-analysis.md) for command-by-command notes, caveats, and the same attribution in context.

References:

- [fallow-rs](https://github.com/fallow-rs/fallow) - Static analysis for source code health based on git

## Contributing

Please consult [CONTRIBUTING](./.github/CONTRIBUTING.md) for guidelines on contributing to this project.

**Developing this repo locally** (running from source, tests, build): see [DEVELOPMENT.md](./DEVELOPMENT.md).

## Author

**repolyze** © [Liran Tal](https://github.com/lirantal), Released under the [Apache-2.0](./LICENSE) License.
