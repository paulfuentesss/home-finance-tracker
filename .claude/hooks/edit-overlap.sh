#!/usr/bin/env bash
# Claude Code hook on Edit/Write (.claude/settings.json), so two sessions sharing this folder
# (CLAUDE.md → Parallel sessions) don't work on the same file without Paul knowing:
#   edit-overlap.sh record  (PostToolUse) notes "this session edited this file, now"
#   edit-overlap.sh check   (PreToolUse)  another session edited it in the last hour →
#                                         ask Paul before going ahead
# Claude's edit tool already refuses to save over changes it hasn't read, so nothing is lost
# either way; this catches two sessions changing the same code for different reasons.
#
# The log lives inside .git (never committed): one "epoch<TAB>session<TAB>path" line per edit.

input=$(cat)
file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<< "$input")
session=$(jq -r '.session_id // empty' <<< "$input")
[ -z "$file" ] || [ -z "$session" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
log="$(git rev-parse --git-dir 2> /dev/null)/claude-edits.tsv" || exit 0
now=$(date +%s)
window=3600

case "$1" in
  record)
    # Keep the last hour only, then add this edit.
    if [ -f "$log" ]; then
      awk -F'\t' -v cutoff=$((now - window)) '$1 >= cutoff' "$log" > "$log.tmp" && mv "$log.tmp" "$log"
    fi
    printf '%s\t%s\t%s\n' "$now" "$session" "$file" >> "$log"
    ;;
  check)
    [ -f "$log" ] || exit 0
    last=$(awk -F'\t' -v cutoff=$((now - window)) -v me="$session" -v f="$file" \
      '$1 >= cutoff && $2 != me && $3 == f { t = $1 } END { if (t) print t }' "$log")
    [ -z "$last" ] && exit 0
    minutes=$(((now - last) / 60))
    name=${file#"$PWD"/}
    jq -n --arg reason "Another Claude session edited $name $minutes min ago. Allow this session to change it too?" \
      '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: $reason}}'
    ;;
esac
exit 0
