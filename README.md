# EducationPerfected

#### A JavaScript program that automatically answers Education Perfect language questions at **super** speeds.
Works for word-to-word (translation) tasks and Dash mode, which have been run end-to-end against the live Education Perfect service. It also supports audio tasks (Listening and Dictation) and multiple-choice questions in auto-marked Smart Lessons: for those, the live site was inspected to confirm the question markup and where the answers come from, but the full answer/submit cycle has only been exercised against local fixtures ([scripts/handler-test.js](scripts/handler-test.js)), not the live service.  
Other Smart Lesson question types are detected and reported, not guessed at. Short-answer lesson questions are handled too, but that shape hasn't been verified against the live site yet.

![example image](result.png)


## Status

> [!WARNING]
> **Heads up:** this repository continues the original EducationPerfected project. It is *not* the original, actively maintained project.

The original was started by [akioweh](https://github.com/akioweh) and is now **[archived](https://github.com/akioweh/EducationPerfected)**. This repo is a loving continuation of that work.

The original's README used to claim its status was: **_CURRECT STATUS: ALL intended features functional._**  
_*Last time they checked... which was... two years ago???*_  
That has since been re-verified here: **the program has been run against the live Education Perfect service and confirmed working** for the supported (word-to-word / Dash) tasks. Don't assume it stays working forever, though - EP can still change.

- This repo's program is version **V2026** (package version `2026.0.0`): an independent JavaScript ([node.js](https://nodejs.org/)) program that uses the [Puppeteer](https://github.com/puppeteer/puppeteer) library to drive a web browser around.
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
_The independent program started as V2 and now continues as V2026:_
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
2. install [node.js](https://nodejs.org/) - version **22.12 or newer** (that's what the pinned Puppeteer requires)
3. open Command Prompt/Terminal **in the folder where `index.js` is located** (right click -> open in terminal or use the `cd` command to change the directory)
4. install the dependencies with `npm ci` in your opened Command Prompt/Terminal window
5. set your **Education Perfect credentials** as environment variables - the program will use them for auto-login  
   - **Windows (Command Prompt):** `set EP_EMAIL=you@example.com` then `set EP_PASSWORD=your-password`  
   - **Windows (PowerShell):** `$env:EP_EMAIL='you@example.com'; $env:EP_PASSWORD='your-password'`  
   - **Linux/macOS (Terminal):** `export EP_EMAIL='you@example.com' EP_PASSWORD='your-password'`  


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


## Known limitations

- **Smart Lesson support covers multiple-choice questions in auto-marked activities.** The question markup and the client-side answer state were verified against the live site; the select/submit/advance cycle has only been exercised against the local fixtures. Short-answer lesson questions are answered the same way but haven't been live-verified yet. Multi-select, matching, ordering, drag-and-drop and image-based questions, and any manually marked question, are detected and reported instead of answered.
- **Audio tasks (Listening/Dictation) are answered from the data EP ships to the browser before submission** (that state, and the audio markup, were verified against the live site; the type/submit/advance and rejection handling cycles have only been exercised against the local fixtures). If EP stops shipping that state, those tasks fail loudly rather than fall back to guessing. List audio tasks ship no marking flag at all (confirmed on a live Listening task, 2026-10-30), so audio is answered only when EP's auto-marking flag is explicitly true or `sectionData` is absent and the task is positively identified as a self-test vocabulary list (unassigned, list and translation content type); assigned tasks without explicit auto-marking confirmation and unknown contexts stop and report instead. That identification rests on field values EP ships, not on a documented guarantee, and it carries two known unknowns: an assessment launched in a way that produces the same null-task/no-section-data shape is not proven impossible, and self-test work still earns points and stays visible to teachers either way. Dictation shares the pipeline but wasn't separately re-inspected for these fields.
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

Run `node bin/cli.js --setup` in a terminal to save your login in the native OS credential store. Both fields use hidden input. Empty input cancels without changing the saved login. Run `node bin/cli.js --forget-credentials` to remove this app's saved login. These commands do not open a browser or submit an answer.

The native store uses Windows Credential Manager, macOS Keychain, or Linux Secret Service. On Linux, an unlocked Secret Service session (for example GNOME Keyring or KWallet) is required; there is no plaintext or nonpersistent kernel-keyring fallback. If the store is unavailable, ordinary browser/manual login still works. Never put a password in a command argument.

A saved login is read as one versioned record. Existing environment-variable and optional legacy keytar inputs are retained for source-build compatibility. Setup does not delete older legacy-keytar entries. `--forget-credentials` removes only the new record, so older inputs may still supply a login.

This is source-build work, not a packaged release. The native Node binding has a Linux x64 disposable-session test; Windows, macOS and ARM runtime checks are still pending. Browser bundling, native module extraction, signing/distribution and five-target release checks must pass before claiming standalone support. Run `npm run test:store` for isolated adapter/setup contract tests; those tests never access a real credential store.

## Linux x64/ARM64 standalone development build

`npm run build:linux-dev` creates `build/linux-<arch>/educationperfected` (`x64` or `arm64`, matching the native build host) using the current Node executable, pinned JavaScript tooling, native keyring module, and the full Chrome for Testing already installed by Puppeteer. Run `npm run test:packaged` for local fixture checks. No live Education Perfect answers are submitted by these tests.

This is an unsigned native glibc Linux x64/ARM64 development build, not a released artifact or a claim of support on the five target platforms. It extracts the native module and browser into a private temporary directory on each launch and checks the browser payload's build-time SHA256 before extracting it. Normal exit, setup interruption and pre-launch interruption remove that directory. SIGKILL, power loss or a crashed process can leave temporary files behind. Disk space and OS browser libraries are still required. The SEA-embedded asset format has not been verified with Windows/macOS signatures.

The build writes available third-party notices and an inventory of every installed production dependency beside the executable. Missing notice files are explicitly listed. Exact-version Puppeteer source licenses omitted from npm tarballs are recovered with checksum/source provenance; copying them is not legal clearance. Distribution remains blocked until notices, rights and native evidence are reviewed. Do not distribute a binary without its notices or before completing the project's rights/licensing review, browser redistribution review, signing and clean-machine/native-platform release checks. Existing contributions have no repository-wide license grant documented here. The local development build does not settle those release gates.
Native-store test prerequisites: `npm run test:store` uses an inert adapter and needs only Node/dependencies. `npm run test:store:pty` uses Python 3's standard-library PTY support on Linux/macOS and preloads an inert store, so it cannot save a real login. `npm run test:store:integration` additionally needs Linux `dbus-run-session`, `gdbus` and `gnome-keyring-daemon`; it creates a fresh temporary HOME and private D-Bus session for synthetic native-store write/read/delete. No real user's keyring is used. These developer-test tools are not runtime prerequisites for the CLI.


OS-delivered child-signal fixtures (`startup-signal-test`, `legacy-drain-signal-test` and `cli-test --signal`) are POSIX-only and explicitly report SKIP on Windows. Node's `child.kill()` force-terminates Windows children rather than delivering the console event these tests need. The platform-neutral run-control and pending-launch handler tests still run, but they do not certify Windows console shutdown. Native Windows console close/Ctrl+C and process cleanup remain required release checks.

A Windows x64 development builder is available via `npm run build:windows-dev`. Its native browser/local CLI and corruption fixtures passed experimentally, but Windows native credential CRUD, real console events and clean-machine checks remain incomplete. See `release/native-validation.md`; this is not a release or a signed/unsigned distribution-policy decision.

The Linux development package embeds the browser as a SEA asset with a checksum checked before unpacking. Full-size build and packaged CLI/integrity fixtures passed on a standard 16 GB Ubuntu 22.04 runner. Smaller-memory full-size injection was killed, so this is not a promise that every development machine can build it. Ubuntu 24.04 sandbox compatibility remains unresolved; the Ubuntu 22.04 pass does not clear that platform's prerequisites or the native release gates. No browser sandbox bypass is enabled.

The SEA runtime maps the full embedded browser asset, verifies its checksum in a complete pass, and only then extracts it. It uses a read-only raw asset view with bounded stream chunks instead of copying the full archive into a Blob. Short synthetic workflow-command memory observations are recorded in `release/native-validation.md`; total process-tree peak and minimum supported RAM remain unproved.

Native Ubuntu 22.04 x64 and ARM64 runners passed full SEA builds and the packaged mock CLI, checksum-corruption and startup-interruption fixtures. These runs do not prove native credential save/read/delete, a separate no-Node machine, platform signatures or distribution rights. Ubuntu 24.04 sandbox compatibility and a longer-term runner baseline remain open.
