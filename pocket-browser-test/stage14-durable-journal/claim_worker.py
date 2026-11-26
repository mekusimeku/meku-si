"""Separate-process Stage 14 race and crash fixture. No network call."""
import json
import os
import sys
from journal import TestOnlyDurableJournal, JournalRefused

if __name__ == '__main__':
    path, principal, request_id = sys.argv[1:4]
    simulated_crash = len(sys.argv) > 4 and sys.argv[4] == 'simulate-crash-after-commit'
    try:
        result = TestOnlyDurableJournal(path, test_only=True).claim_once(principal,request_id)
        print(json.dumps({'result': 'CLAIM_GRANTED', 'state': result['state'], 'claims': result['claims']}), flush=True)
        if simulated_crash:
            os._exit(27) # sqlite COMMIT returned; no network/send ever attempted
    except JournalRefused as error:
        print(json.dumps({'result':'REFUSED', 'code':error.code}), flush=True)
        sys.exit(3)
