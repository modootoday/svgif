---
name: specfold-ops
description: Read, check and edit svgif specfold documents. Use before changing design or implementation order.
metadata:
  internal: true
---

# specfold-ops

The design source for svgif is the root `.spec/` tree. Configuration is `spec.toml`. The owner id is `svgif`.

## When

Changing design, or checking which rule governs a path before implementation.

## Steps

1. Run `spec context <path>`.
2. Implementation order comes from `spec show plan:svgif/20261110122000`. Milestone names are defined only in `sot:svgif/roadmap`.
3. Run `spec check`. Follow the `next` command on each finding.
4. Human sentences go in `docs/` in English. Do not add a Korean page unless it is an i18n locale of an existing English page.
