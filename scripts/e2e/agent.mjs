#!/usr/bin/env node
// Agent rows of the release-readiness matrix. Each row is one result with the browser field `agent`.
// A row that cannot run here is `blocked` with the reason. It is never written as `passed`.
//
//   node scripts/e2e/agent.mjs --out evidence [--sha <commit>]
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCatalog, parseArgs, root, runRow, writeRow } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
const outDir = String(args.out ?? "evidence");
const catalog = loadCatalog();
const only = typeof args.only === "string" ? args.only.split(",") : catalog.agentScenarios;
const sha = typeof args.sha === "string" ? args.sha : execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const cli = join(root, "packages/svgif-cli/src/bin.ts");
const mcp = join(root, "packages/svgif-mcp/src/bin.ts");
const fixtures = join(root, "schema/fixtures");
const valid = join(fixtures, "project/v1-valid.json");
const source = JSON.parse(readFileSync(join(root, "schema/agent-surface/source.v1.json"), "utf8"));

function run(script, argv, input = "") {
  const result = spawnSync(process.execPath, [script, ...argv], { cwd: root, encoding: "utf8", input, timeout: 60_000 });
  let json;
  try {
    json = JSON.parse(result.stdout.trim().split("\n")[0] ?? "");
  } catch {
    json = undefined;
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json };
}

function clean() {
  return execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() === "";
}

const scenarios = {
  async "cli-contract"(t) {
    if (!process.features.typescript) t.block("this Node does not run the CLI sources. Node 22.18 or later is required.");
    const out = mkdtempSync(join(tmpdir(), "svgif-agent-"));
    try {
      const cases = [
        ["validate accepts the valid fixture", ["validate", "--in", valid, "--json"], 0],
        ["validate refuses the invalid fixture", ["validate", "--in", join(fixtures, "project/v1-invalid.json"), "--json"], 1],
        ["migrate returns the document", ["migrate", "--in", valid, "--json"], 0],
        ["migrate refuses a newer schemaVersion", ["migrate", "--in", join(fixtures, "migrations/schema-too-new.json"), "--json"], 3],
        ["describe", ["describe", "--json"], 0],
        ["compile", ["compile", "--in", valid, "--backend", "smil", "--json"], 0],
        ["compile with no backend is a usage error", ["compile", "--in", valid, "--json"], 2],
        ["new", ["new", "--json"], 0],
        ["embed", ["embed", "--in", valid, "--mode", "inline", "--json"], 0],
        ["export svg", ["export", "--in", valid, "--format", "svg", "--out", join(out, "a.svg"), "--json"], 0],
        ["export webp without --browser needs a browser", ["export", "--in", valid, "--format", "webp", "--out", join(out, "a.webp"), "--json"], 4],
      ];
      for (const [name, argv, exit] of cases) {
        const result = run(cli, argv);
        const shaped = result.json !== undefined && result.json.ok === (exit === 0) && result.stdout.trim().split("\n").length === 1;
        t.check(`${name}: exit ${exit} and one JSON value on stdout`, result.status === exit && shaped, `exit ${result.status}`);
      }
      const described = run(cli, ["describe", "--json"]).json?.result;
      t.check("describe names the schema version this build implements", described?.implementedSchemaVersion === 1, JSON.stringify(described ?? null).slice(0, 120));
      t.check("the file export wrote is an SVG document", existsSync(join(out, "a.svg")) && readFileSync(join(out, "a.svg"), "utf8").includes("<svg xmlns="));
      t.check("the refused export wrote no file", !existsSync(join(out, "a.webp")));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  },

  async "mcp-tools"(t) {
    if (!process.features.typescript) t.block("this Node does not run the MCP sources. Node 22.18 or later is required.");
    const listed = run(mcp, [], '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
    const names = (listed.json?.result?.tools ?? []).map((tool) => tool.name);
    const expected = source.tools.map((tool) => tool.name);
    t.check("the stdio server lists the _v1 tools", listed.status === 0 && JSON.stringify(names) === JSON.stringify(expected), names.join(" "));
    t.check("every tool name ends in _v1", names.length > 0 && names.every((name) => /^svgif_[a-z]+_v1$/.test(name)));
    for (const host of ["0.0.0.0", "192.168.0.10", "example.com"]) {
      const refused = run(mcp, ["--http", "--host", host, "--port", "0"]);
      t.check(`--http --host ${host} is refused`, refused.status === 2 && refused.stderr.includes("was refused"), `exit ${refused.status}`);
    }
  },

  async "skill-install"(t) {
    const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", sha, "skills"], { cwd: root, encoding: "utf8" }).split("\n");
    for (const skill of source.skills) {
      t.check(`the archive of ${sha.slice(0, 12)} holds skills/${skill.name}/SKILL.md`, listed.includes(`skills/${skill.name}/SKILL.md`));
    }
    const result = spawnSync(process.execPath, [join(root, "scripts/ci/install-from-repo.mjs"), "--pin", sha], { cwd: root, encoding: "utf8", timeout: 120_000 });
    const line = result.stdout.split("\n").find((entry) => entry.startsWith("skills ")) ?? "";
    t.check("the install check lists the public skills", result.status === 0 && line === `skills ${source.skills.map((skill) => skill.name).join(" ")}`, line || result.stderr.slice(0, 200));
    const script = readFileSync(join(root, "scripts/ci/install-from-repo.mjs"), "utf8");
    t.check("the install check submits nothing to a registry", !/\b(publish|registry\.npmjs|skills publish|submit\()/.test(script.replace(/Does not submit anything to a registry\./, "")));
  },

  async "repo-install"(t) {
    const result = spawnSync(process.execPath, [join(root, "scripts/ci/install-from-repo.mjs"), "--pin", sha], { cwd: root, encoding: "utf8", timeout: 120_000 });
    t.check("the manifests resolve from the archive of this commit", result.status === 0 && /^repo install ok version /m.test(result.stdout), result.stderr.slice(0, 300));
    t.check("the validate and export round-trip ran from the archive", /^validate\+export round-trip ok$/m.test(result.stdout));
    const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", sha], { cwd: root, encoding: "utf8" }).split("\n");
    for (const path of [".claude-plugin/marketplace.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", "plugin.json", "mcp.json"]) {
      t.check(`${path} is in the archive`, listed.includes(path));
    }
  },

  async "cli-studio-parity"(t) {
    const bun = spawnSync("bun", ["--version"], { encoding: "utf8" });
    if (bun.status !== 0) t.block("bun is not on PATH. The parity test imports the Studio sources.");
    const result = spawnSync("bun", ["test", "test/parity.test.ts"], { cwd: join(root, "packages/svgif-cli"), encoding: "utf8", timeout: 120_000 });
    const output = `${result.stdout}\n${result.stderr}`;
    const pass = Number(/^\s*(\d+) pass$/m.exec(output)?.[1] ?? 0);
    const fail = Number(/^\s*(\d+) fail$/m.exec(output)?.[1] ?? -1);
    t.note("bun", bun.stdout.trim());
    t.check("the SVG and HTML parity tests pass", result.status === 0 && pass >= 3 && fail === 0, `${pass} pass, ${fail} fail`);
  },

  async "cdn-dry-run"(t) {
    t.block("only the release workflow in mode=check lists the exact-version keys. This runner does not dispatch it.");
  },

  async "readme-snippets"(t) {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const published = /npm i @modootoday\/svgif|npx @modootoday\/svgif-cli@X\.Y\.Z/.test(readme);
    if (published) t.block("README.md installs @modootoday/svgif from npm and names version X.Y.Z. No version is published, so those commands cannot run.");
    t.check("README.md has no command that needs a published package", true);
  },
};

if (!clean()) console.log("note: the working tree has uncommitted changes. The rows describe the tree, and --pin reads the commit.");
const rows = [];
for (const id of catalog.agentScenarios) {
  if (!only.includes(id)) continue;
  const row = await runRow(id, "agent", "repository", scenarios[id] ?? ((t) => t.block("no runner exists for this scenario")));
  row.commit = sha;
  rows.push(row);
  writeRow(outDir, row);
  console.log(`${row.status.padEnd(7)} ${id}@agent${row.reason ? ` :: ${row.reason}` : ""}`);
  for (const check of row.checks.filter((entry) => !entry.ok)) console.log(`          not true: ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}
const count = (status) => rows.filter((row) => row.status === status).length;
console.log(`agent: ${count("passed")} passed, ${count("failed")} failed, ${count("blocked")} blocked`);
process.exit(count("failed") > 0 ? 1 : 0);
