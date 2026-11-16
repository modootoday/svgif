/**
 * MCP adapter. Each tool runs one CLI library command and returns its result.
 * This file does not validate, migrate, compile, or export on its own.
 * The install path is stdio. The optional HTTP listener binds a loopback
 * address only. There is no hosted endpoint.
 * [[sot:svgif/agent-surface]] [[adr:svgif/20261110122500]]
 */

import {
  BACKENDS,
  BROWSER_FORMATS,
  COMMANDS,
  EMBED_MODES,
  IMPLEMENTED_SCHEMA_REVISION,
  IN_PROCESS_FORMATS,
  PROJECT_SCHEMAS,
  SCHEMA_BUNDLE,
  execute,
  type CliResult,
  type FileWriter,
  type Flags,
} from "../../svgif-cli/src/index.ts";

export const PROTOCOL_VERSION = "2025-06-18";
export const SERVER_INFO = { name: "svgif-mcp", version: "0.0.0" } as const;
export const DOCS_URL = "https://thumly.io/docs/";
/** The schema generation the tool names carry. */
export const TOOL_GENERATION = "v1";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const DESCRIPTIONS: Record<(typeof COMMANDS)[number], string> = {
  validate: "Check a project document against the project schema at the revision it declares.",
  migrate: "Return the project document migrated to the schema version this server implements.",
  describe: "Return the schema version this server implements and the command names.",
  compile: "Compile a project to SVG with the css-external, css-embedded, or smil backend.",
  export: "Write a project to a file as svg or html. webp, webm, and mp4 need a browser.",
  new: "Return a minimal valid project document.",
  embed: "Return the copy-source fragment for a project, with the player on the CDN or inline.",
};

const NEEDS_PROJECT: readonly string[] = ["validate", "migrate", "compile", "export", "embed"];

const FLAG_SCHEMAS: Record<string, Record<string, Record<string, unknown>>> = {
  compile: { backend: { enum: [...BACKENDS] } },
  export: {
    format: { enum: [...IN_PROCESS_FORMATS, ...BROWSER_FORMATS] },
    out: { type: "string", minLength: 1 },
    browser: { type: "boolean" },
  },
  embed: { mode: { enum: [...EMBED_MODES] } },
};

const REQUIRED_FLAGS: Record<string, string[]> = {
  compile: ["backend"],
  export: ["format", "out"],
  embed: ["mode"],
};

function schemaId(schema: Record<string, unknown>): string {
  return String(schema.$id);
}

function inputSchema(command: string): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const schema: Record<string, unknown> = { type: "object", additionalProperties: false, properties, required };
  if (NEEDS_PROJECT.includes(command)) {
    properties.project = {
      anyOf: Object.values(PROJECT_SCHEMAS).map((project) => ({ $ref: schemaId(project) })),
    };
    required.push("project");
    schema.$defs = Object.fromEntries(SCHEMA_BUNDLE.map((file) => [schemaId(file), file]));
  }
  for (const [flag, flagSchema] of Object.entries(FLAG_SCHEMAS[command] ?? {})) properties[flag] = flagSchema;
  required.push(...(REQUIRED_FLAGS[command] ?? []));
  return schema;
}

export const TOOLS: readonly Tool[] = COMMANDS.map((command) => ({
  name: `svgif_${command}_${TOOL_GENERATION}`,
  description: DESCRIPTIONS[command],
  inputSchema: inputSchema(command),
}));

export const RESOURCES = [
  {
    uri: "svgif://schema/project/v1",
    name: "Project schema",
    description: "The project schema at the revision this server implements.",
    mimeType: "application/schema+json",
  },
  { uri: "svgif://docs", name: "Documentation", description: "The public docs URL.", mimeType: "text/uri-list" },
] as const;

export function readResource(uri: string): { uri: string; mimeType: string; text: string } | undefined {
  if (uri === "svgif://schema/project/v1") {
    return { uri, mimeType: "application/schema+json", text: JSON.stringify(PROJECT_SCHEMAS[IMPLEMENTED_SCHEMA_REVISION]) };
  }
  if (uri === "svgif://docs") return { uri, mimeType: "text/uri-list", text: `${DOCS_URL}\n` };
  return undefined;
}

function commandOf(tool: string): string | undefined {
  const match = /^svgif_([a-z]+)_v1$/.exec(tool);
  const command = match?.[1];
  return command !== undefined && (COMMANDS as readonly string[]).includes(command) ? command : undefined;
}

/** Run one tool. The result is the object the CLI writes to stdout. */
export async function callTool(name: string, args: unknown, files?: FileWriter): Promise<CliResult | undefined> {
  const command = commandOf(name);
  if (command === undefined) return undefined;
  const input = args !== null && typeof args === "object" && !Array.isArray(args) ? (args as Record<string, unknown>) : {};
  const flags: Flags = {
    ...(typeof input.backend === "string" ? { backend: input.backend } : {}),
    ...(typeof input.format === "string" ? { format: input.format } : {}),
    ...(typeof input.out === "string" ? { out: input.out } : {}),
    ...(typeof input.mode === "string" ? { mode: input.mode } : {}),
    ...(input.browser === true ? { browser: true } : {}),
  };
  return execute(command, input.project, flags, files);
}

export interface RpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function reply(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function refuse(id: string | number | null, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/** Handle one JSON-RPC message. A notification returns undefined. */
export async function handleMessage(message: unknown, files?: FileWriter): Promise<RpcResponse | undefined> {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    return refuse(null, -32600, "the message is not a JSON-RPC request");
  }
  const request = message as RpcRequest;
  const hasId = typeof request.id === "string" || typeof request.id === "number";
  const id = hasId ? (request.id as string | number) : null;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return refuse(id, -32600, "the message is not a JSON-RPC request");
  }
  if (!hasId) return undefined;
  const params =
    request.params !== null && typeof request.params === "object" && !Array.isArray(request.params)
      ? (request.params as Record<string, unknown>)
      : {};
  switch (request.method) {
    case "initialize":
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {}, resources: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: TOOLS });
    case "tools/call": {
      if (typeof params.name !== "string") return refuse(id, -32602, "params.name is required");
      const result = await callTool(params.name, params.arguments, files);
      if (!result) return refuse(id, -32602, `unknown tool ${params.name}`);
      return reply(id, {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
        isError: !result.ok,
      });
    }
    case "resources/list":
      return reply(id, { resources: RESOURCES });
    case "resources/read": {
      const resource = typeof params.uri === "string" ? readResource(params.uri) : undefined;
      if (!resource) return refuse(id, -32002, "resource not found");
      return reply(id, { contents: [resource] });
    }
    default:
      return refuse(id, -32601, `method not found: ${request.method}`);
  }
}

/** Handle one line of stdio. A line that is not JSON is a parse error. */
export async function handleLine(line: string, files?: FileWriter): Promise<string | undefined> {
  if (line.trim().length === 0) return undefined;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return JSON.stringify(refuse(null, -32700, "the line is not JSON"));
  }
  const response = await handleMessage(message, files);
  return response ? JSON.stringify(response) : undefined;
}

const LOOPBACK_V4 = /^127\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/** True for a literal loopback address. A name is refused, because a name can resolve elsewhere. */
export function isLoopback(host: string): boolean {
  return LOOPBACK_V4.test(host) || host === "::1";
}

/** Throws unless the bind address is a literal loopback address. */
export function assertLoopback(host: string): string {
  if (!isLoopback(host)) throw new Error(`--http binds a loopback address only. ${host} was refused.`);
  return host;
}

/** True when a request may be answered: no Origin, or an Origin on a loopback host. */
export function originAllowed(origin: string | undefined): boolean {
  if (origin === undefined || origin === "") return true;
  try {
    const host = new URL(origin).hostname.replace(/^\[|\]$/g, "");
    return isLoopback(host) || host === "localhost";
  } catch {
    return false;
  }
}
