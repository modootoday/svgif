/**
 * The public object's keys in `src/public-types.ts` must equal the public
 * names listed in [[sot:svgif/public-api]]. Names are read from the record
 * itself, so a change to either side without the other fails here.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

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

/** Member names of one interface in a TypeScript source, read with the compiler API. */
function interfaceKeys(source: string, interfaceName: string): Set<string> {
  const file = ts.createSourceFile("public-types.ts", source, ts.ScriptTarget.ES2022, true);
  let found: ts.InterfaceDeclaration | undefined;
  file.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === interfaceName) found = node;
  });
  if (!found) throw new Error(`interface ${interfaceName} not found`);
  if (found.heritageClauses && found.heritageClauses.length > 0) {
    throw new Error(`interface ${interfaceName} must list its keys directly, not by extends`);
  }
  const keys = new Set<string>();
  for (const member of found.members) {
    if (!member.name) throw new Error(`interface ${interfaceName} has an index or call signature`);
    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) keys.add(member.name.text);
    else throw new Error(`interface ${interfaceName} has a computed key`);
  }
  return keys;
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
    const source = readFileSync(TYPES_PATH, "utf8");
    const file = ts.createSourceFile("public-types.ts", source, ts.ScriptTarget.ES2022, true);
    const runtime: string[] = [];
    file.forEachChild((node) => {
      if (ts.isImportDeclaration(node)) {
        if (!node.importClause?.isTypeOnly) runtime.push("value import");
      } else if (!ts.isInterfaceDeclaration(node) && !ts.isTypeAliasDeclaration(node) && node.kind !== ts.SyntaxKind.EndOfFileToken) {
        runtime.push(ts.SyntaxKind[node.kind]);
      }
    });
    expect(runtime).toEqual([]);
  });
});
