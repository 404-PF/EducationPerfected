// Invented sanitized fixture derived from public chunk606, not live account DOM.
function installGapsFixture(config = {}) {
    document.querySelector('#question-container-group').textContent = config.repeated
        ? 'Synthetic repeated-label gaps: circumference and diameter.'
        : 'Synthetic drag-and-drop gaps: beta then alpha.';
    const old = document.querySelector('.multi-choice-component');
    const self = window.angular.element(old).scope().self, q = self.model._currentQuestion;
    self.model.gameMode = 3;
    const group = document.createElement('div'); group.className = 'fitg-component fitg-drag-drop'; old.replaceWith(group);
    const comp = { ComponentTypeCode: 'FILL_IN_GAPS_COMPONENT', ComponentID: 'synthetic-gaps', InputType: 2,
        Gaps: [{ ID: 41, CorrectOptions: ['alpha'], IncorrectOptions: ['wrong'] }, { ID: 7, CorrectOptions: ['beta'], IncorrectOptions: ['wrong'] }, { ID: 88, CorrectOptions: ['unshown'], IncorrectOptions: [] }], TextTemplate: 'Gap [7:beta] then [41:alpha] and hidden [88:unshown]' };
    if (config.repeated) {
        comp.Gaps = [
            {ID:41,CorrectOptions:['Diameter'],IncorrectOptions:[]},
            {ID:7,CorrectOptions:['Circumference'],IncorrectOptions:[]},
            {ID:88,CorrectOptions:['Circumference'],IncorrectOptions:[]},
            {ID:52,CorrectOptions:['Diameter'],IncorrectOptions:[]}
        ];
        comp.TextTemplate = 'Step 1 [7:Circumference] Step 2 [41:Diameter] Step 3 [88:Circumference] = pi x [52:Diameter]';
    }
    const metadata = JSON.parse(JSON.stringify(comp));
    q.questionDef.Components = [comp];
    const state = { metadataInstance: metadata, gapIDtoIndex: { 41: 0, 7: 1, 88: 2 }, gapIndexesShown: [0,1], hintsShown: config.hints||['wrong','alpha','beta'],
        usersAnswers: {}, checkOptions: [], identifiedComponents: { baseComponents: {} } };
    if (config.repeated) Object.assign(state, {gapIDtoIndex:{41:0,7:1,88:2,52:3},gapIndexesShown:[0,1,2,3],hintsShown:['Circumference','π','Radius','Circumference','Diameter','Diameter']});
    const renderer = { id: comp.ComponentID, componentState: state, container: group, renderingParameters: {mode:1}, dropZones: [], draggables: [] };
    const component = { id: comp.ComponentID, componentState: state, visualElement: group, renderingParameters: {mode:1}, questionRenderer: renderer };
    const f = window.gapsFixture = { self, q, comp, metadata, state, renderer, component, group, inputs: [], submits: 0, nexts: 0 };
    // Angular scope is recovered from an ancestor, as in a lesson slide.
    const angular = window.angular;
    window.angular = { ...angular, element: el => el === group ? { scope: () => ({self}) } : angular.element(el) };
    const list = document.createElement('div'); list.className = 'fitg-drag-list'; group.append(list);
    for (const [i,text] of state.hintsShown.entries()) {
        const el = document.createElement('div'); el.className = 'draggable question'; el.textContent = text;
        el.style.cssText='display:inline-block;padding:6px;margin:4px;border:1px solid #aaa';
        el.tabIndex = i ? -1 : 0; el.setAttribute('data-draggable-index', String(i)); list.append(el);
        renderer.draggables.push({target:el});
        el.addEventListener('keydown', e => {
            if (!['Enter',' '].includes(e.key)) return;
            e.preventDefault();e.stopImmediatePropagation();
            f.inputs.push({index:i,trusted:e.isTrusted});
            if (!f.ignoreInput && !el.classList.contains('used')) {
                const zone = [...renderer.dropZones].sort((a,b) => a.span.compareDocumentPosition(b.span)&4?-1:1).find(z=>!z.span.textContent.trim());
                if (zone) { zone.span.textContent=text; zone.droppedDragID=i; zone.containerSpan.className='fitg-inline-dropzone filled';el.classList.add('used'); }
            }
            f.afterInput?.();
        });
    }
    // DOM order beta then alpha intentionally differs from metadata order.
    for (const id of (config.repeated ? [7,41,88,52] : [7,41])) {
        const wrap = document.createElement('span'); wrap.className='fitg-inline-dropzone empty';wrap.id=comp.ComponentID+'_input_'+id;
        const span = document.createElement('span'); span.className='dropzone-answer'; span.id=String(id);span.textContent='\u00a0';wrap.append(span);
        wrap.style.cssText='display:inline-block;min-width:70px;min-height:22px;border:1px solid #777;padding:4px;margin:4px';
        group.append(document.createTextNode(' Gap '+id+': '),wrap);
        const zone = {id:String(id),span,containerSpan:wrap,droppedDragID:null};
        renderer.dropZones.unshift(zone);state.identifiedComponents.baseComponents[String(id)]=[zone];
    }
    q.cachedRenderers={1:{identifiedComponents:{baseComponents:{[comp.ComponentID]:[component]}}}};
    const oldSubmit=[...document.querySelectorAll('#sa-navigation-controls button')].find(b=>b.textContent.trim()==='Submit');
    const submit=oldSubmit.cloneNode(true);oldSubmit.replaceWith(submit);
    submit.addEventListener('click',e=>{
        f.submits++;
        if(f.keepSame){submit.textContent='Next Question';return;}
        q.questionIndex++;
        if(f.continueOnly){group.remove();document.querySelector('#question-container-group')?.remove();f.self.model._currentQuestion=null;let next=document.querySelector('button.continue-button');if(!next){next=document.createElement('button');next.className='continue-button';next.textContent='Continue';document.body.append(next);}next.hidden=false;next.style.display='';}
        if(f.complete){group.hidden=true;const exit=document.querySelector('button.exit-button');exit.hidden=false;exit.style.display='';}
    });
}
module.exports = { installGapsFixture };
