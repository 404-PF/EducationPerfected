# EducationPerfected

#### A JavaScript program that automatically answers Education Perfect language questions at **super** speeds.
Works for word-to-word (translation) tasks and Dash mode.  
**Does not work with Audio-based tasks... yet.** 

![example image](result.png)


## Status

> [!WARNING]
> **Heads up:** this repository continues the original EducationPerfected project. It is *not* the original, actively maintained project.

The original was started by [akioweh](https://github.com/KEN-2000l) and is now **[archived](https://github.com/KEN-2000l/EducationPerfected)**. This repo is a loving continuation of that work.

The original's README used to claim its status was: **_CURRECT STATUS: ALL intended features functional._**  
_*Last time they checked... which was... two years ago???*_  
That was never re-verified here, so don't assume this project is fully working.

- This repo's program is version **V1.5** of the V2 approach: an independent JavaScript ([node.js](https://nodejs.org/)) program that uses the [Puppeteer](https://github.com/puppeteer/puppeteer) library to drive a web browser around.
- As of the latest updates, the anti-cheat workaround no longer trips anti-cheat detection.
- That said, the program hasn't been run through the wringer against the live Education Perfect service, so behavior may change or break as the service updates.

## Introduction
This project started as a way to automate tasks on [Education Perfect](https://www.educationperfect.com/) 
which teachers use to set students (of various ages) homework... and one of those students happened to be me.
As a perfectionist myself, I set out to perfect Education Perfect - that's how EducationPerfected was born.  
The main goal/target were and still are language tasks that require you to translate words/phrases from one language
to another.  
Of course, there are also tasks in the same format but with audio involved. _Unfortunately, we (me or any
other kind contributors) have not been able to automate those tasks._ 

The obvious approach was to write a simple userscript in JavaScript that gets injected into the browser 
debugger console. This is the classic method to perform simple automation in browsers. This method is simple, 
cross-platform, and required minimal skill to install & run the script - it was very easy and universal.  
_This was [V1](V1_Archive) of this project._  
It worked great, and notably, at **super** speeds. However, after a long while, Education Perfect released 
anti-cheat features that partially disabled the userscript.

To circumvent this, the script needed more control over the web page and must not run in the page debugger console.  
_This is now V2 of this project:_  
**At the current stage**, it's an independent JavaScript ([node.js](https://nodejs.org/)) program that uses the 
[Puppeteer](https://github.com/puppeteer/puppeteer) library to carry out web-browser automation. The goal is the same
as V1 and the functionality is largely the same. Unfortunately, the standalone structure does make installation slightly 
more complicated, but it is currently the only way to enable full anti-cheat bypass.  
Either way, I have provided detailed instructions for installation and usage below.


## Installation
1. download the EducationPerfected program and starter script ([index.js](index.js) and [start.cmd](start.cmd) or [start.sh](start.sh) found above) and place them in the same folder
2. install [node.js](https://nodejs.org/)
3. open Command Prompt/Terminal **in the folder where `index.js is` located** (right click -> open in terminal or use the `cd` command to change the directory)
4. install the Puppeteer library by running `npm i puppeteer` in your opened Command Prompt/Terminal window*
5. set your **Education Perfect credentials** as environment variables - the program will use them for auto-login  
   - **Windows (Command Prompt):** `set EP_EMAIL=you@example.com` then `set EP_PASSWORD=your-password`  
   - **Windows (PowerShell):** `$env:EP_EMAIL='you@example.com'; $env:EP_PASSWORD='your-password'`  
   - **Linux/macOS (Terminal):** `export EP_EMAIL='you@example.com' EP_PASSWORD='your-password'`  


_*...or whatever method is used to install js libraries on your platform... Google it if necessary._  
_*To enable auto-login, set **both** `EP_EMAIL` and `EP_PASSWORD` before running the script (and keep
the credential values out of the source file). Forgot to set them? No worries - the browser still opens and you can
log in manually. Keep credentials out of the source file by using the environment variables above._  


*NOTE: `npm i puppeteer` normally downloads a compatible Chrome browser automatically. If the first run complains that it can't find a browser, open up Terminal in the same folder and run 
`npx puppeteer browsers install chrome` to download it manually.*


## Usage
### Running the script

Once installed, there are different ways to run the script using Node.js, but the basic way is to open up Terminal and 
type `node "[path to file]"` - e.g. `node "C:\index.js"` (unless .js when, double-clicked, executes with node by default)  

Alternatively, I have provided simple "start" scripts that basically saves the above command in a simple shell script
that you can double-click to run. [start.cmd](start.cmd) is for Windows, and [start.sh](start.sh) is for Linux/Mac (bash).
Save the appropriate starter script in the ***same** folder as index.js* and double-click it to run the script.

You can close the browser window or the popped-up terminal window whenever you are done.  
If you run into weird behavior, try restarting the program.

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
Upon starting, the program does not do anything.  
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
* Load EP home page;  
* All auto-answer functionality is loaded in the background, ready to be used whenever;  
* Log in for you if you provided your credentials.  

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

- **Audio-based tasks aren't supported yet.**
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
- Support for audio-based tasks
- Dedicated anti-cheat bypass features
- Even better answer parsing

A dedicated desktop app has also been floated as a possible future direction; it would be a separate effort
and is not part of this repository.


## License and permission

This project does not claim any license and does not grant any permission for the use of Education Perfect's services
or for automated access to them. Use of the service may be subject to [Education Perfect's terms of service](https://www.educationperfect.com/).
The code and documentation here are provided as-is for educational and hobby purposes.
