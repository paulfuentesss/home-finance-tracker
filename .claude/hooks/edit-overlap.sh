#!/usr/bin/env bash
# Claude Code hook on Edit/Write (.claude/settings.json). Each session works in its own worktree
# (CLAUDE.md → Parallel sessions), so sessions can't overwrite each other's files, but two
# sessions changing the same file make their PRs conflict. This tells Claude early:
#   edit-overlap.sh record  (PostToolUse) notes "this session edited this file, in this folder, now"
#   edit-overlap.sh check   (PreToolUse)  another session edited the same file (same path inside
#                                         the repo, any worktree) in the last hour → tell Claude
#                                         (no prompt for Paul; he asked for none)
#
# The log lives in the git folder every worktree shares (never committed):
# one "epoch<TAB>session<TAB>folder<TAB>path inside the repo" line per edit.

input=$(cat)
file=$(jq -r '.tool_input.file_path // .tool_input.notebook_path // empty' <<< "$input")
session=$(jq -r '.session_id // empty' <<< "$input")
[ -z "$file" ] || [ -z "$session" ] && exit 0

# The nearest folder that exists (a Write can create a file in a new folder).
dir=$(dirname "$file")
while [ ! -d "$dir" ]; do dir=$(dirname "$dir"); done
top=$(git -C "$dir" rev-parse --show-toplevel 2> /dev/null) || exit 0
common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2> /dev/null) || exit 0
# Path inside the repo; macOS paths can differ only by /private, so compare resolved folders.
rel=${file#"$top"/}
[ "$rel" = "$file" ] && rel=${file#"$(cd "$top" && pwd -P)"/}
log="$common/claude-edits.tsv"
now=$(date +%s)
window=3600

case "$1" in
  record)
    # Keep the last hour only, then add this edit.
    if [ -f "$log" ]; then
      awk -F'\t' -v cutoff=$((now - window)) '$1 >= cutoff' "$log" > "$log.tmp" && mv "$log.tmp" "$log"
    fi
    printf '%s\t%s\t%s\t%s\n' "$now" "$session" "$top" "$rel" >> "$log"
    ;;
  check)
    [ -f "$log" ] || exit 0
    last=$(awk -F'\t' -v cutoff=$((now - window)) -v me="$session" -v f="$rel" \
      '$1 >= cutoff && $2 != me && $4 == f { t = $1; d = $3 } END { if (t) print t "\t" d }' "$log")
    [ -z "$last" ] && exit 0
    minutes=$(((now - ${last%%$'\t'*}) / 60))
    other=${last#*$'\t'}
    if [ "$other" = "$top" ]; then
      note="Another Claude session edited $rel in this same folder $minutes min ago. Change only your own part of it, and leave theirs as it is."
    else
      where="the worktree $(basename "$other")"
      [ "$other/.git" -ef "$common" ] && where="the main folder"
      note="Another Claude session is changing $rel too, in $where ($minutes min ago). Your PRs will probably conflict on it: keep your change to your own part, and expect to resolve a conflict when raising the PR."
    fi
    jq -n --arg note "$note" '{hookSpecificOutput: {hookEventName: "PreToolUse", additionalContext: $note}}'
    ;;
esac
exit 0
