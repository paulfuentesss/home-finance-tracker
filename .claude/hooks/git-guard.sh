#!/usr/bin/env bash
# Claude Code PreToolUse hook on Bash (.claude/settings.json): blocks git commands that throw
# away uncommitted changes or move the folder to another branch. Sessions share one folder
# (CLAUDE.md → Parallel sessions), so those changes may be another session's work.
#
# Exit 2 = blocked; what's printed to stderr goes back to Claude. Paul can still run any of
# these in his own terminal.

cmd=$(jq -r '.tool_input.command // empty')
[ -z "$cmd" ] && exit 0

# Only where a command starts (line start, or after ; & | ( ), so text that merely mentions
# one — a commit message, an echo — isn't caught.
start='(^|[;&|(])[[:space:]]*git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'

block() {
  echo "Blocked: \`$1\` $2. Sessions share this folder, so uncommitted changes may be another" \
    "session's work in progress (CLAUDE.md → Parallel sessions). If it's really needed, ask Paul" \
    "to run it himself." >&2
  exit 2
}

grep -Eq "${start}stash([[:space:]]+(push|pop|apply|drop|clear|save)|[[:space:]]*($|[;&|)]))" <<< "$cmd" &&
  block "git stash" "would take every session's uncommitted changes out of the folder"
grep -Eq "${start}reset[^;&|]*--(hard|merge|keep)" <<< "$cmd" &&
  block "git reset --hard" "would discard every session's uncommitted changes"
grep -Eq "${start}clean" <<< "$cmd" &&
  block "git clean" "would delete new files, including other sessions'"
grep -Eq "${start}checkout([[:space:]]|$)" <<< "$cmd" &&
  block "git checkout" "can overwrite files or switch the shared branch (to start a branch, use git switch -c <branch> origin/main)"
# git restore --staged only unstages; anything else overwrites files.
if grep -Eq "${start}restore([[:space:]]|$)" <<< "$cmd" && ! grep -Eq "${start}restore[[:space:]]+--staged[[:space:]]+[^-]" <<< "$cmd"; then
  block "git restore" "would overwrite files with their committed version"
fi
# git switch -c <new branch> is the one allowed switch (it keeps the changes; CLAUDE.md says when).
if grep -Eq "${start}switch([[:space:]]|$)" <<< "$cmd" && ! grep -Eq "${start}switch[[:space:]]+(-q[[:space:]]+)?-c[[:space:]]" <<< "$cmd"; then
  block "git switch" "would move every session to another branch (only git switch -c <branch> origin/main is allowed, off a finished branch)"
fi
exit 0
