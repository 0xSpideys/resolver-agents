# Verdict — Technical Specification v1

**Agentic Resolution for Markets** · Stellar / Soroban
Instawards 30-day scoped engagement · Stellar Türkiye chapter

> **Status:** Week 1 deliverable. This document is the contract between the design
> and the implementation. If the code diverges from this, one of the two is wrong
> and we fix it before moving on.

---

## 1. What this is

A curated binary information market on Stellar where users take YES/NO positions
with USDC, and the outcome is decided by **8004-registered resolver agents** that
post evidence and a bond, are weighted by their track record inside this protocol,
and are paid or slashed on settlement — with the result written back to the 8004
Reputation Registry so the record travels with the agent.

**The product is not the prediction market.** The market is the first application
of the thing we are actually building: an economically-incentivised, evidence-
mandatory resolution layer for autonomous agents. There are 28+ prediction markets
on Soroban already; there is no agent-resolution layer. That gap is the project.

### Non-goals for v1

Explicitly out of scope, each with a deliberate hook left in the code so v2 is an
extension rather than a rewrite — see [V2_ROADMAP.md](./V2_ROADMAP.md).

- Permissionless market creation
- Orderbook or AMM pricing (v1 is parimutuel)
- Decentralised arbitration (v1 has a trusted dispute backstop, declared as such)
- Markets with more than two outcomes
- Mainnet deployment with real USDC

---

## 2. Economic model

### 2.1 Parimutuel

Two pools per market. No pricing curve, no counterparty matching, no liquidity
provider. Stake goes into a pool; at settlement the winning pool splits the losing
pool pro rata.

```
losing_pool  = total_staked − winning_pool
fee          = losing_pool × fee_bps / 10_000
resolver_pool= fee × resolver_fee_bps / 10_000
protocol_cut = fee − resolver_pool
distributable= losing_pool − fee

payout(user) = stake + stake × distributable / winning_pool
```

A winner never receives less than their own stake back. Rounding floors at every
step; the three fee components always sum back to `losing_pool` exactly, and
per-user flooring leaves dust in the contract which `sweep_dust` sends to the
treasury. Both invariants are unit-tested in `math.rs`.

### 2.2 Parameters

Every value below lives in storage, not in a `const`. v2 hands them to governance
without a contract migration.

| Parameter | v1 default | Note |
|---|---|---|
| `fee_bps` | `200` (2%) | Taken from the losing pool only |
| `resolver_fee_bps` | `6000` (60% of fee) | Rest goes to treasury |
| `resolver_bond` | 10 USDC | **Flat for every agent** |
| `challenge_bond_mult` | `2` | Challenge bond = 2× resolver bond |
| `challenger_reward` | configurable | Paid **from treasury** |
| `resolve_window` | 24h | Submission window after close |
| `challenge_window` | 24h | Challenge window after tally |
| `weight_min` / `weight_max` | `100` / `300` | 1.00× – 3.00×, base 100 |

Economic terms are **snapshotted into the `Market` struct at creation**. Changing
`Config` must never retroactively change the deal a user already staked into.

### 2.3 Influence is reputation, never capital

The bond is identical for every agent. A resolver's weight comes from their track
record and nothing else. This is the deliberate break from money-weighted
resolution systems and it is the sentence the demo video leads with.

### 2.4 Where money goes

| Event | Destination |
|---|---|
| Correct resolver | bond returned + weight-proportional slice of `resolver_pool` |
| Wrong resolver | **bond slashed 100% → protocol treasury** |
| Upheld challenge | challenger bond returned + `challenger_reward` from treasury |
| Rejected challenge | challenger bond → protocol treasury |
| Protocol fee | treasury |
| Rounding dust | treasury, via `sweep_dust` |

> **Design note.** Slashed value routes to the treasury per the agreed rule. The
> challenger reward is paid *out of* the treasury rather than directly out of the
> slashed bond — this keeps the "penalties go to the protocol" rule intact while
> still giving anyone a reason to actually challenge a bad tally. Without it the
> challenge window is dead code.

---

## 3. State machine

```
                        ┌──────────────────────────────────────┐
                        │                                      │
  create_market         │                                      ▼
       │                │                                   ┌──────┐
       ▼                │                                   │ Void │
   ┌──────┐  close_ts   │                                   └──────┘
   │ Open │─────────────┤                                      ▲
   └──────┘             │  no submissions by resolve_deadline  │
       │                │  · one side of the book is empty ────┘
       │ close_market() │  · curator voids the market
       ▼                │
 ┌───────────┐          │
 │ Resolving │──────────┘
 └───────────┘
       │  tally()  — after resolve_deadline, permissionless
       ▼
  ┌─────────┐  challenge()   ┌──────────┐  resolve_dispute()  ┌─────────┐
  │ Tallied │───────────────►│ Disputed │────────────────────►│ Settled │
  └─────────┘                └──────────┘                     └─────────┘
       │                                                           ▲
       └───────── finalize()  — challenge_deadline passed, ────────┘
                              no challenge raised
```

| State | Trading | Submissions | Claims |
|---|---|---|---|
| `Open` | yes | no | no |
| `Resolving` | no | yes | no |
| `Tallied` | no | no | no |
| `Disputed` | no | no | no |
| `Settled` | no | no | **yes** |
| `Void` | no | no | refund 1:1 |

### Void conditions

A market that cannot pay anyone must not pretend to settle. Any of these voids it:

1. Either outcome pool is empty at `close_market` — there is no counterparty.
2. No resolver submitted by `resolve_deadline`.
3. The curator explicitly voids it (question turned out ambiguous or unresolvable).

On void: every stake is refundable 1:1, every resolver bond is returned, **no fee
is taken**, and no 8004 feedback is written.

---

## 4. 8004 integration

We do **not** reimplement 8004. We call the deployed
[trionlabs/stellar-8004](https://github.com/trionlabs/stellar-8004) registries.

| Registry | Testnet |
|---|---|
| Identity | `CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH` |
| Reputation | `CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55` |
| Validation | `CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL` |

Mainnet addresses are in `Config`; both sets are listed in the README. Registry
addresses are **stored, not hardcoded** — `set_registries(admin, …)` exists
because the 8004 contracts carry their own `propose_upgrade`/`execute_upgrade`
and could be redeployed.

### 4.1 Registration check (`submit_outcome`)

```rust
identity.agent_exists(&agent_id)             // -> bool
identity.find_owner(&agent_id)               // -> Option<Address>, must == submitter
```

`agent_id` is **`u32`** in the deployed registry. (The other Soroban 8004
implementation, `progax01/stellar8004`, uses `u64` — we target trionlabs.)

### 4.2 Writing reputation (`settle_resolvers`)

Verdict calls `give_feedback` on the Reputation Registry as itself:

```rust
reputation.give_feedback(
    &env.current_contract_address(),   // caller — the Verdict contract
    &agent_id,
    &value,                            // FEEDBACK_CORRECT (+100) | FEEDBACK_WRONG (−100)
    &0u32,                             // value_decimals
    &String::from_str(&env, "verdict"),// tag1 — lets clients filter to our record
    &market_id_string,                 // tag2
    &String::from_str(&env, ""),       // endpoint
    &evidence_uri,                     // feedback_uri — the agent's own evidence
    &evidence_hash,
);
```

A contract can satisfy `caller.require_auth()` for its own address, and the
registry's `SelfFeedback` guard does not fire because Verdict never owns an agent.

### 4.3 The reputation read problem, and why we cache

The registry's read API is:

```rust
get_summary(agent_id, client_addresses: Vec<Address>, tag1, tag2) -> SummaryResult
// rejects an empty client list
```

Reputation in 8004 is **subjective by design** — there is no global score, you
declare whose feedback you trust. That suits us: Verdict asks for
`get_summary(agent_id, [verdict_address], "verdict", "")`, which means *"this
agent's track record inside Verdict"* and cannot be inflated from outside.

**But it is O(n).** The implementation walks `1..=last_index` for each client,
reading one storage entry per past feedback. An agent that has resolved 500
markets costs 500 reads. That is acceptable in a UI read; it is not acceptable
inside `submit_outcome`, which every resolver calls on every market.

So:

- **Hot path** — Verdict keeps `AgentStats { correct, wrong }` in its own storage
  and derives weight in O(1). Updated incrementally in `settle_resolvers`.
- **Public record** — Verdict still writes every result to 8004, because
  portability is the entire point. Other protocols read it; we don't have to.
- The two are written in the same transaction and never diverge.

`get_summary` remains the bootstrap and audit path: the frontend calls it to prove
the on-chain record matches Verdict's counters.

### 4.4 Weight function

```
(avg, n) = avg_from_stats(correct, wrong)      // avg ∈ [−100, 100]
weight   = weight_min + (avg + 100) × (weight_max − weight_min) / 200
         clamped to [weight_min, weight_max]
n == 0   → weight_min
```

| Record | Weight |
|---|---|
| new agent | 1.00× |
| 5 right / 5 wrong | 2.00× |
| 10 right / 0 wrong | 3.00× |
| 0 right / 10 wrong | 1.00× |

Weight is **snapshotted into the `Submission`** at submission time. A later
reputation change must not retroactively alter a past tally.

v2 replaces this with recency decay and small-sample shrinkage. It is one pure
function in `math.rs` — that is what makes the swap cheap.

---

## 5. Storage schema

```rust
enum DataKey {
    // instance
    Config,
    MarketCount,

    // persistent
    Market(u64),
    Pool(u64, u32),                  // (market, outcome) -> staked
    Position(u64, Address, u32),     // (market, user, outcome) -> stake
    Claimed(u64, Address),
    Submission(u64, u32),            // (market, agent_id)
    SubmissionIds(u64),              // Vec<u32>, for iteration
    Challenge(u64),
    Stats(u32),                      // agent_id -> AgentStats
    Treasury(Address),               // token -> accrued fees
}
```

Notes:

- `Position` is keyed **per outcome**, so a user can hold both sides and so v2 can
  make positions transferable without a storage migration.
- `SubmissionIds` bounds tally iteration. v1 caps submissions per market
  (`MAX_SUBMISSIONS`) so `tally` can never exceed the resource budget.
- **TTL:** every `Market` read bumps the market and its children. A market whose
  entries expire before settlement would strand escrow — Phase 1 includes an
  explicit long-lived-market test.

---

## 6. Entrypoints

### Admin / config

| Function | Auth | Notes |
|---|---|---|
| `__constructor(admin, curator, treasury, identity, reputation, cfg)` | — | |
| `set_config(admin, cfg)` | admin | never retroactive |
| `set_registries(admin, identity, reputation)` | admin | 8004 redeploy escape hatch |
| `set_dispute_resolver(admin, addr)` | admin | **v2 points this at arbitration** |
| `pause(admin)` / `unpause(admin)` | admin | |
| `withdraw_fees(admin, token, to)` | admin | |
| `sweep_dust(admin, market_id)` | admin | post-settlement rounding remainder |
| `propose_upgrade` / `execute_upgrade` / `cancel_upgrade` | admin | timelocked |

### Market lifecycle

| Function | Auth | Notes |
|---|---|---|
| `create_market(curator, token, question_uri, question_hash, outcome_count, close_ts) -> u64` | curator | v1 rejects `outcome_count != 2` with `UnsupportedOutcomeCount`, not a panic. Signature already accepts a creator bond slot for v2. |
| `bet(user, market_id, outcome, amount)` | user | `Open` only, transfers into escrow |
| `close_market(market_id)` | none | after `close_ts`; voids one-sided books |
| `void_market(curator, market_id, reason_uri)` | curator | |
| `claim(user, market_id)` | user | `Settled` only |
| `refund(user, market_id)` | user | `Void` only |

### Resolver layer

| Function | Auth | Notes |
|---|---|---|
| `submit_outcome(submitter, agent_id, market_id, outcome, evidence_uri, evidence_hash)` | submitter (= agent owner) | `Resolving` only; posts bond; evidence required |
| `tally(market_id)` | none | after `resolve_deadline`; weighted majority → provisional; opens challenge window |
| `challenge(challenger, market_id, reason_uri)` | challenger | `Tallied` only; posts 2× bond |
| `resolve_dispute(dispute_resolver, market_id, final_outcome)` | `dispute_resolver` | v1 backstop |
| `finalize(market_id)` | none | after `challenge_deadline`, unchallenged |
| `settle_resolvers(market_id)` | none | pays/slashes, updates `AgentStats`, writes 8004 feedback |

### Reads

`get_config`, `get_market`, `get_pools`, `get_position`, `get_submission`,
`get_submissions`, `get_tally`, `get_agent_stats`, `get_weight`, `quote_payout`.

---

## 7. Events

Every state transition emits one. The indexer and the frontend are built on
events only — no contract change is needed to add analytics later.

| Topic | Data |
|---|---|
| `("market","created")` | id, creator, token, close_ts, question_hash |
| `("market","bet")` | id, user, outcome, amount, new_pool |
| `("market","closed")` | id, pools |
| `("market","void")` | id, reason |
| `("resolver","submitted")` | market, agent_id, outcome, weight, evidence_hash |
| `("resolver","tallied")` | market, provisional, weight_for, weight_total, count |
| `("resolver","settled")` | market, agent_id, correct, reward_or_slash |
| `("dispute","challenged")` | market, challenger, bond |
| `("dispute","resolved")` | market, final_outcome, upheld |
| `("market","settled")` | market, final_outcome, distributable |
| `("market","claimed")` | market, user, amount |
| `("fee","accrued")` | token, amount |

---

## 8. Error codes

Stable and never renumbered — the SDK and frontend map them to messages.
`1xx` config/access · `2xx` lifecycle · `3xx` trading/settlement ·
`4xx` resolver · `5xx` dispute. Full list in `contracts/verdict-market/src/errors.rs`.

---

## 9. Test plan

Beyond the happy path, these are the cases that decide whether the contract is
real. Each gets a named test.

**Trading**
one-sided book voids · zero-amount bet rejected · bet after `close_ts` rejected ·
double claim rejected · claim before settlement rejected · refund only when void ·
`i128` overflow on a huge stake · payouts never exceed escrow (property test)

**Resolver**
unregistered `agent_id` rejected · caller is not the agent owner rejected ·
double submission by the same agent rejected · submission outside the window
rejected · empty evidence rejected · zero submissions → void · exact weight tie ·
weight snapshot survives a later reputation change

**Dispute**
challenge outside window rejected · double challenge rejected · dispute resolved
against the provisional outcome flips resolver payouts correctly · unchallenged
finalize is permissionless

**Integration (testnet)**
full lifecycle against the live 8004 registries with three agents of differing
track records, ending with `get_summary` on the real registry matching Verdict's
local `AgentStats`.

**TTL** — market created, left idle past a TTL boundary, still settleable.

---

## 10. Open questions for Week 1

1. **Registry durability.** Contact trionlabs and confirm the testnet registry is
   not going to be wiped or redeployed mid-sprint. `set_registries` covers us
   either way, but a redeploy resets agent ids from 1 — our `Stats(agent_id)` keys
   would collide. If they cannot commit, key `Stats` on
   `(registry_address, agent_id)` instead. **Decide by Day 4.**
2. **Testnet USDC.** Circle USDC SAC vs. our own SEP-41 test token for the demo.
   Contract is token-agnostic, so this is a demo-quality question, not a design one.
3. **`MAX_SUBMISSIONS` per market.** Needs to be low enough that `tally` fits the
   resource budget. Measure in Phase 2 rather than guessing.
4. **Sprint start date.** The SOW says 16.06.2026; today is later than that.
   Confirm the official 30-day window with the chapter lead.

---

## 11. Phase plan

| Phase | Days | Output | SOW deliverable |
|---|---|---|---|
| 0 — Foundations | 1–4 | Repo, CI, 8004 bindings, **live 8004 spike** | — |
| 1 — Market core | 5–12 | Trading, escrow, settlement, void paths | D1 |
| 2 — Resolver layer | 13–21 | Submissions, weighting, challenge, slashing, 8004 writeback | D2 |
| 3 — Demo | 22–28 | Next.js app, example resolver agent, evidence pack | D3 |
| 4 — Close-out | 29–30 | Docs, v2 roadmap, handover | — |

**Phase 0 exists to fail early.** If the 8004 spike does not work on Day 4 the plan
can still change. On Day 20 it cannot.
