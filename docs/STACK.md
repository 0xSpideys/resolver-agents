# Tech stack and tooling

Every choice below is either something already deployed and working on Stellar, or
the default the ecosystem actually uses. Nothing here is novel for novelty's sake —
the novelty budget is spent entirely on the resolution layer.

## Verified on this machine

| Tool | Version | Note |
|---|---|---|
| Rust | 1.98.0 stable | `wasm32v1-none` target installed |
| `stellar` CLI | 27.1.0 | Installed to `~/.local/bin` as a **prebuilt binary** — `cargo install stellar-cli` fails to compile on Rust 1.98 (`ethnum` E0512). Do not try to build it from source. |
| Node | 22.21.1 | |
| pnpm | 10.30.0 | package manager for the JS side |
| `soroban-sdk` | 27.0.6 | latest stable, matches CLI 27 |

## Contracts

| | Choice | Why |
|---|---|---|
| Language | Rust + `soroban-sdk` 27.0.6 | |
| Layout | **One contract, internal modules** | Cross-contract calls cost budget and add failure modes. A 30-day MVP does not need a factory. Modules keep the seams for a later split. |
| Build | `wasm32v1-none`, `opt-level=z`, LTO, `panic=abort`, `codegen-units=1`, pinned toolchain, tracked `Cargo.lock` | Reproducible builds — a reviewer can rebuild and match the deployed wasm sha256. Copied from `stellar-8004`'s approach, which does exactly this. |
| Token | SEP-41 client against a **`token: Address` parameter** | Same wasm serves a test token, testnet USDC and mainnet USDC |
| Reference reading | [`solutions-plug/predictIQ`](https://github.com/solutions-plug/predictIQ) (already cloned at `~/dev/predictIQ`) for dispute-window and resolution-state-machine patterns; [`Orakel`](https://github.com/aditya-17-eth/Orakel) for bonded optimistic resolution | Read, don't copy |

## 8004 layer

We call the deployed [`trionlabs/stellar-8004`](https://github.com/trionlabs/stellar-8004)
registries — identity, reputation, validation — live on **testnet and mainnet**.

- Contract clients generated with `stellar contract bindings rust` from the
  **deployed contracts**, not by depending on their crate. They pin
  `soroban-sdk` 25.3.0; we are on 27.0.6. Bindings avoid the version clash.
- TypeScript SDK: **`@trionlabs/stellar8004`** (v0.0.11 — this is the live package;
  the README's `@trionlabs/8004-sdk` is a stale 0.0.1 stub, do not use it).
- Explorer: [stellar8004.com](https://stellar8004.com) — our agents will be
  publicly browsable there, which is free third-party proof for the evidence pack.

## Frontend

| | Choice |
|---|---|
| Framework | **Next.js 15** (App Router) + React 19 + TypeScript |
| Styling | Tailwind CSS |
| Wallets | `@creit.tech/stellar-wallets-kit` — Freighter, LOBSTR, xBull, Albedo, Rabet |
| Chain access | `@stellar/stellar-sdk` + Stellar RPC (not Horizon) |
| Contract bindings | `stellar contract bindings typescript` into `packages/sdk` |
| Hosting | Vercel |

Two surfaces, one Next.js app:

1. **`/` — the public scope-and-progress site.** Live from Day 1, shareable as
   proof: what Verdict is, the architecture, the phase plan with real status,
   deliverable tracking, testnet contract addresses and tx hashes as they land.
   This is the link that goes to the chapter lead.
2. **`/app` — the dApp.** Market list, market detail with pools and positions,
   resolver panel showing submissions with evidence links and weights, settlement
   and claim. Arrives in Phase 3.

## Resolver agent

`apps/resolver-agent` — a small Node/TypeScript service, deliberately **outside**
the contract:

1. registers itself on the 8004 Identity Registry via `@trionlabs/stellar8004`
2. reads a data source for a market it is watching
3. calls `submit_outcome` with evidence URI and hash

This is what makes the "agentic" claim real, and it is the template third parties
use in v2.

## AI tooling wired into this repo

| Tool | Status | Use |
|---|---|---|
| `/8004stellar` skill | **installed** → `.agents/skills/8004stellar` | 8004 registration, feedback, contract addresses |
| `/x402stellar` skill | **installed** → `.agents/skills/x402stellar` | x402 micropayments, relevant to v2 pillar 3 |
| stellar.new skills (42) | already in `~/.claude/skills` | `soroban`, `dapp`, `data`, `assets`, `deploy-stellar-mainnet`, `code-review` |
| Raven MCP | configured in `.mcp.json`, **needs auth** | SDF's live docs + ecosystem MCP at `raven.stellar.buzz/mcp`. Returns 401 unauthenticated — authorise it in an interactive `claude` session via `/mcp` before it works. |
| [`stellar/stellar-dev-skill`](https://github.com/stellar/stellar-dev-skill) | optional | SDF's official Soroban skill |
| [OpenZeppelin MCP](https://mcp.openzeppelin.com/) + [skills](https://github.com/OpenZeppelin/openzeppelin-skills) | optional | audited SEP-41 scaffolding if we need our own test token |

## Not used, and why

| | Why not |
|---|---|
| Reflector / SEP-40 oracles | Our markets resolve on curated events, not prices. Using an oracle would undercut the entire thesis. |
| WarpDrive | Verifiable off-chain execution, SCF-funded, targets prediction-market oracles — a **potential v2 integration partner**, not a v1 dependency. |
| Horizon | Legacy for our purposes. Stellar RPC only. |
| An AMM / orderbook | Out of scope; hook #10 keeps the door open. |
