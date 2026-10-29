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
//   - List audio tasks ship no sectionData (captured on Listening); their
//     self-test list context is identified from
//     contentSource.selectedActivity instead (see selfTestListOf). Dictation
//     was not re-inspected for this - it shares the pipeline, but that exact
//     field absence was captured on Listening only.
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
function detectQuestionInPage() {
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

    const validAnswersOf = (q) => (q.validAnswers || [])
        .map(a => a && a.outputString)
        .filter(s => typeof s === 'string' && s.trim() !== '');

    // How EP says this activity is graded, with provenance. Captured live
    // (2026-10-30) on a Smart Lesson at
    // scope.self.model.sectionData.activityGroup: isAutoMarked: true as a real
    // boolean (alongside isSelfMarked: false, QuestionMarkingStyle: -1). The
    // field was NEVER captured on an audio task, so its absence there proves
    // nothing. Fail closed everywhere: only an explicit boolean true is
    // "auto"; an explicit false is manual; anything else (missing field,
    // missing sectionData, non-boolean) is 'unknown', and handlers must not
    // treat unknown as auto.
    const autoMarkingOf = (self) => {
        try {
            const group = self && self.model && self.model.sectionData && self.model.sectionData.activityGroup;
            if (!group) return 'unknown';
            if (group.isAutoMarked === true) return true;
            if (group.isAutoMarked === false) return false;
            return 'unknown';
        } catch (e) { return 'unknown'; }
    };

    // Whether sectionData EXISTS at all. ONLY `undefined` is the captured
    // list-task shape; null, a number, or any other non-object is
    // present-but-wrong and must not borrow the list allowance.
    const sectionDataPresentOf = (self) => {
        try {
            return !(self && self.model && self.model.sectionData === undefined);
        } catch (e) { return true; }   // unreadable: treat as present, never as the captured absent shape
    };

    // List audio tasks (Listening/Dictation on a vocabulary list) ship NO
    // sectionData at all (captured live 2026-10-30 on the "At the Doctor"
    // list, Listening mode: self.model.sectionData was undefined), so the
    // marking flag cannot be read there. What that capture DID ship is a
    // positive context signal: model.contentSource.selectedActivity with
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

    // 1. multiple-choice slide (Smart Lessons / Assessments)
    const group = document.querySelector('div.multi-choice-component[role=radiogroup]');
    if (group) {
        const found = currentQuestionFrom(group);
        if (!found) return { kind: 'unsupported', reason: 'choice question detected, but EP\'s answer state could not be read (AngularJS scope unavailable)' };
        const { self, question: q } = found;
        const comp = ((q.questionDef && q.questionDef.Components) || [])
            .find(c => c && c.ComponentTypeCode === 'MULTICHOICE_COMPONENT');
        if (!comp) return { kind: 'unsupported', reason: 'choice slide without multi-choice data in EP\'s question state' };
        const correct = (comp.Options || [])
            .filter(o => o && (o.Correct === true || o.Correct === 'true'))
            .map(o => stripMarkup(o.TextTemplate));
        const options = Array.from(document.querySelectorAll('div.mcq-preview-option')).map(el => {
            const clone = el.cloneNode(true);
            clone.querySelectorAll('.shortcut-key').forEach(k => k.remove());
            return { text: stripMarkup(clone.textContent), visible: visible(el) };
        });
        // A round key needs a stable identity: without both fields the caller
        // cannot tell one slide from the next and must not answer.
        if (q.contentID === undefined || q.questionIndex === undefined) {
            return { kind: 'unsupported', reason: 'choice question without a stable identity (contentID/questionIndex missing from EP\'s question state)' };
        }
        return {
            kind: 'choice',
            key: `choice:${q.contentID}:${q.questionIndex}`,
            options,
            correct,
            multi: !!comp.AllowMultiSelect,
            autoMarked: autoMarkingOf(self),
        };
    }

    // 2. audio task (Listening / Dictation): speaker button instead of question text
    const speaker = document.querySelector('.voice-speaker');
    if (speaker) {
        const found = currentQuestionFrom(speaker);
        if (!found) return { kind: 'unsupported', reason: 'audio task detected, but EP\'s answer state could not be read (AngularJS scope unavailable)' };
        const { self, question: q } = found;
        // contentID alone does not identify a round: items repeat within a list
        // and the same item appears in both Listening and Dictation. The mode
        // (translationMode: 2 = Listening, 3 = Dictation) disambiguates.
        if (q.contentID === undefined || q.questionIndex === undefined) {
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
    if (qt && qt.textContent.trim() !== '') return { kind: 'text', text: qt.textContent };

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
            if (q.contentID === undefined || q.questionIndex === undefined) {
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
        return null;
    }
}

module.exports = { detectQuestionInPage, detectQuestion };
