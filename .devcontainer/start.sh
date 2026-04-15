#!/usr/bin/env bash
#
# @file start.sh
# @summary Start the Dev Container for this workspace and attach an interactive shell.
#
# Uses @devcontainers/cli to run `devcontainer up` then `devcontainer exec bash`.
# Host port publishing for this script comes from **appPort** — @devcontainers/cli maps it
# to `docker -p`. It does **not** map **forwardPorts** to Docker (editors use forwardPorts
# for Ports UI / tunneling; they still apply **appPort** when creating the container).
#
# @usage
#   .devcontainer/start.sh [options]
#
# @options
#   --recreate  Remove the existing dev container for this workspace before `up`, so
#               changes to appPort (or other create-time settings) take effect.
#   --help, -h  Print usage and exit.
#
# @example
#   .devcontainer/start.sh
#   .devcontainer/start.sh --recreate
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_FOLDER="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_VERSION="0.84.1"

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Start the dev container for:
  $WORKSPACE_FOLDER

Then open an interactive bash session inside the container.

Options:
  --recreate    Remove the existing dev container for this workspace before starting,
                so Docker picks up new settings (e.g. appPort / port mappings).
  --help, -h    Show this help and exit.

Notes:
  For devcontainer up from the terminal, Docker publish uses appPort. Keep appPort and
  forwardPorts lists in sync if you use both this script and VS Code / Cursor.
EOF
}

RECREATE=false
while [ $# -gt 0 ]; do
  case "$1" in
    --help | -h)
      usage
      exit 0
      ;;
    --recreate)
      RECREATE=true
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo "Run with --help for usage." >&2
      exit 1
      ;;
  esac
done

echo "Starting devcontainer for: $WORKSPACE_FOLDER"

UP_ARGS=(--workspace-folder "$WORKSPACE_FOLDER")
if [ "$RECREATE" = true ]; then
  UP_ARGS+=(--remove-existing-container)
  echo "Removing existing dev container so create-time settings (e.g. appPort) apply."
fi

npx --yes "@devcontainers/cli@${CLI_VERSION}" up "${UP_ARGS[@]}"

echo "Dropping into container shell..."
# Resolve TERM to something the container's terminfo knows about.
# Terminals like kitty, ghostty, alacritty set custom TERM values the container won't have.
# Fall back to xterm-256color (truecolor still works via COLORTERM=truecolor).
if ! infocmp "${TERM:-xterm-256color}" &>/dev/null 2>&1; then
  TERM=xterm-256color
fi
TERM="${TERM:-xterm-256color}" npx --yes @devcontainers/cli@${CLI_VERSION} exec --workspace-folder "$WORKSPACE_FOLDER" -- env TERM="${TERM:-xterm-256color}" COLORTERM=truecolor bash