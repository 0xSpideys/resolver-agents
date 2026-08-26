"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Chain, TESTNET, Verdict, type ExternalSigner } from "@verdict/sdk";

/**
 * Wallet connection, and the only place in the app that can write to the chain.
 *
 * Reading needs nothing. Writing needs a signature, and every write here is
 * a permissionless contract call — betting, closing an expired market,
 * tallying, finalising, claiming — so any connected account can drive a market
 * forward, not just ours. That is the point of exposing them as buttons rather
 * than keeping them in an operator script.
 */

interface WalletState {
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** A write-capable client, or null when nothing is connected. */
  verdict: Verdict | null;
}

const Ctx = createContext<WalletState>({
  address: null,
  connecting: false,
  connect: async () => {},
  disconnect: async () => {},
  verdict: null,
});

const STORED = "verdict-wallet";

/** The kit pulls in browser globals, so it is only ever imported on demand. */
async function kit() {
  const { StellarWalletsKit, Networks } = await import(
    "@creit.tech/stellar-wallets-kit"
  );
  const [{ FreighterModule }, { LobstrModule }, { xBullModule }, { AlbedoModule }, { HanaModule }, { RabetModule }] =
    await Promise.all([
      import("@creit.tech/stellar-wallets-kit/modules/freighter"),
      import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
      import("@creit.tech/stellar-wallets-kit/modules/xbull"),
      import("@creit.tech/stellar-wallets-kit/modules/albedo"),
      import("@creit.tech/stellar-wallets-kit/modules/hana"),
      import("@creit.tech/stellar-wallets-kit/modules/rabet"),
    ]);

  StellarWalletsKit.init({
    network: Networks.TESTNET,
    modules: [
      new FreighterModule(),
      new LobstrModule(),
      new xBullModule(),
      new AlbedoModule(),
      new HanaModule(),
      new RabetModule(),
    ],
  });
  return StellarWalletsKit;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Re-attach silently on load if a wallet was connected before. A failure here
  // is normal — the extension may be locked or gone — and must not surface.
  useEffect(() => {
    let live = true;
    (async () => {
      let id: string | null = null;
      try {
        id = localStorage.getItem(STORED);
      } catch {
        return;
      }
      if (!id) return;
      try {
        const k = await kit();
        k.setWallet(id);
        const { address: a } = await k.getAddress();
        if (live && a) setAddress(a);
      } catch {
        /* not available right now */
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const k = await kit();
      const { address: a } = await k.authModal();
      setAddress(a);
      try {
        localStorage.setItem(STORED, k.selectedModule.productId);
      } catch {
        /* storage blocked; the session still works */
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const k = await kit();
      await k.disconnect();
    } catch {
      /* already gone */
    }
    try {
      localStorage.removeItem(STORED);
    } catch {
      /* nothing to clear */
    }
    setAddress(null);
  }, []);

  const verdict = useMemo(() => {
    if (!address) return null;
    const signer: ExternalSigner = {
      address,
      async signXdr(xdr, networkPassphrase) {
        const k = await kit();
        const { signedTxXdr } = await k.signTransaction(xdr, {
          networkPassphrase,
          address,
        });
        return signedTxXdr;
      },
    };
    const cfg = {
      rpcUrl: TESTNET.rpcUrl,
      networkPassphrase: TESTNET.networkPassphrase,
      verdict: TESTNET.verdict,
      identityRegistry: TESTNET.identityRegistry,
    };
    return new Verdict(new Chain(cfg, signer), cfg);
  }, [address]);

  return (
    <Ctx.Provider value={{ address, connecting, connect, disconnect, verdict }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWallet() {
  return useContext(Ctx);
}

export function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function ConnectButton() {
  const { address, connecting, connect, disconnect } = useWallet();

  if (address) {
    return (
      <button
        type="button"
        onClick={disconnect}
        title={address}
        className="btn h-8 px-2.5 font-data text-[0.75rem]"
      >
        <span className="size-1.5 rounded-full bg-yes" aria-hidden />
        {short(address)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={connect}
      disabled={connecting}
      className="btn h-8 px-3 text-[0.8rem] disabled:opacity-60"
    >
      {connecting ? "Connecting…" : "Connect wallet"}
    </button>
  );
}
