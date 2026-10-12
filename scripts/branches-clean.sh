#!/usr/bin/env bash
# npm run branches:clean — removes local branches whose work is finished, brings local main up
# to date, and drops origin/* names for branches GitHub has deleted. A branch goes only when its
# PR is merged on GitHub and the branch is still at the commit that was merged (nothing
# committed after the merge), so nothing that isn't already in main is lost. Otherwise it's
# listed with the reason it stayed. main, the branch this folder is on and branches open in a
# worktree are never touched.
#
#   npm run branches:clean               remove what's finished
#   npm run branches:clean -- --dry-run  only show what would go
#   scripts/branches-clean.sh --check    one line for the startup check (.claude/hooks)

set -uo pipefail

mode=clean
case "${1:-}" in
  --dry-run) mode=dry-run ;;
  --check) mode=check ;;
  "") ;;
  *) echo "Usage: $0 [--dry-run | --check]" >&2; exit 2 ;;
esac

say() { [ "$mode" = check ] || echo "$@"; }

if [ "$mode" = clean ]; then
  # --prune drops origin/* names for branches deleted on GitHub (it deletes them after a merge).
  git fetch --prune --quiet origin || echo "Couldn't fetch from GitHub; going on with what's here." >&2
  # main:main only fast-forwards local main, and git refuses it while main is checked out.
  if [ "$(git branch --show-current)" != main ] &&
    ! git worktree list --porcelain | grep -qx 'branch refs/heads/main'; then
    if git fetch --quiet origin main:main 2> /dev/null; then
      echo "  main is up to date with GitHub"
    else
      echo "  main left as it is — it has commits GitHub doesn't (it only fast-forwards)"
    fi
  fi
fi

if ! merged=$(gh pr list --state merged --limit 200 --json headRefName,headRefOid \
  --jq '.[] | "\(.headRefName) \(.headRefOid)"' 2> /dev/null); then
  [ "$mode" = check ] && exit 0
  echo "Couldn't reach GitHub (gh), so nothing was removed." >&2
  exit 1
fi

# Branches open in any folder (this one included): git won't delete those, and they're in use.
open=$(git worktree list --porcelain | sed -n 's|^branch refs/heads/||p')

finished=()
removed=0

while read -r branch head; do
  [ "$branch" = main ] && continue
  if printf '%s\n' "$open" | grep -qxF "$branch"; then
    say "  keep   $branch — it's checked out (this folder or a worktree)"
    continue
  fi
  # A name can be reused by later PRs, so any merged PR at exactly this commit counts.
  if ! printf '%s\n' "$merged" | awk -v b="$branch" '$1 == b { f = 1 } END { exit !f }'; then
    say "  keep   $branch — no merged PR"
    continue
  fi
  if ! printf '%s\n' "$merged" | awk -v b="$branch" -v h="$head" '$1 == b && $2 == h { f = 1 } END { exit !f }'; then
    say "  keep   $branch — has commits that weren't in the merged PR"
    continue
  fi
  finished+=("$branch")
done < <(git for-each-ref --format='%(refname:short) %(objectname)' refs/heads)

if [ "$mode" = check ]; then
  [ "${#finished[@]}" -gt 0 ] &&
    echo "Merged branches still here: ${#finished[@]} — npm run branches:clean removes them"
  exit 0
fi

for branch in "${finished[@]+"${finished[@]}"}"; do
  if [ "$mode" = dry-run ]; then
    echo "  would remove $branch"
  # -D, not -d: the branch was checked against its merged PR above; -d would compare it with
  # local main, which may be older, and refuse.
  elif git branch -D "$branch" > /dev/null; then
    echo "  removed $branch"
    removed=$((removed + 1))
  else
    echo "  failed  $branch — see the message above"
  fi
done

if [ "${#finished[@]}" -eq 0 ]; then
  echo "No merged branches to clean up."
elif [ "$mode" = clean ]; then
  echo "Removed $removed of ${#finished[@]}."
fi
