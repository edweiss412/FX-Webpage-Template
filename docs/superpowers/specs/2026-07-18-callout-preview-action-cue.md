# Spec — CALLOUT-PREVIEW-ACTION-CUE-1: action-forward jump label on the demoted flag callout

**Date:** 2026-07-18
**Slug:** `callout-preview-action-cue`
**Deferral item:** `DEFERRED.md:13` — CALLOUT-PREVIEW-ACTION-CUE-1 (critique P1 → dispositioned P2)
**Design:** Option A (user-approved 2026-07-18, artifact mockup). No re-litigation.
**Scope class:** UI copy-only. No DB, no advisory locks, no new state, no layout change.

---

## 1. Problem

Since the preview demotion (#467, spec `2026-07-17-use-raw-callout-preview-demotion`) the section flag callout (`SectionFlagCallout`, `components/admin/wizard/step3ReviewSections.tsx:524`) lists a flagged section's mapped warnings but mounts **no controls** — the actionable use-raw / recognize-role controls live solely in `WarningsBreakdown`, reached by jumping. The per-entry jump button reads **"View details"** (`components/admin/wizard/step3ReviewSections.tsx:588`).

The invariant-8 impeccable critique (2026-07-17) flagged that with inline controls gone, a generic "View details" reads as **passive / FYI** — Doug (single admin, no onboarding) can treat a flagged section as no-action. Visibility-of-status heuristic scored 2/4. The fix path (Parse warnings breakdown) is discoverable but not *cued* by the label.

## 2. Change (Option A — variant-aware action-forward label)

Replace the per-entry jump button label **"View details"** with a label whose verb matches the callout's existing tone variant and whose object names the destination:

| Variant (`SectionFlagCallout` prop, line 537) | Set when | Tone | New label |
| --- | --- | --- | --- |
| `flagged` | `judgment ? … : "flagged"` at call site (`step3ReviewSections.tsx:728`), i.e. warn-severity mapped warnings | amber warn (`bg-warning-bg`) | **`Fix in Parse warnings`** |
| `judgment` | `judgment === true` (calm "we made a judgment call" reads) | calm info (`bg-info-bg`) | **`Review in Parse warnings`** |

The label itself is the cue — it names the action (`Fix` / `Review`) and the destination (`Parse warnings`). No separate cue element, no layout change, no tone change to the amber/info block.

### 2.1 What does NOT change (disagreement-loop preempt)

- **The judgment lead line** "We made a judgment call reading this. Worth a glance." (`step3ReviewSections.tsx:566`) is UNTOUCHED. It is copy-pinned by the prior spec's §3.10/§7.3; this item deliberately does not revisit it. The removal-only diff (#467) deferred *action-forward wording* to this item; that means the **jump button label**, not the lead line.
- **The overflow line** "+{extra} more in Parse warnings" (`step3ReviewSections.tsx:605`) is UNCHANGED — it already names the destination and is an aggregate jump (`onJump(null)`), not a per-entry action.
- **The sr-only per-entry suffix** " for {title}" (`step3ReviewSections.tsx:588`) is PRESERVED (adapted to sit after the new visible label), keeping each jump button's accessible name unique per warning.
- Tone tokens, icon (`AlertTriangle` / `Info`, line 550), `data-variant`, testid, tap target, focus ring — all unchanged.

## 3. Copy rules compliance

- **No em dash** (DESIGN.md:328) — labels use plain words, no `--`. ✓
- **Sentence case, imperative** — "Fix in Parse warnings" / "Review in Parse warnings" match the imperative CTA voice; "Parse warnings" is the section's own proper name (matches the overflow line and the rail item). ✓
- **No raw error codes** (invariant 5) — pure UI copy, no machine tokens. ✓

## 4. Guard conditions

- **`title` empty / null:** the visible label is a static string independent of `title`; only the sr-only suffix interpolates `{title}`. An empty `title` yields sr-only " for " (pre-existing behavior, unchanged) — the visible label still renders in full. No new guard needed.
- **`variant` unset:** defaults to `"flagged"` (line 529) → "Fix in Parse warnings". Matches today's default-flagged behavior.
- **Zero entries:** callout is not rendered at all (call-site guard `calloutEntries.length > 0`, line 719) — no button, unchanged.
- **Entries at / over the cap:** shown rows each get the variant label; overflow line unchanged. Cap logic (`CALLOUT_MAX_ENTRIES = 3`, line 496) untouched.

## 5. Dimensional invariants

None affected. No fixed-dimension parent / flex-child relationship changes — this is a text swap inside an existing inline-flex button (`min-h-tap-min items-center`, line 586). Tap target stays ≥44px (`--spacing-tap-min` = 44px, DESIGN.md:195); the button already carries `min-h-tap-min`. The critique P1b tap-target concern was already refuted by the passing §15 real-browser audit (≥44px); this change does not alter button box geometry.

## 6. Transition inventory

The callout has no multi-state animation surface touched by this change. States:
- `flagged` ↔ `judgment` — determined at render by the `variant` prop; a section does not morph between them at runtime (instant, no animation — pre-existing, `§H N2` "instant — deliberate", line 598/716).
- Button label is static per variant; hover/focus is the pre-existing focus-ring/underline (unchanged).

No `AnimatePresence`, no ternary render entering/leaving on this label. Nothing to add.

## 7. Test impact (anti-tautology)

Existing pins in `tests/components/admin/wizard/Step3ReviewModal.test.tsx` match the button by accessible name `/View details/`. They must update to the **variant-correct** label, derived from the fixture's variant, not blanket-replaced:

| Test (line) | Fixture | Variant | New name matcher |
| --- | --- | --- | --- |
| §E4 jump threads suppression (1882) | `warning("crew")` | flagged | `/Fix in Parse warnings/` |
| callout first-child + cap (2377) | `crewWarnings(cap+2)` | flagged | `/Fix in Parse warnings/` |
| at/under cap: no overflow (2393) | `crewWarnings(cap)` | flagged | `/Fix in Parse warnings/` |
| §E4 jump → rail aria-current (2491) | crew fixture | flagged | `/Fix in Parse warnings/` |
| multiple jump buttons (2534) | crew fixture | flagged | `/Fix in Parse warnings/` |
| judgment section (1287, if it asserts the button) | rooms judgment | judgment | `/Review in Parse warnings/` |

New assertion to add (failure mode caught: label not variant-aware — a blanket "Review…" would let the amber/flagged path pass while under-cueing urgency): a test rendering a **flagged** callout asserts its jump button accessible name matches `/^Fix in Parse warnings\b/` AND a **judgment** callout matches `/^Review in Parse warnings\b/`, in the same test file, so a single-label regression fails.

**Accessible-name caveat (do NOT assert exact equality):** the visible label is followed by the preserved sr-only suffix " for {title}" (§2.1), so the button's *accessible name* is `Fix in Parse warnings for <title>`, not the bare label. Matchers MUST be prefix/substring regexes (`/^Fix in Parse warnings\b/`), never exact-string equality — an exact match would either fail or pressure the implementation to drop the per-warning uniqueness suffix, an a11y regression in a repeated-button list. To pin the visible text distinct from the sr-only tail, assert the button's non-sr-only text content separately (e.g. clone the button, strip the `.sr-only` span, assert `textContent === "Fix in Parse warnings"`). Overflow-line matchers (`/more in Parse warnings/`, lines 2384/2396/2563) are UNCHANGED and must keep passing (proves we did not touch the overflow copy).

## 8. Files touched

- `components/admin/wizard/step3ReviewSections.tsx` — button label (line 588) + two stale code-comment references to "View details" (lines 540, 593).
- `tests/components/admin/wizard/Step3ReviewModal.test.tsx` — name matchers per §7 + one new variant-label assertion.
- `DEFERRED.md` → `DEFERRED-archive.md` — move CALLOUT-PREVIEW-ACTION-CUE-1 on close-out; reconcile the resolved twin `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION` reference.

## 9. Meta-test inventory

None created or extended. No new mutation surface, no Supabase call boundary, no admin_alert code, no advisory lock, no §12.4 catalog row. (This is a copy-only UI change; the relevant structural guard is the existing source-scan that no `site="callout"` control mounts, unaffected.)

## 10. Out of scope

- Rewording the judgment lead line (§2.1).
- Any change to `WarningsBreakdown` controls or the overflow jump.
- Icon / tone / animation changes.
- Onboarding or first-run coaching for the callout.
