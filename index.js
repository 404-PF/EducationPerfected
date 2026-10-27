// v1.5

const puppeteer = require('puppeteer');

(async () => {
    const DIR = {
        email: process.env.EP_EMAIL,  // set EP_EMAIL environment variable to your Education Perfect email for auto login
        password: process.env.EP_PASSWORD,  // set EP_PASSWORD environment variable to your Education Perfect password for auto login

        login_url: 'https://app.educationperfect.com/app/login',

        // log-in page elements
        username_css: '#loginId',
        password_css: '#password',

        // home page elements
        home_css: 'div.view-segment-dashboard',

        // task-starter page elements
        baseList_css: 'div.baseLanguage',
        targetList_css: 'div.targetLanguage',
        start_button_css: 'button#start-button-main',

        // task page elements
        modal_question_css: 'td#question-field',
        modal_correct_answer_css: 'td#correct-answer-field',
        modal_user_answered_css: 'td#users-answer-field',
        modal_css: 'div[uib-modal-window=modal-window]',
        modal_backdrop_css: 'div[uib-modal-backdrop=modal-backdrop]',

        question_css: '#question-text',
        answer_box_css: 'input#answer-text',

        exit_button_css: 'button.exit-button',
        exit_continue_button_css: 'button.continue-button',

        continue_button_css: 'button#continue-button',

        // non-blocking feedback toast (injected by this script, not part of EP)
        toast_id: '__ep_toast',
    }

    // launch browser
    puppeteer.launch({
        headless: false,
        defaultViewport: null,
        handleSIGINT: false
    })
        .then(async browser => {
            const page = (await browser.pages())[0];

            // Open EP page and log in
            console.log('Opening EP page...');
            await page.goto(DIR.login_url);
            console.log('Waiting for login page to load...');
            await page.waitForSelector(DIR.username_css);

            if (DIR.email && DIR.password) {
                // THIS FILLS IN YOUR DETAILS TO LOG IN AUTOMATICALLY
                console.log('Filling in login details...');
                await page.type(DIR.username_css, DIR.email);
                await page.type(DIR.password_css, DIR.password);
                // wait for the redirect to finish before continuing, so the hotkey setup
                // below runs in the logged-in document instead of racing the navigation
                await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]);

                console.log('Waiting for home page to load...');
                // await page.waitForSelector(DIR.home_css, { timeout: 0 });
                console.log('EP Home page loaded; Logged in.');
            } else {
                console.log('EP_EMAIL and EP_PASSWORD are not set; skipping auto-login. Log in manually in the opened browser window.');
                await page.waitForSelector(DIR.home_css, { timeout: 0 });
            }


            // ===== Auto-answer code starts here ===== //
            let TOGGLE = false;  // user intent: the loop should be answering right now
            let RUNNING = null;  // promise handle of the run currently executing, or null
            let CLEANUP = null;  // promise of the most recent run's post-run modal cleanup
            let ENTER = true;

            // How long to wait for EP to move on to the next question after a submission.
            // EP round-trips (large class, slow backend, transient lag) can legitimately
            // exceed 5s, so a fixed 5s timeout used to abort the whole task on one slow
            // round. Keep generous, and retry the round once before giving up.
            const ADVANCE_TIMEOUT = 15000;

            let fullDict = {};
            let cutDict = {};

            // Basic answer-parsing
            function cleanString(string) {
                return String(string)
                    .replace(/\([^)]*\)/g, "").trim()
                    .split(";")[0].trim()
                    .split(",")[0].trim()
                    .split("|")[0].trim();
            }

            // Get words from the main task page. innerText (unlike textContent) respects rendering,
            // so lists that are visually split one-per-line are read as separate entries instead of
            // as a single run-together string.
            async function wordList(selector) {
                return await page.$$eval(selector, els => {
                    let words = [];
                    els.forEach(i => words.push(i.innerText));
                    return words;
                });
            }

            // Refreshes the world lists on the main task page to enhance our vocabulary
            // Reads the question text; null when the element is not currently rendered
            // (task finished, transitional rendering, navigation). $eval throws on a
            // missing node, and the answering loop must treat that as a signal, not a crash.
            async function readQuestionText() {
                try {
                    return await page.$eval(DIR.question_css, el => el.textContent);
                } catch (e) {
                    return null;
                }
            }

            async function refreshWords() {
                const base = await wordList(DIR.baseList_css);
                const target = await wordList(DIR.targetList_css);

                if (base.length !== target.length) {
                    const mismatch = `Word Lists Not Refreshed: ${base.length} base vs ${target.length} target entries; lists do not line up, so pairing them would teach wrong answers.`;
                    console.warn(mismatch);
                    await alert(mismatch);
                    return;
                }
                if (base.length === 0) {
                    const empty = 'Word Lists Refreshed. 0 entries: no word lists found. Press Refresh Words on the task-starter page with the word lists visible.';
                    console.warn(empty);
                    await alert(empty);
                    return;
                }

                const count = base.length;
                for (let i = 0; i < count; i++) {
                    const l1 = base[i];
                    const l2 = target[i];
                    fullDict[l2] = cleanString(l1);
                    fullDict[l1] = cleanString(l2);
                    cutDict[cleanString(l2)] = cleanString(l1);
                    cutDict[cleanString(l1)] = cleanString(l2);
                }

                // report how many entries were scraped so a partial/empty scrape is diagnosable
                const msg = `Word Lists Refreshed. ${count} entries (${base.length} base, ${target.length} target).`;
                console.log(msg);
                await alert(msg);
            }


            // extracts what EP detected as the user's answer, reading the per-word segments of the
            // fancy multicoloured display. Reads only, so a missing field is an empty string, not a throw.
            async function getModalAnswered() {
                return await page.evaluate(() => {
                    const field = document.querySelector('td#users-answer-field');
                    if (!field) return '';
                    let answered = '';
                    field.querySelectorAll('*').forEach(i => {
                        if (i.textContent !== null && i.style.color !== 'rgba(0, 0, 0, 0.25)') answered = answered + i.textContent;
                    })
                    return answered;
                });
            }

            // Learn from the mistakes :)
            // Returns true if the dictionary was updated, false if there was no usable correction.
            async function correctAnswer(question, answer) {
                // wait until the modal's correct answer has actually been filled in. The old guard
                // only checked for "not blau", which an empty or not-yet-rendered field satisfies,
                // so empty answers were read and then written into the dictionary permanently.
                let loaded = true;
                try {
                    await page.waitForFunction((qCss, aCss) => {
                        const q = document.querySelector(qCss);
                        const a = document.querySelector(aCss);
                        if (!q || !a) return false;
                        // an empty question is transitional too; accepting it would store the
                        // correction under "" and pollute every lookups that touch empty keys
                        if (q.textContent.trim() === '' || q.textContent.trim() === 'blau') return false;
                        return a.textContent.trim() !== '';
                    }, { timeout: 5000 }, DIR.modal_question_css, DIR.modal_correct_answer_css);
                } catch (e) {
                    loaded = false;
                }

                // extract modal contents (for debugging and correcting answers)
                const modal = await page.evaluate((qCss, aCss) => {
                    const q = document.querySelector(qCss);
                    const a = document.querySelector(aCss);
                    return {
                        question: q ? q.textContent : '',
                        answer: a ? a.textContent : '',
                    };
                }, DIR.modal_question_css, DIR.modal_correct_answer_css);
                const modalQuestion = modal.question;
                const modalAnswer = modal.answer;
                const modalCutAnswer = cleanString(modalAnswer);
                const modalAnswered = await getModalAnswered();

                // a missing/empty modal is not a correction; bail out and leave the dictionaries alone
                const modalsGone = await page.evaluate((css) => document.querySelectorAll(css).length === 0, DIR.modal_css);
                const modalCutQuestion = cleanString(modalQuestion);
                if (!loaded || modalsGone || modalCutAnswer === '' || modalCutQuestion === '') {
                    console.log(`Skipping answer correction for "${question}": ${modalsGone ? 'modal disappeared' : 'no usable question/answer'} (raw modal answer: "${modalAnswer}").`);
                    return false;
                }

                // dismisses the modal (bypasses the required cooldown)
                const continueClicked = await page.evaluate((css) => {
                    const button = document.querySelector(css);
                    if (!button) return false;
                    button.disabled = false;
                    button.click();
                    return true;
                }, DIR.continue_button_css);
                if (!continueClicked) {
                    console.log('Continue button missing; deleting modal directly.');
                    await deleteModals();
                }

                // Learn ONLY the pairing the modal proves: EP grades the submission against
                // ITS question (modalQuestion), so modalQuestion -> modalCutAnswer is the one
                // verifiably true mapping. Writing the script-detected `question` here used
                // to poison the dictionary whenever the round advanced while the answer was
                // being typed: the detected question then belonged to an item different from
                // the one graded, and every later occurrence of those words was mis-answered
                // while "learning" wrote the wrong pairing back again.
                if (modalQuestion !== question) {
                    console.warn(`Round skew: read question "${question}" but EP graded "${modalQuestion}". Learning only the graded pairing.`);
                }
                fullDict[modalQuestion] = modalCutAnswer;
                cutDict[modalCutQuestion] = modalCutAnswer;

                // logging for debugging if needed
                let log = "===== Details after Incorrect Answer: =====\n"
                log = log + `Detected Question: \n => ${question}\n`;
                log = log + `Inputted Answer: \n => ${answer}\n\n`;
                log = log + `Modal Question: \n => ${modalQuestion}\n`;
                log = log + `Modal Full Answer: \n => ${modalAnswer}\n`;
                log = log + `Modal Cut Answer: \n => ${modalCutAnswer}\n`;
                log = log + `Modal Detected Answered: \n => ${modalAnswered}\n\n\n`;

                console.log(log);
                return true;
            }

            // deletes all existing modals and backdrops. Used to force-speed things up
            async function deleteModals() {
                await page.$$eval(DIR.modal_css, el => {
                    el.forEach(i => i.remove())
                });
                await page.$$eval(DIR.modal_backdrop_css, el => {
                    el.forEach(i => i.remove())
                });
            }

            // very advanced logic (ofc) used to find matching answer
            function findAnswer(question) {
                const candidates = [
                    fullDict[question],
                    fullDict[question.replace(",", ";")],
                    cutDict[cleanString(question)],
                ];
                // skip blank entries: a poisoned or half-scraped dictionary value must not be
                // treated as a hit, otherwise the loop stalls on an unanswerable question
                for (const answer of candidates) {
                    if (typeof answer === 'string' && answer.trim() !== '') return answer;
                }
                console.log(`No answer found for ${question}`);
                return generateRandomString(8, 10);
            }

            // i love creating functions so here's one for the random string instead of just returning idk answer 
            // -joshatticus
            function generateRandomString(minLength, maxLength) {
                const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
                const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                let result = '';
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                return result;
            }

            // Handles whatever modal is on screen after an answer was submitted.
            // Returns false when the loop should stop (task complete), true to keep answering.
            async function handleModal(question, answer) {
                // allow the modal a moment to render before deciding what it is
                await page.waitForSelector(DIR.modal_css, { timeout: 2000 }).catch(() => { });

                // incorrect answer and modal pops up; initiate answer-correction procedure
                if (await page.$(DIR.modal_question_css) !== null) {
                    await correctAnswer(question, answer);
                    await deleteModals();
                } else if (await page.$(DIR.exit_button_css)) {
                    // list complete; clicks button to exit
                    await page.click(DIR.exit_button_css);
                    return false;
                } else if (await page.$(DIR.exit_continue_button_css)) {
                    await page.click(DIR.exit_continue_button_css);
                    return false;
                } else {
                    // no idea what the modal is for so let's just pretend it doesn't exist
                    await deleteModals();
                }
                return true;
            }

            // Waits until the round moves on past `previous`, or a modal becomes visible.
            // "Moved on" is not just a question-text change: dictionary tasks can redraw
            // the exact same question, so the answer box is watched too — EP clearing it
            // for the next round means the round resolved even though the text repeats.
            // Only a present, empty box counts: a transiently missing box is not progress,
            // and a box holding new text (e.g. the user editing the proposed answer in
            // semi-auto) must keep the loop waiting. Polls instead of using
            // waitForFunction so the wait is abortable: TOGGLE can go false at any time
            // (Alt+S, or a restart) and must not leave a stray loop running. Resolves
            // early with status 'timeout' rather than throwing.
            async function waitForAdvance(previous, timeout, submitted) {
                const deadline = timeout > 0 ? Date.now() + timeout : Infinity;
                while (TOGGLE && Date.now() < deadline) {
                    const state = await page.evaluate((qCss, mCss, aCss) => {
                        const q = document.querySelector(qCss);
                        const box = document.querySelector(aCss);
                        return {
                            question: q ? q.textContent : null,
                            modal: document.querySelector(mCss) !== null,
                            box: box ? box.value : null,
                        };
                    }, DIR.question_css, DIR.modal_css, DIR.answer_box_css);

                    if (state.modal) return 'modal';
                    if (state.question === null || state.question !== previous) return 'advanced';
                    if (typeof submitted === 'string' && state.box === '') return 'advanced';
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                return TOGGLE ? 'timeout' : 'aborted';
            }

            // Reads the answer box's value; null when the box is not currently rendered
            // (transitional render between rounds). $eval throws on a missing node, and
            // that must never crash the loop.
            async function answerBoxValue() {
                try {
                    return await page.$eval(DIR.answer_box_css, el => el.value);
                } catch (e) {
                    return null;
                }
            }

            // Pause between keystrokes when typing an answer. Zero-gap keystrokes race
            // EP's own input handling, which re-applies the value it last committed to
            // the box at unpredictable moments — grafting snapshots of old text into the
            // middle of the fresh one, so "I speak" arrived as "I I sI speakeakat".
            // Spacing the keystrokes gives EP's handling time to keep up, the way it
            // does for human typing. 20ms keeps a 7-character word under 0.2s, and any
            // attempt that still garbles is caught by enterAnswer's verification and
            // retried with an escalated delay.
            const TYPE_DELAY_MS = 20;

            // Focuses and empties the answer box, verifying emptiness before returning
            // (true = box is empty, false = box missing or content kept surviving the
            // clear). The old blind click+Backspace could leave EP-restored content
            // behind, and the subsequent type then interleaved old and new text.
            async function clearAnswerBox() {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const before = await answerBoxValue();
                    if (before === null) return false;
                    await page.click(DIR.answer_box_css, { clickCount: 3 }).catch(() => { });
                    if (attempt % 2 === 1) {
                        // the mouse triple-click selection can be swallowed by the page;
                        // select-all via the keyboard is a different code path. The chord
                        // is sent as explicit modifier/key presses, not a "Control+a"
                        // combo string whose parsing varies between Puppeteer versions,
                        // and a failure to send it must not kill the run: the
                        // triple-click + Backspace still applies.
                        await page.keyboard.down('Control').catch(() => { });
                        await page.keyboard.press('a').catch(() => { });
                        await page.keyboard.up('Control').catch(() => { });
                    }
                    await page.keyboard.press('Backspace');
                    const value = await answerBoxValue();
                    if (value === null) return false;
                    if (value === '') {
                        // nothing was ever in the box: no content could be restored, so
                        // skip the settle beat (the common case mid-task)
                        if (before === '') return true;
                        // content was cleared: brief settle so an EP restore of it still
                        // surfaces before typing starts
                        await new Promise(resolve => setTimeout(resolve, 20));
                        return (await answerBoxValue()) === '';
                    }
                    // content survived/reappeared (restored asynchronously); pause so this
                    // round's restore lands, then check and clear again
                    await new Promise(resolve => setTimeout(resolve, 40));
                }
                return false;
            }

            // Reads the box until its value stops changing, so a keystroke still being
            // processed after type() returns is absorbed instead of being read as a
            // mismatch (the old immediate read landed mid-flush: "spicy" got judged as
            // "spicyy" and every deterministic retry reproduced it). A matching value
            // must also HOLD across a second sample: a lone exact read could still be
            // followed by a late keystroke. Reserves ~8 reads at 25ms of patience.
            async function readSettledBox(answer) {
                let previous = null;
                for (let i = 0; i < 8; i++) {
                    const value = await answerBoxValue();
                    if (value === null) return value;
                    if (value === previous) return value; // stabilized without matching
                    if (value === answer) {
                        await new Promise(resolve => setTimeout(resolve, 25));
                        const confirm = await answerBoxValue();
                        if (confirm === answer) return value; // matched and held
                        previous = confirm; // changed after the match: keep settling
                        continue;
                    }
                    previous = value;
                    await new Promise(resolve => setTimeout(resolve, 25));
                }
                return previous;
            }

            // Types `answer` into the answer box and verifies the box really contains it.
            // The typing uses real key events (page.keyboard.type dispatches
            // keydown/keypress/keyup for every character, unlike sendCharacter which
            // only fires an input event), so EP's answer box observes genuine input and
            // will not ignore the subsequent Enter. Every keystroke is awaited, so the
            // caller cannot read the question while this answer is still arriving.
            // Returns:
            //   true  — the box contains exactly `answer` (held across a second read)
            //   false — the answer box vanished (transitional render) or the run was
            //           stopped; the caller can restart its pass to re-read the question
            // Throws after several attempts, escalating the keystroke delay each time;
            // if EP still garbles the stream that badly, failing loudly is the only
            // honest outcome.
            async function enterAnswer(answer) {
                const delays = [TYPE_DELAY_MS, TYPE_DELAY_MS * 3, TYPE_DELAY_MS * 8];
                for (let attempt = 0; attempt < delays.length; attempt++) {
                    if (!await clearAnswerBox()) {
                        // Never type into an uncleared box: EP-restored text would combine
                        // with the fresh keystrokes. A vanished box is a round transition
                        // (the caller re-reads it); otherwise clear again on the next attempt.
                        if (await answerBoxValue() === null) return false;
                        continue;
                    }
                    if (!TOGGLE) return false;

                    await page.keyboard.type(answer, { delay: delays[attempt] });
                    if (!TOGGLE) return false;
                    const typed = await readSettledBox(answer);
                    if (typed === answer) return true;
                    if (typed === null) return false; // box vanished mid-attempt (round transition)
                    console.log(`Answer box mismatch; expected "${answer}", got "${typed}". Retrying.`);
                }
                throw new Error(`Could not enter answer "${answer}" (box contains "${await answerBoxValue()}").`);
            }

            // the last (question, answer) submitted in the current run. A round whose
            // submission is still on screen must not be resubmitted blindly — the stall
            // guard below checks for exactly that. Cleared whenever a modal is handled,
            // since that means the round resolved.
            let lastSubmitted = null;

            // Resolves whatever modal is on screen.
            // Never assigns its result to TOGGLE: the user may have pressed Alt+S while the modal
            // was being handled, and that stop request must survive. Returns false only when the
            // task is complete (the exit buttons were clicked).
            async function handleModalAndContinue(question, answer) {
                const keepGoing = await handleModal(question, answer);
                if (!keepGoing) return false;
                if (TOGGLE) {
                    // a modal means the round resolved, so the next pass is a fresh round and the
                    // stall guard must not treat a recurring question as a resubmission
                    lastSubmitted = null;
                }
                return TOGGLE;
            }

            // main function that continually answers questions until completion modal pops up or hotkey pressed again
            async function answerLoop() {
                if (RUNNING !== null) throw Error("Tried to initiate answerLoop while it is already running");

                TOGGLE = true;
                lastSubmitted = null;
                console.log("answerLoop entered.");

                try {
                    // If the previous run's modal cleanup is still in flight, wait for it
                    // before answering: the old deleteModals() must never remove a modal
                    // that belongs to this fresh run (e.g. its first wrong-answer modal).
                    // A stop pressed during this hand-over simply leaves TOGGLE false, and
                    // the loop below exits without touching the page.
                    if (CLEANUP !== null) await CLEANUP;
                    await answerQuestions();
                } finally {
                    // Go inert BEFORE the async cleanup runs. deleteModals() costs two
                    // browser round-trips, so clearing the flags first makes the stop
                    // observable immediately: an Alt+S landing during cleanup starts a
                    // fresh run instead of being consumed as a phantom second stop, and
                    // no stale flag write can kill that new run.
                    TOGGLE = false;
                    RUNNING = null;

                    // always clean up, including on error paths, so a late modal or backdrop
                    // is never left covering the page. CLEANUP is recorded so a run spawned
                    // during this cleanup chains after it instead of overlapping it.
                    CLEANUP = deleteModals().catch(e => console.error('answerLoop cleanup failed:', e));
                    await CLEANUP;
                    console.log('answerLoop Exited.');
                }
            }

            // the answering loop itself; separated so answerLoop can always clean up
            async function answerQuestions() {
                // bounded respawn counters: a page in a dead state must not restart
                // answer entry forever
                let boxVanishedRounds = 0;  // answer box missing at answer-entry time
                let unstableRounds = 0;     // question text never held still in a pass
                let boxTamperedRounds = 0;  // answer box rewritten between entry and submission

                while (TOGGLE) {
                    let question = await readQuestionText();
                    if (question === null) {
                        // The question element disappears on round transitions and on the
                        // task's end screens, but an unconfirmed disappearance must not
                        // kill a live run or click the wrong control: wait (up to ~20s)
                        // for the element to return, or for an explicit completion state —
                        // a modal, or exit/continue controls on the completion screen.
                        // The old code crashed here with a bare $eval; then it broke out
                        // of the run on any unconfirmed null question.
                        let complete = false;   // completion controls were seen on screen
                        let modalSeen = false;  // a modal is up; route it to its handler
                        for (let i = 0; i < 80 && TOGGLE; i++) {
                            await new Promise(resolve => setTimeout(resolve, 250));
                            question = await readQuestionText();
                            if (question !== null) break;
                            if (await page.$(DIR.modal_css) !== null) { modalSeen = true; break; }
                            complete = await page.evaluate((exitCss, contCss) => {
                                return document.querySelector(exitCss) !== null
                                    || document.querySelector(contCss) !== null;
                            }, DIR.exit_button_css, DIR.exit_continue_button_css).catch(() => false);
                            if (complete) break;
                        }
                        if (question === null) {
                            if (modalSeen) {
                                // the completion flow is a modal window: let the modal path
                                // resolve it (it clicks exit/continue and reports completion)
                                if (!await handleModalAndContinue(lastSubmitted?.question ?? '', lastSubmitted?.answer ?? '')) break;
                                continue;
                            }
                            console.log(complete
                                ? 'Question element gone; task completion confirmed. Ending the run.'
                                : 'Question element never returned within 20s; stopping the run.');
                            if (complete && TOGGLE) {
                                const exited = await page.evaluate((exitCss, contCss) => {
                                    const button = document.querySelector(exitCss) || document.querySelector(contCss);
                                    if (!button) return false;
                                    button.click();
                                    return true;
                                }, DIR.exit_button_css, DIR.exit_continue_button_css).catch(() => false);
                                console.log(exited ? 'Clicked the task exit/continue button.' : 'The completion controls vanished; stopping the run.');
                            }
                            break;
                        }
                        // the element came back: fall through to the fresh pass
                    }
                    // EP swaps the question element's text asynchronously after starting a
                    // round; reads taken mid-swap pick up the word EP WAS asking, not the
                    // one it is asking now (the runs watched the text flip between deck
                    // words before any submission). Start every pass from a text that
                    // holds still: require two reads 120ms apart to agree. If the text
                    // still churned after the window, do NOT type against an unverified
                    // word — restart the pass, at most three times before giving up.
                    let unstable = true;
                    for (let i = 0; i < 15 && TOGGLE; i++) {
                        await new Promise(resolve => setTimeout(resolve, 120));
                        const again = await readQuestionText();
                        if (again === null) { question = null; break; }
                        if (again !== question) { question = again; continue; }
                        unstable = false;
                        break;
                    }
                    if (!TOGGLE) break;
                    if (question === null) {
                        console.log('Question vanished during stabilization; re-reading it in a fresh pass.');
                        continue;
                    }
                    if (unstable) {
                        unstableRounds += 1;
                        console.log(`Question text churned within a pass; restart ${unstableRounds}/3.`);
                        if (unstableRounds >= 3) {
                            console.log('Question text never held still; stopping the run.');
                            break;
                        }
                        continue;
                    }
                    unstableRounds = 0;

                    let answer = findAnswer(question);
                    if (typeof answer !== 'string' || answer === '') {
                        console.log(`Refusing to type an empty answer for "${question}".`);
                        break;
                    }

                    // The screen can look identical after a round: dictionary tasks draw
                    // words at random, so the next question can repeat the same text. The
                    // previous submission is still pending only while the box still holds
                    // exactly what was typed for it; a cleared box means EP moved on and
                    // expects a fresh round, so identical question+answer is then legitimate.
                    const boxValue = await answerBoxValue();
                    const stillPending = lastSubmitted !== null
                        && lastSubmitted.question === question
                        && lastSubmitted.answer === answer
                        && boxValue === lastSubmitted.answer;
                    if (stillPending) {
                        // the previous round for this question produced no visible progress. Rather
                        // than resubmitting it, wait for the page to catch up (or stop).
                        console.log(`Question "${question}" has not advanced since the last submission; waiting before retrying.`);
                        const stalled = await waitForAdvance(question, 0, lastSubmitted.answer);
                        if (stalled === 'aborted') break;
                        if (stalled === 'modal') {
                            if (!await handleModalAndContinue(question, answer)) break;
                        }
                        continue;
                    }

                    // enterAnswer clears the box, types it as real keystrokes
                    // (spaced out so EP's own input handling can keep up), and verifies
                    // the box before returning. A false return means the box vanished
                    // during a round transition: re-read on the next pass, but only a
                    // bounded number of times — a box that stays missing while the
                    // question element remains must not restart forever.
                    if (!await enterAnswer(answer)) {
                        boxVanishedRounds += 1;
                        console.log(`Answer box missing at entry; restart ${boxVanishedRounds}/5.`);
                        if (boxVanishedRounds >= 5) {
                            console.log('Answer box never reappeared; stopping the run.');
                            break;
                        }
                        continue;
                    }
                    boxVanishedRounds = 0;
                    if (!TOGGLE) break;

                    // The round can advance while the answer is being typed; EP then grades
                    // the submission against a different item than `question` was looked up
                    // from (see round-skew warnings in the log). Re-read the question and
                    // abandon the pass if it changed: the box content is wrong for the new
                    // item, and the next pass must look the answer up again — the stale text
                    // is cleared on the way. The second read just beneath catches questions
                    // whose element updates a beat after the box resets.
                    const freshQuestion = await readQuestionText();
                    if (freshQuestion === null) {
                        console.log('Question vanished after typing; re-reading it on the next pass.');
                        continue;
                    }
                    if (freshQuestion !== question) {
                        // EP can consume a matching answer without waiting for Enter, clearing
                        // the box as the round advances: an empty box here means the text just
                        // typed was already graded, so this is progress, not a discard.
                        const boxAfter = await answerBoxValue();
                        console.log(boxAfter === ''
                            ? `Round auto-graded during "question changed" check (${question} → ${freshQuestion}); moving on.`
                            : `Question changed while typing ("${question}" → "${freshQuestion}"); looking the answer up again.`);
                        // EP grading the just-typed text is real progress: the box was not
                        // fighting us, so the interference streak ends here.
                        if (boxAfter === '') boxTamperedRounds = 0;
                        continue;
                    }
                    await new Promise(resolve => setTimeout(resolve, 50));
                    const latestQuestion = await readQuestionText();
                    if (latestQuestion === null) {
                        console.log('Question vanished after typing; re-reading it on the next pass.');
                        continue;
                    }
                    if (latestQuestion !== question) {
                        const boxAfter = await answerBoxValue();
                        console.log(boxAfter === ''
                            ? `Round auto-graded during late check (${question} → ${latestQuestion}); moving on.`
                            : `Question changed while typing ("${question}" → "${latestQuestion}"); looking the answer up again.`);
                        if (boxAfter === '') boxTamperedRounds = 0;
                        continue;
                    }
                    // even with the question text intact, the box content can still change
                    // during the wait above: submit only what was verified, or not at all.
                    const boxBeforeEnter = await answerBoxValue();
                    if (boxBeforeEnter !== answer) {
                        if (boxBeforeEnter === null) {
                            boxVanishedRounds += 1;
                            console.log(`Answer box missing before submission (${boxVanishedRounds}/5); re-reading on a fresh pass.`);
                            if (boxVanishedRounds >= 5) {
                                console.log('Answer box never returned; stopping the run.');
                                break;
                            }
                        } else {
                            boxTamperedRounds += 1;
                            console.log(`Answer box changed before submission for "${question}" (now "${boxBeforeEnter}"); restart ${boxTamperedRounds}/5.`);
                            if (boxTamperedRounds >= 5) {
                                console.log('The answer box keeps changing between entry and submission; stopping the run.');
                                break;
                            }
                        }
                        continue;
                    }
                    if (!TOGGLE) break;

                    if (ENTER) await page.keyboard.press('Enter');
                    lastSubmitted = { question, answer };
                    // a real submission happened: any box-interference streak is over
                    boxTamperedRounds = 0;

                    // wait for the round to move on before the next lookup, so the next answer is
                    // not typed against the question that was just submitted. A modal (wrong
                    // answer, or task complete) ends the wait immediately, and so does the box
                    // being cleared for the next round — which happens even when the dealt
                    // question repeats the same text.
                    const outcome = await waitForAdvance(question, ENTER ? ADVANCE_TIMEOUT : 0, answer);

                    if (outcome === 'aborted') break;

                    if (outcome === 'modal') {
                        if (!await handleModalAndContinue(question, answer)) break;
                        continue;
                    }

                    if (outcome === 'timeout') {
                        if (!ENTER) {
                            // semi-auto: the answer is typed and awaiting the user's Enter. Wait for the
                            // round to resolve before touching the next question, so stopping and
                            // restarting the loop never double-submits. (This wait is unbounded, so it
                            // cannot actually time out; the branch is kept for safety.)
                            console.log(`Waiting for the answer to "${question}" to be submitted.`);
                            const resolved = await waitForAdvance(question, 0, answer);
                            if (resolved === 'aborted') break;
                            if (resolved === 'modal') {
                                if (!await handleModalAndContinue(question, answer)) break;
                            }
                            continue;
                        }

                        // the round has not moved on yet. One retry: EP can swallow the
                        // first Enter (it checks for real key events now, but focus or
                        // round-trip timing can still lose it). The timeout branch is only
                        // reached with the round genuinely unresolved (no modal, question
                        // unchanged, box not cleared for a new round), so re-submitting
                        // the same content is safe. Only a second timeout stops the run;
                        // break rather than throw so the loop falls through to its modal
                        // cleanup.
                        console.log(`Question "${question}" did not advance within ${ADVANCE_TIMEOUT}ms; pressing Enter again.`);
                        if (!TOGGLE) break;
                        await page.click(DIR.answer_box_css).catch(() => { });
                        if (!TOGGLE) break;
                        await page.keyboard.press('Enter');
                        const retry = await waitForAdvance(question, ADVANCE_TIMEOUT, answer);
                        if (retry === 'timeout') {
                            console.error(`Question "${question}" did not advance after submitting "${answer}". Stopping.`);
                            await alert(`Answer loop stopped: "${question}" did not advance.`);
                            break;
                        }
                        if (retry === 'aborted') break;
                        if (retry === 'modal') {
                            if (!await handleModalAndContinue(question, answer)) break;
                        }
                    }
                }
            }

            // takes care of answerLoop toggling logic.
            // Start/stop is decided from the RUNNING handle (the actually executing run),
            // not from the TOGGLE flag: TOGGLE used to stay true for a while after a run
            // had already stopped (cleanup still in flight), so gating on it made a
            // restart press be consumed as a phantom second stop with no work done.
            function startLoop() {
                TOGGLE = true;
                const myRun = answerLoop()
                    .catch(e => {
                        // log only: answerLoop's own finally already cleared TOGGLE on every
                        // path that can reach this handler, and a stale TOGGLE = false here
                        // would cancel a newer run spawned while the old cleanup was pending
                        console.error(e);
                    })
                    .finally(() => {
                        // backstop: a run that crashed outside answerLoop's finally must
                        // not leave a stale handle behind, or every later press would be
                        // misread as "stop while running". The identity check is needed
                        // because a newer run can already be executing by the time an
                        // older run's cleanup settles (an Alt+S during cleanup spawns a
                        // fresh run while the old cleanup is still pending).
                        if (RUNNING === myRun) RUNNING = null;
                    });
                RUNNING = myRun;
            }

            async function toggleLoop() {
                if (RUNNING) {
                    TOGGLE = false;
                    console.log("Stopping answerLoop.");
                } else {
                    console.log("Starting answerLoop.");
                    startLoop();
                }
            }

            async function toggleAuto() {
                if (ENTER) {
                    ENTER = false;
                    console.log("Switched to semi-auto mode.");
                    await alert("Switched to semi-auto mode.");
                } else {
                    ENTER = true;
                    console.log("Switched to auto mode.");
                    await alert("Switched to auto mode.");
                }
            }

            // Non-blocking feedback.
            // The old implementation used the native window.alert(), which is modal: it freezes
            // the page's JS (including the answer loop and hotkey handler) until it is dismissed.
            // Instead we render a small toast in the page and let it fade out on its own.
            // The toast is a persistent live region (role="status"), so screen readers announce
            // each message the way they would have announced the native alert.
            async function alert(msg) {
                await page.evaluate((m, id) => {
                    let toast = document.getElementById(id);
                    if (!toast) {
                        // recreated after navigation, or on first use
                        toast = document.createElement('div');
                        toast.id = id;
                        toast.setAttribute('role', 'status');
                        toast.setAttribute('aria-live', 'polite');
                        Object.assign(toast.style, {
                            position: 'fixed',
                            top: '16px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: '2147483647',
                            padding: '10px 18px',
                            borderRadius: '6px',
                            background: 'rgba(20, 20, 20, 0.9)',
                            color: '#fff',
                            font: '14px/1.4 sans-serif',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                            pointerEvents: 'none',
                            opacity: '0',
                            transition: 'opacity 400ms ease',
                        });
                        document.body.appendChild(toast);
                    }

                    // reuse the same element so the live region stays registered with AT
                    toast.textContent = m;
                    toast.style.opacity = '1';

                    clearTimeout(toast.__epHide);
                    clearTimeout(toast.__epClear);
                    toast.__epHide = setTimeout(() => { toast.style.opacity = '0'; }, 1600);
                    toast.__epClear = setTimeout(() => { toast.textContent = ''; }, 2100);
                }, msg, DIR.toast_id);
            }

            // Expose API functions to the page (for hotkey event listeners to call).
            // These bindings live on the browser context, not on the document, so they
            // survive navigation - but the keyup listener does not, and must be re-added.
            await page.exposeFunction('refresh', refreshWords);
            await page.exposeFunction('startAnswer', toggleLoop);
            await page.exposeFunction('toggleMode', toggleAuto);

            // Add event listeners for hotkeys ON the page.
            // A document-level listener is destroyed by every navigation (login redirect,
            // moving between SPA routes that trigger a full load, etc.), which used to leave
            // the hotkeys dead afterwards.
            //
            // The browser-side install is registered as a preload script, so it re-runs on every
            // new document at parse time and does not depend on the host noticing the navigation.
            // It is also run once now, to cover the document that is already loaded. The window
            // guard keeps it idempotent, so re-running it never stacks duplicate listeners.
            const installHotkeysInPage = () => {
                if (window.top !== window || window.__epHotkeysInstalled) return;
                window.__epHotkeysInstalled = true;

                document.addEventListener("keyup", async (event) => {
                    let key = event.key.toLowerCase();
                    if (key !== 'alt') {
                        if ((event.altKey && key === "r") || (key === "®")) {
                            await window.refresh();
                        } else if ((event.altKey && key === "s") || (key === "ß")) {
                            await window.startAnswer();
                        } else if ((event.altKey && key === "a") || (key === "å")) {
                            await window.toggleMode();
                        }
                    }
                });
            };

            await page.evaluateOnNewDocument(installHotkeysInPage);
            await page.evaluate(installHotkeysInPage);

            console.log('Education Perfected V2 fully Loaded.');
        });
})();
