// Invented source-derived fixture, not captured student DOM.
function installDropdownFixture(){
    const old=document.querySelector('.multi-choice-component');
    const self=window.angular.element(old).scope().self,q=self.model._currentQuestion;self.model.gameMode=3;
    const group=document.createElement('div');group.className='synthetic-dropdown-container';old.replaceWith(group);
    q.questionDef.Components=[];const base={};q.cachedRenderers={1:{identifiedComponents:{baseComponents:base}}};
    const f=window.dropdownFixture={self,q,group,base,keys:[],changes:[],submits:0,nexts:0};
    const angular=window.angular;window.angular={...angular,element:el=>el===group?{scope:()=>({self})}:angular.element(el)};
    document.querySelector('#question-container-group').textContent='Synthetic dropdown formula: choose five answers.';
    const diagram=document.createElement('img');diagram.alt='Synthetic static circle diagram';diagram.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="lightblue"/></svg>');group.append(diagram,document.createElement('br'));
    for(const [i,answer]of ['Radius','Circumference','Circumference','2','Radius'].entries()){
        const id='dropdown-'+i,options=[{Description:'wrong',Correct:'false',Validity:'true',SortOrder:0},{Description:answer,Correct:'true',Validity:'true',SortOrder:1}];
        const def={ComponentTypeCode:'DROPDOWN_COMPONENT',ComponentID:id,Marked:1,Options:JSON.parse(JSON.stringify(options)),DefaultSelection:{Description:'',Correct:'false',Validity:'true',SortOrder:0}};
        q.questionDef.Components.unshift(def);const metadata=JSON.parse(JSON.stringify(def)),original=metadata.Options.concat();
        const blank={Description:'',Correct:'false',Validity:'true',SortOrder:0};const shuffled=[blank,...metadata.Options];
        const state={metadataInstance:metadata,originalDropDownOptions:original,_shuffledOptions:shuffled,_selectedOption:metadata.DefaultSelection};
        const select=document.createElement('select');select.id=id;
        for(const option of shuffled){const o=document.createElement('option');o.textContent=option.Description;select.append(o);}select.selectedIndex=0;
        group.append(document.createTextNode(i<2?' Step '+(i+1)+': ':' Formula: '),select);
        if(i<2)group.append(document.createElement('br'));else if(i===2)group.append(document.createTextNode(' = '));else if(i===3)group.append(document.createTextNode(' × π × '));
        const component={id,componentState:state,visualElement:select,dropDownList:select,marked:1,renderingParameters:{mode:1}};base[id]=[component];
        select.addEventListener('keydown',e=>{f.keys.push({id,key:e.key,trusted:e.isTrusted});f.beforeKey?.(e);});
        select.addEventListener('change',e=>{const text=select.options[select.selectedIndex].text;state._selectedOption=original.find(o=>o.Description.trim()===text.trim())||null;f.changes.push({id,index:select.selectedIndex,trusted:e.isTrusted});f.afterChange?.();});
    }
    document.addEventListener('click',e=>{const b=e.target.closest('#sa-navigation-controls button');if(b&&b.textContent.trim()!=='Submit')f.nexts++;},true);
    const oldSubmit=[...document.querySelectorAll('#sa-navigation-controls button')].find(b=>b.textContent.trim()==='Submit');const submit=oldSubmit.cloneNode(true);oldSubmit.replaceWith(submit);
    submit.addEventListener('click',()=>{f.submits++;q.questionIndex++;if(f.followingUnsupported){group.textContent='Following unsupported question';q.questionDef.Components=[{ComponentTypeCode:'NUMBER_BOX_COMPONENT'}];}});
}
module.exports={installDropdownFixture};
