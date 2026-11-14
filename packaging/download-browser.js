// Direct user-side Google download. No browser bytes are shipped by this module.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const pins=require('./browser-downloads.json');
const {createHash}=require('node:crypto');
async function fileHash(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file)){hash.update(chunk);}return hash.digest('hex');}
const platforms={'linux-x64':'linux64','linux-arm64':'linux-arm64','darwin-arm64':'mac-arm64','darwin-x64':'mac-x64','win32-x64':'win64'};
function checkExtractor(platform=process.platform,run=require('node:child_process').spawnSync){
 const command=platform==='win32'?path.join(process.env.SystemRoot||String.raw`C:\Windows`,'System32','tar.exe'):'unzip';
 const result=run(command,platform==='win32'?['--version']:['-v'],{stdio:'ignore',timeout:10000});
 if(result.error||result.status!==0)throw new Error('ZIP extractor unavailable');
}
function hostPin(platform=process.platform,arch=process.arch){
 const name=platforms[platform+'-'+arch];const pin=pins.archives.find(p=>p.platform===name);
 if(!pin||!/^\d+\.\d+\.\d+\.\d+$/.test(pins.version)||!/^[a-f0-9]{64}$/.test(pin.sha256))throw new Error('Unsupported browser download target or pin');
 const url=new URL(pin.url);
 if(url.protocol!=='https:'||url.hostname!=='storage.googleapis.com'||url.pathname!==`/chrome-for-testing-public/${pins.version}/${name}/chrome-${name}.zip`||url.search||url.hash)throw new Error('Invalid fixed Google browser source');
 return pin;
}
async function promptDownload({input=process.stdin,output=process.stdout,home=os.homedir()}={}){
 if(!input.isTTY||!output.isTTY){output.write('First browser download needs an interactive terminal. Open this executable in a terminal and retry.\n');throw new Error('First browser download needs an interactive terminal');}
 output.write('This test build needs a one-time Chrome for Testing '+pins.version+' download (about 200 MB) from Google, stored in '+path.join(home,'.educationperfected')+'.\nGoogle terms: https://policies.google.com/terms and https://www.google.com/chrome/terms/ (downloading accepts them).\nDownload now? [y/N]: ');
 const rl=require('node:readline').createInterface({input,output});
 try { return await new Promise(resolve=>{rl.once('line',line=>resolve(['y','yes'].includes(line.trim().toLowerCase())));rl.once('close',()=>resolve(false));}); }
 finally {rl.close();}
}
async function ensureBrowser({consent=promptDownload,install,api,home=os.homedir(),platform=process.platform,arch=process.arch,output=process.stdout,extractor=checkExtractor}={}){
 const pin=hostPin(platform,arch);
 // Do not share Puppeteer's cache or honor arbitrary browser/base-URL environment overrides.
 const root=path.join(home,'.educationperfected','browsers');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const directory=path.join(root,pins.version+'-'+pin.platform),receipt=path.join(directory,'COMPLETE.json');
 const existing=async()=>{
  if(!fs.existsSync(receipt))return null;
  const record=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(record.version!==pins.version||record.sha256!==pin.sha256||typeof record.executable!=='string'||path.isAbsolute(record.executable))throw new Error('Invalid browser installation receipt');
  const file=path.resolve(directory,record.executable);
  if(!file.startsWith(directory+path.sep)||!fs.statSync(file).isFile()||!fs.realpathSync(file).startsWith(fs.realpathSync(directory)+path.sep))throw new Error('Incomplete browser installation');
  if(typeof record.executableSha256!=='string'||await fileHash(file)!==record.executableSha256){output.write('Cached browser executable changed. Close all EducationPerfected processes, remove this browser installation directory, then retry: '+directory+'\n');throw new Error('Cached browser executable changed');}
  return file;
 };
 const cached=await existing();if(cached)return cached;
 const lock=directory+'.lock';let fd;
 try {fd=fs.openSync(lock,'wx',0o600);} catch(error) {if(error.code!=='EEXIST'){throw error;}output.write('Browser installation is active or was interrupted. Lock: '+lock+'. Close all EducationPerfected processes, then remove that lock and orphaned .download-* directories in '+root+' before retrying. Never remove them while an installation is running.\n');throw new Error('Browser installation lock requires inspection');}
 let staging;
 let cleaned=false;
 const cleanup=()=>{if(cleaned){return;}cleaned=true;try{if(staging)fs.rmSync(staging,{recursive:true,force:true});}finally{fs.closeSync(fd);fs.rmSync(lock,{force:true});}};
 process.once('exit',cleanup);
 // Fail closed, including a stalled network/extraction. The process exit hook cleans only owned staging/lock.
 let timer;
 try {
  if(!await consent()){output.write('Browser download cancelled; no browser started.\n');throw new Error('Browser download cancelled; no browser started');}
  try {extractor(platform);}catch(error){output.write('ZIP extraction needs unzip on PATH on Linux/macOS or Windows System32 tar.exe. Install/repair that OS tool before retrying; no browser downloaded.\n');throw error;}
  timer=setTimeout(()=>{output.write('Browser installation timed out. Restart to retry.\n');process.exit(1);},15*60*1000);timer.unref();
  staging=fs.mkdtempSync(path.join(root,'.download-'));fs.chmodSync(staging,0o700);
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,staging:path.basename(staging)})+'\n');
  api ||= require('@puppeteer/browsers');install ||= api.install;
  const browserPlatform=({'linux64':api.BrowserPlatform.LINUX,'linux-arm64':api.BrowserPlatform.LINUX_ARM,'mac-arm64':api.BrowserPlatform.MAC_ARM,'mac-x64':api.BrowserPlatform.MAC,'win64':api.BrowserPlatform.WIN64})[pin.platform];
  output.write('Downloading the pinned browser directly from Google. No system packages will be installed.\n');
  const result=await install({browser:api.Browser.CHROME,buildId:pins.version,platform:browserPlatform,cacheDir:staging,baseUrl:'https://storage.googleapis.com/chrome-for-testing-public',expectedHash:pin.sha256,installDeps:false,unpack:true,logger:()=>undefined});
  const relative=path.relative(staging,result.executablePath);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(result.executablePath).isFile()||!fs.realpathSync(result.executablePath).startsWith(fs.realpathSync(staging)+path.sep))throw new Error('Unexpected downloaded browser location');
  fs.writeFileSync(path.join(staging,'COMPLETE.json'),JSON.stringify({version:pins.version,sha256:pin.sha256,executable:relative,executableSha256:await fileHash(result.executablePath)})+'\n',{mode:0o600});
  if(fs.existsSync(directory))throw new Error('Incomplete browser directory exists; inspect it before retrying');
  fs.renameSync(staging,directory);
  output.write('Browser download checksum verified. Browser notices remain in its downloaded directory and chrome://credits.\n');
  return existing();
 } finally {clearTimeout(timer);process.removeListener('exit',cleanup);cleanup();}
}
module.exports={hostPin,ensureBrowser,promptDownload,checkExtractor};
