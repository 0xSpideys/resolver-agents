#!/usr/bin/env node
/**
 * Operator tooling: open markets and push them through the lifecycle.
 *
 * Separate from the resolver agent on purpose. The curator can create markets
 * and settle disputes; an agent can do neither. Keeping the two in one binary
 * would blur a distinction the protocol depends on.
 */
import {
  Chain,
  TESTNET,
  Verdict,
  buildQuestion,
  decodeQuestion,
  toHex,
  verifyQuestion,
} from "@verdict/sdk";

import { PRESETS, presetById } from "./questions";

const USAGE = `
curator — open and operate Verdict markets

  presets                        list the demo question presets
  open <preset> [--trading N]    build the question, hash it, open the market
  show <market>                  market state and its verified question document
  close <market>                 stop trading (permissionless, after close_ts)
  tally <market>                 weighted tally (permissionless, after the resolve window)
  finalize <market>              settle an unchallenged market (permissionless)
  settle <market>                pay and slash resolvers, write reputation to 8004
  advance <market>               close/tally/finalize/settle, whichever applies now

Environment:
  CURATOR_SECRET_KEY   required — must be the configured curator for "open"
  VERDICT_CONTRACT     defaults to the current testnet deployment
  MARKET_TOKEN         defaults to the native XLM SAC
`.trim();

function chainFor(secret: string) {
  return new Chain({
    rpcUrl: process.env.RPC_URL ?? TESTNET.rpcUrl,
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? TESTNET.networkPassphrase,
    verdict: process.env.VERDICT_CONTRACT ?? TESTNET.verdict,
    identityRegistry: process.env.IDENTITY_REGISTRY ?? TESTNET.identityRegistry,
    secretKey: secret,
  });
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "help" || command === "--help") {
    console.log(USAGE);
    return;
  }

  if (command === "presets") {
    for (const p of PRESETS) console.log(`  ${p.id.padEnd(18)} ${p.summary}`);
    return;
  }

  const secret = process.env.CURATOR_SECRET_KEY;
  if (!secret) throw new Error("CURATOR_SECRET_KEY is not set.");
  const chain = chainFor(secret);
  const cfg = {
    rpcUrl: process.env.RPC_URL ?? TESTNET.rpcUrl,
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? TESTNET.networkPassphrase,
    verdict: process.env.VERDICT_CONTRACT ?? TESTNET.verdict,
    identityRegistry: process.env.IDENTITY_REGISTRY ?? TESTNET.identityRegistry,
    secretKey: secret,
  };
  const verdict = new Verdict(chain, cfg);

  switch (command) {
    case "open": {
      const preset = presetById(rest[0] ?? "");
      const tradingIdx = rest.indexOf("--trading");
      const trading =
        tradingIdx >= 0 ? Number(rest[tradingIdx + 1]) : preset.tradingWindow;

      const now = Math.floor(Date.now() / 1000);
      const question = buildQuestion(preset.build(now));

      console.log(`preset      ${preset.id}`);
      console.log(`question    ${question.doc.title}`);
      console.log(`class       ${question.doc.sourceClass}`);
      console.log(`hash        ${question.hashHex}`);
      console.log(`uri         ${question.uri.length} bytes, inline`);

      const { value: id, hash } = await verdict.createMarket({
        token: process.env.MARKET_TOKEN ?? TESTNET.token,
        questionUri: question.uri,
        questionHash: question.hash,
        outcomeCount: 2,
        closeTs: now + trading,
      });

      console.log(`\nmarket      #${id}`);
      console.log(`trading     closes in ${trading}s`);
      console.log(`tx          ${hash}`);
      return;
    }

    case "show": {
      const m = await verdict.getMarket(BigInt(rest[0] ?? ""));
      const check = verifyQuestion(m.question_uri, m.question_hash);
      const pools = await verdict.getPools(m.id);

      console.log(`market      #${m.id}`);
      console.log(`state       ${m.state}`);
      console.log(`pools       NO ${fmt(pools[0] ?? 0n)}  YES ${fmt(pools[1] ?? 0n)}`);
      console.log(`close_ts    ${m.close_ts}  (${when(m.close_ts)})`);
      console.log(`resolve by  ${m.resolve_deadline}  (${when(m.resolve_deadline)})`);
      console.log(`hash        ${toHex(m.question_hash)}`);
      console.log(`verified    ${check.ok}${check.ok ? "" : ` — ${check.reason}`}`);
      if (check.ok) {
        console.log(`\n--- question ---`);
        console.log(JSON.stringify(decodeQuestion(m.question_uri), null, 2));
      }

      const subs = await verdict.getSubmissions(m.id);
      if (subs.length) {
        console.log(`\n--- submissions ---`);
        for (const s of subs) {
          console.log(
            `  #${s.agent_id}  ${s.outcome === 1 ? "YES" : "NO "}  ` +
              `${(s.weight / 100).toFixed(2)}x  ${s.settled ? "settled" : "open"}`,
          );
        }
      }
      return;
    }

    case "close":
      await run("close_market", () => verdict.closeMarket(BigInt(rest[0] ?? "")));
      return;
    case "tally":
      console.log(JSON.stringify((await verdict.tally(BigInt(rest[0] ?? ""))).value));
      return;
    case "finalize":
      await run("finalize", () => verdict.finalize(BigInt(rest[0] ?? "")));
      return;
    case "settle":
      await run("settle_resolvers", () => verdict.settleResolvers(BigInt(rest[0] ?? "")));
      return;

    case "advance": {
      // Convenience for driving a demo: do whatever the market's current state
      // and the clock allow, and say why if that is nothing.
      const id = BigInt(rest[0] ?? "");
      const m = await verdict.getMarket(id);
      const now = Math.floor(Date.now() / 1000);

      if (m.state === "Open" && now >= Number(m.close_ts)) {
        await run("close_market", () => verdict.closeMarket(id));
      } else if (m.state === "Resolving" && now >= Number(m.resolve_deadline)) {
        console.log(JSON.stringify((await verdict.tally(id)).value));
      } else if (m.state === "Tallied" && now >= Number(m.challenge_deadline)) {
        await run("finalize", () => verdict.finalize(id));
      } else if (
        (m.state === "Settled" || m.state === "Void") &&
        !m.resolvers_settled
      ) {
        await run("settle_resolvers", () => verdict.settleResolvers(id));
      } else {
        console.log(`nothing to do: state=${m.state}, resolvers_settled=${m.resolvers_settled}`);
      }
      return;
    }

    default:
      console.error(`Unknown command "${command}"\n`);
      console.log(USAGE);
      process.exitCode = 1;
  }
}

async function run(label: string, fn: () => Promise<{ hash: string }>) {
  const { hash } = await fn();
  console.log(`${label}  tx ${hash}`);
}

function fmt(v: bigint): string {
  return (Number(v) / 1e7).toFixed(2);
}

function when(ts: bigint): string {
  const delta = Number(ts) - Math.floor(Date.now() / 1000);
  return delta > 0 ? `in ${delta}s` : `${-delta}s ago`;
}

main().catch((err) => {
  console.error(`\n${(err as Error).message}`);
  process.exitCode = 1;
});
