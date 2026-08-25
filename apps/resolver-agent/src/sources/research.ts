import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { SourceClass } from "@verdict/sdk";

import type { Finding, ResolutionSource, SourceContext } from "./index";

/**
 * Resolves by having Claude research the question with web search.
 *
 * This is the source the protocol is actually for. The other two answer
 * questions a machine could already settle on its own — an oracle read or a
 * fixed archive lookup. This one answers questions where somebody has to go
 * look, read, and decide, and where two careful agents can reach different
 * conclusions in good faith.
 *
 * That non-determinism is not a defect to engineer away. If every resolver
 * always agreed, the weighting, the bond, the challenge window and the
 * reputation record would all be dead weight. They exist precisely because this
 * kind of answer is contestable.
 *
 * Nothing here is verifiable after the fact. The model is told to say so, and
 * the caveat travels into the evidence document and onto the chain.
 */

const Verdict = z.object({
  outcome: z
    .enum(["YES", "NO", "UNRESOLVABLE"])
    .describe("UNRESOLVABLE if the sources genuinely do not settle it."),
  reasoning: z
    .string()
    .describe("What was found and how it maps to the outcome. Two or three sentences."),
  keyFacts: z.array(z.string()).describe("The specific facts the conclusion rests on."),
  sources: z.array(z.string()).describe("URLs actually consulted."),
  confidence: z.enum(["high", "medium", "low"]),
  caveat: z.string().describe("What could make this wrong. Never empty."),
});

/** Newer models take the filtering web-search tool; older ones only the basic one. */
const DYNAMIC_SEARCH_MODELS = /^claude-(opus-(5|4-8|4-7|4-6)|sonnet-(5|4-6)|fable-5)/;

export class ResearchSource implements ResolutionSource {
  readonly id = "research";
  readonly sourceClass: SourceClass = "research";
  readonly description =
    "Researches the question with Claude and web search, and states its own uncertainty.";

  async resolve(ctx: SourceContext): Promise<Finding> {
    const r = ctx.question.resolution;
    if (r.kind !== "research") {
      throw new Error(`This question is resolved by "${r.kind}", not by research.`);
    }
    if (!ctx.anthropicApiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. The research source needs it; the other sources do not.",
      );
    }

    const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
    const client = new Anthropic({ apiKey: ctx.anthropicApiKey });

    const response = await client.messages.parse({
      model,
      max_tokens: 16000,
      tools: [
        {
          type: DYNAMIC_SEARCH_MODELS.test(model)
            ? "web_search_20260209"
            : "web_search_20250305",
          name: "web_search",
          max_uses: 6,
        },
      ],
      output_config: { format: zodOutputFormat(Verdict) },
      system:
        "You resolve prediction-market questions. Search for primary sources and " +
        "prefer them over commentary. Report what you actually found, not what you " +
        "expect to be true. If the sources do not settle the question, answer " +
        "UNRESOLVABLE rather than guessing — a wrong answer costs a bond, an honest " +
        "abstention costs nothing. Always fill in the caveat.",
      messages: [
        {
          role: "user",
          content:
            `Question: ${ctx.question.title}\n\n` +
            `Resolution criteria: ${ctx.question.criteria}\n\n` +
            `Claim to determine: ${r.claim}\n\n` +
            `Where to look: ${r.guidance}\n\n` +
            `Answer YES if the claim is true, NO if it is false.`,
        },
      ],
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error(
        `Model returned no parseable verdict (stop_reason: ${response.stop_reason}).`,
      );
    }
    if (parsed.outcome === "UNRESOLVABLE") {
      // Abstaining is a real answer. Submitting a coin flip would put a bond
      // behind something the agent does not believe, which is the behaviour the
      // penalty is meant to discourage — not encourage.
      throw new Error(`Declining to resolve: ${parsed.reasoning}`);
    }

    return {
      outcome: parsed.outcome === "YES" ? 1 : 0,
      reasoning: parsed.reasoning,
      observed: {
        keyFacts: parsed.keyFacts,
        confidence: parsed.confidence,
        model,
      },
      sources: parsed.sources,
      caveat:
        `${parsed.caveat} Reached by model research (${model}); not reproducible — ` +
        `a second run may reach a different conclusion.`,
    };
  }
}
