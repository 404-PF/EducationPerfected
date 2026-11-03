// Same-process controls shared by terminal and browser hotkeys. No listener or
// remotely reachable control endpoint is opened by this module.
function createRunControls({ run, requestStop, setMode, refresh, inspectChoice, close }) {
    let active = null;
    let stopping = null;
    let closing = false;
    let changing = false;
    let update = null;
    let closePromise = null;
    let closed = false;
    let mode = 'auto';
    let failure = false;
    let completed = false;
    let restartVersion = 0;
    const status = () => ({
        state: closed ? 'closed' : closing ? 'closing' : changing ? 'updating' : stopping ? 'stopping' : active ? 'running' : failure ? 'error' : completed ? 'completed' : 'stopped',
        mode,
    });
    const start = () => {
        if (closed || closing || changing || stopping || active) return status();
        failure = false;
        completed = false;
        // Install the handle before invoking asynchronous work, including run
        // callbacks that throw synchronously.
        const current = Promise.resolve().then(() => {
            if (stopping || closing || closed) return;
            return run();
        });
        active = current;
        current.then(result => { completed = result?.reason === 'completed'; }, () => { failure = true; }).finally(() => {
            if (active === current) active = null;
        });
        return status();
    };
    const drain = () => {
        if (stopping) return stopping;
        const current = active;
        if (!current) return Promise.resolve(status());
        requestStop();
        stopping = current.catch(() => {}).then(() => {
            if (active === current) active = null;
            stopping = null;
            return status();
        });
        return stopping;
    };
    // Explicit stop/close supersedes a restart queued while old cleanup drains.
    const stop = () => { restartVersion += 1; return drain(); };
    return {
        status, start, stop,
        async restartAfterDrain() {
            if (closed || closing || changing || stopping || !active) return status();
            const version = ++restartVersion;
            await drain();
            if (version === restartVersion) start();
            return status();
        },
        browserClosed() {
            restartVersion += 1;
            closed = true;
            requestStop();
            return status();
        },
        async mode(value) {
            if (!['auto', 'semi'].includes(value)) throw new Error('Mode must be auto or semi.');
            if (active || stopping || changing || closing || closed) throw new Error('Stop the run before changing mode.');
            changing = true;
            try {
                update = Promise.resolve().then(() => setMode(value));
                await update;
                mode = value;
            } finally { changing = false; update = null; }
            return status();
        },
        async inspectChoice() {
            if (active || stopping || changing || closing || closed) throw new Error('Stop the run before inspecting choice metadata.');
            changing = true;
            try {
                update = Promise.resolve().then(() => inspectChoice());
                return await update;
            } finally { changing = false; update = null; }
        },
        async refresh() {
            if (active || stopping || changing || closing || closed) throw new Error('Stop the run before refreshing words.');
            changing = true;
            try { update = Promise.resolve().then(refresh); await update; } finally { changing = false; update = null; }
            return status();
        },
        close() {
            if (closed) return stop();
            if (closePromise) return closePromise;
            closing = true;
            closePromise = (async () => {
                try {
                    if (update) await update.catch(() => {});
                    await stop();
                    await close();
                    closed = true;
                    return status();
                } finally { closing = false; closePromise = null; }
            })();
            return closePromise;
        },
    };
}
module.exports = { createRunControls };
