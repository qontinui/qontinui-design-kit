#!/bin/bash
cd /home/jspinak/Projects/qontinui-root
S=qontinui-claude-config/scripts/allocate-worktree.sh
repo=$1; shift
for i in $(seq 1 120); do
  out=$(bash $S --repo $repo --intent "design kit plan phase 8: $repo" --work-unit 5384c4ba-d22e-4503-8a09-85d0141da373 "$@" 2>&1)
  if echo "$out" | grep -qE "^$repo /"; then echo "$out" | grep -E "^(agent_id|$repo )"; exit 0; fi
  echo "try $i refused: $(echo "$out" | grep -o 'ACTIVE-WORKTREE cap[^.]*' | head -1)"
  sleep 60
done
