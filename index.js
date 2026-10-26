// v1.4

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
            let TOGGLE = false;
            let ENTER = true;
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

                // update/correct answer dictionary. Both dictionaries are updated so that a lookup
                // which was answered from cutDict gets fixed on the path that actually failed.
                // cutDict keys are always cleaned, so the modal question must be cleaned too.
                fullDict[question] = modalCutAnswer;
                fullDict[modalQuestion] = modalCutAnswer;
                cutDict[cleanString(question)] = modalCutAnswer;
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

            // Waits until either the question advances past `previous` or a modal becomes visible.
            // Polls instead of using waitForFunction so the wait is abortable: TOGGLE can go false
            // at any time (Alt+S, or a restart) and must not leave a stray loop running.
            // Resolves early with status 'timeout' rather than throwing.
            async function waitForAdvance(previous, timeout) {
                const deadline = timeout > 0 ? Date.now() + timeout : Infinity;
                while (TOGGLE && Date.now() < deadline) {
                    const state = await page.evaluate((qCss, mCss) => {
                        const q = document.querySelector(qCss);
                        return {
                            question: q ? q.textContent : null,
                            modal: document.querySelector(mCss) !== null,
                        };
                    }, DIR.question_css, DIR.modal_css);

                    if (state.modal) return 'modal';
                    if (state.question === null || state.question !== previous) return 'advanced';
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                return TOGGLE ? 'timeout' : 'aborted';
            }

            // the last (question, answer) submitted in the current run, so a round that failed to
            // advance can never be submitted a second time (e.g. slow rendering, or a restart).
            // Cleared whenever a modal is handled, since that means the round resolved.
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
                if (TOGGLE) throw Error("Tried to initiate answerLoop while it is already running");

                TOGGLE = true;
                lastSubmitted = null;
                console.log("answerLoop entered.");

                try {
                    await answerQuestions();
                } finally {
                    // always clean up, including on error paths, so a late modal or backdrop
                    // is never left covering the page
                    await deleteModals();
                    TOGGLE = false;
                    console.log('answerLoop Exited.');
                }
            }

            // the answering loop itself; separated so answerLoop can always clean up
            async function answerQuestions() {
                while (TOGGLE) {
                    let question = await page.$eval(DIR.question_css, el => el.textContent);
                    let answer = findAnswer(question);
                    if (typeof answer !== 'string' || answer === '') {
                        console.log(`Refusing to type an empty answer for "${question}".`);
                        break;
                    }

                    if (lastSubmitted !== null && lastSubmitted.question === question && lastSubmitted.answer === answer) {
                        // the previous round for this question produced no visible progress. Rather
                        // than resubmitting it, wait for the page to catch up (or stop).
                        console.log(`Question "${question}" has not advanced since the last submission; waiting before retrying.`);
                        const stalled = await waitForAdvance(question, 0);
                        if (stalled === 'aborted') break;
                        if (stalled === 'modal') {
                            if (!await handleModalAndContinue(question, answer)) break;
                        }
                        continue;
                    }

                    // clear the box first, then type. Every keystroke is awaited so the next
                    // iteration cannot read the question while this answer is still arriving.
                    await page.click(DIR.answer_box_css, { clickCount: 3 });
                    await page.keyboard.press('Backspace');
                    await page.keyboard.sendCharacter(answer);

                    // make sure the box really contains the answer before submitting it
                    const typed = await page.$eval(DIR.answer_box_css, el => el.value);
                    if (typed !== answer) {
                        console.log(`Answer box mismatch; expected "${answer}", got "${typed}". Retrying.`);
                        await page.click(DIR.answer_box_css, { clickCount: 3 });
                        await page.keyboard.press('Backspace');
                        await page.keyboard.type(answer);
                        const retyped = await page.$eval(DIR.answer_box_css, el => el.value);
                        if (retyped !== answer) {
                            throw new Error(`Could not enter answer "${answer}" (box contains "${retyped}").`);
                        }
                    }

                    if (ENTER) await page.keyboard.press('Enter');
                    lastSubmitted = { question, answer };

                    // wait for the round to move on before the next lookup, so the next answer is
                    // not typed against the question that was just submitted. A modal (wrong
                    // answer, or task complete) ends the wait immediately instead of costing the
                    // full timeout.
                    const outcome = await waitForAdvance(question, ENTER ? 5000 : 0);

                    if (outcome === 'aborted') break;

                    if (outcome === 'modal') {
                        if (!await handleModalAndContinue(question, answer)) break;
                        continue;
                    }

                    if (outcome === 'timeout') {
                        // the round has not moved on yet
                        if (ENTER) {
                            // do not resubmit the same question blindly; break rather than throw so
                            // the loop falls through to its modal cleanup
                            console.error(`Question "${question}" did not advance after submitting "${answer}". Stopping.`);
                            break;
                        }
                        // semi-auto: the answer is typed and awaiting the user's Enter. Wait for the
                        // round to resolve before touching the next question, so stopping and
                        // restarting the loop never double-submits.
                        console.log(`Waiting for the answer to "${question}" to be submitted.`);
                        const resolved = await waitForAdvance(question, 0);
                        if (resolved === 'aborted') break;
                        if (resolved === 'modal') {
                            if (!await handleModalAndContinue(question, answer)) break;
                        }
                        continue;
                    }
                }
            }

            // takes care of answerLoop toggling logic
            async function toggleLoop() {
                if (TOGGLE) {
                    TOGGLE = false;
                    console.log("Stopping answerLoop.");
                } else {
                    console.log("Starting answerLoop.");
                    answerLoop().catch(e => {
                        console.error(e);
                        TOGGLE = false
                    });
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
