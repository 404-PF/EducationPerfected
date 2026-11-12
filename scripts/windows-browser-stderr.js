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
  const remaining=LIMIT-bytesExamined;
  if(!Buffer.isBuffer(chunk)&&typeof chunk!=='string')return;
  if(chunk.length>remaining)truncated=true;
  if(remaining===0)return;
  // Slice string code units before encoding; conversion is at most 3 * remaining bytes.
  const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk.slice(0,remaining));
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
function browserLogFile(file){
 const fs=require('node:fs'),diagnostic=browserStderr();let fd,state='unreadable';
 try{
  fd=fs.openSync(file,'r');
  const stat=fs.fstatSync(fd);
  if(!stat.isFile())throw new Error('Expected owned regular log file');
  // One extra byte lets the collector distinguish a complete prefix from a capped read.
  const buffer=Buffer.alloc(LIMIT+1),count=fs.readSync(fd,buffer,0,buffer.length,0);
  diagnostic.observe(buffer.subarray(0,count));state='read';
 }catch(error){if(error.code==='ENOENT')state='absent';}
 finally{if(fd!==undefined)fs.closeSync(fd);}
 const flags=diagnostic.result();delete flags.attached;return{state,...flags};
}
module.exports={browserStderr,browserLogFile,LIMIT};
