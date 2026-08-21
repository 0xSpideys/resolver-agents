# Verdict — agent working notes

Read `docs/SPEC.md` before changing contract code. It is the source of truth; if
the code and the spec disagree, fix one of them deliberately, don't drift.

## Toolchain gotchas

- `stellar` CLI is a **prebuilt binary at `~/.local/bin/stellar`** (v27.1.0).
  `cargo install stellar-cli` fails on Rust 1.98 (`ethnum` E0512). Don't retry it.
- Rust needs `source "$HOME/.cargo/env"` in non-login shells.
- Build target is `wasm32v1-none`, not `wasm32-unknown-unknown`.

## 8004

- We call the **deployed** trionlabs registries. Generate clients with
  `stellar contract bindings rust` — do not add their crate as a dependency
  (they pin soroban-sdk 25.3.0, we are on 27.0.6).
- `agent_id` is **`u32`**.
- TS package is **`@trionlabs/stellar8004`** (v0.0.11). `@trionlabs/8004-sdk` is a
  stale 0.0.1 stub — the upstream README points at the wrong one.
- `get_summary` is **O(n) in an agent's feedback history**. Never call it on a
  write path. Verdict keeps local `AgentStats` for the hot path and writes to 8004
  for the portable public record. See SPEC §4.3.
- Skills `/8004stellar` and `/x402stellar` are installed in `.agents/skills`.

## Invariants that must never regress

1. A winner never receives less than their own stake.
2. Total payouts never exceed escrow. Rounding always floors toward the protocol.
3. Economic terms are snapshotted per market at creation; `Config` changes are
   never retroactive.
4. Resolver weight is snapshotted into the `Submission` at submission time.
5. A void market takes no fee and returns every bond.
6. Every state transition emits an event.

## Conventions

- Errors are numbered by range and never renumbered.
- Everything tunable lives in `Config` storage, never in a `const`.
- Pure arithmetic goes in `math.rs` with unit tests and no `Env`.
