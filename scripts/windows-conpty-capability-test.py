#!/usr/bin/env python3
"""Inert host guards, zero credential operations, environment and root retention."""
import importlib.util, pathlib, tempfile, shutil, sys, os
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('capability',pathlib.Path(__file__).with_name('windows-conpty-capability.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for scenario in ['success','command-failure','exit-unconfirmed','wrong-host','missing-node']:
    parent=pathlib.Path(tempfile.mkdtemp(prefix='ep-capability-inert-'))
    node=parent/'node.exe';node.write_bytes(b'inert')
    root=parent/'owned';calls=[]
    primary=m.conpty.ExitUnconfirmed('job-exit-unconfirmed') if scenario=='exit-unconfirmed' else RuntimeError('inert primary')
    def run(exe,args,env,cwd,prompts,expected):
        calls.append('run')
        assert exe==str(node) and args==[str(pathlib.Path(m.__file__).with_name('windows-conpty-tty-check.js').resolve())]
        assert all(k not in env for k in ('EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT','NODE_OPTIONS'))
        assert env['PATH']==str(root/'empty') and env['HOME']==str(root) and cwd==str(root)
        assert prompts==[(b'CONPTY_INPUT_READY',b'inert-key\r')] and expected==b'CONPTY_TTY_RAW_INPUT_OK'
        if scenario in ('command-failure','exit-unconfirmed'):raise primary
    def make_root(**kwargs):root.mkdir();return str(root)
    try:
        env={'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_EMAIL':str(0),'EP_PASSWORD':str(0),'EP_TEST_BOOT':'1','NODE_OPTIONS':'inert'}
        with mock.patch.object(m.sys,'platform','linux' if scenario=='wrong-host' else 'win32'),mock.patch.object(m.sys,'argv',['fixed',str(parent/'missing.exe') if scenario=='missing-node' else str(node)]),mock.patch.dict(os.environ,env,clear=True),mock.patch.object(m.tempfile,'mkdtemp',side_effect=make_root),mock.patch.object(m.conpty,'run_console',side_effect=run):
            error=None
            try:m.main()
            except BaseException as caught:error=caught
            assert (error is None)==(scenario=='success')
            if scenario in ('command-failure','exit-unconfirmed'):assert error is primary
        assert calls==([] if scenario in ('wrong-host','missing-node') else ['run'])
        assert root.exists()==(scenario=='exit-unconfirmed')
    finally:shutil.rmtree(parent)
print('ConPTY capability inert host/identity/env/zero-credential/root-retention controls passed.')
