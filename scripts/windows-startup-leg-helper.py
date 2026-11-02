#!/usr/bin/env python3
"""No mutable root/result paths accepted. Ordinary-pipe case, not console proof."""
import importlib.util,pathlib,sys,os,re,json
sys.dont_write_bytecode=True
def load(name):
    spec=importlib.util.spec_from_file_location(name,pathlib.Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
transport=load('windows-owned-pipe');protocol=load('windows-owned-pipe-protocol')
def entry():
    try:
        if sys.platform!='win32' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted' or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows' or len(sys.argv)!=7:raise ValueError('host')
        node,mode,nonce,length,sha,version=sys.argv[1:]
        if mode not in ('source','sea') or not re.fullmatch('[a-f0-9]{64}',nonce) or not re.fullmatch('[1-9][0-9]{0,9}',length) or not re.fullmatch('[a-f0-9]{64}',sha) or not re.fullmatch(r'\d+\.\d+\.\d+\.\d+',version):raise ValueError('args')
        executable=pathlib.Path(node)
        if not executable.is_absolute() or executable.is_symlink() or not executable.is_file():raise ValueError('node')
        driver=pathlib.Path(__file__).with_name('windows-startup-leg.js').resolve(strict=True)
        allowed=('SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATH','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT')
        env={k:v for k,v in os.environ.items() if k.upper() in allowed}
        data,code=transport.run(str(executable),[str(driver),mode,nonce,length,sha,version],env,str(driver.parent))
        protocol.validate(data,code,mode,nonce,{'length':int(length),'sha256':sha,'browserVersion':version,'hashVerified':True,'extractionOwned':True,'headlessMode':'test-shell-full-browser','executableSource':'owned-extraction-of-pinned-archive'})
    except BaseException:
        print('EP_OWNED_PIPE_RESULT=uncertain',flush=True);return 20
    print('EP_OWNED_PIPE_NONCE='+nonce,flush=True);print('EP_OWNED_PIPE_MODE='+mode,flush=True);print('EP_OWNED_PIPE_RESULT=pass',flush=True);return 0
if __name__=='__main__':
    sys.stdout.reconfigure(newline='\n');sys.exit(entry())
