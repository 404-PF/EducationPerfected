#!/usr/bin/env node
const readline = require('node:readline');
const { launchProgram } = require('../index');
const { diagnostic } = require('../lib/diagnostics');

async function runCli({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}) {
    output.write('Opening EducationPerfected. Finish sign-in in the browser.\n');
    const controls = await launch();
    const terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    output.write('Commands: start, stop, status, mode auto, mode semi, refresh, quit\n');
    const print = () => output.write(JSON.stringify(controls.status()) + '\n');
    let quitPromise = null;
    const quit = () => {
        if (!quitPromise) quitPromise = controls.close().then(() => terminal.close()).catch(error => { quitPromise = null; throw error; });
        return quitPromise;
    };
    const onSignal = () => { quit().catch(error => output.write(diagnostic(error, 'Shutdown') + '\n')); };
    terminal.on('SIGINT', onSignal);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    print();
    try {
        for await (const line of terminal) {
            const command = line.trim();
            try {
                if (command === 'start') controls.start();
                else if (command === 'stop') await controls.stop();
                else if (command === 'status' || command === '') { /* print below */ }
                else if (command === 'mode auto' || command === 'mode semi') await controls.mode(command.slice(5));
                else if (command === 'refresh') await controls.refresh();
                else if (command === 'quit' || command === 'exit') { await quit(); print(); break; }
                else { output.write('Unknown command. Use start, stop, status, mode auto, mode semi, refresh or quit.\n'); continue; }
                print();
            } catch {
                output.write('Command failed. Stop the run before mode or word-list changes; inspect the browser if a control failed.\n');
            }
        }
    } finally {
        try { await quit(); } finally {
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
        }
    }
}
module.exports = { runCli };
if (require.main === module) {
    if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('EducationPerfected interactive CLI\nUsage: node bin/cli.js\nCommands: start, stop, status, mode auto, mode semi, refresh, quit\nDoes not start answering until start is entered.');
    } else runCli().catch(error => { console.error(diagnostic(error, 'EducationPerfected CLI')); process.exitCode = 1; });
}
