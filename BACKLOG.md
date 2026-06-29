# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

---

## BL-FINALIZE-APPROVAL-DECISION-RACE — re-read the full finalize decision row under the per-show lock

**Status:** ✅ RESOLVED — PR #188 (2026-06-29) · **Severity:** medium (pre-existing; narrow window; recoverable) · **Surfaced:** agenda-PDF-schedule whole-diff review R8 (2026-06-29)

**Resolution:** Shipped per the recommended fix below. The generation-scoped locked re-read was widened from `parse_result`-only to the full decision row (kept in place after the Drive fence), the version gate moved to after `coercedRow`, every checked/unchecked branch re-pointed to the locked `coercedRow.*`, and a finishable re-validation skip added (forward-defense). Spec: `docs/superpowers/specs/2026-06-29-finalize-approval-decision-race-design.md`; plan: `docs/superpowers/plans/2026-06-29-finalize-approval-decision-race.md`; tests: `tests/onboarding/finalizeApprovalRace.test.ts`. Client defense-in-depth (recommended-fix item 3 below) was intentionally NOT shipped — the server-side locked re-read fully closes the race.

**Problem.** `finalize` reads `wizard_approved` (and approval provenance, reviewer choices, failure code, manifest status) at _select_ time in `selectFinishableCleanRows`, BEFORE taking the per-show row lock. The approve/unapprove routes serialize on the **same** `show:` advisory lock. So a concurrent approve/unapprove that commits _after_ finalize's select but _before_ finalize acquires that row's lock makes finalize act on the **stale** select-time `wizard_approved`: a row the operator just unchecked can publish, or a row just checked can be Held. The operator's final checkbox intent is then not what ships.

**Pre-existing.** Verified at merge-base `0481c9dc` (before the agenda feature): finalize always used the select-time `wizard_approved` with no locked re-read. The agenda feature added ONLY a generation-scoped `parse_result` re-read under that lock (for agenda publish-safety); it did **not** introduce or worsen this race. The approve route updates `wizard_approved` **without** bumping `staged_modified_time`, so the agenda feature's generation-scoped re-read does not catch it.

**Why deferred (not fixed in the agenda PR).** Fixing it correctly means extending the locked re-read to the FULL decision row and re-driving finalize's 4-branch checked/unchecked/Held/failure split from the locked values — a substantial change to the intricate finalize state machine (the `finishable` predicate `wizard_approved = true OR last_finalize_failure_code is null`, the failure-code lifecycle, manifest `publish_intent`). A naive "demote on `wizard_approved` change" interacts badly with that predicate (a demoted unchecked-clean row may not be re-selected on the next finalize). This is finalize-core concurrency work, orthogonal to agenda extraction, and belongs in a focused finalize PR — not bolted onto a feature PR where it expands blast radius on the publish path.

**Recommended fix (for the focused PR).**

1. Inside the per-show locked tx, generation-re-read the full finalize decision row — `wizard_approved`, `wizard_approved_by_email`/`wizard_approved_at`, `wizard_reviewer_choices`, `last_finalize_failure_code`, manifest `publish_intent`/status — not only `parse_result`.
2. Drive ALL checked/unchecked/Held/failure branching from that locked re-read; re-validate the `finishable` predicate against the locked values; route a row that no longer matches to a typed per-row skip/retry (NOT a publish/Held on stale intent), with careful handling of the failure-code lifecycle so a re-finalize re-selects it correctly.
3. Defense in depth (client): disable/serialize the Step-3 "Finish" action while approval-checkbox writes are in flight.
4. Regression: commit an approve/unapprove AFTER `selectFinishableCleanRows` but BEFORE `processApprovedRow` takes the show lock; assert finalize honors the latest intent (publishes the checked, Holds the unchecked).

**Reference:** `app/api/admin/onboarding/finalize/route.ts` (`selectFinishableCleanRows` ~:346, `processApprovedRow` ~:710 incl. the agenda re-read ~:729); approve `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts:125`.
