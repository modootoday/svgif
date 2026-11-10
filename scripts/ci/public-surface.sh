#!/usr/bin/env bash
# Scan the public surface: every tracked file, plus the message that will land.
# SVGIF_LANDING=squash scans the pull-request title and body only.
# SVGIF_LANDING=push scans SVGIF_COMMIT_RANGE. The script never prints a match.
# CI sets SVGIF_REQUIRE_DENY_TERMS=true and fails closed if SVGIF_DENY_TERMS is empty.
# The script never prints a matched secret, address, or deny term.
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
