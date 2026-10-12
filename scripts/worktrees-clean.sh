#!/usr/bin/env bash
# npm run worktrees:clean — removes the worktrees (one per session's task, docs/commands.md →
# Working in parallel) whose work is finished, and their local branches. A worktree goes only
# when all of these hold, otherwise it's listed with the reason it stayed:
#   - its branch's PR is merged on GitHub, and the folder is still at the commit that was merged
#     (nothing committed after the merge);
#   - it has no uncommitted changes (git worktree remove refuses those anyway);
#   - nothing is running from it but its own dev server (stopped first): no terminal, no VS Code,
#     no Claude session.
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

# Every process's working folder, once (for "is something running from it?"): "pid<TAB>folder".
procs=$(lsof -d cwd -Fpn 2> /dev/null | awk '/^p/ { pid = substr($0, 2) } /^n/ { print pid "\t" substr($0, 2) }')

# The processes running from a folder, split into its dev server (npm run dev and the next
# processes it starts; safe to stop) and everything else (a terminal, VS Code, a Claude session).
dev_pids=
other_pids=
running_from() {
  dev_pids=
  other_pids=
  local pid
  for pid in $(printf '%s\n' "$procs" | awk -F'\t' -v d="$1" '$2 == d || index($2, d "/") == 1 { print $1 }'); do
    if ps -o command= -p "$pid" 2> /dev/null | grep -Eq 'next|npm run dev|scripts/dev\.sh'; then
      dev_pids+=" $pid"
    else
      other_pids+=" $pid"
    fi
  done
}

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
  running_from "$dir"
  if [ -n "$other_pids" ]; then
    say "  keep   $name — something is running from it (a terminal, VS Code or Claude session)"
    continue
  fi
  finished+=("$dir"$'\t'"$branch"$'\t'"$dev_pids")
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
  IFS=$'\t' read -r dir branch pids <<< "$entry"
  if [ "$mode" = dry-run ]; then
    echo "  would remove $(basename "$dir") and branch $branch${pids:+ (stopping its dev server first)}"
    continue
  fi
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086 # one pid per word
    kill $pids 2> /dev/null
    for _ in 1 2 3 4 5; do
      alive=
      for pid in $pids; do kill -0 "$pid" 2> /dev/null && alive=1; done
      [ -z "$alive" ] && break
      sleep 1
    done
    echo "  stopped $(basename "$dir")'s dev server"
  fi
  if git worktree remove "$dir" && git branch -D "$branch" > /dev/null; then
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
  echo "Removed $removed of ${#finished[@]}. npm run branches:clean brings main up to date."
fi
