#!/usr/bin/env bash
# The release workflow is a hard gate. A branch push must not be able to publish.
# The CDN rules in the distribution record and release.yml must match.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
file="$root/.github/workflows/release.yml"
dist="$root/.spec/sot/distribution.sot.md"
if [[ ! -f "$file" ]]; then
  echo "missing $file" >&2
  exit 1
fi
if [[ ! -f "$dist" ]]; then
  echo "missing $dist" >&2
  exit 1
fi
python3 - "$file" "$dist" "$@" <<'PY'
import sys
from pathlib import Path

workflow_path, dist_path, *args = sys.argv[1:]

EXACT_CC = "public, max-age=31536000, immutable"
ALIAS_CC = "public, max-age=300, must-revalidate"
CONTENT_TYPES = (
    "application/javascript; charset=utf-8",
    "text/css; charset=utf-8",
    "image/svg+xml; charset=utf-8",
    "application/json; charset=utf-8",
)
DOC_URLS = (
    "https://developers.cloudflare.com/r2/buckets/public-buckets/",
    "https://developers.cloudflare.com/r2/buckets/cors/",
    "https://developers.cloudflare.com/cache/concepts/default-cache-behavior/",
    "https://developers.cloudflare.com/cache/how-to/purge-cache/",
    "https://developers.cloudflare.com/speed/optimization/content/compression/",
    "https://developers.cloudflare.com/rules/transform/",
    "https://www.jsdelivr.com/using-sri-with-dynamic-files",
)
HEADERS = (
    "X-Content-Type-Options: nosniff",
    "Cross-Origin-Resource-Policy: cross-origin",
    "Referrer-Policy: no-referrer-when-downgrade",
)


def alias_line_errors(text: str, label: str) -> list[str]:
    errors = []
    for index, line in enumerate(text.splitlines(), 1):
        alias = "/svgif/latest/" in line or "/svgif/<major>/" in line
        if not alias:
            continue
        if "immutable" in line:
            errors.append(f"{label}:{index}: alias marked immutable")
        if "integrity=" in line or "SRI is required" in line:
            errors.append(f"{label}:{index}: SRI attached to an alias URL")
    return errors


def origin_errors(text: str, label: str) -> list[str]:
    errors = []
    if "not the origin of `cdn.thumly.io`" not in text and "not the origin of cdn.thumly.io" not in text:
        errors.append(f"{label}: missing the not-the-origin rule")
    for index, line in enumerate(text.splitlines(), 1):
        low = line.lower()
        if "jsdelivr" not in low and "unpkg" not in low:
            continue
        if "cdn.thumly.io" in low and "not" not in low:
            errors.append(f"{label}:{index}: jsDelivr or unpkg named as the origin of cdn.thumly.io")
        if "jsdelivr is the origin" in low or "unpkg is the origin" in low:
            errors.append(f"{label}:{index}: jsDelivr or unpkg named as the origin")
        if "cdn.jsdelivr.net" in low or "https://unpkg.com" in low:
            errors.append(f"{label}:{index}: secondary host used as an upload origin")
    return errors


def distribution_errors(text: str) -> list[str]:
    errors = []
    needles = [
        EXACT_CC,
        ALIAS_CC,
        "integrity.json",
        "sha384",
        "/studio/",
        "/docs/",
        "/schema/svgif/v1.json",
        "The old `/svgif/` section is removed.",
        "CDN object keys stay `/svgif/<npm-version>/`.",
        "SVGIF_CDN_BASE",
        "https://cdn.thumly.io/svgif",
        "no-transform",
        "GET` and `HEAD`",
        "allowed origins `*`",
        "Do not put a strict Content-Security-Policy",
        "They are not the origin of `cdn.thumly.io`.",
        *CONTENT_TYPES,
        *HEADERS,
        *DOC_URLS,
    ]
    for needle in needles:
        if needle not in text:
            errors.append(f"distribution missing {needle}")
    if "are the `/svgif/` section" in text:
        errors.append("distribution still describes a /svgif/ section")
    if "/svgif/studio/" in text:
        errors.append("distribution still places Studio at /svgif/studio/")
    errors.extend(alias_line_errors(text, "distribution"))
    errors.extend(origin_errors(text, "distribution"))
    return errors


def workflow_errors(text: str) -> list[str]:
    errors = []
    if "workflow_dispatch:" not in text:
        errors.append("workflow_dispatch is required")
    if "push:" in text.split("jobs:", 1)[0] and "tags:" in text.split("jobs:", 1)[0]:
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
        "environment: cdn-release",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
        "SVGIF_R2_BUCKET",
        "SVGIF_CDN_ZONE_ID",
        "sha384",
        "integrity.json",
        EXACT_CC,
        ALIAS_CC,
        *CONTENT_TYPES,
        "cloudflare/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0 # v4.1.3",
        "4.160.0",
        "mode=check does not Put",
        "does not purge",
        "do not purge the exact-version URLs",
        "does not delete an exact-version object",
        "jsDelivr and unpkg are not the origin of cdn.thumly.io.",
        "r2 object put",
        "cdn.thumly.io",
    ):
        if needle not in text:
            errors.append(f"missing {needle}")
    if "npm publish" not in text:
        errors.append("publish command missing")
    if "--dry-run" not in text:
        errors.append("dry-run rehearsal missing")
    check_at = text.find("mode=check does not Put")
    put_at = text.find("r2 object put")
    if check_at < 0 or put_at < 0 or check_at > put_at:
        errors.append("mode=check must stop before Put")
    if "no-transform" in text:
        errors.append("workflow sets no-transform")
    if "r2 object delete" in text:
        errors.append("workflow deletes an R2 object")
    if "latest/integrity.json" in text:
        errors.append("integrity.json published on an alias")
    if "SVGIF_CDN_BASE:" in text:
        errors.append("workflow assigns SVGIF_CDN_BASE")
    marker = "\n  cdn:\n"
    if marker not in text:
        errors.append("cdn job missing")
    else:
        cdn = text.split(marker, 1)[1]
        if "id-token:" in cdn:
            errors.append("cdn job must not request id-token")
    errors.extend(alias_line_errors(text, "release.yml"))
    errors.extend(origin_errors(text, "release.yml"))
    return errors


def self_test() -> None:
    good_dist = "\n".join(
        [
            EXACT_CC,
            "Aliases: `/svgif/<major>/` and `/svgif/latest/`. " + ALIAS_CC + ". No SRI on these URLs.",
            *CONTENT_TYPES,
            "integrity.json",
            "sha384",
            "/studio/",
            "/docs/",
            "/schema/svgif/v1.json",
            "The old `/svgif/` section is removed.",
            "CDN object keys stay `/svgif/<npm-version>/`.",
            "SVGIF_CDN_BASE",
            "https://cdn.thumly.io/svgif",
            "no-transform",
            "`GET` and `HEAD`",
            "allowed origins `*`",
            "Do not put a strict Content-Security-Policy",
            "They are not the origin of `cdn.thumly.io`.",
            *HEADERS,
            *DOC_URLS,
        ]
    )
    if distribution_errors(good_dist):
        raise SystemExit("good distribution was rejected: " + "; ".join(distribution_errors(good_dist)))
    bad_dist = good_dist + "\n`/svgif/latest/` Cache-Control: public, max-age=31536000, immutable\n"
    if not distribution_errors(bad_dist):
        raise SystemExit("immutable alias was accepted")
    bad_sri = good_dist + "\n`/svgif/<major>/` SRI is required\n"
    if not distribution_errors(bad_sri):
        raise SystemExit("alias SRI was accepted")
    bad_origin = good_dist + "\njsDelivr is the host we upload to for cdn.thumly.io.\n"
    if not distribution_errors(bad_origin):
        raise SystemExit("jsDelivr origin was accepted")
    good_flow = "\n".join(
        [
            "on:",
            "  workflow_dispatch:",
            "  push:",
            "    tags: ['v*']",
            "jobs:",
            "  gate:",
            "    if: inputs.mode == 'check' || inputs.mode == 'release'",
            "    steps:",
            "      - run: echo mode=check does not Put and does not purge",
            "  publish:",
            "    permissions:",
            "      id-token: write",
            "    steps:",
            "      - run: npm publish --provenance --dry-run",
            "      - run: npm sbom --sbom-format cyclonedx > sbom.cdx.json",
            "  cdn:",
            "    environment: cdn-release",
            "    steps:",
            "      - run: echo do not purge the exact-version URLs",
            "      - run: echo does not delete an exact-version object",
            "      - run: npx wrangler r2 object put",
        ]
    )
    # The fixture above is incomplete on purpose for the shape needles.
    # Fill the remaining required strings without tripping the contradiction rules.
    extras = [
        "https://registry.npmjs.org",
        "npm@11.5.1",
        "check-release-readiness.mjs",
        "SVGIF_RELEASE_ACTORS",
        "github-actions[bot]",
        "refs/tags/v",
        "check-advisories.sh",
        "scan-lockfiles.sh",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ACCOUNT_ID",
        "SVGIF_R2_BUCKET",
        "SVGIF_CDN_ZONE_ID",
        "sha384",
        "integrity.json",
        EXACT_CC,
        ALIAS_CC,
        *CONTENT_TYPES,
        "cloudflare/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0 # v4.1.3",
        "4.160.0",
        "jsDelivr and unpkg are not the origin of cdn.thumly.io.",
        "https://cdn.thumly.io/svgif/1.2.3/svgif.mjs",
    ]
    good_flow += "\n" + "\n".join(extras)
    found = workflow_errors(good_flow)
    if found:
        raise SystemExit("good workflow fixture was rejected: " + "; ".join(found))
    if not workflow_errors(good_flow.replace(EXACT_CC, EXACT_CC + "\n/svgif/latest/ immutable")):
        raise SystemExit("workflow alias immutable was accepted")
    if not workflow_errors(good_flow + "\nr2 object delete\n"):
        raise SystemExit("object delete was accepted")
    print("release workflow self-test ok")


if "--self-test" in args:
    self_test()
    raise SystemExit(0)

errors = workflow_errors(Path(workflow_path).read_text())
errors.extend(distribution_errors(Path(dist_path).read_text()))
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print("release workflow shape ok")
PY
