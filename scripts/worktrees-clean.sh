#!/usr/bin/env bash
# npm run worktrees:clean — removes the worktrees (one folder per session, docs/commands.md →
# Working in parallel) whose work is finished, and their local branches. A worktree goes only
# when all of these hold, otherwise it's listed with the reason it stayed:
#   - its branch's PR is merged on GitHub, and the folder is still at the commit that was merged
#     (nothing committed after the merge);
#   - it has no uncommitted changes (git worktree remove refuses those anyway);
#   - nothing is running from it: a dev server, a terminal, another Claude session.
# The main folder and the folder you run it from are never touched.
#
#   npm run worktrees:clean               remove what's finished
#   npm run worktrees:clean -- --dry-run  only show what would go
#   scripts/worktrees-clean.sh --check    one line for the startup check (.claude/hooks)

set -uo pipefail

mode=clean
case "${1:-}" in
  --dry-run) mode=dry-run ;;
  --check) mode=check ;;
  "") ;;
  *) echo "Usage: $0 [--dry-run | --check]" >&2; exit 2 ;;
esac

say() { [ "$mode" = check ] || echo "$@"; }

# Records of folders already deleted by hand (e.g. in Finder). Only reads in check mode.
if [ "$mode" = clean ]; then
  git worktree prune
fi

main_dir=$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')
here=$(git rev-parse --show-toplevel)

# Every process's working folder, once (for "is something running from it?").
cwds=$(lsof -d cwd -Fn 2> /dev/null | sed -n 's/^n//p')

if ! merged=$(gh pr list --state merged --limit 200 --json headRefName,headRefOid \
  --jq '.[] | "\(.headRefName) \(.headRefOid)"' 2> /dev/null); then
  [ "$mode" = check ] && exit 0
  echo "Couldn't reach GitHub (gh), so nothing was removed." >&2
  exit 1
fi

finished=()
removed=0

# One "folder<TAB>branch" line per worktree; branch is empty when detached.
while IFS=$'\t' read -r dir branch; do
  [ "$dir" = "$main_dir" ] && continue
  name=$(basename "$dir")
  if [ "$dir" = "$here" ]; then
    say "  keep   $name — you're running this from it"
    continue
  fi
  if [ ! -d "$dir" ]; then
    say "  keep   $name — the folder is missing (git worktree prune clears it)"
    continue
  fi
  if [ -z "$branch" ]; then
    say "  keep   $name — not on a branch"
    continue
  fi
  head=$(git -C "$dir" rev-parse HEAD)
  merged_at=$(printf '%s\n' "$merged" | awk -v b="$branch" '$1 == b {print $2; exit}')
  if [ -z "$merged_at" ]; then
    say "  keep   $name — $branch has no merged PR"
    continue
  fi
  if [ "$merged_at" != "$head" ]; then
    say "  keep   $name — $branch has commits that weren't in the merged PR"
    continue
  fi
  if [ -n "$(git -C "$dir" status --porcelain)" ]; then
    say "  keep   $name — uncommitted changes"
    continue
  fi
  if printf '%s\n' "$cwds" | awk -v d="$dir" '$0 == d || index($0, d "/") == 1 { f = 1 } END { exit !f }'; then
    say "  keep   $name — something is running from it (a dev server, terminal or Claude session)"
    continue
  fi
  finished+=("$dir"$'\t'"$branch")
done < <(git worktree list --porcelain | awk '
  /^worktree / { if (dir != "") print dir "\t" branch; dir = substr($0, 10); branch = "" }
  /^branch /   { branch = substr($0, 8); sub("^refs/heads/", "", branch) }
  END          { if (dir != "") print dir "\t" branch }')

if [ "$mode" = check ]; then
  [ "${#finished[@]}" -gt 0 ] &&
    echo "Finished worktrees (PR merged, nothing left in them): ${#finished[@]} — npm run worktrees:clean removes them"
  exit 0
fi

for entry in "${finished[@]+"${finished[@]}"}"; do
  dir=${entry%%$'\t'*}
  branch=${entry#*$'\t'}
  if [ "$mode" = dry-run ]; then
    echo "  would remove $(basename "$dir") and branch $branch"
  elif git worktree remove "$dir" && git branch -D "$branch" > /dev/null; then
    # -D, not -d: the branch was checked against its merged PR above; -d would compare it with
    # this folder's possibly older main and refuse.
    echo "  removed $(basename "$dir") and branch $branch"
    removed=$((removed + 1))
  else
    echo "  failed  $(basename "$dir") — see the message above"
  fi
done

if [ "${#finished[@]}" -eq 0 ]; then
  echo "Nothing to clean up."
elif [ "$mode" = clean ]; then
  echo "Removed $removed of ${#finished[@]}. Run git pull in the main folder to bring main up to date."
fi
