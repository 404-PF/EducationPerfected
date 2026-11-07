// Shared terminal driver for exclusive one-shot validation sessions.
const readline = require('node:readline');
async function runValidationCli({ input = process.stdin, output = process.stdout, launch, launchOptions, action, warning, readOnlyInspect = false, mode = 'semi' }) {
    output.write(warning + '\n');
    const controls = await launch(launchOptions);
    let attempted = false, closing, terminal, shutdownRequested = false;
    const close = () => {
        closing ||= controls.close().then(() => terminal?.close()).catch(error => { closing = undefined; throw error; });
        return closing;
    };
    const signal = () => { shutdownRequested = true; terminal?.close(); close().catch(() => { output.write('Validation shutdown failed; inspect the browser.\n'); }); };
    for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.on(name, signal);
    try {
        // Own signals before post-launch setup can yield. A signal or setup
        // failure must close the launched browser before returning.
        await controls.mode(mode);
        if (shutdownRequested) { await close(); return; }
        terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
        terminal.on('SIGINT', signal);
        output.write('Stopped. Open the approved question. Commands: ' + action + (readOnlyInspect ? ', inspect' : '') + ', stop, status, quit\n');
        for await (const line of terminal) {
            if (shutdownRequested) break;
            try {
                const command = line.trim();
                if (command === 'inspect' && readOnlyInspect) {
                    if (controls.status().state !== 'stopped') output.write('Stop before read-only inspection.\n');
                    else output.write('EP_DROPDOWN_INSPECT ' + JSON.stringify(await controls.inspectDropdowns()) + '\n');
                } else if (command === action) {
                    if (attempted) output.write('Attempt already consumed. No retry in this session.\n');
                    else { attempted = true; controls.start(); }
                } else if (command === 'stop') await controls.stop();
                else if (command === 'quit') { await close(); break; }
                else if (command !== 'status' && command !== '') output.write('Use ' + action + (readOnlyInspect ? ', inspect' : '') + ', stop, status or quit.\n');
                output.write(JSON.stringify(controls.status()) + '\n');
            } catch { output.write('Validation control failed. Stop and inspect the browser; do not retry.\n'); }
        }
    } finally {
        try { await close(); } finally {
            for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.removeListener(name, signal);
        }
    }
}
module.exports = { runValidationCli };
