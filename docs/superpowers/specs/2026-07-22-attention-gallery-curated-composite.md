# Curated full-split gallery composite + scenario class sweep

**Status:** follow-up to `2026-07-21-attention-needs-attention-split.md` (PR #546), closing its T9.1 deferral. Parent gallery spec: `2026-07-20-attention-scenario-gallery-design.md` (tier system, storable-inputs constraint, validator contract).

## §1 Resolved scope — do not relitigate

- **One new tier-3 composite** closes every coverage gap the class sweep found (§2). No tier-1/tier-2 changes; no UI component changes; no validator rule changes (sheet codes have no context contract — `drive_file_id` is optional storable context, matching `openSheet`'s `str(context,"drive_file_id")` fallback at `lib/adminAlerts/alertActions.ts:119`).
- **No impeccable dual-gate:** the diff touches only `lib/dev/**` + `tests/**` — no file under `components/` or `app/` (invariant-8 UI-surface definition not triggered). The composite renders through PR #546's already-gated components.
- **Deliberate omissions** (sweep dispositions, §2): 99+ cap states and per-code row variants are NOT given scenarios.
- Registries are self-deriving by design (index totals from tier functions; e2e markers from `ALL_SCENARIOS` + `deriveScenarioAttention`; materialize plan from `materializableScenarios()`). The only hand-maintained list is `T3_IDS` (`tier3.ts:19`), which the new scenario appends to.

## §2 Class sweep (run 2026-07-22, tsx over live catalog)

Every #546 UI state × existing scenario coverage:

| State | Coverage | Disposition |
|---|---|---|
| Review-only pill + needs-look group | `t3-sheet-missing-mid-parse` (2 LOOK), `t2-auto-resolving`, tier-1 LOOK singles | covered |
| Monitoring-only pill (non-interactive span) | tier-1 SELF singles (`alert-sync-stalled`, `alert-drive-fetch-failed`, `alert-watch-channel-orphaned`) | covered |
| Composite `confirm · review` | `t3-hold-pending-with-asset-drift` (1 hold + 1 LOOK) | covered |
| Composite with monitoring segment (incl. all three) | none | **GAP → new composite** |
| Needs-look row with EXTERNAL "Open in Sheet ↗" link | none (no scenario carries `context.drive_file_id` on a sheet code) | **GAP → new composite** |
| Needs-look row with internal "Go to Overview" link | `alert-parse-error-last-good`, `alert-show-unpublished`, `t3-sheet-missing-mid-parse` | covered |
| Hint-only needs-look row (action unresolved) | `t3-sheet-missing-mid-parse` (SHEET_UNAVAILABLE `{}`), `t2-auto-resolving` | covered |
| Menu with ALL THREE groups at once | none | **GAP → new composite** |
| Monitoring summary count > 1 | none (SELF codes appear only as singles) | **closed by new composite** (2 SELF) |
| 99+ cap (any segment) | none | **deliberate omission** — cap behavior unit-pinned (`publishedPill.test.tsx` cap suite); teaching value low; materializing 100+ rows pollutes dev DB |
| Per-code needs-look row rendering | tier-1 singles (all 12 LOOK codes) | covered |

## §3 The composite

`tier3.ts`: append constant `T3_FULL_SPLIT = "t3-full-attention-split"` to `T3_IDS` and one scenario:

- `id: T3_FULL_SPLIT`, `tier: 3`, `label: "Everything at once: confirm, review, and monitoring"`
- `alerts` (order = storable order; derivation re-orders):
  1. `SHEET_UNAVAILABLE`, `context: { drive_file_id: "gallery-fixture-file" }` → needs-look row WITH external link (gallery has no show-level driveFileId, so this exercises `openSheet`'s context fallback in a rendered surface)
  2. `RESYNC_QUALITY_REGRESSED`, `context: {}` → needs-look row with internal `#overview` anchor
  3. `SYNC_STALLED`, `context: {}` → self-heal
  4. `DRIVE_FETCH_FAILED`, `context: {}` → self-heal
- `holds`: one `mi11_pending` `crew_email` hold (shape cloned from `T3_HOLD_AND_DRIFT`, distinct `entity_key`) → the actionable item
- `warnings` ABSENT (tri-state "do not touch" branch, like `T3_SHEET_MISSING`)

**Expected derived state (pinned by test):** pill `1 to confirm · 2 to review · 2 monitoring` (interactive BUTTON); menu = confirmation header + 1 actionable row, "Needs a look" group with 2 rows (one `Open in Sheet` external — `href` ends `gallery-fixture-file/edit#gid=0`, `external: true`; one `Go to Overview` internal `/admin?show=<GALLERY_SLUG>#overview`), "Monitoring" summary "2 clearing on their own, no action needed".

Materializable like every tier-3: all inputs storable; materialize writes the context verbatim, so the real modal's sheet link points at the fixture id (a dead Google URL — acceptable dev behavior, same class as `gallery-fixture-file` in the existing hold).

## §4 Tests (TDD)

Create a NEW test file, tests/dev/fullSplitComposite.test.ts (does not exist yet; the plan's first task creates it), with behavioral pins derived through the REAL `deriveScenarioAttention`:

1. Composition: `scenarioById(T3_FULL_SPLIT)` exists, tier 3, 4 alerts + 1 hold, warnings absent.
2. Derived split: exactly 1 actionable item (the hold), 2 `clearingKind === "needs_look"`, 2 `"self_heal"`.
3. Action links: the SHEET_UNAVAILABLE item's `alert.action` equals `{ label: "Open in Sheet", href: "https://docs.google.com/spreadsheets/d/gallery-fixture-file/edit#gid=0", external: true }`; the RESYNC_QUALITY_REGRESSED item's action is internal with href `/admin?show=<GALLERY_SLUG>#overview` (assert via the exported gallery slug, never a hardcoded literal).
4. Validator: `validateScenario` returns `[]` (already swept by the index test's all-scenarios loop; the composition test makes the intent explicit).

Existing self-deriving suites (index totals, e2e markers, materialize plan/run) pick the scenario up with no edits; the plan runs them to prove it.

## §5 Out of scope

UI component changes; validator rules; switcher/UI copy; cap scenarios; tier-1/2 edits; help screenshots (gallery route is not in the help-shot manifest).
