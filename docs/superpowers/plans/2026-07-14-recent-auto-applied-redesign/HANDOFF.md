# Handoff — Recently auto-applied strip redesign

**Branch:** `feat/recent-auto-applied-redesign` (off `origin/main` @ 7646f45d5)
**Spec:** `docs/superpowers/specs/2026-07-14-recent-auto-applied-redesign.md` (Codex-APPROVED, 2 rounds)
**Plan:** `docs/superpowers/plans/2026-07-14-recent-auto-applied-redesign/plan.md` (Codex-APPROVED, 3 rounds)

## 1. What shipped

Restyle of the admin dashboard "Recently auto-applied" strip into per-change bordered cards (status-token kind pills + name-only From→To diff + full/half Accept-Undo + group count badge), backed by a PII-safe read-layer projection. No DB migration, no advisory-lock surface, no new tokens.

Source: `lib/admin/loadRecentAutoApplied.ts` (name-only `diff`), `components/admin/RecentAutoAppliedStrip.tsx` (card rewrite), `components/admin/AcceptChangeButton.tsx` + `UndoChangeButton.tsx` (optional `stretch` + `quiet` props). Tests: loader, component, both button suites, + a jsdom layout-mechanism test.

## 2–11. (see spec §§)

## 12. UI quality gate — impeccable v3 dual-gate (invariant 8)

Register: **product** (Doug's admin dashboard). Real-browser render verified light + dark (faithful to the approved mock). Deterministic detector (`npx impeccable --json`): **clean** (0 findings) before and after fixes. Two independent sub-agents (critique + audit) ran as external attestation.

| # | Gate | Severity | Finding | Disposition |
|---|---|---|---|---|
| 1 | critique | P1 (BLOCK) | Accept and Undo were visual twins on a per-row mutation surface (per-row Undo has no confirm) — error-prevention defect | **FIXED** — `quiet` prop makes strip Undo a recessive borderless secondary; Accept stays bordered primary. Differentiate by weight, not hue (accent is coverage-capped ≤10%). |
| 2 | audit | P1 (BLOCK) | Diff captions (From/To/Added/Removed) used `text-text-faint` ≈3.35:1 light / 3.75:1 dark — below AA-body; these carry the non-color diff direction | **FIXED** — `cap` → `text-text-subtle` (6.4–7.8:1). |
| 3 | audit | note | Count badge announced a lone number to SR | **FIXED** — `aria-label="{n} change(s)"`. |
| 4 | audit | note | `text-[10.5px]` / `px-[7px]` magic values off-scale (DESIGN §329) | **FIXED** — `text-xs` / `px-2`. |
| 5 | critique | P2 | Singleton group renders card-in-card | **DEFERRED** — `DEFERRED.md` AUTOAPPLIED-REDESIGN-2 / `BL-AUTOAPPLIED-SINGLETON-FLATTEN`. |
| 6 | critique | P2 | Generic `field_changed` summary | **DEFERRED** — `DEFERRED.md` AUTOAPPLIED-REDESIGN-3 / `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` (needs the excluded DB write-path arc). |

Both P1 (BLOCK) findings fixed and re-rendered; detector re-run clean. No HIGH/CRITICAL remains open. Real-browser pixel-width layout e2e deferred (AUTOAPPLIED-REDESIGN-1) — mechanism pinned in jsdom.

## 6. Watchpoints (do-not-relitigate for the whole-diff reviewer)

- `field_changed` From→To intentionally NOT implemented (no stored data) — falls back to summary. Spec §1.
- Selecting `before_image`/`after_image` in `lib/admin` is NOT an observe-core violation — the observe ban (`tests/observe/_metaReadOnlyQueryCore.test.ts`) is scoped to `lib/observe/query/**` only.
- Kind pills reuse `status-positive/review/warn/idle` tokens — sanctioned DESIGN §1.3 status-pill pattern, no new hue/token.
- Accent is coverage-capped (≤10%), so Accept/Undo differentiation is by weight (bordered vs ghost), not an accent fill.
