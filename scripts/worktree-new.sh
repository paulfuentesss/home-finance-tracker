#!/usr/bin/env bash
# npm run worktree:new -- <name> [branch] — a folder of its own for one session's task
# (docs/commands.md → Working in parallel). Every Claude session works in its own worktree,
# branched fresh from GitHub's main, and raises its own PR from it.
#
#   npm run worktree:new -- reminders-fix              ../home-finance-tracker-reminders-fix on feat/reminders-fix
#   npm run worktree:new -- reminders-fix fix/reminders  …on a branch you name
#
# What it does: fetches main, makes the folder next to the main folder on a new branch from
# origin/main, links the settings git ignores (.env.local, .private) to the main folder's, and
# installs dependencies. backups/ isn't linked: it holds real data, so backups run from the main
# folder.

set -euo pipefail

name=${1:-}
if ! [[ "$name" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: npm run worktree:new -- <name> [branch]   (name: lowercase letters, digits and dashes)" >&2
  exit 2
fi
branch=${2:-feat/$name}

main_dir=$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')
dir="$(dirname "$main_dir")/$(basename "$main_dir")-$name"

if [ -e "$dir" ]; then
  echo "$dir already exists. To pick that task up again, enter it instead of making a new one." >&2
  exit 1
fi
if git -C "$main_dir" show-ref --verify --quiet "refs/heads/$branch"; then
  echo "Branch $branch already exists. Choose another name or branch." >&2
  exit 1
fi

git -C "$main_dir" fetch --quiet origin main
# --no-track: the new branch doesn't follow origin/main, so a plain git push can't aim at main.
git -C "$main_dir" worktree add --quiet --no-track -b "$branch" "$dir" origin/main

# Links, not copies: a copy is frozen, and a stale .env.local once hung a worktree's site
# (docs/decisions.md, 2026-10-11).
for f in .env.local .private; do
  if [ -e "$main_dir/$f" ]; then ln -s "../$(basename "$main_dir")/$f" "$dir/$f"; fi
done

echo "Installing dependencies…"
(cd "$dir" && npm ci --no-audit --no-fund --loglevel=error)

echo
echo "Ready: $dir"
echo "  branch $branch, from origin/main ($(git -C "$dir" log -1 --format='%h %s'))"
echo "Next: work in that folder (Claude: EnterWorktree with this path), then npm run dev there."
