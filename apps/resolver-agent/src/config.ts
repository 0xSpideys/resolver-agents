import { Networks } from "@stellar/stellar-sdk";

/**
 * Everything the agent needs to reach the network and the contracts.
 *
 * Contract ids default to the current testnet deployment so the agent runs with
 * nothing but a secret key in the environment; override any of them to point at
 * a different deployment.
 */
export interface AgentConfig {
  rpcUrl: string;
  networkPassphrase: string;
  /** Verdict market contract. */
  verdict: string;
  /** 8004 Identity Registry. */
  identityRegistry: string;
  /** SEP-41 token the markets settle in. Read from the market, not assumed. */
  secretKey: string;
  /** 8004 agent id, once registered. */
  agentId?: number;
  /** Which resolution source this agent uses. */
  source: string;
  /** Seconds between polls in watch mode. */
  pollInterval: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env and fill it in, or export it.`,
    );
  }
  return v;
}

export function loadConfig(): AgentConfig {
  const agentId = process.env.AGENT_ID;
  return {
    rpcUrl: process.env.RPC_URL ?? "https://soroban-testnet.stellar.org",
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
    verdict:
      process.env.VERDICT_CONTRACT ??
      "CD75VOBNOPZQJ2ZLV5CE2JTIQFE6BFBJK2KNLA26JPXEH223L3RSLHO5",
    identityRegistry:
      process.env.IDENTITY_REGISTRY ??
      "CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH",
    secretKey: required("AGENT_SECRET_KEY"),
    agentId: agentId ? Number(agentId) : undefined,
    source: process.env.RESOLUTION_SOURCE ?? "stellar-ledger",
    pollInterval: Number(process.env.POLL_INTERVAL ?? 15),
  };
}
