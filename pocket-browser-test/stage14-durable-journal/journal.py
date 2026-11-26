"""MEKU POCKET Stage 14: isolated, TEST-ONLY durable one-shot claim simulator.

No network or chain operations. No account auth, transaction/signature verification,
keys, payment signing, broadcasting, production migrations, or Pocket integration.

The `principal` value MUST be supplied by a future independently authenticated
server boundary; this test-only module cannot authenticate it. `arm_test_only`
is NOT a human approval/signature validator. These deliberately conspicuous
names prevent confusing this exercise with a production payment system.
"""
from __future__ import annotations

from contextlib import contextmanager, closing
from pathlib import Path
import re
import sqlite3

_ID = re.compile(r"[A-Za-z0-9_-]{12,100}\Z")
_OWNER = re.compile(r"[A-Za-z0-9:_-]{4,128}\Z")
_HASH = re.compile(r"[a-f0-9]{64}\Z")
_BASE58 = set("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz")

class JournalRefused(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def _guard_principal(principal):
    if not isinstance(principal, str) or not _OWNER.fullmatch(principal):
        raise JournalRefused('INVALID_AUTHENTICATED_PRINCIPAL')

def _guard_request(request_id):
    if not isinstance(request_id, str) or not _ID.fullmatch(request_id):
        raise JournalRefused('INVALID_REQUEST_ID')

def _guard_digest(digest):
    if not isinstance(digest, str) or not _HASH.fullmatch(digest):
        raise JournalRefused('INVALID_SHA256')

def _guard_signature(signature):
    if not isinstance(signature, str) or not (80 <= len(signature) <= 90) or not all(c in _BASE58 for c in signature):
        raise JournalRefused('INVALID_SIGNATURE_SHAPE')

class TestOnlyDurableJournal:
    def __init__(self, db_path, *, test_only=False):
        if test_only is not True:
            raise JournalRefused('NO_PRODUCTION_USE')
        self.path = str(Path(db_path))
        self._init_db()

    def _connect(self):
        con = sqlite3.connect(self.path, timeout=8.0, isolation_level=None)
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA busy_timeout=8000')
        con.execute('PRAGMA synchronous=FULL')
        return con

    def _init_db(self):
        with closing(self._connect()) as con:
            con.execute('PRAGMA journal_mode=WAL')
            con.executescript('''
              CREATE TABLE IF NOT EXISTS owner_stop (
                principal TEXT PRIMARY KEY NOT NULL, stopped INTEGER NOT NULL DEFAULT 0 CHECK(stopped IN (0,1))
              );
              CREATE TABLE IF NOT EXISTS intents (
                principal TEXT NOT NULL,
                request_id TEXT NOT NULL,
                intent_sha256 TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('DRAFT','TEST_ARMED','SIGNED_RECORDED','CLAIMED_UNKNOWN','REVIEW_REQUIRED','CANCELLED')),
                tx_sha256 TEXT,
                signature TEXT,
                claims INTEGER NOT NULL DEFAULT 0 CHECK(claims IN (0,1)),
                PRIMARY KEY(principal, request_id)
              );
            ''')

    @contextmanager
    def _write(self):
        con = self._connect()
        try:
            con.execute('BEGIN IMMEDIATE')
            yield con
            con.execute('COMMIT')
        except BaseException:
            if con.in_transaction:
                con.execute('ROLLBACK')
            raise
        finally:
            con.close()

    def _stop_active(self, con, principal):
        row = con.execute('SELECT stopped FROM owner_stop WHERE principal=?', (principal,)).fetchone()
        if row and row['stopped']:
            raise JournalRefused('STOP_ACTIVE')

    def _get(self, con, principal, request_id):
        r = con.execute('SELECT * FROM intents WHERE principal=? AND request_id=?', (principal, request_id)).fetchone()
        if r is None:
            raise JournalRefused('UNKNOWN_INTENT')
        return r

    @staticmethod
    def _safe(row):
        # Public test record: contains NO mnemonic, signing key or wallet password.
        return {k: row[k] for k in ('principal','request_id','intent_sha256','state','tx_sha256','signature','claims')}

    def open(self, principal, request_id, intent_sha256):
        _guard_principal(principal); _guard_request(request_id); _guard_digest(intent_sha256)
        with self._write() as con:
            self._stop_active(con, principal)
            old = con.execute('SELECT * FROM intents WHERE principal=? AND request_id=?', (principal, request_id)).fetchone()
            if old is not None:
                if old['intent_sha256'] != intent_sha256:
                    raise JournalRefused('REPLAY_CONFLICT')
                return self._safe(old)
            con.execute('INSERT INTO intents(principal,request_id,intent_sha256,state) VALUES(?,?,?,?)',
                        (principal,request_id,intent_sha256,'DRAFT'))
            return self._safe(self._get(con,principal,request_id))

    def arm_test_only(self, principal, request_id, reviewed_digest):
        """Simulates an external human review; does NOT prove human approval."""
        _guard_principal(principal); _guard_request(request_id); _guard_digest(reviewed_digest)
        with self._write() as con:
            self._stop_active(con, principal)
            row = self._get(con,principal,request_id)
            if row['state'] != 'DRAFT': raise JournalRefused('INVALID_STATE')
            if row['intent_sha256'] != reviewed_digest: raise JournalRefused('REVIEW_DIGEST_MISMATCH')
            con.execute('UPDATE intents SET state=? WHERE principal=? AND request_id=?', ('TEST_ARMED',principal,request_id))
            return self._safe(self._get(con,principal,request_id))

    def record_signature_test_only(self, principal, request_id, tx_sha256, signature):
        """Stores a *shape-only* dummy signature before a hypothetical broadcast."""
        _guard_principal(principal); _guard_request(request_id); _guard_digest(tx_sha256); _guard_signature(signature)
        with self._write() as con:
            self._stop_active(con, principal)
            row = self._get(con,principal,request_id)
            if row['state'] != 'TEST_ARMED': raise JournalRefused('INVALID_STATE')
            con.execute('UPDATE intents SET state=?,tx_sha256=?,signature=? WHERE principal=? AND request_id=?',
                        ('SIGNED_RECORDED',tx_sha256,signature,principal,request_id))
            return self._safe(self._get(con,principal,request_id))

    def claim_once(self, principal, request_id):
        """Returns ONE durable local claim; never calls a network provider."""
        _guard_principal(principal); _guard_request(request_id)
        with self._write() as con:
            self._stop_active(con, principal)
            row = self._get(con,principal,request_id)
            if row['state'] != 'SIGNED_RECORDED' or row['claims'] != 0 or not row['signature'] or not row['tx_sha256']:
                raise JournalRefused('DO_NOT_RETRY_SUBMISSION')
            con.execute('UPDATE intents SET state=?,claims=1 WHERE principal=? AND request_id=?',
                        ('CLAIMED_UNKNOWN',principal,request_id))
            return self._safe(self._get(con,principal,request_id))

    def mark_uncertain(self, principal, request_id):
        """Records that an unknown RPC/worker result MUST require manual review."""
        _guard_principal(principal); _guard_request(request_id)
        with self._write() as con:
            row = self._get(con,principal,request_id)
            if row['state'] not in ('CLAIMED_UNKNOWN','REVIEW_REQUIRED'):
                raise JournalRefused('INVALID_STATE')
            con.execute('UPDATE intents SET state=? WHERE principal=? AND request_id=?',
                        ('REVIEW_REQUIRED',principal,request_id))
            return self._safe(self._get(con,principal,request_id))

    def stop(self, principal):
        _guard_principal(principal)
        with self._write() as con:
            con.execute('INSERT INTO owner_stop(principal,stopped) VALUES(?,1) ON CONFLICT(principal) DO UPDATE SET stopped=1', (principal,))
            # Never delete signatures or claimed records: evidence must survive STOP.
            con.execute('UPDATE intents SET state=? WHERE principal=? AND state IN (\'DRAFT\',\'TEST_ARMED\')',
                        ('CANCELLED',principal))
            return 'STOPPED_NEW_CLAIMS_AND_OPEN'

    def read(self, principal, request_id):
        _guard_principal(principal); _guard_request(request_id)
        with closing(self._connect()) as con:
            return self._safe(self._get(con,principal,request_id))
