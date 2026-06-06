#!/bin/bash
# Run this on the server after manually changing .env (e.g. new API key, new secret).
# Not needed after a regular git push deploy — that restarts pm2 automatically.

set -e
cd ~/nuggets.jomaar.de

echo "Loading .env..."
set -a; source .env; set +a

echo "Restarting pm2 with updated environment..."
pm2 restart nuggets --update-env
pm2 save

echo ""
echo "--- Active environment (sensitive values truncated) ---"
pm2 env 0 | grep -E "ANTHROPIC_API_KEY|DATABASE_URL|SESSION_SECRET|ADMIN_PASSWORD" \
  | sed 's/=.*/=***/'
echo ""
pm2 status
