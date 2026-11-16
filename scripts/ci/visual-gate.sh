#!/usr/bin/env bash
# Root `test:visual`. Byte-exact golden SVG compares.
# The engine goldens live in the css, smil, bake, and scene tests.
# The preset goldens are compared by check-presets.mjs.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
# shellcheck source=scripts/ci/gate-lib.sh
source scripts/ci/gate-lib.sh

if [[ "${1:-}" == "--self-test" ]]; then
  gate_self_test visual-gate
  exit 0
fi

gate_require_tool bun
gate_require_tool node

rc=0
gate_require_tests packages/svgif || rc=$?
if [[ "$rc" -eq 1 ]]; then
  exit 1
fi
if [[ "$rc" -eq 0 ]]; then
  golden_tests=()
  for name in css smil bake scene; do
    file="packages/svgif/test/${name}.test.ts"
    if [[ ! -f "$file" ]]; then
      echo "missing golden test $file" >&2
      exit 1
    fi
    golden_tests+=("test/${name}.test.ts")
  done
  (cd packages/svgif && bun test "${golden_tests[@]}")
fi

node scripts/ci/check-presets.mjs
node scripts/ci/render-preset-index.mjs --check

echo "visual gate ok"
