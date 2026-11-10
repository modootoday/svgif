#!/usr/bin/env node
// Install the agent surface from a git pin of this repository and list what a
// client would see. Does not submit anything to a registry.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRendered, loadSource } from "./render-agent-manifests.mjs";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "../..");

function readJson(dir, path) {
  return JSON.parse(readFileSync(join(dir, path), "utf8"));
}

export function inspectCheckout(dir) {
  const errors = [];
  const market = readJson(dir, ".claude-plugin/marketplace.json");
  if (market.name !== "svgif" || market.plugins?.[0]?.source !== "./") {
    errors.push("claude marketplace is not installable from the repository root");
  }
  if (market.owner?.email) errors.push("marketplace owner email");
  const claude = readJson(dir, ".claude-plugin/plugin.json");
  const portable = readJson(dir, "plugin.json");
  const codex = readJson(dir, ".codex-plugin/plugin.json");
  const cursor = readJson(dir, ".cursor-plugin/plugin.json");
  for (const [label, manifest] of [
    ["claude", claude],
    ["portable", portable],
    ["codex", codex],
    ["cursor", cursor],
  ]) {
    if (manifest.name !== "svgif") errors.push(`${label} name`);
    if (manifest.version !== claude.version) errors.push(`${label} version drift`);
  }
  const mcp = readJson(dir, "mcp.json");
  const server = mcp.mcpServers?.svgif;
  if (!server || server.command !== "npx" || server.args?.[0] !== "-y") {
    errors.push("mcp.json is not an npx stdio server");
  }
  if (server && !String(server.args[1]).startsWith("@modootoday/svgif-mcp@")) {
    errors.push("mcp package");
  }
  const { source } = loadSource(dir);
  const found = [];
  for (const skill of source.skills) {
    const path = join(dir, "skills", skill.name, "SKILL.md");
    if (!existsSync(path)) {
      errors.push(`missing skill ${skill.name}`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (!text.startsWith(`---\nname: ${skill.name}\n`)) errors.push(`frontmatter ${skill.name}`);
    found.push(skill.name);
  }
  const llms = readFileSync(join(dir, "docs/llms.txt"), "utf8");
  for (const needle of [
    "npx skills add modootoday/svgif",
    "/plugin marketplace add modootoday/svgif",
    "codex plugin marketplace add modootoday/svgif",
    "npx @modootoday/svgif-cli@",
    "npx -y @modootoday/svgif-mcp@",
  ]) {
    if (!llms.includes(needle)) errors.push(`llms.txt missing ${needle}`);
  }
  for (const rel of governanceSkillFiles(dir)) {
    const text = readFileSync(join(dir, rel), "utf8");
    if (!skillIsInternal(text)) errors.push(`governance skill is visible to skills install: ${rel}`);
    const name = text.match(/^name:\s*(\S+)/m)?.[1];
    if (source.skills.some((skill) => skill.name === name)) errors.push(`product skill copied into governance: ${rel}`);
  }
  return { errors, skills: found, version: claude.version, tools: source.tools.map((tool) => tool.name) };
}

function skillIsInternal(text) {
  const lines = text.split(/\r?\n/);
  let inMetadata = false;
  for (const line of lines) {
    if (line.trim() === "---" && inMetadata) break;
    if (!inMetadata) {
      if (line === "metadata:") inMetadata = true;
      continue;
    }
    if (line.length > 0 && !/^[ \t]/.test(line)) break;
    const value = line.match(/^[ \t]+internal:\s*(.+?)\s*$/)?.[1];
    if (value === "true" || value === '"true"' || value === "'true'" || value === '"1"' || value === "'1'") {
      return true;
    }
  }
  return false;
}

function governanceSkillFiles(dir) {
  if (dir === root) {
    const listed = execFileSync("git", ["ls-files", ".agents", ".claude"], { cwd: root, encoding: "utf8" });
    return listed.split("\n").filter((line) => line.endsWith("/SKILL.md") || line.endsWith("SKILL.md"));
  }
  const found = [];
  function walk(current, rel) {
    if (!existsSync(current)) return;
    for (const name of readdirSync(current)) {
      const next = join(current, name);
      const child = rel ? `${rel}/${name}` : name;
      if (statSync(next).isDirectory()) walk(next, child);
      else if (name === "SKILL.md" && (child.startsWith(".agents/") || child.startsWith(".claude/"))) found.push(child);
    }
  }
  walk(join(dir, ".agents"), ".agents");
  walk(join(dir, ".claude"), ".claude");
  return found;
}

function archivePin(ref) {
  const dir = mkdtempSync(join(tmpdir(), "svgif-install-"));
  const tarPath = join(dir, "pin.tar");
  // Write the archive to a file. Capturing stdout hits the spawn buffer once the tree exceeds 1 MiB.
  execFileSync("git", ["archive", "--output", tarPath, ref], { cwd: root });
  execFileSync("tar", ["-x", "-C", dir, "-f", tarPath]);
  rmSync(tarPath);
  return dir;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    const sample = inspectCheckout(root);
    if (!sample.skills.includes("svgif-export")) throw new Error("self-test skills");
    console.log("install-from-repo self-test ok");
    return;
  }
  const drift = checkRendered(root);
  if (drift.length) {
    console.error(drift.join("\n"));
    process.exit(1);
  }
  const pinFlag = args.indexOf("--pin");
  let dir = root;
  let cleanup = false;
  if (pinFlag >= 0) {
    dir = archivePin(args[pinFlag + 1]);
    cleanup = true;
  }
  try {
    const report = inspectCheckout(dir);
    if (report.errors.length) {
      console.error(report.errors.join("\n"));
      process.exit(1);
    }
    console.log(`repo install ok version ${report.version}`);
    console.log(`skills ${report.skills.join(" ")}`);
    console.log(`tools ${report.tools.join(" ")}`);
    const cli = join(dir, "packages/svgif-cli/package.json");
    if (!existsSync(cli)) {
      console.log("validate+export round-trip waits until packages/svgif-cli exists");
      return;
    }
    console.error("packages/svgif-cli exists but the parity runner is not wired");
    process.exit(1);
  } finally {
    if (cleanup) rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
