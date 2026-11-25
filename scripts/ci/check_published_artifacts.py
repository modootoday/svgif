#!/usr/bin/env python3
"""Reject published trees that contain internal paths, source maps, or deny terms."""
from __future__ import annotations

import io
import os
import re
import sys
import tarfile
import tempfile
from pathlib import Path

FORBIDDEN_PARTS = (".spec", ".agents", "AGENTS.md")
SKIP_PATTERN_FILES = True


# A line that only says the list is not filled in yet. It is never scanned as a term,
# so a placeholder secret reads as "not configured" instead of a silent pass.
PLACEHOLDER_LINE = re.compile(
    r"^(?:placeholders?|place[-_ ]holder|todo|tbd|tba|changeme|change[-_ ]me|replace[-_ ]?me|"
    r"fill[-_ ]?me(?:[-_ ]?in)?|unset|not[-_ ]?set|not[-_ ]?configured|none|null|nil|empty|"
    r"dummy|example|sample|__svgif_unset__|x{2,}|[-_.*#?]+|<[^>]*>|\[[^\]]*\]|\{[^}]*\})$",
    re.IGNORECASE,
)


def deny_lines(name: str) -> list[str]:
    """Non-empty, trimmed lines of one secret."""
    return [line.strip() for line in os.environ.get(name, "").splitlines() if line.strip()]


def deny_status(name: str) -> str:
    """missing, placeholder, or configured. The value itself is never returned."""
    lines = deny_lines(name)
    if not lines:
        return "missing"
    if all(PLACEHOLDER_LINE.match(line) for line in lines):
        return "placeholder"
    return "configured"


def deny_notices() -> list[str]:
    """A notice for each list that is not filled in. It names the secret, never a value."""
    notices: list[str] = []
    for name in ("SVGIF_DENY_TERMS", "SVGIF_DENY_NAMES"):
        status = deny_status(name)
        if status == "configured":
            continue
        state = "holds only a placeholder" if status == "placeholder" else "is not set"
        text = f"{name} {state}; the deny list is not configured, so its extra terms were not scanned"
        notices.append(f"::warning title=Deny list not configured::{text}" if os.environ.get("GITHUB_ACTIONS") == "true" else f"warning: {text}")
    return notices


# The secrets whose lines are forbidden literals. SVGIF_DENY_TERMS_EXTRA is optional: unset or empty
# adds nothing and is not reported. SVGIF_DENY_TERMS stays the required, fail-closed list.
DENY_LISTS = ("SVGIF_DENY_TERMS", "SVGIF_DENY_TERMS_EXTRA", "SVGIF_DENY_NAMES")


def deny_literals() -> list[str]:
    """Non-empty lines from every deny secret, without placeholder lines. Order is stable."""
    return [line for name in DENY_LISTS for line in deny_lines(name) if not PLACEHOLDER_LINE.match(line)]


def extra_self_test() -> None:
    """SVGIF_DENY_TERMS_EXTRA adds its lines to the union, and an unset or empty one adds nothing."""
    saved = {name: os.environ.get(name) for name in (*DENY_LISTS, "GITHUB_ACTIONS")}
    try:
        os.environ.pop("GITHUB_ACTIONS", None)
        os.environ["SVGIF_DENY_TERMS"] = "fixture-term-7"
        os.environ["SVGIF_DENY_NAMES"] = "fixture-name-7"
        os.environ["SVGIF_DENY_TERMS_EXTRA"] = "fixture-extra-7\n\n"
        if deny_literals() != ["fixture-term-7", "fixture-extra-7", "fixture-name-7"]:
            raise SystemExit("self-test did not scan the SVGIF_DENY_TERMS_EXTRA lines")
        for value in (None, "", " \n"):
            if value is None:
                os.environ.pop("SVGIF_DENY_TERMS_EXTRA", None)
            else:
                os.environ["SVGIF_DENY_TERMS_EXTRA"] = value
            if deny_literals() != ["fixture-term-7", "fixture-name-7"] or deny_notices() != []:
                raise SystemExit("self-test: an unset or empty SVGIF_DENY_TERMS_EXTRA changed the scan or was reported")
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def patterns() -> list[re.Pattern[str]]:
    found: list[re.Pattern[str]] = []
    text = Path("scripts/ci/deny-patterns.txt").read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        found.append(re.compile(line))
    for term in deny_literals():
        found.append(re.compile(re.escape(term)))
    return found


def bad_path(path: str) -> str | None:
    parts = path.replace("\\", "/").split("/")
    if "AGENTS.md" in parts or path.endswith("/AGENTS.md") or path == "AGENTS.md":
        return "AGENTS.md"
    if ".spec" in parts or ".agents" in parts:
        return "internal tree"
    if path.endswith(".map"):
        return "source map"
    return None


def scan_bytes(label: str, payload: bytes, pats: list[re.Pattern[str]]) -> list[str]:
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        return []
    for pattern in pats:
        if pattern.search(text):
            return [f"{label} matched a denied pattern"]
    return []


def scan_tree(root: Path, pats: list[re.Pattern[str]]) -> list[str]:
    errors: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root).as_posix()
        reason = bad_path(rel)
        if reason:
            errors.append(f"{root.name}/{rel} is a {reason}")
            continue
        errors.extend(scan_bytes(f"{root.name}/{rel}", path.read_bytes(), pats))
    return errors


def scan_tarball(tarball: Path, pats: list[re.Pattern[str]]) -> list[str]:
    errors: list[str] = []
    with tarfile.open(tarball, "r:*") as archive:
        for member in archive.getmembers():
            if not member.isfile():
                continue
            name = member.name.split("/", 1)[-1]
            reason = bad_path(name)
            if reason:
                errors.append(f"tarball {name} is a {reason}")
                continue
            extracted = archive.extractfile(member)
            if extracted is None:
                continue
            errors.extend(scan_bytes(f"tarball {name}", extracted.read(), pats))
    return errors


def self_test() -> None:
    saved_names = os.environ.get("SVGIF_DENY_NAMES")
    saved_terms = os.environ.get("SVGIF_DENY_TERMS")
    os.environ["SVGIF_DENY_NAMES"] = ""
    os.environ["SVGIF_DENY_TERMS"] = ""
    try:
        structural_self_test()
    finally:
        if saved_names is None:
            os.environ.pop("SVGIF_DENY_NAMES", None)
        else:
            os.environ["SVGIF_DENY_NAMES"] = saved_names
        if saved_terms is None:
            os.environ.pop("SVGIF_DENY_TERMS", None)
        else:
            os.environ["SVGIF_DENY_TERMS"] = saved_terms


def structural_self_test() -> None:
    pats = patterns()
    with tempfile.TemporaryDirectory() as tmp:
        site = Path(tmp) / "site"
        site.mkdir()
        (site / "index.html").write_text("<p>ok</p>", encoding="utf-8")
        (site / ".spec").mkdir()
        (site / ".spec" / "secret.md").write_text("nope", encoding="utf-8")
        errs = scan_tree(site, pats)
        if not any("internal tree" in item for item in errs):
            raise SystemExit("self-test did not reject .spec")
        clean = Path(tmp) / "clean"
        clean.mkdir()
        (clean / "index.html").write_text("<p>ok</p>", encoding="utf-8")
        if scan_tree(clean, pats):
            raise SystemExit("self-test rejected a clean site")
        blob = io.BytesIO()
        with tarfile.open(fileobj=blob, mode="w:gz") as archive:
            data = b"AK" + b"IAIOSFODNN7EXAMPLE\n"
            info = tarfile.TarInfo("package/README.md")
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
        blob.seek(0)
        tar_path = Path(tmp) / "bad.tgz"
        tar_path.write_bytes(blob.getvalue())
        if not scan_tarball(tar_path, pats):
            raise SystemExit("self-test missed a deny term in a tarball")
    deny_name_self_test()


def deny_name_self_test() -> None:
    fixture = "deny-name-fixture"
    saved_names = os.environ.get("SVGIF_DENY_NAMES")
    saved_terms = os.environ.get("SVGIF_DENY_TERMS")
    try:
        os.environ["SVGIF_DENY_TERMS"] = "\n\n"
        os.environ["SVGIF_DENY_NAMES"] = "\n\n" + fixture + "\n  \n"
        if deny_literals() != [fixture]:
            raise SystemExit("self-test ignored a blank line or the deny-name list")
        named = patterns()
        with tempfile.TemporaryDirectory() as tmp:
            site = Path(tmp) / "site"
            site.mkdir()
            (site / "index.html").write_text(fixture, encoding="utf-8")
            site_errors = scan_tree(site, named)
            if not site_errors or any(fixture in item or "SVGIF_DENY" in item for item in site_errors):
                raise SystemExit("self-test ignored the deny-name fixture in a docs build or printed a match")
            blob = io.BytesIO()
            payload = (fixture + "\n").encode()
            with tarfile.open(fileobj=blob, mode="w:gz") as archive:
                info = tarfile.TarInfo("package/README.md")
                info.size = len(payload)
                archive.addfile(info, io.BytesIO(payload))
            blob.seek(0)
            tar_path = Path(tmp) / "names.tgz"
            tar_path.write_bytes(blob.getvalue())
            tar_errors = scan_tarball(tar_path, named)
            if not tar_errors or any(fixture in item or "SVGIF_DENY" in item for item in tar_errors):
                raise SystemExit("self-test ignored the deny-name fixture in a tarball or printed a match")
            os.environ["SVGIF_DENY_NAMES"] = "\n  \n"
            if deny_literals():
                raise SystemExit("self-test kept a blank deny line")
            clean = Path(tmp) / "clean"
            clean.mkdir()
            (clean / "index.html").write_text(fixture, encoding="utf-8")
            if scan_tree(clean, patterns()):
                raise SystemExit("self-test denied the fixture when the name list was blank")
    finally:
        if saved_names is None:
            os.environ.pop("SVGIF_DENY_NAMES", None)
        else:
            os.environ["SVGIF_DENY_NAMES"] = saved_names
        if saved_terms is None:
            os.environ.pop("SVGIF_DENY_TERMS", None)
        else:
            os.environ["SVGIF_DENY_TERMS"] = saved_terms


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        # The fixtures set the deny lists they test. A configured EXTRA secret would add its lines to each.
        os.environ.pop("SVGIF_DENY_TERMS_EXTRA", None)
        self_test()
        saved = os.environ.get("SVGIF_DENY_TERMS")
        try:
            os.environ["SVGIF_DENY_TERMS"] = "TODO"
            if deny_status("SVGIF_DENY_TERMS") != "placeholder" or "TODO" in "".join(deny_notices()):
                raise SystemExit("self-test passed a placeholder deny list silently or printed its value")
            if any(p.pattern == "TODO" for p in patterns()):
                raise SystemExit("self-test scanned a placeholder line as a term")
        finally:
            if saved is None:
                os.environ.pop("SVGIF_DENY_TERMS", None)
            else:
                os.environ["SVGIF_DENY_TERMS"] = saved
        extra_self_test()
        print("published-artifact self-test ok")
        return 0
    if os.environ.get("SVGIF_REQUIRE_DENY_TERMS") == "true" and not os.environ.get("SVGIF_DENY_TERMS", "").strip():
        print("SVGIF_DENY_TERMS is not set", file=sys.stderr)
        return 1
    for notice in deny_notices():
        print(notice, flush=True)
    if len(sys.argv) != 3:
        print("usage: check-published-artifacts.sh --self-test | <site-dir> <tarball>", file=sys.stderr)
        return 2
    site = Path(sys.argv[1])
    tarball = Path(sys.argv[2])
    if not site.is_dir():
        print(f"missing site dir {site}", file=sys.stderr)
        return 1
    if not tarball.is_file():
        print(f"missing tarball {tarball}", file=sys.stderr)
        return 1
    errors = scan_tree(site, patterns()) + scan_tarball(tarball, patterns())
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("published artifacts ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
