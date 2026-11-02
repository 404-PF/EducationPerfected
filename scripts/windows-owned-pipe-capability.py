#!/usr/bin/env python3
"""One chosen-path native capability; never product admission."""
import importlib.util,pathlib,sys,os
sys.dont_write_bytecode=True
def load(name):
 s=importlib.util.spec_from_file_location(name,pathlib.Path(__file__).with_name(name+'.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
t=load('windows-owned-pipe');p=load('windows-owned-pipe-protocol')
def entry():
 try:
  if sys.platform!='win32' or len(sys.argv)!=2 or os.environ.get('GITHUB_ACTIONS')!='true' or os.environ.get('RUNNER_OS')!='Windows' or os.environ.get('RUNNER_ENVIRONMENT')!='github-hosted':raise ValueError()
  node=pathlib.Path(sys.argv[1])
  if not node.is_absolute() or node.is_symlink() or not node.is_file() or node.name.lower()!='node.exe':raise ValueError()
  child=pathlib.Path(__file__).with_name('windows-owned-pipe-capability.js').resolve(strict=True)
  env={k:v for k,v in os.environ.items() if k.upper() in ('SYSTEMROOT','WINDIR','SYSTEMDRIVE','GITHUB_ACTIONS','RUNNER_OS','RUNNER_ENVIRONMENT')}
  identity={'length':123,'sha256':'b'*64,'browserVersion':'156.0.8078.47','hashVerified':True,'extractionOwned':True,'headlessMode':'test-shell-full-browser','executableSource':'owned-extraction-of-pinned-archive'}
  data,code=t.run(str(node),[str(child),'pass'],env,str(child.parent));p.validate(data,code,'source','a'*64,identity)
  print('EP_OWNED_PIPE_CAPABILITY_POSITIVE=pass',flush=True)
  data,code=t.run(str(node),[str(child),'nonzero'],env,str(child.parent))
  if code!=7:raise ValueError()
  try:p.validate(data,code,'source','a'*64,identity)
  except ValueError:pass
  else:raise ValueError()
  print('EP_OWNED_PIPE_CAPABILITY_NONZERO_REJECTED=pass',flush=True)
 except BaseException:
  print('EP_OWNED_PIPE_CAPABILITY_RESULT=uncertain',flush=True);return 20
 print('EP_OWNED_PIPE_CAPABILITY_RESULT=pass',flush=True);return 0
if __name__=='__main__':
 sys.stdout.reconfigure(newline='\n');sys.exit(entry())
