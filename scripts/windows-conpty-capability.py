#!/usr/bin/env python3
"""Disposable hosted Windows transport check only. ZERO native credential APIs."""
import ctypes as c, importlib.util, os, pathlib, shutil, sys, tempfile
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
conpty=importlib.util.module_from_spec(spec);spec.loader.exec_module(conpty)

def system_command():
    # Resolve Windows' own system directory through the OS API, not COMSPEC/PATH.
    dll=c.WinDLL('kernel32',use_last_error=True)
    fn=dll.GetSystemDirectoryW;fn.argtypes=[c.POINTER(c.c_wchar),c.c_uint32];fn.restype=c.c_uint32
    buffer=c.create_unicode_buffer(32768)
    length=fn(buffer,len(buffer))
    if not length or length>=len(buffer):raise RuntimeError('system-identity')
    directory=pathlib.Path(buffer.value).resolve(strict=True)
    command=(directory/'cmd.exe').resolve(strict=True)
    if not directory.is_absolute() or not command.is_file() or command.parent!=directory or command.name.lower()!='cmd.exe':raise RuntimeError('system-identity')
    return command

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
        system=system_command()
        stages=[('system-control',str(system),['/d','/q','/c','echo CONPTY_SYSTEM_CONTROL_OK & exit /b 7'],(),b'CONPTY_SYSTEM_CONTROL_OK',7),
                ('node-control',str(node),[str(pathlib.Path(__file__).with_name('windows-conpty-node-control.js').resolve())],(),b'CONPTY_NODE_CONTROL_OK',8),
                ('tty-contract',str(node),[str(pathlib.Path(__file__).with_name('windows-conpty-tty-check.js').resolve())],[(b'CONPTY_INPUT_READY',b'inert-key\r')],b'CONPTY_TTY_RAW_INPUT_OK',0)]
        failed=False
        for label,executable,args,prompts,expected,expected_exit in stages:
            print('ConPTY zero-credential ladder: '+label,flush=True)
            try:
                conpty.run_console(executable,args,env,str(root),prompts,expected,capability_diagnostics=True,expected_exit=expected_exit)
            except conpty.ExitUnconfirmed:raise
            except Exception as error:
                failed=True
                print('ConPTY ladder fixed failure: '+label+'; '+conpty.failure_category(error),flush=True)
        if failed:raise RuntimeError('console-command-failed')
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
