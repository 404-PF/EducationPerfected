#!/usr/bin/env node
const { launchProgram } = require('../index');
const { runValidationCli } = require('../lib/validation-cli');
function runChoiceValidation({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}) {
    return runValidationCli({ input, output, launch, launchOptions: { choiceSelectOnly: true }, action: 'select once', warning: 'One-question choice validation. Selection changes EP state and may be saved or graded by EP. No Submit or Next is clicked.' });
}
module.exports = { runChoiceValidation };
if (require.main === module) runChoiceValidation().catch(() => { console.error('Validation startup failed. No retry; inspect the browser.'); process.exitCode = 1; });
