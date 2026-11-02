// Admission/predicate contract only. Metadata cannot independently prove who typed.
function requireProof({env,observation,output,controllerUsed=false,promptUsed=false,artifactKind,stdinIsTTY=false}) {
 if(['EP_TEST_BOOT','EP_EMAIL','EP_PASSWORD','EP_LOGIN_URL','EP_LOGIN_HOST'].some(key=>Object.hasOwn(env,key)))throw Error('Fixture environment refused');
 if(stdinIsTTY||controllerUsed||promptUsed||artifactKind!=='MODIFIED-VALIDATION-ONLY')throw Error('Fixture admission refused');
 if(observation?.attempts!==1||observation.matched!==true||!output.includes('Auto-login credentials loaded from the OS credential store.')||!output.includes('Commands: start'))throw Error('Normal saved-read proof missing');
 return true;
}
module.exports={requireProof};
