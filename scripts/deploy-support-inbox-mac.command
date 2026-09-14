#!/bin/bash
# Double-click this file on the Mac mini (or: open scripts/deploy-support-inbox-mac.command)
# Deploys support-inbox Cloud Functions to tpp-splendide using your local Firebase login.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=============================================="
echo " Support Inbox — Firebase function deploy"
echo " Project: tpp-splendide"
echo " Branch:  cursor/fix-admin-support-inbox-queue-bc18"
echo "=============================================="
echo

git fetch origin
git checkout cursor/fix-admin-support-inbox-queue-bc18
git pull --ff-only origin cursor/fix-admin-support-inbox-queue-bc18

npm run deploy:support-inbox

echo
echo "✓ Done. If verify passed, reply 'deployed' in the Cursor agent chat."
read -r -p "Press Enter to close…"
