const assert=require('node:assert/strict');
const puppeteer=require('puppeteer');
const {createServer}=require('./mock-ep');
const {detectQuestion}=require('../lib/detect-question');
const {playDropdownRound}=require('../lib/dropdown-handler');
const {createSubmitDropdownOnce}=require('../lib/dropdown-once');
const {observeDropdownInput}=require('../lib/dropdown-input-trace');
async function testTrace() {
    const server=createServer();
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    let browser;
    try {
        browser=await puppeteer.launch({headless:true,executablePath:process.env.HANDLER_EXECUTABLE_PATH||undefined});
        const page=await browser.newPage(),origin='http://127.0.0.1:'+server.address().port;
        const setup=()=>page.goto(origin+'/lesson-dropdown');
        const factory=()=>createSubmitDropdownOnce({detectQuestion,playDropdownRound});
        await setup();
        await page.evaluate(()=>{
            const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
            const active=new Map();
            window.traceListenerProbe={added:0,removed:0,active};
            window.addEventListener=(type,listener,options)=>{
                if(['keydown','keyup','input','change'].includes(type)&&options?.passive===true){
                    active.set(type,listener);traceListenerProbe.added++;
                }
                return add(type,listener,options);
            };
            window.removeEventListener=(type,listener,options)=>{
                const result=remove(type,listener,options);
                if(options===true&&active.get(type)===listener){active.delete(type);traceListenerProbe.removed++;}
                return result;
            };
        });
        await page.evaluate(()=>{
            // Adverse fixture only: simulate site cancellation after window capture.
            dropdownFixture.beforeKey=event=>{if(event.key==='ArrowDown')event.preventDefault();};
        });
        const run=factory(),result=await run(page);
        assert.equal(result.selectionDiagnostic.keyDispatchesReturned,2);
        assert.equal(result.selectionDiagnostic.guard,'key-state-did-not-settle');
        assert.deepEqual(await page.evaluate(()=>({added:traceListenerProbe.added,removed:traceListenerProbe.removed,active:traceListenerProbe.active.size})),{added:4,removed:4,active:0});
        const trace=result.inputDiagnostic;
        assert.match(trace.browserVersion,/^(?:Chrome|HeadlessChrome)\/\d/);
        assert.deepEqual(trace.current.actual,[0,0,0,0,0]);
        assert.equal(trace.current.focusedDropdownIndex,0);
        const down=trace.events.find(event=>event.type===0&&event.key===1);
        assert.equal(down.trusted,true);
        assert.equal(down.defaultPreventedAtCapture,false);
        assert.equal(down.defaultPreventedAfterTask,true);
        assert.equal(down.completionPending,false);
        assert.equal(trace.events.filter(event=>event.type===2||event.type===3).length,0);
        assert.equal(trace.dropped,0);
        const serialized=JSON.stringify(trace);
        assert.ok(!/Radius|Circumference|wrong|Description|Correct|http|dropdown-/.test(serialized));
        assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[2,0,0]);
        assert.equal((await run(page)).reason,'attempt-consumed');
        await setup();
        const success=await factory()(page);
        assert.deepEqual(success,{status:'submitted-once'});
        assert.deepEqual(await page.evaluate(()=>[dropdownFixture.keys.length,dropdownFixture.submits,dropdownFixture.nexts]),[15,1,0]);
        // Cap retention and prove close removes all four observer listeners.
        const tracking=await page.evaluateHandle(()=>({rows:[{select:document.querySelector('select')}]}));
        const observer=await page.evaluateHandle(observeDropdownInput,tracking);
        await tracking.dispose();
        const target=await page.$('select');
        const pressHome=async remaining=>{if(remaining===0)return;await target.press('Home');return pressHome(remaining-1);};
        await pressHome(40);
        const bounded=await observer.evaluate(value=>value.snapshot());
        assert.equal(bounded.events.length,64);
        assert.ok(bounded.dropped>0);
        await observer.evaluate(value=>value.close());
        const closed=await observer.evaluate(value=>value.snapshot());
        await target.press('Home');
        assert.deepEqual(await observer.evaluate(value=>value.snapshot()),closed);
        await observer.dispose();await target.dispose();
        console.log('Dropdown passive trace PASS: trusted canceled key observed without changing behavior; no Submit/Next/retry, bounded content-free events, listener/timer cleanup, unchanged success. Synthetic Linux only.');
    }finally{
        if(browser)await browser.close();
        await new Promise(resolve=>server.close(resolve));
    }
}
testTrace().catch(error=>{console.error(error);process.exitCode=1;});
