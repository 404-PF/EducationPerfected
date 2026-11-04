#!/usr/bin/env node
// Separate from the ordinary CLI: one consumed attempt, no answer loop.
const readline = require('node:readline');
const { launchProgram } = require('../index');
async function runSubmitValidation({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}) {
    output.write('One-question gaps submission validation. Fills then clicks Submit once; may record results or points. EP may advance automatically. Never clicks Next or answers again.\n');
    const controls = await launch({ gapsSubmitOnce: true });
    await controls.mode('auto');
    const terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    let attempted = false, closing;
    const close = () => {
        closing ||= controls.close().then(() => terminal.close());
        return closing;
    };
    const signal = () => { close().catch(() => { output.write('Validation shutdown failed; inspect the browser.\n'); }); };
    terminal.on('SIGINT', signal);
    for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.on(name, signal);
    output.write('Stopped. Open the approved fresh empty question. Commands: submit once, stop, status, quit\n');
    try {
        for await (const line of terminal) {
            try {
                const command = line.trim();
                if (command === 'submit once') {
                    if (attempted) output.write('Attempt already consumed. No retry in this session.\n');
                    else { attempted = true; controls.start(); }
                } else if (command === 'stop') await controls.stop();
                else if (command === 'quit') { await close(); break; }
                else if (command !== 'status' && command !== '') output.write('Use submit once, stop, status or quit.\n');
                output.write(JSON.stringify(controls.status()) + '\n');
            } catch { output.write('Validation control failed. Stop and inspect the browser; do not retry.\n'); }
        }
    } finally {
        try { await close(); } finally {
            for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.removeListener(name, signal);
        }
    }
}
module.exports = { runSubmitValidation };
if (require.main === module) runSubmitValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
