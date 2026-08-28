# Verdict — handoff

Read this whole file before touching anything. It is the only document you need
to resume; everything else it points at is reference.

Then read, in this order:
1. `CLAUDE.md` — hard rules and toolchain traps. Non-negotiable.
2. `docs/ISOLATION.md` — the account-isolation constraint. Also non-negotiable.
3. `docs/SPEC.md` — the contract's design. Source of truth for contract work.

---

## 1. What this is

**Verdict** is a binary information market on Stellar/Soroban whose outcome is
decided by AI agents registered on the 8004 identity registry, rather than by an
admin or a price feed.

A market asks a yes/no question. People stake on either side. When trading
closes, registered agents each submit an answer with the evidence behind it and
a flat bond. Answers are weighted by each agent's track record *inside Verdict*.
The weighted majority becomes the outcome after a challenge window. Correct
agents recover their bond and share a fee; wrong ones are slashed. Every result
is written to the 8004 Reputation Registry, so the record belongs to the agent
and travels with it.

**The one line that matters:** influence comes from reputation, never from
capital. Every agent posts the same flat bond. That is the deliberate break from
every stake-weighted resolution system.

### Why it exists

Information markets settle one of three ways: an admin decides, a price feed
decides, or the crowd votes. Trusted, price-only, or Sybil-shaped.

Research (done, see §7) found 28+ prediction markets already building on
Soroban and **zero** agent-resolution layers. Every one of them resolves with a
price oracle, which means none of them can ask a question a price feed cannot
answer. That gap is the project.

**The market is the first application, not the product.** The product is an
accountable resolution layer. Do not let the framing drift back to "a prediction
market on Stellar" — that framing invites the correct objection that several
already exist.

### Origin

Funded by a $5,000 Instawards grant through the Stellar Türkiye chapter. That
context is deliberately absent from the repo and the site (see §2). The user
originally scoped 30 days, then compressed to "let's finish in ~3 days" — treat
it as a demo-quality MVP that must be genuinely working, not a production system.

---

## 2. Hard rules — read twice

### Account isolation

**This project must have zero connection to the `bertankofon` GitHub account or
to Bronix / Bronix Engineering.** The user stated this twice, in capitals. It is
a hard constraint, not a preference.

- Nothing gets pushed, deployed, hosted or provisioned into an environment those
  identities own. That includes services not yet chosen.
- **Before adding any hosted dependency, ask whose account it lives under.**
  Reaching for an existing account because it is convenient is exactly the
  failure this prevents.
- Commit as `0xSpideys <319500619+0xSpideys@users.noreply.github.com>` (already
  set in repo-local git config).
- Push over the **`github-spideys`** SSH alias only. The machine's default SSH
  key belongs to `bertankofon` and would silently attach the push to it.
  `IdentitiesOnly yes` in `~/.ssh/config` is the load-bearing part.
- Working on the user's local machine is fine. The rule is about *remote
  environments and published artefacts*.

Full text: `docs/ISOLATION.md`.

### Naming

The product is **Verdict** everywhere — site, docs, code. `resolver-agents` is
only the repository name and must never appear as a product name in content.
The lowercase term "resolver agent" is protocol vocabulary for the role and is
fine.

### Style the user has asked for repeatedly

- **Short copy.** The user pushed back twice on verbose, flowery writing. Facts,
  not arguments. Explanations of *why* belong in `docs/SPEC.md`.
- **No em-dashes in UI copy.** They asked directly.
- **Design should not look AI-generated.** No generic card grids, no purple
  gradients, no emoji. They rejected one design already and asked for a full
  change; the current one (see §5) survived.
- Talk to them in Turkish; write all code, comments and UI copy in English.

---

## 3. Where things are

```
~/dev/verdict                          local
github.com/0xSpideys/resolver-agents   remote (public), 7 commits unpushed
```

### On testnet

| | |
|---|---|
| Verdict market | `CD75VOBNOPZQJ2ZLV5CE2JTIQFE6BFBJK2KNLA26JPXEH223L3RSLHO5` |
| Demo token (native XLM SAC) | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| 8004 Identity | `CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH` |
| 8004 Reputation | `CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55` |
| Reflector (CEX/DEX prices) | `CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63` |

All of these live in `packages/sdk/src/deployment.ts`. Change them there, never
inline.

The 8004 registries are **not ours** — deployed by trionlabs. That is the point:
a record earned here means something elsewhere.

### Local keys (`stellar keys`)

`verdict-deployer` (admin + curator + treasury + dispute resolver), `alice`,
`bob` (test traders), `bot-honest` / `bot-honest2` / `bot-liar` (agents 21, 22,
23), plus three stale ones from an early run (`agent-a/b/c`, agents 18/19/20).

### Live contract config

```
resolve_window     300s     challenge_window   120s
resolver_bond      10 units of the market's token  challenge_bond     2x
fee_bps            200      resolver_fee_bps   6000
weight_min/max     100/300
```

`resolve_window` was raised from 90s specifically because 90 is enough for a
script running flat out and not enough for a person demonstrating something.
Do not lower it.

---

## 4. Repository layout

```
contracts/verdict-market/   Soroban contract (Rust). 43 tests.
packages/sdk/               Shared TS. Isomorphic — runs in Node and browser.
apps/site/                  Next.js dApp. Static export.
apps/resolver-agent/        A resolver agent. Anyone can run one.
apps/curator/               Operator CLI: open markets, drive the lifecycle.
scripts/demo.sh             Demo driver.
scripts/report.mjs          Generates the build/test report the site renders.
docs/                       SPEC, STACK, V2_ROADMAP, ISOLATION.
```

### The contract

`contracts/verdict-market/src/` — `contract.rs` (22 entrypoints), `types.rs`
(storage schema), `math.rs` (pure payout/weighting, unit tested), `storage.rs`,
`events.rs`, `external.rs` (8004 clients), `errors.rs`, `test.rs`.

Six states: `Open → Resolving → Tallied → Settled`, plus `Disputed` and `Void`.

**Every branch has been exercised on testnet, not just in tests.**

### Invariants that must never regress

1. A winner never receives less than their own stake.
2. Total payouts never exceed escrow; rounding always floors toward the protocol.
3. Economic terms are snapshotted per market at creation. Config changes are
   never retroactive.
4. Resolver weight is snapshotted into the submission at submission time.
5. A void market takes no fee and returns every bond.
6. Every state transition emits an event.

---

## 5. What has been built

### Contract — done

43 tests green, deployed, and the deployed wasm hashes identical to a fresh
local build (`make report` checks this and the site shows the verdict).

### Question hashing — done

Each market stores `question_uri` + `question_hash`. The curator builds a
question document, its canonical-JSON sha256 goes on-chain, and **an agent
refuses to answer a market whose document does not hash to what the contract
holds.** Before this the hash was a placeholder and nothing checked it, so
"the criteria cannot change after people stake" was decorative.

Markets #0–#4 predate this and show as unverifiable. They are shown in an
Archive group rather than hidden.

### Three resolution sources — all three proven

`apps/resolver-agent/src/sources/`. **The question declares which one it takes**,
and every evidence document carries the source class, because presenting all
three as equally verified would be the first claim an auditor breaks.

| Source | Class | Status |
|---|---|---|
| `reflector` | `onchain` — re-derivable by anyone forever | ✅ proven on testnet |
| `open-meteo` | `public-api` — re-runnable, but you trust the provider | ✅ proven on testnet |
| `research` | `research` — model + web search, not reproducible | ✅ proven on testnet |
| `contrarian` | demo fixture that inverts a real finding | ✅ used for the penalty path |

**Reflector is the only oracle actually deployed on Stellar testnet.** The docs
list Band and DIA with testnet addresses; neither has a contract there. Verified.

### Evidence — done

Every submission carries a document and its sha256. The document is embedded in
the `evidence_uri` as a base64 data URI rather than hosted, so it cannot rot or
be edited after the fact. Hashed over canonical JSON (sorted keys) or two agents
seeing identical facts would commit to different hashes.

`pnpm exec tsx src/cli.ts verify <market> <agent>` decodes and re-checks one.

### Agents — five registered, all ours

Agents 18–23 on the live 8004 registry. Current standing:

| Agent | Record | Weight |
|---|---|---|
| #21 | 7 right / 0 wrong | 3.00× |
| #22 | 6 right / 0 wrong | 3.00× |
| #23 | 1 right / 8 wrong | 1.23× |

#23 sitting at 1.23× rather than the floor is the design working: weight is a
function of the record, not a good/bad flag.

### The dApp — done

`apps/site`. Static export (GitHub Pages), all chain reads happen in the
browser. Four routes: `/`, `/markets/?id=N`, `/agents/`, `/about/`.

**Design language: "instrument."** Cool neutral ground, one figure carrying each
screen (implied odds, or the ruling), colour only where it means something —
pine YES, terracotta NO, brass standing. Type: Instrument Serif display,
Archivo text, DM Mono figures. No sans headline font, no cards-on-cards.
Theme toggle: light / system / dark, stored per browser, applied before first
paint by an inline script.

`/markets/?id=N` is one static shell for every market. A `[id]` route would need
every id enumerated at build time and would 404 on markets opened since.

### Wallet — done

Stellar Wallets Kit (Freighter, LOBSTR, xBull, Albedo, Hana, Rabet). The SDK
grew an `ExternalSigner` seam because a browser wallet never hands over a key.

**Every lifecycle call is a button**, not just betting: close, tally, finalise,
settle agents, claim. All of these are permissionless in the contract — the only
reason they are usually operator scripts is that most dApps keep the lifecycle
in a backend. Which button appears is decided by contract rules against a live
clock, so the control to close a market appears the moment it expires.

---

## 6. What is NOT done

### Blocking the demo

**1. Trustline — fixed.** The demo token was a classic Stellar asset (VUSD),
which needed a trustline before anyone could bet, and the site had no flow to
open one. Fixed by switching the demo settlement token to native XLM's SAC
(`CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` on testnet, derived
via `stellar contract id asset --asset native --network testnet`). Native XLM
needs no trustline, so a freshly funded testnet account can bet immediately.
`Market.token` is snapshotted per market at creation (CLAUDE.md invariant #3),
so this only affects markets opened after the switch — existing VUSD markets
keep working exactly as before, and the site labels each market's token
correctly (`market.token === TESTNET.token ? "XLM" : "VUSD"` in
`apps/site/src/components/actions.tsx`).

**2. Pushed and live.** `main` is on `origin`, the Pages workflow ran, and the
site serves at `https://0xspideys.github.io/resolver-agents/`.

**3. Research agent — proven on testnet.** Routed through **OpenRouter**, not a
single vendor: `OPENROUTER_API_KEY` from an isolated account, model from
`OPENROUTER_MODEL` defaulting to `google/gemini-3.7-flash`. Structured output
via `response_format: json_schema` (strict), web search via OpenRouter's own
`plugins: [{id:"web"}]`, so the capability does not depend on the chosen model
shipping a search tool. Plain `fetch`, no SDK dependency. Copy `.env.example`
to `.env` and fill in the key.

Market #16 ran the whole loop: agent #21 researched the question with live web
search and submitted YES at 3.00×, agent #23 submitted NO at 1.25×, the
weighted tally took YES at 300/425, and settlement paid #21 and slashed #23.
Evidence verified, reputation written to 8004.

**Two runs of the same question produced different key facts and a different
caveat.** That is the source class behaving as documented, not a defect — but
it is why `research` questions carry the `research` class and why the caveat is
part of the evidence contract.

The call carries a 70s timeout and one retry, bounded so that two attempts plus
backoff still fit inside the 300s resolve window with room for the chain write.
Only transient failures are retried — a 401 or a 400 fails immediately, because
sending the same rejected request again just spends the window. Tunable with
`OPENROUTER_TIMEOUT_MS` and `OPENROUTER_ATTEMPTS`.

### Known gaps, not blocking

- **Dispute resolution is centralised.** A challenged tally is decided by the
  curator. Stated plainly on `/about/`. Replacing that single address with
  staked arbitration is the biggest honest gap and the natural v2 headline.
- **Market creation is curated.** Anyone can trade and any agent can answer, but
  only the curator opens markets.
- **Binary outcomes only.** Types are `u32` throughout; one runtime guard gates
  it.
- **Every agent is ours.** Five keys, one machine. The mechanism is real; the
  decentralisation is not.
- **No audit, testnet only.**
- No demo video.
- `apps/site` reads markets in a loop with no indexer. Fine at this scale.
- Nothing else outstanding that is not a deliberate v2 decision.

`docs/V2_ROADMAP.md` lists twelve extension points deliberately built into v1.

---

## 7. Research already done — do not redo

- **Stellar oracles:** only Reflector is live on testnet. Band and DIA are
  documented with testnet addresses but nothing is deployed at them.
- **Competition:** 28+ Soroban prediction markets (Predictify, PredictIQ,
  SPulse, Orakel, Vatix, predict.io, wick, Oraculum, BACKit). All resolve with
  price oracles. Closest to us is Orakel (bonded optimistic resolution) but its
  bonds are anonymous and single-use with no persistent record. WarpDrive
  (SCF-funded $150k) targets prediction-market oracles — potential v2 partner,
  not a competitor.
- **8004 on Stellar:** `trionlabs/stellar-8004` is the real implementation, live
  on testnet and mainnet. `agent_id` is **u32**. TS package is
  `@trionlabs/stellar8004` (the README points at a stale `8004-sdk` stub).
- **Stellar's official agentic story** is x402 and MPP (payments). 8004 is not
  in SDF docs; it is community infrastructure.

---

## 8. Traps that already cost time

Each of these is commented in the code where it bites. Do not rediscover them.

1. **Returning `Err` from a Soroban function rolls back state.** Voiding a market
   inside `tally` by returning an error discarded the `Void` write and left the
   market stuck in `Resolving` with escrow trapped. Voiding returns `Ok`.
2. **`get_summary` on the 8004 Reputation Registry is O(n)** in an agent's
   feedback history and rejects an empty client list. Never call it on a write
   path. Verdict keeps local `AgentStats` for weighting and writes to 8004 for
   the portable record.
3. **Soroban decodes a unit-variant enum as `["Resolving"]`**, not a bare string.
   Normalised in `Verdict.getMarket`.
4. **`cargo build` and `stellar contract build` produce different wasm.** The CLI
   embeds contract metadata. Deploy and hash the CLI output, or the published
   hash never matches the chain.
5. **`cargo install stellar-cli` fails on Rust 1.98** (`ethnum` E0512). The CLI
   is a prebuilt binary at `~/.local/bin/stellar` (v27.1.0). Do not retry.
6. **Build target is `wasm32v1-none`**, not `wasm32-unknown-unknown`.
7. **Rust needs `source "$HOME/.cargo/env"`** in non-login shells.
8. **Classic-asset SACs need a trustline before mint.** Cost an hour the first
   time.
9. **Fixed `sleep` in demo scripts drifts past contract windows.** Wait on
   on-chain deadlines instead.
10. **`local a=$1 b=$((a+1))` reads an unset `a` under `set -u`** — bash
    evaluates every right-hand side on a `local` line before binding any.
11. **Next's Turbopack will not map `.js` specifiers onto `.ts` sources.** The
    SDK imports are extensionless and the site sets `transpilePackages`.
12. **The React compiler lint is strict**: no `Date.now()` during render, no
    synchronous `setState` in an effect, no ref writes during render. The
    codebase uses `useSyncExternalStore` for the clock and the theme, and a
    keyed `useAsync` for fetches. Follow those patterns rather than fighting the
    rules.

---

## 9. How to run everything

```bash
source "$HOME/.cargo/env"
export PATH="$HOME/.local/bin:$PATH"

# contract
make test        # 43 unit tests
make report      # tests + build + fetch the deployed wasm and compare
                 # writes apps/site/src/data/report.json, which /about renders

# site
pnpm --filter site dev            # http://localhost:3000
STATIC_EXPORT=1 pnpm --filter site build   # what Pages publishes

# demo
./scripts/demo.sh status     # what is on chain
./scripts/demo.sh open       # one market of each kind, both sides taken
./scripts/demo.sh answer     # every agent answers what it can
./scripts/demo.sh advance    # push each market as far as the clock allows
./scripts/demo.sh full       # the whole cycle, ~10 minutes

# one agent by hand
cd apps/resolver-agent
AGENT_SECRET_KEY=$(stellar keys show bot-honest) AGENT_ID=21 \
  RESOLUTION_SOURCE=reflector pnpm -s resolve

# curator
export CURATOR_SECRET_KEY=$(stellar keys show verdict-deployer)
pnpm --filter curator -s cli presets
pnpm --filter curator -s cli open xlm-price --trading 3600
pnpm --filter curator -s cli show 12
```

Regenerate `report.json` and commit it whenever the suite or the contract
changes — the site renders the committed file, and Pages has no Rust toolchain.

---

## 10. Suggested next steps, in order

1. **Demo video / runbook**, if they want one. Market #16 is the cycle worth
   recording: two agents disagreeing, weight deciding, reputation moving.
2. **Regenerate `report.json`** whenever the contract next changes. It is
   current as of the 43-test suite and the deployed wasm hash still matches.

Then, only if there is appetite, the v2 pillars below.

Then, only if there is appetite: staked arbitration (v2 pillar 1), permissionless
market creation (pillar 2), mainnet + audit (pillar 3).

---

## 11. Working with this user

- They review carefully and catch real gaps. When they push back, they are
  usually right. The `question_hash` being fake, the design being too dark, the
  copy being too long — all their catches.
- They ask for honest assessments and get annoyed by padding. Lead with the
  answer.
- They want to be told plainly what is left and what they personally must do.
- Do not start large work without saying what you plan to do first. They said
  "sadece söyle, komutumla başla" — tell me, start on my command.
- Flag anything that looks like it drifted while you were not looking. Three
  commits appeared in this repo from another session once; surfacing that was
  the right call.
