import { Reflector, compare, comparatorText } from "@verdict/sdk";
import type { SourceClass } from "@verdict/sdk";

import type { Finding, ResolutionSource, SourceContext } from "./index.js";

/**
 * Resolves from the Reflector oracle, on-chain.
 *
 * This is the strongest kind of answer Verdict can carry. The evidence names a
 * contract, an asset and an exact timestamp, and `price(asset, timestamp)` is a
 * pure function of chain state — anyone can run the same call and get the same
 * number, today or next year. Lying about it is not a matter of opinion.
 *
 * Where a question can be answered this way, it should be. Verdict adds nothing
 * over the oracle here; it just makes the oracle's answer settle a market.
 */
export class ReflectorSource implements ResolutionSource {
  readonly id = "reflector";
  readonly sourceClass: SourceClass = "onchain";
  readonly description =
    "Reads a price from the Reflector oracle at the exact timestamp the question names.";

  async resolve(ctx: SourceContext): Promise<Finding> {
    const r = ctx.question.resolution;
    if (r.kind !== "reflector") {
      throw new Error(`This question is resolved by "${r.kind}", not by Reflector.`);
    }

    const oracle = new Reflector(ctx.chain, r.oracle);
    const [decimals, resolution] = await Promise.all([oracle.decimals(), oracle.resolution()]);

    // Reflector stores prices on a fixed grid. An off-grid timestamp returns
    // nothing at all, so snap down rather than fail on an arbitrary second.
    const at = Reflector.floorToResolution(r.at, resolution);
    const data = await oracle.priceAt({ kind: "other", symbol: r.asset }, at);
    if (!data) {
      throw new Error(
        `Reflector has no ${r.asset} price at ${at}. The oracle may not have been ` +
          `publishing then, or the timestamp is outside its retention.`,
      );
    }

    const threshold = Reflector.parse(r.threshold, decimals);
    const observedText = Reflector.format(data.price, decimals);
    const yes = compare(Number(data.price), r.comparator, Number(threshold));

    return {
      outcome: yes ? 1 : 0,
      reasoning:
        `Reflector reports ${r.asset} at ${observedText} for timestamp ${at}. ` +
        `The question asks whether it was ${comparatorText(r.comparator)} ${r.threshold}. ` +
        `It was ${yes ? "" : "not "}— the outcome is ${yes ? "YES" : "NO"}.`,
      observed: {
        asset: r.asset,
        priceRaw: data.price.toString(),
        price: observedText,
        decimals,
        timestamp: at,
        oracleResolution: resolution,
        threshold: r.threshold,
      },
      sources: [
        `stellar:testnet:${r.oracle}#price(${r.asset},${at})`,
        "https://reflector.network",
      ],
    };
  }
}
