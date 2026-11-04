const { testGapsValidation } = require('./gaps-validation-fixture-test');
testGapsValidation(false).catch(e => { console.error(e); process.exitCode = 1; });
