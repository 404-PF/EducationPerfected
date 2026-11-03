// Test wait policy only. Fixed metadata avoids leaking child/browser output.
const { performance } = require('node:perf_hooks');
async function waitForPackagedCheckpoint(predicate, { child, failure = () => null, name, milliseconds = 20000, now = () => performance.now(), pause = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
 const start = now();
 while (!predicate()) {
  const error = failure();
  if (error) throw error;
  const exited = child.exitCode !== null || child.signalCode !== null;
  const elapsedMs = Math.floor(now() - start);
  if (exited || elapsedMs >= milliseconds) {
   const detail = { checkpoint: name, elapsedMs, budgetMs: milliseconds, outcome: exited ? 'child-exit' : 'timeout', childExited: exited,
    childExitCode: Number.isInteger(child.exitCode) ? child.exitCode : null, childSignalled: child.signalCode !== null };
   const error = new Error('Packaged checkpoint failed: ' + JSON.stringify(detail));
   error.code = 'EP_FIXTURE_CHECKPOINT'; throw error;
  }
  await pause(30);
 }
 return { checkpoint: name, outcome: 'arrived', elapsedMs: Math.floor(now() - start), budgetMs: milliseconds };
}
module.exports = { waitForPackagedCheckpoint };
