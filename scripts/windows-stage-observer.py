"""Legacy presentation observation only, never completion or filesystem authority."""
import json,re
DRIVER_STAGES=('cli-entry','cli-root-checked','host-checked','leg-root-checked','archive-check-entered','archive-verified','unpack-entered','unpacked','spawn-entered','spawn-returned','ready-observed','owner-closed','leg-complete')
def observed_driver_stage(data,mode,nonce):
    if mode not in ('source','sea') or not re.fullmatch('[a-f0-9]{64}',nonce):return 'unknown'
    expected=[stage for stage in DRIVER_STAGES if mode=='source' or stage not in ('unpack-entered','unpacked')]
    lines=[line for line in data.splitlines() if b'EP_DIAGNOSTIC_DRIVER_STAGE=' in line]
    if not lines:return 'unknown'
    try:
        values=[json.loads(line.decode('ascii').removeprefix('EP_DIAGNOSTIC_DRIVER_STAGE=')) for line in lines]
        if any(set(value)!=set(('nonce','mode','stage')) or value['nonce']!=nonce or value['mode']!=mode for value in values):return 'unknown'
        stages=[value['stage'] for value in values]
        return stages[-1] if stages==expected[:len(stages)] else 'unknown'
    except (ValueError,TypeError,KeyError,UnicodeError):return 'unknown'
