"use client";

import { useState } from "react";
import { TESTNET, type Market } from "@verdict/sdk";

import { useWallet } from "@/components/wallet";
import { useNow } from "@/hooks/useNow";
import { useAsync } from "@/hooks/useAsync";
import { amount } from "@/components/ui";
import { getXlmPrice } from "@/lib/chain";

/** Money is 7 decimals; the field takes whole units. */
const UNIT = 10_000_000n;

function toStroops(input: string): bigint | null {
  if (!/^\d+(\.\d{1,7})?$/.test(input)) return null;
  const [whole = "0", frac = ""] = input.split(".");
  return BigInt(whole) * UNIT + BigInt(frac.padEnd(7, "0"));
}

type Busy = null | string;

/**
 * Everything a connected account can do to a market.
 *
 * Which control appears is decided by the contract's own rules rather than by
 * who is looking: betting while open, closing once the clock has passed,
 * tallying once answers are due, finalising once the challenge window is out,
 * claiming once settled. All of those calls are permissionless — the only
 * reason they are not buttons in most dApps is that most dApps keep the
 * lifecycle in a backend.
 */
export function MarketActions({
  market,
  yourStake,
  onDone,
}: {
  market: Market;
  yourStake: { yes: bigint; no: bigint } | null;
  onDone: () => void;
}) {
  const { address, connect, connecting, verdict } = useWallet();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const now = useNow();
  const state = market.state;

  const canClose = state === "Open" && now >= Number(market.close_ts);
  const canTally = state === "Resolving" && now >= Number(market.resolve_deadline);
  const canFinalize = state === "Tallied" && now >= Number(market.challenge_deadline);
  const canSettleAgents =
    (state === "Settled" || state === "Void") && !market.resolvers_settled;
  const won = state === "Settled" && yourStake
    ? (market.final_outcome === 1 ? yourStake.yes : yourStake.no) > 0n
    : false;

  async function run(label: string, fn: () => Promise<{ hash: string }>) {
    if (!verdict) return;
    setBusy(label);
    setError(null);
    setDone(null);
    try {
      const { hash } = await fn();
      setDone(`${label} · ${hash.slice(0, 10)}…`);
      onDone();
    } catch (err) {
      setError(readable((err as Error).message));
    } finally {
      setBusy(null);
    }
  }

  if (!address) {
    return (
      <Panel>
        <p className="text-[0.9rem] text-mid">
          Connect a wallet to take a position or move this market along.
        </p>
        <button
          type="button"
          onClick={connect}
          disabled={connecting}
          className="btn btn-solid mt-3 disabled:opacity-60"
        >
          {connecting ? "Connecting…" : "Connect wallet"}
        </button>
        <p className="mt-3 text-[0.78rem] text-dim">
          Testnet only. You will need testnet XLM to take a position.
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      {state === "Open" && now < Number(market.close_ts) ? (
        <Bet market={market} onDone={onDone} setError={setError} setDone={setDone} />
      ) : null}

      {(canClose || canTally || canFinalize || canSettleAgents || won) && (
        <div className={state === "Open" ? "mt-5 border-t border-line pt-4" : ""}>
          <div className="flex flex-wrap gap-2">
            {canClose ? (
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => run("Closed", () => verdict!.closeMarket(market.id))}
              >
                {busy === "Closed" ? "Closing…" : "Close trading"}
              </button>
            ) : null}

            {canTally ? (
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() =>
                  run("Tallied", async () => {
                    const r = await verdict!.tally(market.id);
                    return { hash: r.hash };
                  })
                }
              >
                {busy === "Tallied" ? "Tallying…" : "Tally the answers"}
              </button>
            ) : null}

            {canFinalize ? (
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() => run("Finalised", () => verdict!.finalize(market.id))}
              >
                {busy === "Finalised" ? "Finalising…" : "Finalise"}
              </button>
            ) : null}

            {canSettleAgents ? (
              <button
                type="button"
                className="btn"
                disabled={busy !== null}
                onClick={() =>
                  run("Agents settled", () => verdict!.settleResolvers(market.id))
                }
              >
                {busy === "Agents settled" ? "Settling…" : "Pay and slash agents"}
              </button>
            ) : null}

            {won ? (
              <button
                type="button"
                className="btn btn-solid"
                disabled={busy !== null}
                onClick={() =>
                  run("Claimed", async () => {
                    const r = await verdict!.claim(address, market.id);
                    return { hash: r.hash };
                  })
                }
              >
                {busy === "Claimed" ? "Claiming…" : "Claim winnings"}
              </button>
            ) : null}
          </div>

          <p className="mt-2.5 text-[0.78rem] text-dim">
            These calls are open to anyone. Moving a market forward is not a
            privilege the operator holds.
          </p>
        </div>
      )}

      {yourStake && (yourStake.yes > 0n || yourStake.no > 0n) ? (
        <p className="mt-4 border-t border-line pt-3 text-[0.82rem] text-mid">
          Your position:{" "}
          {yourStake.yes > 0n ? (
            <span className="text-yes">{amount(yourStake.yes)} on YES</span>
          ) : null}
          {yourStake.yes > 0n && yourStake.no > 0n ? " · " : null}
          {yourStake.no > 0n ? (
            <span className="text-no">{amount(yourStake.no)} on NO</span>
          ) : null}
        </p>
      ) : null}

      {error ? <Note tone="no">{error}</Note> : null}
      {done ? <Note tone="yes">{done}</Note> : null}
    </Panel>
  );
}

function Bet({
  market,
  onDone,
  setError,
  setDone,
}: {
  market: Market;
  onDone: () => void;
  setError: (s: string | null) => void;
  setDone: (s: string | null) => void;
}) {
  const { address, verdict } = useWallet();
  const [value, setValue] = useState("10");
  const [side, setSide] = useState<0 | 1>(1);
  const [busy, setBusy] = useState(false);

  const stroops = toStroops(value);
  const valid = stroops !== null && stroops > 0n;

  const isXlm = market.token === TESTNET.token;
  const { data: xlmPrice } = useAsync("xlm-usd", getXlmPrice);
  const usdValue =
    isXlm && valid && xlmPrice ? Number(value) * xlmPrice : null;

  async function place() {
    if (!verdict || !address || !valid) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { hash } = await verdict.bet(address, market.id, side, stroops);
      setDone(`Position taken · ${hash.slice(0, 10)}…`);
      onDone();
    } catch (err) {
      setError(readable((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="tag">Take a position</div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line-firm p-0.5">
          {([1, 0] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSide(s)}
              className={`h-8 rounded-md px-4 text-[0.85rem] font-medium transition-colors ${
                side === s
                  ? s === 1
                    ? "bg-[var(--yes-wash)] text-yes"
                    : "bg-[var(--no-wash)] text-no"
                  : "text-dim hover:text-mid"
              }`}
            >
              {s === 1 ? "YES" : "NO"}
            </button>
          ))}
        </div>

        <label className="flex h-[2.35rem] items-center gap-2 rounded-lg border border-line-firm px-3">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            aria-label="Amount"
            className="w-20 bg-transparent font-data text-[0.9rem] outline-none"
          />
          <span className="tag">{isXlm ? "XLM" : "VUSD"}</span>
        </label>
        {usdValue !== null ? (
          <span className="text-[0.8rem] text-dim">≈ ${usdValue.toFixed(2)}</span>
        ) : null}

        <button
          type="button"
          onClick={place}
          disabled={!valid || busy}
          className="btn btn-solid disabled:opacity-50"
        >
          {busy ? "Signing…" : "Place"}
        </button>
      </div>
      {!valid ? (
        <p className="mt-2 text-[0.78rem] text-no">Enter an amount above zero.</p>
      ) : null}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="panel raised mt-8 max-w-3xl p-5">{children}</div>;
}

function Note({ tone, children }: { tone: "yes" | "no"; children: React.ReactNode }) {
  return (
    <p
      className={`mt-3 rounded-lg px-3 py-2 text-[0.82rem] ${
        tone === "yes"
          ? "bg-[var(--yes-wash)] text-yes"
          : "bg-[var(--no-wash)] text-no"
      }`}
    >
      {children}
    </p>
  );
}

/**
 * Contract errors arrive as a numeric code inside a long host-error string.
 * Showing that raw is useless; these are the ones a visitor can actually hit.
 */
function readable(message: string): string {
  const m = message.match(/Error\(Contract, #(\d+)\)/);
  const code = m?.[1];
  const known: Record<string, string> = {
    "103": "The contract is paused.",
    "201": "The market is not in a state that allows this.",
    "205": "Trading has closed.",
    "206": "Trading is still open.",
    "300": "The amount is too small.",
    "301": "There is nothing to claim on this market.",
    "302": "Already claimed.",
    "303": "The market has not settled yet.",
    "403": "The window for answers has closed.",
    "404": "Agents can still answer; the tally is not due.",
    "500": "The challenge window has closed.",
    "501": "The challenge window is still open.",
  };
  if (code && known[code]) return known[code];
  if (/trustline/i.test(message)) {
    return "Your account has no trustline for this market's token.";
  }
  if (/insufficient|underfunded|balance/i.test(message)) {
    return "Not enough of the market's token in this account.";
  }
  if (/User (declined|rejected)|denied/i.test(message)) return "Signing was cancelled.";
  return message.length > 160 ? `${message.slice(0, 160)}…` : message;
}
