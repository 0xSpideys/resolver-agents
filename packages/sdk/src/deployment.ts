/**
 * Current testnet deployment.
 *
 * Kept in the SDK so the agent, the curator tooling and the site cannot drift
 * apart on which contract they are talking to.
 */
export const TESTNET = {
  network: "testnet",
  rpcUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",

  verdict: "CD75VOBNOPZQJ2ZLV5CE2JTIQFE6BFBJK2KNLA26JPXEH223L3RSLHO5",
  /** Demo settlement token: a classic asset exposed through its SAC. */
  token: "CBEJPXHJ3G3YENGGTNEYC6WAQFM6Q5JKRUIKV4AJ25KBWOQ7J6CVLPHU",

  /** 8004, deployed by trionlabs. */
  identityRegistry: "CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH",
  reputationRegistry: "CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55",

  /** Reflector oracles. `external` aggregates CEX/DEX prices. */
  reflector: {
    external: "CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63",
    stellarDex: "CAVLP5DH2GJPZMVO7IJY4CVOD5MWEFTJFVPD2YY2FQXOQHRGHK4D6HLP",
    forex: "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W",
  },
} as const;
