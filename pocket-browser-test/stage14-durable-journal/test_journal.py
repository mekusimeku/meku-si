import os
import subprocess
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from journal import TestOnlyDurableJournal, JournalRefused

OWNER='test-authenticated-user-001'
OTHER='test-authenticated-user-002'
REQ='stage14_request_000001'
HASH='a'*64
TXHASH='b'*64
SIGNATURE='2'*88
WORKER=Path(__file__).with_name('claim_worker.py')

class Stage14Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.db=str(Path(self.temp.name)/'journal.db')
        self.j=TestOnlyDurableJournal(self.db,test_only=True)

    def tearDown(self):
        self.temp.cleanup()

    def assertCode(self, code, fn, *args):
        with self.assertRaises(JournalRefused) as c: fn(*args)
        self.assertEqual(c.exception.code, code)

    def prepared(self):
        self.j.open(OWNER,REQ,HASH)
        self.j.arm_test_only(OWNER,REQ,HASH)
        self.j.record_signature_test_only(OWNER,REQ,TXHASH,SIGNATURE)

    def proc(self, *extra):
        return subprocess.run([sys.executable,str(WORKER),self.db,OWNER,REQ,*extra],capture_output=True,text=True)

    def test_01_default_cannot_use_without_test_only_opt_in(self):
        self.assertCode('NO_PRODUCTION_USE',TestOnlyDurableJournal,self.db)

    def test_02_open_idempotent_and_digest_conflict(self):
        a=self.j.open(OWNER,REQ,HASH)
        b=self.j.open(OWNER,REQ,HASH)
        self.assertEqual(a,b)
        self.assertCode('REPLAY_CONFLICT',self.j.open,OWNER,REQ,'b'*64)

    def test_03_owner_bound_key_and_nonleakage(self):
        self.j.open(OWNER,REQ,HASH)
        self.assertCode('UNKNOWN_INTENT',self.j.read,OTHER,REQ)
        self.assertCode('UNKNOWN_INTENT',self.j.claim_once,OTHER,REQ)

    def test_04_invalid_principal_and_request_id_fail_closed(self):
        self.assertCode('INVALID_AUTHENTICATED_PRINCIPAL',self.j.open,'bad user',REQ,HASH)
        self.assertCode('INVALID_REQUEST_ID',self.j.open,OWNER,'x',HASH)
        self.assertCode('INVALID_SHA256',self.j.open,OWNER,REQ,'invalid')

    def test_05_review_digest_mismatch_cannot_arm(self):
        self.j.open(OWNER,REQ,HASH)
        self.assertCode('REVIEW_DIGEST_MISMATCH',self.j.arm_test_only,OWNER,REQ,'c'*64)
        self.assertEqual(self.j.read(OWNER,REQ)['state'],'DRAFT')

    def test_06_cannot_sign_before_review_or_claim_before_signature(self):
        self.j.open(OWNER,REQ,HASH)
        self.assertCode('INVALID_STATE',self.j.record_signature_test_only,OWNER,REQ,TXHASH,SIGNATURE)
        self.assertCode('DO_NOT_RETRY_SUBMISSION',self.j.claim_once,OWNER,REQ)

    def test_07_invalid_signature_shape_refused(self):
        self.j.open(OWNER,REQ,HASH)
        self.j.arm_test_only(OWNER,REQ,HASH)
        self.assertCode('INVALID_SIGNATURE_SHAPE',self.j.record_signature_test_only,OWNER,REQ,TXHASH,'a')
        self.assertCode('INVALID_SIGNATURE_SHAPE',self.j.record_signature_test_only,OWNER,REQ,TXHASH,'0'*88)

    def test_08_signed_record_persists_across_new_instance(self):
        self.prepared()
        fresh=TestOnlyDurableJournal(self.db,test_only=True)
        state=fresh.read(OWNER,REQ)
        self.assertEqual((state['signature'],state['tx_sha256'],state['state']),(SIGNATURE,TXHASH,'SIGNED_RECORDED'))

    def test_09_one_claim_and_no_duplicate(self):
        self.prepared()
        self.assertEqual(self.j.claim_once(OWNER,REQ)['claims'],1)
        self.assertCode('DO_NOT_RETRY_SUBMISSION',self.j.claim_once,OWNER,REQ)
        self.assertEqual(self.j.read(OWNER,REQ)['state'],'CLAIMED_UNKNOWN')

    def test_10_separate_process_competition_exact_one_winner(self):
        self.prepared()
        command=[sys.executable,str(WORKER),self.db,OWNER,REQ]
        ps=[subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(12)]
        outcomes=[]
        for p in ps:
            out,err=p.communicate(timeout=18)
            outcomes.append((p.returncode,out,err))
        self.assertEqual(sum('CLAIM_GRANTED' in o[1] for o in outcomes),1,outcomes)
        self.assertEqual(sum('DO_NOT_RETRY_SUBMISSION' in o[1] for o in outcomes),11,outcomes)
        self.assertEqual(self.j.read(OWNER,REQ)['claims'],1)

    def test_11_crash_after_commit_does_not_reissue_claim(self):
        self.prepared()
        a=self.proc('simulate-crash-after-commit')
        self.assertEqual(a.returncode,27,a.stderr)
        self.assertIn('CLAIM_GRANTED',a.stdout)
        b=self.proc()
        self.assertEqual(b.returncode,3,b.stdout)
        self.assertIn('DO_NOT_RETRY_SUBMISSION',b.stdout)
        self.assertEqual(self.j.read(OWNER,REQ)['state'],'CLAIMED_UNKNOWN')

    def test_12_uncertain_result_stays_review_required_no_retry(self):
        self.prepared(); self.j.claim_once(OWNER,REQ)
        self.assertEqual(self.j.mark_uncertain(OWNER,REQ)['state'],'REVIEW_REQUIRED')
        self.assertCode('DO_NOT_RETRY_SUBMISSION',self.j.claim_once,OWNER,REQ)
        self.assertEqual(self.j.mark_uncertain(OWNER,REQ)['claims'],1)

    def test_13_stop_blocks_open_arm_signature_claim(self):
        self.prepared()
        self.assertEqual(self.j.stop(OWNER),'STOPPED_NEW_CLAIMS_AND_OPEN')
        self.assertCode('STOP_ACTIVE',self.j.claim_once,OWNER,REQ)
        self.assertCode('STOP_ACTIVE',self.j.open,OWNER,'stage14_req_new_001',HASH)
        self.assertCode('STOP_ACTIVE',self.j.record_signature_test_only,OWNER,REQ,TXHASH,SIGNATURE)
        self.assertEqual(self.j.read(OWNER,REQ)['state'],'SIGNED_RECORDED')

    def test_14_stop_cancels_unsigned_records_preserves_others(self):
        self.j.open(OWNER,REQ,HASH)
        self.j.open(OWNER,'stage14_other_request',HASH)
        self.j.arm_test_only(OWNER,'stage14_other_request',HASH)
        self.j.stop(OWNER)
        self.assertEqual(self.j.read(OWNER,REQ)['state'],'CANCELLED')
        self.assertEqual(self.j.read(OWNER,'stage14_other_request')['state'],'CANCELLED')
        self.assertCode('STOP_ACTIVE',self.j.arm_test_only,OWNER,REQ,HASH)

    def test_15_stop_is_scoped_to_owner(self):
        self.j.stop(OWNER)
        self.assertEqual(self.j.open(OTHER,REQ,HASH)['state'],'DRAFT')
        self.assertCode('STOP_ACTIVE',self.j.open,OWNER,REQ,HASH)

    def test_16_stop_does_not_delete_submitted_evidence(self):
        self.prepared(); self.j.claim_once(OWNER,REQ)
        self.j.stop(OWNER)
        a=self.j.read(OWNER,REQ)
        self.assertEqual((a['state'],a['claims'],a['signature']),('CLAIMED_UNKNOWN',1,SIGNATURE))
        self.assertEqual(self.j.mark_uncertain(OWNER,REQ)['state'],'REVIEW_REQUIRED')

    def test_17_duplicate_open_does_not_reset_existing_review(self):
        self.prepared(); self.j.claim_once(OWNER,REQ)
        a=self.j.open(OWNER,REQ,HASH)
        self.assertEqual((a['claims'],a['state']),(1,'CLAIMED_UNKNOWN'))

    def test_18_no_production_rpc_network_or_wallet_key_processing_in_code(self):
        src=Path(__file__).with_name('journal.py').read_text()
        import ast
        tree=ast.parse(src)
        libs={node.names[0].name for node in tree.body if isinstance(node,ast.Import)}
        self.assertFalse(libs & {'requests','urllib','http','socket','solders','solana','web3'})
        self.assertNotIn('def broadcast(',src)

if __name__=='__main__':
    unittest.main(verbosity=2)
