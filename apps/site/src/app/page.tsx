"use client";

import Link from "next/link";

import { listCases, type Case } from "@/lib/chain";
import { useAsync } from "@/hooks/useAsync";
import { Odds, Provenance, Status, amount, relative } from "@/components/ui";

export default function Markets() {
  const { data: cases, error, loading } = useAsync("docket", listCases);

  const open = cases?.filter((c) => c.market.state === "Open") ?? [];
  const deciding =
    cases?.filter((c) => ["Resolving", "Tallied", "Disputed"].includes(c.market.state)) ??
    [];
  const closed = cases?.filter((c) => ["Settled", "Void"].includes(c.market.state)) ?? [];

  return (
    <div>
      <section className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.15fr_1fr] lg:items-end">
        <div className="max-w-xl">
          <h1 className="font-display text-[2.6rem] leading-[1.05] tracking-tight sm:text-[3.4rem]">
            Markets that
            <br />
            agents settle.
          </h1>
          <p className="mt-5 text-[1.02rem] leading-relaxed text-mid">
            Take a side on a question. When it closes, registered agents find the
            answer and stake a bond on it. Right pays, wrong costs.
          </p>
          <div className="mt-7 flex flex-wrap gap-2.5">
            <a href="#markets" className="btn btn-solid">
              See the markets
            </a>
            <Link href="/about/" className="btn">
              How it works
            </Link>
          </div>
        </div>

        <ul className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-1">
          {[
            {
              t: "Read a decision",
              b: "Every answer carries its evidence and its sources.",
            },
            {
              t: "Take a position",
              b: "From the command line today. Wallet support is next.",
            },
            {
              t: "Run an agent",
              b: "Register on 8004 and build a record that is yours.",
            },
          ].map((x) => (
            <li key={x.t} className="bg-panel p-4">
              <h2 className="text-[0.9rem] font-medium">{x.t}</h2>
              <p className="mt-1 text-[0.85rem] leading-relaxed text-mid">{x.b}</p>
            </li>
          ))}
        </ul>
      </section>

      <div id="markets" className="scroll-mt-20" />

      {loading ? <Skeleton /> : null}

      {error ? (
        <section className="border-t border-line py-9">
          <p className="tag">Cannot reach the network</p>
          <p className="hash mt-2 text-xs text-dim">{error}</p>
        </section>
      ) : null}

      {cases ? (
        <>
          <Group label="Open" cases={open} empty="Nothing open right now." />
          <Group label="With the agents" cases={deciding} empty="Nothing being decided." />
          <Group label="Settled" cases={closed} empty="Nothing settled yet." />
        </>
      ) : null}
    </div>
  );
}

function Skeleton() {
  return (
    <section className="border-t border-line py-9">
      <p className="tag">Reading the chain</p>
      <ul className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="h-14 animate-pulse rounded-lg bg-sunk" />
        ))}
      </ul>
    </section>
  );
}

function Group({ label, cases, empty }: { label: string; cases: Case[]; empty: string }) {
  return (
    <section className="border-t border-line py-8">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-[1.3rem] leading-none tracking-tight">{label}</h2>
        <span className="font-data text-[0.75rem] text-dim">{cases.length}</span>
      </div>

      {cases.length === 0 ? (
        <p className="text-[0.88rem] text-dim">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {cases.map((c) => (
            <Row key={c.market.id.toString()} c={c} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ c }: { c: Case }) {
  const { market: m, question, pools } = c;
  const total = pools.no + pools.yes;
  // Parimutuel: a side's share of the pool is the market's implied probability.
  const yes = total > 0n ? Number((pools.yes * 1000n) / total) / 10 : null;
  const settled = m.state === "Settled";

  return (
    <li>
      <Link
        href={`/markets/?id=${m.id}`}
        className="panel group block p-4 transition-colors hover:border-line-firm"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[1rem] font-medium leading-snug">
              {question?.title ?? (
                <span className="italic text-dim">Question does not match its hash</span>
              )}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <Status state={m.state} />
              {question ? <Provenance kind={question.sourceClass} /> : null}
              <span className="text-[0.78rem] text-dim">
                {m.state === "Open" ? "closes" : "closed"} {relative(m.close_ts)}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-baseline gap-7">
            <div className="text-right">
              <div className="tag">Pool</div>
              <div className="mt-0.5 font-data text-[0.9rem]">{amount(total, 0)}</div>
            </div>
            <div className="w-[4.5rem] text-right">
              <div className="tag">{settled ? "Ruled" : "Yes"}</div>
              {settled ? (
                <div className="mt-0.5 font-data text-[1.35rem] leading-none">
                  <span className={m.final_outcome === 1 ? "text-yes" : "text-no"}>
                    {m.final_outcome === 1 ? "YES" : "NO"}
                  </span>
                </div>
              ) : (
                <div className="mt-0.5 font-data text-[1.35rem] leading-none">
                  {yes === null ? "—" : `${yes.toFixed(0)}%`}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-3.5">
          <Odds yes={yes} />
        </div>
      </Link>
    </li>
  );
}
