// Same-process controls shared by terminal and browser hotkeys. No listener or
// remotely reachable control endpoint is opened by this module.
function createRunControls({ run, requestStop, setMode, refresh, close }) {
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
    const stop = () => {
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
    return {
        status, start, stop,
        browserClosed() {
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
