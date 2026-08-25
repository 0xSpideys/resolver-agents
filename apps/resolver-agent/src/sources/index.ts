import type { Chain, QuestionDocument, SourceClass } from "@verdict/sdk";

/**
 * What a source concluded, and everything a reader needs to check it.
 *
 * `caveat` is deliberately part of the contract. A source that cannot be sure
 * has to say so, and that admission travels into the evidence document and
 * onto the chain. A resolver that hides its uncertainty is the failure mode
 * this whole protocol exists to price.
 */
export interface Finding {
  outcome: number;
  reasoning: string;
  observed: Record<string, unknown>;
  sources: string[];
  caveat?: string;
}

export interface SourceContext {
  chain: Chain;
  question: QuestionDocument;
  anthropicApiKey?: string;
}

export interface ResolutionSource {
  readonly id: string;
  readonly description: string;
  /** How far any answer from this source can be trusted, before reading it. */
  readonly sourceClass: SourceClass;
  resolve(ctx: SourceContext): Promise<Finding>;
}

import { ReflectorSource } from "./reflector";
import { OpenMeteoSource } from "./open-meteo";
import { ResearchSource } from "./research";
import { ContrarianSource } from "./contrarian";

export { ReflectorSource, OpenMeteoSource, ResearchSource, ContrarianSource };

export function sourceById(id: string): ResolutionSource {
  switch (id) {
    case "reflector":
      return new ReflectorSource();
    case "open-meteo":
      return new OpenMeteoSource();
    case "research":
      return new ResearchSource();
    case "contrarian":
      return new ContrarianSource();
    default:
      throw new Error(`Unknown resolution source "${id}"`);
  }
}
