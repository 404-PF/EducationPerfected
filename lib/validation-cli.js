// Shared terminal driver for exclusive one-shot validation sessions.
const readline = require('node:readline');
async function runValidationCli({ input = process.stdin, output = process.stdout, launch, launchOptions, action, warning }) {
    output.write(warning + '\n');
    const controls = await launch(launchOptions);
    await controls.mode('semi');
    const terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    let attempted = false, closing;
    const close = () => {
        closing ||= controls.close().then(() => terminal.close()).catch(error => { closing = undefined; throw error; });
        return closing;
    };
    const signal = () => { close().catch(() => { output.write('Validation shutdown failed; inspect the browser.\n'); }); };
    terminal.on('SIGINT', signal);
    for (const name of ['SIGINT','SIGTERM','SIGHUP']) process.on(name, signal);
    output.write('Stopped. Open the approved question. Commands: ' + action + ', stop, status, quit\n');
    try {
        for await (const line of terminal) {
            try {
                const command = line.trim();
                if (command === action) {
                    if (attempted) output.write('Attempt already consumed. No retry in this session.\n');
                    else { attempted = true; controls.start(); }
                } else if (command === 'stop') await controls.stop();
                else if (command === 'quit') { await close(); break; }
                else if (command !== 'status' && command !== '') output.write('Use ' + action + ', stop, status or quit.\n');
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
