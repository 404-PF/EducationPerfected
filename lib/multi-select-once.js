const {readMultiChoiceInPage}=require('./multi-choice-state');
// One consumed process attempt. No Submit, Next, loop, overwrite or retry.
function createSelectMultiOnce({detectQuestion,playMultiChoiceSelection}){
    let consumed=false;
    return async function selectMultiOnce(page,{shouldStop=()=>false}={}){
        if(consumed)return{status:'refused',reason:'attempt-consumed'};
        consumed=true;let baseline;let verified=false;
        try{
            if(shouldStop())return{status:'aborted'};
            const d=await detectQuestion(page);
            if(d?.kind!=='choice'||d.multi!==true||d.representation!=='multi-renderer'||d.autoMarked!==true
                ||!d.correct?.length||!d.options?.length||d.options.some(o=>o.selected))return{status:'refused',reason:'requires-supported-empty-multi-select'};
            baseline=await page.evaluateHandle(readMultiChoiceInPage);
            if(!await baseline.evaluate((r,d)=>r?.q?.questionDef?.Components?.length===1&&JSON.stringify(r.descriptor)===JSON.stringify(d),d))return{status:'refused',reason:'changed-or-mixed-components'};
            if(shouldStop())return{status:'aborted'};
            const result=await playMultiChoiceSelection(page,d,{baseline,enter:false,timeout:0,shouldStop:()=>verified||shouldStop(),log:()=>{verified=true;}});
            if(!verified||result!==null)return{status:result?.status==='aborted'?'aborted':'stopped',reason:'selection-not-verified-may-be-partial',...(result?.message?{message:result.message}:{})};
            const final=await page.evaluateHandle(readMultiChoiceInPage,baseline,'verify');
            try{if(!await final.evaluate(r=>r?.descriptor?.kind==='choice'&&r.descriptor.multi===true&&r.descriptor.autoMarked===true))return{status:'selection-unconfirmed',reason:'post-selection-changed'};}
            finally{await final.dispose();}
            return{status:'selected-only'};
        }catch{return{status:'stopped',reason:'inspection-or-input-uncertain'};}
        finally{if(baseline)await baseline.dispose().catch(()=>{});}
    };
}
module.exports={createSelectMultiOnce};
