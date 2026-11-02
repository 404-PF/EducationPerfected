"""Owned namespace bootstrap. Binds private resolver files BEFORE capability drop."""
import os,sys,pathlib,subprocess,tempfile,shutil,json
ROOT=pathlib.Path(__file__).resolve().parents[2]
def main():
 if len(sys.argv)!=1 or os.getuid()==0:raise RuntimeError('Bootstrap refused')
 outer=os.readlink('/proc/self/ns/net');owned=pathlib.Path(tempfile.mkdtemp(prefix='ep-resolver-boundary-'))
 try:
  (owned/'nsswitch').write_text('hosts: files dns\npasswd: files\ngroup: files\n')
  (owned/'resolv').write_text('nameserver 192.0.2.53\noptions timeout:1 attempts:1\n')
  (owned/'hosts').write_text('127.0.0.1 localhost\n::1 localhost\n')
  # Fixed script receives only the bootstrap's freshly allocated paths.
  script='mount --make-rprivate /; mount --bind "$1/nsswitch" /etc/nsswitch.conf; mount --bind "$1/resolv" /etc/resolv.conf; mount --bind "$1/hosts" /etc/hosts; ip link set lo up; exec setpriv --bounding-set=-all --inh-caps=-all --ambient-caps=-all --no-new-privs python3 scripts/normal-read-fixture/run-isolated.py'
  r=subprocess.run(['unshare','--user','--map-current-user','--keep-caps','--mount','--propagation','private','--net','--pid','--fork','--kill-child=KILL','--','sh','-eu','-c',script,'fixed',str(owned)],stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=150,close_fds=True,env={'PATH':'/usr/bin:/usr/sbin:/bin:/sbin','LANG':'C'})
  if r.returncode or r.stderr or r.stdout!=b'EP_NORMAL_READ_RESULT=pass\n':raise RuntimeError('Boundary run refused')
  print('EP_NORMAL_READ_RESULT=pass',flush=True)
 finally:shutil.rmtree(owned)
if __name__=='__main__':
 try:main()
 except BaseException:print('EP_NORMAL_READ_RESULT=fail',flush=True);sys.exit(1)
