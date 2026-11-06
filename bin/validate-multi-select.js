#!/usr/bin/env node
const {launchProgram}=require('../index');
const {runValidationCli}=require('../lib/validation-cli');
function runMultiSelectionValidation({input=process.stdin,output=process.stdout,launch=launchProgram}={}){
    return runValidationCli({input,output,launch,launchOptions:{multiSelectOnly:true},action:'select once',warning:'One-question multi-select validation. Selection changes EP state and may save or grade. No Submit or Next is deliberately clicked.'});
}
module.exports={runMultiSelectionValidation};
if(require.main===module)runMultiSelectionValidation().catch(()=>{console.error('Validation startup failed. No retry; inspect the browser.');process.exitCode=1;});
