const {readDropdownsInPage}=require('./dropdown-state');
// Poll only a proven exact answer set with a not-yet-ready Submit. Each probe
// rechecks the original model/key/renderer/answers. Never input, click or retry
// a dispatch here. Only the successful caller owns the returned handle.
async function waitForDropdownSubmit(page,baseline,{shouldStop=()=>false,timeout=3000}={}){
    const budget=Number.isFinite(timeout)?Math.max(0,Math.min(timeout,3000)):3000;
    const deadline=Date.now()+budget;
    const poll=async first=>{
        if(shouldStop())return{status:'aborted'};
        const handle=await page.evaluateHandle(readDropdownsInPage,baseline,'submit',true);
        let retained=false;
        try{
            const state=await handle.evaluate(r=>({
                valid:r?.descriptor?.kind==='dropdown'&&r.descriptor.dropdowns.every(d=>d.selectedIndex===d.index),
                guard:r?.guard||'final-selection-mismatch',readiness:r?.readiness,ready:!!r?.target,submitState:r?.submitState,
            }));
            if(shouldStop())return{status:'aborted'};
            if(!state.valid)return{status:'stopped',guard:state.guard,submitState:state.submitState};
            // A zero-budget caller still gets its original single immediate read.
            if((!first||budget>0)&&Date.now()>=deadline)return{status:'stopped',guard:'submit-readiness-timeout',submitState:state.submitState};
            if(state.ready){retained=true;return{status:'ready',handle};}
            if(state.readiness!=='not-ready')return{status:'stopped',guard:'submit-target-missing'};
            if(Date.now()>=deadline)return{status:'stopped',guard:'submit-readiness-timeout',submitState:state.submitState};
        }finally{if(!retained)await handle.dispose();}
        await new Promise(resolve=>setTimeout(resolve,Math.min(50,Math.max(0,deadline-Date.now()))));
        return poll(false);
    };
    return poll(true);
}
module.exports={waitForDropdownSubmit};
