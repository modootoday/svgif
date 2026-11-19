/**
 * The public object's keys in `src/public-types.ts` must equal the public
 * names listed in [[sot:svgif/public-api]]. Names are read from the record
 * itself, so a change to either side without the other fails here.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SOT_PATH = join(ROOT, ".spec/sot/public-api.sot.md");
const TYPES_PATH = join(import.meta.dir, "..", "src", "public-types.ts");
const INTERFACE_NAME = "SvgifPublicApi";

/** Public names from the record: the sketch, rule 6, rule 7 and rule 7a. */
function namesFromSot(markdown: string): Set<string> {
  const names = new Set<string>();

  const sketch = /```ts\n([\s\S]*?)```/.exec(markdown);
  if (!sketch) throw new Error("public-api record has no ts sketch");
  for (const match of sketch[1].matchAll(/\bsvgif\.([A-Za-z_$][\w$]*)/g)) names.add(match[1]);

  const rule = (label: string): string => {
    const line = markdown.split("\n").find((text) => text.startsWith(`${label} `));
    if (!line) throw new Error(`public-api record has no rule ${label}`);
    return line;
  };

  // Rule 6: `player.mount(...)` names the `player` object.
  const player = /`([A-Za-z_$][\w$]*)\.mount\(/.exec(rule("6."));
  if (!player) throw new Error("rule 6 does not name the player object");
  names.add(player[1]);

  // Rule 7: every backticked class name.
  for (const match of rule("7.").matchAll(/`([A-Z][\w$]*)`/g)) names.add(match[1]);

  // Rule 7a: `svgif.<name>` and the named error class.
  const rule7a = rule("7a.");
  for (const match of rule7a.matchAll(/\bsvgif\.([A-Za-z_$][\w$]*)/g)) names.add(match[1]);
  for (const match of rule7a.matchAll(/\bnamed `([A-Za-z_$][\w$]*)`/g)) names.add(match[1]);

  return names;
}

/**
 * Strip comments and string contents, so brackets inside them do not count.
 * The engine-test job installs no npm packages, so this file does not use the TypeScript compiler.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "")
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (text) => text[0] + " ".repeat(text.length - 2) + text[0]);
}

/** The first line of each top-level statement. A statement ends on a line that closes it at bracket depth 0 with `;` or `}`. */
function statements(source: string): string[] {
  const starts: string[] = [];
  let depth = 0;
  let open = false;
  for (const line of code(source).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!open && depth === 0) {
      starts.push(trimmed);
      open = true;
    }
    for (const char of trimmed) {
      if (char === "{" || char === "(" || char === "[") depth++;
      else if (char === "}" || char === ")" || char === "]") depth--;
    }
    if (depth < 0) throw new Error("unbalanced brackets");
    if (depth === 0 && /[;}]$/.test(trimmed)) open = false;
  }
  return starts;
}

/** Member names of one interface: the names that start a member at depth 1 inside its braces. */
function interfaceKeys(source: string, interfaceName: string): Set<string> {
  const text = code(source);
  const head = new RegExp(`\\binterface\\s+${interfaceName}\\b([^{]*)\\{`).exec(text);
  if (!head) throw new Error(`interface ${interfaceName} not found`);
  if (/\bextends\b/.test(head[1])) throw new Error(`interface ${interfaceName} must list its keys directly, not by extends`);
  const keys = new Set<string>();
  let depth = 0;
  let member = "";
  const flush = () => {
    const trimmed = member.trim();
    member = "";
    if (!trimmed) return;
    const name = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:(<]/.exec(trimmed);
    if (!name) throw new Error(`interface ${interfaceName} has a member that is not a plain key: ${trimmed.slice(0, 40)}`);
    keys.add(name[1]);
  };
  for (let index = head.index + head[0].length; index < text.length; index++) {
    const char = text[index];
    if (depth === 0 && char === "}") {
      flush();
      return keys;
    }
    if (char === "{" || char === "(" || char === "[" || char === "<") depth++;
    else if (char === "}" || char === ")" || char === "]" || (char === ">" && text[index - 1] !== "=")) depth--;
    if (depth === 0 && (char === ";" || char === ",")) flush();
    else member += char;
  }
  throw new Error(`interface ${interfaceName} is not closed`);
}

interface Difference {
  extra: string[];
  missing: string[];
}

function compare(listed: Set<string>, declared: Set<string>): Difference {
  return {
    extra: [...declared].filter((name) => !listed.has(name)).sort(),
    missing: [...listed].filter((name) => !declared.has(name)).sort(),
  };
}

const sotNames = namesFromSot(readFileSync(SOT_PATH, "utf8"));

describe("public API names", () => {
  test("the record lists the expected sources of names", () => {
    // Guards the parser: each rule contributes at least one name.
    for (const name of ["composition", "renderFrame", "compile", "player", "Path3", "ParametricGeometry", "exportInBrowser", "UnsupportedError"]) {
      expect(sotNames.has(name)).toBe(true);
    }
    expect(sotNames.has("Blob")).toBe(false);
  });

  test(`${INTERFACE_NAME} keys equal the names in the public-api record`, () => {
    const declared = interfaceKeys(readFileSync(TYPES_PATH, "utf8"), INTERFACE_NAME);
    expect(compare(sotNames, declared)).toEqual({ extra: [], missing: [] });
  });

  test("an extra or missing key is reported", () => {
    const source = `
      export interface ${INTERFACE_NAME} {
        composition(): void;
        Teapot: new () => unknown;
      }
    `;
    const result = compare(new Set(["composition", "renderFrame"]), interfaceKeys(source, INTERFACE_NAME));
    expect(result).toEqual({ extra: ["Teapot"], missing: ["renderFrame"] });
  });

  test("public-types.ts declares no runtime value", () => {
    const runtime = statements(readFileSync(TYPES_PATH, "utf8")).filter(
      (statement) => !/^(?:import type\b|export type\b|export interface\b|interface\b|type\b)/.test(statement),
    );
    expect(runtime).toEqual([]);
  });

  test("a runtime value in a types file is reported", () => {
    const source = "import type { A } from './a.ts';\nexport interface B { a: A; }\nexport const c = 1;\nexport type D = { e: () => void };\n";
    const runtime = statements(source).filter((statement) => !/^(?:import type\b|export type\b|export interface\b|interface\b|type\b)/.test(statement));
    expect(runtime).toEqual(["export const c = 1;"]);
  });
});
