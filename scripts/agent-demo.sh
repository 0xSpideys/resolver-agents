#!/usr/bin/env bash
# Agent-driven end-to-end run on Stellar testnet.
#
# Unlike scripts/demo.sh, which drives every call from the CLI, this one only
# opens a market and lets three independently-running agent processes decide the
# outcome for themselves. Each reads public Stellar ledger data, forms its own
# conclusion, builds an evidence document, hashes it and submits with a bond.
#
# Two agents report what they observed. The third runs the `contrarian` source,
# which deliberately inverts a real reading so the slashing path can be shown
# with a real process rather than a hand-typed transaction.
#
#   ./scripts/agent-demo.sh
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."

NETWORK=testnet
VERDICT=$(cat .testnet-contract)
TOKEN=$(cat .testnet-token)
AGENT_DIR=apps/resolver-agent

# key-name:agent-id:source
AGENTS=(
  "bot-honest:21:stellar-ledger"
  "bot-honest2:22:stellar-ledger"
  "bot-liar:23:contrarian"
)

UNIT=10000000
TRADING_SECONDS=45

say() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
inv() { stellar contract invoke --id "$1" --source-account "$2" --network $NETWORK -- "${@:3}" 2>/dev/null; }
addr() { stellar keys address "$1" 2>/dev/null; }
secret() { stellar keys show "$1" 2>/dev/null; }

wait_until() {
  local target=$1 now
  while :; do
    now=$(date +%s)
    (( now >= target )) && break
    printf '\r  %ds remaining… ' $((target - now))
    sleep 5
  done
  printf '\r                    \r'
}

field() { python3 -c "import json,sys;print(json.load(sys.stdin)[\"$1\"])"; }

# The question carries its own threshold, so the agents read what to check
# rather than having the answer wired into them. Anchoring it below the current
# ledger makes the honest answer YES and keeps the run deterministic.
LEDGER=$(curl -s "https://horizon-testnet.stellar.org/ledgers?order=desc&limit=1" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["_embedded"]["records"][0]["sequence"])')
THRESHOLD=$((LEDGER - 5000))
QUESTION="ipfs://verdict-demo/ledger-threshold#ledger=${THRESHOLD}"

say "Opening a market the agents can actually check"
echo "  current testnet ledger $LEDGER"
echo "  question: has the network passed ledger $THRESHOLD?"

CLOSE_TS=$(( $(date +%s) + TRADING_SECONDS ))
MARKET=$(inv "$VERDICT" verdict-deployer create_market \
  --token_addr "$TOKEN" --question_uri "$QUESTION" \
  --question_hash 0000000000000000000000000000000000000000000000000000000000000003 \
  --outcome_count 2 --close_ts "$CLOSE_TS" | tr -d '"')
echo "  market #$MARKET"

say "Taking both sides"
ALICE=$(addr alice); BOB=$(addr bob)
inv "$VERDICT" alice bet --user "$ALICE" --market_id "$MARKET" --outcome 1 --amount $((60 * UNIT)) >/dev/null
inv "$VERDICT" bob   bet --user "$BOB"   --market_id "$MARKET" --outcome 0 --amount $((40 * UNIT)) >/dev/null
echo "  alice 60 VUSD on YES, bob 40 VUSD on NO"

say "Waiting for trading to close"
wait_until $((CLOSE_TS + 3))
inv "$VERDICT" verdict-deployer close_market --market_id "$MARKET" >/dev/null
echo "  state: $(inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" | field state)"

say "Agents resolve on their own"
for spec in "${AGENTS[@]}"; do
  key=${spec%%:*}; rest=${spec#*:}; aid=${rest%%:*}; src=${rest#*:}
  echo "  agent #$aid ($src)"
  ( cd "$AGENT_DIR" && AGENT_SECRET_KEY="$(secret "$key")" AGENT_ID="$aid" \
      RESOLUTION_SOURCE="$src" VERDICT_CONTRACT="$VERDICT" pnpm -s resolve ) 2>&1 | sed 's/^/  /'
done

RESOLVE_DEADLINE=$(inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" | field resolve_deadline)
say "Waiting out the resolve window"
wait_until $((RESOLVE_DEADLINE + 3))

say "Weighted tally"
inv "$VERDICT" verdict-deployer tally --market_id "$MARKET"

CHALLENGE_DEADLINE=$(inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" | field challenge_deadline)
say "Waiting out the challenge window"
wait_until $((CHALLENGE_DEADLINE + 3))

say "Finalising and settling"
inv "$VERDICT" verdict-deployer finalize --market_id "$MARKET" >/dev/null
PAYOUT=$(inv "$VERDICT" alice claim --user "$ALICE" --market_id "$MARKET" | tr -d '"')
echo "  alice staked 60 VUSD, received $(python3 -c "print($PAYOUT/1e7)") VUSD"
inv "$VERDICT" verdict-deployer settle_resolvers --market_id "$MARKET" >/dev/null

say "Where the agents ended up"
for spec in "${AGENTS[@]}"; do
  key=${spec%%:*}; rest=${spec#*:}; aid=${rest%%:*}
  stats=$(inv "$VERDICT" verdict-deployer get_agent_stats --agent_id "$aid")
  weight=$(inv "$VERDICT" verdict-deployer get_weight --agent_id "$aid")
  bal=$(inv "$TOKEN" verdict-deployer balance --id "$(addr "$key")" | tr -d '"')
  echo "  #$aid  $stats  next weight $weight  balance $(python3 -c "print($bal/1e7)") VUSD"
done

say "Done — market #$MARKET"
