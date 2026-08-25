/**
 * The evidence document a resolver submits alongside its outcome.
 *
 * The point is not that evidence proves the answer — for a `research` question
 * nothing can. The point is that the claim, the observation behind it and the
 * places it came from are pinned to a hash before the outcome is known, so
 * anyone can later check whether the reasoning matches what happened.
 */

import { canonicalJson, fromDataUri, sha256, toDataUri } from "./canonical";
import { toHex, type SourceClass } from "./question";

export interface EvidenceDocument {
  schema: "verdict.evidence/1";
  market: string;
  agent: number;
  /** Hash of the question this answers, so evidence cannot be moved between
   *  markets and still verify. */
  questionHash: string;
  outcome: number;
  source: string;
  /** Carried through from the question. Tells a reader how far the evidence
   *  can be trusted before they read a word of it. */
  sourceClass: SourceClass;
  /** What was observed and how it maps to the outcome. */
  reasoning: string;
  /** The raw observation, so a reader can re-check rather than take the word. */
  observed: Record<string, unknown>;
  /** Where it came from. URLs, contract ids, ledger numbers. */
  sources: string[];
  observedAt: string;
  /** Present when the source could not be certain. Absent means the source
   *  claims no material doubt — not that none exists. */
  caveat?: string;
}

export interface Evidence {
  doc: EvidenceDocument;
  canonical: string;
  hash: Uint8Array;
  hashHex: string;
  uri: string;
}

export function buildEvidence(doc: EvidenceDocument): Evidence {
  const canonical = canonicalJson(doc);
  const hash = sha256(canonical);
  return { doc, canonical, hash, hashHex: toHex(hash), uri: toDataUri(canonical) };
}

export function decodeEvidence(uri: string): EvidenceDocument {
  const doc = JSON.parse(fromDataUri(uri)) as EvidenceDocument;
  if (doc?.schema !== "verdict.evidence/1") {
    throw new Error(`Unexpected evidence schema: ${String(doc?.schema)}`);
  }
  return doc;
}

/**
 * Re-derive the hash from a submitted URI.
 *
 * Without this an agent could submit one document and show you another later;
 * the hash is the only thing that makes the submitted reasoning binding.
 */
export function verifyEvidence(uri: string, expected: Uint8Array | string): boolean {
  let doc: EvidenceDocument;
  try {
    doc = decodeEvidence(uri);
  } catch {
    return false;
  }
  const want = typeof expected === "string" ? expected : toHex(expected);
  return toHex(sha256(canonicalJson(doc))) === want;
}
