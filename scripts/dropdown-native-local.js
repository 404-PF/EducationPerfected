// No EP URLs/accounts/content. Run on the affected Windows machine, headful by default.
const puppeteer=require('puppeteer');
const readline=require('node:readline/promises');
const {observeDropdownInput}=require('../lib/dropdown-input-trace');
async function runLocal({launch=options=>puppeteer.launch(options),makeTerminal=options=>readline.createInterface(options),signals=process}={}) {
    const headless=process.argv.includes('--headless');
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
            const answer=await question('Switch back to this terminal as in the EP validator. Type run for ONE Home + ArrowDown pair; anything else quits: ');
            if(answer.trim()!=='run')return;
        }
        const baseline=await page.evaluateHandle(()=>({rows:[{select:document.querySelector('select')}]}));
        try{trace=await page.evaluateHandle(observeDropdownInput,baseline);}finally{await baseline.dispose();}
        const element=await page.$('select');
        let returned=0,dispatchUncertain=false;
        try{
            await element.focus();
            await element.press('Home');returned++;
            await element.press('ArrowDown');returned++;
        }catch{dispatchUncertain=true;}
        finally{await element.dispose();}
        // Same bounded observation window; never resend a key or open/commit a popup.
        await new Promise(resolve=>setTimeout(resolve,200));
        const snapshot=await trace.evaluate(observer=>observer.snapshot());
        console.log('EP_LOCAL_NATIVE '+JSON.stringify({platform:process.platform,node:process.version,browserVersion:await browser.version(),headless,keyDispatchesReturned:returned,dispatchUncertain,...snapshot}));
        if(!headless)await question('Capture the line above. Press Enter to close this local browser: ');
    }catch(error){if(!cancelled)throw error;}finally{
        if(trace){await trace.evaluate(observer=>observer.close()).catch(()=>{});await trace.dispose().catch(()=>{});}
        signals.removeListener('SIGINT',shutdown);signals.removeListener('SIGTERM',shutdown);
        terminal?.removeListener('SIGINT',shutdown);terminal?.close();await closeBrowser();
    }
}
if(require.main===module)runLocal().catch(()=>{console.error('Local native check failed. No retry or EP action was performed.');process.exitCode=1;});
module.exports={runLocal};
