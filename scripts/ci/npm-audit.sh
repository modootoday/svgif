#!/usr/bin/env bash
# npm audit at high, plus registry signature checks when the lockfile has packages.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
npm audit --audit-level=high
count="$(python3 - <<'PY'
import json
from pathlib import Path
lock = json.loads(Path("package-lock.json").read_text())
packages = lock.get("packages") or {}
print(sum(1 for name in packages if name))
PY
)"
if [[ "$count" == "0" ]]; then
  echo "lockfile has no packages; npm audit signatures has nothing to verify"
  exit 0
fi
npm audit signatures
