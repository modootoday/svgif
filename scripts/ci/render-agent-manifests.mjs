#!/usr/bin/env node
// Render public agent manifests from schema/agent-surface. One metadata source.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function loadSource(base = root) {
  const source = JSON.parse(readFileSync(join(base, "schema/agent-surface/source.v1.json"), "utf8"));
  const version = readFileSync(join(base, "schema/agent-surface/version.txt"), "utf8").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error("version.txt must be plain semver");
  return { source, version };
}

function skillMarkdown(skill, body) {
  const front = [
    "---",
    `name: ${skill.name}`,
    `description: ${JSON.stringify(skill.description)}`,
    "---",
    "",
  ].join("\n");
  return front + body.trim() + "\n";
}

export function render(base = root) {
  const { source, version } = loadSource(base);
  const pkg = `${source.mcpPackage}@${version}`;
  const mcpConfig = {
    command: "npx",
    args: ["-y", pkg],
  };
  const files = new Map();
  files.set(
    "mcp.json",
    JSON.stringify({ mcpServers: { [source.mcpServerName]: mcpConfig } }, null, 2) + "\n",
  );
  files.set(
    ".claude-plugin/plugin.json",
    JSON.stringify(
      {
        name: source.pluginName,
        version,
        description: source.description,
        author: { name: source.ownerName, url: source.repositoryUrl },
        skills: "./skills/",
        mcpServers: { [source.mcpServerName]: mcpConfig },
      },
      null,
      2,
    ) + "\n",
  );
  files.set(
    ".claude-plugin/marketplace.json",
    JSON.stringify(
      {
        name: source.marketplaceName,
        description: source.description,
        version,
        owner: { name: source.ownerName },
        plugins: [{ name: source.pluginName, source: "./", description: source.description }],
      },
      null,
      2,
    ) + "\n",
  );
  files.set(
    "plugin.json",
    JSON.stringify(
      {
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: source.pluginName,
        version,
        description: source.description,
      },
      null,
      2,
    ) + "\n",
  );
  files.set(
    ".codex-plugin/plugin.json",
    JSON.stringify(
      {
        name: source.pluginName,
        version,
        description: source.description,
        skills: "./skills/",
        mcpServers: "./mcp.json",
      },
      null,
      2,
    ) + "\n",
  );
  files.set(
    ".cursor-plugin/plugin.json",
    JSON.stringify(
      {
        name: source.pluginName,
        version,
        description: source.description,
        author: { name: source.ownerName },
        license: source.license,
        repository: source.repositoryUrl,
        skills: "./skills/",
        mcpServers: "./mcp.json",
      },
      null,
      2,
    ) + "\n",
  );
  const encoded = Buffer.from(JSON.stringify(mcpConfig)).toString("base64");
  const query = `name=${encodeURIComponent(source.mcpServerName)}&config=${encodeURIComponent(encoded)}`;
  files.set(
    "distribution/cursor-install.txt",
    [
      `https://cursor.com/install-mcp?${query}`,
      `cursor://anysphere.cursor-deeplink/mcp/install?${query}`,
      "",
    ].join("\n"),
  );
  const skillsList = source.skills.map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");
  files.set(
    "docs/llms.txt",
    [
      "# svgif.js",
      "",
      `> ${source.description}`,
      "",
      "Studio for people: https://thumly.io/studio/",
      "Docs home: https://thumly.io/docs/",
      `Skills from this repository: npx skills add ${source.repository}`,
      `Claude Code: /plugin marketplace add ${source.repository}`,
      `Codex: codex plugin marketplace add ${source.repository}`,
      "Cursor: distribution/cursor-install.txt in this repository, or the Cursor plugin manifest at .cursor-plugin/plugin.json",
      `CLI: npx ${source.cliPackage}@${version}`,
      `MCP: npx -y ${source.mcpPackage}@${version}`,
      "Install a v* tag created by the release workflow. A branch tip is not a release.",
      "",
      skillsList,
      "",
    ].join("\n"),
  );
  for (const skill of source.skills) {
    const body = readFileSync(join(base, "schema/agent-surface/bodies", `${skill.name}.md`), "utf8");
    files.set(`skills/${skill.name}/SKILL.md`, skillMarkdown(skill, body));
  }
  return files;
}

function assertSource(source) {
  const errors = [];
  if (source.repository !== "modootoday/svgif") errors.push("repository");
  const names = source.skills.map((skill) => skill.name);
  if (new Set(names).size !== names.length) errors.push("duplicate skill");
  for (const skill of source.skills) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill.name)) errors.push(`skill name ${skill.name}`);
    if (skill.description.length < 1 || skill.description.length > 1024) errors.push(`description ${skill.name}`);
  }
  const commands = new Set(source.commands);
  for (const tool of source.tools) {
    if (!commands.has(tool.command)) errors.push(`tool ${tool.name} command`);
    if (!/^svgif_[a-z]+_v1$/.test(tool.name)) errors.push(`tool name ${tool.name}`);
  }
  return errors;
}

export function checkRendered(base = root) {
  const { source } = loadSource(base);
  const errors = assertSource(source);
  const files = render(base);
  for (const [path, text] of files) {
    if (/@[a-z0-9.-]+\.[a-z]{2,}/i.test(text) && text.includes("@")) {
      if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) errors.push(`email in ${path}`);
    }
    const full = join(base, path);
    let current;
    try {
      current = readFileSync(full, "utf8");
    } catch {
      errors.push(`missing ${path}`);
      continue;
    }
    if (current !== text) errors.push(`drift ${path}`);
  }
  return errors;
}

function writeAll() {
  const files = render();
  for (const [path, text] of files) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

function selfTest() {
  const files = render();
  const market = JSON.parse(files.get(".claude-plugin/marketplace.json"));
  if (market.plugins[0].source !== "./") throw new Error("marketplace source");
  if (market.owner.email) throw new Error("owner email");
  const skill = files.get("skills/svgif-validate/SKILL.md");
  if (!skill.startsWith("---\nname: svgif-validate\n")) throw new Error("skill frontmatter");
  const llms = files.get("docs/llms.txt");
  if (!llms.includes("npx skills add modootoday/svgif")) throw new Error("llms");
  if (!llms.includes("Studio for people: https://thumly.io/studio/")) throw new Error("llms studio url");
  if (llms.includes("/svgif/studio/")) throw new Error("llms studio url");
  if (!llms.includes("Docs home: https://thumly.io/docs/")) throw new Error("llms docs url");
  console.log("agent manifest self-test ok");
}

const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  selfTest();
} else if (args.includes("--write")) {
  writeAll();
} else {
  const errors = checkRendered();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log("agent manifests match the source");
}
