# M12.1 Deferred Items

Per memory `feedback_deferral_discipline`. Three buckets:

1. **Land-now small fixes** — handled inline during iteration; no DEFERRED entry.
2. **DEFERRED.md (this file)** — work that WILL be done with a concrete trigger or planned milestone home.
3. **`BACKLOG.md` (project root)** — speculative work that MIGHT be done; no trigger.

## Open deferrals

_(empty at plan-draft time)_

## Closed deferrals

_(empty at plan-draft time)_

## Notes

- M12.1 is a sub-amendment with a narrow scope (~5 commits). Deferrals are not expected to be the primary triage path; most adversarial-review findings should be land-now or scope-rejections.
- If a finding identifies an issue with the pre-existing bootstrap signing-key cron (`supabase/migrations/20260504000001_bootstrap_nonces_signing_key.sql:36`), that's out of M12.1 scope — file in BACKLOG.md.
