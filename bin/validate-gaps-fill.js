#!/usr/bin/env node
const { launchProgram } = require('../index');
const { runValidationCli } = require('../lib/validation-cli');
function runFillValidation({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}) {
    return runValidationCli({ input, output, launch, launchOptions: { gapsFillOnly: true }, action: 'fill once', warning: 'One-question gaps validation. Filling may save a draft. Never submits or clicks Next.' });
}
module.exports = { runFillValidation };
if (require.main === module) runFillValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
