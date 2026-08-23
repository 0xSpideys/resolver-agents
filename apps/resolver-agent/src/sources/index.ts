import type { Market } from "../verdict.js";

/** What a source concluded, and why. The `why` ends up in the evidence document. */
export interface Finding {
  /** 0 = NO, 1 = YES. */
  outcome: number;
  /** Human-readable statement of what was observed and how it maps to the outcome. */
  reasoning: string;
  /** Raw observation, so a reader can re-check the claim rather than trust it. */
  observed: Record<string, unknown>;
  /** Where the observation came from. A URL wherever possible. */
  sources: string[];
}

export interface ResolutionSource {
  readonly id: string;
  readonly description: string;
  resolve(market: Market): Promise<Finding>;
}

/**
 * Resolves from public Stellar network data.
 *
 * The demo question is of the form "will the network have passed ledger N by
 * the time this market closes". That is a deliberately boring question, and
 * that is the point: it is checkable by anyone against a public endpoint, with
 * no API key, no rate limit and no ambiguity about what the right answer was.
 * A flaky data source would make a resolution demo prove nothing.
 */
export class StellarLedgerSource implements ResolutionSource {
  readonly id = "stellar-ledger";
  readonly description =
    "Reads the latest closed ledger from Horizon and compares it against the threshold in the question.";

  constructor(private horizonUrl = "https://horizon-testnet.stellar.org") {}

  async resolve(market: Market): Promise<Finding> {
    const threshold = parseThreshold(market.question_uri);
    const url = `${this.horizonUrl}/ledgers?order=desc&limit=1`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Horizon returned ${res.status} for ${url}`);
    }
    const body = (await res.json()) as {
      _embedded: { records: { sequence: number; closed_at: string }[] };
    };
    const latest = body._embedded.records[0];
    if (!latest) {
      throw new Error("Horizon returned no ledgers");
    }

    const reached = latest.sequence >= threshold;
    return {
      outcome: reached ? 1 : 0,
      reasoning: `Latest closed ledger is ${latest.sequence}; the question asks whether the network passed ${threshold}. ${
        reached ? "It did" : "It did not"
      }, so the outcome is ${reached ? "YES" : "NO"}.`,
      observed: {
        latestLedger: latest.sequence,
        closedAt: latest.closed_at,
        threshold,
      },
      sources: [url],
    };
  }
}

/**
 * Deliberately wrong. Runs a real source, then reports the opposite.
 *
 * This exists so the penalty path can be demonstrated with a real agent rather
 * than a hand-typed CLI call. It is not a strategy — it is a test fixture that
 * happens to run as a process, and it should never be pointed at a market
 * anyone cares about.
 */
export class ContrarianSource implements ResolutionSource {
  readonly id = "contrarian";
  readonly description =
    "DEMO ONLY. Inverts a real finding so the slashing path can be shown end to end.";

  constructor(private inner: ResolutionSource = new StellarLedgerSource()) {}

  async resolve(market: Market): Promise<Finding> {
    const honest = await this.inner.resolve(market);
    return {
      outcome: honest.outcome === 1 ? 0 : 1,
      reasoning: `DEMO agent: deliberately reporting the opposite of the observed data. The honest reading was ${
        honest.outcome === 1 ? "YES" : "NO"
      }.`,
      observed: { ...honest.observed, deliberatelyInverted: true },
      sources: honest.sources,
    };
  }
}

/**
 * The threshold is carried in the question URI as `#ledger=N`.
 *
 * A real deployment would fetch and parse the question document that
 * `question_hash` commits to. This keeps the demo self-contained while leaving
 * the shape of the real thing visible: the source reads the question, it does
 * not have the answer wired into it.
 */
function parseThreshold(questionUri: string): number {
  const m = questionUri.match(/[#?&]ledger=(\d+)/);
  if (!m?.[1]) {
    throw new Error(
      `Cannot resolve "${questionUri}": expected a #ledger=<n> threshold in the question URI.`,
    );
  }
  return Number(m[1]);
}

export function sourceById(id: string): ResolutionSource {
  switch (id) {
    case "stellar-ledger":
      return new StellarLedgerSource();
    case "contrarian":
      return new ContrarianSource();
    default:
      throw new Error(`Unknown resolution source "${id}"`);
  }
}
