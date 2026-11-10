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


def patterns() -> list[re.Pattern[str]]:
    found: list[re.Pattern[str]] = []
    text = Path("scripts/ci/deny-patterns.txt").read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        found.append(re.compile(line))
    for line in os.environ.get("SVGIF_DENY_TERMS", "").splitlines():
        term = line.strip()
        if term:
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


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        self_test()
        print("published-artifact self-test ok")
        return 0
    if os.environ.get("SVGIF_REQUIRE_DENY_TERMS") == "true" and not os.environ.get("SVGIF_DENY_TERMS", "").strip():
        print("SVGIF_DENY_TERMS is not set", file=sys.stderr)
        return 1
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
