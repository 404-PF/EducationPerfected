// Direct user-side Google download. No browser bytes are shipped by this module.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const pins=require('./browser-downloads.json');
const platforms={'linux-x64':'linux64','linux-arm64':'linux-arm64','darwin-arm64':'mac-arm64','darwin-x64':'mac-x64','win32-x64':'win64'};
function hostPin(platform=process.platform,arch=process.arch){
 const name=platforms[platform+'-'+arch];const pin=pins.archives.find(p=>p.platform===name);
 if(!pin||!/^\d+\.\d+\.\d+\.\d+$/.test(pins.version)||!/^[a-f0-9]{64}$/.test(pin.sha256))throw Error('Unsupported browser download target or pin');
 const url=new URL(pin.url);
 if(url.protocol!=='https:'||url.hostname!=='storage.googleapis.com'||url.pathname!==`/chrome-for-testing-public/${pins.version}/${name}/chrome-${name}.zip`||url.search||url.hash)throw Error('Invalid fixed Google browser source');
 return pin;
}
async function promptDownload({input=process.stdin,output=process.stdout}={}){
 if(!input.isTTY||!output.isTTY)throw Error('First browser download needs an interactive terminal');
 output.write('This beta does not include Chrome. Download Chrome for Testing '+pins.version+' directly from Google (about 200 MB)?\nGoogle terms: https://policies.google.com/terms and https://www.google.com/chrome/terms/\nType download to fetch and use it under Google\'s terms, or anything else to cancel: ');
 const rl=require('node:readline').createInterface({input,output});
 try { return await new Promise(resolve=>{rl.once('line',line=>resolve(line.trim()==='download'));rl.once('close',()=>resolve(false));}); }
 finally {rl.close();}
}
async function ensureBrowser({consent=promptDownload,install,api,home=os.homedir(),platform=process.platform,arch=process.arch,output=process.stdout}={}){
 const pin=hostPin(platform,arch);
 // Do not share Puppeteer's cache or honor arbitrary browser/base-URL environment overrides.
 const root=path.join(home,'.educationperfected','browsers');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 const directory=path.join(root,pins.version+'-'+pin.platform),receipt=path.join(directory,'COMPLETE.json');
 const existing=()=>{
  if(!fs.existsSync(receipt))return null;
  const record=JSON.parse(fs.readFileSync(receipt,'utf8'));
  if(record.version!==pins.version||record.sha256!==pin.sha256||typeof record.executable!=='string'||path.isAbsolute(record.executable))throw Error('Invalid browser installation receipt');
  const file=path.resolve(directory,record.executable);
  if(!file.startsWith(directory+path.sep)||!fs.statSync(file).isFile()||!fs.realpathSync(file).startsWith(fs.realpathSync(directory)+path.sep))throw Error('Incomplete browser installation');
  return file;
 };
 const cached=existing();if(cached)return cached;
 const lock=directory+'.lock';let fd;
 try {fd=fs.openSync(lock,'wx',0o600);} catch {throw Error('Browser installation is active or was interrupted. Lock: '+lock+'. Close all EducationPerfected processes, then remove that lock and orphaned .download-* directories in '+root+' before retrying. Never remove them while an installation is running.');}
 let staging;
 let cleaned=false;
 const cleanup=()=>{if(cleaned)return;cleaned=true;try{if(staging)fs.rmSync(staging,{recursive:true,force:true});}finally{fs.closeSync(fd);fs.rmSync(lock,{force:true});}};
 process.once('exit',cleanup);
 // Fail closed, including a stalled network/extraction. The process exit hook cleans only owned staging/lock.
 const timer=setTimeout(()=>{output.write('Browser installation timed out. Restart to retry.\n');process.exit(1);},15*60*1000);timer.unref();
 try {
  if(!await consent())throw Error('Browser download cancelled; no browser started');
  staging=fs.mkdtempSync(path.join(root,'.download-'));fs.chmodSync(staging,0o700);
  fs.writeFileSync(fd,JSON.stringify({pid:process.pid,staging:path.basename(staging)})+'\n');
  api ||= require('@puppeteer/browsers');install ||= api.install;
  const browserPlatform=({'linux64':api.BrowserPlatform.LINUX,'linux-arm64':api.BrowserPlatform.LINUX_ARM,'mac-arm64':api.BrowserPlatform.MAC_ARM,'mac-x64':api.BrowserPlatform.MAC,'win64':api.BrowserPlatform.WIN64})[pin.platform];
  output.write('Downloading the pinned browser directly from Google. No system packages will be installed.\n');
  const result=await install({browser:api.Browser.CHROME,buildId:pins.version,platform:browserPlatform,cacheDir:staging,baseUrl:'https://storage.googleapis.com/chrome-for-testing-public',expectedHash:pin.sha256,installDeps:false,unpack:true,logger:()=>undefined});
  const relative=path.relative(staging,result.executablePath);
  if(!relative||relative.startsWith('..')||path.isAbsolute(relative)||!fs.statSync(result.executablePath).isFile()||!fs.realpathSync(result.executablePath).startsWith(fs.realpathSync(staging)+path.sep))throw Error('Unexpected downloaded browser location');
  fs.writeFileSync(path.join(staging,'COMPLETE.json'),JSON.stringify({version:pins.version,sha256:pin.sha256,executable:relative})+'\n',{mode:0o600});
  if(fs.existsSync(directory))throw Error('Incomplete browser directory exists; inspect it before retrying');
  fs.renameSync(staging,directory);
  output.write('Browser download checksum verified. Browser notices remain in its downloaded directory and chrome://credits.\n');
  return existing();
 } finally {clearTimeout(timer);process.removeListener('exit',cleanup);cleanup();}
}
module.exports={hostPin,ensureBrowser,promptDownload};
