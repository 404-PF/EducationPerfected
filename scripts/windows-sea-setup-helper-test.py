#!/usr/bin/env python3
import importlib.util, pathlib, tempfile, shutil, sys, os, io, contextlib
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('helper',pathlib.Path(__file__).with_name('windows-sea-setup-helper.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for scenario in ('success','closed-failure','uncertain','echo','unexpected'):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-setup-helper-inert-'))
    for name in ('home','tmp','empty'):(root/name).mkdir()
    (root/'educationperfected.exe').write_bytes(b'inert')
    calls=[]
    def run(exe,args,env,cwd,prompts,expected,on_closed,forbidden_output,expected_exit):
        calls.append((exe,args,env,cwd,prompts,expected,forbidden_output,expected_exit))
        if scenario in ('success','closed-failure'):on_closed()
        if scenario=='closed-failure':raise RuntimeError('console-child-nonzero')
        if scenario=='uncertain':raise m.conpty.ExitUnconfirmed('job-exit-unconfirmed') from RuntimeError('process-timeout')
        if scenario=='echo':raise RuntimeError('console-input-echoed')
        if scenario=='unexpected':raise ValueError('private-secret-native-text')
    try:
        with mock.patch.object(m.sys,'platform','win32'),mock.patch.object(m.sys,'argv',['fixed',str(root),'save']),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted','EP_PASSWORD':str(0),'EP_EMAIL':str(0),'NODE_OPTIONS':'inert'},clear=True),mock.patch.object(m.conpty,'run_console',side_effect=run),contextlib.redirect_stdout(io.StringIO()) as out:
            code=m.entry()
        text=out.getvalue();assert len(calls)==1
        exe,args,env,cwd,prompts,expected,forbidden_output,expected_exit=calls[0]
        assert exe==str(root/'educationperfected.exe') and args==['--setup']
        assert 'EP_PASSWORD' not in env and 'EP_EMAIL' not in env and 'NODE_OPTIONS' not in env
        assert env['PATH']==str(root/'empty')
        assert expected_exit==0
        assert forbidden_output==()
        assert prompts==[(b'EP email',b'fixture@example.test\r'),(b'EP password',b'synthetic-sea-delete\r')]
        assert code==({'success':0,'closed-failure':1}.get(scenario,20))
        assert text.endswith('EP_SETUP_CLOSED_SUCCESS\n' if scenario=='success' else 'EP_SETUP_CLOSED_FAILURE\n' if scenario=='closed-failure' else 'EP_SETUP_UNCERTAIN\n')
        assert 'private-secret' not in text and 'synthetic-sea-delete' not in text
        if scenario=='uncertain':assert 'EP_SETUP_PRIMARY=process-timeout\n' in text
    finally:shutil.rmtree(root)
print('SEA setup helper inert prompt/privacy/closed receipt/uncertainty/primary-cause controls passed. Native outcomes recorded separately.')

# Exercise real text-layer translation, not StringIO's translation-free behavior.
for initial_newline in ('\r\n','\n'):
    for status,code in [('EP_SETUP_CLOSED_SUCCESS',0),('EP_SETUP_CLOSED_FAILURE',1),('EP_SETUP_UNCERTAIN',20)]:
        raw=io.BytesIO()
        stream=io.TextIOWrapper(raw,encoding='utf-8',newline=initial_newline)
        def emit():
            print(status,flush=True)
            return code
        with mock.patch.object(m,'entry',side_effect=emit),contextlib.redirect_stdout(stream):
            assert m.main()==code
        assert raw.getvalue()==(status+'\n').encode(),(initial_newline,raw.getvalue())
        stream.detach()
print('Helper wire protocol forces exact LF under Windows CRLF and POSIX text layers (inert only).')

for mode in ('cancel-email','cancel-password'):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-cancel-helper-inert-'))
    for name in ('home','tmp','empty'):(root/name).mkdir()
    (root/'educationperfected.exe').write_bytes(b'inert')
    def cancel(exe,args,env,cwd,prompts,expected,on_closed,forbidden_output,expected_exit):
        on_closed()
    try:
        with mock.patch.object(m.sys,'platform','win32'),mock.patch.object(m.sys,'argv',['fixed',str(root),mode]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted'},clear=True),mock.patch.object(m.conpty,'run_console',side_effect=cancel) as transport,contextlib.redirect_stdout(io.StringIO()) as out:
            assert m.entry()==0
        assert transport.call_count==1 and out.getvalue()=='EP_SETUP_CLOSED_SUCCESS\n'
        exe,args,env,cwd,prompts,expected=transport.call_args.args
        forbidden_output=transport.call_args.kwargs['forbidden_output']
        expected_exit=transport.call_args.kwargs['expected_exit']
        assert args==['--setup']
        assert expected_exit==0
        assert expected==b'Setup cancelled; no login saved.'
        assert forbidden_output==(b'Login saved in the OS credential store. Run the CLI to sign in.',)
        assert prompts==([(b'EP email',b'\r')] if mode=='cancel-email' else [(b'EP email',b'fixture@example.test\r'),(b'EP password',b'\r')])
    finally:shutil.rmtree(root)
print('Cancellation helper modes use only fixed empty hidden-prompt input/ack/forbidden-save contracts (inert only).')


for mode in ('interrupt-email','interrupt-password'):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-interrupt-helper-inert-'))
    for name in ('home','tmp','empty'):(root/name).mkdir()
    (root/'educationperfected.exe').write_bytes(b'inert')
    def interrupt(exe,args,env,cwd,prompts,expected,on_closed,forbidden_output,expected_exit):
        on_closed()
    try:
        with mock.patch.object(m.sys,'platform','win32'),mock.patch.object(m.sys,'argv',['fixed',str(root),mode]),mock.patch.dict(os.environ,{'GITHUB_ACTIONS':'true','RUNNER_OS':'Windows','RUNNER_ENVIRONMENT':'github-hosted'},clear=True),mock.patch.object(m.conpty,'run_console',side_effect=interrupt) as transport,contextlib.redirect_stdout(io.StringIO()) as out:
            assert m.entry()==0
        assert transport.call_count==1 and out.getvalue()=='EP_SETUP_CLOSED_SUCCESS\n'
        exe,args,env,cwd,prompts,expected=transport.call_args.args
        forbidden_output=transport.call_args.kwargs['forbidden_output']
        expected_exit=transport.call_args.kwargs['expected_exit']
        assert args==['--setup'] and expected_exit==130
        assert expected==(b'EP email' if mode=='interrupt-email' else b'EP password')
        assert prompts==([(b'EP email',b'\x03')] if mode=='interrupt-email' else [(b'EP email',b'fixture@example.test\r'),(b'EP password',b'\x03')])
        assert forbidden_output==((b'Login saved in the OS credential store. Run the CLI to sign in.',b'Setup cancelled; no login saved.',b'EP password') if mode=='interrupt-email' else (b'Login saved in the OS credential store. Run the CLI to sign in.',b'Setup cancelled; no login saved.'))
    finally:shutil.rmtree(root)
print('Interrupt helper expected child130 is mode-local; helper success remains exit0/strict receipt; both acks excluded (inert only).')
