// Source-derived, not live DOM: EP public chunk606, checked 8 November 2026.
// NewTextBoxComponent / NumberBoxComponent and their ComponentState classes.
// Read-only only.
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
const TEXTBOX_CONFIG = Object.freeze({
    kind: 'textbox',
    keyPrefix: 'textbox',
    selector: 'input.text-box-component',
    componentType: 'TEXT_BOX_COMPONENT',
    reason: 'Lesson textboxes: unsafe, unsupported or changed renderer state',
    numeric: false,
});
const NUMBER_BOX_CONFIG = Object.freeze({
    kind: 'numberbox',
    keyPrefix: 'numberbox',
    selector: 'input.number-box-component',
    componentType: 'NUMBER_BOX_COMPONENT',
    reason: 'Lesson number boxes: unsafe, unsupported or changed renderer state',
    numeric: true,
});

function readInputBoxesInPage(baseline, action, config) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const boxes = [...document.querySelectorAll(config.selector)].filter(shown);
    if (!boxes.length) return null;
    const refuse = () => ({ descriptor: { kind: 'unsupported', reason: config.reason } });
    const modelOf = el => {
        for (let n = el, depth = 0; n && depth < 10; n = n.parentElement, depth++) {
            const a = window.angular?.element(n);
            for (const scope of a ? [a.isolateScope?.(), a.scope?.()] : []) if (scope?.self?.model?._currentQuestion) return scope.self;
        }
        return null;
    };
    const self = modelOf(boxes[0]), model = self?.model, q = model?._currentQuestion;
    if (model?.gameMode === 2) return { descriptor: { kind: 'unsupported', assessment: true, reason: 'Assessment mode is a graded whole-attempt flow that can autosave input and record focus; answering is disabled' } };
    if (!q || model.gameMode !== 3 || self.sectionData?.activityGroup?.isAutoMarked !== true
        || !Number.isSafeInteger(q.contentID) || q.contentID <= 0 || !Number.isSafeInteger(q.questionIndex) || q.questionIndex < 0) return refuse();
    const lesson = document.querySelector('#ep-question-container');
    if (!lesson || boxes.some(b => !lesson.contains(b))
        || [...lesson.querySelectorAll('input,textarea,select,[contenteditable]')].filter(el => shown(el) && (el.matches('input,textarea,select') || el.isContentEditable)).some(el => !boxes.includes(el))) return refuse();
    const defs = q.questionDef?.Components, renderer = q.cachedRenderers?.[1], base = renderer?.identifiedComponents?.baseComponents;
    if (!Array.isArray(defs) || !defs.length || defs.length > 20 || defs.length !== boxes.length || !base
        || defs.some(d => d?.ComponentTypeCode !== config.componentType || typeof d.ComponentID !== 'string' || !d.ComponentID || d.Marked !== 1)
        || new Set(defs.map(d => d.ComponentID)).size !== defs.length || Object.keys(base).length !== defs.length) return refuse();
    const plain = s => typeof s === 'string' && s.length > 0 && s.length <= 1024 && s === s.trim()
        && !/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>`[\]@]/.test(s);
    const numeric = s => plain(s) && s.length <= 64 && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) && Number.isFinite(Number(s));
    const rows = [];
    for (const box of boxes) {
        if (modelOf(box)?.model !== model || box.disabled || box.readOnly || !['text', ''].includes(box.type)
            || box.closest('.fitg-component') || box.getAttribute('maxlength') !== null || box.getAttribute('pattern') !== null) return refuse();
        const matches = defs.filter(d => Array.isArray(base[d.ComponentID]) && base[d.ComponentID].length === 1 && base[d.ComponentID][0].textBox === box);
        if (matches.length !== 1) return refuse();
        const def = matches[0], component = base[def.ComponentID][0], state = component.componentState, metadata = state?.metadataInstance;
        if (component.id !== def.ComponentID || component.visualElement !== box || component.renderingParameters?.mode !== 1 || component.marked !== 1
            || metadata?.ComponentTypeCode !== config.componentType || metadata.ComponentID !== def.ComponentID || metadata.Marked !== 1
            || typeof state.userAnswer !== 'string' || typeof state.isUserAnswerSet !== 'boolean'
            || typeof state.injectedInitialText !== 'string' || state.injectedInitialText !== '' || metadata.InitialText !== ''
            || !Array.isArray(state.answerOptions) || !state.answerOptions.length || state.answerOptions.length > 50 || !state.answerOptions.every(plain)
            || !Array.isArray(metadata.Options) || !metadata.Options.length || !metadata.Options.every(plain)
            || JSON.stringify(state.answerOptions) !== JSON.stringify(metadata.Options)
            || JSON.stringify(def.Options) !== JSON.stringify(metadata.Options) || def.InitialText !== ''
            || !Array.isArray(state.variableOptions)) return refuse();
        if (!config.numeric) {
            if (def.CaseSensitive !== metadata.CaseSensitive || def.MarkPunctuation !== metadata.MarkPunctuation
                || def.IgnoredCharacters !== metadata.IgnoredCharacters
                || ![true, false].includes(metadata.CaseSensitive) || ![true, false].includes(metadata.MarkPunctuation)
                || typeof metadata.IgnoredCharacters !== 'string') return refuse();
        } else {
            const roundingTypes = ['NONE', 'DP', 'SF'], errorTypes = ['ABS', '%'];
            if (!state.answerOptions.every(numeric)
                || !roundingTypes.includes(metadata.RoundingTypeCode) || !errorTypes.includes(metadata.AcceptableErrorTypeCode)
                || !Number.isSafeInteger(metadata.RoundingAmount) || metadata.RoundingAmount < 0 || metadata.RoundingAmount > 15
                || typeof metadata.AcceptableErrorValue !== 'number' || !Number.isFinite(metadata.AcceptableErrorValue) || metadata.AcceptableErrorValue < 0
                || def.RoundingTypeCode !== metadata.RoundingTypeCode || def.RoundingAmount !== metadata.RoundingAmount
                || def.AcceptableErrorTypeCode !== metadata.AcceptableErrorTypeCode || def.AcceptableErrorValue !== metadata.AcceptableErrorValue) return refuse();
        }
        if (box.value !== state.userAnswer || (!state.isUserAnswerSet && state.userAnswer !== '')) return refuse();
        rows.push({ box, def, component, state, metadata, answer: state.answerOptions[0], value: box.value });
    }
    if (new Set(rows.map(r => r.def)).size !== defs.length) return refuse();
    const signature = JSON.stringify([defs, rows.map(r => [r.metadata, r.state.answerOptions, r.state.variableOptions, r.state.injectedInitialText])]);
    const key = config.keyPrefix + ':' + q.contentID + ':' + q.questionIndex;
    const descriptor = { kind: config.kind, key, autoMarked: true, signature, boxes: rows.map(r => ({ id: r.def.ComponentID, answer: r.answer, value: r.value })) };
    if (baseline && (baseline.q !== q || baseline.model !== model || baseline.renderer !== renderer || baseline.base !== base
        || baseline.descriptor.signature !== signature || baseline.descriptor.key !== key || baseline.rows.length !== rows.length
        || rows.some((r, i) => ['box', 'def', 'component', 'state', 'metadata'].some(k => r[k] !== baseline.rows[i][k])))) return refuse();
    const result = { descriptor, q, model, renderer, base, rows };
    if (action === 'submit') {
        if (rows.some(r => r.value !== r.answer)) return refuse();
        const bars = [...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b => modelOf(b)?.model === model);
        if (bars.length !== 1) return refuse();
        const buttons = [...bars[0].querySelectorAll('button')].filter(b => shown(b) && !b.disabled && b.textContent.trim() === 'Submit');
        if (buttons.length !== 1) return refuse();
        result.target = buttons[0];
    }
    if (Number.isSafeInteger(action)) result.target = rows[action]?.box;
    return action === 'descriptor' ? { descriptor } : result;
}

module.exports = { TEXTBOX_CONFIG, NUMBER_BOX_CONFIG, readInputBoxesInPage };
