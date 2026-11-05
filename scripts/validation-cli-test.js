const assert=require('node:assert/strict');
const {PassThrough}=require('node:stream');
const {runValidationCli}=require('../lib/validation-cli');
(async()=>{
 const input=new PassThrough(),output=new PassThrough();let text='',closes=0;output.on('data',d=>text+=d);
 const controls={mode:async()=>{},status:()=>({state:'stopped'}),close:async()=>{closes++;if(closes===1)throw Error('synthetic close failure');},start:()=>{},stop:async()=>{}};
 const run=runValidationCli({input,output,launch:async()=>controls,launchOptions:{choiceSelectOnly:true},action:'select once',warning:'Synthetic'});
 const wait=async predicate=>{for(let i=0;i<100&&!predicate();i++)await new Promise(r=>setTimeout(r,5));assert.ok(predicate());};
 await wait(()=>text.includes('Commands:'));input.write('quit\n');await wait(()=>text.includes('Validation control failed'));assert.equal(closes,1);input.write('quit\n');await run;assert.equal(closes,2);console.log('Validation CLI close failure clears cached promise; secondquit cleanup succeeds PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
