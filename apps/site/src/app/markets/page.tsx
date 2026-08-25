"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { getCase, getExhibits, toHex, type Exhibit } from "@/lib/chain";
import { useAsync } from "@/hooks/useAsync";
import {
  Field,
  Provenance,
  ProvenanceNote,
  Section,
  Side,
  Stamp,
  amount,
  relative,
  weight,
} from "@/components/ui";

/** The margin note is just the class name; the explanation goes in the body. */
function PROVENANCE_LABEL(kind: string) {
  return <Provenance kind={kind} />;
}

/**
 * One page serves every market, reading the id from the query string.
 *
 * A `/markets/[id]` route would need every id enumerated at build time, and any
 * market opened afterwards would 404 until the next deploy. Since the data is
 * fetched in the browser anyway, one shell that works for any id — including
 * ones that do not exist yet — is both simpler and more correct.
 */
export default function MarketRoute() {
  return (
    <Suspense fallback={<div className="py-16" />}>
      <MarketPage />
    </Suspense>
  );
}

function MarketPage() {
  const id = useSearchParams().get("id");
  const query = useAsync(id ?? "", async () => {
    if (id === null || !/^\d+$/.test(id)) throw new Error("No market id in the URL.");
    const key = BigInt(id);
    const [c, exhibits] = await Promise.all([getCase(key), getExhibits(key)]);
    return { c, exhibits };
  });

  if (query.loading) {
    return (
      <div className="py-16">
        <p className="label">Reading market {id}</p>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="py-16">
        <p className="label">Not found</p>
        <p className="mt-3 max-w-lg leading-relaxed text-soft">
          No market with that id could be read from the contract.
        </p>
        <p className="hash mt-3 text-xs text-faint">{query.error}</p>
        <Link href="/" className="mt-6 inline-block font-data text-sm text-soft underline decoration-rule-strong underline-offset-4">
          Back to the docket
        </Link>
      </div>
    );
  }

  const { c, exhibits } = query.data;
  const { market: m, question, pools } = c;
  const total = pools.no + pools.yes;
  const impliedYes = total > 0n ? Number((pools.yes * 1000n) / total) / 10 : null;
  const settled = m.state === "Settled";

  return (
    <article>
      <header className="py-12 sm:py-16">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="font-data text-[0.72rem] text-faint">
            MARKET {String(m.id).padStart(3, "0")}
          </span>
          <Stamp state={m.state} />
        </div>

        <h1 className="mt-4 max-w-3xl text-[1.8rem] font-light leading-[1.2] tracking-tight sm:text-[2.3rem]">
          {question?.title ?? "Question document does not match its hash"}
        </h1>

        {settled ? (
          <p className="mt-5 flex items-baseline gap-2.5 text-lg">
            <span className="label">Ruling</span>
            <Side side={m.final_outcome === 1 ? "YES" : "NO"} />
          </p>
        ) : null}

        {m.state === "Void" ? (
          <p className="mt-5 max-w-xl leading-relaxed text-soft">
            Voided. No outcome could be established, so every stake is refundable in
            full, every bond went back, no fee was taken, and nothing was recorded
            about who was right.
          </p>
        ) : null}
      </header>

      {question ? (
        <Section label="Criteria" title={PROVENANCE_LABEL(question.sourceClass)}>
          <p className="max-w-2xl text-[1.02rem] leading-relaxed">{question.criteria}</p>

          <div className="mt-5 border-l-2 border-rule-strong pl-4">
            <ProvenanceNote kind={question.sourceClass} />
          </div>

          <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
            <Field label="Question hash">
              <span className="hash text-xs text-soft">{toHex(m.question_hash)}</span>
            </Field>
            <Field label="Checked">
              <span className="text-affirm">matches the chain</span>
            </Field>
          </div>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-faint">
            The criteria were hashed when the market opened, and the document above
            reproduces that hash in your browser just now. Nobody can restate the
            question once positions are on it. An agent that finds a mismatch
            refuses to resolve rather than guessing which version is real.
          </p>
        </Section>
      ) : (
        <Section label="Criteria">
          <p className="max-w-2xl text-[1.02rem] leading-relaxed text-deny">
            The question document does not hash to the value stored on-chain, so
            there is no trustworthy statement of what this market asks.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-faint">
            The earliest markets on this deployment were opened before question
            hashing was enforced. They are left visible rather than quietly hidden.
          </p>
        </Section>
      )}

      <Section
        label="Positions"
        title="Parimutuel. The winning side splits what the other side staked."
      >
        <div className="grid gap-px overflow-hidden border border-rule bg-rule sm:grid-cols-2">
          <Pool side="YES" value={pools.yes} share={impliedYes} won={settled && m.final_outcome === 1} />
          <Pool
            side="NO"
            value={pools.no}
            share={impliedYes === null ? null : 100 - impliedYes}
            won={settled && m.final_outcome === 0}
          />
        </div>

        <div className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
          <Field label="Total staked">{amount(total)}</Field>
          <Field label="Fee">{(m.fee_bps / 100).toFixed(2)}% of the losing side</Field>
          <Field label="Resolver bond">{amount(m.resolver_bond)}</Field>
          {settled ? <Field label="To winners">{amount(m.distributable)}</Field> : null}
          {settled ? <Field label="To resolvers">{amount(m.resolver_pool)}</Field> : null}
        </div>
      </Section>

      <Section label="Exhibits" title="What each agent found, and what it staked on being right.">
        {exhibits.length === 0 ? (
          <p className="text-sm italic text-faint">No agent has submitted yet.</p>
        ) : (
          <ol>
            {exhibits.map((x, i) => (
              <ExhibitRow
                key={x.submission.agent_id}
                index={i + 1}
                x={x}
                finalOutcome={settled ? m.final_outcome : null}
              />
            ))}
          </ol>
        )}
      </Section>

      <Section label="Docket" title="Every deadline is on-chain and enforced by the contract.">
        <dl className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
          <Entry term="Trading closed" value={relative(m.close_ts)} />
          <Entry term="Agents had until" value={relative(m.resolve_deadline)} />
          {m.challenge_deadline > 0n ? (
            <Entry term="Challenge window ended" value={relative(m.challenge_deadline)} />
          ) : null}
          <Entry
            term="Resolvers settled"
            value={m.resolvers_settled ? "paid and slashed" : "not yet"}
          />
        </dl>
      </Section>

      <div className="rule-t py-8">
        <Link
          href="/"
          className="font-data text-[0.78rem] text-soft transition-colors hover:text-ink"
        >
          ← Back to the docket
        </Link>
      </div>
    </article>
  );
}

function Pool({
  side,
  value,
  share,
  won,
}: {
  side: "YES" | "NO";
  value: bigint;
  share: number | null;
  won: boolean;
}) {
  return (
    <div className="bg-leaf p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-data text-sm tracking-wide">
          <Side side={side} />
        </span>
        {won ? <span className="label text-affirm">ruled</span> : null}
      </div>
      <div className="mt-2 text-2xl font-light">
        {share === null ? "—" : `${share.toFixed(1)}%`}
      </div>
      <div className="mt-1 font-data text-xs text-faint">{amount(value)} staked</div>
      {share !== null ? (
        <div className="mt-3 h-px w-full bg-rule">
          <div
            className={`h-px ${side === "YES" ? "bg-affirm" : "bg-deny"}`}
            style={{ width: `${Math.max(share, 1)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function ExhibitRow({
  index,
  x,
  finalOutcome,
}: {
  index: number;
  x: Exhibit;
  finalOutcome: number | null;
}) {
  const s = x.submission;
  const e = x.evidence;
  const correct = finalOutcome === null ? null : s.outcome === finalOutcome;

  return (
    <li className="border-b border-rule py-5 last:border-b-0">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="font-data text-[0.72rem] text-faint">
          {String(index).padStart(2, "0")}
        </span>
        <Link
          href={`/agents/#agent-${s.agent_id}`}
          className="font-data text-sm underline decoration-rule-strong underline-offset-4"
        >
          Agent {s.agent_id}
        </Link>
        <span className="font-data text-sm">
          said <Side side={s.outcome === 1 ? "YES" : "NO"} />
        </span>
        <span className="label">at {weight(s.weight)}</span>
        {e ? <Provenance kind={e.sourceClass} /> : null}
        {correct !== null ? (
          <span
            className={`font-data text-[0.68rem] uppercase tracking-[0.1em] ${
              correct ? "text-affirm" : "text-deny"
            }`}
          >
            {correct ? "bond returned, paid" : "bond slashed"}
          </span>
        ) : null}
      </div>

      {e ? (
        <div className="mt-3 sm:pl-[2.4rem]">
          <p className="max-w-2xl leading-relaxed">{e.reasoning}</p>

          {e.caveat ? (
            <p className="mt-2 max-w-2xl border-l-2 border-rule-strong pl-3 text-sm italic leading-relaxed text-soft">
              {e.caveat}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            {e.sources.map((src) => (
              <SourceRef key={src} href={src} />
            ))}
          </div>

          <p className="mt-3 font-data text-[0.68rem] text-faint">
            {x.intact
              ? "evidence matches the hash it committed to"
              : "evidence does NOT match its hash"}
            {" · "}
            {toHex(s.evidence_hash).slice(0, 16)}…
          </p>
        </div>
      ) : (
        <p className="mt-2 text-sm italic text-faint sm:pl-[2.4rem]">
          Evidence could not be decoded.
        </p>
      )}
    </li>
  );
}

/** On-chain citations are not links; everything else is. */
function SourceRef({ href }: { href: string }) {
  if (!href.startsWith("http")) {
    return <span className="hash text-xs text-faint">{href}</span>;
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
      className="font-data text-xs text-soft underline decoration-rule-strong underline-offset-4 transition-colors hover:text-ink"
    >
      {label} ↗
    </a>
  );
}

function Entry({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule py-2">
      <dt className="text-sm text-soft">{term}</dt>
      <dd className="font-data text-sm">{value}</dd>
    </div>
  );
}
