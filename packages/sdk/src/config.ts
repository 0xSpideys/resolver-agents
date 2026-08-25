/** What the SDK needs to reach a network and the contracts on it. */
export interface ChainConfig {
  rpcUrl: string;
  networkPassphrase: string;
  /** Verdict market contract. */
  verdict: string;
  /** 8004 Identity Registry. */
  identityRegistry: string;
  /** Signing key. Omit or leave empty for a read-only client. */
  secretKey?: string;
}
