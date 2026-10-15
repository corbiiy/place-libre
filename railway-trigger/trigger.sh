#!/bin/sh
# Run by a Railway cron job (schedules are in UTC). Starts the GitHub Pages deploy,
# which re-fetches the Pathé programme, but only between 07:00 and 01:00 Paris time.
# GITHUB_TOKEN: fine-grained token with "Actions: read and write" on corbiiy/place-libre.
set -eu

hour=$(TZ=Europe/Paris date +%H)
hour=${hour#0}
if [ "$hour" -ge 1 ] && [ "$hour" -lt 7 ]; then
  echo "Skipped: ${hour}h in Paris, outside 07:00-01:00"
  exit 0
fi

curl -fsS -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${GITHUB_TOKEN:?GITHUB_TOKEN is not set}" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  -d '{"ref":"main"}' \
  https://api.github.com/repos/corbiiy/place-libre/actions/workflows/pages.yml/dispatches
echo "Place Libre refresh started (${hour}h in Paris)"
