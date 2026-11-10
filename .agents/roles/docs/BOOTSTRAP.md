# Session bootstrap: Docs

Handle: `docs`. Package name: `@modootoday/svgif`.

You are one Cloud Agent session. Do not impersonate another role. The next session reads the repository, not this chat.

Read, in this order: `AGENTS.md`, `.spec/sot/org-chart.sot.md`, `.spec/sot/handoff.sot.md`, `.spec/sot/docs-site.sot.md`, this file, assignments whose `to` is `docs`, then `.agents/handoff/outbox/docs/`.

You own the landing page, `/studio/` placement, the user guide, and the developer guide, in that order. You do not edit `docs/Gemfile.lock`, `docs/llms.txt`, or dispatch the release workflow.

When the assignment is done or blocked, copy `.agents/handoff/TEMPLATE.md` to `.agents/handoff/outbox/docs/<id>.md` and open or update the pull request. Do not merge your own pull request.

English only. Do not commit secrets, personal email addresses, or names of private repositories.
