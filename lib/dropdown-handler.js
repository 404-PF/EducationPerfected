const {readDropdownsInPage}=require('./dropdown-state');
async function playDropdownRound(page,descriptor,opts){
    const stop=opts.shouldStop||(()=>false);
    let phase='initial',dropdownIndex=null,keyDispatchesReturned=0,guard='descriptor-mismatch',nativeState;
    const selectionDiagnostic=()=>({phase,dropdownIndex,keyDispatchesReturned,guard,...(nativeState?{nativeState}:{})});
    const refused=()=>({status:'stopped',reason:'unsafe-or-changed-state',message:'Lesson dropdowns stopped: changed or unsupported state; no retry.',selectionDiagnostic:selectionDiagnostic()});
    let baseline;const handles=[];
    try{
        if(descriptor.kind!=='dropdown'||descriptor.autoMarked!==true||descriptor.dropdowns.some(d=>d.filled))return refused();
        // Bind one-shot input to the caller's pre-input identities when supplied.
        phase='baseline';
        baseline=await page.evaluateHandle(readDropdownsInPage,opts.baseline,undefined,true);
        const baselineFailure=await baseline.evaluate((r,d)=>JSON.stringify(r?.descriptor)===JSON.stringify(d)?null:r?.guard||'descriptor-mismatch',descriptor);
        if(baselineFailure){guard=baselineFailure;return refused();}
        const expected=descriptor.dropdowns.map(d=>d.selectedIndex);
        const check=async(index,focus=false,previous)=>{
            const state=await page.evaluateHandle(readDropdownsInPage,baseline,index,true);
            try{
                const failure=await state.evaluate((r,values,active,before)=>{
                    if(r?.descriptor?.kind!=='dropdown')return r?.guard||'unsupported-state';
                    const nativeState={actual:r.descriptor.dropdowns.map(d=>d.selectedIndex),expected:values,focusedDropdownIndex:r.rows.findIndex(row=>row.select===document.activeElement)};
                    if(active&&document.activeElement!==r.target)return {guard:'focus-mismatch',nativeState};
                    if(r.descriptor.dropdowns.every((d,i)=>d.selectedIndex===values[i]))return null;
                    if(before&&r.descriptor.dropdowns.every((d,i)=>d.selectedIndex===before[i]))return {guard:'key-state-pending',nativeState};
                    return {guard:'selected-index-mismatch',nativeState};
                },expected,focus,previous);
                if(failure){guard=typeof failure==='string'?failure:failure.guard;nativeState=typeof failure==='string'?undefined:failure.nativeState;return null;}
                nativeState=undefined;
                if(focus)return true;
                const handle=await state.getProperty('target');handles.push(handle);return handle.asElement();
            }finally{await state.dispose();}
        };
        // Read-only grace only for the exact valid pre-key state. No input retry.
        const settled=async(index,previous)=>{
            const deadline=Date.now()+200;
            while(true){
                if(stop())return false;
                if(await check(index,true,previous))return true;
                if(guard!=='key-state-pending')return false;
                if(Date.now()>=deadline){guard='key-state-did-not-settle';return false;}
                await new Promise(resolve=>setTimeout(resolve,25));
            }
        };
        for(let i=0;i<descriptor.dropdowns.length;i++){
            if(stop())return{status:'aborted'};
            dropdownIndex=i;phase='target';guard='missing-target';
            const element=await check(i);if(!element)return refused();
            phase='focus';await element.focus();if(!await check(i,true))return refused();
            // Native select keys, not DOM-selectedIndex assignment or synthetic change.
            // Intermediate choices may be saved by EP; each key is checked and never retried.
            if(stop())return{status:'aborted'};
            const beforeHome=expected.slice();
            phase='home-dispatch';await element.press('Home');keyDispatchesReturned++;expected[i]=0;phase='after-home';
            if(!await settled(i,beforeHome))return stop()?{status:'aborted'}:refused();
            for(let n=0;n<descriptor.dropdowns[i].index;n++){
                if(stop())return{status:'aborted'};
                phase='before-arrow';if(!await check(i,true))return refused();
                const beforeArrow=expected.slice();
                phase='arrow-dispatch';await element.press('ArrowDown');keyDispatchesReturned++;expected[i]++;phase='after-arrow';
                if(!await settled(i,beforeArrow))return stop()?{status:'aborted'}:refused();
            }
        }
        if(stop())return{status:'aborted'};
        phase='final-verification';
        const final=await page.evaluateHandle(readDropdownsInPage,baseline,opts.enter?'submit':'verify',true);
        try{
            const failure=await final.evaluate(r=>r?.descriptor?.kind==='dropdown'&&r.descriptor.dropdowns.every(d=>d.selectedIndex===d.index)?null:r?.guard||'final-selection-mismatch');
            if(failure){guard=failure;return refused();}
            opts.onVerified?.();
            opts.log?.('Selected exact lesson dropdown answers.');
            if(opts.enter){
                phase='submit-target';guard='missing-submit';
                const button=await final.getProperty('target');handles.push(button);const element=button.asElement();if(!element)return refused();
                await element.scrollIntoView();const point=await element.clickablePoint();
                const last=await page.evaluateHandle(readDropdownsInPage,baseline,'submit');
                try{if(!await last.evaluate((r,el)=>r?.descriptor?.kind==='dropdown'&&r.target===el,element)){guard='changed-before-submit';return refused();}}finally{await last.dispose();}
                if(!await element.evaluate((el,p)=>{const hit=document.elementFromPoint(p.x,p.y);return hit===el||el.contains(hit);},point)){guard='submit-covered';return refused();}
                if(stop())return{status:'aborted'};
                await page.mouse.click(point.x,point.y);
            }
        }finally{await final.dispose();}
        phase='post-selection';guard='result-not-confirmed';
        const deadline=opts.enter?Date.now()+opts.timeout:Infinity;
        while(!stop()&&Date.now()<deadline){
            const current=await require('./detect-question').detectQuestion(page);
            const modal=await page.$('div[uib-modal-window=modal-window]');if(modal){await modal.dispose();return{status:'modal'};}
            if(current&&typeof current.key==='string'&&current.key!==descriptor.key)return{status:'advanced'};
            if(current?.kind==='unsupported')return refused();
            if(current===null&&await page.evaluate(()=>[...document.querySelectorAll('button.exit-button,button.continue-button')].some(el=>!el.hidden&&(el.offsetParent!==null||el.getClientRects().length>0))))return{status:'complete'};
            await new Promise(r=>setTimeout(r,100));
        }
        return stop()?{status:'aborted'}:refused();
    }catch{guard='inspection-or-dispatch-uncertain';return{status:'stopped',reason:guard,message:'Lesson dropdowns stopped: input result uncertain; no retry.',selectionDiagnostic:selectionDiagnostic()};}
    finally{for(const h of handles)await h.dispose().catch(()=>{});if(baseline)await baseline.dispose().catch(()=>{});}
}
module.exports={playDropdownRound};
