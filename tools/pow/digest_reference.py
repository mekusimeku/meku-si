#!/usr/bin/env python3
"""Independent reference for the MEKU proof-of-work ledger digest (meku.pow/1).

A second implementation, in another language and with only the Python standard library,
of the two things an outside verifier most needs to trust: which comments count as
records, and the rolling SHA-256 digest over them. It deliberately shares no code with
tools/pow/verify.mjs and follows the written rules in docs/proof-of-work/records.md.
If both print the same digest for a bundle, the rules are implemented consistently.
It does not perform verify.mjs's other checks.

Usage: python3 -I tools/pow/digest_reference.py <bundle.json> [--expect-operator mekusimeku]
"""
import hashlib
import json
import re
import sys
from datetime import datetime

PROTOCOL = "meku.pow/1"
FENCE = re.compile(r"```json[^\n]*\n(.*?)```", re.S)
HTML_COMMENT = re.compile(r"<!--.*?(?:-->|\Z)", re.S)
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


FENCE_OPEN = re.compile(r"^ {0,3}(`{3,}|~{3,})")
FENCE_CLOSE = re.compile(r"^ {0,3}(`{3,}|~{3,})[ \t]*$")
IMAGE_MARKUP = re.compile(r"<img\b[^>]*>|!\[[^\]]*\]\([^)]*\)", re.I)
TOOL_HEADER = re.compile(r"^MEKU proof-of-work record: seq \d+ [a-z_]+ \(POW-[A-Z0-9-]+\)(?: - [^\n]*)?$", re.M)
JSON_WHITESPACE = " \t\n\r"


def visible(body):
    """What a reader sees as the poster's own words. Outside code fences, HTML comments and
    quoted lines are dropped; inside a fence GitHub shows everything, so nothing is dropped."""
    out, fence, in_comment = [], None, False
    for line in body.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if fence:
            out.append(line)
            close = FENCE_CLOSE.match(line)
            if close and close.group(1)[0] == fence[0] and len(close.group(1)) >= len(fence):
                fence = None
            continue
        rest, kept = line, ""
        while rest:
            if in_comment:
                end = rest.find("-->")
                if end == -1:
                    rest = ""
                    break
                rest, in_comment = rest[end + 3 :], False
                continue
            start = rest.find("<!--")
            if start == -1:
                kept += rest
                break
            kept, rest, in_comment = kept + rest[:start], rest[start + 4 :], True
        if re.match(r"^[ \t]*>", kept):
            continue
        opening = FENCE_OPEN.match(kept)
        if opening and not in_comment:
            fence = opening.group(1)
        out.append(kept)
    return "\n".join(out)


def is_record(value):
    return isinstance(value, dict) and value.get("pow") == PROTOCOL


def records_in(body):
    """(records, malformed): fenced json blocks; with no fence at all, one bare record that
    starts the comment once image markup and a tool header line are set aside."""
    text = visible(body)
    found, malformed = [], False
    for block in FENCE.findall(text):
        try:
            parsed = parse(block)
        except ValueError:
            malformed = malformed or PROTOCOL in block
            continue
        if is_record(parsed):
            found.append(parsed)
    trimmed = TOOL_HEADER.sub("", IMAGE_MARKUP.sub("", text)).strip(JSON_WHITESPACE)
    if found or "```" in text or not trimmed.startswith("{") or PROTOCOL not in trimmed or "<" in trimmed:
        return found, malformed
    try:
        parsed = parse(trimmed[: trimmed.rfind("}") + 1])
    except ValueError:
        return found, True
    if is_record(parsed):
        found.append(parsed)
    return found, malformed


def is_seq(value, n):
    return type(value) is int and value == n


def when(comment):
    return datetime.fromisoformat(comment["created_at"].replace("Z", "+00:00"))


def same(a, b):
    return isinstance(a, str) and isinstance(b, str) and a.lower() == b.lower()


def main(path, expect_operator):
    with open(path, encoding="utf-8") as handle:
        bundle = json.load(handle)
    comments = sorted(bundle["comments"], key=lambda c: (when(c), str(c["id"])))
    entries = []
    for c in comments:
        found, malformed = records_in(c["body"])
        entries.append((c, found, malformed))
    openings = [(c, r) for c, found, _ in entries for r in found if r.get("type") == "pilot_opened" and is_seq(r.get("seq"), 0)]
    preferred = [e for e in openings if same(e[0]["author"], expect_operator) and same((e[1].get("roster") or {}).get("operator"), expect_operator)]
    synthetic = [e for e in openings if str(e[1].get("pilot_id", "")).startswith("POW-SYNTHETIC-")]
    opening_comment, opening = (preferred or synthetic or openings)[0]
    roster = opening.get("roster") or {}
    operator, developer = roster.get("operator"), roster.get("developer")
    human = next((r.get("human") for c, found, _ in entries for r in found if r.get("type") == "task_offered" and same(c["author"], operator)), None)
    members = [m for m in (operator, developer, human) if isinstance(m, str)]
    chain = []
    for c, found, malformed in entries:
        if not any(same(c["author"], m) for m in members) or malformed or len(found) != 1:
            continue
        record = found[0]
        if record.get("type") == "independent_verification":
            continue
        if record.get("type") == "pilot_opened" and c is not opening_comment:
            continue
        if chain and same(chain[-1][0]["author"], c["author"]) and jcs(chain[-1][1]) == jcs(record):
            continue  # an exact double post adds nothing
        chain.append((c, record))
    for index, (_, record) in enumerate(chain):
        if not is_seq(record.get("seq"), index):
            raise SystemExit(f"seq {record.get('seq')} found where {index} was expected; run verify.mjs for details")
    digest = sha256_hex(f"{PROTOCOL}|{opening['pilot_id']}")
    try:
        for _, record in chain:
            digest = sha256_hex(f"{digest}|{sha256_hex(jcs(record))}")
    except UnicodeEncodeError:  # a lone surrogate, which JavaScript's verifier also refuses
        raise SystemExit("a record cannot be hashed (malformed text); run verify.mjs for details")
    print(f"{digest} (through seq {len(chain) - 1}; {len(chain)} records)")


if __name__ == "__main__":
    args = sys.argv[1:]
    operator = "mekusimeku"
    if "--expect-operator" in args:
        i = args.index("--expect-operator")
        operator = args[i + 1]
        del args[i : i + 2]
    if len(args) != 1:
        raise SystemExit(__doc__)
    main(args[0], operator)
