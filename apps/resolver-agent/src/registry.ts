import { Chain, sv } from "./chain.js";
import type { AgentConfig } from "./config.js";

/**
 * 8004 registration metadata, per the EIP-8004 registration-v1 shape the
 * explorer at stellar8004.com indexes.
 */
export interface AgentMetadata {
  type: string;
  name: string;
  description: string;
  services: { name: string; endpoint: string; description?: string }[];
  supportedTrust: string[];
}

export function buildMetadata(name: string, description: string): AgentMetadata {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name,
    description,
    services: [],
    supportedTrust: ["reputation"],
  };
}

/** Registration metadata inline as a data URI — no hosting to keep alive. */
export function metadataUri(meta: AgentMetadata): string {
  const json = JSON.stringify(meta);
  const uri = `data:application/json;base64,${Buffer.from(json, "utf8").toString("base64")}`;
  if (uri.length > 8_000) {
    throw new Error(
      "Registration metadata exceeds the 8KB data-URI limit; host it over HTTPS or IPFS instead.",
    );
  }
  return uri;
}

/** Read/write access to the 8004 Identity Registry. */
export class Identity {
  constructor(
    private chain: Chain,
    private cfg: AgentConfig,
  ) {}

  exists(agentId: number): Promise<boolean> {
    return this.chain.read<boolean>(this.cfg.identityRegistry, "agent_exists", [
      sv.u32(agentId),
    ]);
  }

  owner(agentId: number): Promise<string | null> {
    return this.chain.read<string | null>(this.cfg.identityRegistry, "find_owner", [
      sv.u32(agentId),
    ]);
  }

  /** Mints an agent identity owned by this keypair and returns its id. */
  async register(meta: AgentMetadata): Promise<{ agentId: number; hash: string }> {
    const { value, hash } = await this.chain.send<number>(
      this.cfg.identityRegistry,
      "register_with_uri",
      [sv.address(this.chain.publicKey), sv.string(metadataUri(meta))],
    );
    return { agentId: value, hash };
  }
}
