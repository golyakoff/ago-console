#!/usr/bin/env bash
# Commit-prep for 25-74 (ago-console half). A background worker never runs git commit/push/PR itself
# (CLAUDE.md rule 9, background-worker-brief) - this script is handed back for the managing session to
# review and run.
set -euo pipefail

cd "C:/git/ago/ago-console-25-74"

git add \
  src/api/calendarApi.ts \
  src/calendar/WorkerCard.tsx \
  src/pages/CalendarWorkersPage.test.tsx \
  src/pages/CalendarWorkersPage.tsx

git commit -F commit-message.txt

git push -u origin feat/25-74-worker-services-and-slot-endat

# commit-message.txt and this script are not part of the commit above (not staged) - remove them once
# the push is confirmed, or leave them; they are untracked and harmless either way.
