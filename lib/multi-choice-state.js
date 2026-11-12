// Source-grounded read-only inspection of EP's cached multi-select renderer.
// EP public chunk 606 (retrieved 2026-11-04), MCQPreviewOption.select,
// MultiChoiceComponent.{createQuestionVisualElement,onOptionSelected,outputForMarking},
// MultiChoiceComponentState.{selectAndReturnOptions,getIndexIDOfMultiChoiceOption}:
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
// No lazy getters, renderer creation, answer-state mutation or selection methods.
// A source-derived fixture is NOT a captured/live-verified multi-select slide.
function readMultiChoiceInPage(baseline, action) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const refuse = reason => ({ descriptor: { kind: 'unsupported', reason: 'Multi-select: ' + reason } });
    const groups = [...document.querySelectorAll('div.multi-choice-component')].filter(shown);
    const multi = groups.filter(g => g.getAttribute('role') === 'group' || g.classList.contains('multi-select'));
    if (!multi.length) return null;
    if (groups.length !== 1 || multi.length !== 1) return refuse('ambiguous visible choice components');
    const group = multi[0];
    if (group.getAttribute('role') !== 'group' || !group.classList.contains('multi-select')) return refuse('unexpected renderer shape');
    let self;
    for (let n = group, depth = 0; n && depth < 8; n = n.parentElement, depth++) {
        const scope = window.angular?.element(n)?.scope?.();
        if (scope?.self?.model?._currentQuestion) { self = scope.self; break; }
    }
    const model = self?.model, q = model?._currentQuestion;
    if (model?.gameMode === 2) return { descriptor: { kind: 'unsupported', assessment: true, reason: 'Assessment mode is a graded whole-attempt flow that can autosave input and record focus; answering is disabled' } };
    if (!q || model.gameMode !== 3 || !Number.isSafeInteger(q.contentID) || q.contentID <= 0
        || !Number.isSafeInteger(q.questionIndex) || q.questionIndex < 0) return refuse('missing current lesson identity');
    const components = q.questionDef?.Components;
    const choices = Array.isArray(components) ? components.filter(c => c?.ComponentTypeCode === 'MULTICHOICE_COMPONENT') : [];
    if (choices.length !== 1) return refuse('expected exactly one question component');
    const comp = choices[0], id = comp.ComponentID;
    // EP chunk606, checked 9 November 2026: ComponentStateFactory builds a
    // state for every def in questionDef.Components and BaseComponent marks
    // every component MARKED except AnnotatedText (NOT_MARKED) and display
    // types, and Submit grades the whole question. A co-resident
    // answer-bearing component would be submitted blank, so refuse the mix.
    // The legacy TYPE_* math-entry codes are deliberately not deny-listed:
    // chunk606's factory never builds them, TYPE_TEXT_COMPONENT is a legacy
    // display type, and any editable legacy part is still caught by the
    // foreign-editable DOM boundary below. DEPTH_COMPONENT appears in
    // chunk606 only as a WebGL texture constant, never a question component.
    const answerBearingCodes = ['DROPDOWN_COMPONENT', 'FORMULA_COMPONENT', 'WORKING_FORMULA_COMPONENT', 'FREEFORM_WORKING_COMPONENT',
        'LONG_ANSWER_COMPONENT', 'FILL_IN_GAPS_COMPONENT', 'SCRATCH_PAD_COMPONENT', 'FILE_UPLOADER_COMPONENT',
        'SOUND_RECORDER_COMPONENT', 'HIGHLIGHT_COMPONENT', 'TEXT_BOX_COMPONENT', 'NUMBER_BOX_COMPONENT', 'ANNOTATED_QUESTION_COMPONENT'];
    if (components.some(c => c !== comp && answerBearingCodes.includes(c?.ComponentTypeCode))) {
        return refuse('question has other answer-bearing components; answering one part would submit the rest blank');
    }
    // The transition DOM can briefly lack the lesson container (the next
    // slide's group can be re-mounted before a fresh container), so fall
    // back to a document-wide scan: the foreign-editable boundary is
    // never silently skipped.
    const lessonRoot = document.querySelector('#ep-question-container') || document;
    const foreignEditable = [...lessonRoot.querySelectorAll('input,textarea,select,[contenteditable]')]
        .filter(el => shown(el) && (el.matches('input,textarea,select') || el.isContentEditable) && !group.contains(el));
    if (foreignEditable.length) return refuse('question has editable controls outside the multi-select component; answering would submit them blank');
    // The real renderer tests truthiness; accept only explicit boolean true.
    if (comp.AllowMultiSelect !== true || typeof id !== 'string' || !id) return refuse('multi-select metadata is not explicit');
    const cached = q.cachedRenderers?.[1]?.identifiedComponents?.baseComponents?.[id];
    if (!Array.isArray(cached) || cached.length !== 1) return refuse('cached component unavailable or ambiguous');
    const component = cached[0], state = component?.componentState, metadata = state?.metadataInstance;
    const raw = comp.Options, options = metadata?.Options, original = state?.originalMultiChoiceOptions;
    const displayed = state?.displayedOptions, previews = state?.previewOptions;
    const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length
        && new Set(a).size === a.length && new Set(b).size === b.length && a.every(x => b.includes(x));
    const validOptions = a => Array.isArray(a) && a.length > 0 && a.length <= 100
        && a.every(o => typeof o?.TextTemplate === 'string' && o.TextTemplate.trim()
            && typeof o.Correct === 'string' && ['true', 'false'].includes(o.Correct.toLowerCase()))
        && new Set(a.map(o => o.TextTemplate)).size === a.length;
    // Raw Correct may contain unresolved variables; only resolved marking is used.
    if (!Array.isArray(raw) || !raw.length || raw.length > 100
        || raw.some(o => typeof o?.TextTemplate !== 'string' || !o.TextTemplate.trim())
        || component.type !== 'multichoice' || component.id !== id || component.visualElement !== group
        || state?.componentID !== id || metadata?.ComponentID !== id || metadata.AllowMultiSelect !== true
        || !validOptions(options) || options.length !== raw.length || !sameSet(original, options)
        || !Array.isArray(displayed) || !displayed.length || displayed.length > options.length
        || new Set(displayed).size !== displayed.length || displayed.some(o => !options.includes(o))
        || !Array.isArray(previews) || !sameSet(displayed, previews.map(p => p?.option))) return refuse('incomplete resolved option association');
    const elements = [...group.querySelectorAll('div.mcq-preview-option')];
    if (elements.length !== previews.length || elements.some(el => !shown(el))
        || !sameSet(elements, previews.map(p => p?.element))) return refuse('hidden, missing or foreign option element');
    const order = state.optionsOrderUsingOriginalIndexAsID;
    const indexes = displayed.map(o => original.indexOf(o));
    if (!Array.isArray(order) || order.length !== indexes.length || order.some((x, i) => x !== indexes[i])) return refuse('displayed option IDs do not match original metadata');
    // Chunk606 leaves _selectedOptions undefined until answer restoration or
    // the first optionSelected event. Treat only that untouched shape as empty,
    // locally, without initializing EP state. The row checks below still require
    // every preview, native checkbox and ARIA value to agree it is unselected.
    const selectedValue = state.selectedOptions;
    const selected = selectedValue === undefined ? [] : selectedValue;
    if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some(i => !indexes.includes(i))) return refuse('invalid selected option IDs');
    const strip = t => {
        const text = t.replace(/@@[0-9A-Fa-f]{6}@/g, '').replace(/@@/g, '');
        const parts = [];
        let from = 0;
        while (from < text.length) {
            const open = text.indexOf('[', from);
            if (open === -1) break;
            const close = text.indexOf(']', open + 1);
            // An unmatched opening preserves the entire suffix, including nested opens.
            // Never restart the closing-bracket search at every unmatched opening.
            if (close === -1) break;
            parts.push(text.slice(from, open));
            from = close + 1;
        }
        parts.push(text.slice(from));
        return parts.join('').replace(/\s+/g, ' ').trim();
    };
    const rows = [];
    for (const preview of previews) {
        const option = preview.option, element = preview.element, input = preview.fields?.check;
        const index = original.indexOf(option), correct = option.Correct.toLowerCase() === 'true';
        const selectedNow = selected.includes(index), aria = element.getAttribute('aria-selected');
        if (option.PreviewOption !== preview || preview.componentID !== id || preview.correct !== correct
            || preview.allowMulti !== true || preview.editable !== true || typeof preview.isSelected !== 'boolean'
            || preview.isSelected !== selectedNow || preview.renderer?.templateString !== option.TextTemplate
            || !preview.fields?.renderGroup || !element.contains(preview.fields.renderGroup)
            || !input || input.type !== 'checkbox' || !element.contains(input) || input.checked !== selectedNow
            || (aria !== null && aria !== String(selectedNow)) || (selectedNow && aria !== 'true')
            || element.querySelector('img:not(.answer-icon)')) return refuse('option marking, selection or renderer state disagrees');
        const render = preview.fields.renderGroup;
        if (option.TextTemplate.includes('`')) {
            if (!render.querySelector('.katex, math, .inline-formula')) return refuse('formula renderer not ready');
        } else if (!strip(render.textContent || '') || strip(render.textContent || '') !== strip(option.TextTemplate)) return refuse('option text renderer not ready');
        rows.push({ id: index, correct, selected: selectedNow, element, preview, option });
    }
    if (!rows.some(r => r.correct)) return refuse('no displayed correct options');
    const signature = JSON.stringify([raw.map(o => [o.TextTemplate, o.Correct]), options.map(o => [o.TextTemplate, o.Correct]), indexes]);
    const key = `choice:${q.contentID}:${q.questionIndex}`;
    if (baseline && (baseline.q !== q || baseline.comp !== comp || baseline.model !== model || baseline.component !== component || baseline.state !== state
        || baseline.metadata !== metadata || baseline.group !== group || baseline.descriptor.key !== key
        || baseline.descriptor.associationSignature !== signature
        || rows.some(r => !baseline.rows.some(b => b.id === r.id && b.element === r.element && b.preview === r.preview && b.option === r.option)))) return refuse('cached question or option identity changed');
    const descriptor = { kind: 'choice', multi: true, representation: 'multi-renderer', key,
        associationSignature: signature, correct: rows.filter(r => r.correct).map(r => r.id).sort((a,b) => a-b),
        options: rows.map(r => ({ id: r.id, selected: r.selected })),
        autoMarked: self.sectionData?.activityGroup?.isAutoMarked === true ? true : self.sectionData?.activityGroup?.isAutoMarked === false ? false : 'unknown' };
    const result = { descriptor, q, comp, model, component, state, metadata, group, rows };
    if (action === 'submit' || action === 'verify') {
        if (descriptor.autoMarked !== true || rows.some(r => r.selected !== r.correct)) return refuse('selected set is not exactly the current correct set');
        if (action === 'verify') return result;
        const modelOf = el => {
            for (let node = el, n = 0; node && n < 8; node = node.parentElement, n++) {
                const a = window.angular?.element(node);
                for (const scope of a ? [a.isolateScope?.(), a.scope?.()] : []) {
                    if (scope?.self?.model?._currentQuestion) return scope.self.model;
                }
            }
            return null;
        };
        const bars = [...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b => modelOf(b) === model);
        if (bars.length !== 1) return refuse('navigation controls are ambiguous or unassociated');
        const buttons = [...bars[0].querySelectorAll('button')].filter(b => shown(b) && !b.disabled && (b.innerText || '').trim() === 'Submit');
        if (buttons.length !== 1) {
            if (buttons.length > 1) return refuse('Submit is ambiguous');
            return { ...result, readiness: 'not-ready' };
        }
        result.target = buttons[0];
    } else if (Number.isSafeInteger(action)) {
        const row = rows.find(r => r.id === action);
        if (!row || descriptor.autoMarked !== true) return refuse('option no longer associated with auto-marked question');
        result.target = row.element;
    }
    return action === 'descriptor' ? { descriptor } : result;
}
module.exports = { readMultiChoiceInPage };
