// Fixed categories only. Never print arbitrary error text, stacks, URLs or paths.
const NETWORK_ERRORS = ['ERR_CONNECTION_REFUSED','ERR_CONNECTION_RESET','ERR_CONNECTION_CLOSED','ERR_CONNECTION_ABORTED','ERR_NAME_NOT_RESOLVED','ERR_ADDRESS_UNREACHABLE','ERR_INTERNET_DISCONNECTED','ERR_NETWORK_CHANGED','ERR_ABORTED','ERR_FAILED'];
function navigationCause(error) {
 const message=typeof error?.message==='string'?error.message:'';
 const network=/\bnet::(ERR_[A-Z_]+)\b/.exec(message)?.[1];
 if(network) return {category:'network-error',code:NETWORK_ERRORS.includes(network)?network:'other'};
 if(error?.name==='TimeoutError') return {category:'timeout'};
 if(/Session closed|session closed/.test(message)) return {category:'session-closed'};
 if(/Target closed|target closed/.test(message)) return {category:'target-closed'};
 if(/browser has disconnected|Connection closed|connection closed/i.test(message)) return {category:'connection-closed'};
 if(/Navigating frame was detached|detached Frame/i.test(message)) return {category:'frame-detached'};
 if(/Requesting main frame too early/.test(message)) return {category:'main-frame-unavailable'};
 if(error?.name==='ProtocolError') return {category:'protocol-error'};
 if(error?.code==='ERR_INVALID_URL') return {category:'invalid-url'};
 return {category:'other'};
}
async function navigateForLogin(page,url,testBoot,report=console.error) {
 try { return await page.goto(url,{waitUntil:'domcontentloaded'}); }
 catch(error) {
  if(testBoot) {
   try { report('EP_TEST_NAVIGATION_FAILURE='+JSON.stringify(navigationCause(error))); } catch {}
  }
  throw error; // Preserve identity and rejection, before owner's startup cleanup.
 }
}
module.exports={navigationCause,navigateForLogin};
