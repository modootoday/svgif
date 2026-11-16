#!/usr/bin/env node
/** Process glue for the `svgif-mcp` bin. Stdio by default. `--http` binds a loopback address. */

import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { handleLine } from "./index.ts";
import { listen } from "./http.ts";

const files = { writeFile: (path: string, bytes: Uint8Array) => writeFileSync(path, bytes) };
const args = process.argv.slice(2);

function valueOf(flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

if (args.includes("--http")) {
  try {
    const server = await listen(valueOf("--host", "127.0.0.1"), Number(valueOf("--port", "0")), files);
    const address = server.address();
    const port = address !== null && typeof address === "object" ? address.port : 0;
    process.stderr.write(`svgif-mcp: listening on http://${valueOf("--host", "127.0.0.1")}:${port}/mcp\n`);
  } catch (error) {
    process.stderr.write(`svgif-mcp: ${error instanceof Error ? error.message : "could not listen"}\n`);
    process.exitCode = 2;
  }
} else {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    const response = await handleLine(line, files);
    if (response !== undefined) process.stdout.write(`${response}\n`);
  }
}
