# resolver-agent

An autonomous resolver for Verdict markets. It mints its own 8004 identity,
watches for markets that have closed to trading, reads a public data source,
writes an evidence document, and submits an outcome with a bond.

Deliberately outside the contract. Anyone can run one, and nothing about it is
privileged — the contract only checks that the caller owns the 8004 agent id it
is submitting for.

## Setup

```bash
pnpm install
export AGENT_SECRET_KEY=S...      # a funded testnet key (bonds are paid in the market's token)
pnpm register "My Resolver"       # mints an 8004 identity, prints the agent id
export AGENT_ID=<id>
pnpm resolve                      # resolve everything resolvable, once
```

| Variable | Default | |
|---|---|---|
| `AGENT_SECRET_KEY` | — | required |
| `AGENT_ID` | — | required for everything except `register` |
| `RESOLUTION_SOURCE` | `reflector` | `reflector`, `open-meteo`, `research`, `contrarian` |
| `OPENROUTER_API_KEY` | — | `research` source only |
| `OPENROUTER_MODEL` | `google/gemini-3.7-flash` | any OpenRouter model with structured outputs |
| `OPENROUTER_TIMEOUT_MS` | `70000` | per attempt; must leave room inside the resolve window |
| `OPENROUTER_ATTEMPTS` | `2` | transient failures only; a 4xx never retries |
| `VERDICT_CONTRACT` | current testnet deployment | |
| `RPC_URL` | `soroban-testnet.stellar.org` | |
| `POLL_INTERVAL` | `15` | seconds, `watch` mode only |

Values may also live in a `.env` at the repository root — copy `.env.example`.
A real environment variable always wins over the file. Never commit `.env`; see
[`docs/ISOLATION.md`](../../docs/ISOLATION.md).

## Commands

| | |
|---|---|
| `register [name] [desc]` | Mint an 8004 identity for this key |
| `status` | Identity, current weight, record, and what is resolvable now |
| `resolve` | Resolve everything resolvable, once, then exit |
| `watch` | Poll and resolve until stopped |
| `verify <market> <agent>` | Decode a submitted evidence document and re-check its hash |

## Evidence

Every submission carries a document and its sha256. The document is embedded in
the `evidence_uri` as a base64 `data:` URI rather than hosted, so it cannot rot
behind a dead link or be quietly edited after the fact — the hash on-chain
commits to bytes anyone can decode straight out of the contract.

The hash is taken over **canonical JSON**: keys sorted at every level, no
incidental whitespace. Without that, two agents observing identical facts could
commit to different hashes, and a verifier re-serialising the document would
compute a third.

```bash
pnpm exec tsx src/cli.ts verify 3 21
```

```
market     #3
agent      #21
outcome    YES
weight     1.00x
hash       75ba69a6dbe03fb8fe1217ea1aa0c6811dea6e3bc2ec4d27c2afac4dbcf9f124
verified   true

--- evidence ---
{
  "agent": 21,
  "market": "3",
  "observed": { "latestLedger": 4300063, "threshold": 4295051, "closedAt": "…" },
  "outcome": 1,
  "reasoning": "Latest closed ledger is 4300063; the question asks whether the
                network passed 4295051. It did, so the outcome is YES.",
  "source": "stellar-ledger",
  "sources": ["https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1"]
}
```

## Sources

A source is the part that actually decides. It reads the market's question,
observes the world, and returns an outcome plus the reasoning and raw
observation that go into the evidence.

| id | |
|---|---|
| `stellar-ledger` | Reads the latest closed ledger from Horizon and compares it against the threshold carried in the question URI. |
| `contrarian` | **Demo only.** Runs a real source, then reports the opposite, so the slashing path can be shown with a real process instead of a hand-typed transaction. Its own evidence document says it inverted. |

`stellar-ledger` resolves a deliberately boring question — has the network
passed ledger N — and that is the point. It is checkable by anyone against a
public endpoint, with no API key, no rate limit and no argument about what the
right answer was. A flaky source would make a resolution demo prove nothing.

Adding a source is one file implementing `ResolutionSource`. The interesting
work in a real deployment is here, not in the plumbing around it.

## What this is not

The agent has no special standing. It cannot create markets, tally, or finalise;
it can only submit an outcome for an identity it owns and take the reward or the
slash that follows. Running one badly costs the bond, which is the entire
mechanism.
