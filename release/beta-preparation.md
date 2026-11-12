# V2026 beta preparation

This is build preparation, not a published or certified beta. On November 12 Page chose a downloadable beta and re-authorized the release validation removed from the November 3 code-only board. Re-authorized work is not passed work. Source remains version 2026.0.0 until a separately reviewed version change.

## Internal validation labels and public versions

CI validation uses a dated internal label such as `2026.11.12-validation.1`. The manually selected validation.N counter distinguishes local/CI builds, not releases. Workflow input `validation_label` is recorded as `validationLabel` with `labelKind: internal-validation-not-release` in schema2 candidate metadata. Public beta labels are rejected by this build-preparation command.

Earlier logs used `2026.11.12-beta.1` through `beta.12` as internal candidate labels. That was misleading: none was a published beta, and those counters do not consume public release numbers. Historical evidence below retains its original labels so it can be reconciled to the actual runs.

The first public beta on its actual publication date should use `YYYY.M.D-beta.1`, with later published betas on that date incrementing beta.N. The date, version change, tag and publication still require review/approval and completed release gates. Validation builds do not change package.json or package-lock.json, create a tag or approve publication.

## Build-only workflow

After the workflow is merged, an authorized maintainer can manually run **V2026 beta build preparation (no publication)** on main with an internal validation label. It uses read-only repository permissions, pinned checkout/setup actions, Node 22.23.4 and the lockfile, runs preparation contracts and existing build preflight checks, and builds on the five native target lanes: Windows x64, macOS ARM64/x64, Linux x64/ARM64.

The candidate command deletes its target build directory first, invokes only the fixed native development builder, and requires it to succeed with an unchanged clean source commit before writing inventory. It cannot relabel an arbitrary old binary. Each ephemeral runner writes CANDIDATE.json and SHA256SUMS beside its development executable and existing third-party notices. The inventory records the exact source commit, source package version, schema-2 validationLabel and labelKind fields, native target, expected (not observed) browser pin, file lengths and SHA-256 values. It inventories the executable and notices, not temporary SEA build inputs. The builder's embedded-browser manifest remains separate. There is no upload step. Runner files are discarded after the job; the manifest and checksums are printed in job logs for inspection, but logs are not a downloadable beta. A successful build does not prove native launch, saved login, no-Node behavior, signing or compatibility with a live EP task.

The existing builders may apply their existing development ad-hoc signing on macOS. This does not set a release signing policy, buy a certificate or run a new signing-validation project.

## Publication boundary

The existing `npm run release:check` and release/criteria.json are unchanged. They require exact-commit evidence before distribution, including items removed from the work board. Building a candidate does not bypass these gates. Public Actions executable uploads also distribute the bundled browser and are deliberately absent.

Page chose the direct-Google-download candidate path in PR #133. This does not approve release publication or make its clearance records complete. Further merge approval is required for new validation code, a publication path or a changed version. Actual tag/release publication requires separate approval.

## Release-note outline

- V2026 CLI beta candidate, exact commit and internal validation label.
- Source code and local fixture evidence only where that is what passed.
- Task-support prose in README; partial lesson support is not all-task support.
- Assessment mode remains refused. Manually/self-marked work and unimplemented maths editors remain refused.
- Current source-ZIP run path requires Node >=22.12, `npm ci`, then `npm run cli`.
- List actual shipped artifacts, verified platforms and known limitations only after those choices and evidence exist.

No beta publication date or stable-release date is committed here.

## First hosted build

See [the 12 November build-only result](beta-build-2026-11-12.md) for exact commit, lane logs, hashes and limits. No downloadable executable was retained.

## Direct-download native validation follow-through

`direct-download-validation` builds candidates with only manifest and native binding SEA assets. The original embedded-browser builders remain development tools, not the selected beta distribution path.

The merged-main beta.5 run on `51385b3615a27c5f052a0757c53ea35fcfecef99` passed five native build/cached local CLI lanes and four POSIX actual first-run consent/download/local-login/SIGINT cleanup lanes: https://github.com/404-PF/EducationPerfected/actions/runs/43179483052 . That run did not test Windows first-run consent or the exact downloadable artifact with native credential fixtures.

The follow-through workflow adds a fixed public-input Windows ConPTY first-run probe. The public probe has a 16-minute outer process budget (one minute beyond the downloader watchdog) and a 950-second post-consent readiness wait. Its only echo exemption is the literal browser consent answer; credential prompts retain their original echo/closure protections. It owns a fresh home, local login page and job; decline must leave no cache, consent must verify the pinned browser and reach the local login-ready marker, and raw ETX must exit130 with job-zero, EOF and extraction/lock cleanup. This is hosted ConPTY evidence only when the native run passes, not a physical console or clean machine claim.

A hosted-only bridge verifies candidate commit, target, mode, file length and hash, then copies exact candidate bytes under the existing fixture path without overwriting another artifact. Existing Linux private Secret Service, macOS owned-keychain and Windows disposable fixed-slot fixtures run against that copy. These are synthetic setup/health/deletion tests with source-side verification where supported. macOS exact source-pair access from the SEA and normal stored-login browser launch remain distinct gaps; the existing fixture must not be read as proof of either. No user credential record is used.

All candidates and notices remain ephemeral. No uploads, release tags, publication, gate bypass, changed signing policy, normal account login or no-Node certification is added.

### Windows failure evidence and independent lanes

The beta.7 run on ed9547f built all targets and passed POSIX first-run/store fixtures. Windows cached local CLI exited1 before owner-login-ready in two attempts: https://github.com/404-PF/EducationPerfected/actions/runs/43183901438 . The actual Windows first-run and store fixtures were skipped, not failed or passed.

The fixture now reports only fixed known startup-message presence booleans, never raw child output. A failed cached browser probe remains a failed job. Independent Windows first-run and synthetic credential-store checks may still run after it only if their candidate build/verified fixture copy succeeded and the run was not cancelled. This gathers separate evidence without hiding the cached probe failure or changing release gates.
