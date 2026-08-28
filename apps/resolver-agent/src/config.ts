import { TESTNET } from "@verdict/sdk";
import type { ChainConfig } from "@verdict/sdk";

/**
 * Load `.env` from the repository root if one is there.
 *
 * Node's own loader, so no dependency and nothing new to audit. Absent file is
 * the normal case rather than an error: in CI and on a server the values arrive
 * as real environment variables, and a real environment variable always wins —
 * `loadEnvFile` does not overwrite what is already set.
 *
 * `.env` is gitignored. Secrets never enter the repository; see docs/ISOLATION.md.
 */
function loadDotEnv(): void {
  for (const path of [".env", "../../.env"]) {
    try {
      process.loadEnvFile(path);
      return;
    } catch {
      // Not there, or unreadable. Fall through to the next candidate.
    }
  }
}

/** Which data source an agent resolves with. */
export type SourceId = "reflector" | "open-meteo" | "research" | "contrarian";

export interface AgentConfig extends ChainConfig {
  agentId?: number;
  source: SourceId;
  pollInterval: number;
  /** Only the research source needs this. Never committed; see docs/ISOLATION.md. */
  openRouterApiKey?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set. Export it, or see the README.`);
  return v;
}

export function loadConfig(): AgentConfig {
  loadDotEnv();
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
    openRouterApiKey: process.env.OPENROUTER_API_KEY,
  };
}
