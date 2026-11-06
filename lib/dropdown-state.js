// Read existing objects only. EP public chunk606, checked 6 November 2026.
// DropDownComponent / DropDownComponentState. Do not invoke shuffledOptions:
// its getter can sort options and create state. change maps by trimmed description.
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
function readDropdownsInPage(baseline, action) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const lesson = document.querySelector('#ep-question-container');
    const selects = lesson ? [...lesson.querySelectorAll('select')].filter(shown) : [];
    if (!selects.length) return null;
    const refuse = () => ({descriptor:{kind:'unsupported',reason:'Lesson dropdowns: unsafe, unsupported or changed renderer state'}});
    const modelOf = el => {
        for (let n=el, depth=0; n && depth<10; n=n.parentElement, depth++) {
            const a=window.angular?.element(n);
            for (const scope of a ? [a.isolateScope?.(),a.scope?.()] : []) if(scope?.self?.model?._currentQuestion)return scope.self;
        }
        return null;
    };
    const self=modelOf(selects[0]), model=self?.model, q=model?._currentQuestion;
    if (!q || model.gameMode!==3 || self.sectionData?.activityGroup?.isAutoMarked!==true
        || !Number.isSafeInteger(q.contentID) || q.contentID<=0 || !Number.isSafeInteger(q.questionIndex) || q.questionIndex<0) return refuse();
    if ([...lesson.querySelectorAll('input,textarea,select,[contenteditable]')].filter(el=>shown(el)&&(el.matches('input,textarea,select')||el.isContentEditable)).some(el=>!selects.includes(el)))return refuse();
    const own=(object,key)=>{
        const property=object&&Object.getOwnPropertyDescriptor(object,key);
        return property&&'value' in property?property.value:undefined;
    };
    const defs=q.questionDef?.Components, renderer=q.cachedRenderers?.[1];
    const parser=own(renderer,'parser');
    const identified=own(renderer,'identifiedComponents')||own(parser,'identifiedComponents');
    const base=own(identified,'baseComponents');
    if (!Array.isArray(defs)||!defs.length||defs.length>20||defs.length!==selects.length||!base
        || defs.some(d=>d?.ComponentTypeCode!=='DROPDOWN_COMPONENT'||typeof d.ComponentID!=='string'||!d.ComponentID||d.Marked!==1)
        || new Set(defs.map(d=>d.ComponentID)).size!==defs.length||Object.keys(base).length!==defs.length)return refuse();
    const plain=s=>typeof s==='string'&&s.length>0&&s.length<=1024&&s===s.trim()
        &&!/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>`[\]@]/.test(s);
    const optionSafe=o=>o&&typeof o==='object'&&(o.Description===''||plain(o.Description))
        &&['true','false'].includes(o.Correct)&&o.Validity==='true'&&Number.isFinite(o.SortOrder);
    const rows=[];
    for(const select of selects){
        if(modelOf(select)?.model!==model||select.disabled||select.multiple||select.size>1||select.closest('.fitg-component'))return refuse();
        const matches=defs.filter(d=>Array.isArray(base[d.ComponentID])&&base[d.ComponentID].length===1&&base[d.ComponentID][0].dropDownList===select);
        if(matches.length!==1)return refuse();
        const def=matches[0],component=base[def.ComponentID][0],state=component.componentState,metadata=state?.metadataInstance;
        const original=state?.originalDropDownOptions, shuffled=state?._shuffledOptions, dom=[...select.options];
        if(component.id!==def.ComponentID||select.id!==def.ComponentID||component.visualElement!==select||component.renderingParameters?.mode!==1||component.marked!==1
            ||metadata?.ComponentTypeCode!=='DROPDOWN_COMPONENT'||metadata.ComponentID!==def.ComponentID||metadata.Marked!==1
            ||!Array.isArray(metadata.Options)||!metadata.Options.length||metadata.Options.length>50||!metadata.Options.every(optionSafe)
            ||JSON.stringify(def.Options)!==JSON.stringify(metadata.Options)||JSON.stringify(def.DefaultSelection)!==JSON.stringify(metadata.DefaultSelection)
            ||!optionSafe(metadata.DefaultSelection)||metadata.DefaultSelection.Description!==''||metadata.DefaultSelection.Correct!=='false'
            ||!Array.isArray(original)||original.length!==metadata.Options.length||new Set(original).size!==original.length||original.some(o=>!metadata.Options.includes(o))
            ||!Array.isArray(shuffled)||shuffled.length!==dom.length||!shuffled.length||shuffled.length>51||!shuffled.every(optionSafe)
            ||new Set(shuffled).size!==shuffled.length||new Set(shuffled.map(o=>o.Description)).size!==shuffled.length
            ||original.some(o=>!shuffled.includes(o))||shuffled.some(o=>!original.includes(o)&&(o.Description!==''||o.Correct!=='false'))
            ||dom.some((o,i)=>o.parentElement!==select||o.textContent!==shuffled[i].Description||o.text!==o.textContent||o.disabled||o.hidden||o.children.length)
            ||dom.filter(o=>o.selected).length!==1||select.selectedIndex<0)return refuse();
        const correct=shuffled.filter(o=>o.Correct==='true');
        if(correct.length!==1||!plain(correct[0].Description))return refuse();
        const selected=shuffled[select.selectedIndex], cached=state._selectedOption;
        // A blank placeholder is allowed only when no answer is cached, or when
        // it is the actual cached blank default/option. Never overwrite a prefill.
        if(selected.Description===''){
            if(selected.Correct!=='false')return refuse();
            if(cached!=null && !(cached===selected || cached===metadata.DefaultSelection&&cached.Description===''&&cached.Correct==='false'))return refuse();
        }else if(cached!==selected)return refuse();
        rows.push({select,def,component,state,metadata,original,shuffled,optionRefs:shuffled.slice(),originalRefs:original.slice(),dom,answer:correct[0],answerIndex:shuffled.indexOf(correct[0]),selectedIndex:select.selectedIndex,filled:selected.Description!==''});
    }
    if(new Set(rows.map(r=>r.def)).size!==defs.length)return refuse();
    const key='dropdown:'+q.contentID+':'+q.questionIndex;
    const signature=JSON.stringify([q.questionDef,rows.map(r=>[r.metadata,r.shuffled,r.original])]);
    const descriptor={kind:'dropdown',key,autoMarked:true,signature,dropdowns:rows.map(r=>({id:r.def.ComponentID,answer:r.answer.Description,index:r.answerIndex,selectedIndex:r.selectedIndex,filled:r.filled}))};
    if(baseline&&(baseline.q!==q||baseline.model!==model||baseline.renderer!==renderer||baseline.base!==base||baseline.parser!==parser||baseline.identified!==identified
        ||baseline.descriptor.key!==key||baseline.descriptor.signature!==signature||baseline.rows.length!==rows.length
        ||rows.some((r,i)=>{const b=baseline.rows[i];return ['select','def','component','state','metadata','original','shuffled','answer'].some(k=>r[k]!==b[k])||r.dom.some((o,j)=>o!==b.dom[j])||r.optionRefs.some((o,j)=>o!==b.optionRefs[j])||r.originalRefs.some((o,j)=>o!==b.originalRefs[j]);})))return refuse();
    const result={descriptor,q,model,renderer,parser,identified,base,rows};
    if(Number.isSafeInteger(action)){
        if(action<0||!rows[action])return refuse();
        result.target=rows[action].select;
    }else if(action==='verify'||action==='submit'){
        if(rows.some(r=>!r.filled||r.shuffled[r.selectedIndex]!==r.answer))return refuse();
        if(action==='submit'){
            const bars=[...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b=>modelOf(b)?.model===model);
            if(bars.length!==1)return refuse();
            const buttons=[...bars[0].querySelectorAll('button')].filter(b=>shown(b)&&!b.disabled&&b.textContent.trim()==='Submit');
            if(buttons.length!==1)return refuse();result.target=buttons[0];
        }
    }
    return action==='descriptor'?{descriptor}:result;
}
module.exports={readDropdownsInPage};
