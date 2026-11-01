#!/usr/bin/env python3
"""Inert Win32 transport emulation only; never opens a native API or credential."""
import ctypes as c, importlib.util, pathlib, threading, sys, io, contextlib
from unittest import mock
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('conpty',pathlib.Path(__file__).with_name('windows-conpty.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);m.audit_abi()
last=0
if not hasattr(c,'set_last_error'):
    def set_last_error(value):
        global last
        last=value
    c.set_last_error=set_last_error;c.get_last_error=lambda:last
class API:
    def __init__(self,scenario):self.scenario=scenario;self.next=10;self.closed=[];self.resumed=False;self.writes=[];self.reads=0;self.sent=False;self.ready=threading.Event();self.console_closed=threading.Event();self.assigned=False;self.terminated=False
    def CreatePipe(self,a,b,*args):
        if self.scenario=='pipe-create':return 0
        a._obj.value=self.next;b._obj.value=self.next+1;self.next+=2;return 1
    def CloseHandle(self,h):
        self.closed.append(h.value)
        return 0 if self.scenario=='echo-close-failure' and h.value==33 else 1
    def CreatePseudoConsole(self,*args):args[-1]._obj.value=None if self.scenario=='console-null' else 30;return -1 if self.scenario=='console-create' else 0
    def ClosePseudoConsole(self,h):self.console_closed.set()
    def InitializeProcThreadAttributeList(self,buf,n,flags,size):
        if buf is None:size._obj.value=64;c.set_last_error(122);return 1 if self.scenario=='attribute-size' else 0
        return 0 if self.scenario=='attribute-init' else 1
    def UpdateProcThreadAttribute(self,*args):return 0 if self.scenario=='attribute-console' else 1
    def DeleteProcThreadAttributeList(self,*args):pass
    def CreateJobObjectW(self,*args):return None if self.scenario=='job-create' else 31
    def SetInformationJobObject(self,job,kind,limits,size):assert limits._obj.basic.flags==0x2000;return 0 if self.scenario=='job-limit' else 1
    def CreateProcessW(self,exe,command,a,b,inherit,flags,env,cwd,si,pi):
        assert not inherit and flags==0x80404
        assert command.value.endswith('--setup') and si._obj.cb==112
        assert si._obj.flags & 0x100 and not si._obj.stdin and not si._obj.stdout and not si._obj.stderr
        assert env.value.startswith('HOME=')
        if self.scenario=='process-create':return 0
        pi._obj.process=32;pi._obj.thread=33;return 1
    def AssignProcessToJobObject(self,*args):
        assert 10 in self.closed and 13 in self.closed and not self.resumed
        self.assigned=self.scenario!='assignment';return int(self.assigned)
    def ResumeThread(self,*args):
        assert self.assigned
        if self.scenario=='process-resume':return 0xFFFFFFFF
        self.resumed=True;return 1
    def WaitForSingleObject(self,h,ms):
        if not self.resumed:return 0 if self.terminated else 258
        if ms==30000:
            if self.scenario=='timeout':return 258
            self.ready.wait(2);return 0
        return 258 if self.scenario=='timeout' and not self.terminated else 0
    def TerminateProcess(self,*args):self.terminated=True;return 1
    def TerminateJobObject(self,*args):self.terminated=True;return 1
    def GetExitCodeProcess(self,h,code):code._obj.value=1 if self.scenario=='child-nonzero' else 0;return 1
    def QueryInformationJobObject(self,job,kind,info,size,*args):
        info._obj.active=1 if self.scenario=='job-live' else 0;return 1
    def ReadFile(self,h,buf,size,count,overlap):
        self.reads+=1
        if self.reads==1 and self.scenario=='output-cap':
            chunk=b'x'*4096
            c.memmove(buf,chunk,len(chunk));count._obj.value=len(chunk);self.reads=0;return 1
        if self.reads==1:chunk=b'EP password' if self.scenario=='order' else b'EP emailEP email' if self.scenario=='duplicate' else b'EP email'
        elif self.reads==2:
            if not self.ready.wait(2):raise RuntimeError('inert missing input')
            chunk=b'Login saved in the OS credential store.'+(b'public-answer' if self.scenario in ('echo','echo-close-failure') else b'')
            if self.scenario=='readiness':chunk+=b'\n'
            if self.scenario=='readiness':chunk+=b'CONPTY_CAPABILITY stdinTTY=1 stdoutTTY=0 rawMode=1\r\n'
            if self.scenario=='readiness-lf':chunk+=b'\nCONPTY_CAPABILITY stdinTTY=1 stdoutTTY=0 rawMode=1\n'
            if self.scenario=='prefixed':chunk+=b'\nXCONPTY_CAPABILITY stdinTTY=1 stdoutTTY=1 rawMode=1\n'
            if self.scenario=='trailing':chunk+=b'\nCONPTY_CAPABILITY stdinTTY=1 stdoutTTY=1 rawMode=1 extra=1\n'
            if self.scenario=='malformed':chunk+=b'private-name stdinTTY=1 stdoutTTY=1 rawMode=1'
            if self.scenario=='duplicate-readiness':chunk+=b'\nCONPTY_CAPABILITY stdinTTY=1 stdoutTTY=1 rawMode=1\n'*2
        else:self.console_closed.wait(2);c.set_last_error(109);return 0
        c.memmove(buf,chunk,len(chunk));count._obj.value=len(chunk);return 1
    def WriteFile(self,h,data,size,count,overlap):self.writes.append(data.raw[:size]);count._obj.value=size;self.ready.set();return 1
for scenario in ['success','assignment','console-create','timeout','echo','echo-close-failure','job-live','duplicate','order','pipe-create','attribute-size','attribute-init','attribute-console','job-create','job-limit','process-create','process-resume','output-cap','child-nonzero','console-null']:
    api=API(scenario);clock_values=iter(range(0,6000,6))
    # Only the live-job failure needs an accelerated deadline; others use real time.
    kwargs={'clock':lambda:next(clock_values,6000)} if scenario=='job-live' else {}
    error=None
    try:m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',([(b'EP email',b'public-answer\r'),(b'EP password',b'public-other\r')] if scenario=='order' else [(b'EP email',b'public-answer\r')]),b'Login saved',api=api,**kwargs)
    except BaseException as caught:error=caught
    assert (error is None)==(scenario=='success'),(scenario,type(error))
    if scenario in ['assignment','console-create','pipe-create','attribute-size','attribute-init','attribute-console','job-create','job-limit','process-create','process-resume']:assert not api.resumed and not api.writes
    if scenario in ['pipe-create','attribute-size','attribute-init','attribute-console','job-create','job-limit','process-create','process-resume']:assert str(error)==scenario
    if scenario in ('console-create','console-null'):assert str(error)=='console-create'
    if scenario=='console-null':assert not api.resumed and not api.writes and not api.assigned
    if scenario=='assignment':assert api.terminated
    if scenario=='timeout':assert api.terminated
    if scenario=='job-live':assert isinstance(error,m.ExitUnconfirmed) and str(error)=='job-exit-unconfirmed'
    if scenario=='order':assert str(error)=='console-prompt-order'
    if scenario=='duplicate':assert str(error)=='console-duplicate-prompt'
    if scenario in ('echo','echo-close-failure'):
        assert isinstance(error,m.ExitUnconfirmed) and str(error)=='console-input-echoed'
        assert isinstance(error.__cause__,RuntimeError) and str(error.__cause__)=='console-input-echoed'
    if scenario=='echo-close-failure':assert 33 in api.closed
    if scenario=='output-cap':assert str(error)=='console-output-limit'
    if scenario=='child-nonzero':assert str(error)=='console-child-nonzero'
print('ConPTY inert API/ABI ownership controls: creation/assignment fail closed, timeout, drained echo and job-live retention discriminated. Native Windows pending.')

api=API('success');capture=io.StringIO()
with contextlib.redirect_stdout(capture):
    m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'public-answer\r')],b'Login saved',api=api,capability_diagnostics=True)
assert capture.getvalue()=='ConPTY fixed child capability: stdinTTY=unknown; stdoutTTY=unknown; rawMode=unknown; exit=zero; exitDWORD=0\n'
assert 'public-answer' not in capture.getvalue()
print('ConPTY fixed-only child readiness and nonzero-exit classification controls passed.')

for scenario,wanted in [('readiness','stdinTTY=1; stdoutTTY=0; rawMode=1'),('readiness-lf','stdinTTY=1; stdoutTTY=0; rawMode=1'),('prefixed','stdinTTY=unknown; stdoutTTY=unknown; rawMode=unknown'),('trailing','stdinTTY=unknown; stdoutTTY=unknown; rawMode=unknown'),('malformed','stdinTTY=unknown; stdoutTTY=unknown; rawMode=unknown'),('duplicate-readiness','stdinTTY=unknown; stdoutTTY=unknown; rawMode=unknown')]:
    api=API(scenario);capture=io.StringIO()
    with contextlib.redirect_stdout(capture):
        m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'public-answer\r')],b'Login saved',api=api,capability_diagnostics=True)
    assert wanted in capture.getvalue() and 'private-name' not in capture.getvalue()
print('ConPTY readiness parser: exact fixed marker, malformed/duplicate unknown, no arbitrary drained output.')

for expected in (7,8):
    api=API('success')
    original=api.GetExitCodeProcess
    def get_exit(handle,code):code._obj.value=expected;return 1
    api.GetExitCodeProcess=get_exit
    assert m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'public-answer\r')],b'Login saved',api=api,expected_exit=expected)
    error=None
    try:m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',api=API('child-nonzero'),expected_exit=expected)
    except RuntimeError as caught:error=caught
    assert str(error)=='console-child-nonzero'
print('ConPTY ladder controls: expected exit7/8 accepted only explicitly, other nonzero exits still fail.')

# Empty Enter is not an echoed secret; nonempty input and forbidden ack stay checked.
for scenario in ('cancel','save-marker'):
    api=API('success');original_read=api.ReadFile
    def read_cancel(handle,buffer,size,count,overlap):
        result=original_read(handle,buffer,size,count,overlap)
        if result and api.reads==2:
            text=b'Setup cancelled; no login saved.'
            if scenario=='save-marker':text+=b'Login saved in the OS credential store.'
            c.memmove(buffer,text,len(text));count._obj.value=len(text)
        return result
    api.ReadFile=read_cancel
    error=None
    try:
        m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'\r')],b'Setup cancelled; no login saved.',api=api,forbidden_output=(b'Login saved in the OS credential store.',))
    except BaseException as caught:error=caught
    if scenario=='save-marker':assert str(error)=='console-command-failed'
    else:assert error is None,(scenario,error)
print('ConPTY empty Enter cancellation and forbidden-save acknowledgement controls passed (inert only).')

# Actual transport gate combinations: ETX is a control byte, not a secret; 130
# never becomes a generic accepted exit and neither ack may masquerade as interrupt.
for scenario in ('interrupt','wrong-exit','cancel-ack','save-ack','password-label','secret-echo'):
    api=API('success');original_read=api.ReadFile
    def read_interrupt(handle,buffer,size,count,overlap):
        result=original_read(handle,buffer,size,count,overlap)
        if result and api.reads==2:
            text=b'\x03'
            text+= {'cancel-ack':b'Setup cancelled; no login saved.','save-ack':b'Login saved in the OS credential store.','password-label':b'EP password','secret-echo':b'public-answer\x03'}.get(scenario,b'')
            c.memmove(buffer,text,len(text));count._obj.value=len(text)
        return result
    api.ReadFile=read_interrupt
    def interrupt_exit(handle,code):code._obj.value=0 if scenario=='wrong-exit' else 130;return 1
    api.GetExitCodeProcess=interrupt_exit
    prompts=[(b'EP email',b'\x03')] if scenario!='secret-echo' else [(b'EP email',b'public-answer\x03')]
    error=None
    try:m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',prompts,b'EP email',api=api,expected_exit=130,forbidden_output=(b'Setup cancelled; no login saved.',b'Login saved in the OS credential store.',b'EP password'))
    except BaseException as caught:error=caught
    if scenario=='interrupt':assert error is None,error
    elif scenario=='wrong-exit':assert str(error)=='console-child-nonzero'
    elif scenario=='secret-echo':
        assert isinstance(error,m.ExitUnconfirmed) and str(error)=='console-input-echoed'
    else:assert str(error)=='console-command-failed'
api=API('success')
def exit130(handle,code):code._obj.value=130;return 1
api.GetExitCodeProcess=exit130
error=None
try:m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'public-answer\r')],b'Login saved',api=api)
except BaseException as caught:error=caught
assert str(error)=='console-child-nonzero'
print('Raw ETX input requires child130 only explicitly, no acks/password prompt; default exit0 rejects130 (inert only).')

# Same transport/closure semantics; only the diagnostic driver's outer allotment.
class BudgetAPI(API):
    def __init__(self,budget):
        super().__init__('success');self.budget=budget;self.waits=[]
    def WaitForSingleObject(self,h,ms):
        self.waits.append(ms)
        return super().WaitForSingleObject(h,30000 if ms==self.budget else ms)
for budget in (30000,120000):
    api=BudgetAPI(budget)
    assert m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'public-answer\r')],b'Login saved',api=api,process_budget_ms=budget)
    assert api.waits[0]==budget
    assert api.waits.count(budget)==1
default_api=BudgetAPI(30000)
assert m.run_console('fixed.exe',['--setup'],{'HOME':'owned'},'owned',[(b'EP email',b'public-answer\r')],b'Login saved',api=default_api)
assert default_api.waits[0]==30000 and default_api.waits.count(30000)==1
for invalid in (0,90000,120001,True,'120000',None):
    with mock.patch.object(m,'kernel32',side_effect=AssertionError('Must reject before native allocation')):
        try:m.run_console('fixed.exe',[],{},'owned',process_budget_ms=invalid)
        except RuntimeError as error:assert str(error)=='host-guard'
        else:raise AssertionError('Invalid process budget accepted')
print('ConPTY fixed diagnostic120s vs unchangeddefault30s outer process budget, single wait and invalid-before-allocation controls passed (inert).')
