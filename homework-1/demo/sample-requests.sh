#!/usr/bin/env bash
# Runs sample curl requests against a running API (start it with ./demo/run.sh).
# Usage: ./demo/sample-requests.sh             run the full walkthrough
#        ./demo/sample-requests.sh rate-limit  send 105 requests to trigger HTTP 429
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

step() { printf '\n\033[1;36m== %s\033[0m\n' "$1"; }
call() {
  echo "\$ curl $*"
  curl -s -w '\n[HTTP %{http_code}]\n' "$@"
}

if [ "${1:-}" = "rate-limit" ]; then
  step "Option D: 105 requests in a row (limit is 100/minute)"
  for i in $(seq 1 105); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/health")
    [ "$i" -ge 99 ] && echo "request $i -> HTTP $code"
  done
  call -i "$BASE_URL/health"
  exit 0
fi

step "Task 1: create a transfer"
call -X POST "$BASE_URL/transactions" -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-12345","toAccount":"ACC-67890","amount":100.50,"currency":"USD","type":"transfer"}'

step "Task 1: create a deposit"
call -X POST "$BASE_URL/transactions" -H 'Content-Type: application/json' \
  -d '{"toAccount":"ACC-12345","amount":250,"currency":"USD","type":"deposit"}'

step "Task 1: withdrawal exceeding the balance (stored as failed)"
call -X POST "$BASE_URL/transactions" -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-67890","amount":999999,"currency":"USD","type":"withdrawal"}'

step "Task 1: list all transactions"
call "$BASE_URL/transactions"

step "Task 1: unknown transaction id (404)"
call "$BASE_URL/transactions/does-not-exist"

step "Task 1: account balance"
call "$BASE_URL/accounts/ACC-12345/balance"

step "Task 2: validation errors (400)"
call -X POST "$BASE_URL/transactions" -H 'Content-Type: application/json' \
  -d '{"fromAccount":"ACC-1","toAccount":"ACC-67890","amount":-10.555,"currency":"XYZ","type":"transfer"}'

step "Task 3: filter by account"
call "$BASE_URL/transactions?accountId=ACC-67890"

step "Task 3: combined filters"
call "$BASE_URL/transactions?accountId=ACC-12345&type=deposit&from=2024-01-01&to=2024-01-31"

step "Option A: account summary"
call "$BASE_URL/accounts/ACC-12345/summary"

step "Option B: simple interest"
call "$BASE_URL/accounts/ACC-12345/interest?rate=0.05&days=30"

step "Option C: CSV export"
call "$BASE_URL/transactions/export?format=csv&accountId=ACC-12345"
