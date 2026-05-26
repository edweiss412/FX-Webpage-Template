# M12 Deferred Items

Per memory `feedback_deferral_discipline.md`. Three buckets:

1. **Land-now small fixes** — handled inline during iteration; no DEFERRED entry.
2. **DEFERRED.md (this file)** — work that WILL be done with a concrete trigger or planned milestone home.
3. **`BACKLOG.md` (project root)** — speculative work that MIGHT be done; no trigger.

## Open deferrals

### `M12-PHASE0C-TZ-PIN-METATEST` — Author `tests/cross-cutting/validation-tooling-tz-pin.test.ts`

- **Source:** R5 pre-rebase plan amendment narrative declared this meta-test "landed" as a structural defense for the live-code-fidelity / TZ-pin vector after that vector recurred across 5 consecutive rounds. R11 audit (2026-05-26) verified the file does NOT exist in git history (no commit ever added it; `find tests -name '*tz*'` returns only the unrelated `playwright-version-pin.test.ts`; `git log --all -- 'tests/cross-cutting/validation-tooling-tz-pin.test.ts'` returns empty).
- **Affected citations (reframed in R11 commit 28):**
  - `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/00-overview.md:124-130` — "Meta-tests CREATED" table row + wrapping "R5 amendment" narrative.
  - `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md:337` — check-seed predicate (b) cites the test as the source of the TZ-pinned default.
  - `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md:162-167, :194, :232` — watchpoints §6 + test-commands §7 + pre-rebase convergence log §"Convergence log".
- **Trigger (concrete, post-R13 commit 29):** **Task 0.C.8** in `03-phase0-tooling-reseed.md`. Authored AFTER Tasks 0.C.1–0.C.6 land the `scripts/validation-*.ts` surface + `.sql` migrations the meta-test audits (the RED phase needs live targets). BEFORE Phase 0.F close-out (`Task 0.F.8 Step 1` requires this meta-test green to close Phase 0).
- **Authoring contract:** grep every `.sql` migration AND every `.ts` script in `scripts/validation-*.ts` for the lowercase string `current_date`. Each match MUST be either (a) inside the bounded-skew sanity check (`abs(DATE_TEXT::date - current_date) > 1` — corrected from the R5 narrative's broken `abs(extract(epoch from ...::date - current_date)) > 86400` pattern; see R11 F9 fix at `03-phase0-tooling-reseed.md`), OR (b) carry an inline `// not-validation-today-iso: <reason>` waiver. Default: "TZ-pinned `validationTodayIso` wins; `current_date` is for skew-check only."
- **Why deferred, not land-now:** TDD authoring (RED + GREEN) requires the `scripts/validation-*.ts` files to exist; they're authored in Tasks 0.C.1–0.C.6. Land-now in R11/R13 (markdown-only amendment scope) is impossible — there's no `.ts` surface to audit yet.
- **Why not BACKLOG:** R5 design intent (TZ-pin class-sweep) was sound; the file simply wasn't authored. M12 scope, not speculative. Concrete Phase 0.C task ID closes the phantom-trigger class (per R12 F12 finding + R13 commit 29 audit).

### `M12-PHASE0C-EMAIL-CANON-EXT` — Extend `tests/cross-cutting/email-canonicalization.test.ts` to audit `scripts/validation-*.ts`

- **Source:** Same R5 pre-rebase plan amendment narrative declared an extension to the existing `email-canonicalization.test.ts` audit scope: flag `lower(...)` / `trim(...)` in `scripts/validation-*.ts` unless adjacent to a `canonicalize()` call from `lib/email/canonicalize.ts`. R11 audit verified the test file exists (`tests/cross-cutting/email-canonicalization.test.ts`), but the audit scope does NOT include validation scripts: `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705` walks `lib/parser`, `lib/sync`, `lib/reports`, `lib/auth`, `lib/data`, `lib/adminAlerts`, `app/api/admin` — `scripts/validation-*.ts` is absent. Extension never landed.
- **Affected citations (reframed in R11 commit 28):**
  - `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/00-overview.md:122` — meta-test inventory row claims "MUST be extended" in past-tense framing.
  - `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M12-solo-dev-ux-validation.md:64, :165, :194, :232` — invariants checklist + watchpoints §6 + test-commands §7 + pre-rebase convergence log.
- **Trigger (concrete, post-R13 commit 29):** **Task 0.C.9** in `03-phase0-tooling-reseed.md`. Authored AFTER Tasks 0.C.1–0.C.6 land the `scripts/validation-*.ts` surface (the audit needs live targets). BEFORE Phase 0.F close-out (`Task 0.F.8 Step 1` requires this extension green to close Phase 0).
- **Authoring contract:** add a `walkSourceFiles(["scripts"]).filter((p) => /\/validation-[\w-]+\.ts$/.test(p))` source-path entry to `auditLiveEmailCanonicalization()` at `lib/audit/emailCanonicalization.ts:693-705`. Flag any `lower(...)` / `trim(...)` not adjacent to a `canonicalize()` call from `lib/email/canonicalize.ts`. Fixture pairs (bad/good) live alongside the existing pairs in `tests/cross-cutting/fixtures/email-canonicalization/`.
- **Why deferred, not land-now:** same as TZ-PIN — needs the scripts it would audit. Land-now in R11/R13 (markdown-only) is impossible.
- **Why not BACKLOG:** M12 scope per AGENTS.md invariant 3 (email canonicalization at every boundary); validation tooling IS a boundary for email writes (fixture INSERTs into `crew_members`). Concrete Phase 0.C task ID closes the phantom-trigger class (per R12 F12 finding + R13 commit 29 audit).

## Closed deferrals

_(empty at plan-write time)_

## Notes

- Aspirational milestone names (e.g., "M13 polish") that aren't planned milestones are NOT real homes — those items go to project-root `BACKLOG.md`.
- M13 (v1 launch) IS a planned successor milestone but its scope is launch-readiness, not catch-all polish. SHOULD-FIX items routed to M13 must be specifically launch-blocking, not generic polish.
- `/impeccable defer-to-harden` recommendations during invariant-8 UI gates are advisory; the dev decides per item whether the deferral is real (concrete trigger) or speculative (BACKLOG).
