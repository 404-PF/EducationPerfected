// Test-only model of the side-effect edges mapped in research/assessment-lifecycle.md.
// This is NOT EP code, a server simulator, or evidence of EP grading behavior.
// No real timer, network, credential, task ID or answer content is needed.
function installAssessmentLifecycle() {
    const calls = [];
    let queued = 0;
    const record = name => calls.push(name);
    const persistCurrent = () => { record('mark-current'); record('queue-question'); queued++; };
    const model = {
        calls,
        autosave() { record('read-current'); persistCurrent(); },
        navigate() { record('submit-current'); persistCurrent(); record('queue-navigation'); queued++; },
        flag() { record('flag-current'); model.autosave(); },
        focus() { record('queue-focus'); queued++; },
        earlyExit() { record('save-exit'); record('submit-current'); persistCurrent(); },
        complete(exitUI = true) {
            record('mark-attempt-submitting'); record('submit-current'); persistCurrent();
            record('request-completion');
            if (exitUI) record('exit-ui');
        },
        freeze() { record('teacher-lock'); model.earlyExit(); },
        // onCloseEvent awaits submitAssessment(false,false), including
        // completion persistence, then performs its own teacher-ended finish.
        forceSubmit() { model.complete(false); record('teacher-ended'); record('exit-ui'); },
        expire() { record('time-expired'); model.complete(); },
        flush() { if (queued) { record('flush-queued'); queued = 0; } },
        get pending() { return queued; },
    };
    window.assessmentLifecycle = model;
    const shell = document.querySelector('game-assessment-navigation-controls');
    shell.id = 'lifecycle-controls';
    shell.querySelector('button').onclick = () => model.complete();
    document.querySelector('#answer-text').addEventListener('input', () => model.autosave());
    document.addEventListener('keydown', event => { if (event.key === 'ArrowRight') model.navigate(); });
}
module.exports = { installAssessmentLifecycle };
