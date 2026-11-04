#!/usr/bin/env node
const { runGapsValidation } = require('../lib/gaps-validation-cli');
const runFillValidation = options => runGapsValidation(options, false);
module.exports = { runFillValidation };
if (require.main === module) runFillValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
