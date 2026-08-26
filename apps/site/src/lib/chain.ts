import {
  decodeEvidence,
  decodeQuestion,
  readOnlyVerdict,
  toHex,
  verifyEvidence,
  verifyQuestion,
  type EvidenceDocument,
  type Market,
  type QuestionDocument,
  type Submission,
} from "@verdict/sdk";

/**
 * Every chain read the interface makes.
 *
 * All of it runs in the browser. The site is a static export with no server of
 * its own, and a dApp that rendered chain state at build time would be lying to
 * anyone who opened it later. Reads need no wallet and no key; connecting one is
 * only required to take a position.
 */

export interface Case {
  market: Market;
  /** Absent when the document does not verify against the on-chain hash. */
  question?: QuestionDocument;
  unverified?: string;
  pools: { no: bigint; yes: bigint };
}

export interface Exhibit {
  submission: Submission;
  evidence?: EvidenceDocument;
  /** False when the document does not hash to what the submission committed. */
  intact: boolean;
}

function toCase(market: Market, pools: bigint[]): Case {
  const check = verifyQuestion(market.question_uri, market.question_hash);
  return {
    market,
    question: check.ok ? check.doc : undefined,
    unverified: check.ok ? undefined : (check.reason ?? "unknown"),
    pools: { no: pools[0] ?? 0n, yes: pools[1] ?? 0n },
  };
}

export async function listCases(): Promise<Case[]> {
  const { verdict } = readOnlyVerdict();
  const markets = await verdict.listMarkets();
  return Promise.all(markets.map(async (m) => toCase(m, await verdict.getPools(m.id))));
}

export async function getCase(id: bigint): Promise<Case> {
  const { verdict } = readOnlyVerdict();
  const market = await verdict.getMarket(id);
  return toCase(market, await verdict.getPools(id));
}

export async function getExhibits(id: bigint): Promise<Exhibit[]> {
  const { verdict } = readOnlyVerdict();
  const submissions = await verdict.getSubmissions(id);
  return submissions.map((s) => {
    const intact = verifyEvidence(s.evidence_uri, s.evidence_hash);
    let evidence: EvidenceDocument | undefined;
    try {
      evidence = decodeEvidence(s.evidence_uri);
    } catch {
      evidence = undefined;
    }
    return { submission: s, evidence, intact };
  });
}

/** What a given account holds on a market, both sides. */
export async function getStake(
  id: bigint,
  user: string,
): Promise<{ yes: bigint; no: bigint }> {
  const { verdict } = readOnlyVerdict();
  const [no, yes] = await Promise.all([
    verdict.getPosition(id, user, 0),
    verdict.getPosition(id, user, 1),
  ]);
  return { yes, no };
}

export interface AgentRecord {
  agentId: number;
  correct: number;
  wrong: number;
  weight: number;
}

export async function getAgentRecord(agentId: number): Promise<AgentRecord> {
  const { verdict } = readOnlyVerdict();
  const [stats, weight] = await Promise.all([
    verdict.getStats(agentId),
    verdict.getWeight(agentId),
  ]);
  return { agentId, correct: stats.correct, wrong: stats.wrong, weight };
}

/**
 * Which agents have ever resolved here.
 *
 * There is no roster on-chain to read and no indexer behind this page, so the
 * markets are the index. Fine at this scale; the moment it is not, the answer is
 * an indexer rather than a bigger loop.
 */
export async function listAgents(cases: Case[]): Promise<AgentRecord[]> {
  const ids = new Set<number>();
  await Promise.all(
    cases.map(async (c) => {
      for (const x of await getExhibits(c.market.id).catch(() => [])) {
        ids.add(x.submission.agent_id);
      }
    }),
  );
  return Promise.all([...ids].sort((a, b) => a - b).map(getAgentRecord));
}

export { decodeQuestion, toHex };
