#!/usr/bin/env bash
# Root `test:export`. Runs the export package tests and refuses a
# dependency that the dependency inventory marks "Do not adopt".
# The export tests decode real files, so the decode tools are required.
# A missing tool fails the gate. It does not skip the test.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"
# shellcheck source=scripts/ci/gate-lib.sh
source scripts/ci/gate-lib.sh

refused_names() {
  # One name per line. These are the rows of the dependency inventory
  # whose decision is "Do not adopt" or "Not adopted".
  cat <<'NAMES'
mediabunny
@mediabunny/aac-encoder
@jsquash/webp
fflate
mp4-muxer
webm-muxer
react
react-dom
vue
svelte
ffmpeg
@ffmpeg/ffmpeg
@ffmpeg/core
NAMES
}

check_refused() {
  local manifest="$1"
  python3 - "$manifest" <<'PY' "$(refused_names)"
import json
import sys

manifest = sys.argv[1]
refused = {name.strip() for name in sys.argv[2].splitlines() if name.strip()}
with open(manifest, encoding="utf-8") as handle:
    data = json.load(handle)
hits = []
for field in ("dependencies", "optionalDependencies", "peerDependencies", "devDependencies"):
    for name in sorted(data.get(field) or {}):
        if name in refused:
            hits.append(f"{manifest}: {field} names {name}, which the dependency inventory refuses")
if hits:
    print("\n".join(hits), file=sys.stderr)
    sys.exit(1)
PY
}

if [[ "${1:-}" == "--self-test" ]]; then
  gate_self_test export-gate
  dir="$(mktemp -d)"
  printf '{"dependencies":{"fflate":"0.8.3"}}\n' > "$dir/bad.json"
  printf '{"dependencies":{}}\n' > "$dir/good.json"
  if check_refused "$dir/bad.json" >/dev/null 2>&1; then
    rm -rf "$dir"
    echo "export-gate self-test: a refused dependency was accepted" >&2
    exit 1
  fi
  if ! check_refused "$dir/good.json"; then
    rm -rf "$dir"
    echo "export-gate self-test: an empty dependency list was refused" >&2
    exit 1
  fi
  rm -rf "$dir"
  exit 0
fi

for manifest in packages/svgif/package.json packages/svgif-export/package.json apps/studio/package.json; do
  if [[ -f "$manifest" ]]; then
    check_refused "$manifest"
  fi
done
bash scripts/ci/check-dependency-allowlist.sh

rc=0
gate_require_tests packages/svgif-export || rc=$?
if [[ "$rc" -eq 1 ]]; then
  exit 1
fi
if [[ "$rc" -eq 0 ]]; then
  fail=0
  for tool in bun ffmpeg ffprobe anim_dump webpmux; do
    gate_require_tool "$tool" || fail=1
  done
  if [[ "$fail" -ne 0 ]]; then
    exit 1
  fi
  (cd packages/svgif-export && bun test)
fi

echo "export gate ok"
