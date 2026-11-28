#!/usr/bin/env python3
"""Independent reference for the MEKU proof-of-work ledger digest (meku.pow/1).

A second implementation, in another language and with only the Python standard library,
of the two things an outside verifier most needs to trust: which comments count as
records, and the rolling SHA-256 digest over them. It deliberately shares no code with
tools/pow/verify.mjs and follows the written rules in docs/proof-of-work/records.md.
If both print the same digest for a bundle, the rules are implemented consistently.
It does not perform verify.mjs's other checks.

Usage: python3 -I tools/pow/digest_reference.py <bundle.json> [--expect-operator mekusimeku] [--skip id,id]

It does not check records against the schema. When verify.mjs lists records it did not count
because they are invalid, pass those comments' ids with --skip; the digests must then agree.
"""
import hashlib
import json
import re
import sys
from datetime import datetime

PROTOCOL = "meku.pow/1"
MAX_SAFE = 2**53 - 1


def reject_float(text):
    raise ValueError("records may not contain fractional or exponent numbers")


def bounded_int(text):
    value = int(text)
    if abs(value) > MAX_SAFE:
        raise ValueError("integer outside the safe range")
    return value


def parse(text):
    return json.loads(text, parse_float=reject_float, parse_int=bounded_int, parse_constant=reject_float)


def jcs(value):
    """RFC 8785 for null, booleans, integers, strings, arrays and objects (no floats)."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


JSON_WHITESPACE = " \t\n\r"
ATTACHMENT = (
    r"https://(?:github\.com/user-attachments/assets/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
    r"|user-images\.githubusercontent\.com/[0-9]{1,12}/[A-Za-z0-9._-]{1,200})"
)
# ASCII only, like the JavaScript verifier: Python's \d, \b and re.I would otherwise match
# other scripts' digits and letters.
A = re.ASCII
HEADER_LINE = re.compile(
    r"MEKU proof-of-work record: (?:seq [0-9]{1,4} )?[a-z_]{1,40} \(POW-[A-Z0-9-]{1,40}\)"
    r"(?: - write ([0-9A-HJKMNP-TV-Z]{10}) and put an? ([A-Z]{2,5}) next to it)?",
    A,
)
IMAGE_AT_START = re.compile(r"(?:!\[[^\]\n]{0,200}\]\([^)\s]{1,300}\)|<[iI][mM][gG](?![A-Za-z0-9_])[^<>\n]{0,1000}>)", A)
IMAGE_AT_END = re.compile(r"(?:!\[[^\]\n]{0,200}\]\([^)\s]{1,300}\)|<[iI][mM][gG](?![A-Za-z0-9_])[^<>\n]{0,1000}>)\Z", A)
ATTACHMENT_ONLY = re.compile(ATTACHMENT, A | re.I)


def attachment_image(markup):
    """The attachment URL of one image in GitHub's own upload markup, or None."""
    url = None
    md = re.fullmatch(r"!\[([^\]\n<>`]{0,200})\]\(([^)\s]{1,300})\)", markup, A)
    if md:
        url = md.group(2)
    else:
        tag = re.fullmatch(r"<img((?:[ ]+[a-zA-Z]{1,10}=\"[^\"<>`\n]{0,300}\")+)[ ]*/?>", markup, A | re.I)
        if not tag:
            return None
        attrs = {}
        for name, value in re.findall(r"[ ]+([a-zA-Z]{1,10})=\"([^\"]*)\"", tag.group(1), A):
            key = name.lower()
            if key in attrs or key not in ("width", "height", "alt", "src"):
                return None
            if key in ("width", "height") and not re.fullmatch(r"[0-9]{1,5}", value, A):
                return None
            attrs[key] = value
        url = attrs.get("src")
    return url if url and ATTACHMENT_ONLY.fullmatch(url) else None


def is_record(value):
    return isinstance(value, dict) and value.get("pow") == PROTOCOL


def read_record_comment(body):
    """The same strict grammar as the JavaScript verifier: None (no attempt), "problem", or
    the record. A comment counts only when it is exactly one record, in a form the tools print
    or a person pastes, with at most one GitHub image beside an evidence record."""
    if PROTOCOL not in body and not re.search(r"```json", body, A | re.I):
        return None
    text = body.replace("\r\n", "\n").replace("\r", "\n").strip(JSON_WHITESPACE)
    image = None
    match = IMAGE_AT_START.match(text)
    if match:
        image = attachment_image(match.group(0))
        if not image:
            return "problem"
        text = text[match.end() :].strip(JSON_WHITESPACE)
    if image is None:
        match = IMAGE_AT_END.search(text)
        if match:
            image = attachment_image(match.group(0))
            if not image:
                return "problem"
            text = text[: match.start()].strip(JSON_WHITESPACE)
    lines = text.split("\n")
    header = HEADER_LINE.fullmatch(lines[0])
    if header:
        text = "\n".join(lines[1:]).strip(JSON_WHITESPACE)
    if text.startswith("```"):
        block = text.split("\n")
        if len(block) < 3 or not re.fullmatch(r"```json[ \t]*", block[0], A) or not re.fullmatch(r"```[ \t]*", block[-1], A):
            return "problem"
        source = "\n".join(block[1:-1])
    elif text.startswith("{") and text.endswith("}"):
        if "<" in text:
            return "problem"
        source = text
    else:
        return "problem"
    try:
        record = parse(source)
    except (ValueError, RecursionError):
        return "problem"
    if not is_record(record):
        return "problem"
    if image and record.get("type") != "evidence_submitted":
        return "problem"
    if not image and record.get("type") == "evidence_submitted":
        return "problem"
    if header and header.group(1):
        if record.get("type") != "object_revealed" or header.group(1)[8:] != record.get("suffix") or header.group(2) != record.get("object"):
            return "problem"
    return (record, image)


def is_seq(value, n):
    return type(value) is int and value == n


NEXT = {
    "pilot_opened": ["developer_ready", "stop"],
    "developer_ready": ["request_submitted", "stop"],
    "request_submitted": ["request_reviewed", "stop"],
    "request_status_observed": ["task_offered", "stop"],
    "task_offered": ["human_consent", "stop"],
    "human_consent": ["object_revealed", "stop"],
    "object_revealed": ["evidence_submitted", "stop"],
    "evidence_submitted": ["result_returned", "stop"],
    "result_returned": ["requester_decision", "stop"],
    "requester_decision": ["pilot_closed", "stop"],
    "stop": ["pilot_closed"],
}


def allowed_next(previous, closed, stopped):
    """The record types that may come next, as records.md describes the order."""
    if previous is None:
        return ["pilot_opened"]
    if closed:
        return ["stop"] if previous.get("type") == "pilot_closed" and not stopped else []
    if previous.get("type") == "request_reviewed":
        return ["pilot_closed"] if previous.get("decision") == "rejected" else ["request_status_observed", "stop"]
    return NEXT.get(previous.get("type"), [])


def when(comment):
    return datetime.fromisoformat(comment["created_at"].replace("Z", "+00:00"))


def without_seq(record):
    return jcs({**record, "seq": None})


def same(a, b):
    return isinstance(a, str) and isinstance(b, str) and a.lower() == b.lower()


def main(path, expect_operator, skip):
    with open(path, encoding="utf-8") as handle:
        bundle = json.load(handle)
    comments = sorted(bundle["comments"], key=lambda c: (when(c), str(c["id"])))
    entries = []
    for c in comments:
        read = read_record_comment(c["body"] if isinstance(c["body"], str) else "")
        entries.append((c, read if isinstance(read, tuple) and str(c["id"]) not in skip else None))
    openings = [(c, r[0]) for c, r in entries if r and r[0].get("type") == "pilot_opened" and is_seq(r[0].get("seq"), 0)]
    preferred = [e for e in openings if same(e[0]["author"], expect_operator) and same((e[1].get("roster") or {}).get("operator"), expect_operator)]
    synthetic = [e for e in openings if str(e[1].get("pilot_id", "")).startswith("POW-SYNTHETIC-")]
    if not (preferred or synthetic or openings):
        raise SystemExit("no pilot_opened record; run verify.mjs for details")
    opening_comment, opening = (preferred or synthetic or openings)[0]
    roster = opening.get("roster") or {}
    operator, developer = roster.get("operator"), roster.get("developer")
    human = next(
        (r[0].get("human") for c, r in entries if r and r[0].get("type") == "task_offered" and r[0].get("pilot_id") == opening.get("pilot_id") and same(c["author"], operator)),
        None,
    )
    roles = {"operator": operator, "developer": developer, "human": human}
    chain = []  # (comment, record, image)
    statements = {}  # (type, role) -> the record posted in its turn that states what this kind says
    contradictions = []
    for c, read in entries:
        role = next((name for name, login in roles.items() if same(c["author"], login)), None)
        if role is None or read is None:
            continue
        record, image = read
        if record.get("type") == "independent_verification":
            continue
        if record.get("type") == "pilot_opened" and c is not opening_comment:
            continue
        if record.get("role") != role:
            continue  # a record in another participant's role is not counted
        # Each kind of record is posted once: once one was posted in its turn, a later one of the
        # same kind must say the same, apart from its seq. Any stop is a stop. The digest covers
        # records, not images, so a second screenshot (which verify.mjs fails) cannot change it.
        kind = (record.get("type"), role)
        statement = statements.get(kind)
        if record.get("type") != "stop" and statement is not None and without_seq(statement) != without_seq(record):
            contradictions.append(str(c["id"]))
            continue  # contradicts the record of its kind (verify.mjs fails the ledger)
        if any(r.get("type") == record.get("type") and same(old["author"], c["author"]) and (record.get("type") != "stop" or without_seq(r) == without_seq(record)) for old, r, _ in chain):
            continue  # posted again, perhaps with its seq corrected: the counted one stands
        last = chain[-1] if chain else None
        closed = any(r.get("type") == "pilot_closed" for _, r, _ in chain)
        stopped = any(r.get("type") == "stop" for _, r, _ in chain)
        allowed = allowed_next(last[1] if last else None, closed, stopped)
        lenient = record.get("type") in ("stop", "pilot_closed")
        if record.get("type") not in allowed:
            continue  # before its turn: not counted, and it states nothing
        if record.get("type") != "stop":
            statements.setdefault(kind, record)
        if not is_seq(record.get("seq"), len(chain)) and not lenient:
            continue  # its turn but the wrong seq: not counted, yet it states what its kind says
        chain.append((c, record, image))
    digest = sha256_hex(f"{PROTOCOL}|{opening['pilot_id']}")
    for _, record, _ in chain:
        # A lone surrogate cannot be encoded; the wrapper below reports it, as JavaScript refuses it.
        digest = sha256_hex(f"{digest}|{sha256_hex(jcs(record))}")
    print(f"{digest} (through seq {len(chain) - 1}; {len(chain)} records)")
    if contradictions:
        print(f"comments {','.join(contradictions)} contradict an earlier record of the same kind; verify.mjs fails this ledger", file=sys.stderr)


if __name__ == "__main__":
    args = sys.argv[1:]
    operator = "mekusimeku"
    if "--expect-operator" in args:
        i = args.index("--expect-operator")
        operator = args[i + 1]
        del args[i : i + 2]
    skip = set()
    if "--skip" in args:
        i = args.index("--skip")
        skip = {part.strip() for part in args[i + 1].split(",") if part.strip()}
        del args[i : i + 2]
    if len(args) != 1:
        raise SystemExit(__doc__)
    try:
        main(args[0], operator, skip)
    except SystemExit:
        raise
    except Exception as error:  # hostile input gets a message, never a traceback
        raise SystemExit(f"cannot read this bundle ({type(error).__name__}); run verify.mjs for details")
