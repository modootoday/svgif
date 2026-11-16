/**
 * MCP adapter contract.
 * Each tool returns the object the CLI library returns for the same input.
 * `isError` follows `ok`. The HTTP listener refuses a non-loopback address.
 * [[sot:svgif/agent-surface]]
 */

import { afterAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMMANDS, PROJECT_SCHEMAS, IMPLEMENTED_SCHEMA_REVISION, SCHEMA_BUNDLE, execute } from "../../svgif-cli/src/index.ts";
import { validate } from "../../../schema/validate.mjs";
import {
  DOCS_URL,
  PROTOCOL_VERSION,
  RESOURCES,
  TOOLS,
  assertLoopback,
  callTool,
  handleLine,
  handleMessage,
  isLoopback,
  originAllowed,
  readResource,
} from "../src/index.ts";
import { listen } from "../src/http.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, "../../../schema/fixtures");
const valid = JSON.parse(readFileSync(join(fixtures, "project/v1-valid.json"), "utf8")) as unknown;
const invalid = JSON.parse(readFileSync(join(fixtures, "project/v1-invalid.json"), "utf8")) as unknown;

function sink(): { writeFile(path: string, bytes: Uint8Array): void; written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>();
  return { written, writeFile: (path, bytes) => void written.set(path, bytes) };
}

async function rpc(method: string, params?: unknown, files = sink()): Promise<Record<string, unknown>> {
  const response = await handleMessage({ jsonrpc: "2.0", id: 1, method, params }, files);
  return response as unknown as Record<string, unknown>;
}

describe("tool list", () => {
  test("one tool per CLI command, named with the schema generation", () => {
    expect(TOOLS.map((tool) => tool.name)).toEqual(COMMANDS.map((command) => `svgif_${command}_v1`));
  });

  test("a tool that takes a project refers to the project schema by $id and carries it", () => {
    for (const tool of TOOLS) {
      const schema = tool.inputSchema as { properties: Record<string, { anyOf?: { $ref: string }[] }>; $defs?: Record<string, unknown> };
      const project = schema.properties.project;
      if (!project) continue;
      const refs = project.anyOf!.map((entry) => entry.$ref);
      expect(refs).toEqual(Object.values(PROJECT_SCHEMAS).map((entry) => String(entry.$id)));
      for (const ref of refs) expect(schema.$defs![ref]).toBeDefined();
    }
  });

  test("describe and new take no arguments", () => {
    for (const name of ["svgif_describe_v1", "svgif_new_v1"]) {
      const tool = TOOLS.find((entry) => entry.name === name)!;
      expect(tool.inputSchema.required).toEqual([]);
      expect(tool.inputSchema.properties).toEqual({});
    }
  });
});

describe("tools return what the CLI library returns", () => {
  const cases: [string, Record<string, unknown>, string, Record<string, unknown>][] = [
    ["svgif_validate_v1", { project: valid }, "validate", {}],
    ["svgif_validate_v1", { project: invalid }, "validate", {}],
    ["svgif_migrate_v1", { project: valid }, "migrate", {}],
    ["svgif_describe_v1", {}, "describe", {}],
    ["svgif_new_v1", {}, "new", {}],
    ["svgif_compile_v1", { project: valid, backend: "smil" }, "compile", { backend: "smil" }],
    ["svgif_compile_v1", { project: valid, backend: "nope" }, "compile", { backend: "nope" }],
    ["svgif_embed_v1", { project: valid, mode: "cdn" }, "embed", { mode: "cdn" }],
    ["svgif_export_v1", { project: valid, format: "svg", out: "a.svg" }, "export", { format: "svg", out: "a.svg" }],
    ["svgif_export_v1", { project: valid, format: "gif", out: "a.gif" }, "export", { format: "gif", out: "a.gif" }],
    [
      "svgif_export_v1",
      { project: valid, format: "gif", out: "a.gif", browser: true },
      "export",
      { format: "gif", out: "a.gif", browser: true },
    ],
  ];
  for (const [tool, args, command, flags] of cases) {
    test(`${tool} ${JSON.stringify(flags)} ${args.project === invalid ? "invalid" : ""}`, async () => {
      const viaTool = await callTool(tool, args, sink());
      const viaCli = await execute(command, args.project, flags, sink());
      expect(viaTool).toEqual(viaCli);
    });
  }

  test("the export tool writes the same bytes as the CLI library", async () => {
    const a = sink();
    const b = sink();
    await callTool("svgif_export_v1", { project: valid, format: "html", out: "x.html" }, a);
    await execute("export", valid, { format: "html", out: "x.html" }, b);
    expect(a.written.get("x.html")).toEqual(b.written.get("x.html")!);
    expect(a.written.get("x.html")!.length).toBeGreaterThan(0);
  });

  test("a new project validates", async () => {
    const result = (await callTool("svgif_new_v1", undefined)) as { ok: true; result: unknown };
    expect(result.ok).toBe(true);
    const checked = await callTool("svgif_validate_v1", { project: result.result });
    expect(checked!.ok).toBe(true);
  });

  test("an unknown tool name is not a tool", async () => {
    expect(await callTool("svgif_validate_v2", { project: valid })).toBeUndefined();
    expect(await callTool("svgif_delete_v1", {})).toBeUndefined();
    expect(await callTool("validate", {})).toBeUndefined();
  });

  test("arguments that are not an object are treated as empty", async () => {
    expect(await callTool("svgif_validate_v1", [valid])).toEqual(await execute("validate", undefined, {}));
  });
});

describe("JSON-RPC", () => {
  test("initialize names the protocol version and both capabilities", async () => {
    const response = await rpc("initialize", {});
    const result = response.result as { protocolVersion: string; capabilities: Record<string, unknown>; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(Object.keys(result.capabilities).sort()).toEqual(["resources", "tools"]);
    expect(result.serverInfo.name).toBe("svgif-mcp");
  });

  test("ping answers", async () => {
    expect((await rpc("ping")).result).toEqual({});
  });

  test("tools/list returns every tool", async () => {
    expect(((await rpc("tools/list")).result as { tools: unknown[] }).tools).toHaveLength(COMMANDS.length);
  });

  test("tools/call sets isError to the opposite of ok", async () => {
    const good = (await rpc("tools/call", { name: "svgif_validate_v1", arguments: { project: valid } })).result as {
      isError: boolean;
      structuredContent: { ok: boolean };
      content: { type: string; text: string }[];
    };
    expect(good.isError).toBe(false);
    expect(good.structuredContent.ok).toBe(true);
    expect(JSON.parse(good.content[0]!.text)).toEqual(good.structuredContent);
    const bad = (await rpc("tools/call", { name: "svgif_validate_v1", arguments: { project: invalid } })).result as {
      isError: boolean;
      structuredContent: { ok: boolean; error: { code: string } };
    };
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.ok).toBe(false);
    expect(bad.structuredContent.error.code).toBe("validation");
  });

  test("tools/call refuses a missing or unknown name", async () => {
    expect(((await rpc("tools/call", {})).error as { code: number }).code).toBe(-32602);
    expect(((await rpc("tools/call", { name: "nope" })).error as { code: number }).code).toBe(-32602);
    expect(((await rpc("tools/call", [1])).error as { code: number }).code).toBe(-32602);
  });

  test("resources/list and resources/read", async () => {
    expect(((await rpc("resources/list")).result as { resources: unknown[] }).resources).toEqual([...RESOURCES]);
    const schema = (await rpc("resources/read", { uri: "svgif://schema/project/v1" })).result as { contents: { text: string }[] };
    expect(JSON.parse(schema.contents[0]!.text)).toEqual(PROJECT_SCHEMAS[IMPLEMENTED_SCHEMA_REVISION]);
    expect(readResource("svgif://docs")!.text).toBe(`${DOCS_URL}\n`);
    expect(((await rpc("resources/read", { uri: "svgif://nope" })).error as { code: number }).code).toBe(-32002);
    expect(((await rpc("resources/read", {})).error as { code: number }).code).toBe(-32002);
  });

  test("the served project schema accepts a new project and rejects the invalid fixture", async () => {
    const served = JSON.parse(readResource("svgif://schema/project/v1")!.text) as Record<string, unknown>;
    const byId = new Map(SCHEMA_BUNDLE.map((file) => [String(file.$id), file]));
    const fresh = ((await callTool("svgif_new_v1", {})) as { result: Record<string, unknown> }).result;
    const atRevision = { ...fresh, schemaRevision: IMPLEMENTED_SCHEMA_REVISION };
    expect(validate(served, atRevision, served, byId, "project")).toEqual([]);
    expect((await callTool("svgif_validate_v1", { project: atRevision }))!.ok).toBe(true);
    expect(validate(served, invalid, served, byId, "project").length).toBeGreaterThan(0);
  });

  test("an unknown method, a notification, and a malformed message", async () => {
    expect(((await rpc("nope")).error as { code: number }).code).toBe(-32601);
    expect(await handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();
    for (const message of [null, [], 3, { jsonrpc: "1.0", id: 1, method: "ping" }, { jsonrpc: "2.0", id: 1 }]) {
      const response = await handleMessage(message);
      expect(response!.error!.code).toBe(-32600);
    }
  });

  test("a line of stdio", async () => {
    expect(await handleLine("   ")).toBeUndefined();
    expect(JSON.parse((await handleLine("{nope"))!).error.code).toBe(-32700);
    expect(await handleLine('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toBeUndefined();
    expect(JSON.parse((await handleLine('{"jsonrpc":"2.0","id":"a","method":"ping"}'))!)).toEqual({ jsonrpc: "2.0", id: "a", result: {} });
  });
});

describe("loopback", () => {
  test("literal loopback addresses pass", () => {
    for (const host of ["127.0.0.1", "127.255.0.9", "::1"]) expect(isLoopback(host)).toBe(true);
  });

  test("everything else is refused, including names", () => {
    for (const host of ["0.0.0.0", "::", "192.168.0.2", "10.0.0.1", "localhost", "example.com", "127.0.0.1.example.com", "127.0.0.256", ""]) {
      expect(isLoopback(host)).toBe(false);
      expect(() => assertLoopback(host)).toThrow("loopback");
    }
  });

  test("listen refuses 0.0.0.0 before a socket is opened", () => {
    expect(() => listen("0.0.0.0", 0)).toThrow("0.0.0.0 was refused");
  });

  test("origin check", () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("")).toBe(true);
    expect(originAllowed("http://127.0.0.1:8123")).toBe(true);
    expect(originAllowed("http://localhost:3000")).toBe(true);
    expect(originAllowed("http://[::1]:3000")).toBe(true);
    expect(originAllowed("https://example.com")).toBe(false);
    expect(originAllowed("not a url")).toBe(false);
  });
});

describe("http listener", () => {
  let server: Server | undefined;
  afterAll(() => void server?.close());

  async function post(path: string, body: string, headers: Record<string, string> = {}, method = "POST"): Promise<Response> {
    server ??= await listen("127.0.0.1", 0, sink());
    const { port, address } = server.address() as AddressInfo;
    expect(address).toBe("127.0.0.1");
    return fetch(`http://127.0.0.1:${port}${path}`, { method, body: method === "POST" ? body : undefined, headers });
  }

  test("answers a request on /mcp", async () => {
    const response = await post("/mcp", JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { id: number; result: { tools: unknown[] } };
    expect(body.id).toBe(7);
    expect(body.result.tools).toHaveLength(COMMANDS.length);
  });

  test("status codes", async () => {
    expect((await post("/mcp", JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }))).status).toBe(202);
    expect((await post("/mcp", "{nope")).status).toBe(400);
    expect((await post("/other", "{}")).status).toBe(404);
    expect((await post("/mcp", "", {}, "GET")).status).toBe(405);
    expect((await post("/mcp", "{}", { origin: "https://example.com" })).status).toBe(403);
  });
});

describe("bin", () => {
  function runBin(args: string[], input: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((done) => {
      const child = spawn(process.execPath, [join(here, "../src/bin.ts"), ...args]);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      child.on("close", (code) => done({ code, stdout, stderr }));
      child.stdin.end(input);
    });
  }

  test("stdio: one response line per request, nothing for a notification", async () => {
    const input = [
      JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "svgif_describe_v1" } }),
    ].join("\n");
    const { code, stdout } = await runBin([], `${input}\n`);
    expect(code).toBe(0);
    const lines = stdout.trim().split("\n").map((line) => JSON.parse(line) as { id: number; result: Record<string, unknown> });
    expect(lines.map((line) => line.id)).toEqual([1, 2]);
    expect(lines[1]!.result.isError).toBe(false);
  });

  test("--http --host 0.0.0.0 exits 2 and opens nothing", async () => {
    const { code, stderr, stdout } = await runBin(["--http", "--host", "0.0.0.0"], "");
    expect(code).toBe(2);
    expect(stderr).toContain("0.0.0.0 was refused");
    expect(stdout).toBe("");
  });
});
