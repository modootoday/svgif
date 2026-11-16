/**
 * CLI library. One call in, one JSON result out.
 * Validation is the registry validator. Migration is `schema/migrate.mjs`.
 * Compile is the engine. SVG and HTML export are the two writers Studio calls,
 * which call the export package. Nothing here encodes, lowers, or validates on its own.
 * It does not open a socket.
 * [[sot:svgif/agent-surface]] [[adr:svgif/20261110122400]]
 */

import projectV1 from "../../../schema/project/v1.schema.json" with { type: "json" };
import projectV11 from "../../../schema/project/v1.1.schema.json" with { type: "json" };
import irV1 from "../../../schema/ir/v1.schema.json" with { type: "json" };
import irV11 from "../../../schema/ir/v1.1.schema.json" with { type: "json" };
import { validate } from "../../../schema/validate.mjs";
import { CURRENT_SCHEMA_VERSION, SchemaError, migrate } from "../../../schema/migrate.mjs";
import { compile } from "../../svgif/src/lower/index.ts";
import type { TimelineIr } from "../../svgif/src/ir/index.ts";
import type { HtmlProject } from "../../svgif-export/src/html.ts";
import { copySource, saveAndExportHtml } from "../../../apps/studio/src/project-file.ts";
import type { SaveOptions } from "../../../apps/studio/src/project-file.ts";
import { GENERATOR, RUNTIME_VERSION } from "../../../apps/studio/src/runtime.ts";
import { svgFile } from "../../../apps/studio/src/svg-file.ts";
import { rasterComposition, type Composition } from "../../../apps/studio/src/composition.ts";

export const RESULT_SCHEMA_VERSION = 1;
export const RESULT_SCHEMA_REVISION = 0;
export const IMPLEMENTED_SCHEMA_VERSION: number = CURRENT_SCHEMA_VERSION;
export const IMPLEMENTED_SCHEMA_REVISION = 1;

export const COMMANDS = ["validate", "migrate", "describe", "compile", "export", "new", "embed"] as const;
export type Command = (typeof COMMANDS)[number];

export const BACKENDS = ["css-external", "css-embedded", "smil"] as const;
export const IN_PROCESS_FORMATS = ["svg", "html"] as const;
export const BROWSER_FORMATS = ["webp", "webm", "mp4"] as const;
export const EMBED_MODES = ["cdn", "inline"] as const;
/** Studio downloads an SVG on this backend. `export --format svg` writes the same bytes. */
export const SVG_EXPORT_BACKEND = "css-embedded" as const;

export type ErrorCode = "validation" | "usage" | "schema-too-new" | "needs-browser" | "internal";

export const EXIT: Record<ErrorCode, number> = {
  validation: 1,
  usage: 2,
  "schema-too-new": 3,
  "needs-browser": 4,
  internal: 70,
};

export interface CliError {
  code: ErrorCode;
  message: string;
  issues?: string[];
}

export type CliResult =
  | { ok: true; schemaVersion: 1; schemaRevision: 0; command: string; result: unknown }
  | { ok: false; schemaVersion: 1; schemaRevision: 0; command: string; error: CliError };

export interface Flags {
  backend?: string;
  format?: string;
  out?: string;
  mode?: string;
  browser?: boolean;
}

export interface FileWriter {
  writeFile(path: string, bytes: Uint8Array): void | Promise<void>;
}

/** The project schemas this build implements, keyed by `schemaRevision`. */
export const PROJECT_SCHEMAS: Record<number, Record<string, unknown>> = {
  0: projectV1 as Record<string, unknown>,
  1: projectV11 as Record<string, unknown>,
};

/** Every registry file a project schema refers to, so a consumer can resolve each `$ref` by `$id`. */
export const SCHEMA_BUNDLE: readonly Record<string, unknown>[] = [projectV1, projectV11, irV1, irV11];

const BY_ID = new Map<string, unknown>(SCHEMA_BUNDLE.map((schema) => [(schema as { $id: string }).$id, schema]));

class CommandError extends Error {
  readonly code: ErrorCode;
  readonly issues?: string[];

  constructor(code: ErrorCode, message: string, issues?: string[]) {
    super(message);
    this.code = code;
    if (issues) this.issues = issues;
  }
}

function succeed(command: string, result: unknown): CliResult {
  return { ok: true, schemaVersion: RESULT_SCHEMA_VERSION, schemaRevision: RESULT_SCHEMA_REVISION, command, result };
}

function failure(command: string, error: CliError): CliResult {
  return { ok: false, schemaVersion: RESULT_SCHEMA_VERSION, schemaRevision: RESULT_SCHEMA_REVISION, command, error };
}

export function exitCode(result: CliResult): number {
  return result.ok ? 0 : EXIT[result.error.code];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Schema issues for a project document at the revision it declares. Throws on a newer `schemaVersion`. */
export function projectIssues(document: unknown): string[] {
  if (!isObject(document)) return ["project must be an object"];
  const version = document.schemaVersion;
  if (typeof version === "number" && Number.isInteger(version) && version > IMPLEMENTED_SCHEMA_VERSION) {
    throw new CommandError("schema-too-new", `schemaVersion ${version} is newer than ${IMPLEMENTED_SCHEMA_VERSION}`);
  }
  const revision = document.schemaRevision;
  const schema = typeof revision === "number" ? PROJECT_SCHEMAS[revision] : undefined;
  if (!schema) return ["project.schemaRevision is not a revision this build implements"];
  return validate(schema, document, schema, BY_ID, "project") as string[];
}

function requireProject(document: unknown): HtmlProject {
  if (document === undefined) throw new CommandError("usage", "a project document is required");
  const issues = projectIssues(document);
  if (issues.length > 0) throw new CommandError("validation", "the project document is not valid", issues);
  return document as HtmlProject;
}

function requireChoice(value: string | undefined, flag: string, allowed: readonly string[]): string {
  if (value === undefined) throw new CommandError("usage", `${flag} is required`);
  if (!allowed.includes(value)) throw new CommandError("usage", `${flag} must be one of ${allowed.join(", ")}`);
  return value;
}

/** A minimal project that validates at revision 0. One node, one key, no saved generation. */
export function newProject(): HtmlProject {
  const zero = "sha384-0000000000000000000000000000000000000000000000000000000000000000";
  return {
    schemaVersion: 1,
    schemaRevision: 0,
    generator: GENERATOR,
    runtime: { mode: "cdn", version: RUNTIME_VERSION, sri: zero, studioSri: { js: zero, css: zero } },
    composition: {
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 30,
      nodes: [{ id: "s-n0", tracks: [{ property: "transform.translateX", keys: [{ frame: 0, value: 0 }] }] }],
    },
    provenance: { generations: [] },
  };
}

function saveOptions(project: HtmlProject, mode: "cdn" | "inline"): SaveOptions {
  const last = project.provenance.generations[project.provenance.generations.length - 1] as
    | { id?: string; savedAt?: string }
    | undefined;
  return {
    embedPlayer: mode === "inline",
    embedStudio: false,
    id: typeof last?.id === "string" ? last.id : "",
    savedAt: typeof last?.savedAt === "string" ? last.savedAt : "",
  };
}

async function runCommand(command: Command, document: unknown, flags: Flags, files?: FileWriter): Promise<unknown> {
  switch (command) {
    case "describe":
      return {
        implementedSchemaVersion: IMPLEMENTED_SCHEMA_VERSION,
        implementedSchemaRevision: IMPLEMENTED_SCHEMA_REVISION,
        commands: [...COMMANDS],
      };
    case "new":
      return newProject();
    case "validate":
      requireProject(document);
      return { valid: true };
    case "migrate": {
      if (document === undefined) throw new CommandError("usage", "a project document is required");
      let migrated: unknown;
      try {
        migrated = migrate(document);
      } catch (error) {
        if (error instanceof SchemaError) {
          const code = (error as { code?: string }).code;
          throw new CommandError(code === "schema-too-new" ? "schema-too-new" : "validation", error.message, [error.message]);
        }
        throw error;
      }
      requireProject(migrated);
      return migrated;
    }
    case "compile": {
      const backend = requireChoice(flags.backend, "--backend", BACKENDS) as (typeof BACKENDS)[number];
      const project = requireProject(document);
      const compiled = compile(project.composition as unknown as TimelineIr, backend);
      return { backend, svg: compiled.svg, ...(compiled.css !== undefined ? { css: compiled.css } : {}) };
    }
    case "export": {
      const format = requireChoice(flags.format, "--format", [...IN_PROCESS_FORMATS, ...BROWSER_FORMATS]);
      if (flags.out === undefined || flags.out.length === 0) throw new CommandError("usage", "--out is required");
      const project = requireProject(document);
      if ((BROWSER_FORMATS as readonly string[]).includes(format)) {
        if (!flags.browser) throw new CommandError("needs-browser", `${format} needs a browser. Pass --browser.`);
        if (!files) throw new CommandError("internal", "no file writer was given");
        // Loaded only here, so the library stays free of Node modules until a browser export runs.
        const browser = await import("./browser.ts");
        let bytes: Uint8Array;
        try {
          bytes = await browser.exportInBrowser(
            format as (typeof BROWSER_FORMATS)[number],
            rasterComposition(project.composition as unknown as Composition),
          );
        } catch (error) {
          if (error instanceof browser.BrowserUnavailable) throw new CommandError("needs-browser", error.message);
          throw new CommandError("internal", `${error instanceof Error ? error.message : "browser export failed"} The file was not written.`);
        }
        await files.writeFile(flags.out, bytes);
        return { format, out: flags.out, bytes: bytes.length };
      }
      if (!files) throw new CommandError("internal", "no file writer was given");
      const blob =
        format === "svg"
          ? svgFile(project.composition as unknown as Composition, SVG_EXPORT_BACKEND)
          : saveAndExportHtml(project, saveOptions(project, project.runtime.mode));
      await files.writeFile(flags.out, new Uint8Array(await blob.arrayBuffer()));
      return { format, out: flags.out };
    }
    case "embed": {
      const mode = requireChoice(flags.mode, "--mode", EMBED_MODES) as "cdn" | "inline";
      const project = requireProject(document);
      const shaped: HtmlProject = { ...project, runtime: { ...project.runtime, mode } };
      return { mode, html: copySource(shaped, saveOptions(shaped, mode)) };
    }
  }
}

/** Run one command. The promise never rejects. A thrown error becomes `internal`. */
export async function execute(command: string, document: unknown, flags: Flags = {}, files?: FileWriter): Promise<CliResult> {
  if (!(COMMANDS as readonly string[]).includes(command)) {
    return failure(command, { code: "usage", message: `unknown command. Commands: ${COMMANDS.join(", ")}` });
  }
  try {
    return succeed(command, await runCommand(command as Command, document, flags, files));
  } catch (error) {
    if (error instanceof CommandError) {
      return failure(command, { code: error.code, message: error.message, ...(error.issues ? { issues: error.issues } : {}) });
    }
    return failure(command, { code: "internal", message: error instanceof Error ? error.message : "internal failure" });
  }
}

export const HELP = [
  "svgif <command> [flags]",
  "",
  "Commands",
  "  validate  --in <file|->                                   check a project document",
  "  migrate   --in <file|->                                   print the migrated project",
  "  describe                                                  print the schema version this binary implements",
  "  compile   --in <file|-> --backend css-external|css-embedded|smil",
  "  export    --in <file|-> --format svg|html --out <file>    webp, webm, and mp4 need --browser",
  "  new                                                       print a minimal valid project",
  "  embed     --in <file|-> --mode cdn|inline                 print the copy-source fragment",
  "",
  "Flags",
  "  --json    one JSON document on stdout (the default)",
  "  --human   plain text on stdout",
  "  --help    this text",
  "",
  "Exit codes",
  "  0 success   1 validation   2 usage   3 schema-too-new   4 needs a browser   70 internal",
].join("\n");

export interface CliIo extends FileWriter {
  readFile(path: string): string | Promise<string>;
  readStdin(): string | Promise<string>;
}

export interface CliOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const VALUE_FLAGS = ["--in", "--backend", "--format", "--out", "--mode"];
const SWITCHES = ["--json", "--human", "--browser", "--help"];
const NEEDS_INPUT: readonly string[] = ["validate", "migrate", "compile", "export", "embed"];

function humanText(result: CliResult): string {
  if (!result.ok) {
    const issues = result.error.issues ? `\n${result.error.issues.join("\n")}` : "";
    return `${result.command}: ${result.error.code}: ${result.error.message}${issues}`;
  }
  if (typeof result.result === "string") return result.result;
  return JSON.stringify(result.result, null, 2);
}

/** Parse `argv`, run one command, and return what the process should print and its exit code. */
export async function run(argv: readonly string[], io: CliIo): Promise<CliOutput> {
  const values: Record<string, string> = {};
  const switches = new Set<string>();
  const positional: string[] = [];
  let usage = "";
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (VALUE_FLAGS.includes(arg)) {
      const value = argv[index + 1];
      if (value === undefined) usage ||= `${arg} needs a value`;
      else values[arg] = value;
      index += 1;
    } else if (SWITCHES.includes(arg)) {
      switches.add(arg);
    } else if (arg.startsWith("--")) {
      usage ||= `unknown flag ${arg}`;
    } else {
      positional.push(arg);
    }
  }
  const human = switches.has("--human") && !switches.has("--json");
  const command = positional[0] ?? "";
  const finish = (result: CliResult): CliOutput => ({
    exitCode: exitCode(result),
    stdout: `${human ? humanText(result) : JSON.stringify(result)}\n`,
    stderr: result.ok ? "" : `svgif: ${result.error.code}: ${result.error.message}\n`,
  });
  if (switches.has("--help")) return finish(succeed(command || "help", HELP));
  if (switches.has("--json") && switches.has("--human")) usage ||= "--json and --human cannot both be set";
  if (positional.length > 1) usage ||= `unexpected argument ${positional[1]}`;
  if (command === "") usage ||= "a command is required";
  if (usage) return finish(failure(command, { code: "usage", message: usage }));

  let document: unknown;
  if (NEEDS_INPUT.includes(command)) {
    const source = values["--in"];
    if (source === undefined) return finish(failure(command, { code: "usage", message: "--in is required" }));
    let text: string;
    try {
      text = source === "-" ? await io.readStdin() : await io.readFile(source);
    } catch {
      return finish(failure(command, { code: "usage", message: `${source} could not be read` }));
    }
    try {
      document = JSON.parse(text);
    } catch {
      return finish(failure(command, { code: "validation", message: "the input is not JSON", issues: ["the input is not JSON"] }));
    }
  }
  const flags: Flags = {
    ...(values["--backend"] !== undefined ? { backend: values["--backend"] } : {}),
    ...(values["--format"] !== undefined ? { format: values["--format"] } : {}),
    ...(values["--out"] !== undefined ? { out: values["--out"] } : {}),
    ...(values["--mode"] !== undefined ? { mode: values["--mode"] } : {}),
    ...(switches.has("--browser") ? { browser: true } : {}),
  };
  return finish(await execute(command, document, flags, io));
}
