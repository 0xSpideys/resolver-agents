import type { Metadata } from "next";
import { Card, Mono, Page, Section } from "@/components/ui";
import { agentRun, demoRun } from "@/lib/project";

export const metadata: Metadata = {
  title: "Agents — Verdict",
  description:
    "How a resolver agent registers, observes, writes evidence and stakes a bond on its conclusion.",
};

const sources = [
  {
    id: "stellar-ledger",
    body: "Reads the latest closed ledger from Horizon and compares it against the threshold carried in the market's question.",
  },
  {
    id: "contrarian",
    body: "Demo only. Runs a real source, then reports the opposite, so the slashing path can be shown with a real process instead of a hand-typed transaction. Its own evidence document says it inverted.",
  },
];

export default function Agents() {
  return (
    <Page>
      <Section
        first
        eyebrow="Agents"
        title="Who decides, and how"
        lead={agentRun.intro}
      />

      <Section eyebrow="Lifecycle" title="What an agent does">
        <ol>
          {agentRun.steps.map((s, i) => (
            <li
              key={s.title}
              className={`flex gap-5 py-5 ${i === 0 ? "" : "border-t border-edge"}`}
            >
              <span className="mt-0.5 font-mono text-sm text-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-medium">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Card className="mt-6">
          <p className="text-sm leading-relaxed text-muted">
            An agent has no special standing. It cannot create markets, tally, or
            finalise — it can only submit an outcome for an identity it owns, and take
            the reward or the slash that follows. Running one badly costs the bond,
            which is the whole mechanism.
          </p>
        </Card>
      </Section>

      <Section
        eyebrow="Evidence"
        title="Verifiable without trusting anyone"
        lead={agentRun.evidence.note}
      >
        <p className="mb-4 text-sm leading-relaxed text-muted">
          The hash is taken over <Mono>canonical JSON</Mono> — keys sorted at every
          level, no incidental whitespace. Without that, two agents observing
          identical facts could commit to different hashes, and a verifier
          re-serialising the document would compute a third.
        </p>
        <pre className="overflow-x-auto rounded-lg border border-edge bg-surface-2 p-5 font-mono text-xs leading-relaxed">
          <span className="text-accent">$ {agentRun.evidence.command}</span>
          {"\n\n"}
          {agentRun.evidence.output}
        </pre>
      </Section>

      <Section eyebrow="Sources" title="The part that actually decides">
        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-muted">
          A source reads the market&apos;s question, observes the world, and returns an
          outcome plus the reasoning and raw observation that go into the evidence.
          Adding one is a single file. The interesting work in a real deployment lives
          here, not in the plumbing around it.
        </p>
        <div className="space-y-4">
          {sources.map((s) => (
            <Card key={s.id}>
              <h3 className="font-mono text-sm font-medium">{s.id}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Result"
        title={`Market #${demoRun.marketId}, decided by agents`}
        lead={demoRun.questionNote}
      >
        <p className="mb-6 text-sm">
          <span className="text-muted">Question: </span>
          {demoRun.question}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                {["Agent", "Source", "Called", "Settlement", "Next weight", "On 8004"].map(
                  (h) => (
                    <th
                      key={h}
                      className="py-2.5 pr-4 font-mono text-[0.7rem] font-medium uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {demoRun.agents.map((a) => (
                <tr key={a.id} className="border-b border-edge">
                  <td className="py-3 pr-4 font-mono text-xs">#{a.id}</td>
                  <td className="py-3 pr-4 text-muted">{a.source}</td>
                  <td className="py-3 pr-4 font-mono text-xs">{a.call}</td>
                  <td
                    className={`py-3 pr-4 ${a.correct ? "text-done" : "text-red-500 dark:text-red-400"}`}
                  >
                    {a.settled}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs">{a.nextWeight}</td>
                  <td className="py-3 font-mono text-xs">{a.onChainRecord}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Card className="mt-6">
          <h3 className="font-medium">{agentRun.tie.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{agentRun.tie.body}</p>
        </Card>
      </Section>
    </Page>
  );
}
