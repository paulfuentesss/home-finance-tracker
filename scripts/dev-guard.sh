#!/usr/bin/env bash
# Runs before every `npm run dev` (the "predev" script in package.json). Keeps one local site:
# if something is already serving localhost:3000, it says which folder and stops, instead of
# Next quietly starting a second server on 3001 (docs/commands.md → Working in parallel).
#
#   SECOND_DEV=1 npm run dev -- -p 3001   a second server on purpose

[ -n "$SECOND_DEV" ] && exit 0

port=3000
pid=$(lsof -tiTCP:$port -sTCP:LISTEN 2> /dev/null | head -1)
[ -z "$pid" ] && exit 0

folder=$(lsof -a -p "$pid" -d cwd -Fn 2> /dev/null | sed -n 's/^n//p')
echo "The dev server is already running: http://localhost:$port"
echo "  from ${folder:-an unknown folder} (process $pid)"
echo "Use that one; every session's edits show up there."
echo "Stuck? Stop it (kill $pid), then npm run dev again."
exit 1
