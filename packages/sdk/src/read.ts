import { Chain } from "./chain";
import { TESTNET } from "./deployment";
import { Verdict } from "./verdict";

/** A keyless client for browsing. Everything it can do is a simulation. */
export function readOnlyVerdict(overrides: Partial<{ rpcUrl: string; verdict: string }> = {}) {
  const cfg = {
    rpcUrl: overrides.rpcUrl ?? TESTNET.rpcUrl,
    networkPassphrase: TESTNET.networkPassphrase,
    verdict: overrides.verdict ?? TESTNET.verdict,
    identityRegistry: TESTNET.identityRegistry,
  };
  const chain = new Chain(cfg);
  return { chain, verdict: new Verdict(chain, cfg) };
}
