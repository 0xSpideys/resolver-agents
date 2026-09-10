# Demo runbook

A shot-by-shot script for the SOW demo video. Target length **4–6 minutes**.
Everything here is already live; nothing needs to be set up first.

Record at 1280×720 or larger. Screen only is fine — voice-over optional, but the
captions below carry the argument if there is no narration.

**One rule: do not claim more than the screen shows.** The project's credibility
comes from the limitations being stated out loud, so keep shot 7.

---

## Before recording

- A wallet extension installed (Freighter is the simplest) and set to **testnet**
- A **fresh, unfunded** account in it — the funding shot depends on it being empty
- Close other tabs; the header shows a TESTNET badge that should stay visible

Confirm the three open markets are still open:

```bash
./scripts/demo.sh status
```

If #17–#19 have closed (they were opened with a 7-day window), open new ones:

```bash
export CURATOR_SECRET_KEY=$(stellar keys show verdict-deployer)
for p in xlm-price istanbul-weather research; do
  pnpm --filter curator -s cli open $p --trading 604800
done
```

Then seed both sides, or the first side to bet alone will void the market:

```bash
V=$(cat .testnet-contract); U=10000000
for m in <new ids>; do
  stellar contract invoke --id "$V" --source-account alice --network testnet -- \
    bet --user "$(stellar keys address alice)" --market_id $m --outcome 1 --amount $((20*U))
  stellar contract invoke --id "$V" --source-account bob --network testnet -- \
    bet --user "$(stellar keys address bob)" --market_id $m --outcome 0 --amount $((20*U))
done
```

---

## Shot 1 — The problem (20s)

**Screen:** https://0xspideys.github.io/resolver-agents/ — the landing headline.

> Prediction markets settle one of three ways: an admin decides, a price feed
> decides, or the crowd votes. Trusted, price-only, or Sybil-shaped.
>
> Verdict settles them with AI agents that stake a bond on their answer and
> carry the result on a public reputation registry. The market is the demo. The
> product is the resolution layer.

Scroll slowly to the market list so the list of rulings is visible.

---

## Shot 2 — A decided market, and why you can trust it (75s)

**Screen:** [market #16](https://0xspideys.github.io/resolver-agents/markets/?id=16).

This is the most important shot in the video. Take it slowly.

1. **The ruling** — YES, at the top.
2. **The criteria**, and the words *Fixed when the market opened*.
3. **The hash**, and the phrase *verified in your browser*.

> The full criteria were hashed when the market opened. Your browser just
> re-derived that hash and matched it against what the contract holds. The
> question cannot be restated after people have taken positions — and you did
> not have to take my word for it, your own browser checked.

4. Scroll to **Answers · 2 submitted**.

> Two agents. They disagreed.

5. **Agent 21 — YES, weight 3.00×, paid.** Read one line of its reasoning aloud.
   Point at the **caveat** and the **source links**.

> It went and read the sources, and it published what could make it wrong.
> Stating your own uncertainty is part of the evidence contract here.

6. **Agent 23 — NO, weight 1.25×, bond slashed.**

> This one is wrong on purpose — it demonstrates the penalty path, and the site
> says so. It staked the same bond as the honest agent and lost it.

7. Point at **EVIDENCE MATCHES ITS HASH** under both.

> The evidence document is embedded in the submission, not hosted, so it cannot
> be edited afterwards. Both digests just checked out in your browser.

---

## Shot 3 — Reputation, not capital (45s)

**Screen:** [/agents/](https://0xspideys.github.io/resolver-agents/agents/).

> Every agent posts the same flat bond. No agent can buy a bigger say.
>
> What differs is weight — one to three times — and it is earned. Agent 21 is
> nine for nine and sits at 3.00×. Agent 23 is one for eleven and has drifted to
> 1.19×, not snapped to a floor, because weight is a continuous function of the
> record.
>
> This is the deliberate break from every stake-weighted resolution system.

Point out that the registry is the **trionlabs** 8004 deployment.

> These registries are not ours. The record belongs to the agent and travels
> with it, which is the whole reason to write it somewhere shared.

---

## Shot 4 — Fund a wallet and trade (75s)

**Screen:** [market #19](https://0xspideys.github.io/resolver-agents/markets/?id=19),
the research market, still open.

1. Click **Connect wallet**, pick the wallet, approve.
2. The funding prompt appears: *This account does not exist on testnet yet.*

> A fresh wallet has no account on the network. Rather than sending you to hunt
> for a faucet, the page funds it.

3. Click **Get testnet XLM**. Wait for the prompt to disappear.
4. In the bet box, type `25`. Point at the live dollar figure beside it.

> Positions settle in native XLM — no trustline, so nothing stands between
> connecting a wallet and trading. That dollar figure is priced from the same
> Reflector oracle a market can be resolved from.

5. Choose **YES**, click **Place**, approve in the wallet.
6. Show the confirmation and the **implied odds moving**.

---

## Shot 5 — Anyone can drive the lifecycle (30s)

**Screen:** stay connected; scroll to the lifecycle buttons on any market whose
clock allows an action, or narrate over market #16's timing panel.

> Closing, tallying, finalising and settling are permissionless in the contract.
> Most dApps keep that in a backend. Here they are buttons, and which one appears
> is decided by contract rules against a live clock — so the control to close a
> market appears the moment it expires. Not just for us. For whoever is looking.

---

## Shot 6 — The contract is the one in the repository (40s)

**Screen:** [/about/](https://0xspideys.github.io/resolver-agents/about/), scrolled
to **Build**.

> Forty-three tests pass. And this is the part I would check first if I were
> reviewing it: the deployed contract is fetched from the network and hashed
> against a fresh local build. The hashes match, so the repository compiles to
> the contract that is actually holding the escrow.

Scroll up to show the payout arithmetic and the contract addresses.

---

## Shot 7 — What it does not do (45s)

**Screen:** same page, **What this does not do**. Do not cut this shot.

> Four things this does not do, and they are on the site rather than in a
> footnote:
>
> A challenged tally is decided by us. That is a trusted role and the clearest
> remaining gap — replacing it with staked arbitration is the next real piece of
> work.
>
> Only we open markets. Anyone can trade and any agent can answer, but creation
> is curated, because opening it up needs spam control that does not exist yet.
>
> Every agent running today is ours. Eight identities, one operator. That shows the
> mechanism works and nothing about decentralisation.
>
> Testnet, and no audit. No real value moves.

---

## Shot 8 — Close (20s)

**Screen:** back to the market list.

> Three source classes, graded honestly: an oracle read anyone can re-derive, a
> public archive you have to trust the provider for, and a judgement call that is
> not reproducible at all. The question declares which one may settle it.
>
> That last class is what the protocol is for — the questions no price feed can
> answer. Repository and evidence package are linked below.

---

## Screenshots to save while recording

The SOW asks for screenshots as well as a video. Take these four with `Cmd+Shift+4`
as you pass through the shots above — they are the frames that carry the argument,
and capturing them during the recording costs nothing extra.

| From | Frame | Shows |
|---|---|---|
| Shot 2 | Market #16, scrolled to **Answers** | Two agents disagreeing, one paid, one slashed, both evidence hashes verified |
| Shot 3 | `/agents/` standing table | Weight earned from the record, not bought |
| Shot 4 | The funding prompt, then the placed position | A visitor can go from empty wallet to a position |
| Shot 6 | `/about/` **Build** panel | Deployed contract matches this source |

Save them into `docs/screenshots/` so they sit beside the evidence package.

## Links for the description

```
Live demo   https://0xspideys.github.io/resolver-agents/
Repository  https://github.com/0xSpideys/resolver-agents
Evidence    https://github.com/0xSpideys/resolver-agents/blob/main/docs/EVIDENCE.md
Market #16  https://0xspideys.github.io/resolver-agents/markets/?id=16
```
