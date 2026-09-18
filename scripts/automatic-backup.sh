#!/bin/sh
set -eu
umask 077
interval=${BACKUP_INTERVAL_SECONDS:-86400}
keep=${BACKUP_KEEP:-14}
case "$interval:$keep" in *[!0-9:]*|:*|*:) echo "Invalid backup settings" >&2; exit 1;; esac
[ "$interval" -ge 60 ] && [ "$keep" -ge 1 ] || exit 1
mkdir -p /backups
backup_once() (
  set -eu
  name="/backups/ds_legacy_auto_$(date -u +%Y-%m-%d_%H-%M-%S).backup"
  partial="$name.partial"
  trap 'rm -f "$partial"' EXIT
  pg_dump --format=custom --file="$partial"
  pg_restore --list "$partial" > /dev/null
  mv "$partial" "$name"
  date +%s > /backups/last-success
  echo "Backup completed: $name"
  # Only prune this service's completed archives, after a successful backup.
  count=0
  for file in $(find /backups -maxdepth 1 -type f -name 'ds_legacy_auto_????-??-??_??-??-??.backup' | sort -r); do
    count=$((count + 1))
    if [ "$count" -gt "$keep" ]; then rm -f "$file"; fi
  done
)
while :; do
  # Invoke as a separate shell so errexit remains active inside backup_once.
  if [ "${1:-}" = "--once" ]; then
    backup_once
    exit 0
  fi
  if /bin/sh "$0" --once; then
    sleep "$interval" & wait $!
  else
    echo "Backup failed; retrying in 60 seconds" >&2
    sleep 60 & wait $!
  fi
done
