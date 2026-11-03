// Zero-credential Node startup control; no TTY guard or product import.
process.stdout.write('CONPTY_NODE_CONTROL_OK\n', () => { process.exitCode = 8; });
