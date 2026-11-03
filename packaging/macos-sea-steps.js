// Node v22.23.4 SEA documented local macOS sequence. Ad-hoc is not notarization.
const cp=require('node:child_process');
function finishMacosSea({executable,blob,node,postject},run=cp.execFileSync) {
 run('/usr/bin/codesign',['--remove-signature',executable],{stdio:'inherit'});
 run(node,[postject,executable,'NODE_SEA_BLOB',blob,'--sentinel-fuse','NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2','--macho-segment-name','NODE_SEA'],{stdio:'inherit'});
 run('/usr/bin/codesign',['--sign','-',executable],{stdio:'inherit'});
 run('/usr/bin/codesign',['--verify','--strict',executable],{stdio:'inherit'});
}
module.exports={finishMacosSea};
