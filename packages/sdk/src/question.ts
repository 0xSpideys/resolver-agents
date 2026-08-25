/**
 * The question document.
 *
 * A market stores two things about its question: a URI and a sha256. The hash
 * is what makes "the criteria cannot change after people stake" true — but only
 * if something actually checks it. Before this module the hash was a placeholder
 * and nothing verified anything, so the guarantee was decorative.
 *
 * Now: the curator builds a document, the hash of its canonical form goes
 * on-chain, and a resolver refuses to submit against a market whose document
 * does not hash to what the contract holds.
 */

import { canonicalJson, sha256, toDataUri, fromDataUri } from "./canonical";

/**
 * How trustworthy a resolution can possibly be, independent of who resolves it.
 *
 * This is a property of the *question*, not of the agent. Stating it up front
 * keeps the protocol honest: some answers can be re-derived by anyone at any
 * time, and some rest on an agent having looked and reported truthfully. A
 * system that blurs the two is claiming a guarantee it does not have.
 */
export type SourceClass =
  /** Re-derivable on-chain by anyone, forever. A lie is provable. */
  | "onchain"
  /** A public endpoint anyone can query. Verifiable if the provider is honest
   *  and still serving the same answer. */
  | "public-api"
  /** Judgement over open sources. Not reproducible. Only the bond, the
   *  reputation and the challenge window stand behind it. */
  | "research";

/** Comparison a numeric question resolves on. */
export type Comparator = "gt" | "gte" | "lt" | "lte";

export type Resolution =
  | {
      kind: "reflector";
      /** Reflector oracle contract id. */
      oracle: string;
      /** Asset symbol as the oracle names it, e.g. "XLM". */
      asset: string;
      comparator: Comparator;
      /** Threshold in whole units, as a decimal string. */
      threshold: string;
      /** Resolve against the price at this unix second, not "latest" —
       *  otherwise two agents reading minutes apart can disagree honestly. */
      at: number;
    }
  | {
      kind: "open-meteo";
      latitude: number;
      longitude: number;
      /** ISO date, e.g. "2026-08-25". */
      date: string;
      /** Open-Meteo daily variable, e.g. "temperature_2m_max". */
      metric: string;
      timezone: string;
      comparator: Comparator;
      threshold: string;
    }
  | {
      kind: "research";
      /** What the agent must determine, stated so two careful readers agree. */
      claim: string;
      /** Where to look. Guidance, not a whitelist. */
      guidance: string;
    };

export interface QuestionDocument {
  schema: "verdict.question/1";
  title: string;
  /** Full statement, including what counts as YES and what counts as NO. */
  criteria: string;
  sourceClass: SourceClass;
  resolution: Resolution;
  /** Unix second after which the answer is considered knowable. */
  knowableAt: number;
}

export interface Question {
  doc: QuestionDocument;
  canonical: string;
  /** sha256 over `canonical`, hex. This is what goes on-chain. */
  hashHex: string;
  hash: Uint8Array;
  /** Self-contained URI. No hosting to keep alive, nothing to rot. */
  uri: string;
}

export function buildQuestion(doc: QuestionDocument): Question {
  const canonical = canonicalJson(doc);
  const hash = sha256(canonical);
  return {
    doc,
    canonical,
    hash,
    hashHex: toHex(hash),
    uri: toDataUri(canonical),
  };
}

export function decodeQuestion(uri: string): QuestionDocument {
  const doc = JSON.parse(fromDataUri(uri)) as QuestionDocument;
  if (doc?.schema !== "verdict.question/1") {
    throw new Error(`Unexpected question schema: ${String(doc?.schema)}`);
  }
  return doc;
}

/**
 * Check a market's question against the hash the contract holds.
 *
 * A resolver calls this before doing any work. If it fails, the document being
 * shown is not the one people staked against — refuse rather than guess which
 * of the two is real.
 */
export function verifyQuestion(
  uri: string,
  onChainHash: Uint8Array | string,
): { ok: boolean; doc?: QuestionDocument; reason?: string } {
  let doc: QuestionDocument;
  try {
    doc = decodeQuestion(uri);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
  const expected = typeof onChainHash === "string" ? onChainHash : toHex(onChainHash);
  const actual = toHex(sha256(canonicalJson(doc)));
  if (actual !== expected) {
    return {
      ok: false,
      doc,
      reason: `question hash mismatch: document hashes to ${actual}, contract holds ${expected}`,
    };
  }
  return { ok: true, doc };
}

/** Apply the document's comparator. Kept here so every source agrees. */
export function compare(observed: number, comparator: Comparator, threshold: number): boolean {
  switch (comparator) {
    case "gt":
      return observed > threshold;
    case "gte":
      return observed >= threshold;
    case "lt":
      return observed < threshold;
    case "lte":
      return observed <= threshold;
  }
}

export function comparatorText(c: Comparator): string {
  return { gt: "above", gte: "at or above", lt: "below", lte: "at or below" }[c];
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}
