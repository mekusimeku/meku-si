\set ON_ERROR_STOP on
\echo 'Running PostgreSQL Stage 15 smoke checks'
INSERT INTO pocket_stage15_test_only.owner_controls(owner_key) VALUES ('smoke-owner-01'),('smoke-owner-02'),('stopped-owner'),('race-owner-01'),('stop-race-owner');
INSERT INTO pocket_stage15_test_only.intents(owner_key,request_key,intent_sha256,tx_sha256,test_signature,state) VALUES
('smoke-owner-01','smoke-request-01',repeat('a',64),repeat('b',64),repeat('Z',88),'SIGNED_RECORDED'),
('smoke-owner-02','smoke-request-01',repeat('a',64),repeat('b',64),repeat('Z',88),'SIGNED_RECORDED'),
('stopped-owner','stopped-request',repeat('c',64),repeat('d',64),repeat('Y',88),'SIGNED_RECORDED'),
('race-owner-01','race-request-01',repeat('a',64),repeat('b',64),repeat('Z',88),'SIGNED_RECORDED'),
('stop-race-owner','stop-race-request',repeat('a',64),repeat('b',64),repeat('Z',88),'SIGNED_RECORDED');
DO $$
DECLARE value text;
BEGIN
 value := pocket_stage15_test_only.claim_once('smoke-owner-01','smoke-request-01');
 IF value <> 'CLAIMED_UNKNOWN' THEN RAISE EXCEPTION 'claim did not succeed'; END IF;
 BEGIN
  PERFORM pocket_stage15_test_only.claim_once('smoke-owner-01','smoke-request-01');
  RAISE EXCEPTION 'unexpected second claim';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'DO_NOT_RETRY' THEN RAISE; END IF;
 END;
 value := pocket_stage15_test_only.mark_unknown('smoke-owner-01','smoke-request-01');
 IF value <> 'REVIEW_REQUIRED' THEN RAISE EXCEPTION 'review marker missing'; END IF;
 value := pocket_stage15_test_only.claim_once('smoke-owner-02','smoke-request-01');
 IF value <> 'CLAIMED_UNKNOWN' THEN RAISE EXCEPTION 'owner isolation failed'; END IF;
 value := pocket_stage15_test_only.stop_owner('stopped-owner');
 IF value <> 'STOPPED' THEN RAISE EXCEPTION 'STOP did not succeed'; END IF;
 BEGIN
  PERFORM pocket_stage15_test_only.claim_once('stopped-owner','stopped-request');
  RAISE EXCEPTION 'STOP did not deny claim';
 EXCEPTION WHEN SQLSTATE 'P0001' THEN
  IF SQLERRM <> 'STOP_ACTIVE' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM pocket_stage15_test_only.intents WHERE claims=1 AND state='REVIEW_REQUIRED') <> 1
 THEN RAISE EXCEPTION 'review-required mismatch'; END IF;
END;
$$;
\echo 'Stage 15 smoke checks PASS; race fixtures are ready'
