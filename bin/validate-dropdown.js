#!/usr/bin/env node
const {launchProgram}=require('../index');
const {BUILD}=require('../lib/dropdown-diagnostics');
const {runValidationCli}=require('../lib/validation-cli');
function runDropdownValidation({input=process.stdin,output=process.stdout,launch=launchProgram}={}){
    return runValidationCli({input,output,launch,launchOptions:{dropdownSubmitOnce:true,dropdownInputMode:'f4-popup'},action:'submit once',readOnlyInspect:true,warning:'Dropdown validator build: '+BUILD+'. Native input: F4 popup + ArrowDown + Enter. Passive trace: popup-v2. Refusal includes read-only bounded DOM/frame diagnostics.\nOne-question dropdown validation. Popup navigation is sent only after popup-open state is verified; intermediate wrong selections may save or grade. At most one Submit, no Next, no retry. Fresh supervised named-question approval required.'});
}
module.exports={runDropdownValidation};
if(require.main===module)runDropdownValidation().catch(()=>{console.error('Validation startup failed. No retry; inspect the browser.');process.exitCode=1;});
