// Experimental local-fixture diagnostic. Never retain or print raw CDP payloads.
const EVENTS = new Set(['Target.attachedToTarget','Target.detachedFromTarget','Target.targetDestroyed','Inspector.targetCrashed','Inspector.detached','Page.frameAttached','Page.frameDetached']);
const METHODS = new Set(['Page.getFrameTree','Page.enable','Runtime.enable','Target.setAutoAttach']);
function createTestCdpDiagnostic(record) {
 let count=0;
 const pending=new Map();
 const classify = value => {
  const message=typeof value==='string'?value:typeof value?.message==='string'?value.message:'';
  if (/session closed|Session closed/.test(message)) return 'session-closed';
  if (/Target closed|target closed/.test(message)) return 'target-closed';
  if (/Connection closed|connection closed/.test(message)) return 'connection-closed';
  if (/detached/i.test(message)) return 'detached';
  if (/timed out|timeout/i.test(message)) return 'timeout';
  return 'other';
 };
 const emit = entry => { if(count<64) { count++; record({sequence:count,...entry}); } };
 return prefix => {
  if(prefix==='puppeteer:error') return (...args) => { try { emit({kind:'suppressed-error',category:classify(args[0])}); } catch {} };
  const send=prefix==='puppeteer:protocol:SEND ►', receive=prefix==='puppeteer:protocol:RECV ◀';
  if(!send && !receive) return undefined;
  return raw => {
   try {
    if(count>=64 || typeof raw!=='string' || raw.length>262144) return;
    const message=JSON.parse(raw);
    if(!message || typeof message!=='object') return;
    if(send && METHODS.has(message.method) && Number.isSafeInteger(message.id) && pending.size<32) {
     pending.set(message.id,message.method);
     emit({kind:'request',method:message.method});
    } else if(receive && Number.isSafeInteger(message.id) && pending.has(message.id)) {
     const method=pending.get(message.id); pending.delete(message.id);
     const entry={kind:'response',method,status:message.error?'error':'ok'};
     if(message.error) entry.category=classify(message.error);
     if(method==='Page.getFrameTree' && !message.error) entry.mainFramePresent=Boolean(message.result?.frameTree?.frame?.id);
     emit(entry);
    } else if(receive && EVENTS.has(message.method)) {
     const entry={kind:'event',method:message.method};
     if(message.method==='Page.frameDetached') entry.reason=['remove','swap'].includes(message.params?.reason)?message.params.reason:'other';
     emit(entry);
    }
   } catch { /* Diagnostic input must never affect browser control flow. */ }
  };
 };
}
module.exports={createTestCdpDiagnostic};
