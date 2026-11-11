// Source-derived SectionCompletionDialog structure and identity fields, chunk171:
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js
// Diagnosis only. Never read dialog text/answers or invoke callbacks/input.
function readSelectionModalState(baseline,descriptor){
    const own=(object,key)=>{
        const property=object&&Object.getOwnPropertyDescriptor(object,key);
        return property&&'value' in property?property.value:undefined;
    };
    const shown=el=>{
        if(!el||el.hidden||!el.getClientRects().length)return false;
        const style=getComputedStyle(el);
        return style.display!=='none'&&style.visibility!=='hidden';
    };
    const controller=el=>{
        for(let node=el,depth=0;node&&depth<10;node=node.parentElement,depth++){
            const angular=window.angular?.element(node);
            for(const scope of angular?[angular.isolateScope?.(),angular.scope?.()]:[]){
                const self=own(scope,'self');
                if(own(self,'model'))return self;
            }
        }
        return null;
    };
    const context=()=>{
        const roots=[...document.querySelectorAll('#ep-question-container')].filter(shown);
    const root=roots.length===1?roots[0]:null;
    const inner=root&&[...root.querySelectorAll('select,input,textarea,.multi-choice-component')].find(shown);
    const self=controller(inner)||controller(root);
    const model=own(self,'model'),q=own(model,'_currentQuestion'),section=own(self,'sectionData');
    const mode=own(model,'gameMode');
    const contentID=own(q,'contentID'),questionIndex=own(q,'questionIndex');
    const key=Number.isSafeInteger(contentID)&&contentID>0&&Number.isSafeInteger(questionIndex)&&questionIndex>=0
        ?`${descriptor.kind}:${contentID}:${questionIndex}`:null;
        return{model,section,mode,key};
    };
    const {model,section,mode,key}=context();
    if(!baseline)return{valid:!!model&&mode===3&&key===descriptor.key&&!!section,model,section,key};
    const modals=[...document.querySelectorAll('div[uib-modal-window=modal-window]')];
    const visible=modals.filter(shown);
    const backdropCount=[...document.querySelectorAll('div[uib-modal-backdrop=modal-backdrop]')].filter(shown).length;
    const modal=modals.length===1?modals[0]:null;
    const dialog=modal?controller(modal):null;
    const sectionMarkup=element=>{
        const wrapper=element?.querySelector('#modal-section-complete-wrapper');
        const buttons=element?[...element.querySelectorAll('#next-button')]:[];
        const buttonShape=buttons.length===0||(buttons.length===1&&!!wrapper?.querySelector('#modal-section-complete #next-button'));
        return buttonShape&&!!element&&element.classList.contains('section-complete-dialog')
            &&element.querySelectorAll('#modal-section-complete-wrapper').length===1
            &&element.querySelectorAll('#modal-section-complete').length===1
            &&!!wrapper?.querySelector('#modal-section-complete');
    };
    const known=sectionMarkup(modal);
    const next=own(dialog,'nextSection');
    const associated=known&&baseline.valid&&own(dialog,'model')===baseline.model
        &&own(dialog,'currentSection')===baseline.section;
    const nextButton=modal?.querySelector('#next-button');
    const classifySection=()=>{
        if(!associated)return null;
        if(own(dialog,'activityComplete')===true&&next===null)return 'activity-completion-dialog';
        if(own(dialog,'activityComplete')!==false||!next||next===baseline.section)return null;
        if(!Number.isSafeInteger(own(next,'id'))||own(next,'id')<=0)return null;
        if(modal.querySelectorAll('#next-button').length!==1||!modal.querySelector('#modal-section-complete #next-button')||!shown(nextButton)||nextButton.disabled)return null;
        return 'section-next-action-required';
    };
    const diagnostic={kind:'selection-modal',guard:'unknown-modal',modalCount:modals.length,visibleModalCount:visible.length,backdropCount,
        family:known?'section-complete':'unknown',modelMatched:!!model&&model===baseline.model,
        questionChanged:!!key&&key!==baseline.key,sectionChanged:!!section&&section!==baseline.section};
    if(mode===2)return{...diagnostic,guard:'assessment-mode'};
    if(!modals.length)return{...diagnostic,guard:'modal-disappeared-unclassified'};
    if(modals.length!==1)return{...diagnostic,guard:'modal-ambiguous'};
    if(visible.length!==1)return{...diagnostic,guard:'modal-visibility-unverified'};
    const classification=classifySection();
    return classification?{...diagnostic,guard:classification}:diagnostic;
}
async function captureSelectionBaseline(page,descriptor){
    return page.evaluateHandle(readSelectionModalState,null,descriptor).catch(()=>null);
}
async function inspectSelectionModal(page,descriptor,baseline){
    if(!baseline)return{kind:'selection-modal',guard:'baseline-unavailable'};
    try{
        const handle=await page.evaluateHandle(readSelectionModalState,baseline,descriptor);
        try{return await handle.jsonValue();}finally{await handle.dispose();}
    }catch{return{kind:'selection-modal',guard:'inspection-uncertain'};}
}
module.exports={readSelectionModalState,captureSelectionBaseline,inspectSelectionModal};
