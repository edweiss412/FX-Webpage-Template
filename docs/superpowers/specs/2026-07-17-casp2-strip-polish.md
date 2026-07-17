# Spec — CASP2-4 / BL-CASP2-STRIP-POLISH StatusStrip polish

**Date:** 2026-07-17
**Slug:** `casp2-strip-polish`
**Surface:** `components/admin/showpage/StatusStrip.tsx` (UI — Opus-owned; invariant 8 impeccable dual-gate applies)
**Origin:** DEFERRED.md CASP2-4 (P2/P3), the residual of the CASP-2 inline-toggle-variant work (PR #425/#430). Backlog handle `BL-CASP2-STRIP-POLISH` was referenced in DEFERRED.md but never actually written into `BACKLOG.md`.

---

## 1. Problem

CASP2-4 bundled three pre-existing `StatusStrip` treatments (DEFERRED.md:623):

1. **Finalize popover persistent overlay** (P2/P3) — the calm finalize banner in the inline `PublishedToggle` persists for the whole finalize window.
2. **Two adjacent orange** (P3) — on a published + live show, the ON publish switch (`bg-accent`, `PublishedToggle.tsx:229`) sits beside the "Live now" badge dot (`bg-status-live`, `StatusIndicator.tsx:19`), and `--color-status-live: var(--color-accent)` (`app/globals.css:89`) — the **same hue** — so the control and the signal read as one orange smear.
3. **Alert-badge focus-ring lacks ring-offset** (P3) — the strip alert badge focus ring is `focus-visible:ring-2 focus-visible:ring-focus-ring` (`StatusStrip.tsx:159`) with no offset, while the publish switch uses `focus-visible:ring-offset-2 focus-visible:ring-offset-surface` (`PublishedToggle.tsx:228`). Inconsistent focus treatment on adjacent strip controls.

## 2. Scope

**In scope (this spec resolves):**

- **Item 2 (approach A — divider separation).** Insert a second vertical divider between the toggle cluster (control) and the status-signal cluster (Live / sync / alert) so the two oranges no longer abut. No token change; the global `--color-status-live: var(--color-accent)` DESIGN.md decision (live = brand orange + ping) is untouched. Chosen over re-hueing the live token (global fan-out to the dashboard + a DESIGN.md amendment) or a strip-local live variant (strip live ≠ dashboard live). Approach selected by the user from a rendered mockup comparison.
- **Item 3 (focus-ring offset).** Add `focus-visible:ring-offset-2 focus-visible:ring-offset-surface` to the strip alert badge, matching the switch.

**Out of scope (stays deferred):**

- **Item 1 (finalize overlay).** Bounded to the finalize window — a transient server state — and the banner mechanism is deliberately shared with the error skin (`PublishedToggle.tsx` `POPOVER_POSITION`, one source carried by both skins, pinned equal by tests). Reworking it would diverge the finalize skin from the error skin inline. Recorded as `BL-CASP2-STRIP-POLISH` in `BACKLOG.md`. Working-as-intended; no defect.

No DB, no advisory-locks, no server actions, no new error codes, no migrations. Pure presentational change to one client component + two doc updates (`BACKLOG.md`, `DEFERRED.md`).

## 3. Design — Item 2 (divider separation)

The strip is a single `flex flex-wrap items-center gap-x-4 gap-y-2` row (`StatusStrip.tsx:104-107`). Today it renders, in order:

```
title · [divider · toggle]   (only when ¬archived)
      · live badge           (only when ¬archived && isLive)
      · sync age             (only when syncLabel != null && sync != null)
      · alert badge          (only when alertCount > 0)
      · copy-link            (ml-auto; only when copyUrl != null)
```

The existing divider (`StatusStrip.tsx:126`) sits **before** the toggle (separating title from control). We add a **second divider of the identical recipe** — `hidden h-5 w-px shrink-0 bg-border sm:block`, `aria-hidden="true"` — **after** the toggle cluster and **before** the first status signal.

### 3.1 Render condition (the guard)

The new divider renders **iff**:

```
!archived && (isLive || (syncLabel != null && sync != null) || alertCount > 0)
```

Rationale — the divider only makes sense when BOTH a control (the toggle, present only when `!archived`) AND at least one following signal exist to separate. Under the outer `!archived` conjunct, the three inner disjuncts are the render conditions of the three signal elements: live's own condition is `!archived && isLive` (`StatusStrip.tsx:139`), sync's is `syncLabel != null && sync != null` (`:145`), alert's is `alertCount > 0` (`:151`). The `!archived` factor is already the divider's outer guard, so `isLive` alone inside the disjunction is equivalent to live's full condition here. The divider therefore appears if-and-only-if ≥1 signal will render beside the toggle.

`syncLabel != null && sync != null` mirrors the sync element's own guard verbatim (`StatusStrip.tsx:145`) — a single named boolean `hasSignal` is computed once and reused so the condition cannot drift from the elements it gates (self-consistency).

### 3.2 Placement

The divider is a sibling in the flex row, emitted **between** the archived/toggle block (`StatusStrip.tsx:117-137`) and the live-badge block (`:139`). Because `copy-link` carries `ml-auto` (`:167`), it is always pushed to the far right regardless of how many signals/dividers precede it — the new divider never disturbs the copy-link's right anchor.

The divider is `hidden … sm:block` — like the first divider, it is **suppressed below the `sm` breakpoint** (< 640px). On mobile the row wraps (`flex-wrap`, `gap-y-2`) and vertical dividers between wrapped items read as noise; the existing divider already makes this call and we match it exactly (mode consistency). At 390px there is therefore no divider and no regression to the CASP-2 §8.10 mobile geometry.

## 4. Design — Item 3 (focus-ring offset)

Append `focus-visible:ring-offset-2 focus-visible:ring-offset-surface` to the alert badge className (`StatusStrip.tsx:159`). The badge already has `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`; the two offset utilities complete the recipe to byte-match the switch (`PublishedToggle.tsx:228`). `ring-offset-surface` (not `ring-offset-bg`) is correct because the strip background is `bg-surface` (`StatusStrip.tsx:106`) — the offset ring must inset against the element's actual ground so the gap reads. No other change to the badge (hit-area `before:-inset-y-3`, hover, colors all unchanged).

## 5. Guard conditions (per element)

| Prop | null / 0 / edge | Rendered result |
|---|---|---|
| `archived = true` | — | No toggle, no new divider (guard's `!archived` is false), no live badge. Archived branch unchanged. |
| `isLive=false, lastSyncedAt=null, alertCount=0` (published, never synced, no alerts) | all three signal disjuncts false | `hasSignal=false` → **no new divider**. Strip is `title · divider · toggle` then copy-link (if active). Prevents a dangling divider pointing at nothing. |
| `isLive=true` only | first disjunct true | divider renders before the live badge. |
| `alertCount>0` only (not live, never synced) | third disjunct true | divider renders before the alert badge (which is then the first signal). |
| viewport < 640px | `hidden sm:block` | both dividers suppressed; no divider at 390px (CASP-2 §8.10 geometry preserved). |

## 6. Mode boundaries

- **Not archived:** title · divider · toggle · **[new divider iff hasSignal]** · live? · sync? · alert? · copy-link?
- **Archived (read-only):** title · archived badge · sync? · alert? — unchanged. NOTE the alert badge (`StatusStrip.tsx:151`) has NO `archived` guard, so an archived show with `alertCount > 0` DOES render it; the archived branch only suppresses the toggle, copy-link, and live badge. The new divider's `!archived` guard makes it structurally impossible here (the archived branch renders no toggle, so there is no control to separate from signals) — even an archived + alert show shows no control divider, which is correct.

## 7. Dimensional invariants

The strip is not a fixed-height parent imposing dimensions on flex children (it is `py-2`, content-height). The divider is a fixed `h-5 w-px` element sized by its own utilities, not stretched by the parent. No parent→child dimension relationship is introduced; **no Playwright `getBoundingClientRect` height-parity assertion is required** for the divider (it is intrinsically sized, `w-px` / `h-5`). The real-browser gate's role here is presence/visibility at the `sm` breakpoint, not height parity — see §9.

## 8. Transition inventory

The strip has no animated visual states of its own (the only motion is the live dot's `animate-ping` inside `StatusIndicator`, unchanged). The new divider has two states — **present** and **absent** — driven by `hasSignal` and the `sm` breakpoint. Both transitions are **instant — no animation needed**: signals appear/disappear on server-data refresh (a full island re-render), not via an in-place animated state machine, and there is no `AnimatePresence` or ternary-with-transition anywhere in `StatusStrip.tsx`. Item 3 changes only a focus-ring (a `:focus-visible` state, browser-native, already instant). No compound transitions exist.

## 9. Testing

TDD per invariant 1. Anti-tautology: assert the divider's render **condition**, not merely that some divider exists.

### 9.1 Unit (`tests/components/admin/showpage/statusStrip.test.tsx`)

The component has no `data-testid` on the dividers today. Add `data-testid="strip-control-divider"` to the **new** divider only (the title divider stays untested/undecorated — it is not under change) so tests can scope to it precisely.

- **renders the control divider when the ONLY signal is `isLive`** — `isLive=true`, **`lastSyncedAt=null`, `alertCount=0`** (overriding `baseProps`, which sets `lastSyncedAt: SYNCED_12M` at `tests/components/admin/showpage/statusStrip.test.tsx:54` — without nulling it the sync signal co-fires and a guard that dropped the `isLive` disjunct would still pass). → `getByTestId("strip-control-divider")` present. Failure mode: guard omits `isLive`.
- **renders the control divider when the only signal is an alert** (not live, `lastSyncedAt=null`, `alertCount=1`) → present. Proves the guard keys on `hasSignal`, not specifically on `isLive` — and isolates the alert disjunct the same way.
- **omits the control divider when there is no signal** (published, `isLive=false`, `lastSyncedAt=null`, `alertCount=0`) → `queryByTestId("strip-control-divider")` is null. The failure mode this catches: a dangling divider after the toggle pointing at empty space.
- **omits the control divider when archived** (even with `lastSyncedAt` set so a sync signal renders) → null. Proves the `!archived` conjunct; the archived mode must show zero control affordances so a control/signal separator is meaningless.
- **control divider carries the responsive-suppression + a11y recipe** → its className includes `hidden`, `sm:block`, and it is `aria-hidden="true"` (decorative; not announced).
- **alert badge focus ring includes ring-offset** → the `strip-alert-badge` className contains `focus-visible:ring-offset-2` and `focus-visible:ring-offset-surface`. Failure mode: the offset silently dropped, leaving the badge's focus ring inconsistent with the switch.

### 9.2 Real-browser (`tests/e2e/statusStripToggleLayout.spec.ts`, §8.10 family)

jsdom does not evaluate `hidden sm:block` responsive visibility or real layout. Add a §8.10 assertion:

- At **≥ sm width** (e.g. 800px), a published + live show renders `strip-control-divider` with a non-zero rendered width (`getBoundingClientRect().width > 0`) positioned between the toggle cluster's right edge and the live badge's left edge (`toggle.right <= divider.left` and `divider.right <= liveBadge.left`, within a 0.5px tolerance). This is the assertion that proves the divider actually separates control from signal in real layout, not merely that it exists in the DOM.
- At **390px**, `strip-control-divider` has `getBoundingClientRect().width === 0` (Tailwind `hidden` → `display:none`), confirming the mobile geometry is unchanged (no new element intrudes on the CASP-2 §8.10 390px invariants).

## 10. Numeric sweep

- Dividers after this change: **2** (title→control at `:126`, control→signal new). Both `h-5 w-px`, both `hidden sm:block`.
- Signal render disjuncts in the guard: **3** (isLive, sync, alert) — matching the 3 signal elements at `:139`, `:145`, `:151`.
- `ring-offset-2` — the single numeric literal added to item 3; matches `PublishedToggle.tsx:228` (`ring-offset-2`). No other magic numbers introduced.

## 11. Existing-code citations

| Claim | Cite |
|---|---|
| strip is one flex-wrap row | `components/admin/showpage/StatusStrip.tsx:104-107` |
| existing title→toggle divider recipe | `components/admin/showpage/StatusStrip.tsx:126` |
| toggle cluster block | `components/admin/showpage/StatusStrip.tsx:127-137` |
| live badge render + condition | `components/admin/showpage/StatusStrip.tsx:139-143` |
| sync age render + guard | `components/admin/showpage/StatusStrip.tsx:145-149` |
| alert badge (ring at :159, block :151-164) | `components/admin/showpage/StatusStrip.tsx:151-164` |
| copy-link ml-auto right anchor | `components/admin/showpage/StatusStrip.tsx:167` |
| switch ON = bg-accent | `components/admin/PublishedToggle.tsx:229` |
| switch focus-ring-offset recipe | `components/admin/PublishedToggle.tsx:228` |
| live badge dot = bg-status-live | `components/admin/StatusIndicator.tsx:19` |
| status-live = accent (same hue) | `app/globals.css:89` |
| unit test suite | `tests/components/admin/showpage/statusStrip.test.tsx` |
| real-browser §8.10 suite | `tests/e2e/statusStripToggleLayout.spec.ts:148` |
| CASP2-4 deferral origin | `DEFERRED.md:623` |

## 12. Doc updates (part of this change)

- **`BACKLOG.md`** — add the `BL-CASP2-STRIP-POLISH` row scoped to item 1 only (finalize-overlay, WAI/transient, bundle on a future strip pass). This backlog handle is currently dangling (referenced in DEFERRED.md, absent from BACKLOG.md).
- **`DEFERRED.md`** — update CASP2-4 (`:623`) to mark item 2 (two-orange) and item 3 (focus-ring) **✅ RESOLVED (2026-07-17)** with this branch, leaving item 1 as the sole open residual now tracked in BACKLOG.

## 13. Acceptance criteria

- AC-1: A published + live show renders exactly one divider between the toggle and the live badge at ≥ sm; the two oranges no longer abut.
- AC-2: No control divider renders when the show has no signal (published, not live, never synced, no alerts) or when archived.
- AC-3: At 390px no control divider renders; CASP-2 §8.10 geometry invariants still pass.
- AC-4: The strip alert badge focus ring matches the switch (`ring-offset-2 ring-offset-surface`).
- AC-5: `--color-status-live` and every other `@theme` token are unchanged (grep proof: no diff to `app/globals.css`).
- AC-6: Impeccable critique + audit pass on the diff (invariant 8); adversarial review APPROVE.
- AC-7: `BL-CASP2-STRIP-POLISH` exists in BACKLOG.md; DEFERRED.md CASP2-4 marks items 2+3 resolved.
