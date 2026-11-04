// Reuse the same real-program boot/stop harness; preserve the standalone entry point.
process.argv.push('--gaps');
require('./completion-stop-test');
