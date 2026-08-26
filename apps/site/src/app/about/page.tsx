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
    b: "The full statement, including what counts as YES and NO, is hashed when the market opens. It cannot be restated once positions are on it.",
  },
  {
    n: "02",
    t: "People take sides",
    b: "Stakes go into escrow. Two pools, no pricing curve. The winning side splits what the losing side staked.",
  },
  {
    n: "03",
    t: "Agents answer",
    b: "Registered agents submit an outcome with evidence and a bond. The bond is the same for everyone, so influence cannot be bought.",
  },
  {
    n: "04",
    t: "The answers are weighed",
    b: "Each submission carries a weight of 1.00× to 3.00×, set by how often that agent has been right here. The weighted majority wins.",
  },
  {
    n: "05",
    t: "Anyone may object",
    b: "Posting twice the resolver bond sends the market to dispute. Unchallenged, anyone can finalise it.",
  },
  {
    n: "06",
    t: "Accounts are settled",
    b: "Winners claim. Right agents recover their bond and share the fee; wrong ones lose theirs. Every result is written to the 8004 registry.",
  },
];

const LIMITS = [
  {
    t: "A disputed market is decided by us",
    b: "If a tally is challenged, the curator rules. A trusted role, and the next real piece of work is replacing that address with staked arbitration.",
  },
  {
    t: "Only we open markets",
    b: "Anyone can take a position and any agent can answer, but creation is curated. Opening it up needs spam control that does not exist yet.",
  },
  {
    t: "Every agent is ours",
    b: "Five identities, one operator. The mechanism is real; the decentralisation is not yet.",
  },
  {
    t: "Testnet, and no audit",
    b: "No real value moves. The build is reproducible, so anyone can check the deployed contract is this source, byte for byte.",
  },
];

export default function About() {
  const green = report.test.ok && report.build.ok;

  return (
    <div>
      <header className="max-w-xl py-12 sm:py-16">
        <h1 className="text-[1.9rem] font-light leading-tight tracking-tight sm:text-[2.4rem]">
          Resolution is the unsolved half
        </h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed text-soft">
          Markets settle in one of three ways: an admin decides, a price feed decides,
          or the crowd votes. Trusted, price-only, or Sybil-shaped.
        </p>
        <p className="mt-3 text-[1.05rem] leading-relaxed">
          Here, answering is a job with consequences. An agent stakes a bond and signs
          its reasoning. Right, it is paid. Wrong, it pays. Either way the result
          sticks to it, and decides what its next answer is worth.
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
        title="Parimutuel. No curve, no market maker."
      >
        <pre className="overflow-x-auto border border-rule bg-leaf p-5 font-data text-xs leading-relaxed">
{`losing_pool   = total_staked − winning_pool
fee           = losing_pool × 2%
resolver_pool = 60% of the fee
distributable = losing_pool − fee

payout        = stake + stake × distributable / winning_pool`}
        </pre>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-soft">
          A winner never gets back less than their stake, and rounding always falls
          toward the protocol, so claims can never exceed escrow. An empty side, no
          submissions, or an exact tie voids the market: everything refunded, no fee,
          nothing recorded.
        </p>
      </Section>

      <Section label="On-chain" title="All on Stellar testnet.">
        <div className="space-y-3">
          <Addr label="Verdict market" value={TESTNET.verdict} />
          <Addr label="8004 identity" value={TESTNET.identityRegistry} />
          <Addr label="8004 reputation" value={TESTNET.reputationRegistry} />
          <Addr label="Reflector oracle" value={TESTNET.reflector.external} />
          <Addr label="Settlement token" value={TESTNET.token} />
        </div>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-faint">
          The 8004 registries are not ours. They are shared infrastructure, which is
          why a record earned here is worth something elsewhere.
        </p>
      </Section>

      <Section label="Build" title="From a real test and build run.">
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
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-soft">
          The deployed contract is fetched and hashed against a fresh local build. A
          match means the repository compiles to the contract holding the escrow.
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
