#!/usr/bin/env bash
# Run this on your LAPTOP (where you're already logged into Firebase), not in Cloud Agent.
# Deploys the support-inbox queue fix + daily backlog scan functions.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${FIREBASE_PROJECT:-tpp-splendide}"
ONLY="functions:createSupportTicket,functions:reopenTicket,functions:addTicketToWorkQueue,functions:submitFeedback,functions:dailySupportInboxBacklogScan,functions:runSupportInboxBacklogScanNow"

echo "Project: $PROJECT"
echo "Functions: $ONLY"
echo

if command -v firebase >/dev/null 2>&1; then
  FB=(firebase)
elif [[ -x ./node_modules/.bin/firebase ]]; then
  FB=(./node_modules/.bin/firebase)
else
  FB=(npx --yes firebase-tools@13)
fi

echo "Using: ${FB[*]}"
(cd functions && npm ci --omit=dev)
"${FB[@]}" deploy --only "$ONLY" --project "$PROJECT" --force
echo
"${FB[@]}" functions:list --project "$PROJECT" | grep -Ei 'createSupportTicket|reopenTicket|addTicketToWorkQueue|submitFeedback|dailySupportInboxBacklogScan|runSupportInboxBacklogScanNow' || true
echo
echo "→ Verifying production HTTP endpoints..."
./scripts/verify-support-inbox-deploy.sh
echo "✓ Deploy finished and verified."
