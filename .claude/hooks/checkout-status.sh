#!/usr/bin/env bash
# Claude Code SessionStart hook (.claude/settings.json): prints the state of this folder
# when a session starts, and Claude Code adds the output to Claude's context. Several
# sessions can work on this repo at once; this shows whether another one is already
# using this folder before anything is switched or committed.
#
# Read-only — it never changes anything. What Claude does with it: CLAUDE.md → "Parallel
# sessions". Try it yourself: .claude/hooks/checkout-status.sh

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "## Startup check: the state of this folder"
echo "Folder: $PWD"
echo "Branch: $(git branch --show-current || echo '(none)')"

changes=$(git status --short)
if [ -n "$changes" ]; then
  echo "Uncommitted changes — maybe another session's work in progress:"
  printf '%s\n' "$changes" | head -20
  total=$(printf '%s\n' "$changes" | wc -l | tr -d ' ')
  [ "$total" -gt 20 ] && echo "…and $((total - 20)) more ($total files in all)"
else
  echo "Uncommitted changes: none"
fi

if git rev-parse --verify --quiet '@{upstream}' > /dev/null 2>&1; then
  unpushed=$(git rev-list --count '@{upstream}..HEAD')
  [ "$unpushed" -gt 0 ] && echo "Commits not pushed yet: $unpushed"
fi

echo
echo "Worktrees (one folder per session):"
git worktree list

# Last, so a slow or offline GitHub only delays the end of the report.
echo
echo "Open PRs:"
prs=$(gh pr list --limit 10 2> /dev/null) || prs="(couldn't reach GitHub)"
echo "${prs:-none}"
