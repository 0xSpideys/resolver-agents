import { createHash } from "node:crypto";

import type { Finding } from "./sources/index.js";
import type { Market } from "./verdict.js";

export interface EvidenceDocument {
  schema: "verdict.evidence/1";
  market: string;
  agent: number;
  question_uri: string;
  outcome: number;
  source: string;
  reasoning: string;
  observed: Record<string, unknown>;
  sources: string[];
  observed_at: string;
}

export interface Evidence {
  doc: EvidenceDocument;
  /** Canonical JSON — what the hash is taken over. */
  canonical: string;
  /** sha256 of `canonical`, submitted on-chain alongside the URI. */
  hash: Buffer;
  /** Self-contained `data:` URI, so the evidence needs no hosting to be read. */
  uri: string;
}

/**
 * Build the evidence document an agent submits with its outcome.
 *
 * The document is embedded in the URI as a base64 data URI rather than hosted.
 * That means the evidence can never rot, disappear behind a dead link, or be
 * quietly edited after submission — the hash on-chain commits to bytes anyone
 * can decode straight out of the contract. It costs a larger `evidence_uri`
 * string, which is the right trade for a demo and for small documents
 * generally; anything large belongs on IPFS with the same hash discipline.
 */
export function buildEvidence(
  market: Market,
  agentId: number,
  sourceId: string,
  finding: Finding,
): Evidence {
  const doc: EvidenceDocument = {
    schema: "verdict.evidence/1",
    market: market.id.toString(),
    agent: agentId,
    question_uri: market.question_uri,
    outcome: finding.outcome,
    source: sourceId,
    reasoning: finding.reasoning,
    observed: finding.observed,
    sources: finding.sources,
    observed_at: new Date().toISOString(),
  };

  const canonical = canonicalJson(doc);
  const hash = createHash("sha256").update(canonical, "utf8").digest();
  const uri = `data:application/json;base64,${Buffer.from(canonical, "utf8").toString("base64")}`;

  return { doc, canonical, hash, uri };
}

/**
 * Stable JSON: keys sorted at every level, no incidental whitespace.
 *
 * Without this the hash depends on key insertion order, so two agents
 * observing identical facts could commit to different hashes and a verifier
 * re-serialising the document would compute a third.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

const DATA_URI_PREFIX = "data:application/json;base64,";

/** Decode a self-contained evidence URI back into its document. */
export function decodeEvidence(uri: string): EvidenceDocument {
  if (!uri.startsWith(DATA_URI_PREFIX)) {
    throw new Error(`Not an inline evidence URI: ${uri.slice(0, 40)}…`);
  }
  const json = Buffer.from(uri.slice(DATA_URI_PREFIX.length), "base64").toString("utf8");
  return JSON.parse(json) as EvidenceDocument;
}

/**
 * Re-derive the hash from a submitted URI, to check a claim you did not make.
 *
 * The hash is the only thing binding a document to a submission — without this
 * check an agent could submit one document and later show you another.
 */
export function verifyEvidence(uri: string, expectedHash: Buffer): boolean {
  let doc: EvidenceDocument;
  try {
    doc = decodeEvidence(uri);
  } catch {
    return false;
  }
  const recomputed = createHash("sha256").update(canonicalJson(doc), "utf8").digest();
  return recomputed.equals(expectedHash);
}
