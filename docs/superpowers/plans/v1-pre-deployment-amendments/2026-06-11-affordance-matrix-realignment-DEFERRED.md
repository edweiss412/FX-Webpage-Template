# M12.12 affordance-matrix realignment — DEFERRED.md

Per `feedback_deferral_discipline.md` — items here are work that **will be done** with a concrete trigger. Items that **might be done** with no scheduled home go to `docs/superpowers/plans/BACKLOG.md` instead.

---

## Milestone close-out (2026-06-11)

### M12.12-DEF-1: phantom 24h-undo promise in shipped UI copy

- **Severity:** MEDIUM (user-facing overpromise)
- **File:line:** `components/admin/settings/AutoPublishToggle.tsx:74` ("Publish brand-new sheets automatically when they parse with no warnings. You can still undo within 24 hours.") + `components/admin/StagedReviewCard.tsx:136` ("New show, parsed clean. Apply to publish it (you can still undo within 24 hours).")
- **Discovery context:** M12.12 cluster-1 review. Both component strings promise "You can still undo within 24 hours," but the unpublish token has no delivery surface — the forbidden-prose registry's `24-hour-undo-email` rationale (`tests/help/forbidden-prose-registry.test.ts:96-99`) documents this: the unpublish endpoint + token exist server-side, but Doug has no in-app delivery surface for the link and no email-send infrastructure ships in v1. M12.12 cluster-1 removed the same promise from help MDX + the catalog at `ae102fb4` (`fix(help): drop undeliverable 24h-undo promise (registry broadened both orders) + rewrite #sync-health to the live quiet footer`); the component copy was left in place because it is governed by the ratified B2 spec — rewording it is an owner decision, not a help-docs sweep.
- **Why deferred:** the two strings are B2-spec-governed product copy (invariant 7: spec is canonical); changing them unilaterally inside a help-affordance milestone would be a silent spec deviation. The honest fix requires either an owner-approved copy amendment or shipping the missing feature surface — both out of M12.12's matrix-realignment scope.
- **Fix path:** EITHER (a) reword the two component strings to describe the shipped archive-recovery path (what Doug can actually do today), with a B2-spec line-edit amendment ratified in the same commit; OR (b) ship the unpublish-token delivery surface, making the existing promise true (at which point the forbidden-prose registry entry also relaxes).
- **Re-open trigger:** M13 launch checklist (user-visible overpromise should not ship to the v1 operator) OR the next milestone that touches the B2 auto-publish/staged-review surface, whichever comes first.

### M12.12-DEF-2: unlocked `crew_members.update` in `tests/e2e/helpers/rightNow.ts` — ✅ RESOLVED 2026-06-11 (this PR)

- **Resolution:** `setDateRestriction` now shells out to psql and performs the `date_restriction` UPDATE inside one transaction holding `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))` for the seeded show — the `seedWalkerFixtures.ts` locked-fixture pattern. The `EXEMPT_HELPERS` entry and its stale-exemption accommodation were removed, so the walker-routes structural pin (`tests/help/walker-routes.test.ts`) now passes with zero exemptions.

- **Severity:** LOW (test-only, local stack)
- **File:line:** `tests/e2e/helpers/rightNow.ts:111-114` (`setDateRestriction` calls `admin.from("crew_members").update({ date_restriction: restriction })` directly)
- **Discovery context:** M12.12 walker-fixture relocation. The walker's first-seen fixture mutation was relocated into the locked seed extension (`supabase/seedWalkerFixtures.ts` pattern) per invariant 2 (per-show advisory lock on every code path mutating `crew_members` et al.); the sweep surfaced `rightNow.ts` as a pre-existing helper in the same class — a direct `crew_members` mutation outside any advisory-lock holder. It is currently carried as an `EXEMPT_HELPERS` entry (`tests/help/walker-routes.test.ts:66`) with a stale-exemption guard (`tests/help/walker-routes.test.ts:100-104`) that fails if the helper ever stops mutating a locked table without the exemption being removed.
- **Why deferred:** test-only code against the local stack — no production mutation path, no cron/admin contention on the local e2e database — and the right-now e2e suite is outside M12.12's matrix scope. Fixing it inside M12.12 would expand the milestone into the right-now suite's fixture architecture for zero production-risk reduction.
- **Fix path:** relocate the `date_restriction` mutation into a locked fixture script (the `seedWalkerFixtures` pattern: a seed-time script that acquires the per-show advisory lock around the mutation), then delete the `EXEMPT_HELPERS` entry — the stale-exemption guard enforces the deletion.
- **Re-open trigger:** next e2e-infra milestone OR any milestone touching the right-now e2e suite (`tests/e2e/right-now-transitions*` / `tests/e2e/helpers/rightNow.ts`).
