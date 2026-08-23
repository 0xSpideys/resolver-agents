import { Chain, sv } from "./chain.js";
import type { AgentConfig } from "./config.js";

export type MarketState =
  | "Open"
  | "Resolving"
  | "Tallied"
  | "Disputed"
  | "Settled"
  | "Void";

/**
 * Soroban decodes a unit-variant enum to a single-element array of its variant
 * name (`["Resolving"]`), not to the bare string. Normalise on the way in so
 * nothing downstream has to know that.
 */
function decodeState(raw: unknown): MarketState {
  if (Array.isArray(raw)) return raw[0] as MarketState;
  return raw as MarketState;
}

export interface Market {
  id: bigint;
  token: string;
  question_uri: string;
  outcome_count: number;
  close_ts: bigint;
  resolve_deadline: bigint;
  challenge_deadline: bigint;
  state: MarketState;
  provisional_outcome: number;
  final_outcome: number;
  total_staked: bigint;
  resolver_bond: bigint;
}

export interface Submission {
  agent_id: number;
  outcome: number;
  weight: number;
  evidence_uri: string;
  evidence_hash: Uint8Array;
  bond: bigint;
  settled: boolean;
}

/** Read/write access to the Verdict market contract. */
export class Verdict {
  constructor(
    private chain: Chain,
    private cfg: AgentConfig,
  ) {}

  marketCount(): Promise<bigint> {
    return this.chain.read<bigint>(this.cfg.verdict, "market_count");
  }

  async getMarket(id: bigint): Promise<Market> {
    const m = await this.chain.read<Market>(this.cfg.verdict, "get_market", [
      sv.u64(id),
    ]);
    return { ...m, state: decodeState(m.state) };
  }

  getSubmission(id: bigint, agentId: number): Promise<Submission | null> {
    return this.chain.read<Submission | null>(this.cfg.verdict, "get_submission", [
      sv.u64(id),
      sv.u32(agentId),
    ]);
  }

  getWeight(agentId: number): Promise<number> {
    return this.chain.read<number>(this.cfg.verdict, "get_weight", [sv.u32(agentId)]);
  }

  getStats(agentId: number): Promise<{ correct: number; wrong: number }> {
    return this.chain.read(this.cfg.verdict, "get_agent_stats", [sv.u32(agentId)]);
  }

  submitOutcome(args: {
    agentId: number;
    marketId: bigint;
    outcome: number;
    evidenceUri: string;
    evidenceHash: Buffer;
  }) {
    return this.chain.send<number>(this.cfg.verdict, "submit_outcome", [
      sv.address(this.chain.publicKey),
      sv.u32(args.agentId),
      sv.u64(args.marketId),
      sv.u32(args.outcome),
      sv.string(args.evidenceUri),
      sv.bytes32(args.evidenceHash),
    ]);
  }

  /**
   * Markets this agent could resolve right now: closed to trading, inside the
   * resolve window, and not already submitted to by this agent.
   */
  async resolvable(agentId: number): Promise<Market[]> {
    const count = await this.marketCount();
    const now = BigInt(Math.floor(Date.now() / 1000));
    const out: Market[] = [];

    for (let i = 0n; i < count; i++) {
      let m: Market;
      try {
        m = await this.getMarket(i);
      } catch {
        continue; // archived or unreadable; not this agent's problem
      }
      if (m.state !== "Resolving") continue;
      if (now >= m.resolve_deadline) continue;
      if (await this.getSubmission(i, agentId)) continue;
      out.push(m);
    }
    return out;
  }
}
