#!/usr/bin/env node
// Write each public package's dist/ from its TypeScript sources.
//
// Order: @modootoday/svgif, @modootoday/svgif-export, @modootoday/svgif-cli, @modootoday/svgif-mcp.
// JavaScript is bundled with `bun build`. Declarations are written with the root `tsc`.
// No other tool is used and nothing is installed. [[sot:svgif/package-layout]] item 2.
//
// Relative imports between packages are bundled into each package's dist/. The sources import
// sibling internals (lower, ir, backend) and trees that are not packages (schema/, apps/studio/src),
// and the core and export packages import each other, so no package imports another by name.
//
// Declarations mirror the repository tree under dist/types/, so the relative imports between
// sources stay valid. Their `.ts` specifiers are rewritten to `.js`.
//
// Core package files:
//   dist/index.js, dist/math/index.js   ESM, shared chunks (the "." and "./math" exports)
//   dist/svgif.mjs                      ESM, one file, for the CDN
//   dist/svgif.js                       IIFE, assigns the public object to globalThis.svgif
//   dist/svgif.css                      only when player chrome CSS exists in the source
//
// Export package file:
//   dist/index.js                       ESM, one file. The entry only re-exports its modules.
//
// CLI package file:
//   dist/browser/export.js              ESM, one file, the export package for the browser.
//                                       `export --browser` serves it to a headless page.
//
// An entry that only re-exports is bundled through a wrapper that is `export * from "<entry>"`.
// Bun 1.3.14, the version CI pins, writes such an entry as an export list without the definitions.
// The check refuses an ESM file that exports names and declares or imports nothing.
//
// Usage:
//   node scripts/ci/build-packages.mjs [--only <dir>]...   build into packages/<dir>/dist
//   node scripts/ci/build-packages.mjs --self-test          build into a temp dir and check files

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const SHEBANG = "#!/usr/bin/env node\n";

/** Player chrome stylesheet of the core package. Composition CSS is not this file. */
const PLAYER_CSS = "packages/svgif/src/player/svgif.css";

const PACKAGES = [
  {
    dir: "svgif",
    target: "browser",
    entries: ["src/index.ts", "src/math/index.ts"],
    types: ["src/index.d.ts", "src/math/index.d.ts"],
    cdn: true,
  },
  { dir: "svgif-export", target: "browser", entries: ["src/index.ts"], types: ["src/index.d.ts"], reexports: true },
  {
    dir: "svgif-cli",
    target: "node",
    entries: ["src/index.ts", "src/bin.ts"],
    types: ["src/index.d.ts"],
    bins: ["bin.js"],
    browserBundle: { entry: "packages/svgif-export/src/index.ts", out: "browser/export.js" },
  },
  { dir: "svgif-mcp", target: "node", entries: ["src/index.ts", "src/bin.ts"], types: ["src/index.d.ts"], bins: ["bin.js"] },
];

function fail(message) {
  console.error(`build-packages: ${message}`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) fail(`${command}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.slice(0, 2).join(" ")} exited ${result.status}`);
}

function tsc() {
  const local = join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
  if (!existsSync(local)) fail("node_modules/.bin/tsc is missing; run npm ci at the repository root");
  return local;
}

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

/** `from "./x.ts"` and `import("./x.ts")` in a declaration become `./x.js`. */
function rewriteSpecifiers(dir) {
  for (const file of walk(dir)) {
    if (!/\.d\.m?ts$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    const next = text.replace(/(["'])(\.\.?\/[^"']*?)\.ts\1/g, "$1$2.js$1");
    if (next !== text) writeFileSync(file, next);
  }
}

function bunBuild(args) {
  run("bun", ["build", ...args, "--sourcemap=none"]);
}

/** One ESM file from an entry that only re-exports, through an `export *` wrapper. */
function bundleReexports(entry, outfile, target) {
  const wrapDir = mkdtempSync(join(tmpdir(), "svgif-reexports-"));
  try {
    const wrapper = join(wrapDir, "entry.ts");
    writeFileSync(wrapper, `export * from ${JSON.stringify(entry)};\n`);
    bunBuild([wrapper, `--outfile=${outfile}`, "--format=esm", `--target=${target}`]);
  } finally {
    rmSync(wrapDir, { recursive: true, force: true });
  }
}

function buildPackage(pkg, dist) {
  const source = join(root, "packages", pkg.dir);
  rmSync(dist, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });

  if (pkg.reexports) {
    for (const entry of pkg.entries) {
      bundleReexports(join(source, entry), join(dist, entry.replace(/^src\//, "").replace(/\.ts$/, ".js")), pkg.target);
    }
  } else bunBuild([
    ...pkg.entries.map((entry) => join(source, entry)),
    `--root=${join(source, "src")}`,
    `--outdir=${dist}`,
    "--format=esm",
    `--target=${pkg.target}`,
    "--splitting",
    "--entry-naming=[dir]/[name].[ext]",
    "--chunk-naming=chunks/[name]-[hash].[ext]",
  ]);

  if (pkg.cdn) {
    const entry = join(source, "src/index.ts");
    bunBuild([entry, `--outfile=${join(dist, "svgif.mjs")}`, "--format=esm", "--target=browser"]);
    const wrapDir = mkdtempSync(join(tmpdir(), "svgif-iife-"));
    try {
      const wrapper = join(wrapDir, "iife.ts");
      writeFileSync(
        wrapper,
        `import svgif from ${JSON.stringify(entry)};\n(globalThis as { svgif?: unknown }).svgif = svgif;\n`,
      );
      bunBuild([wrapper, `--outfile=${join(dist, "svgif.js")}`, "--format=iife", "--target=browser"]);
    } finally {
      rmSync(wrapDir, { recursive: true, force: true });
    }
    const css = join(root, PLAYER_CSS);
    if (existsSync(css)) cpSync(css, join(dist, "svgif.css"));
  }

  if (pkg.browserBundle) {
    bundleReexports(join(root, pkg.browserBundle.entry), join(dist, pkg.browserBundle.out), "browser");
  }

  const types = join(dist, "types");
  run(tsc(), [
    "-p",
    join(source, "tsconfig.json"),
    "--noEmit",
    "false",
    "--declaration",
    "--emitDeclarationOnly",
    "--rootDir",
    root,
    "--outDir",
    types,
  ]);
  rewriteSpecifiers(types);

  for (const bin of pkg.bins ?? []) {
    const file = join(dist, bin);
    const text = readFileSync(file, "utf8");
    if (!text.startsWith("#!")) writeFileSync(file, SHEBANG + text);
    chmodSync(file, 0o755);
  }
}

/** The files each package's package.json names, relative to the package directory. */
function expectedFiles(pkg) {
  const files = pkg.entries.map((entry) => entry.replace(/^src\//, "dist/").replace(/\.ts$/, ".js"));
  for (const type of pkg.types) files.push(`dist/types/packages/${pkg.dir}/${type}`);
  if (pkg.cdn) files.push("dist/svgif.mjs", "dist/svgif.js");
  if (pkg.browserBundle) files.push(`dist/${pkg.browserBundle.out}`);
  return files;
}

/** True when an ESM file exports names but declares and imports nothing, so the names are undefined. */
function exportsOnly(text) {
  const code = text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/export\s*\{[^}]*\}\s*;?/g, "")
    .trim();
  return /export\s*\{/.test(text) && code === "";
}

function check(pkg, base) {
  const problems = [];
  for (const file of expectedFiles(pkg)) {
    if (!existsSync(join(base, file))) problems.push(`${pkg.dir}: missing ${file}`);
  }
  if (pkg.cdn && existsSync(join(root, PLAYER_CSS)) && !existsSync(join(base, "dist/svgif.css"))) {
    problems.push(`${pkg.dir}: missing dist/svgif.css`);
  }
  for (const bin of pkg.bins ?? []) {
    const file = join(base, "dist", bin);
    if (!existsSync(file)) continue;
    if (!readFileSync(file, "utf8").startsWith(SHEBANG)) problems.push(`${pkg.dir}: dist/${bin} has no node shebang`);
    if ((statSync(file).mode & 0o111) === 0) problems.push(`${pkg.dir}: dist/${bin} is not executable`);
  }
  const manifest = JSON.parse(readFileSync(join(root, "packages", pkg.dir, "package.json"), "utf8"));
  const named = [];
  for (const target of Object.values(manifest.exports ?? {})) named.push(target.import, target.types);
  for (const target of Object.values(manifest.bin ?? {})) named.push(target);
  for (const path of named.filter(Boolean)) {
    if (!existsSync(join(base, path))) problems.push(`${pkg.dir}: package.json names ${path}, the build did not write it`);
  }
  for (const file of walk(join(base, "dist"))) {
    if (!/\.(m?js|d\.ts)$/.test(file)) continue;
    const text = readFileSync(file, "utf8");
    if (text.includes("sourceMappingURL")) problems.push(`${pkg.dir}: ${relative(base, file)} has a source map reference`);
    if (/\.m?js$/.test(file) && exportsOnly(text)) {
      problems.push(`${pkg.dir}: ${relative(base, file)} exports names it does not define`);
    }
  }
  if (pkg.cdn) {
    const context = vm.createContext({ TextEncoder, TextDecoder });
    vm.runInContext(readFileSync(join(base, "dist/svgif.js"), "utf8"), context);
    if (typeof context.svgif?.composition !== "function") problems.push(`${pkg.dir}: dist/svgif.js does not set globalThis.svgif`);
  }
  return problems;
}

function selected(args) {
  const only = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--only") only.push(args[index + 1]);
  }
  if (only.length === 0) return PACKAGES;
  for (const name of only) if (!PACKAGES.some((pkg) => pkg.dir === name)) fail(`unknown package ${name}`);
  return PACKAGES.filter((pkg) => only.includes(pkg.dir));
}

const args = process.argv.slice(2);
const packages = selected(args);

if (args.includes("--self-test")) {
  const temp = mkdtempSync(join(tmpdir(), "svgif-build-"));
  try {
    const problems = [];
    for (const pkg of packages) {
      const base = join(temp, pkg.dir);
      buildPackage(pkg, join(base, "dist"));
      problems.push(...check(pkg, base));
    }
    if (problems.length > 0) fail(`self-test failed:\n  ${problems.join("\n  ")}`);
    console.log(`build-packages: self-test passed for ${packages.map((pkg) => pkg.dir).join(", ")}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
} else {
  for (const pkg of packages) {
    const base = join(root, "packages", pkg.dir);
    buildPackage(pkg, join(base, "dist"));
    const problems = check(pkg, base);
    if (problems.length > 0) fail(problems.join("\n  "));
    console.log(`build-packages: ${pkg.dir} -> ${relative(root, join(base, "dist"))}`);
  }
  if (!existsSync(join(root, PLAYER_CSS))) {
    console.log(`build-packages: no ${PLAYER_CSS}; dist/svgif.css is not written`);
  }
}
