// Fixed diagnostic metrics only. They aggregate utility processes, not just networking.
const names=[
 'ChildProcess.Crashed.UtilityProcessExitCode',
 'ChildProcess.LaunchFailed.UtilityProcessErrorCode',
 'ChildProcess.LaunchFailed.WinLastError',
 'ChildProcess.LaunchFailed.UtilityProcessHash',
 'ChildProcess.Crashed.UtilityProcessHash',
 'ChildProcess.Launched.UtilityProcessHash',
];
function boundedHistogram(value,name){
 const integer=n=>Number.isSafeInteger(n)&&n>=-2147483648&&n<=4294967296;
 if(!value||value.name!==name||!integer(value.count)||value.count<0||!Array.isArray(value.buckets)||value.buckets.length>16)return{state:'invalid'};
 const buckets=[];
 for(const bucket of value.buckets){
  if(!bucket||typeof bucket!=='object'||!integer(bucket.low)||!integer(bucket.high)||!integer(bucket.count)||bucket.count<0||bucket.high<=bucket.low)return{state:'invalid'};
  buckets.push({low:bucket.low,high:bucket.high,count:bucket.count});
 }
 return{state:'read',count:value.count,buckets};
}
async function boundedCall(operation){
 let timer;
 try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Diagnostic metric deadline')),2000);})]);}
 finally{clearTimeout(timer);}
}
async function createSession(browser,deadlineMs=2000){
 let expired=false;
 const operation=browser.target().createCDPSession().then(async session=>{
  if(expired){try{await boundedCall(session.detach());}catch{}throw new Error('Late diagnostic session');}
  return session;
 });
 let timer;
 try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Diagnostic session deadline'));},deadlineMs);})]);}
 finally{clearTimeout(timer);}
}
async function utilityHistograms(browser){
 const result=Object.fromEntries(names.map(name=>[name,{state:'unavailable'}]));let session;
 try{
  session=await createSession(browser);
  for(const name of names){
   try{const response=await session.send('Browser.getHistogram',{name,delta:false},{timeout:2000});result[name]=boundedHistogram(response.histogram,name);}catch{ /* Missing metric is unknown, not zero. */ }
  }
 }catch{ /* No controller access must not erase the navigation observation. */ }
 finally{if(session)try{await boundedCall(session.detach());}catch{ /* Browser closure remains separately checked. */ }}
 return result;
}
module.exports={names,boundedHistogram,utilityHistograms,createSession};
