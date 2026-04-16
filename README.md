



# repolyze



Analyze a git source code repository for health signals and project vitals



## Install

```sh
pnpm install repolyze
```

## Usage: CLI

```bash
pnpm start -- --json .
pnpm start -- --help
repolyze --json /path/to/repo
```

For flags and behavior, run `repolyze --help` (or `pnpm start -- --help` from a clone).

## Credits

The default signals this tool collects mirror the git workflow described by **Maciej Piechowski** in *[The Git Commands I Run Before Reading Any Code](https://piechowski.io/post/git-commands-before-reading-code/)*. See [docs/repository-analysis.md](./docs/repository-analysis.md) for command-by-command notes, caveats, and the same attribution in context.

## Contributing

Please consult [CONTRIBUTING](./.github/CONTRIBUTING.md) for guidelines on contributing to this project.

## Author

**repolyze** © [Liran Tal](https://github.com/lirantal), Released under the [Apache-2.0](./LICENSE) License.