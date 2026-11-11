# Assessments: source-only lifecycle map

Checked 12 November 2026. Scope: public student source and local synthetic fixtures only. Assessment answering remains disabled. No live Assessment attempt or private-account access is part of this work. There is no live graded input, submission or completion proof. This is phase 1 of #33, not Assessment support being released.

## Recommendation

Keep the Assessment stop boundary. Do not reuse a Smart Lesson handler by changing its mode guard. First separate question editing, navigation, attempt submission and durable persistence into independent contracts. A UI transition is not a save acknowledgement, and avoiding the Submit button does not prevent saves.

## Source and method

Primary source: Education Perfect's public [student chunk 171](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js).

The fetched bytes have SHA-256 `d6cd2c7eb1d99610fd5369acf793b75a00762646f6a8e20cb6cea396f4f47722` (12,955,262 bytes). This pins the snapshot inspected, not a promise that the current app still loads it. Search the named symbols below; byte offsets and minified local variable names are intentionally not the contract. No private attempt content was collected. Public client code establishes what the client calls, not what a server accepts or ultimately commits.

This narrow review uses the primary source, rather than treating unrelated articles or the issue description as evidence. The existing detector and refusal tests were inspected separately in this repository. The fixture is an original, deliberately simplified model; it does not execute copied EP functions.

## Lifecycle and side effects

| Entry point / symbol | Observed client behavior | Consequence for a future implementation |
| --- | --- | --- |
| `AssessmentGameController.initialise` | When `wasStarterUsed` is true, sets persistence attempt/session context; after base initialisation, disables pause of game time and starts autosave. Otherwise finishes with forward-navigation reason. | Entering an attempt is not equivalent to reading a lesson slide. Starter and resume state need separate contracts. |
| `startAutoSaveTimer` | Clears an existing interval, then schedules `storeCurrentAnswer(true)` every 10,000 ms. | Input may be stored without pressing Submit. Stopping our loop cannot promise zero site-generated writes. |
| `storeCurrentAnswer` | Gets current submission parameters, marks the current answer, reads elapsed time and flag state, then calls `updateQuestionState` when parameters include a question. | Even an autosave crosses marking and persistence boundaries; it is not just a DOM read. |
| `displayQuestionIndex` | Except for initial display, restarts autosave and awaits `submitUserAnswer`; only then checks timer readiness and displays the requested question. | A failed readiness check can occur AFTER the current answer has been submitted. Navigation is not a harmless preview. |
| `submitAnswer` | Stops the question timer, marks the answer, updates question state and results stats, then optionally displays the next question. | Question submission and whole-attempt completion are different operations. |
| `flagQuestionForLater` | If flag state changes, updates the UI model and calls `storeCurrentAnswer(false)`. | Flagging can save the current answer too. |
| `displayQuestion` | Stores a navigation event, restores stored user answer/state and displays the question. | Viewing a question can enqueue a navigation write. |
| `startGame` / `useLockDown` | Depending on security level/debug flag, configures focus tracking with live activity feed, focus tracking, fullscreen and strict warning style, then enables it. | Not all attempts have identical security settings; no assumption that offline inspection is safe inside a live attempt. No bypass is proposed. |
| `onTimeEvent` / `onCloseEvent` / `onFreezeEvent` | Timeout calls whole-attempt submission. Teacher-close awaits `submitAssessment(false, false)`, including completion persistence but suppressing its usual finish path, then finishes as teacher-ended. Freeze can finish as teacher-locked. | Teacher events and time expiry can race with editing or navigation. They cannot be treated as normal Next actions. |
| `finishGame` / `finaliseGameStats` | For early-exit, page-removed and teacher-lock reasons, saves exit and awaits submission of current answer. Forward-navigation skips that work. Error/submitted/expired/teacher-ended reasons route differently. | Leaving the UI is not guaranteed to discard input. Do not introduce an exit/cleanup call as a supposedly read-only safety operation. |
| `cleanUp` | Flushes persistence, removes listeners and clears the autosave interval. | Cleanup itself can trigger queued persistence. The current refusal does not invoke EP cleanup. |

## Whole-attempt completion is asynchronous

`AssessmentGameController.submitAssessment`:

1. Disables the timebox if enabled.
2. Awaits `markAttemptAsSubmitting()`. A response with `Success` false is thrown. The catch handles the exact string containing `Attempt not in Underway state` by finishing with an error and returning. Other caught failures are logged and the method continues. This is observed client behavior, NOT a retry policy to adopt.
3. Awaits `submitUserAnswer()`.
4. Calls `completeAssessment()` without awaiting a completion acknowledgement and finalises activity stats.
5. Depending on arguments, finishes as submitted or time-expired; clears its save interval.

`AssessmentPersistenceService.completeAssessment` creates a deferred completion object and sets a completion flag. Pending question/navigation state triggers an immediate update; otherwise it begins completion saving. `onSaveUpdateSuccess` removes acknowledged state/events, may schedule another update, and can call `saveComplete`. `onSaveCompleteAttemptSuccess` resolves the deferred object and dispatches a save event. Update and completion failure paths have their own retry counters/delays.

Therefore neither the controller method returning nor an end screen alone establishes durable completion. The current program does not observe these acknowledgements and makes no Assessment completion claim. The owner-token choice inside `markAttemptAsSubmitting` is another reason not to replay a guessed request or invent a direct API path.

## Synthetic evidence and its limits

Run `node scripts/assessment-lifecycle-test.js`, plus the existing `assessment-boundary-test.js` and `assessment-cli-test.js` (all included in `npm run test:handlers`).

The new local fixture exposes explicit autosave, navigation, flag, focus, early-exit, teacher freeze/force-submit, expiry and completion edges. It uses no clock, network, credentials, real IDs or answer content. Input, ArrowRight and a fixture Submit button are wired to sentinel effects; positive controls prove that wiring is not inert. Completion leaves a pending save after simulated UI exit.

The real `detectQuestion` is then checked before/after each independently triggered lifecycle edge: it returns the Assessment refusal without reading `validAnswers`, adding input/click/key/submit events, changing pending state or calling lifecycle methods. A queued synthetic save can still flush after refusal. That last assertion limits the safety claim to what the program controls.

These are source-shaped risk/refusal fixtures, not a server emulator, tests of EP's actual controller, proof of retry correctness, or live support. They do not establish actual grading, elapsed-time handling, event ordering under real concurrency, or durable completion.

## Next phases and unresolved contracts

1. **Offline editing contract:** identify which Assessment question renderers expose an existing stored answer and markability state, independently of Smart Lesson's `isAutoMarked` activity gate. Specify stale-question, mixed/manual and partial-answer refusals. Build synthetic renderer/state fixtures first. Keep production mode-2 refusal.
2. **Offline attempt contract:** define distinct observe/edit/navigate/submit states, identity/time/lock checks, save acknowledgement and failure handling. Cover races with autosave, teacher freeze/force-submit and expiry. Do not infer server guarantees from client callbacks.
3. **Any live validation or enablement:** outside this source-only phase. Requires a separately reviewed plan and explicit permission for the exact live scope. No live graded attempt is authorized here. Merging this research does not authorize one.

Unknowns still include markability by Assessment question type, how an in-flight edit is associated with a resumed attempt, the complete renderer-to-stored-state contract, and an authoritative durable completion signal under retries. Until those are grounded, Assessment support must remain a refusal, not a lesson handler with its guard removed.
