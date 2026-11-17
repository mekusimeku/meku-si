-- MEKU POCKET Stage 15: TEST-ONLY PostgreSQL one-shot submission.
-- Never apply to production. No account authentication, key, signing or RPC.
CREATE SCHEMA pocket_stage15_test_only;
REVOKE ALL ON SCHEMA pocket_stage15_test_only FROM PUBLIC;
CREATE TABLE pocket_stage15_test_only.owner_controls (
 owner_key text PRIMARY KEY CHECK (owner_key ~ '^[A-Za-z0-9:_-]{4,128}$'),
 stopped boolean NOT NULL DEFAULT false
);
CREATE TABLE pocket_stage15_test_only.intents (
 owner_key text NOT NULL REFERENCES pocket_stage15_test_only.owner_controls(owner_key),
 request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{12,100}$'),
 intent_sha256 text NOT NULL CHECK (intent_sha256 ~ '^[0-9a-f]{64}$'),
 tx_sha256 text NOT NULL CHECK (tx_sha256 ~ '^[0-9a-f]{64}$'),
 test_signature text NOT NULL CHECK (length(test_signature) BETWEEN 80 AND 90),
 state text NOT NULL CHECK (state IN ('DRAFT','TEST_ARMED','SIGNED_RECORDED','CLAIMED_UNKNOWN','REVIEW_REQUIRED','CANCELLED')),
 claims smallint NOT NULL DEFAULT 0 CHECK (claims IN (0,1)),
 PRIMARY KEY (owner_key,request_key),
 CHECK ((claims = 1 AND state IN ('CLAIMED_UNKNOWN','REVIEW_REQUIRED')) OR claims = 0)
);
-- Caller-provided owner_key is NOT proof of identity.
CREATE FUNCTION pocket_stage15_test_only.claim_once(p_owner text,p_request text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
DECLARE v_stopped boolean; v_key text;
BEGIN
 IF p_owner IS NULL OR p_request IS NULL THEN
  RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='P0001';
 END IF;
 -- STOP and CLAIM lock the same owner row, then update intent atomically.
 SELECT stopped INTO v_stopped FROM pocket_stage15_test_only.owner_controls
  WHERE owner_key=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_CONTROL_MISSING' USING ERRCODE='P0001'; END IF;
 IF v_stopped THEN RAISE EXCEPTION 'STOP_ACTIVE' USING ERRCODE='P0001'; END IF;
 UPDATE pocket_stage15_test_only.intents SET state='CLAIMED_UNKNOWN',claims=1
 WHERE owner_key=p_owner AND request_key=p_request
 AND state='SIGNED_RECORDED' AND claims=0
 RETURNING request_key INTO v_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'DO_NOT_RETRY' USING ERRCODE='P0001'; END IF;
 RETURN 'CLAIMED_UNKNOWN';
END;
$$;
CREATE FUNCTION pocket_stage15_test_only.stop_owner(p_owner text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE pocket_stage15_test_only.owner_controls SET stopped=true WHERE owner_key=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'OWNER_CONTROL_MISSING' USING ERRCODE='P0001'; END IF;
 UPDATE pocket_stage15_test_only.intents SET state='CANCELLED'
 WHERE owner_key=p_owner AND state IN ('DRAFT','TEST_ARMED');
 RETURN 'STOPPED';
END;
$$;
CREATE FUNCTION pocket_stage15_test_only.mark_unknown(p_owner text,p_request text)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE v_key text;
BEGIN
 UPDATE pocket_stage15_test_only.intents SET state='REVIEW_REQUIRED'
 WHERE owner_key=p_owner AND request_key=p_request
 AND state IN ('CLAIMED_UNKNOWN','REVIEW_REQUIRED') AND claims=1
 RETURNING request_key INTO v_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE='P0001'; END IF;
 RETURN 'REVIEW_REQUIRED';
END;
$$;
REVOKE ALL ON ALL TABLES IN SCHEMA pocket_stage15_test_only FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pocket_stage15_test_only FROM PUBLIC;
