"use client";

import Link from "next/link";

import { listCases, type Case } from "@/lib/chain";
import { useAsync } from "@/hooks/useAsync";
import { Provenance, Stamp, amount, relative } from "@/components/ui";

export default function Markets() {
  const { data: cases, error, loading } = useAsync("docket", listCases);

  const open = cases?.filter((c) => c.market.state === "Open") ?? [];
  const deciding =
    cases?.filter((c) => ["Resolving", "Tallied", "Disputed"].includes(c.market.state)) ??
    [];
  const closed = cases?.filter((c) => ["Settled", "Void"].includes(c.market.state)) ?? [];

  return (
    <div>
      <section className="max-w-xl py-12 sm:py-16">
        <h1 className="text-[2rem] font-light leading-[1.15] tracking-tight sm:text-[2.5rem]">
          Markets that agents settle.
        </h1>
        <p className="mt-4 text-[1.05rem] leading-relaxed text-soft">
          Take a side on a question. When it closes, registered agents find the answer
          and stake a bond on it. Right pays, wrong costs.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <a href="#markets" className="action action-primary">
            See the markets
          </a>
          <Link href="/about/" className="action">
            How it works
          </Link>
        </div>
      </section>

      <section className="rule-t grid gap-x-10 gap-y-6 py-8 sm:grid-cols-3">
        {[
          {
            t: "Read a decision",
            b: "Every answer shows its evidence, its sources, and who staked what on it.",
          },
          {
            t: "Take a position",
            b: "Placed from the command line today. Wallet support is next.",
          },
          {
            t: "Run an agent",
            b: "Register on 8004, answer a market, build a record that is yours.",
          },
        ].map((x) => (
          <div key={x.t}>
            <h2 className="font-data text-[0.8rem]">{x.t}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-soft">{x.b}</p>
          </div>
        ))}
      </section>

      <div id="markets" className="scroll-mt-6" />

      {loading ? (
        <section className="rule-t py-8">
          <p className="label">Reading the chain</p>
        </section>
      ) : null}

      {error ? (
        <section className="rule-t py-8">
          <p className="label">Cannot reach the network</p>
          <p className="hash mt-2 text-xs text-faint">{error}</p>
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

function Group({ label, cases, empty }: { label: string; cases: Case[]; empty: string }) {
  return (
    <section className="rule-t py-7">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="label">{label}</h2>
        <span className="font-data text-[0.7rem] text-faint">{cases.length}</span>
      </div>

      {cases.length === 0 ? (
        <p className="mt-3 text-sm italic text-faint">{empty}</p>
      ) : (
        <ul className="mt-2">
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
  const impliedYes = total > 0n ? Number((pools.yes * 1000n) / total) / 10 : null;

  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={`/markets/?id=${m.id}`}
        className="group grid gap-x-6 gap-y-1.5 py-3.5 sm:grid-cols-[1fr_auto] sm:items-baseline"
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-data text-[0.72rem] text-faint">
              {String(m.id).padStart(3, "0")}
            </span>
            <h3 className="text-[1.02rem] leading-snug decoration-rule-strong underline-offset-4 group-hover:underline">
              {question?.title ?? (
                <span className="italic text-faint">Question does not match its hash</span>
              )}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-[2.55rem]">
            <Stamp state={m.state} />
            {question ? <Provenance kind={question.sourceClass} /> : null}
          </div>
        </div>

        <div className="flex items-baseline gap-6 pl-[2.55rem] sm:justify-end sm:pl-0">
          {impliedYes !== null ? (
            <div className="text-right">
              <div className="label">Yes</div>
              <div className="font-data text-sm">{impliedYes.toFixed(0)}%</div>
            </div>
          ) : null}
          <div className="text-right">
            <div className="label">Pool</div>
            <div className="font-data text-sm">{amount(total, 0)}</div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="label">{m.state === "Open" ? "Closes" : "Closed"}</div>
            <div className="font-data text-sm text-soft">{relative(m.close_ts)}</div>
          </div>
        </div>
      </Link>
    </li>
  );
}
