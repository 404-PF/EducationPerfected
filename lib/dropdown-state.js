// Read existing objects only. EP public chunk606, checked 6 November 2026.
// DropDownComponent / DropDownComponentState. Do not invoke shuffledOptions:
// its getter can sort options and create state. change maps by trimmed description.
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
function readDropdownsInPage(baseline, action) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const lesson = document.querySelector('#ep-question-container');
    const selects = lesson ? [...lesson.querySelectorAll('select')].filter(shown) : [];
    if (!selects.length) return action==='diagnostic'?{guard:lesson?'no-visible-selects':'missing-question-container'}:null;
    const refuse = (guard='unclassified',fields) => action==='diagnostic'?{guard,...(fields?{fields}:{})}:{descriptor:{kind:'unsupported',reason:'Lesson dropdowns: unsafe, unsupported or changed renderer state'}};
    const modelOf = el => {
        for (let n=el, depth=0; n && depth<10; n=n.parentElement, depth++) {
            const a=window.angular?.element(n);
            for (const scope of a ? [a.isolateScope?.(),a.scope?.()] : []) if(scope?.self?.model?._currentQuestion)return scope.self;
        }
        return null;
    };
    const self=modelOf(selects[0]), model=self?.model, q=model?._currentQuestion;
    if(!q)return refuse('missing-question-model');
    if(model.gameMode!==3)return refuse('not-lesson-mode');
    if(self.sectionData?.activityGroup?.isAutoMarked!==true)return refuse('not-explicit-auto-marked');
    if(!Number.isSafeInteger(q.contentID)||q.contentID<=0)return refuse('invalid-content-id');
    if(!Number.isSafeInteger(q.questionIndex)||q.questionIndex<0)return refuse('invalid-question-index');
    if ([...lesson.querySelectorAll('input,textarea,select,[contenteditable]')].filter(el=>shown(el)&&(el.matches('input,textarea,select')||el.isContentEditable)).some(el=>!selects.includes(el)))return refuse('mixed-editable-inputs');
    const own=(object,key)=>{
        const property=object&&Object.getOwnPropertyDescriptor(object,key);
        return property&&'value' in property?property.value:undefined;
    };
    const defs=q.questionDef?.Components, renderer=q.cachedRenderers?.[1];
    const parser=own(renderer,'parser');
    const identified=own(renderer,'identifiedComponents')||own(parser,'identifiedComponents');
    const base=own(identified,'baseComponents');
    if(!Array.isArray(defs))return refuse('definitions-not-array');
    if(!defs.length)return refuse('definitions-empty');
    if(defs.length>20)return refuse('definitions-limit');
    if(defs.length!==selects.length)return refuse('definitions-select-count');
    if(!base)return refuse('missing-renderer-map');
    if(defs.some(d=>d?.ComponentTypeCode!=='DROPDOWN_COMPONENT'||typeof d.ComponentID!=='string'||!d.ComponentID||d.Marked!==1)){
        // Fixed allowlist of scalar fields only. Never serialize definitions,
        // option answers, arbitrary text or accessor values into diagnostics.
        const scalar=(object,key)=>{
            const value=own(object,key),type=value===null?'null':typeof value;
            if(['number','boolean'].includes(type))return{type,value:Number.isFinite(value)||type==='boolean'?value:'nonfinite'};
            if(type==='string')return /^[A-Za-z0-9_-]{1,80}$/.test(value)?{type,value}:{type,length:value.length,redacted:true};
            return{type};
        };
        const fields=action==='diagnostic'?{gameMode:scalar(model,'gameMode'),isAutoMarked:scalar(self.sectionData?.activityGroup,'isAutoMarked'),definitions:defs.slice(0,20).map((d,index)=>{
            const id=own(d,'ComponentID'),entries=typeof id==='string'?own(base,id):undefined,component=Array.isArray(entries)&&entries.length===1?entries[0]:undefined;
            const metadata=own(own(component,'componentState'),'metadataInstance');
            return{index,failed:{type:d?.ComponentTypeCode!=='DROPDOWN_COMPONENT',id:typeof d?.ComponentID!=='string'||!d.ComponentID,marked:d?.Marked!==1},raw:{type:scalar(d,'ComponentTypeCode'),id:scalar(d,'ComponentID'),marked:scalar(d,'Marked')},cached:{count:Array.isArray(entries)?entries.length:null,id:scalar(component,'id'),marked:scalar(component,'marked'),renderMode:scalar(own(component,'renderingParameters'),'mode')},metadata:{type:scalar(metadata,'ComponentTypeCode'),id:scalar(metadata,'ComponentID'),marked:scalar(metadata,'Marked')}};
        })}:undefined;
        return refuse('definition-type-id-or-marking',fields);
    }
    if(new Set(defs.map(d=>d.ComponentID)).size!==defs.length)return refuse('definition-duplicate-id');
    if(Object.keys(base).length!==defs.length)return refuse('renderer-definition-count');
    const plain=s=>typeof s==='string'&&s.length>0&&s.length<=1024&&s===s.trim()
        &&!/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>`[\]@]/.test(s);
    const optionSafe=o=>o&&typeof o==='object'&&(o.Description===''||plain(o.Description))
        &&['true','false'].includes(o.Correct)&&o.Validity==='true'&&Number.isFinite(o.SortOrder);
    // EP's editor default-none sentinel is rendered as a synthetic blank option.
    // It is not an answer description and must never relax ordinary option text.
    const emptyDefault=o=>o&&typeof o==='object'&&['',' < None > '].includes(o.Description)
        &&o.Correct==='false'&&o.Validity==='true'&&Number.isFinite(o.SortOrder);
    const rows=[];
    for(const select of selects){
        if(modelOf(select)?.model!==model||select.disabled||select.multiple||select.size>1||select.closest('.fitg-component'))return refuse('select-control-or-model');
        const matches=defs.filter(d=>Array.isArray(base[d.ComponentID])&&base[d.ComponentID].length===1&&base[d.ComponentID][0].dropDownList===select);
        if(matches.length!==1)return refuse('component-select-binding');
        const def=matches[0],component=base[def.ComponentID][0],state=component.componentState,metadata=state?.metadataInstance;
        const original=state?.originalDropDownOptions, shuffled=state?._shuffledOptions, dom=[...select.options];
        // The real getter sorts metadata.Options in place; rendering can then
        // unshift one blank into that same array after original was copied.
        const injected=Array.isArray(shuffled)&&Array.isArray(original)?shuffled.filter(o=>!original.includes(o)):[];
        const placeholder=injected.length===1&&shuffled[0]===injected[0]&&injected[0].Description===''&&optionSafe(injected[0])&&injected[0].Correct==='false';
        const metadataOptions=metadata?.Options;
        const sourceOptions=Array.isArray(metadataOptions)&&placeholder&&metadataOptions===shuffled?metadataOptions.filter(o=>o!==injected[0]):metadataOptions;
        if(component.id!==def.ComponentID)return refuse('component-id');
        if(select.id!==def.ComponentID)return refuse('select-id');
        if(component.visualElement!==select)return refuse('visual-element');
        if(component.renderingParameters?.mode!==1)return refuse('render-mode');
        if(component.marked!==1)return refuse('component-marked');
        if(metadata?.ComponentTypeCode!=='DROPDOWN_COMPONENT')return refuse('metadata-type');
        if(metadata.ComponentID!==def.ComponentID)return refuse('metadata-id');
        if(metadata.Marked!==1)return refuse('metadata-marked');
        if(!Array.isArray(sourceOptions))return refuse('source-options-array');
        if(!sourceOptions.length)return refuse('source-options-empty');
        if(sourceOptions.length>50)return refuse('source-options-limit');
        if(!sourceOptions.every(optionSafe))return refuse('source-option-text-or-flags');
        if(JSON.stringify(def.Options)!==JSON.stringify(original))return refuse('raw-original-options');
        if(JSON.stringify(def.DefaultSelection)!==JSON.stringify(metadata.DefaultSelection))return refuse('raw-default');
        if(!emptyDefault(metadata.DefaultSelection))return refuse('default-none-contract');
        if(!Array.isArray(original))return refuse('original-options-array');
        if(original.length!==sourceOptions.length)return refuse('original-source-count');
        if(new Set(original).size!==original.length)return refuse('original-duplicate');
        if(original.some(o=>!sourceOptions.includes(o)))return refuse('original-source-identity');
        if(!Array.isArray(shuffled))return refuse('shuffled-array');
        if(shuffled.length!==dom.length)return refuse('shuffled-dom-count');
        if(!shuffled.length)return refuse('shuffled-empty');
        if(shuffled.length>51)return refuse('shuffled-limit');
        if(!shuffled.every(optionSafe))return refuse('shuffled-option-text-or-flags');
        if(new Set(shuffled).size!==shuffled.length)return refuse('shuffled-duplicate');
        if(new Set(shuffled.map(o=>o.Description)).size!==shuffled.length)return refuse('shuffled-description-duplicate');
        if(original.some(o=>!shuffled.includes(o)))return refuse('original-shuffled-identity');
        if((injected.length!==0&&!placeholder))return refuse('synthetic-placeholder');
        if(dom.some((o,i)=>o.parentElement!==select||o.textContent!==shuffled[i].Description||o.text!==o.textContent||o.disabled||o.hidden||o.children.length))return refuse('dom-option-contract');
        if(dom.filter(o=>o.selected).length!==1)return refuse('dom-selected-count');
        if(select.selectedIndex<0)return refuse('dom-selected-index');
        const correct=shuffled.filter(o=>o.Correct==='true');
        if(correct.length!==1||!plain(correct[0].Description))return refuse('correct-option');
        const selected=shuffled[select.selectedIndex], cached=state._selectedOption;
        // A blank placeholder is allowed only when no answer is cached, or when
        // it is the actual cached blank default/option. Never overwrite a prefill.
        if(selected.Description===''){
            if(selected.Correct!=='false')return refuse('selected-blank-correct');
            if(cached!=null && !(cached===selected || cached===metadata.DefaultSelection&&emptyDefault(cached)))return refuse('cached-blank-identity');
        }else if(cached!==selected)return refuse('cached-selection-identity');
        rows.push({select,def,component,state,metadata,original,shuffled,optionRefs:shuffled.slice(),originalRefs:original.slice(),dom,answer:correct[0],answerIndex:shuffled.indexOf(correct[0]),selectedIndex:select.selectedIndex,filled:selected.Description!==''});
    }
    if(new Set(rows.map(r=>r.def)).size!==defs.length)return refuse('component-coverage');
    const key='dropdown:'+q.contentID+':'+q.questionIndex;
    const signature=JSON.stringify([q.questionDef,rows.map(r=>[r.metadata,r.shuffled,r.original])]);
    const descriptor={kind:'dropdown',key,autoMarked:true,signature,dropdowns:rows.map(r=>({id:r.def.ComponentID,answer:r.answer.Description,index:r.answerIndex,selectedIndex:r.selectedIndex,filled:r.filled}))};
    if(baseline&&(baseline.q!==q||baseline.model!==model||baseline.renderer!==renderer||baseline.base!==base||baseline.parser!==parser||baseline.identified!==identified
        ||baseline.descriptor.key!==key||baseline.descriptor.signature!==signature||baseline.rows.length!==rows.length
        ||rows.some((r,i)=>{const b=baseline.rows[i];return ['select','def','component','state','metadata','original','shuffled','answer'].some(k=>r[k]!==b[k])||r.dom.some((o,j)=>o!==b.dom[j])||r.optionRefs.some((o,j)=>o!==b.optionRefs[j])||r.originalRefs.some((o,j)=>o!==b.originalRefs[j]);})))return refuse('baseline-changed');
    const result={descriptor,q,model,renderer,parser,identified,base,rows};
    if(Number.isSafeInteger(action)){
        if(action<0||!rows[action])return refuse('target-index');
        result.target=rows[action].select;
    }else if(action==='verify'||action==='submit'){
        if(rows.some(r=>!r.filled||r.shuffled[r.selectedIndex]!==r.answer))return refuse('answers-not-verified');
        if(action==='submit'){
            const bars=[...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b=>modelOf(b)?.model===model);
            if(bars.length!==1)return refuse('submit-bar');
            const buttons=[...bars[0].querySelectorAll('button')].filter(b=>shown(b)&&!b.disabled&&b.textContent.trim()==='Submit');
            if(buttons.length!==1)return refuse('submit-button');result.target=buttons[0];
        }
    }
    return action==='diagnostic'?{guard:'supported',filled:rows.map(r=>r.filled)}:action==='descriptor'?{descriptor}:result;
}
module.exports={readDropdownsInPage};
