#!/usr/bin/env bash
# Landing CTA, top nav, and the GitHub README picture budget.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
nav="$root/docs/_data/nav/main.yml"
index="$root/docs/svgif/index.md"
python3 - "$nav" "$index" "$root" <<'PY'
import re
import sys
from pathlib import Path

nav_path, index_path, root = sys.argv[1:]
root = Path(root)
nav = Path(nav_path).read_text().splitlines()
urls = [line.split("url:", 1)[1].strip() for line in nav if "url:" in line]
expect = ["/svgif/studio/", "/svgif/guide/", "/svgif/developers/"]
if urls[:3] != expect:
    raise SystemExit(f"nav order {urls[:3]} != {expect}")
text = Path(index_path).read_text()
link = text.split("](", 1)[1].split(")", 1)[0]
if link != "/svgif/studio/":
    raise SystemExit(f"primary CTA {link} is not /svgif/studio/")

readme = (root / "README.md").read_text()
if "Make motion that stays a file." not in readme:
    raise SystemExit("README is missing the tagline")
for name in ("css-external", "css-embedded", "smil"):
    if f"`{name}`" not in readme:
        raise SystemExit(f"README table is missing {name}")
if "does not travel inside a single SVG" not in readme:
    raise SystemExit("README table is missing the css-external limit")
for fact in ("apps/thumly", "not shipped", "not running", "https://thumly.io/"):
    if fact not in readme:
        raise SystemExit(f"README is missing {fact}")

assets = root / "docs" / "assets" / "readme"
pairs = ("hero", "thumly", "file", "frames")
hero_max = 48 * 1024
other_max = 16 * 1024
seen = set()
for stem in pairs:
    for mode in ("light", "dark"):
        path = assets / f"{stem}-{mode}.svg"
        if not path.is_file():
            raise SystemExit(f"missing {path.relative_to(root)}")
        seen.add(path.name)
        blob = path.read_text()
        if "prefers-reduced-motion" not in blob:
            raise SystemExit(f"{path.name} ignores prefers-reduced-motion")
        if re.search(r"<script|javascript:|@import|@font-face", blob, re.I):
            raise SystemExit(f"{path.name} is not self-contained")
        cleaned = re.sub(r'xmlns(?::[A-Za-z0-9]+)?="http://www\.w3\.org/[^"]*"', "", blob)
        if re.search(r"https?://|url\(\s*//", cleaned, re.I):
            raise SystemExit(f"{path.name} has an external reference")
        limit = hero_max if stem == "hero" else other_max
        size = path.stat().st_size
        if size > limit:
            raise SystemExit(f"{path.name} is {size} bytes, limit {limit}")
        dark = f"(prefers-color-scheme: dark)"
        if mode == "dark" and f'srcset="docs/assets/readme/{path.name}"' not in readme:
            raise SystemExit(f"README picture is missing {path.name}")
        if mode == "dark" and dark not in readme:
            raise SystemExit("README picture is missing the dark media query")
        if mode == "light" and f'src="docs/assets/readme/{path.name}"' not in readme:
            raise SystemExit(f"README picture is missing {path.name}")

extra = [p for p in assets.glob("*.svg") if p.name not in seen]
for path in extra:
    size = path.stat().st_size
    limit = hero_max if path.name.startswith("hero-") else other_max
    if size > limit:
        raise SystemExit(f"{path.name} is {size} bytes, limit {limit}")

config = (root / "docs" / "_config.yml").read_text()
sot = (root / ".spec" / "sot" / "docs-site.sot.md").read_text()
for label, blob, facts in (
    ("_config.yml", config, ("https://thumly.io", "www.thumly.io", "redirects to the apex")),
    (
        "docs-site",
        sot,
        (
            "www.thumly.io",
            "not a second site",
            "redirects to the apex",
            "never forked",
            "upstream request",
            "After M2",
        ),
    ),
):
    for fact in facts:
        if fact not in blob:
            raise SystemExit(f"{label} is missing {fact}")

print("docs ia ok")
PY
