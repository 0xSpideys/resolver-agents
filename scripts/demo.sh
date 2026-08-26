#!/usr/bin/env bash
# Set up, or drive, the demo.
#
#   ./scripts/demo.sh open     open one market of each kind and take both sides
#   ./scripts/demo.sh answer   let every agent answer whatever it can
#   ./scripts/demo.sh advance  push every market as far as the clock allows
#   ./scripts/demo.sh status   what is on chain right now
#   ./scripts/demo.sh full     open, wait, answer, wait, settle. ~10 minutes.
#
# Nothing here is privileged except opening a market. Answering, closing,
# tallying and finalising are calls anyone can make, and the site exposes them
# as buttons — this script is a convenience, not a control plane.
set -euo pipefail

export PATH="$HOME/.local/bin:$PATH"
cd "$(dirname "$0")/.."

: "${CURATOR_SECRET_KEY:=$(stellar keys show verdict-deployer 2>/dev/null || true)}"
export CURATOR_SECRET_KEY
if [ -z "$CURATOR_SECRET_KEY" ]; then
  echo "CURATOR_SECRET_KEY is not set and verdict-deployer is not in the keystore." >&2
  exit 1
fi

TRADING=${TRADING:-120}

# key-name : 8004 agent id : source
AGENTS=(
  "bot-honest:21:auto"
  "bot-honest2:22:auto"
  "bot-liar:23:contrarian"
)

say() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
curator() { pnpm --filter curator -s cli "$@"; }
addr() { stellar keys address "$1" 2>/dev/null; }
secret() { stellar keys show "$1" 2>/dev/null; }
inv() { stellar contract invoke --id "$1" --source-account "$2" --network testnet -- "${@:3}" 2>/dev/null; }

VERDICT=$(cat .testnet-contract)
TOKEN=$(cat .testnet-token)
UNIT=10000000

wait_for() {
  # Assigned separately: under `set -u` a single `local` line evaluates every
  # right-hand side before binding any of them, so the arithmetic would read an
  # unset `secs`.
  local secs=$1
  local label=$2
  local end=$(( $(date +%s) + secs ))
  while [ "$(date +%s)" -lt "$end" ]; do
    printf '\r  %s: %ds ' "$label" $(( end - $(date +%s) ))
    sleep 5
  done
  printf '\r%*s\r' 40 ''
}

# The market's own question decides which source can answer it, so each agent is
# pointed at the right one rather than guessing. `auto` reads it off the chain.
source_for_market() {
  inv "$VERDICT" verdict-deployer get_market --market_id "$1" \
    | python3 -c '
import base64, json, sys
m = json.load(sys.stdin)
uri = m["question_uri"]
try:
    doc = json.loads(base64.b64decode(uri.split("base64,", 1)[1]))
    print(doc["resolution"]["kind"])
except Exception:
    print("")'
}

open_markets() {
  say "Opening one market of each kind"
  for preset in xlm-price istanbul-weather; do
    curator open "$preset" --trading "$TRADING" | sed -n 's/^market      /  /p;s/^question    /    /p'
  done

  say "Taking both sides"
  local count first
  count=$(inv "$VERDICT" verdict-deployer market_count | tr -d '"')
  first=$(( count - 2 ))
  for m in $(seq "$first" $(( count - 1 ))); do
    inv "$VERDICT" alice bet --user "$(addr alice)" --market_id "$m" --outcome 1 --amount $(( 60 * UNIT )) >/dev/null
    inv "$VERDICT" bob   bet --user "$(addr bob)"   --market_id "$m" --outcome 0 --amount $(( 40 * UNIT )) >/dev/null
    echo "  market #$m: 60 on YES, 40 on NO"
  done
}

answer_all() {
  say "Agents answer"
  local count
  count=$(inv "$VERDICT" verdict-deployer market_count | tr -d '"')

  # Markets outside, agents inside. A source only answers the question kind it
  # was built for, so the market has to pick the source, not the other way
  # round — the reverse leaves every agent pinned to whichever market it
  # happened to see first.
  for m in $(seq 0 $(( count - 1 ))); do
    local state kind
    state=$(inv "$VERDICT" verdict-deployer get_market --market_id "$m" \
      | python3 -c 'import json,sys;print(json.load(sys.stdin)["state"])' 2>/dev/null || echo "")
    [ "$state" = "Resolving" ] || continue

    kind=$(source_for_market "$m")
    [ -n "$kind" ] || continue
    echo "  market #$m ($kind)"

    for spec in "${AGENTS[@]}"; do
      local key=${spec%%:*} rest=${spec#*:} aid src use
      aid=${rest%%:*}; src=${rest#*:}
      use=$src
      [ "$src" = "auto" ] && use=$kind

      ( cd apps/resolver-agent \
        && AGENT_SECRET_KEY="$(secret "$key")" AGENT_ID="$aid" RESOLUTION_SOURCE="$use" \
           pnpm -s exec tsx src/cli.ts resolve ) 2>&1 \
        | grep -E "market #$m" | sed 's/^/    /' || true
    done
  done
}

advance_all() {
  say "Advancing every market"
  local count
  count=$(inv "$VERDICT" verdict-deployer market_count | tr -d '"')
  for m in $(seq 0 $(( count - 1 ))); do
    curator advance "$m" 2>/dev/null | sed "s/^/  #$m /" || true
  done
}

status_all() {
  say "On chain"
  local count
  count=$(inv "$VERDICT" verdict-deployer market_count | tr -d '"')
  for m in $(seq 0 $(( count - 1 ))); do
    inv "$VERDICT" verdict-deployer get_market --market_id "$m" | python3 -c '
import base64, json, sys
m = json.load(sys.stdin)
title = "(question does not verify)"
try:
    doc = json.loads(base64.b64decode(m["question_uri"].split("base64,", 1)[1]))
    title = doc["title"]
except Exception:
    pass
print("  #{:<3} {:<12} {}".format(m["id"], m["state"], title[:64]))' 2>/dev/null || true
  done
}

case "${1:-status}" in
  open) open_markets ;;
  answer) answer_all ;;
  advance) advance_all ;;
  status) status_all ;;
  full)
    open_markets
    wait_for $(( TRADING + 10 )) "trading closes in"
    advance_all
    answer_all
    say "Waiting for the resolve window"
    wait_for 310 "answers due in"
    advance_all
    say "Waiting for the challenge window"
    wait_for 130 "challenge ends in"
    advance_all
    advance_all
    status_all
    ;;
  *)
    sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
