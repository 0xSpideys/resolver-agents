import { Chain, sv } from "./chain.js";
import type { ChainConfig } from "./config.js";

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
  creator: string;
  token: string;
  question_uri: string;
  question_hash: Uint8Array;
  outcome_count: number;
  close_ts: bigint;
  resolve_deadline: bigint;
  challenge_deadline: bigint;
  state: MarketState;
  provisional_outcome: number;
  final_outcome: number;
  total_staked: bigint;
  bond_pool: bigint;
  distributable: bigint;
  resolver_pool: bigint;
  resolvers_settled: boolean;
  fee_bps: number;
  resolver_fee_bps: number;
  resolver_bond: bigint;
}

export interface Challenge {
  challenger: string;
  bond: bigint;
  reason_uri: string;
  raised_at: bigint;
}

export interface AgentStats {
  correct: number;
  wrong: number;
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
    private cfg: ChainConfig,
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

  getSubmissions(id: bigint): Promise<Submission[]> {
    return this.chain.read<Submission[]>(this.cfg.verdict, "get_submissions", [sv.u64(id)]);
  }

  getPools(id: bigint): Promise<bigint[]> {
    return this.chain.read<bigint[]>(this.cfg.verdict, "get_pools", [sv.u64(id)]);
  }

  getPosition(id: bigint, user: string, outcome: number): Promise<bigint> {
    return this.chain.read<bigint>(this.cfg.verdict, "get_position", [
      sv.u64(id),
      sv.address(user),
      sv.u32(outcome),
    ]);
  }

  getChallenge(id: bigint): Promise<Challenge | null> {
    return this.chain.read<Challenge | null>(this.cfg.verdict, "get_challenge", [sv.u64(id)]);
  }

  quotePayout(id: bigint, outcome: number, stake: bigint): Promise<bigint> {
    return this.chain.read<bigint>(this.cfg.verdict, "quote_payout", [
      sv.u64(id),
      sv.u32(outcome),
      sv.i128(stake),
    ]);
  }

  /** Curator only. `questionHash` must be the sha256 of the question document. */
  createMarket(args: {
    token: string;
    questionUri: string;
    questionHash: Uint8Array;
    outcomeCount: number;
    closeTs: number;
  }) {
    return this.chain.send<bigint>(this.cfg.verdict, "create_market", [
      sv.address(args.token),
      sv.string(args.questionUri),
      sv.bytes32(args.questionHash),
      sv.u32(args.outcomeCount),
      sv.u64(args.closeTs),
    ]);
  }

  bet(user: string, id: bigint, outcome: number, amount: bigint) {
    return this.chain.send<bigint>(this.cfg.verdict, "bet", [
      sv.address(user),
      sv.u64(id),
      sv.u32(outcome),
      sv.i128(amount),
    ]);
  }

  closeMarket(id: bigint) {
    return this.chain.send<void>(this.cfg.verdict, "close_market", [sv.u64(id)]);
  }

  tally(id: bigint) {
    return this.chain.send<unknown>(this.cfg.verdict, "tally", [sv.u64(id)]);
  }

  finalize(id: bigint) {
    return this.chain.send<void>(this.cfg.verdict, "finalize", [sv.u64(id)]);
  }

  settleResolvers(id: bigint) {
    return this.chain.send<void>(this.cfg.verdict, "settle_resolvers", [sv.u64(id)]);
  }

  claim(user: string, id: bigint) {
    return this.chain.send<bigint>(this.cfg.verdict, "claim", [sv.address(user), sv.u64(id)]);
  }

  /** Every market, newest first. Fine at demo scale; an indexer replaces it. */
  async listMarkets(): Promise<Market[]> {
    const count = await this.marketCount();
    const out: Market[] = [];
    for (let i = count - 1n; i >= 0n; i--) {
      try {
        out.push(await this.getMarket(i));
      } catch {
        // Archived or unreadable entries are skipped rather than failing the list.
      }
    }
    return out;
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
