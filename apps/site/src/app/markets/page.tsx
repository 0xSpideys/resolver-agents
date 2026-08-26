"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { getCase, getExhibits, getStake, toHex, type Exhibit } from "@/lib/chain";
import { useAsync } from "@/hooks/useAsync";
import { MarketActions } from "@/components/actions";
import { useWallet } from "@/components/wallet";
import { useNow } from "@/hooks/useNow";
import {
  Odds,
  Provenance,
  ProvenanceNote,
  Section,
  Side,
  Stat,
  Status,
  amount,
  relative,
  weight,
} from "@/components/ui";

/**
 * One page serves every market, reading the id from the query string.
 *
 * A `/markets/[id]` route would need every id enumerated at build time, and a
 * market opened afterwards would 404 until the next deploy. The data is fetched
 * in the browser regardless, so one shell that works for any id is both simpler
 * and more correct.
 */
export default function MarketRoute() {
  return (
    <Suspense fallback={<div className="py-20" />}>
      <MarketPage />
    </Suspense>
  );
}

function MarketPage() {
  const id = useSearchParams().get("id");
  const { address } = useWallet();
  // Bumped after any write so the page re-reads rather than showing the state
  // that existed before the transaction landed.
  const [version, setVersion] = useState(0);

  const query = useAsync(`${id}:${address ?? ""}:${version}`, async () => {
    if (id === null || !/^\d+$/.test(id)) throw new Error("No market id in the URL.");
    const key = BigInt(id);
    const [c, exhibits, stake] = await Promise.all([
      getCase(key),
      getExhibits(key),
      address ? getStake(key, address) : Promise.resolve(null),
    ]);
    return { c, exhibits, stake };
  });

  if (query.loading) {
    return (
      <div className="py-20">
        <div className="h-5 w-40 animate-pulse rounded bg-sunk" />
        <div className="mt-5 h-11 w-full max-w-2xl animate-pulse rounded bg-sunk" />
        <div className="mt-8 h-32 w-full max-w-3xl animate-pulse rounded-xl bg-sunk" />
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="py-20">
        <h1 className="font-display text-[2rem] tracking-tight">Not found</h1>
        <p className="mt-3 max-w-md text-mid">
          No market with that id could be read from the contract.
        </p>
        <Link href="/" className="btn mt-6">
          All markets
        </Link>
      </div>
    );
  }

  return <MarketBody data={query.data} onDone={() => setVersion((v) => v + 1)} />;
}

function MarketBody({
  data,
  onDone,
}: {
  data: {
    c: Awaited<ReturnType<typeof getCase>>;
    exhibits: Exhibit[];
    stake: { yes: bigint; no: bigint } | null;
  };
  onDone: () => void;
}) {
  const now = useNow();
  const { c, exhibits, stake } = data;
  const { market: m, question, pools } = c;
  const total = pools.no + pools.yes;
  const yes = total > 0n ? Number((pools.yes * 1000n) / total) / 10 : null;
  const settled = m.state === "Settled";

  return (
    <article>
      <header className="py-12 sm:py-16">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="tag">Market {String(m.id).padStart(3, "0")}</span>
          <Status
            state={m.state}
            expired={m.state === "Open" && now >= Number(m.close_ts)}
          />
          {question ? <Provenance kind={question.sourceClass} /> : null}
        </div>

        <h1 className="mt-4 max-w-3xl font-display text-[2rem] leading-[1.1] tracking-tight sm:text-[2.7rem]">
          {question?.title ?? "Question does not match its hash"}
        </h1>

        {/* The readout: the price, the two sides, and the size, in one object. */}
        <div className="panel raised mt-8 max-w-3xl overflow-hidden">
          <div className="grid gap-px bg-line sm:grid-cols-[1fr_14rem]">
            <div className="bg-panel p-5">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <div className="tag">{settled ? "Ruling" : "Implied yes"}</div>
                  <div className="mt-1 font-data text-[2.4rem] leading-none">
                    {settled ? (
                      <span className={m.final_outcome === 1 ? "text-yes" : "text-no"}>
                        {m.final_outcome === 1 ? "YES" : "NO"}
                      </span>
                    ) : yes === null ? (
                      "—"
                    ) : (
                      `${yes.toFixed(0)}%`
                    )}
                  </div>
                </div>
                <div className="flex gap-6 pb-1">
                  <Stat label="Yes" align="right">
                    <span className="text-yes">{amount(pools.yes, 0)}</span>
                  </Stat>
                  <Stat label="No" align="right">
                    <span className="text-no">{amount(pools.no, 0)}</span>
                  </Stat>
                </div>
              </div>
              <div className="mt-4">
                <Odds yes={yes} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-x-6 gap-y-4 bg-panel p-5 sm:grid-cols-1">
              <Stat label="Pool">{amount(total)}</Stat>
              <Stat label="Bond">{amount(m.resolver_bond, 0)}</Stat>
              {settled ? <Stat label="To winners">{amount(m.distributable)}</Stat> : null}
            </div>
          </div>
        </div>

        {m.state === "Void" ? (
          <p className="mt-5 max-w-lg text-[0.95rem] leading-relaxed text-mid">
            No outcome could be established. Every stake is refundable in full and
            every bond went back. No fee taken, nothing recorded.
          </p>
        ) : null}

        <MarketActions market={m} yourStake={stake} onDone={onDone} />
      </header>

      {question ? (
        <Section label="Criteria" note="Fixed when the market opened">
          <div className="max-w-2xl">
            <p className="text-[1rem] leading-relaxed">{question.criteria}</p>

            <div className="mt-5 rounded-lg border border-line bg-sunk p-4">
              <ProvenanceNote kind={question.sourceClass} />
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="tag">Hash</span>
              <span className="hash text-xs text-mid">{toHex(m.question_hash)}</span>
              <span className="text-[0.78rem] text-yes">verified in your browser</span>
            </div>
          </div>
        </Section>
      ) : (
        <Section label="Criteria">
          <p className="max-w-xl text-[1rem] leading-relaxed text-no">
            The question does not match the hash on-chain, so there is no trustworthy
            statement of what this market asks.
          </p>
          <p className="mt-2 max-w-xl text-[0.88rem] text-dim">
            An early market, opened before hashing was enforced. Left visible rather
            than hidden.
          </p>
        </Section>
      )}

      <Section label="Answers" note={`${exhibits.length} submitted`}>
        {exhibits.length === 0 ? (
          <p className="text-[0.88rem] text-dim">No agent has answered yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {exhibits.map((x) => (
              <ExhibitCard
                key={x.submission.agent_id}
                x={x}
                finalOutcome={settled ? m.final_outcome : null}
              />
            ))}
          </ol>
        )}
      </Section>

      <Section label="Timing" note="Enforced by the contract">
        <dl className="grid max-w-2xl gap-x-10 gap-y-3 sm:grid-cols-2">
          <Entry term="Trading closed" value={relative(m.close_ts)} />
          <Entry term="Answers due" value={relative(m.resolve_deadline)} />
          {m.challenge_deadline > 0n ? (
            <Entry term="Challenge ended" value={relative(m.challenge_deadline)} />
          ) : null}
          <Entry
            term="Agents settled"
            value={m.resolvers_settled ? "paid and slashed" : "not yet"}
          />
        </dl>
      </Section>

      <div className="border-t border-line py-8">
        <Link href="/" className="btn">
          All markets
        </Link>
      </div>
    </article>
  );
}

function ExhibitCard({ x, finalOutcome }: { x: Exhibit; finalOutcome: number | null }) {
  const s = x.submission;
  const e = x.evidence;
  const correct = finalOutcome === null ? null : s.outcome === finalOutcome;

  return (
    <li className="panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link
            href={`/agents/#agent-${s.agent_id}`}
            className="font-data text-[0.85rem] underline decoration-line-firm underline-offset-4 transition-colors hover:text-fg"
          >
            Agent {s.agent_id}
          </Link>
          <Side side={s.outcome === 1 ? "YES" : "NO"} />
          <span className="tag">weight {weight(s.weight)}</span>
          {e ? <Provenance kind={e.sourceClass} /> : null}
        </div>

        {correct !== null ? (
          <span
            className={`rounded-md px-2 py-0.5 text-[0.75rem] ${
              correct ? "bg-[var(--yes-wash)] text-yes" : "bg-[var(--no-wash)] text-no"
            }`}
          >
            {correct ? "paid" : "bond slashed"}
          </span>
        ) : null}
      </div>

      {e ? (
        <>
          <p className="mt-3 max-w-2xl leading-relaxed">{e.reasoning}</p>

          {e.caveat ? (
            <p className="mt-2.5 max-w-2xl border-l-2 border-line-firm pl-3 text-[0.85rem] leading-relaxed text-mid">
              {e.caveat}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
            {e.sources.map((src) => (
              <SourceRef key={src} href={src} />
            ))}
            <span className="tag">
              {x.intact ? "evidence matches its hash" : "hash mismatch"}
            </span>
          </div>
        </>
      ) : (
        <p className="mt-2 text-[0.88rem] text-dim">Evidence could not be decoded.</p>
      )}
    </li>
  );
}

/** On-chain citations are not links; everything else is. */
function SourceRef({ href }: { href: string }) {
  if (!href.startsWith("http")) {
    return <span className="hash text-[0.72rem] text-dim">{href}</span>;
  }
  let label = href;
  try {
    label = new URL(href).hostname.replace(/^www\./, "");
  } catch {
    /* keep the raw string */
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-[0.78rem] text-mid underline decoration-line-firm underline-offset-4 transition-colors hover:text-fg"
    >
      {label} ↗
    </a>
  );
}

function Entry({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
      <dt className="text-[0.88rem] text-mid">{term}</dt>
      <dd className="font-data text-[0.85rem]">{value}</dd>
    </div>
  );
}
