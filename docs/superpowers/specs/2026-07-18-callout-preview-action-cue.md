# Spec — CALLOUT-PREVIEW-ACTION-CUE-1: action-forward jump label on the demoted flag callout

**Date:** 2026-07-18
**Slug:** `callout-preview-action-cue`
**Deferral item:** `DEFERRED.md:13` — CALLOUT-PREVIEW-ACTION-CUE-1 (critique P1 → dispositioned P2)
**Design:** Option A, refined to be actionability-aware (user-approved 2026-07-18; the refinement — "Fix" only where a fix control renders — was approved in a second decision after adversarial review R2 surfaced that flagged ≠ guaranteed-fixable).
**Scope class:** UI copy + one small pure derivation (`warningOffersFix`) + a producer tag. No DB, no advisory locks, no new animation state, no layout change.

---

## 1. Problem

Since the preview demotion (#467, spec `2026-07-17-use-raw-callout-preview-demotion`) the section flag callout (`SectionFlagCallout`, `components/admin/wizard/step3ReviewSections.tsx:524`) lists a flagged section's mapped warnings but mounts **no controls** — the actionable use-raw / recognize-role controls live solely in `WarningsBreakdown`, reached by jumping. The per-entry jump button reads **"View details"** (`components/admin/wizard/step3ReviewSections.tsx:588`).

The invariant-8 impeccable critique (2026-07-17) flagged that with inline controls gone, a generic "View details" reads as **passive / FYI** — Doug (single admin, no onboarding) can treat a flagged section as no-action. Visibility-of-status heuristic scored 2/4. The fix path (Parse warnings breakdown) is discoverable but not *cued* by the label.

## 2. Change (Option A, refined — actionability-aware action-forward label)

Replace the per-entry jump button label **"View details"** with an action-forward label naming the destination. The verb is **`Fix`** only where the destination will actually render a fix control for that warning, else **`Review`** — a `Fix` label must never point at a row with no fix affordance (the destination header itself reads *"Some include an optional fix you can apply below"*, `step3ReviewSections.tsx:2305`). The label matrix (user-approved 2026-07-18):

| Variant | Entry offers a fix at destination? | Label |
| --- | --- | --- |
| `flagged` (amber) | yes (`offersFix === true`) | **`Fix in Parse warnings`** |
| `flagged` (amber) | no (`offersFix === false`) | **`Review in Parse warnings`** |
| `judgment` (calm) | (ignored — always calm) | **`Review in Parse warnings`** |

`judgment` sections are calm by contract ("we made a judgment call, worth a glance") and always read **`Review`**, even though their ambiguity-class warnings are frequently fixable — the calm tone is deliberate (spec `2026-07-07 §7.3`). Only the `flagged` variant keys the verb off actionability.

### 2.2 Actionability predicate — `warningOffersFix` (new, drift-proof)

A callout entry "offers a fix" iff the sole actionable site (`WarningsBreakdown`, `step3ReviewSections.tsx:~2393`) would render an interactive control for it. There are exactly two controls, each self-hiding out-of-scope warnings:

- **`RoleRecognizeControlBoundary`** renders iff `warning.code === "UNKNOWN_ROLE_TOKEN"` AND `(warning.roleToken ?? "").trim().length > 0` (else `return null`, `RoleRecognizeControlBoundary.tsx:52`).
- **`UseRawControlBoundary` → `UseRawControl`** renders an interactive toggle iff `deriveUseRawControlState(warning, decision, false)` is an interactive state — i.e. NOT `null` (out of scope, `UseRawControl.tsx:70`), NOT `"legacy-unavailable"` (no resolution, line 77), NOT `"disabled"` (`resolvable:false`, line 78). The interactive states are `transform-active | raw-active | apply-pending | clear-pending | pending`.

New pure module **`lib/admin/warningFixAffordance.ts`**:

```ts
export function warningOffersFix(
  warning: Pick<ParseWarning, "code" | "resolution" | "roleToken">,
  decision: UseRawDecision | undefined,
): boolean {
  if (warning.code === "UNKNOWN_ROLE_TOKEN" && (warning.roleToken ?? "").trim().length > 0)
    return true;
  const st = deriveUseRawControlState(warning, decision, false);
  return st !== null && st !== "legacy-unavailable" && st !== "disabled";
}
```

**Drift-proofing:** the use-raw branch reuses the SAME `deriveUseRawControlState` the control renders from (no duplicated `IN_SCOPE` set). A parity meta-test (§9) pins that `warningOffersFix`'s use-raw verdict equals "`UseRawControl` renders a non-null, non-disabled, non-legacy control," and that the role branch equals "`RoleRecognizeControlBoundary` renders non-null," across every catalog code + role fixtures. If either boundary's render gate changes, the parity test fails.

### 2.3 Producer tags each entry (`ShowReviewSurface`)

`offersFix` is computed once, at the callout producer (`ShowReviewSurface.tsx:835`), where `data.useRawDecisions` (staged `SectionData`, `sectionData.ts:56`) is in scope — the callout only renders under `isStaged(data)`, so decisions are always present. Each `calloutEntries` item gains `offersFix: warningOffersFix(e.warning, findUseRawDecision(e.warning, data.useRawDecisions))`. `SectionFlagCallout` stays presentational — it reads `entry.offersFix` and the `variant` prop to pick the label (`variant === "judgment" || entry.offersFix !== true ? "Review in Parse warnings" : "Fix in Parse warnings"`), computing no decision logic itself.

**`offersFix` is an OPTIONAL field (`offersFix?: boolean`)**, deliberately not required, so the type stays backward-compatible: the other live constructor of this prop shape — `tests/components/admin/wizard/warningsBreakdownControls.test.tsx:299,396` — builds `calloutEntries` directly and must keep **compiling** unchanged. A REQUIRED field would break that file's typecheck. Its behavioral assertions DO change (it asserts the jump-button label at `:329,423`; §8): the omitted `offersFix` makes those previews render `Review`, so the label assertion updates from `View details` to `Review in Parse warnings`. The `offersFix`-omitted path is thus safe AND correct — a preview whose fixability wasn't computed reads `Review`, never a false `Fix`. The real "Fix" behavior is proven end-to-end through the producer path by the §7 semantic tests, so an accidentally-unset `offersFix` in the producer would fail those (fail-by-default preserved despite the field being optional).

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
- **`variant` unset:** defaults to `"flagged"` (line 529); the label then depends on the entry's `offersFix`.
- **`offersFix` unset / undefined:** the producer always sets it, but the label picker treats a missing/falsy `offersFix` as **`Review`** (fail-safe — never render a `Fix` promise without a positive actionability signal). An over-cautious `Review` is a copy-accuracy no-op; an unfounded `Fix` is the bug this item fixes.
- **`decision` undefined (no persisted use-raw choice):** `deriveUseRawControlState` still returns an interactive `"transform-active"` for an in-scope resolvable warning (`UseRawControl.tsx:~99`), so a not-yet-decided but resolvable warning correctly reads `Fix`. Actionability does not depend on a prior decision, only on scope + resolvability.
- **Zero entries:** callout is not rendered at all (call-site guard `calloutEntries.length > 0`, line 719) — no button, unchanged.
- **Entries at / over the cap:** each shown row gets its own actionability-resolved label; overflow line unchanged. Cap logic (`CALLOUT_MAX_ENTRIES = 3`, line 496) untouched. Note the cap is applied AFTER tagging, so an entry hidden behind "+N more" still carried a correct label had it shown.

## 5. Dimensional invariants

None affected. No fixed-dimension parent / flex-child relationship changes — this is a text swap inside an existing inline-flex button (`min-h-tap-min items-center`, line 586). Tap target stays ≥44px (`--spacing-tap-min` = 44px, DESIGN.md:195); the button already carries `min-h-tap-min`. The critique P1b tap-target concern was already refuted by the passing §15 real-browser audit (≥44px); this change does not alter button box geometry.

## 6. Transition inventory

The callout has no multi-state animation surface touched by this change. States:
- `flagged` ↔ `judgment` — determined at render by the `variant` prop; a section does not morph between them at runtime (instant, no animation — pre-existing, `§H N2` "instant — deliberate", line 598/716).
- Button label is static per variant; hover/focus is the pre-existing focus-ring/underline (unchanged).

No `AnimatePresence`, no ternary render entering/leaving on this label. Nothing to add.

## 7. Test impact (anti-tautology)

**Fixture actionability reality (verified against live helpers):**
- `warning(kind)` (test helper, `Step3ReviewModal.test.tsx:85`) → `code: "SOME_CODE"`. Not in `AMBIGUITY_CODES` (`lib/parser/ambiguityCodes.ts:19`) → its section is **flagged**; not in use-raw `IN_SCOPE`, not `UNKNOWN_ROLE_TOKEN` → **`offersFix === false`** → label **`Review in Parse warnings`**.
- `judgmentWarning(kind, field)` → `code: "ROOM_HEADER_SPLIT_AMBIGUOUS"`, no `resolution` → section **judgment** (calm) → **`Review`** (and `offersFix` false anyway: `deriveUseRawControlState` → `"legacy-unavailable"`).
- **New fixable-flagged fixture required to exercise `Fix`:** a warn with `code: "UNKNOWN_ROLE_TOKEN"`, `roleToken: "<non-empty>"`, `blockRef.kind` on a rendered section. Not ambiguity-class → **flagged**; token present → `RoleRecognizeControlBoundary` renders → **`offersFix === true`** → **`Fix in Parse warnings`**. (A resolvable use-raw `Fix` needs a MIXED section — an in-scope resolvable warn PLUS a non-ambiguity warn so the section is flagged not judgment — heavier to build; the role-token fixture is the canonical `Fix` case.)

**Locator vs semantic assertions.** Tests that only need to *find* an entry jump button (to click / count) must match `/^(?:Fix|Review) in Parse warnings/` (anchored `^` excludes the overflow button "+N more in Parse warnings", which contains neither verb). The `/View details/` matchers at lines 1882, 2377, 2393, 2491, 2534 update to this locator regex — NOT to `/Fix.../`, since those crew fixtures are `SOME_CODE` (flagged, non-fixable) and now render `Review`.

**Semantic label assertions (the new coverage that catches the Codex R2 defect — a `Fix` label on a non-fixable flagged row):** in the same test file, three fixtures asserting the exact verb, so a blanket-verb or inverted-verb regression fails:

| Fixture | Section status | `offersFix` | Asserted accessible-name matcher |
| --- | --- | --- | --- |
| `warning("crew")` (SOME_CODE) | flagged | false | `/^Review in Parse warnings\b/` (flagged does NOT blanket-`Fix`) |
| `UNKNOWN_ROLE_TOKEN` + token | flagged | true | `/^Fix in Parse warnings\b/` |
| `judgmentWarning(...)` | judgment | (n/a) | `/^Review in Parse warnings\b/` |

**Accessible-name caveat (do NOT assert exact equality):** the visible label is followed by the preserved sr-only suffix " for {title}" (§2.1), so the button's *accessible name* is `Fix in Parse warnings for <title>`, not the bare label. Matchers MUST be prefix/substring regexes anchored at `^`, never exact-string equality — an exact match would either fail or pressure the implementation to drop the per-warning uniqueness suffix, an a11y regression in a repeated-button list. To pin the visible text distinct from the sr-only tail, assert the button's non-sr-only text content separately (clone the button, remove the `.sr-only` span, assert `textContent === "Fix in Parse warnings"`). Overflow-line matchers (`/more in Parse warnings/`, lines 2384/2396/2563) are UNCHANGED and must keep passing (proves we did not touch the overflow copy).

**Predicate unit test** (`tests/admin/warningFixAffordance.test.tsx`): `warningOffersFix` returns true for `UNKNOWN_ROLE_TOKEN`+token, for each in-scope resolvable use-raw code, and via a persisted `decision`; false for empty/absent role token, `SOME_CODE`, in-scope-but-`legacy-unavailable` (no resolution), and in-scope-but-`resolvable:false` (`disabled`). Derive expected from the code taxonomy, not hardcoded booleans per case where a loop over `AMBIGUITY_CODES`/`IN_SCOPE` is clearer. **Severity is deliberately NOT part of the predicate contract:** `warningOffersFix(warning, decision)` takes no `severity` and the live boundary render gates (`UseRawControl.tsx:65-83`, `RoleRecognizeControlBoundary.tsx:51-52`) do not check it — so the predicate returns true for an in-scope code regardless of severity. Do not assert an "info-severity → false" case; it would contradict the actual (severity-agnostic) contract. Severity gating happens upstream (only warn-severity warnings ever reach the callout, via `warningsBySection`), not in this predicate.

## 8. Files touched

- **NEW** `lib/admin/warningFixAffordance.ts` — `warningOffersFix(warning, decision)` (§2.2).
- `components/admin/review/ShowReviewSurface.tsx` — tag each `calloutEntries` item with `offersFix` at the producer (`~835`); import `warningOffersFix` + `findUseRawDecision`.
- `components/admin/wizard/step3ReviewSections.tsx` — (a) chrome type `calloutEntries` (line 463) + `SectionFlagCallout` `entries` prop (line 533) gain **optional** `offersFix?: boolean` (§2.3); (b) label picker in `SectionFlagCallout` (replaces line 588 "View details"); (c) two stale "View details" code-comments (lines 540, 593).
- **NEW** `tests/admin/warningFixAffordance.test.tsx` — predicate unit + parity meta-test (§9).
- `tests/components/admin/wizard/Step3ReviewModal.test.tsx` — locator + semantic matchers per §7, INCLUDING the stale test-title string at `:2480` ("jump: click 'View details' → …" → the new label wording).
- `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx` — jump-button locators at `:885,917,946` (`/View details/` → `/^(?:Fix|Review) in Parse warnings/`).
- `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` — label-text assertions at `:329,423` (`getByText(/View details/)` → `/^Review in Parse warnings/`) and the comments at `:325,419`. These fixtures construct `calloutEntries` WITHOUT `offersFix` (optional → typecheck OK) and their warnings are non-fixable, so the preview renders `Review`; the tests assert the jump STILL renders (anti-overstrip), so only the label string changes.
- `tests/e2e/step3-review-modal.interactions.spec.ts` — §K13 test title (`:607`), comment (`:613`), and `getByRole` locator (`:619`): the harness seeds `HARNESS_CREW_WARNING` (non-fixable, `_step3ReviewModalHarness.tsx:88`) → flagged, `offersFix` false → **`Review in Parse warnings`**. Update the name matcher + wording.
- `tests/e2e/step3-review-modal.layout.spec.ts` — callout-button references at `:39,411,420` (label in comment + the `"callout View details"` band label) → `Review in Parse warnings` wording.
- `tests/e2e/_step3ReviewModalHarness.tsx` — doc-comments at `:53,54` describing "View details" rows → the new label (comment-only; no behavioral change).
- `DEFERRED.md` → `DEFERRED-archive.md` — move CALLOUT-PREVIEW-ACTION-CUE-1 on close-out; reconcile the resolved twin `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION` reference.

**Class-sweep note (`rg "View details"` over CODE + TESTS):** every non-generated reference to the old label lives in the files above plus the source file (`step3ReviewSections.tsx:540,588,593`). No other component, page, or fixture references it. This list is the complete `View details` → new-label migration surface; TDD tasks update each cited line and a final **`rg "View details" components/ app/ tests/`** must return zero hits before close-out. The gate is deliberately scoped to active code + tests — it does NOT include `docs/`, because prose that legitimately keeps the historical label (this spec, the prior `2026-07-17-use-raw-callout-preview-demotion` spec, `DEFERRED*.md`) must not be rewritten; those are intentional historical references, not migration debt.

## 9. Meta-test inventory

**CREATES** one parity meta-test in `tests/admin/warningFixAffordance.test.tsx`: asserts `warningOffersFix`'s verdict stays in lockstep with the two boundaries' actual render gates —
- use-raw branch ≡ `deriveUseRawControlState(w, decision, false) ∉ {null, "legacy-unavailable", "disabled"}` (the interactive-toggle states), driven across every `IN_SCOPE` code × {no-resolution, resolvable:false, resolvable:true} × {decision present/absent} — a direct call to the live deriver (not a re-implementation);
- role branch ≡ `RoleRecognizeControlBoundary` non-null gate, verified by **RENDERING the boundary** (jsdom, with its three server-action modules mocked) across `UNKNOWN_ROLE_TOKEN` × {absent token, empty token, whitespace token, real token} plus a non-role code, asserting `container.firstChild !== null` ⟺ `warningOffersFix` true. Rendering — not re-deriving the gate expression — is what makes this a real pin rather than a tautology.

This closes the drift class: if either boundary's render condition changes without updating the predicate, the meta-test fails. No new mutation surface, Supabase call boundary, admin_alert code, advisory lock, or §12.4 catalog row is introduced.

## 10. Out of scope

- Rewording the judgment lead line (§2.1).
- Any change to `WarningsBreakdown` controls or the overflow jump.
- Icon / tone / animation changes.
- Onboarding or first-run coaching for the callout.
