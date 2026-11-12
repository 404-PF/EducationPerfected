// Fixed literal presence only. Never return arbitrary child text, paths or secrets.
const markers={
 endpointReported:'EP_WS_ENDPOINT=',
 navigationStarted:'Opening EP page...',
 loginWait:'Waiting for login page to load...',
 startupCauseReported:'EP_TEST_STARTUP_FAILURE=',
 downloadVerified:'Browser download checksum verified',
 needsInteractiveDownload:'First browser download needs an interactive terminal',
 startupFailed:'EducationPerfected could not start.',
 opening:'Opening EducationPerfected. Finish sign-in in the browser.',
 ownerReady:'EP_TEST_LOGIN_READY',
 missingFile:'A required browser or runtime file is missing.',
 accessDenied:'The operating system denied access.',
 launchFailed:'The browser could not launch; check display and system browser dependencies.',
 connectionClosed:'The browser connection closed.',
 connectionRefused:'The browser connection was refused.',
 timedOut:'The browser or sign-in step timed out.',
 sandboxBlocked:'The browser sandbox was blocked by operating-system policy.',
 genericFailure:'The operation failed; check the browser, sign-in state and installed runtime.',
 integrityFailed:'Browser payload integrity check failed (EP_BROWSER_CHECKSUM)',
};
function startupEvidence(text){
 return Object.fromEntries(Object.entries(markers).map(([key,literal])=>[key,text.includes(literal)]));
}
function parseStartupFailure(text){
 const lines=text.split(/\r?\n/).filter(line=>line.startsWith('EP_TEST_STARTUP_FAILURE='));
 if(lines.length!==1)return null;
 try{
  const value=JSON.parse(lines[0].slice('EP_TEST_STARTUP_FAILURE='.length));
  const {startupFailure}=require('../lib/test-startup-failure');
  const shape=startupFailure({},null);
  if(Object.keys(value).sort().join(',')!==Object.keys(shape).sort().join(','))return null;
  if(!['navigation-timeout','target-detached','browser-disconnected','protocol-error','other'].includes(value.category))return null;
  if(!['Error','TimeoutError','ProtocolError','TargetCloseError','TypeError','RangeError','ReferenceError','SyntaxError','other'].includes(value.name))return null;
  if(!['ENOENT','EACCES','EPERM','EINVAL','UNKNOWN','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE','other'].includes(value.code))return null;
  if(!['unobserved','running','zero','nonzero'].includes(value.browserExit))return null;
  if(![null,true,false].includes(value.controllerConnected))return null;
  for(const key of Object.keys(shape).filter(key=>typeof shape[key]==='boolean'))if(typeof value[key]!=='boolean')return null;
  return value;
 }catch{return null;}
}
module.exports={startupEvidence,parseStartupFailure};
