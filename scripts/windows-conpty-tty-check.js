// Fixed zero-credential ConPTY capability child, never imports product/native code.
if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== 'function') process.exit(1);
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
