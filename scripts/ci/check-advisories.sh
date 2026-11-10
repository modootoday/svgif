#!/usr/bin/env bash
# Fail closed unless the Dependabot alerts API lists no open high or critical alert.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"

filter() {
  python3 - "$1" <<'PY'
import json, sys
from pathlib import Path
raw = Path(sys.argv[1]).read_text().strip()
if not raw:
    alerts = []
else:
    data = json.loads(raw)
    alerts = data if isinstance(data, list) else []
found = []
for alert in alerts:
    if alert.get("state") != "open":
        continue
    advisory = alert.get("security_advisory") or {}
    severity = str(advisory.get("severity") or "").lower()
    if severity in ("high", "critical"):
        found.append(f"{severity} {advisory.get('ghsa_id', 'unknown')}")
if found:
    print("\n".join(found))
    sys.exit(1)
print("no open high or critical advisories")
PY
}

if [[ "${1:-}" == "--self-test" ]]; then
  tmp="$(mktemp)"
  printf '%s\n' '[{"state":"open","security_advisory":{"severity":"low","ghsa_id":"GHSA-low"}}]' >"$tmp"
  filter "$tmp" >/dev/null
  printf '%s\n' '[{"state":"open","security_advisory":{"severity":"critical","ghsa_id":"GHSA-bad"}}]' >"$tmp"
  if filter "$tmp" >/dev/null 2>&1; then
    echo "critical advisory was accepted" >&2
    exit 1
  fi
  echo "advisory self-test ok"
  exit 0
fi

if [[ -z "${GITHUB_REPOSITORY:-}" || -z "${GH_TOKEN:-}" ]]; then
  echo "advisory check needs GITHUB_REPOSITORY and GH_TOKEN" >&2
  exit 1
fi
tmp="$(mktemp)"
code="$(curl -sS -o "$tmp" -w "%{http_code}" \
  -H "Authorization: Bearer ${GH_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/dependabot/alerts?state=open&per_page=100")"
if [[ "$code" != "200" ]]; then
  echo "dependabot alerts API returned ${code}; failing closed" >&2
  exit 1
fi
filter "$tmp"
