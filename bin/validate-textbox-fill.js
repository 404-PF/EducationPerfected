#!/usr/bin/env node
const { launchProgram } = require('../index');
const { runValidationCli } = require('../lib/validation-cli');
function runTextboxValidation({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}) {
    return runValidationCli({ input, output, launch, launchOptions: { textboxFillOnly: true }, action: 'fill once', warning: 'One-question textbox validation. Filling changes EP state and may be saved or graded. No Submit or Next is deliberately clicked.' });
}
module.exports = { runTextboxValidation };
if (require.main === module) runTextboxValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
