import {
  deliverables,
  economics,
  flow,
  landscape,
  limitations,
  phases,
  project,
  registries,
  stack,
  states,
  thesis,
  v2,
  verdictContract,
  type Status,
} from "@/lib/project";

/* ------------------------------------------------------------------ atoms */

function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="hairline scroll-mt-16 py-14 sm:py-20">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {lead ? (
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{lead}</p>
      ) : null}
      <div className="mt-8">{children}</div>
    </section>
  );
}

const statusLabel: Record<Status, string> = {
  done: "Done",
  active: "In progress",
  todo: "Not started",
};

const statusColor: Record<Status, string> = {
  done: "text-done",
  active: "text-active",
  todo: "text-todo",
};

function StatusDot({ status }: { status: Status }) {
  const fill =
    status === "done"
      ? "bg-done"
      : status === "active"
        ? "bg-active"
        : "bg-transparent border border-todo";
  return (
    <span
      aria-hidden
      className={`mt-[0.45rem] inline-block size-2 shrink-0 rounded-full ${fill}`}
    />
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-edge bg-surface-2 px-2.5 py-1 font-mono text-[0.7rem] tracking-tight text-muted">
      {children}
    </span>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-edge bg-surface p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------- page */

export default function Home() {
  const allItems = phases.flatMap((p) => p.items);
  const doneCount = allItems.filter((i) => i.status === "done").length;
  const pct = Math.round((doneCount / allItems.length) * 100);

  return (
    <div className="mx-auto max-w-3xl px-5 sm:px-8">
      {/* ------------------------------------------------------------ hero */}
      <header className="pt-16 pb-4 sm:pt-24">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{project.chapter}</Badge>
          <Badge>{project.grant}</Badge>
          <Badge>{project.network}</Badge>
        </div>

        <h1 className="mt-7 text-4xl font-semibold tracking-tight sm:text-5xl">
          {project.name}
        </h1>
        <p className="mt-2 text-lg text-accent sm:text-xl">{project.tagline}</p>

        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted">
          {project.summary}
        </p>

        <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-edge pt-6 text-sm sm:grid-cols-4">
          {[
            ["Builder", project.builder],
            ["Chapter lead", project.chapterLead],
            ["Scope", "30 days · 3 deliverables"],
            ["Progress", `${pct}% of tracked tasks`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                {k}
              </dt>
              <dd className="mt-1 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {/* --------------------------------------------------------- thesis */}
      <Section
        id="thesis"
        eyebrow="The gap"
        title="Nobody is building the resolution layer"
      >
        <div className="space-y-5 text-base leading-relaxed">
          <p className="text-muted">{thesis.problem}</p>
          <p className="border-l-2 border-accent pl-5 font-medium">{thesis.gap}</p>
          <p className="text-muted">{thesis.insight}</p>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-edge">
                {["Project", "Resolves via", "What is missing"].map((h) => (
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
              {landscape.map((row) => (
                <tr key={row.name} className="border-b border-edge align-top">
                  <td className="py-3 pr-4">
                    <span className="font-medium">{row.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {row.what}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-muted">{row.resolution}</td>
                  <td className="py-3 text-muted">{row.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-7 rounded-lg border border-edge bg-accent-soft p-5 text-base leading-relaxed font-medium">
          {thesis.differentiator}
        </p>
      </Section>

      {/* ----------------------------------------------------------- flow */}
      <Section
        id="how"
        eyebrow="Mechanism"
        title="How a market resolves"
        lead="Six steps, all on-chain, no admin deciding the outcome and no price feed standing in for judgement."
      >
        <ol className="space-y-0">
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

      {/* ------------------------------------------------------ economics */}
      <Section
        id="economics"
        eyebrow="Economics"
        title="Parimutuel markets, reputation-weighted resolution"
        lead="Every parameter below lives in contract storage rather than a constant, so governance can tune them later without a migration. Terms are snapshotted per market at creation — a config change is never retroactive."
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

      {/* ---------------------------------------------------- deliverables */}
      <Section
        id="deliverables"
        eyebrow="Scope"
        title="Three deliverables"
        lead="What the Instaward funds, and the evidence each one produces for review."
      >
        <div className="space-y-4">
          {deliverables.map((d) => (
            <Card key={d.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">
                  <span className="font-mono text-accent">{d.id}</span> — {d.title}
                </h3>
                <span className="font-mono text-sm text-muted">{d.budget}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted">{d.body}</p>
              <p className="mt-3 font-mono text-xs text-muted">
                Evidence: {d.evidence}
              </p>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-sm text-muted">
          Explicitly out of scope: permissionless market creation and complex
          orderbook trading.
        </p>
      </Section>

      {/* -------------------------------------------------------- progress */}
      <Section
        id="progress"
        eyebrow="Execution"
        title="Phase plan and live status"
        lead="Updated as work lands. Phase 0 exists to fail early — if the live 8004 integration does not work on day 4, the plan can still change."
      >
        <div className="space-y-4">
          {phases.map((p) => (
            <Card key={p.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="font-medium">
                  <span className="font-mono text-muted">{p.days}</span>
                  <span className="mx-2 text-muted">·</span>
                  {p.title}
                </h3>
                <div className="flex items-center gap-3">
                  {p.deliverable ? (
                    <span className="font-mono text-xs text-accent">
                      {p.deliverable}
                    </span>
                  ) : null}
                  <span
                    className={`font-mono text-xs ${statusColor[p.status]}`}
                  >
                    {statusLabel[p.status]}
                  </span>
                </div>
              </div>

              <ul className="mt-4 space-y-2">
                {p.items.map((it) => (
                  <li key={it.label} className="flex items-start gap-3 text-sm">
                    <StatusDot status={it.status} />
                    <span
                      className={
                        it.status === "todo" ? "text-muted" : undefined
                      }
                    >
                      {it.label}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------- stack */}
      <Section
        id="stack"
        eyebrow="Build"
        title="Stack and on-chain dependencies"
        lead="Verdict does not reimplement 8004. It calls the deployed registries — already live on both testnet and mainnet — which is what makes the resolver layer buildable inside 30 days."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {stack.map((g) => (
            <Card key={g.group}>
              <h3 className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
                {g.group}
              </h3>
              <ul className="mt-3 space-y-1.5 text-sm">
                {g.items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <div className="mt-6">
          <h3 className="font-mono text-[0.7rem] uppercase tracking-wider text-muted">
            8004 registries · testnet
          </h3>
          <p className="mt-2 text-sm text-muted">
            Implementation by{" "}
            <a
              className="text-accent underline underline-offset-4"
              href={registries.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {registries.source}
            </a>
            . Registered agents are publicly browsable on{" "}
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
          <ul className="mt-3 space-y-2">
            {registries.testnet.map((r) => (
              <li
                key={r.name}
                className="overflow-hidden rounded-md border border-edge bg-surface-2 px-3 py-2"
              >
                <span className="font-mono text-xs font-medium">{r.name}</span>
                <span className="mt-1 block truncate font-mono text-xs text-muted">
                  {r.id}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-md border border-edge bg-surface-2 px-3 py-2.5">
            <span className="font-mono text-xs font-medium">
              Verdict market contract
            </span>
            <span className="mt-1 block font-mono text-xs text-muted">
              {verdictContract
                ? `${verdictContract.network} · ${verdictContract.id}`
                : "Not yet deployed — lands in Phase 1"}
            </span>
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------------- limitations */}
      <Section
        id="limits"
        eyebrow="Honesty"
        title="What v1 does not do"
        lead="Stated here rather than buried, because these are the shape of the next grant rather than things we are hoping nobody notices."
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

      {/* ------------------------------------------------------------- v2 */}
      <Section
        id="v2"
        eyebrow="Next"
        title="Where v2 goes"
        lead="Twelve extension points are built into v1 — multi-outcome types, a swappable dispute resolver address, a parameterised token, isolated pricing math — so the follow-on work extends the contract instead of replacing it."
      >
        <ol className="space-y-4">
          {v2.map((p, i) => (
            <li key={p.pillar}>
              <Card>
                <h3 className="font-medium">
                  <span className="font-mono text-accent">0{i + 1}</span>{" "}
                  {p.pillar}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </Section>

      {/* --------------------------------------------------------- footer */}
      <footer className="hairline py-10 text-sm text-muted">
        <p>
          {project.name} — {project.tagline}. Built on Stellar for the{" "}
          {project.chapter} chapter.
        </p>
        <p className="mt-2 font-mono text-xs">
          {project.repo ? (
            <a
              className="text-accent underline underline-offset-4"
              href={project.repo}
            >
              {project.repo}
            </a>
          ) : (
            "Source repository is private during the sprint."
          )}
        </p>
      </footer>
    </div>
  );
}
