const {readDropdownsInPage}=require('./dropdown-state');
const {collectDropdownDiagnostics}=require('./dropdown-diagnostics');
// One process attempt, one question, at most one Submit. Never an answer loop.
function createSubmitDropdownOnce({detectQuestion,playDropdownRound}){
    let consumed=false;
    return async function submitDropdownOnce(page,{shouldStop=()=>false}={}){
        if(consumed)return{status:'refused',reason:'attempt-consumed'};
        consumed=true;let baseline,final,button,verified=false;
        try{
            if(shouldStop())return{status:'aborted'};
            const d=await detectQuestion(page);
            if(d?.kind!=='dropdown'||d.autoMarked!==true||!d.dropdowns?.length||d.dropdowns.some(x=>x.filled))return{status:'refused',reason:'requires-supported-empty-dropdowns',diagnostics:await collectDropdownDiagnostics(page).catch(()=>({build:'dropdown-diagnostics-v1',error:'inspection-unavailable'}))};
            baseline=await page.evaluateHandle(readDropdownsInPage);
            if(!await baseline.evaluate((r,d)=>JSON.stringify(r?.descriptor)===JSON.stringify(d),d))return{status:'refused',reason:'changed-before-selection'};
            if(shouldStop())return{status:'aborted'};
            const selected=await playDropdownRound(page,d,{baseline,enter:false,timeout:0,shouldStop:()=>verified||shouldStop(),onVerified:()=>{verified=true;}});
            if(!verified||selected?.status!=='aborted')return{status:selected?.status==='aborted'?'aborted':'stopped',reason:'selection-not-verified-may-be-partial'};
            if(shouldStop())return{status:'aborted'};
            final=await page.evaluateHandle(readDropdownsInPage,baseline,'submit');
            if(!await final.evaluate(r=>r?.descriptor?.kind==='dropdown'&&r.descriptor.autoMarked===true&&r.descriptor.dropdowns.every(d=>d.selectedIndex===d.index)&&!!r.target))return{status:'stopped',reason:'changed-before-submit'};
            button=await final.getProperty('target');const element=button.asElement();if(!element)return{status:'stopped',reason:'missing-submit'};
            await element.scrollIntoView();const point=await element.clickablePoint();
            const last=await page.evaluateHandle(readDropdownsInPage,baseline,'submit');
            try{if(!await last.evaluate((r,el)=>r?.descriptor?.kind==='dropdown'&&r.target===el,element))return{status:'stopped',reason:'changed-before-submit'};}finally{await last.dispose();}
            if(!await element.evaluate((el,p)=>{const hit=document.elementFromPoint(p.x,p.y);return hit===el||el.contains(hit);},point))return{status:'stopped',reason:'submit-covered'};
            if(shouldStop())return{status:'aborted'};
            await page.mouse.click(point.x,point.y);
            return{status:'submitted-once'}; // Dispatch only, not acceptance or points.
        }catch{return{status:'stopped',reason:'inspection-or-dispatch-uncertain'};}
        finally{for(const handle of [button,final,baseline])if(handle)await handle.dispose().catch(()=>{});}
    };
}
module.exports={createSubmitDropdownOnce};
