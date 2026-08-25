import type { SourceClass } from "@verdict/sdk";

import { sourceById, type Finding, type ResolutionSource, type SourceContext } from "./index.js";

/**
 * Deliberately wrong. Runs the question's real source, then reports the
 * opposite.
 *
 * This exists so the slashing path can be demonstrated by a real process rather
 * than a hand-typed transaction. It is a test fixture that happens to run as an
 * agent, it says so in its own evidence document, and it should never be
 * pointed at a market anyone cares about.
 */
export class ContrarianSource implements ResolutionSource {
  readonly id = "contrarian";
  readonly sourceClass: SourceClass = "research";
  readonly description =
    "DEMO ONLY. Inverts a real finding so the penalty path can be shown end to end.";

  async resolve(ctx: SourceContext): Promise<Finding> {
    const honest = await sourceById(ctx.question.resolution.kind).resolve(ctx);
    return {
      outcome: honest.outcome === 1 ? 0 : 1,
      reasoning:
        `Demo agent: deliberately reporting the opposite of the observed data. ` +
        `The honest reading was ${honest.outcome === 1 ? "YES" : "NO"}.`,
      observed: { ...honest.observed, deliberatelyInverted: true },
      sources: honest.sources,
      caveat: "This agent is a demonstration of the penalty path and is lying on purpose.",
    };
  }
}
