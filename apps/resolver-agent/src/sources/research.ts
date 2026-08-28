import { z } from "zod";

import type { SourceClass } from "@verdict/sdk";

import type { Finding, ResolutionSource, SourceContext } from "./index";

/**
 * Resolves by having a model research the question with web search.
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
 *
 * Routed through OpenRouter rather than a single vendor's API. Two reasons: the
 * choice of model becomes configuration instead of a dependency, and a resolver
 * anyone can run should not require an account with one particular provider.
 * The wire format is OpenAI-shaped, so this is a plain fetch with no SDK.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Cheap enough to run on every market, current enough to search well. This is a
 * default, not a recommendation — `OPENROUTER_MODEL` overrides it, and the model
 * used is recorded in the evidence so a reader knows what answered.
 */
const DEFAULT_MODEL = "google/gemini-3.7-flash";

const Verdict = z.strictObject({
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

/**
 * One schema, two jobs: it constrains the model on the way out and validates the
 * reply on the way back. `strict` is best-effort across providers, so the parse
 * on return is what actually guarantees the shape.
 */
function jsonSchema(): Record<string, unknown> {
  const { $schema, ...schema } = z.toJSONSchema(Verdict) as Record<string, unknown>;
  void $schema;
  return schema;
}

const SYSTEM =
  "You resolve prediction-market questions. Search for primary sources and " +
  "prefer them over commentary. Report what you actually found, not what you " +
  "expect to be true. If the sources do not settle the question, answer " +
  "UNRESOLVABLE rather than guessing — a wrong answer costs a bond, an honest " +
  "abstention costs nothing. Always fill in the caveat.";

interface Annotation {
  type?: string;
  url_citation?: { url?: string };
}

export class ResearchSource implements ResolutionSource {
  readonly id = "research";
  readonly sourceClass: SourceClass = "research";
  readonly description =
    "Researches the question with a model and web search, and states its own uncertainty.";

  async resolve(ctx: SourceContext): Promise<Finding> {
    const r = ctx.question.resolution;
    if (r.kind !== "research") {
      throw new Error(`This question is resolved by "${r.kind}", not by research.`);
    }
    if (!ctx.openRouterApiKey) {
      throw new Error(
        "OPENROUTER_API_KEY is not set. The research source needs it; the other sources do not.",
      );
    }

    const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ctx.openRouterApiKey}`,
        "Content-Type": "application/json",
        // Names the caller in the key owner's own dashboard. No URL, no identity.
        "X-Title": "Verdict",
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        // OpenRouter's own search plugin, so the capability does not depend on
        // the chosen model shipping a server-side search tool of its own.
        plugins: [{ id: "web", max_results: 6 }],
        response_format: {
          type: "json_schema",
          json_schema: { name: "verdict", strict: true, schema: jsonSchema() },
        },
        messages: [
          { role: "system", content: SYSTEM },
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
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `OpenRouter returned ${res.status} ${res.statusText}. ${body.slice(0, 400)}`,
      );
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string; annotations?: Annotation[] } }[];
      error?: { message?: string };
    };
    if (payload.error) {
      throw new Error(`OpenRouter reported an error: ${payload.error.message}`);
    }

    const message = payload.choices?.[0]?.message;
    if (!message?.content) {
      throw new Error("Model returned no content.");
    }

    let parsed: z.infer<typeof Verdict>;
    try {
      parsed = Verdict.parse(JSON.parse(message.content));
    } catch (err) {
      throw new Error(`Model returned no parseable verdict: ${(err as Error).message}`);
    }

    if (parsed.outcome === "UNRESOLVABLE") {
      // Abstaining is a real answer. Submitting a coin flip would put a bond
      // behind something the agent does not believe, which is the behaviour the
      // penalty is meant to discourage — not encourage.
      throw new Error(`Declining to resolve: ${parsed.reasoning}`);
    }

    // What the model says it read, plus what the search plugin actually cited.
    // The two can differ, and a reader checking the evidence should see both.
    const cited = (message.annotations ?? [])
      .filter((a) => a.type === "url_citation")
      .map((a) => a.url_citation?.url)
      .filter((u): u is string => Boolean(u));

    return {
      outcome: parsed.outcome === "YES" ? 1 : 0,
      reasoning: parsed.reasoning,
      observed: {
        keyFacts: parsed.keyFacts,
        confidence: parsed.confidence,
        model,
      },
      sources: [...new Set([...parsed.sources, ...cited])],
      caveat:
        `${parsed.caveat} Reached by model research (${model}); not reproducible — ` +
        `a second run may reach a different conclusion.`,
    };
  }
}
