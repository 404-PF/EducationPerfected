#!/usr/bin/env node
const { runGapsValidation } = require('../lib/gaps-validation-cli');
const runSubmitValidation = options => runGapsValidation(options, true);
module.exports = { runSubmitValidation };
if (require.main === module) runSubmitValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
