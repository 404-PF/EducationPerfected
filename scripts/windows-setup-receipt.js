// A helper exit code alone never certifies its child/job closure.
function setupReceipt(text, code, { closed, terminatedByUs = false, timedOut = false } = {}) {
    if (!closed || terminatedByUs || timedOut) return { certain: false };
    if (code === 0 && text === 'EP_SETUP_CLOSED_SUCCESS\n') return { certain: true, success: true };
    // Fixed error categories only; unknown/duplicate/trailing output is uncertain.
    const failure = /^EP_SETUP_PRIMARY=(host-guard|node-identity|pipe-create|console-create|attribute-size|attribute-init|attribute-console|job-create|job-limit|process-create|job-assignment-pre-resume|process-resume|process-timeout|process-exit-code|console-child-nonzero|console-prompt-order|console-duplicate-prompt|console-prompt-count|console-prompt|console-read|console-write|console-short-write|console-output-limit|console-status-missing|console-command-failed)\nEP_SETUP_CLOSED_FAILURE\n$/;
    if (code === 1 && failure.test(text)) return { certain: true, success: false };
    return { certain: false };
}
function setupReceiptDiagnostic(text, code, state) {
    // Classification only. Never promotes a rejected CRLF receipt to certainty.
    const lf = setupReceipt(text, code, {closed:true});
    const converted = text.replace(/\r\n/g, '\n');
    const crlf = text === converted.replace(/\n/g, '\r\n') ? setupReceipt(converted, code, {closed:true}) : {certain:false};
    const receipt = lf.certain ? (lf.success ? 'success-lf' : 'failure-lf') : crlf.certain && text.includes('\r\n') ? (crlf.success ? 'success-crlf' : 'failure-crlf') : 'unrecognized';
    const exit = [0,1,20,259].includes(code) ? String(code) : 'other';
    return 'Setup helper checkpoint: exit='+exit+'; receipt='+receipt+'; closed='+Boolean(state.closed)+'; timeout='+Boolean(state.timedOut)+'; parentKill='+Boolean(state.terminatedByUs)+'; stderrOrError='+Boolean(state.helperError);
}
module.exports = { setupReceipt, setupReceiptDiagnostic };
