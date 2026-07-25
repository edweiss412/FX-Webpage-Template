# Crew-page share-link chrome — backlog closure (2026-07-24)

**Status:** DRAFT · **Branch:** `feat/share-link-chrome-backlog` · **Routing:** Opus / Claude Code (UI — AGENTS.md "Hard rule: UI work is always Opus")

Closes the three open items under BACKLOG.md `## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)`: `BL-CREWPAGE-ROTATE-URL-FLASH`, `BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE`, `BL-CREWPAGE-ROTATE-FOCUS-MGMT`.

Only ONE of the three results in feature code. The other two are closed by deletion and by supersession — both dispositions are grounded in live-code and ratified-spec citations below, not in judgement calls.

---

## §1 Problem

Rotating a show's share-token mints a brand-new crew URL. Every live crew-URL surface updates instantly through the client epoch-gated cache (`app/admin/show/[slug]/ShareTokenContext.tsx:46-49`), and the success banner says _"The updated link is shown above."_ (`app/admin/show/[slug]/RotateShareTokenButton.tsx:279-281`). But the swap itself is **visually silent**: the token is an opaque 64-char random string, so the only thing that changes on screen is a run of characters inside a monospace block. An admin watching the confirmation has no motion cue that the address above it is now different.

The two companion items are stale bookkeeping, not defects — §2 shows why.

### §1.1 Resolved scope — do not relitigate

Each row is a decision already ratified, with the citation that ratifies it. A reviewer should VERIFY the citation, not re-derive the decision.

| # | Resolved decision | Ratification |
|---|---|---|
| R1 | **`BL-CREWPAGE-ROTATE-FOCUS-MGMT` ships ZERO code.** Its requested fix — restoring focus after the rotate resolves — is an explicitly ACCEPTED RESIDUAL, not an open defect. C5 governs cancel/auto-revert paths only; submit-outcome paths get "no focus move, announcement via the surface’s existing `role="alert"`/`role="status"` result element, accepted residual where the control unmounts." Rotate is named by name in the per-surface enumeration. | `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:34` (C5 definition) and `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:82` (submit-outcome matrix case (c), Rotate enumerated) |
| R2 | The **cancel/auto-revert half of that item is already shipped**, so there is nothing left to build even on the governed paths. C3 focuses the cancel button on confirm-open; C5 restores the trigger on cancel/auto-revert. | `app/admin/show/[slug]/RotateShareTokenButton.tsx:115` (C3); `app/admin/show/[slug]/RotateShareTokenButton.tsx:106` and `app/admin/show/[slug]/RotateShareTokenButton.tsx:126` (C5 two-phase guard) |
| R3 | **`app/admin/show/[slug]/ShareChip.tsx` and `app/admin/show/[slug]/CrewPageLink.tsx` are orphans** — imported by no production module. Already recorded as such, with cleanup named as backlog material. This spec is that cleanup. | `docs/superpowers/specs/2026-07-18-admin-show-modal.md:214`; verified live in §11 |
| R4 | **`ShareLinkCopyButton`'s `variant="compact"` is NOT removed** even though this diff deletes its last production call site. It joins `variant="outline"`, which is ALREADY production-orphaned with test-only coverage under a ratified spec. Two variants in the same accepted condition is the status quo, not new debt introduced here. Removing either is a separate decision about that component's API, out of scope. | `docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md:106`; `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:60` (`outline`, test-only) and `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:149` (`compact`) |
| R5 | **Reduced motion renders NO cue at all** — deliberately NOT the shipped `[data-step3-warning-flash]` fallback, which leaves a steady tint (`app/globals.css:848-852`). That fallback is right for a persistent jump-target the user must still locate; it is wrong for a one-shot "this just changed" cue, where a permanent tint would assert a state that is no longer true. Nothing is lost: the `role="status"` banner already announces the change (`app/admin/show/[slug]/RotateShareTokenButton.tsx:271-282`). | This spec §3.4 |
| R6 | **No real-browser test is added.** The standalone Playwright config is invoked by NO CI workflow, so a browser assertion placed there would never run again after authoring. | `BACKLOG.md` `BL-STANDALONE-CONFIG-CI-DARK` |
| R7 | **The cue fires on ANY token change while the panel is open**, including another admin's rotate arriving via `router.refresh()` — not only on this admin's own rotate. A crew URL changing underneath you is exactly the event the cue exists to report. Scoping it to own-rotate-only would need `onRotated` threading that buys nothing. | This spec §3.1 |
| R8 | **`SHARE_LINK_FLASH_MS` is a NEW constant, not a reuse of `WARNING_HIGHLIGHT_MS`** — same 1600ms value, different surface. `WARNING_HIGHLIGHT_MS` is pinned to its own module by the source-marker audit and must stay there. | `components/admin/wizard/Step3ReviewModal.tsx:106`; `components/admin/review/ShowReviewSurface.tsx:59-64` (the comment recording that pinning) |
| R9 | **No new error-catalog code, no telemetry, no server action, no RPC, no migration.** The change is a client-side visual cue plus two file deletions. Plan-wide invariants 2, 3, 4, 5, 9 and 10 have no surface here. | This spec §10 |

---

## §2 Item dispositions

| Backlog item | Disposition | Code delta |
|---|---|---|
| `BL-CREWPAGE-ROTATE-URL-FLASH` | **BUILD** — §3 | `components/admin/showpage/ShareHub.tsx`, `app/globals.css`, `DESIGN.md` |
| `BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE` | **RESOLVE BY DELETION** — §4 | delete two components and their two test files; rework one integration test |
| `BL-CREWPAGE-ROTATE-FOCUS-MGMT` | **CLOSE, SUPERSEDED** — §1.1 R1/R2 | none |

### §2.1 Why the flash item's premise needed correcting first

The backlog entry names three surfaces that "update the crew URL on every surface (header ShareChip, ShareLinkBody card, CrewPageLink)". As of today:

- ShareLinkBody was **deleted** by the share-hub consolidation (`docs/superpowers/specs/2026-07-20-share-hub-design.md:104` — "Removed: CurrentShareLinkPanel, ShareLinkBody, …").
- ShareChip and CrewPageLink are **orphans** (R3).

So exactly ONE live crew-URL surface exists: the `<code data-testid="admin-current-share-link-url">` inside the ShareHub popover (`components/admin/showpage/ShareHub.tsx:713-718`). That is the cue's only target. The header-chip half of the backlog entry ("and the chip") is unreachable and is dropped.

Conveniently the cue's target and its trigger are in the same 308px panel: the rotate row sits roughly five rows below the address (`components/admin/showpage/ShareHub.tsx:772-781`), under the "Careful" heading.

### §2.2 Why the token-discipline item is resolved by deletion

The item asks for two things:

1. Replace the arbitrary `max-w-[16rem]` with a named token (`app/admin/show/[slug]/ShareChip.tsx:28`).
2. Add an explicit `min-w` to the crew-page link, which sets `min-h-tap-min` with no width floor (`app/admin/show/[slug]/CrewPageLink.tsx:28`).

Both components render nowhere (R3). Minting a `--spacing-*` token for a component nobody mounts adds a permanent entry to the design-token surface to describe dead code. The item's own stated trigger — "a DESIGN.md token-discipline sweep" — is satisfied more completely by removing the arbitrary value than by naming it.

The item's parenthetical justification for deferring ("the same magic appears elsewhere") is **factually wrong against the live tree**: `max-w-[16rem]` occurs exactly once across `app/` and `components/` (§11). There is no app-wide pattern to batch with.

---

## §3 The cue (BL-CREWPAGE-ROTATE-URL-FLASH)

**Owner file:** `components/admin/showpage/ShareHub.tsx` · **Target element:** the `<code data-testid="admin-current-share-link-url">` at `components/admin/showpage/ShareHub.tsx:713-718`.

Visual treatment (ratified with the user against a rendered side-by-side mockup): an orange **outline** around the address plus a brief background **wash**, both fading out over 1600ms.

### §3.1 Trigger

The cue fires when `token` from `useShareToken()` (`components/admin/showpage/ShareHub.tsx:173`) changes value **and both the previous and the next value are non-null**.

| Situation | Cue? | Why |
|---|---|---|
| This admin rotates with the panel open | **yes** | the event the cue exists for |
| Another admin's rotate arrives via `router.refresh()` with the panel open | **yes** | R7 — the URL changed under you |
| First render / first panel open | **no** | `prevToken` seeds to `token` at mount, so there is no change to observe |
| `null` becomes a token (transient read fault recovering) | **no** | guarded on `prevToken !== null`. `app/admin/show/[slug]/ShareTokenContext.tsx:61-67` treats a same-epoch null as a transient read fault and KEEPS the held token, so this transition means "the read recovered", not "the link rotated" |
| A token becomes `null` (show went ineligible; authoritative null at a strictly-advanced epoch) | **no** | guarded on `token !== null`; and the target element does not render at all — `linkActive` is false, so the panel shows the unavailable or paused note instead (`components/admin/showpage/ShareHub.tsx:748-764`) |
| `ShareHub` remounts (modal reopened; the provider is keyed by show id, `app/admin/show/[slug]/ShareTokenContext.tsx:24-26`) | **no** | fresh mount reseeds `prevToken` |
| Rotate on an INACTIVE crew link (unpublished or archived) | **no** | `onRotated` is not called at all when `isCrewLinkActive` is false (`app/admin/show/[slug]/RotateShareTokenButton.tsx:165`), so `token` never changes |
| Stale rotation rejected by the monotonic gate (`app/admin/show/[slug]/ShareTokenContext.tsx:47`) | **no** | the gate returns the previous state object; `token` is unchanged |
| Panel closed when the token changes | **no cue on the next open** | §3.3 clears the pending cue whenever `open` is false |

### §3.2 State

Render-phase derived state — the "adjust state when a prop changes" pattern this codebase already uses for exactly this shape of problem (`app/admin/show/[slug]/ShareTokenContext.tsx:51-70`, whose comment records why an effect is the wrong tool here: "no extra commit/flash and no cascading-render lint hazard").

```tsx
/** One-shot highlight window on the crew-URL block after the token changes.
 *  Paired with the `[data-share-link-flash]` keyframes in app/globals.css;
 *  keep this value and the CSS duration in sync (a source-scan test pins it). */
export const SHARE_LINK_FLASH_MS = 1600;

// inside ShareHub, after `const { token, applyRotated } = useShareToken();`
const [prevToken, setPrevToken] = useState(token);
const [flash, setFlash] = useState<number | null>(null);

if (prevToken !== token) {
  setPrevToken(token);
  // Both-non-null: a null on either side is a read fault or an eligibility
  // change, not a rotation (spec 2026-07-24 section 3.1).
  if (prevToken !== null && token !== null) setFlash((n) => (n ?? 0) + 1);
}
// The cue belongs to the panel that was open when the link changed; a token
// change while closed must not replay on the next open.
if (!open && flash !== null) setFlash(null);

useEffect(() => {
  if (flash === null) return;
  const t = setTimeout(() => setFlash(null), SHARE_LINK_FLASH_MS);
  return () => clearTimeout(t);
}, [flash]);
```

Applied to the target element as a bare data attribute — the component declares the HOOK, `app/globals.css` owns the keyframes, duration and reduced-motion collapse. This mirrors the shipped `[data-step3-warning-flash]` split exactly (`components/admin/wizard/Step3ReviewModal.tsx:102-106` documents the same division; `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:201-209` pins it).

```tsx
<code
  data-testid="admin-current-share-link-url"
  {...(flash !== null ? { "data-share-link-flash": "" } : {})}
  className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong"
>
  {url}
</code>
```

**Why a nonce counter and not a boolean.** The nonce is what re-arms the timer: the effect's dependency is `flash`, so a second token change bumps the count, the effect re-runs, the old `setTimeout` is cleared and a fresh 1600ms window starts. With a boolean, setting `true` while already `true` is a no-op and the second change would inherit the first change's remaining window.

**Why no `key` on the element.** The CSS animation restarts because the attribute goes absent then present across two separate commits (it is removed by the timer at 1600ms, and re-added only on a later change). Forcing a remount with `key` would additionally destroy any text selection the admin has made inside the URL block — a real cost for zero benefit. The one case a `key` would handle that this does not — a second token change landing INSIDE an open 1600ms window — requires two rotations of the same show within 1.6 seconds, and each rotation is gated behind a two-tap confirm plus a server round-trip. Unreachable; the nonce still re-arms the timer so the attribute is correctly cleared 1600ms after the LAST change.

### §3.3 Guard conditions (every input state)

Per the mandatory guard-conditions rule. The cue consumes exactly two inputs — `token` (`string | null`) and `open` (`boolean`) — plus its own `flash` (`number | null`).

| Input state | Rendered result |
|---|---|
| `token === null` | target element not rendered (`linkActive` false, so the published or paused note renders instead, `components/admin/showpage/ShareHub.tsx:748-764`); no attribute, no cue |
| `token` unchanged since last render | no attribute |
| `token` changed, either side null | no attribute (§3.1) |
| `token` changed, both non-null, `open === true` | attribute present for `SHARE_LINK_FLASH_MS`, then removed |
| `token` changed, both non-null, `open === false` | `flash` set then immediately cleared in the same render pass; no attribute ever reaches the DOM (the panel is not mounted) |
| panel closed mid-cue | `flash` cleared on the close render; reopening shows no attribute |
| `flash !== null` at unmount | effect cleanup clears the timer; no setState-after-unmount |
| `archived === true` | the whole share half is suppressed (`components/admin/showpage/ShareHub.tsx:704`), so no target element and no cue |

### §3.4 CSS (`app/globals.css`)

Placed adjacent to the existing step3 flash block (`app/globals.css:833-852`) so the two one-shot highlight idioms sit together.

```css
/* ShareHub crew-link block: one-shot highlight after the share-token changes
   (spec 2026-07-24 section 3). Outline plus a brief wash over
   SHARE_LINK_FLASH_MS (1600ms; keep in sync with ShareHub.tsx). Reduced
   motion: NO cue. A one-shot "this just changed" signal has no correct steady
   state, and the rotate banner already announces the change via role=status. */
@keyframes share-link-flash-bg {
  0%,
  45% {
    background-color: var(--color-accent-tint);
  }
  100% {
    background-color: var(--color-surface-sunken);
  }
}
@keyframes share-link-flash-ring {
  from {
    box-shadow: 0 0 0 2px var(--color-accent-edge);
  }
  to {
    box-shadow: 0 0 0 2px transparent;
  }
}
[data-share-link-flash] {
  animation:
    share-link-flash-bg 1600ms ease-out,
    share-link-flash-ring 1600ms ease-out;
}
@media (prefers-reduced-motion: reduce) {
  [data-share-link-flash] {
    animation: none;
  }
}
```

Animates `background-color` and `box-shadow` only — no layout property, so the DESIGN.md layout-property ban holds. No bounce, elastic or overshoot (DESIGN.md motion bans). The wash holds for the first 45% then fades, so the outline and the wash do not both vanish on the same curve — the outline is what carries the tail.

The `1600ms` literal appears in the CSS and as `SHARE_LINK_FLASH_MS` in TypeScript; §9 pins them equal with a source-scan test, matching how the step3 constant is pinned (`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:733`).

### §3.5 Transition Inventory

The crew-URL block has two visual states, so one pair; compound transitions are enumerated separately per the mandatory rule.

| # | Pair | Treatment |
|---|---|---|
| T1 | link-idle to link-flashing | `share-link-flash-bg` plus `share-link-flash-ring`, 1600ms `ease-out`, both from the attribute's arrival. Reduced motion: instant, no cue (R5). |
| T2 | link-flashing to link-idle | Instant — no exit animation. The keyframes' own final frames ARE the settle (`background-color` back to `--color-surface-sunken`, ring to `transparent`), so by the time the attribute is removed at 1600ms the painted result is already identical to idle. Removing it is a no-op repaint. |

Compound transitions:

| # | Compound case | Treatment |
|---|---|---|
| C1 | Cue starts while the rotate success banner mounts (always co-occurs — both are downstream of the same rotate) | Independent subtrees; the banner has no animation of its own (`app/admin/show/[slug]/RotateShareTokenButton.tsx:271-282` is a plain paragraph), so there is nothing to coordinate. Both simply appear. |
| C2 | Panel closes mid-cue | The popover's own dismissal is unchanged. `flash` clears on the close render (§3.2), so the cue does not survive into a later open. |
| C3 | Second token change lands inside an open cue window | Attribute stays present, so the running animation continues rather than restarting; the timer re-arms off the new nonce, so the attribute clears 1600ms after the LAST change. Unreachable in practice (§3.2). |
| C4 | Cue active while the popover is mid-placement (`applyPlacement` writes `max-height`, `left` and `top`, `components/admin/showpage/ShareHub.tsx:234-333`) | Independent properties — placement writes inline geometry on the PANEL, the cue animates paint properties on a descendant `<code>`. Neither reads the other. |
| C5 | Cue active while a sibling child reports busy (`aria-busy` on the panel, `components/admin/showpage/ShareHub.tsx:686`) | Independent; `aria-busy` is an attribute on the dialog with no visual treatment attached to it in this component. |

### §3.6 Dimensional invariants

**N/A.** The cue introduces no fixed-dimension parent and no new flex or grid child relationship. It animates `background-color` and `box-shadow` on an existing element whose box model is untouched — `box-shadow` does not participate in layout, and the element keeps the exact class string it has at `components/admin/showpage/ShareHub.tsx:715`. No parent-to-child dimension relationship changes, so no real-browser dimension assertion is warranted (and per R6 there is nowhere in CI to put one).

### §3.7 Contrast (DESIGN.md)

Measured from the live `app/globals.css` runtime hexes, not asserted from memory. Peak-of-cue state, both themes:

| Pair | Light | Dark | Floor | Verdict |
|---|---|---|---|---|
| `text-strong` on `accent-tint` (address text during the wash) | 16.88:1 | 14.66:1 | 4.5:1 AA | pass |
| `accent-edge` ring vs `accent-tint` (ring inner edge at peak) | 7.41:1 | 8.03:1 | 3:1 non-text | pass |
| `accent-edge` ring vs `surface` (ring outer edge, popover ground) | 8.42:1 | 8.84:1 | 3:1 non-text | pass |
| `accent-edge` ring vs `surface-sunken` (ring inner edge post-wash) | 7.59:1 | 9.65:1 | 3:1 non-text | pass |

The first row is **already pinned** by a shipped test — `tests/styles/status-token-contrast.test.ts:144` asserts `text-strong` on `accent-tint` clears 4.5:1 in both modes. No new row needed for it.

The ring pairs are partly covered: `tests/styles/status-token-contrast.test.ts:222` pins `accent-edge` against bg AND surface in light, and `tests/styles/status-token-contrast.test.ts:231` handles dark. The **uncovered** pair is `accent-edge` against `accent-tint`. §9 adds exactly that row.

DESIGN.md gains: a `SHARE_LINK_FLASH_MS = 1600` row in its interaction-constants section (alongside `WARNING_HIGHLIGHT_MS`), and a short note recording the cue, its reduced-motion posture, and the measured ratios above.

---

## §4 Deletion (BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE)

**Deleted outright:**

| Path | Note |
|---|---|
| `app/admin/show/[slug]/ShareChip.tsx` | orphan; sole holder of the `max-w-[16rem]` the backlog item names |
| `app/admin/show/[slug]/CrewPageLink.tsx` | orphan; the `min-h-tap-min`-without-`min-w` the item names |
| `tests/components/ShareChip.test.tsx` | covers only the deleted component |
| `tests/components/CrewPageLink.test.tsx` | covers only the deleted component |

**Reworked:** `tests/components/shareTokenInstantUpdate.test.tsx`. Today it proves ONE provider fans a rotate out to three consumers (`tests/components/shareTokenInstantUpdate.test.tsx:56-75` composes all three; `tests/components/shareTokenInstantUpdate.test.tsx:113-148` asserts across them). Two of the three vanish. The test's load-bearing claim survives in reduced form and must be preserved explicitly, not quietly dropped:

- Keep: the rotate is driven through the REAL rotate control's two-tap confirm (`tests/components/shareTokenInstantUpdate.test.tsx:90-99`), `router.refresh()` is a mocked no-op (`tests/components/shareTokenInstantUpdate.test.tsx:21` and `tests/components/shareTokenInstantUpdate.test.tsx:130`) so the instant update is proven to come from the client cache and not a server re-render, and the OLD token then appears nowhere in the DOM (`tests/components/shareTokenInstantUpdate.test.tsx:142`).
- Drop: the chip and crew-link assertions (`tests/components/shareTokenInstantUpdate.test.tsx:113-116` and `tests/components/shareTokenInstantUpdate.test.tsx:136-139`) and the chip-scoped copy-button helper (`tests/components/shareTokenInstantUpdate.test.tsx:81-84`).
- Keep the popover-scoped copy-button helper (`tests/components/shareTokenInstantUpdate.test.tsx:85-88`); with the chip gone the `within(...)` scoping is no longer strictly required, but it stays — the popover scope is the correct assertion boundary regardless of how many surfaces exist.
- The second test (`tests/components/shareTokenInstantUpdate.test.tsx:151-169`, stale-rotation rejection) currently asserts through the chip. Repoint it at the ShareHub URL block. The monotonic-gate claim it proves is independent of which consumer renders it, and it must NOT be deleted.
- Fold the §9 cue assertions into this file — it already drives a real rotate end to end, which is precisely the fixture the cue tests need.

Rename the file to tests/components/shareTokenRotateSurface.test.tsx and update its header comment: "the three token consumers" is no longer true, and a stale header is how the next reader is misled.

**Deliberately untouched:** `app/admin/show/[slug]/ShareLinkCopyButton.tsx` and its `compact` variant (R4).

---

## §5 Backlog and doc edits

`BACKLOG.md` — the whole `## Crew-page share-link chrome` section is removed (all three items close in this diff), with each item's resolution recorded in `BACKLOG-archive.md` following the archive's existing per-entry shape:

- `BL-CREWPAGE-ROTATE-URL-FLASH` becomes RESOLVED, citing this spec §3 and the PR.
- `BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE` becomes RESOLVED BY DELETION, citing this spec §4. Record the correction that `max-w-[16rem]` was a singleton, so the "batch it with an app-wide sweep" reasoning is not re-derived from the archive later.
- `BL-CREWPAGE-ROTATE-FOCUS-MGMT` becomes CLOSED, SUPERSEDED, citing `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:34` and `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:82`. Record that the requested behavior is a ratified accepted residual so a future reader does not refile it.

`DESIGN.md` — per §3.7.

---

## §6 Matrices that do not apply

Stated explicitly so a reviewer does not read absence as omission.

| Mandatory matrix | Applicability |
|---|---|
| Tier-by-domain DB completeness | **N/A** — no DDL, no RPC, no trigger, no table touched. |
| CHECK/enum migration | **N/A** — no CHECK, no enum. |
| Flag lifecycle table | **N/A** — no boolean config field or toggle is added. `flash` is transient component state with one writer and one reader, both in §3.2. |
| Build-vs-runtime gate | **N/A** — no env-gated behavior. |
| Cap/truncation | **N/A** — no list is rendered or extended. |
| Empirical spike (stateful/race surface) | **Satisfied by design, not deferred.** The state machine here is two states with a single monotonic trigger; there is no close or navigation race, no optimistic state and no undocumented framework contract. The one genuine ordering question — whether the CSS animation restarts across an attribute remove then re-add in separate commits — is answered by the shipped step3 precedent, which does exactly this via `setAttribute`/`removeAttribute` plus `setTimeout` (`components/admin/review/ShowReviewSurface.tsx:531-533` and `components/admin/review/ShowReviewSurface.tsx:506`). |

---

## §7 Mode boundaries

`ShareHub` renders the crew-URL block in exactly one of its modes. Enumerated so "which mode owns the cue" is not ambiguous:

| Mode | Condition | Crew-URL block | Cue |
|---|---|---|---|
| archived | `archived` | not rendered — the entire share half is suppressed (`components/admin/showpage/ShareHub.tsx:704`) | none |
| active link | `!archived && linkActive` | rendered (`components/admin/showpage/ShareHub.tsx:713-718`) | **this is the only mode with a cue** |
| published, link unavailable | `!archived && !linkActive && published` | replaced by the unavailable note (`components/admin/showpage/ShareHub.tsx:749-756`) | none |
| unpublished (paused) | `!archived && !linkActive && !published` | replaced by the paused note (`components/admin/showpage/ShareHub.tsx:758-764`) | none |

---

## §8 Rendered vs conceptual

The cue is a **rendered DOM attribute plus real CSS**, not a described intent:

- Exact attribute: `data-share-link-flash` (empty string value), on the element carrying `data-testid="admin-current-share-link-url"`.
- Exact CSS: the block in §3.4, verbatim, in `app/globals.css`.
- Exact constant: `export const SHARE_LINK_FLASH_MS = 1600;` in `components/admin/showpage/ShareHub.tsx`.
- No new visible text, no new label, no copy change anywhere. The success banner copy at `app/admin/show/[slug]/RotateShareTokenButton.tsx:278-281` is unchanged.

---

## §9 Tests

TDD per plan-wide invariant 1: each row is a failing test before its implementation.

| # | Test | Location | Concrete failure it catches |
|---|---|---|---|
| T1 | Rotate through the real two-tap confirm, then the URL block carries `data-share-link-flash` | reworked integration test (§4) | cue never fires — the attribute is wired to the wrong element, or the render-phase guard rejects a real rotation |
| T2 | Advance fake timers by `SHARE_LINK_FLASH_MS`, then the attribute is gone | same | cue never clears, leaving a permanently ringed URL block after the first rotate |
| T3 | First render and first panel open leave the attribute ABSENT | same | `prevToken` seeded wrong (for example `useState(null)`), so every panel open flashes |
| T4 | Provider re-seeded from null to a token at the SAME epoch (the transient-read-fault recovery path, `app/admin/show/[slug]/ShareTokenContext.tsx:61-67`) leaves the attribute ABSENT | same | the both-non-null guard is missing, so a read fault recovering reads as a rotation |
| T5 | Rotate with the panel CLOSED, then open it: attribute ABSENT | same | the closed-panel clear is missing, so a background rotation replays its cue on the next open |
| T6 | Open panel, rotate, close panel, reopen inside the 1600ms window: attribute ABSENT | same | the cue survives a close and replays |
| T7 | Stale rotation (`applyRotated` with a lower epoch, gate at `app/admin/show/[slug]/ShareTokenContext.tsx:47`): URL unchanged AND attribute ABSENT | same | the cue is keyed on the rotate EVENT rather than on the token actually changing, so a rejected update still flashes |
| T8 | Source scan: `app/globals.css` declares both keyframes; `[data-share-link-flash]` animates both at exactly `SHARE_LINK_FLASH_MS` milliseconds; the reduced-motion block sets `animation: none`; `ShareHub` declares no keyframes of its own | new transitions test under tests/components/admin/showpage/ (template: `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:725-740`) | duration drift between TypeScript and CSS; a missing reduced-motion collapse shipping motion to users who opted out; keyframes leaking into the component |
| T9 | Contrast: `accent-edge` against `accent-tint` clears 3:1 in both themes, read from the live CSS hexes | new row in `tests/styles/status-token-contrast.test.ts` | a future `accent-tint` or `accent-edge` retune silently drops the ring below the non-text floor at the cue's peak |
| T10 | Deletion guard: no import of the two deleted components remains anywhere | covered by `pnpm typecheck` and `pnpm test` | a missed import breaking the build |

**Anti-tautology discipline.** T1 asserts the attribute on the element resolved by `getByTestId("admin-current-share-link-url")`, not on a container that could carry it for another reason. T3, T4, T5, T6 and T7 are the load-bearing half of the set: each is a NEGATIVE assertion whose failure mode is a real, distinct implementation defect named in the table — they do not merely prove "the function was called." T2 uses fake timers rather than a real wait, so it fails deterministically if the timer is never armed.

**jsdom limits, stated.** jsdom applies no CSS, so no test asserts that anything visibly animates — that would be vacuous. The split is deliberate and complete: the COMPONENT tests T1 through T7 pin the attribute lifecycle, which is the whole of the component's contribution; the SOURCE-SCAN test T8 pins the CSS that turns the attribute into motion, including its duration and its reduced-motion collapse. This is the same split the shipped step3 flash uses (`tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:725-740` for the CSS, `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:997` for the attribute).

---

## §10 Out of scope

- Any change to the rotate or picker-reset server actions, their RPCs, or their telemetry.
- Any new error-catalog code (so none of the four catalog lockstep gates apply).
- The copy-button component's variant API (R4).
- Focus management on any rotate path (R1, R2).
- Cues on any other surface (the dashboard row, the status strip, notifications).
- A named width token for the deleted chip (§2.2).
- A real-browser assertion (R6).

**Invariant applicability.** Plan-wide invariants 2 (advisory lock), 3 (email canonicalization), 4 (no global cursor), 9 (Supabase call boundary) and 10 (mutation-surface telemetry) have **no surface** — this diff adds no server action, no route handler, no Supabase call, no mutation. Invariant 5 (no raw error codes in UI) holds trivially, since no code is rendered. Invariants 1 (TDD), 6 (commit per task), 8 (impeccable dual-gate, because UI is touched) and 11 (worktree) **apply**, and are honored by the plan.

---

## §11 Citation pass transcript

Run in the worktree at `origin/main` = `705798048`, before drafting.

**Orphan verification (R3)** — every reference to the two components across `app/` and `components/`:

```
$ rg -n 'ShareChip|CrewPageLink' app components
app/admin/show/[slug]/ShareLinkCopyButton.tsx:26   [doc comment only]
app/admin/show/[slug]/ShareChip.tsx:17             [self]
app/admin/show/[slug]/CrewPageLink.tsx:15          [self]
```

No importer. The only non-self, non-test mention is a doc comment.

**Singleton verification (§2.2):**

```
$ rg -n 'max-w-\[16rem\]' app components
app/admin/show/[slug]/ShareChip.tsx:28
```

**Line-anchored claims:**

| Claim | Verified at |
|---|---|
| cue target element | `components/admin/showpage/ShareHub.tsx:714` |
| token source in ShareHub | `components/admin/showpage/ShareHub.tsx:173` |
| open state | `components/admin/showpage/ShareHub.tsx:174` |
| archived suppresses the share half | `components/admin/showpage/ShareHub.tsx:704` |
| rotate row placement | `components/admin/showpage/ShareHub.tsx:772-781` |
| panel width 308px | `components/admin/showpage/ShareHub.tsx:699` |
| monotonic gate | `app/admin/show/[slug]/ShareTokenContext.tsx:46-49` |
| render-phase reconcile precedent | `app/admin/show/[slug]/ShareTokenContext.tsx:51-70` |
| same-epoch null kept as transient fault | `app/admin/show/[slug]/ShareTokenContext.tsx:61-67` |
| onRotated skipped when link inactive | `app/admin/show/[slug]/RotateShareTokenButton.tsx:165` |
| C3 open-focus | `app/admin/show/[slug]/RotateShareTokenButton.tsx:115` |
| C5 close-focus guard | `app/admin/show/[slug]/RotateShareTokenButton.tsx:106` |
| C5 restore | `app/admin/show/[slug]/RotateShareTokenButton.tsx:126` |
| success banner is a plain status paragraph | `app/admin/show/[slug]/RotateShareTokenButton.tsx:271-282` |
| the arbitrary max-width | `app/admin/show/[slug]/ShareChip.tsx:28` |
| tap-height with no width floor | `app/admin/show/[slug]/CrewPageLink.tsx:28` |
| step3 flash keyframe | `app/globals.css:837` |
| its reduced-motion fallback | `app/globals.css:848-852` |
| the step3 duration constant | `components/admin/wizard/Step3ReviewModal.tsx:106` |
| its source-marker pinning comment | `components/admin/review/ShowReviewSurface.tsx:59-64` |
| imperative set precedent | `components/admin/review/ShowReviewSurface.tsx:531-533` |
| imperative clear precedent | `components/admin/review/ShowReviewSurface.tsx:506` |
| CSS-pin test template | `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:725-740` |
| attribute-assertion precedent | `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:997` |
| text-on-tint already pinned | `tests/styles/status-token-contrast.test.ts:144` |
| accent-edge floor, light | `tests/styles/status-token-contrast.test.ts:222` |
| accent-edge floor, dark | `tests/styles/status-token-contrast.test.ts:231` |
| three-consumer composition being reworked | `tests/components/shareTokenInstantUpdate.test.tsx:56-75` |
| share-token fixture length | `tests/components/shareTokenInstantUpdate.test.tsx:32` |
| outline variant, test-only | `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:60` |
| compact variant, test-only | `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:149` |

**Numeric sweep.** Every literal in this document: `1600` (the cue duration — appears in §3.2 as `SHARE_LINK_FLASH_MS`, twice in the §3.4 CSS, and in §3.5, §8 and T8; single-sourced by the T8 equality pin), `45%` (wash hold, §3.4 only), `2px` (ring width, §3.4 only), `308` (panel width, §2.1, matching the class at `components/admin/showpage/ShareHub.tsx:699`), `64` (share-token length, §1, matching the test fixture at `tests/components/shareTokenInstantUpdate.test.tsx:32`), `1.6` (seconds, §3.2, the same duration expressed for readability), and the state counts in §3.5 (two states, therefore one pair). No literal appears with two different values.

**Contrast computation.** WCAG relative luminance over the live runtime hexes in `app/globals.css` (`--color-text-strong-runtime`, `--color-accent-tint-runtime`, `--color-accent-edge-runtime`, `--color-surface-runtime`, `--color-surface-sunken-runtime`) read from the light root block and the dark block separately. Values in §3.7.
