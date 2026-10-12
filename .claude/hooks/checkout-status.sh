#!/usr/bin/env bash
# Claude Code SessionStart hook (.claude/settings.json): prints the state of the main folder and
# every worktree when a session starts, and Claude Code adds the output to Claude's context.
# Each session works on its own task in its own worktree and raises its own PR; this shows what's
# in progress and what's finished before anything is started.
#
# Read-only — it never changes anything. What Claude does with it: CLAUDE.md → "Parallel
# sessions". Try it yourself: .claude/hooks/checkout-status.sh

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

here=$(git rev-parse --show-toplevel 2> /dev/null) || exit 0
main_dir=$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')
main_name=$(basename "$main_dir")

# Every local site: "port<TAB>folder" for ports 3000–3020 that something is serving.
sites=$(for p in $(seq 3000 3020); do
  pid=$(lsof -tiTCP:"$p" -sTCP:LISTEN 2> /dev/null | head -1)
  [ -n "$pid" ] && printf '%s\t%s\n' "$p" "$(lsof -a -p "$pid" -d cwd -Fn 2> /dev/null | sed -n 's/^n//p')"
done)
site_of() { printf '%s\n' "$sites" | awk -F'\t' -v d="$1" '$2 == d { print "http://localhost:" $1; exit }'; }

# PRs by branch (open and recent merged/closed), once. Empty if GitHub can't be reached.
prs=$(gh pr list --state all --limit 100 --json number,state,headRefName \
  --jq '.[] | "\(.headRefName)\t#\(.number) \(.state | ascii_downcase)"' 2> /dev/null)
pr_of() { printf '%s\n' "$prs" | awk -F'\t' -v b="$1" '$1 == b { print $2; exit }'; }

echo "## Startup check: the main folder and every worktree"
if [ "$here" != "$main_dir" ]; then
  echo "This session opened in the worktree $(basename "$here") (branch $(git branch --show-current)). Keep this task's work here."
  echo
fi

branch=$(git -C "$main_dir" branch --show-current)
changes=$(git -C "$main_dir" status --short)
site=$(site_of "$main_dir")
echo "Main folder: $main_dir — on ${branch:-(no branch)}, site ${site:-not running}"
if [ -n "$changes" ]; then
  total=$(printf '%s\n' "$changes" | wc -l | tr -d ' ')
  echo "  Uncommitted changes in it: $total files — left from before (the old shared-folder way). Don't touch them."
fi
if [ "$branch" != main ]; then
  merged=$(pr_of "$branch")
  if [[ "$merged" == *merged && -z "$changes" ]]; then
    echo "  Its branch's PR ($merged) is merged — put it back on main: git switch main && git merge --ff-only origin/main"
  else
    echo "  It should be on main; leave it as it is and work in a worktree."
  fi
fi

echo
echo "Worktrees (one per task, each with its own PR):"
found=
while IFS=$'\t' read -r dir wt_branch; do
  [ "$dir" = "$main_dir" ] && continue
  found=1
  line="  ${dir##*/$main_name-}  ${wt_branch:-(no branch)}"
  if [ -d "$dir" ]; then
    n=$(git -C "$dir" status --porcelain 2> /dev/null | wc -l | tr -d ' ')
    [ "$n" -gt 0 ] && line+="  $n uncommitted"
  else
    line+="  (folder missing)"
  fi
  site=$(site_of "$dir")
  [ -n "$site" ] && line+="  site $site"
  pr=$(pr_of "$wt_branch")
  line+="  ${pr:-no PR yet}"
  echo "$line"
done < <(git worktree list --porcelain | awk '
  /^worktree / { if (dir != "") print dir "\t" branch; dir = substr($0, 10); branch = "" }
  /^branch /   { branch = substr($0, 8); sub("^refs/heads/", "", branch) }
  END          { if (dir != "") print dir "\t" branch }')
[ -z "$found" ] && echo "  none"
# Finished ones (PR merged, nothing left in them); the same rules as npm run worktrees:clean.
"$main_dir/scripts/worktrees-clean.sh" --check 2> /dev/null

echo
echo "Open PRs:"
if [ -z "$prs" ] && ! gh auth status > /dev/null 2>&1; then
  echo "(couldn't reach GitHub)"
else
  open=$(gh pr list --limit 10 2> /dev/null)
  echo "${open:-none}"
fi
# Local branches whose PR is merged; the same rules as npm run branches:clean.
"$main_dir/scripts/branches-clean.sh" --check 2> /dev/null

if [ "$here" = "$main_dir" ]; then
  echo
  echo "Start this session's task in its own worktree: npm run worktree:new -- <name> [branch]," \
    "then EnterWorktree with the folder it prints. To continue a task above, EnterWorktree its folder."
fi
