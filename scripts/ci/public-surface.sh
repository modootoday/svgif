#!/usr/bin/env bash
# Scan the public surface: every tracked file, the commit messages in SVGIF_COMMIT_RANGE,
# and, when SVGIF_LANDING=squash, the pull-request title and body that will land.
# The branch commits are scanned for a squash too, because the pushed branch is public.
# CI sets SVGIF_REQUIRE_DENY_TERMS=true and fails closed if SVGIF_DENY_TERMS is empty.
# SVGIF_DENY_NAMES is a second newline-separated list. Empty lines are ignored.
# Files under presets/ use that same list. The walk has no preset id list.
# The script never prints a matched secret, address, deny term, or which list matched.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

if [[ "${1:-}" == "--self-test" ]]; then
  python3 - <<'PY'
import importlib.util
import pathlib
import sys
path = pathlib.Path("scripts/ci/public_surface.py")
spec = importlib.util.spec_from_file_location("public_surface", path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.self_test()
print("public-surface self-test ok")
PY
  exit 0
fi

exec python3 "$root/scripts/ci/public_surface.py"
