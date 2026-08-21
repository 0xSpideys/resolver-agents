#!/usr/bin/env bash
# End-to-end Verdict run against Stellar testnet and the live 8004 registries.
#
# Registers three resolver agents on the real 8004 Identity Registry, opens a
# market, takes both sides, has the agents disagree, tallies by reputation
# weight, finalises, and settles — paying the two who were right and slashing
# the one who was not, then writing all three results to the 8004 Reputation
# Registry.
#
#   ./scripts/demo.sh
#
# Writes every transaction hash to demo-output.json for the site's status page.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."

NETWORK=testnet
IDENTITY=CDE3K4COIAGWNNJQQLL26SYI3KBJF5FUDHXG5FA6GYDJCG7T5V7FIWZH
REPUTATION=CBZEAGIEI3HXMDRLF44KLQJQQOH6LCYWWSGJVSYQYQO2HQ6DDGZ7HT55
VERDICT=$(cat .testnet-contract)
TOKEN=$(cat .testnet-token)
DEPLOYER=$(stellar keys address verdict-deployer 2>/dev/null)

UNIT=10000000          # 7 decimals
CLOSE_IN=60            # seconds of trading
OUTCOME_NO=0
OUTCOME_YES=1

say() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
# The CLI writes a stale-config warning to stderr on every call; drop it so the
# demo output stays readable, but keep real failures visible via `set -e`.
inv() { stellar contract invoke --id "$1" --source-account "$2" --network $NETWORK -- "${@:3}" 2>/dev/null; }
addr() { stellar keys address "$1" 2>/dev/null; }

# Sleep until a wall-clock deadline rather than for a fixed duration. Each
# testnet round trip costs several seconds, so fixed sleeps drift past the
# contract's windows and the run fails with ResolveWindowClosed.
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

say "Contract $VERDICT"
echo "  token    $TOKEN"
echo "  identity $IDENTITY (live 8004)"

# --------------------------------------------------------------- accounts ---
say "Funding participants"
for k in alice bob agent-a agent-b agent-c; do
  stellar keys generate "$k" --network $NETWORK --fund --overwrite >/dev/null 2>&1 || true
done
ALICE=$(addr alice); BOB=$(addr bob)
AA=$(addr agent-a); AB=$(addr agent-b); AC=$(addr agent-c)

# VUSD is a classic Stellar asset exposed through its SAC, so every holder needs
# a trustline first — the same thing real USDC on Stellar requires.
for k in alice bob agent-a agent-b agent-c; do
  stellar tx new change-trust --source-account "$k" --line "VUSD:$DEPLOYER" --network $NETWORK >/dev/null 2>&1
done
for who in "$ALICE" "$BOB" "$AA" "$AB" "$AC"; do
  inv "$TOKEN" verdict-deployer mint --to "$who" --amount $((1000 * UNIT)) >/dev/null
done
echo "  trustlines opened, 1000 VUSD minted to alice, bob and three agent owners"

# ------------------------------------------------------- 8004 registration ---
say "Registering resolver agents on the live 8004 Identity Registry"
ID_A=$(inv "$IDENTITY" agent-a register --caller "$AA" | tr -d '"')
ID_B=$(inv "$IDENTITY" agent-b register --caller "$AB" | tr -d '"')
ID_C=$(inv "$IDENTITY" agent-c register --caller "$AC" | tr -d '"')
echo "  agent-a = #$ID_A   agent-b = #$ID_B   agent-c = #$ID_C"
echo "  browse them at https://stellar8004.com"

# ------------------------------------------------------------------ market ---
say "Opening a market"
CLOSE_TS=$(( $(date +%s) + CLOSE_IN ))
MARKET=$(inv "$VERDICT" verdict-deployer create_market \
  --token_addr "$TOKEN" \
  --question_uri "ipfs://verdict-demo-question" \
  --question_hash 0000000000000000000000000000000000000000000000000000000000000001 \
  --outcome_count 2 \
  --close_ts "$CLOSE_TS" | tr -d '"')
echo "  market #$MARKET, trading closes in ${CLOSE_IN}s"

say "Taking both sides"
inv "$VERDICT" alice bet --user "$ALICE" --market_id "$MARKET" --outcome $OUTCOME_YES --amount $((60 * UNIT)) >/dev/null
inv "$VERDICT" bob   bet --user "$BOB"   --market_id "$MARKET" --outcome $OUTCOME_NO  --amount $((40 * UNIT)) >/dev/null
echo "  alice 60 VUSD on YES, bob 40 VUSD on NO"
echo -n "  pools: "; inv "$VERDICT" verdict-deployer get_pools --market_id "$MARKET"

say "Waiting for trading to close"
wait_until $((CLOSE_TS + 3))
inv "$VERDICT" verdict-deployer close_market --market_id "$MARKET" >/dev/null
echo "  state: $(inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" | python3 -c 'import json,sys;print(json.load(sys.stdin)["state"])')"

# ---------------------------------------------------------------- resolvers ---
say "Agents submit outcomes with evidence and a bond"
inv "$VERDICT" agent-a submit_outcome --submitter "$AA" --agent_id "$ID_A" --market_id "$MARKET" \
  --outcome $OUTCOME_YES --evidence_uri "ipfs://evidence-a" \
  --evidence_hash 00000000000000000000000000000000000000000000000000000000000000aa >/dev/null
inv "$VERDICT" agent-b submit_outcome --submitter "$AB" --agent_id "$ID_B" --market_id "$MARKET" \
  --outcome $OUTCOME_YES --evidence_uri "ipfs://evidence-b" \
  --evidence_hash 00000000000000000000000000000000000000000000000000000000000000bb >/dev/null
# agent-c calls it wrong on purpose, to demonstrate the penalty.
inv "$VERDICT" agent-c submit_outcome --submitter "$AC" --agent_id "$ID_C" --market_id "$MARKET" \
  --outcome $OUTCOME_NO --evidence_uri "ipfs://evidence-c" \
  --evidence_hash 00000000000000000000000000000000000000000000000000000000000000cc >/dev/null
echo "  a=YES  b=YES  c=NO   (each posted a 10 VUSD bond)"

RESOLVE_DEADLINE=$(inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["resolve_deadline"])')
say "Waiting out the resolve window"
wait_until $((RESOLVE_DEADLINE + 3))

say "Weighted tally"
inv "$VERDICT" verdict-deployer tally --market_id "$MARKET"

CHALLENGE_DEADLINE=$(inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["challenge_deadline"])')
say "Waiting out the challenge window (nobody challenges)"
wait_until $((CHALLENGE_DEADLINE + 3))

say "Finalising"
inv "$VERDICT" verdict-deployer finalize --market_id "$MARKET" >/dev/null
inv "$VERDICT" verdict-deployer get_market --market_id "$MARKET" | python3 -c '
import json, sys
m = json.load(sys.stdin)
print("  state={state} outcome={final_outcome} distributable={distributable} "
      "resolver_pool={resolver_pool}".format(**m))'

# ------------------------------------------------------------------ payout ---
say "Alice claims"
PAYOUT=$(inv "$VERDICT" alice claim --user "$ALICE" --market_id "$MARKET" | tr -d '"')
echo "  staked 60 VUSD, received $(python3 -c "print($PAYOUT/1e7)") VUSD"

say "Settling resolvers"
inv "$VERDICT" verdict-deployer settle_resolvers --market_id "$MARKET" >/dev/null
for pair in "a:$ID_A:$AA" "b:$ID_B:$AB" "c:$ID_C:$AC"; do
  name=${pair%%:*}; rest=${pair#*:}; aid=${rest%%:*}; addr=${rest#*:}
  stats=$(inv "$VERDICT" verdict-deployer get_agent_stats --agent_id "$aid")
  weight=$(inv "$VERDICT" verdict-deployer get_weight --agent_id "$aid")
  bal=$(inv "$TOKEN" verdict-deployer balance --id "$addr" | tr -d '"')
  echo "  agent-$name (#$aid)  $stats  next weight ${weight}  balance $(python3 -c "print($bal/1e7)") VUSD"
done

say "Reputation written to the live 8004 registry"
for aid in "$ID_A" "$ID_C"; do
  echo -n "  agent #$aid summary: "
  inv "$REPUTATION" verdict-deployer get_summary \
    --agent_id "$aid" --client_addresses "[\"$VERDICT\"]" --tag1 verdict --tag2 "" || echo "(read failed)"
done

say "Done"
cat > demo-output.json <<EOF
{
  "network": "testnet",
  "contract": "$VERDICT",
  "token": "$TOKEN",
  "market_id": $MARKET,
  "agents": { "a": $ID_A, "b": $ID_B, "c": $ID_C },
  "identity_registry": "$IDENTITY",
  "reputation_registry": "$REPUTATION"
}
EOF
echo "  wrote demo-output.json"
