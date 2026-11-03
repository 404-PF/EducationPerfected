// Read-only, aggregate choice-shape report. Never return question/answer text,
// correctness per option, field names, IDs, URLs, markup payloads or errors.
function choiceDiagnosticInPage() {
    const count = n => Math.min(n, 100);
    const shown = el => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
    const roots = [...document.querySelectorAll('div.multi-choice-component[role=radiogroup]')].filter(shown);
    const report = { version: 1, visibleChoiceGroups: count(roots.length), state: 'no-single-choice-group' };
    if (roots.length !== 1) return report;
    const root = roots[0];
    const rendered = [...root.querySelectorAll('.mcq-preview-option')].filter(shown);
    report.rendered = {
        options: count(rendered.length),
        withMath: count(rendered.filter(el => el.querySelector('.katex, .MathJax, math, .inline-formula, formula')).length),
        withImage: count(rendered.filter(el => el.querySelector('img:not(.answer-icon)')).length),
    };
    let question = null;
    for (let node = root, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
        try {
            const scope = window.angular?.element(node)?.scope?.();
            if (scope?.self?.model?._currentQuestion) { question = scope.self.model._currentQuestion; break; }
        } catch { /* no external exception text in report */ }
    }
    if (!question) { report.state = 'scope-unavailable'; return report; }
    const components = question.questionDef?.Components;
    if (!Array.isArray(components)) { report.state = 'components-unavailable'; return report; }
    const choices = components.filter(c => c?.ComponentTypeCode === 'MULTICHOICE_COMPONENT');
    report.choiceComponents = count(choices.length);
    if (choices.length !== 1) { report.state = 'no-single-choice-component'; return report; }
    const options = choices[0].Options;
    if (!Array.isArray(options)) { report.state = 'options-unavailable'; return report; }
    if (options.length > 100) { report.state = 'option-limit'; return report; }
    // Counters for ALL options, never their order or which option is correct.
    const stats = {
        options: options.length, correctMarked: 0,
        textMissing: 0, textNonString: 0, textEmpty: 0,
        textNonempty: 0, normalizedEmpty: 0,
        withBracketSpan: 0, withBacktick: 0, withHtml: 0,
        shortText: 0, mediumText: 0, longText: 0,
        correctTextMissingOrNonString: 0, correctTextEmpty: 0,
        correctNormalizedEmpty: 0,
    };
    for (const option of options) {
        const correct = option?.Correct === true || (typeof option?.Correct === 'string' && option.Correct.toLowerCase() === 'true');
        if (correct) stats.correctMarked++;
        const text = option?.TextTemplate;
        if (text == null) { stats.textMissing++; if (correct) stats.correctTextMissingOrNonString++; continue; }
        if (typeof text !== 'string') { stats.textNonString++; if (correct) stats.correctTextMissingOrNonString++; continue; }
        // No exact lengths or hashes: coarse buckets and markup categories only.
        if (text.length <= 32) stats.shortText++;
        else if (text.length <= 256) stats.mediumText++;
        else stats.longText++;
        if (text.trim() === '') { stats.textEmpty++; if (correct) stats.correctTextEmpty++; }
        else stats.textNonempty++;
        if (/\[[^\]]*\]/.test(text)) stats.withBracketSpan++;
        if (text.includes('`')) stats.withBacktick++;
        if (/<[^>]+>/.test(text)) stats.withHtml++;
        const normalized = text.replace(/@@[0-9A-Fa-f]{6}@/g, '').replace(/@@/g, '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
        if (normalized === '') { stats.normalizedEmpty++; if (correct) stats.correctNormalizedEmpty++; }
    }
    report.state = 'metadata-counted';
    report.metadata = stats;
    return report;
}
async function readChoiceDiagnostic(page) {
    try { return await page.evaluate(choiceDiagnosticInPage); }
    catch { return { version: 1, state: 'read-failed' }; }
}
module.exports = { choiceDiagnosticInPage, readChoiceDiagnostic };
