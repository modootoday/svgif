/**
 * Build the static Studio page.
 * Bun bundles the engine and the export package from their TypeScript source.
 * Source maps are not written. Preset JSON is copied under dist/presets/.
 */

import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const studio = join(import.meta.dir, "..");
const repo = join(studio, "../..");
const dist = join(studio, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

const built = await Bun.build({
  entrypoints: [join(studio, "src/main.ts")],
  outdir: dist,
  naming: {
    entry: "studio.js",
    chunk: "studio-[name].js",
    asset: "studio-[name].[ext]",
  },
  sourcemap: "none",
  target: "browser",
  minify: false,
});

if (!built.success) {
  for (const log of built.logs) console.error(log);
  throw new Error("bun build failed");
}

const script = built.outputs.find((output) => output.path.endsWith("studio.js"));
if (!script) throw new Error("bun build did not write studio.js");

cpSync(join(studio, "src/studio.css"), join(dist, "studio.css"));

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Studio</title>
  <link rel="stylesheet" href="./studio.css">
</head>
<body>
  <div id="studio-root" data-svgif-studio="app"></div>
  <script type="module" src="./studio.js"></script>
</body>
</html>
`;
writeFileSync(join(dist, "index.html"), html);

const presets = join(repo, "presets");
copyJsonTree(presets, join(dist, "presets"));

const forbidden = scan(dist);
if (forbidden.length > 0) {
  throw new Error(`dist contains forbidden files:\n${forbidden.join("\n")}`);
}

console.log(`built ${relative(repo, join(dist, "index.html"))}`);

function copyJsonTree(source: string, target: string): void {
  for (const name of readdirSync(source)) {
    if (name.endsWith(".golden.svg")) continue;
    const from = join(source, name);
    const info = statSync(from);
    if (info.isDirectory()) {
      copyJsonTree(from, join(target, name));
      continue;
    }
    if (!name.endsWith(".json")) continue;
    mkdirSync(target, { recursive: true });
    cpSync(from, join(target, name));
  }
}

function scan(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const info = statSync(path);
    if (info.isDirectory()) {
      if (name === ".spec" || name === ".agents") found.push(path);
      else found.push(...scan(path));
      continue;
    }
    if (name.endsWith(".map") || name === "AGENTS.md" || path.includes(`${join(".spec")}`) || path.includes(`${join(".agents")}`)) {
      found.push(path);
    }
    const text = name.endsWith(".js") || name.endsWith(".css") || name.endsWith(".html") ? readFileSync(path, "utf8") : "";
    if (text.includes("sourceMappingURL")) found.push(`${path} source map`);
  }
  return found;
}
