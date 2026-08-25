import { xdr } from "@stellar/stellar-sdk";

import type { Chain } from "./chain";
import { sv } from "./chain";

/**
 * Reflector — the one oracle actually deployed and serving on Stellar testnet.
 *
 * The docs also list Band and DIA with testnet addresses, but nothing is
 * deployed at either; both were checked and neither returns a contract.
 *
 * Reflector matters here for one reason: a resolution derived from it is
 * *re-derivable*. `price(asset, timestamp)` is a pure function of chain state,
 * so a reader can run the same call and get the same number. That is a stronger
 * guarantee than anything an agent reporting an HTTP fetch can offer, and where
 * it applies Verdict should defer to it rather than compete with it.
 */

/** Reflector's asset enum. `Other` is a symbol like "XLM"; `Stellar` an address. */
export type ReflectorAsset =
  | { kind: "other"; symbol: string }
  | { kind: "stellar"; address: string };

export interface PriceData {
  /** Scaled by `decimals()` — 14 on the testnet oracles. */
  price: bigint;
  timestamp: bigint;
}

/**
 * A Soroban tuple-variant enum encodes as a vec of [variant symbol, ...values],
 * which `nativeToScVal` will not infer from a plain object.
 */
function assetToScVal(asset: ReflectorAsset): xdr.ScVal {
  return asset.kind === "other"
    ? xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Other"), xdr.ScVal.scvSymbol(asset.symbol)])
    : xdr.ScVal.scvVec([xdr.ScVal.scvSymbol("Stellar"), sv.address(asset.address)]);
}

export class Reflector {
  constructor(
    private chain: Chain,
    readonly contractId: string,
  ) {}

  decimals(): Promise<number> {
    return this.chain.read<number>(this.contractId, "decimals");
  }

  /** Seconds between price points. Timestamps must land on this grid. */
  resolution(): Promise<number> {
    return this.chain.read<number>(this.contractId, "resolution");
  }

  assets(): Promise<unknown[]> {
    return this.chain.read<unknown[]>(this.contractId, "assets");
  }

  lastPrice(asset: ReflectorAsset): Promise<PriceData | null> {
    return this.chain.read<PriceData | null>(this.contractId, "lastprice", [
      assetToScVal(asset),
    ]);
  }

  /**
   * Price at a specific time.
   *
   * Prefer this over `lastPrice` for anything that must be reproducible: two
   * agents reading "latest" minutes apart will honestly disagree, and the
   * disagreement is an artefact of when they happened to look rather than of
   * what was true.
   */
  priceAt(asset: ReflectorAsset, timestamp: number): Promise<PriceData | null> {
    return this.chain.read<PriceData | null>(this.contractId, "price", [
      assetToScVal(asset),
      sv.u64(timestamp),
    ]);
  }

  /** Round down to the oracle's grid; an off-grid timestamp returns nothing. */
  static floorToResolution(timestamp: number, resolution: number): number {
    return Math.floor(timestamp / resolution) * resolution;
  }

  /** Scaled integer to a decimal string, without going through a float. */
  static format(price: bigint, decimals: number): string {
    const negative = price < 0n;
    const digits = (negative ? -price : price).toString().padStart(decimals + 1, "0");
    const whole = digits.slice(0, digits.length - decimals);
    const frac = digits.slice(digits.length - decimals).replace(/0+$/, "");
    return `${negative ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
  }

  /** Decimal string to the oracle's scaled integer, for threshold comparison. */
  static parse(value: string, decimals: number): bigint {
    const [whole = "0", frac = ""] = value.split(".");
    return BigInt(whole + frac.padEnd(decimals, "0").slice(0, decimals));
  }
}
