---
name: svgif-author
description: "Create or edit a svgif project JSON file with the svgif CLI. Use when the user wants a new animation, a scaffold, or a change to a project document."
---
# Author a svgif project

Studio in the browser is the human editor. Use this skill when you are an agent and you need a project file.

## Do this

1. Prefer the CLI. Run `svgif new --json` from `@modootoday/svgif-cli` at the version recorded in this repository's agent-surface version file.
2. Write the project JSON to a file. Do not invent a second schema.
3. Run `svgif validate --json <file>` before you claim the file is usable.
4. If you change a document that already has a schema version, run `svgif migrate --json <file>` and validate the result.
5. For a snippet the user can paste, run `svgif embed --mode cdn --json` or `svgif embed --mode inline --json`.

## Do not

- Do not start a server.
- Do not require the human to install the CLI. Studio remains enough for a person.
- Do not copy instructions out of internal governance files. The public skill text is this file.
