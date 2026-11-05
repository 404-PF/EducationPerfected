// Invented source-derived renderer fixture, not captured EP account DOM.
async function setup(page, origin) {
    await page.goto(origin + '/lesson');
    await page.waitForSelector('.mcq-preview-option');
    await page.evaluate(() => {
        const group = document.querySelector('.multi-choice-component');
        const q = window.angular.element(group).scope().self.model._currentQuestion;
        const comp = q.questionDef.Components[0];
        comp.ComponentID = 'synthetic-choice';
        const elements = [...group.querySelectorAll('.mcq-preview-option')];
        // Invented formula markup mimics aggregate categories, NOT captured
        // user content or an asserted grammar for the actual failing slide.
        comp.Options = elements.map((el, i) => ({ TextTemplate: `[block align="center"\n\`\`\`x^{${i + 1}}\`\`\`\n]`, Correct: i === 1 ? 'True' : 'false' }));
        const metadata = { ...comp, Options: comp.Options.map(o => ({ ...o })) };
        const previews = elements.map((el, i) => {
            el.querySelectorAll('.shortcut-key').forEach(e => e.remove());
            el.replaceChildren();
            const renderGroup = document.createElement('div');
            renderGroup.innerHTML = '<span class="inline-formula"><span class="katex"><math><annotation encoding="application/x-tex">DUPLICATE MATH TEXT</annotation></math><span>DUPLICATE MATH TEXT</span></span></span>';
            el.append(renderGroup);
            const option = metadata.Options[i];
            const preview = { componentID: comp.ComponentID, correct: option.Correct.toLowerCase() === 'true', element: el, option, fields: { renderGroup }, renderer: { templateString: option.TextTemplate } };
            option.PreviewOption = preview;
            return preview;
        });
        const component = { type: 'multichoice', id: comp.ComponentID, visualElement: group, componentState: { componentID: comp.ComponentID, originalMultiChoiceOptions: metadata.Options.slice(), displayedOptions: previews.map(p => p.option), metadataInstance: metadata, previewOptions: previews } };
        q.cachedRenderers = { 1: { identifiedComponents: { baseComponents: { [comp.ComponentID]: [component] } } } };
        window.mathFixture = { q, comp, metadata, previews, component, group, clicks: [] };
        // Capture-phase intercept avoids fixture grading logic, no network.
        group.addEventListener('click', event => {
            const el = event.target.closest('.mcq-preview-option');
            if (el) { event.stopImmediatePropagation(); window.mathFixture.clicks.push(previews.find(p => p.element === el)?.option.TextTemplate); }
        }, true);
    });
}
module.exports = { setup };
