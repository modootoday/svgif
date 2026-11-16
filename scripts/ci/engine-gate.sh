#!/usr/bin/env bash
# Root `typecheck` and `test`. Runs the engine, Studio, CLI, and MCP unit tests.
# A package that has src/ and no test/*.test.ts fails the gate.
# Bun strips types and does not check them. No type checker is adopted,
# so this gate does not claim a type check.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
# shellcheck source=scripts/ci/gate-lib.sh
source scripts/ci/gate-lib.sh

if [[ "${1:-}" == "--self-test" ]]; then
  gate_self_test engine-gate
  exit 0
fi

for record in .spec/plan/20261110122000-implementation.plan.md .spec/sot/roadmap.sot.md .spec/sot/architecture.sot.md; do
  if [[ ! -f "$record" ]]; then
    echo "missing record $record" >&2
    exit 1
  fi
done

gate_require_tool bun

ran=0
for pkg in packages/svgif apps/studio packages/svgif-cli packages/svgif-mcp; do
  rc=0
  gate_require_tests "$pkg" || rc=$?
  if [[ "$rc" -eq 2 ]]; then
    continue
  fi
  if [[ "$rc" -ne 0 ]]; then
    exit 1
  fi
  if [[ "$pkg" == "apps/studio" ]]; then
    (cd "$pkg" && bun run build)
  fi
  (cd "$pkg" && bun test)
  ran=$((ran + 1))
done

echo "engine gate ok (${ran} package(s) tested)"
