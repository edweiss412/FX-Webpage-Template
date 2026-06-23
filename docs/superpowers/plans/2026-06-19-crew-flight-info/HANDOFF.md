# HANDOFF — Crew page Phase 3: per-crew flight info

**Branch:** `feat/crew-flight-info` (off merged main `dfcdd33e`).
**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-19-crew-flight-info.md` (Codex-APPROVED, 8 rounds).
**Plan:** `docs/superpowers/plans/2026-06-19-crew-flight-info/plan.md` (Codex-APPROVED, 9 rounds).

## What shipped

Surfaces each crew member's own flight itinerary in the Travel section. **Projection + UI only** — no parser/migration/sync change (the `flight_info` column, parse, and sync already existed).

- **T1 — parse-premise guard** (`tests/parser/crewFlightFixture.test.ts`): pins `parseSheet(east-coast.md)` → 3/3 non-null `flight_info` via the TECH ARRIVAL/DEPARTURE path. Commit `3316811a`.
- **T2 — projection** (`lib/data/getShowForViewer.ts`): new `ShowForViewer.viewerFlightInfo: string | null`, read on the viewer's own-row lookup (blank-normalized), emitted beside `viewerName`. Roster select unchanged (flight not on `crewMembers[]` — presentation contract). Commit `3de29bfa`.
- **T3 — UI** (`components/crew/sections/TravelSection.tsx`): conditional "Your flight" `SectionCard`, `flight_info` split on `" | "` into arrival/departure legs, per-leg URL-strip + sentinel-hide, hidden when blank, folded into `allHidden`. Commit `e8964216`; §2.4 tabular-nums fix `aadc4621`.

## §12 — Close-out gates + dispositions

### Per-task reviews (subagent-driven)
All three tasks: fresh implementer → task reviewer (spec compliance + code quality). T1 spec ✅ / quality approved; T2 spec ✅ / quality approved (44 tests across 5 files, no scope creep); T3 spec ✅ / quality approved (11 UI cases, no scope creep). **Note:** the T1 (haiku) implementer committed off the wrong base into an orphan (`36de6d40`); recovered via cherry-pick → `3316811a`. T2/T3 (sonnet/opus) held git discipline with explicit "commit on current branch, verify parent" guards.

### Implementation verification
`pnpm vitest run` (the 3 new test files + existing `TravelSection.test.tsx` + `_metaSentinelHidingContract`): **33 tests / 5 files green.** `pnpm tsc --noEmit`: clean.

### Impeccable v3 dual-gate (invariant 8) — **PASS** — 2026-06-19, external attestation (fresh Opus subagent)
- **Render:** focused real-browser render (temp Next route through real `globals.css`/Tailwind v4, 390px, both themes; cleaned up). **All 3 leg tokens resolve in a real browser** — `text-text`→`#E8E6E0`/`#1A1B1F`, `text-sm`→`14px`, `leading-relaxed`→`22.75px` (no currentColor/0px fallback — the Phase-2 token-fallback class is clear). Card chrome matches the sibling Hotels card; leg contrast 17.21:1 (AAA).
- **Critique: PASS** (Nielsen 27/40, AI-slop PASS, no anti-patterns). **Audit: PASS** (20/20, no P0–P3).
- **HIGH (1) — FIXED:** DESIGN.md §2.4 tabular-figures mandate — legs rendered times/dates/conf codes in proportional figures; every sibling crew surface uses `tabular-nums`. Fixed in `aadc4621` (added `tabular-nums` to the leg span, real-browser re-verified).
- **LOW/MED (noted, non-blocking):** (a) no arrival/departure orientation label between legs — intentional per the spec's no-deep-structure decision (the `" | "` split is positional; a one-way leg can't be disambiguated), filed as a future nicety in BACKLOG `BL-FLIGHT-LEG-ORIENTATION`; (b) confirmation code mid-string + spreadsheet-flavored passthrough — inherent to the ratified raw-string display; (c) `key={i}` on the leg spans — acceptable for a derived, non-reordering text list.

### Codex whole-branch adversarial review — code clean
Found **no code-level projection/rendering blocker** (tsc + `git diff --check` passed). Its one HIGH was process: the impeccable UI-gate evidence was not yet recorded — resolved by this §12 + commit `aadc4621`.

## Deferrals (filed)
- **DEF-FLIGHT-1** (`DEFERRED.md`): TRAVEL-tab flight parser — RPAS + both FinTech copies carry one crew flight each in an unparsed TRAVEL tab (~doubles coverage 3→6 crew); distinct parser surface, forward-compatible with this render.
- **BL-CREW-PII-DB-LOCKDOWN** (`BACKLOG.md`): gate crew PII (flight/email/phone) from other show crew at the DB boundary (read-side analogue of the DML lockdown) — separate security effort.
- **BL-FLIGHT-LEG-ORIENTATION** (`BACKLOG.md`): arrival/departure labeling / richer leg layout, if a future parser yields structured legs.
