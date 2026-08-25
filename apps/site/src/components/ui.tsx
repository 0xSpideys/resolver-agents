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

export function shortHash(h: string, head = 6, tail = 4): string {
  return h.length <= head + tail + 1 ? h : `${h.slice(0, head)}…${h.slice(-tail)}`;
}

export function relative(ts: bigint | number): string {
  const delta = Number(ts) - Math.floor(Date.now() / 1000);
  const abs = Math.abs(delta);
  const [n, unit] =
    abs < 90
      ? [abs, "sec"]
      : abs < 5400
        ? [Math.round(abs / 60), "min"]
        : abs < 172800
          ? [Math.round(abs / 3600), "hr"]
          : [Math.round(abs / 86400), "day"];
  return delta >= 0 ? `in ${n} ${unit}` : `${n} ${unit} ago`;
}

/**
 * The state marker.
 *
 * Deliberately not a pill or a badge. It is a ruled tag, set in the margin the
 * way a file is stamped, so the eye reads it as an annotation on the record
 * rather than a button.
 */
export function Stamp({ state }: { state: MarketState }) {
  const tone: Record<MarketState, string> = {
    Open: "text-affirm border-affirm/40",
    Resolving: "text-mark border-mark/40",
    Tallied: "text-mark border-mark/40",
    Disputed: "text-deny border-deny/40",
    Settled: "text-soft border-rule-strong",
    Void: "text-faint border-rule",
  };
  const said: Record<MarketState, string> = {
    Open: "open for positions",
    Resolving: "awaiting agents",
    Tallied: "open to challenge",
    Disputed: "under dispute",
    Settled: "settled",
    Void: "void",
  };
  return (
    <span
      className={`inline-block shrink-0 border px-1.5 py-0.5 font-data text-[0.62rem] uppercase tracking-[0.11em] ${tone[state]}`}
    >
      {said[state]}
    </span>
  );
}

/**
 * How far an answer of this kind can be trusted, stated before anyone reads it.
 *
 * Every question declares one. Showing it next to the answer is the difference
 * between "an agent said so" and "an agent said so, and here is what that is
 * worth" — the second is the only honest claim this protocol can make.
 */
export const PROVENANCE: Record<string, { name: string; note: string }> = {
  onchain: {
    name: "On-chain",
    note: "Re-derivable by anyone from chain state, today or in a year. A false claim is provable, not merely suspected.",
  },
  "public-api": {
    name: "Public source",
    note: "Anyone can re-run the request while the provider still serves it. Nothing on-chain attests to the value.",
  },
  research: {
    name: "Judgement",
    note: "Read and decided by an agent. Not reproducible. The bond, the challenge window and the record are what stand behind it.",
  },
};

/** The short form. Used in lists and beside a submission. */
export function Provenance({ kind }: { kind: string }) {
  const c = PROVENANCE[kind];
  return (
    <span className="font-data text-[0.68rem] uppercase tracking-[0.1em] text-soft">
      {c?.name ?? kind}
    </span>
  );
}

/** The long form. Used once per page, where there is room to explain. */
export function ProvenanceNote({ kind }: { kind: string }) {
  const c = PROVENANCE[kind];
  if (!c) return null;
  return (
    <p className="max-w-2xl text-sm leading-relaxed text-soft">
      <span className="font-data text-[0.68rem] uppercase tracking-[0.1em]">
        {c.name}.
      </span>{" "}
      {c.note}
    </p>
  );
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="label">{label}</div>
      <div className="mt-1 font-data text-sm">{children}</div>
    </div>
  );
}

/**
 * The margin layout: a narrow annotation column on the left, the body on the
 * right, collapsing to stacked on small screens.
 */
export function Margin({
  note,
  children,
}: {
  note: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-x-8 gap-y-2 sm:grid-cols-[8.5rem_1fr]">
      <div className="pt-0.5">{note}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Section({
  label,
  title,
  children,
}: {
  label: string;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rule-t py-9">
      <Margin
        note={
          <>
            <div className="label">{label}</div>
            {title ? (
              <div className="mt-1 text-sm leading-snug text-soft">{title}</div>
            ) : null}
          </>
        }
      >
        {children}
      </Margin>
    </section>
  );
}

/** A YES/NO figure. Uses ink tones, not traffic lights. */
export function Side({ side }: { side: "YES" | "NO" }) {
  return (
    <span className={side === "YES" ? "text-affirm" : "text-deny"}>{side}</span>
  );
}
