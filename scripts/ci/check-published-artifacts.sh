#!/usr/bin/env bash
# Fail if a docs build or an npm tarball ships internal trees, source maps, or deny terms.
# Usage: check-published-artifacts.sh --self-test
#        check-published-artifacts.sh <site-dir> <tarball>
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
cd "$root"
exec python3 "$root/scripts/ci/check_published_artifacts.py" "$@"
