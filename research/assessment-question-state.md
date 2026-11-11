# Assessments phase 2: stored answer and update contract

12 November 2026. Public-source inspection and offline tests only. Assessment answering remains disabled. No live Assessment attempt or private-account access, no production diagnostic, and no live grading or completion claim.

## Finding

An Assessment state update is not the same as editing an answer, marking a question attempted, or completing an attempt. The client persists metadata even when the answer is unchanged. Empty and null answers have different behavior. These distinctions must stay explicit before any future renderer/editing contract can be considered.

## Source

Education Perfect's [public student chunk 171](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js), the same snapshot as the [phase 1 lifecycle map](assessment-lifecycle.md): 12,955,262 bytes, SHA-256 `d6cd2c7eb1d99610fd5369acf793b75a00762646f6a8e20cb6cea396f4f47722`. Named symbols below refer to that snapshot, not necessarily the bundle loaded by today's live application. Client calls do not establish server acceptance or durability.

### Loading and restoring

`InGameAssessmentQuestionStatesManager.preselectQuestions` reads `activityData.contentData.attemptQuestionStates`. It indexes existing state by `ContentID`, maps `QuestionIndex` to the content ID, and supplies `UsersAnswer`, `UserState`, `QuestionState` and the Assessment rendering context to question creation. `getStoredUserAnswerAndStateForQuestion` reads the stored answer and user state. `getAttemptForContentID` throws when the ID has no attempt state.

`InGameAssessmentQuestionSelectionManager.getQuestionWithIndex` can consult cached EP question state and get/create a question. It is not a passive getter suitable for an inspection command: calling it may build/cache state. The production detector in this project does not call it.

### Update matrix

`InGameAssessmentQuestionStatesManager.updateQuestionState` receives content ID, stored answer, user state, edited flag, correctness, score fraction, elapsed seconds and flag state. The inspected client performs these updates:

| Field | Condition / value |
| --- | --- |
| `UsersAnswer` | Replaced only when the supplied answer is non-null/non-undefined AND edited is true. An empty string still qualifies. |
| `Grade` | Within that same answer-edit condition only, correctness chooses 1 or 0. |
| `ScoreFraction` | Within that same condition only, uses the supplied fraction. |
| `UserState` | Replaced independently whenever supplied state is non-null/non-undefined. Empty string still qualifies. |
| `TimeTaken` | Always replaced with supplied elapsed seconds. |
| `Seen` | Always recomputed as elapsed seconds greater than zero. It is not sticky in this method. |
| `Attempted` | Previous attempted OR edited OR correct. It is sticky for ordinary boolean inputs. |
| `FlaggedForLater` | Always replaced with supplied flag. |
| `SequenceNumber` | Incremented for every update. |
| Persistence | Always calls `assessmentPersistenceService.storeQuestionState([state])`. This enqueues state; it does not prove durable server saving. |

Consequences: null plus edited true can mark attempted without replacing the stored answer. Correct plus edited false can mark attempted without replacing grade/score. A time-only or flag-only update can persist without marking attempted. These are observed client mechanics, not allowances to generate those states or assumptions that malformed inputs are accepted.

### Submission-parameter generation is not passive

`AnswerInputUIManager.generateAnswerSubmissionParameters` waits up to 2.5 seconds for question input readiness, then checks the input manager's `associatedContentID`. Depending on the manager kind it calls `getOutputForMarking()` or `outputAnswer()`, then obtains storage output and user state. It captures `editedSinceDisplayed` and checks current content identity before returning. The EP-component branch has separate marking and storage outputs; they must not be conflated. The non-component path can call `outputAnswer` more than once.

When a readiness wait fails, this method can return its initialized parameter object, including a question and default empty outputs. The optional loading short-circuit can also return that initialized object. A returned object is not evidence of a completed/current input read. This does not imply that the defaults overwrite an answer: the update condition above is a separate boundary.

No runtime inspector is introduced here. The behavior and side effects of every input-manager output method still need mapping before calling one could be described as safe observation. Smart Lesson's activity auto-marking gate is not an Assessment markability contract.

## Verification

`node scripts/assessment-question-state-test.js` runs a deliberately original, simplified offline model against twelve literal expected rows. It covers edited/unedited, correct/incorrect, null/undefined/empty answer and user-state distinctions, flag/time-only saves, sticky attempted, nonsticky seen, sequence increments and isolated write snapshots. This model is not EP code, a server simulator, renderer behavior or production validation.

For reproducible source checking, download the cited public bundle to a local file, then run:

```sh
node scripts/assessment-question-state-test.js --source /path/to/downloaded-chunk171.js
```

The optional audit refuses any byte snapshot whose SHA-256 differs from the pin. Only after matching does it isolate the named `updateQuestionState` function and execute those same twelve rows with a stubbed content lookup and persistence sink. It does not execute the full application, load a website or send a request. This verifies the field matrix against that actual client function, not merely our own model. The VM timeout applies only while creating the function expression; its body runs later via `.call()` without a VM execution timeout. This is not a security sandbox. Safety depends on the exact hash pin and review of that specific function body, not on isolation for arbitrary downloaded code. Hash mismatch is a research blocker, not permission to update the pin without reviewing the source.

The normal test chain uses no network or downloaded bundle. The optional source audit was run separately against the pinned bytes and passed. Browser/CLI Assessment refusal tests remain separate. No renderer, server persistence, concurrent autosave or live attempt behavior is proved by this matrix.

## Remaining work

Next, map the Assessment rendering/markability inputs independently of lesson activities, with a specific cached renderer and its storage/user-state representation. Until that is grounded, do not reuse a lesson handler by changing its mode guard. No edit, navigation, submission, cleanup or direct API action against a live Assessment is authorized by this phase. #33 remains open.
