#!/usr/bin/env node
const readline = require('node:readline');
const { launchProgram, promptCredentials } = require('../index');
const { diagnostic } = require('../lib/diagnostics');

async function runCli({ input = process.stdin, output = process.stdout, launch = launchProgram, onBrowserClosed = () => {} } = {}) {
    output.write('Opening EducationPerfected. Finish sign-in in the browser.\n');
    let terminal = null, pendingApproval = null, quitPromise = null;
    const requestSubmitApproval = (approval, label, detail, onCancel) => new Promise(resolve => {
        if (!terminal || pendingApproval || quitPromise) { resolve(false); return; }
        const request = { approval, resolve: null, label };
        let unregisterCancel = null;
        const finish = approved => {
            unregisterCancel?.();
            unregisterCancel = null;
            if (pendingApproval === request) pendingApproval = null;
            resolve(approved);
        };
        request.resolve = finish;
        pendingApproval = request;
        const cancel = () => {
            if (pendingApproval !== request) return;
            output.write(`${label} approval cancelled; stopping without Submit.\n`);
            finish(false);
        };
        unregisterCancel = typeof onCancel === 'function' ? onCancel(cancel) : null;
        output.write(`${label} approval required for ${approval.key} (${detail}). Confirm this is the named question visible in the browser. Type yes to submit this question once; anything else stops without Submit.\n`);
    });
    const requestDropdownSubmitApproval = (approval, onCancel) => requestSubmitApproval(approval, 'Dropdown Submit', `${approval.dropdownCount} dropdown`, onCancel);
    const requestNumberBoxSubmitApproval = (approval, onCancel) => requestSubmitApproval(approval, 'Number-box Submit', `${approval.boxCount} boxes`, onCancel);
    const controls = await launch({ onBrowserClosed, dropdownSubmitApprover: requestDropdownSubmitApproval, numberBoxSubmitApprover: requestNumberBoxSubmitApproval });
    terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    output.write('Commands: start, stop, status, mode auto, mode semi, refresh, inspect-self-mark, quit\n');
    const print = () => output.write(JSON.stringify(controls.status()) + '\n');
    const quit = () => {
        if (pendingApproval) { pendingApproval.resolve(false); pendingApproval = null; }
        if (!quitPromise) quitPromise = controls.close().then(() => terminal.close()).catch(error => { quitPromise = null; throw error; });
        return quitPromise;
    };
    const onSignal = () => { quit().catch(error => output.write(diagnostic(error, 'Shutdown') + '\n')); };
    terminal.on('SIGINT', onSignal);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('SIGHUP', onSignal);
    print();
    try {
        for await (const line of terminal) {
            const command = line.trim();
            if (pendingApproval) {
                const request = pendingApproval;
                pendingApproval = null;
                const approved = command === 'yes';
                request.resolve(approved);
                output.write(approved ? `${request.label} approved for ${request.approval.key} only.\n` : `${request.label} not approved; stopping without Submit.\n`);
                if (command === 'quit' || command === 'exit') { await quit(); print(); break; }
                continue;
            }
            try {
                if (command === 'start') controls.start();
                else if (command === 'stop') await controls.stop();
                else if (command === 'status' || command === '') { /* print below */ }
                else if (command === 'mode auto' || command === 'mode semi') await controls.mode(command.slice(5));
                else if (command === 'inspect-self-mark') output.write('EP_SELF_MARK_INSPECT ' + JSON.stringify(await controls.inspect()) + '\n');
                else if (command === 'refresh') await controls.refresh();
                else if (command === 'quit' || command === 'exit') { await quit(); print(); break; }
                else { output.write('Unknown command. Use start, stop, status, mode auto, mode semi, refresh, inspect-self-mark or quit.\n'); continue; }
                print();
            } catch {
                output.write(command === 'inspect-self-mark'
                    ? 'Inspection unavailable. Stop answering and wait for pending controls before read-only inspection.\n'
                    : 'Command failed. Stop the run before mode or word-list changes; inspect the browser if a control failed.\n');
            }
        }
    } finally {
        try { await quit(); } finally {
            process.removeListener('SIGINT', onSignal);
            process.removeListener('SIGTERM', onSignal);
            process.removeListener('SIGHUP', onSignal);
        }
    }
}
async function credentialCommand(command, { store, prompt = promptCredentials, output = process.stdout } = {}) {
    store ||= require('../lib/credential-store').createCredentialStore();
    if (command === '--check-credentials') {
        const record = await store.read();
        output.write(record ? 'Saved login is available and its record is valid.\n' : 'No saved login was found.\n');
        return;
    }
    if (command === '--forget-credentials') {
        const removed = await store.remove();
        output.write(removed ? 'Saved login removed from the OS credential store.\n' : 'No saved login was found.\n');
        return;
    }
    output.write('Save a login in your OS credential store. Input is hidden; nothing is saved in this folder.\n');
    // Setup has no browser signal owner. Restore raw input even on SIGTERM.
    const interrupted = signal => {
        if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false);
        process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143);
    };
    const onInt = () => interrupted('SIGINT'), onTerm = () => interrupted('SIGTERM'), onHup = () => interrupted('SIGHUP');
    let record;
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm); process.on('SIGHUP', onHup);
    try { record = await prompt(undefined, { setup: true }); } finally {
        process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); process.removeListener('SIGHUP', onHup);
    }
    if (!record) { output.write('Setup cancelled; no login saved.\n'); return; }
    await store.save(record);
    output.write('Login saved in the OS credential store. Run the CLI to sign in.\n');
}
module.exports = { runCli, credentialCommand };
if (require.main === module) {
    if (['--setup','--forget-credentials','--check-credentials'].some(command => process.argv.includes(command))) {
        const commands = ['--setup','--forget-credentials','--check-credentials'].filter(value => process.argv.includes(value));
        if (commands.length > 1) { console.error('Choose only one credential command.'); process.exitCode = 1; }
        else {
        credentialCommand(commands[0]).catch(() => { console.error('Credential command failed. Unlock the OS credential store or run --setup to replace an invalid saved record; no plaintext fallback is used.'); process.exitCode = 1; });
        }
    } else if (process.argv.includes('--help') || process.argv.includes('-h')) {
        console.log('EducationPerfected interactive CLI\nUsage: node bin/cli.js [--setup | --forget-credentials | --check-credentials]\nCommands: start, stop, status, mode auto, mode semi, refresh, inspect-self-mark, quit\nDoes not start answering until start is entered.');
    } else runCli().catch(error => { console.error(diagnostic(error, 'EducationPerfected CLI')); process.exitCode = 1; });
}
