import {
  Account,
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

import type { ChainConfig } from "./config";

/**
 * Anything that can sign a transaction envelope.
 *
 * A browser wallet never hands over a key, so signing has to be a call rather
 * than a local operation. The agent and the curator still pass a secret and get
 * the fast path; the dApp passes one of these.
 */
export interface ExternalSigner {
  address: string;
  /** Returns the signed envelope XDR. */
  signXdr(xdr: string, networkPassphrase: string): Promise<string>;
}

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
  private readonly keypair: Keypair | null;
  private readonly external: ExternalSigner | null;

  constructor(
    private cfg: ChainConfig,
    external?: ExternalSigner | null,
  ) {
    this.server = new rpc.Server(cfg.rpcUrl, {
      allowHttp: cfg.rpcUrl.startsWith("http://"),
    });
    // A reader needs neither. Simulation wants a source account but never
    // checks the sequence or the signature, so reads work with no identity at
    // all rather than forcing every read path to hold a secret.
    this.keypair = cfg.secretKey ? Keypair.fromSecret(cfg.secretKey) : null;
    this.external = external ?? null;
  }

  get readOnly(): boolean {
    return this.keypair === null && this.external === null;
  }

  get publicKey(): string {
    return this.keypair?.publicKey() ?? this.external?.address ?? READ_ONLY_SOURCE;
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

    let signed;
    if (this.keypair) {
      prepared.sign(this.keypair);
      signed = prepared;
    } else if (this.external) {
      const xdrOut = await this.external.signXdr(
        prepared.toXDR(),
        this.cfg.networkPassphrase,
      );
      signed = TransactionBuilder.fromXDR(xdrOut, this.cfg.networkPassphrase);
    } else {
      throw new Error("This Chain is read-only; it has nothing to sign with.");
    }

    const sent = await this.server.sendTransaction(signed);
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
    // Reads skip the account fetch entirely: simulation ignores the sequence,
    // and a read-only source account does not exist on-chain to fetch anyway.
    const account = this.readOnly
      ? new Account(READ_ONLY_SOURCE, "0")
      : await this.server.getAccount(this.publicKey);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.cfg.networkPassphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(60)
      .build();
  }
}

/**
 * Placeholder source account for simulation-only calls. Never signs, never
 * submits, and does not need to exist.
 */
const READ_ONLY_SOURCE = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

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
