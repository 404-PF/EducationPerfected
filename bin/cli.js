#!/usr/bin/env node
const readline = require('node:readline');
const { launchProgram, promptCredentials } = require('../index');
const { diagnostic } = require('../lib/diagnostics');

async function runCli({ input = process.stdin, output = process.stdout, launch = launchProgram, onBrowserClosed = () => {} } = {}) {
    output.write('Opening EducationPerfected. Finish sign-in in the browser.\n');
    let terminal = null, controls = null, pendingApproval = null, quitPromise = null;
    const quit = () => {
        if (pendingApproval) { pendingApproval.resolve(false); pendingApproval = null; }
        if (!quitPromise && controls) quitPromise = controls.close().then(() => terminal.close()).catch(error => { quitPromise = null; throw error; });
        return quitPromise || Promise.resolve();
    };
    // A manually closed browser ends the session: drain controls and exit instead of idling.
    const browserGone = () => {
        if (quitPromise || !terminal) return;
        output.write('Browser closed; exiting.\n');
        quit().catch(error => output.write(diagnostic(error, 'Shutdown') + '\n'));
    };
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
    controls = await launch({ onBrowserClosed, onBrowserDisconnected: browserGone, dropdownSubmitApprover: requestDropdownSubmitApproval, numberBoxSubmitApprover: requestNumberBoxSubmitApproval });
    terminal = readline.createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    output.write('Commands: start, stop, status, mode auto, mode semi, refresh, inspect-self-mark, quit\n');
    const print = () => output.write(JSON.stringify(controls.status()) + '\n');
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
    output.write('Save a login in your OS credential store; nothing is saved in this folder.\n');
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
    const {parseCommand,helpText}=require('../lib/cli-command');
    const parsed=parseCommand(process.argv.slice(2));
    if(parsed.error){console.error(parsed.error);process.exitCode=1;}
    else if(parsed.command==='help')console.log(helpText());
    else if(parsed.command==='version')console.log(require('../package.json').version);
    else if(['setup','check-credentials','forget-credentials'].includes(parsed.command)){
        (async()=>{
            if(parsed.command==='setup'){
                await require('../packaging/download-browser').ensureBrowser();
                console.log('Browser ready. Saving a login is optional; leave email empty to skip.');
            }
            await credentialCommand('--'+parsed.command);
        })().catch(()=>{console.error('Setup/credential command failed; no plaintext fallback.');process.exitCode=1;});
    }else if(parsed.command==='run')runCli().catch(error=>{console.error(diagnostic(error,'EducationPerfected CLI'));process.exitCode=1;});
    else {console.error('This command is available in the packaged app only.');process.exitCode=1;}
}
