# Contributing

## Run from source

```
npm ci
npm run cli
```

`npm start` runs the launcher (`bin/launch.js`), which checks the Node version and dependencies before handing over to the main program. `npm run cli` runs the interactive CLI described in the README.

## Tests

All tests are local fixtures. No test or CI job may submit live Education Perfect answers, and assessments are always refused.

- `npm run smoke` - answer loop against the mock EP site (`scripts/mock-ep.js`)
- `npm run test:handlers` - Smart Lesson and audio handler end-to-end fixtures
- `npm run test:phase3` - shared-control unit tests, startup-failure and signal/cleanup coverage
- `npm run test:cli` / `npm run test:controls` - CLI command dispatch and run controls
- `npm run test:store` - credential-store contract tests with an inert adapter (never a real store)
- `npm run test:packaged` - packaged-build fixture checks
- `npm run test:beta-preparation` - validation workflow and candidate inventory policy
- `npm run test:release-gate` - release-gate validator behavior
- `npm run release:check` - the fail-closed release gate; without a reviewed `release/evidence.json` it reports "not a release"

Fixtures assert exact CLI-facing wording. If you change prompt, consent, help or error text, sweep the fixtures that pin it (the Windows ConPTY, first-run and macOS PTY fixtures under `scripts/`) in the same change.

## Commits

Commits are GPG-signed. Unsigned commits are not accepted. Squash merges through the GitHub API carry GitHub's own signature.

## Pull requests

Every pull request gets an independent review of its exact head commit and must have the required checks green (source-regression, SonarCloud, cubic AI review) before it is squash-merged. If the head moves, the review is redone on the new head.

## License and rights

Read the scope note at the top of `LICENSE` and the "License and rights status" section of `README.md` before contributing. The MIT grant covers only contributions whose copyright holders authorized it; other contributors' rights are unresolved. The owner's decision to proceed despite that is recorded as `project-rights-owner-risk-decision` in `release/downloadable-beta-policy.md`; it is explicitly not legal clearance. Third-party components keep their own licenses and notices.
