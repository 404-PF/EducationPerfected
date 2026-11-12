# V2026 beta preparation

This is build preparation, not a published or certified beta. The code-only scope from November 3 remains unchanged. Removed rights/signing and Mac/saved-login/no-Node work has not been re-added or marked passed. Source remains version 2026.0.0 until a separately reviewed version change.

## Candidate label

Use a dated SemVer prerelease label such as `2026.11.12-beta.1`, based on the candidate's intended date, with no zero-padded fields. Increment beta.N for another candidate on that date. This labels a candidate build, not a promised stable release date. It creates no tag and does not change package.json or package-lock.json. A version label is not release authority.

## Build-only workflow

After the workflow is merged, an authorized maintainer can manually run **V2026 beta build preparation (no publication)** on main with a candidate label. It uses read-only repository permissions, pinned checkout/setup actions, Node 22.23.4 and the lockfile, runs preparation contracts and existing build preflight checks, and builds on the five native target lanes: Windows x64, macOS ARM64/x64, Linux x64/ARM64.

Each ephemeral runner writes CANDIDATE.json and SHA256SUMS beside its development executable and existing third-party notices. The inventory records the exact source commit, source package version, candidate label, native target, expected (not observed) browser pin, file lengths and SHA-256 values. It inventories the executable and notices, not temporary SEA build inputs. The builder's embedded-browser manifest remains separate. There is no upload step. Runner files are discarded after the job; logs are not a downloadable beta. A successful build does not prove native launch, saved login, no-Node behavior, signing or compatibility with a live EP task.

The existing builders may apply their existing development ad-hoc signing on macOS. This does not set a release signing policy, buy a certificate or run a new signing-validation project.

## Publication boundary

The existing `npm run release:check` and release/criteria.json are unchanged. They require exact-commit evidence before distribution, including items removed from the work board. Building a candidate does not bypass these gates. Public Actions executable uploads also distribute the bundled browser and are deliberately absent.

Before adding a downloadable executable or publishing any release/tag, Page must choose the publication scope. Options include re-adding the relevant release clearances or choosing a narrower source-only beta with its limits made explicit. Neither decision is implied by prioritizing preparation. Further merge approval is required for a publication path or changed version. Actual tag/release publication requires separate approval.

## Release-note outline

- V2026 CLI beta candidate, exact commit and candidate label.
- Source code and local fixture evidence only where that is what passed.
- Supported task table from README; partial lesson support is not all-task support.
- Assessment mode remains refused. Manually/self-marked work and unimplemented maths editors remain refused.
- Current source-ZIP run path requires Node >=22.12, `npm ci`, then `npm run cli`.
- List actual shipped artifacts, verified platforms and known limitations only after those choices and evidence exist.

No beta publication date or stable-release date is committed here.
