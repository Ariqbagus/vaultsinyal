#!/bin/sh
# Cron-friendly agent run: loads .env, runs one check cycle, regenerates the
# dashboard. Example crontab (every 15 minutes):
#   */15 * * * * cd /path/to/vaultsinyal && ./scripts/run-agent.sh >> data/agent.log 2>&1
set -eu
cd "$(dirname "$0")/.."
if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi
npx tsx src/agent.ts examples/rules.json
npx tsx src/dashboard.ts
