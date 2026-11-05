const { testGapsValidation } = require('./gaps-validation-fixture-test');
(async () => { await testGapsValidation(false, true); await testGapsValidation(true, true); })().catch(e => { console.error(e); process.exitCode = 1; });
