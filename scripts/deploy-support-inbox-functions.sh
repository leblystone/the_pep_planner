#!/usr/bin/env bash
# Deploy support-inbox Cloud Functions to tpp-splendide.
# Requires FIREBASE_TOKEN (from `firebase login:ci`).
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT="${FIREBASE_PROJECT:-tpp-splendide}"
if [[ -z "${FIREBASE_TOKEN:-}" ]]; then
  echo "ERROR: FIREBASE_TOKEN is not set."
  echo "Run locally: firebase login:ci"
  echo "Then add the token as the FIREBASE_TOKEN cloud-agent secret and re-run."
  exit 1
fi

ONLY=(
  "functions:createSupportTicket"
  "functions:reopenTicket"
  "functions:addTicketToWorkQueue"
  "functions:submitFeedback"
  "functions:dailySupportInboxBacklogScan"
  "functions:runSupportInboxBacklogScanNow"
)
ONLY_JOINED=$(IFS=,; echo "${ONLY[*]}")

echo "→ Installing functions deps (if needed)..."
(cd functions && if [[ ! -d node_modules/firebase-functions ]]; then npm ci --omit=dev; fi)

echo "→ Deploying to ${PROJECT}: ${ONLY_JOINED}"
npx --yes firebase-tools@13 deploy \
  --only "${ONLY_JOINED}" \
  --project "${PROJECT}" \
  --force \
  --non-interactive

echo "→ Verifying deployed function list (filtered)..."
npx --yes firebase-tools@13 functions:list --project "${PROJECT}" --non-interactive \
  | rg -i 'createSupportTicket|reopenTicket|addTicketToWorkQueue|dailySupportInboxBacklogScan|runSupportInboxBacklogScanNow' || true

echo "✓ Deploy script finished."
