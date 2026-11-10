#!/usr/bin/env bash
# Scan the npm and bundler lockfiles. High and critical advisories fail closed.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
if ! command -v osv-scanner >/dev/null 2>&1; then
  echo "osv-scanner is not installed" >&2
  exit 1
fi
report="${TMPDIR:-/tmp}/svgif-osv.json"
osv-scanner scan --format json --output-file "$report" \
  --lockfile=package-lock.json \
  --lockfile=docs/Gemfile.lock || true
python3 "$root/scripts/ci/osv_gate.py" "$report"
