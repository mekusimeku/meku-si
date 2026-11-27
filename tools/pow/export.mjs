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
import { BUNDLE_FORMAT, MAX_EVIDENCE_BYTES, extractAttachmentUrls, extractRecords, isLedgerUrl, rosterFromComments, sameLogin, sha256Hex } from "./lib.mjs";

export const EXPORTER_VERSION = "meku.pow-export/1";
const MAX_PAGES = 10;

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

const allowedAssetHost = (host) => host === "github.com" || host.endsWith(".githubusercontent.com");

export async function exportLedger({ issueUrl, outDir, fetchImpl = fetch, token, now = () => new Date(), expectOperator = "mekusimeku" }) {
  const { owner, repo, number } = parseIssueUrl(issueUrl);
  if (existsSync(outDir) && readdirSync(outDir).length) throw new Error(`${outDir} is not empty`);
  const apiHeaders = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": EXPORTER_VERSION,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const comments = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments?per_page=100&page=${page}`;
    const response = await fetchImpl(url, { headers: apiHeaders, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GitHub API answered HTTP ${response.status} for comments page ${page}`);
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
    if (page === MAX_PAGES) throw new Error("more than 1000 comments; refusing a partial export");
  }

  mkdirSync(join(outDir, "evidence"), { recursive: true });
  const evidenceFiles = [];
  // Only the roster human's evidence comment is downloaded, so strangers cannot make the
  // exporter fetch their files.
  const { human } = rosterFromComments(comments, { expectOperator });
  for (const comment of comments) {
    const isEvidence = extractRecords(comment.body).some((f) => f.record?.type === "evidence_submitted");
    if (!isEvidence || !human || !sameLogin(comment.author, human)) continue;
    for (const url of extractAttachmentUrls(comment.body)) {
      // Attachment downloads never carry the API token. A failed download is recorded, not
      // fatal: the verifier then reports the evidence as missing (E02).
      try {
        const response = await fetchImpl(url, { headers: { "User-Agent": EXPORTER_VERSION }, redirect: "follow", signal: AbortSignal.timeout(60_000) });
        const finalHost = new URL(response.url || url).hostname;
        if (!allowedAssetHost(finalHost)) throw new Error(`attachment redirected to an unexpected host: ${finalHost}`);
        if (!response.ok) throw new Error(`attachment download answered HTTP ${response.status}`);
        const bytes = await readCapped(response, MAX_EVIDENCE_BYTES);
        const sha256 = sha256Hex(bytes);
        const ext = bytes[0] === 0x89 ? "png" : bytes[0] === 0xff ? "jpg" : "bin";
        const file = `evidence/${sha256}.${ext}`;
        writeFileSync(join(outDir, file), bytes);
        evidenceFiles.push({ comment_id: comment.id, url, file, sha256, bytes: bytes.length, content_type: response.headers.get("content-type") });
      } catch (error) {
        evidenceFiles.push({ comment_id: comment.id, url, file: null, error: error.message });
      }
    }
  }
  const bundle = {
    format: BUNDLE_FORMAT,
    source: { repo: `${owner}/${repo}`, issue_number: number, issue_url: issueUrl, exported_at: now().toISOString(), exporter: EXPORTER_VERSION },
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
    console.log(`Exported ${bundle.comments.length} comments and ${bundle.evidence_files.length} evidence file(s) to ${outDir}/`);
    console.log(`Next: node tools/pow/verify.mjs ${outDir}/bundle.json`);
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
