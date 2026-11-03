// Per-round question detection for the answer loop.
//
// The classic flow knows exactly one question shape: text in #question-text,
// answered into input#answer-text. Smart Lessons/Assessments and the audio
// modes (Listening, Dictation) render different shapes, so every pass of the
// loop starts by asking the page what it is actually showing (issue #33, #32).
//
// The selector and state facts below were audited against the live EP app on
// 2026-10-30 (an Italian Smart Lesson choice slide, and Listening + Dictation
// modes on a vocabulary list), not derived from mocks. Live-verified:
//
//   - Smart Lesson slides mount under #ep-question-container and never render
//     #question-text. The prompt lives in #question-container-group as styled
//     spans (no semantic marker on the target word).
//   - A multiple-choice slide is div.multi-choice-component[role=radiogroup]
//     with div.mcq-preview-option[role=option] children. The per-option ids
//     (check, content-container, button-group) repeat per option, so only the
//     class hooks are safe to select on. (The selected-state styling was NOT
//     observed - no option was ever clicked - so selection is done with a
//     trusted click on the option element, not by reading classes.)
//   - Audio tasks render a .voice-speaker speaker button; #question-text
//     exists but is hidden and empty, and the answer still goes into the
//     visible input#answer-text. Listening and Dictation render the same
//     markup, differing only in prompt text, answer language and
//     translationMode (2 vs 3).
//   - Round identity fields on the same scope state: contentID was captured
//     as a number on both surfaces (lesson 1643503, audio 173943);
//     questionIndex was captured as a number (0) on both the lesson slide and
//     a Listening item (2026-10-30 follow-up read); translationMode was
//     captured as 2 (Listening) and 3 (Dictation), and 4 on the choice slide.
//   - The 2026-10-30 follow-up Listening probe confirmed CONTROLLER
//     self.sectionData === undefined (the earlier probe read the wrong model
//     path). Dictation's controller absence was not separately rechecked.
//     The list-context signal is contentSource.selectedActivity (see below).
//   - EP is an AngularJS app. The current question's data - including the
//     answers EP ships to the client - is readable before any submission from
//     the component scope:
//       multi-choice: scope.self.model._currentQuestion.questionDef
//           .Components[].Options[] with Correct === "true" on the right one
//           (verified live: the Correct option matched the rendered options)
//       translation/audio: scope.self.model._currentQuestion.validAnswers[]
//           .outputString (accepted answers, response language; verified live
//           on both Listening and Dictation items)
//     When that scope state is unreadable the descriptor says so explicitly;
//     the loop must stop and report rather than guess (no answer source is
//     better than a wrong one).
//
// NOT live-verified: the lesson short-answer ("typed") branch. No short-answer
// lesson slide was observed; that branch extrapolates the audio task's
// validAnswers shape to lesson slides with a visible answer box, and the
// fixtures exercise it only through the mock.
//
// detectQuestionInPage runs INSIDE the page (via page.evaluate); it must stay
// self-contained: no references to anything outside its own body.

/**
 * Classifies the question currently on screen.
 * @returns {null|object} null during round transitions, otherwise a descriptor:
 *   {kind:'text', text}                        classic word-to-word question
 *   {kind:'audio', key, answers[], translationMode}
 *   {kind:'choice', key, options[{text,visible}], correct[], multi, autoMarked}
 *   {kind:'typed', key, answers[], questionType}   lesson short-answer slide
 *   {kind:'unsupported', reason}               recognised shape, no answer source
 */
// One static Puppeteer callback serves detection (no arguments) and handle
// reads (element, descriptor), sharing the exact renderer association checks.
function detectQuestionInPage(el, descriptor) {
    // Read existing cached objects only. No renderer initialization, conversion,
    // selection, text equivalence or positional assumptions. Public EP bundles:
    // 171 EPTestQuestion.cachedRenderers[MODE_QUESTION=1]; 606 ComponentIndex,
    // MultiChoiceComponentState.previewOptions and MCQPreviewOption element/option.
    function readMathChoiceInPage(group, q, comp) {
        const fail = () => null;
        const marked = o => o?.Correct === true || (typeof o?.Correct === 'string' && o.Correct.toLowerCase() === 'true');
        const visible = el => !!el && (el.offsetParent !== null || el.getClientRects().length > 0);
        if (typeof comp.ComponentID !== 'string' || !comp.ComponentID) return fail();
        const raw = comp.Options;
        if (!Array.isArray(raw) || !raw.length || raw.length > 100
            || raw.some(o => typeof o?.TextTemplate !== 'string' || !o.TextTemplate.trim() || !o.TextTemplate.includes('`'))
            || new Set(raw.map(o => o.TextTemplate)).size !== raw.length) return fail();
        // Access dictionary properties, not lazy public getters that may initialize
        // a renderer. Every object must already be bound to this exact live DOM.
        const registry = q.cachedRenderers?.[1]?.identifiedComponents?.baseComponents;
        const components = registry?.[comp.ComponentID];
        if (!Array.isArray(components) || components.length !== 1) return fail();
        const component = components[0];
        const state = component?.componentState;
        const metadata = state?.metadataInstance;
        const previews = state?.previewOptions;
        const elements = [...group.querySelectorAll('div.mcq-preview-option')].filter(visible);
        if (component.type !== 'multichoice' || component.id !== comp.ComponentID
            || component.visualElement !== group || metadata?.ComponentID !== comp.ComponentID
            || metadata.AllowMultiSelect !== comp.AllowMultiSelect
            || !Array.isArray(metadata.Options) || metadata.Options.length !== raw.length
            || !Array.isArray(previews) || previews.length !== elements.length || !elements.length
            || new Set(previews.map(p => p?.element)).size !== previews.length) return fail();
        // EP clones raw metadata, then resolves TextTemplate AND Correct in
        // metadataInstance. Raw/resolved string equality is not an identity.
        // Ground the current resolved state in the same cached object graph EP
        // uses for selection/marking; never evaluate variables or infer indexes.
        const original = state.originalMultiChoiceOptions;
        const displayed = state.displayedOptions;
        const sameObjects = (a, b) => Array.isArray(a) && Array.isArray(b)
            && a.length === b.length && new Set(a).size === a.length
            && new Set(b).size === b.length && a.every(o => b.includes(o));
        if (state.componentID !== comp.ComponentID
            || !sameObjects(original, metadata.Options)
            || !sameObjects(displayed, previews.map(p => p?.option))
            || !displayed.every(o => metadata.Options.includes(o))) return fail();
        if (metadata.Options.some(o => typeof o?.TextTemplate !== 'string' || !o.TextTemplate.trim()
            || !o.TextTemplate.includes('`') || typeof o.Correct !== 'string'
            || !['true', 'false'].includes(o.Correct.toLowerCase()))
            || new Set(metadata.Options.map(o => o.TextTemplate)).size !== raw.length) return fail();
        const rows = [];
        for (const el of elements) {
            const matches = previews.filter(p => p?.element === el);
            if (matches.length !== 1) return fail();
            const preview = matches[0], option = preview.option;
            if (!metadata.Options.includes(option) || option.PreviewOption !== preview
                || preview.componentID !== comp.ComponentID || preview.correct !== marked(option)
                || preview.renderer?.templateString !== option.TextTemplate
                || !el.querySelector('.katex, math, .inline-formula')
                || el.querySelector('img:not(.answer-icon)')
                || !el.contains(preview.fields?.renderGroup)) return fail();
            rows.push({ element: el, text: option.TextTemplate, correct: marked(option) });
        }
        if (new Set(rows.map(r => r.text)).size !== rows.length) return fail();
        // Do not silently reduce the correct set to displayed/readable subset.
        if (rows.filter(r => r.correct).length !== metadata.Options.filter(marked).length) return fail();
        rows.signature = JSON.stringify([raw.map(o => [o.TextTemplate, o.Correct]), metadata.Options.map(o => [o.TextTemplate, o.Correct])]);
        return rows;
    }

    if (el) {
        if (descriptor.representation === 'renderer-template') {
            const groups = [...document.querySelectorAll('div.multi-choice-component[role=radiogroup]')]
                .filter(g => g.offsetParent !== null || g.getClientRects().length > 0);
            if (groups.length !== 1 || !groups[0].contains(el)) return { visible: false, text: '' };
            let q, self;
            for (let node = groups[0], depth = 0; node && depth < 8; node = node.parentElement, depth++) {
                const scope = window.angular?.element(node)?.scope?.();
                if (scope?.self?.model?._currentQuestion) { self = scope.self; q = self.model._currentQuestion; break; }
            }
            if (!q || self.sectionData?.activityGroup?.isAutoMarked !== true || `choice:${q.contentID}:${q.questionIndex}` !== descriptor.key) return { visible: false, text: '' };
            const choices = q.questionDef?.Components?.filter(c => c?.ComponentTypeCode === 'MULTICHOICE_COMPONENT');
            if (choices?.length !== 1 || ![false, 'false'].includes(choices[0].AllowMultiSelect)) return { visible: false, text: '' };
            const rows = readMathChoiceInPage(groups[0], q, choices[0]);
            if (!rows || rows.signature !== descriptor.associationSignature || JSON.stringify(rows.filter(r => r.correct).map(r => r.text)) !== JSON.stringify(descriptor.correct)) return { visible: false, text: '' };
            const row = rows.find(r => r.element === el);
            return { visible: !!row, text: row?.text || '' };
        }
        const clone = el.cloneNode(true);
        clone.querySelectorAll('.shortcut-key').forEach(k => k.remove());
        return {
            visible: el.offsetParent !== null || el.getClientRects().length > 0,
            text: (clone.textContent || '')
                .replace(/@@[0-9A-Fa-f]{6}@/g, '').replace(/@@/g, '')
                .replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim(),
        };
    }

    // EP's rich-text template fields carry markup like @@009900@...@@ and
    // [multichoice id="..."]; strip it before comparing text.
    const stripMarkup = (value) => String(value == null ? '' : value)
        .replace(/@@[0-9A-Fa-f]{6}@/g, '')
        .replace(/@@/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const visible = (el) => !!(el && (el.offsetParent !== null
        || (el.getClientRects && el.getClientRects().length > 0)));

    // The game model hangs off the AngularJS scope's `self`. EP nests
    // components, so walk up a few ancestors looking for a scope that has the
    // current question on it.
    const currentQuestionFrom = (el) => {
        if (!el || !window.angular || typeof angular.element !== 'function') return null;
        for (let node = el, depth = 0; node && depth < 8; node = node.parentElement, depth++) {
            try {
                const scope = angular.element(node).scope && angular.element(node).scope();
                const self = scope && scope.self;
                if (self && self.model && self.model._currentQuestion) {
                    return { self, question: self.model._currentQuestion };
                }
            } catch (e) { /* not a scoped node; keep walking */ }
        }
        return null;
    };

    const validAnswersOf = (q) => (Array.isArray(q.validAnswers) ? q.validAnswers : [])
        .map(a => a && a.outputString)
        .filter(s => typeof s === 'string' && s.trim() !== '');

    // How EP says this activity is graded, with provenance. Captured live
    // (2026-10-30) on a Smart Lesson at
    // scope.self.sectionData.activityGroup: isAutoMarked: true as a real
    // boolean (alongside isSelfMarked: false, QuestionMarkingStyle: -1). The
    // field was NEVER captured on an audio task, so its absence there proves
    // nothing. Fail closed everywhere: only an explicit boolean true is
    // "auto"; an explicit false is manual; anything else (missing field,
    // missing sectionData, non-boolean) is 'unknown', and handlers must not
    // treat unknown as auto.
    const autoMarkingOf = (self) => {
        try {
            const group = self?.sectionData?.activityGroup;
            if (!group) return 'unknown';
            if (group.isAutoMarked === true) return true;
            if (group.isAutoMarked === false) return false;
            return 'unknown';
        } catch (e) { return 'unknown'; }
    };

    // Whether controller sectionData EXISTS at all. Only undefined permits
    // considering the list allowance; null, a number or any other malformed
    // value is present-but-wrong. Controller absence was confirmed on Listening
    // in the 2026-10-30 follow-up, not separately rechecked on Dictation.
    const sectionDataPresentOf = (self) => {
        try {
            return !(self && self.sectionData === undefined);
        } catch (e) { return true; }   // unreadable: treat as present, never as the captured absent shape
    };

    // The follow-up Listening probe confirmed self.sectionData is undefined;
    // the earlier probe read the wrong game-model path. Dictation controller
    // absence remains inferred. The captured positive context signal is
    // model.contentSource.selectedActivity with
    //   _taskID: null        (not an assigned task)
    //   _activityType: 1     (vocabulary list)
    //   _contentType: 1      (translation content)
    // The inference "a self-test list game has no teacher-marking surface" is
    // exactly that - an inference from these field values, partially
    // corroborated by EP's own help centre distinguishing assigned work (with
    // marking options) from self-directed library learning. It is NOT proof:
    // the full captured shape must match, and anything else stays stopped.
    const selfTestListOf = (self) => {
        try {
            const sa = self && self.model && self.model.contentSource && self.model.contentSource.selectedActivity;
            if (!sa || typeof sa !== 'object') return false;
            return sa._taskID === null && sa._activityType === 1 && sa._contentType === 1;
        } catch (e) { return false; }
    };

    const validIdentity = q => Number.isSafeInteger(q.contentID) && q.contentID > 0
        && Number.isSafeInteger(q.questionIndex) && q.questionIndex >= 0;

    // 1. multiple-choice slide (Smart Lessons / Assessments)
    const groups = [...document.querySelectorAll('div.multi-choice-component[role=radiogroup]')].filter(visible);
    if (groups.length > 1) return { kind: 'unsupported', reason: 'multiple visible choice components; cannot safely associate answer state with one component' };
    const group = groups[0];
    if (group) {
        const found = currentQuestionFrom(group);
        if (!found) return { kind: 'unsupported', reason: 'choice question detected, but EP\'s answer state could not be read (AngularJS scope unavailable)' };
        const { self, question: q } = found;
        const components = q.questionDef?.Components;
        const choices = (Array.isArray(components) ? components : [])
            .filter(c => c?.ComponentTypeCode === 'MULTICHOICE_COMPONENT');
        if (choices.length !== 1) return { kind: 'unsupported', reason: 'choice slide without exactly one identifiable multi-choice component in the readable question state' };
        const comp = choices[0];
        if (!Array.isArray(comp.Options)) return { kind: 'unsupported', reason: 'choice option metadata is missing or unreadable; no answer was selected' };
        // EP's public renderer compares Correct.toLowerCase() with 'true'.
        // Source: main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
        // Preserve boolean support, but never coerce numbers or other values.
        let correct = comp.Options
            .filter(o => o && (o.Correct === true
                || (typeof o.Correct === 'string' && o.Correct.toLowerCase() === 'true')))
            .map(o => typeof o.TextTemplate === 'string' ? stripMarkup(o.TextTemplate) : '');
        // Never reduce a partially unreadable answer set to a plausible subset.
        // Raw formula templates enter the guarded path before math DOM is ready.
        const hasMath = comp.Options.some(o => typeof o?.TextTemplate === 'string' && o.TextTemplate.includes('`'))
            || !!group.querySelector('.katex, math, .inline-formula');
        const mathRows = hasMath ? readMathChoiceInPage(group, q, comp) : null;
        if (hasMath && !mathRows) return { kind: 'unsupported', reason: 'formula choices lack a unique current renderer-to-option association; stopping instead of guessing' };
        if (mathRows) correct = mathRows.filter(r => r.correct).map(r => r.text);
        if (correct.includes('')) return { kind: 'unsupported', reason: 'a correct-marked choice option has no usable text; stopping with incomplete answer metadata' };
        const options = mathRows ? mathRows.map(r => ({ text: r.text, visible: true })) : Array.from(group.querySelectorAll('div.mcq-preview-option')).map(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.shortcut-key').forEach(k => k.remove());
            return { text: stripMarkup(clone.textContent), visible: visible(el) };
        });
        // A round key needs a stable identity: without both fields the caller
        // cannot tell one slide from the next and must not answer.
        if (!validIdentity(q)) {
            return { kind: 'unsupported', reason: 'choice question without a stable identity (contentID/questionIndex missing from EP\'s question state)' };
        }
        return {
            kind: 'choice',
            ...(mathRows ? { representation: 'renderer-template', associationSignature: mathRows.signature } : {}),
            key: `choice:${q.contentID}:${q.questionIndex}`,
            options,
            correct,
            multi: comp.AllowMultiSelect !== false && comp.AllowMultiSelect !== 'false',
            autoMarked: autoMarkingOf(self),
        };
    }

    // 2. audio task (Listening / Dictation): speaker button instead of question text
    const speaker = [...document.querySelectorAll('.voice-speaker')].find(visible);
    if (speaker) {
        const found = currentQuestionFrom(speaker);
        if (!found) return { kind: 'unsupported', reason: 'audio task detected, but EP\'s answer state could not be read (AngularJS scope unavailable)' };
        const { self, question: q } = found;
        // contentID alone does not identify a round: items repeat within a list
        // and the same item appears in both Listening and Dictation. The mode
        // (translationMode: 2 = Listening, 3 = Dictation) disambiguates.
        if (!validIdentity(q)) {
            return { kind: 'unsupported', reason: 'audio question without a stable identity (contentID/questionIndex missing from EP\'s question state)' };
        }
        // only the two captured audio modes are answered; any other speaker
        // slide is an unverified shape and stops
        if (q.translationMode !== 2 && q.translationMode !== 3) {
            return { kind: 'unsupported', reason: `speaker slide with an unexpected translationMode (${q.translationMode}); only Listening (2) and Dictation (3) were captured live` };
        }
        return {
            kind: 'audio',
            key: `audio:${q.contentID}:${q.questionIndex}:${q.translationMode}`,
            answers: validAnswersOf(q),
            translationMode: q.translationMode,
            autoMarked: autoMarkingOf(self),
            sectionDataPresent: sectionDataPresentOf(self),
            // positive identification of the captured self-test list context;
            // the caller may use it ONLY when sectionData is absent - the
            // captured live shape - never when a present sectionData is merely
            // unreadable
            selfTestList: selfTestListOf(self),
        };
    }

    // 3. classic text question
    const qt = document.querySelector('#question-text');
    if (visible(qt) && qt.textContent.trim() !== '') return { kind: 'text', text: qt.textContent };

    // 4. Smart Lesson short-answer slide: no #question-text, but a visible answer
    // box under the lesson container. NOT live-verified (see the header note):
    // extrapolated from the audio task's shape.
    const lesson = document.querySelector('#ep-question-container');
    if (lesson) {
        const box = document.querySelector('input#answer-text');
        if (box && visible(box)) {
            const found = currentQuestionFrom(box) || currentQuestionFrom(lesson);
            if (!found) return { kind: 'unsupported', reason: 'lesson text question detected, but EP\'s answer state could not be read (AngularJS scope unavailable)' };
            const { self, question: q } = found;
            if (!validIdentity(q)) {
                return { kind: 'unsupported', reason: 'lesson text question without a stable identity (contentID/questionIndex missing from EP\'s question state)' };
            }
            return {
                kind: 'typed',
                key: `typed:${q.contentID}:${q.questionIndex}`,
                answers: validAnswersOf(q),
                questionType: q.questionType,
                autoMarked: autoMarkingOf(self),
            };
        }
        // a rendered lesson slide with neither a choice component, a speaker, nor
        // an answer box is a question type this program does not support
        const rendered = lesson.querySelector('#question-container-group');
        if (rendered && rendered.textContent.trim() !== '') {
            return { kind: 'unsupported', reason: 'lesson slide with an unsupported question type (not text, choice, or audio)' };
        }
    }

    // nothing recognised: round transition, navigation, or task end
    return null;
}

/**
 * Runs detection in the page. Never throws on transient page states.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<null|object>}
 */
async function detectQuestion(page) {
    try {
        return await page.evaluate(detectQuestionInPage);
    } catch (e) {
        if (/Execution context was destroyed|Cannot find context|detached Frame|Target closed|Session closed/i.test(String(e.message))) return null;
        return { kind: 'unsupported', reason: `Question detection failed: ${e.message}` };
    }
}

module.exports = { detectQuestionInPage, detectQuestion };
