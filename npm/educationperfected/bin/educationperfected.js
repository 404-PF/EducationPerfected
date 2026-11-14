#!/usr/bin/env node
const path=require('node:path'),{spawnSync}=require('node:child_process');
const exe=path.join(__dirname,'..','vendor','educationperfected'+(process.platform==='win32'?'.exe':''));
const result=spawnSync(exe,process.argv.slice(2),{stdio:'inherit'});
if(result.error){console.error('Binary missing; reinstall the educationperfected package.');process.exit(1);}
process.exit(result.status??1);
