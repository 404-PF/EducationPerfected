// Gaps entrypoints share the guarded lifecycle driver with choice validation.
const { launchProgram } = require('../index');
const { runValidationCli } = require('./validation-cli');
function runGapsValidation({ input = process.stdin, output = process.stdout, launch = launchProgram } = {}, submit = false) {
    return runValidationCli({ input, output, launch,
        launchOptions: submit ? { gapsSubmitOnce: true } : { gapsFillOnly: true },
        action: submit ? 'submit once' : 'fill once', mode: submit ? 'auto' : 'semi',
        warning: submit ? 'One-question gaps submission validation. Fills then clicks Submit once; may record results or points. EP may advance automatically. Never clicks Next or answers again.' : 'One-question gaps validation. Filling may save a draft. Never submits or clicks Next.'
    });
}
module.exports = { runGapsValidation };
