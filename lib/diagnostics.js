// Convert errors to fixed diagnostic categories. Never print arbitrary messages,
// stacks, URLs, paths, page text or credential-bearing process arguments.
function diagnostic(error, action = 'Operation') {
    const code = ['ENOENT', 'EACCES', 'EPERM', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error?.code) ? error.code : null;
    const name = error?.name === 'TimeoutError' ? 'timeout' : null;
    const message = typeof error?.message === 'string' ? error.message : '';
    const hint = code === 'ENOENT' || /could not find Chrome|Browser was not found/i.test(message)
        ? 'A required browser or runtime file is missing.'
        : /No usable sandbox|Failed to move to new namespace|SUID sandbox helper binary was found, but is not configured correctly/i.test(message) ? 'The browser sandbox was blocked by operating-system policy. Use a supported system or ask an administrator to review sandbox prerequisites; do not disable the browser sandbox.'
        : code === 'EACCES' || code === 'EPERM' ? 'The operating system denied access.'
        : name || code === 'ETIMEDOUT' ? 'The browser or sign-in step timed out.'
        : code === 'ECONNREFUSED' ? 'The browser connection was refused.'
        : /Target closed|Session closed|browser has disconnected/i.test(message) ? 'The browser connection closed.'
        : (/Failed to launch|Missing X server/i.test(message) || /\bDISPLAY\b/.test(message)) ? 'The browser could not launch; check display and system browser dependencies.'
        : 'The operation failed; check the browser, sign-in state and installed runtime.';
    return `${action} failed${code ? ` (${code})` : ''}: ${hint}`;
}
module.exports = { diagnostic };
