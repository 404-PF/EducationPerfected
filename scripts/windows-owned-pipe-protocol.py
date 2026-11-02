"""Closed byte protocol; no whitespace, VT or prefix salvage."""
import json,re
def unique(pairs):
    value={}
    for key,item in pairs:
        if key in value:raise ValueError('duplicate')
        value[key]=item
    return value
def parse(data):return json.loads(data,object_pairs_hook=unique)
def check(value):
    if not value:raise ValueError('protocol')
STAGES=('cli-entry','host-checked','leg-root-checked','archive-check-entered','archive-verified','unpack-entered','unpacked','spawn-entered','spawn-returned','ready-observed','owner-closed','leg-complete')
def validate(data,code,mode,nonce,identity):
    if code!=0 or mode not in ('source','sea') or not re.fullmatch('[a-f0-9]{64}',nonce) or len(data)>65536:raise ValueError('protocol')
    # Node console.log on an ordinary Windows pipe emits LF. Do not normalize CR.
    if not data.endswith(b'\n') or b'\r' in data or not data.isascii():raise ValueError('protocol')
    lines=data[:-1].split(b'\n');stages=[];receipt=None
    for index,line in enumerate(lines):
        if line.startswith(b'EP_DIAGNOSTIC_DRIVER_STAGE='):
            value=parse(line.split(b'=',1)[1]);check(set(value)=={'nonce','mode','stage'})
            check(value['nonce']==nonce and value['mode']==mode)
            stages.append(value['stage'])
        elif line.startswith(b'EP_OWNED_PIPE_SUCCESS='):
            check(index==len(lines)-1 and receipt is None)
            receipt=parse(line.split(b'=',1)[1])
        else:raise ValueError('protocol')
    check(stages==[x for x in STAGES if mode=='source' or x not in ('unpack-entered','unpacked')])
    check(isinstance(receipt,dict) and all(receipt.get(k) is True for k in ('ready','owned','cleanupCertain')))
    check(type(receipt.get('identity',{}).get('length')) is int)
    check(json.dumps(receipt,sort_keys=True)==json.dumps({'nonce':nonce,'mode':mode,'identity':identity,'ready':True,'owned':True,'cleanupCertain':True},sort_keys=True))
    return True
