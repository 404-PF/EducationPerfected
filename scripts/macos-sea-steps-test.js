const assert=require('node:assert/strict');
const {finishMacosSea}=require('../packaging/macos-sea-steps');
const options={executable:'/synthetic path/educationperfected',blob:'/synthetic/main.blob',node:'/synthetic/node',postject:'/synthetic/postject.js'};
const calls=[];finishMacosSea(options,(...args)=>calls.push(args));
assert.deepEqual(calls.map(([command,args])=>[command,args]),[
 ['/usr/bin/codesign',['--remove-signature',options.executable]],
 [options.node,[options.postject,options.executable,'NODE_SEA_BLOB',options.blob,'--sentinel-fuse','NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2','--macho-segment-name','NODE_SEA']],
 ['/usr/bin/codesign',['--sign','-',options.executable]],
 ['/usr/bin/codesign',['--verify','--strict',options.executable]],
]);
for(const call of calls)assert.deepEqual(call[2],{stdio:'inherit'});
for(let fail=0;fail<4;fail++) {
 let count=0;const error=Error('synthetic command failure');
 assert.throws(()=>finishMacosSea(options,()=>{if(count++===fail)throw error;}),caught=>caught===error);
 assert.equal(count,fail+1,'No later command after a failure');
}
console.log('macOS SEA sequence arguments, ad-hoc identity, verification and fail-fast ordering passed with inert executor; no signing performed.');
