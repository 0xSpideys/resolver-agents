"use client";

import Link from "next/link";

import { listCases, type Case } from "@/lib/chain";
import { useAsync } from "@/hooks/useAsync";
import { Provenance, Stamp, amount, relative } from "@/components/ui";

export default function Docket() {
  const { data: cases, error, loading } = useAsync("docket", listCases);

  return (
    <div>
      <section className="max-w-2xl py-14 sm:py-20">
        <h1 className="text-[2.1rem] font-light leading-[1.15] tracking-tight sm:text-[2.7rem]">
          Some questions have an answer.
          <br />
          <span className="italic text-soft">Someone still has to go and find it.</span>
        </h1>
        <p className="mt-6 text-[1.05rem] leading-relaxed text-soft">
          Take a side on a question. When it closes, registered agents go and
          establish what happened, each putting up a bond on the answer they give.
          Being right pays. Being wrong costs, and the record follows the agent
          wherever it goes next.
        </p>
      </section>

      {loading ? <Waiting /> : null}

      {error ? (
        <section className="rule-t py-9">
          <p className="label">Cannot reach the network</p>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-soft">
            This page reads the contract straight from Soroban RPC with nothing
            cached in between, so an RPC problem shows up as nothing rather than as
            stale numbers.
          </p>
          <p className="hash mt-3 text-xs text-faint">{error}</p>
        </section>
      ) : null}

      {cases ? (
        <>
          <Group
            label="Open for positions"
            cases={cases.filter((c) => c.market.state === "Open")}
            empty="No market is taking positions right now."
          />
          <Group
            label="Being decided"
            cases={cases.filter((c) =>
              ["Resolving", "Tallied", "Disputed"].includes(c.market.state),
            )}
            empty="Nothing is with the agents at the moment."
          />
          <Group
            label="Closed"
            cases={cases.filter((c) => ["Settled", "Void"].includes(c.market.state))}
            empty="Nothing settled yet."
          />
        </>
      ) : null}
    </div>
  );
}

function Waiting() {
  return (
    <section className="rule-t py-9">
      <p className="label">Reading the chain</p>
      <ul className="mt-4 space-y-4">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-baseline gap-3 opacity-40">
            <span className="h-3 w-8 bg-sunk" />
            <span className="h-3 flex-1 max-w-md bg-sunk" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Group({
  label,
  cases,
  empty,
}: {
  label: string;
  cases: Case[];
  empty: string;
}) {
  return (
    <section className="rule-t py-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="label">{label}</h2>
        <span className="font-data text-[0.7rem] text-faint">{cases.length}</span>
      </div>

      {cases.length === 0 ? (
        <p className="mt-4 text-sm italic text-faint">{empty}</p>
      ) : (
        <ul className="mt-3">
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
        className="group grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[1fr_auto] sm:items-baseline"
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="font-data text-[0.72rem] text-faint">
              {String(m.id).padStart(3, "0")}
            </span>
            <h3 className="text-[1.05rem] leading-snug decoration-rule-strong underline-offset-4 group-hover:underline">
              {question?.title ?? (
                <span className="italic text-faint">
                  Question document does not match its hash
                </span>
              )}
            </h3>
          </div>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 pl-[2.55rem]">
            <Stamp state={m.state} />
            {question ? <Provenance kind={question.sourceClass} /> : null}
          </div>
        </div>

        <div className="flex items-baseline gap-6 pl-[2.55rem] sm:justify-end sm:pl-0">
          {impliedYes !== null ? (
            <div className="text-right">
              <div className="label">Yes</div>
              <div className="font-data text-sm">{impliedYes.toFixed(1)}%</div>
            </div>
          ) : null}
          <div className="text-right">
            <div className="label">Pool</div>
            <div className="font-data text-sm">{amount(total)}</div>
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
