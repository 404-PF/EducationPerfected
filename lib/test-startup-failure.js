// TEST_BOOT catch-only evidence. Never expose messages, stacks, paths or URLs.
const schema=require('./test-startup-schema.json');
const names=new Set(schema.name),codes=new Set(schema.code);
function startupFailure(error,browser){
 const message=typeof error?.message==='string'?error.message:'';
 const category=require('./test-navigation-cause').navigationCause(error);
 let connected=null,exit='unobserved';
 try{if(browser)connected=browser.isConnected()===true;}catch{}
 try{const child=browser?.process(),value=child?.exitCode;if(child?.signalCode)exit='signalled';else if(value===null)exit='running';else if(value===0)exit='zero';else if(Number.isInteger(value))exit='nonzero';}catch{}
 return {category,name:names.has(error?.name)?error.name:'other',code:codes.has(error?.code)?error.code:'other',
  browserCreated:Boolean(browser),controllerConnected:connected,browserExit:exit,
  frameDetached:/detached|Requesting main frame too early/i.test(message),
  targetClosed:/Target closed|Session closed|Connection closed|browser has disconnected/i.test(message),
  browserLaunch:/Failed to launch|Browser was not found|Could not find Chrome/i.test(message),
  processSpawn:/spawn|CreateProcess/i.test(message),
  protocolTimeout:/protocolTimeout|timed out/i.test(message),
  navigationNetwork:/net::ERR_/i.test(message),
  missingContext:/Execution context was destroyed|Cannot find context/i.test(message),
 };
}
function recordStartupFailure(error,browser,testBoot,report=console.error){
 if(!testBoot)return;
 try{report('EP_TEST_STARTUP_FAILURE='+JSON.stringify(startupFailure(error,browser)));}catch{}
}
module.exports={startupFailure,recordStartupFailure};
