#!/usr/bin/env python3
"""Inert wrapper only, no Windows process/API/browser."""
import importlib.util,pathlib,sys,os,tempfile,shutil,json,io,contextlib
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('helper',pathlib.Path(__file__).with_name('windows-startup-leg-helper.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
nonce='a'*64
for scenario in ('success','job-uncertain','driver-failure','missing','stale'):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-leg-wrapper-inert-')).resolve();node=root/'node.exe';node.write_bytes(b'inert')
    def run(exe,args,env,cwd,**kwargs):
        assert exe==str(node) and args[-2:]==['source',nonce]
        assert kwargs['process_budget_ms']==120000 and kwargs['expected']==b'EP_DIAGNOSTIC_LEG_DONE'
        assert all(name not in env for name in ('EP_PASSWORD','EP_EMAIL','NODE_OPTIONS','PUPPETEER_EXECUTABLE_PATH'))
        if scenario=='job-uncertain':raise m.conpty.ExitUnconfirmed('job-exit-unconfirmed')
        kwargs['on_closed']()
        if scenario=='driver-failure':raise RuntimeError('console-child-nonzero')
        if scenario!='missing':(root/'result.json').write_text(json.dumps({'mode':'source','nonce':nonce if scenario!='stale' else 'b'*64}))
    try:
        with mock.patch.object(m.sys,'platform','win32'),mock.patch.object(m.sys,'argv',['fixed',str(root),str(node),'source',nonce]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_PASSWORD':'private','EP_EMAIL':'private','NODE_OPTIONS':'private','PUPPETEER_EXECUTABLE_PATH':'private'},clear=True),mock.patch.object(m.conpty,'run_console',side_effect=run) as transport,contextlib.redirect_stdout(io.StringIO()) as out:
            code=m.entry()
        assert transport.call_count==1
        if scenario=='success':assert code==0 and out.getvalue()=='EP_DIAGNOSTIC_JOB_NONCE='+nonce+'\nEP_DIAGNOSTIC_JOB_OBSERVED_CLOSED=true\nEP_DIAGNOSTIC_JOB_OUTCOME=success\n'
        else:assert code==20 and 'EP_DIAGNOSTIC_JOB_OUTCOME=success' not in out.getvalue()
        assert 'private' not in out.getvalue() and str(root) not in out.getvalue()
    finally:shutil.rmtree(root)
print('Fixed helper nonce/driver status/missing-stale result/observed job uncertainty/privacy/120s selected controls passed (inert only).')
