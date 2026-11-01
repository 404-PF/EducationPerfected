#!/usr/bin/env python3
"""Inert wrapper only, no Windows process/API/browser."""
import importlib.util,pathlib,sys,os,tempfile,shutil,json,io,contextlib
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('helper',pathlib.Path(__file__).with_name('windows-startup-leg-helper.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
nonce='a'*64
for scenario in ('success','job-uncertain','driver-failure','missing','stale'):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-leg-wrapper-inert-')).resolve();node=root/'node.exe';node.write_bytes(b'inert');calls=[]
    def run(exe,args,env,cwd,**kwargs):
        calls.append((exe,args,env,cwd,kwargs))
        kwargs['on_drain'](b'private arbitrary host path')
        if scenario=='job-uncertain':raise m.conpty.ExitUnconfirmed('job-exit-unconfirmed')
        kwargs['on_closed']()
        if scenario=='driver-failure':raise RuntimeError('console-child-nonzero')
        if scenario!='missing':(root/'result.json').write_text(json.dumps({'mode':'source','nonce':nonce if scenario!='stale' else 'b'*64}))
    try:
        with mock.patch.object(m.sys,'platform','win32'),mock.patch.object(m.sys,'argv',['fixed',str(root),str(node),'source',nonce]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_PASSWORD':'private','EP_EMAIL':'private','NODE_OPTIONS':'private','PUPPETEER_EXECUTABLE_PATH':'private'},clear=True),mock.patch.object(m.conpty,'run_console',side_effect=run) as transport,contextlib.redirect_stdout(io.StringIO()) as out:
            code=m.entry()
        assert transport.call_count==1 and len(calls)==1
        exe,args,env,cwd,kwargs=calls[0]
        assert exe==str(node) and args[-2:]==['source',nonce]
        assert callable(kwargs['on_drain'])
        assert kwargs['process_budget_ms']==120000 and kwargs['expected']==b'EP_DIAGNOSTIC_LEG_DONE'
        assert all(name not in env for name in ('EP_PASSWORD','EP_EMAIL','NODE_OPTIONS','PUPPETEER_EXECUTABLE_PATH'))
        if scenario=='success':assert code==0 and out.getvalue()=='EP_DIAGNOSTIC_JOB_NONCE='+nonce+'\nEP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true\nEP_DIAGNOSTIC_JOB_OUTCOME=success\n'
        else:
            assert code==20 and 'EP_DIAGNOSTIC_JOB_OUTCOME=success' not in out.getvalue()
            value=json.loads(out.getvalue().splitlines()[0].split('=',1)[1]);assert value['nonce']==nonce and value['mode']=='source' and value['driverStage']=='unknown'
            assert value['stage']==('result-check' if scenario=='missing' else 'result-binding' if scenario=='stale' else 'transport')
        assert 'private' not in out.getvalue() and str(root) not in out.getvalue()
    finally:shutil.rmtree(root)
print('Fixed helper nonce/driver status/missing-stale result/observed job uncertainty/privacy/120s selected controls passed (inert only).')

for mode in ('source','sea'):
    stages=[value for value in m.DRIVER_STAGES if mode=='source' or value not in ('unpack-entered','unpacked')]
    def line(stage,**changes):return b'EP_DIAGNOSTIC_DRIVER_STAGE='+json.dumps({'nonce':nonce,'mode':mode,'stage':stage,**changes}).encode()+b'\r\n'
    for index,stage in enumerate(stages):
        data=b''.join(line(value) for value in stages[:index+1]);assert m.observed_driver_stage(data,mode,nonce)==stage
        assert m.observed_driver_stage(data+line(stage),mode,nonce)=='unknown'
    for bad in (b'',b'private',line('host-checked'),line('cli-entry',nonce='b'*64),line('cli-entry',unknown='private'),b'EP_DIAGNOSTIC_DRIVER_STAGE=bad\n',b'prefix'+line('cli-entry')):
        assert m.observed_driver_stage(bad,mode,nonce)=='unknown'
# Every helper guard boundary is observed without running native transport.
for scenario,expected in (('host','helper-entry'),('args','helper-entry'),('nonce','arguments'),('root','root-check'),('node','node-check'),('driver','driver-check')):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-stage-inert-')).resolve();node=root/'node.exe';node.write_bytes(b'inert');argv=['fixed',str(root),str(node),'source',nonce]
    if scenario=='args':argv.pop()
    if scenario=='nonce':argv[-1]='private-secret'
    if scenario=='root':argv[1]=str(root/'missing')
    if scenario=='node':argv[2]=str(root/'missing-node')
    original=pathlib.Path.resolve
    def resolve(value,*args,**kwargs):
        if scenario=='driver' and value.name=='windows-startup-leg.js':raise OSError('private-host-path')
        return original(value,*args,**kwargs)
    try:
        with mock.patch.object(m.sys,'platform','other' if scenario=='host' else 'win32'),mock.patch.object(m.sys,'argv',argv),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted'},clear=True),mock.patch.object(pathlib.Path,'resolve',resolve),mock.patch.object(m.conpty,'run_console',side_effect=AssertionError('No transport')) as transport,contextlib.redirect_stdout(io.StringIO()) as out:
            code=m.entry()
        value=json.loads(out.getvalue().splitlines()[0].split('=',1)[1]);assert code==20 and value['stage']==expected and value['closed'] is False;assert transport.call_count==0
        assert 'private' not in out.getvalue() and str(root) not in out.getvalue()
    finally:shutil.rmtree(root)
print('Fixed early helper boundaries and ordered nonce-bound driver stage prefixes: absent/malformed/duplicate/stale/out-of-order remain unknown; no raw data printed (inert).')
for fixed in sorted(m.conpty.FIXED_STAGES):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-transport-stage-')).resolve();node=root/'node.exe';node.write_bytes(b'inert')
    try:
        with mock.patch.object(m.sys,'platform','win32'),mock.patch.object(m.sys,'argv',['fixed',str(root),str(node),'source',nonce]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted'},clear=True),mock.patch.object(m.conpty,'run_console',side_effect=RuntimeError(fixed)),contextlib.redirect_stdout(io.StringIO()) as out:
            assert m.entry()==20
        value=json.loads(out.getvalue().splitlines()[0].split('=',1)[1]);assert value['stage']=='transport' and value['transportStage']==fixed and value['driverStage']=='unknown' and value['closed'] is False
    finally:shutil.rmtree(root)
assert m.observed_driver_stage(b'EP_DIAGNOSTIC_DRIVER_STAGE=null\n','source',nonce)=='unknown'
print('Every existing fixed transport failure stage remains distinct and nonce-bound with unknown driver/closure evidence (inert).')
