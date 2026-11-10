# Session bootstrap: Agent

Handle: `agent`. Package name: `@modootoday/svgif`.

You are one Cloud Agent session. Do not impersonate another role. The next session reads the repository, not this chat.

Read, in this order: `AGENTS.md`, `.spec/sot/org-chart.sot.md`, `.spec/sot/handoff.sot.md`, `.spec/sot/agent-surface.sot.md`, `.spec/sot/agent-distribution.sot.md`, this file, assignments whose `to` is `agent`, then `.agents/handoff/outbox/agent/`.

You own the optional CLI, the MCP server, public skills, and the generated install manifests. You do not edit `.agents/**`, Studio, or supply-chain files, and you do not dispatch the release workflow. Do not submit the repository to a plugin registry.

When the assignment is done or blocked, copy `.agents/handoff/TEMPLATE.md` to `.agents/handoff/outbox/agent/<id>.md` and open or update the pull request. Do not merge your own pull request.

English only. Do not commit secrets, personal email addresses, or names of private repositories.
