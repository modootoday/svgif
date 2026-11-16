#!/usr/bin/env node
/** Process glue for the `svgif` bin. The library in `index.ts` does the work. */

import { readFileSync, writeFileSync } from "node:fs";
import { run } from "./index.ts";

const output = await run(process.argv.slice(2), {
  readFile: (path) => readFileSync(path, "utf8"),
  readStdin: () => readFileSync(0, "utf8"),
  writeFile: (path, bytes) => writeFileSync(path, bytes),
});
if (output.stderr) process.stderr.write(output.stderr);
process.stdout.write(output.stdout);
process.exitCode = output.exitCode;
