#!/usr/bin/env bash
# The release workflow is a hard gate. A branch push must not be able to publish.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
file="$root/.github/workflows/release.yml"
if [[ ! -f "$file" ]]; then
  echo "missing $file" >&2
  exit 1
fi
python3 - "$file" <<'PY'
import sys
from pathlib import Path
text = Path(sys.argv[1]).read_text()
errors = []
if "workflow_dispatch:" not in text:
    errors.append("workflow_dispatch is required")
if "push:" in text.split("jobs:", 1)[0] and "tags:" in text.split("jobs:", 1)[0]:
    # A tag push may start the publish half only. A branch push must not.
    head = text.split("jobs:", 1)[0]
    if "branches:" in head:
        errors.append("branch push trigger is forbidden")
if "NPM_TOKEN" in text:
    errors.append("NPM_TOKEN must not be stored or read")
for needle in (
    "id-token: write",
    "https://registry.npmjs.org",
    "npm@11.5.1",
    "--provenance",
    "check-release-readiness.mjs",
    "SVGIF_RELEASE_ACTORS",
    "inputs.mode == 'check'",
    "inputs.mode == 'release'",
    "github-actions[bot]",
    "refs/tags/v",
    "check-advisories.sh",
    "scan-lockfiles.sh",
    "npm sbom --sbom-format cyclonedx",
    "sbom.cdx.json",
):
    if needle not in text:
        errors.append(f"missing {needle}")
# Publish commands must be conditional on the tag half, never unconditional.
if "npm publish" not in text:
    errors.append("publish command missing")
if "--dry-run" not in text:
    errors.append("dry-run rehearsal missing")
if errors:
    print("\n".join(errors), file=sys.stderr)
    sys.exit(1)
print("release workflow shape ok")
PY
