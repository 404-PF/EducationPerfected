// Fixed bounded hashes only. Source-set equality is not runtime attestation.
const crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function digest(m){
 if(m.kind!=='MODIFIED-VALIDATION-ONLY-JS-BUNDLES-NOT-SEA'||m.wholeBundleOutsideEndpointByteIdentical!==true||m.moduleGraphOutsideEndpointCountsIdentical!==true)throw Error('Attribution refused');
 const rows=[],seen=new Set();
 for(const [name,value] of Object.entries(m.inputs)){
  const marker='node_modules/',at=name.indexOf(marker),key=at<0?name:marker+name.slice(at+marker.length);
  if(seen.has(key)||key.startsWith('../')||!key||key.includes('\\'))throw Error('Attribution refused');seen.add(key);
  for(const v of [value.sha256,value.fixtureSha256])if(typeof v!=='string'||v.length!==64||[...v].some(c=>!'0123456789abcdef'.includes(c)))throw Error('Attribution refused');
  rows.push([key,value.sha256,value.fixtureSha256]);
 }
 if(rows.length<1||rows.length>10000)throw Error('Attribution refused');
 rows.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
 return hash(JSON.stringify(rows));
}
module.exports={digest};
if(require.main===module){try{const m=JSON.parse(fs.readFileSync(path.join(__dirname,'../../build/normal-read-review/manifest.json'),'utf8'));console.log('EP_CANONICAL_INPUT_SET_SHA256='+digest(m));}catch{console.log('EP_INPUT_ATTRIBUTION_RESULT=fail');process.exitCode=1;}}
