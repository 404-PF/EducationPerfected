#!/usr/bin/env python3
"""Fixed public zero-browser ConPTY wire probe. No paths or raw output are printed."""
import importlib.util,pathlib,sys,os,json
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('helper',pathlib.Path(__file__).with_name('windows-startup-leg-helper.py'))
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
NONCE='a'*64
UNKNOWN={'streamObserved':False,'vtPresent':'unknown','markerTokenPresent':'unknown','strictPrefixStage':'unknown'}
def evidence(data):
    return {'streamObserved':True,'vtPresent':b'\x1b' in data,'markerTokenPresent':b'EP_DIAGNOSTIC_DRIVER_STAGE=' in data,'strictPrefixStage':helper.observed_driver_stage(data,'source',NONCE)}
def entry():
    closed=False;observed=dict(UNKNOWN);outcome='uncertainty';stage='probe-host'
    def confirm():
        nonlocal closed
        closed=True
    def drain(data):
        nonlocal observed
        observed=evidence(data)
    try:
        if sys.platform!='win32' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or len(sys.argv)!=2:raise RuntimeError('host-guard')
        stage='probe-node';node=pathlib.Path(sys.argv[1])
        if not node.is_absolute() or node.is_symlink() or not node.is_file() or node.name.lower()!='node.exe':raise RuntimeError('node-identity')
        child=pathlib.Path(__file__).with_name('windows-stage-transport-probe.js').resolve(strict=True)
        env={k:v for k,v in os.environ.items() if k.upper() in ('SYSTEMROOT','WINDIR','SYSTEMDRIVE','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT')}
        stage='probe-transport'
        helper.conpty.run_console(str(node.resolve(strict=True)),[str(child)],env,str(child.parent),expected=b'EP_STAGE_PROBE_DONE',on_closed=confirm,on_drain=drain)
        outcome=('wire-observed' if observed['strictPrefixStage']=='archive-check-entered' else 'wire-parser-unknown') if closed else 'uncertainty'
        stage='complete'
    except BaseException as error:
        stage=helper.conpty.fixed_stage(error) if stage=='probe-transport' else stage
    print('EP_STAGE_PROBE='+json.dumps({'outcome':outcome,'stage':stage,'observedClosed':closed,**observed},separators=(',',':')),flush=True)
    return 0 if outcome=='wire-observed' else 20
def main():
    sys.stdout.reconfigure(newline='\n')
    return entry()
if __name__=='__main__':sys.exit(main())
