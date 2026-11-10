#!/usr/bin/env bash
# Landing CTA, top nav, route map, CDN wording, and the GitHub README picture budget.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
nav="$root/docs/_data/nav/main.yml"
index="$root/docs/index.md"
python3 - "$nav" "$index" "$root" <<'PY'
import re
import sys
from pathlib import Path

nav_path, index_path, root = sys.argv[1:]
root = Path(root)
nav = Path(nav_path).read_text().splitlines()
urls = [line.split("url:", 1)[1].strip() for line in nav if "url:" in line]
expect = ["/studio/", "/docs/guides/", "/docs/reference/api/"]
if urls[:3] != expect:
    raise SystemExit(f"nav order {urls[:3]} != {expect}")
text = Path(index_path).read_text()
link = text.split("](", 1)[1].split(")", 1)[0]
if link != "/studio/":
    raise SystemExit(f"primary CTA {link} is not /studio/")

readme = (root / "README.md").read_text()
if "Make motion that stays a file." not in readme:
    raise SystemExit("README is missing the tagline")
for name in ("css-external", "css-embedded", "smil"):
    if f"`{name}`" not in readme:
        raise SystemExit(f"README table is missing {name}")
if "does not travel inside a single SVG" not in readme:
    raise SystemExit("README table is missing the css-external limit")
headings = (
    "## What is svgif",
    "## Quick start",
    "## Surfaces",
    "## Documentation",
    "## Repository layout",
    "## How this project is built",
    "## Security and supply chain",
    "## Contributing",
    "## License",
)
for heading in headings:
    if heading not in readme:
        raise SystemExit(f"README is missing heading {heading}")
if "img.shields.io/npm/v/%40modootoday%2Fsvgif" not in readme:
    raise SystemExit("README is missing the npm badge")
if "img.shields.io/bundlephobia/minzip/%40modootoday%2Fsvgif" not in readme:
    raise SystemExit("README is missing the bundle size badge")
pre = "Pre-release: APIs and commands below describe v1 and go live with the first gated release."
pre_count = readme.count(pre)
if pre_count != 1:
    raise SystemExit(f"pre-release line count is {pre_count}")
pictures = re.findall(r"<picture>\n.*?</picture>", readme, re.S)
expect_pictures = [
    """<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/hero-dark.svg">
  <img alt="Hand-drawn hero for svgif.js. A single SVG file draws a curve and steps through integer frames. The engine is not shipped." src="docs/assets/readme/hero-light.svg" width="960">
</picture>""",
    """<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/thumly-dark.svg">
  <img alt="Hand-drawn browser frame for thumly.io. The app is not shipped and is not running." src="docs/assets/readme/thumly-light.svg" width="720">
</picture>""",
    """<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/file-dark.svg">
  <img alt="Hand-drawn picture of one SVG document with the motion inside the file." src="docs/assets/readme/file-light.svg" width="720">
</picture>""",
    """<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/readme/frames-dark.svg">
  <img alt="Hand-drawn row of integer frames with a moving playhead. The player is not shipped." src="docs/assets/readme/frames-light.svg" width="720">
</picture>""",
]
if pictures != expect_pictures:
    raise SystemExit("README picture block changed")
for fact in ("apps/thumly", "not shipped", "not running", "https://thumly.io/"):
    if fact not in readme:
        raise SystemExit(f"README is missing {fact}")
if "https://thumly.io/svgif" in readme:
    raise SystemExit("README still presents https://thumly.io/svgif/ as the docs home")
if "https://thumly.io/docs/" not in readme:
    raise SystemExit("README docs home is not https://thumly.io/docs/")

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

if (root / "docs" / "svgif").exists():
    raise SystemExit("docs/svgif/ still exists")

pages = (
    "docs/index.md",
    "docs/studio/index.md",
    "docs/docs/index.md",
    "docs/docs/getting-started/index.md",
    "docs/docs/guides/index.md",
    "docs/docs/reference/api/index.md",
    "docs/docs/reference/cli/index.md",
    "docs/docs/reference/schema/index.md",
    "docs/docs/agents/index.md",
    "docs/embed/index.md",
    "docs/works/index.md",
    "docs/oembed.md",
)
for rel in pages:
    if not (root / rel).is_file():
        raise SystemExit(f"missing {rel}")
studio = (root / "docs" / "studio" / "index.md").read_text()
if "data-svgif-studio=placeholder" not in studio:
    raise SystemExit("Studio placeholder marker is missing")

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
            "https://thumly.io/docs/",
            "/schema/svgif/v1.json",
            "Not a query endpoint.",
            "Those paths are retired.",
        ),
    ),
):
    for fact in facts:
        if fact not in blob:
            raise SystemExit(f"{label} is missing {fact}")

priority = []
for line in sot.splitlines():
    if re.match(r"^\| P\d ", line):
        cols = [part.strip() for part in line.strip().strip("|").split("|")]
        priority.append(cols[1].strip("`"))
expect_priority = ["/", "/studio/", "/docs/guides/", "/docs/reference/api/"]
if priority[:4] != expect_priority:
    raise SystemExit(f"docs-site priority {priority[:4]} != {expect_priority}")

cdn_facts = (
    "`SVGIF_CDN_BASE` is unset.",
    "Once `SVGIF_CDN_BASE` is set, the origin is `https://cdn.thumly.io/svgif`.",
    "jsDelivr and unpkg are secondary documentation URLs. They are not the origin of `cdn.thumly.io`.",
    "Exact-version URLs are the ones that carry SRI. Alias URLs do not.",
    "does not boot from the CDN.",
    "CDN object keys `/svgif/<version>/` stay.",
)
docs_home = (root / "docs" / "docs" / "index.md").read_text()
for label, blob in (("README", readme), ("docs home", docs_home), ("docs-site", sot)):
    for fact in cdn_facts:
        if fact not in blob:
            raise SystemExit(f"{label} is missing {fact}")

def cdn_base_already_set(blob: str) -> str | None:
    for line in blob.splitlines():
        if "SVGIF_CDN_BASE" not in line:
            continue
        if re.search(r"already set", line, re.I):
            return line.strip()
        if re.search(r"\bis set\b", line, re.I) and not re.search(
            r"\b(once|when|until|after)\b", line, re.I
        ):
            return line.strip()
    return None

def names_mirror_as_origin(blob: str) -> str | None:
    for line in blob.splitlines():
        low = line.lower()
        if "jsdelivr" not in low and "unpkg" not in low:
            continue
        if "origin" in low and "not the origin" not in low:
            return line.strip()
    return None

scanned = [("README.md", readme), (".spec/sot/docs-site.sot.md", sot)]
docs = root / "docs"
skip_names = {"llms.txt", "Gemfile.lock"}
skip_dirs = {"_site", "vendor", ".bundle", ".jekyll-cache", ".sass-cache"}
for path in docs.rglob("*"):
    if not path.is_file() or path.name in skip_names:
        continue
    if any(part in skip_dirs for part in path.parts):
        continue
    if path.suffix.lower() not in {".md", ".yml", ".yaml", ".html"}:
        continue
    blob = path.read_text()
    rel = str(path.relative_to(root))
    scanned.append((rel, blob))
    if path.suffix.lower() == ".md":
        low = blob.lower()
        if "http-equiv" in low and "refresh" in low:
            raise SystemExit(f"{rel} adds a meta refresh")
        if "rel=\"canonical\"" in low or "rel='canonical'" in low:
            raise SystemExit(f"{rel} adds a canonical stub")
        if re.search(r"https://thumly\.io/svgif", blob):
            raise SystemExit(f"{rel} still presents https://thumly.io/svgif/")

for label, blob in scanned:
    hit = cdn_base_already_set(blob)
    if hit:
        raise SystemExit(f"{label} says SVGIF_CDN_BASE is already set: {hit}")
    hit = names_mirror_as_origin(blob)
    if hit:
        raise SystemExit(f"{label} names jsDelivr or unpkg as the CDN origin: {hit}")

print("docs ia ok")
PY
