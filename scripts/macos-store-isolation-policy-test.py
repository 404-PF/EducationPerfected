#!/usr/bin/env python3
"""Inert protocol control: no security executable or credential API used."""
import importlib.util, pathlib, tempfile, shutil, contextlib, io
spec=importlib.util.spec_from_file_location('fixture',pathlib.Path(__file__).with_name('macos-isolated-store-test.py'))
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
passphrases=[]

def probe(scenario):
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-inert-mac-'))
    previous=['/inert/login.keychain-db','/inert/extra.keychain-db'];default=[previous[0]]
    state={'default':default[:],'list':previous[:],'fixture':0,'commands':[]}
    owned=str(root/'synthetic.keychain-db');primary=RuntimeError('inert fixture failure')
    def call(*args):
        state['commands'].append(args)
        op=args[0]
        if op=='default-keychain':
            if '-s' in args:
                state['default']=[args[-1]]
                if scenario=='restore-silent' and args[-1]==default[0]:state['default']=[owned]
                if scenario=='restore-failure' and args[-1]==default[0]:
                    state['default']=[owned];raise RuntimeError('inert restore failure')
                return ''
            if scenario=='selection-mismatch' and state['default']==[owned]:return repr(default[0])
            return '\n'.join(repr(x)for x in state['default'])
        if op=='list-keychains':
            if '-s' in args:state['list']=list(args[args.index('-s')+1:]);return ''
            return '\n'.join(repr(x)for x in state['list'])
        if op=='create-keychain':
            value=args[args.index('-p')+1]
            assert len(value)>=32 and value not in passphrases
            passphrases.append(value)
            pathlib.Path(owned).touch();state['list'].append(owned)
            if scenario=='create-failure':raise primary
        if op=='delete-keychain':pathlib.Path(owned).unlink()
        if op not in ['create-keychain','delete-keychain','unlock-keychain']:raise AssertionError('unapproved command')
        return ''
    def run(root):
        assert state['default']==[owned] and state['list']==[owned]
        state['fixture']+=1
        if scenario=='fixture-failure':raise primary
        if scenario=='child-live':
            import subprocess
            class LiveChild:
                pid=4321
                def wait(self,timeout):raise subprocess.TimeoutExpired('inert',timeout)
            fixture.stop_group(LiveChild(),killpg=lambda pid,signum:None)
    error=None
    output=io.StringIO()
    with contextlib.redirect_stdout(output):
        try:
            fixture.isolated_store(run,call=call,root_factory=lambda:str(root))
        except BaseException as value:error=value
    expected=[]
    if scenario not in ['create-failure','selection-mismatch']:expected.append('Mac store parent checkpoint: owned-selection-verified')
    if scenario not in ['restore-failure','restore-silent','child-live']:expected.append('Mac store parent checkpoint: metadata-restored-owned-keychain-removed')
    assert output.getvalue().splitlines()==expected
    if scenario=='success':assert error is None and state['fixture']==1
    if scenario=='fixture-failure':assert error is primary
    if scenario=='create-failure':assert error is primary and state['fixture']==0
    if scenario=='selection-mismatch':assert error is not None and state['fixture']==0
    if scenario in ['restore-failure','restore-silent']:assert error is not None and root.exists() and pathlib.Path(owned).exists()
    if scenario=='child-live':assert isinstance(error,fixture.ChildStillLive) and state['default']==[owned] and pathlib.Path(owned).exists()
    if scenario not in ['restore-failure','restore-silent','child-live']:
        assert state['default']==default and state['list']==previous and not root.exists()
    # Never existing keychain record access, unlock, certificate, system or ACL operations.
    for args in state['commands']:
        assert args[0] in ['default-keychain','list-keychains','create-keychain','unlock-keychain','delete-keychain']
        if args[0] in ['create-keychain','unlock-keychain','delete-keychain']:assert args[-1]==owned
    shutil.rmtree(root,ignore_errors=True)

for scenario in ['success','fixture-failure','create-failure','selection-mismatch','restore-failure','restore-silent','child-live']:probe(scenario)
print('Mac keychain isolation pre-create ownership, verified selection, restore failure and live-child retention controls passed (inert only).')

# A wait timeout after SIGKILL must become ChildStillLive before restoration.
import subprocess
class Child:
    pid=1234
    def wait(self,timeout):raise subprocess.TimeoutExpired('inert-child',timeout)
try:
    fixture.stop_group(Child(),killpg=lambda pid,signum:None)
    raise AssertionError('Unconfirmed wait accepted')
except fixture.ChildStillLive:
    pass
spec=importlib.util.spec_from_file_location('pty_fixture',pathlib.Path(__file__).with_name('macos-store-pty-test.py'))
pty_fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(pty_fixture)
assert pty_fixture.drain_pty(1,b'fixed',ready=lambda:True,read=lambda:b'')==b'fixed'
def eio():
    import errno
    raise OSError(errno.EIO,'inert BSD EOF')
assert pty_fixture.drain_pty(1,b'fixed',ready=lambda:True,read=eio)==b'fixed'
clock=iter([0,3])
try:
    pty_fixture.drain_pty(1,b'',ready=lambda:True,read=lambda:b'nonempty',clock=lambda:next(clock))
    raise AssertionError('Unbounded drain accepted')
except RuntimeError:
    pass
print('Mac PTY empty/EIO EOF, bounded drain and post-SIGKILL wait-timeout retention controls passed (inert only).')

# Verify the actual child environment keeps User-domain metadata selection.
import os
from unittest import mock
captured=[]
repo=pathlib.Path(__file__).resolve().parent.parent
alias_parent=pathlib.Path(tempfile.mkdtemp(prefix='ep-inert-env-'))
root=(alias_parent/'actual').resolve()
root.mkdir()
alias=alias_parent/'alias'
alias.symlink_to(root,target_is_directory=True)
owned=str(root/'synthetic.keychain-db')
def mocked_run(args, **kwargs):
    if args[0]=='/usr/bin/security':
        captured.append(kwargs.get('env'))
        return subprocess.CompletedProcess(args,0,stdout=repr(owned),stderr='')
    captured.append(kwargs['env'])
    raise RuntimeError('stop before actual native credential operation')
try:
    with mock.patch.object(pty_fixture.sys,'platform','darwin'), mock.patch.object(pty_fixture.sys,'argv',['fixed',str(alias)]), mock.patch.dict(os.environ,{'RUNNER_ENVIRONMENT':'github-hosted','HOME':'/inert-original-home'}), mock.patch.object(pty_fixture.subprocess,'run',side_effect=mocked_run), mock.patch.object(pty_fixture,'shutil_which_node',return_value='/fixed/node'):
        try:pty_fixture.main()
        except RuntimeError as error:assert str(error)=='stop before actual native credential operation'
    assert captured[-1]['HOME']=='/inert-original-home'
    assert captured[-1]['TMPDIR']==str(root/'tmp') and captured[-1]['PATH']==str(root/'empty')
    assert captured[-2]['HOME']=='/inert-original-home'
finally:shutil.rmtree(alias_parent)
print('Mac native child retains runner HOME and verified metadata with owned TMP/empty PATH (inert only).')
