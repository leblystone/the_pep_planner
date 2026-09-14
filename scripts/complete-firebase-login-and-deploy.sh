#!/usr/bin/env bash
# Feed an authorization code into the waiting firebase login:ci tmux session,
# capture the CI token, then deploy support-inbox functions.
set -euo pipefail
cd "$(dirname "$0")/.."

CODE="${1:-}"
if [[ -z "$CODE" ]]; then
  echo "Usage: $0 <firebase-authorization-code>"
  exit 1
fi

SESSION="firebase-login-ci"
if ! tmux -f /exec-daemon/tmux.portal.conf has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: no waiting login session. Start login:ci first."
  exit 1
fi

echo "→ Sending authorization code to login session..."
# Clear any partial input, type code, hit enter
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION:0.0" C-u
tmux -f /exec-daemon/tmux.portal.conf send-keys -t "$SESSION:0.0" "$CODE" Enter

echo "→ Waiting for login to finish..."
TOKEN=""
for i in $(seq 1 60); do
  sleep 2
  PANE=$(tmux -f /exec-daemon/tmux.portal.conf capture-pane -t "$SESSION:0.0" -p -S -100 2>/dev/null || true)
  # login:ci prints a long token on success
  CAND=$(printf '%s\n' "$PANE" | rg -o '1//[A-Za-z0-9_-]+' | tail -1 || true)
  if [[ -n "$CAND" ]]; then
    TOKEN="$CAND"
    break
  fi
  if printf '%s\n' "$PANE" | rg -qi 'Error:|invalid|expired|failed'; then
    echo "Login appears to have failed:"
    printf '%s\n' "$PANE" | tail -20
    exit 1
  fi
  # Also accept tokens stored in configstore after interactive success
  if node -e "const j=require(require('os').homedir()+'/.config/configstore/firebase-tools.json'); if(!(j.tokens&&j.tokens.refresh_token)) process.exit(1);" 2>/dev/null; then
    echo "→ Firebase CLI configstore now has credentials"
    break
  fi
done

if [[ -n "$TOKEN" ]]; then
  export FIREBASE_TOKEN="$TOKEN"
  echo "→ Captured CI token (${#TOKEN} chars)"
fi

PROJECT="${FIREBASE_PROJECT:-tpp-splendide}"
ONLY="functions:createSupportTicket,functions:reopenTicket,functions:addTicketToWorkQueue,functions:submitFeedback,functions:dailySupportInboxBacklogScan,functions:runSupportInboxBacklogScanNow"

echo "→ Deploying to ${PROJECT}..."
if [[ -n "${FIREBASE_TOKEN:-}" ]]; then
  ./node_modules/.bin/firebase deploy --only "$ONLY" --project "$PROJECT" --force --non-interactive --token "$FIREBASE_TOKEN"
else
  ./node_modules/.bin/firebase deploy --only "$ONLY" --project "$PROJECT" --force --non-interactive
fi

echo "→ Listing deployed functions..."
./node_modules/.bin/firebase functions:list --project "$PROJECT" --non-interactive ${FIREBASE_TOKEN:+--token "$FIREBASE_TOKEN"} \
  | rg -i 'createSupportTicket|reopenTicket|addTicketToWorkQueue|submitFeedback|dailySupportInboxBacklogScan|runSupportInboxBacklogScanNow' || true

echo "✓ Done."
