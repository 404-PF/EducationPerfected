// Fixed zero-credential ConPTY capability child, never imports product/native code.
const inputTTY = Boolean(process.stdin.isTTY), outputTTY = Boolean(process.stdout.isTTY), rawMode = typeof process.stdin.setRawMode === 'function';
process.stdout.write('CONPTY_CAPABILITY stdinTTY='+Number(inputTTY)+' stdoutTTY='+Number(outputTTY)+' rawMode='+Number(rawMode)+'\n');
if (!inputTTY || !outputTTY || !rawMode) process.exit(1);
process.stdin.setRawMode(true);
process.stdout.write('CONPTY_INPUT_READY\n');
let input = '';
process.stdin.on('data', data => {
    input += data.toString();
    if (!'inert-key\r'.startsWith(input)) process.exit(1);
    if (input === 'inert-key\r') {
        process.stdin.setRawMode(false);
        process.stdout.write('CONPTY_TTY_RAW_INPUT_OK\n', () => process.exit(0));
    }
});
setTimeout(() => process.exit(1), 8000).unref();
