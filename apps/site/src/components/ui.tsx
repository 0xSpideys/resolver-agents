import type { MarketState } from "@verdict/sdk";

/** Money is stored with 7 decimals, like USDC on Stellar. */
export function amount(v: bigint | number, decimals = 2): string {
  return (Number(v) / 1e7).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function weight(w: number): string {
  return `${(w / 100).toFixed(2)}×`;
}

export function relative(ts: bigint | number): string {
  const delta = Number(ts) - Math.floor(Date.now() / 1000);
  const abs = Math.abs(delta);
  const [n, unit] =
    abs < 90
      ? [abs, "s"]
      : abs < 5400
        ? [Math.round(abs / 60), "m"]
        : abs < 172800
          ? [Math.round(abs / 3600), "h"]
          : [Math.round(abs / 86400), "d"];
  return delta >= 0 ? `in ${n}${unit}` : `${n}${unit} ago`;
}

/**
 * The implied odds, drawn as the split itself rather than a chart of it.
 *
 * In a parimutuel market a side's share of the pool *is* the price, so one bar
 * cut at that point says everything a percentage and a legend would, in less
 * space and with no reading required.
 */
export function Odds({ yes }: { yes: number | null }) {
  return (
    <div className="odds" role="img" aria-label={yes === null ? "No positions yet" : `${yes.toFixed(0)}% yes`}>
      <i style={{ width: `${yes ?? 0}%` }} />
    </div>
  );
}

const STATE_COPY: Record<MarketState, { said: string; tone: string }> = {
  Open: { said: "Open", tone: "text-yes" },
  Resolving: { said: "With agents", tone: "text-brass" },
  Tallied: { said: "Challengeable", tone: "text-brass" },
  Disputed: { said: "Disputed", tone: "text-no" },
  Settled: { said: "Settled", tone: "text-mid" },
  Void: { said: "Void", tone: "text-dim" },
};

/**
 * `expired` is not a contract state. A market whose clock has run out stays
 * Open until somebody calls close_market, and showing it as plain "Open" makes
 * the interface look stuck when it is in fact waiting for a nudge anyone can
 * give.
 */
export function Status({ state, expired }: { state: MarketState; expired?: boolean }) {
  const c =
    expired && state === "Open"
      ? { said: "Needs closing", tone: "text-brass" }
      : STATE_COPY[state];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[0.78rem] ${c.tone}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {c.said}
    </span>
  );
}

const PROVENANCE: Record<string, { name: string; note: string }> = {
  onchain: {
    name: "On-chain",
    note: "Re-derivable from chain state by anyone. A false claim is provable.",
  },
  "public-api": {
    name: "Public source",
    note: "Anyone can re-run the request. Nothing on-chain attests to the value.",
  },
  research: {
    name: "Judgement",
    note: "Read and decided by an agent. Not reproducible; the bond stands behind it.",
  },
};

/** Short form, for lists and beside a submission. */
export function Provenance({ kind }: { kind: string }) {
  return (
    <span className="text-[0.78rem] text-dim">{PROVENANCE[kind]?.name ?? kind}</span>
  );
}

/** Long form, used once where there is room to say what it means. */
export function ProvenanceNote({ kind }: { kind: string }) {
  const c = PROVENANCE[kind];
  if (!c) return null;
  return (
    <p className="text-[0.86rem] leading-relaxed text-mid">
      <span className="font-medium text-fg">{c.name}.</span> {c.note}
    </p>
  );
}

export function Stat({
  label,
  children,
  align = "left",
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : undefined}>
      <div className="tag">{label}</div>
      <div className="mt-1 font-data text-[0.9rem]">{children}</div>
    </div>
  );
}

export function Section({
  label,
  note,
  children,
}: {
  label: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line py-9">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="font-display text-[1.35rem] leading-none tracking-tight">
          {label}
        </h2>
        {note ? <p className="text-[0.85rem] text-dim">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** A YES/NO figure. */
export function Side({ side }: { side: "YES" | "NO" }) {
  return (
    <span className={`font-medium ${side === "YES" ? "text-yes" : "text-no"}`}>
      {side}
    </span>
  );
}
