// Source-derived, not live DOM: EP public chunk606, checked 9 November 2026.
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
    // EP chunk606: TextBoxComponent.createQuestionVisualElement returns
    // this.textBox itself, so visualElement IS the input element.
    visualElementWrapsBox: false,
});
const NUMBER_BOX_CONFIG = Object.freeze({
    kind: 'numberbox',
    keyPrefix: 'numberbox',
    selector: 'input.number-box-component',
    componentType: 'NUMBER_BOX_COMPONENT',
    reason: 'Lesson number boxes: unsafe, unsupported or changed renderer state',
    numeric: true,
    // EP chunk606: NumberBoxComponent.createQuestionVisualElement wraps the
    // input in a script-position span (ElementUtil.create("span", ...),
    // span.appendChild(this.textBox), return span), so visualElement is the
    // input's parent span, never the input itself.
    visualElementWrapsBox: true,
});

function readInputBoxesInPage(baseline, action, config) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const boxes = [...document.querySelectorAll(config.selector)].filter(shown);
    if (!boxes.length) return null;
    const diagnostic = {
        kind: config.kind + '-refusal',
        guard: 'start',
        modelReadable: false,
        gameMode: null,
        autoMarked: null,
        componentCount: 0,
        componentTypes: [],
        domBoxCount: boxes.length,
    };
    const note = patch => Object.assign(diagnostic, patch);
    const safeJson = value => { try { return JSON.stringify(value); } catch { return null; } };
    const safeComponentType = type => type === 'TEXT_BOX_COMPONENT' || type === 'NUMBER_BOX_COMPONENT' ? type : 'UNLISTED_COMPONENT';
    const safeInteger = value => Number.isSafeInteger(value) ? value : null;
    const validRoundingType = value => value === 'NONE' || value === 'DP' || value === 'SF';
    const validErrorType = value => value === 'ABS' || value === '%';
    const controlCounts = () => ({
        inputs: document.querySelectorAll('input').length,
        textareas: document.querySelectorAll('textarea').length,
        selects: document.querySelectorAll('select').length,
        contentEditable: document.querySelectorAll('[contenteditable]').length,
        canvases: document.querySelectorAll('canvas').length,
        buttons: document.querySelectorAll('button').length,
    });
    const refuse = (guard, facts = {}) => ({ descriptor: { kind: 'unsupported', reason: config.reason, diagnostic: { ...diagnostic, ...facts, guard, controls: controlCounts() } } });
    const modelOf = el => {
        for (let n = el, depth = 0; n && depth < 10; n = n.parentElement, depth++) {
            const a = window.angular?.element(n);
            for (const scope of a ? [a.isolateScope?.(), a.scope?.()] : []) if (scope?.self?.model?._currentQuestion) return scope.self;
        }
        return null;
    };
    const self = modelOf(boxes[0]), model = self?.model, q = model?._currentQuestion;
    if (model?.gameMode === 2) return { descriptor: { kind: 'unsupported', assessment: true, reason: 'Assessment mode is a graded whole-attempt flow that can autosave input and record focus; answering is disabled' } };
    note({
        modelReadable: !!model,
        gameMode: safeInteger(model?.gameMode),
        autoMarked: self?.sectionData?.activityGroup?.isAutoMarked === true,
        contentIdValid: Number.isSafeInteger(q?.contentID) && q.contentID > 0,
        questionIndexValid: Number.isSafeInteger(q?.questionIndex) && q.questionIndex >= 0,
    });
    if (!q || model.gameMode !== 3 || self.sectionData?.activityGroup?.isAutoMarked !== true
        || !Number.isSafeInteger(q.contentID) || q.contentID <= 0 || !Number.isSafeInteger(q.questionIndex) || q.questionIndex < 0) return refuse('model-or-auto-mark');
    const lesson = document.querySelector('#ep-question-container');
    const editableControls = lesson ? [...lesson.querySelectorAll('input,textarea,select,[contenteditable]')].filter(el => shown(el) && (el.matches('input,textarea,select') || el.isContentEditable)) : [];
    if (!lesson || boxes.some(b => !lesson.contains(b)) || editableControls.some(el => !boxes.includes(el))) {
        return refuse('lesson-dom', { lessonPresent: !!lesson, boxesInLesson: boxes.filter(b => lesson?.contains(b)).length, editableControlCount: editableControls.length });
    }
    const defs = q.questionDef?.Components, renderer = q.cachedRenderers?.[1], base = renderer?.identifiedComponents?.baseComponents;
    const componentIdsValid = Array.isArray(defs) && defs.every(d => typeof d?.ComponentID === 'string' && d.ComponentID);
    note({
        componentCount: Array.isArray(defs) ? defs.length : 0,
        componentTypes: Array.isArray(defs) ? defs.slice(0, 20).map(d => safeComponentType(d?.ComponentTypeCode)) : [],
        baseComponentCount: base ? Object.keys(base).length : 0,
        componentIdsValid,
        uniqueComponentIds: Array.isArray(defs) ? new Set(defs.map(d => d?.ComponentID)).size : 0,
        allMarked: Array.isArray(defs) && defs.every(d => d?.Marked === 1),
        rendererReadable: !!renderer,
    });
    if (!Array.isArray(defs) || !defs.length || defs.length > 20 || defs.length !== boxes.length || !base) return refuse('component-count');
    if (defs.some(d => d?.ComponentTypeCode !== config.componentType || typeof d.ComponentID !== 'string' || !d.ComponentID)) return refuse('component-types');
    if (new Set(defs.map(d => d.ComponentID)).size !== defs.length) return refuse('component-ids');
    if (Object.keys(base).length !== defs.length) return refuse('component-count');
    // EP chunk606, checked 8 November 2026: the question-level aggregation
    // excludes components whose output is NOT_MARKED, but text/number boxes
    // never are - BaseComponent's constructor sets marked = MARKED
    // unconditionally and no text/number-box code path overrides it,
    // outputForMarking reports { marked: this.marked, ... } from that
    // runtime flag, and ComponentState.mark grades against the accepted
    // options without consulting the Marked definition flag. An
    // authored-unmarked (Marked 0) box is therefore graded exactly like a
    // marked one; the runtime component.marked === 1 check below is the
    // authoritative boundary, matching the dropdown contract, which already
    // accepts definition Marked 0 or 1 with runtime marked 1. Only invalid
    // flag values and mixed-marking definitions refuse here. Raw Marked
    // values are never serialized.
    if (defs.some(d => d.Marked !== 0 && d.Marked !== 1)) {
        const invalid = defs.filter(d => d.Marked !== 0 && d.Marked !== 1);
        const associated = invalid.map(d => Array.isArray(base[d.ComponentID]) && base[d.ComponentID].length === 1 ? base[d.ComponentID][0] : null);
        return refuse('component-marked', {
            markedDefCount: defs.filter(d => d.Marked === 1).length,
            unmarkedDefCount: defs.filter(d => d.Marked === 0).length,
            invalidMarkedDefCount: invalid.length,
            invalidMetadataMarkedZeroCount: associated.filter(c => c?.componentState?.metadataInstance?.Marked === 0).length,
            invalidMetadataMarkedOneCount: associated.filter(c => c?.componentState?.metadataInstance?.Marked === 1).length,
        });
    }
    if (new Set(defs.map(d => d.Marked)).size !== 1) {
        return refuse('mixed-definition-marking', {
            markedDefCount: defs.filter(d => d.Marked === 1).length,
            unmarkedDefCount: defs.filter(d => d.Marked === 0).length,
        });
    }
    const plain = s => typeof s === 'string' && s.length > 0 && s.length <= 1024 && s === s.trim()
        && !/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>`[\]@]/.test(s);
    const numeric = s => plain(s) && s.length <= 64 && /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s) && Number.isFinite(Number(s));
    // Source-derived NumberBoxComponentState.mark / AnswerRoundingHelper /
    // MarginErrorHelper. Only the accepted numeric string is filled; DP
    // metadata may round a stored option to EP's submitted format, while an
    // SF option must already be in EP's accepted format or the slide refuses.
    const roundNumber = (value, amount, type) => {
        if (type === 'NONE') return value;
        const sign = value < 0 ? -1 : 1, magnitude = Math.abs(value);
        if (type === 'DP') { const factor = 10 ** amount; return sign * Math.round(magnitude * factor) / factor; }
        if (magnitude === 0) return 0;
        const scale = 10 ** (amount - Math.floor(Math.LOG10E * Math.log(magnitude)) - 1);
        return sign * Math.round(magnitude * scale) / scale;
    };
    const roundingFormatMatches = (answer, amount, type) => {
        if (type === 'NONE') return true;
        const clean = answer.replace(/[-, ]/g, ''), point = clean.indexOf('.');
        if (type === 'DP') return amount === 0 ? point < 0 : point >= 0 && clean.length - (point + 1) === amount;
        if (amount <= 0) return clean.length === 0;
        let count;
        if (point >= 0) {
            const value = Number(clean);
            count = value < 1 ? clean.slice(point + 1).length + Math.floor(Math.LOG10E * Math.log(value)) + 1 : point + clean.length - point - 1;
            return count === amount;
        }
        if (clean.length < amount) return false;
        const reversed = '.' + [...clean].reverse().join('');
        count = reversed.length - 1 + Math.floor(Math.LOG10E * Math.log(parseFloat(reversed))) + 1;
        return count <= amount;
    };
    // EP chunk606, checked 9 November 2026: NumberBoxComponentState and
    // TextBoxComponentState copy answerOptions from metadata.Options and build
    // one BasicVariableInjector per raw option string; applyVariableContext
    // then resolves each {expression} template in place on answerOptions,
    // while metadata.Options keeps the raw templates (cloneObject of the
    // definition). Raw agreement is reconstructed from each injector's parts:
    // literal TextPart .text pieces and TempVariablePart
    // .temporaryVariable.expression pieces. A genuine parse turns every
    // {expression} substring into a variable part, so a text part carrying
    // that pattern is forged, and each part must carry exactly one shape.
    // Descriptor reads only: no getter, toJSON or proxy code ever executes.
    const analyzeOptionInjector = injector => {
        const read = (object, key) => { const property = object && Object.getOwnPropertyDescriptor(object, key); return property && Object.hasOwn(property, 'value') ? property.value : undefined; };
        const parts = read(injector, 'parts');
        if (!Array.isArray(parts) || parts.length > 100) return null;
        let template = '', variable = false;
        for (const part of parts) {
            if (!part || typeof part !== 'object') return null;
            const textHolder = Object.hasOwn(part, 'text'), variableHolder = Object.hasOwn(part, 'temporaryVariable');
            if (textHolder === variableHolder) return null;
            if (textHolder) { const text = read(part, 'text'); if (typeof text !== 'string' || /{[^}]+}/.test(text)) return null; template += text; continue; }
            const expression = read(read(part, 'temporaryVariable'), 'expression');
            if (typeof expression !== 'string' || expression.length > 1024) return null;
            variable = true; template += '{' + expression + '}';
        }
        return { template, variable };
    };
    const numberAnswerAccepted = (answer, options, metadata) => {
        const value = Number(answer), amount = metadata.RoundingAmount, rounding = metadata.RoundingTypeCode;
        if (!roundingFormatMatches(answer, amount, rounding)) return false;
        return options.some(option => {
            const optionValue = Number(option), rounded = roundNumber(optionValue, amount, rounding);
            if (metadata.AcceptableErrorValue === 0) return value === rounded;
            const range = metadata.AcceptableErrorTypeCode === 'ABS'
                ? [optionValue - metadata.AcceptableErrorValue, optionValue + metadata.AcceptableErrorValue]
                : [optionValue * (1 - metadata.AcceptableErrorValue / 100), optionValue * (1 + metadata.AcceptableErrorValue / 100)];
            const low = roundNumber(range[0], amount, rounding), high = roundNumber(range[1], amount, rounding);
            const checked = rounding === 'NONE' ? value : roundNumber(value, amount, rounding);
            return low <= checked && checked <= high;
        });
    };
    const selectNumberAnswer = (options, metadata) => {
        const exact = options.find(option => numberAnswerAccepted(option, options, metadata));
        if (exact) return exact;
        if (metadata.RoundingTypeCode !== 'DP') return null;
        const formatted = options.map(option => Number(option).toFixed(metadata.RoundingAmount)).find(answer => numeric(answer) && numberAnswerAccepted(answer, options, metadata));
        return formatted || null;
    };
    const rows = [];
    for (const box of boxes) {
        const boxIndex = boxes.indexOf(box), sameModel = modelOf(box)?.model === model;
        if (!sameModel || box.disabled || box.readOnly || !['text', ''].includes(box.type)
            || box.closest('.fitg-component') || box.getAttribute('maxlength') !== null || box.getAttribute('pattern') !== null) {
            return refuse('box-shape', {
                boxIndex,
                sameModel,
                disabled: box.disabled,
                readOnly: box.readOnly,
                inputType: box.type === 'text' || box.type === '' ? box.type : 'UNLISTED_INPUT_TYPE',
                inGapsComponent: !!box.closest('.fitg-component'),
                hasMaxlength: box.getAttribute('maxlength') !== null,
                hasPattern: box.getAttribute('pattern') !== null,
            });
        }
        const matches = defs.filter(d => Array.isArray(base[d.ComponentID]) && base[d.ComponentID].length === 1 && base[d.ComponentID][0]?.textBox === box);
        if (matches.length !== 1) return refuse('component-association', { boxIndex, matchCount: matches.length });
        const def = matches[0], component = base[def.ComponentID][0], state = component.componentState, metadata = state?.metadataInstance;
        const metadataOptionsJson = safeJson(metadata?.Options), definitionOptionsJson = safeJson(def.Options);
        // Reconstructed raw templates must equal metadata.Options exactly.
        // When a template carries no variable its resolution is the identity,
        // so the resolved answerOptions entry must equal the template; a
        // variable-bearing resolution is trusted as the renderer's record.
        const optionTemplates = Array.isArray(metadata?.Options) ? metadata.Options : [];
        const analyzedInjectors = Array.isArray(state?.optionsInjector) ? state.optionsInjector.map(analyzeOptionInjector) : [];
        const optionTemplatesMatch = Array.isArray(state?.optionsInjector) && analyzedInjectors.length === optionTemplates.length
            && optionTemplates.every((template, index) => analyzedInjectors[index] !== null && analyzedInjectors[index].template === template);
        const literalOptionsMatch = analyzedInjectors.every((analyzed, index) => analyzed === null || analyzed.variable
            || (Array.isArray(state?.answerOptions) && state.answerOptions[index] === analyzed.template));
        const boxParent = box.parentElement;
        const visualElementMatches = config.visualElementWrapsBox
            ? component.visualElement === boxParent && component.visualElement?.tagName === 'SPAN'
                && boxParent?.childNodes.length === 1 && boxParent?.firstChild === box
            : component.visualElement === box;
        if (component.id !== def.ComponentID || !visualElementMatches || component.renderingParameters?.mode !== 1 || component.marked !== 1
            || metadata?.ComponentTypeCode !== config.componentType || metadata.ComponentID !== def.ComponentID
            || (metadata.Marked !== 0 && metadata.Marked !== 1) || metadata.Marked !== def.Marked
            || typeof state?.userAnswer !== 'string' || typeof state?.isUserAnswerSet !== 'boolean'
            || typeof state?.injectedInitialText !== 'string' || state.injectedInitialText !== '' || metadata?.InitialText !== ''
            || !Array.isArray(state?.answerOptions) || !state.answerOptions.length || state.answerOptions.length > 50 || !state.answerOptions.every(plain)
            || !Array.isArray(metadata?.Options) || !metadata.Options.length || !metadata.Options.every(plain)
            || typeof metadataOptionsJson !== 'string' || typeof definitionOptionsJson !== 'string'
            || definitionOptionsJson !== metadataOptionsJson || def.InitialText !== ''
            || !optionTemplatesMatch || !literalOptionsMatch
            || !Array.isArray(state?.variableOptions)) {
            return refuse('state-shape', {
                boxIndex,
                componentIdMatches: component.id === def.ComponentID,
                visualElementMatches,
                visualElementIsBox: component.visualElement === box,
                visualElementIsBoxParent: component.visualElement === boxParent,
                boxParentChildNodeCount: boxParent ? boxParent.childNodes.length : null,
                renderingMode: safeInteger(component.renderingParameters?.mode),
                renderingModeValid: component.renderingParameters?.mode === 1,
                componentMarked: component.marked === 0 || component.marked === 1 ? component.marked : null,
                componentMarkedValid: component.marked === 1,
                metadataTypeMatches: metadata?.ComponentTypeCode === config.componentType,
                metadataIdMatches: metadata?.ComponentID === def.ComponentID,
                metadataMarked: metadata?.Marked === 0 || metadata?.Marked === 1 ? metadata.Marked : null,
                metadataMarkedValid: metadata?.Marked === 0 || metadata?.Marked === 1,
                definitionMarkedMatches: metadata?.Marked === def.Marked,
                userAnswerIsString: typeof state?.userAnswer === 'string',
                isUserAnswerSetBoolean: typeof state?.isUserAnswerSet === 'boolean',
                injectedInitialTextEmpty: state?.injectedInitialText === '',
                metadataInitialTextEmpty: metadata?.InitialText === '',
                answerOptionCount: Array.isArray(state?.answerOptions) ? state.answerOptions.length : null,
                answerOptionsValid: Array.isArray(state?.answerOptions) && state.answerOptions.every(plain),
                metadataOptionCount: Array.isArray(metadata?.Options) ? metadata.Options.length : null,
                optionInjectorCount: Array.isArray(state?.optionsInjector) ? state.optionsInjector.length : null,
                optionTemplatesMatch,
                literalOptionsMatch,
                definitionOptionsMatch: typeof definitionOptionsJson === 'string' && definitionOptionsJson === metadataOptionsJson,
                variableOptionsIsArray: Array.isArray(state?.variableOptions),
            });
        }
        if (!config.numeric) {
            if (def.CaseSensitive !== metadata.CaseSensitive || def.MarkPunctuation !== metadata.MarkPunctuation
                || def.IgnoredCharacters !== metadata.IgnoredCharacters
                || ![true, false].includes(metadata.CaseSensitive) || ![true, false].includes(metadata.MarkPunctuation)
                || typeof metadata.IgnoredCharacters !== 'string') {
                return refuse('textbox-metadata', {
                    boxIndex,
                    caseSensitiveMatches: def.CaseSensitive === metadata.CaseSensitive,
                    punctuationMatches: def.MarkPunctuation === metadata.MarkPunctuation,
                    ignoredCharactersMatch: def.IgnoredCharacters === metadata.IgnoredCharacters,
                    caseSensitiveValid: metadata.CaseSensitive === true || metadata.CaseSensitive === false,
                    punctuationValid: metadata.MarkPunctuation === true || metadata.MarkPunctuation === false,
                    ignoredCharactersIsString: typeof metadata.IgnoredCharacters === 'string',
                });
            }
        } else {
            // EP chunk606's SF checker counts a leading plus as a digit, and
            // its percent helper reverses negative bounds. Do not normalize
            // those cases into a guessed answer; refuse the slide closed.
            const unsafeSfSign = metadata.RoundingTypeCode === 'SF' && state.answerOptions.some(option => option.startsWith('+'));
            const unsafeNegativePercent = metadata.AcceptableErrorTypeCode === '%' && metadata.AcceptableErrorValue > 0
                && state.answerOptions.some(option => Number(option) < 0);
            if (!state.answerOptions.every(numeric)
                || !validRoundingType(metadata.RoundingTypeCode) || !validErrorType(metadata.AcceptableErrorTypeCode)
                || unsafeSfSign || unsafeNegativePercent
                || !Number.isSafeInteger(metadata.RoundingAmount) || metadata.RoundingAmount < 0 || metadata.RoundingAmount > 15
                || typeof metadata.AcceptableErrorValue !== 'number' || !Number.isFinite(metadata.AcceptableErrorValue) || metadata.AcceptableErrorValue < 0
                || def.RoundingTypeCode !== metadata.RoundingTypeCode || def.RoundingAmount !== metadata.RoundingAmount
                || def.AcceptableErrorTypeCode !== metadata.AcceptableErrorTypeCode || def.AcceptableErrorValue !== metadata.AcceptableErrorValue) {
                return refuse('numeric-metadata', {
                    boxIndex,
                    answerOptionsNumeric: state.answerOptions.every(numeric),
                    roundingType: validRoundingType(metadata.RoundingTypeCode) ? metadata.RoundingTypeCode : null,
                    roundingTypeValid: validRoundingType(metadata.RoundingTypeCode),
                    roundingAmountValid: Number.isSafeInteger(metadata.RoundingAmount) && metadata.RoundingAmount >= 0 && metadata.RoundingAmount <= 15,
                    acceptableErrorType: validErrorType(metadata.AcceptableErrorTypeCode) ? metadata.AcceptableErrorTypeCode : null,
                    acceptableErrorTypeValid: validErrorType(metadata.AcceptableErrorTypeCode),
                    acceptableErrorValueValid: typeof metadata.AcceptableErrorValue === 'number' && Number.isFinite(metadata.AcceptableErrorValue) && metadata.AcceptableErrorValue >= 0,
                    unsafeSfSign,
                    unsafeNegativePercent,
                    definitionRoundingMatches: def.RoundingTypeCode === metadata.RoundingTypeCode && def.RoundingAmount === metadata.RoundingAmount,
                    definitionErrorMatches: def.AcceptableErrorTypeCode === metadata.AcceptableErrorTypeCode && def.AcceptableErrorValue === metadata.AcceptableErrorValue,
                });
            }
        }
        if (box.value !== state.userAnswer || (!state.isUserAnswerSet && state.userAnswer !== '')) {
            return refuse('stored-value', { boxIndex, valueMatchesState: box.value === state.userAnswer, isUserAnswerSet: state.isUserAnswerSet, hasStoredAnswer: state.userAnswer !== '' });
        }
        const answer = config.numeric ? selectNumberAnswer(state.answerOptions, metadata) : state.answerOptions[0];
        if (typeof answer !== 'string') return refuse('answer-acceptance', { boxIndex, roundingType: validRoundingType(metadata.RoundingTypeCode) ? metadata.RoundingTypeCode : null, acceptableErrorType: validErrorType(metadata.AcceptableErrorTypeCode) ? metadata.AcceptableErrorTypeCode : null, optionCount: state.answerOptions.length });
        rows.push({ box, def, component, state, metadata, answer, value: box.value });
    }
    if (new Set(rows.map(r => r.def)).size !== defs.length) return refuse('duplicate-definition', { rowCount: rows.length });
    const signature = JSON.stringify([defs, rows.map(r => [r.metadata, r.state.answerOptions, r.state.variableOptions, r.state.injectedInitialText])]);
    const key = config.keyPrefix + ':' + q.contentID + ':' + q.questionIndex;
    const descriptor = { kind: config.kind, key, autoMarked: true, signature, boxes: rows.map(r => ({ id: r.def.ComponentID, answer: r.answer, value: r.value })) };
    if (baseline && (baseline.q !== q || baseline.model !== model || baseline.renderer !== renderer || baseline.base !== base
        || baseline.descriptor.signature !== signature || baseline.descriptor.key !== key || baseline.rows.length !== rows.length
        || rows.some((r, i) => ['box', 'def', 'component', 'state', 'metadata'].some(k => r[k] !== baseline.rows[i][k])))) {
        return refuse('baseline-changed', {
            sameQuestion: baseline.q === q,
            sameModel: baseline.model === model,
            sameRenderer: baseline.renderer === renderer,
            sameBase: baseline.base === base,
            sameSignature: baseline.descriptor.signature === signature,
            sameKey: baseline.descriptor.key === key,
            sameRowCount: baseline.rows.length === rows.length,
        });
    }
    const result = { descriptor, q, model, renderer, base, rows };
    if (action === 'submit') {
        const mismatchedBox = rows.findIndex(r => r.value !== r.answer);
        if (mismatchedBox >= 0) return refuse('submit-values', { boxIndex: mismatchedBox });
        const bars = [...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b => modelOf(b)?.model === model);
        if (bars.length !== 1) return refuse('submit-controls', { barCount: bars.length, submitButtonCount: null });
        const buttons = [...bars[0].querySelectorAll('button')].filter(b => shown(b) && !b.disabled && b.textContent.trim() === 'Submit');
        if (buttons.length !== 1) return refuse('submit-controls', { barCount: bars.length, submitButtonCount: buttons.length });
        result.target = buttons[0];
    }
    if (Number.isSafeInteger(action)) result.target = rows[action]?.box;
    return action === 'descriptor' ? { descriptor } : result;
}

module.exports = { TEXTBOX_CONFIG, NUMBER_BOX_CONFIG, readInputBoxesInPage };
