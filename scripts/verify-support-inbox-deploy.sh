#!/usr/bin/env bash
# Verify support-inbox functions are live on tpp-splendide.
set -euo pipefail
PROJECT="${FIREBASE_PROJECT:-tpp-splendide}"
BASE="https://us-central1-${PROJECT}.cloudfunctions.net"
need_non_404=(
  createSupportTicket
  reopenTicket
  addTicketToWorkQueue
  submitFeedback
  runSupportInboxBacklogScanNow
)
fail=0
for name in "${need_non_404[@]}"; do
  code=$(curl -s -o /tmp/v-"$name".txt -w '%{http_code}' -X POST "$BASE/$name" \
    -H 'Content-Type: application/json' -d '{"data":{}}')
  if [[ "$code" == "404" ]]; then
    echo "FAIL $name HTTP 404 (not deployed)"
    fail=1
  else
    echo "OK   $name HTTP $code"
  fi
done
# Scheduled function has no HTTP endpoint; confirm via firebase CLI when authed
if [[ -n "${FIREBASE_TOKEN:-}" ]] || [[ -f "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]] || [[ -f "$HOME/.config/gcloud/application_default_credentials.json" ]]; then
  echo "→ Listing scheduled function via CLI..."
  (cd "$(dirname "$0")/.." && ./node_modules/.bin/firebase functions:list --project "$PROJECT" --non-interactive 2>/dev/null \
    | rg -i 'dailySupportInboxBacklogScan|runSupportInboxBacklogScanNow' || true)
fi
exit $fail
