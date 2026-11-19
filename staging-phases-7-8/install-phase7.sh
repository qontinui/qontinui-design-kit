#!/bin/bash
# usage: install-phase7.sh <runner-worktree-abs-path>
# Installs the staged Phase 7 files into an allocated qontinui-runner worktree.
set -euo pipefail
WT="$1"; HERE="$(cd "$(dirname "$0")" && pwd)"
C="$WT/src-tauri/src/commands"
mkdir -p "$C/new_project_templates"
cp "$HERE/rs/new_project_templates.rs" "$C/new_project_templates.rs"
cp "$HERE/rs/design.rs" "$C/new_project_templates/design.rs"
D="$C/new_project_templates/react-ui-bridge"
(cd "$HERE/tpl" && find . -type f -not -path './node_modules/*' | while read -r f; do
  mkdir -p "$D/$(dirname "$f")"; cp "$f" "$D/$f.tmpl"; done)
echo installed into "$C"
