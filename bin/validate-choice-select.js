#!/usr/bin/env node
// Separate from the ordinary CLI: one consumed attempt, no answer loop.
const readline = require('node:readline');
const { launchProgram } = require('../index');
async function runChoiceValidation({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}) {
    output.write('One-question choice validation. Selection changes EP state and may be saved or graded by EP. No Submit or Next is clicked.\n');
    const controls = await launch({ choiceSelectOnly: true });
    await controls.mode('semi');
    const terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    let attempted = false, closing;
    const close = () => {
        closing ||= controls.close().then(() => terminal.close());
        return closing;
    };
    const signal = () => { close().catch(() => { output.write('Validation shutdown failed; inspect the browser.\n'); }); };
    terminal.on('SIGINT', signal);
    for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.on(name, signal);
    output.write('Stopped. Open the approved question. Commands: select once, stop, status, quit\n');
    try {
        for await (const line of terminal) {
            try {
                const command = line.trim();
                if (command === 'select once') {
                    if (attempted) output.write('Attempt already consumed. No retry in this session.\n');
                    else { attempted = true; controls.start(); }
                } else if (command === 'stop') await controls.stop();
                else if (command === 'quit') { await close(); break; }
                else if (command !== 'status' && command !== '') output.write('Use select once, stop, status or quit.\n');
                output.write(JSON.stringify(controls.status()) + '\n');
            } catch { output.write('Validation control failed. Stop and inspect the browser; do not retry.\n'); }
        }
    } finally {
        try { await close(); } finally {
            for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.removeListener(name, signal);
        }
    }
}
module.exports = { runChoiceValidation };
if (require.main === module) runChoiceValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
