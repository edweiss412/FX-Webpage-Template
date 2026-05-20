# Plan R4 Handoff

**Date:** 2026-05-20
**Codex thread ID:** captured from companion `bvxql9qfn` output
**Diff base:** 09cfd70^
**Verdict:** needs-attention

## Findings (and dispositions)

| # | Severity | Phase file | Disposition |
|---|---|---|---|
| F1 | P0 / critical | `03-phase0-tooling-reseed.md` Task 0.C.4 RPC | crew_members INSERT/UPDATE omitted `date_restriction` + `stage_restriction` columns. Without them, R3/R5/R6/R7/R8 fixtures would seed as unrestricted → walk validates wrong Right Now / Schedule / pack-list behavior (the WHOLE point of R-combos). **Fixed:** Both columns added to RPC INSERT + ON CONFLICT UPDATE, sourced from `v_crew_member->'dateRestriction'` and `v_crew_member->'stageRestriction'` jsonb fields. TS payload-builder passes restriction from fixture per crew_member. |
| F2 | P0 / critical | `03-phase0-tooling-reseed.md` Task 0.C.4 RPC | RPC used `lower(trim(v_crew_member->>'email'))` — violates AGENTS.md invariant 3 (lib/email/canonicalize.ts is the ONLY function that touches raw emails). **Fixed:** RPC writes email as-is from payload. TS script canonicalizes via `canonicalizeEmail()` BEFORE building payload. Live CHECK constraint stays as the safety net (raises an error if canon mismatch, doesn't silently re-canonicalize). |
| F3 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 (mint/finalize/check-seed all) | RPCs stamped `current_date` (Postgres session TZ); script computed fixture dates relative to local today. TZ skew → predicate (i) could falsely pass/fail. **Fixed:** Script computes one `validationTodayIso` (YYYY-MM-DD, UTC), passed into mint + finalize + check-seed via payload. RPCs use `p_fixture_payload->>'validationTodayIso'` instead of `current_date`. RPC validates value is within ±1 day of `current_date` (rejects extreme skew). |
| F4 | P1 / high | `03-phase0-tooling-reseed.md` Task 0.C.4 step 9 commit + 0.C.5 | finalize-all-atomic migration not in git add list; predicate (i) test missing. Implementer following the spec could omit the R3 partial-reseed guard. **Fixed:** git add list updated to include THREE migrations + new test files. Commit message rewritten to document all three RPCs + the R4 amendments. Task 0.C.5 now requires a failing-first test for predicate (i) — partial-reseed case where one combo's seeded date is stale. |
| F5 | P1 / high | `02-phase0-validation-state.md` 0.B.2 failing-test + 0.B.4 master-spec CREATE TABLE | Phase 0.B's column-existence test asserted 7 columns but combos_seeded_dates (added R3) makes it 8. Master-spec CREATE TABLE block omitted combos_seeded_dates. **Fixed:** test now asserts combos_seeded_dates exists (jsonb, NOT NULL) + total column count = 8. Master spec CREATE TABLE block updated. |

## Class-sweep additions

- **Restriction columns must be in the seed contract for any fixture that exercises restriction behavior** — date_restriction + stage_restriction are CORE to the R-combo matrix. The fixture mapping in `scripts/lib/validation-fixtures.ts` already carries these fields per fixture; the RPC must persist them.
- **Email canonicalization boundary discipline** — `lib/email/canonicalize.ts` is the SINGLE canonicalizer per AGENTS.md invariant 3. Any new code that writes emails to the DB MUST canonicalize via that helper BEFORE the write, NEVER via SQL expressions inline.
- **Timezone-pinned "today"** — when "today" appears in both client-side date computation AND server-side stamping, both must use the same TZ-pinned value. UTC is the safest pin for validation tooling.
- **Migration-count consistency** — any task that introduces new SQL migrations MUST update the corresponding git-add commit recipe. R4 caught the third migration (finalize-all) was missing from the commit step.

## Repair commit

(Pending — single repair commit for plan R4.)

## Next round

R5 fires after the repair commit.
