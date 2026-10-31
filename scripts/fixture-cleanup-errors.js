// Test harness only: finish every cleanup step without replacing a primary error.
async function finishFixtureCleanup(primaryError, steps, report = console.error) {
 let cleanupError, cleanupFailed=false;
 for (const step of steps) {
  try { await step(); } catch (error) {
   if (!cleanupFailed) cleanupError=error;
   cleanupFailed=true;
   report('Fixture cleanup also failed ('+(error?.code || error?.name || 'unknown')+').');
  }
 }
 if (!primaryError && cleanupFailed) throw cleanupError;
}
module.exports = { finishFixtureCleanup };
