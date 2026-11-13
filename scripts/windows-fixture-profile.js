// Fixture-only: USERPROFILE must resolve Windows known folders before Chrome.
const fs=require('node:fs'),path=require('node:path');
function prepareWindowsFixtureProfile(home,platform=process.platform){
 if(platform!=='win32')return;
 for(const name of ['Local','Roaming'])fs.mkdirSync(path.join(home,'AppData',name),{recursive:true,mode:0o700});
}
module.exports={prepareWindowsFixtureProfile};
