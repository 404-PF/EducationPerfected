const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {prepareWindowsFixtureProfile}=require('./windows-fixture-profile');
const {assertNetworkSandbox}=require('./windows-network-sandbox');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'ep-profile-inert-'));
try{
 prepareWindowsFixtureProfile(root,'linux');assert.deepEqual(fs.readdirSync(root),[]);
 prepareWindowsFixtureProfile(root,'win32');prepareWindowsFixtureProfile(root,'win32');
 for(const name of ['Local','Roaming'])assert.ok(fs.statSync(path.join(root,'AppData',name)).isDirectory());
 const healthy='12\tUtility\tNetwork Service\tNetwork\tNone\tDefault\t0\t0\tS-1-15-2-123';
 assert.deepEqual(assertNetworkSandbox(healthy,[{known:true,count:0}]),{sandbox:'Network',appContainer:true,launchFailures:0});
 for(const text of ['',healthy.replace('\tNetwork\t','\tNot Sandboxed\t'),healthy.replace('S-1-15-2-123',''),healthy.replace('Network Service','Storage Service')])assert.throws(()=>assertNetworkSandbox(text,[{known:true,count:0}]));
 for(const metrics of [[{known:false,count:0}],[{known:true,count:1}]])assert.throws(()=>assertNetworkSandbox(healthy,metrics));
 console.log('Windows fixture known-folder scaffolding and strict sandbox acceptance passed (inert).');
}finally{fs.rmSync(root,{recursive:true,force:true});}
