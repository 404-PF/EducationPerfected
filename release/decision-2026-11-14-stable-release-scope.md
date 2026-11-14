# 14 November 2026: publish 2026.11.14 as stable with narrowed first-release scope

On 14 November 2026 Page tested the Windows validation build of the day and
confirmed it "Closed clean", then decided: "No, publish this release as
stable." He was told this narrows the release gate and confirmed. He then set
the version: "v2026.11.14" (fixed, not derived from the publish date), and
chose to create the release manually on GitHub ("I will do it manually on
GitHub", "Don't push tag").

Scope of this decision, for release 2026.11.14 only:

- `clean-machine-no-node` evidence is waived on all five targets.
- The Windows physical-console part of `console-shutdown` is waived; hosted
  ConPTY and raw-input evidence stands, and physical-console behavior remains a
  known limit in the release notes.
- Both waivers are recorded as known limits in the release notes. They change
  no other check, the explicit unsigned policy, or any future release's
  requirements.
- This decision is not legal clearance and does not change the contributor
  rights risk decision recorded on 12 November 2026.
- No tag or release is created by the project; Page publishes manually.
