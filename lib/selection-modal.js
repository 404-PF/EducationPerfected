// Source-derived SectionCompletionDialog structure and identity fields, chunk171:
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js
// Read-only. No dialog text, answers, callbacks, dismissal, or synthetic input.
const {detectQuestion}=require('./detect-question');
function readSelectionModalState(baseline,descriptor,observed){
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
    const roots=[...document.querySelectorAll('#ep-question-container')].filter(shown);
    const root=roots.length===1?roots[0]:null;
    // The first visible component carries the same model as its question root.
    const inner=root&&[...root.querySelectorAll('select,input,textarea,.multi-choice-component')].find(shown);
    const self=controller(inner)||controller(root);
    const model=own(self,'model'),q=own(model,'_currentQuestion'),section=own(self,'sectionData');
    const mode=own(model,'gameMode');
    const contentID=own(q,'contentID'),questionIndex=own(q,'questionIndex');
    const key=Number.isSafeInteger(contentID)&&contentID>0&&Number.isSafeInteger(questionIndex)&&questionIndex>=0
        ?`${descriptor.kind}:${contentID}:${questionIndex}`:null;
    if(!baseline)return{valid:!!model&&mode===3&&key===descriptor.key&&!!section,model,section,key};
    const modals=[...document.querySelectorAll('div[uib-modal-window=modal-window]')];
    const visible=modals.filter(shown);
    const backdropCount=[...document.querySelectorAll('div[uib-modal-backdrop=modal-backdrop]')].filter(shown).length;
    const modal=modals.length===1?modals[0]:null;
    const dialog=modal?controller(modal):null;
    const wrapper=modal?.querySelector('#modal-section-complete-wrapper');
    const known=!!modal&&modal.classList.contains('section-complete-dialog')
        &&modal.querySelectorAll('#modal-section-complete-wrapper').length===1
        &&modal.querySelectorAll('#modal-section-complete').length===1
        &&modal.querySelectorAll('#next-button').length===1
        &&!!wrapper?.querySelector('#modal-section-complete #next-button');
    const next=own(dialog,'nextSection');
    const sectionDialog=known&&baseline.valid&&own(dialog,'model')===baseline.model
        &&own(dialog,'currentSection')===baseline.section&&own(dialog,'activityComplete')===false
        &&!!next&&next!==baseline.section&&Number.isSafeInteger(own(next,'id'))&&own(next,'id')>0;
    const diagnostic={kind:'selection-modal',guard:'unknown-modal',modalCount:modals.length,visibleModalCount:visible.length,backdropCount,
        family:known?'section-complete':'unknown',modelMatched:!!model&&model===baseline.model,
        questionChanged:!!key&&key!==baseline.key,sectionChanged:!!section&&section!==baseline.section};
    if(!baseline.valid)return{diagnostic:{...diagnostic,guard:'baseline-unavailable'}};
    if(mode===2)return{diagnostic:{...diagnostic,guard:'assessment-mode'}};
    if(modals.length){
        if(!sectionDialog)return{diagnostic};
        if(observed&&(observed.modal!==modal||observed.next!==next))return{diagnostic:{...diagnostic,guard:'section-dialog-changed'}};
        return{waiting:true,modal,next,diagnostic:{...diagnostic,guard:'section-transition-pending'}};
    }
    if(!observed)return{diagnostic:{...diagnostic,guard:'modal-disappeared-unclassified'}};
    const nextMatched=section===observed.next;
    diagnostic.family='section-complete';diagnostic.nextSectionMatched=nextMatched;
    if(backdropCount)return{waiting:true,modal:observed.modal,next:observed.next,diagnostic:{...diagnostic,guard:'section-backdrop-pending'}};
    if(mode!==3||model!==baseline.model)return{diagnostic:{...diagnostic,guard:'practice-model-changed'}};
    if(!nextMatched||!key||key===baseline.key)return{waiting:true,modal:observed.modal,next:observed.next,diagnostic:{...diagnostic,guard:'next-section-unverified'}};
    return{ready:true,key,identity:`${contentID}:${questionIndex}`,diagnostic:{...diagnostic,guard:'next-section-verified'}};
}
async function captureSelectionBaseline(page,descriptor){
    return page.evaluateHandle(readSelectionModalState,null,descriptor,null).catch(()=>null);
}
async function resolveSelectionModal(page,descriptor,baseline,{shouldStop=()=>false,timeout=3000}={}){
    const budget=Number.isFinite(timeout)?Math.max(0,Math.min(timeout,3000)):3000;
    const deadline=Date.now()+budget;
    let observed=null,last={kind:'selection-modal',guard:'inspection-unavailable'};
    const poll=async()=>{
        if(shouldStop())return{status:'aborted'};
        if(!baseline)return{status:'modal',diagnostic:{...last,guard:'baseline-unavailable'}};
        const state=await page.evaluateHandle(readSelectionModalState,baseline,descriptor,observed);
        let keep=false;
        try{
            const result=await state.evaluate(r=>({waiting:r.waiting===true,ready:r.ready===true,key:r.key,identity:r.identity,diagnostic:r.diagnostic}));
            last=result.diagnostic;
            if(shouldStop())return{status:'aborted'};
            if(result.ready){
                const current=await detectQuestion(page);
                if(shouldStop())return{status:'aborted'};
                if(!current||!['choice','dropdown','gaps','textbox','numberbox'].includes(current.kind)||current.key!==`${current.kind}:${result.identity}`)return{status:'modal',diagnostic:{...last,guard:'next-question-unverified'}};
                // A second identity/overlay read prevents a modal or model race
                // during detection from becoming permission to resume input.
                const check=await page.evaluateHandle(readSelectionModalState,baseline,descriptor,observed);
                let confirmed;
                try{confirmed=await check.evaluate(r=>({ready:r.ready===true,key:r.key}));}finally{await check.dispose();}
                if(shouldStop())return{status:'aborted'};
                if(Date.now()>deadline)return{status:'modal',diagnostic:{...last,guard:'section-transition-timeout'}};
                if(confirmed.ready&&confirmed.key===result.key)return{status:'advanced',diagnostic:last};
                return{status:'modal',diagnostic:{...last,guard:'next-section-changed'}};
            }
            if(!result.waiting)return{status:'modal',diagnostic:last};
            if(Date.now()>=deadline)return{status:'modal',diagnostic:{...last,guard:'section-transition-timeout'}};
            if(!observed){observed=state;keep=true;}
        }finally{if(!keep)await state.dispose();}
        await new Promise(resolve=>setTimeout(resolve,Math.min(50,Math.max(0,deadline-Date.now()))));
        return poll();
    };
    try{return await poll();}
    catch{return shouldStop()?{status:'aborted'}:{status:'modal',diagnostic:{...last,guard:'inspection-uncertain'}};}
    finally{if(observed)await observed.dispose().catch(()=>{});}
}
module.exports={readSelectionModalState,captureSelectionBaseline,resolveSelectionModal};
