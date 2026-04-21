#!/bin/bash
#
# stop hook — runs after each agent loop ends (see Cursor docs: `stop`).
# Reads hook JSON on stdin; on success prints "{}" to stdout.
# On pnpm lint / pnpm build failure prints {"followup_message":"..."} so Cursor can re-open the loop.
#
# File debug log: POST_SESSION_VERIFY_DEBUG=1 in hooks.json, or DEFAULT_POST_SESSION_VERIFY_DEBUG=1 below.
#
set -euo pipefail

DEFAULT_POST_SESSION_VERIFY_DEBUG=0
POST_SESSION_VERIFY_DEBUG="${POST_SESSION_VERIFY_DEBUG:-$DEFAULT_POST_SESSION_VERIFY_DEBUG}"
DEBUG_ENABLED=0
case "${POST_SESSION_VERIFY_DEBUG,,}" in 1|true|yes|on) DEBUG_ENABLED=1 ;; esac

json_input=$(cat)

ROOT="${CURSOR_PROJECT_DIR:-${PWD:-.}}"
cd "$ROOT"

DEBUG_LOG="${ROOT}/.cursor/hooks/post-session-verify.debug.log"

debug_log() {
  [[ "$DEBUG_ENABLED" == "1" ]] || return 0
  mkdir -p "$(dirname "$DEBUG_LOG")"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$DEBUG_LOG"
}

sanitize_cursor_bundled_runtimes_from_path() {
  if command -v python3 >/dev/null 2>&1; then
    PATH="$(
      python3 -c 'import os; skip=(".cursor-server", ".vscode-server"); p=os.environ.get("PATH",""); print(":".join(x for x in p.split(":") if x and not any(s in x for s in skip)))'
    )"
    export PATH
    return 0
  fi
  local new="" p rest="${PATH:-}"
  while [[ "$rest" == *:* ]]; do
    p="${rest%%:*}"
    rest="${rest#*:}"
    [[ -z "$p" ]] && continue
    case "$p" in *".cursor-server"*|*".vscode-server"*) continue ;; esac
    [[ -n "$new" ]] && new+=":"
    new+="$p"
  done
  p="$rest"
  if [[ -n "$p" ]]; then
    case "$p" in *".cursor-server"*|*".vscode-server"*) ;;
      *) [[ -n "$new" ]] && new+=":"
        new+="$p" ;;
    esac
  fi
  PATH="$new"
  export PATH
}

emit_stdout_json() {
  printf '%s\n' "$1"
}

# Run one verify command; capture combined output for follow-up; mirror to debug log and/or stderr.
run_verify_cmd() {
  local cmd_name=$1
  shift
  local tmp
  tmp=$(mktemp "${TMPDIR:-/tmp}/repolyze-stop-hook.XXXXXX")
  debug_log "--- ${cmd_name}: begin ---"
  set +e
  "$@" >"$tmp" 2>&1
  local ec=$?
  set -e
  if [[ "$DEBUG_ENABLED" == "1" ]]; then
    cat "$tmp" >>"$DEBUG_LOG"
  else
    cat "$tmp" >&2
  fi
  LAST_VERIFY_OUTPUT=$(cat "$tmp")
  rm -f "$tmp"
  if [[ "$ec" -ne 0 ]]; then
    debug_log "--- ${cmd_name}: FAILED exit=${ec} ---"
  else
    debug_log "--- ${cmd_name}: ok exit=0 ---"
  fi
  LAST_VERIFY_EC=$ec
  LAST_VERIFY_NAME=$cmd_name
  return "$ec"
}

log_tool_versions() {
  [[ "$DEBUG_ENABLED" == "1" ]] || return 0
  set +e
  local node_path pnpm_path node_ver pnpm_ver
  node_path=$(command -v node 2>/dev/null)
  pnpm_path=$(command -v pnpm 2>/dev/null)
  node_ver=$(node -v 2>/dev/null)
  pnpm_ver=$(pnpm -v 2>/dev/null)
  set -e
  debug_log "--- tool versions (after PATH sanitize) ---"
  debug_log "node_path=${node_path:-MISSING} node_ver=${node_ver:-}"
  debug_log "pnpm_path=${pnpm_path:-MISSING} pnpm_ver=${pnpm_ver:-}"
  debug_log "--- end tool versions ---"
}

status="completed"
loop_count=0
if command -v jq >/dev/null 2>&1; then
  set +e
  status=$(printf '%s' "$json_input" | jq -r '.status // "completed"' 2>/dev/null)
  loop_count=$(printf '%s' "$json_input" | jq -r '.loop_count // 0' 2>/dev/null)
  set -e
fi

sanitize_cursor_bundled_runtimes_from_path
if [[ -n "${POST_SESSION_VERIFY_NODE:-}" && -x "$POST_SESSION_VERIFY_NODE" ]]; then
  export PATH="$(dirname "$POST_SESSION_VERIFY_NODE"):$PATH"
fi
hash -r 2>/dev/null || true

debug_log "stop hook status=${status:-?} loop_count=${loop_count:-?} dir=$ROOT stdin_bytes=${#json_input} (PATH: dropped *.cursor-server* / *.vscode-server*; POST_SESSION_VERIFY_NODE=${POST_SESSION_VERIFY_NODE:-<unset>})"
if [[ -n "${POST_SESSION_VERIFY_NODE:-}" && -x "$POST_SESSION_VERIFY_NODE" ]]; then
  debug_log "POST_SESSION_VERIFY_NODE prepended: $(dirname "$POST_SESSION_VERIFY_NODE")"
fi
log_tool_versions

timestamp=$(date '+%Y-%m-%d %H:%M:%S')
if [[ "$DEBUG_ENABLED" == "1" ]]; then
  echo "[$timestamp] post-session-verify stop status=${status:-?} loop_count=${loop_count:-?} dir=$ROOT (debug log: $DEBUG_LOG)" >&2
else
  echo "[$timestamp] post-session-verify stop (file debug off; POST_SESSION_VERIFY_DEBUG=1 → $DEBUG_LOG)" >&2
fi

# Do not auto-follow-up after user abort; nothing to verify in a useful way here.
if [[ "${status}" == "aborted" ]]; then
  debug_log "stop hook: status=aborted — skipping pnpm lint/build"
  emit_stdout_json '{}'
  exit 0
fi

MAX_OUTPUT_CHARS=12000

fail_with_followup() {
  local step_human=$1
  local exit_code=$2
  local raw_output=$3
  debug_log "emitting followup_message for failed step=${step_human} exit=${exit_code}"
  # stdout must be only this JSON line (command hook contract).
  printf '%s' "$raw_output" | head -c "$MAX_OUTPUT_CHARS" | python3 -c '
import json, sys
step, code = sys.argv[1], int(sys.argv[2])
out = sys.stdin.read()
msg = (
    "The **stop** hook in this repo ran an automated check after your last agent turn "
    "(same commands as local CI).\n\n"
    f"**Command:** `{step}`\n"
    f"**Result:** failed with exit code **{code}**.\n\n"
    "Please fix the issues in the output below (or adjust the hook if it is a false positive), "
    "then continue.\n\n"
    "```text\n"
    + out
    + "\n```\n"
)
print(json.dumps({"followup_message": msg}, ensure_ascii=False))
' "$step_human" "$exit_code"
  exit 0
}

LAST_VERIFY_OUTPUT=""
LAST_VERIFY_EC=0
LAST_VERIFY_NAME=""

set +e
run_verify_cmd "pnpm lint" pnpm lint
lint_ec=$?
set -e
if [[ "$lint_ec" -ne 0 ]]; then
  fail_with_followup "pnpm lint" "$lint_ec" "$LAST_VERIFY_OUTPUT"
fi

set +e
run_verify_cmd "pnpm build" pnpm build
build_ec=$?
set -e
if [[ "$build_ec" -ne 0 ]]; then
  fail_with_followup "pnpm build" "$build_ec" "$LAST_VERIFY_OUTPUT"
fi

debug_log "ok pnpm lint && pnpm build both succeeded"
echo "[$timestamp] post-session-verify: pnpm lint && pnpm build succeeded" >&2

# Success: empty JSON on stdout — do not use followup_message here or the agent loops again (stop re-fires).
emit_stdout_json '{}'
exit 0
