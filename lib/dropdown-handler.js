const {readDropdownsInPage}=require('./dropdown-state');
async function playDropdownRound(page,descriptor,opts){
    const stop=opts.shouldStop||(()=>false);
    const refused=()=>({status:'stopped',reason:'unsafe-or-changed-state',message:'Lesson dropdowns stopped: changed or unsupported state; no retry.'});
    let baseline;const handles=[];
    try{
        if(descriptor.kind!=='dropdown'||descriptor.autoMarked!==true||descriptor.dropdowns.some(d=>d.filled))return refused();
        baseline=await page.evaluateHandle(readDropdownsInPage);
        if(!await baseline.evaluate((r,d)=>JSON.stringify(r?.descriptor)===JSON.stringify(d),descriptor))return refused();
        const expected=descriptor.dropdowns.map(d=>d.selectedIndex);
        const check=async(index,focus=false)=>{
            const state=await page.evaluateHandle(readDropdownsInPage,baseline,index);
            try{
                if(!await state.evaluate((r,values,active)=>r?.descriptor?.kind==='dropdown'&&r.descriptor.dropdowns.every((d,i)=>d.selectedIndex===values[i])&&(!active||document.activeElement===r.target),expected,focus))return null;
                if(focus)return true;
                const handle=await state.getProperty('target');handles.push(handle);return handle.asElement();
            }finally{await state.dispose();}
        };
        for(let i=0;i<descriptor.dropdowns.length;i++){
            if(stop())return{status:'aborted'};
            const element=await check(i);if(!element)return refused();
            await element.focus();if(!await check(i,true))return refused();
            // Native select keys, not DOM-selectedIndex assignment or synthetic change.
            // Intermediate choices may be saved by EP; each key is checked and never retried.
            if(stop())return{status:'aborted'};
            await element.press('Home');expected[i]=0;
            if(!await check(i,true))return refused();
            for(let n=0;n<descriptor.dropdowns[i].index;n++){
                if(stop())return{status:'aborted'};
                if(!await check(i,true))return refused();
                await element.press('ArrowDown');expected[i]++;
                if(!await check(i,true))return refused();
            }
        }
        if(stop())return{status:'aborted'};
        const final=await page.evaluateHandle(readDropdownsInPage,baseline,opts.enter?'submit':'verify');
        try{
            if(!await final.evaluate(r=>r?.descriptor?.kind==='dropdown'&&r.descriptor.dropdowns.every(d=>d.selectedIndex===d.index)))return refused();
            opts.log?.('Selected exact lesson dropdown answers.');
            if(opts.enter){
                const button=await final.getProperty('target');handles.push(button);const element=button.asElement();if(!element)return refused();
                await element.scrollIntoView();const point=await element.clickablePoint();
                const last=await page.evaluateHandle(readDropdownsInPage,baseline,'submit');
                try{if(!await last.evaluate((r,el)=>r?.descriptor?.kind==='dropdown'&&r.target===el,element))return refused();}finally{await last.dispose();}
                if(!await element.evaluate((el,p)=>{const hit=document.elementFromPoint(p.x,p.y);return hit===el||el.contains(hit);},point))return refused();
                if(stop())return{status:'aborted'};
                await page.mouse.click(point.x,point.y);
            }
        }finally{await final.dispose();}
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
    }catch{return{status:'stopped',reason:'inspection-or-dispatch-uncertain',message:'Lesson dropdowns stopped: input result uncertain; no retry.'};}
    finally{for(const h of handles)await h.dispose().catch(()=>{});if(baseline)await baseline.dispose().catch(()=>{});}
}
module.exports={playDropdownRound};
