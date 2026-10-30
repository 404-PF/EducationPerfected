// A dependency-free stand-in for the Education Perfect pages index.js drives.
// It serves the same selectors index.js relies on, so a Puppeteer install can be
// checked end to end without an account:
//
//   GET /app/login   iam-style login form (#loginId, #password, form button "Log in")
//   GET /task        task-starter word lists (div.baseLanguage / div.targetLanguage)
//   GET /task/play   question (#question-text), answer box (input#answer-text),
//                    wrong-answer modal (uib-modal-window + td#question-field ...),
//                    completion button (button.exit-button)
//
// The answers are the German words one..five; a wrong submission shows the
// correction modal, a right one advances the round.
const http = require('node:http');

const WORDS = [
    ['one', 'eins'],
    ['two', 'zwei'],
    ['three', 'drei'],
    ['four', 'vier'],
    ['five', 'fünf'],
];

const PAGE = (body) => `<!doctype html>
<html><head><meta charset="utf-8"><title>EP mock</title></head>
<body>${body}
<script>
    // server-injected task state for /task/play
    window.__epMock = window.__epMock || {};
</script>
</body></html>`;

const loginPage = PAGE(`
    <main>
        <form>
            <input id="loginId" autocomplete="username">
            <input id="password" type="password" autocomplete="current-password">
            <button type="button" onclick="
                if (document.getElementById('loginId').value && document.getElementById('password').value) {
                    location.href = '/learning/dashboard';
                }
            ">Log in</button>
        </form>
    </main>`);

// The logged-in shell: index.js treats this as its login signal.
const dashboardPage = PAGE(`
    <main>
        <div id="single-spa-application:mfeGlobalNavigation:Tertiary">Home</div>
        <a href="/task">Task</a>
    </main>`);

// Word lists: one div per word, each with a span inside (matching what the
// smoke test reads with $$eval and what index.js reads with innerText).
const starterPage = PAGE(`
    <main>
        ${WORDS.map(([base]) => `<div class="baseLanguage"><span>${base}</span></div>`).join('')}
        ${WORDS.map(([, target]) => `<div class="targetLanguage"><span>${target}</span></div>`).join('')}
        <button id="start-button-main" onclick="location.href='/task/play'">Start</button>
    </main>`);

// Each round: question text and its answer. A wrong answer shows the modal with the
// canonical answer; dismissing it advances the round, like EP does.
const taskPage = (start) => {
    const clamped = Number.isInteger(start) && start >= 0 && start < WORDS.length ? start : 0;
    const round = WORDS.slice(clamped).map(([base, target]) => ({ question: base, answer: target }));
    return PAGE(`
    <main>
        <table><tr>
            <td id="question-text">${round[0].question}</td>
            <td><input id="answer-text" autocomplete="off"></td>
        </tr></table>
        <button class="exit-button" hidden onclick="location.href='/learning/dashboard'">Exit</button>
    </main>
    <script>
        const rounds = ${JSON.stringify(round)};
        let index = 0;
        const question = document.getElementById('question-text');
        const box = document.getElementById('answer-text');
        const exit = document.querySelector('.exit-button');

        function render() {
            if (index >= rounds.length) {
                // Remove the question element entirely - index.js waits for it to
                // disappear to detect completion.
                question.remove();
                box.parentElement.innerHTML = '';
                exit.hidden = false;
                return;
            }
            question.textContent = rounds[index].question;
            box.value = '';
            box.focus();
        }

        function showWrong(input) {
            const modal = document.createElement('div');
            modal.setAttribute('uib-modal-window', 'modal-window');
            modal.innerHTML = \`
                <table class="modal-body">
                    <tr><td id="question-field">\${rounds[index].question}</td></tr>
                    <tr><td id="correct-answer-field">\${rounds[index].answer}</td></tr>
                    <tr><td id="users-answer-field"><span>\${input}</span></td></tr>
                </table>
                <button id="continue-button" disabled onclick="advance()">Continue</button>\`;
            document.body.appendChild(modal);
            // EP keeps Continue disabled through a short cooldown; index.js clears it.
        }

        function advance() {
            document.querySelectorAll('[uib-modal-window]').forEach(m => m.remove());
            index += 1;
            render();
        }

        box.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const input = box.value;
            if (input.trim() === rounds[index].answer) {
                index += 1;
                render();
            } else {
                showWrong(input);
            }
        });
        box.focus();
    </script>`);
};


// ---------------------------------------------------------------------------
// Fixtures BUILT FROM the 2026-10-30 live-audit notes (no account data, no
// captured markup): they reproduce the audited selectors and scope-state shape
// for Smart Lesson choice slides and audio tasks. EP is an AngularJS app whose
// answer state lives on component scopes, so each fixture ships a minimal
// window.angular stub exposing exactly the shape lib/detect-question.js reads.
// The select/submit/advance/rejection cycle on these pages is fixture behavior,
// not live-verified EP behavior.
// ---------------------------------------------------------------------------

// A Smart Lesson multiple-choice slide: prompt in #question-container-group
// under #ep-question-container (never a #question-text), a radiogroup of
// option divs with repeating per-option ids, one visible Submit among hidden
// duplicates, and a "Next Question" button revealed after a correct grade.
// Slides are rebuilt per round under #slide-host, like the SPA does;
// asyncTransitions models the unmount/remount gap between slides.
const LESSON_ROUNDS = [
    { contentID: 1643503, questionIndex: 0, word: 'armadietto', options: ['lo', 'la', 'il', "l'"], correct: "l'" },
    { contentID: 1643507, questionIndex: 1, word: 'scuola', options: ['il', 'la', 'lo', 'i'], correct: 'la' },
];

const lessonPage = (asyncTransitions) => PAGE(`
    <main>
        <div id="ep-question-container" class="question-container">
            <div id="slide-host"></div>
            <button class="exit-button" hidden onclick="location.href='/learning/dashboard'">Exit</button>
        </div>
        <div id="sa-navigation-controls"></div>
    </main>
    <script>
        const rounds = ${JSON.stringify(LESSON_ROUNDS)};
        const asyncTransitions = ${asyncTransitions ? 'true' : 'false'};
        let index = 0;
        // the AngularJS scope stub: detect-question reads scope.self.model
        const SELF = { model: { _currentQuestion: null, gameMode: 3 }, sectionData: { activityGroup: { isAutoMarked: true } } };
        window.angular = { element: el => ({
            scope: () => el && el.id === 'sa-navigation-controls'
                ? { self: { isCompositionRoot: true }, game: { model: SELF.model } } : { self: SELF },
            isolateScope: () => el && el.id === 'sa-navigation-controls' ? { self: { model: SELF.model } } : undefined,
        }) };

        const host = document.getElementById('slide-host');
        const exit = document.querySelector('.exit-button');

        function unmount() {
            host.innerHTML = '';
            document.getElementById('sa-navigation-controls').innerHTML = '';
            SELF.model._currentQuestion = null;
        }

        function render() {
            if (index >= rounds.length) {
                unmount();
                exit.hidden = false;
                return;
            }
            document.getElementById('sa-navigation-controls').innerHTML = '';
            const round = rounds[index];
            SELF.model._currentQuestion = {
                contentID: round.contentID,
                questionIndex: round.questionIndex,
                validAnswers: [],
                questionDef: {
                    Components: [{
                        ComponentTypeCode: 'MULTICHOICE_COMPONENT',
                        AllowMultiSelect: false,
                        Options: round.options.map(t => ({ TextTemplate: t, Correct: t === round.correct ? 'true' : 'false' })),
                    }],
                },
            };
            host.innerHTML = '';
            const group = document.createElement('div');
            group.id = 'question-container-group';
            group.innerHTML = '<p><span class="inline-paragraph"><span style="font-weight:bold">Select the correct definite article for the word in blue.</span></span></p>'
                + '<p><span class="inline-paragraph"><span style="color: rgb(0, 0, 255);">' + round.word + '</span></span></p>';
            const mc = document.createElement('div');
            mc.className = 'multi-choice-component v-group single-select';
            mc.setAttribute('role', 'radiogroup');
            round.options.forEach((text, i) => {
                const option = document.createElement('div');
                option.className = 'mcq-preview-option';
                option.setAttribute('role', 'option');
                option.innerHTML = '<div id="content-container"><div class="mcq-contents">'
                    + '<div id="button-group"><input id="check" type="radio" name="MultiChoice_1">'
                    + '<div id="render-group"><p><span class="inline-paragraph"><span>' + text + '</span></span></p></div></div>'
                    + '<div class="shortcut-key">' + (i + 1) + '</div></div></div>';
                option.addEventListener('click', () => { option.querySelector('input').checked = true; });
                mc.appendChild(option);
            });
            const submit = document.createElement('button');
            submit.textContent = 'Submit';
            const hiddenSubmit = document.createElement('button');
            hiddenSubmit.style.display = 'none';
            hiddenSubmit.textContent = 'Submit';
            const next = document.createElement('button');
            next.style.display = 'none';
            next.textContent = 'Next Question';
            submit.addEventListener('click', () => {
                const selected = [...host.querySelectorAll('.mcq-preview-option')]
                    .find(o => o.querySelector('input').checked);
                if (!selected) return;
                const chosen = selected.querySelector('#render-group').textContent.trim();
                if (chosen === rounds[index].correct) {
                    advance();
                } else {
                    submit.style.display = 'none';
                    next.textContent = '3 seconds';
                    next.style.display = '';
                    next.disabled = true;
                    const scheduleUnlock = window.__choiceScheduleUnlock || setTimeout;
                    scheduleUnlock(() => { next.disabled = false; next.textContent = 'Next Question'; }, 150);
                }
            });
            function advance() {
                index += 1;
                if (asyncTransitions && index < rounds.length) {
                    unmount();
                    setTimeout(render, 800);
                } else {
                    render();
                }
            }
            next.addEventListener('click', advance);
            host.appendChild(group);
            host.appendChild(mc);
            host.appendChild(hiddenSubmit);
            document.getElementById('sa-navigation-controls').append(submit, next);
        }
        render();
    </script>`);

// A Listening/Dictation task: .voice-speaker instead of question text (the
// #question-text span exists but is hidden and empty), the answer typed into
// the same input#answer-text, accepted answers in scope validAnswers.
// The self-test list context captured live on a Listening task 2026-10-30
// (contentSource.selectedActivity: unassigned vocabulary list).
const LIST_SELF_TEST_VALUE = { _taskID: null, _activityType: 1, _contentType: 1, _title: 'At the Doctor - some possible patient vocabulary' };

const AUDIO_ROUNDS = [
    { contentID: 173943, answer: 'Ho la febbre' },
    { contentID: 173944, answer: 'Sto bene' },
];

const audioPage = (mode = 2) => PAGE(`
    <main>
        <div id="ep-question-container" class="question-container">
            <div class="voice-speaker"><span id="question-text" style="display:none"></span></div>
            <input id="answer-text" autocomplete="off">
            <button class="exit-button" hidden onclick="location.href='/learning/dashboard'">Exit</button>
        </div>
    </main>
    <script>
        const rounds = ${JSON.stringify(AUDIO_ROUNDS)};
        let index = 0;
        // live-captured shape: list audio tasks ship no sectionData; the
        // self-test list context comes from contentSource.selectedActivity
        const SELF = { model: { _currentQuestion: null, contentSource: { selectedActivity: ${JSON.stringify(LIST_SELF_TEST_VALUE)} } } };
        window.angular = { element: () => ({ scope: () => ({ self: SELF }) }) };

        const speaker = document.querySelector('.voice-speaker');
        const box = document.getElementById('answer-text');
        const exit = document.querySelector('.exit-button');

        function render() {
            if (index >= rounds.length) {
                speaker.remove(); box.remove();
                exit.hidden = false;
                return;
            }
            SELF.model._currentQuestion = {
                contentID: rounds[index].contentID,
                questionIndex: index,
                validAnswers: [{ outputString: rounds[index].answer }],
                translationMode: ${mode},
            };
            box.value = '';
            box.focus();
        }

        box.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (box.value.trim() === rounds[index].answer) {
                index += 1;
                render();
            } else {
                const modal = document.createElement('div');
                modal.setAttribute('uib-modal-window', 'modal-window');
                modal.innerHTML = '<table class="modal-body">'
                    + '<tr><td id="question-field">audio:' + rounds[index].contentID + '</td></tr>'
                    + '<tr><td id="correct-answer-field">' + rounds[index].answer + '</td></tr></table>';
                document.body.appendChild(modal);
            }
        });
        render();
    </script>`);

// ---------------------------------------------------------------------------
// Adversarial regression routes (from the phase-2 review's repro shapes).
// /lesson-async: "Next Question" unmounts the slide immediately and remounts
// the next after 800ms of SPA latency - the outer loop must not mistake the
// gap (hidden exit button present in the DOM) for task completion.
// /audio-reject: the grader rejects every submission by clearing the box with
// NO modal and the same question staying - the loop must bound its
// submissions, not resubmit forever.
// ---------------------------------------------------------------------------

const lessonAsyncPage = lessonPage(true);

const audioRejectPage = (selectedActivity, sectionDataSnippet) => PAGE(`
    <main>
        <div id="ep-question-container" class="question-container">
            <div class="voice-speaker"><span id="question-text" style="display:none"></span></div>
            <input id="answer-text" autocomplete="off">
            <button class="exit-button" hidden onclick="location.href='/learning/dashboard'">Exit</button>
        </div>
    </main>
    <script>
        window.__submissions = [];
        const SELF = { model: { _currentQuestion: {
            contentID: 173943,
            questionIndex: 0,
            validAnswers: [{ outputString: 'Ho la febbre' }],
            translationMode: 2,
        }, contentSource: { selectedActivity: ${JSON.stringify(selectedActivity)} } }${sectionDataSnippet || ''} };
        window.angular = { element: () => ({ scope: () => ({ self: SELF }) }) };
        const box = document.getElementById('answer-text');
        box.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            window.__submissions.push({ value: box.value, at: Date.now() });
            // rejection UX variant: box cleared, NO modal, same question stays
            box.value = '';
        });
        box.focus();
    </script>`);

function createServer() {
    return http.createServer((req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        const send = (html) => {
            res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
            res.end(html);
        };
        // index.js lands on /app/login and expects the form to be on the expected host.
        if (url.pathname === '/app/login' || url.pathname === '/login') return send(loginPage);
        if (url.pathname === '/learning/dashboard') return send(dashboardPage);
        if (url.pathname === '/task') return send(starterPage);
        if (url.pathname === '/task/play') {
            const start = Number.parseInt(url.searchParams.get('start') || '0', 10);
            return send(taskPage(start));
        }
        if (url.pathname === '/lesson') return send(lessonPage(false));
        if (url.pathname === '/lesson-async') return send(lessonAsyncPage);
        if (url.pathname === '/audio') return send(audioPage(2));
        if (url.pathname === '/dictation') return send(audioPage(3));
        if (url.pathname === '/audio-reject') return send(audioRejectPage(LIST_SELF_TEST_VALUE));
        // negative gate fixture: the same audio task but ASSIGNED (_taskID set)
        // - the self-test list signal is absent, so the run must stop unanswered
        if (url.pathname === '/audio-assigned') return send(audioRejectPage({ ...LIST_SELF_TEST_VALUE, _taskID: 81234567 }));
        // negative gate fixtures: sectionData PRESENT but wrong (empty object,
        // null, or a number) on a list-shaped task - ONLY undefined is the
        // captured absent shape, so every one of these must stop unanswered
        if (url.pathname === '/audio-malformed') {
            const sd = url.searchParams.get('sd') || 'object';
            const snippet = sd === 'null' ? ', sectionData: null' : sd === 'number' ? ', sectionData: 0' : ', sectionData: {}';
            return send(audioRejectPage(LIST_SELF_TEST_VALUE, snippet));
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    });
}

module.exports = { createServer, WORDS, LESSON_ROUNDS, AUDIO_ROUNDS };

if (require.main === module) {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
        console.log(`EP mock listening on ${server.address().port}`);
        console.log(`  http://127.0.0.1:${server.address().port}/app/login`);
    });
}