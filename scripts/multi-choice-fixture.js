// Invented source-derived EP multi-select fixture. Never real account/question data.
function installMultiChoiceFixture() {

        const group = document.querySelector('.multi-choice-component');
        const prompt = document.querySelector('#question-container-group');
        if (prompt) prompt.textContent = 'Synthetic multi-select: choose alpha and gamma.';
        const self = window.angular.element(group).scope().self;
        const q = self.model._currentQuestion;
        self.model.gameMode = 3;
        group.classList.add('multi-select'); group.setAttribute('role', 'group');
        const comp = q.questionDef.Components[0];
        comp.ComponentID = 'invented-multi'; comp.AllowMultiSelect = true;
        comp.Options = [
            { TextTemplate: 'Invented alpha', Correct: 'true' },
            { TextTemplate: 'Invented beta', Correct: 'false' },
            { TextTemplate: 'Invented gamma', Correct: 'TRUE' },
        ];
        const metadata = { ...comp, Options: comp.Options.map(o => ({ ...o })) };
        const original = metadata.Options;
        const displayed = [original[2], original[0], original[1]];
        group.replaceChildren();
        const state = { componentID: comp.ComponentID, originalMultiChoiceOptions: original, displayedOptions: displayed,
            metadataInstance: metadata, optionsOrderUsingOriginalIndexAsID: [2,0,1], selectedOptions: [] };
        const fixture = window.multiFixture = { self, q, comp, metadata, state, group, clicks: [], submits: 0, nexts: 0 };
        state.previewOptions = displayed.map(option => {
            const el = document.createElement('div'); el.className = 'mcq-preview-option'; el.setAttribute('role', 'option');
            el.innerHTML = '<div id="content-container"><div id="button-group"><input type="checkbox" id="check"/><div id="render-group"></div></div></div>';
            const renderGroup = el.querySelector('#render-group'); renderGroup.textContent = option.TextTemplate;
            const preview = { element: el, option, componentID: comp.ComponentID, allowMulti: true, correct: option.Correct.toLowerCase() === 'true',
                editable: true, isSelected: false, renderer: { templateString: option.TextTemplate }, fields: { renderGroup, check: el.querySelector('input') } };
            option.PreviewOption = preview;
            el.addEventListener('click', () => {
                fixture.clicks.push(original.indexOf(option));
                if (!fixture.ignoreClicks) {
                    preview.isSelected = !preview.isSelected; preview.fields.check.checked = preview.isSelected;
                    el.setAttribute('aria-selected', String(preview.isSelected));
                    state.selectedOptions = state.previewOptions.filter(p => p.isSelected).map(p => original.indexOf(p.option));
                }
                if (fixture.mutateOnClick) fixture.mutateOnClick();
            });
            group.prepend(el); return preview;
        });
        const component = fixture.component = { type: 'multichoice', id: comp.ComponentID, visualElement: group, componentState: state };
        q.cachedRenderers = { 1: { identifiedComponents: { baseComponents: { [comp.ComponentID]: [component] } } } };
        const submit = [...document.querySelectorAll('#sa-navigation-controls button')].find(b => b.textContent.trim() === 'Submit');
        submit.addEventListener('click', e => {
            e.stopImmediatePropagation(); fixture.submits++;
            const ids = [...state.selectedOptions].sort((a,b) => a-b);
            if (JSON.stringify(ids) === '[0,2]') {
                q.questionIndex++;
                if (fixture.completeOnSubmit) {
                    group.hidden = true;
                    document.querySelector('button.exit-button').hidden = false;
                    document.querySelector('button.exit-button').style.display = '';
                }
            }
        }, true);

}
module.exports = { installMultiChoiceFixture };
