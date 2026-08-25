#!/usr/bin/env node
import { Agent } from "./agent.js";
import { loadConfig } from "./config.js";
import { decodeEvidence, decodeQuestion, verifyEvidence, verifyQuestion } from "@verdict/sdk";
import { sourceById } from "./sources/index.js";

const USAGE = `
resolver-agent — an 8004-registered agent that resolves Verdict markets

  register [name] [description]   mint an 8004 identity for AGENT_SECRET_KEY
  status                          show this agent's identity, weight and record
  resolve                         resolve everything resolvable, once, then exit
  watch                           poll and resolve until stopped
  verify <market> <agent>         decode a submitted evidence document and
                                  re-check its hash against the chain

Environment:
  AGENT_SECRET_KEY   required, S... secret key
  AGENT_ID           8004 agent id (needed by everything except register)
  RESOLUTION_SOURCE  reflector (default) | open-meteo | research | contrarian
  ANTHROPIC_API_KEY  only needed by the research source
  VERDICT_CONTRACT   defaults to the current testnet deployment
  RPC_URL            defaults to soroban-testnet.stellar.org
  POLL_INTERVAL      seconds between polls in watch mode, default 15
`.trim();

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return;
  }

  const cfg = loadConfig();
  const agent = new Agent(cfg);

  switch (command) {
    case "register": {
      const name = rest[0] ?? "Verdict resolver";
      const source = sourceById(cfg.source);
      const description = rest.slice(1).join(" ") || source.description;
      console.log(`registering ${agent.address}`);
      const { agentId, hash } = await agent.register(name, description);
      console.log(`\nagent id  ${agentId}`);
      console.log(`tx        ${hash}`);
      console.log(`explorer  https://stellar8004.com`);
      console.log(`\nAdd this to your environment:\n  AGENT_ID=${agentId}`);
      return;
    }

    case "status": {
      const agentId = requireAgentId(cfg.agentId);
      await agent.assertIdentity(agentId);
      const [weight, stats, resolvable] = await Promise.all([
        agent.verdict.getWeight(agentId),
        agent.verdict.getStats(agentId),
        agent.verdict.resolvable(agentId),
      ]);
      console.log(`agent      #${agentId}`);
      console.log(`address    ${agent.address}`);
      const src = sourceById(cfg.source);
      console.log(`source     ${src.id} (${src.sourceClass})`);
      console.log(`record     ${stats.correct} correct / ${stats.wrong} wrong`);
      console.log(`weight     ${(weight / 100).toFixed(2)}x`);
      console.log(`resolvable ${resolvable.length} market(s)`);
      for (const m of resolvable) {
        console.log(`  #${m.id}  ${m.question_uri}`);
      }
      return;
    }

    case "resolve": {
      const agentId = requireAgentId(cfg.agentId);
      await agent.assertIdentity(agentId);
      const results = await agent.tick(agentId);
      if (results.length === 0) console.log("nothing resolvable right now");
      return;
    }

    case "watch": {
      const agentId = requireAgentId(cfg.agentId);
      await agent.assertIdentity(agentId);
      await agent.watch(agentId);
      return;
    }

    case "verify": {
      const marketId = BigInt(rest[0] ?? "");
      const target = Number(rest[1]);
      const sub = await agent.verdict.getSubmission(marketId, target);
      if (!sub) throw new Error(`Agent #${target} did not submit to market #${marketId}.`);

      const onChainHash = Buffer.from(sub.evidence_hash as unknown as Uint8Array);
      const ok = verifyEvidence(sub.evidence_uri, onChainHash);

      console.log(`market     #${marketId}`);
      console.log(`agent      #${sub.agent_id}`);
      console.log(`outcome    ${sub.outcome === 1 ? "YES" : "NO"}`);
      console.log(`weight     ${(sub.weight / 100).toFixed(2)}x`);
      console.log(`hash       ${onChainHash.toString("hex")}`);
      console.log(`verified   ${ok}`);
      if (!ok) {
        // The hash is the only thing binding the document to the submission. If
        // it does not match, the document is not the evidence that was staked on.
        console.error("\nEvidence does not match the hash committed on-chain.");
        process.exitCode = 1;
        return;
      }
      console.log("\n--- evidence ---");
      console.log(JSON.stringify(decodeEvidence(sub.evidence_uri), null, 2));
      return;
    }

    default:
      console.error(`Unknown command "${command}"\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

function requireAgentId(id: number | undefined): number {
  if (id === undefined || Number.isNaN(id)) {
    throw new Error("AGENT_ID is not set. Run `register` first, or export it.");
  }
  return id;
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}`);
  process.exitCode = 1;
});
