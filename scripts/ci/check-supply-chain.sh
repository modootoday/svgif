#!/usr/bin/env bash
# Offline supply-chain gate: action pins, permissions, lockfiles, theme pin.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
exec python3 "$root/scripts/ci/check_supply_chain.py" "$@"
