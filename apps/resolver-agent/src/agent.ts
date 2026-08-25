import {
  Chain,
  Identity,
  Verdict,
  buildEvidence,
  buildMetadata,
  toHex,
  verifyQuestion,
  type Market,
  type QuestionDocument,
} from "@verdict/sdk";

import type { AgentConfig } from "./config.js";
import { sourceById } from "./sources/index.js";

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

  register(name: string, description: string) {
    return this.identity.register(buildMetadata(name, description));
  }

  /**
   * Fail at startup rather than at the first submission — both of these are
   * checked by the contract, and a mismatch is a configuration mistake that
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

  /**
   * Read the market's question and check it against the hash the contract
   * holds.
   *
   * This is the gate. The hash is what makes "the criteria cannot change after
   * people stake" true, and it only means anything if someone refuses to
   * proceed when it fails. Staking a bond against a document that is not the
   * one people bet on is worse than not resolving at all.
   */
  async loadQuestion(market: Market): Promise<QuestionDocument> {
    const result = verifyQuestion(market.question_uri, market.question_hash);
    if (!result.ok || !result.doc) {
      throw new Error(`refusing to resolve — ${result.reason}`);
    }
    return result.doc;
  }

  async resolveMarket(agentId: number, market: Market): Promise<ResolveResult> {
    const question = await this.loadQuestion(market);
    const source = sourceById(this.cfg.source);

    const finding = await source.resolve({
      chain: this.chain,
      question,
      anthropicApiKey: this.cfg.anthropicApiKey,
    });

    const evidence = buildEvidence({
      schema: "verdict.evidence/1",
      market: market.id.toString(),
      agent: agentId,
      questionHash: toHex(market.question_hash),
      outcome: finding.outcome,
      source: source.id,
      sourceClass: source.sourceClass,
      reasoning: finding.reasoning,
      observed: finding.observed,
      sources: finding.sources,
      observedAt: new Date().toISOString(),
      ...(finding.caveat ? { caveat: finding.caveat } : {}),
    });

    const { value: weight, hash } = await this.verdict.submitOutcome({
      agentId,
      marketId: market.id,
      outcome: finding.outcome,
      evidenceUri: evidence.uri,
      evidenceHash: Buffer.from(evidence.hash),
    });

    return {
      marketId: market.id.toString(),
      outcome: finding.outcome,
      weight,
      evidenceHash: evidence.hashHex,
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
          `  market #${r.marketId} -> ${r.outcome === 1 ? "YES" : "NO"} ` +
            `at ${(r.weight / 100).toFixed(2)}x   tx ${r.tx}`,
        );
        results.push(r);
      } catch (err) {
        // A question this source cannot answer, or one whose document does not
        // verify, is a normal condition — skip it and keep working on the rest.
        log(`  market #${m.id} skipped: ${(err as Error).message}`);
      }
    }
    return results;
  }

  async watch(agentId: number, log = console.log): Promise<void> {
    log(`watching every ${this.cfg.pollInterval}s — ctrl-c to stop`);
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
