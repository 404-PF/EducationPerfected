#!/usr/bin/env python3
"""Inert probe privacy/closure/parser contracts only. No Windows API/browser."""
import importlib.util,pathlib,sys,os,json,io,tempfile,shutil,contextlib
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('probe',pathlib.Path(__file__).with_name('windows-stage-transport-probe.py'))
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
nonce='a'*64
stages=p.helper.DRIVER_STAGES[:5]
data=b''.join(b'EP_DIAGNOSTIC_DRIVER_STAGE='+json.dumps({'nonce':nonce,'mode':'source','stage':stage},separators=(',',':')).encode()+b'\r\n' for stage in stages)
assert p.evidence(data)['strictPrefixStage']=='archive-check-entered'
for bad in (b'',b'private-host-path',b'\x1b[?25l'+data,data.replace(nonce.encode(),b'b'*64),data+data,data.replace(b'cli-root-checked',b'archive-verified')):
    assert p.evidence(bad)['strictPrefixStage']=='unknown'
assert p.evidence(b'\x1b[?25l'+data)['vtPresent'] is True
root=pathlib.Path(tempfile.mkdtemp(prefix='ep-probe-inert-')).resolve();node=root/'node.exe';node.write_bytes(b'inert')
try:
 for scenario in ('success','wrapped','unconfirmed','setup-failure','closed-child-failure','no-drain','returned-without-confirm','private-transport-error','private-closure-error'):
    calls=[]
    def transport(exe,args,env,cwd,**kwargs):
        calls.append((exe,args,env,cwd,kwargs))
        assert kwargs.get('process_budget_ms',30000)==30000 and not kwargs.get('prompts')
        if scenario!='no-drain':kwargs['on_drain'](b'\x1b[?25l'+data if scenario=='wrapped' else data)
        if scenario=='unconfirmed':raise p.helper.conpty.ExitUnconfirmed('job-exit-unconfirmed')
        if scenario=='private-closure-error':raise p.helper.conpty.ExitUnconfirmed('private cleanup error /private-host-path')
        if scenario!='returned-without-confirm':kwargs['on_closed']()
        if scenario=='setup-failure':raise RuntimeError('process-create')
        if scenario=='private-transport-error':raise RuntimeError('private transport error /private-host-path')
        if scenario=='closed-child-failure':raise RuntimeError('console-child-nonzero')
    with mock.patch.object(p.sys,'platform','win32'),mock.patch.object(p.sys,'argv',['fixed',str(node)]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_EMAIL':'private','EP_PASSWORD':'private','NODE_OPTIONS':'private','NODE_EXTRA_CA_CERTS':'private','ARBITRARY_SECRET':'private'},clear=True),mock.patch.object(p.helper.conpty,'run_console',side_effect=transport),contextlib.redirect_stdout(io.StringIO()) as out:
        code=p.entry()
    record=json.loads(out.getvalue().split('=',1)[1]);assert len(calls)==1
    assert record['observedClosed']==(scenario not in ('unconfirmed','returned-without-confirm','private-closure-error'))
    assert record['outcome']==('wire-observed' if scenario=='success' else 'wire-parser-unknown' if scenario in ('wrapped','no-drain') else 'uncertainty')
    assert code==(0 if scenario=='success' else 20)
    assert record['stage']==('console-command-failed' if scenario in ('private-transport-error','private-closure-error') else 'job-exit-unconfirmed' if scenario=='unconfirmed' else 'process-create' if scenario=='setup-failure' else 'console-child-nonzero' if scenario=='closed-child-failure' else 'complete')
    assert 'private' not in out.getvalue() and str(root) not in out.getvalue() and nonce not in out.getvalue()
    assert all(name not in calls[0][2] for name in ('EP_EMAIL','EP_PASSWORD','NODE_OPTIONS','NODE_EXTRA_CA_CERTS','ARBITRARY_SECRET'))
 child=pathlib.Path(__file__).with_name('windows-stage-transport-probe.js').read_text()
 assert all(token not in child for token in ('puppeteer','child_process','node:fs','require(\'fs\')'))
 assert 'process.argv.length!==2' in child
 print('Zero-browser probe strict parser/VT/stale/duplicate controls and independent closure/status/privacy tests passed (inert only).')
finally:shutil.rmtree(root)
