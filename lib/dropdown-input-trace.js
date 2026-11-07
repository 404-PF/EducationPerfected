// Passive, bounded telemetry for the existing approved native-select key sequence.
// No text/value reads, event cancellation, input synthesis or selection writes.
function observeDropdownInput(baseline) {
    const selects=baseline.rows.map(row=>row.select);
    if(!selects.length||selects.length>20||selects.some(el=>!(el instanceof HTMLSelectElement)))throw new Error('invalid trace controls');
    const events=[],timers=new Set(),limit=64;
    let dropped=0,closed=false;
    const index=value=>Number.isInteger(value)&&value>=-1&&value<=50?value:null;
    const state=()=>({actual:selects.map(el=>index(el.selectedIndex)),focusedDropdownIndex:selects.indexOf(document.activeElement),documentHasFocus:document.hasFocus(),visibility:document.visibilityState==='visible'?0:document.visibilityState==='hidden'?1:2});
    const appearance=selects.map(el=>{
        const value=getComputedStyle(el).appearance;
        return value==='auto'?0:value==='none'?1:value==='base-select'?2:3;
    });
    const initial=state();
    const listener=event=>{
        const targetIndex=selects.indexOf(event.target);
        if(closed||targetIndex<0)return;
        const key=event.key==='Home'?0:event.key==='ArrowDown'?1:null;
        if((event.type==='keydown'||event.type==='keyup')&&key===null)return;
        if(events.length>=limit){dropped=Math.min(dropped+1,65535);return;}
        const record={type:['keydown','keyup','input','change'].indexOf(event.type),targetIndex,trusted:event.isTrusted,key,code:event.code==='Home'?0:event.code==='ArrowDown'?1:null,modifiers:(event.altKey?1:0)|(event.ctrlKey?2:0)|(event.metaKey?4:0)|(event.shiftKey?8:0),defaultPreventedAtCapture:event.defaultPrevented,atCapture:state(),completionPending:true};
        events.push(record);
        const timer=setTimeout(()=>{
            timers.delete(timer);
            if(closed)return;
            record.defaultPreventedAfterTask=event.defaultPrevented;
            record.afterTask=state();
            record.completionPending=false;
        },0);
        timers.add(timer);
    };
    const types=['keydown','keyup','input','change'];
    types.forEach(type=>window.addEventListener(type,listener,{capture:true,passive:true}));
    return {
        snapshot:()=>({schema:1,initial,current:state(),appearance,events,dropped}),
        close:()=>{
            closed=true;
            types.forEach(type=>window.removeEventListener(type,listener,true));
            timers.forEach(timer=>clearTimeout(timer));timers.clear();
        }
    };
}
module.exports={observeDropdownInput};
