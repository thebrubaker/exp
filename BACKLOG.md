# Backlog

## Stale fork cleanup: filtering and bulk delete

Color-coded status dots are shipped (green/yellow/red in `exp ls`). Remaining work:

- `exp ls --stale <days>` or `exp ls --older-than 7d` to filter old forks
- `exp trash --stale 7d` to bulk-delete forks older than N days with no pending changes
- For forks with pending changes, show a preview of what would be lost before confirming deletion
