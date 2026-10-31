// Test harness only: finish every cleanup step without replacing a primary error.
async function finishFixtureCleanup(primaryError, steps, report = console.error) {
 let cleanupError;
 for (const step of steps) {
  try { await step(); } catch (error) {
   cleanupError ||= error;
   report('Fixture cleanup also failed ('+(error.code || error.name || 'unknown')+').');
  }
 }
 if (!primaryError && cleanupError) throw cleanupError;
}
module.exports = { finishFixtureCleanup };
