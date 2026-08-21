# V2 Roadmap — extension points built into v1

Every item below is a deliberate hook in the v1 code. The cost column is honest:
building the hook now is cheap, retrofitting it later is not. This document is
also the skeleton of the follow-on grant application.

## The twelve hooks

| # | v1 does | v2 unlocks | Where |
|---|---|---|---|
| 1 | `outcome: u32`, runtime-gated to 2 | Multi-outcome markets | remove the `UnsupportedOutcomeCount` guard in `create_market` |
| 2 | Weight isolated in `weight_from_stats` | Recency decay, sample shrinkage, delegated stake | `math.rs`, one pure fn |
| 3 | `dispute_resolver: Address` = curator | **Staked decentralised arbitration** | `set_dispute_resolver` → arbitration contract |
| 4 | `curator: Address` | Multisig / DAO governance | address swap |
| 5 | `token: Address` per market, SEP-41 | Test token → testnet USDC → mainnet USDC → multi-token | already parameterised |
| 6 | All economics in `Config` storage | Governance-tunable parameters | already storage |
| 7 | Timelocked `propose_upgrade` | Mainnet upgrades without losing state | `contract.rs` |
| 8 | Event on every transition | Indexer, leaderboards, analytics | no contract change needed |
| 9 | `Position(market, user, outcome)` | Transferable positions, secondary market | no storage migration |
| 10 | Pricing isolated in `math.rs` | CPMM / LMSR continuous pricing | replace one module |
| 11 | `create_market` curator-only, signature already has a bond slot | Permissionless creation + spam control | remove auth check, enable bond |
| 12 | Resolver agent is a separate package | Third-party resolver SDK and onboarding | already decoupled |

## The three grant pillars

### Pillar 1 — Decentralised arbitration
Replace the v1 trusted backstop with a staked juror pool and an escalation game.
This is the single largest honesty gap in v1 and we state it plainly in the v1
README rather than hiding it. Depends on hook #3.

### Pillar 2 — Permissionless markets and a resolver economy
Creator bonds and spam control, resolver staking and delegation, a public resolver
leaderboard, and an SDK so third parties can run their own agents against Verdict.
Depends on hooks #11, #12, #2.

### Pillar 3 — Mainnet, real USDC, audit, and the full agentic loop
Mainnet deployment against Circle USDC, an external audit, and x402/MPP wired both
ways: agents *pay* for market data and *get paid* for resolution over HTTP, with
MPP channels for high-frequency resolvers. Depends on hooks #5, #7.

## Deliberately not on this list

Cross-chain markets, a token, and mobile apps. Adding them would make the v2 story
broader and weaker. The v2 pitch is "we made the trust layer real", not "we added
features".
