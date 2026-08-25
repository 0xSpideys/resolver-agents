/**
 * Canonical JSON and hashing, shared by every document Verdict commits to.
 *
 * Both the question and the evidence are hashed on-chain, and the hash is the
 * only thing binding a document to a market or a submission. So the byte
 * sequence being hashed has to be a function of the *content* alone — if it
 * depended on key insertion order, two parties holding the same facts would
 * compute different hashes and every verification would be a coin flip.
 *
 * Node and the browser both reach the same code path here; only the sha256
 * implementation differs, and both produce the same bytes.
 */

import { createHash } from "node:crypto";

/** JSON with keys sorted at every level and no incidental whitespace. */
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

export function sha256(input: string): Uint8Array {
  return new Uint8Array(createHash("sha256").update(input, "utf8").digest());
}

const DATA_URI_PREFIX = "data:application/json;base64,";

/**
 * Embed a document in its own URI.
 *
 * Hosting it somewhere would mean the evidence behind a settled market can go
 * dark, or quietly change, long after the money moved. Inline, the bytes travel
 * with the submission and the hash on-chain covers exactly what a reader
 * decodes.
 */
export function toDataUri(canonical: string): string {
  const b64 = Buffer.from(canonical, "utf8").toString("base64");
  const uri = `${DATA_URI_PREFIX}${b64}`;
  if (uri.length > 8_000) {
    throw new Error(
      `Document is ${uri.length} bytes as a data URI, over the 8KB practical limit. ` +
        `Shorten it, or host it and keep the same hash discipline.`,
    );
  }
  return uri;
}

export function fromDataUri(uri: string): string {
  if (!uri.startsWith(DATA_URI_PREFIX)) {
    throw new Error(`Not an inline document URI: ${uri.slice(0, 48)}…`);
  }
  return Buffer.from(uri.slice(DATA_URI_PREFIX.length), "base64").toString("utf8");
}

export function isDataUri(uri: string): boolean {
  return uri.startsWith(DATA_URI_PREFIX);
}
