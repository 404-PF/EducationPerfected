// Read existing cached state only. Source: EP public chunk606, 4 November 2026.
// FillInTheGapsComponentState, FillInTheGapsDragDropRenderer, InlineDropzoneComponent.
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
// No renderer factories, marking methods, setters or internal interaction calls.
function readGapsInPage(baseline, action) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const refuse = reason => ({ descriptor: { kind: 'unsupported', reason: 'Drag-and-drop gaps: ' + reason } });
    const groups = [...document.querySelectorAll('.fitg-component')].filter(shown);
    if (!groups.length) return null;
    if (groups.length !== 1 || !groups[0].classList.contains('fitg-drag-drop')) return refuse('only one explicit drag-and-drop component is supported; textboxes are excluded');
    const group = groups[0];
    const modelOf = el => {
        for (let n = el, depth = 0; n && depth < 8; n = n.parentElement, depth++) {
            const a = window.angular?.element(n);
            for (const scope of a ? [a.isolateScope?.(), a.scope?.()] : []) {
                if (scope?.self?.model?._currentQuestion) return scope.self;
            }
        }
        return null;
    };
    const self = modelOf(group), model = self?.model, q = model?._currentQuestion;
    if (!q || model.gameMode !== 3 || !Number.isSafeInteger(q.contentID) || q.contentID <= 0
        || !Number.isSafeInteger(q.questionIndex) || q.questionIndex < 0) return refuse('missing current lesson identity');
    const defs = q.questionDef?.Components;
    if (!Array.isArray(defs) || defs.length !== 1 || defs[0]?.ComponentTypeCode !== 'FILL_IN_GAPS_COMPONENT') return refuse('mixed or unknown components');
    const comp = defs[0], id = comp.ComponentID;
    if (typeof id !== 'string' || !id || comp.InputType !== 2) return refuse('explicit drag-and-drop metadata required');
    const cached = q.cachedRenderers?.[1]?.identifiedComponents?.baseComponents?.[id];
    if (!Array.isArray(cached) || cached.length !== 1) return refuse('missing or ambiguous cached component');
    const component = cached[0], state = component?.componentState, metadata = state?.metadataInstance;
    const renderer = component?.questionRenderer;
    if (component?.id !== id || component.visualElement !== group || renderer?.container !== group || renderer.id !== id
        || renderer.componentState !== state || renderer.renderingParameters?.mode !== 1 || component.renderingParameters?.mode !== 1 || metadata?.ComponentID !== id || metadata.InputType !== 2) return refuse('renderer identity mismatch');
    const unsafeText = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>`[\]@]/;
    const plain = (s, allowOuterWhitespace = false) => typeof s === 'string' && s.length > 0 && s.length <= 4096
        && (allowOuterWhitespace ? s.trim().length > 0 : s === s.trim())
        && !unsafeText.test(s);
    const gaps = metadata.Gaps, indexes = state.gapIndexesShown, hints = state.hintsShown;
    if (!Array.isArray(gaps) || !gaps.length || gaps.length > 100 || !Array.isArray(comp.Gaps) || comp.Gaps.length !== gaps.length
        || !gaps.every(g => Number.isSafeInteger(g?.ID) && g.ID >= 0 && g.ID <= 99 && Array.isArray(g.CorrectOptions) && g.CorrectOptions.length > 0 && g.CorrectOptions.every(s => plain(s)))
        || new Set(gaps.map(g => g.ID)).size !== gaps.length
        || !Array.isArray(indexes) || !indexes.length || indexes.length > 100 || new Set(indexes).size !== indexes.length
        || indexes.some(i => !Number.isSafeInteger(i) || !gaps[i] || state.gapIDtoIndex?.[gaps[i].ID] !== i)
        // EP copies hints directly to textContent. Allow padding without changing raw identity or answer matching.
        // Reject padded look-alikes as well as exact duplicates; whitespace-only options remain unsupported.
        || !Array.isArray(hints) || !hints.length || hints.length > 200 || !hints.every(s => plain(s, true))
        || new Set(hints.map(s => s.trim())).size !== hints.length) return refuse('incomplete, duplicate or non-text resolved metadata');
    const sources = [...group.querySelectorAll('.fitg-drag-list .draggable')];
    const drags = renderer.draggables, zones = renderer.dropZones, base = state.identifiedComponents?.baseComponents;
    const spans = [...group.querySelectorAll('.fitg-inline-dropzone .dropzone-answer')];
    // EP advanced-renders static question text separately from raw-text answer controls.
    // Only one direct template is trusted; maths in or around controls stays unsupported.
    const templates = [...group.querySelectorAll('.fitg-drop-content')];
    const staticMath = [...group.querySelectorAll('math,.katex')];
    const controls = '.fitg-drag-list,.draggable,.fitg-inline-dropzone,.dropzone-answer,input,textarea,select';
    if (staticMath.some(el => templates.length !== 1 || templates[0].parentElement !== group || !templates[0].contains(el)
        || el.closest(controls) || el.querySelector(controls))) return refuse('math outside static question template');
    if (sources.length !== hints.length || !Array.isArray(drags) || drags.length !== hints.length
        || !Array.isArray(zones) || zones.length !== indexes.length || spans.length !== indexes.length
        || !base || Object.keys(base).length !== indexes.length
        || [...group.querySelectorAll('input,textarea,select,img')].length) return refuse('incomplete or unsupported visible renderer');
    if (Object.values(state.usersAnswers || {}).some(v => v !== '')) return refuse('stored prefilled answers are unsupported');
    const sourceRows = sources.map((el, i) => ({ el, drag: drags[i], text: el.textContent, used: el.classList.contains('used'), index: i }));
    if (sourceRows.some((r, i) => !shown(r.el) || r.text !== hints[i] || r.drag?.target !== r.el
        || r.el.getAttribute('data-draggable-index') !== String(i) || r.el.classList.contains('dragging') || r.el.classList.contains('ghost'))) return refuse('source option identity mismatch');
    const rows = [];
    for (const span of spans) {
        const gap = gaps.find(g => String(g.ID) === span.id), gapIndex = gap ? gaps.indexOf(gap) : -1;
        const entries = gap && base[String(gap.ID)], zone = Array.isArray(entries) && entries.length === 1 ? entries[0] : null;
        const wrapper = span.parentElement;
        if (!gap || !indexes.includes(gapIndex) || !zone || !zones.includes(zone) || zone.id !== String(gap.ID)
            || zone.span !== span || zone.containerSpan !== wrapper || !wrapper.classList.contains('fitg-inline-dropzone')
            || wrapper.id !== id + '_input_' + gap.ID || !shown(span) || !shown(wrapper)) return refuse('gap ID/DOM association mismatch');
        // Exact equality is a conservative subset of EP's textual validator.
        const choices = sourceRows.filter(r => gap.CorrectOptions.includes(r.text));
        if (choices.length !== 1) return refuse('gap has no unique displayed correct option');
        const rawText = span.textContent;
        const text = rawText.replace(/[\u200b-\u200d\ufeff]/g, '').trim();
        const empty = text === '';
        // Empty EP placeholders may contain known zero-width filler. Filled answers must be raw-exact.
        if (empty ? unsafeText.test(rawText.replace(/[\u200b-\u200d\ufeff]/g, ''))
            : !plain(rawText) || rawText !== choices[0].text) return refuse('unsafe or non-exact gap text');
        if (empty ? (zone.droppedDragID !== null || wrapper.classList.contains('filled') || !wrapper.classList.contains('empty'))
            : (text !== choices[0].text || zone.droppedDragID !== choices[0].index || !wrapper.classList.contains('filled') || wrapper.classList.contains('empty'))) return refuse('gap text or selected state disagrees');
        rows.push({ gap, zone, span, wrapper, source: choices[0], text });
    }
    if (renderer.displayOrderDropZones && (renderer.displayOrderDropZones.length !== rows.length || renderer.displayOrderDropZones.some((z, i) => z !== rows[i].zone))) return refuse('cached keyboard gap order disagrees with DOM');
    if (new Set(rows.map(r => r.gap.ID)).size !== rows.length || new Set(rows.map(r => r.source.index)).size !== rows.length) return refuse('reused gap or source option');
    // Keyboard Enter fills the first empty DOM-ordered gap. Only a verified prefix is valid.
    let emptySeen = false;
    for (const row of rows) {
        if (!row.text) emptySeen = true;
        else if (emptySeen) return refuse('non-prefix gap selection');
    }
    if (sourceRows.some(s => s.used !== rows.some(r => r.text && r.source === s))) return refuse('used sources disagree with filled gaps');
    if (typeof metadata.TextTemplate !== 'string' || metadata.TextTemplate.length > 32768) return refuse('missing or oversized resolved template');
    const tokens = [...metadata.TextTemplate.matchAll(/\[(\d{1,2}):[^\]]*\]/g)].map(m => Number(m[1]));
    const displayedIDs = tokens.filter(id => indexes.includes(state.gapIDtoIndex[id]));
    if (tokens.length !== gaps.length || new Set(tokens).size !== tokens.length || tokens.some(id => !gaps.some(g => g.ID === id))
        || displayedIDs.length !== rows.length || rows.some((r, i) => r.gap.ID !== displayedIDs[i])) return refuse('resolved template and displayed gap order disagree');
    const signature = JSON.stringify([comp, metadata, indexes, hints, state.checkOptions, state.usersAnswers]);
    const key = 'gaps:' + q.contentID + ':' + q.questionIndex;
    const descriptor = { kind: 'gaps', key, representation: 'gaps-renderer', signature,
        autoMarked: self.sectionData?.activityGroup?.isAutoMarked === true,
        gaps: rows.map(r => ({ id: r.gap.ID, answer: r.source.text, source: r.source.index, filled: !!r.text })) };
    if (baseline && (baseline.q !== q || baseline.comp !== comp || baseline.model !== model || baseline.component !== component
        || baseline.state !== state || baseline.metadata !== metadata || baseline.renderer !== renderer || baseline.group !== group
        || baseline.sources.length !== sourceRows.length || sourceRows.some((s, i) => s.el !== baseline.sources[i].el || s.drag !== baseline.sources[i].drag)
        || baseline.descriptor.signature !== signature || baseline.descriptor.key !== key
        || rows.some((r, i) => { const b = baseline.rows[i]; return !b || b.gap !== r.gap || b.zone !== r.zone || b.span !== r.span || b.wrapper !== r.wrapper || b.source.el !== r.source.el || b.source.drag !== r.source.drag; }))) return refuse('question or renderer changed');
    const result = { descriptor, q, comp, model, component, state, metadata, renderer, group, rows, sources: sourceRows };
    if (Number.isSafeInteger(action)) {
        if (descriptor.autoMarked !== true || action < 0 || !rows[action] || rows.findIndex(r => !r.text) !== action) return refuse('next empty gap changed');
        result.target = rows[action].source.el;
    } else if (action === 'verify' || action === 'submit') {
        if (descriptor.autoMarked !== true || rows.some(r => !r.text)) return refuse('exact answer set is incomplete');
        if (action === 'submit') {
            const bars = [...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b => modelOf(b)?.model === model);
            if (bars.length !== 1) return refuse('unassociated navigation controls');
            const buttons = [...bars[0].querySelectorAll('button')].filter(b => shown(b) && !b.disabled && b.textContent.trim() === 'Submit');
            if (buttons.length > 1) return refuse('ambiguous Submit');
            if (!buttons.length) return { ...result, readiness: 'not-ready' };
            result.target = buttons[0];
        }
    }
    return action === 'descriptor' ? { descriptor } : result;
}
module.exports = { readGapsInPage };
