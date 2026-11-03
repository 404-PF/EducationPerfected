// Inert/runner contracts only. Does not spawn a process or launch a browser.
const fs=require('node:fs'),{createHash}=require('node:crypto');
const {browserIdentity}=require('../lib/test-browser-identity');
const {browserIsInOwnedExtraction}=require('./packaged-browser-origin');
function requireEqual(actual,expected) {
 const keys=Object.keys(expected);
 if (!actual || Object.keys(actual).length!==keys.length || keys.some(key=>actual[key]!==expected[key]))throw Error('Diagnostic identity uncertainty');
 return actual;
}
async function readVerifiedArchive(archive,manifest) {
 const identity=browserIdentity(manifest);
 let stat,bytes;
 try {stat=fs.lstatSync(archive);} catch {throw Error('Diagnostic archive unavailable');}
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==identity.length)throw Error('Diagnostic archive length or ownership uncertainty');
 // Hash the exact immutable snapshot that is later consumed, never reopen by name.
 try {bytes=fs.readFileSync(archive);}catch{throw Error('Diagnostic archive read uncertainty');}
 if(bytes.length!==identity.length||createHash('sha256').update(bytes).digest('hex')!==identity.sha256)throw Error('Diagnostic archive hash uncertainty');
 return {identity,bytes};
}
async function verifyArchive(archive,manifest) {return (await readVerifiedArchive(archive,manifest)).identity;}
function parseIdentityReceipt(text) {
 const lines=text.split(/\r?\n/).filter(line=>line.startsWith('EP_TEST_BROWSER_IDENTITY='));
 if(lines.length!==1)throw Error('Missing or duplicate diagnostic identity receipt');
 const receipt=JSON.parse(lines[0].slice('EP_TEST_BROWSER_IDENTITY='.length));
 return requireEqual(receipt,browserIdentity({length:receipt.length,sha256:receipt.sha256,browserVersion:receipt.browserVersion}));
}
function assertOwnedBrowser(root,executable) {
 if(!browserIsInOwnedExtraction(root,executable))throw Error('Diagnostic browser not in owned extraction');
 return true;
}
function verifyLegIdentity({expected,receipt,observedVersion,owned}) {
 requireEqual(receipt,expected);
 if(owned!==true || observedVersion!=='Chrome/'+expected.browserVersion)throw Error('Diagnostic observed browser identity uncertainty');
 return {...expected,observedVersion,owned:true};
}
async function runStagedPanel(source,sea,expected) {
 let first;
 try {
  first=await source();
  verifyLegIdentity({...first,expected});
  if(first.ready!==true||first.cleanupCertain!==true)throw Error('Source readiness or cleanup uncertainty');
 } catch {return {outcome:'uncertainty',leg:'source',seaAttempted:false};}
 try {
  const second=await sea();verifyLegIdentity({...second,expected});
  if(second.ready!==true||second.cleanupCertain!==true)throw Error('SEA readiness or cleanup uncertainty');
  return {outcome:'not-reproduced-in-one-instrumented-sample',seaAttempted:true};
 } catch {return {outcome:'uncertainty',leg:'sea',seaAttempted:true};}
}
module.exports={readVerifiedArchive,verifyArchive,parseIdentityReceipt,assertOwnedBrowser,verifyLegIdentity,runStagedPanel};
