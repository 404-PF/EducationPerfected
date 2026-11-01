#!/usr/bin/env python3
"""Fixed diagnostic driver under existing owned ConPTY job. No credentials."""
import importlib.util,pathlib,sys,os,json,re
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)
DRIVER_STAGES=('cli-entry','cli-root-checked','host-checked','leg-root-checked','archive-check-entered','archive-verified','unpack-entered','unpacked','spawn-entered','spawn-returned','ready-observed','owner-closed','leg-complete')
def observed_driver_stage(data,mode,nonce):
    if mode not in ('source','sea') or not re.fullmatch('[a-f0-9]{64}',nonce):return 'unknown'
    expected=[stage for stage in DRIVER_STAGES if mode=='source' or stage not in ('unpack-entered','unpacked')]
    lines=[line for line in data.splitlines() if b'EP_DIAGNOSTIC_DRIVER_STAGE=' in line]
    if not lines:return 'unknown'
    try:
        values=[json.loads(line.decode('ascii').removeprefix('EP_DIAGNOSTIC_DRIVER_STAGE=')) for line in lines]
        if any(set(value)!=set(('nonce','mode','stage')) or value['nonce']!=nonce or value['mode']!=mode for value in values):return 'unknown'
        stages=[value['stage'] for value in values]
        return stages[-1] if stages==expected[:len(stages)] else 'unknown'
    except (ValueError,TypeError,KeyError,UnicodeError):return 'unknown'
def entry():
    closed=False;stage='helper-entry';driver_stage='unknown';nonce='';mode=''
    def confirm():
        nonlocal closed
        closed=True
    def drained(data):
        nonlocal driver_stage
        driver_stage=observed_driver_stage(data,mode,nonce)
    try:
        if len(sys.argv)==5:
            mode=sys.argv[3] if sys.argv[3] in ('source','sea') else ''
            nonce=sys.argv[4] if re.fullmatch('[a-f0-9]{64}',sys.argv[4]) else ''
        if sys.platform!='win32' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted':raise RuntimeError('host-guard')
        if len(sys.argv)!=5:raise RuntimeError('host-guard')
        stage='arguments';root=pathlib.Path(sys.argv[1]);node=pathlib.Path(sys.argv[2])
        if len(nonce)!=64 or any(c not in '0123456789abcdef' for c in nonce):raise RuntimeError('host-guard')
        stage='root-check'
        if mode not in ('source','sea') or not root.is_absolute() or root.is_symlink() or not root.is_dir():raise RuntimeError('node-identity')
        root=root.resolve(strict=True)
        stage='node-check'
        if not node.is_absolute() or node.is_symlink() or not node.is_file():raise RuntimeError('node-identity')
        stage='driver-check'
        driver=pathlib.Path(__file__).with_name('windows-startup-leg.js').resolve(strict=True)
        env={k:v for k,v in os.environ.items() if k.upper() not in ('NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT','EP_TEST_BROWSER_IDENTITY','PUPPETEER_EXECUTABLE_PATH')}
        stage='transport'
        conpty.run_console(str(node.resolve(strict=True)),[str(driver),str(root),mode,nonce],env,str(root),expected=b'EP_DIAGNOSTIC_LEG_DONE',on_closed=confirm,process_budget_ms=120000,on_drain=drained)
        stage='result-check'
        result=root/'result.json'
        if result.is_symlink() or not result.is_file():raise RuntimeError('missing-result')
        stage='result-parse'
        record=json.loads(result.read_text(encoding='utf-8'))
        stage='result-binding'
        if record.get('nonce')!=nonce or record.get('mode')!=mode:raise RuntimeError('stale-result')
    except BaseException as error:
        print('EP_DIAGNOSTIC_JOB_FAILURE='+json.dumps({'nonce':nonce,'mode':mode,'stage':stage,'driverStage':driver_stage,'transportStage':conpty.fixed_stage(error) if stage=='transport' else 'unobserved','closed':closed},separators=(',',':')),flush=True)
        print('EP_DIAGNOSTIC_JOB_OBSERVED_CLOSED='+('true' if closed else 'false'),flush=True)
        print('EP_DIAGNOSTIC_JOB_OUTCOME=uncertainty',flush=True)
        return 20
    print('EP_DIAGNOSTIC_JOB_NONCE='+nonce,flush=True)
    print('EP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true',flush=True)
    print('EP_DIAGNOSTIC_JOB_OUTCOME=success',flush=True)
    return 0
def main():
    sys.stdout.reconfigure(newline='\n')
    return entry()
if __name__=='__main__':sys.exit(main())
