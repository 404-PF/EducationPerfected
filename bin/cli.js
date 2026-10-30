#!/usr/bin/env node
const readline = require('node:readline');
const { launchProgram, promptCredentials } = require('../index');
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
async function credentialCommand(command, { store, prompt = promptCredentials, output = process.stdout } = {}) {
    store ||= require('../lib/credential-store').createCredentialStore();
    if (command === '--forget-credentials') {
        const removed = await store.remove();
        output.write(removed ? 'Saved login removed from the OS credential store.\n' : 'No saved login was found.\n');
        return;
    }
    output.write('Save a login in your OS credential store. Input is hidden; nothing is saved in this folder.\n');
    // Setup has no browser signal owner. Restore raw input even on SIGTERM.
    const interrupted = signal => {
        if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
        process.exit(signal === 'SIGINT' ? 130 : 143);
    };
    const onInt = () => interrupted('SIGINT'), onTerm = () => interrupted('SIGTERM');
    let record;
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    try { record = await prompt(); } finally {
        process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
    }
    if (!record) { output.write('Setup cancelled; no login saved.\n'); return; }
    await store.save(record);
    output.write('Login saved in the OS credential store. Run the CLI to sign in.\n');
}
module.exports = { runCli, credentialCommand };
if (require.main === module) {
    if (process.argv.includes('--setup') || process.argv.includes('--forget-credentials')) {
        credentialCommand(process.argv.includes('--setup') ? '--setup' : '--forget-credentials').catch(() => { console.error('Credential setup failed. Unlock the OS credential store and try again; no plaintext fallback is used.'); process.exitCode = 1; });
    } else if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('EducationPerfected interactive CLI\nUsage: node bin/cli.js [--setup | --forget-credentials]\nCommands: start, stop, status, mode auto, mode semi, refresh, quit\nDoes not start answering until start is entered.');
    } else runCli().catch(error => { console.error(diagnostic(error, 'EducationPerfected CLI')); process.exitCode = 1; });
}
