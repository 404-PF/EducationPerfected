"""Fixed private CI runner. Entry preflight precedes ALL store/display/product work."""
import os,sys,pathlib,subprocess,socket,json,tempfile,shutil,time,signal,ipaddress
ROOT=pathlib.Path(__file__).resolve().parents[2]
def required(ok):
 if not ok:raise RuntimeError('admission-refused')
def cmd(args,**kw):return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=10,**kw)
def preflight():
 required(os.getuid()!=0 and not os.isatty(0) and len(sys.argv)==1)
 status=pathlib.Path('/proc/self/status').read_text()
 for line in status.splitlines():
  if line.startswith(('CapInh:','CapPrm:','CapEff:','CapBnd:','CapAmb:')):required(int(line.split()[1],16)==0)
 required('NoNewPrivs:\t1' in status)
 for f in pathlib.Path('/proc/self/fd').iterdir():
  try:target=os.readlink(f)
  except FileNotFoundError:continue
  required(not target.startswith(('socket:','net:[','user:[')))
 links=json.loads(cmd(['ip','-j','link']).stdout);required(len(links)==1 and links[0]['ifname']=='lo' and 'UP' in links[0]['flags'])
 for args in [['ip','-j','route'],['ip','-j','-6','route']]:required(json.loads(cmd(args).stdout)==[])
 # Fail on unknown NSS routes rather than modifying host policy or assuming env isolation.
 hosts=[x.split('#')[0].strip() for x in pathlib.Path('/etc/nsswitch.conf').read_text().splitlines() if x.startswith('hosts:')]
 required(len(hosts)==1 and hosts[0].split()==['hosts:','files','dns'])
 for p in ['/var/run/nscd/socket','/run/nscd/socket']:required(not pathlib.Path(p).exists())
 nameservers=[x.split()[1] for x in pathlib.Path('/etc/resolv.conf').read_text().splitlines() if x.startswith('nameserver ')]
 required(nameservers==['192.0.2.53'])
 required(pathlib.Path('/etc/hosts').read_text()=='127.0.0.1 localhost\n::1 localhost\n')
 for a in nameservers:required(not ipaddress.ip_address(a).is_loopback)
 for family,address in [(socket.AF_INET,('192.0.2.1',9)),(socket.AF_INET6,('2001:db8::1',9))]:
  with socket.socket(family) as s:
   s.settimeout(.5)
   try:s.connect(address);raise RuntimeError('unexpected-route')
   except OSError as e:required(e.errno==101)
 # No EP lookup. Actual libc route for reserved.invalid must be unreachable.
 r=subprocess.run(['getent','ahosts','ep-fixture.invalid'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=5)
 required(r.returncode==2 and not r.stdout and not r.stderr)
 required(os.readlink('/proc/self/ns/net')!=os.readlink('/proc/1/ns/net'))
 return {'namespace':'loopback-only','uidNonroot':True,'capabilitiesZero':True,'nss':'files dns','noInheritedSockets':True}
def stop(p):
 if p is None:return
 if p.poll() is None:p.terminate()
 try:p.wait(timeout=5)
 except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
 required(p.poll() is not None)
def main():
 admission=preflight() # no native store, display or product may precede this line
 artifact=ROOT/'build/linux-x64-normal-read-fixture-private'
 manifest=json.loads((artifact/'PRIVATE-FIXTURE.json').read_text());required(manifest['kind']=='MODIFIED-VALIDATION-ONLY-NOT-RELEASE')
 import hashlib
 required(hashlib.sha256((artifact/'educationperfected').read_bytes()).hexdigest()==manifest['sha256'])
 root=pathlib.Path(tempfile.mkdtemp(prefix='ep-ci-normal-read-'));root.chmod(0o700)
 env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8','HOME':str(root),'TMPDIR':str(root/'tmp'),'XDG_RUNTIME_DIR':str(root/'runtime'),'XDG_CONFIG_HOME':str(root/'config'),'XDG_DATA_HOME':str(root/'data'),'XDG_CACHE_HOME':str(root/'cache')}
 for n in ['tmp','runtime','config','data','cache']:(root/n).mkdir(mode=0o700)
 bus=keyring=display=None;good=False
 try:
  bus=subprocess.Popen(['dbus-daemon','--session','--nofork','--nopidfile','--print-address=1'],env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,close_fds=True)
  import select
  required(select.select([bus.stdout],[],[],5)[0]);address=bus.stdout.readline().strip();required(address.startswith('unix:') and bus.poll() is None);env['DBUS_SESSION_BUS_ADDRESS']=address
  keyring=subprocess.Popen(['gnome-keyring-daemon','--foreground','--unlock','--components=secrets'],env=env,stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,close_fds=True)
  keyring.stdin.write(b'disposable-fixture-session\n');keyring.stdin.close()
  cmd(['gdbus','wait','--session','--timeout','5','org.freedesktop.secrets'],env=env)
  read,write=os.pipe()
  try:
   display=subprocess.Popen(['Xvfb','-displayfd',str(write),'-screen','0','1280x800x24','-nolisten','tcp'],env=env,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,pass_fds=(write,),close_fds=True)
  finally:os.close(write)
  try:
   required(select.select([read],[],[],5)[0]);number=os.read(read,32).decode().strip();required(number.isdecimal());env['DISPLAY']=':'+number
  finally:os.close(read)
  # Preflight checks environment is assembled by this fixed code, never inherited.
  for k in ['EP_TEST_BOOT','EP_EMAIL','EP_PASSWORD','EP_LOGIN_URL','EP_LOGIN_HOST','SSH_AUTH_SOCK','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NODE_OPTIONS']:required(k not in env)
  run=subprocess.run([str(pathlib.Path('/opt/hostedtoolcache/node/22.23.4/x64/bin/node')),str(ROOT/'scripts/normal-read-fixture/run-product.js')],env=env,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=120,close_fds=True)
  required(run.returncode==0 and run.stdout==b'EP_NORMAL_READ_RESULT=pass\n' and run.stderr==b'')
  required(not any((root/'tmp').iterdir()));good=True
 finally:
  cleanup=True
  for p in [display,keyring,bus]:
   try:stop(p)
   except BaseException:cleanup=False
  if good and cleanup:shutil.rmtree(root)
  else:raise RuntimeError('uncertain-owned-state')
 print('EP_NORMAL_READ_RESULT=pass',flush=True)
if __name__=='__main__':
 try:main()
 except BaseException:print('EP_NORMAL_READ_RESULT=fail',flush=True);sys.exit(1)
