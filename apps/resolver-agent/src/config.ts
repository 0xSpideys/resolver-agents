import { TESTNET } from "@verdict/sdk";
import type { ChainConfig } from "@verdict/sdk";

/** Which data source an agent resolves with. */
export type SourceId = "reflector" | "open-meteo" | "research" | "contrarian";

export interface AgentConfig extends ChainConfig {
  agentId?: number;
  source: SourceId;
  pollInterval: number;
  /** Only the research source needs this. Never read from a file in the repo. */
  anthropicApiKey?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Export it, or see the README.`);
  return v;
}

export function loadConfig(): AgentConfig {
  const agentId = process.env.AGENT_ID;
  return {
    rpcUrl: process.env.RPC_URL ?? TESTNET.rpcUrl,
    networkPassphrase: process.env.NETWORK_PASSPHRASE ?? TESTNET.networkPassphrase,
    verdict: process.env.VERDICT_CONTRACT ?? TESTNET.verdict,
    identityRegistry: process.env.IDENTITY_REGISTRY ?? TESTNET.identityRegistry,
    secretKey: required("AGENT_SECRET_KEY"),
    agentId: agentId ? Number(agentId) : undefined,
    source: (process.env.RESOLUTION_SOURCE ?? "reflector") as SourceId,
    pollInterval: Number(process.env.POLL_INTERVAL ?? 15),
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };
}
