"""Inert transport lifecycle tests, no Windows or browser execution."""
import ctypes as c,importlib.util,pathlib,unittest
s=importlib.util.spec_from_file_location('p',pathlib.Path(__file__).with_name('windows-owned-pipe.py'));m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
last=0
if not hasattr(c,'set_last_error'):
 def set_last_error(v):
  global last;last=v
 c.set_last_error=set_last_error;c.get_last_error=lambda:last
class API:
 def __init__(self,failure=''):self.failure=failure;self.next=10;self.closed=[];self.resumed=False;self.assigned=False;self.killed=False;self.read=False;self.sent=0
 def CreatePipe(self,a,b,*_):
  if self.failure=='pipe':return 0
  a._obj.value=self.next;b._obj.value=self.next+1;self.next+=2;return 1
 def CloseHandle(self,h):self.closed.append(h.value);return self.failure!='close'
 def SetHandleInformation(self,h,a,b):assert h.value in (11,12) and (a,b)==(1,0);return self.failure!='inherit'
 def InitializeProcThreadAttributeList(self,b,n,f,size):
  if b is None:size._obj.value=64;c.set_last_error(122);return 0
  return self.failure!='attributes'
 def UpdateProcThreadAttribute(self,a,b,kind,values,size,*_):assert kind==0x20002 and list(values)==[10,13];return 1
 def DeleteProcThreadAttributeList(self,*_):pass
 def CreateJobObjectW(self,*_):return 20
 def SetInformationJobObject(self,j,kind,limits,size):assert limits._obj.basic.flags==0x2000;return self.failure!='job'
 def CreateProcessW(self,exe,cmd,a,b,inherit,flags,env,cwd,si,pi):
  assert inherit and flags==0x8080404 and si._obj.stdin==10 and si._obj.stdout==13 and si._obj.stderr==13 and 11 in self.closed
  if self.failure=='create':return 0
  pi._obj.process=21;pi._obj.thread=22;return 1
 def AssignProcessToJobObject(self,*_):assert not self.resumed and 10 in self.closed and 13 in self.closed;self.assigned=self.failure!='assign';return self.assigned
 def ResumeThread(self,*_):assert self.assigned;self.resumed=self.failure!='resume';return 1 if self.resumed else 0xFFFFFFFF
 def WaitForSingleObject(self,h,timeout):return 0 if self.killed or (self.resumed and self.failure!='timeout') else 258
 def GetExitCodeProcess(self,h,n):n._obj.value=0;return self.failure!='exit'
 def QueryInformationJobObject(self,j,kind,info,*_):info._obj.active=1 if self.failure=='job-zero' else 0;return 1
 def TerminateProcess(self,*_):self.killed=True;return 1
 def TerminateJobObject(self,*_):self.killed=True;return 1
 def PeekNamedPipe(self,h,b,n,read,available,remaining):
  if self.failure=='read':c.set_last_error(5);return 0
  if self.failure=='eof':available._obj.value=0;return 1
  if self.sent and self.failure!='output-limit':c.set_last_error(109);return 0
  available._obj.value=4096 if self.failure=='output-limit' else 3;return 1
 def ReadFile(self,h,b,n,count,_):data=b'x'*n;c.memmove(b,data,n);count._obj.value=n;self.sent+=1;return 1
class Test(unittest.TestCase):
 def test_lifecycle(self):
  for failure in ('','pipe','inherit','attributes','job','create','assign','resume','read','timeout','exit','job-zero','eof','close','output-limit'):
   api=API(failure);tick=iter(range(0,10000));kw={'clock':lambda:next(tick),'sleep':lambda n:None,'api':api}
   if failure:
    with self.assertRaises(m.Uncertain):m.run('node.exe',['fixed'],{'SYSTEMROOT':'fixed'},'fixed',**kw)
   else:self.assertEqual(m.run('node.exe',['fixed'],{'SYSTEMROOT':'fixed'},'fixed',**kw),(b'xxx',0))
   if failure in ('pipe','inherit','attributes','job','create','assign'):self.assertFalse(api.resumed)
   if failure=='assign':self.assertTrue(api.killed)
if __name__=='__main__':unittest.main()
