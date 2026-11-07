#!/usr/bin/env node
const {launchProgram}=require('../index');
const {BUILD}=require('../lib/dropdown-diagnostics');
const {runValidationCli}=require('../lib/validation-cli');
function runDropdownValidation({input=process.stdin,output=process.stdout,launch=launchProgram}={}){
    return runValidationCli({input,output,launch,launchOptions:{dropdownSubmitOnce:true},action:'submit once',readOnlyInspect:true,warning:'Dropdown validator build: '+BUILD+'. Refusal includes read-only bounded DOM/frame diagnostics.\nOne-question dropdown validation. Intermediate wrong selections may save or grade. At most one Submit, no Next, no retry. Fresh supervised named-question approval required.'});
}
module.exports={runDropdownValidation};
if(require.main===module)runDropdownValidation().catch(()=>{console.error('Validation startup failed. No retry; inspect the browser.');process.exitCode=1;});
