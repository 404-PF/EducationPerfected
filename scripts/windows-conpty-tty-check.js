// Fixed zero-credential TTY checker. Natural exit preserves pending stdout writes.
const inputTTY = Boolean(process.stdin.isTTY), outputTTY = Boolean(process.stdout.isTTY), rawMode = typeof process.stdin.setRawMode === 'function';
process.stdout.write('CONPTY_CAPABILITY stdinTTY='+Number(inputTTY)+' stdoutTTY='+Number(outputTTY)+' rawMode='+Number(rawMode)+'\n', () => {
    if (!inputTTY || !outputTTY || !rawMode) { process.exitCode = 1; return; }
    process.stdin.setRawMode(true);
    process.stdout.write('CONPTY_INPUT_READY\n');
    let input = '';
    const timer = setTimeout(() => finish(3), 8000);
    const finish = code => {
        clearTimeout(timer);
        process.stdin.setRawMode(false);
        process.stdin.removeAllListeners('data');
        process.stdin.pause();
        process.exitCode = code;
    };
    process.stdin.on('data', data => {
        input += data.toString();
        if (!'inert-key\r'.startsWith(input)) { finish(2); return; }
        if (input === 'inert-key\r') process.stdout.write('CONPTY_TTY_RAW_INPUT_OK\n', () => finish(0));
    });
});
