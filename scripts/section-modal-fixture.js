function installModal(mutation){
    const f=dropdownFixture,self=f.self,old=self.sectionData;
    old.id=10;
    const next={id:11,type:3,activityGroup:{ID:11,TypeCode:3,isAutoMarked:true}};
    const modal=document.createElement('div');modal.setAttribute('uib-modal-window','modal-window');
    modal.className='modal section-complete-dialog';
    modal.innerHTML='<div id="modal-section-complete-wrapper"><div id="modal-section-complete"><button id="next-button" ng-click="self.onNextClicked()">PRIVATE QUESTION ANSWER NAME</button></div></div>';
    const backdrop=document.createElement('div');backdrop.setAttribute('uib-modal-backdrop','modal-backdrop');backdrop.textContent='PRIVATE CONTENT';
    document.body.append(modal,backdrop);
    const dialog={model:self.model,currentSection:old,nextSection:next,activityComplete:false};
    const original=window.angular.element;
    window.angular.element=el=>el===modal?{scope:()=>({self:dialog})}:original(el);
    f.modal=modal;f.backdrop=backdrop;f.next=next;f.dialog=dialog;f.extraInputs=0;
    modal.addEventListener('click',()=>f.extraInputs++);
    modal.addEventListener('keydown',()=>f.extraInputs++);
    if(mutation==='unknown')modal.className='modal';
    if(mutation==='lookalike')dialog.model={...self.model};
    if(mutation==='wrong-section')dialog.currentSection={...old};
    if(mutation==='complete'){dialog.activityComplete=true;dialog.nextSection=null;}
    if(mutation==='no-next')dialog.nextSection=null;
    if(mutation==='accessor')Object.defineProperty(dialog,'nextSection',{get(){f.getterCalls=(f.getterCalls||0)+1;throw new Error('not allowed');}});
    if(mutation==='ambiguous')document.body.append(modal.cloneNode(true));
    if(mutation==='hidden')modal.hidden=true;
    if(mutation==='unnested')modal.append(modal.querySelector('#next-button'));
    if(mutation==='duplicate-button')modal.append(modal.querySelector('#next-button').cloneNode(true));

}
module.exports={installModal};
