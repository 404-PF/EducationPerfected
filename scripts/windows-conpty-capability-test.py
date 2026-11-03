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
    def run(exe,args,env,cwd,prompts,expected,**kwargs):
        calls.append('run')
        assert exe in (str(node),str(parent/'cmd.exe'))
        assert kwargs.get('capability_diagnostics') is True
        expected_code=kwargs['expected_exit']
        if expected_code==7:
            assert exe==str(parent/'cmd.exe') and args==['/d','/q','/c','echo CONPTY_SYSTEM_CONTROL_OK & exit /b 7'] and not prompts and expected==b'CONPTY_SYSTEM_CONTROL_OK'
        elif expected_code==8:
            assert args==[str(pathlib.Path(m.__file__).with_name('windows-conpty-node-control.js').resolve())] and not prompts and expected==b'CONPTY_NODE_CONTROL_OK'
        else:
            assert expected_code==0 and args==[str(pathlib.Path(m.__file__).with_name('windows-conpty-tty-check.js').resolve())]
            assert prompts==[(b'CONPTY_INPUT_READY',b'inert-key\r')] and expected==b'CONPTY_TTY_RAW_INPUT_OK'
        assert all(k not in env for k in ('EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT','NODE_OPTIONS'))
        assert env['PATH']==str(root/'empty') and env['HOME']==str(root) and cwd==str(root)
        if scenario in ('command-failure','exit-unconfirmed'):raise primary
    def make_root(**kwargs):root.mkdir();return str(root)
    try:
        env={'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_EMAIL':str(0),'EP_PASSWORD':str(0),'EP_TEST_BOOT':'1','NODE_OPTIONS':'inert'}
        with mock.patch.object(m.sys,'platform','linux' if scenario=='wrong-host' else 'win32'),mock.patch.object(m.sys,'argv',['fixed',str(parent/'missing.exe') if scenario=='missing-node' else str(node)]),mock.patch.dict(os.environ,env,clear=True),mock.patch.object(m.tempfile,'mkdtemp',side_effect=make_root),mock.patch.object(m.conpty,'run_console',side_effect=run),mock.patch.object(m,'system_command',return_value=parent/'cmd.exe'):
            error=None
            try:m.main()
            except BaseException as caught:error=caught
            assert (error is None)==(scenario=='success')
            if scenario=='exit-unconfirmed':assert error is primary
            if scenario=='command-failure':assert str(error)=='console-command-failed'
        assert calls==([] if scenario in ('wrong-host','missing-node') else ['run'] if scenario=='exit-unconfirmed' else ['run']*3)
        assert root.exists()==(scenario=='exit-unconfirmed')
    finally:shutil.rmtree(parent)
print('ConPTY capability inert host/identity/env/zero-credential/root-retention controls passed.')

# Fixed diagnostic metadata never prints attacker/native text or filesystem details.
for error,category in [(TypeError('sensitive-native-path'), 'argument'), (AttributeError('sensitive-native-path'), 'api-unavailable'), (OSError('sensitive-native-path'), 'os-error'), (RuntimeError('sensitive-native-path'), 'other'), (RuntimeError('process-create'), 'fixed-check'), (m.conpty.ExitUnconfirmed('job-exit-unconfirmed'), 'ownership')]:
    text=m.conpty.failure_category(error)
    assert 'category='+category in text and 'sensitive' not in text
error=OSError('sensitive-native-path');error.winerror=5
assert 'win32=5' in m.conpty.failure_category(error)
error.winerror=123456
assert 'win32=other' in m.conpty.failure_category(error)
assert 'stage=host-guard' in m.conpty.failure_category(RuntimeError('host-guard'))
assert 'stage=node-identity' in m.conpty.failure_category(RuntimeError('node-identity'))
print('ConPTY failure classification: fixed stage/type/allowlisted Win32 code only; arbitrary native contents suppressed.')
