#!/usr/bin/env bash
# Claude Code SessionStart hook (.claude/settings.json): prints the state of this folder
# when a session starts, and Claude Code adds the output to Claude's context. Several
# sessions work in this folder at once, on one branch and one dev server; this shows what
# the others are doing before anything is changed or committed.
#
# Read-only — it never changes anything. What Claude does with it: CLAUDE.md → "Parallel
# sessions". Try it yourself: .claude/hooks/checkout-status.sh

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

echo "## Startup check: the state of this folder"
echo "Folder: $PWD"
echo "Branch: $(git branch --show-current || echo '(none)')"

changes=$(git status --short)
if [ -n "$changes" ]; then
  echo "Uncommitted changes — yours from before, or another session's work in progress:"
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

pid=$(lsof -tiTCP:3000 -sTCP:LISTEN 2> /dev/null | head -1)
if [ -n "$pid" ]; then
  echo "Dev server: http://localhost:3000 from $(lsof -a -p "$pid" -d cwd -Fn 2> /dev/null | sed -n 's/^n//p') — shared, don't start another"
else
  echo "Dev server: not running (npm run dev)"
fi

echo
echo "Worktrees (only for work that needs its own PR):"
git worktree list
# Finished ones (PR merged, nothing left in them); the same rules as npm run worktrees:clean.
"$PWD/scripts/worktrees-clean.sh" --check 2> /dev/null

# Last, so a slow or offline GitHub only delays the end of the report.
echo
echo "Open PRs:"
prs=$(gh pr list --limit 10 2> /dev/null) || prs="(couldn't reach GitHub)"
echo "${prs:-none}"
# Local branches whose PR is merged; the same rules as npm run branches:clean.
"$PWD/scripts/branches-clean.sh" --check 2> /dev/null

branch=$(git branch --show-current)
if [ "$branch" = main ]; then
  echo
  echo "This folder is on main — start a branch before changing anything: git switch -c <branch> origin/main"
elif [ -n "$branch" ] &&
  merged=$(gh pr list --head "$branch" --state merged --limit 1 --json number -q '.[].number' 2> /dev/null) &&
  [ -n "$merged" ]; then
  echo
  echo "This branch's PR (#$merged) is merged — start the next batch: git switch -c <branch> origin/main"
fi
