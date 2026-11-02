import importlib.util,pathlib,json,unittest
s=importlib.util.spec_from_file_location('p',pathlib.Path(__file__).with_name('windows-owned-pipe-protocol.py'));p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
class Tests(unittest.TestCase):
 def test_wire(self):
  nonce='a'*64;identity={'length':123,'sha256':'b'*64,'browserVersion':'156.0.8078.47'}
  for mode in ('source','sea'):
   lines=[b'EP_DIAGNOSTIC_DRIVER_STAGE='+json.dumps({'nonce':nonce,'mode':mode,'stage':x},separators=(',',':')).encode() for x in p.STAGES if mode=='source' or x not in ('unpack-entered','unpacked')]
   last=b'EP_OWNED_PIPE_SUCCESS='+json.dumps({'nonce':nonce,'mode':mode,'identity':identity,'ready':True,'owned':True,'cleanupCertain':True},separators=(',',':')).encode()
   data=b'\n'.join(lines+[last])+b'\n';self.assertTrue(p.validate(data,0,mode,nonce,identity))
   bad=[data[:-1],data+b'\n',b'\x1b[0m'+data,data.replace(b'\n',b'\r\n'),data+last+b'\n',b'\n'.join(lines[::-1]+[last])+b'\n',data.replace(nonce.encode(),b'c'*64,1),data.replace(b'"owned":true',b'"owned":false'),data.replace(b'"length":123',b'"length":124'),data.replace(b'EP_OWNED_PIPE_SUCCESS=',b'OLD_DONE='),data.replace(b'"stage":"host-checked"',b'"stage":"unknown"'),data+b'x'*65536,data.replace(b'"owned":true',b'"owned":1'),data.replace(b'"nonce":',b'"nonce":"duplicate","nonce":',1),data.replace(b'"ready":true',b'"extra":true,"ready":true')]
   for wire in bad:
    with self.assertRaises((ValueError,AssertionError,KeyError,TypeError)):p.validate(wire,0,mode,nonce,identity)
   with self.assertRaises(ValueError):p.validate(data,1,mode,nonce,identity)
if __name__=='__main__':unittest.main()
