import { compare, comparatorText } from "@verdict/sdk";
import type { SourceClass } from "@verdict/sdk";

import type { Finding, ResolutionSource, SourceContext } from "./index";

/**
 * Resolves from Open-Meteo's historical archive.
 *
 * Chosen over the many weather APIs that need a key because a demo nobody else
 * can reproduce proves nothing: this endpoint is public, unauthenticated, and
 * serves a fixed archive rather than a live reading, so the same request keeps
 * returning the same number after the fact.
 *
 * Weaker than the oracle, and the evidence says so. Anyone can re-run the URL,
 * but they are trusting Open-Meteo to still answer honestly — nothing on-chain
 * enforces that.
 */
export class OpenMeteoSource implements ResolutionSource {
  readonly id = "open-meteo";
  readonly sourceClass: SourceClass = "public-api";
  readonly description =
    "Reads a daily weather value from Open-Meteo's public archive and compares it to the question's threshold.";

  async resolve(ctx: SourceContext): Promise<Finding> {
    const r = ctx.question.resolution;
    if (r.kind !== "open-meteo") {
      throw new Error(`This question is resolved by "${r.kind}", not by Open-Meteo.`);
    }

    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${r.latitude}&longitude=${r.longitude}` +
      `&start_date=${r.date}&end_date=${r.date}` +
      `&daily=${encodeURIComponent(r.metric)}&timezone=${encodeURIComponent(r.timezone)}`;

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Open-Meteo returned ${res.status} for ${url}`);

    const body = (await res.json()) as {
      daily?: Record<string, (number | null)[] | string[]>;
      daily_units?: Record<string, string>;
    };
    const series = body.daily?.[r.metric] as (number | null)[] | undefined;
    const value = series?.[0];
    if (value === undefined || value === null) {
      throw new Error(
        `Open-Meteo has no ${r.metric} for ${r.date}. The archive lags real time by ` +
          `a few days — this question may not be answerable yet.`,
      );
    }

    const threshold = Number(r.threshold);
    const yes = compare(value, r.comparator, threshold);
    const unit = body.daily_units?.[r.metric] ?? "";

    return {
      outcome: yes ? 1 : 0,
      reasoning:
        `Open-Meteo reports ${r.metric} of ${value}${unit} for ${r.date} at ` +
        `${r.latitude},${r.longitude}. The question asks whether it was ` +
        `${comparatorText(r.comparator)} ${r.threshold}${unit}. It was ${yes ? "" : "not "}— ` +
        `the outcome is ${yes ? "YES" : "NO"}.`,
      observed: {
        metric: r.metric,
        value,
        unit,
        date: r.date,
        latitude: r.latitude,
        longitude: r.longitude,
        threshold: r.threshold,
      },
      // The exact request, so a reader re-runs it rather than taking the word.
      sources: [url],
      caveat:
        "Read from a public API. Reproducible only while Open-Meteo serves the same " +
        "archive; nothing on-chain attests to this value.",
    };
  }
}
