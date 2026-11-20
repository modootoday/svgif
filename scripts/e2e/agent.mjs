#!/usr/bin/env node
// Agent rows of the release-readiness matrix. Each row is one result with the browser field `agent`.
// A row that cannot run here is `blocked` with the reason. It is never written as `passed`.
//
//   node scripts/e2e/agent.mjs --out evidence [--sha <commit>] [--only <id,...>] [--cdn-base <origin>]
//   (`--cdn-base` or SVGIF_CDN_BASE: the CDN origin whose /svgif/<version>/ the readme-snippets row reads.)
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CDN, loadCatalog, parseArgs, parseSvgRoot, root, runRow, sha384Integrity, writeRow } from "./lib.mjs";

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
const cdnBase = String(typeof args["cdn-base"] === "string" ? args["cdn-base"] : (process.env.SVGIF_CDN_BASE ?? "")).replace(/\/$/, "");

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

/** The fenced code blocks of a Markdown file, with the language tag and the 1-based line of the fence. */
function readmeBlocks(text) {
  const blocks = [];
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const open = /^```(\S*)\s*$/.exec(lines[index]);
    if (!open) continue;
    const start = index;
    const body = [];
    for (index += 1; index < lines.length && !/^```\s*$/.test(lines[index]); index += 1) body.push(lines[index]);
    blocks.push({ lang: open[1], line: start + 1, body: body.join("\n") });
  }
  return blocks;
}

/** What a README block is, by its language and text. A block no runner knows is `unknown`, and the row fails. */
function readmeKind(block) {
  const text = block.body.trim();
  if (block.lang === "sh" && /^npm i(nstall)? /.test(text)) return "npm-install";
  if (block.lang === "sh" && /^npx skills add /.test(text)) return "skills";
  if (block.lang === "sh" && /^npx (-y )?@/.test(text)) return "npx";
  if (block.lang === "ts" && /from "@modootoday\//.test(text)) return "quick-start";
  if (block.lang === "json" && text.includes('"mcpServers"')) return "mcp";
  if (block.lang === "html" && /<script\b/.test(text)) return "cdn";
  return "unknown";
}

/** `@scope/name@1.2.3` or `name` to `{ name, range }`. */
function packageSpec(spec) {
  const at = spec.lastIndexOf("@");
  return at > 0 ? { name: spec.slice(0, at), range: spec.slice(at + 1) } : { name: spec, range: undefined };
}

/** The bin npx would run for an installed package: the only bin, or the one named like the package. */
function installedBin(project, name) {
  const dir = join(project, "node_modules", name);
  const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const bins = typeof manifest.bin === "string" ? { [name.split("/").pop()]: manifest.bin } : (manifest.bin ?? {});
  const names = Object.keys(bins);
  const bin = names.length === 1 ? names[0] : names.find((entry) => entry === name.split("/").pop());
  return bin === undefined ? undefined : { bin, file: join(dir, bins[bin]), linked: existsSync(join(project, "node_modules/.bin", bin)) };
}

const VERSION_PLACEHOLDER = /X\.Y\.Z|<version>/g;

function cdnScript(block) {
  const attr = (name) => new RegExp(`\\s${name}="([^"]*)"`).exec(block.body)?.[1];
  return { src: attr("src"), integrity: attr("integrity"), crossorigin: attr("crossorigin") };
}

/**
 * Steps 1 to 6 of `readme-snippets`: build, pack, install offline, then every README block and install line
 * except the CDN fetch. Returns true when every check it recorded is true.
 */
function readmeSteps(t, readme, blocks, work) {
  let all = true;
  const check = (name, ok, detail) => {
    all = t.check(name, ok, detail) && all;
    return ok === true;
  };
  const kinds = blocks.map((block) => ({ ...block, kind: readmeKind(block) }));
  for (const block of kinds.filter((entry) => entry.kind === "unknown")) {
    check(`README.md line ${block.line}: the ${block.lang || "untagged"} block has a runner in this row`, false, block.body.slice(0, 120));
  }
  for (const kind of ["npm-install", "quick-start", "npx", "skills", "mcp", "cdn"]) {
    check(`README.md has the ${kind} block`, kinds.some((entry) => entry.kind === kind));
  }
  t.note("readmeBlocks", kinds.map((block) => `${block.line}:${block.lang}:${block.kind}`));

  // 1. Build, pack, and install the four packages with no registry.
  const built = spawnSync(process.execPath, [join(root, "scripts/ci/build-packages.mjs")], { cwd: root, encoding: "utf8", timeout: 180_000 });
  if (!check("build-packages wrote every dist", built.status === 0, `${built.stderr ?? ""}`.slice(-300))) return false;
  const packages = readdirSync(join(root, "packages"))
    .filter((dir) => existsSync(join(root, "packages", dir, "package.json")))
    .map((dir) => ({ dir, ...JSON.parse(readFileSync(join(root, "packages", dir, "package.json"), "utf8")) }))
    .filter((pkg) => pkg.private !== true);
  const versions = new Map(packages.map((pkg) => [pkg.name, pkg.version]));
  const version = versions.get("@modootoday/svgif");
  check("the four packages share one version", packages.length === 4 && new Set(versions.values()).size === 1, JSON.stringify(Object.fromEntries(versions)));
  t.note("packageVersion", version);
  const packs = join(work, "packs");
  const project = join(work, "project");
  const tarballs = [];
  mkdirSync(packs, { recursive: true });
  mkdirSync(project, { recursive: true });
  for (const pkg of packages) {
    const packed = spawnSync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", packs, join(root, "packages", pkg.dir)], { cwd: root, encoding: "utf8", timeout: 120_000 });
    let file;
    try {
      file = JSON.parse(packed.stdout)[0]?.filename;
    } catch {
      file = undefined;
    }
    if (!check(`npm pack ${pkg.name}`, packed.status === 0 && typeof file === "string", `${packed.stderr ?? ""}`.slice(-300))) return false;
    tarballs.push(join(packs, file));
  }
  writeFileSync(join(project, "package.json"), `${JSON.stringify({ name: "readme-snippets", private: true, type: "module" }, null, 2)}\n`);
  const installed = spawnSync("npm", ["install", "--offline", "--no-audit", "--no-fund", "--ignore-scripts", "--no-package-lock", ...tarballs], { cwd: project, encoding: "utf8", timeout: 180_000 });
  if (!check("npm install --offline installs the four tarballs together", installed.status === 0, `${installed.stderr ?? ""}`.slice(-300))) return false;
  const installedVersion = (name) => {
    const path = join(project, "node_modules", name, "package.json");
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")).version : undefined;
  };

  // 2. `npm i <package>`: the tarball of this commit satisfies it.
  for (const block of kinds.filter((entry) => entry.kind === "npm-install")) {
    for (const line of block.body.trim().split("\n")) {
      const specs = line.trim().split(/\s+/).slice(2).filter((word) => !word.startsWith("-"));
      check(`README.md line ${block.line}: \`${line.trim()}\` names a package`, specs.length > 0);
      for (const spec of specs) {
        const { name } = packageSpec(spec);
        const got = installedVersion(name);
        check(`\`${line.trim()}\`: ${name} is installed from this commit's tarball at ${versions.get(name)}`, versions.has(name) && got === versions.get(name), got);
      }
    }
  }

  // 3. The TypeScript quick start runs as written, with a probe appended after it.
  for (const block of kinds.filter((entry) => entry.kind === "quick-start")) {
    const probe = [
      "",
      "// readme-snippets probe, appended after the README text.",
      "{",
      '  const probeSvg = typeof svg === "string" ? svg : "";',
      '  const probeFile = typeof file === "object" && file !== null ? file : {};',
      '  const probeFileSvg = typeof probeFile.svg === "string" ? probeFile.svg : "";',
      '  console.log("README-PROBE " + JSON.stringify({ svgType: typeof svg, svg: probeSvg.slice(0, 2000), fileSvgLength: probeFileSvg.length, fileSvg: probeFileSvg.slice(0, 2000) }));',
      "}",
      "",
    ].join("\n");
    const script = join(project, `readme-line-${block.line}.ts`);
    writeFileSync(script, `${block.body}\n${probe}`);
    const ran = spawnSync(process.execPath, [script], { cwd: project, encoding: "utf8", timeout: 60_000 });
    check(`README.md line ${block.line}: the quick start exits 0 with node`, ran.status === 0, `exit ${ran.status} ${`${ran.stderr ?? ""}`.slice(0, 300)}`);
    const line = `${ran.stdout ?? ""}`.split("\n").find((entry) => entry.startsWith("README-PROBE ")) ?? "";
    let result;
    try {
      result = JSON.parse(line.slice("README-PROBE ".length));
    } catch {
      result = undefined;
    }
    const svgRoot = parseSvgRoot(result?.svg ?? "");
    const fileRoot = parseSvgRoot(result?.fileSvg ?? "");
    check("the quick start's `svg` is an SVG document", result?.svgType === "string" && svgRoot.ok && svgRoot.xmlns === "http://www.w3.org/2000/svg", (result?.svg ?? "").slice(0, 120));
    check("the quick start's `file.svg` is a non-empty SVG document", (result?.fileSvgLength ?? 0) > 0 && fileRoot.ok, `${result?.fileSvgLength ?? "no probe"} chars`);
  }

  // 4. `npx <package>@X.Y.Z`: the installed bin answers `describe` with no network.
  for (const block of kinds.filter((entry) => entry.kind === "npx")) {
    const words = block.body.trim().split(/\s+/).slice(1).filter((word) => !word.startsWith("-"));
    const { name, range } = packageSpec(words[0] ?? "");
    check(`README.md line ${block.line}: ${name}@${range} is this commit's package at ${versions.get(name)}`, versions.has(name) && range?.replace(VERSION_PLACEHOLDER, versions.get(name)) === versions.get(name) && installedVersion(name) === versions.get(name), range);
    const bin = versions.has(name) ? installedBin(project, name) : undefined;
    check(`${name} links a bin that npx runs`, bin?.linked === true, bin?.bin);
    if (!bin) continue;
    const ran = spawnSync(process.execPath, [bin.file, ...words.slice(1), "describe", "--json"], { cwd: project, encoding: "utf8", timeout: 60_000 });
    let json;
    try {
      json = JSON.parse(`${ran.stdout ?? ""}`.trim());
    } catch {
      json = undefined;
    }
    check(`\`${bin.bin} describe --json\` from the tarball exits 0 with ok true`, ran.status === 0 && json?.ok === true && json?.result?.implementedSchemaVersion === 1, `exit ${ran.status} ${`${ran.stdout ?? ""}`.slice(0, 160)}`);
  }

  // 5. The MCP config: the installed server answers `initialize`.
  for (const block of kinds.filter((entry) => entry.kind === "mcp")) {
    let config;
    try {
      config = JSON.parse(block.body);
    } catch {
      config = undefined;
    }
    const servers = Object.entries(config?.mcpServers ?? {});
    check(`README.md line ${block.line}: the MCP config parses and names a server`, servers.length > 0);
    for (const [server, entry] of servers) {
      const words = (entry.args ?? []).filter((word) => !String(word).startsWith("-"));
      const { name, range } = packageSpec(String(words[0] ?? ""));
      check(`mcpServers.${server}: ${entry.command} ${name}@${range} is this commit's package`, entry.command === "npx" && versions.has(name) && range?.replace(VERSION_PLACEHOLDER, versions.get(name)) === versions.get(name) && installedVersion(name) === versions.get(name), range);
      const bin = versions.has(name) ? installedBin(project, name) : undefined;
      check(`${name} links a bin that npx runs`, bin?.linked === true, bin?.bin);
      if (!bin) continue;
      const request = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "readme-snippets", version: "1" } } };
      const ran = spawnSync(process.execPath, [bin.file, ...words.slice(1)], { cwd: project, encoding: "utf8", input: `${JSON.stringify(request)}\n`, timeout: 60_000 });
      let reply;
      try {
        reply = JSON.parse(`${ran.stdout ?? ""}`.trim().split("\n")[0]);
      } catch {
        reply = undefined;
      }
      check(`mcpServers.${server}: initialize returns a protocol version and server info`, ran.status === 0 && reply?.id === 1 && typeof reply?.result?.protocolVersion === "string" && typeof reply?.result?.serverInfo?.name === "string" && reply?.result?.serverInfo?.version === versions.get(name), `${`${ran.stdout ?? ""}`.slice(0, 200)}`);
    }
  }

  // 6. `npx skills add` and the plugin lines resolve repository refs. The tag does not exist before the
  // release, so the archive of this commit stands in for it.
  const slug = /github\.com\/([^/]+\/[^/.]+)/.exec(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).repository?.url ?? "")?.[1];
  const refs = [];
  const skills = kinds.filter((entry) => entry.kind === "skills").map((block) => ({ line: block.line, text: block.body.trim() }));
  const inline = [];
  for (const [index, line] of readme.split("\n").entries()) {
    const match = /^(Claude Code|Codex|Cursor): (.*)$/.exec(line);
    if (match) inline.push({ line: index + 1, client: match[1], text: match[2] });
  }
  for (const client of ["Claude Code", "Codex", "Cursor"]) check(`README.md has the ${client} install line`, inline.some((entry) => entry.client === client));
  for (const entry of [...skills, ...inline.filter((item) => item.client !== "Cursor").map((item) => ({ line: item.line, text: /`([^`]+)`/.exec(item.text)?.[1] ?? "" }))]) {
    const words = entry.text.split(/\s+/);
    const at = words.indexOf("add");
    const repo = at >= 0 ? words[at + 1] : undefined;
    const ref = words.includes("--ref") ? words[words.indexOf("--ref") + 1] : undefined;
    check(`README.md line ${entry.line}: \`${entry.text}\` installs from ${slug}`, typeof slug === "string" && repo === slug, repo);
    if (ref !== undefined) {
      check(`README.md line ${entry.line}: the ref is the release tag v${version}`, ref.replace(VERSION_PLACEHOLDER, version) === `v${version}`, ref);
      refs.push(ref);
    }
  }
  const listed = execFileSync("git", ["ls-tree", "-r", "--name-only", sha], { cwd: root, encoding: "utf8" }).split("\n");
  for (const path of [".claude-plugin/marketplace.json", ".claude-plugin/plugin.json", ".codex-plugin/plugin.json", ".cursor-plugin/plugin.json", ...source.skills.map((skill) => `skills/${skill.name}/SKILL.md`)]) {
    check(`${path} is in the archive of ${sha.slice(0, 12)}`, listed.includes(path));
  }
  const pinned = spawnSync(process.execPath, [join(root, "scripts/ci/install-from-repo.mjs"), "--pin", sha], { cwd: root, encoding: "utf8", timeout: 120_000 });
  const skillLine = `${pinned.stdout ?? ""}`.split("\n").find((entry) => entry.startsWith("skills ")) ?? "";
  check("install-from-repo --pin accepts the skills and plugin manifests of this commit", pinned.status === 0 && /^repo install ok version /m.test(pinned.stdout ?? ""), `${pinned.stderr ?? ""}`.slice(0, 300));
  check("install-from-repo --pin lists the public skills", skillLine === `skills ${source.skills.map((skill) => skill.name).join(" ")}`, skillLine);
  t.note("refs", `${[...new Set(refs)].join(" ")} resolve to the tag v${version}, which does not exist before the release. The archive of ${sha} stands in for it.`);

  // 7, static part. The CDN <script> names the exact-version URL with SRI.
  for (const block of kinds.filter((entry) => entry.kind === "cdn")) {
    const tag = cdnScript(block);
    check(`README.md line ${block.line}: the <script> src is an exact-version URL on ${CDN}`, typeof tag.src === "string" && tag.src.startsWith(`${CDN}/svgif/<version>/`) && tag.src.endsWith(".js"), tag.src);
    check(`README.md line ${block.line}: the <script> carries sha384 integrity and crossorigin anonymous`, tag.integrity?.startsWith("sha384-") === true && tag.crossorigin === "anonymous", `${tag.integrity} ${tag.crossorigin}`);
    const local = join(root, "packages/svgif", tag.src ? `dist/${tag.src.split("/").pop()}` : "dist/svgif.js");
    check(`the build wrote ${local.slice(root.length + 1)}`, existsSync(local));
  }
  return all;
}

/** Step 7: the exact-version object on the CDN is this commit's build. */
async function readmeCdn(t, blocks) {
  const version = JSON.parse(readFileSync(join(root, "packages/svgif/package.json"), "utf8")).version;
  for (const block of blocks.filter((entry) => readmeKind(entry) === "cdn")) {
    const tag = cdnScript(block);
    const url = `${cdnBase}${tag.src.slice(CDN.length).replace(VERSION_PLACEHOLDER, version)}`;
    const name = url.split("/").pop();
    const indexUrl = `${url.slice(0, url.lastIndexOf("/"))}/integrity.json`;
    t.note("cdnUrl", url);
    const response = await fetch(url, { redirect: "error" });
    const bytes = Buffer.from(await response.arrayBuffer());
    t.check(`GET ${url} is 200`, response.status === 200, response.status);
    t.check("the object is served as JavaScript", /javascript/.test(response.headers.get("content-type") ?? ""), response.headers.get("content-type"));
    const index = await fetch(indexUrl, { redirect: "error" });
    let listed;
    try {
      listed = (await index.json())?.files?.[name];
    } catch {
      listed = undefined;
    }
    const served = sha384Integrity(bytes);
    const local = sha384Integrity(readFileSync(join(root, "packages/svgif/dist", name)));
    t.check(`integrity.json lists ${name} with the sha384 of the served bytes`, index.status === 200 && listed === served, `${listed} ${served}`);
    t.check(`the served ${name} is this commit's build`, served === local, `${served} ${local}`);
  }
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

  // release.yml in mode=check lists the exact-version keys and, when the prefix is absent, keeps that as the
  // artifact cdn-dry-run. This row reads it for this commit. It never dispatches the release workflow.
  async "cdn-dry-run"(t) {
    const repo = process.env.GITHUB_REPOSITORY;
    if (!process.env.GH_TOKEN || !repo) {
      t.block("no GitHub token here. In e2e.yml this row reads the cdn-dry-run artifact of a release.yml mode=check run for this commit.");
    }
    const gh = (argv) => spawnSync("gh", [...argv, "--repo", repo], { cwd: root, encoding: "utf8", timeout: 120_000 });
    const listed = gh(["run", "list", "--workflow", "release.yml", "--commit", sha, "--event", "workflow_dispatch", "--status", "success", "--json", "databaseId", "--jq", ".[].databaseId"]);
    if (listed.status !== 0) t.block(`the release runs for this commit could not be listed: ${(listed.stderr || "").trim().slice(0, 200)}`);
    let evidence;
    for (const id of listed.stdout.split(/\s+/).filter(Boolean)) {
      const dir = mkdtempSync(join(tmpdir(), "svgif-dry-run-"));
      try {
        const got = gh(["run", "download", id, "-n", "cdn-dry-run", "-D", dir]);
        const file = join(dir, "cdn-dry-run.json");
        if (got.status === 0 && existsSync(file)) {
          evidence = JSON.parse(readFileSync(file, "utf8"));
          t.note("releaseRun", id);
          break;
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (!evidence) {
      t.block("no successful release.yml run for this commit has the cdn-dry-run artifact. Dispatch release.yml with mode=check on this commit first, with the cdn-release token.");
    }
    const prefix = `svgif/${evidence.version}/`;
    const keys = Array.isArray(evidence.keys) ? evidence.keys : [];
    t.check("the evidence comes from mode=check", evidence.mode === "check", evidence.mode);
    t.check("the evidence is for this commit", evidence.commit === sha, evidence.commit);
    t.check("the version is x.y.z", /^\d+\.\d+\.\d+$/.test(String(evidence.version)), evidence.version);
    t.check("the exact-version prefix was absent", evidence.prefixAbsent === true && evidence.prefix === prefix, `${evidence.prefix} ${evidence.prefixAbsent}`);
    t.check("the plan lists exact-version keys under that prefix", keys.some((key) => key.startsWith(prefix)), keys.length);
    t.check("every planned key is under svgif/", keys.length > 0 && keys.every((key) => typeof key === "string" && key.startsWith("svgif/")));
  },

  // Every fenced block and install line of README.md, run against `npm pack` tarballs of this commit in
  // place of the registry. Nothing is fetched from npm. [[adr:svgif/20261119231420]] The CDN `<script>` needs
  // the version on the CDN, so without a CDN base the row is blocked, but only after every other check is true.
  async "readme-snippets"(t) {
    if (!process.features.typescript) t.block("this Node does not run the TypeScript quick start. Node 22.18 or later is required.");
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const blocks = readmeBlocks(readme);
    const work = mkdtempSync(join(tmpdir(), "svgif-readme-"));
    try {
      const ok = readmeSteps(t, readme, blocks, work);
      if (!ok) return;
      if (!cdnBase) {
        t.block("the CDN <script> line needs the version on the CDN. mode=stage uploads it. Pass --cdn-base or set SVGIF_CDN_BASE after that. Every other README check is true.");
      }
      await readmeCdn(t, blocks);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
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
