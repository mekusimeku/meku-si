// MEKU proof-of-work pilot (meku.pow/1): shared, dependency-free helpers.
// Used by request.mjs (developer client), record.mjs, export.mjs and verify.mjs.
// Nothing here performs network calls, reads credentials or moves money.

import { createHash, randomBytes } from "node:crypto";
import { inflateSync } from "node:zlib";

export const PROTOCOL = "meku.pow/1";
export const BUNDLE_FORMAT = "meku.pow-bundle/1";
export const MCP_ENDPOINT = "https://meku.farm/api/public/mcp";
export const VARIANT = "operator-relayed";
export const TASK_KIND = "fresh-code-photo";
// Crockford base32: no I, L, O or U, so a handwritten code is hard to misread.
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 8;
// Everyday objects found in most homes. None reveals identity or location.
export const OBJECTS = Object.freeze(["SPOON", "CUP", "PLATE", "BOWL", "SOCK", "TOWEL", "PEN", "SHOE"]);
export const EVIDENCE_HOURS_AFTER_REVEAL = 48;
export const CYCLE_HOURS = 168;
export const BUDGET_TEXT = "None - unpaid pilot, no payment of any kind";
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
export const MIN_EVIDENCE_SHORT_SIDE = 240;

// MEKU's shared request validator trims and then silently CUTS text at these caps
// (private source src/lib/execution-request.ts, live docs meku.farm/docs). The pilot
// refuses anything that would be cut, so the code can never be truncated away.
export const REQUEST_LIMITS = Object.freeze({
  title: [4, 120],
  action: [4, 200],
  description: [20, 2000],
  deliverable: [1, 300],
  timeframe: [1, 120],
  budget_text: [1, 80],
});

export const RECORD_ORDER = Object.freeze([
  "pilot_opened",
  "developer_ready",
  "request_submitted",
  "request_reviewed",
  "request_status_observed",
  "task_offered",
  "human_consent",
  "object_revealed",
  "evidence_submitted",
  "result_returned",
  "requester_decision",
  "pilot_closed",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const PILOT_ID = /^POW-(?:\d{3}|SYNTHETIC-[A-Z0-9-]{1,30})$/;
// GitHub logins: letters, digits and single inner hyphens, at most 39 characters.
const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
// Synthetic fixtures use underscores, which GitHub forbids, so no real account is named.
const SYNTHETIC_LOGIN = /^synthetic_[a-z]{1,30}$/;
const LEDGER_URL = /^https:\/\/github\.com\/[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}\/issues\/[1-9]\d{0,8}$/;
const ATTACHMENT_URL =
  /https:\/\/(?:github\.com\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|user-images\.githubusercontent\.com\/\d{1,12}\/[A-Za-z0-9._-]{1,200})/g;

export const isSyntheticPilot = (pilotId) => typeof pilotId === "string" && pilotId.startsWith("POW-SYNTHETIC-");
export const isSha256 = (value) => typeof value === "string" && SHA256.test(value);
export const isLedgerUrl = (value) => typeof value === "string" && LEDGER_URL.test(value);
export function isGithubLogin(value, { synthetic = false } = {}) {
  if (typeof value !== "string") return false;
  return GITHUB_LOGIN.test(value) || (synthetic && SYNTHETIC_LOGIN.test(value));
}
export const sameLogin = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

/** RFC 8785 (JCS) for the subset the protocol allows: null, booleans, safe integers,
 *  strings, arrays and objects. Floats are refused so no number formatting can differ. */
export function canonicalize(value) {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error("Only safe integers are allowed in records.");
    return String(value);
  }
  if (typeof value === "string") {
    if (!value.isWellFormed()) throw new Error("Strings must be well-formed Unicode.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error("Only plain objects are allowed.");
    // Default sort compares UTF-16 code units, exactly as RFC 8785 requires.
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

export function sha256Hex(data) {
  return createHash("sha256").update(typeof data === "string" ? Buffer.from(data, "utf8") : data).digest("hex");
}

export const recordHash = (record) => sha256Hex(canonicalize(record));

/** Public commitment to a MEKU request id: links records without publishing the id. */
export function requestIdCommitment(requestId) {
  if (typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid request id.");
  return sha256Hex(`${PROTOCOL}|request-id|${requestId.toLowerCase()}`);
}

/** Rolling digest over records 0..n in seq order. Anyone can recompute it in any language:
 *  d = sha256("meku.pow/1|" + pilot_id); for each record: d = sha256(d + "|" + sha256(JCS(record))). */
export function ledgerDigest(pilotId, records) {
  let digest = sha256Hex(`${PROTOCOL}|${pilotId}`);
  for (const record of records) digest = sha256Hex(`${digest}|${recordHash(record)}`);
  return digest;
}

export function generateCode(randomSource = randomBytes) {
  const bytes = randomSource(5); // 40 random bits = exactly 8 base32 characters.
  if (!bytes || bytes.length !== 5) throw new Error("Random source must return 5 bytes.");
  let bits = 0n;
  for (const byte of bytes) bits = (bits << 8n) | BigInt(byte);
  let code = "";
  for (let i = CODE_LENGTH - 1; i >= 0; i -= 1) code += CODE_ALPHABET[Number((bits >> BigInt(i * 5)) & 31n)];
  return code;
}

export const isValidCode = (code) =>
  typeof code === "string" && code.length === CODE_LENGTH && [...code].every((c) => CODE_ALPHABET.includes(c));

export function buildRequestArguments({ pilotId, code, ledgerUrl }) {
  if (!PILOT_ID.test(pilotId ?? "")) throw new Error("Invalid pilot id.");
  if (!isValidCode(code)) throw new Error("Invalid code.");
  if (!isLedgerUrl(ledgerUrl)) throw new Error("The ledger must be a GitHub issue URL.");
  return {
    title: `${pilotId}: handwritten code photo (unpaid pilot)`,
    action: "Handwrite a code on paper, place one named everyday object beside it, take one photo",
    description:
      `MEKU ${pilotId} independent proof-of-work pilot. Unpaid: no payment, token or wallet of any kind. ` +
      `Code: ${code}. If you freely agree: (1) handwrite the code ${code} on paper; ` +
      `(2) after you post your consent in the public record, the developer will name one everyday object; ` +
      `place that object next to the paper; (3) take one photo showing only the paper and the object on a ` +
      `plain surface - no people, faces, screens, documents, addresses or windows; (4) post a screenshot of ` +
      `that photo in the public record (screenshots normally carry no location data). Under 5 minutes, at a place ` +
      `you already are. No travel, purchase or special equipment. You may refuse or stop at any time without ` +
      `penalty. Public record: ${ledgerUrl}`,
    skills: [],
    deliverable: "One metadata-free photo of the handwritten code and the named object",
    timeframe: "Within 7 days; photo within 48 hours after the object is named",
    budget_text: BUDGET_TEXT,
    travel_required: false,
    equipment_required: false,
    idempotencyKey: `${pilotId}.${code}`,
  };
}

/** Problems that would make MEKU store something other than what was sent. */
export function requestArgumentProblems(args) {
  const problems = [];
  for (const [field, [min, max]] of Object.entries(REQUEST_LIMITS)) {
    const value = args?.[field];
    if (typeof value !== "string") {
      problems.push(`${field} must be a string`);
      continue;
    }
    if (value !== value.trim()) problems.push(`${field} has leading or trailing whitespace`);
    if (value.length < min || value.length > max) problems.push(`${field} must be ${min}-${max} characters`);
  }
  if (!Array.isArray(args?.skills) || args.skills.length !== 0) problems.push("skills must be an empty array");
  if (args?.travel_required !== false) problems.push("travel_required must be false");
  if (args?.equipment_required !== false) problems.push("equipment_required must be false");
  if (args?.budget_text !== BUDGET_TEXT) problems.push(`budget_text must be exactly "${BUDGET_TEXT}"`);
  if (typeof args?.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(args.idempotencyKey))
    problems.push("idempotencyKey must be 1-80 letters, digits, dots, underscores, colons or dashes");
  return problems;
}

// ---------------------------------------------------------------------------
// Record schema. One table drives validation here and the published JSON Schema.

const str = (min, max, extra = {}) => ({ kind: "string", min, max, ...extra });
const constant = (value) => ({ kind: "const", value });
const oneOf = (...values) => ({ kind: "enum", values });
const bool = () => ({ kind: "boolean" });
const sha = () => str(64, 64, { pattern: SHA256, patternSource: "^[0-9a-f]{64}$" });
const iso = () => str(20, 35, { pattern: ISO_UTC, patternSource: ISO_UTC.source });
const login = () => ({ kind: "login" });
const obj = (fields) => ({ kind: "object", fields });
const nullableStr = (max) => ({ kind: "nullable-string", max });
const optional = (spec) => ({ ...spec, optional: true });
const trueFlags = (...names) => obj(Object.fromEntries(names.map((n) => [n, constant(true)])));

// Operator records name the request by its fresh code, so they need no hashing and can be
// written on a phone; the developer's records carry the hash commitments.
const CODE_FIELD = str(CODE_LENGTH, CODE_LENGTH, { pattern: /^[0-9A-HJKMNP-TV-Z]{8}$/, patternSource: "^[0-9A-HJKMNP-TV-Z]{8}$" });

const REQUEST_ARGUMENTS = obj({
  title: str(4, 120),
  action: str(4, 200),
  description: str(20, 2000),
  skills: { kind: "array", item: str(1, 40), max: 10 },
  deliverable: str(1, 300),
  timeframe: str(1, 120),
  budget_text: str(1, 80),
  travel_required: bool(),
  equipment_required: bool(),
  idempotencyKey: str(1, 80, { pattern: /^[A-Za-z0-9._:-]+$/, patternSource: "^[A-Za-z0-9._:-]+$" }),
});

const STORED_REQUEST = obj({
  title: str(0, 120),
  action: str(0, 200),
  description: str(0, 2000),
  country: nullableStr(80),
  region: nullableStr(80),
  skills: { kind: "array", item: str(0, 40), max: 10 },
  deliverable: nullableStr(300),
  timeframe: nullableStr(120),
  budget_text: nullableStr(80),
  travel_required: bool(),
  equipment_required: bool(),
  requester_kind: str(1, 20),
  status: str(1, 20),
  created_at: iso(),
});

export const RECORD_TYPES = Object.freeze({
  pilot_opened: {
    roles: ["operator"],
    fields: {
      protocol: str(20, 300, { pattern: /^https:\/\//, patternSource: "^https://" }),
      mcp_endpoint: constant(MCP_ENDPOINT),
      variant: constant(VARIANT),
      roster: obj({ operator: login(), developer: login() }),
      task: obj({
        kind: constant(TASK_KIND),
        code_alphabet: constant(CODE_ALPHABET),
        code_length: constant(CODE_LENGTH),
        objects: constant([...OBJECTS]),
        evidence_hours_after_reveal: constant(EVIDENCE_HOURS_AFTER_REVEAL),
        cycle_hours: constant(CYCLE_HOURS),
      }),
      payment: constant("none"),
    },
  },
  developer_ready: {
    roles: ["developer"],
    fields: {
      client: obj({ name: str(1, 80), version: str(1, 40) }),
      agent: str(1, 160),
      server: obj({ name: constant("meku-human-cloud"), version: str(1, 20), protocol_version: str(1, 20) }),
      tools_listed: { kind: "array", item: str(1, 80), max: 20 },
      independence: trueFlags(
        "not_meku_staff_or_contractor",
        "not_paid_by_meku",
        "no_meku_financial_interest",
        "controls_own_agent",
      ),
      payment: constant("none"),
    },
  },
  request_submitted: {
    roles: ["developer"],
    fields: {
      code: CODE_FIELD,
      arguments: REQUEST_ARGUMENTS,
      arguments_sha256: sha(),
      request_id_sha256: sha(),
      response: obj({ status: str(1, 20), created_at: iso(), deduplicated: bool() }),
      response_text_sha256: sha(),
      observed_at: iso(),
      payment: constant("none"),
    },
  },
  request_reviewed: {
    roles: ["operator"],
    fields: {
      code: CODE_FIELD,
      decision: oneOf("approved", "rejected"),
      reviewer_role: oneOf("seek_reviewer", "admin"),
      reviewer_is_key_issuer: constant(false),
      note: optional(str(0, 300)),
    },
  },
  request_status_observed: {
    roles: ["developer"],
    fields: {
      request_id_sha256: sha(),
      stored_request: STORED_REQUEST,
      stored_request_sha256: sha(),
      response_text_sha256: sha(),
      observed_at: iso(),
    },
  },
  task_offered: {
    roles: ["operator"],
    fields: {
      code: CODE_FIELD,
      human: login(),
      human_is_registered_meku_human: bool(),
      task_shown: constant("ledger-seq-4"),
      channel: oneOf("github", "email", "in_person", "phone", "message", "other"),
      payment: constant("none"),
    },
  },
  human_consent: {
    roles: ["human"],
    fields: {
      consents: trueFlags("voluntary_participation", "may_reject_or_stop", "responsible_for_safety", "safety_checklist"),
      adult_18_plus: constant(true),
      unpaid_understood: constant(true),
      publication: trueFlags("photo_public", "github_login_public"),
      independence: trueFlags("not_meku_staff_or_contractor", "not_the_developer"),
    },
  },
  object_revealed: {
    roles: ["developer"],
    fields: { object: oneOf(...OBJECTS) },
  },
  evidence_submitted: {
    roles: ["human"],
    fields: {
      statements: trueFlags(
        "code_physically_written",
        "object_placed_after_reveal",
        "no_people_or_personal_data",
        "metadata_removed",
      ),
      evidence: constant("attached-in-this-comment"),
    },
  },
  result_returned: {
    roles: ["operator"],
    fields: {
      code: CODE_FIELD,
      evidence: constant("ledger-seq-8"),
      meku_check: obj({
        code_visible: bool(),
        object_visible: bool(),
        no_personal_data_visible: bool(),
      }),
      note: optional(str(0, 300)),
    },
  },
  requester_decision: {
    roles: ["developer"],
    fields: {
      decision: oneOf("ACCEPTED", "REJECTED"),
      checks: obj({
        code_visible: bool(),
        code_matches: bool(),
        object_visible: bool(),
        object_matches: bool(),
        no_personal_data_visible: bool(),
      }),
      evidence_sha256: sha(),
      ledger_digest: sha(),
      reason: str(1, 300),
    },
  },
  pilot_closed: {
    roles: ["operator"],
    fields: {
      key_revoked: constant(true),
      outcome: oneOf("completed", "stopped", "rejected_by_review"),
      note: optional(str(0, 300)),
    },
  },
  stop: {
    roles: ["developer", "operator", "human"],
    fields: { reason: str(1, 300) },
  },
  independent_verification: {
    roles: ["verifier"],
    unsequenced: true,
    fields: {
      verdict: oneOf("PASS", "FAIL", "INCOMPLETE", "STOPPED", "REJECTED_BY_REVIEW", "COMPLETED_REJECTED"),
      ledger_digest: sha(),
      tool: str(1, 200),
      manual_checks: obj({
        code_legible_and_matching: bool(),
        object_matching: bool(),
        no_personal_data_visible: bool(),
        physical_arrangement: bool(),
      }),
      notes: optional(str(0, 500)),
    },
  },
});

const ENVELOPE = ["pow", "pilot_id", "seq", "type", "role"];

// Control and bidirectional-override characters could make a printed report lie about itself.
const UNSAFE_TEXT = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
const SAFE_TEXT_PATTERN = "^[^\\u0000-\\u001f\\u007f-\\u009f\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]*$";

function checkValue(spec, value, path, problems, ctx) {
  if (typeof value === "string" && UNSAFE_TEXT.test(value)) {
    problems.push(`${path} contains control or text-direction characters`);
    return;
  }
  switch (spec.kind) {
    case "const":
      if (canonicalize(value ?? null) !== canonicalize(spec.value)) problems.push(`${path} must be ${JSON.stringify(spec.value)}`);
      return;
    case "enum":
      if (!spec.values.includes(value)) problems.push(`${path} must be one of ${spec.values.join(", ")}`);
      return;
    case "boolean":
      if (typeof value !== "boolean") problems.push(`${path} must be true or false`);
      return;
    case "login":
      if (!isGithubLogin(value, ctx)) problems.push(`${path} must be a GitHub login`);
      return;
    case "nullable-string":
      if (value === null) return;
      if (typeof value !== "string" || value.length > spec.max) problems.push(`${path} must be null or a string of at most ${spec.max} characters`);
      return;
    case "string":
      if (typeof value !== "string") {
        problems.push(`${path} must be a string`);
        return;
      }
      if (value.length < spec.min || value.length > spec.max) problems.push(`${path} must be ${spec.min}-${spec.max} characters`);
      if (spec.pattern && !spec.pattern.test(value)) problems.push(`${path} has an invalid format`);
      return;
    case "array":
      if (!Array.isArray(value)) {
        problems.push(`${path} must be an array`);
        return;
      }
      if (value.length > spec.max) problems.push(`${path} has more than ${spec.max} items`);
      value.forEach((item, i) => checkValue(spec.item, item, `${path}[${i}]`, problems, ctx));
      return;
    case "object":
      checkObject(spec.fields, value, path, problems, ctx);
      return;
    default:
      problems.push(`${path}: unknown schema kind`);
  }
}

function checkObject(fields, value, path, problems, ctx) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    problems.push(`${path} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) if (!Object.hasOwn(fields, key)) problems.push(`${path}.${key} is not allowed`);
  for (const [key, spec] of Object.entries(fields)) {
    if (!Object.hasOwn(value, key)) {
      if (!spec.optional) problems.push(`${path}.${key} is missing`);
      continue;
    }
    checkValue(spec, value[key], `${path}.${key}`, problems, ctx);
  }
}

/** Schema problems for one record; an empty list means the shape is valid. */
export function recordProblems(record) {
  const problems = [];
  if (typeof record !== "object" || record === null || Array.isArray(record)) return ["record must be a JSON object"];
  try {
    canonicalize(record);
  } catch (error) {
    return [`record cannot be canonicalized: ${error.message}`];
  }
  if (record.pow !== PROTOCOL) problems.push(`pow must be "${PROTOCOL}"`);
  if (!PILOT_ID.test(record.pilot_id ?? "")) problems.push("pilot_id must look like POW-001");
  const spec = RECORD_TYPES[record.type];
  if (!spec) return [...problems, `type must be one of ${Object.keys(RECORD_TYPES).join(", ")}`];
  if (!spec.roles.includes(record.role)) problems.push(`role for ${record.type} must be ${spec.roles.join(" or ")}`);
  if (spec.unsequenced) {
    if (Object.hasOwn(record, "seq")) problems.push("independent_verification records have no seq");
  } else if (!Number.isSafeInteger(record.seq) || record.seq < 0 || record.seq > 99) problems.push("seq must be an integer 0-99");
  const ctx = { synthetic: isSyntheticPilot(record.pilot_id) };
  const body = Object.fromEntries(Object.entries(record).filter(([key]) => !ENVELOPE.includes(key)));
  checkObject(spec.fields, body, "record", problems, ctx);
  return problems;
}

/** JSON Schema (draft 2020-12) generated from RECORD_TYPES, published for other implementations. */
export function recordJsonSchema() {
  const toSchema = (spec) => {
    switch (spec.kind) {
      case "const":
        return { const: spec.value };
      case "enum":
        return { enum: spec.values };
      case "boolean":
        return { type: "boolean" };
      case "login":
        // Real GitHub logins, plus the underscore form used only by synthetic test ledgers
        // (verify.mjs additionally refuses that form outside POW-SYNTHETIC-* pilots).
        return { type: "string", pattern: `^(?:${GITHUB_LOGIN.source.slice(1, -1)}|${SYNTHETIC_LOGIN.source.slice(1, -1)})$` };
      case "nullable-string":
        return { type: ["string", "null"], maxLength: spec.max, pattern: SAFE_TEXT_PATTERN };
      case "string":
        return {
          type: "string",
          minLength: spec.min,
          maxLength: spec.max,
          pattern: spec.patternSource ?? SAFE_TEXT_PATTERN,
        };
      case "array":
        return { type: "array", maxItems: spec.max, items: toSchema(spec.item) };
      case "object":
        return objectSchema(spec.fields);
      default:
        throw new Error("unknown kind");
    }
  };
  const objectSchema = (fields, extra = {}) => ({
    type: "object",
    additionalProperties: false,
    required: Object.entries(fields)
      .filter(([, s]) => !s.optional)
      .map(([k]) => k),
    properties: { ...extra, ...Object.fromEntries(Object.entries(fields).map(([k, s]) => [k, toSchema(s)])) },
  });
  const variants = Object.entries(RECORD_TYPES).map(([type, spec]) => {
    const envelope = {
      pow: { const: PROTOCOL },
      pilot_id: { type: "string", pattern: PILOT_ID.source },
      type: { const: type },
      role: { enum: spec.roles },
      ...(spec.unsequenced ? {} : { seq: { type: "integer", minimum: 0, maximum: 99 } }),
    };
    const schema = objectSchema(spec.fields, envelope);
    schema.required = [...Object.keys(envelope), ...schema.required];
    return schema;
  });
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/mekusimeku/meku-si/blob/main/tools/pow/pow-record-v1.schema.json",
    title: "MEKU proof-of-work pilot record (meku.pow/1)",
    description:
      "Generated by tools/pow/record.mjs schema from tools/pow/lib.mjs. Cross-record rules (order, authorship, hashes, timing) are enforced by tools/pow/verify.mjs and described in docs/proof-of-work/records.md.",
    oneOf: variants,
  };
}

// ---------------------------------------------------------------------------
// Comment parsing.

/** Records in a comment body: every ```json block that declares "pow": "meku.pow/1".
 *  A comment with no such block may instead hold one bare JSON object (what a phone copies
 *  from a rendered code block): the text from its first "{" to its last "}". */
export function extractRecords(body) {
  const found = [];
  const text = String(body ?? "").replace(/\r\n/g, "\n");
  const isRecord = (v) => v && typeof v === "object" && !Array.isArray(v) && v.pow === PROTOCOL;
  for (const match of text.matchAll(/```json[^\n]*\n([\s\S]*?)```/g)) {
    let parsed;
    try {
      parsed = JSON.parse(match[1]);
    } catch {
      if (match[1].includes(PROTOCOL)) found.push({ error: "a meku.pow block is not valid JSON" });
      continue;
    }
    if (isRecord(parsed)) found.push({ record: parsed });
  }
  if (found.length || text.includes("```")) return found;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start || !text.includes(PROTOCOL)) return found;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (isRecord(parsed)) found.push({ record: parsed });
  } catch {
    found.push({ error: "a meku.pow record is not valid JSON" });
  }
  return found;
}

/** Display-safe text: control and text-direction characters become visible \u escapes. */
export function displaySafe(value) {
  return String(value).replace(new RegExp(UNSAFE_TEXT.source, "g"), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

/** The roster as the verifier sees it: seq 0 posted by the expected operator account (or, for
 *  synthetic test ledgers, the first seq 0), and the human named in that operator's task_offered. */
export function rosterFromComments(comments, { expectOperator = "mekusimeku" } = {}) {
  const records = [];
  for (const comment of comments) for (const f of extractRecords(comment.body)) if (f.record) records.push({ comment, record: f.record });
  const openings = records.filter((e) => e.record.type === "pilot_opened" && e.record.seq === 0);
  const opening =
    openings.find((e) => sameLogin(e.comment.author, expectOperator) && sameLogin(e.record.roster?.operator, expectOperator)) ??
    openings.find((e) => isSyntheticPilot(e.record.pilot_id)) ??
    openings[0] ??
    null;
  if (!opening) return { opening: null, operator: null, developer: null, human: null };
  const operator = opening.record.roster?.operator ?? null;
  const offered = records.find((e) => e.record.type === "task_offered" && sameLogin(e.comment.author, operator));
  return { opening, operator, developer: opening.record.roster?.developer ?? null, human: offered?.record.human ?? null };
}

export function extractAttachmentUrls(body) {
  return [...new Set(String(body ?? "").match(ATTACHMENT_URL) ?? [])];
}

// ---------------------------------------------------------------------------
// Evidence image checks (PNG and JPEG only). Metadata can reveal where and with
// which device a photo was taken, so the published file must carry none.

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LOCATION_TEXT =
  /GPS|exif:GPS|photoshop:(?:City|State|Country)|Iptc4xmpCore:(?:Location|City|CountryCode)|Iptc4xmpExt:Location|LocationShown|LocationCreated|latitude|longitude/i;

function exifFindings(tiff) {
  // tiff: Buffer starting at the TIFF header ("II*\0" or "MM\0*").
  const findings = [{ level: "FAIL", code: "EXIF_PRESENT", detail: "EXIF metadata is present" }];
  if (tiff.length < 8) return findings;
  const little = tiff[0] === 0x49 && tiff[1] === 0x49;
  const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
  if (!little && !big) return findings;
  const u16 = (o) => (little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o) => (little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return findings;
  const count = u16(ifd0);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === 0x8825) {
      findings.push({ level: "FAIL", code: "GPS_PRESENT", detail: "EXIF GPS location data is present: remove the photo from public view now" });
      break;
    }
  }
  return findings;
}

function xmpFindings(text) {
  return LOCATION_TEXT.test(text)
    ? [{ level: "FAIL", code: "XMP_LOCATION", detail: "XMP metadata contains location fields" }]
    : [{ level: "WARN", code: "XMP_PRESENT", detail: "XMP metadata is present (no location fields found)" }];
}

function scanPng(bytes) {
  const out = { mediaType: "image/png", width: null, height: null, findings: [] };
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      out.findings.push({ level: "FAIL", code: "PNG_TRUNCATED", detail: `chunk ${type} runs past the end of the file` });
      return out;
    }
    const data = bytes.subarray(dataStart, dataEnd);
    if (type === "IHDR" && length >= 8) {
      out.width = data.readUInt32BE(0);
      out.height = data.readUInt32BE(4);
    } else if (type === "eXIf") {
      out.findings.push(...exifFindings(data));
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      out.findings.push(...pngTextFindings(type, data));
    } else if (type === "IEND") {
      sawEnd = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!sawEnd) out.findings.push({ level: "FAIL", code: "PNG_TRUNCATED", detail: "no IEND chunk" });
  return out;
}

function pngTextFindings(type, data) {
  const zero = data.indexOf(0);
  const keyword = zero > 0 ? data.toString("latin1", 0, zero) : "";
  let text = "";
  try {
    if (type === "tEXt") text = data.toString("latin1", zero + 1);
    else if (type === "zTXt") text = inflateSync(data.subarray(zero + 2)).toString("latin1");
    else {
      // iTXt: keyword\0 compressionFlag compressionMethod languageTag\0 translatedKeyword\0 text
      const flag = data[zero + 1];
      const langEnd = data.indexOf(0, zero + 3);
      const transEnd = data.indexOf(0, langEnd + 1);
      const raw = data.subarray(transEnd + 1);
      text = (flag === 1 ? inflateSync(raw) : raw).toString("utf8");
    }
  } catch {
    return [{ level: "FAIL", code: "PNG_TEXT_UNREADABLE", detail: `unreadable ${type} metadata chunk "${keyword}"` }];
  }
  if (/xmp/i.test(keyword)) return xmpFindings(text);
  return LOCATION_TEXT.test(`${keyword} ${text}`)
    ? [{ level: "FAIL", code: "TEXT_LOCATION", detail: `text metadata "${keyword}" mentions location` }]
    : [{ level: "WARN", code: "TEXT_METADATA", detail: `text metadata chunk "${keyword}" is present` }];
}

const JPEG_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function scanJpeg(bytes) {
  const out = { mediaType: "image/jpeg", width: null, height: null, findings: [] };
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      out.findings.push({ level: "FAIL", code: "JPEG_MALFORMED", detail: `expected a marker at byte ${offset}` });
      return out;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break; // end of image, or start of scan data
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      offset += 2;
      continue;
    }
    const length = bytes.readUInt16BE(offset + 2);
    const segStart = offset + 4;
    const segEnd = offset + 2 + length;
    if (length < 2 || segEnd > bytes.length) {
      out.findings.push({ level: "FAIL", code: "JPEG_TRUNCATED", detail: `segment 0x${marker.toString(16)} runs past the end` });
      return out;
    }
    const seg = bytes.subarray(segStart, segEnd);
    if (marker === 0xe1 && seg.subarray(0, 6).equals(Buffer.from("Exif\0\0", "latin1"))) out.findings.push(...exifFindings(seg.subarray(6)));
    else if (marker === 0xe1 && seg.toString("latin1", 0, 29) === "http://ns.adobe.com/xap/1.0/\0")
      out.findings.push(...xmpFindings(seg.toString("utf8", 29)));
    else if (marker === 0xe1)
      out.findings.push({ level: "FAIL", code: "APP1_UNKNOWN", detail: "unrecognised APP1 metadata segment" });
    else if (marker === 0xed)
      out.findings.push({ level: "FAIL", code: "IPTC_PRESENT", detail: "IPTC/Photoshop metadata is present" });
    else if (marker === 0xfe)
      out.findings.push({ level: "WARN", code: "JPEG_COMMENT", detail: "a JPEG comment segment is present" });
    else if (JPEG_SOF.has(marker) && seg.length >= 5) {
      out.height = seg.readUInt16BE(1);
      out.width = seg.readUInt16BE(3);
    }
    offset = segEnd;
  }
  return out;
}

/** Media type, dimensions and metadata findings for an evidence file. */
export function scanImage(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  let result;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) result = scanPng(bytes);
  else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) result = scanJpeg(bytes);
  else return { mediaType: null, width: null, height: null, findings: [{ level: "FAIL", code: "UNSUPPORTED_TYPE", detail: "evidence must be a PNG or JPEG file" }] };
  if (bytes.length > MAX_EVIDENCE_BYTES)
    result.findings.push({ level: "FAIL", code: "TOO_LARGE", detail: `file is larger than ${MAX_EVIDENCE_BYTES} bytes` });
  if (!result.width || !result.height)
    result.findings.push({ level: "FAIL", code: "NO_DIMENSIONS", detail: "image dimensions could not be read" });
  else if (Math.min(result.width, result.height) < MIN_EVIDENCE_SHORT_SIDE)
    result.findings.push({ level: "FAIL", code: "TOO_SMALL", detail: `shorter side is below ${MIN_EVIDENCE_SHORT_SIDE} pixels` });
  return result;
}
