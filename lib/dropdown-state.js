// Read existing objects only. EP public chunk606, checked 6 November 2026.
// DropDownComponent / DropDownComponentState. Do not invoke shuffledOptions:
// its getter can sort options and create state. change maps by trimmed description.
// https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
function readDropdownsInPage(baseline, action, reportGuard = false) {
    const shown = el => !!el && !el.hidden && (el.offsetParent !== null || el.getClientRects().length > 0);
    const lesson = document.querySelector('#ep-question-container');
    const selects = lesson ? [...lesson.querySelectorAll('select')].filter(shown) : [];
    if (!selects.length) return action==='diagnostic'||reportGuard?{guard:lesson?'no-visible-selects':'missing-question-container'}:null;
    const refuse = (guard='unclassified',fields) => {
        if (action==='diagnostic') return {guard,...(fields?{fields}:{})};
        if (guard==='assessment-mode') return {descriptor:{kind:'unsupported',assessment:true,reason:'Assessment mode is a graded whole-attempt flow that can autosave input and record focus; answering is disabled'},...(reportGuard?{guard}:{})};
        // Content-free refusal boundary: guard identifier and DOM select count
        // only, never option text or answers. The CLI prints descriptor
        // .diagnostic on its generic unsupported-question line, so a live
        // refusal names the exact guard that stopped the run.
        const descriptor={kind:'unsupported',reason:'Lesson dropdowns: unsafe, unsupported or changed renderer state',diagnostic:{kind:'dropdown-refusal',guard,domSelectCount:selects.length,...(guard==='definitions-select-count'&&fields?fields:{})}};
        return {descriptor,...(reportGuard?{guard}:{})};
    };
    const modelOf = el => {
        for (let n=el, depth=0; n && depth<10; n=n.parentElement, depth++) {
            const a=window.angular?.element(n);
            for (const scope of a ? [a.isolateScope?.(),a.scope?.()] : []) if(scope?.self?.model?._currentQuestion)return scope.self;
        }
        return null;
    };
    const self=modelOf(selects[0]), model=self?.model, q=model?._currentQuestion;
    if(!q)return refuse('missing-question-model');
    if(model.gameMode===2)return refuse('assessment-mode');
    if(model.gameMode!==3)return refuse('not-lesson-mode');
    if(self.sectionData?.activityGroup?.isAutoMarked!==true)return refuse('not-explicit-auto-marked');
    if(!Number.isSafeInteger(q.contentID)||q.contentID<=0)return refuse('invalid-content-id');
    if(!Number.isSafeInteger(q.questionIndex)||q.questionIndex<0)return refuse('invalid-question-index');
    if ([...lesson.querySelectorAll('input,textarea,select,[contenteditable]')].filter(el=>shown(el)&&(el.matches('input,textarea,select')||el.isContentEditable)).some(el=>!selects.includes(el)))return refuse('mixed-editable-inputs');
    const own=(object,key)=>{
        const property=object&&Object.getOwnPropertyDescriptor(object,key);
        return property&&'value' in property?property.value:undefined;
    };
    const allDefs=q.questionDef?.Components, renderer=q.cachedRenderers?.[1];
    const parser=own(renderer,'parser');
    const identified=own(renderer,'identifiedComponents')||own(parser,'identifiedComponents');
    const base=own(identified,'baseComponents');
    if(!Array.isArray(allDefs))return refuse('definitions-not-array');
    if(!allDefs.length)return refuse('definitions-empty');
    if(allDefs.length>20)return refuse('definitions-limit');
    // Definitions include non-answer companions. Compare selects with dropdowns,
    // but retain complete definition/cache coverage, never ignore another input.
    // chunk606: SoundComponent and AnnotatedTextComponent set isInput=false;
    // annotated-text is NOT_MARKED, sound returns weight=0 marking. No output,
    // parser, annotation or sound-player methods are invoked by this reader.
    const companionTypes={SOUND_COMPONENT:'sound',ANNOTATED_TEXT_COMPONENT:'annotated-text'};
    const defs=allDefs.filter(d=>own(d,'ComponentTypeCode')==='DROPDOWN_COMPONENT');
    const companions=allDefs.filter(d=>Object.hasOwn(companionTypes,own(d,'ComponentTypeCode')));
    if(defs.length!==selects.length||defs.length+companions.length!==allDefs.length)return refuse('definitions-select-count',{
        definitionCount:allDefs.length,dropdownDefinitionCount:defs.length,companionDefinitionCount:companions.length,
        unsupportedDefinitionCount:allDefs.length-defs.length-companions.length,
    });
    if(!base)return refuse('missing-renderer-map');
    const invalidDefinition=action==='diagnostic'
        ?defs.some(d=>own(d,'ComponentTypeCode')!=='DROPDOWN_COMPONENT'||typeof own(d,'ComponentID')!=='string'||!own(d,'ComponentID')||![0,1].includes(own(d,'Marked')))
        :defs.some(d=>d?.ComponentTypeCode!=='DROPDOWN_COMPONENT'||typeof d.ComponentID!=='string'||!d.ComponentID||![0,1].includes(d.Marked));
    if(invalidDefinition){
        // Fixed allowlist of scalar fields only. Never serialize definitions,
        // option answers, arbitrary text or accessor values into diagnostics.
        const scalar=(object,key)=>{
            const value=own(object,key),type=value===null?'null':typeof value;
            if(['number','boolean'].includes(type))return{type,value:Number.isFinite(value)||type==='boolean'?value:'nonfinite'};
            if(type==='string')return /^[A-Za-z0-9_-]{1,80}$/.test(value)?{type,value}:{type,length:value.length,redacted:true};
            return{type};
        };
        const fields=action==='diagnostic'?{gameMode:scalar(model,'gameMode'),isAutoMarked:scalar(self.sectionData?.activityGroup,'isAutoMarked'),definitions:defs.slice(0,20).map((d,index)=>{
            const rawType=own(d,'ComponentTypeCode'),id=own(d,'ComponentID'),rawMarked=own(d,'Marked'),entries=typeof id==='string'?own(base,id):undefined,component=Array.isArray(entries)&&entries.length===1?entries[0]:undefined;
            const metadata=own(own(component,'componentState'),'metadataInstance');
            return{index,failedOwnData:{type:rawType!=='DROPDOWN_COMPONENT',id:typeof id!=='string'||!id,marked:![0,1].includes(rawMarked)},raw:{type:scalar(d,'ComponentTypeCode'),id:scalar(d,'ComponentID'),marked:scalar(d,'Marked')},cached:{count:Array.isArray(entries)?entries.length:null,id:scalar(component,'id'),marked:scalar(component,'marked'),renderMode:scalar(own(component,'renderingParameters'),'mode')},metadata:{type:scalar(metadata,'ComponentTypeCode'),id:scalar(metadata,'ComponentID'),marked:scalar(metadata,'Marked')}};
        })}:undefined;
        return refuse('definition-type-id-or-marking',fields);
    }
    if(new Set(defs.map(d=>action==='diagnostic'?own(d,'Marked'):d.Marked)).size!==1)return refuse('mixed-definition-marking');
    if(allDefs.some(d=>typeof own(d,'ComponentID')!=='string'||!own(d,'ComponentID')))return refuse('definition-id');
    if(new Set(allDefs.map(d=>own(d,'ComponentID'))).size!==allDefs.length)return refuse('definition-duplicate-id');
    if(Object.keys(base).length!==allDefs.length)return refuse('renderer-definition-count');
    const plain=s=>typeof s==='string'&&s.length>0&&s.length<=1024&&s===s.trim()
        &&!/[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff<>`[\]@]/.test(s);
    // Permit boundary ASCII spaces only; EP maps by trim(), so normalized
    // descriptions must also be unique. Raw text and option identities stay exact.
    const optionText=s=>{
        if(typeof s!=='string'||s.length>1024||s.includes('\u00a0')||!plain(s.trim()))return false;
        let first=0,last=s.length;
        while(first<last&&s[first]===' ')first++;
        while(last>first&&s[last-1]===' ')last--;
        return s.slice(first,last)===s.trim();
    };
    const optionSafe=o=>o&&typeof o==='object'&&(o.Description===''||optionText(o.Description))
        &&['true','false'].includes(o.Correct)&&o.Validity==='true'&&Number.isFinite(o.SortOrder);
    // EP chunk606, checked 9 November 2026: one BasicVariableInjector per raw
    // Description/Correct string keeps the exact template as literal TextPart
    // .text pieces and TempVariablePart .temporaryVariable.expression pieces.
    // applyVariableContext rewrites metadata.Options in place with the resolved
    // values (originalDropDownOptions shares those objects), so raw options
    // legitimately differ whenever a template carries a variable. Reconstruct
    // the template from the injector parts; any other shape is malformed.
    const injectorTemplate=injector=>{
        const parts=own(injector,'parts');
        if(!Array.isArray(parts)||parts.length>100)return null;
        let template='';
        for(const part of parts){
            if(!part||typeof part!=='object')return null;
            const hasText=Object.prototype.hasOwnProperty.call(part,'text'),hasVariable=Object.prototype.hasOwnProperty.call(part,'temporaryVariable');
            if(hasText===hasVariable)return null;
            // A genuine parse turns every {expression} substring into a
            // variable part, so a text part carrying that pattern is forged.
            if(hasText){const text=own(part,'text');if(typeof text!=='string'||/{[^}]+}/.test(text))return null;template+=text;continue;}
            const expression=own(own(part,'temporaryVariable'),'expression');
            if(typeof expression!=='string'||expression.length>1024)return null;
            template+='{'+expression+'}';
        }
        return template;
    };
    // Every raw field except the two templated strings must deep-equal the
    // resolved copy (metadata starts as ObjectHelper.cloneObject(def)).
    // Descriptor reads only: no getter, toJSON or proxy code ever executes,
    // and the depth bound turns cycles into a refusal instead of a crash.
    const dataEqual=(a,b,depth)=>{
        if(Object.is(a,b))return true;
        if(!a||!b||typeof a!=='object'||typeof b!=='object'||depth>10)return false;
        const keysA=Reflect.ownKeys(a),keysB=Reflect.ownKeys(b);
        if(keysA.length!==keysB.length)return false;
        return keysA.every(key=>{
            const pa=Object.getOwnPropertyDescriptor(a,key),pb=Object.getOwnPropertyDescriptor(b,key);
            return pb!==undefined&&Object.hasOwn(pa,'value')&&Object.hasOwn(pb,'value')&&dataEqual(pa.value,pb.value,depth+1);
        });
    };
    const nonTemplateFieldsEqual=(raw,resolved)=>{
        const skip=key=>key!=='Description'&&key!=='Correct';
        const rawKeys=Reflect.ownKeys(raw).filter(skip),resolvedKeys=Reflect.ownKeys(resolved).filter(skip);
        if(rawKeys.length!==resolvedKeys.length)return false;
        return rawKeys.every(key=>{
            const a=Object.getOwnPropertyDescriptor(raw,key),b=Object.getOwnPropertyDescriptor(resolved,key);
            return b!==undefined&&Object.hasOwn(a,'value')&&Object.hasOwn(b,'value')&&dataEqual(a.value,b.value,0);
        });
    };
    // EP's editor default-none sentinel is rendered as a synthetic blank option.
    // It is not an answer description and must never relax ordinary option text.
    const emptyDefault=o=>o&&typeof o==='object'&&['',' < None > '].includes(o.Description)
        &&o.Correct==='false'&&o.Validity==='true'&&Number.isFinite(o.SortOrder);
    const companionRows=[];
    for(const def of companions){
        const id=own(def,'ComponentID'),code=own(def,'ComponentTypeCode'),entries=own(base,id);
        if(!Array.isArray(entries)||entries.length!==1)return refuse('companion-binding');
        const component=entries[0],state=own(component,'componentState'),metadata=own(state,'metadataInstance'),element=own(component,'visualElement');
        if(own(component,'id')!==id||own(component,'type')!==companionTypes[code]||own(component,'isInput')!==false
            ||own(component,'marked')!==(code==='ANNOTATED_TEXT_COMPONENT'?2:1)
            ||own(own(component,'renderingParameters'),'mode')!==1||own(state,'componentID')!==id
            ||!dataEqual(def,metadata,0)||!(element instanceof Element)||!lesson.contains(element)||!shown(element)
            ||selects.some(select=>element===select||element.contains(select))
            ||element.matches('input,textarea,select,[contenteditable],iframe,object,embed')
            ||element.querySelector('input,textarea,select,[contenteditable],iframe,object,embed'))return refuse('companion-contract');
        companionRows.push({def,component,state,metadata,element});
    }
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
        if(metadata.Marked!==def.Marked||![0,1].includes(metadata.Marked))return refuse('metadata-marked');
        if(!Array.isArray(sourceOptions))return refuse('source-options-array');
        if(!sourceOptions.length)return refuse('source-options-empty');
        if(sourceOptions.length>50)return refuse('source-options-limit');
        if(!sourceOptions.every(optionSafe))return refuse('source-option-text-or-flags');
        if(!Array.isArray(def.Options)||!Array.isArray(original)||def.Options.length!==original.length)return refuse('raw-original-options');
        const descInjectors=own(state,'descInjectors'),correctInjectors=own(state,'correctInjectors');
        if(!Array.isArray(descInjectors)||!Array.isArray(correctInjectors)||descInjectors.length!==def.Options.length||correctInjectors.length!==def.Options.length)return refuse('option-injector-shape');
        for(let index=0;index<def.Options.length;index++){
            const raw=def.Options[index],resolved=original[index];
            if(!raw||typeof raw!=='object'||!resolved||typeof resolved!=='object')return refuse('raw-original-options');
            const description=injectorTemplate(descInjectors[index]),correct=injectorTemplate(correctInjectors[index]);
            if(description===null||correct===null)return refuse('option-injector-shape');
            if(description!==raw.Description||correct!==raw.Correct)return refuse('raw-original-options');
            if(!nonTemplateFieldsEqual(raw,resolved))return refuse('raw-original-options');
        }
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
        if(new Set(shuffled.map(o=>o.Description.trim())).size!==shuffled.length)return refuse('shuffled-description-duplicate');
        if(original.some(o=>!shuffled.includes(o)))return refuse('original-shuffled-identity');
        if((injected.length!==0&&!placeholder))return refuse('synthetic-placeholder');
        if(dom.some((o,i)=>o.parentElement!==select||o.textContent!==shuffled[i].Description||o.text!==shuffled[i].Description.trim()||o.disabled||o.hidden||o.children.length))return refuse('dom-option-contract');
        if(dom.filter(o=>o.selected).length!==1)return refuse('dom-selected-count');
        if(select.selectedIndex<0)return refuse('dom-selected-index');
        const correct=shuffled.filter(o=>o.Correct==='true');
        if(correct.length!==1||!optionText(correct[0].Description))return refuse('correct-option');
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
    const signature=JSON.stringify([q.questionDef,rows.map(r=>[r.metadata,r.shuffled,r.original]),companionRows.map(r=>r.metadata)]);
    const descriptor={kind:'dropdown',key,autoMarked:true,signature,dropdowns:rows.map(r=>({id:r.def.ComponentID,answer:r.answer.Description,index:r.answerIndex,selectedIndex:r.selectedIndex,filled:r.filled}))};
    if(baseline&&(baseline.q!==q||baseline.model!==model||baseline.renderer!==renderer||baseline.base!==base||baseline.parser!==parser||baseline.identified!==identified
        ||baseline.companionRows.length!==companionRows.length||companionRows.some((r,i)=>['def','component','state','metadata','element'].some(k=>r[k]!==baseline.companionRows[i][k]))
        ||baseline.descriptor.key!==key||baseline.descriptor.signature!==signature||baseline.rows.length!==rows.length
        ||rows.some((r,i)=>{const b=baseline.rows[i];return ['select','def','component','state','metadata','original','shuffled','answer'].some(k=>r[k]!==b[k])||r.dom.some((o,j)=>o!==b.dom[j])||r.optionRefs.some((o,j)=>o!==b.optionRefs[j])||r.originalRefs.some((o,j)=>o!==b.originalRefs[j]);})))return refuse('baseline-changed');
    const result={descriptor,q,model,renderer,parser,identified,base,rows,companionRows};
    if(Number.isSafeInteger(action)){
        if(action<0||!rows[action])return refuse('target-index');
        result.target=rows[action].select;
    }else if(action==='verify'||action==='submit'){
        if(rows.some(r=>!r.filled||r.shuffled[r.selectedIndex]!==r.answer))return refuse('answers-not-verified');
        if(action==='submit'){
            const bars=[...document.querySelectorAll('#sa-navigation-controls')].filter(shown).filter(b=>modelOf(b)?.model===model);
            if(bars.length!==1)return refuse('submit-bar');
            const buttons=[...bars[0].querySelectorAll('button')].filter(b=>shown(b)&&b.textContent.trim()==='Submit');
            const enabled=buttons.filter(b=>!b.disabled);
            const submitState={visible:buttons.length,enabled:enabled.length};
            if(buttons.length>1)return {...refuse('submit-button-ambiguous'),submitState};
            // EP SkillsControls locks Submit for one second after loading a question
            // (chunk171: lockedForNewQuestion). Exact answers may settle first.
            if(!enabled.length)return {...result,readiness:'not-ready',submitState};
            result.target=enabled[0];
        }
    }
    return action==='diagnostic'?{guard:'supported',filled:rows.map(r=>r.filled)}:action==='descriptor'?{descriptor}:result;
}
module.exports={readDropdownsInPage};
