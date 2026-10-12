#!/usr/bin/env bash
# Claude Code PreToolUse hook on Bash (.claude/settings.json): blocks git commands that throw
# away uncommitted changes or move a folder to another branch. Each session works in its own
# worktree, branched from main (CLAUDE.md → Parallel sessions); the main folder stays on main.
# New work starts in a new worktree, never by switching a folder's branch.
#
# Exit 2 = blocked; what's printed to stderr goes back to Claude. Paul can still run any of
# these in his own terminal.

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Only where a command starts (line start, or after ; & | ( ), so text that merely mentions
# one — a commit message, an echo — isn't caught.
start='(^|[;&|(])[[:space:]]*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'

block() {
  echo "Blocked: \`$1\` $2. Uncommitted changes may be work in progress, and new work goes in" \
    "its own worktree (npm run worktree:new, CLAUDE.md → Parallel sessions). If it's really" \
    "needed, ask Paul to run it himself." >&2
  exit 2
}

grep -Eq "${start}stash([[:space:]]+(push|pop|apply|drop|clear|save)|[[:space:]]*($|[;&|)]))" <<< "$cmd" &&
  block "git stash" "would take uncommitted changes out of the folder (and the stash is shared by every worktree)"
grep -Eq "${start}reset[^;&|]*--(hard|merge|keep)" <<< "$cmd" &&
  block "git reset --hard" "would discard uncommitted changes"
grep -Eq "${start}clean" <<< "$cmd" &&
  block "git clean" "would delete new files"
grep -Eq "${start}checkout([[:space:]]|$)" <<< "$cmd" &&
  block "git checkout" "can overwrite files or switch the folder's branch (resolve conflicts with the edit tool)"
# git restore --staged only unstages; anything else overwrites files.
if grep -Eq "${start}restore([[:space:]]|$)" <<< "$cmd" && ! grep -Eq "${start}restore[[:space:]]+--staged[[:space:]]+[^-]" <<< "$cmd"; then
  block "git restore" "would overwrite files with their committed version"
fi
# git switch main is the one allowed switch: the main folder back on main after its branch merged.
if grep -Eq "${start}switch([[:space:]]|$)" <<< "$cmd" && ! grep -Eq "${start}switch[[:space:]]+(-q[[:space:]]+)?main[[:space:]]*($|[;&|)])" <<< "$cmd"; then
  block "git switch" "would move this folder to another branch (only git switch main is allowed; for new work, make a worktree)"
fi
exit 0
