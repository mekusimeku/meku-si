-- MEKU Pocket Stage 17 — THROWAWAY CI DATABASE ONLY.
-- Never apply as a production migration; fixture passwords and HS256 tokens.
BEGIN;
CREATE SCHEMA pocket_stage17_test_only;
REVOKE ALL ON SCHEMA pocket_stage17_test_only FROM PUBLIC;
CREATE ROLE pocket_stage17_executor NOLOGIN;
CREATE ROLE pocket_stage17_app LOGIN PASSWORD 'stage17_app_fixture_do_not_reuse';

CREATE TABLE pocket_stage17_test_only.owner_controls (
  owner_key text PRIMARY KEY CHECK (owner_key ~ '^[A-Za-z0-9_-]{4,80}$'),
  stopped boolean NOT NULL DEFAULT false
);
CREATE TABLE pocket_stage17_test_only.intents (
  owner_key text NOT NULL REFERENCES pocket_stage17_test_only.owner_controls(owner_key),
  request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{12,100}$'),
  state text NOT NULL CHECK (state IN ('SIGNED_RECORDED','CLAIMED_UNKNOWN','REVIEW_REQUIRED','CANCELLED')),
  claims smallint NOT NULL DEFAULT 0 CHECK (claims IN (0,1)),
  PRIMARY KEY (owner_key,request_key),
  CHECK ((claims=0 AND state IN ('SIGNED_RECORDED','CANCELLED')) OR
         (claims=1 AND state IN ('CLAIMED_UNKNOWN','REVIEW_REQUIRED')))
);

-- This function trusts the application backend's VERIFIED owner binding, NOT
-- an arbitrary public caller. The app DB credential is a high-trust secret.
-- Client/browser must NEVER have that database credential.
CREATE FUNCTION pocket_stage17_test_only.claim_once(p_owner text,p_request text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE stopped_now boolean; updated text;
BEGIN
 IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9_-]{4,80}$' OR
    p_request IS NULL OR p_request !~ '^[A-Za-z0-9_-]{12,100}$' THEN
   RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='P0001';
 END IF;
 SELECT stopped INTO stopped_now FROM pocket_stage17_test_only.owner_controls
  WHERE owner_key=p_owner FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_OWNER' USING ERRCODE='P0001'; END IF;
 IF stopped_now THEN RAISE EXCEPTION 'STOP_ACTIVE' USING ERRCODE='P0001'; END IF;
 UPDATE pocket_stage17_test_only.intents SET state='CLAIMED_UNKNOWN',claims=1
  WHERE owner_key=p_owner AND request_key=p_request AND claims=0 AND state='SIGNED_RECORDED'
  RETURNING request_key INTO updated;
 IF NOT FOUND THEN RAISE EXCEPTION 'DO_NOT_RETRY' USING ERRCODE='P0001'; END IF;
 RETURN 'CLAIMED_UNKNOWN';
END;
$$;
CREATE FUNCTION pocket_stage17_test_only.stop_owner(p_owner text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9_-]{4,80}$' THEN
   RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='P0001'; END IF;
 UPDATE pocket_stage17_test_only.owner_controls SET stopped=true WHERE owner_key=p_owner;
 IF NOT FOUND THEN RAISE EXCEPTION 'UNKNOWN_OWNER' USING ERRCODE='P0001'; END IF;
 UPDATE pocket_stage17_test_only.intents SET state='CANCELLED'
  WHERE owner_key=p_owner AND claims=0 AND state='SIGNED_RECORDED';
 RETURN 'STOPPED';
END;
$$;
CREATE FUNCTION pocket_stage17_test_only.status_owner(p_owner text,p_request text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result text;
BEGIN
 IF p_owner IS NULL OR p_owner !~ '^[A-Za-z0-9_-]{4,80}$' OR
    p_request IS NULL OR p_request !~ '^[A-Za-z0-9_-]{12,100}$' THEN
   RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE='P0001'; END IF;
 SELECT state INTO result FROM pocket_stage17_test_only.intents
   WHERE owner_key=p_owner AND request_key=p_request;
 RETURN COALESCE(result,'NOT_FOUND');
END;
$$;

INSERT INTO pocket_stage17_test_only.owner_controls(owner_key) VALUES ('owner-alice'),('owner-bob');
INSERT INTO pocket_stage17_test_only.intents(owner_key,request_key,state) VALUES
 ('owner-alice','same-request-001','SIGNED_RECORDED'),
 ('owner-bob','same-request-001','SIGNED_RECORDED'),
 ('owner-alice','alice-only-001','SIGNED_RECORDED'),
 ('owner-bob','bob-only-0001','SIGNED_RECORDED'),
 ('owner-alice','stop-me-0000001','SIGNED_RECORDED'),
 ('owner-bob','stop-me-0000001','SIGNED_RECORDED');
GRANT USAGE,CREATE ON SCHEMA pocket_stage17_test_only TO pocket_stage17_executor;
GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA pocket_stage17_test_only TO pocket_stage17_executor;
ALTER FUNCTION pocket_stage17_test_only.claim_once(text,text) OWNER TO pocket_stage17_executor;
ALTER FUNCTION pocket_stage17_test_only.stop_owner(text) OWNER TO pocket_stage17_executor;
ALTER FUNCTION pocket_stage17_test_only.status_owner(text,text) OWNER TO pocket_stage17_executor;
REVOKE ALL ON ALL TABLES IN SCHEMA pocket_stage17_test_only FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA pocket_stage17_test_only FROM PUBLIC;
GRANT USAGE ON SCHEMA pocket_stage17_test_only TO pocket_stage17_app;
GRANT EXECUTE ON FUNCTION pocket_stage17_test_only.claim_once(text,text) TO pocket_stage17_app;
GRANT EXECUTE ON FUNCTION pocket_stage17_test_only.stop_owner(text) TO pocket_stage17_app;
GRANT EXECUTE ON FUNCTION pocket_stage17_test_only.status_owner(text,text) TO pocket_stage17_app;
COMMIT;
