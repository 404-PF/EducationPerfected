# Phase 3 release evidence

No release workflow currently exists. `npm run build:linux-dev` remains an unsigned local development build, not a release. `npm run release:check` is a fail-closed evidence checklist, not an upload command or permission to publish.

Create an untracked `release/evidence.json` from the example only after evidence is reviewed. Every global and per-target check must be `passed`, name the exact current source commit, link its evidence and name its reviewer. A skipped Windows child-signal fixture, another platform's result or package availability is not native proof. The validator checks completeness and freshness, not evidence authenticity or legal clearance. A future release workflow must invoke this check before any artifact publication, and still require owner authority.

Native lanes selected by the owner: Windows x64, macOS ARM64, macOS x64, Linux x64, Linux ARM64. Current builder is glibc Linux x64 only. Other lanes need native builders, signing-compatible payload formats and native hosts. For each lane verify: no-Node fresh machine launch, extracted browser path, native credential save/read/delete, safe console shutdown, packaging integrity and the selected signing/unsigned policy. Windows needs actual console events, not child.kill emulation. No paid runners or certificates are approved by this checklist.

Global gates: project contribution rights, browser redistribution, dependency notice completeness and artifact integrity. Source licenses recovered from exact npm gitHead are recorded under `packaging/notices/provenance.json`; copying license texts does not settle all legal obligations or project rights. Browser files and native binary third-party notices also need review.
