#!/usr/bin/env node
// Exports a public MEKU proof-of-work ledger (a GitHub issue) into an offline bundle:
// bundle.json with the comment fields the verifier needs, as GitHub serves them (including
// the numeric user id, which survives a login rename), plus the human's evidence image.
// Deleted comments are not returned by GitHub's API, so an export cannot show them.
// Uses GitHub's public REST API; works without a token (60 requests per hour). An optional
// GITHUB_TOKEN raises the limit and is only ever sent to api.github.com.

import { mkdirSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { BUNDLE_FORMAT, MAX_EVIDENCE_BYTES, extractAttachmentUrls, isLedgerUrl, readRecordComment, rosterFromComments, sameLogin, sha256Hex } from "./lib.mjs";

export const EXPORTER_VERSION = "meku.pow-export/2";
// Up to 10,000 comments, so that a crowd of outside comments cannot make a ledger unexportable
// (beyond 60 pages GitHub's anonymous rate limit needs a GITHUB_TOKEN).
const MAX_PAGES = 100;
const MAX_ATTACHMENTS = 20;

const apiHeaders = (token) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": EXPORTER_VERSION,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

const COMMENT_LINK = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/(?:issues|pull)\/\d{1,9}#issuecomment-(\d{1,15})$/;

/** Reads one public comment, for checking how a record posted from a phone will be read. */
export async function fetchComment(link, { fetchImpl = fetch, token, timeoutMs = 30_000 } = {}) {
  const match = String(link).match(COMMENT_LINK);
  if (!match) throw new Error("Give a comment link: https://github.com/<owner>/<repo>/issues/<n>#issuecomment-<id> (also /pull/<n>)");
  const [, owner, repo, id] = match;
  let response;
  let c;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/issues/comments/${id}`, {
      headers: apiHeaders(token),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      await discard(response);
      throw new Error(`GitHub API answered HTTP ${response.status} for that comment`);
    }
    c = await response.json();
  } catch (error) {
    throw networkError(error, "api.github.com", "reading the comment", timeoutMs);
  }
  return { id: c.id, author: c.user?.login ?? null, created_at: c.created_at, updated_at: c.updated_at, html_url: c.html_url, body: c.body ?? "" };
}

function parseIssueUrl(issueUrl) {
  if (!isLedgerUrl(issueUrl)) throw new Error("Give the ledger as https://github.com/<owner>/<repo>/issues/<number>");
  const [, owner, repo, , number] = new URL(issueUrl).pathname.split("/");
  return { owner, repo, number: Number(number) };
}

async function readCapped(response, cap) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new Error(`download exceeds ${cap} bytes`);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// GitHub serves attachments from github.com, its githubusercontent.com hosts and its own asset
// bucket on Amazon S3: on 28 November 2026 a download without a session was redirected from
// github.com/user-attachments to that bucket. Only GitHub's exact bucket is allowed, never S3 in
// general, and only after github.com itself redirected there.
const GITHUB_ASSET_BUCKETS = new Set(["github-production-user-asset-6210df.s3.amazonaws.com"]);
const allowedAssetHost = (host) => host === "github.com" || host.endsWith(".githubusercontent.com") || GITHUB_ASSET_BUCKETS.has(host);
const MAX_REDIRECTS = 5;
// An answer that is not read must be cancelled: otherwise its open connection keeps the command
// running after it has already printed its error, which looks like a hang.
const discard = (response) => response?.body?.cancel().catch(() => {});

/**
 * A network failure, said plainly: which host, which step, and for a timeout how long it waited.
 * Errors that already explain themselves (an HTTP status, a refused host) pass through unchanged.
 */
function networkError(error, host, step, timeoutMs) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError")
    return new Error(`no complete answer from ${host} within ${Math.round(timeoutMs / 1000)} s while ${step}`);
  if (error instanceof TypeError) {
    const cause = error.cause?.code ?? error.cause?.message ?? error.message;
    return new Error(`could not reach ${host} while ${step}: ${cause}`);
  }
  return error;
}

/**
 * Downloads one GitHub attachment without any token, refusing other hosts and large files.
 * Redirects are followed one at a time, so a hop to any host other than GitHub's is refused
 * before it is requested, and onStep can report every hop as it happens.
 */
export async function downloadAttachment(url, { fetchImpl = fetch, timeoutMs = 60_000, onStep = () => {} } = {}) {
  if (extractAttachmentUrls(url).length !== 1 || extractAttachmentUrls(url)[0] !== url) throw new Error("not a GitHub attachment URL");
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const host = new URL(current).hostname;
    if (!allowedAssetHost(host)) throw new Error(`attachment redirected to an unexpected host: ${host}`);
    onStep(hop === 0 ? `asking ${host}` : `redirected to ${host}`);
    let response;
    try {
      response = await fetchImpl(current, { headers: { "User-Agent": EXPORTER_VERSION }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      throw networkError(error, host, "downloading the attachment", timeoutMs);
    }
    // A fetch that followed redirects itself still has to end on GitHub.
    const answeredBy = new URL(response.url || current).hostname;
    if (!allowedAssetHost(answeredBy)) {
      await discard(response);
      throw new Error(`attachment redirected to an unexpected host: ${answeredBy}`);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await discard(response);
      if (!location) throw new Error(`${host} answered HTTP ${response.status} without saying where to go`);
      current = new URL(location, current).toString();
      continue;
    }
    if (!response.ok) {
      await discard(response);
      throw new Error(`attachment download answered HTTP ${response.status} (${host})`);
    }
    try {
      const bytes = await readCapped(response, MAX_EVIDENCE_BYTES);
      return { bytes, contentType: response.headers.get("content-type"), host };
    } catch (error) {
      throw networkError(error, host, "downloading the attachment", timeoutMs);
    }
  }
  throw new Error(`the attachment was redirected more than ${MAX_REDIRECTS} times`);
}

export async function exportLedger({ issueUrl, outDir, fetchImpl = fetch, token, now = () => new Date(), expectOperator = "mekusimeku" }) {
  const { owner, repo, number } = parseIssueUrl(issueUrl);
  if (existsSync(outDir) && readdirSync(outDir).length) throw new Error(`${outDir} is not empty`);
  const headers = apiHeaders(token);
  // The issue itself: never a pull request, and GitHub's own spelling of its address, so that a
  // verifier who types different capitals still checks the request text against the same URL.
  const issueResponse = await fetchImpl(`https://api.github.com/repos/${owner}/${repo}/issues/${number}`, { headers, signal: AbortSignal.timeout(30_000) });
  if (!issueResponse.ok) {
    await discard(issueResponse);
    throw new Error(`GitHub API answered HTTP ${issueResponse.status} for the issue`);
  }
  const issue = await issueResponse.json();
  if (issue?.pull_request) throw new Error("that number is a pull request, not an issue; a ledger is an issue");
  const canonicalUrl = typeof issue?.html_url === "string" && isLedgerUrl(issue.html_url) ? issue.html_url : issueUrl;
  const comments = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments?per_page=100&page=${page}`;
    const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      await discard(response);
      throw new Error(`GitHub API answered HTTP ${response.status} for comments page ${page}`);
    }
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error("GitHub API answer is not a list of comments");
    for (const c of batch)
      comments.push({
        id: c.id,
        author: c.user?.login ?? null,
        user_id: c.user?.id ?? null,
        author_association: c.author_association ?? null,
        created_at: c.created_at,
        updated_at: c.updated_at,
        html_url: c.html_url,
        body: c.body ?? "",
      });
    if (batch.length < 100) break;
    if (page === MAX_PAGES) throw new Error(`more than ${MAX_PAGES * 100} comments; refusing a partial export`);
  }

  mkdirSync(join(outDir, "evidence"), { recursive: true });
  const evidenceFiles = [];
  // Every attachment in a participant's comment is downloaded, so that the verifier can check
  // each image for metadata, not only the evidence. A stranger's files are never fetched.
  const roster = rosterFromComments(comments, { expectOperator });
  const participants = [roster.operator, roster.developer, roster.human].filter((login) => typeof login === "string");
  // The human's evidence comes first and never counts against the limit, so that a crowd of
  // other images can never push the evidence out of the bundle.
  const isEvidence = (comment) => sameLogin(comment.author, roster.human) && readRecordComment(comment.body)?.record?.type === "evidence_submitted";
  const order = [...comments.filter(isEvidence), ...comments.filter((c) => !isEvidence(c))];
  for (const comment of order) {
    if (!participants.some((login) => sameLogin(comment.author, login))) continue;
    for (const url of extractAttachmentUrls(comment.body)) {
      if (!isEvidence(comment) && evidenceFiles.filter((e) => e.file && !e.evidence).length >= MAX_ATTACHMENTS) {
        evidenceFiles.push({ comment_id: comment.id, url, file: null, error: `more than ${MAX_ATTACHMENTS} attachments; not downloaded` });
        continue;
      }
      // Attachment downloads never carry the API token. A failed download is recorded, not
      // fatal: the verifier then reports the file as not checked.
      try {
        const { bytes, contentType } = await downloadAttachment(url, { fetchImpl });
        const sha256 = sha256Hex(bytes);
        const ext = bytes[0] === 0x89 ? "png" : bytes[0] === 0xff ? "jpg" : "bin";
        const file = `evidence/${sha256}.${ext}`;
        writeFileSync(join(outDir, file), bytes);
        evidenceFiles.push({ comment_id: comment.id, url, file, sha256, bytes: bytes.length, content_type: contentType, ...(isEvidence(comment) ? { evidence: true } : {}) });
      } catch (error) {
        evidenceFiles.push({ comment_id: comment.id, url, file: null, error: error.message });
      }
    }
  }
  const bundle = {
    format: BUNDLE_FORMAT,
    source: { repo: `${owner}/${repo}`, issue_number: number, issue_url: canonicalUrl, exported_at: now().toISOString(), exporter: EXPORTER_VERSION },
    comments,
    evidence_files: evidenceFiles,
  };
  writeFileSync(join(outDir, "bundle.json"), `${JSON.stringify(bundle, null, 2)}\n`);
  return bundle;
}

async function main(argv) {
  const [issueUrl, outDir = "pow-ledger"] = argv;
  if (!issueUrl) {
    console.error("Usage: node tools/pow/export.mjs <ledger-issue-url> [out-dir]\nThen: node tools/pow/verify.mjs <out-dir>/bundle.json");
    return 3;
  }
  try {
    const bundle = await exportLedger({ issueUrl, outDir, token: process.env.GITHUB_TOKEN || undefined });
    console.log(`Exported ${bundle.comments.length} comments and ${bundle.evidence_files.length} attachment(s) to ${outDir}/`);
    console.log(`Next: node tools/pow/verify.mjs ${outDir}/bundle.json`);
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
