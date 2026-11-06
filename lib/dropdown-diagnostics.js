const {readDropdownsInPage}=require('./dropdown-state');
// Displayed controls only. Never serializes EP model/answers, cookies, URLs with
// queries, Angular scopes or surrounding question/student text. No writes/getters.
const BUILD='dropdown-diagnostics-v1';
function inspectDropdownDom(){
    const text=s=>String(s??'').slice(0,160);
    const shown=el=>!el.hidden&&(el.offsetParent!==null||el.getClientRects().length>0);
    const lesson=document.querySelector('#ep-question-container');
    const selects=[...document.querySelectorAll('select')];
    let shadowHosts=0;for(const el of document.querySelectorAll('*'))if(el.shadowRoot)shadowHosts++;
    return{questionContainer:!!lesson,selectCount:selects.length,shadowHosts,
        selects:selects.slice(0,20).map(el=>({tag:el.tagName,inQuestion:!!lesson?.contains(el),visible:shown(el),disabled:el.disabled,multiple:el.multiple,size:el.size,selectedIndex:el.selectedIndex,value:text(el.value),optionCount:el.options.length,
            options:[...el.options].slice(0,51).map(o=>({text:text(o.textContent),value:text(o.value),selected:o.selected,disabled:o.disabled,hidden:o.hidden})),optionsTruncated:el.options.length>51})),selectsTruncated:selects.length>20};
}
async function collectDropdownDiagnostics(page){
    const frames=typeof page.frames==='function'?page.frames():[page];
    const result={build:BUILD,readOnly:true,frameCount:frames.length,frames:[],framesTruncated:frames.length>8};
    for(const [index,frame]of frames.slice(0,8).entries()){
        const row={index,main:typeof page.mainFrame==='function'?frame===page.mainFrame():index===0};
        try{row.dom=await frame.evaluate(inspectDropdownDom);}catch{row.domError='inspection-unavailable';}
        try{row.detection=await frame.evaluate(readDropdownsInPage,null,'diagnostic');}catch{row.detection={guard:'inspection-threw'};}
        result.frames.push(row);
    }
    return result;
}
module.exports={BUILD,inspectDropdownDom,collectDropdownDiagnostics};
