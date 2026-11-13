#!/usr/bin/env python3
"""Hosted synthetic SEA setup only. Never relay child output or read native stores."""
import importlib.util, os, pathlib, sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)

def setup(root, state, mode):
    if sys.platform!='win32' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or os.environ.get('RUNNER_OS')!='Windows':raise RuntimeError('host-guard')
    if mode not in ('save','cancel-email','cancel-password','interrupt-email','interrupt-password'):raise RuntimeError('host-guard')
    root=pathlib.Path(root)
    if not root.is_absolute() or root.is_symlink() or not root.is_dir():raise RuntimeError('node-identity')
    root=root.resolve(strict=True)
    executable=root/'educationperfected.exe'
    if executable.is_symlink() or not executable.is_file() or executable.resolve(strict=True).parent!=root:raise RuntimeError('node-identity')
    for name in ('home','tmp','empty'):
        directory=root/name
        if directory.is_symlink() or not directory.is_dir() or directory.resolve(strict=True).parent!=root:raise RuntimeError('node-identity')
    if any((root/'tmp').iterdir()):raise RuntimeError('console-command-failed')
    env={k:v for k,v in os.environ.items() if k.upper() not in ('PATH','NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT')}
    env.update(HOME=str(root/'home'),USERPROFILE=str(root/'home'),TEMP=str(root/'tmp'),TMP=str(root/'tmp'),TMPDIR=str(root/'tmp'),PATH=str(root/'empty'))
    cache_spec=importlib.util.spec_from_file_location('inert_browser_cache',pathlib.Path(__file__).with_name('seed-inert-browser-cache.py'))
    cache=importlib.util.module_from_spec(cache_spec);cache_spec.loader.exec_module(cache)
    cache.seed(root/'home',platform_name='win32')
    prompts=[(b'EP email',b'fixture@example.test\r'),(b'EP password',b'synthetic-sea-delete\r')]
    saved=b'Login saved in the OS credential store. Run the CLI to sign in.'
    expected=saved
    forbidden=()
    if mode=='cancel-email':prompts=[(b'EP email',b'\r')]
    if mode=='cancel-password':prompts=[(b'EP email',b'fixture@example.test\r'),(b'EP password',b'\r')]
    if mode!='save':
        expected=b'Setup cancelled; no login saved.'
        forbidden=(saved,)
    expected_exit=0
    if mode.startswith('interrupt-'):
        expected_exit=130
        expected=b'EP email' if mode=='interrupt-email' else b'EP password'
        forbidden=(saved,b'Setup cancelled; no login saved.')
        prompts=[(b'EP email',b'\x03')] if mode=='interrupt-email' else [(b'EP email',b'fixture@example.test\r'),(b'EP password',b'\x03')]
        if mode=='interrupt-email':forbidden+=(b'EP password',)
    state['attempted']=True
    def closed():state['closed']=True
    conpty.run_console(str(executable),['setup'],env,str(root/'home'),prompts,expected,on_closed=closed,forbidden_output=forbidden,expected_exit=expected_exit)

def entry():
    state={'attempted':False,'closed':False}
    try:
        if len(sys.argv)!=3:raise RuntimeError('host-guard')
        setup(sys.argv[1],state,sys.argv[2])
    except BaseException as error:
        # Uncertain closure or any input echo must never authorize concurrent deletion.
        uncertain=(state['attempted'] and not state['closed']) or isinstance(error,conpty.ExitUnconfirmed) or conpty.fixed_stage(error)=='console-input-echoed' or not isinstance(error,RuntimeError)
        original=error.__cause__ if isinstance(error,conpty.ExitUnconfirmed) and error.__cause__ else error
        print('EP_SETUP_PRIMARY='+conpty.fixed_stage(original),flush=True)
        print('EP_SETUP_UNCERTAIN' if uncertain else 'EP_SETUP_CLOSED_FAILURE',flush=True)
        return 20 if uncertain else 1
    print('EP_SETUP_CLOSED_SUCCESS',flush=True)
    return 0

def main():
    # A pipe's Windows TextIOWrapper otherwise translates protocol LF to CRLF.
    # Keep the receiver strict; never normalize arbitrary child/helper output.
    sys.stdout.reconfigure(newline='\n')
    return entry()

if __name__=='__main__':sys.exit(main())
