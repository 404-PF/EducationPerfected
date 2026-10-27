// v2.2.0

const puppeteer = require('puppeteer');

(async () => {
    const DIR = {
        email: process.env.EP_EMAIL,  // set EP_EMAIL environment variable to your Education Perfect email for auto login
        password: process.env.EP_PASSWORD,  // set EP_PASSWORD environment variable to your Education Perfect password for auto login

        login_url: 'https://app.educationperfect.com/app/login',

        // The login form is no longer served from app.educationperfect.com: that URL
        // boots the SPA, which bounces /app/login -> / -> authentication.educationperfect.com
        // -> iam.educationperfect.com (FusionAuth OAuth2). The form there keeps the same
        // #loginId/#password ids, so the selectors below only need the matching origin -
        // a same-document selector wait would never match while the page is still on the
        // first host.
        login_host: 'iam.educationperfect.com',

        // log-in page elements
        username_css: '#loginId',
        password_css: '#password',

        // The submit control, matched by its text rather than by position: the iam page
        // can carry SSO/Google/Microsoft/Clever buttons around the main form, and a
        // positional selector would risk clicking one of those. Resolved once per page
        // load and reused, so the button that is readiness-checked is the button clicked.
        login_button_css: 'button',

        // the login button's label (exact, case-insensitive)
        login_button_text: 'Log in',

        // A logged-in signal, not a page-specific element: the old
        // 'div.view-segment-dashboard' belonged to the pre-single-spa app and no longer
        // exists anywhere on the current dashboard (verified: /learning/dashboard renders
        // an mfeAppShell-Scaffold with none of that class). The MFE mount points under
        // <main> only appear once the app shell is actually running for a session, and
        // the login page has neither, so its appearance means login succeeded.
        home_css: 'main #single-spa-application\\:mfeGlobalNavigation\\:Tertiary',

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

            // Resolves the submit control once, by its label, from the <form> itself:
            // the iam page carries SSO/social buttons near the form, and a positional
            // selector ('form button', 'button[type=submit]') could resolve to one of
            // those. The same handle is then readiness-checked and clicked. Returns null
            // when there is no such button (the caller falls back to Enter).
            const findLoginButton = async () => {
                const handles = await page.$$(DIR.login_button_css);
                for (const handle of handles) {
                    const label = await handle.evaluate((el, want) => {
                        if (!el.closest('form')) return null;
                        const text = (el.innerText || el.value || '').trim().replace(/\s+/g, ' ');
                        return text.toLowerCase() === want.toLowerCase() ? text : null;
                    }, DIR.login_button_text).catch(() => null);
                    if (label !== null) {
                        for (const other of handles) if (other !== handle) await other.dispose().catch(() => { });
                        return handle;
                    }
                }
                for (const handle of handles) await handle.dispose().catch(() => { });
                return null;
            };

            // Opens the login page and resolves the submit button. Returns null instead of
            // throwing when the form never appears: the browser window must stay usable for
            // manual login, so a rejected promise here would take the window down with it.
            const reachLoginForm = async () => {
                console.log('Opening EP page...');
                await page.goto(DIR.login_url, { waitUntil: 'domcontentloaded' });
                console.log('Waiting for login page to load...');
                try {
                    // No retry loop on purpose: waitForSelector already keeps polling and
                    // follows the SPA's client-side redirects, so it covers the form appearing
                    // on a later host. A retry loop here would reload the page each time EP
                    // is merely slow, which is worse than one honest 60s wait.
                    await page.waitForSelector(DIR.username_css, { timeout: 60000 });
                } catch (e) {
                    console.error(`Login form (${DIR.username_css}) did not appear within 60s on ${new URL(page.url()).hostname || page.url()}: ${e.message}`);
                    console.error('EP may have changed its login flow. The browser window stays open: log in manually there.');
                    return null;
                }

                const loginHost = new URL(page.url()).hostname;
                console.log(`Login form ready on ${loginHost}.`);
                if (loginHost !== DIR.login_host) {
                    // Never type credentials into an origin we did not expect, even if it
                    // serves elements that look like the login form: a lookalike on another
                    // host would receive the password. Manual login stays available.
                    console.warn(`Expected the login form on ${DIR.login_host}, but EP served it from ${loginHost}. ` +
                        'Not auto-filling credentials; log in manually in the browser window.');
                    return null;
                }

                const loginButton = await findLoginButton();
                if (loginButton === null) {
                    console.warn(`No "${DIR.login_button_text}" button found inside the login form; auto-login will submit with Enter instead.`);
                }
                return { loginButton };
            };

            const loginForm = await reachLoginForm();

            // The form script leaves a loading state behind when it fails (e.g. scripts
            // blocked): the fields render but the button can stay disabled. Report it so a
            // failed auto-login is explained, and leave the window for manual login.
            if (loginForm !== null) {
                const fieldsEnabled = await page.evaluate((userCss, passCss) => {
                    const field = (css) => {
                        const el = document.querySelector(css);
                        return el ? !el.disabled && !el.readOnly : false;
                    };
                    return field(userCss) && field(passCss);
                }, DIR.username_css, DIR.password_css).catch(() => false);
                // checked on the same handle that will be clicked
                const submitEnabled = loginForm.loginButton
                    ? await loginForm.loginButton.evaluate(el => !el.disabled).catch(() => false)
                    : false;
                if (!fieldsEnabled || !submitEnabled) {
                    console.warn(`Login form looks unusable (fields enabled: ${fieldsEnabled}, submit enabled: ${submitEnabled}); the login page's scripts may not have finished or are blocked.`);
                }
            }

            if (DIR.email && DIR.password && loginForm !== null) {
                const { loginButton } = loginForm;
                // THIS FILLS IN YOUR DETAILS TO LOG IN AUTOMATICALLY
                // (username/password only: SSO, Google, Microsoft, Clever and the reCAPTCHA
                // on this page are left alone - users on those sign-in methods must log in
                // manually, and no challenge is ever solved or bypassed here.)
                console.log('Filling in login details...');
                await page.type(DIR.username_css, DIR.email);
                await page.type(DIR.password_css, DIR.password);
                // Submit through the form's own Log in button: the iam page POSTs to
                // /oauth2/authorize, and a synthetic Enter only submits when focus lands in a
                // field. The resolved handle is clicked, so an SSO/social button can never be
                // hit by accident; Enter is the fallback when no such button exists.
                console.log('Submitting login form...');
                await Promise.all([
                    page.waitForNavigation({ timeout: 30000 }).catch(() => {
                        // a failed login stays on the form (or shows an error/challenge there),
                        // so the timeout is not fatal: report it and let the user finish by hand.
                        console.warn('No navigation after submitting the login form; check the open browser window for an error or challenge.');
                    }),
                    loginButton ? loginButton.click() : page.keyboard.press('Enter'),
                ]);

                console.log('Waiting for home page to load...');
                // wait for the app shell, so a slow dashboard is reported honestly instead
                // of being called loaded the moment the login form disappears. Other routes
                // (a task opened straight from an assignment link) also carry the shell.
                const homeSeen = await page.waitForSelector(DIR.home_css, { timeout: 30000 }).then(() => true).catch(() => false);
                console.log(homeSeen
                    ? `EP Home page loaded (${new URL(page.url()).pathname}); Logged in.`
                    : `Login did not reach the app shell (${DIR.home_css}) within 30s (now on ${new URL(page.url()).pathname}); finish signing in manually in the browser window.`);
            } else if (DIR.email && DIR.password) {
                console.log('Auto-login skipped (see the warning above); finish signing in manually in the browser window.');
            } else {
                console.log('EP_EMAIL and EP_PASSWORD are not set; skipping auto-login. Log in manually in the opened browser window.');
            }
            // Either way, continue once a session is actually running: the manual branch waits
            // without a timeout here, exactly as before, and the auto branch has already been
            // given its 30s check above.
            await page.waitForSelector(DIR.home_css, { timeout: 0 });


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

            // question -> ordered candidate answers (most-preferred first), seeded from
            // the word lists and enriched by what wrong-answer modals prove.
            // Null prototypes: question text is external page content, and inherited
            // keys ("constructor" is a real Spanish vocab item) must never resolve to
            // Object.prototype members and masquerade as arrays or Sets.
            let candidatesDict = Object.create(null);
            // question -> Set of answers EP has graded wrong this session. Without this,
            // a rejected answer was "learned" from its own wrong-answer modal and then
            // resubmitted forever: "io prendo" / "I take" looped incorrect indefinitely
            // because EP's grading wants the whole "I take, I get", not a comma-cut of it.
            let rejectedDict = Object.create(null);
            // question -> how many rounds in a row the loop has had nothing usable left
            // for it (all candidates rejected, or the correction modal unreadable).
            // Feeds the give-up guards in answerQuestions/correctAnswer.
            let futileDict = Object.create(null);
            // set when the futility guards trip; answerQuestions breaks on it at the top
            // of its next pass (correctAnswer cannot break the caller's loop itself)
            let futileStop = false;
            // the previous successful refresh's list content, so a refresh of a NEW
            // task's lists can reset session knowledge instead of carrying stale
            // rejections/futility across tasks
            let lastRefreshSignature = null;

            // Basic answer-parsing
            function cleanString(string) {
                return String(string)
                    .replace(/\([^)]*\)/g, "").trim()
                    .split(";")[0].trim()
                    .split(",")[0].trim()
                    .split("|")[0].trim();
            }

            // Builds the ordered candidate answers for one raw word-list/modal answer.
            //
            // EP's answer data is a list of phrases, and the two screens join that list
            // with different separators: the task-starter list joins alternatives with
            // "; " (e.g. "she reads; she is reading"), while the wrong-answer modal joins
            // them with ", " — or with " | " when a phrase itself contains a comma
            // ("she takes, she gets | she is taking, she is getting"). Field evidence:
            // the grader rejects any submission whose phrases/order don't match its
            // canonical display — single pieces ("I take") and list-display joins
            // ("I sell; I am selling") were both graded wrong while the modal's exact
            // string is the item's canonical answer.
            //
            // So the candidates, in order: the ";"/"|" groups re-joined with ", " (only
            // when no group contains a comma — otherwise the modal would have shown a
            // pipe and that join's shape is implausible), then every whole group (commas
            // included — the canonical shape under per-group grading), then the whole
            // display string as written (only when it holds several groups — the one
            // candidate that can match a grader that wants the entire corrected answer
            // in one string; placed after the groups so the likelier per-group grading
            // is never spent a guaranteed-wrong first round), then the bare pieces
            // (covers grading that still accepts single alternatives). The list-page's
            // raw "; "-joined string alone is never a candidate: EP graded it wrong in
            // the field on every first attempt.
            function answerCandidates(rawAnswer) {
                const text = String(rawAnswer)
                    .replace(/\([^)]*\)/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
                if (text === '') return [];

                const candidates = [];
                const seen = new Set();
                const push = value => {
                    const trimmed = value.trim();
                    if (trimmed !== '' && !seen.has(trimmed)) {
                        seen.add(trimmed);
                        candidates.push(trimmed);
                    }
                };

                // ";" and "|" both separate whole alternative answers; "," inside a
                // group is part of that answer's text
                const groups = text.split(/[;|]/).map(group => group.trim()).filter(group => group !== '');
                if (groups.length > 1 && groups.every(group => !/[;,]/.test(group))) {
                    push(groups.join(", "));  // EP joins alternative phrases with ", "
                }
                // whole alternative answers first (all of them, then all pieces — the
                // pieces of group one must not be tried before group two's whole answer,
                // which strict grading is far likelier to accept)
                for (const group of groups) push(group);
                // the whole display string as written: the modal's "|" may separate
                // alternatives (per-group grading) or just join the one required
                // answer's parts; keeping this AFTER the group-fulls costs nothing when
                // per-group grading is right, and is the only candidate that can ever
                // match a whole-display grader
                if (groups.length > 1) push(text);
                // bare pieces last: each costs a wrong round under strict grading
                for (const group of groups) {
                    for (const piece of group.split(",")) push(piece);
                }
                return candidates;
            }

            // Merges candidate lists. Modal-proven candidates pass incoming-first
            // (freshest proof leads); word-list seeding passes existing-first so a
            // re-refresh can never demote candidates a wrong-answer modal proved
            // canonical back behind raw list display forms.
            function mergeCandidates(existing, incoming, incomingFirst = true) {
                const merged = [];
                const seen = new Set();
                const ordered = incomingFirst
                    ? [...(incoming || []), ...(existing || [])]
                    : [...(existing || []), ...(incoming || [])];
                for (const candidate of ordered) {
                    if (typeof candidate === 'string' && candidate.trim() !== '' && !seen.has(candidate)) {
                        seen.add(candidate);
                        merged.push(candidate);
                    }
                }
                return merged;
            }

            // The single key a question's futility meter lives under. All questions are
            // normalized to their cleaned form first, so every separator rendering of the
            // same item ("a, b" / "a; b" / "a;b") shares one count instead of each variant
            // getting its own — otherwise alternating renderings would bypass the bound.
            function futileKey(question) {
                return cleanString(question);
            }

            // Registers the candidate answers for `question` under every key form the
            // lookups use: the text as displayed, its comma-to-semicolon variant (EP
            // renders entry separators differently between passes), and the cleaned
            // variant. A lookup must find the same knowledge under whichever form the
            // question element shows next.
            // Returns true when the learn added candidates that were not stored yet —
            // i.e. EP's modal taught this question something new. A merge can also merely
            // reorder what is already stored (the modal displays alternatives in its own
            // order); that is not new knowledge, and restarting the futility meter for it
            // would let an item whose every candidate is rejected loop on modal reorders
            // without ever reaching the give-up bound.
            function learnEntry(question, rawAnswer, incomingFirst = true) {
                const incoming = answerCandidates(rawAnswer);
                if (incoming.length === 0) return false;
                const q = String(question);
                let changed = false;
                for (const key of new Set([q.trim(), q.trim().replace(/,/g, ";"), cleanString(question)])) {
                    if (key === '') continue;
                    const before = candidatesDict[key] || [];
                    const after = mergeCandidates(before, incoming, incomingFirst);
                    if (after.length > before.length) changed = true;
                    candidatesDict[key] = after;
                }
                return changed;
            }

            // Both directions of a word-list pair answer each other.
            function learnPair(first, second) {
                learnEntry(first, second, false);
                learnEntry(second, first, false);
            }

            // Records that EP graded `answer` wrong for `question`, under the same key
            // variants the lookups use, so a later pass can skip it and escalate.
            function recordRejection(question, answer) {
                if (typeof answer !== 'string' || answer.trim() === '') return;
                const q = String(question);
                for (const key of new Set([q.trim(), q.trim().replace(/,/g, ";"), cleanString(question)])) {
                    if (key === '') continue;
                    let rejected = rejectedDict[key];
                    if (!rejected) {
                        rejected = new Set();
                        rejectedDict[key] = rejected;
                    }
                    rejected.add(answer);
                }
            }

            // A detached frame / destroyed execution context means the page navigated
            // away (task finished, EP moved to another screen, browser closed) — not a
            // bug in the loop. Those errors must end a run quietly instead of printing
            // a stack trace, and must never be retried against the dead page.
            function isPageGoneError(e) {
                const message = String((e && e.message) || e);
                return /detached Frame|Execution context was destroyed|Cannot find context|Target closed|Session closed|Browser has been closed|Navigating was not successful/i.test(message);
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

            // Refreshes the word lists on the main task page to enhance our vocabulary
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

                // A refresh that brings DIFFERENT lists means a new task: the previous
                // task's rejections and futility counts would otherwise bleed into it and
                // exhaust reused questions without ever trying their new answers. Same
                // content (a re-scrape of the same task) keeps everything learned so far.
                const signature = JSON.stringify([base, target]);
                if (signature !== lastRefreshSignature) {
                    candidatesDict = Object.create(null);
                    rejectedDict = Object.create(null);
                    futileDict = Object.create(null);
                    futileStop = false;
                    lastRefreshSignature = signature;
                }

                const count = base.length;
                for (let i = 0; i < count; i++) {
                    learnPair(base[i], target[i]);
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
            // `randomRound` means this pass already counted the round in the all-rejected
            // branch (the submission was a random string), so an unreadable modal here must
            // not count the same round a second time.
            async function correctAnswer(question, answer, randomRound = false) {
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
                    // The wrong-answer modal on screen DID prove the submission was rejected,
                    // but it yielded no readable correction — and without one, findAnswer
                    // would return the same candidate again and again (an unknown question
                    // would get a fresh random string each time). Count these toward the
                    // same futility bound so an unreadable modal cannot spin the loop
                    // forever. No rejection is recorded: keying it to `question` is
                    // unproven (round skew), and the count alone bounds the spin. A random
                    // submission round was already counted above, so this only counts
                    // rounds whose submission came from a real candidate.
                    if (!randomRound) {
                        const key = futileKey(question);
                        futileDict[key] = (futileDict[key] || 0) + 1;
                        if (futileDict[key] >= 4) {
                            futileStop = true;
                            const message = `EP's correction modal could not be read for "${question}" ${futileDict[key]} rounds in a row; stopping the loop.`;
                            console.error(message);
                            await alert(message);
                        }
                    }
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
                // ITS question (modalQuestion), so modalQuestion -> modalAnswer is the one
                // verifiably true mapping. Writing the script-detected `question` here used
                // to poison the dictionary whenever the round advanced while the answer was
                // being typed: the detected question then belonged to an item different from
                // the one graded, and every later occurrence of those words was mis-answered
                // while "learning" wrote the wrong pairing back again.
                if (modalQuestion !== question) {
                    console.warn(`Round skew: read question "${question}" but EP graded "${modalQuestion}". Learning only the graded pairing.`);
                }
                // EP just graded `answer` wrong for modalQuestion: that exact pairing must
                // never be resubmitted for this item. Recording it is what breaks the
                // infinite loop — the old code instead stored the comma-CUT answer (which
                // is the very string EP rejected) and resubmitted it forever.
                recordRejection(modalQuestion, answer);
                // The full answer EP displayed is canonical: learn it (and its built-in
                // alternatives) instead of only the cut, so the next pass escalates to the
                // form EP's grader actually wants.
                const learned = learnEntry(modalQuestion, modalAnswer);
                // Only a learn that added NEW candidates restarts this item's futility
                // meter: fresh escalation material is real progress. A readable modal
                // that repeats what is already stored (and already rejected) must leave
                // the count alone, or the all-rejected bound below could never be reached.
                if (learned) {
                    delete futileDict[futileKey(modalQuestion)];
                }

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

            // very advanced logic (ofc) used to find matching answer.
            // Walks the question's key variants and returns the first candidate that EP
            // has not already graded wrong. Returns null when candidates exist but every
            // one of them was rejected — the caller escalates/bounds that case — and a
            // random string only when the question is entirely unknown, which feeds the
            // teach-from-modal loop as before.
            function findAnswer(question) {
                const probes = [question, question.replace(/,/g, ";"), cleanString(question)];
                let hadCandidates = false;
                const visited = new Set();
                for (let probe of probes) {
                    const key = String(probe).trim();
                    if (key === '' || visited.has(key)) continue;
                    visited.add(key);
                    const candidates = candidatesDict[key];
                    if (!candidates || candidates.length === 0) continue;
                    hadCandidates = true;
                    const rejected = rejectedDict[key] || new Set();
                    for (const candidate of candidates) {
                        if (!rejected.has(candidate)) return candidate;
                    }
                }
                if (hadCandidates) return null;
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
            async function handleModal(question, answer, randomRound = false) {
                // allow the modal a moment to render before deciding what it is
                await page.waitForSelector(DIR.modal_css, { timeout: 2000 }).catch(() => { });

                // incorrect answer and modal pops up; initiate answer-correction procedure
                if (await page.$(DIR.modal_question_css) !== null) {
                    await correctAnswer(question, answer, randomRound);
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
            async function handleModalAndContinue(question, answer, randomRound = false) {
                const keepGoing = await handleModal(question, answer, randomRound);
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
                futileStop = false;  // a manual restart after a futility stop gets a fresh bounded run
                console.log("answerLoop entered.");

                try {
                    // If the previous run's modal cleanup is still in flight, wait for it
                    // before answering: the old deleteModals() must never remove a modal
                    // that belongs to this fresh run (e.g. its first wrong-answer modal).
                    // A stop pressed during this hand-over simply leaves TOGGLE false, and
                    // the loop below exits without touching the page.
                    if (CLEANUP !== null) await CLEANUP;
                    await answerQuestions();
                } catch (e) {
                    // Navigation mid-run (task completed and EP left the task screen, or
                    // the user closed the task) detaches the frame; every page call then
                    // throws "Attempted to use detached Frame". That is the task ending,
                    // not a bug: end the run quietly. Anything else stays loud.
                    if (isPageGoneError(e)) {
                        console.log('The task page navigated away; ending the run.');
                    } else {
                        throw e;
                    }
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
                    // A navigation during cleanup makes deleteModals' $$evals hit a detached
                    // frame; that used to print a scary stack trace for a harmless skip.
                    CLEANUP = deleteModals().catch(e => {
                        if (isPageGoneError(e)) console.log('answerLoop cleanup skipped: the page navigated away.');
                        else console.error('answerLoop cleanup failed:', e);
                    });
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
                    if (futileStop) {
                        // correctAnswer tripped a futility guard mid-pass; it cannot break
                        // this loop itself, so honor it here
                        break;
                    }
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
                    // true when this pass had no usable candidate and only a random string
                    // is being submitted. correctAnswer must not count that round again if
                    // the correction modal is also unreadable: the meter counts submission
                    // ROUNDS, and counting both stages would trip the bound at half of it.
                    let randomRound = false;
                    if (answer === null) {
                        // Every candidate this session knows for the question was already
                        // graded wrong. Feed EP a random string so its wrong-answer modal
                        // reveals the canonical answer (which then joins the candidates),
                        // but bound the cycle: an item that stays unanswerable must not
                        // loop incorrect answers forever.
                        const futile = futileKey(question);
                        futileDict[futile] = (futileDict[futile] || 0) + 1;
                        const attempt = futileDict[futile];
                        if (attempt >= 4) {
                            const message = `EP rejected every known answer for "${question}" ${attempt} rounds in a row; stopping the loop. Check that item's entry in the word list.`;
                            console.error(message);
                            await alert(message);
                            break;
                        }
                        randomRound = true;
                        console.log(`Every known answer for "${question}" was rejected; submitting a random string to make EP reveal its answer (round ${attempt}/4).`);
                        answer = generateRandomString(8, 10);
                    }
                    // No reset in the non-null branch: an unknown question falls through
                    // it with a fresh random string every pass, and resetting there would
                    // wipe the unreadable-modal count before it could ever reach the
                    // bound. The meter only restarts on real progress — acceptance, a
                    // learn that adds new candidates, a changed-list refresh, or a run
                    // restart.
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

                    if (outcome === 'advanced') {
                        // the round was graded and moved on: acceptance. Whatever futility
                        // streak this question had is over.
                        futileDict[futileKey(question)] = 0;
                        futileStop = false;
                    }

                    if (outcome === 'modal') {
                        if (!await handleModalAndContinue(question, answer, randomRound)) break;
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
