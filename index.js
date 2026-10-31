// V2026 (package version 2026.0.0)

const puppeteer = require('puppeteer');
const { detectQuestion } = require('./lib/detect-question');
const { playChoiceRound } = require('./lib/choice-handler');
const { createRunControls } = require('./lib/run-controls');
const { diagnostic } = require('./lib/diagnostics');
const { createTestCdpDiagnostic } = require('./lib/test-cdp-diagnostic');

// ===== Credentials ===== //
// Credentials are never stored in this (or any other tracked) file. They are read at
// runtime, the first source that yields a value for BOTH fields wins:
//   1. the EP_EMAIL / EP_PASSWORD environment variables
//   2. the native OS credential store, then optional legacy `keytar` entries
//   3. an interactive prompt on the terminal, when run attached to a TTY. The browser
//      window is already sitting on EP's login page then, so the prompt is raced
//      against the logged-in signal on the page: a manual login that completes first
//      (the password form, or an SSO/social flow this script can never touch)
//      cancels the prompt instead of outliving it.
// Nothing is ever written to disk. Leave the sources unset to skip auto-login and
// sign in manually in the browser window.
const CREDENTIAL_SERVICE = 'EducationPerfected';

/**
 * Strips surrounding quotes and normalizes whitespace for credential-like values.
 * Returns null for empty/placeholder values.
 * @param {string} value
 * @returns {string|null}
 */
function cleanCredential(value) {
    if (typeof value !== 'string') return null;
    // Remove surrounding single/double quotes, then trim whitespace.
    const cleaned = value.trim().replace(/^(['"])(.*)\1$/s, '$2').trim();
    return cleaned === '' ? null : cleaned;
}

/**
 * Normalizes an email address: trims whitespace and strips surrounding quotes.
 * Unlike passwords, emails never have meaningful leading/trailing spaces.
 * @param {string} value
 * @returns {string|null}
 */
function cleanEmail(value) {
    return cleanCredential(value);
}

/**
 * Normalizes a password: strips surrounding quotes only, preserving all
 * leading/trailing/internal whitespace which can be significant.
 * @param {string} value
 * @returns {string|null}
 */
function cleanPassword(value) {
    if (typeof value !== 'string') return null;
    const unquoted = value.replace(/^(['"])(.*)\1$/s, '$2');
    return unquoted === '' ? null : unquoted;
}

/**
 * Attempts to load the optional `keytar` module for OS keychain access.
 * Returns null if the module is not installed or fails to load, allowing
 * the program to fall back to environment variables or TTY prompt.
 * @returns {Object|null} The keytar module or null if unavailable
 */
function loadKeytar() {
    try {
        return require('keytar');
    } catch (e) {
        if (e.code !== 'MODULE_NOT_FOUND') {
            console.warn(`Credential store unavailable (${e.message}); skipping the OS keychain.`);
        }
        return null;
    }
}

/**
 * Reads a credential field from the OS keychain using keytar.
 * @param {string} field - The field name ('EP_EMAIL' or 'EP_PASSWORD')
 * @returns {Promise<string|null>} The credential value or null if unavailable
 */
async function readKeychainCredential(field) {
    const keytar = loadKeytar();
    if (!keytar) return null;
    try {
        const raw = await keytar.getPassword(CREDENTIAL_SERVICE, field);
        return field === 'EP_EMAIL' ? cleanEmail(raw) : cleanPassword(raw);
    } catch (e) {
        console.warn(`Could not read the ${field} from the OS keychain (${e.message}); skipping it.`);
        return null;
    }
}

// Secret prompt: no echo, and no copy left in the terminal. Resolves null when stdin
// is not a terminal (piped input is not trusted with a password) or the user submits
// nothing, so the manual-login path still works everywhere.
//
// An open prompt can also be closed from OUTSIDE (see racePromptAgainstLogin): when a
// manual login completes in the browser while the prompt is waiting on the terminal,
// it is closed the way a real keystroke would close it - finish(): restore raw mode,
// drop the data listener, write the terminating newline - but WITHOUT process.exit,
// so the program keeps running after the cancelled prompt. finish() is guarded to run
// exactly once, which also covers a cancel landing in the same tick as a submit: no
// second newline, no double restore. The early exits (no TTY, no raw mode) resolve
// before anything was armed and mark themselves finished, so a later cancel() on them
// is a no-op rather than an extra newline.
/**
 * Prompts for a secret value with hidden input.
 * @param {string} label
 * @param {(value: string) => string|null} cleaner - Function to clean the submitted value
 * @returns {{promise: Promise<string|null>, cancel: () => void}} promise resolves to the
 *   cleaned answer, or null when nothing valid was submitted, stdin is not a terminal,
 *   or the prompt was cancelled; cancel() closes an open prompt through the same
 *   finish() path Ctrl+C takes, minus process.exit
 */
function promptSecret(label, cleaner) {
    let finish = null;
    const promise = new Promise(resolve => {
        const stdin = process.stdin;
        let finished = false;   // finish() has run: no more cleanup or newline is due
        let armed = false;      // stdin was switched to raw with onData attached
        let wasRaw = false;
        finish = result => {
            if (finished) return;
            finished = true;
            if (armed) {
                stdin.removeListener('data', onData);
                stdin.setRawMode(wasRaw || false);
                stdin.pause();
                process.stderr.write('\n');
            }
            resolve(result);
        };
        if (!stdin.isTTY) return finish(null);
        // Raw mode is what suppresses echo; without it the password would be printed,
        // so a terminal that cannot do raw mode gets no prompt at all.
        if (typeof stdin.setRawMode !== 'function') {
            process.stderr.write('\n(this terminal cannot hide input; log in manually)\n');
            return finish(null);
        }
        // Chunk is a Buffer; for...of yields numeric byte values. Collect bytes
        // and decode as UTF-8 on submit so non-ASCII characters are preserved.
        // On backspace/delete, remove the complete final UTF-8 character.
        // Ignore escape sequences (starting with 0x1B) so arrow keys, bracketed paste,
        // and other control sequences are not added to the secret.
        const bytes = [];
        // Escape-sequence state machine. ESC starts a sequence, then:
        //   'kind' none   -> the next byte is the introducer ('[' CSI, ']' OSC,
        //                    anything else for a two-byte sequence such as Alt+key)
        //   'kind' csi    -> body until a final byte 0x40-0x7E. Covers arrow/function
        //                    keys and bracketed paste (ESC [200~ ... ESC [201~).
        //   'kind' osc    -> body until BEL or ST (ESC \). Covers colour/title replies.
        // None of these bytes may reach the secret: `[` is itself in the final-byte
        // range, so without the explicit introducer step the parser would end on it and
        // feed the rest back as input ("A" from an arrow key, "200~" from a paste).
        let escapeKind = null;  // null | 'introducer' | 'csi' | 'osc' | 'oscEsc'
        const onData = chunk => {
            for (const byte of chunk) {
                if (escapeKind !== null) {
                    if (escapeKind === 'introducer') {
                        if (byte === 0x5B /* [ */) escapeKind = 'csi';
                        else if (byte === 0x5D /* ] */) escapeKind = 'osc';
                        else escapeKind = null;  // two-byte sequence (Alt+key) is complete
                        continue;
                    }
                    if (escapeKind === 'osc') {
                        if (byte === 0x07) escapeKind = null;          // BEL terminates OSC
                        else if (byte === 0x1B) escapeKind = 'oscEsc';  // maybe ST (ESC \)
                        continue;
                    }
                    if (escapeKind === 'oscEsc') {
                        escapeKind = null;  // ST if '\', otherwise the sequence just ended
                        continue;
                    }
                    // csi: ends on a final byte; parameters are 0x30-0x3F, intermediates 0x20-0x2F
                    if (byte >= 0x40 && byte <= 0x7E) escapeKind = null;
                    continue;
                }
                if (byte === 0x1B) {  // ESC: start of escape sequence
                    escapeKind = 'introducer';
                    continue;
                }
                if (byte === 13 || byte === 10) return finish(cleaner(Buffer.from(bytes).toString('utf8')));
                if (byte === 3) {  // Ctrl+C: leave cleanly, no stack trace
                    finish(null);
                    if (process.listenerCount('SIGINT')) process.emit('SIGINT');
                    else process.exit(130);
                }
                if (byte === 8 || byte === 127) {
                    // drop one whole UTF-8 character (continuation bytes, then the lead byte)
                    while (bytes.length && (bytes[bytes.length - 1] & 0xC0) === 0x80) bytes.pop();
                    bytes.pop();
                } else if (byte >= 32) bytes.push(byte);
            }
        };
        wasRaw = stdin.isRaw;
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onData);
        armed = true;   // listener attached: finish() now owns the full undo
        process.stderr.write(label);
    });
    // Cancelling from outside takes finish()'s cleanup path but never process.exit:
    // the run continues on the normal post-login wait (see racePromptAgainstLogin).
    return { promise, cancel: () => finish(null) };
}

// The marker racePromptAgainstLogin returns when the run's login watcher saw a
// completed session before the prompt was answered - the exact moment the user
// finished signing in by hand. It is threaded through promptCredentials and
// resolveCredentials so the program block can skip auto-login and the "no
// credentials" message for it. A Symbol, so it can never collide with a value the
// user actually submitted at the prompt.
const PROMPT_CANCELLED_BY_LOGIN = Symbol('a completed browser login cancelled the terminal prompt');

/**
 * Races an open prompt against the run's login watcher (see watchForSession in the
 * program block). The browser window is already sitting on EP's login page while the
 * prompt waits on the terminal, and a manual sign-in that completes first - the
 * password form, or an SSO/Google/Microsoft/Clever flow the auto-login can never
 * touch - cancels the prompt instead of outliving it: the prompt is closed through
 * promptSecret's cancel() (finish()'s cleanup, minus process.exit) and
 * PROMPT_CANCELLED_BY_LOGIN is returned. When the prompt is answered first, the
 * cleaned answer is returned untouched.
 * The watcher is started BEFORE the prompt, by promptCredentials, and the
 * already-running promise is what gets raced: starting it inside the race would leave
 * the race observing a wait that re-arms after every navigation for as long as the
 * run goes on, so the event loop would tick with closed stdin on the very page the
 * login belongs to until the prompt was answered. Awaiting it first instead would
 * hold the prompt back until a login that might never come: the prompt must be on
 * screen from the moment it is created.
 * @param {{promise: Promise<string|null>, cancel: () => void}} prompt - An open promptSecret
 * @param {Promise<boolean>} sessionWatch - The run's login watcher, already running
 * @returns {Promise<string|null|symbol>} The submitted answer, or
 *   PROMPT_CANCELLED_BY_LOGIN when the watcher saw the session first.
 */
async function racePromptAgainstLogin(prompt, sessionWatch) {
    const winner = await Promise.race([
        // A submitted answer settles the race with its value. A prompt promise that
        // rejects is not expected (every finish path resolves), so it degrades to an
        // empty answer rather than rejecting the run's credential resolution.
        prompt.promise.then(
            answer => ({ answer: answer }),
            () => ({ answer: null }),
        ),
        // Only a logged-in session wins the race. A dead one - the wait killed by a
        // navigation (EP's login bounces hosts before the session arrives) or left
        // false with the page gone - must neither win nor reject the race: it maps
        // to a never-settling promise, which is the equivalent of no watcher, and
        // the prompt stays open as before.
        sessionWatch.then(
            seen => (seen ? { login: true } : new Promise(() => { })),
            () => new Promise(() => { }),
        ),
    ]);
    if (!winner.login) return winner.answer;
    prompt.cancel();
    return PROMPT_CANCELLED_BY_LOGIN;
}

// Asks only when a terminal is attached AND the run would otherwise skip auto-login;
// an empty answer at either prompt means "log in manually". The browser window is
// already sitting on EP's login page while the prompts wait on the terminal, so each
// prompt is raced against the login watcher (watchForSession): a manual sign-in that
// completes first cancels the prompt invisibly.
/**
 * Prompts for email and password credentials interactively.
 * @param {() => Promise<boolean>} [watchForSession] - Starts the run's login-success
 *   watcher; absent (or not a function) when no race is wanted. Created once, before
 *   the first prompt, and raced against both.
 * @returns {Promise<{email: string, password: string}|PROMPT_CANCELLED_BY_LOGIN|null>}
 */
async function promptCredentials(watchForSession, { setup = false } = {}) {
    if (!process.stdin.isTTY) {
        console.log(setup ? 'Setup requires a terminal with hidden input; no login saved.' : 'Not running in a terminal, so no credential prompt; log in manually in the opened browser window.');
        return null;
    }
    // The watcher is started, not tested: watchForSession() hands back a Promise, which
    // is always truthy, so a `watcher ? race : plain` split would never take the plain
    // branch anyway. Null (no watcher was given) means no race. One is started just
    // before each prompt - so the prompt opens at once, without waiting on a login that
    // might never come - and the running promise is handed to the race.
    const startWatch = () => typeof watchForSession === 'function' ? watchForSession() : null;
    const race = (prompt) => {
        const sessionWatch = startWatch();
        return sessionWatch === null
            ? prompt.promise
            : racePromptAgainstLogin(prompt, sessionWatch);
    };

    const emailPrompt = promptSecret(setup ? 'EP email (leave empty to cancel setup): ' : 'EP email (leave empty to log in manually): ', cleanEmail);
    const email = await race(emailPrompt);
    if (email === PROMPT_CANCELLED_BY_LOGIN) return PROMPT_CANCELLED_BY_LOGIN;
    if (email === null) return null;
    const passwordPrompt = promptSecret('EP password (input hidden): ', cleanPassword);
    const password = await race(passwordPrompt);
    if (password === PROMPT_CANCELLED_BY_LOGIN) return PROMPT_CANCELLED_BY_LOGIN;
    if (password === null) {
        console.log(setup ? 'No password entered; setup cancelled.' : 'No password entered; log in manually in the opened browser window.');
        return null;
    }
    return { email, password };
}

/**
 * Resolves credentials at runtime from the first available source:
 * 1. EP_EMAIL / EP_PASSWORD environment variables (both must be set)
 * 2. Versioned native OS credential record, then optional legacy keytar fields
 * 3. Interactive TTY prompt (hidden input), raced against watchForSession so a manual
 *    browser login that completes while it is open cancels it
 * Returns null if no credentials are available, allowing manual login, or an object
 * with sessionDetected true when the login watcher saw a completed login first.
 * @param {() => Promise<boolean>} [watchForSession]
 * @returns {Promise<{email: string, password: string, source: string}|{sessionDetected: true}|null>}
 */
async function resolveCredentials(watchForSession) {
    // Test boot must never consult env credentials, the OS keychain, or a
    // terminal prompt. The local harness performs its own inert mock login.
    if (process.env.EP_TEST_BOOT === '1') return null;
    const email = cleanEmail(process.env.EP_EMAIL);
    const password = cleanPassword(process.env.EP_PASSWORD);
    if (email && password) return { email, password, source: 'EP_EMAIL/EP_PASSWORD' };
    if (process.env.EP_EMAIL || process.env.EP_PASSWORD) {
        // Half a configuration is almost always a typo; say so instead of guessing
        // which half the user meant and prompting for the other.
        console.warn('Only one of EP_EMAIL / EP_PASSWORD is set (or one of them is empty); not enough for auto-login.');
    }

    // Read the versioned pair once, never a mixed email/password snapshot.
    try {
        const saved = await require('./lib/credential-store').createCredentialStore().read();
        if (saved) return { ...saved, source: 'the OS credential store' };
    } catch (error) {
        console.warn('Saved login unavailable (' + (error.code || 'store failure') + '). Unlock the OS credential store or run CLI --setup; manual login is still available.');
    }

    const keychainEmail = await readKeychainCredential('EP_EMAIL');
    const keychainPassword = await readKeychainCredential('EP_PASSWORD');
    if (keychainEmail && keychainPassword) {
        return { email: keychainEmail, password: keychainPassword, source: 'the OS keychain' };
    }

    const prompted = await promptCredentials(watchForSession);
    if (prompted === PROMPT_CANCELLED_BY_LOGIN) {
        // The session is already running; the program block reports it as such and
        // falls straight through to the normal post-login wait.
        return { sessionDetected: true };
    }
    if (prompted) return { ...prompted, source: 'the terminal prompt' };
    return null;
}

// ===== Program ===== //

async function launchProgram({ legacySignals = false } = {}) {
    // EP_TEST_BOOT=1 is the test harness boot (scripts/handler-test.js). The
    // EP_LOGIN_URL / EP_LOGIN_HOST overrides are honored ONLY under it: on a
    // real run they are ignored, so a stray environment can never point the
    // program at a lookalike host or disable the host protection below.
    const TEST_BOOT = process.env.EP_TEST_BOOT === '1';
    const DIR = {
        // Credentials are resolved at runtime (see resolveCredentials) and never kept
        // anywhere a commit could pick them up. Email/password are added below.

        login_url: (TEST_BOOT && process.env.EP_LOGIN_URL) || 'https://app.educationperfect.com/app/login',

        // The login form is no longer served from app.educationperfect.com: that URL
        // boots the SPA, which bounces /app/login -> / -> authentication.educationperfect.com
        // -> iam.educationperfect.com (FusionAuth OAuth2). The form there keeps the same
        // #loginId/#password ids, so the selectors below only need the matching origin -
        // a same-document selector wait would never match while the page is still on the
        // first host.
        login_host: (TEST_BOOT && process.env.EP_LOGIN_HOST) || 'iam.educationperfect.com',

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
        // Audited against the live app's current bundles (mfe-student-app, 2026-10-27):
        // every selector here still matches the markup and the app's own code. The <td>
        // names on the modal fields are load-bearing: the wrong-answer table is the only
        // markup that puts these ids on a <td> (other dialogs reuse them on divs/spans).
        // The modal's fields start as "&nbsp;" placeholders and are filled by the
        // answer-feedback formatter, which is what the readiness check below waits for.
        modal_question_css: 'td#question-field',
        modal_correct_answer_css: 'td#correct-answer-field',
        modal_user_answered_css: 'td#users-answer-field',
        modal_css: 'div[uib-modal-window=modal-window]',
        modal_backdrop_css: 'div[uib-modal-backdrop=modal-backdrop]',

        // task page: <span id="question-text"> inside #question-block (audio tasks use a
        // span with the same id under .voice-speaker; they are unsupported anyway)
        question_css: '#question-text',
        answer_box_css: 'input#answer-text',

        // task page: Smart Lesson/Assessment and audio-task shapes. Audited against
        // the live app (Italian Smart Lesson + Listening/Dictation, 2026-10-30);
        // lib/detect-question.js carries the full markup notes, including why the
        // per-option ids are unusable and where EP ships the answers client-side.

        exit_button_css: 'button.exit-button',
        exit_continue_button_css: 'button.continue-button',

        continue_button_css: 'button#continue-button',

        // non-blocking feedback toast (injected by this script, not part of EP)
        toast_id: '__ep_toast',
    }

    // Startup owns signal cleanup until controls are ready. Keep stdin exclusive
    // to credential prompts; do not create the CLI reader during sign-in.
    let startupBrowser;
    let startupSignal = null;
    const exitCodeFor = signal => signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143;
    let startupShutdown = null;
    let legacyReady = false;
    const closeSignalBrowser = async () => {
        let timer;
        try {
            await Promise.race([
                startupBrowser.close(),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser shutdown timed out')), 3000); }),
            ]);
        } finally { clearTimeout(timer); }
    };
    let signalClose = closeSignalBrowser;
    const removeStartupSignals = () => {
        process.removeListener('SIGINT', onStartupInt);
        process.removeListener('SIGTERM', onStartupTerm);
        process.removeListener('SIGHUP', onStartupHup);
    };
    const shutdownStartup = () => {
        if (!startupBrowser || startupShutdown) return startupShutdown;
        startupShutdown = (async () => {
            try {
                // Ready legacy controls must drain before the browser-close timeout
                // starts. Startup still has only a browser to close.
                await signalClose();
            } catch {
                startupBrowser.process()?.kill();
                startupBrowser.disconnect();
            } finally {
                removeStartupSignals();
                process.exit(exitCodeFor(startupSignal));
            }
        })();
        return startupShutdown;
    };
    const onStartupSignal = signal => {
        if (startupSignal && legacyReady) {
            console.error('Second interrupt received; forcing browser shutdown. Pending work may not finish cleanup.');
            startupBrowser.process()?.kill();
            startupBrowser.disconnect();
            removeStartupSignals();
            process.exit(exitCodeFor(startupSignal));
        }
        if (legacyReady) console.log('Stopping and waiting for active work to finish. Interrupt again to force shutdown.');
        if (!startupSignal && !startupBrowser) console.log('Cancellation requested; waiting for browser launch before cleanup.');
        startupSignal ||= signal;
        // A raw credential prompt has no echo and must relinquish the terminal.
        if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
        shutdownStartup();
    };
    const onStartupInt = () => onStartupSignal('SIGINT');
    const onStartupTerm = () => onStartupSignal('SIGTERM');
    const onStartupHup = () => onStartupSignal('SIGHUP');
    process.on('SIGINT', onStartupInt);
    process.on('SIGTERM', onStartupTerm);
    process.on('SIGHUP', onStartupHup);
    return puppeteer.launch({
        // test boot: no visible window, and the endpoint is printed so the
        // test can attach
        headless: TEST_BOOT ? 'shell' : false,
        dumpio: TEST_BOOT,
        logger: TEST_BOOT ? createTestCdpDiagnostic(entry => console.error('EP_TEST_CDP_OWNER='+JSON.stringify(entry))) : undefined,
        defaultViewport: null,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
    })
        .then(async browser => {
            startupBrowser = browser;
            if (startupSignal) return shutdownStartup();
            if (TEST_BOOT) {
                console.log(`EP_WS_ENDPOINT=${browser.wsEndpoint()}`);
                browser.process()?.once('exit',(code,signal)=>console.error('EP_TEST_BROWSER_EXIT='+JSON.stringify({code,signal})));
            }
            const page = (await browser.pages())[0];

            /**
 * Finds the login button by its label text within the login form.
 * Avoids SSO/social buttons by requiring the button to be inside a <form>.
 * @returns {Promise<ElementHandle|null>} The login button handle or null if not found
 */
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

            /**
 * Navigates to the login page and waits for the login form to appear.
 * Verifies the form is on the expected host (iam.educationperfect.com) to prevent
 * credential submission on lookalike pages. Returns the resolved login button.
 * @returns {Promise<{loginButton: ElementHandle|null}|null>} Login form info or null if form not found/wrong host
 */
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

            /**
 * Fills in the loaded credentials and submits the login form currently on screen.
 * Whether the form is still there is confirmed just before typing: a manual sign-in
 * can complete while the credentials were being resolved (env vars and the keychain
 * involve no prompt; a terminal prompt is cancelled by a completed login), or in the
 * beat before the first keystroke lands, and page.type into the page a completed
 * login leaves behind has no login form to match - the throw that used to kill the
 * whole run (issue #27). One DOM read confirms form present, no session signal
 * (DIR.home_css) and the expected login host, right before the typing begins.
 *
 * The read and the typing are separate round trips to the browser, so a manual login
 * is still free to navigate between them: the typing is wrapped as a unit and a
 * navigation/detached-frame failure inside it abandons auto-login for the manual-login
 * path instead of rejecting the startup chain. A keystroke that did get through into a
 * page that then navigated is harmless - the document it landed in is gone.
 * @param {{loginButton: ElementHandle|null}} loginForm - From reachLoginForm
 * @returns {Promise<void>}
 */
            const attemptAutoLogin = async (loginForm) => {
                const fillGuard = await page.evaluate((userCss, homeCss) => ({
                    form: document.querySelector(userCss) !== null,
                    session: document.querySelector(homeCss) !== null,
                    host: location.hostname,
                }), DIR.username_css, DIR.home_css).catch(() => null);

                if (fillGuard === null) {
                    // The page state could not even be read: a navigation (e.g. a manual
                    // login just landing) is mid-flight. Nothing may be typed until it
                    // settles, and the user's login is already taking care of itself.
                    console.log('The login page state could not be verified before auto-login; skipping it. Log in manually in the browser window.');
                } else if (fillGuard.session) {
                    // A manual login got in first and the logged-in signal is already on
                    // screen: nothing to fill, the post-login wait below resolves at once.
                    console.log('The browser is already logged in; skipping auto-login.');
                } else if (!fillGuard.form) {
                    console.log('The login form is gone; skipping auto-login. If the session is not open yet, log in manually in the browser window.');
                } else if (fillGuard.host !== DIR.login_host) {
                    // The same oath reachLoginForm took: never type credentials into an
                    // origin EP did not serve this login form from - a lookalike there
                    // would receive the password.
                    console.log(`Expected the login form on ${DIR.login_host}, but EP served it from ${fillGuard.host}. Not auto-filling credentials there; log in manually in the browser window.`);
                } else {
                    const { loginButton } = loginForm;
                    // THIS FILLS IN YOUR DETAILS TO LOG IN AUTOMATICALLY
                    // (username/password only: SSO, Google, Microsoft, Clever and the reCAPTCHA
                    // on this page are left alone - users on those sign-in methods must log in
                    // manually, and no challenge is ever solved or bypassed here.)
                    console.log('Filling in login details...');
                    try {
                        await page.type(DIR.username_css, DIR.email);
                        await page.type(DIR.password_css, DIR.password);
                    } catch (e) {
                        // The form went away between the guard read above and the typing:
                        // a manual login navigated the page (Puppeteer reports this as a
                        // detached frame / destroyed execution context). That is the
                        // manual-login path, not a failure - report it and let the
                        // post-login wait below settle on whichever page is left.
                        console.log(`The login page changed while auto-login was filling it (${e.message}); leaving it to the manual login.`);
                        return;
                    }
                    // Submit through the form's own Log in button: the iam page POSTs to
                    // /oauth2/authorize, and a synthetic Enter only submits when focus lands in a
                    // field. The resolved handle is clicked, so an SSO/social button can never be
                    // hit by accident; Enter is the fallback when no such button exists.
                    console.log('Submitting login form...');
                    // The navigation waiter must exist BEFORE the click is dispatched: a fast
                    // successful redirect would otherwise happen before waitForNavigation
                    // starts observing, and the login would sit out the full 30s timeout.
                    // The catch is attached now rather than at the await so that a rejection
                    // during the password-field clear below is already handled and cannot
                    // surface as an unhandled rejection.
                    const navigation = page.waitForNavigation({ timeout: 30000 }).catch(() => {
                        // a failed login stays on the form (or shows an error/challenge there),
                        // so the timeout is not fatal: report it and let the user finish by hand.
                        console.warn('No navigation after submitting the login form; check the open browser window for an error or challenge.');
                    });
                    // Dispatch the click/Enter, then immediately clear the password field so the
                    // secret doesn't linger in the DOM during the navigation wait.
                    await (loginButton ? loginButton.click() : page.keyboard.press('Enter'));
                    await page.$eval(DIR.password_css, el => { el.value = ''; }).catch(() => { });
                    await navigation;

                    console.log('Waiting for home page to load...');
                    // wait for the app shell, so a slow dashboard is reported honestly instead
                    // of being called loaded the moment the login form disappears. Other routes
                    // (a task opened straight from an assignment link) also carry the shell.
                    const homeSeen = await page.waitForSelector(DIR.home_css, { timeout: 30000 }).then(() => true).catch(() => false);
                    console.log(homeSeen
                        ? `EP Home page loaded (${new URL(page.url()).pathname}); Logged in.`
                        : `Login did not reach the app shell (${DIR.home_css}) within 30s (now on ${new URL(page.url()).pathname}); finish signing in manually in the browser window.`);
                }
            };

            const loginForm = await reachLoginForm();

            // Whether the logged-in signal was already seen on the page before auto-login
            // could fill anything: a manual login raced the credential prompt (the prompt
            // is cancelled for exactly that) or arrived while the loaded credentials were
            // being put to use (the pre-type guard covers that). It steers the messages
            // below - an already-open session is reported ready, not as "no credentials" -
            // and joins the auto-login guard.
            let sessionDetected = false;

            // The login watcher the credential prompt is raced against: resolves true the
            // moment the app shell mounts - DIR.home_css, the same signal the
            // end-of-startup wait below uses, and the one every manual login path (the
            // password form as well as school SSO, Google, Microsoft, Clever) produces.
            // EP's login bounces through several hosts before the session arrives, so a
            // wait killed by one of those navigations is re-armed rather than ending the
            // watch; the watch only stops for good when the page itself is gone.
            // @returns {Promise<boolean>}
            function watchForSession() {
                // Always a promise of a boolean: it is raced (racePromptAgainstLogin) or
                // awaited, never tested for truthiness.
                return sessionAppeared(page).then(seen => seen === true);
            }

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

            if (loginForm !== null) {
                // Resolved only once the expected login form is actually in front of us,
                // so a keychain read or a password prompt never happens for a run that
                // was going to stop at a lookalike host anyway. Called even when the env
                // vars are already set: that is where a half-set pair is reported. The
                // login watcher is passed along so the prompt is raced against a manual
                // login (see racePromptAgainstLogin).
                const credentials = await resolveCredentials(watchForSession);
                if (credentials !== null && !credentials.sessionDetected) {
                    console.log(`Auto-login credentials loaded from ${credentials.source}.`);
                    DIR.email = credentials.email;
                    DIR.password = credentials.password;
                } else if (credentials !== null) {
                    // The manual login won the race while the prompt was open: the prompt
                    // was cancelled invisibly (finish()'s cleanup, minus process.exit) and
                    // the run falls through to the normal post-login wait below.
                    sessionDetected = true;
                    console.log('Logged in manually in the browser; skipping the terminal prompt and auto-login.');
                }
            }

            if (DIR.email && DIR.password && loginForm !== null) {
                await attemptAutoLogin(loginForm);
            } else if (DIR.email && DIR.password) {
                // a lookalike host (see reachLoginForm): never auto-filled, and no keychain
                // read or prompt was ever done for it
                console.log('Auto-login skipped; finish signing in manually in the browser window.');
            } else if (sessionDetected) {
                // The login completed in the browser while the credential prompt was open
                // (or by the time resolved credentials were being put to use): report the
                // session as ready instead of claiming no credentials were given.
                console.log('Session ready: a login has already completed in the browser; continuing.');
            } else {
                console.log('No credentials provided; skipping auto-login. Log in manually in the opened browser window.');
            }
            // Either way, continue once a session is actually running: the manual branch waits
            // without a timeout here, exactly as before, and the auto branch has already been
            // given its 30s check above. When the session was detected already (the manual
            // login won its race), the element is on screen: this resolves at once and the
            // run proceeds.
            await page.waitForSelector(DIR.home_css, { timeout: 0 });


            // ===== Auto-answer code starts here ===== //
            let TOGGLE = false;  // user intent: the loop should be answering right now
            let RUNNING = null;  // promise handle of the run currently executing, or null
            let CLEANUP = null;  // promise of the most recent run's post-run modal cleanup
            let ENTER = true;
            let runReason = 'stopped';

            // How long to wait for EP to move on to the next question after a submission.
            // EP round-trips (large class, slow backend, transient lag) can legitimately
            // exceed 5s, so a fixed 5s timeout used to abort the whole task on one slow
            // round. Keep generous, and retry the round once before giving up.
            const ADVANCE_TIMEOUT = TEST_BOOT && Number(process.env.EP_TEST_ADVANCE_TIMEOUT) > 0
                ? Number(process.env.EP_TEST_ADVANCE_TIMEOUT) : 15000;

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

            /**
 * Normalizes a string by removing parenthetical content and taking the first
 * segment separated by ; , or |. Used for question dictionary keys.
 * @param {string} string
 * @returns {string}
 */
            function cleanString(string) {
                return String(string)
                    .replace(/\([^)]*\)/g, "").trim()
                    .split(";")[0].trim()
                    .split(",")[0].trim()
                    .split("|")[0].trim();
            }

            /**
 * Builds an ordered list of candidate answers from a raw answer string.
 * Handles EP's different join formats (; , |) and produces candidates in priority order:
 * joined groups, whole groups, full display string, then bare pieces.
 * @param {string} rawAnswer
 * @returns {string[]}
 */
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

            /**
 * Merges two candidate arrays, preserving order and deduplicating.
 * @param {string[]} existing
 * @param {string[]} incoming
 * @param {boolean} incomingFirst - If true, incoming candidates take priority
 * @returns {string[]}
 */
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

            /**
 * Generates the canonical key for a question's futility counter.
 * Uses the cleaned question text so all rendering variants share one counter.
 * @param {string} question
 * @returns {string}
 */
            function futileKey(question) {
                return cleanString(question);
            }

            /**
 * Registers candidate answers for a question under all key variants.
 * Returns true if new candidates were added (indicating fresh knowledge from a modal).
 * @param {string} question
 * @param {string} rawAnswer
 * @param {boolean} incomingFirst
 * @returns {boolean}
 */
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

            /**
 * Records a bidirectional word-list pair (both directions answer each other).
 * Uses existing-first merge so refreshes don't demote modal-proven candidates.
 * @param {string} first
 * @param {string} second
 */
            function learnPair(first, second) {
                learnEntry(first, second, false);
                learnEntry(second, first, false);
            }

            /**
 * Records that an answer was graded wrong for a question, under all key variants.
 * Prevents the same wrong answer from being resubmitted.
 * @param {string} question
 * @param {string} answer
 */
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

            /**
 * Checks if an error indicates the page/frame has been destroyed or navigated away.
 * These errors are expected during normal operation (task completion, browser close)
 * and should be handled quietly rather than as crashes.
 * @param {Error|any} e
 * @returns {boolean}
 */
            function isPageGoneError(e) {
                const message = String((e && e.message) || e);
                return /detached Frame|Execution context was destroyed|Cannot find context|Target closed|Session closed|Browser has been closed|Navigating was not successful/i.test(message);
            }

            // The login watcher's body (see watchForSession in the startup flow, which
            // passes `page`): waits for the shell on `page`, re-arming after navigations.
            // It takes its signals as arguments so it can be tested without a browser.
            /**
     * Resolves true once the logged-in app shell is on the page, false once the page is gone.
     * @param {Page} page - The browser page to watch
     * @param {string} homeCss - The logged-in app-shell selector
     * @param {(e: any) => boolean} isGone - Page-closed test (isPageGoneError)
     * @param {number} retryDelayMs - Delay before re-arming after a navigation
     * @returns {Promise<boolean>}
     */
            async function sessionAppeared(page, homeCss = DIR.home_css, isGone = isPageGoneError, retryDelayMs = 100) {
                while (true) {
                    const seen = await page.waitForSelector(homeCss, { timeout: 0 }).then(() => true, e => e);
                    if (seen === true) return true;   // the app shell mounted: logged in
                    if (isGone(seen)) return false;   // no page left to watch
                    await new Promise(r => setTimeout(r, retryDelayMs));   // a navigation: re-arm
                }
            }

            /**
 * Scrapes word list entries from the task-starter page.
 * Uses innerText to respect visual rendering (one entry per line).
 * @param {string} selector
 * @returns {Promise<string[]>}
 */
            async function wordList(selector) {
                return await page.$$eval(selector, els => {
                    let words = [];
                    els.forEach(i => words.push(i.innerText));
                    return words;
                });
            }

            /**
 * Reads the current question text from the task page.
 * Returns null if the element is missing (round transition, navigation, task end).
 * Does not throw on missing elements.
 * @returns {Promise<string|null>}
 */
            async function readQuestionText() {
                try {
                    return await page.$eval(DIR.question_css, el => el.textContent);
                } catch (e) {
                    return null;
                }
            }

            /**
 * Scrapes and learns word pairs from the task-starter page.
 * Resets dictionaries if the lists have changed (new task), otherwise merges.
 * Reports the entry count via console and toast.
 * @returns {Promise<void>}
 */
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


            /**
 * Extracts the user's submitted answer from the wrong-answer modal.
 * Reads per-word segments, skipping greyed-out (unanswered) portions.
 * @returns {Promise<string>}
 */
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

            /**
 * Handles a wrong-answer modal: waits for it to load, learns the correct answer,
 * records the rejection, dismisses the modal, and updates futility counters.
 * @param {string} question - The question text as detected before submission
 * @param {string} answer - The answer that was submitted and graded wrong
 * @param {boolean} randomRound - Whether this round used a random string (affects futility counting)
 * @returns {Promise<boolean>} True if a correction was learned, false otherwise
 */
            async function correctAnswer(question, answer, randomRound = false) {
                // wait until the modal's question and correct answer have actually been
                // filled in. Both start as "&nbsp;" placeholders, which trim() to '', so
                // requiring non-empty text on both is the real readiness condition; the
                // old guard accepted anything that was merely "not blau" (one sample word)
                // and read empty placeholders into the dictionary permanently.
                let loaded = true;
                try {
                    await page.waitForFunction((qCss, aCss) => {
                        const q = document.querySelector(qCss);
                        const a = document.querySelector(aCss);
                        if (!q || !a) return false;
                        // an empty question is transitional too; accepting it would store the
                        // correction under "" and pollute every lookups that touch empty keys
                        return q.textContent.trim() !== '' && a.textContent.trim() !== '';
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
                if (!/^(audio|typed):/.test(question) && modalQuestion !== question) {
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

            /**
 * Removes all modal windows and backdrops from the page.
 * Used to dismiss modals without waiting for EP's cooldown animations.
 * @returns {Promise<void>}
 */
            async function deleteModals() {
                await page.$$eval(DIR.modal_css, el => {
                    el.forEach(i => i.remove())
                });
                await page.$$eval(DIR.modal_backdrop_css, el => {
                    el.forEach(i => i.remove())
                });
            }

            /**
 * Finds the best candidate answer for a question.
 * Checks all key variants, returns the first non-rejected candidate.
 * Returns null if candidates exist but all were rejected (caller escalates).
 * Returns a random string if the question is completely unknown.
 * @param {string} question
 * @returns {string|null}
 */
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

            /**
 * Generates a random alphanumeric string for probing unknown questions.
 * @param {number} minLength
 * @param {number} maxLength
 * @returns {string}
 */
            function generateRandomString(minLength, maxLength) {
                const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;
                const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                let result = '';
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * characters.length));
                }
                return result;
            }

            /**
 * Handles whatever modal is on screen after an answer submission.
 * Routes to correctAnswer for wrong-answer modals, clicks exit/continue for completion,
 * or deletes unknown modals.
 * @param {string} question
 * @param {string} answer
 * @param {boolean} randomRound
 * @returns {Promise<boolean>} False if task is complete, true to continue answering
 */
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

            /**
 * Waits for the round to advance past the previous question, or for a modal to appear.
 * Polls the question text and answer box value; treats a cleared box as advancement.
 * Aborts cleanly if TOGGLE becomes false. Returns a status string.
 * @param {string} previous - The previous question text
 * @param {number} timeout - Timeout in ms (0 = no timeout)
 * @param {string} submitted - The answer that was submitted
 * @returns {Promise<'advanced'|'modal'|'timeout'|'aborted'>}
 */
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

            /**
 * Reads the answer box's current value.
 * Returns null if the box is not rendered (transitional state between rounds).
 * Does not throw on missing elements.
 * @returns {Promise<string|null>}
 */
            async function answerBoxValue() {
                try {
                    return await page.$eval(DIR.answer_box_css, el => el.value);
                } catch (e) {
                    return null;
                }
            }

            /**
 * Focuses and clears the answer box, verifying it's empty before returning.
 * Retries up to 5 times with alternating triple-click and Ctrl+A to handle
 * EP's asynchronous content restoration.
 * @returns {Promise<boolean>} True if box is empty, false if box missing or content persisted
 */
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

            /**
 * Reads the answer box until its value stabilizes (two consecutive reads match).
 * Handles EP's late keystroke processing by confirming the value holds.
 * @param {string} answer - The expected answer
 * @returns {Promise<string|null>} The settled value, or null if box vanished
 */
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

            /**
 * Per-keystroke pause when typing an answer. Zero-gap keystrokes race EP's own
 * input handling, which re-applies the value it last committed to the box at
 * unpredictable moments — grafting snapshots of old text into the middle of the
 * fresh one, so "I speak" arrived as "I I sI speakeakat". Spacing the keystrokes
 * gives EP's handling time to keep up, the way it does for human typing. 20ms
 * keeps a 7-character word under 0.2s, and any attempt that still garbles is
 * caught by enterAnswer's verification and retried with an escalated delay.
 */
            const TYPE_DELAY_MS = 20;

            /**
 * Types an answer into the answer box and verifies it was entered correctly.
 * Uses real keyboard events with spaced keystrokes. Escalates delay on retries.
 * @param {string} answer
 * @returns {Promise<boolean>} True if answer was entered and verified, false if box vanished
 * @throws {Error} If answer could not be entered after all retries
 */
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

            // non-text item key -> submissions attempted this run (the per-item bound
            // in handleTypedRound; keys are contentID+questionIndex+mode, so entries
            // never bleed across items or runs)
            const typedSubmissionsByKey = new Map();

            // the last (question, answer) submitted in the current run. A round whose
            // submission is still on screen must not be resubmitted blindly — the stall
            // guard below checks for exactly that. Cleared whenever a modal is handled,
            // since that means the round resolved.
            let lastSubmitted = null;

            /**
 * Resolves the current modal and prepares for the next round.
 * Clears the lastSubmitted tracker on modal resolution so a repeated question
 * isn't treated as a resubmission stall.
 * @param {string} question
 * @param {string} answer
 * @param {boolean} randomRound
 * @returns {Promise<boolean>} False if task completed, true to continue
 */
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

            /**
 * Waits for a non-text round to advance past the current item, or for a modal.
 * Mirrors waitForAdvance, but the round's identity is the detected question key:
 * audio and lesson items have no #question-text to compare.
 * @param {string} key - descriptor.key of the submitted item
 * @param {number} timeout - Timeout in ms (0 = no timeout)
 * @param {string} submitted - The answer that was submitted
 * @returns {Promise<'advanced'|'modal'|'timeout'|'aborted'>}
 */
            async function waitForAdvanceKey(key, timeout, submitted) {
                const deadline = timeout > 0 ? Date.now() + timeout : Infinity;
                while (TOGGLE && Date.now() < deadline) {
                    if (await page.$(DIR.modal_css) !== null) return 'modal';
                    const current = await detectQuestion(page);
                    if (current === null) {
                        // a transition, or the task ended: only the VISIBLE completion
                        // controls prove completion (they exist hidden on every round)
                        const complete = await page.evaluate((exitCss, contCss) => {
                            const shown = (css) => {
                                const el = document.querySelector(css);
                                return !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
                            };
                            return shown(exitCss) || shown(contCss);
                        }, DIR.exit_button_css, DIR.exit_continue_button_css).catch(() => false);
                        if (complete) return 'advanced';
                    } else if (typeof current.key === 'string' && current.key !== key) {
                        return 'advanced';
                    }
                    // A cleared answer box is deliberately NOT an advance signal here
                    // (unlike the classic path): if EP rejects a typed audio/lesson
                    // answer by clearing the box while keeping the same item on screen,
                    // treating the clear as advancement would resubmit the same answer
                    // forever. Advancement is a changed question key, a modal, or
                    // completion - nothing else.
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                return TOGGLE ? 'timeout' : 'aborted';
            }

            /**
 * Plays one round of an audio (Listening/Dictation) or lesson short-answer question.
 * The accepted answers ship in EP's client-side question state (verified live
 * 2026-10-30 for Listening/Dictation; the lesson short-answer shape is
 * extrapolated, not live-verified), so the round is: type the first shipped
 * answer EP hasn't rejected,
 * submit, wait for the item to change. No random probing - the answers come from
 * EP itself, so if every one is rejected the item is broken, not unknown, and the
 * run stops and reports instead of guessing (issue #32's fail-loudly rule).
 * @param {object} descriptor - audio/typed descriptor from detectQuestion
 * @returns {Promise<boolean>} False to stop the run, true to keep looping
 */
            async function handleTypedRound(descriptor) {
                const key = descriptor.key;
                // Marking gate. Lesson short-answer is strict: the flag (captured
                // as a real boolean on a Smart Lesson, 2026-10-30) must be
                // explicitly true. List audio tasks ship no sectionData at all
                // (captured on Listening), so audio is allowed either by an
                // explicit true flag OR by positive identification of the
                // captured self-test list context (contentSource.selectedActivity
                // with _taskID null, _activityType 1, _contentType 1 - see
                // detect-question.js; the no-teacher-marking-surface reading of
                // that shape is a documented inference, not a proof). An explicit
                // false, an assigned task, or any unknown context stops the run.
                if (descriptor.kind === 'audio') {
                    // the list allowance substitutes ONLY for the captured live
                    // shape: sectionData genuinely ABSENT. A present but
                    // unreadable/malformed sectionData never borrows it.
                    const allowed = descriptor.autoMarked === true
                        || (descriptor.autoMarked === 'unknown' && descriptor.sectionDataPresent === false && descriptor.selfTestList === true);
                    if (!allowed) {
                        const message = descriptor.autoMarked === false
                            ? 'This audio task is marked manually (self/peer/teacher), not auto-marked by EP; stopping instead of answering.'
                            : 'EP did not confirm this audio task is auto-marked or a self-test list (the marking fields were missing or unreadable); stopping instead of answering.';
                        console.error(message);
                        await alert(message);
                        return false;
                    }
                } else if (descriptor.autoMarked !== true) {
                    const message = descriptor.autoMarked === false
                        ? 'This lesson question is marked manually (self/peer/teacher), not auto-marked by EP; stopping instead of answering.'
                        : 'EP did not confirm this lesson question is auto-marked (the marking field was missing or unreadable); stopping instead of answering.';
                    console.error(message);
                    await alert(message);
                    return false;
                }
                // Bound the submissions any single item can get in one run. The
                // advance wait below treats only a changed question key, a modal, or
                // completion as progress, so an item that quietly rejects (cleared
                // box, same question) would otherwise be resubmitted without limit.
                // Two attempts mirror the classic path's submit-once-plus-one-retry.
                const submissions = typedSubmissionsByKey.get(key) || 0;
                if (submissions >= 2) {
                    const message = `EP has not accepted ${submissions} submissions for ${key}; stopping instead of resubmitting.`;
                    console.error(message);
                    await alert(message);
                    return false;
                }
                const answers = (descriptor.answers || []).filter(a => typeof a === 'string' && a.trim() !== '');
                const rejected = rejectedDict[key] || new Set();
                const answer = answers.find(a => !rejected.has(a));
                if (answer === undefined) {
                    const message = answers.length === 0
                        ? `This ${descriptor.kind === 'audio' ? 'audio' : 'lesson'} question ships no accepted answers to answer with (it may be manually marked); stopping instead of guessing.`
                        : `EP rejected every shipped answer for ${key}; stopping instead of guessing.`;
                    console.error(message);
                    await alert(message);
                    return false;
                }

                console.log(`Answering ${descriptor.kind === 'audio' ? 'audio' : 'lesson'} question ${key} from EP's shipped answers.`);
                if (!await enterAnswer(answer)) {
                    // the box vanished mid-entry: a round transition; the next pass re-detects
                    console.log('Answer box vanished while answering; re-detecting the question.');
                    return true;
                }
                if (!TOGGLE) return false;

                // the item can swap while the answer is being typed (the same round
                // skew the classic path guards against): re-detect before submitting
                const fresh = await detectQuestion(page);
                if (fresh === null || fresh.kind === 'text' || fresh.key !== key) {
                    console.log(`Question changed while typing (${key}); looking the answer up again on the next pass.`);
                    return true;
                }

                // Recheck the actual value after scope detection, immediately
                // before Enter. No submission slot is consumed by a lost box.
                if (await answerBoxValue() !== answer || !TOGGLE) return true;
                if (ENTER) {
                    typedSubmissionsByKey.set(key, submissions + 1);
                    await page.keyboard.press('Enter');
                }
                lastSubmitted = { question: key, answer };

                let outcome = await waitForAdvanceKey(key, ENTER ? ADVANCE_TIMEOUT : 0, answer);
                if (outcome === 'timeout' && ENTER) {
                    // same single-retry policy as the classic path: EP can swallow
                    // an Enter. But a quiet rejection CLEARS the box, so never
                    // retry blind: re-read it and retype the exact answer first,
                    // otherwise the retry submits an empty box.
                    console.log(`Question ${key} did not advance within ${ADVANCE_TIMEOUT}ms; retrying the submission once.`);
                    await page.click(DIR.answer_box_css).catch(() => { });
                    if (!TOGGLE) return false;
                    const inBox = await page.$eval(DIR.answer_box_css, el => el.value).catch(() => null);
                    if (inBox === null) {
                        console.log('Answer box vanished before the retry; re-detecting the question.');
                        return true;
                    }
                    if (inBox !== answer) {
                        console.log(inBox === ''
                            ? 'The answer box was cleared after the submission (quiet rejection); retyping the answer for the retry.'
                            : 'The answer box content changed after the submission; retyping the answer for the retry.');
                        if (!await enterAnswer(answer)) {
                            console.log('Answer box vanished while retyping; re-detecting the question.');
                            return true;
                        }
                        if (!TOGGLE) return false;
                    }
                    const retryQuestion = await detectQuestion(page);
                    if (!retryQuestion || retryQuestion.key !== key) return true;
                    if (await answerBoxValue() !== answer || !TOGGLE) return true;
                    const retryCount = typedSubmissionsByKey.get(key) || 0;
                    if (retryCount >= 2) {
                        const message = `EP has not accepted ${retryCount} submissions for ${key}; stopping instead of resubmitting.`;
                        console.error(message);
                        await alert(message);
                        return false;
                    }
                    typedSubmissionsByKey.set(key, retryCount + 1);
                    await page.keyboard.press('Enter');
                    outcome = await waitForAdvanceKey(key, ADVANCE_TIMEOUT, answer);
                    if (outcome === 'timeout') {
                        console.error(`Question ${key} did not advance after submitting its answer. Stopping.`);
                        await alert(`Answer loop stopped: ${key} did not advance.`);
                        return false;
                    }
                }
                if (outcome === 'timeout' && !ENTER) {
                    // semi-auto: the answer is typed and awaiting the user's Enter
                    console.log(`Waiting for the answer to ${key} to be submitted.`);
                    outcome = await waitForAdvanceKey(key, 0, answer);
                }
                if (outcome === 'aborted') return false;
                if (outcome === 'modal') {
                    // the modal proves this shipped answer was rejected: record that and
                    // learn whatever correction it shows, then try the remaining answers
                    recordRejection(key, answer);
                    return await handleModalAndContinue(key, answer, false);
                }
                return TOGGLE;
            }

            // The non-text question handlers, dispatched from answerQuestions by the
            // detected descriptor's kind (issue #33's QUESTION_HANDLERS). Detection is
            // deliberately shared per-round in detectQuestion: a round must be
            // classified atomically (and re-detected for stabilization), not probed by
            // each handler in turn. Each handler plays one round from the descriptor
            // and returns false to stop the run, true to keep looping.
            const QUESTION_HANDLERS = [
                { type: 'choice', play: playChoiceDescriptorRound },
                { type: 'audio', play: handleTypedRound },
                { type: 'typed', play: handleTypedRound },
            ];

            /**
 * Plays one round of a non-text question (Smart Lesson slide or audio task).
 * Every refusal path stops and reports rather than guessing (issue #33).
 * @param {object} descriptor - non-text descriptor from detectQuestion
 * @returns {Promise<boolean>} False to stop the run, true to keep looping
 */
            async function handleNonTextRound(descriptor) {
                if (!TOGGLE) return false;
                if (descriptor.kind === 'unsupported') {
                    console.error(descriptor.reason);
                    await alert(descriptor.reason);
                    return false;
                }
                const handler = QUESTION_HANDLERS.find(h => h.type === descriptor.kind);
                if (!handler) {
                    const message = `No question handler is registered for "${descriptor.kind}"; stopping instead of guessing.`;
                    console.error(message);
                    await alert(message);
                    return false;
                }
                return await handler.play(descriptor);
            }

            /**
 * Choice-round handler: re-detects the slide to confirm it held still, then
 * plays it through lib/choice-handler.js and maps the outcome onto the run.
 * @param {object} descriptor - choice descriptor from detectQuestion
 * @returns {Promise<boolean>} False to stop the run, true to keep looping
 */
            async function playChoiceDescriptorRound(descriptor) {
                    // EP swaps slides asynchronously, like it swaps question text: require
                    // the detected slide to hold still across two reads before clicking.
                    const again = await detectQuestion(page);
                    if (again === null || again.kind !== 'choice' || again.key !== descriptor.key) {
                        console.log('Choice slide changed during detection; re-reading it in a fresh pass.');
                        return true;
                    }
                    const result = await playChoiceRound(page, again, {
                        enter: ENTER,
                        timeout: ADVANCE_TIMEOUT,
                        shouldStop: () => !TOGGLE,
                        log: msg => console.log(msg),
                    });
                    if (result.status === 'advanced') return TOGGLE;
                    if (result.status === 'aborted') return false;
                    if (result.status === 'complete') {
                        if (await taskCompletionProven()) runReason = 'completed';
                        console.log('Lesson completed.');
                        return false;
                    }
                    if (result.status === 'modal') {
                        // A modal after a choice submission is not necessarily a
                        // rejection (EP shows info/completion modals too), and the
                        // wrong-answer modal for choice questions has never been
                        // observed live. Stop and report rather than guess which it is.
                        console.error('A modal appeared during the choice round; stopping so it can be checked. The submission may or may not have been accepted.');
                        await alert('A modal interrupted the choice round; stopping the run.');
                        return false;
                    }
                    // 'stopped'
                    console.error(result.message);
                    await alert(result.message);
                    return false;
                }

            // A generic Continue/modal is not proof that the task ended. Status
            // uses a narrower signal than legacy navigation: no question plus
            // a visible exit control, while this run still intends to answer.
            async function taskCompletionProven() {
                if (!TOGGLE || await detectQuestion(page) !== null) return false;
                const exitVisible = await page.evaluate(css => {
                    const button = document.querySelector(css);
                    return !!button && !button.hidden && (button.offsetParent !== null || button.getClientRects().length > 0);
                }, DIR.exit_button_css).catch(() => false);
                return TOGGLE && exitVisible;
            }

            /**
 * Main answer loop: runs until TOGGLE is false, task completes, or an error occurs.
 * Handles cleanup, modal resolution, and page-gone errors. Restart-safe.
 * @returns {Promise<void>}
 */
            async function answerLoop() {
                if (RUNNING !== null) throw Error("Tried to initiate answerLoop while it is already running");

                TOGGLE = true;
                runReason = 'stopped';
                lastSubmitted = null;
                typedSubmissionsByKey.clear();
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
                return { reason: runReason };
            }

            /**
 * Core answering logic: reads questions, finds/enters answers, handles submissions.
 * Bounded respawn counters prevent infinite loops on dead/stale pages.
 * @returns {Promise<void>}
 */
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
                    // Per-round question-type detection (issues #33/#32): the loop asks
                    // the page what it is showing instead of assuming #question-text.
                    // Classic text questions keep the inline path below; Smart Lesson
                    // slides and audio tasks are played by their handlers, and the next
                    // pass detects fresh. This is also what lets a run start on a lesson
                    // page, where #question-text never exists.
                    let descriptor = await detectQuestion(page);
                    if (descriptor === null) {
                        // The question element disappears on round transitions and on the
                        // task's end screens, but an unconfirmed disappearance must not
                        // kill a live run or click the wrong control: wait (up to ~20s)
                        // for a question to return, or for an explicit completion state —
                        // a modal, or exit/continue controls on the completion screen.
                        // The old code crashed here with a bare $eval; then it broke out
                        // of the run on any unconfirmed null question.
                        let complete = false;   // completion controls were seen on screen
                        let modalSeen = false;  // a modal is up; route it to its handler
                        let completePolls = 0;  // consecutive polls with completion controls visible
                        for (let i = 0; i < 80 && TOGGLE; i++) {
                            await new Promise(resolve => setTimeout(resolve, 250));
                            descriptor = await detectQuestion(page);
                            if (descriptor !== null) break;
                            if (await page.$(DIR.modal_css) !== null) { modalSeen = true; break; }
                            // The completion controls exist in the DOM (hidden) on every
                            // round of a lesson/task, and slides unmount for a beat
                            // before the next one mounts: only controls that are VISIBLE
                            // on two consecutive polls (the question stayed gone, so this
                            // is not a slide gap) prove completion. An existence check
                            // here used to "complete" the task mid-lesson and click a
                            // hidden exit button.
                            const controlsVisible = await page.evaluate((exitCss, contCss) => {
                                const shown = (css) => {
                                    const el = document.querySelector(css);
                                    return !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
                                };
                                return shown(exitCss) || shown(contCss);
                            }, DIR.exit_button_css, DIR.exit_continue_button_css).catch(() => false);
                            completePolls = controlsVisible ? completePolls + 1 : 0;
                            complete = completePolls >= 2;
                            if (complete) break;
                        }
                        if (descriptor === null) {
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
                                const proven = await taskCompletionProven();
                                if (!TOGGLE) break;
                                const exited = await page.evaluate((exitCss, contCss) => {
                                    const button = document.querySelector(exitCss) || document.querySelector(contCss);
                                    if (!button) return false;
                                    button.click();
                                    return true;
                                }, DIR.exit_button_css, DIR.exit_continue_button_css).catch(() => false);
                                if (exited && proven && TOGGLE) runReason = 'completed';
                                console.log(exited ? 'Clicked the task exit/continue button.' : 'The completion controls vanished; stopping the run.');
                            }
                            break;
                        }
                        // a question came back: fall through to its pass
                    }
                    if (descriptor.kind !== 'text') {
                        if (!await handleNonTextRound(descriptor)) break;
                        continue;
                    }
                    let question = descriptor.text;
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

            /**
 * Starts a new answerLoop run, managing the RUNNING handle for restart safety.
 * The RUNNING promise identity ensures a cleanup from an old run doesn't
 * cancel a newer run that started during cleanup.
 * @returns {void}
 */
            function startLoop() {
                TOGGLE = true;
                const myRun = answerLoop()
                    .catch(e => {
                        // answerLoop's own finally already cleared TOGGLE on every
                        // path that can reach this handler, and a stale TOGGLE = false here
                        // would cancel a newer run spawned while the old cleanup was pending
                        console.error(diagnostic(e, 'Answer loop'));
                        throw e;
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
                return myRun;
            }

            /**
 * Toggles the answer loop on/off (Alt+S hotkey).
 * If running, signals stop by setting TOGGLE=false. If stopped, starts a new run.
 * @returns {Promise<void>}
 */
            async function toggleLoop() {
                if (controls.status().state === 'running') {
                    console.log('Stopping answerLoop.');
                    await controls.stop();
                } else if (['stopped', 'error', 'completed'].includes(controls.status().state)) {
                    console.log('Starting answerLoop.');
                    controls.start();
                } else if (controls.status().state === 'closed') {
                    await notifyControl('The browser is closed; open a new session before starting again.');
                } else {
                    await notifyControl(`Answer control is ${controls.status().state}; wait until stopped before starting again.`);
                }
            }

            /**
 * Toggles between auto mode (auto-submit Enter) and semi-auto mode (user presses Enter).
 * @returns {Promise<void>}
 */
            async function notifyControl(message) {
                console.log(message);
                try { await alert(message); } catch { console.warn('Browser notification could not be shown.'); }
            }

            async function toggleAuto() {
                try { await controls.mode(ENTER ? 'semi' : 'auto'); }
                catch { await notifyControl('Stop the run before changing mode.'); return; }
                await notifyControl(ENTER ? 'Switched to auto mode.' : 'Switched to semi-auto mode.');
            }

            async function refreshControl() {
                try { await controls.refresh(); }
                catch { await notifyControl('Word refresh failed or a run is still active; stop the run and check the task-starter word lists.'); }
            }

            /**
 * Shows a non-blocking toast message in the page (replaces native alert).
 * Persists across navigation via evaluateOnNewDocument.
 * @param {string} msg
 * @returns {Promise<void>}
 */
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

            const controls = createRunControls({
                run: startLoop,
                requestStop: () => { TOGGLE = false; },
                setMode: value => { ENTER = value === 'auto'; },
                refresh: refreshWords,
                close: () => legacySignals && startupSignal ? closeSignalBrowser() : browser.close(),
            });
            browser.on('disconnected', () => controls.browserClosed());

            // Expose API functions to the page (for hotkey event listeners to call).
            // These bindings live on the browser context, not on the document, so they
            // survive navigation - but the keyup listener does not, and must be re-added.
            await page.exposeFunction('refresh', refreshControl);
            await page.exposeFunction('startAnswer', toggleLoop);
            await page.exposeFunction('toggleMode', toggleAuto);
            // Harness-only observability and idempotent stop, never inferred
            // from log text or exposed during normal runs.
            if (TEST_BOOT) {
                await page.exposeFunction('epTestState', () => ({ running: ['running', 'stopping'].includes(controls.status().state) }));
                await page.exposeFunction('epTestStop', () => controls.stop());
            }

            /**
             * Installs the hotkey keyup listener on the page document.
             * Registered via evaluateOnNewDocument to survive navigations.
             * Idempotent: guarded by window.__epHotkeysInstalled.
             * @returns {void}
             */
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

            console.log('Education Perfected V2026 fully Loaded.');
            if (legacySignals) {
                // Legacy entrypoints have no CLI signal owner. Keep this owner
                // and drain shared controls before closing the owned browser.
                signalClose = () => controls.close();
                legacyReady = true;
                browser.once('disconnected', () => { if (!startupSignal) removeStartupSignals(); });
            } else removeStartupSignals();
            return controls;
        })
        .catch(async error => {
            if (startupSignal) {
                if (startupBrowser) await shutdownStartup();
                else { removeStartupSignals(); process.exit(exitCodeFor(startupSignal)); }
                return;
            }
            removeStartupSignals();
            if (startupBrowser) {
                let timer;
                try {
                    await Promise.race([
                        startupBrowser.close(),
                        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Browser close timed out')), 3000); }),
                    ]);
                }
                catch {
                    // close() can fail on a broken control connection. The
                    // owned browser child is still ours to terminate.
                    startupBrowser.process()?.kill();
                    startupBrowser.disconnect();
                } finally { clearTimeout(timer); }
            }
            throw error;
        });
}

module.exports = { launchProgram, promptCredentials };
if (require.main === module) {
    launchProgram({ legacySignals: true }).catch(error => {
        console.error(diagnostic(error, 'EducationPerfected startup'));
        process.exitCode = 1;
    });
}
