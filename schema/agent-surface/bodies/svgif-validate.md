# Validate a svgif project

## Do this

1. Run `svgif validate --json <file>`.
2. Read stdout as JSON. Diagnostics are on stderr.
3. Exit 0 means the document matches the schema version it declares.
4. Exit 1 means the document is invalid. Report the JSON error list. Do not guess a fix that the schema would reject.
5. Exit 3 means the document's schema version is newer than this CLI. Stop and say so.
6. Exit 2 means the invocation was wrong. Fix the arguments and run it once.

## Migrate

`svgif migrate --json <file>` rewrites an older schema version forward. Validate the output. There is one migrator. Do not hand-edit version numbers.
