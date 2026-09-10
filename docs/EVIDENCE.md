# Evidence of completion

For review against the Instawards Statement of Work, *Verdict: Agentic
Resolution for Markets*.

Everything below is checkable without trusting this document. Every contract
address, transaction hash and hash digest can be resolved against Stellar
testnet, and the site re-derives the hashes in the reader's own browser rather
than asserting them.

| | |
|---|---|
| Live demo | https://0xspideys.github.io/resolver-agents/ |
| Repository | https://github.com/0xSpideys/resolver-agents |
| Network | Stellar testnet |
| Explorer | `https://stellar.expert/explorer/testnet/tx/<hash>` |

---

## Deliverable 1 — Soroban market contract

> Build the core Soroban market contract for curated YES/NO markets, user
> positions, escrow, settlement, and basic fees.

**Status: complete.**

| | |
|---|---|
| Contract | `CD75VOBNOPZQJ2ZLV5CE2JTIQFE6BFBJK2KNLA26JPXEH223L3RSLHO5` |
| Source | `contracts/verdict-market/src/` |
| Entrypoints | 22 |
| Unit tests | 43 passing |
| Deployed wasm sha256 | `6b5f9f2b495a1a9e4bc0ee428859342ef7ff0be7306917e95abe49ce8d47219f` |

Six states: `Open → Resolving → Tallied → Settled`, plus `Disputed` and `Void`.
Every branch has been exercised on testnet, not only in tests.

**Reproducible build.** `make report` builds the contract locally, fetches the
deployed wasm from the network, and compares the two hashes. The result is
committed to `apps/site/src/data/report.json` and rendered on the
[How it works](https://0xspideys.github.io/resolver-agents/about/) page. A match
means the repository compiles to the contract holding the escrow — the strongest
check available without an audit.

**Invariants held under test** (`contracts/verdict-market/src/math.rs`, unit
tested with no `Env`):

1. A winner never receives less than their own stake.
2. Total payouts never exceed escrow; rounding always floors toward the protocol.
3. Economic terms are snapshotted per market at creation, so config changes are
   never retroactive.
4. A void market takes no fee and returns every bond.

**Escrow and settlement, on chain:**

| Event | Transaction |
|---|---|
| Market opened (#17) | `f03b6e8cf8ca487f08cf764e5b201d0bc0b4220228040baeb86051e81e8a433d` |
| Trading closed (#16) | `190724b2e0b38af0cde58c7613c7a379db613dc00dee56a7dce488180f188dcc` |
| Market finalised (#16) | `59a6235b227251c0bb3b8d1ca9f5d4a121117d9aa90cd9451f098554424648d3` |

---

## Deliverable 2 — 8004 resolver agent layer

> Build the resolver agent layer using stellar-8004 identity. Resolver agents
> will submit outcomes, evidence, source links, and small bonds.

**Status: complete.**

| | |
|---|---|
| 8004 Identity registry | `CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH` |
| 8004 Reputation registry | `CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55` |
| Registered agents | #18–#23 |
| Agent code | `apps/resolver-agent/` |

**The registries are not ours.** They are the trionlabs deployment, shared
infrastructure used by other projects. That is the point: a record earned in
Verdict is written somewhere the agent keeps it, not into our own database.

### Influence comes from reputation, never from capital

Every agent posts the **same flat bond**, so no agent can buy a larger say. What
varies is weight, from 1.00× to 3.00×, and it is a function of that agent's
record inside Verdict. This is the deliberate break from stake-weighted
resolution.

Weight is snapshotted into the submission at submission time, so a later change
in standing cannot retroactively alter a past tally.

### Live standing, read from the chain

Rendered at [/agents/](https://0xspideys.github.io/resolver-agents/agents/):

| Agent | Record | Weight |
|---|---|---|
| #21 | 9 correct / 0 wrong | 3.00× |
| #22 | 8 correct / 0 wrong | 3.00× |
| #23 | 1 correct / 10 wrong | 1.19× |

Agent #23 drifting down through 1.25× → 1.23× → 1.19× rather than snapping to a
floor shows weight behaving as a continuous function of the record, not as a
good/bad flag.

### Evidence is bound to the submission

Every submission carries a document and its sha256. The document is embedded in
the `evidence_uri` as a base64 data URI rather than hosted, so it cannot rot or
be quietly edited after the fact. It is hashed over canonical JSON with sorted
keys, or two agents seeing identical facts would commit to different digests.

Anyone can re-check one:

```bash
cd apps/resolver-agent
pnpm exec tsx src/cli.ts verify 16 21
```

The site does the same check in the reader's browser and prints
**EVIDENCE MATCHES ITS HASH** next to each answer.

### Questions cannot be restated after positions are taken

Each market stores `question_uri` and `question_hash`. The full criteria are
hashed when the market opens, and **an agent refuses to answer a market whose
document does not hash to what the contract holds.** Markets #0–#4 predate this
check and are shown in an Archive group as unverifiable rather than hidden.

### Three resolution sources, honestly graded

The question declares which source may settle it, and every evidence document
carries the source class. Presenting all three as equally verifiable would be
the first claim a reviewer breaks.

| Source | Class | What it means |
|---|---|---|
| Reflector oracle | `onchain` | Re-derivable from chain state by anyone, forever. A false claim is provable. |
| Open-Meteo archive | `public-api` | Re-runnable, but you trust the provider. Nothing on chain attests to it. |
| Model research | `research` | Reads open sources and judges. Not reproducible; two careful agents can differ in good faith. |

Reflector is the only oracle actually deployed on Stellar testnet. The docs list
Band and DIA with testnet addresses; neither has a contract there. Checked.

### Rewards and penalties, on chain

Market #16 is the cycle worth reviewing, because the two agents **disagreed**:

| Step | Result | Transaction |
|---|---|---|
| Trading closed | pools 60 YES / 40 NO | `190724b2e0b38af0cde58c7613c7a379db613dc00dee56a7dce488180f188dcc` |
| Agent #21 answered | **YES** at 3.00× | `01a8259bdf3bc11ec2fd54e150a7b3826343bfb42adc03319256b5b1db3b0ffa` |
| Agent #23 answered | **NO** at 1.25× | `9d084131ba2c854cde87483448a352411574feccdbec4ecec58a2898c471ce78` |
| Weighted tally | YES, 300 of 425 | — |
| Finalised | unchallenged | `59a6235b227251c0bb3b8d1ca9f5d4a121117d9aa90cd9451f098554424648d3` |
| Agents settled | #21 paid, #23 **slashed**, both written to 8004 | `4e2e61340573c09f87b234ee84f1061727e275784bb23f9154cbea70e73d3a5a` |

The losing agent's bond is slashed and the correct agent recovers its bond and
shares the fee. Agent #23 is a deliberate demonstration of the penalty path and
the site labels it as such — it reports the opposite of what it observed.

View it: [market #16](https://0xspideys.github.io/resolver-agents/markets/?id=16).

---

## Deliverable 3 — Demo UI and evidence package

> Build a demo UI and evidence package showing one or more curated markets,
> agent submissions, weighted resolution, fee distribution, and penalties.

**Status: complete except the demo video** (see *Outstanding* below).

The dApp is a static export with **no backend**. Every chain read happens in the
reader's browser, so the page cannot show a stale snapshot baked in at build
time, and nothing is taken on our word that a server could have altered.

Four routes: `/`, `/markets/?id=N`, `/agents/`, `/about/`.

### What a reviewer can do without connecting anything

- Browse every market and its ruling
- Read both agents' reasoning, stated caveats and source links on market #16
- Watch the question hash and each evidence hash be **re-derived in their own browser**
- See agent standing read live from the 8004 registry
- Read the payout arithmetic and the contract addresses
- Confirm the deployed contract matches this source, byte for byte

### What a reviewer can do with a wallet

Three markets are **open for trading**, one of each source class:

| Market | Question | Class |
|---|---|---|
| [#17](https://0xspideys.github.io/resolver-agents/markets/?id=17) | Was XLM above $0.15 on the Reflector oracle? | `onchain` |
| [#18](https://0xspideys.github.io/resolver-agents/markets/?id=18) | Did Istanbul's maximum temperature exceed 30°C on 2026-09-07? | `public-api` |
| [#19](https://0xspideys.github.io/resolver-agents/markets/?id=19) | Is the ERC-8004 standard live on Ethereum mainnet? | `research` |

Both sides of each are already seeded, so a new position visibly moves the
implied odds.

**Funding is in the page.** A freshly installed wallet has an account that does
not exist on the network. Connect it and the page offers to fund it from
friendbot; the prompt disappears once there is enough to stake. No faucet
hunting, and no trustline, because the settlement token is native XLM.

**Every lifecycle call is a button**, not just betting: close, tally, finalise,
settle agents, claim. All of these are permissionless in the contract, so any
connected account can drive a market forward. Which button appears is decided by
contract rules against a live clock.

### Settlement token

The SOW describes USDC-style settlement. Both have been demonstrated on chain,
and the distinction is worth stating plainly:

- **The contract is token-agnostic.** `token` is a per-market parameter, any
  SEP-41 token including USDC. It is snapshotted at creation, so markets in
  different tokens coexist.
- **Markets #0–#13 settled in a USD-denominated asset** (a classic asset through
  its SAC), which is the USDC-shaped path end to end.
- **Markets #14 onward settle in native XLM.** A classic asset requires the
  holder to open a trustline first, and there was no way to do that from the
  site — a visitor connected, clicked Place and got "no trustline". Native XLM
  needs no trustline, so the demo is reachable by anyone with a wallet.

So USD-denominated settlement is proven, and the live demo deliberately uses XLM
to remove the one step a reviewer could not get past. Pointing a market at
testnet USDC is a one-line configuration change
(`packages/sdk/src/deployment.ts`).

---

## Out of scope, as agreed

The SOW excludes these and they are **not** built:

- Permissionless market creation by any user
- Complex orderbook trading (this is parimutuel: two pools, no curve, no market maker)

## Stated limitations

Listed on the site's own [How it works](https://0xspideys.github.io/resolver-agents/about/)
page under *What this does not do*, because a reviewer should not have to
discover them:

- **A disputed market is decided by us.** If a tally is challenged, the curator
  rules. A trusted role, and the clearest remaining gap.
- **Only we open markets.** Anyone can take a position and any agent can answer,
  but creation is curated. Opening it up needs spam control that does not exist.
- **Every agent is ours.** Six identities, one operator. The mechanism is real;
  the decentralisation is not yet.
- **Binary outcomes only**, and **testnet only, with no audit.**

## Outstanding

- **Demo video.** Not yet recorded. `docs/DEMO_RUNBOOK.md` is a shot-by-shot
  script for it.

---

## Reproducing any of this

```bash
source "$HOME/.cargo/env"
export PATH="$HOME/.local/bin:$PATH"

make test      # 43 unit tests
make report    # tests, build, fetch the deployed wasm, compare hashes

./scripts/demo.sh status    # every market and its state, from the chain
```

Verify one evidence document by hand:

```bash
cd apps/resolver-agent
pnpm exec tsx src/cli.ts verify 16 21
```

Re-derive market #16's on-chain answer independently of Verdict — this is the
`onchain` class claim, and it is the one a reviewer can break if it is false:

```bash
stellar contract invoke \
  --id CCYOZJCOPG34LLQQ7N24YXBM7LL62R7ONMZ3G6WZAAYPB5OYKOMJRN63 \
  --source-account <any> --network testnet \
  -- lastprice --asset '{"Other":"XLM"}'
```
