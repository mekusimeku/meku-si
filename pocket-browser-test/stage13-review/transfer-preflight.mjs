/**
 * MEKU Pocket: independent, read-only mainnet transfer intent & replay guard.
 * NO wallet keys, signatures, chain calls, broadcasting, or user data are handled here.
 * This is portable source for review against the separate saved Pocket app.
 */
export const MEKU_MINT = 'J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const MAINNET = 'mainnet-beta';
const U64_MAX = (1n << 64n) - 1n;
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export class PocketTransferError extends Error {
  constructor(code) { super(code); this.name = 'PocketTransferError'; this.code = code; }
}

export function isSolanaPublicKey(input) {
  if (typeof input !== 'string' || !input.length || input.length > 44) return false;
  let count = 0;
  while (count < input.length && input[count] === '1') count++;
  let value = 0n;
  for (const c of input) {
    const index = BASE58.indexOf(c);
    if (index === -1) return false;
    value = value * 58n + BigInt(index);
  }
  let bytes = 0;
  while (value > 0n) { value >>= 8n; bytes++; }
  return count + bytes === 32;
}

export function amountToUnits(amount, decimals) {
  if (typeof amount !== 'string' || !Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new PocketTransferError('INVALID_AMOUNT');
  }
  // Never use JS floating-point for currency amounts. No exponents, signs, commas or empty inputs.
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(amount);
  if (!match || (match[2]?.length ?? 0) > decimals) throw new PocketTransferError('INVALID_AMOUNT');
  const whole = match[1];
  const fraction = (match[2] ?? '').padEnd(decimals, '0');
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction || '0');
  if (units <= 0n) throw new PocketTransferError('AMOUNT_MUST_BE_POSITIVE');
  if (units > U64_MAX) throw new PocketTransferError('AMOUNT_OVERFLOW');
  return units;
}

export function createTransferIntent(input) {
  if (!input || typeof input !== 'object') throw new PocketTransferError('INVALID_INTENT');
  if (input.network !== MAINNET) throw new PocketTransferError('WRONG_NETWORK');
  if (!['SOL', 'MEKU SI'].includes(input.asset)) throw new PocketTransferError('UNSUPPORTED_ASSET');
  if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{12,100}$/.test(input.requestId)) {
    throw new PocketTransferError('INVALID_REQUEST_ID');
  }
  if (!isSolanaPublicKey(input.owner) || !isSolanaPublicKey(input.recipient)) {
    throw new PocketTransferError('INVALID_WALLET_ADDRESS');
  }
  if (input.owner === input.recipient) throw new PocketTransferError('SELF_TRANSFER_NOT_ALLOWED');
  // Program/system addresses are not ordinary receiving wallets. On-chain ownership must be checked separately.
  if (input.recipient === '11111111111111111111111111111111') {
    throw new PocketTransferError('UNSAFE_RECIPIENT');
  }
  const decimals = input.asset === 'SOL' ? 9 : 6;
  if (input.asset === 'MEKU SI') {
    if (input.mint !== MEKU_MINT || input.programId !== TOKEN_2022_PROGRAM || input.decimals !== 6) {
      throw new PocketTransferError('WRONG_MINT_OR_TOKEN_PROGRAM');
    }
  } else if (input.mint != null || input.programId != null || input.decimals != null && input.decimals !== 9) {
    throw new PocketTransferError('SOL_MUST_NOT_HAVE_TOKEN_MINT');
  }
  const baseUnits = amountToUnits(input.amount, decimals);
  const intent = Object.freeze({
    requestId: input.requestId, network: MAINNET, asset: input.asset,
    owner: input.owner, recipient: input.recipient, amount: input.amount,
    baseUnits: baseUnits.toString(), decimals,
    mint: input.asset === 'MEKU SI' ? MEKU_MINT : null,
    programId: input.asset === 'MEKU SI' ? TOKEN_2022_PROGRAM : null,
  });
  return intent;
}

/**
 * Only a simulation journal. A production replacement MUST use durable, atomic server-side
 * records keyed by authenticated owner + requestId and preserve the signature before broadcast.
 * Caller-provided booleans are not proof of real wallet signing or of chain finality.
 */
export class SimulatedTransferJournal {
  #entries = new Map();
  open(intent) {
    const id = `${intent.owner}:${intent.requestId}`;
    const existing = this.#entries.get(id);
    if (existing) {
      if (JSON.stringify(existing.intent) !== JSON.stringify(intent)) throw new PocketTransferError('REPLAY_CONFLICT');
      return structuredClone(existing);
    }
    const entry = { intent, state: 'DRAFT', signature: null, sendAttempts: 0 };
    this.#entries.set(id, entry);
    return structuredClone(entry);
  }
  #entry(owner, requestId) {
    const entry = this.#entries.get(`${owner}:${requestId}`);
    if (!entry) throw new PocketTransferError('UNKNOWN_REQUEST');
    return entry;
  }
  approve(owner, requestId, displayedRecipient, displayedUnits, explicitHumanApproval) {
    const entry = this.#entry(owner, requestId);
    if (entry.state !== 'DRAFT') throw new PocketTransferError('INVALID_STATE');
    if (explicitHumanApproval !== true || displayedRecipient !== entry.intent.recipient || String(displayedUnits) !== entry.intent.baseUnits) {
      throw new PocketTransferError('APPROVAL_MISMATCH');
    }
    entry.state = 'APPROVED';
    return structuredClone(entry);
  }
  recordSigned(owner, requestId, signature) {
    const entry = this.#entry(owner, requestId);
    if (entry.state !== 'APPROVED') throw new PocketTransferError('INVALID_STATE');
    if (typeof signature !== 'string' || signature.length < 80 || signature.length > 90 || ![...signature].every(c => BASE58.includes(c))) {
      throw new PocketTransferError('INVALID_SIGNATURE');
    }
    entry.signature = signature; // durable database MUST save this before any actual broadcast
    entry.state = 'SIGNED';
    return structuredClone(entry);
  }
  beginBroadcast(owner, requestId) {
    const entry = this.#entry(owner, requestId);
    if (entry.state !== 'SIGNED' || !entry.signature || entry.sendAttempts !== 0) throw new PocketTransferError('DO_NOT_REBROADCAST');
    entry.sendAttempts = 1;
    entry.state = 'SUBMITTED_UNVERIFIED';
    return structuredClone(entry);
  }
  reconcile(owner, requestId, result) {
    const entry = this.#entry(owner, requestId);
    if (!['SUBMITTED_UNVERIFIED', 'REVIEW_REQUIRED'].includes(entry.state)) throw new PocketTransferError('INVALID_STATE');
    if (result?.signature !== entry.signature) throw new PocketTransferError('SIGNATURE_MISMATCH');
    if (result?.status === 'finalized' && result?.verifiedMatch === true) entry.state = 'FINALIZED';
    else entry.state = 'REVIEW_REQUIRED'; // unknown, failed RPC, missing proof -> never automatic resend
    return structuredClone(entry);
  }
  cancel(owner, requestId) {
    const entry = this.#entry(owner, requestId);
    if (!['DRAFT', 'APPROVED'].includes(entry.state)) throw new PocketTransferError('MUST_RECONCILE_FIRST');
    entry.state = 'CANCELLED';
    return structuredClone(entry);
  }
}
