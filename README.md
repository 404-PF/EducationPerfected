# EducationPerfected

#### A JavaScript program that automatically answers Education Perfect language questions at **super** speeds.
Works for word-to-word (translation) tasks and Dash mode, which have been run end-to-end against the live Education Perfect service. It also supports audio tasks (Listening and Dictation) and multiple-choice questions in auto-marked Smart Lessons: the live site was inspected to confirm the question markup and answer state. On 30 October 2026, the actual program also passed bounded live checks for Listening, Dictation and single-choice: one accepted submission per mode, then stopped. No full task or lesson was completed. Local fixtures ([scripts/handler-test.js](scripts/handler-test.js)) cover multi-round and refusal behavior; those are not full-task live proof.
Multi-select choices additionally have source-derived synthetic coverage for explicit auto-marked cached renderers, not live multi-select proof. Guarded ordinary dropdowns have synthetic Linux coverage plus one bounded live F4 popup submission that EP marked correct before the page advanced; broader live selection and acceptance proof remains limited. Unsupported Smart Lesson question types are detected and reported, not guessed at. Short-answer lesson questions are handled too, but that shape hasn't been verified against the live site yet.

![example image](result.png)


## Status

> [!WARNING]
> **Heads up:** this repository continues the original EducationPerfected project. It is *not* the original, actively maintained project.

The original was started by [akioweh](https://github.com/akioweh) and is now **[archived](https://github.com/akioweh/EducationPerfected)**. This repo is a loving continuation of that work.

The original's README used to claim its status was: **_CURRECT STATUS: ALL intended features functional._**  
_*Last time they checked... which was... two years ago???*_  
That has since been re-verified here: **the program has been run against the live Education Perfect service and confirmed working** for the supported (word-to-word / Dash) tasks. Don't assume it stays working forever, though - EP can still change.

- This repo's development program is **V2026** (package version `2026.0.0`), not a published packaged release: an independent JavaScript ([node.js](https://nodejs.org/)) program that uses the [Puppeteer](https://github.com/puppeteer/puppeteer) library to drive a web browser around.
- As of the latest updates, the anti-cheat workaround no longer trips anti-cheat detection.
- The program has been run against the live Education Perfect service and confirmed working for the supported (word-to-word / Dash) tasks.
- The task-page and wrong-answer-modal selectors were checked against what EP's live bundles currently ship, and an end-to-end run through a real task on the live service confirmed the markup reading was correct.

## Introduction
This project started as a way to automate tasks on [Education Perfect](https://www.educationperfect.com/) 
which teachers use to set students (of various ages) homework... and one of those students happened to be me.
As a perfectionist myself, I set out to perfect Education Perfect - that's how EducationPerfected was born.  
The main goal/target were and still are language tasks that require you to translate words/phrases from one language
to another.  
Of course, there are also tasks in the same format but with audio involved. _Those used to be out of reach;
they are supported now (see below)._ 

The obvious approach was to write a simple userscript in JavaScript that gets injected into the browser 
debugger console. This is the classic method to perform simple automation in browsers. This method is simple, 
cross-platform, and required minimal skill to install & run the script - it was very easy and universal.  
_This was [V1](V1_Archive) of this project._  
It worked great, and notably, at **super** speeds. However, after a long while, Education Perfect released 
anti-cheat features that partially disabled the userscript.

To circumvent this, the script needed more control over the web page and must not run in the page debugger console.  
_The independent program started as V2 and now continues in V2026 development:_
**At the current stage**, it's an independent JavaScript ([node.js](https://nodejs.org/)) program that uses the 
[Puppeteer](https://github.com/puppeteer/puppeteer) library to carry out web-browser automation. The goal is the same
as V1 and the functionality is largely the same. Unfortunately, the standalone structure does make installation slightly 
more complicated, but it is currently the only way to enable full anti-cheat bypass.  
Either way, I have provided detailed instructions for installation and usage below.

A snapshot of V2 at version **v2.2.0** is frozen in [V2_Archive/](V2_Archive), alongside the
[V1](V1_Archive) snapshot. The live root codebase continues as **V2026**, skipping V3 as a release name.
All fixes and new work happen here; the copy in [V2_Archive](V2_Archive) stays read-only
(see [V2_Archive/README.md](V2_Archive/README.md) for exactly what was frozen).
This version name does not mean the packaged CLI has shipped; its release gates still apply.


## Installation
1. download the EducationPerfected program, starter script, launcher, and test scripts ([index.js](index.js), [start.cmd](start.cmd) or [start.sh](start.sh), the [bin/](bin/) folder, and the [scripts/](scripts/) folder) and place them in the same folder  
   (the scripts expect [package.json](package.json) and [package-lock.json](package-lock.json) in that same folder - get them from the repo; if you copied the files out of a git checkout, copy those along with the `bin/` and `scripts/` folders)
2. install [node.js](https://nodejs.org/) - version **22.12 or newer** for running the source program (that's what the pinned Puppeteer requires). Building a standalone development executable requires **Node 22.23.4 exactly**, as explained below.
3. open Command Prompt/Terminal **in the folder where `index.js` is located** (right click -> open in terminal or use the `cd` command to change the directory)
4. install the dependencies with `npm ci` in your opened Command Prompt/Terminal window
5. set your **Education Perfect credentials** as environment variables - the program will use them for auto-login  
   - **Windows (Command Prompt):** `set EP_EMAIL=you@example.com` then `set EP_PASSWORD=your-password`  
   - **Windows (PowerShell):** `$env:EP_EMAIL='you@example.com'; $env:EP_PASSWORD='your-password'`  
   - **Linux/macOS (Terminal):** `export EP_EMAIL='you@example.com' EP_PASSWORD='your-password'`  
6. dropdowns in the normal run always use the guarded F4 native-popup path; no environment variable is needed. This path handles one or more dropdowns in order and asks once in the terminal before that question's Submit; only `yes` approves the visible question once, and anything else stops without Submit. There is no Home/ArrowDown fallback.


_*The starter scripts run `npm ci` for you the first time if `node_modules` is missing, so double-clicking is enough. `npm ci` installs exactly what [package-lock.json](package-lock.json) records, preserving the tested lockfile._  
_*To enable auto-login, set **both** `EP_EMAIL` and `EP_PASSWORD` before running the script (and keep
the credential values out of the source file). Forgot to set them? No worries - the browser still opens and you can
log in manually. If the terminal then asks for your credentials, you can also just ignore it and sign in in the
browser: a login that completes there cancels the prompt by itself (school SSO, Google, Microsoft or Clever too).
Keep credentials out of the source file by using the environment variables above._  
*_Auto-login only fills in EP's own username/password form. If you sign in through your school account (SSO), Google,
Microsoft or Clever, log in manually in the browser window; the script never touches those flows or the reCAPTCHA
on EP's login page._


*NOTE: `npm ci` normally downloads a compatible Chrome browser automatically (via Puppeteer's install script). If the first run complains that it can't find a browser, open up Terminal in the same folder and run 
`npx puppeteer browsers install chrome` to download it manually. If your npm is configured not to run install scripts (for example npm 12's `allowScripts` gate), the download is skipped and this step is required.*


## Usage
### Running the script

Once installed, there are different ways to run the script using Node.js, but the basic way is to open up Terminal and 
type `node "[path to file]"` - e.g. `node "C:\index.js"` (unless .js when, double-clicked, executes with node by default)  

Alternatively, I have provided simple "start" scripts that basically saves the above command in a simple shell script
that you can double-click to run. [start.cmd](start.cmd) is for Windows, and [start.sh](start.sh) is for Linux/Mac (bash).
Save the appropriate starter script in the ***same** folder as index.js* and double-click it to run the script.

You can close the browser window or the popped-up terminal window whenever you are done.  
If you run into weird behavior, try restarting the program.

### Dependencies
The program's only runtime dependency is [Puppeteer](https://github.com/puppeteer/puppeteer), pinned to **25.16.0** in [package.json](package.json) and locked (with its own dependencies) in [package-lock.json](package-lock.json). Each Puppeteer version pairs with a Chrome build that it downloads and launches - Chrome 156 for this one. Install with `npm ci`, or just use one of the starter scripts, which run it for you when needed. To bump Puppeteer, change the version in `package.json`, run `npm install`, and commit the updated lockfile.

That version was exercised by a local smoke test ([scripts/smoke-test.js](scripts/smoke-test.js)) against a mock EP site ([scripts/mock-ep.js](scripts/mock-ep.js)) covering the Puppeteer calls this program makes: login form fill and submit, reading the word lists, typing and submitting answers, reading and dismissing the wrong-answer modal, and the completion screen. Run it yourself with `npm run smoke` (use `SMOKE_HEADFUL=1` to watch a visible window, or `SMOKE_EXECUTABLE_PATH`/`SMOKE_BROWSER_URL` to target a browser you already have).  
The Smart Lesson and audio handlers have their own end-to-end test ([scripts/handler-test.js](scripts/handler-test.js), run it with `npm run test:handlers`). It drives the program's real answer loop against local fixtures ([scripts/mock-ep.js](scripts/mock-ep.js)) that were built from notes taken while inspecting the live site (a multiple-choice lesson slide and an audio task, sanitised of account data) - they are reconstructions, not recorded sessions.  
The interactive CLI groundwork has a separate local regression command: `npm run test:phase3`. It runs shared-control unit tests, startup-failure tests for all three entrypoints with both invalid-URL and connection-refused scenarios, startup and legacy-entrypoint SIGINT/SIGTERM cleanup, pending-launch cancellation feedback, the CLI browser fixture, and stop-during-completion-proof coverage. Run `node scripts/cli-test.js --signal` and `node scripts/cli-test.js --external-close` for signal and external-browser-close cases. These are local fixtures, not live-service or cross-platform release certification. Only the Windows taskkill path resolver has unit coverage; the cleanup itself has not been executed on Windows.
*This smoke test proves the dependency setup works. An end-to-end run against EP's live service (not just the mock) has since confirmed the supported word-to-word/Dash task flow works as expected - though the live site can still change, so re-verify if you suspect breakage.*

### Features
**Start Answering**: There's one main function - automatically answer questions when you're doing a task.  
It reads each question, finds the answer from the pre-learned dictionary, and submits it... all at **super** speeds.
There are also bonus features like deleting popup modals when an answer is wrong to keep the speed up and learn
from mistakes.

**Toggle Mode**: There are (currently) two "modes" of auto-answer: fully-auto and semi-auto.  
Fully-auto will blast through the task at **super** speeds once initiated, without intervention. Semi-auto will type the 
answer in for you, but leave pressing the enter key/submit button to you, so you can control how fast and when it 
answers. (Useful if your teacher checks how long you spend on tasks.)

**Refresh Words**: There's also a supplementary action to learn the answers from the word lists present at the task starter
pages. (Where the words and translations are laid out.)  
This function must be manually triggered for each new task with new words, otherwise you will get a lot of questions
wrong when the program doesn't know the answers. (It will learn all of them eventually, thanks to error-correction
features, but it is a lot slower.)
Note that the learned dictionary lives only in the running program's memory - restart the program and you'll need
to press Refresh Words again for the task's word list.

All three functions (**Start Answering**, **Toggle Mode**, and **Refresh Words**) are triggered by keyboard shortcuts
outlined below.

### Hotkeys

Upon starting, the program opens the browser and gets EP ready (including logging in if credentials are set) - but it does not begin auto-answering until you tell it to.  
**All functions are triggered via *hotkeys/keybindings* as listed below:**

- **Refresh Words -> <kbd>Opt/Alt</kbd> + <kbd>R</kbd>:**  
  *To be used on task-starter page with list of words and translations*  
  Confirms with a small toast at the top of the page - including how many entries were scraped (and a warning if the two word lists didn't line up).

- **Mode Toggle -> <kbd>Opt/Alt</kbd> + <kbd>A</kbd>:**  
  *Can be used whenever*  
  Can toggle answering mode on-the-fly even with Auto Answering active.  
  Confirms with a toast on the page which mode is now active.

- **Start Answering -> <kbd>Opt/Alt</kbd> + <kbd>S</kbd>:**  
  *To be used on a running task's page (after clicking start)*  
  The Auto Answering can be stopped by pressing the same hotkey again.  
  No Alerts because it is obvious when it is running.

*NOTE: due to how key combination detection works, the sequence you press the keys must be precise to trigger the
functions; PRESS Alt, PRESS & RELEASE letter key, RELEASE Alt... If you release Alt before releasing the letter key,
it won't be detected. (On macOS, pressing Option + a letter types the special characters ®/ß/å - those are accepted too.)*


## Details
### Expected behavior
When you run the script, it should:  
* Open a new browser window (that does not have any user data, so you log in to EP manually - or set both the `EP_EMAIL` and `EP_PASSWORD` environment variables for auto-login);  
* Load EP's login page. It is no longer served from `app.educationperfect.com`: that address redirects to EP's identity provider (`iam.educationperfect.com`), where the same username/password fields live;  
* Load EP home page;  
* All auto-answer functionality is loaded in the background, ready to be used whenever;  
* Log in for you if you provided your credentials (username/password only - SSO, Google, Microsoft, Clever and any CAPTCHA must be completed by hand);  
* Cancel the terminal credential prompt by itself when the login completes in the browser first - so signing in by hand requires no terminal interaction at all, and answering the prompt after a completed login can no longer crash the run.  

Then, you can:  
* Log in manually if you _really_ want to (why?);
* Navigate through or use EP as normal - the hotkeys keep working across page loads (they get re-installed on every new page);  
* At appropriate pages (task starter, task page), use the hotkeys to answer questions.

When auto-answering is triggered, it should:
* Immediately start grinding through the task at several questions per second - each answer is typed out as real keystrokes and only submitted once the answer box is verified to contain it
* Stop when it finishes the task
* Stop when you press the same hotkeys again
* Quickly _delete_ the popup modals should it get any questions wrong
* Retry the occasional slow round instead of aborting the whole task

The program also keeps an eye on itself: if the page gets stuck in a state it can't make progress from (question text that never settles, an answer box that keeps vanishing, rounds that never advance), it stops the run and logs the reason in the terminal instead of hanging around or submitting garbage. Press the Start Answering hotkey again to start a fresh run.

_NOTE: If you close the terminal window that pops up when you run the script, the browser window will close too_

### Feature-Explanation

- **Full Speed Auto Answer:**  
  The speed is a deliberate trade-off: answers are typed as real keystrokes, spaced out and verified against the answer box before submission, because EP's own input handling garbles faster-but-fragile approaches ("I speak" used to land as "I I sI speakeakat").

- **Self-Learning/Error Correction:**  
  When an error is made (due to bad question/answer parsing, lag, or missing word list), the script handles the popup and extracts the correct answer information to stop making the same mistake again (hopefully).  
  The incorrect answer popup has a normal delay of 3 seconds before you can close it, but that's slow, so it instead gets deleted :P

- **Smart-ish Word Parsing:**  
  A big source of incorrect answers is when no answer is found due to unsatisfactory matching (of the question to an answer).  
  Education perfect is annoying in the sense of having horrendous formatting standards. The entries on the word list can 
  be displayed differently as a question (and there are many unique edge cases).  The script handles *most* of these 
  edge cases, and for those that still fail to match, the self-learning function will take care of that in *most* of the 
  remaining scenarios. There are still extreme cases of very bad formatting (such as commas with repeated words and 
  blatant disparities between displayed answer and expected answer) where a question may not get correctly answered. 


## Plain block single-choice source contract

A narrow additional path handles single-choice options whose entire raw and resolved templates are a supported multiline `[block` wrapper with plain inner text and a standalone closing `]`. It does not remove arbitrary bracket sections. Each choice must already have a unique cached component/state/option/preview/DOM association, a renderer template equal to its resolved option, and rendered inner text equal to the supported plain body. All correct options must be displayed. Images, formulae, nested directives, mixed wrappers/plain options, editable fields and unknown block attributes stop unanswered.

Source: [EP public chunk 606](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js), checked 5 November 2026. `TemplateParser` opens a format block on its own line, renders inner paragraphs and closes on a line starting with `]`. This handler intentionally accepts only a standalone `]`, a narrower contract. `AdvancedRenderer.identifiedComponents` is a read-only getter returning `parser.identifiedComponents`; this path reads the existing own parser/index data instead of invoking that getter or creating a renderer. It preserves the existing exact raw/resolved template and marking signature checks before selection and at click time. The final check and trusted click are not atomic against page or user changes.

Two user-run, read-only aggregate checks on a failing plain-text slide established that raw correct text was erased by multiline bracket stripping, and the cached index lookup encountered the inherited getter. They did not establish the exact private template grammar or complete cached association. This implementation uses invented source-derived fixtures, not captured account data. No live selection, submission, grading or whole-lesson completion has been verified for this new path; a different bracket shape remains unsupported. Existing plain choices and strict formula choices retain their separate contracts.

## Multi-select source contract

The multi-select fixture (`scripts/multi-choice-fixture.js`, served at `/lesson-multi` by the local mock) is invented and sanitized, derived from EP's public renderer bundle, not captured from an actual account or live multi-select slide. Source retrieved 4 November 2026: [chunk 606](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js).

- `MultiChoiceComponent.createQuestionVisualElement` uses `role="group"`, the `multi-select` class and checkbox previews. `MCQPreviewOption.select` toggles selection and updates `isSelected`, checkbox state and `aria-selected`.
- `onOptionSelected` records IDs from `originalMultiChoiceOptions`. `selectAndReturnOptions` may display only a subset based on `CorrectDisplayed`/`TotalDisplayed`; the correct target is therefore the resolved **displayed** set, not every raw `Correct` value or a DOM position.
- The handler reads only existing cached objects. It requires one exact component, resolved metadata/original/displayed/preview identities, unique templates, matching renderers and complete selection state. It never calls EP's internal selection/marking methods, creates a renderer or changes answer data. Trusted DOM clicks are checked after each selection. An ineffective or uncertain click stops without retry.
- Both automatic and semi-auto selection use the same checks. Semi-auto does not submit or advance. Automatic mode submits exactly once only after the selected set matches the current correct set; existing keyed advance checks apply. Selection is re-read after Submit handle retrieval and immediately before the trusted click. This is not an atomic lock against concurrent page or user input after that final read. An uncertain Submit click stops without retry. This is not general assessment support.

## One-question multi-select selection validation

`node bin/validate-multi-select.js` opens an exclusive stopped session. After fresh approval for one named initially empty auto-marked Smart Lesson multi-select question, `select once` consumes the process attempt before inspection, uses the existing guarded handler with submission disabled, verifies the exact DOM/native/ARIA/cached answer set, and stops. Browser answering hotkeys and ordinary start/mode/refresh commands cannot run the answer loop. Refusal, cancellation, partial/uncertain input and success all consume the attempt, including after page changes. No Submit, Next, clearing, prefilled-answer correction or retry is exposed by this helper. A process restart is not approval to try again.

Selecting can save or grade even without Submit. Stop cannot undo a click already dispatched; the final read and click are not atomic against page/user changes. `selected-only` proves the exact selected set was verified, not acceptance, saving, points or full-lesson completion. Synthetic Linux browser and real-program CLI proof only, no live multi-select proof. The existing textbox equivalent is `node bin/validate-textbox-fill.js`; it is also one consumed fill-only attempt and requires its own named-question approval.

## Drag-and-drop fill-in-the-gaps contract

A narrow handler supports one explicitly auto-marked Smart Lesson `FILL_IN_GAPS_COMPONENT` with `InputType === 2`, initially empty gaps and plain-text options. Repeated exact labels are supported only when each DOM-ordered gap has one distinct correct displayed label and enough separate source tiles exist. Tiles are assigned once in source DOM order across the whole gap list, including the filled prefix; each filled gap must retain that exact source index and the corresponding used-tile state. Padded look-alikes, insufficient copies, reused source indexes, multiple different correct displayed labels for a gap, textbox variants, prefilled/stored answers, missing cached state and mixed-component slides stop unanswered. Repeated-label support has synthetic browser and real-program CLI coverage, plus the one-question live validation described below. This is not general matching or assessment support.

Source: [EP public chunk 606](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js), retrieved 4 November 2026. The handler reads resolved cached gap IDs, correct options, displayed gaps, source items and inline renderer identities. EP's own keyboard accessibility path puts a source option into the next empty gap in DOM order. The handler uses trusted Enter events on those source elements, not internal EP selection/marking methods, generated renderers or guessed drag coordinates. It checks the full answer prefix and cached identities after every input, then the exact final set and associated Submit button before one click. An uncertain input stops without retry. Semi-auto fills only and leaves submission to the user. It never clicks Next on the same question key.

`scripts/gaps-fixture.js` and `/lesson-gaps` are invented, sanitized, source-derived fixtures, not captured live questions. Local tests cover DOM/metadata order differences, undisplayed gaps, trusted inputs, exact one-submit behavior, the real program loop, refusal and stale-state controls.

Live validation is limited to these user-run, separately approved attempts:
- On 5 November 2026, the user reported `EP_FILL_ONCE {"status":"filled-only"}` on one practice question, then manually clicked Submit and reported `Correct`. This was fill-only automation with manual submission.
- On 6 November 2026, using revision `6d5d3e544a40f01e076464dd9c2e5959fa1ad3bf`, the user ran the one-attempt fill-and-Submit validator on one practice question with repeated exact tile labels. The terminal reported `EP_SUBMIT_ONCE {"status":"submitted-once"}`; the page advanced to the next question, and the user confirmed the submitted question showed as correct. The terminal result proves dispatch, while correctness is user-reported; an exact points amount and a result screenshot were not verified.

The second result supports filling, one automated Submit and acceptance for that one repeated-label question only. It does not prove full-lesson completion, every gaps question, cross-platform compatibility or support for the next question's dropdowns. Each approval was consumed by its attempt. The final state read and trusted input/click cannot be atomic against concurrent page or user input; an uncertain result must not be retried without fresh approval.

## Dropdown refusal diagnostics

The validator prints `Dropdown validator build: dropdown-diagnostics-v2` at startup. If that line is absent, download a fresh source ZIP and install dependencies again before using these diagnostics. A refusal still consumes the attempt. Do not run `submit once` again without fresh approval.

The dropdown validator also offers `inspect`: a read-only diagnostic command available only while stopped. It does not start answering, consume the one-shot attempt, reset a consumed attempt, select an option or submit. Open the target question, type `inspect`, send the complete `EP_DROPDOWN_INSPECT` line privately, then `quit`. Do not use `submit once` merely to collect evidence. This inspection command is exclusive to the dropdown validation session, not normal answering modes.

For `definition-type-id-or-marking`, diagnostics include only allowlisted typed scalar fields: raw definition type/id/Marked, cached component id/marked/render mode, cached metadata type/id/Marked, lesson mode and section auto-marking. Missing/null/string/number remain distinct. Safe identifier strings are bounded to eighty ASCII identifier characters; arbitrary strings are redacted to type/length. The new `inspect` output omits DOM option text/values and selection entirely; existing refusal DOM diagnostics below still include displayed options. Raw definition objects and model answer flags are never serialized. Failed-field flags describe the own-data snapshot, not accessor results. This accepts only matching raw/metadata numeric 0 or 1 with runtime marked 1; no acceptance rule is loosened by the diagnostic.

An initial `requires-supported-empty-dropdowns` refusal now includes bounded, read-only `diagnostics` in the same `EP_DROPDOWN_ONCE` line. It reports the first failed detector guard, each inspected frame's index/main-frame status, question-container presence, question-select state, question-option text/value/selection, counts of out-of-question selects (no text or values), and open shadow-host count. This can distinguish missing selectors, other frames, cached/DOM mismatch, raw metadata mismatch, and unsupported defaults. A supported-but-prefilled detector reports `filled` flags rather than treating blank appearance as proof. Only the main document remains eligible for answering; diagnostics never switch the answer target to a frame or shadow root.

A selection-stage refusal additionally reports `selectionDiagnostic` with a fixed phase/guard, zero-based dropdown index (or null before targeting), and count of key dispatch calls that returned. It uses the current selection or settlement read, with no separate diagnostic read or extra input. Settlement may poll read-only as described below. It distinguishes preflight/baseline, target/focus, Home/ArrowDown, F4 popup-open, popup ArrowDown/Enter and final-verification failures, including DOM/cache mismatch. The ordinary handler also names submit-target and post-selection phases; those may occur after selection or Submit. It contains no option text, answer value, identifier, URL or exception text. A returned key call is not proof that a selection landed; a throwing dispatch may already have delivered input. The attempt stays consumed and no retry is added.

The report includes displayed option text and selected values only under `#ep-question-container`; unrelated selects are counted without text/values. Keep it private when sharing logs. It omits surrounding question/student text, URLs, cookies, model answer flags and raw Angular/model objects. Limits: eight frames, twenty selects per frame, fifty-one options per select, one hundred sixty characters per text/value; truncation and unavailable inspection are explicit. Open shadow roots are counted, not traversed. Collection stops waiting after two seconds or a stop request and starts no further frame evaluations; an already-started read may still finish remotely. Incomplete collection reports timeout/cancelled. A screenshot or generic refusal cannot prove whether an older ZIP was used or which contract failed; no broader accepted shape is inferred from those alone.

Dropdown key settlement: after each returned native key, accept settlement only before a 200ms deadline in 25ms read-only intervals only while the complete valid pre-key native/cache state, identities, and focus remain unchanged. The expected next state must pass the full existing reader and exact indexes before any further key. A late read is rejected, not cancelled remotely; elapsed wall time can exceed the deadline while it finishes. No key is repeated. Other mismatches stop immediately; timeout consumes the attempt. This is synthetic-tested timing tolerance, not proof of a Windows cause or fix. On index/focus mismatch, selectionDiagnostic.nativeState contains bounded native actual/expected index arrays and the focused dropdown index (-1 if none), never option text. Deadline refusal may retain numeric state from a pending or late mismatching settlement read, or omit it after a late successful read. A late unsafe mismatch may be labelled key-state-did-not-settle rather than its earlier guard; it still stops without further input. A returned key call still does not prove OS delivery or grading.

### Passive native-input trace and local Windows isolation

The one-shot validator startup now prints `Native input: F4 popup + ArrowDown + Enter. Passive trace: popup-v2`. It presses F4 once per dropdown, then requires that select's `:open` state to become true before any navigation key. If the browser cannot report `:open`, or the popup does not verify open, it stops after F4 with no ArrowDown, Enter or Submit. Each popup ArrowDown is followed by a read-only `:open` check and a passive-trace check that no input/change event landed during popup navigation; Enter is sent only while the popup still verifies open and the trace is clean. It then requires popup close, the exact final index, full cached/native identity and focus before the one Submit. Targets before the starting index, unavailable trace state, early popup close, navigation input/change, uncertain close, mismatch or cancellation stop without retry. One bounded live attempt on 8 November 2026 returned `submitted-once`; EP marked it correct and advanced. This is still not broad live proof.

The normal CLI always uses the F4 popup path. `EP_DROPDOWN_INPUT` no longer selects or restores a dropdown method. The path handles one or more dropdown questions in order, creates its own passive trace, and stops the whole question if any dropdown fails. In auto mode, after exact selection it asks once for terminal approval before that question's Submit: the prompt names the visible question key and dropdown count, only `yes` approves one Submit, and any other response stops without Submit. A missing terminal approval path also stops without Submit. On refusal, the CLI prints only the phase, zero-based dropdown index, returned key count, guard and dropdown count as a diagnostic. No F4-path failure falls back to Home/ArrowDown in the same question.

On selection failure its `inputDiagnostic` includes a bounded passive trace, installed before the keys and removed afterward. It does not cancel events, write selection/value, dispatch synthetic events, repeat keys, open a picker or commit an answer. The original full reader, focus/identity checks, 200ms settlement deadline and permanently consumed attempt remain unchanged. Browser version is recorded as a fixed Chrome version string, not a full user-agent or URL.

Only key events for the selected sequence and input/change events targeted at the original, validated native controls are retained. Schema 1 covers Home/ArrowDown for legacy synthetic fixtures and the EP-free local diagnostic only; schema 2 adds F4/Enter and a per-control `:open` boolean/null snapshot for the normal path and popup validator. No event text, option labels/values, answer metadata, identifiers or unrelated element content is read. Limit: 20 controls, first 64 events, bounded dropped count. Later key events can be omitted if earlier input/change events fill that capacity; the handler treats any dropped trace event as a failure and stops without Submit. Numeric encoding: event type 0 keydown / 1 keyup / 2 input / 3 change; key/code 0 Home / 1 ArrowDown / 2 F4 / 3 Enter / null otherwise; modifiers bits 1 Alt / 2 Control / 4 Meta / 8 Shift. Index -1 means no tracked focus; selected index outside -1..50 is null. Appearance 0 auto / 1 none / 2 base-select / 3 other; visibility 0 visible / 1 hidden / 2 other. Trust, document focus, popup-open state and cancellation flags are booleans; unsupported `:open` is null.

Each event captures native indexes/focus immediately and again in a later task, with `completionPending` if that later task has not run before collection. `defaultPreventedAfterTask` can reveal later cancellation, but the index snapshot can already include subsequent events; it is not proof of the exact moment the native default action ran. Snapshot references remain the original controls if the site replaced them. Zero observed events does not distinguish routing failure from a listener earlier in propagation stopping delivery. These diagnostics can narrow a cause, not prove OS input delivery, correctness or grading.

For an EP-free local check on the affected Windows computer, use the same fresh ZIP and dependencies, then PowerShell. The original closed-select check remains `npm run diagnose:dropdown:local`. The popup mechanism check is `npm run diagnose:dropdown:local -- --variant f4-popup` (or `--f4-popup`). Both deliberately use Puppeteer-managed Chrome, matching the EP validator launch, and ignore the fixture-only HANDLER_EXECUTABLE_PATH override. A headful browser opens an invented blank native select on an isolated page whose content policy blocks external resources. Do not select manually. Return to the terminal exactly as with the validator and enter `run` once.

The legacy variant sends exactly Home then ArrowDown using ElementHandle.press. The F4 variant sends F4 once, verifies `:open`, sends one ArrowDown only if open, requires the popup to remain open and no input/change during navigation, then sends one Enter. It waits 200ms only to observe and prints `EP_LOCAL_NATIVE` with variant, platform/Node/browser version, native indexes, F4/open/navigation/commit fields and the same passive trace. A useful Windows popup result has `f4OpenState:true`, `openAfterArrow:true`, `navigationTraceAvailable:true`, `navigationCommitSeen:false`, `commitDispatched:true`, and `finalSelectedIndex:1`. If `f4OpenState` is false or null, no ArrowDown or Enter was sent; capture that line and do not run an EP attempt from a canceled or inconclusive local check. No EP URL, login, model, Submit, next question or retry is used.

`node scripts/dropdown-native-local.js --headless` is the automated Linux smoke mode only, not Windows or headful proof. A local Windows result separates basic browser/platform key behavior from EP-specific interception; it does not itself authorize any new EP attempt. No Windows result or real cause is claimed yet.

## Ordinary lesson dropdown source contract

A narrow source-derived path supports initially blank native `DROPDOWN_COMPONENT` selects in explicitly auto-marked Smart Lessons. Every select must have one cached component, exact current metadata/original/shuffled option identities and DOM order, one correct displayed plain-text option, and agreement between a nonblank native selection and its cached selected option. Ambiguous normalized descriptions, prefilled controls, mixed component definitions, editable fields, disabled/multiple/listbox controls, unknown defaults, assessments and manual marking are refused. Empty defaults and EP's exact editor default-none sentinel (` < None > `) are accepted only with a visibly blank native selection; the cached selection must be absent, the actual selected blank option, or the actual empty/default-none default object. The sentinel is never allowed as an answer description. Static diagrams and formula text outside the controls do not supply answers and are not inferred from.

Source: [EP public chunk 606](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js), checked 6 November 2026, `DropDownComponent` and `DropDownComponentState`. The reader uses existing `_shuffledOptions` only, never the state-creating `shuffledOptions` getter, setters or marking methods. EP maps native change events by trimmed description. Boundary ASCII spaces are accepted only when every trimmed description is unique, the raw DOM textContent equals the cached raw description exactly, and the native option text equals its trim. Whitespace-only options, control/invisible/markup text, and ambiguous trim mappings still refuse. The same source shows the shuffled cache aliases and sorts `metadata.Options`, then may insert one synthetic blank into that array after the original options were copied. The reader compares raw definitions against that original copy, accepts only one exact leading injected blank, and retains complete DOM/cache and per-key identity checks. The v2 read-only report on 7 November identified all four raw/metadata Marked values as numeric 0 paired with runtime marked 1. The source editor creates Marked 0 and BaseComponent defaults runtime marked to enum 1. Both raw/metadata 0/0 and the existing 1/1 path require runtime marked 1, exact type/id/DOM/cache identity and explicit section auto-marking. All definitions must use the same raw/metadata generation (all 0/0 or all 1/1). Cross-definition mixtures, missing/string/null/2 and mismatched marking pairs refuse. This fix is source/live-inspection grounded and synthetic-tested, not a live selection/Submit acceptance result.

The normal dropdown handler uses trusted F4 popup input for one or more dropdowns in order, checks popup state, native and cached selection, and stops without retry or fallback on uncertainty or cancellation. Any dropdown failure stops the whole question. **Popup navigation may still change EP state, even without Submit.** Semi-auto selects the final exact answers without Submit; auto rechecks the associated Submit target, asks once for terminal approval, and clicks Submit once, never Next for the same question. No atomicity against concurrent page/user changes or cross-platform key behavior is claimed. Legacy Home/ArrowDown remains only in explicit synthetic regression fixtures and the EP-free local diagnostic, never the normal run or validator. One bounded live F4 popup attempt was marked correct and advanced; broader live dropdown selection, acceptance and full-lesson proof remain limited. Any further live Submit needs fresh approval for one named question.

## Ordinary lesson text and number box source contract

A source-derived handler recognizes narrow ordinary `TEXT_BOX_COMPONENT` and `NUMBER_BOX_COMPONENT` fields in explicitly auto-marked Smart Lessons. It requires initially empty `input.text-box-component` or `input.number-box-component` fields, one cached component per field, exact component/state/DOM identities, valid uniform 0/1 definition `Marked` flags with matching metadata, runtime `marked === 1` per component, and nonempty accepted options. The current cached options must equal the metadata options; variable-resolved answer differences are refused in this first contract. It types the first supplied accepted option, not a guessed answer or a model answer inferred from lesson text. Number boxes additionally require finite numeric answer strings and matching EP rounding/error metadata (`NONE`/`DP`/`SF`, 0-15 places, `ABS`/`%` error). The selected cached option must pass the source-derived numeric marking check before filling; decimal-place metadata may format the stored option to EP's submitted precision, while significant-figure slides refuse when no stored option already matches the required format. Plus-signed significant-figure options and negative answers under percent error also refuse because EP's own helper behavior is unsafe there. Multiple boxes are filled in DOM order.

Source checked 8 November 2026: [EP public chunk 606](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js), `NewTextBoxComponent`, `NumberBoxComponent`, their ComponentState classes and `ComponentIndex`. EP's input events update the cached answer; Enter can submit, so this handler never types Enter. It uses trusted character input, checking the same question, renderer, options, field focus and exact answer prefix before and after each character. Changed or uncertain state stops without clearing, overwriting or retrying. In auto mode a number-box question asks once for terminal `yes` approval after exact filling and before its only Submit; any other answer stops without Submit. Semi-auto fills without Submit. The final input/click cannot be atomic against concurrent page or user input.

Semi-auto fills only. Textbox automatic mode rechecks the exact filled set and associated unique Submit button before one click; number-box automatic mode adds the typed-`yes` terminal approval above. Neither path clicks Next for that question. Missing controls, stored/prefilled answers, initial text, extra editable fields, mixed components, long/rich answers, fill-in-the-gaps textbox variants, maths editors, assessments and manually marked questions are not covered by this contract. Other input variants remain in the support queue, rather than being treated as equivalent inputs.

When detection or a guarded fill/Submit state re-read rejects a text or number box slide, the CLI prints a sanitized refusal diagnostic with the guard name plus model, DOM, component and metadata booleans/counts. It does not include answers, component IDs, question text or other private lesson content.

The definition-level checks name their failing guard: `component-count` (missing, empty or oversized definition list, missing renderer base, or a definition/box/base count mismatch), `component-types` (unlisted component type or invalid id), `component-ids` (duplicate ids), `component-marked` (a definition `Marked` value other than 0 or 1) and `mixed-definition-marking` (marked and unmarked definitions on one slide). Diagnostics add sanitized counts only; raw `Marked` values are never printed. On 8 November 2026 a live four-box auto-marked lesson slide reported all four definitions and metadata `Marked` 0 with every runtime component `marked` 1, all boxes visible and editable, and options present. Only detection ran live - no filling, grading or Submit. EP's source (chunk606, checked 8 November 2026) shows the runtime flag is authoritative for these components: `BaseComponent`'s constructor sets `marked` to MARKED unconditionally and no text/number-box path overrides it, `outputForMarking` reports that runtime flag, and `NumberBoxComponentState.mark` grades against the accepted options without consulting the definition flag. The contract therefore accepts definition/metadata `Marked` 0 or 1 when they agree and the runtime component is `marked === 1`, matching the dropdown contract's existing rule; invalid values, mixed-marking slides and runtime disagreement still refuse. The acceptance change is validated by synthetic fixtures and the real CLI on invented data, not by any live fill or Submit.

Invented sanitized source-derived fixtures cover DOM/metadata order differences, trusted typing, semi-auto, one Submit, changed-state refusals and the normal CLI/Alt+S workflow. Live detection refusal lines informed this contract; no live ordinary lesson textbox or number-box filling, grading or full-lesson result has been verified.

## One-question dropdown Submit validation

`node bin/validate-dropdown.js` opens an exclusive stopped session. Only after fresh supervised approval for one named initially blank auto-marked Smart Lesson dropdown question, `submit once` consumes the process attempt before inspection. It uses the existing guarded dropdown handler with submission disabled, binds the final exact-set and Submit checks to the pre-input objects, dispatches at most one trusted Submit click, and returns without any answer loop, Next or following-question input. Browser answering hotkeys and ordinary start/mode/refresh commands cannot run the answer loop. Refusal, cancellation, partial/uncertain input and success consume the attempt across page changes. Restarting the process is not approval to try again.

Use a fresh source checkout or matching source ZIP that includes this helper, not an older downloaded copy. Supported commands are `submit once`, `inspect` (read-only while stopped), `stop`, `status` and `quit`. The fixed `EP_DROPDOWN_ONCE` result line reports `submitted-once`, `refused`, `aborted` or `stopped`; failures may include a fixed reason. Never retry after any result.

Home/ArrowDown visits intermediate wrong selections, which EP may save or grade even without Submit. Stop cannot undo a delivered key or click. Checks and input are not atomic against page/user changes. `submitted-once` means dispatch returned, not acceptance, correctness, points or completion. An uncertain dispatch may already have submitted and is never retried. One bounded live F4 popup attempt was marked correct and advanced; broader live dropdown proof remains limited. Keep the question visible and observe the result; do not navigate or select manually during the attempt.

## Assigned vocabulary audio contract

Assigned classic vocabulary Listening/Dictation can lack the Smart Lesson `sectionData.activityGroup.isAutoMarked` flag. The narrow additional allowance requires classic game mode 1, translation question type 0, explicit `isEPQuestion === false` and `isSpeakingMode === false`, translation mode 2 or 3, absent `sectionData`, vocabulary/translation activity/content types 1/1 and a positive safe-integer task ID. It does not set or infer `autoMarked = true`; explicit manual marking still wins.

Source: [EP public chunk 171](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js), retrieved 4 November 2026. `ClassicGameController.submitAnswer` calls `markAnswerWithSecondChance` irrespective of assignment. Non-EP questions use `markAnswerLP`; only speaking sets its self-mark branch. `QUESTION_DEFAULT` otherwise grades using the answer validator. EP components and Smart Lessons/Assessments use other marking branches and do not inherit this allowance.

A stopped, content-free field diagnostic confirmed that narrow assigned Listening shape, including one usable accepted answer. This is **not** a new live submission or full-task completion proof. Synthetic tests cover Listening and Dictation positives, malformed/unknown/EP/speaking/assessment/manual refusals and marking/task changes during typing. The context and accepted answer are rechecked before initial and retry submissions; any change stops before Enter. Task IDs stay inside the process and are never logged by this check. Existing unassigned self-test support is unchanged.

## Assessment source boundary

Assessments remain unsupported, and this program has never been run against a live Assessment attempt. The first safe slice is an explicit stop boundary from EP's public student source, not a guessed implementation.

Source map from [`mfe-hashed-assets-171-69df426caed962f89980.js`](https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js), checked 8 November 2026:

- `GameMode` is `CLASSIC = 1`, `ASSESSMENT = 2`, `SMART_LESSON = 3`.
- The student template mounts `game-assessment-action-bar`, `game-assessment-side-bar` and `game-assessment-navigation-controls` only when `game.model.gameMode == 2`.
- `AssessmentGameController.startAutoSaveTimer()` stores the current answer every 10 seconds. Question navigation also submits/stores the current answer.
- `submitAnswer` marks and stores the current question state. `submitAssessment` marks the whole attempt submitting, submits the current answer and then completes the attempt.
- Assessment lockdown settings can enable focus/fullscreen tracking and persist focus or navigation events.

The CLI treats the source-shaped Assessment controls as a content-free boundary: it stops before reading question answer state. If those controls are absent or have not mounted, the per-question `gameMode === 2` guards still refuse every supported question shape. Detection returns `assessment: true` with a refusal explaining the graded whole-attempt, autosave and focus-tracking risk. Synthetic tests prove zero clicks, text input, key presses and Submits across choice, dropdown, textbox, drag-and-drop gaps and multi-select fixtures. None of this is live-verified, and a live Assessment remains out of scope.

## Known limitations

- Ordinary lesson text and number boxes have the narrow source-derived contract above and synthetic fixture coverage only. No live number-box detection, filling or grading is proved; long/rich, gaps-textbox and manual/assessment variants remain unsupported.

- Formula-rich single-choice handling requires an existing cached renderer with unique exact metadata-to-DOM associations. Mixed formula/plain option sets, missing renderer state and ambiguous associations stop unanswered. Variable-resolved choices use the current cached metadata only when original/displayed option identities, preview marking and complete rendered templates agree; raw and resolved state are rechecked before selection. This path has synthetic browser coverage, not live equation-choice completion proof.

- **Smart Lesson support covers multiple-choice questions in auto-marked activities.** The question markup and the client-side answer state were verified against the live site; on 30 October 2026, the actual program passed one accepted select/submit/advance cycle, then stopped. Full-lesson completion and automated rejection handling remain unproved live. Local fixtures cover multi-round and refusal behavior. Short-answer lesson questions are answered the same way but haven't been live-verified yet. Multi-select is supported only with an explicit auto-marked activity and a complete cached renderer-to-option association: it uses the resolved displayed answer set, verifies checkbox/client selected-state agreement, requires aria-selected="true" for selected options and checks ARIA when present, and submits once. Missing/ambiguous/stale state stops without submission. Preselected wrong options are deselected; correct options are preserved. This path has source-derived synthetic coverage only, not a captured live multi-select slide or live submission proof. Hidden explanation/Next transitions remain unsupported for multi-select and stop rather than clicking. Matching, ordering, image-based questions, other drag-and-drop variants and any manually marked question are detected and reported instead of answered. The normal CLI's generic unsupported-slide report now includes a sanitized diagnostic limited to game mode, numeric question type, allow-listed component type codes/counts and broad visible-control counts; it never prints prompt, option or answer text, IDs, URLs, arbitrary class names or unlisted component strings. The narrow drag-and-drop fill-in-the-gaps contract above is separate.
- **Audio tasks (Listening/Dictation) are answered from the data EP ships to the browser before submission** (that state, and the audio markup, were verified against the live site; the actual program passed one accepted type/submit/advance cycle for each of Listening and Dictation on 30 October 2026, then stopped; full-task completion and automated rejection handling remain unproved live. Local fixtures cover multi-round completion, bounded rejection and refusal when accepted-answer state is missing, empty or unusable). If EP stops shipping that state, those tasks fail loudly rather than fall back to guessing. List audio tasks ship no marking flag at all (confirmed on a live Listening task, 2026-10-30), so audio is answered only when EP's auto-marking flag is explicitly true or `sectionData` is absent and the task is positively identified as a self-test vocabulary list (unassigned, list and translation content type); assigned classic vocabulary audio has a separate source-grounded allowance described above; all other assigned tasks without explicit auto-marking confirmation and unknown contexts stop and report instead. That identification rests on field values EP ships, not on a documented guarantee, and it carries two known unknowns: an assessment launched in a way that produces the same null-task/no-section-data shape is not proven impossible, and self-test work still earns points and stays visible to teachers either way. Dictation shares the pipeline but wasn't separately re-inspected for these fields.
- The answer parser handles *most* word-list formatting edge cases, but extreme cases may still result in incorrect answers; the self-learning error-correction feature helps, but doesn't cover every scenario.
- The anti-cheat bypass depends on how Education Perfect's anti-cheat features behave, and might stop working when the service changes.

## Future plans
This is a purely hobby-driven project. This means I don't guarantee consistent development or continued maintenance of
this program. Everything depends on my own plans and interests. In any case, any existing resources here will remain
public and accessible indefinitely.  
In any case, you're very welcome to contribute to this project! Contributions can be new features, bug
fixes, anti-cheat bypass, or even just fixing typos and documentation. I have to specifically thank 
[Garv](https://github.com/garv-shah) for discovering the exploit that made V1 fully-auto answer possible.

TODO list? or never-DO list? no one knows :P
- Auto navigation between tasks (temporarily achieved with script+.js during V1)
- Dedicated anti-cheat bypass features
- Even better answer parsing

A dedicated desktop app has also been floated as a possible future direction; it would be a separate effort
and is not part of this repository.


## License and permission

This project does not claim any license and does not grant any permission for the use of Education Perfect's services
or for automated access to them. Use of the service may be subject to [Education Perfect's terms of service](https://www.educationperfect.com/).
The code and documentation here are provided as-is for educational and hobby purposes.


## CLI credential setup (source build)

Run `node bin/cli.js --setup` in a terminal to save your login in the native OS credential store. Both fields use hidden input. Empty input cancels without changing the saved login. Run `node bin/cli.js --forget-credentials` to remove this app's saved login. Run `node bin/cli.js --check-credentials` to check whether this app's saved native record is present and valid, without showing either field or changing it. A valid or absent record exits successfully; an unavailable or malformed record exits with an error. This checks the native record only, not environment variables, older keytar entries or whether EP will accept the login. These commands do not open a browser or submit an answer. Packaged executables accept the same flags.

The native store uses Windows Credential Manager, macOS Keychain, or Linux Secret Service. On Linux, an unlocked Secret Service session (for example GNOME Keyring or KWallet) is required; there is no plaintext or nonpersistent kernel-keyring fallback. If the store is unavailable, ordinary browser/manual login still works. Never put a password in a command argument.

A saved login is read as one versioned record. Existing environment-variable and optional legacy keytar inputs are retained for source-build compatibility. Setup does not delete older legacy-keytar entries. `--forget-credentials` removes only the new record, so older inputs may still supply a login.

This is source-build work, not a packaged release. Native disposable tests now cover Linux x64/ARM64 private-store CRUD, Windows x64 source-worker CRUD and SEA hidden-input setup, cancellation, raw byte3 interruption, health-read and deletion, plus Mac ARM64/Intel source CRUD and packaged setup/health-read/delete. Mac exact packaged values and normal saved-login use remain unproved; see `release/native-validation.md`. Browser bundling, native module extraction, signing/distribution and five-target release checks must pass before claiming standalone support. Run `npm run test:store` for isolated adapter/setup contract tests; those tests never access a real credential store.

## Standalone development builder prerequisite

All three SEA development builders (`build:linux-dev`, `build:windows-dev` and `build:macos-dev`) require **Node 22.23.4 exactly** on the matching native host. This is narrower than the `package.json` engine range (`>=22.12.0`), which describes source-program installation and runtime requirements, not the SEA builder matrix. The builder copies the current Node executable and includes the checked-in Node 22.23.4 runtime LICENSE and bundled-component notices. A different Node version fails with `Node runtime notice version mismatch` before archive, bundle or native executable generation; do not remove that check to build with another version. Supporting another builder version needs matching reviewed runtime notices and native validation first. No other Node builder version is currently supported by these commands.

## Linux x64/ARM64 standalone development build

`npm run build:linux-dev` creates `build/linux-<arch>/educationperfected` (`x64` or `arm64`, matching the native build host) using the current Node executable, pinned JavaScript tooling, native keyring module, and the full Chrome for Testing already installed by Puppeteer. Run `npm run test:packaged` for local fixture checks. No live Education Perfect answers are submitted by these tests.

This is an unsigned native glibc Linux x64/ARM64 development build, not a released artifact or a claim of support on the five target platforms. It extracts the native module and browser into a private temporary directory on each launch and checks the browser payload's build-time SHA256 before extracting it. Normal exit, setup interruption and pre-launch interruption remove that directory. SIGKILL, power loss or a crashed process can leave temporary files behind. Disk space and OS browser libraries are still required. macOS development builds have ad-hoc signature verification; certificate signing, notarization and Windows signature policy remain unproved.

The build writes available third-party notices and an inventory of every installed production dependency beside the executable. Missing notice files are explicitly listed. Exact-version Puppeteer source licenses omitted from npm tarballs are recovered with checksum/source provenance; copying them is not legal clearance. Distribution remains blocked until notices, rights and native evidence are reviewed. Do not distribute a binary without its notices or before completing the project's rights/licensing review, browser redistribution review, signing and clean-machine/native-platform release checks. Existing contributions have no repository-wide license grant documented here. The local development build does not settle those release gates.
Native-store test prerequisites: `npm run test:store` uses an inert adapter and needs only Node/dependencies. `npm run test:store:pty` uses Python 3's standard-library PTY support on Linux/macOS and preloads an inert store, so it cannot save a real login. `npm run test:store:integration` additionally needs Linux `dbus-run-session`, `gdbus` and `gnome-keyring-daemon`; it creates a fresh temporary HOME and private D-Bus session for synthetic native-store write/read/delete. No real user's keyring is used. These developer-test tools are not runtime prerequisites for the CLI.


OS-delivered child-signal fixtures (`startup-signal-test`, `legacy-drain-signal-test` and `cli-test --signal`) are POSIX-only and explicitly report SKIP on Windows. Node's `child.kill()` force-terminates Windows children rather than delivering the console event these tests need. The platform-neutral run-control and pending-launch handler tests still run, but they do not certify Windows console shutdown. Native Windows console close/Ctrl+C and process cleanup remain required release checks.

A Windows x64 development builder is available via `npm run build:windows-dev`. Its native browser/local CLI and corruption fixtures passed experimentally, and disposable Windows source-worker synthetic save/read/delete and SEA hidden-input setup now pass with an independent exact source-store pair, fresh SEA valid-shape health read, unchanged source pair, deletion and cleanup. Empty-email/password cancellation and raw byte3 interruption at both armed setup prompts also pass without mutation or native deletion. The raw-input check is not OS console-event delivery or physical terminal-close proof. Browser-startup reliability, normal saved-login use, locked/unavailable-store behavior, real console events and clean-machine checks remain incomplete. See `release/native-validation.md`; this is not a release or a signed/unsigned distribution-policy decision.

The Linux development package embeds the browser as a SEA asset with a checksum checked before unpacking. Full-size build and packaged CLI/integrity fixtures passed on a standard 16 GB Ubuntu 22.04 runner. Smaller-memory full-size injection was killed, so this is not a promise that every development machine can build it. Ubuntu 24.04 sandbox compatibility remains unresolved; the Ubuntu 22.04 pass does not clear that platform's prerequisites or the native release gates. No browser sandbox bypass is enabled.

The SEA runtime maps the full embedded browser asset, verifies its checksum in a complete pass, and only then extracts it. It uses a read-only raw asset view with bounded stream chunks instead of copying the full archive into a Blob. Short synthetic workflow-command memory observations are recorded in `release/native-validation.md`; total process-tree peak and minimum supported RAM remain unproved.

Native Ubuntu 22.04 x64 and ARM64 runners passed full SEA builds and the packaged mock CLI, checksum-corruption and startup-interruption fixtures. Current-source private Secret Service tests also passed native synthetic save/read/delete and packaged setup/delete verified by independent source reads. These runs do not prove normal answer-path credential use, a separate no-Node machine, platform signatures or distribution rights. Ubuntu 24.04 sandbox compatibility and a longer-term runner baseline remain open.


Native macOS ARM64 and Intel development runs passed source controls, full SEA builds, ad-hoc signature verification, packaged local-mock browser controls and owned extraction cleanup. An isolated disposable runner keychain also passed source exact synthetic save/read/delete and packaged setup, fresh-process `--check-credentials`, deletion and independent source absence. This uses inherited runner HOME with verified owned User keychain selection and restoration, not a clean profile. Packaged health checks prove a valid parsed record, not its exact synthetic value or normal sign-in use. A source Node read of a packaged-created record timed out; its cause remains unproved and cross-executable read is not cleared. Historical Intel startup timing also remains unexplained despite later passes. See `release/native-validation.md` for exact evidence and remaining gates.

### One-question fill-only validation

`node bin/validate-gaps-fill.js` opens a separate stopped validation session. Use it only after approving a specific practice question for alteration. Filling may save a draft in EP even though this session never clicks Submit or Next.

Open that approved question, then enter `fill once` in this validation terminal. It calls only the guarded gaps handler, with submission disabled, and stops after the exact filled set is verified or on the first mismatch. It does not enter the ordinary answering loop. The attempt is consumed before inspection; a failed, cancelled or successful attempt cannot be retried in the same process, even on a new question. Do not open another validation process as a retry without checking what changed and getting any needed approval.

Only `fill once`, `stop`, `status` and `quit` are supported. Browser answering hotkeys are disabled in this session. `stop` drains an in-flight action; it cannot undo a key already delivered. `quit` closes the owned browser. `EP_FILL_ONCE` reports a fixed, content-free result: `filled-only` confirms filling was verified, not marking, submission or advance.

Use a fresh source ZIP containing this entrypoint and its matching handler files. The earlier Console diagnostics contain their own reader and do not prove an old installed CLI has been updated. This is a developer validation path, not full lesson completion or packaged-release proof.

### One-question automated Submit validation

`node bin/validate-gaps-submit.js` is a separate, stopped validation session. It requires approval for one fresh, initially empty supported practice gaps question, including filling, one automated Submit and any result or points EP records. Do not use the previously filled or submitted question. No live run of this command has been verified.

After opening only the approved question, enter `submit once` exactly once. The session consumes the attempt before inspection, uses the guarded fill-only operation, then rechecks the same question, exact filled set and associated Submit control before one trusted click. It returns immediately after that click. It never clicks Next, retries, answers another question or enters the ordinary answer loop. EP may automatically display the next question, an explanation or a completion screen after Submit.

Only `submit once`, `stop`, `status` and `quit` are supported; browser answering hotkeys are disabled. A refusal, cancellation, uncertain input or completed attempt cannot be retried in the same process, even on a fresh question. Do not start a new process as a retry without checking what changed and getting any needed approval. `EP_SUBMIT_ONCE` reports a fixed, content-free result: `submitted-once` means the one click returned, not that EP accepted or graded the answer. An uncertain click reports `stopped` and may still have taken effect. Stop cannot undo an already dispatched key or click; shutdown may wait for an in-flight browser call.

Use a fresh matching source ZIP, not the ordinary launcher or the fill-only command. Synthetic browser and real-program fixtures cover at-most-one Submit, no Next, no further answering after automatic advancement, permanent attempt consumption, cancellation and stale-state refusals. These are not live automated-submission or full-lesson proof.


### One-question textbox fill-only validation

`node bin/validate-textbox-fill.js` opens its own stopped browser. Open the specifically approved, initially empty ordinary auto-marked lesson textbox question there. `fill once` calls only the existing guarded textbox handler with submission disabled, then stops after exact filling is verified or at the first refusal, cancellation or uncertainty. It never intentionally clicks Submit or Next or enters the answering loop. Filling may still save or grade in EP; there is no promise that input has no effect beyond a visible draft.

Only `fill once`, `stop`, `status` and `quit` are supported; answering hotkeys are disabled. One attempt is consumed before inspection, including refusal or cancellation, and cannot be retried even on a different question. A new process is not permission to retry. `EP_TEXTBOX_FILL_ONCE` `filled-only` confirms the handler's exact fill checkpoint, not saving, marking, grading, points or advancement. An interrupted or uncertain fill may leave partial input. `stop` cannot undo a delivered key, and shutdown may wait for in-flight browser work. Final read/input checks are not atomic against concurrent page or user changes.

The ordinary textbox contract and exclusions above remain unchanged. Synthetic Linux browser and real-program fixtures cover this validation path, not live textbox or Windows compatibility. Use a fresh matching source ZIP. Each live question needs separate approval before typing `fill once`.

### Read-only Reflection inspection (#114)

Self-marked Reflection answering is not implemented yet. To capture its component
and control shapes without starting answering:

1. Run `node bin/cli.js`, finish sign-in, and open the approved Reflection page.
2. Leave the CLI inactive (stopped, completed or error state). Do not type `start` or press the answering hotkey.
3. Type `inspect-self-mark` once. Paste the line beginning `EP_SELF_MARK_INSPECT`.
4. Type `quit` when finished. Do not reveal answers or select a self-grade for this capture.

The command reads structural metadata, control shapes and counts only. It does not type,
click, focus, Submit, reveal answers, select a self-grade or advance the question.
It reports recognized component codes and fixed metadata field shapes, not answer
values, question text, arbitrary keys, classes, labels or IDs. Cached metadata
accessors are skipped. Assessment mode and unconfirmed lesson modes stop before
question-state reads. While inspection is pending, answering, mode changes and
refresh are locked out. Waiting is bounded to two seconds; a remote read already
in flight may finish later, but it has no write path. Existing answering guards
are unchanged. A capture is not permission for live answering.


### Dropdown Submit readiness

Auto mode verifies the full exact dropdown answer set while waiting up to three
seconds (or a shorter configured round timeout) for the associated Submit button
to become available. EP's SkillsControls has a one-second new-question lock; a
fast fill can finish before it unlocks. These probes never replay input, click,
enable a button or bypass the terminal Submit approval. Each probe rechecks the
original model, question key, renderer identities and exact selected answers.
Multiple visible Submit buttons, any identity/answer drift, assessment mode and
cancellation stop without Submit. A timeout reports `submit-readiness-timeout`
with content-free visible/enabled Submit counts. The final button-identity and
coverage checks and the no-retry rule after an uncertain click are unchanged.
The one-shot validation helper still uses its existing single-read Submit gate.
This is synthetic-test proof of the readiness path, not proof of the cause of
every live `submit-button` refusal.

### Selection dialogs at section boundaries

Normal selection rounds (choice, gaps, dropdown, textbox and number-box) preserve dialogs after Submit. Content-free `Selection modal diagnostic` guards distinguish template family, baseline/model/current-section association, next-section fields and button readiness failures. For exactly bound source-shaped section completion only, automation clicks that dialog's Next Section button once. It never directly invokes controller methods, uses Enter, clicks a generic modal control, retries an uncertain click or navigates peer review. The dialog template scope may inherit its `self` as UI Bootstrap transclusion does; only bounded own data-property reads are used, not getters. Before input, the model, original section/question, next displayed section identity/ID/type/activityGroup, exact button binding, visibility, hit target and run cancellation are rechecked. After the click, read-only polling must prove the same model, the exact promised next section, a different valid question and no visible modal/backdrop. Fresh supported-question detection then permits normal per-round checks to resume. A stalled, dismissed, uncertain or wrong-section transition stops without another click. Unknown dialogs and final activity completion stay open and stop; no lesson-completion or grading claim is inferred from the dialog. This is source-derived synthetic coverage, not live EP proof.

Unrecognized, ambiguous, hidden or unverified dialogs still stop. Diagnostics contain fixed family/guard names, counts and identity-match booleans only, never dialog/answer/question text, section names or raw IDs. Selection runs do not erase dialogs in normal loop cleanup, including when Stop lands after Submit but before the next modal poll. An explicit restart stays inert while a visible dialog or backdrop remains; once the user handles it, a new start uses normal fresh detection, not an inferred section-transition result. One-shot validation commands are unchanged. This is source-derived synthetic proof, not confirmation of which dialog appeared in a live run and not proof of the exact association failure in the reported stop.
