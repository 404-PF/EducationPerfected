#!/usr/bin/env python3
"""Disposable hosted Windows transport check only. ZERO native credential APIs."""
import importlib.util, os, pathlib, shutil, sys, tempfile
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)

def main():
    if sys.platform!='win32' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or len(sys.argv)!=2:
        raise RuntimeError('host-guard')
    node=pathlib.Path(sys.argv[1])
    if not node.is_absolute() or not node.is_file() or node.name.lower()!='node.exe':raise RuntimeError('node-identity')
    root=pathlib.Path(tempfile.mkdtemp(prefix='ep-conpty-capability-'))
    empty=root/'empty';empty.mkdir()
    env={k:v for k,v in os.environ.items() if k.upper() not in ('PATH','NODE_OPTIONS','EP_EMAIL','EP_PASSWORD','EP_TEST_BOOT')}
    env.update(HOME=str(root),USERPROFILE=str(root),TEMP=str(root),TMP=str(root),TMPDIR=str(root),PATH=str(empty))
    uncertain=False
    try:
        conpty.run_console(str(node),[str(pathlib.Path(__file__).with_name('windows-conpty-tty-check.js').resolve())],env,str(root),[(b'CONPTY_INPUT_READY',b'inert-key\r')],b'CONPTY_TTY_RAW_INPUT_OK',capability_diagnostics=True)
    except conpty.ExitUnconfirmed:
        uncertain=True
        raise
    finally:
        if uncertain:print('ConPTY capability ownership unconfirmed; owned root retained.',file=sys.stderr)
        else:shutil.rmtree(root)
    print('ConPTY zero-credential capability: x64 ABI, TTY/raw input, process/job exit and drained EOF passed. Not product setup or physical-console certification.')

if __name__=='__main__':
    try:main()
    except BaseException as error:
        print('ConPTY zero-credential capability failed: '+conpty.failure_category(error)+'; no native error or child output printed.',file=sys.stderr)
        sys.exit(1)
