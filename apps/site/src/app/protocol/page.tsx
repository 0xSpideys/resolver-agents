import type { Metadata } from "next";
import { Card, Hash, Mono, Page, Section } from "@/components/ui";
import { entrypoints, invariants, limitations, registries, states } from "@/lib/project";

export const metadata: Metadata = {
  title: "Protocol — Verdict",
  description:
    "State machine, resolver weighting, 8004 integration, entrypoints and invariants of the Verdict market contract.",
};

const transitions = [
  ["Open", "close_ts reached", "Resolving", "Trading stops. One-sided books void instead."],
  ["Resolving", "resolve_deadline passed, ≥1 submission", "Tallied", "Weighted majority becomes provisional; challenge window opens."],
  ["Resolving", "no submissions, or an exact weight tie", "Void", "Full refund, all bonds returned, no fee, no reputation recorded."],
  ["Tallied", "challenge()", "Disputed", "Challenger posts 2× the resolver bond."],
  ["Tallied", "challenge window elapsed", "Settled", "Permissionless finalise."],
  ["Disputed", "resolve_dispute()", "Settled", "Dispute resolver sets the final outcome."],
];

const weighting = [
  ["No history", "1.00×"],
  ["5 correct / 5 wrong", "2.00×"],
  ["10 correct / 0 wrong", "3.00×"],
  ["0 correct / 10 wrong", "1.00×"],
];

export default function Protocol() {
  return (
    <Page>
      <Section
        first
        eyebrow="Protocol"
        title="How Verdict works"
        lead="A single Soroban contract holding escrow, positions, resolver submissions and settlement. It calls the deployed 8004 registries for agent identity and reputation; it does not reimplement them."
      />

      <Section eyebrow="Lifecycle" title="State machine">
        <div className="mb-6 flex flex-wrap gap-2">
          {states.map((s) => (
            <div key={s.name} className="rounded-md border border-edge bg-surface px-3 py-2">
              <span className="font-mono text-xs font-medium">{s.name}</span>
              <span className="ml-2 text-xs text-muted">{s.desc}</span>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                {["From", "Trigger", "To", "Effect"].map((h) => (
                  <th
                    key={h}
                    className="py-2.5 pr-4 font-mono text-[0.7rem] font-medium uppercase tracking-wider text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transitions.map((t) => (
                <tr key={t.join()} className="border-b border-edge align-top">
                  <td className="py-3 pr-4 font-mono text-xs">{t[0]}</td>
                  <td className="py-3 pr-4 text-muted">{t[1]}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{t[2]}</td>
                  <td className="py-3 text-muted">{t[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        eyebrow="Payout"
        title="Parimutuel settlement"
        lead="Two pools per market. At settlement the losing pool is reduced by the fee and distributed pro rata across the winning pool."
      >
        <pre className="overflow-x-auto rounded-lg border border-edge bg-surface-2 p-5 font-mono text-xs leading-relaxed">
{`losing_pool   = total_staked − winning_pool
fee           = losing_pool × fee_bps / 10_000
resolver_pool = fee × resolver_fee_bps / 10_000
protocol_cut  = fee − resolver_pool
distributable = losing_pool − fee

payout(user)  = stake + stake × distributable / winning_pool`}
        </pre>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Integer division floors at every step, always toward the protocol and
          never toward a payout. The three fee components sum back to{" "}
          <Mono>losing_pool</Mono> exactly, and a resolver pool with no rightful
          recipient is accrued to the treasury rather than left stranded. Any
          remaining per-claim dust stays in the contract; sweeping it is deferred.
          Both properties are covered by tests.
        </p>
      </Section>

      <Section
        eyebrow="Weighting"
        title="Reputation, not capital"
        lead="Bonds are flat. A resolver's influence comes from their record inside Verdict, snapshotted into the submission so later reputation changes cannot rewrite a past tally."
      >
        <dl className="grid max-w-md gap-px overflow-hidden rounded-lg border border-edge bg-edge">
          {weighting.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between bg-surface px-4 py-3">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="font-mono text-sm font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        eyebrow="Trust layer"
        title="8004 integration"
        lead="Verdict calls the deployed registries rather than shipping its own. Agent identity is checked on submission; the outcome of every settlement is written back as public, portable reputation."
      >
        <div className="space-y-3">
          {registries.contracts.map((c) => (
            <div key={c.name}>
              <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{c.name}</span>
                <span className="text-xs text-muted">{c.use}</span>
              </div>
              <Hash value={c.testnet} />
            </div>
          ))}
        </div>

        <Card className="mt-6">
          <h3 className="font-medium">Why Verdict caches reputation locally</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            The registry&apos;s <Mono>get_summary</Mono> walks every feedback entry a
            client has written for an agent — one storage read each, unbounded as the
            agent resolves more markets. That is fine for a UI query and unacceptable
            inside <Mono>submit_outcome</Mono>. Verdict keeps an O(1) counter of its
            own for the hot path and still writes every result to 8004, so the public
            record stays complete and portable. Both are written in the same
            transaction.
          </p>
        </Card>

        <p className="mt-5 text-sm text-muted">
          Registry implementation by{" "}
          <a
            className="text-accent underline underline-offset-4"
            href={registries.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {registries.source}
          </a>
          . Registered agents are browsable at{" "}
          <a
            className="text-accent underline underline-offset-4"
            href={registries.explorer}
            target="_blank"
            rel="noreferrer"
          >
            stellar8004.com
          </a>
          .
        </p>
      </Section>

      <Section eyebrow="Interface" title="Entrypoints">
        <div className="grid gap-4 sm:grid-cols-2">
          {entrypoints.map((g) => (
            <Card key={g.group}>
              <h3 className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                {g.group}
              </h3>
              <ul className="mt-3 space-y-1.5 font-mono text-xs">
                {g.fns.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      <Section eyebrow="Guarantees" title="Invariants">
        <ol className="space-y-3">
          {invariants.map((inv, i) => (
            <li key={inv} className="flex gap-4 text-sm leading-relaxed">
              <span className="font-mono text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span>{inv}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        eyebrow="Scope"
        title="What this version does not do"
        lead="Stated plainly rather than left for a reader to discover."
      >
        <div className="space-y-4">
          {limitations.map((l) => (
            <Card key={l.title}>
              <h3 className="font-medium">{l.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{l.body}</p>
            </Card>
          ))}
        </div>
      </Section>
    </Page>
  );
}
