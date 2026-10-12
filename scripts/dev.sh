#!/usr/bin/env bash
# npm run dev — the local site for this folder (docs/commands.md → Working in parallel).
#   - The main folder: http://localhost:3000, showing main. Stops if something already serves
#     3000, and says from which folder, instead of Next quietly moving to another port.
#   - A worktree (one session's task): the first free port from 3001. If this folder's site is
#     already running, it says where and stops. The browser tab reads "[<name>] My House", so
#     each address says which task it shows (app/layout.tsx).
# Extra arguments go to next dev: npm run dev -- --turbopack

folder=$(git rev-parse --show-toplevel)
main_dir=$(git worktree list --porcelain | awk '/^worktree /{print substr($0, 10); exit}')

# The folder a listening port's process runs from (empty if the port is free).
serving() {
  local pid
  pid=$(lsof -tiTCP:"$1" -sTCP:LISTEN 2> /dev/null | head -1)
  [ -n "$pid" ] && lsof -a -p "$pid" -d cwd -Fn 2> /dev/null | sed -n 's/^n//p'
}

if [ "$folder" = "$main_dir" ]; then
  from=$(serving 3000)
  if [ -n "$from" ]; then
    echo "The dev server is already running: http://localhost:3000"
    echo "  from $from"
    echo "Stuck? Stop it (kill $(lsof -tiTCP:3000 -sTCP:LISTEN | head -1)), then npm run dev again."
    exit 1
  fi
  exec npx next dev -p 3000 "$@"
fi

name=$(basename "$folder")
name=${name#"$(basename "$main_dir")"-}
branch=$(git branch --show-current)

port=
for p in $(seq 3001 3020); do
  from=$(serving "$p")
  if [ "$from" = "$folder" ]; then
    echo "This worktree's site is already running: http://localhost:$p ($branch)"
    exit 1
  fi
  [ -z "$from" ] && [ -z "$port" ] && port=$p
done
if [ -z "$port" ]; then
  echo "No free port between 3001 and 3020. Stop a worktree's dev server you no longer need." >&2
  exit 1
fi

echo "This worktree's site: http://localhost:$port ($branch)"
DEV_WORKTREE=$name exec npx next dev -p "$port" "$@"
