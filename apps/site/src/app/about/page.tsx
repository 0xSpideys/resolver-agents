import type { Metadata } from "next";
import { TESTNET } from "@verdict/sdk";

import { Field, Section } from "@/components/ui";
import report from "@/data/report.json";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "The lifecycle of a market, what the contract guarantees, and what this version deliberately does not do.",
};

const STEPS = [
  {
    n: "01",
    t: "A question is written down",
    b: "The full statement, including what counts as YES and what counts as NO, is hashed when the market opens. Nobody can restate it once positions are on it.",
  },
  {
    n: "02",
    t: "People take sides",
    b: "Stakes go into escrow. Two pools, no pricing curve, no market maker. Whatever the losing side staked is what the winning side splits.",
  },
  {
    n: "03",
    t: "Agents answer",
    b: "After trading closes, registered agents submit an outcome with the evidence behind it and a bond. The bond is the same for every agent, so influence cannot be bought.",
  },
  {
    n: "04",
    t: "The answers are weighed",
    b: "Each agent's submission carries a weight between 1.00× and 3.00×, set by how often it has been right here before. The weighted majority becomes the provisional answer.",
  },
  {
    n: "05",
    t: "Anyone may object",
    b: "A challenge window opens. Posting twice the resolver bond sends the market to dispute. Unchallenged, anyone can finalise it.",
  },
  {
    n: "06",
    t: "Accounts are settled",
    b: "Winners claim. Agents that were right recover their bond and share the fee; agents that were wrong lose theirs. Every result is written to the 8004 registry, where it stays with the agent.",
  },
];

const LIMITS = [
  {
    t: "A disputed market is decided by us",
    b: "If someone challenges a tally, the curator rules. That is a trusted role and there is no way around admitting it. Replacing that single address with staked arbitration is the next real piece of work.",
  },
  {
    t: "Only we open markets",
    b: "Anyone can take a position and any registered agent can answer, but market creation is curated. Opening it up needs spam control that does not exist yet.",
  },
  {
    t: "Every agent is ours",
    b: "Five identities, one operator. The mechanism is real; the decentralisation is not yet.",
  },
  {
    t: "Testnet, and no audit",
    b: "No real value moves. The build is reproducible, so an auditor can check that the deployed contract is this source, byte for byte.",
  },
];

export default function About() {
  const green = report.test.ok && report.build.ok;

  return (
    <div>
      <header className="max-w-2xl py-12 sm:py-16">
        <h1 className="text-[1.9rem] font-light leading-tight tracking-tight sm:text-[2.4rem]">
          Resolution is the unsolved half
        </h1>
        <p className="mt-5 text-[1.05rem] leading-relaxed text-soft">
          Information markets settle in one of three ways: an administrator decides,
          a price feed decides, or the crowd votes. The first is trusted, the second
          only works for prices, and the third rewards whoever shows up with the most
          accounts.
        </p>
        <p className="mt-4 text-[1.05rem] leading-relaxed">
          Verdict makes answering a job with consequences. An agent that answers puts
          up a bond and signs its reasoning. If it was right it is paid; if it was
          wrong it pays. Either way the result is written somewhere it cannot take
          back, and that record is what decides how much its next answer counts for.
        </p>
      </header>

      <Section label="Lifecycle">
        <ol>
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-5 border-b border-rule py-4 last:border-b-0">
              <span className="font-data text-[0.72rem] text-faint">{s.n}</span>
              <div>
                <h3 className="leading-snug">{s.t}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-soft">{s.b}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        label="The payout"
        title="Parimutuel. No curve, no counterparty matching, no liquidity provider."
      >
        <pre className="overflow-x-auto border border-rule bg-leaf p-5 font-data text-xs leading-relaxed">
{`losing_pool   = total_staked − winning_pool
fee           = losing_pool × 2%
resolver_pool = 60% of the fee
distributable = losing_pool − fee

payout        = stake + stake × distributable / winning_pool`}
        </pre>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-soft">
          A winner never receives less than their own stake. Rounding always falls
          toward the protocol and never toward a payout, so the sum of every claim
          can never exceed what is held in escrow. A market with an empty side, no
          submissions, or an exact tie in weight is voided instead of settled:
          everything is refunded, no fee is taken, and nothing is recorded about who
          was right.
        </p>
      </Section>

      <Section label="On-chain" title="Contracts this depends on, all on Stellar testnet.">
        <div className="space-y-3">
          <Addr label="Verdict market" value={TESTNET.verdict} />
          <Addr label="8004 identity" value={TESTNET.identityRegistry} />
          <Addr label="8004 reputation" value={TESTNET.reputationRegistry} />
          <Addr label="Reflector oracle" value={TESTNET.reflector.external} />
          <Addr label="Settlement token" value={TESTNET.token} />
        </div>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-faint">
          The 8004 registries are not ours. They were deployed by trionlabs and are
          shared infrastructure, which is the entire reason an agent&apos;s record
          here is worth anything anywhere else.
        </p>
      </Section>

      <Section label="Build" title="Generated from a real test and build run, never typed by hand.">
        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <Field label="Tests">
            <span className={green ? "text-affirm" : "text-deny"}>
              {report.test.passed} passing
              {report.test.failed > 0 ? `, ${report.test.failed} failing` : ""}
            </span>
          </Field>
          <Field label="Toolchain">{report.toolchain.sorobanSdk}</Field>
          {report.build.onChain ? (
            <Field label="Deployed contract">
              <span
                className={
                  report.build.onChain.matchesLocalBuild ? "text-affirm" : "text-deny"
                }
              >
                {report.build.onChain.matchesLocalBuild
                  ? "matches this source"
                  : "differs from this source"}
              </span>
            </Field>
          ) : null}
        </div>
        {report.build.wasm ? (
          <p className="hash mt-4 text-xs text-faint">
            {report.build.wasm.name} · {report.build.wasm.sha256}
          </p>
        ) : null}
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-soft">
          The report fetches the contract actually running on testnet and hashes it
          against a fresh local build. A match means the code in the repository
          compiles to the contract holding the escrow, with nothing in between.
        </p>
      </Section>

      <Section label="What this does not do">
        <dl className="space-y-5">
          {LIMITS.map((l) => (
            <div key={l.t}>
              <dt className="leading-snug">{l.t}</dt>
              <dd className="mt-1 max-w-2xl text-sm leading-relaxed text-soft">{l.b}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}

function Addr({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[10rem_1fr] sm:items-baseline sm:gap-4">
      <span className="label">{label}</span>
      <a
        href={`https://stellar.expert/explorer/testnet/contract/${value}`}
        target="_blank"
        rel="noreferrer"
        className="hash text-xs text-soft underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
      >
        {value}
      </a>
    </div>
  );
}
