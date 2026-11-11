// Stop immediately after Submit, before the handler can poll the modal.
process.argv.push('--selection-modal');
require('./completion-stop-test');
