#!/usr/bin/env bash
# Feed a gcloud ADC verification code into the waiting tmux session, then deploy.
set -euo pipefail
cd "$(dirname "$0")/.."
CODE="${1:-}"
if [[ -z "$CODE" ]]; then
  echo "Usage: $0 <gcloud-verification-code>"
  exit 1
fi
SESSION="gcloud-adc-login"
TMUX="tmux -f /exec-daemon/tmux.portal.conf"
if ! $TMUX has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: no waiting gcloud ADC session"
  exit 1
fi
echo "→ Sending verification code..."
$TMUX send-keys -t "$SESSION:0.0" C-u
$TMUX send-keys -t "$SESSION:0.0" "$CODE" Enter
echo "→ Waiting for ADC credentials..."
for i in $(seq 1 60); do
  sleep 2
  PANE=$($TMUX capture-pane -t "$SESSION:0.0" -p -S -80 || true)
  if printf '%s\n' "$PANE" | rg -qi 'Credentials saved to file|application.default.credentials|ADC'; then
    echo "→ ADC ready"
    break
  fi
  if printf '%s\n' "$PANE" | rg -qi 'ERROR|invalid|expired|denied'; then
    echo "$PANE" | tail -30
    exit 1
  fi
  if [[ -f "$HOME/.config/gcloud/application_default_credentials.json" ]]; then
    echo "→ ADC file present"
    break
  fi
done
export PATH="$HOME/google-cloud-sdk-install/google-cloud-sdk/bin:${PATH}"
export GOOGLE_APPLICATION_CREDENTIALS="${GOOGLE_APPLICATION_CREDENTIALS:-$HOME/.config/gcloud/application_default_credentials.json}"
PROJECT="${FIREBASE_PROJECT:-tpp-splendide}"
ONLY="functions:createSupportTicket,functions:reopenTicket,functions:addTicketToWorkQueue,functions:submitFeedback,functions:dailySupportInboxBacklogScan,functions:runSupportInboxBacklogScanNow"
(cd functions && if [[ ! -d node_modules/firebase-functions ]]; then npm ci --omit=dev; fi)
echo "→ Deploying to ${PROJECT}..."
./node_modules/.bin/firebase deploy --only "$ONLY" --project "$PROJECT" --force --non-interactive
echo "→ Verifying..."
./node_modules/.bin/firebase functions:list --project "$PROJECT" --non-interactive \
  | rg -i 'createSupportTicket|reopenTicket|addTicketToWorkQueue|submitFeedback|dailySupportInboxBacklogScan|runSupportInboxBacklogScanNow' || true
echo "✓ Done."
