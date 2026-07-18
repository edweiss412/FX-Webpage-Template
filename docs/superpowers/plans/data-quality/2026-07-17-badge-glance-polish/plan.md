# Plan — DataQualityBadge glance-distinction polish (FLOW4-2/3-POLISH)

**Spec:** `docs/superpowers/specs/2026-07-17-badge-glance-polish.md` (design converged; whole-diff APPROVE at close-out).
**Scope:** two Tailwind class-value bumps on `components/admin/DataQualityBadge.tsx` (`size-3.5`→`size-4` on both glyphs; outer `gap-1.5`→`gap-2`) + lockstep doc/test edits. No logic, no props, no DB, no advisory locks, no §12.4 codes, no new call boundary.

## Meta-test inventory

CREATES none. EXTENDS none structurally. `dataGapsTransitionAudit.test.tsx` gate-literal grep is **untouched** (gate unchanged). No advisory-lock surface (`pg_advisory*` not in scope). No Supabase call boundary. No new admin route/table. Declared: **no meta-test applies** — this is a pure presentational-class change with no new structural surface.

## Advisory-lock topology

N/A — no `pg_advisory*` code path touched.

## Tasks (TDD per task, commit per task)

### Task 1 — failing unit assertions for size-4 + gap-2

Extend `tests/components/admin/DataQualityBadge.chips.test.tsx` with one `describe` block asserting the new presentational values, scoped anti-tautologically:

- Roster-glyph SVG (`svg.lucide-users`) `classList` contains `size-4`, NOT `size-3.5`.
- Gap-glyph SVG (`svg.lucide-triangle-alert`) `classList` contains `size-4`, NOT `size-3.5`.
- Outer badge (`getByRole("img")`) `classList` contains `gap-2`, NOT `gap-1.5`.

Each assertion scoped to the specific element (glyph SVG / role=img span), never a container that also renders siblings. **Failure mode caught:** a partial edit bumping one glyph but not the other, or size without gap (or vice-versa). Assertions read the live classList — no fixture-derived math needed (these are static class contracts, not data-derived counts, so hardcoding the class token is correct here; the anti-tautology concern is element scoping, which is enforced).

Run → RED (component still `size-3.5`/`gap-1.5`).

### Task 2 — minimal implementation

`components/admin/DataQualityBadge.tsx`: `:58` `gap-1.5`→`gap-2`; `:69` + `:79` `size-3.5`→`size-4`. Run Task-1 test → GREEN. Run the full existing badge unit suite (`DataQualityBadge.chips`, `.rosterShift`, `dataGapsTransitionAudit`) → all GREEN (label/gate/motion contracts byte-identical).

Commit (Task 1 test + Task 2 impl land together per the spec's single-commit lockstep requirement): `feat(admin): DataQualityBadge size-4 glyphs + gap-2 inter-chip (FLOW4-2/3-POLISH)`.

### Task 3 — real-browser dimensional re-verify (no code change, gate re-run)

Run `tests/e2e/dataQualityBadge.layout.spec.ts` against the size-4 markup. Assertions are relative (badge vs its own glyph; both vs roster) → expected GREEN at the new 16px baseline. Update the spec's `:9` doc-comment `14px`/`size-3.5`→`16px`/`size-4` in lockstep (prose only; assertions untouched). This is the mandatory jsdom-insufficient layout gate.

### Task 4 — lockstep doc edits

- `docs/superpowers/specs/2026-07-17-badge-affordance-a11y.md`: §5.1 (`:55` `size-3.5`→`size-4`), §5.2 (`:61` `gap-1.5`→`gap-2`), §5.4 table + baseline prose (`:98`/`:100`/`:103` `size-3.5`/14px→`size-4`/16px). Add a one-line pointer to the amendment spec.
- `DEFERRED.md:482`: mark `FLOW4-2/3-POLISH` RESOLVED with branch/spec reference.

Commit: `docs: FLOW4-2/3-POLISH lockstep — parent spec §5 + layout-comment + DEFERRED resolve`.

### Task 5 — invariant-8 impeccable dual-gate

`/impeccable critique` + `/impeccable audit` on the component diff (UI surface). P0/P1 fixed or `DEFERRED.md`-deferred before close-out. No `DESIGN.md` edit required (the §1.3 two-glyph note records glyph identity + by-shape-not-hue, not size — size is presentational, not a recorded convention).

## Fix-round regression budget

Class C for this change = "presentational class value drift." Surface S = `DataQualityBadge.tsx`. After any repair: re-grep `size-3.5`/`gap-1.5` across the badge + its tests + both spec files (expect zero live references except historical-context prose), re-run the badge unit suite + the e2e layout spec, note both in round closure.

## Out of scope

Count text size, hue, any new token, mobile disposition surface, badge outer contract/label strings.
