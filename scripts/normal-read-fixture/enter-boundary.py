"""Owned namespace bootstrap. Binds private resolver files BEFORE capability drop."""
import os,sys,pathlib,subprocess,tempfile,shutil,json
from stages import Stages,capture,INNER,DiagnosticError
ROOT=pathlib.Path(__file__).resolve().parents[2]
stages=Stages()
def main():
 stages.mark('boundary.enter')
 if len(sys.argv)!=1 or os.getuid()==0:raise RuntimeError('Bootstrap refused')
 outer=os.readlink('/proc/self/ns/net');owned=pathlib.Path(tempfile.mkdtemp(prefix='ep-resolver-boundary-'))
 try:
  (owned/'nsswitch').write_text('hosts: files dns\npasswd: files\ngroup: files\n')
  (owned/'resolv').write_text('nameserver 192.0.2.53\noptions timeout:1 attempts:1\n')
  (owned/'hosts').write_text('127.0.0.1 localhost\n::1 localhost\n')
  # Fixed script receives only the bootstrap's freshly allocated paths.
  script='mount --make-rprivate /; mount --bind "$1/nsswitch" /etc/nsswitch.conf; mount --bind "$1/resolv" /etc/resolv.conf; mount --bind "$1/hosts" /etc/hosts; ip link set lo up; exec setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs python3 scripts/normal-read-fixture/run-isolated.py'
  seen,failure,good=capture(['unshare','--user','--map-current-user','--keep-caps','--mount','--propagation','private','--net','--pid','--fork','--kill-child=KILL','--','sh','-eu','-c',script,'fixed',str(owned)],timeout=150,env={'PATH':'/usr/bin:/usr/sbin:/bin:/sbin','LANG':'C'},sequence=INNER,cleanup='inner.cleanup')
  for token in seen:stages.mark(token)
  if not good:stages.failed(failure);raise DiagnosticError()

 except BaseException:
  stages.failed();raise
 finally:
  stages.mark('boundary.cleanup')
  shutil.rmtree(owned)
if __name__=='__main__':
 try:main()
 except BaseException:stages.failed();stages.finish(False);sys.exit(1)
 else:stages.finish(True)
