import { Reflector, TESTNET, type QuestionDocument } from "@verdict/sdk";

/**
 * The demo questions.
 *
 * Deliberately one of each kind, because the pair is the argument. A question
 * an oracle can already settle shows Verdict deferring to the oracle rather
 * than competing with it. A question no oracle can settle shows why the
 * protocol exists at all. Shipping only the first would invite the obvious
 * objection — "Reflector already does this" — and it would be a fair one.
 */

/** Seconds. Reflector publishes on a 5-minute grid. */
const REFLECTOR_GRID = 300;

export interface Preset {
  id: string;
  summary: string;
  /** Seconds of trading before the market closes. */
  tradingWindow: number;
  build(now: number): QuestionDocument;
}

export const PRESETS: Preset[] = [
  {
    id: "xlm-price",
    summary: "XLM above a price at a fixed minute — settled from the Reflector oracle",
    tradingWindow: 90,
    build(now) {
      // Resolve against a minute that is already in the past when the resolve
      // window opens, and snap it to the oracle's grid — "latest" would let two
      // agents reading minutes apart disagree about nothing.
      const at = Reflector.floorToResolution(now - REFLECTOR_GRID, REFLECTOR_GRID);
      return {
        schema: "verdict.question/1",
        title: "Was XLM above $0.15 on the Reflector oracle?",
        criteria:
          `Resolves YES if the Reflector external-price oracle reports XLM/USD strictly ` +
          `above 0.15 for the price point at unix time ${at}. Resolves NO otherwise. ` +
          `The oracle publishes on a ${REFLECTOR_GRID}-second grid; the timestamp above is ` +
          `already snapped to it. Anyone can re-derive this by calling ` +
          `price(Other("XLM"), ${at}) on the oracle contract.`,
        sourceClass: "onchain",
        resolution: {
          kind: "reflector",
          oracle: TESTNET.reflector.external,
          asset: "XLM",
          comparator: "gt",
          threshold: "0.15",
          at,
        },
        knowableAt: at,
      };
    },
  },
  {
    id: "istanbul-weather",
    summary: "Istanbul daily maximum temperature — no oracle on Stellar can answer this",
    tradingWindow: 90,
    build(now) {
      // The archive lags real time, so ask about a day it already covers.
      const date = isoDate(now - 3 * 86_400);
      return {
        schema: "verdict.question/1",
        title: `Did Istanbul's maximum temperature exceed 30°C on ${date}?`,
        criteria:
          `Resolves YES if Open-Meteo's historical archive reports a daily ` +
          `temperature_2m_max strictly above 30.0°C for 41.01N, 28.98E on ${date} in the ` +
          `Europe/Istanbul timezone. Resolves NO otherwise. No price oracle on Stellar ` +
          `carries this figure; a resolver has to go and read it.`,
        sourceClass: "public-api",
        resolution: {
          kind: "open-meteo",
          latitude: 41.01,
          longitude: 28.98,
          date,
          metric: "temperature_2m_max",
          timezone: "Europe/Istanbul",
          comparator: "gt",
          threshold: "30.0",
        },
        knowableAt: now,
      };
    },
  },
  {
    id: "research",
    summary: "An open question settled by judgement over public sources",
    tradingWindow: 90,
    build(now) {
      return {
        schema: "verdict.question/1",
        title: "Is the ERC-8004 trustless-agent standard live on Ethereum mainnet?",
        criteria:
          `Resolves YES if the ERC-8004 registries are deployed and operating on ` +
          `Ethereum mainnet as of resolution time, per the standard's own ` +
          `documentation, the reference implementation repository, or reporting that ` +
          `cites one of those. Resolves NO if they remain testnet-only or unshipped. ` +
          `Nothing on any chain attests to this — a resolver must read the sources ` +
          `and judge.`,
        sourceClass: "research",
        resolution: {
          kind: "research",
          claim:
            "The ERC-8004 trustless-agent registries are deployed and live on Ethereum mainnet.",
          guidance:
            "Check eips.ethereum.org/EIPS/eip-8004, the erc-8004 reference contracts " +
            "repository, 8004.org, and any block-explorer or announcement that names a " +
            "mainnet deployment. Prefer primary sources over secondary reporting.",
        },
        knowableAt: now,
      };
    },
  },
];

export function presetById(id: string): Preset {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) {
    throw new Error(`Unknown preset "${id}". Available: ${PRESETS.map((x) => x.id).join(", ")}`);
  }
  return p;
}

function isoDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}
