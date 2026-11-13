/** READ-ONLY; NEVER signs, sends, or authorizes transfers. */
const MINT = 'J5h8bqFW7tncH2LM3ZvFxd1kZV2AJ4rq44Puc1sGpump';
const TOKEN_2022 = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export function validateMintSnapshot(body) {
  if (!body || body.jsonrpc !== '2.0' || body.error || !Number.isSafeInteger(body.result?.context?.slot)) throw Error('INVALID_RPC_RESPONSE');
  const a = body.result?.value;
  if (!a || a.owner !== TOKEN_2022 || a.executable !== false || a.data?.program !== 'spl-token-2022' || a.data?.parsed?.type !== 'mint') throw Error('NOT_EXPECTED_TOKEN_2022_MINT');
  const info = a.data.parsed.info;
  if (!info || info.isInitialized !== true || info.decimals !== 6 || !Number.isSafeInteger(info.supply === undefined ? NaN : Number(info.supply)) && !/^\d+$/.test(String(info.supply))) throw Error('MINT_NOT_INITIALIZED_OR_DECIMALS');
  if (info.extensions !== undefined && !Array.isArray(info.extensions)) throw Error('UNPARSEABLE_EXTENSIONS');
  const extensions = (info.extensions ?? []).map(e => {
    if (typeof e?.extension !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(e.extension)) throw Error('UNKNOWN_EXTENSION_FORMAT');
    return e.extension;
  });
  if (new Set(extensions).size !== extensions.length) throw Error('DUPLICATE_EXTENSION');
  return Object.freeze({slot:body.result.context.slot,mint:MINT,owner:a.owner,decimals:info.decimals,extensions,transferApproval:'BLOCKED_PENDING_INDEPENDENT_REVIEW'});
}
export async function inspectLiveMint({endpoint='https://api.mainnet-beta.solana.com',fetchFn=fetch}={}) {
  if (endpoint !== 'https://api.mainnet-beta.solana.com') throw Error('UNAPPROVED_ENDPOINT');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetchFn(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getAccountInfo',params:[MINT,{encoding:'jsonParsed',commitment:'finalized'}]}),signal:controller.signal});
    if (!res.ok) throw Error('RPC_HTTP_ERROR');
    const text = await res.text();
    if (text.length > 100000) throw Error('RPC_RESPONSE_TOO_LARGE');
    return validateMintSnapshot(JSON.parse(text));
  } finally {clearTimeout(timeout)}
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  inspectLiveMint().then(r => console.log(JSON.stringify(r))).catch(e => {console.error('FAIL_CLOSED:',e.message);process.exitCode=1});
}
