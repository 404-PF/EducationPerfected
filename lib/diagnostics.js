// Convert errors to fixed diagnostic categories. Never print arbitrary messages,
// stacks, URLs, paths, page text or credential-bearing process arguments.
function diagnostic(error, action = 'Operation') {
    const code = ['ENOENT', 'EACCES', 'EPERM', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error?.code) ? error.code : null;
    const name = error?.name === 'TimeoutError' ? 'timeout' : null;
    const message = typeof error?.message === 'string' ? error.message : '';
    const hint = code === 'ENOENT' || /could not find Chrome|Browser was not found/i.test(message)
        ? 'A required browser or runtime file is missing.'
        : code === 'EACCES' || code === 'EPERM' ? 'The operating system denied access.'
        : name || code === 'ETIMEDOUT' ? 'The browser or sign-in step timed out.'
        : code === 'ECONNREFUSED' ? 'The browser connection was refused.'
        : /Target closed|Session closed|browser has disconnected/i.test(message) ? 'The browser connection closed.'
        : /Failed to launch|Missing X server|DISPLAY/i.test(message) ? 'The browser could not launch; check display and system browser dependencies.'
        : 'The operation failed; check the browser, sign-in state and installed runtime.';
    return `${action} failed${code ? ` (${code})` : ''}: ${hint}`;
}
module.exports = { diagnostic };
