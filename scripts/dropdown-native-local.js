// No EP URLs/accounts/content. Run on the affected Windows machine, headful by default.
const puppeteer=require('puppeteer');
const readline=require('node:readline/promises');
const {observeDropdownInput}=require('../lib/dropdown-input-trace');
function localVariant(argv){
    const named=argv.find(value=>value.startsWith('--variant='));
    const separate=argv.findIndex(value=>value==='--variant');
    const variant=named?named.slice('--variant='.length):separate>=0?argv[separate+1]:argv.includes('--f4-popup')?'f4-popup':'legacy';
    if(variant!=='legacy'&&variant!=='f4-popup')throw new Error('Unknown local dropdown variant. Use legacy or f4-popup.');
    return variant;
}
async function runLocal({launch=options=>puppeteer.launch(options),makeTerminal=options=>readline.createInterface(options),signals=process,argv=process.argv}={}) {
    const headless=argv.includes('--headless');
    const variant=localVariant(argv);
    const popup=variant==='f4-popup';
    let browser,trace,terminal,cancelled=false,closing;
    const abort=new AbortController();
    const closeBrowser=()=>{
        if(!browser)return Promise.resolve();
        closing ||= (async()=>{
            let timer;
            try {
                await Promise.race([browser.close(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('close timeout')),3000);})]);
            } catch {browser.process()?.kill();}
            finally {clearTimeout(timer);}
        })();
        return closing;
    };
    const shutdown=()=>{cancelled=true;abort.abort();terminal?.close();closeBrowser().catch(()=>{});};
    const question=text=>terminal.question(text,{signal:abort.signal});
    signals.once('SIGINT',shutdown);signals.once('SIGTERM',shutdown);
    try {
        browser=await launch({headless,defaultViewport:null,handleSIGINT:false,handleSIGTERM:false,handleSIGHUP:false});
        if(cancelled)return;
        const page=(await browser.pages())[0];
        await page.setContent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'" ><meta charset="utf-8"><title>Local native dropdown check - no EP</title><h1>Local native dropdown check</h1><p>Invented options. No network, account, Submit or points.</p><select><option></option><option>Alpha</option><option>Beta</option></select>');
        console.log('Local only. No EP access. Leave browser closed-select and do not choose an option.');
        if(!headless){
            terminal=makeTerminal({input:process.stdin,output:process.stdout});
            terminal.on('SIGINT',shutdown);
            const sequence=popup?'ONE F4 + ArrowDown + Enter popup sequence':'ONE Home + ArrowDown pair';
            const answer=await question('Switch back to this terminal as in the EP validator. Type run for '+sequence+'; anything else quits: ');
            if(answer.trim()!=='run')return;
        }
        const baseline=await page.evaluateHandle(()=>({rows:[{select:document.querySelector('select')}]}));
        try{trace=await page.evaluateHandle(observeDropdownInput,baseline,{popup});}finally{await baseline.dispose();}
        const element=await page.$('select');
        let returned=0,dispatchUncertain=false,f4OpenState=null,openAfterArrow=null,navigationTraceAvailable=false,navigationCommitSeen=false,commitDispatched=false;
        const popupState=async()=>await element.evaluate(el=>{try{return el.matches(':open');}catch{return null;}}).catch(()=>null);
        const waitPopupState=async open=>{
            const deadline=Date.now()+200;
            while(Date.now()<deadline){
                const state=await popupState();
                if(state===open||state===null)return state;
                await new Promise(resolve=>setTimeout(resolve,25));
            }
            return popupState();
        };
        const navigationState=async()=>{
            const snapshot=await trace.evaluate(observer=>observer.snapshot()).catch(()=>null);
            if(!snapshot)return{available:false,committed:true};
            return{available:true,committed:Boolean(snapshot.events?.some(event=>event.targetIndex===0&&(event.type===2||event.type===3)))};
        };
        try{
            await element.focus();
            if(popup){
                await element.press('F4');returned++;
                f4OpenState=await waitPopupState(true);
                if(f4OpenState===true){
                    await element.press('ArrowDown');returned++;
                    openAfterArrow=await waitPopupState(true);
                    const navigation=await navigationState();
                    navigationTraceAvailable=navigation.available;navigationCommitSeen=navigation.committed;
                    if(openAfterArrow===true&&navigationTraceAvailable&&!navigationCommitSeen){
                        await element.press('Enter');returned++;commitDispatched=true;
                    }
                }
            }else{
                await element.press('Home');returned++;
                await element.press('ArrowDown');returned++;
            }
        }catch{dispatchUncertain=true;}
        finally{await element.dispose();}
        // Same bounded observation window; never resend a key or reopen a popup.
        await new Promise(resolve=>setTimeout(resolve,200));
        const snapshot=await trace.evaluate(observer=>observer.snapshot());
        const finalSelectedIndex=await page.$eval('select',el=>el.selectedIndex).catch(()=>null);
        console.log('EP_LOCAL_NATIVE '+JSON.stringify({variant,platform:process.platform,node:process.version,browserVersion:await browser.version(),headless,keyDispatchesReturned:returned,dispatchUncertain,...(popup?{f4OpenState,openAfterArrow,navigationTraceAvailable,navigationCommitSeen,commitDispatched,finalSelectedIndex}:{}),...snapshot}));
        if(!headless)await question('Capture the line above. Press Enter to close this local browser: ');
    }catch(error){if(!cancelled)throw error;}finally{
        if(trace){await trace.evaluate(observer=>observer.close()).catch(()=>{});await trace.dispose().catch(()=>{});}
        signals.removeListener('SIGINT',shutdown);signals.removeListener('SIGTERM',shutdown);
        terminal?.removeListener('SIGINT',shutdown);terminal?.close();await closeBrowser();
    }
}
if(require.main===module)runLocal().catch(()=>{console.error('Local native check failed. No retry or EP action was performed.');process.exitCode=1;});
module.exports={runLocal,localVariant};
