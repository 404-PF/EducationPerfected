const assert=require('node:assert/strict'),puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');const {installDropdownFixture}=require('./dropdown-fixture');
const {detectQuestion}=require('../lib/detect-question');const {playDropdownRound}=require('../lib/dropdown-handler');
const {readDropdownsInPage}=require('../lib/dropdown-state');
const countFields=mutation=>{
 if(!['mixed','extraSelect'].includes(mutation))return {};
 const extra=Number(mutation==='mixed');
 return{definitionCount:5+extra,dropdownDefinitionCount:5,companionDefinitionCount:0,unsupportedDefinitionCount:extra};
};
(async()=>{const server=createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
const setup=async()=>{await page.goto(origin+'/lesson');await page.evaluate(installDropdownFixture);
 await page.evaluate(()=>{const b=document.querySelector('#sa-navigation-controls button'),clone=b.cloneNode(true);clone.textContent='Next Question';b.parentElement.append(clone);clone.click();clone.remove();});
 assert.equal(await page.evaluate(()=>dropdownFixture.nexts),1);await page.evaluate(()=>{dropdownFixture.nexts=0;});};
await setup();let d=await detectQuestion(page);assert.equal(d.kind,'dropdown',JSON.stringify(d));
const result=await playDropdownRound(page,d,{enter:true,timeout:300});assert.equal(result.status,'advanced');
assert.deepEqual(await page.evaluate(()=>dropdownFixture.submittedSelections),[['Radius','Radius'],['Circumference','Circumference'],['Circumference','Circumference'],['2','2'],['Radius','Radius']]);
const expectedKeys=Array.from({length:5},(_,i)=>['Home','ArrowDown','ArrowDown'].map(key=>({id:'dropdown-'+i,key,trusted:true}))).flat();
assert.deepEqual(await page.evaluate(()=>dropdownFixture.keys),expectedKeys);
assert.deepEqual(await page.evaluate(()=>[dropdownFixture.changes.length,dropdownFixture.changes.every(e=>e.trusted),dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.q.questionIndex]),[10,true,1,0,1]);
await setup();d=await detectQuestion(page);let filled=false;
assert.equal((await playDropdownRound(page,d,{enter:false,timeout:0,log:()=>{filled=true;},shouldStop:()=>filled})).status,'aborted');
assert.deepEqual(await page.evaluate(()=>[...dropdownFixture.group.querySelectorAll('select')].map(el=>[el.options[el.selectedIndex].textContent,dropdownFixture.base[el.id][0].componentState._selectedOption.Description])),[['Radius','Radius'],['Circumference','Circumference'],['Circumference','Circumference'],['2','2'],['Radius','Radius']]);
assert.deepEqual(await page.evaluate(()=>[dropdownFixture.submits,dropdownFixture.nexts,dropdownFixture.q.questionIndex]),[0,0,0]);
if(process.env.EP_DROPDOWN_SCREENSHOT)await page.screenshot({path:process.env.EP_DROPDOWN_SCREENSHOT});
const expectedDropdownGuards={manual:'not-explicit-auto-marked',mixed:'definitions-select-count',unmarked:'component-marked',missing:'raw-original-options',duplicate:'shuffled-description-duplicate',padded:'dom-option-contract',unsafe:'source-option-text-or-flags',twoCorrect:'correct-option',noneCorrect:'correct-option',invalid:'source-option-text-or-flags',default:'raw-default',selectedMismatch:'cached-blank-identity',foreign:'visual-element',disabled:'select-control-or-model',multiple:'select-control-or-model',size:'select-control-or-model',optgroup:'dom-option-contract',extraInput:'mixed-editable-inputs',extraEditable:'mixed-editable-inputs',rawMismatch:'raw-original-options',lazyGetter:'shuffled-array',extraSelect:'definitions-select-count',optionElement:'dom-option-contract',missingDefault:'default-none-contract',nullDefault:'default-none-contract',indexGetter:'missing-renderer-map',parserGetter:'missing-renderer-map'};
for(const mutation of ['manual','assessment','mixed','unmarked','missing','duplicate','padded','unsafe','twoCorrect','noneCorrect','invalid','default','selectedMismatch','foreign','disabled','multiple','size','optgroup','extraInput','extraEditable','rawMismatch','lazyGetter','extraSelect','optionElement','missingDefault','nullDefault','indexGetter','parserGetter']){
 await setup();await page.evaluate(m=>{const f=dropdownFixture,c=f.base['dropdown-0'][0],s=c.componentState,o=s.originalDropDownOptions[0];
 if(m==='manual')f.self.sectionData.activityGroup.isAutoMarked=false;
 if(m==='assessment')f.self.model.gameMode=2;
 if(m==='mixed')f.q.questionDef.Components.push({ComponentTypeCode:'TEXT_BOX_COMPONENT'});
 if(m==='unmarked')c.marked=0;
 if(m==='missing')delete s.originalDropDownOptions;
 if(m==='duplicate')s._shuffledOptions[1].Description=s._shuffledOptions[2].Description;
 if(m==='padded')o.Description=' wrong ';
 if(m==='unsafe')o.Description='wrong\u202e';
 if(m==='twoCorrect')o.Correct='true';
 if(m==='noneCorrect')s._shuffledOptions[2].Correct='false';
 if(m==='invalid')o.Validity='false';
 if(m==='default')s.metadataInstance.DefaultSelection.Correct='true';
 if(m==='selectedMismatch')s._selectedOption=o;
 if(m==='foreign')c.visualElement=document.body;
 if(m==='disabled')c.dropDownList.disabled=true;
 if(m==='multiple')c.dropDownList.multiple=true;
 if(m==='size')c.dropDownList.size=2;
 if(m==='optgroup'){const g=document.createElement('optgroup');g.append(c.dropDownList.options[1]);c.dropDownList.append(g);}
 if(m==='extraInput')f.group.append(document.createElement('input'));
 if(m==='extraEditable'){const el=document.createElement('div');el.contentEditable='true';el.textContent='edit';f.group.append(el);}
 if(m==='rawMismatch')f.q.questionDef.Components[0].Options=[];
 if(m==='lazyGetter'){delete s._shuffledOptions;Object.defineProperty(s,'shuffledOptions',{get(){throw new Error('must not invoke');}});}
 if(m==='extraSelect')f.group.append(c.dropDownList.cloneNode(true));
 if(m==='missingDefault'){s._selectedOption=null;delete s.metadataInstance.DefaultSelection;delete f.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0').DefaultSelection;}
 if(m==='nullDefault'){s._selectedOption=null;s.metadataInstance.DefaultSelection=null;f.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0').DefaultSelection=null;}
 if(m==='indexGetter'){delete f.q.cachedRenderers[1].identifiedComponents;Object.defineProperty(f.q.cachedRenderers[1],'identifiedComponents',{get(){f.getterCalls=(f.getterCalls||0)+1;throw new Error('no getter');}});}
 if(m==='parserGetter'){delete f.q.cachedRenderers[1].identifiedComponents;Object.defineProperty(f.q.cachedRenderers[1],'parser',{get(){f.getterCalls=(f.getterCalls||0)+1;throw new Error('no getter');}});}
 if(m==='optionElement')c.dropDownList.options[1].append(document.createElement('span'));
 },mutation);
 assert.equal(await page.evaluate(()=>dropdownFixture.getterCalls||0),0);
 const bad=await detectQuestion(page);assert.equal(bad.kind,'unsupported',mutation);
 if(mutation==='assessment')assert.equal(bad.diagnostic,undefined,mutation);
 else assert.deepEqual(bad.diagnostic,{kind:'dropdown-refusal',guard:expectedDropdownGuards[mutation],domSelectCount:mutation==='extraSelect'?6:5,...countFields(mutation)},mutation);
 assert.equal(await page.evaluate(()=>dropdownFixture.getterCalls||0),0);
 assert.equal((await playDropdownRound(page,bad,{enter:true,timeout:50})).status,'stopped',mutation);
 assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[0,0,0],mutation);
}
// The reportGuard read must surface the guard on the assessment refusal too.
await setup();await page.evaluate(()=>{dropdownFixture.self.model.gameMode=2;});
{const r=await page.evaluate(readDropdownsInPage,null,undefined,true);assert.equal(r.guard,'assessment-mode');assert.equal(r.descriptor.assessment,true);assert.equal(r.descriptor.diagnostic,undefined);}
await setup();await page.evaluate(()=>{const r=dropdownFixture.q.cachedRenderers[1],index=r.identifiedComponents;delete r.identifiedComponents;r.parser={identifiedComponents:index};const prototype=Object.create(Object.getPrototypeOf(r));Object.defineProperty(prototype,'identifiedComponents',{configurable:true,get(){throw new Error('must not invoke inherited getter');}});Object.setPrototypeOf(r,prototype);});
assert.equal((await detectQuestion(page)).kind,'dropdown');
let parserFilled=false;assert.equal((await playDropdownRound(page,await detectQuestion(page),{enter:false,timeout:0,log:()=>{parserFilled=true;},shouldStop:()=>parserFilled})).status,'aborted');
await setup();await page.evaluate(()=>{const c=dropdownFixture.base['dropdown-0'][0];c.dropDownList.selectedIndex=2;c.componentState._selectedOption=c.componentState._shuffledOptions[2];});
assert.equal((await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:50})).status,'stopped');assert.equal(await page.evaluate(()=>dropdownFixture.keys.length),0);
for(const mutation of ['answer','identity','order','element','focus','ineffective','advance','cached','optionIdentity','template']){
 await setup();d=await detectQuestion(page);
 await page.evaluate(m=>{const f=dropdownFixture,c=f.base['dropdown-0'][0];
 if(m==='ineffective'){f.beforeKey=e=>e.preventDefault();return;}
 f.afterChange=()=>{
 if(m==='answer')c.componentState._shuffledOptions[2].Correct='false';
 if(m==='identity')f.base['dropdown-0']=[{...c}];
 if(m==='order')c.componentState._shuffledOptions.reverse();
 if(m==='element')c.dropDownList.replaceWith(c.dropDownList.cloneNode(true));
 if(m==='focus')f.base['dropdown-1'][0].dropDownList.focus();
 if(m==='advance')f.q.questionIndex++;
 if(m==='cached')c.componentState._selectedOption=null;
 if(m==='template')f.q.questionDef.TextTemplate='changed question';
 if(m==='optionIdentity'){const old=c.componentState._shuffledOptions[1],copy={...old};c.componentState._shuffledOptions[1]=copy;c.componentState.originalDropDownOptions[c.componentState.originalDropDownOptions.indexOf(old)]=copy;c.componentState.metadataInstance.Options[c.componentState.metadataInstance.Options.indexOf(old)]=copy;c.componentState._selectedOption=copy;}
 };},mutation);
 const r=await playDropdownRound(page,d,{enter:true,timeout:50});assert.equal(r.status,'stopped',mutation);
 assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[2,0,0],mutation);
}
await setup();let cancelled=false;await page.exposeFunction('cancelDropdownTest',()=>{cancelled=true;});await page.evaluate(()=>{dropdownFixture.afterChange=()=>window.cancelDropdownTest();});
assert.equal((await playDropdownRound(page,await detectQuestion(page),{enter:true,timeout:50,shouldStop:()=>cancelled})).status,'aborted');assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits]),[2,0]);
// Variable-bearing dropdown options (EP BasicVariableInjector): raw def keeps
// {expression} templates; metadata/original/DOM carry resolved values.
await page.goto(origin+'/lesson-dropdown?count=1&variant=variables');
{const vd=await detectQuestion(page);assert.equal(vd.kind,'dropdown',JSON.stringify(vd));assert.equal(vd.dropdowns.length,1);assert.equal(vd.dropdowns[0].answer,'42 right');
const vr=await playDropdownRound(page,vd,{enter:true,timeout:300});assert.equal(vr.status,'advanced');
assert.deepEqual(await page.evaluate(()=>[dropdownFixture.submittedSelections,dropdownFixture.submits,dropdownFixture.nexts]),[[['42 right','42 right']],1,0]);}
const variableRefusal=async(mutate,guard,extra)=>{
 await page.goto(origin+'/lesson-dropdown?count=1&variant=variables');
 await page.evaluate(mutate);
 const bad=await detectQuestion(page);assert.equal(bad.kind,'unsupported');
 assert.deepEqual(bad.diagnostic,{kind:'dropdown-refusal',guard,domSelectCount:1});
 assert.equal((await playDropdownRound(page,bad,{enter:true,timeout:50})).status,'stopped');
 assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[0,0,0]);
 if(extra)await extra();
};
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.descInjectors[0].parts[0].text='tampered';},'raw-original-options');
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.descInjectors[0].parts.push({text:'extra'});},'raw-original-options');
await variableRefusal(()=>{const d=dropdownFixture.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0');d.Options[0].SortOrder=7;},'raw-original-options');
await variableRefusal(()=>{const d=dropdownFixture.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0');d.Options[0].Extra='x';},'raw-original-options');
await variableRefusal(()=>{delete dropdownFixture.base['dropdown-0'][0].componentState.descInjectors;},'option-injector-shape');
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.correctInjectors[1].parts=[{}];},'option-injector-shape');
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.correctInjectors.length=1;},'option-injector-shape');
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.descInjectors[0].parts[0].temporaryVariable={expression:'n'};},'option-injector-shape');
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.descInjectors[0].parts[1]={temporaryVariable:{}};},'option-injector-shape');
await variableRefusal(()=>{dropdownFixture.base['dropdown-0'][0].componentState.descInjectors[0].parts=[{text:'{n} wrong'}];},'option-injector-shape');
await variableRefusal(()=>{const d=dropdownFixture.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0');Object.defineProperty(d.Options[0],'SortOrder',{value:7,enumerable:false});},'raw-original-options');
await variableRefusal(()=>{const d=dropdownFixture.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0');window.__validityReads=0;Object.defineProperty(d.Options[0],'Validity',{get(){window.__validityReads++;return 'true';}});},'raw-original-options',async()=>{assert.equal(await page.evaluate(()=>window.__validityReads),0);});
await variableRefusal(()=>{const d=dropdownFixture.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0');d.Options[0][Symbol.for('tamper')]=1;},'raw-original-options');
await variableRefusal(()=>{const f=dropdownFixture,d=f.q.questionDef.Components.find(d=>d.ComponentID==='dropdown-0'),s=f.base['dropdown-0'][0].componentState,a={note:'x'},b={note:'x'};a.self=a;b.self=b;d.Options[0].Meta=a;s.originalDropDownOptions[0].Meta=b;},'raw-original-options');
// In-place sorted display metadata keeps def/original/injector alignment.
await page.goto(origin+'/lesson-dropdown?count=1&variant=variables');
await page.evaluate(()=>{const c=dropdownFixture.base['dropdown-0'][0],s=c.componentState;s.metadataInstance.Options=s._shuffledOptions;[s._shuffledOptions[1],s._shuffledOptions[2]]=[s._shuffledOptions[2],s._shuffledOptions[1]];[...c.dropDownList.options].forEach((o,i)=>o.textContent=s._shuffledOptions[i].Description);});
{const rd=await detectQuestion(page);assert.equal(rd.kind,'dropdown');assert.equal(rd.dropdowns[0].answer,'42 right');
assert.equal((await playDropdownRound(page,rd,{enter:true,timeout:300})).status,'advanced');
assert.deepEqual(await page.evaluate(()=>[dropdownFixture.submittedSelections,dropdownFixture.submits]),[[['42 right','42 right']],1]);}
console.log('Dropdown source-derived browser fixtures PASS: five DOM-ordered controls, 15 trusted keys / 10 trusted changes / one Submit; exact fill-only0Submit; 29 initial refusals,10 post-key stops, event-driven cancellation; variable-template slide fills+submits, fourteen injector/ref raw refusals0input, reordered variable metadata submits. Synthetic Linux only; intermediate selections occur.');
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
