import { Chain } from "./chain.js";
import type { AgentConfig } from "./config.js";
import { buildEvidence } from "./evidence.js";
import { Identity, buildMetadata } from "./registry.js";
import { sourceById } from "./sources/index.js";
import { Verdict, type Market } from "./verdict.js";

export interface ResolveResult {
  marketId: string;
  outcome: number;
  weight: number;
  evidenceHash: string;
  tx: string;
}

export class Agent {
  readonly chain: Chain;
  readonly identity: Identity;
  readonly verdict: Verdict;

  constructor(private cfg: AgentConfig) {
    this.chain = new Chain(cfg);
    this.identity = new Identity(this.chain, cfg);
    this.verdict = new Verdict(this.chain, cfg);
  }

  get address(): string {
    return this.chain.publicKey;
  }

  /** Mint an 8004 identity for this keypair. */
  async register(name: string, description: string) {
    return this.identity.register(buildMetadata(name, description));
  }

  /**
   * Fail loudly at startup rather than at the first submission: the contract
   * checks both of these, and a mismatch here is a configuration mistake that
   * would otherwise surface as an opaque error mid-run.
   */
  async assertIdentity(agentId: number): Promise<void> {
    if (!(await this.identity.exists(agentId))) {
      throw new Error(`Agent #${agentId} is not registered on the identity registry.`);
    }
    const owner = await this.identity.owner(agentId);
    if (owner !== this.address) {
      throw new Error(
        `Agent #${agentId} is owned by ${owner}, not by this key (${this.address}).`,
      );
    }
  }

  /** Observe, build evidence, submit. One market, one submission. */
  async resolveMarket(agentId: number, market: Market): Promise<ResolveResult> {
    const source = sourceById(this.cfg.source);
    const finding = await source.resolve(market);
    const evidence = buildEvidence(market, agentId, source.id, finding);

    const { value: weight, hash } = await this.verdict.submitOutcome({
      agentId,
      marketId: market.id,
      outcome: finding.outcome,
      evidenceUri: evidence.uri,
      evidenceHash: evidence.hash,
    });

    return {
      marketId: market.id.toString(),
      outcome: finding.outcome,
      weight,
      evidenceHash: evidence.hash.toString("hex"),
      tx: hash,
    };
  }

  /** Resolve everything currently resolvable, once. */
  async tick(agentId: number, log = console.log): Promise<ResolveResult[]> {
    const markets = await this.verdict.resolvable(agentId);
    const results: ResolveResult[] = [];

    for (const m of markets) {
      try {
        const r = await this.resolveMarket(agentId, m);
        log(
          `  resolved market #${r.marketId} as ${r.outcome === 1 ? "YES" : "NO"} ` +
            `at weight ${(r.weight / 100).toFixed(2)}x  tx ${r.tx}`,
        );
        results.push(r);
      } catch (err) {
        // One bad market must not stop the agent working on the others — a
        // question this source cannot parse is a normal condition, not a crash.
        log(`  skipped market #${m.id}: ${(err as Error).message}`);
      }
    }
    return results;
  }

  /** Poll forever. Stops on SIGINT. */
  async watch(agentId: number, log = console.log): Promise<void> {
    log(`watching for resolvable markets every ${this.cfg.pollInterval}s — ctrl-c to stop`);
    let running = true;
    process.once("SIGINT", () => {
      log("\nstopping");
      running = false;
    });

    while (running) {
      try {
        const found = await this.tick(agentId, log);
        if (found.length === 0) log(`  nothing to resolve (${new Date().toISOString()})`);
      } catch (err) {
        log(`  poll failed: ${(err as Error).message}`);
      }
      await sleep(this.cfg.pollInterval * 1000);
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
