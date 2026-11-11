# Assessments phase 3: component output is not a passive snapshot

12 November 2026. Public-source mapping and local refusal tests only. Assessment answering remains disabled. No live Assessment attempt, private-account access, production diagnostic or renderer enablement.

## Result

A returned component output object is not enough to admit an Assessment question. Marking, storage and user state are separate outputs, and storage collection calls marking again. Some output failures are caught and converted to fallback values. A single unmarked component can make `editedSinceDisplayed` true without a user edit. Calling these methods merely to inspect a live attempt is not established as read-only.

This phase does not identify a complete supported Assessment renderer/markability contract. It identifies concrete reasons not to borrow a lesson handler or call live output helpers. Self-mark support remains deferred; nothing here develops or enables it.

## Sources

- [Public student chunk 171](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js), 12,955,262 bytes, SHA-256 `d6cd2c7eb1d99610fd5369acf793b75a00762646f6a8e20cb6cea396f4f47722`.
- [Public component chunk 606](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js), 14,736,150 bytes, SHA-256 `e72b68b8c06508dbfdef365f2bb8edf23bc2085c077acb48c32c5f40a934352a`.

These pins identify the bytes inspected, not the bundles a live app necessarily loads. The findings describe client code, not server acceptance, grading policy or durable saving. Named symbols below allow the map to be checked without relying on byte offsets or minified variable names.

## Output path

In chunk 171, `AnswerInputUIManager.generateAnswerSubmissionParameters` distinguishes marking output from storage output. The component manager branch calls `getOutputForMarking()`, then `outputAnswer()`, then `getOutputForUserState()`. Its readiness/default-output and identity conditions are covered in [phase 2](assessment-question-state.md).

`ComponentInputManager` delegates those calls to `identifiedComponents`, which is a `ComponentIndex` in chunk 606. The relevant methods behave as follows:

| Method | Observed behavior | Boundary for future work |
| --- | --- | --- |
| `ComponentIndex.getOutputForMarking` | Iterates sorted component IDs and each registered component. Calls each component's `outputForMarking()`. Caught component-output errors become a marked record with score/max/weight all zero. Unmarked records are omitted except when there is one component ID, where a unit score/max/weight record is produced. | A returned record is not proof that every component output succeeded. Do not infer auto-markability from presence of a score or a unit value. |
| `getOutputForAnswerStorage` | Collects each component's `outputForAnswerStorage(flag)`. A caught component-output error becomes the literal `#ERROR#` for that component. After storage collection, calls `getOutputForMarking()` again and serializes both through `UserAnswerContext`. | The storage string is not just the visible answer. It can include error sentinels and a second marking read taken at a different moment. |
| `getOutputForUserState` | Calls component `outputUserState()`, catches per-component errors as null, omits null results and serializes through `UserStateContext`. | Missing user-state entries can mean no state or a caught error. A serializable result alone does not distinguish them. |
| `getMultipleComponents` and output maps | Multiple component instances may be registered under the same ID; each loop assigns into the output map using that ID. | A general future contract must reject or explicitly model ambiguous duplicate associations rather than assuming one DOM control per output key. No such allowance is added here. |

The maps above concern ordinary non-null components with usable returned records. They do not claim that every malformed or null result is caught; exceptions outside a component-output call can still escape.

### Repeated marking read

On the ordinary component submission path, marking is read directly and then read again inside storage collection. There is no atomic-snapshot guarantee in that call sequence. This review does not assert that the two reads always differ; it says a future implementation must not assume they are the same immutable result.

`DropDownComponent.outputForMarking` supplies a concrete side-effect risk. With no selected option, it consults `componentState.shuffledOptions` to determine whether a correct option exists. `DropDownComponentState.shuffledOptions` lazily initializes its cache; without a stored restore order it sorts the metadata option array and records the resulting order. Thus an output helper can reach a state-creating getter. This is why the current lesson reader already inspects existing cached state rather than invoking that getter. It is not an authorization to invoke it in an Assessment.

### Edited state is not a human-input proof

In chunk 171, `ComponentInputManager.editedSinceDisplayed` is `edited || hasSingleUnmarkedComponent`. The latter checks for exactly one component whose `Marked` equals the unmarked enum. Consequently the flag alone cannot prove a human made an edit. The [stored-state update](assessment-question-state.md) consumes this flag separately from the actual storage output.

### Marking is not an Assessment permission signal

`InGameMarkingManager.markAnswer` chooses EP vs language-question validation. The EP path creates a validator and interprets outcomes, including self-mark/information distinctions. `AssessmentGameController.submitAnswer` passes an explicit auto-marked style, while `storeCurrentAnswer` uses the default style. Those call-site choices do not establish that a component is safe for automation or that all Assessment renderers are supported. A computed client score, default style or raw/runtime marked flag is not a substitute for the missing renderer, identity and save contracts.

No output/validator method is called by the new test. No validator, teacher-lock, timing or focus mechanism is bypassed.

## Refusal evidence

`node scripts/assessment-output-boundary-test.js` loads only local synthetic pages. It changes their mode to Assessment and installs throwing getter sentinels on question answer, definition, cached renderer, identified components, renderer method, stored answer and stored user-state fields. A deliberate local positive read confirms the sentinels work before testing refusal.

The real `detectQuestion` then refuses nine shell/mode-only question shapes before touching those fields: Assessment shell, choice, dropdown, textbox, number box, gaps, multi-select, audio and classic text. This extends the existing zero-input boundary tests to the output/renderer/stored-state read boundary. It proves this detector does not read those poisoned fields on these fixtures, not that every arbitrary live page is safe or that a live site stops its own autosave.

The separate existing lifecycle test still models pending site work, and the existing actual CLI test still checks zero generated input. All evidence remains synthetic/public-source, not live Assessment support.

## Remaining contract and next decision

A complete Assessment enablement contract remains unresolved. At minimum it needs one specific renderer's cached-to-DOM association, distinct marking/storage/user-state identities, restoration semantics, verified markability, stale/repeated-output handling and attempt-level save acknowledgement. The current work provides no evidence that those gaps can be filled by changing a lesson mode guard.

Further source-only work can narrow one named renderer and its restored state. Any proposal to run a production diagnostic, enter an attempt, edit, navigate, submit or clean up a live Assessment is outside these research phases and needs its own reviewed scope. #33 remains open.
