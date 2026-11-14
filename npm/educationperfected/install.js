// Downloads the platform binary from the GitHub release and verifies it
// against the release's SHA256SUMS before marking it executable.
// EP_INSTALL_BASE_URL overrides the download base (CI/testing only).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const pkg=require('./package.json');
const base=process.env.EP_INSTALL_BASE_URL||`https://github.com/404-Page-Found/EducationPerfected/releases/download/v${pkg.version}`;
const key=`${process.platform}-${process.arch}`;
const targets={'darwin-arm64':'macos-arm64','darwin-x64':'macos-x64','linux-x64':'linux-x64','linux-arm64':'linux-arm64','win32-x64':'windows-x64'};
const target=targets[key];
if(!target){console.error(`Unsupported platform ${key}; download manually from https://github.com/404-Page-Found/EducationPerfected/releases`);process.exit(1);}
const asset=`educationperfected-${target}${process.platform==='win32'?'.exe':''}`;
const dir=path.join(__dirname,'vendor');
const dest=path.join(dir,'educationperfected'+(process.platform==='win32'?'.exe':''));
async function get(url){
  if(url.startsWith('file://'))return fs.readFileSync(new URL(url));
  const res=await fetch(url,{redirect:'follow'});
  if(!res.ok)throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
function parseSums(text){
  const sums=new Map();
  for(const line of text.split(/\r?\n/)){
    if(!line.trim())continue;
    const m=/^([a-f0-9]{64}) [ *](.+)$/.exec(line);
    if(m)sums.set(m[2],m[1]);
  }
  return sums;
}
(async()=>{
  fs.mkdirSync(dir,{recursive:true});
  const [binary,sumsText]=await Promise.all([get(`${base}/${asset}`),get(`${base}/SHA256SUMS`).then(b=>b.toString('utf8'))]);
  const expected=parseSums(sumsText).get(asset);
  if(!expected)throw new Error(`SHA256SUMS has no line for ${asset}`);
  const actual=crypto.createHash('sha256').update(binary).digest('hex');
  if(actual!==expected)throw new Error(`Checksum mismatch for ${asset}; download discarded.`);
  fs.writeFileSync(dest,binary,{mode:0o755});
  console.log(`EducationPerfected ${pkg.version} verified and installed (${asset}).`);
})().catch(error=>{console.error(error.message);process.exit(1);});
