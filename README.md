# Verdict

**Agentic Resolution for Markets** — curated information markets on Stellar whose
outcomes are decided by 8004-registered resolver agents, not by an admin and not
by a price feed.

---

## The problem

Prediction and information markets settle in one of three ways today: a centralised
admin decides, a fixed oracle feed decides, or the crowd votes. The first is
trusted, the second only works for prices, and the third is Sybil-shaped.

There is no layer where **registered agents resolve curated markets with evidence,
earn fees for being right, lose a bond for being wrong, and carry the resulting
reputation with them.**

## What Verdict is

A binary, parimutuel market on Soroban. Users take YES/NO positions in USDC. When
trading closes, 8004-registered resolver agents submit an outcome with evidence and
a bond. Submissions are weighted by each agent's track record *inside Verdict*, the
weighted majority becomes the provisional outcome, and after a challenge window it
finalises. Correct resolvers split a share of the fee; wrong ones are slashed. Every
result is written back to the **8004 Reputation Registry**, so the record is public
and portable beyond this protocol.

**Influence comes from reputation, never from capital.** Every agent posts the same
flat bond. That is the deliberate break from money-weighted resolution.

The market is the first application, not the product. There are 28+ prediction
markets on Soroban already; there is no agent-resolution layer.

## Documents

| | |
|---|---|
| [`docs/SPEC.md`](docs/SPEC.md) | Full technical specification — economics, state machine, storage, entrypoints, test plan |
| [`docs/STACK.md`](docs/STACK.md) | Tech stack, verified tool versions, tooling gotchas |
| [`docs/V2_ROADMAP.md`](docs/V2_ROADMAP.md) | The twelve extension points built into v1, and where the next version goes |
| [`CLAUDE.md`](CLAUDE.md) | Working notes and invariants for anyone (human or agent) touching the code |

## Layout

```
contracts/verdict-market/   Soroban contract (Rust)
packages/sdk/               Generated TS bindings + client helpers
apps/site/                  Next.js — project site, protocol docs, build status
apps/resolver-agent/        Example 8004 resolver agent (Node)
docs/                       Specification and planning
scripts/                    Deploy, seed and demo scripts
```

## Getting started

```bash
source "$HOME/.cargo/env"
make test          # unit tests
make build         # wasm32v1-none release build
make hash          # sha256 of the built wasm, for reproducible-build checks
make report        # runs both, writes apps/site/src/data/report.json
```

The site's `/status` page renders `report.json` — the same numbers `make report`
prints in the terminal, never hand-written. Regenerate it whenever the suite
changes so the published status stays honest.

```bash
pnpm --dir apps/site dev     # http://localhost:3000
```

`stellar` CLI is a prebuilt binary at `~/.local/bin/stellar` (v27.1.0) — building it
from source fails on Rust 1.98. See [`docs/STACK.md`](docs/STACK.md).

## 8004 registries

Verdict does not reimplement 8004. It calls the deployed
[trionlabs/stellar-8004](https://github.com/trionlabs/stellar-8004) contracts.

| Registry | Testnet | Mainnet |
|---|---|---|
| Identity | `CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH` | `CBGPDCJIHQ32G42BE7F2CIT3YW6XRN5ED6GQJHCRZSNAYH6TGMCL6X35` |
| Reputation | `CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55` | `CBOIAIMMWAXI57OATLX6BWVDQLCC4YU55HV6MZXFRP6CBSGAMXSTEPPA` |
| Validation | `CC5USZRO26MOIAVNYTTJDS63C2OBBLREOAOET4CPF2EZWO3YFKLMO3SL` | `CBT6WWEVEPT2UFGFGVJJ7ELYGLQAGRYSVGDTGMCJTRWXOH27MWUO7UJG` |

## Testnet deployment

| | |
|---|---|
| Market contract | `CD75VOBNOPZQJ2ZLV5CE2JTIQFE6BFBJK2KNLA26JPXEH223L3RSLHO5` |
| Demo token (VUSD SAC) | `CBEJPXHJ3G3YENGGTNEYC6WAQFM6Q5JKRUIKV4AJ25KBWOQ7J6CVLPHU` |

`make report` fetches the deployed wasm and hashes it against a fresh local
build; the site's `/status` page shows whether they match.

Reproduce a full lifecycle — three agents registering on the live 8004 registry,
disagreeing, being weighted, paid and slashed — with:

```bash
./scripts/demo.sh
```

## Honest limitations of v1

Stated here rather than buried:

- **Dispute resolution is centralised.** v1 ships a trusted backstop: if someone
  challenges a tally, the curator decides. v2 replaces that address with a staked
  arbitration contract. The hook is a single `Address` in config.
- **Market creation is curated.** Anyone can trade and any registered agent can
  resolve, but only the curator opens markets. Permissionless creation needs spam
  control that is not in this version.
- **Binary outcomes only.** The types are already `u32`; a runtime guard is the
  only thing gating multi-outcome markets.
- **Testnet only.** Mainnet needs an audit.

## License

MIT
