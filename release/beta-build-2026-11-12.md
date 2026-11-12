# V2026 beta build preparation result, 12 November 2026

Candidate label: `2026.11.12-beta.1`. Source: `352bf6ada59d97f6e7691397781cc478be3d8693`. Source package version: `2026.0.0`.

[Hosted build-only run](https://github.com/404-PF/EducationPerfected/actions/runs/43135645352) completed successfully for validation and all five native build lanes. Each lane built a fresh development executable and printed its manifest/checksums after checking source stayed clean. The manifests identify the expected browser pin as `156.0.8078.47`, not an observed browser-launch version.

| Native target | Executable bytes | Executable SHA-256 | Inventoried files | Job |
| --- | ---: | --- | ---: | --- |
| linux-arm64 | 318639232 | `3351e85eb133359af2a8e1b500c9d8122aa0860cc3cec8e2582a4773addb5150` | 37 | [Build log](https://github.com/404-PF/EducationPerfected/actions/runs/43135645352/job/130910279125) |
| linux-x64 | 317852864 | `be445e2b0525f29ab76e589d11af61567325b3b8501b797b27dd6f4ca54a4dfb` | 37 | [Build log](https://github.com/404-PF/EducationPerfected/actions/runs/43135645352/job/130910278964) |
| macos-arm64 | 303910112 | `49574ffe2e92fbae0bf55f8912969dc3fb90308c76c25a30300fb64127474983` | 36 | [Build log](https://github.com/404-PF/EducationPerfected/actions/runs/43135645352/job/130910278944) |
| macos-x64 | 313005424 | `d311b8856872f0ce11cfc73fcd8bb130d827ddef0a78a1346171e1759c8e37ad` | 36 | [Build log](https://github.com/404-PF/EducationPerfected/actions/runs/43135645352/job/130910278909) |
| windows-x64 | 305192448 | `c1ec6c6b293a534015c90c80060d623bd07aa90265234d41252f1c12686daf5e` | 36 | [Build log](https://github.com/404-PF/EducationPerfected/actions/runs/43135645352/job/130910278932) |

## What this proves

- The exact source builds on the five selected hosted native targets using the existing development builders.
- Candidate contracts, release-gate unit tests, synthetic bootstrap checksum tests and builder preflight contracts passed in each lane.
- Each lane produced an executable/notice inventory and streamed SHA-256 values. No missing-notice warnings appeared in these logs. Notice files being present does not settle their adequacy or distribution rights.
- The run uploaded zero Actions artifacts. No release or tag was created. Executables were discarded with the runners; hashes remain in the logs and this record.

## What this does not prove

This was not a native app launch, normal saved-login test, clean-machine/no-Node test, Ubuntu 24 sandbox check, Windows startup fix, release signing/notarization check or live EP run. It is not platform certification or authority to distribute. Each candidate manifest (`CANDIDATE.json`, not the embedded-browser `manifest.json`) states `build-only-not-for-distribution` and `publicationAuthorized:false`.

The local Linux SEA build before this run was killed by SIGKILL. The hosted Linux build results above are separate successful evidence; they do not explain that local resource failure.

## Publication remains separate

The November 3 code-only scope and removed work remain unchanged. `release:check` and `release/criteria.json` were not relaxed. Before a downloadable executable beta, Page must choose whether to re-add the relevant release clearances or choose a narrower source-only publication with its limits explicit. No version change, tag or release is authorized by this record. No stable-release date is promised.
