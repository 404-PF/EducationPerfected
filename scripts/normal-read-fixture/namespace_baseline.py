"""Fixed bootstrap-to-preflight network identity handoff, never a namespace FD."""
import os,fcntl,stat
NAME='ep-outer-net'
SEALS=fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL
LIMIT=40
class BaselineRefused(Exception):pass
def identity(value):
 if not isinstance(value,bytes) or not (7<len(value)<=LIMIT) or not value.startswith(b'net:[') or not value.endswith(b']'):raise BaselineRefused()
 number=value[5:-1]
 if not number or number[:1]==b'0' or any(c<48 or c>57 for c in number):raise BaselineRefused()
 return value

def create():
 value=identity(os.readlink('/proc/self/ns/net').encode('ascii'))
 fd=os.memfd_create(NAME,os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
 try:
  if os.write(fd,value)!=len(value):raise BaselineRefused()
  os.fchmod(fd,0o400);fcntl.fcntl(fd,fcntl.F_ADD_SEALS,SEALS);os.lseek(fd,0,os.SEEK_SET)
  return fd
 except BaseException:os.close(fd);raise

def consume():
 st=os.fstat(0)
 if not stat.S_ISREG(st.st_mode) or stat.S_IMODE(st.st_mode)!=0o400 or st.st_uid!=os.getuid() or st.st_nlink!=0 or not (7<st.st_size<=LIMIT):raise BaselineRefused()
 if os.readlink('/proc/self/fd/0')!='/memfd:'+NAME+' (deleted)' or fcntl.fcntl(0,fcntl.F_GET_SEALS)!=SEALS or os.lseek(0,0,os.SEEK_CUR)!=0:raise BaselineRefused()
 value=os.read(0,LIMIT+1)
 if len(value)!=st.st_size or os.read(0,1):raise BaselineRefused()
 value=identity(value)
 # Close the data channel before inherited-FD admission or any child work.
 null=os.open('/dev/null',os.O_RDONLY|os.O_CLOEXEC)
 try:os.dup2(null,0,inheritable=True)
 finally:os.close(null)
 return value
