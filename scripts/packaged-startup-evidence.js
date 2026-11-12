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
  const raw=lines[0].slice('EP_TEST_STARTUP_FAILURE='.length);
  const value=JSON.parse(raw),schema=require('../lib/test-startup-schema.json');
  // This protocol is flat primitives only. Count decoded member names before
  // accepting JSON.parse's last-key-wins result, including escaped-key aliases.
  const keys=[...raw.matchAll(/"((?:[^"\\]|\\.)*)"\s*:/g)].map(match=>JSON.parse('"'+match[1]+'"'));
  if(keys.length!==new Set(keys).size)return null;
  if(Object.keys(value).sort((a,b)=>a.localeCompare(b,'en')).join(',')!==Object.keys(schema).sort((a,b)=>a.localeCompare(b,'en')).join(','))return null;
  for(const [key,options] of Object.entries(schema))if(!options.some(option=>option===value[key]))return null;
  return value;
 }catch{return null;}
}
module.exports={startupEvidence,parseStartupFailure};
