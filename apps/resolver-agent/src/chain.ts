import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";

import type { AgentConfig } from "./config.js";

/**
 * Thin wrapper over Soroban RPC: simulate for reads, simulate + sign + send +
 * poll for writes.
 *
 * Deliberately hand-rolled rather than generated bindings — the agent calls six
 * methods, and a small explicit layer is easier to audit than a generated
 * surface where the interesting part (how a value becomes an ScVal) is hidden.
 */
export class Chain {
  readonly server: rpc.Server;
  readonly keypair: Keypair;

  constructor(private cfg: AgentConfig) {
    this.server = new rpc.Server(cfg.rpcUrl, {
      allowHttp: cfg.rpcUrl.startsWith("http://"),
    });
    this.keypair = Keypair.fromSecret(cfg.secretKey);
  }

  get publicKey(): string {
    return this.keypair.publicKey();
  }

  /** Simulate a call and decode the result. No transaction is submitted. */
  async read<T = unknown>(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
  ): Promise<T> {
    const tx = await this.buildTx(contractId, method, args);
    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`${method} simulation failed: ${sim.error}`);
    }
    if (!sim.result?.retval) {
      throw new Error(`${method} returned nothing`);
    }
    return scValToNative(sim.result.retval) as T;
  }

  /** Simulate, sign, submit and wait for the result. */
  async send<T = unknown>(
    contractId: string,
    method: string,
    args: xdr.ScVal[] = [],
  ): Promise<{ value: T; hash: string }> {
    const tx = await this.buildTx(contractId, method, args);
    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(this.keypair);

    const sent = await this.server.sendTransaction(prepared);
    if (sent.status === "ERROR") {
      throw new Error(
        `${method} rejected: ${JSON.stringify(sent.errorResult?.result())}`,
      );
    }

    // pollTransaction backs off on its own; the default budget is generous
    // enough for testnet and short enough to fail visibly rather than hang.
    const done = await this.server.pollTransaction(sent.hash, {
      attempts: 30,
      sleepStrategy: rpc.BasicSleepStrategy,
    });

    if (done.status !== "SUCCESS") {
      throw new Error(`${method} failed on-chain (${done.status}), tx ${sent.hash}`);
    }
    return {
      value: (done.returnValue ? scValToNative(done.returnValue) : undefined) as T,
      hash: sent.hash,
    };
  }

  private async buildTx(contractId: string, method: string, args: xdr.ScVal[]) {
    const account = await this.server.getAccount(this.publicKey);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.cfg.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();
  }
}

/* ------------------------------------------------------------ ScVal helpers */

export const sv = {
  address: (v: string) => new Address(v).toScVal(),
  u32: (v: number) => nativeToScVal(v, { type: "u32" }),
  u64: (v: number | bigint) => nativeToScVal(BigInt(v), { type: "u64" }),
  i128: (v: bigint) => nativeToScVal(v, { type: "i128" }),
  string: (v: string) => nativeToScVal(v, { type: "string" }),
  /** BytesN<32> — the contract rejects anything other than 32 bytes. */
  bytes32: (v: Buffer | Uint8Array) => {
    if (v.length !== 32) {
      throw new Error(`expected 32 bytes, got ${v.length}`);
    }
    return xdr.ScVal.scvBytes(Buffer.from(v));
  },
};
