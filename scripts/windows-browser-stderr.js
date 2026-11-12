// Diagnostic-only fixed flags. Never retain or publish raw browser logs.
const LIMIT=65536,TAIL=1024;
function browserStderr(){
 let tail='',bytesExamined=0,truncated=false,attached=false;
 const flags={networkServiceCrash:false,sandboxAccessDenied:false,gpuProcessExit:false,encryptionFailure:false};
 const patterns={
  networkServiceCrash:/network_service[^\r\n]{0,256}Network service crashed/i,
  sandboxAccessDenied:/sandbox[^\r\n]{0,256}(?:Access is denied|cannot access executable)/i,
  gpuProcessExit:/gpu_process[^\r\n]{0,256}GPU process exited unexpectedly/i,
  encryptionFailure:/(?:os_crypt|app_bound_encryption|login_database)[^\r\n]{0,256}(?:Failed to encrypt|Unable to encrypt|Encryption is not available)/i,
 };
 function observe(chunk){
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk));
  const remaining=LIMIT-bytesExamined;
  if(bytes.length>remaining)truncated=true;
  const bounded=bytes.subarray(0,remaining);bytesExamined+=bounded.length;
  const text=tail+bounded.toString('utf8');
  for(const key of Object.keys(flags))flags[key] ||= patterns[key].test(text);
  tail=text.slice(-TAIL);
 }
 function attach(stream){
  if(!stream||typeof stream.on!=='function')return()=>{};
  attached=true;stream.on('data',observe);
  return()=>{stream.off('data',observe);tail='';};
 }
 return{observe,attach,result:()=>({attached,bytesExamined,truncated,...flags})};
}
module.exports={browserStderr,LIMIT};
