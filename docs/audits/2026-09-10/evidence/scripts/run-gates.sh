#!/usr/bin/env bash
# Gate runner for the 2026-09-10 audit. Runs every gate sequentially and
# records exit code + duration. Does not stop on failure.
SP="C:/Users/pablo/AppData/Local/Temp/claude/C--Users-pablo-Documents-OpenCode-Aluguei-app--claude-worktrees-aluguei-technical-audit-6cea11/57b60008-7a72-4aed-be9f-ad6fb81a7cff/scratchpad"
cd "C:/Users/pablo/Documents/OpenCode/Aluguei-app/.claude/worktrees/aluguei-technical-audit-6cea11" || exit 1
: > "$SP/gates_summary.txt"

run() {
  local name=$1; shift
  local start end code
  start=$(date +%s)
  "$@" > "$SP/gate_$name.log" 2>&1
  code=$?
  end=$(date +%s)
  echo "$name exit=$code dur=$((end-start))s cmd=$*" >> "$SP/gates_summary.txt"
}

run format     pnpm format:check
run lint       pnpm lint --continue
run typecheck  pnpm typecheck --continue
run test       pnpm test --continue
run build      pnpm build --continue
run secscan    pnpm security:scan
run audit_prod pnpm security:audit
run audit_crit pnpm security:audit --audit-level=critical
run dbgen      pnpm db:generate
git status --porcelain -- packages/db > "$SP/gate_drift.log" 2>&1
echo "drift_lines=$(wc -l < "$SP/gate_drift.log")" >> "$SP/gates_summary.txt"
echo "ALL_DONE" >> "$SP/gates_summary.txt"
