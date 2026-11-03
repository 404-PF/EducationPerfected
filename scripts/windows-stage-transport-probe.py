#!/usr/bin/env python3
"""Fixed public zero-browser ConPTY wire probe. No paths or raw output are printed."""
import importlib.util,pathlib,sys,os,json,re
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('helper',pathlib.Path(__file__).with_name('windows-stage-observer.py'))
helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)
helper.conpty=conpty
NONCE='a'*64
HOST_KEYS=('platformMatch','actionsMatch','runnerOSMatch','hostedMatch','argumentCountMatch')
def host_checks():
    return dict(zip(HOST_KEYS,(sys.platform=='win32',os.environ.get('GITHUB_ACTIONS')=='true',os.environ.get('RUNNER_OS')=='Windows',os.environ.get('RUNNER_ENVIRONMENT')=='github-hosted',len(sys.argv)==2)))
PREFIX=b'EP_DIAGNOSTIC_DRIVER_STAGE='
STAGES=helper.DRIVER_STAGES
WIRE_KEYS=('reason','vtPresent','markerLineHasVT','markerAtLineStart','markerLineASCII','allMarkerJSONObjects','exactSchema','bindingMatch','orderedPrefix')
def wire_shape(data,mode,nonce):
    out=dict.fromkeys(WIRE_KEYS,'unknown');out['reason']='input-rejected'
    if type(data) is not bytes or len(data)>65536 or mode not in ('source','sea') or type(nonce) is not str or not re.fullmatch('[a-f0-9]{64}',nonce):return out
    out['vtPresent']=b'\x1b' in data
    lines=[x for x in data.splitlines() if PREFIX in x]
    if not lines:out['reason']='no-marker-line';return out
    out['markerLineHasVT']=any(b'\x1b' in x for x in lines)
    out['markerAtLineStart']=all(x.startswith(PREFIX) for x in lines)
    out['markerLineASCII']=all(x.isascii() for x in lines)
    if not out['markerAtLineStart']:out['reason']='prefix-not-at-line-start';return out
    if not out['markerLineASCII']:out['reason']='non-ascii-marker-line';return out
    try:values=[json.loads(x.decode('ascii').removeprefix(PREFIX.decode('ascii'))) for x in lines]
    except (ValueError,TypeError,UnicodeError):out['allMarkerJSONObjects']=False;out['reason']='json-invalid';return out
    out['allMarkerJSONObjects']=all(type(x) is dict for x in values)
    if not out['allMarkerJSONObjects']:out['reason']='json-not-object';return out
    out['exactSchema']=all(set(x)=={'nonce','mode','stage'} for x in values)
    if not out['exactSchema']:out['reason']='schema-mismatch';return out
    out['bindingMatch']=all(x['nonce']==nonce and x['mode']==mode for x in values)
    if not out['bindingMatch']:out['reason']='binding-mismatch';return out
    expected=[x for x in STAGES if mode=='source' or x not in ('unpack-entered','unpacked')]
    stages=[x['stage'] for x in values];out['orderedPrefix']=stages==expected[:len(stages)]
    out['reason']='accepted-prefix' if out['orderedPrefix'] else 'stage-order-mismatch'
    return out

UNKNOWN={'streamObserved':False,'vtPresent':'unknown','markerTokenPresent':'unknown','strictPrefixStage':'unknown','wireShape':dict.fromkeys(WIRE_KEYS,'unknown')}
def evidence(data):
    return {'streamObserved':True,'vtPresent':b'\x1b' in data,'markerTokenPresent':b'EP_DIAGNOSTIC_DRIVER_STAGE=' in data,'strictPrefixStage':helper.observed_driver_stage(data,'source',NONCE),'wireShape':wire_shape(data,'source',NONCE)}
def entry():
    closed=False;observed=dict(UNKNOWN);outcome='uncertainty';stage='probe-host';host=dict.fromkeys(HOST_KEYS,'unknown')
    def confirm():
        nonlocal closed
        closed=True
    def drain(data):
        nonlocal observed
        observed=evidence(data)
    try:
        host=host_checks()
        if not all(host.values()):raise RuntimeError('host-guard')
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
    print('EP_STAGE_PROBE='+json.dumps({'outcome':outcome,'stage':stage,'observedClosed':closed,**observed,'hostChecks':host},separators=(',',':')),flush=True)
    return 0 if outcome=='wire-observed' else 20
def main():
    sys.stdout.reconfigure(newline='\n')
    return entry()
if __name__=='__main__':sys.exit(main())
