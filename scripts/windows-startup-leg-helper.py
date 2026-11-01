#!/usr/bin/env python3
"""Fixed diagnostic driver under existing owned ConPTY job. No credentials."""
import importlib.util,pathlib,sys,os,json
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)
def entry():
    closed=False
    def confirm():
        nonlocal closed
        closed=True
    try:
        if sys.platform!='win32' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted':raise RuntimeError('host-guard')
        if len(sys.argv)!=5:raise RuntimeError('host-guard')
        root=pathlib.Path(sys.argv[1]);node=pathlib.Path(sys.argv[2]);mode=sys.argv[3];nonce=sys.argv[4]
        if len(nonce)!=64 or any(c not in '0123456789abcdef' for c in nonce):raise RuntimeError('host-guard')
        if mode not in ('source','sea') or not root.is_absolute() or root.is_symlink() or not root.is_dir():raise RuntimeError('node-identity')
        root=root.resolve(strict=True)
        if not node.is_absolute() or node.is_symlink() or not node.is_file():raise RuntimeError('node-identity')
        driver=pathlib.Path(__file__).with_name('windows-startup-leg.js').resolve(strict=True)
        env={k:v for k,v in os.environ.items() if k.upper() not in ('NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT','EP_TEST_BROWSER_IDENTITY','PUPPETEER_EXECUTABLE_PATH')}
        conpty.run_console(str(node.resolve(strict=True)),[str(driver),str(root),mode,nonce],env,str(root),expected=b'EP_DIAGNOSTIC_LEG_DONE',on_closed=confirm,process_budget_ms=120000)
    except BaseException as error:
        print('EP_DIAGNOSTIC_JOB_OBSERVED_CLOSED='+('true' if closed else 'false'),flush=True)
        print('EP_DIAGNOSTIC_JOB_OUTCOME=uncertainty',flush=True)
        return 20
    result=root/'result.json'
    if result.is_symlink() or not result.is_file():return 20
    try:
        record=json.loads(result.read_text(encoding='utf-8'))
        if record.get('nonce')!=nonce or record.get('mode')!=mode:return 20
    except BaseException:return 20
    print('EP_DIAGNOSTIC_JOB_NONCE='+nonce,flush=True)
    print('EP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true',flush=True)
    print('EP_DIAGNOSTIC_JOB_OUTCOME=success',flush=True)
    return 0
def main():
    sys.stdout.reconfigure(newline='\n')
    return entry()
if __name__=='__main__':sys.exit(main())
