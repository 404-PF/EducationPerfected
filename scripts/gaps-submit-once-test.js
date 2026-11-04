const { testGapsValidation } = require('./gaps-validation-fixture-test');
testGapsValidation(true).catch(e => { console.error(e); process.exitCode = 1; });
