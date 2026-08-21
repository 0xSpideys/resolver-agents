import Link from "next/link";
import { Card, Page, Section } from "@/components/ui";
import { economics, flow, pitch, project, properties, states } from "@/lib/project";
import report from "@/data/report.json";

export default function Overview() {
  return (
    <Page>
      <section className="pt-14 pb-2 sm:pt-20">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          {project.network}
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          {project.name}
        </h1>
        <p className="mt-3 max-w-2xl text-lg leading-snug text-muted sm:text-xl">
          {project.tagline}
        </p>
        <p className="mt-6 max-w-2xl text-base leading-relaxed">{project.summary}</p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Link
            href="/protocol"
            className="rounded-md border border-edge bg-surface px-4 py-2 text-sm font-medium transition-colors hover:bg-surface-2"
          >
            Read the protocol
          </Link>
          <Link
            href="/status"
            className="rounded-md px-4 py-2 text-sm text-muted transition-colors hover:text-foreground"
          >
            {report.test.ok
              ? `Build green · ${report.test.passed} tests passing`
              : `Build red · ${report.test.failed} failing`}
          </Link>
        </div>
      </section>

      <Section eyebrow="Why" title="Resolution is the unsolved half">
        <div className="space-y-5 text-base leading-relaxed">
          <p className="text-muted">{pitch.problem}</p>
          <p>{pitch.answer}</p>
          <p className="border-l-2 border-accent pl-5 font-medium">{pitch.principle}</p>
        </div>
      </Section>

      <Section
        eyebrow="How"
        title="Lifecycle of a market"
        lead="Six steps, all on-chain. No admin picks the outcome and no price feed stands in for judgement."
      >
        <ol>
          {flow.map((f, i) => (
            <li
              key={f.step}
              className={`flex gap-5 py-5 ${i === 0 ? "" : "border-t border-edge"}`}
            >
              <span className="mt-0.5 font-mono text-sm text-accent">{f.step}</span>
              <div>
                <h3 className="font-medium">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <p className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
            Market states
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {states.map((s) => (
              <div
                key={s.name}
                className="rounded-md border border-edge bg-surface px-3 py-2"
              >
                <span className="font-mono text-xs font-medium">{s.name}</span>
                <span className="ml-2 text-xs text-muted">{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section eyebrow="Properties" title="What the contract guarantees">
        <div className="grid gap-4 sm:grid-cols-2">
          {properties.map((p) => (
            <Card key={p.title}>
              <h3 className="font-medium">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </Card>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Economics"
        title="Parameters"
        lead="Every value lives in contract storage rather than a constant, and is snapshotted per market at creation — changing a parameter never alters a market someone has already staked into."
      >
        <dl className="grid gap-px overflow-hidden rounded-lg border border-edge bg-edge sm:grid-cols-2">
          {economics.map((e) => (
            <div key={e.k} className="bg-surface p-4">
              <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                {e.k}
              </dt>
              <dd className="mt-1.5 text-sm">{e.v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </Page>
  );
}
