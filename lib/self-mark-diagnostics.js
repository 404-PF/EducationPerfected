// Structural inspection only. Fixed field names and recognized codes, never
// question/answer text, arbitrary metadata keys, class strings or attribute values.
const BUILD = 'self-mark-diagnostics-v2';
function inspectSelfMarkInPage() {
    // Cached model properties must be own data properties. Accessors are not run.
    const data = (o, k) => o && typeof o === 'object' ? Object.getOwnPropertyDescriptor(o, k)?.value : undefined;
    const integer = v => Number.isSafeInteger(v) ? v : null;
    const style = v => [-1, 1, 2, 3, 4, 5].includes(v) ? v : null;
    const shape = (o, k) => {
        const d = o && typeof o === 'object' ? Object.getOwnPropertyDescriptor(o, k) : null;
        if (!d) return 'absent';
        if (!Object.hasOwn(d, 'value')) return 'accessor';
        const v = d.value;
        return Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    };
    const known = new Set(('ANNOTATED_QUESTION ANNOTATED_TEXT DEPTH DROPDOWN FILE_UPLOADER FILL_IN_GAPS'
        + ' FORMULA FREEFORM_WORKING HIGHLIGHT LONG_ANSWER MULTICHOICE NUMBER_BOX SCRATCH_PAD SOUND SOUND_RECORDER'
        + ' TEXT_BOX TYPE_ARROW TYPE_EQUALS TYPE_EXPONENT TYPE_GROUP TYPE_MATH_ENTITY TYPE_MATH_FUNCTION'
        + ' TYPE_MULTI_OPERATOR TYPE_NUMBER TYPE_OR TYPE_SUBSCRIPT_SUPERSCRIPT TYPE_TEXT TYPE_UNARY_OPERATOR'
        + ' WORKING_FORMULA').split(' ').map(c => c + '_COMPONENT'));
    const result = { build: 'self-mark-diagnostics-v2', readOnly: true };
    const host = document.querySelector('#ep-question-container');
    if (!host) return { ...result, guard: 'no-lesson-container' };
    const group = host.querySelector('#question-container-group');
    let model, self;
    for (let el = group || host, depth = 0; el && depth < 20; el = el.parentElement, depth++) {
        try {
            const scope = window.angular?.element?.(el)?.scope?.();
            const candidate = data(scope, 'self'), candidateModel = data(candidate, 'model');
            if (candidateModel) { self = candidate; model = candidateModel; break; }
        } catch { break; } // Do not fall through an unreadable scope to an ancestor.
    }
    const gameMode = integer(data(model, 'gameMode'));
    // Refuse assessments and unknown modes before accessing the question.
    if (gameMode !== 3) return { ...result, gameMode, guard: gameMode === 2 ? 'assessment-mode' : 'not-lesson-mode' };
    const q = data(model, '_currentQuestion'), def = data(q, 'questionDef');
    const defs = data(def, 'Components');
    if (!q) return { ...result, gameMode, guard: 'question-unavailable' };
    const fieldNames = ['ComponentTypeCode', 'ComponentID', 'InputType', 'Marked', 'QuestionMarkingStyle',
        'CorrectOptions', 'Options', 'Answer', 'Answers', 'ModelAnswer', 'Template', 'InitialText',
        'ModelAnswerHTML', 'InitialHTML', 'Format', 'LanguageID', 'ExpectationParameters', 'KeywordMatches', 'MinAnswerTime', 'ApplyGibberishFilter'];
    const components = Array.isArray(defs) ? Array.from({ length: Math.min(defs.length, 20) }, (_, i) => {
        const c = data(defs, String(i)), code = data(c, 'ComponentTypeCode');
        return { type: known.has(code) ? code : 'UNLISTED_COMPONENT',
            inputType: integer(data(c, 'InputType')), markingStyle: style(data(c, 'QuestionMarkingStyle')),
            fields: Object.fromEntries(fieldNames.map(k => [k, shape(c, k)])) };
    }) : [];
    // chunk606 LongAnswerComponentState reads ModelAnswerHTML, not ModelAnswer.
    // Observe only existing own data. Do not invoke public renderer/editor getters,
    // parse arbitrary HTML, reveal the model, or output any question/answer text.
    const longAnswer = (() => {
        if (!Array.isArray(defs) || defs.length > 20) return { guard: 'component-count' };
        const candidates = Array.from({length: defs.length}, (_,i) => data(defs,String(i)))
            .filter(c => data(c,'ComponentTypeCode') === 'LONG_ANSWER_COMPONENT');
        if (candidates.length !== 1) return { guard: 'component-count' };
        const raw = candidates[0];
        const id = data(raw, 'ComponentID');
        if (typeof id !== 'string' || !id) return { guard: 'component-id' };
        const cached = data(data(q, 'cachedRenderers'), '1');
        const index = data(cached, 'identifiedComponents') || data(data(cached, 'parser'), 'identifiedComponents');
        const entries = data(data(index, 'baseComponents'), id);
        if (!Array.isArray(entries) || entries.length !== 1) return { guard: 'renderer-graph' };
        const component = data(entries, '0'), state = data(component, 'componentState');
        // LongAnswerComponentState explicitly sets this.metadata=ne and its
        // ModelAnswerHTML getter reads this.metadata, unlike sibling states
        // which use the base class metadataInstance clone. Do not substitute.
        const metadata = data(state, 'metadata'), input = data(state, 'questionElement');
        const element = data(input, 'element');
        const view = data(data(data(input, 'editor'), 'editor'), 'view');
        const editor = data(view, 'dom');
        const model = data(metadata, 'ModelAnswerHTML'), initial = data(metadata, 'InitialHTML');
        const componentIdentity = data(component, 'id') === id && data(state, 'componentID') === id;
        const metadataIdentity = data(metadata, 'ComponentID') === id;
        const inputBound = componentIdentity && metadataIdentity && element instanceof HTMLElement
            && !!group?.contains(element) && element.classList.contains('long-answer-input')
            && data(component, 'visualElement') === element;
        return { guard: 'captured',
            componentIdentity,
            metadataIdentity,
            fields: Object.fromEntries(['ModelAnswerHTML', 'InitialHTML', 'Format', 'LanguageID',
                'ExpectationParameters', 'KeywordMatches', 'MinAnswerTime', 'ApplyGibberishFilter'].map(k => [k, shape(metadata, k)])),
            modelHTMLPresent: typeof model === 'string' && !!model.trim(),
            initialHTMLPresent: typeof initial === 'string' && !!initial.trim(),
            inputBound,
            editorBound: inputBound && editor instanceof HTMLElement
                && element.contains(editor) && editor.classList.contains('ProseMirror') && editor.isContentEditable,
            editorEmpty: editor instanceof HTMLElement ? !editor.textContent.trim() : null };
    })();
    const shown = el => !el.hidden && !['hidden', 'collapse'].includes(getComputedStyle(el).visibility)
        && (el.offsetParent !== null || el.getClientRects().length > 0);
    const elements = [], counts = { images: 0, canvases: 0, frames: 0, paperMode: false, markingMessage: false };
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_ELEMENT);
    let visited = 0, node;
    while (visited < 2000 && (node = walker.nextNode())) {
        visited++;
        const inQuestion = !group || group.contains(node);
        if (inQuestion && elements.length < 41 && node.matches('input,textarea,select,button,[contenteditable],[role]')) elements.push(node);
        if (inQuestion && node.tagName === 'IMG') counts.images++;
        if (inQuestion && node.tagName === 'CANVAS') counts.canvases++;
        if (inQuestion && node.tagName === 'IFRAME') counts.frames++;
        if (node.classList.contains('paper-mode-container')) counts.paperMode = true;
        if (node.classList.contains('marking-message')) counts.markingMessage = true;
    }
    const traversalTruncated = visited === 2000 && walker.nextNode() !== null;
    const controls = elements.slice(0, 40).map(el => {
        const type = ['INPUT', 'BUTTON'].includes(el.tagName) ? el.type : null, role = el.getAttribute('role');
        return { tag: ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(el.tagName) ? el.tagName.toLowerCase() : 'other',
            type: ['text', 'number', 'radio', 'checkbox', 'button', 'submit', 'hidden'].includes(type) ? type : 'other',
            role: ['textbox', 'button', 'combobox', 'listbox', 'option', 'radio', 'radiogroup', 'slider'].includes(role) ? role : 'other',
            visible: shown(el), disabled: !!el.disabled, contentEditable: !!el.isContentEditable,
            optionCount: el.tagName === 'SELECT' ? el.options.length : null };
    });
    const activity = data(data(self, 'sectionData'), 'activityGroup');
    const auto = data(activity, 'isAutoMarked'), selfMarked = data(activity, 'isSelfMarked');
    return { ...result, gameMode, guard: 'captured',
        markingStyles: { question: style(data(q, 'questionMarkingStyle')), definition: style(data(def, 'QuestionMarkingStyle')),
            activity: style(data(activity, 'QuestionMarkingStyle')) },
        isAutoMarked: typeof auto === 'boolean' ? auto : null,
        isSelfMarked: typeof selfMarked === 'boolean' ? selfMarked : null,
        componentCount: Array.isArray(defs) ? defs.length : null, components, longAnswer, componentsTruncated: Array.isArray(defs) && defs.length > 20,
        dom: { controls, controlsTruncated: elements.length > 40 || traversalTruncated, traversalTruncated, ...counts } };
}
async function collectSelfMarkDiagnostics(page, { shouldStop = () => false, timeoutMs = 2000 } = {}) {
    if (shouldStop()) return { build: BUILD, guard: 'cancelled' };
    let timer;
    const pending = Promise.resolve().then(() => shouldStop() ? { build: BUILD, guard: 'cancelled' } : page.evaluate(inspectSelfMarkInPage))
        .catch(() => ({ build: BUILD, guard: 'inspection-unavailable' }));
    const deadline = Date.now() + Math.min(2000, Math.max(1, timeoutMs));
    const stop = new Promise(resolve => {
        const poll = () => {
            if (shouldStop()) resolve({ build: BUILD, guard: 'cancelled' });
            else if (Date.now() >= deadline) resolve({ build: BUILD, guard: 'timeout' });
            else timer = setTimeout(poll, Math.min(25, deadline - Date.now()));
        };
        poll();
    });
    try { return await Promise.race([pending, stop]); } finally { clearTimeout(timer); }
}
module.exports = { BUILD, inspectSelfMarkInPage, collectSelfMarkDiagnostics };
