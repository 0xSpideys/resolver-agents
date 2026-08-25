/** What the SDK needs to reach a network and the contracts on it. */
export interface ChainConfig {
  rpcUrl: string;
  networkPassphrase: string;
  /** Verdict market contract. */
  verdict: string;
  /** 8004 Identity Registry. */
  identityRegistry: string;
  /** Signing key. Read-only callers can pass any valid public-key-only signer. */
  secretKey: string;
}
