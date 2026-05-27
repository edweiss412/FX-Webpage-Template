# M12 Deferred Items

Per memory `feedback_deferral_discipline.md`. Three buckets:

1. **Land-now small fixes** — handled inline during iteration; no DEFERRED entry.
2. **DEFERRED.md (this file)** — work that WILL be done with a concrete trigger or planned milestone home.
3. **`BACKLOG.md` (project root)** — speculative work that MIGHT be done; no trigger.

## Open deferrals

### `M12-PHASE0C-TZ-PIN-METATEST` — Author `tests/cross-cutting/validation-tooling-tz-pin.test.ts` — **RESOLVED <THIS-COMMIT-SHA>** (2026-05-27)

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

### `M12-DOCS-M9.5-SURFACE-WALKER` — Extend X.3 audit to scan M12 plan/spec markdown for retired-M9.5-surface references

- **Source:** R67 (commit 65636d7) closed F55 (HIGH; conf 0.94) — plan 02:482-513 LOCKED_TABLES registry referenced `crew_member_auth`, a table retired at M11.5 G3 cutover (`supabase/migrations/20260523000099_cutover_drop_m9_5.sql:26`). R67 (B) sweep fixed 4 actionable peers across plan 02 + 00-overview.md but flagged the broader pattern: X.3 audit (`tests/cross-cutting/no-m9-5-surfaces.test.ts`) only scans `app/`, `lib/`, `components/`, `tests/` — NOT `docs/`. M12 amendment plan/spec markdown is in `docs/` so stale M9.5 references can land without X.3 catching them.
- **Affected citation:** R67 implementer flagged at handoff §"Convergence log" R67 row. Surfaces that R67 fixed (~5 actionable) vs kept (~37 HISTORICAL: RETIRED markers + §15.x audit-trail + Phase 0.D deletion narrative) demonstrate the class is BOUNDED — only specific patterns are actionable.
- **Trigger (concrete):** **Phase 0.B kickoff** — when Phase 0.B executor opens task 0.B.1, they extend `tests/cross-cutting/no-m9-5-surfaces.test.ts` (OR author sibling `tests/cross-cutting/no-m9-5-surfaces-in-m12-docs.test.ts`) to scan `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation/**/*.md` + `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-19-solo-dev-ux-validation-design.md` for the 14-term M9.5 forbidden list at `tests/cross-cutting/no-m9-5-surfaces.test.ts:12-31`, with explicit exclusions for known-historical contexts (RETIRED markers, §15.x audit-trail entries, strikethrough rows, "Phase 0.D deletion" rationale, convergence-log finding tables).
- **Authoring contract:** extend the existing X.3 walker pattern with a docs-scope additional pass. Exclusion contexts marked via inline waivers OR detected via surrounding-line patterns (`~~`-strikethrough markers, `RETIRED`/`DELETED` keywords within ±3 lines, §15.x header detection). RED phase: re-introduce a stale `crew_member_auth` reference in plan 02 → assertion fires. GREEN: post-R67 sweep state.
- **Why deferred, not land-now:** R67 was scoped to per-instance fixes per stop-rule + same-surface convergence detector. Structural defense extension was within the 4-peer threshold (technically met) but flagged to orchestrator as a separate concern. Land-now at R67 would have violated stop-rule scope discipline.
- **Why not BACKLOG:** R67 surfaced this in M12 amendment scope; the structural defense IS amendment work just deferred for stop-rule discipline. M12 Phase 0.B is the canonical home — implementer authors the test extension before authoring runtime tests for Task 0.B.2 (the registry-aware lockdown meta-test) so the docs are audit-clean by Phase 0.B close-out.

## Closed deferrals

_(empty at plan-write time)_

## Notes

- Aspirational milestone names (e.g., "M13 polish") that aren't planned milestones are NOT real homes — those items go to project-root `BACKLOG.md`.
- M13 (v1 launch) IS a planned successor milestone but its scope is launch-readiness, not catch-all polish. SHOULD-FIX items routed to M13 must be specifically launch-blocking, not generic polish.
- `/impeccable defer-to-harden` recommendations during invariant-8 UI gates are advisory; the dev decides per item whether the deferral is real (concrete trigger) or speculative (BACKLOG).
