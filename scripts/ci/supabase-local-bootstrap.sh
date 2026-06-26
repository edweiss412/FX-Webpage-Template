#!/usr/bin/env bash
# Shared local-Supabase bootstrap for CI (M12.12 Task 14).
#
# Extracted VERBATIM from the inline "Start Supabase (supply cron-schedule
# GUC; local-only placeholder)" step previously duplicated by
# .github/workflows/screenshots-drift.yml and screenshots-regen.yml, so the
# guarded-migration hold-aside list can never drift between workflows again
# (a stale hold-aside copy in one workflow is exactly the incident class this
# consolidation prevents). Consumers (every workflow that boots local Supabase):
#   - .github/workflows/unit-suite.yml          (REQUIRED check)
#   - .github/workflows/crew-e2e.yml
#   - .github/workflows/dev-gate-e2e.yml
#   - .github/workflows/help-affordances.yml
#   - .github/workflows/screenshots-drift.yml
#   - .github/workflows/screenshots-regen.yml
set -euo pipefail
# Migration supabase/migrations/20260527000003_schedule_cron_jobs.sql
# (M12.1 T3) refuses to apply unless the app.fxav_vercel_url GUC is set.
# That guard is a RATIFIED prod-safety contract (R25/R26): in production
# the operator MUST set the real URL via
#   alter database <db> set app.fxav_vercel_url = 'https://<app>.vercel.app';
# before applying. We do NOT weaken the guard — CI instead supplies the
# GUC from the *environment* with a deliberately-fake, local-only URL so
# the 7 cron-schedule rows materialize. This workflow never fires the
# cron; the placeholder only needs to satisfy the non-empty check.
#
# Mechanism (verified against Supabase CLI 2.98.2): the CLI's pgx-based
# migration applier does NOT honor PGOPTIONS, config.toml has no
# custom-GUC injection key, and a failed migration during `supabase
# start` tears the whole stack down (so the GUC cannot be set after a
# failed start). So: (1) hold the guarded migration aside, (2) boot the
# DB, (3) set the GUC as a per-database default via the local superuser
# (supabase_admin — the `postgres` role lacks permission to persist a
# custom placeholder GUC), (4) restore the migration, (5) apply it with
# `migration up --include-all` (003's timestamp now precedes the
# already-applied later migrations) in a fresh session that inherits the
# default.
GUC_URL="https://fxav-screenshots-ci.invalid"
# Both cron-schedule migrations refuse to apply unless app.fxav_vercel_url
# is set (a ratified prod-safety guard): M12.1 T3's
# 20260527000003_schedule_cron_jobs.sql AND M12.2 B3's
# 20260602000005_b3_schedule_notify_cron.sql. Hold BOTH aside during the
# initial `supabase start` (the GUC isn't set yet), then restore + apply
# them after the GUC is in place. Missing either from this list makes
# `supabase start` fail when the unguarded migration raises.
# (20260602000005 also requires pg_net + the cron_secret vault entry —
# incident note carried over from screenshots-regen.yml's former inline
# copy of this block.)
STASH_DIR="$(mktemp -d)"
HELD_MIGRATIONS=(
  "supabase/migrations/20260527000003_schedule_cron_jobs.sql"
  "supabase/migrations/20260602000005_b3_schedule_notify_cron.sql"
)
restore() {
  for h in "${HELD_MIGRATIONS[@]}"; do
    s="$STASH_DIR/$(basename "$h")"
    [ -f "$s" ] && mv -f "$s" "$h" || true
  done
}
for h in "${HELD_MIGRATIONS[@]}"; do
  mv "$h" "$STASH_DIR/$(basename "$h")"
done
trap restore EXIT
# Retry `supabase start` — pulling the Supabase Docker stack is network-flaky on
# shared CI runners, and a transient image-pull / start failure HERE (not a test
# failure) is the genuine unit-suite + e2e flake source: e.g. run 28058608529 died
# at this step during Docker `Pulling`, leaving the vitest step skipped. Retry up to
# 3x, stopping any partial stack between attempts so the next start is clean. The
# held-aside migrations (above) + the restore trap are unaffected — they live on the
# filesystem, not in the Docker stack. `until` keeps `set -e` from aborting on a
# retryable failure; a final failure still `exit 1`s.
SUPABASE_START_ATTEMPTS="${SUPABASE_START_ATTEMPTS:-3}"
attempt=1
# `-x` skips Supabase services no CI consumer uses (cuts ~62s of image pull / the
# ~86-96s boot, paid per booting job across all 6 consumers of this script).
# KEEP (exercised live by app render / e2e / seed): kong (gateway 54321),
# postgrest (.from/.rpc + seed), gotrue (auth.admin/signIn — the e2e signInAs
# path), realtime (crew-e2e ShowRealtimeBridge broadcast), storage-api (signed
# diagram URLs + sync uploads). EXCLUDE (proven unused): imgproxy
# (image_transformation disabled), mailpit (email is Resend over HTTPS, not SMTP),
# studio + postgres-meta (dev UI only; schema introspection uses direct psql),
# edge-runtime (no supabase/functions dir). Pinned by
# tests/cross-cutting/supabase-boot-services.test.ts.
until supabase start -x imgproxy,mailpit,studio,postgres-meta,edge-runtime; do
  if [ "$attempt" -ge "$SUPABASE_START_ATTEMPTS" ]; then
    echo "::error::supabase start failed after ${attempt} attempts (transient Docker pull / start)" >&2
    exit 1
  fi
  echo "::warning::supabase start attempt ${attempt} failed (likely a transient Docker image pull); stopping partial stack + retrying in 15s" >&2
  supabase stop --no-backup >/dev/null 2>&1 || true
  attempt=$((attempt + 1))
  sleep 15
done
DB_CONTAINER="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -1)"
test -n "$DB_CONTAINER"
docker exec "$DB_CONTAINER" \
  psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
  -c "alter database postgres set app.fxav_vercel_url = '$GUC_URL';"
restore
trap - EXIT
supabase migration up --include-all
