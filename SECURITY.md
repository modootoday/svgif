# Security policy

## Reporting

Report a vulnerability through GitHub private vulnerability reporting on this repository. Do not open a public issue for an unpublished vulnerability. Do not include secret values, personal data, or proof-of-concept strings that would belong in a private report.

## Response

| Severity | What happens |
| --- | --- |
| Critical | Mitigate, or record a written exception in an ADR, within 2 days. |
| High | Mitigate, or record a written exception in an ADR, within 7 days. |
| Medium | Fix before the next product release. |
| Low | Best effort. A low advisory does not block a release. |

A product release fails closed while any high or critical advisory is open on the release commit, including a transitive dependency in `package-lock.json` or `docs/Gemfile.lock`. An ADR exception records why a pin remains. It does not make the release workflow ignore the advisory.

## Supported versions

`v0.1.0` has not shipped. Reports against `main` are in scope. The placeholder `@modootoday/svgif@0.0.0-stage` package is a name claim, not a supported release.

## Repository settings

Dependabot alerts, Dependabot security updates, secret scanning, push protection, and private vulnerability reporting are one-time owner settings. The files in this repository do not turn those switches on by themselves.
