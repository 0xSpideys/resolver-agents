/**
 * Single source of truth for the public scope & progress page.
 *
 * Updating project status is a one-file edit. Keep it honest — this page is the
 * link that goes to the chapter lead, and "in progress" that never moves is
 * worse than "not started".
 */

export type Status = "done" | "active" | "todo";

export const project = {
  name: "Verdict",
  tagline: "Agentic Resolution for Markets",
  summary:
    "Curated information markets on Stellar whose outcomes are decided by 8004-registered resolver agents — with evidence, bonds, reputation-weighted voting, and portable on-chain track records.",
  chapter: "Stellar Türkiye",
  chapterLead: "İrem Koçi",
  builder: "Bertan Köfön",
  grant: "Instawards · 30-day scoped engagement · $5,000",
  network: "Stellar Testnet (Soroban)",
  repo: null as string | null, // set once the private repo is live
} as const;

export const thesis = {
  problem:
    "Information markets settle in one of three ways today: a centralised admin decides, a fixed oracle feed decides, or the crowd votes. The first is trusted, the second only works for prices, and the third is Sybil-shaped.",
  gap: "There is no layer where registered agents resolve curated markets with evidence, earn fees for being right, lose a bond for being wrong, and carry the resulting reputation with them.",
  insight:
    "The market is the first application, not the product. There are 28+ prediction markets already building on Soroban and zero agent-resolution layers. Verdict builds the layer.",
  differentiator:
    "Influence comes from reputation, never from capital. Every resolver posts the same flat bond; weight is earned only by being right.",
};

export const landscape = [
  {
    name: "Predictify",
    what: "Most complete Stellar prediction market — contracts, frontend, backend",
    resolution: "Reflector price oracle",
    gap: "No resolver identity, reward or penalty",
  },
  {
    name: "PredictIQ",
    what: "Dispute windows, oracle staleness checks, circuit breakers",
    resolution: "Oracle + admin",
    gap: "Resolvers are not accountable entities",
  },
  {
    name: "Orakel",
    what: "Binary markets with bonded optimistic resolution",
    resolution: "Bond + 2-of-3 multisig arbiter",
    gap: "Bonds are anonymous and single-use; no persistent record",
  },
  {
    name: "WarpDrive",
    what: "Verifiable off-chain execution (SCF-funded, $150k)",
    resolution: "Custom oracles via WAVS",
    gap: "Infrastructure, not a resolution market — a potential v2 partner",
  },
];

export const flow = [
  {
    step: "01",
    title: "Curated market opens",
    body: "The curator publishes a binary question with its resolution criteria and expected sources, hashed on-chain so the terms cannot be edited after people stake against them.",
  },
  {
    step: "02",
    title: "Users take positions",
    body: "YES/NO stakes in USDC go into escrow. Parimutuel: no pricing curve, no counterparty matching. The winning pool splits the losing pool.",
  },
  {
    step: "03",
    title: "Agents resolve with evidence",
    body: "After trading closes, agents registered on the 8004 Identity Registry submit an outcome with an evidence document, its hash, and a flat bond. Evidence is mandatory.",
  },
  {
    step: "04",
    title: "Reputation-weighted tally",
    body: "Each submission is weighted 1.00×–3.00× by that agent's track record inside Verdict. The weighted majority becomes the provisional outcome and a challenge window opens.",
  },
  {
    step: "05",
    title: "Challenge or finalise",
    body: "Anyone can challenge by posting a larger bond. Unchallenged, the market finalises permissionlessly. Challenged, it goes to the dispute resolver.",
  },
  {
    step: "06",
    title: "Pay, slash, and publish",
    body: "Winners claim. Correct resolvers get their bond back plus a weight-proportional share of the fee; wrong ones are slashed to the treasury. Every result is written to the 8004 Reputation Registry — public and portable.",
  },
];

export const states = [
  { name: "Open", desc: "Trading" },
  { name: "Resolving", desc: "Agents submit" },
  { name: "Tallied", desc: "Challenge window" },
  { name: "Disputed", desc: "Backstop rules" },
  { name: "Settled", desc: "Claims open" },
  { name: "Void", desc: "Full refund" },
];

export const economics = [
  { k: "Pricing", v: "Parimutuel — winning pool splits the losing pool" },
  { k: "Protocol fee", v: "2% of the losing pool only" },
  { k: "Fee split", v: "60% to correct resolvers · 40% to treasury" },
  { k: "Resolver bond", v: "Flat, identical for every agent" },
  { k: "Wrong resolver", v: "Bond slashed 100% to the treasury" },
  { k: "Challenge bond", v: "2× the resolver bond" },
  { k: "Weight band", v: "1.00× (new or always wrong) → 3.00× (perfect record)" },
];

export const phases: {
  id: string;
  title: string;
  days: string;
  status: Status;
  deliverable: string | null;
  items: { label: string; status: Status }[];
}[] = [
  {
    id: "p0",
    title: "Foundations",
    days: "Day 1–4",
    status: "active",
    deliverable: null,
    items: [
      { label: "Monorepo, workspace, CI", status: "done" },
      { label: "Technical specification", status: "done" },
      { label: "Payout & weighting math + unit tests", status: "done" },
      { label: "Public scope & progress site", status: "done" },
      { label: "8004 Rust bindings from deployed contracts", status: "active" },
      { label: "Live 8004 spike on testnet", status: "todo" },
    ],
  },
  {
    id: "p1",
    title: "Market core",
    days: "Day 5–12",
    status: "todo",
    deliverable: "Deliverable 1",
    items: [
      { label: "Market creation, storage schema, state machine", status: "todo" },
      { label: "Betting, escrow, position accounting", status: "todo" },
      { label: "Settlement, claims, refunds, void paths", status: "todo" },
      { label: "Edge-case and TTL test suite", status: "todo" },
      { label: "Testnet deploy + first end-to-end market", status: "todo" },
    ],
  },
  {
    id: "p2",
    title: "Resolver layer",
    days: "Day 13–21",
    status: "todo",
    deliverable: "Deliverable 2",
    items: [
      { label: "8004 registration & ownership checks", status: "todo" },
      { label: "Evidence-backed outcome submission with bonds", status: "todo" },
      { label: "Reputation-weighted tally", status: "todo" },
      { label: "Challenge window & dispute backstop", status: "todo" },
      { label: "Resolver rewards and slashing", status: "todo" },
      { label: "Feedback writeback to the 8004 Reputation Registry", status: "todo" },
    ],
  },
  {
    id: "p3",
    title: "Demo & evidence",
    days: "Day 22–28",
    status: "todo",
    deliverable: "Deliverable 3",
    items: [
      { label: "dApp — markets, positions, resolver panel, claims", status: "todo" },
      { label: "Example 8004 resolver agent", status: "todo" },
      { label: "End-to-end demo with three competing agents", status: "todo" },
      { label: "Evidence pack — tx hashes, screenshots, demo video", status: "todo" },
    ],
  },
  {
    id: "p4",
    title: "Close-out",
    days: "Day 29–30",
    status: "todo",
    deliverable: null,
    items: [
      { label: "Documentation pass", status: "todo" },
      { label: "V2 roadmap", status: "done" },
      { label: "Handover to the chapter", status: "todo" },
    ],
  },
];

export const deliverables = [
  {
    id: "D1",
    title: "Core Soroban market contract",
    budget: "$2,000",
    body: "Curated YES/NO markets, user positions, USDC escrow, basic fees, market closing, settlement states and claim logic.",
    evidence: "Repo, contract code, test logs, testnet tx hashes",
  },
  {
    id: "D2",
    title: "8004 resolver agent layer",
    budget: "$2,000",
    body: "Registration checks against the 8004 Identity Registry, evidence-backed outcome submission, weighted resolution, resolver bonds, fee rewards and penalties.",
    evidence: "Repo, screenshots, tx hashes, agents visible on stellar8004.com",
  },
  {
    id: "D3",
    title: "Demo UI, testing & evidence package",
    budget: "$1,000",
    body: "Frontend and end-to-end demo covering trading, resolver submissions, weighted resolution, fee distribution and final settlement.",
    evidence: "Live demo link, demo video, README, screenshots",
  },
];

export const registries = {
  source: "trionlabs/stellar-8004",
  sourceUrl: "https://github.com/trionlabs/stellar-8004",
  explorer: "https://stellar8004.com",
  testnet: [
    { name: "Identity", id: "CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH" },
    { name: "Reputation", id: "CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55" },
    { name: "Validation", id: "CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL" },
  ],
};

/** Verdict's own deployed contract. Filled in during Phase 1. */
export const verdictContract: { network: string; id: string } | null = null;

export const stack = [
  { group: "Contracts", items: ["Rust", "soroban-sdk 27.0.6", "wasm32v1-none", "reproducible builds"] },
  { group: "Trust layer", items: ["8004 Identity Registry", "8004 Reputation Registry", "@trionlabs/stellar8004"] },
  { group: "Frontend", items: ["Next.js 16", "React 19", "TypeScript", "Tailwind CSS", "Stellar Wallets Kit"] },
  { group: "Chain access", items: ["Stellar RPC", "@stellar/stellar-sdk", "generated contract bindings"] },
  { group: "Agent", items: ["Node + TypeScript", "8004 self-registration", "evidence submission"] },
];

export const limitations = [
  {
    title: "Dispute resolution is centralised",
    body: "If a tally is challenged, the curator decides. This is a trusted backstop and we say so. v2 replaces that single address with a staked arbitration contract — the hook is already in the config.",
  },
  {
    title: "Market creation is curated",
    body: "Anyone can trade and any registered agent can resolve, but only the curator opens markets. Permissionless creation needs spam control that does not fit in 30 days.",
  },
  {
    title: "Binary outcomes only",
    body: "The types are already multi-outcome; a single runtime guard gates it. Removing that guard is the v2 unlock.",
  },
  {
    title: "Testnet only",
    body: "Mainnet needs an external audit. The build is already reproducible so an auditor can verify the deployed wasm byte-for-byte.",
  },
];

export const v2 = [
  {
    pillar: "Decentralised arbitration",
    body: "Replace the trusted backstop with a staked juror pool and an escalation game. The largest honesty gap in v1, and the clearest next milestone.",
  },
  {
    pillar: "Permissionless markets & resolver economy",
    body: "Creator bonds and spam control, resolver staking and delegation, a public leaderboard, and an SDK so third parties run their own agents against Verdict.",
  },
  {
    pillar: "Mainnet, real USDC, audit, full agentic loop",
    body: "Mainnet against Circle USDC, an external audit, and x402/MPP wired both ways so agents pay for market data and get paid for resolution over HTTP.",
  },
];
