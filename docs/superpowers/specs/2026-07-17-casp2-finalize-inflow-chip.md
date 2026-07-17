# CASP2-4 item 1 — StatusStrip finalize hint: absolute overlay → in-flow chip

**Slug:** `casp2-finalize-inflow-chip` · **Date:** 2026-07-17 · **Class:** UI polish (transient-state presentation) · **Backlog:** `BL-CASP2-STRIP-POLISH` (sole open CASP2 residual) · **Implementer:** Opus / Claude Code (UI = always Opus, ROUTING.md hard rule) · **Effort:** S

## 1. Problem

The inline `PublishedToggle` (`components/admin/PublishedToggle.tsx`) renders its finalize hint through the **shared** `POPOVER_POSITION` constant (`PublishedToggle.tsx:58`), an `absolute inset-x-0 top-full` full-strip-width banner that hangs **below** the sticky `StatusStrip`. The same constant serves the error skin (`PublishedToggle.tsx:128`) and the finalize skin (`PublishedToggle.tsx:147`); a unit parity test pins them byte-equal (`tests/components/admin/PublishedToggle.test.tsx:270`).

For the **error** skin this is fine — an error is momentary, user-triggered, and cleared on the next toggle. For the **finalize** skin it is the residual defect: `finalizeOwned` is a longer-lived *server* state (a publish/finalize apply window), so the absolute banner floats as an **overlay over the top slice of the Overview rail content** for the entire finalize window. `BL-CASP2-STRIP-POLISH` tracks exactly this: "the calm finalize banner … persists as an absolute overlay for the whole finalize window."

## 2. Goal & non-goals

**Goal.** The finalize hint stops overlaying rail content. It becomes a compact **in-flow** chip beside the switch, inside the sticky strip's own flow — so it can never sit on top of content below the strip.

**Non-goals.**
- **Error skin unchanged.** The error/generic-retry path keeps the absolute `POPOVER_POSITION` banner (momentary, and its long `ErrorExplainer`+`HelpAffordance` copy needs the full-width break-words banner to stay in-viewport at 390px — spec §8.10d). This change **splits** the previously-shared mechanism; it does not touch the error path.
- No change to the finalize *semantics*: the switch still disables on `finalizeOwned` alone, still exposes the hint via `aria-describedby`, still uses `role`-less calm styling (NOT `role="alert"`).
- No change to `StatusStrip.tsx` (the chip lives entirely inside `PublishedToggle`'s inline container). No DB, no advisory locks, no error codes, no new `messageFor` routing.
- No animation (no spinner) — avoids adding any `animate-*`/motion surface to the transition-audit guard; the chip is a static text pill.

## 3. Design

### 3.1 Mechanism split

`POPOVER_POSITION` is retained **only** for the error skin (its comment is retro-scoped to "error banner only"). A new compact-chip class constant governs the finalize skin:

```
FINALIZE_CHIP =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border border-border-strong " +
  "bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-subtle"
```

- **In-flow, not absolute.** No `absolute` / `inset-x-0` / `top-full` / `mt-1` / `z-40`. The chip is a normal flex sibling of the `<form>` inside the `published-toggle-inline` container (`inline-flex items-center gap-2`, `PublishedToggle.tsx:114`), so the existing `gap-2` spaces it after the switch and it sits **within** the strip's flow row.
- **Compact.** `text-xs` pill (`px-2 py-0.5`), calm sunken plate + strong border — same treatment family the archived/alert strip badges use, so it reads as strip chrome-adjacent signal, not a floating message. `whitespace-nowrap` + `shrink-0` keep it on one line and prevent it collapsing.
- **Retained identity.** Keeps `id={popoverId}` and `data-testid="published-toggle-popover"` (the e2e harness and S4 unit test both resolve the finalize element by that testid; the switch's `aria-describedby` points at that `id`). No `role` (calm, non-alert — unchanged from today).

### 3.2 Visible vs accessible copy (mode boundary)

The full sentence is long for an inline strip chip, so the chip shows a **compact visible label** and carries the **full explanation** in an `sr-only` span (both inside the chip → `aria-describedby` reads the whole textContent, and the S4 substring assertion still passes).

Visible label is mode-dependent, mirroring the two finalize modes already in `subline` (`PublishedToggle.tsx:86-92`):

| Mode (`finalizeOwned === true`) | Visible label | `sr-only` full copy (= existing `subline`) |
| --- | --- | --- |
| `published` (Live + finalize-owned, R2/R3) | `Finalizing…` | `Changes are being finalized — the switch unlocks when they commit.` |
| `!published` (publish finishing) | `Publishing…` | `A publish is finishing — the switch unlocks when it's done.` |

Ellipsis is the `…` character (U+2026), consistent with the existing curly-punctuation discipline (`RETRY_COPY` uses U+2019). The visible short label is a **new literal** with no `messageFor` code — it is a codeless in-product hint, same class as the existing `subline`/`RETRY_COPY` (carries the same `not-subject:M5-D8` rationale — no catalog code to route).

### 3.3 Precedence (unchanged)

`showError = errorCode != null || genericError`; `showFinalize = !showError && finalizeOwned`. Error wins over finalize (S5). The `showError`/`showFinalize` conditional **structure is unchanged** — only the finalize branch's rendered element changes from an absolute banner to the in-flow chip. No new conditional is introduced.

## 4. Guard conditions

- **`finalizeOwned === false`** → `showFinalize` false → no chip renders (unchanged).
- **Error present while `finalizeOwned` true** (S5) → `showError` true suppresses `showFinalize`; the absolute **error** banner renders, chip does not. Error-wins precedence intact.
- **`published` null** → not possible at this callsite (`published: boolean`, server-computed, never null — `PublishedToggleProps.published`, `PublishedToggle.tsx:65`). The `published` boolean only selects which of the two visible labels shows.
- **Empty/zero copy** → labels are constant literals, never empty.

## 5. Dimensional invariants (in-flow containment)

The whole point of the change is a containment invariant, verified in a **real browser** (jsdom computes no layout — global CLAUDE.md layout-dimensions rule):

- **CI-1 (no overhang / no overlay).** The finalize chip's bounding box is **fully within** the strip's bounding box: `chip.top >= strip.top − 0.5` AND `chip.bottom <= strip.bottom + 0.5`. This is the precise proof the chip does not overlay content below the strip. (The pre-change absolute banner fails this — its `bottom > strip.bottom`.)
- **CI-2 (in-viewport at 390px).** `chip.left >= 0` AND `chip.right <= 390`; no document horizontal scroll.
- **CI-3 (right-of-switch, compact — not a banner).** `chip.left >= switch.right − 0.5` (sits after the switch in flow) AND `chip.width < 200` (a compact pill, NOT the >300px full-strip banner the old finalize skin was).

Parent→child dimension relationships: the chip is a flex child of `published-toggle-inline` (`inline-flex items-center`); `items-center` governs cross-axis, no stretch dependency. The strip row (`flex flex-wrap items-center`, `StatusStrip.tsx:137`) sizes to its tallest child; the `text-xs py-0.5` chip is shorter than the `h-7` switch, so at ≥sm the row height is switch-governed and the chip introduces no new wrap. (CI-1 verifies containment regardless; a legitimate one-line height growth on the wrapped 390px row would still satisfy CI-1 because the chip stays inside the strip box — it pushes content down, never overlays it, which is the desired behavior.)

## 6. Transition inventory

`PublishedToggle` inline has three mutually-exclusive display states for the popover region: **none** (idle), **error banner** (absolute), **finalize chip** (in-flow). All transitions are **instant — no animation** (matches today; the component imports no motion library and this change adds none):

| From → To | Treatment |
| --- | --- |
| none → finalize chip | instant (chip mounts) |
| finalize chip → none | instant (chip unmounts when finalize completes) |
| none → error banner | instant (unchanged) |
| error banner → none | instant (unchanged) |
| finalize chip → error banner | instant — error-wins precedence swaps the branch (S5 compound: error preserved across a finalize flip; the chip never co-renders with the banner) |
| error banner → finalize chip | not reachable in practice (error clears only on next toggle, which also re-evaluates finalize) — if it occurred it is an instant branch swap |

No `AnimatePresence`, no `exit`/`initial`/`animate` props, no `animate-*` utility. The `showError`/`showFinalize` ternary count in `PublishedToggle.tsx` is unchanged (the finalize arm's markup changes, the conditional does not).

## 7. Test plan (TDD)

### 7.1 Unit — `tests/components/admin/PublishedToggle.test.tsx`

- **S4 (L218) — extended, still green in spirit.** Keep: disabled switch, `role != "alert"`, `aria-describedby` → chip `id`, `id === "published-toggle-popover-s1"`, textContent contains `"Changes are being finalized"` (now satisfied via the `sr-only` full-copy span). **Add:** the chip's className contains **none** of `absolute`/`top-full`/`inset-x-0` (proves in-flow), and contains the `FINALIZE_CHIP` skin tokens (`bg-surface-sunken`, `border-border-strong`, `text-xs`). Add a `!published` finalize case asserting visible `Publishing…` + sr-only `"A publish is finishing"`.
- **Parity test (L270) — rewritten.** Its premise ("error and finalize share the EXACT positioning class set") is now false by design. Replace with two assertions:
  1. **Error skin** still carries every `POPOVER_POSITION` token (`absolute inset-x-0 top-full z-40 mt-1 break-words rounded-sm p-2 text-sm shadow-tile`) + `ERROR_SKIN`, and no `FORBIDDEN` geometry (single-side anchor / width cap) — the CASP2-2 banner invariant is preserved for errors.
  2. **Finalize chip** carries **none** of `{absolute, inset-x-0, top-full, z-40, mt-1}` (in-flow) and carries the `FINALIZE_CHIP` tokens. Anti-tautology: extract tokens from the rendered chip className (the data source), not from a container.
- **S1/S2/S3/S5 unchanged** — error path and idle path untouched. S5 still asserts the **error** banner wins (`role="alert"`) when a refusal is preserved across a finalize flip.

### 7.2 e2e — `tests/e2e/statusStripToggleLayout.spec.ts` (real browser, 390px)

The harness (`_statusStripToggleHarness.tsx`) renders the **real** `StatusStrip`/`PublishedToggle`, so the finalize markup updates automatically; no harness change needed beyond the doc comment. Rewrites:

- **(a) L151 — rewritten to CI-1 containment.** Was "absolute popover adds zero strip-flow height (idle === finalize)". Replace with: the finalize chip's box is fully within the strip's box (`chip.top >= strip.top − 0.5`, `chip.bottom <= strip.bottom + 0.5`) — proves in-flow, no overhang/overlay. Measured on `finalizeShort`.
- **(c) L168 — rewritten to CI-2/CI-3 compact geometry.** Was "finalize popover is a full-strip-width banner … stable across title length". Replace with: chip is in-viewport (`left >= 0`, `right <= 390`, no h-scroll), sits right-of-switch (`chip.left >= switch.right − 0.5` using `published-toggle` testid), and is compact (`width < 200`, i.e. NOT the >300px banner). The "identical x across title length" sub-check was banner-specific → dropped.
- **(b) compaction, (d) error-content banner, (e) control divider — UNCHANGED.** (d) still proves the **error** banner content stays in-viewport as a full-width break-words banner.
- Update the file's header invariant comment block (§8.10 (a)/(c)) to describe the in-flow chip instead of the absolute finalize banner.

### 7.3 Anti-tautology notes

- CI-3 measures the chip vs the **switch** (`published-toggle`), not the strip container, so a chip that failed to sit after the switch can't pass by accident.
- Unit token assertions extract from the rendered element's own className, and assert **absence** of the absolute-geometry tokens (a chip that regressed to absolute would fail), not merely presence of skin tokens.

## 8. UI quality gate (invariant 8)

Affected files include `components/admin/PublishedToggle.tsx` (a `components/` UI surface), so the impeccable v3 dual-gate applies: `/impeccable critique` AND `/impeccable audit` on the diff (canonical v3 setup: `context.mjs` context load → register reference read), P0/P1 fixed or deferred via `DEFERRED.md`, findings + dispositions recorded, run **before** the Codex whole-diff review and **before** close-out. Real-browser Playwright assertions (§7.2) satisfy the layout-dimensions requirement.

## 9. Files touched

| File | Change |
| --- | --- |
| `components/admin/PublishedToggle.tsx` | Split `POPOVER_POSITION` (error-only); add `FINALIZE_CHIP`; render finalize as in-flow chip with compact visible label + `sr-only` full copy. |
| `tests/components/admin/PublishedToggle.test.tsx` | Extend S4; rewrite the L270 parity test; add `!published` finalize case. |
| `tests/e2e/statusStripToggleLayout.spec.ts` | Rewrite (a) → CI-1 containment, (c) → CI-2/CI-3 compact; update header comment. (b)/(d)/(e) unchanged. |
| `tests/e2e/_statusStripToggleHarness.tsx` | Doc-comment only (renders real components; markup auto-updates). |
| `DEFERRED.md` / `BACKLOG.md` | Mark CASP2-4 item 1 / `BL-CASP2-STRIP-POLISH` RESOLVED (twin-row reconcile). |

## 10. Out of scope

- Error/generic-retry banner mechanism (stays absolute `POPOVER_POSITION`).
- `StatusStrip.tsx` structure, control-divider (CASP2-4 item 2, already shipped), alert-badge focus-ring (item 3, shipped).
- Global `--color-status-live` hue, card variant, dashboard.
