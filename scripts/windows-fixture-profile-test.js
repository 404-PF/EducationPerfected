const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareWindowsFixtureProfile}=require('./windows-fixture-profile');
const {assertNetworkSandbox}=require('./windows-network-sandbox');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-profile-inert-'));
try{
 prepareWindowsFixtureProfile(root,'linux');assert.deepEqual(fs.readdirSync(root),[]);
 prepareWindowsFixtureProfile(root,'win32');prepareWindowsFixtureProfile(root,'win32');
 for(const name of ['Local','Roaming'])assert.ok(fs.statSync(path.join(root,'AppData',name)).isDirectory());
 const healthy='12\tUtility\tNetwork Service\tNetwork\tNone\tDefault\t0\t0\tS-1-15-2-1-2-3-4-5-6-7';
 assert.deepEqual(assertNetworkSandbox(healthy,[{known:true,count:0}]),{sandbox:'Network',appContainer:true,noRecordedLaunchFailures:true});
 for(const text of ['',healthy.replace('\tNetwork\t','\tNot Sandboxed\t'),healthy.replace('S-1-15-2-1-2-3-4-5-6-7',''),healthy.replace('Network Service','Storage Service'),healthy+'suffix',healthy.replace('S-1-15-2-1-2-3-4-5-6-7','prefixS-1-15-2-1-2-3-4-5-6-7')])assert.throws(()=>assertNetworkSandbox(text,[{known:true,count:0}]));
 for(const metrics of [[{known:false,count:0}],[{known:true,count:1}]])assert.throws(()=>assertNetworkSandbox(healthy,metrics));
 console.log('Windows fixture known-folder scaffolding and strict sandbox acceptance passed (inert).');
}finally{fs.rmSync(root,{recursive:true,force:true});}
(async()=>{
 const {observeNetworkSandbox}=require('./windows-network-sandbox');
 const never=()=>new Promise(()=>{});
 await assert.rejects(observeNetworkSandbox({target:()=>({createCDPSession:never})},10),/observation deadline/);
 let detached=false,closed=false;
 const browser={target:()=>({createCDPSession:async()=>({send:async()=>({histograms:[]}),detach:async()=>{detached=true;}})}),newPage:async()=>({goto:never,close:async()=>{closed=true;}})};
 await assert.rejects(observeNetworkSandbox(browser,10),/observation deadline/);assert.ok(detached&&closed);
 console.log('Sandbox session/navigation timeout and cleanup contracts passed (inert).');
})().catch(error=>{console.error(error);process.exitCode=1;});
