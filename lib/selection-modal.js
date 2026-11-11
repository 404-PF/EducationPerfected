// Source-derived SectionCompletionDialog structure and identity fields, chunk171:
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-171-69df426caed962f89980.js
// No dialog text/answers, controller callbacks or marking calls. Input is a single
// trusted click on an exactly associated Next Section button, followed by reads.
function readSelectionModalState(baseline,descriptor,operation,action){
    const own=(object,key)=>{
        const property=object&&Object.getOwnPropertyDescriptor(object,key);
        return property&&'value' in property?property.value:undefined;
    };
    const shown=el=>{
        if(!el||el.hidden||!el.getClientRects().length)return false;
        const style=getComputedStyle(el);
        return style.display!=='none'&&style.visibility!=='hidden';
    };
    const scopeSelf=scope=>{
        for(let current=scope,depth=0;current&&depth<8;current=Object.getPrototypeOf(current),depth++){
            const property=Object.getOwnPropertyDescriptor(current,'self');
            if(property)return 'value' in property?property.value:undefined;
        }
        return undefined;
    };
    const controller=(el,dialogOnly=false)=>{
        const fromNode=node=>{
            const angular=window.angular?.element(node);
            const scopes=angular?[angular.isolateScope?.(),angular.scope?.()]:[];
            const selves=scopes.map(scopeSelf);
            return selves.find(self=>own(self,'model')&&(!dialogOnly||Object.getOwnPropertyDescriptor(self,'currentSection')));
        };
        for(let node=el,depth=0;node&&depth<10;node=node.parentElement,depth++){
            const self=fromNode(node);
            if(self)return self;
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
        return{model,section,mode,key,q};
    };
    const {model,section,mode,key,q}=context();
    if(!baseline)return{valid:!!model&&mode===3&&key===descriptor.key&&!!section,model,section,key,question:q};
    const modals=[...document.querySelectorAll('div[uib-modal-window=modal-window]')];
    const visible=modals.filter(shown);
    const backdropCount=[...document.querySelectorAll('div[uib-modal-backdrop=modal-backdrop]')].filter(shown).length;
    const modal=modals.length===1?modals[0]:null;
    // UI Bootstrap transcludes the template into a child scope. Read the
    // exact template root, not an unrelated modal-window controller.
    const dialog=modal?controller(modal.querySelector('#modal-section-complete-wrapper'),true):null;
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

    const nextButton=modal?.querySelector('#next-button');
    const classifySection=()=>{
        if(!known)return 'unknown-modal';
        if(!baseline.valid)return 'baseline-invalid';
        if(own(dialog,'model')!==baseline.model)return 'dialog-model-mismatch';
        if(own(dialog,'currentSection')!==baseline.section)return 'dialog-section-mismatch';
        if(model!==baseline.model||section!==baseline.section||key!==baseline.key)return 'current-context-mismatch';
        if(own(dialog,'activityComplete')===true&&next===null)return 'activity-completion-dialog';
        if(own(dialog,'activityComplete')!==false)return 'activity-state-unverified';
        if(!next||next===baseline.section)return 'next-section-missing';
        if(!Number.isSafeInteger(own(next,'id'))||own(next,'id')<=0)return 'next-section-id-unverified';
        // Source DisplayedActivitySection uses TypeCode 2..6. Peer review has
        // a different callback and no activityGroup, so is never automated.
        const type=own(next,'type'),group=own(next,'activityGroup');
        if(![2,3,4,5,6].includes(type)||own(group,'ID')!==own(next,'id')||own(group,'TypeCode')!==type)return 'next-section-type-unverified';
        if(own(dialog,'isPeerReviewSectionNext')===true)return 'peer-review-next';
        if(modal.querySelectorAll('#next-button').length!==1||!modal.querySelector('#modal-section-complete #next-button')||nextButton.tagName!=='BUTTON'||!shown(nextButton)||nextButton.disabled||nextButton.matches(':disabled')||nextButton.closest('[inert]')||nextButton.getAttribute('aria-disabled')==='true')return 'next-button-unready';
        if(nextButton.getAttribute('ng-click')!=='self.onNextClicked()'||controller(nextButton,true)!==dialog)return 'next-button-binding-unverified';
        if(backdropCount!==1)return 'backdrop-unverified';
        return 'section-next-action-required';
    };
    const diagnostic={kind:'selection-modal',guard:'unknown-modal',modalCount:modals.length,visibleModalCount:visible.length,backdropCount,
        family:known?'section-complete':'unknown',modelMatched:!!model&&model===baseline.model,
        questionChanged:!!key&&key!==baseline.key,sectionChanged:!!section&&section!==baseline.section};
    const transitionVerified=()=>{
        return mode===3&&model===baseline.model&&section===action.next
            &&own(section,'id')===action.nextID&&own(section,'type')===action.nextType
            &&own(section,'activityGroup')===action.nextGroup
            &&own(action.nextGroup,'ID')===action.nextID&&own(action.nextGroup,'TypeCode')===action.nextType&&q&&q!==baseline.question
            &&!!key&&key!==baseline.key&&visible.length===0&&backdropCount===0;
    };
    const operationalState=()=>{
        if(mode===2)return{...diagnostic,guard:'assessment-mode'};
        if(operation==='verify'||operation==='snapshot'){
            if(visible.some(element=>element!==action.modal))return{...diagnostic,guard:'section-new-modal'};
            const result={...diagnostic,guard:transitionVerified()?'next-section-verified':'next-section-unverified'};
            return operation==='snapshot'?{...result,question:q,key,section,model}:result;
        }
        if(mode!==3)return{...diagnostic,guard:'game-mode-unverified'};
        if(!modals.length)return{...diagnostic,guard:'modal-disappeared-unclassified'};
        if(modals.length!==1)return{...diagnostic,guard:'modal-ambiguous'};
        if(visible.length!==1)return{...diagnostic,guard:'modal-visibility-unverified'};
        return null;
    };
    const early=operationalState();
    if(early)return early;
    const classification=classifySection();
    const result={...diagnostic,guard:classification||'unknown-modal'};
    if(operation==='prepare'&&classification==='section-next-action-required')return{...result,button:nextButton,modal,dialog,next,nextID:own(next,'id'),nextType:own(next,'type'),nextGroup:own(next,'activityGroup')};
    if(operation==='recheck'&&classification==='section-next-action-required'
        &&(action.button!==nextButton||action.modal!==modal||action.dialog!==dialog||action.next!==next||action.nextID!==own(next,'id')||action.nextType!==own(next,'type')||action.nextGroup!==own(next,'activityGroup')))return{...result,guard:'next-action-changed'};
    return result;
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
// A modal instance is consumed before dispatch. An uncertain click or stalled
// navigation is never retried by this process, even after explicit restart.
const attemptedModals=new WeakMap();
const sectionActionsInFlight=new WeakSet();
const trackedPages=new WeakSet();
function trackSectionPage(page){
    if(trackedPages.has(page))return;
    trackedPages.add(page);
    const clear=()=>{
        const handles=attemptedModals.get(page)||[];
        attemptedModals.delete(page);
        for(const handle of handles)void handle.dispose().catch(()=>{});
    };
    page.on('framenavigated',frame=>{if(frame===page.mainFrame())clear();});
    page.once('close',clear);
}
async function advanceSelectionSection(page,descriptor,baseline,{shouldStop=()=>false,timeout=3000}={}){
    trackSectionPage(page);
    if(sectionActionsInFlight.has(page))return{guard:'section-action-in-flight'};
    sectionActionsInFlight.add(page);
    let action,button;
    const read=async operation=>{
        const handle=await page.evaluateHandle(readSelectionModalState,baseline,descriptor,operation,action);
        try{return await handle.jsonValue();}finally{await handle.dispose();}
    };
    try{
        if(shouldStop())return{guard:'section-action-cancelled'};
        action=await page.evaluateHandle(readSelectionModalState,baseline,descriptor,'prepare');
        const guard=await action.getProperty('guard');
        let code;try{code=await guard.jsonValue();}finally{await guard.dispose();}
        if(code!=='section-next-action-required')return{guard:code};
        const seen=attemptedModals.get(page)||[];
        for(const previous of seen){
            if(await page.evaluate((a,b)=>a.modal===b.modal,action,previous))return{guard:'section-action-consumed'};
        }
        button=await action.getProperty('button');
        const element=button.asElement();
        if(!element)return{guard:'next-button-unready'};
        await element.scrollIntoView();
        const point=await element.clickablePoint();
        const checked=await read('recheck');
        if(checked.guard!=='section-next-action-required')return checked;
        if(!await element.evaluate((el,p)=>{const hit=document.elementFromPoint(p.x,p.y);return hit===el||el.contains(hit);},point))return{guard:'next-button-covered'};
        if(shouldStop())return{guard:'section-action-cancelled'};
        seen.push(action);attemptedModals.set(page,seen);
        // Keep the consumed handle until the page closes. It identifies the
        // exact modal even if the original DOM node is detached and reattached.
        action=null;
        const consumed=seen[seen.length-1];
        try{await page.mouse.click(point.x,point.y);}catch{return{guard:'section-click-uncertain'};}
        action=consumed;
        const deadline=Date.now()+timeout;
        return await new Promise(resolve=>{
            const poll=async()=>{
                if(shouldStop())return resolve({guard:'section-action-cancelled'});
                const result=await read('verify').catch(()=>({guard:'section-verification-uncertain'}));
                if(result.guard==='next-section-verified'){
                    const snapshot=await page.evaluateHandle(readSelectionModalState,baseline,descriptor,'snapshot',action).catch(()=>null);
                    if(!snapshot)return resolve({guard:'section-verification-uncertain'});
                    try{
                        await new Promise(done=>setTimeout(done,50));
                        if(shouldStop())return resolve({guard:'section-action-cancelled'});
                        const confirmed=await page.evaluateHandle(readSelectionModalState,baseline,descriptor,'snapshot',action);
                        try{
                            const stable=await page.evaluate((a,b)=>a.guard==='next-section-verified'&&b.guard===a.guard&&a.question===b.question&&a.key===b.key&&a.section===b.section&&a.model===b.model,snapshot,confirmed);
                            return resolve({...result,guard:stable?'next-section-verified':'section-transition-unstable'});
                        }finally{await confirmed.dispose();}
                    }catch{return resolve({guard:'section-verification-uncertain'});}
                    finally{await snapshot.dispose();}
                }
                if(result.guard==='section-new-modal'||result.guard==='assessment-mode'||result.guard==='section-verification-uncertain'||Date.now()>=deadline)return resolve(result);
                setTimeout(poll,50);
            };
            void poll();
        });
    }catch{return{guard:'section-action-uncertain'};}
    finally{
        sectionActionsInFlight.delete(page);
        if(button)await button.dispose().catch(()=>{});
        if(action&&!(attemptedModals.get(page)||[]).includes(action))await action.dispose().catch(()=>{});
    }
}
module.exports={readSelectionModalState,captureSelectionBaseline,inspectSelectionModal,advanceSelectionSection};
