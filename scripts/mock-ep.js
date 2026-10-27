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
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
    });
}

module.exports = { createServer, WORDS };

if (require.main === module) {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
        console.log(`EP mock listening on ${server.address().port}`);
        console.log(`  http://127.0.0.1:${server.address().port}/app/login`);
    });
}