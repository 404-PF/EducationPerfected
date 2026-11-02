"""Only fixed child for sandbox-inheritance capability observation."""
import sys
from probe import child
try:child()
except BaseException:print('EP_MAC_CAPABILITY_CHILD=fail',flush=True);sys.exit(1)
