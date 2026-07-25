# Crew-page share-link chrome — backlog closure (2026-07-24)

**Status:** DRAFT · **Branch:** `feat/share-link-chrome-backlog` · **Routing:** Opus / Claude Code (UI — AGENTS.md "Hard rule: UI work is always Opus")

Closes the three open items under BACKLOG.md `## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)`: `BL-CREWPAGE-ROTATE-URL-FLASH`, `BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE`, `BL-CREWPAGE-ROTATE-FOCUS-MGMT`.

Only ONE of the three results in feature code. The other two are closed by deletion and by supersession — both dispositions are grounded in live-code and ratified-spec citations below, not in judgement calls.

---

## §1 Problem

Rotating a show's share-token mints a brand-new crew URL. Every live crew-URL surface updates instantly through the client epoch-gated cache (`app/admin/show/[slug]/ShareTokenContext.tsx:46-49`), and the success banner says _"The updated link is shown above."_ (`app/admin/show/[slug]/RotateShareTokenButton.tsx:279-281`). But the swap itself is **visually silent**: the token is an opaque 64-hex-character random string (`supabase/migrations/20260523000002_show_share_tokens.sql:41` pins the shape; `supabase/migrations/20260523000002_show_share_tokens.sql:7` is the generator), so the only thing that changes on screen is a run of characters inside a monospace block. An admin watching the confirmation has no motion cue that the address above it is now different.

The two companion items are stale bookkeeping, not defects — §2 shows why.

### §1.1 Resolved scope — do not relitigate

Each row is a decision already ratified, with the citation that ratifies it. A reviewer should VERIFY the citation, not re-derive the decision.

| # | Resolved decision | Ratification |
|---|---|---|
| R1 | **`BL-CREWPAGE-ROTATE-FOCUS-MGMT` ships ZERO code.** Its requested fix — restoring focus after the rotate resolves — is an explicitly ACCEPTED RESIDUAL, not an open defect. C5 governs cancel/auto-revert paths only; submit-outcome paths get "no focus move, announcement via the surface’s existing `role="alert"`/`role="status"` result element, accepted residual where the control unmounts." Rotate is named by name in the per-surface enumeration. | `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:34` (C5 definition) and `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:82` (submit-outcome matrix case (c), Rotate enumerated) |
| R2 | The **cancel/auto-revert half of that item is already shipped**, so there is nothing left to build even on the governed paths. C3 focuses the cancel button on confirm-open; C5 restores the trigger on cancel/auto-revert. | `app/admin/show/[slug]/RotateShareTokenButton.tsx:115` (C3); `app/admin/show/[slug]/RotateShareTokenButton.tsx:106` and `app/admin/show/[slug]/RotateShareTokenButton.tsx:126` (C5 two-phase guard) |
| R3 | **`app/admin/show/[slug]/ShareChip.tsx` and `app/admin/show/[slug]/CrewPageLink.tsx` are orphans** — imported by no production module. Already recorded as such, with cleanup named as backlog material. This spec is that cleanup. | `docs/superpowers/specs/2026-07-18-admin-show-modal.md:214`; verified live in §11 |
| R4 | **`ShareLinkCopyButton`'s `variant="compact"` is NOT removed** even though this diff deletes its last production call site. It joins `variant="outline"`, which is ALREADY production-orphaned with test-only coverage under a ratified spec. Two variants in the same accepted condition is the status quo, not new debt introduced here. Removing either is a separate decision about that component's API, out of scope. `outline`'s ONLY production assignment was `StatusStrip.tsx:261` (`docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md:628`), and the share-hub consolidation then removed that render outright (`docs/superpowers/specs/2026-07-20-share-hub-design.md:104`, "StatusStrip copy-link render + its `copyUrl` derivation"). Confirmed executable: the only two live call sites today are `app/admin/show/[slug]/ShareChip.tsx:44` (`compact`) and `components/admin/showpage/ShareHub.tsx:719` (`accent`) — see §11. Test-only coverage survives at `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:60` (`outline`) and `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:149` (`compact`) |
| R5 | **Reduced motion renders NO cue at all** — deliberately NOT the shipped `[data-step3-warning-flash]` fallback, which leaves a steady tint (`app/globals.css:848-852`). That fallback is right for a persistent jump-target the user must still locate; it is wrong for a one-shot "this just changed" cue, where a permanent tint would assert a state that is no longer true. On the LOCAL rotate path nothing is lost — the `role="status"` banner announces the change (`app/admin/show/[slug]/RotateShareTokenButton.tsx:271-282`). On the REMOTE path it is silent; that residual is disclosed and bounded in §3.8 rather than waved away. | This spec §3.4, §3.8 |
| R6 | **REVERSED in round 2. A real-browser spec IS added, with its own dedicated workflow.** The draft justified skipping one on the claim that the standalone Playwright config "is invoked by NO CI workflow". That claim is FALSE and the reviewer was right to call it: five dedicated workflows invoke it today, each naming its own spec subset — `.github/workflows/phantom-gap-e2e.yml:158` is the clearest example, and `package.json:52` and `package.json:53` are named script entries doing the same. What IS true is narrower: the config is never run WHOLESALE, so a spec added to it stays dark unless a workflow names it (`.github/workflows/modal-header-layout-e2e.yml:39` says exactly that about the ~15 specs still dark). Since the cost is a workflow file that five precedents show how to write, and since the source scan provably cannot close the CSS cascade holes in §9 T8, the browser spec is the correct call rather than a residual to disclose. §9.1 specifies it. | `.github/workflows/phantom-gap-e2e.yml:158`; `.github/workflows/modal-header-layout-e2e.yml:39`; `package.json:52` |
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
| `null` becomes a token (transient read fault recovering) | **no** | guarded on `prevToken !== null`. `app/admin/show/[slug]/ShareTokenContext.tsx:66` returns the held state for a same-epoch null (a transient read fault), and `app/admin/show/[slug]/ShareTokenContext.tsx:68` is the branch that accepts the returning token, so this transition means "the read recovered", not "the link rotated" |
| A token becomes `null` (show went ineligible; authoritative null at a strictly-advanced epoch) | **no** | guarded on `token !== null`; and the target element does not render at all — `linkActive` is false, so the panel shows the unavailable or paused note instead (`components/admin/showpage/ShareHub.tsx:748-764`) |
| `ShareHub` remounts (modal reopened; the provider is keyed by show id at its mount, `app/admin/_showReviewModal.tsx:415`, and the modal's remount-per-show behaviour is established at `app/admin/page.tsx:167-171`) | **no** | fresh mount reseeds `prevToken` |
| Rotate on an INACTIVE crew link (unpublished or archived) | **no** | `onRotated` is not called at all when `isCrewLinkActive` is false (`app/admin/show/[slug]/RotateShareTokenButton.tsx:165`), so `token` never changes |
| Stale rotation rejected by the monotonic gate (`app/admin/show/[slug]/ShareTokenContext.tsx:47`) | **no** | the gate returns the previous state object; `token` is unchanged |
| Panel closed when the token changes | **no cue on the next open** | §3.3 clears the pending cue whenever `open` is false |
| A token becomes `null` **while an earlier cue is still running** | **the running cue is CANCELLED** | the null transition clears `flash` outright (§3.2). Without this the cue outlives the element: the block unmounts with `flash` still set, and a token arriving back within the same 1600ms window (republish, or unarchive, both of which rotate and bump the epoch) remounts it wearing a stale attribute. Surfaced by round-1 adversarial review as HIGH; pinned by T11 |

### §3.2 State

Render-phase derived state — the "adjust state when a prop changes" pattern this codebase already uses for exactly this shape of problem (`app/admin/show/[slug]/ShareTokenContext.tsx:51-70`, whose comment records why an effect is the wrong tool here: "no extra commit/flash and no cascading-render lint hazard").

```tsx
/** One-shot highlight window on the crew-URL block after the token changes.
 *  Paired with the `[data-share-link-flash]` keyframes in app/globals.css;
 *  keep this value and the CSS duration in sync (a source-scan test pins it). */
export const SHARE_LINK_FLASH_MS = 1600;

// MUST sit AFTER `linkActive` is computed (ShareHub.tsx:419): the clear
// condition reads it. Placing this block up beside `useShareToken()` compiles
// but reads a TDZ binding.
const [prevToken, setPrevToken] = useState(token);
const [flash, setFlash] = useState<number | null>(null);

if (prevToken !== token) {
  setPrevToken(token);
  // Both-non-null bumps the nonce; ANY null-involving transition CLEARS.
  setFlash((n) => (prevToken !== null && token !== null ? (n ?? 0) + 1 : null));
}
// Clear whenever the TARGET IS NOT ON SCREEN, not merely when the panel is
// shut. `linkActive` folds in `published` and `archived` as well as the token
// (ShareHub.tsx:419), and a pure unpublish deliberately does NOT rotate the
// token or bump the epoch (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2`),
// so an unpublish unmounts the block while `token` stays non-null. Keying the
// clear on token-nullity alone left a cue alive across that unmount, and a
// republish inside the window remounted an UNCHANGED url wearing the attribute
// i.e. a cue for a rotation that never happened (round-2 review, HIGH). One
// condition covers the whole class: closed panel, null token, unpublish,
// archive.
if ((!open || !linkActive) && flash !== null) setFlash(null);

useEffect(() => {
  if (flash === null) return;
  const t = setTimeout(() => setFlash(null), SHARE_LINK_FLASH_MS);
  return () => clearTimeout(t);
}, [flash]);
```

Applied to the target element as a bare data attribute — the component declares the HOOK, `app/globals.css` owns the keyframes, duration and reduced-motion collapse. This mirrors the shipped `[data-step3-warning-flash]` split exactly (`components/admin/wizard/Step3ReviewModal.tsx:102-106` documents the same division; `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:723-741` pins it).

```tsx
<code
  key={token}
  data-testid="admin-current-share-link-url"
  {...(flash !== null ? { "data-share-link-flash": "" } : {})}
  className="min-w-0 flex-1 break-all rounded-sm bg-surface-sunken px-2 py-1 text-xs text-text-strong"
>
  {url}
</code>
```

**Why `key={token}` — the animation must RESTART, and a nonce alone cannot restart it.** The draft argued a second change inside the window was unreachable and let the running animation continue. That was wrong on both counts (round-2 review, HIGH). It is reachable: R7 has the cue fire on remote rotations too, and two admins rotating within 1600ms is not gated by anything — the per-show advisory lock serialises the writes, it does not space them out. And the consequence is worse than "slightly short": a CSS animation does not restart when an already-present attribute stays present, so the second, genuinely different URL can land in the tail of the first animation with no visible signal at all. Re-arming the timer (the nonce) only makes the attribute linger; it does not repaint.

`key={token}` remounts the element on every token change, which restarts both keyframes from 0%. It is keyed on the TOKEN rather than on the nonce deliberately: the key must change when the URL changes and must NOT change when the timer clears the attribute at 1600ms. Keying on the nonce would remount on that clear too, destroying a text selection the admin may have made in order to copy the URL by hand. Keying on the token cannot: by the time it changes, the selected text is a URL that no longer exists.

**Why a nonce counter and not a boolean.** With `key={token}` handling the repaint, the nonce's remaining job is the TIMER: its effect dependency is `flash`, so a second change bumps the count, the effect re-runs, the old `setTimeout` is cleared and a fresh window starts. A boolean would no-op on the second change and clear the attribute on the FIRST change's deadline, cutting the second cue short. Both halves are needed and they are separable — T12 pins the remount, T14 pins the re-armed deadline.

### §3.3 Guard conditions (every input state)

Per the mandatory guard-conditions rule. The cue consumes exactly two inputs — `token` (`string | null`) and `open` (`boolean`) — plus its own `flash` (`number | null`).

| Input state | Rendered result |
|---|---|
| `token === null` | target element not rendered (`linkActive` false, so the published or paused note renders instead, `components/admin/showpage/ShareHub.tsx:748-764`); no attribute, no cue |
| `token` unchanged since last render | no attribute |
| `token` changed, either side null | no attribute, AND any in-flight cue is cancelled (§3.1, §3.2) |
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
| C1 | Cue starts while the rotate success banner mounts — co-occurs on the LOCAL rotate path ONLY, never on the remote path (§3.8) | Independent subtrees; the banner has no animation of its own (`app/admin/show/[slug]/RotateShareTokenButton.tsx:271-282` is a plain paragraph), so there is nothing to coordinate. Both simply appear. |
| C2 | Panel closes mid-cue | The popover's own dismissal is unchanged. `flash` clears on the close render (§3.2), so the cue does not survive into a later open. |
| C3 | Second token change lands inside an open cue window | The element remounts on the new `key={token}`, so BOTH keyframes restart from 0% and the second URL gets a full-strength cue; the nonce re-arms the timer so the attribute clears 1600ms after the LAST change. Reachable via two admins rotating inside the window (§3.2) — the draft's "unreachable in practice" was wrong. |
| C4 | Cue active while the popover is mid-placement (`applyPlacement` writes `max-height`, `left` and `top`, `components/admin/showpage/ShareHub.tsx:234-362`) | Independent properties — placement writes inline geometry on the PANEL, the cue animates paint properties on a descendant `<code>`. Neither reads the other. |
| C5 | Cue active while a sibling child reports busy (`aria-busy` on the panel, `components/admin/showpage/ShareHub.tsx:686`) | Independent; `aria-busy` is an attribute on the dialog with no visual treatment attached to it in this component. |

### §3.6 Dimensional invariants

**N/A.** The cue introduces no fixed-dimension parent and no new flex or grid child relationship. It animates `background-color` and `box-shadow` on an existing element whose box model is untouched — `box-shadow` does not participate in layout, and the element keeps the exact class string it has at `components/admin/showpage/ShareHub.tsx:715`. No parent-to-child dimension relationship changes, so no real-browser DIMENSION assertion is warranted. That is a separate question from §9.1's browser spec, which measures resolved ANIMATION rather than layout and does have a CI home (R6, reversed in round 2).

### §3.7 Contrast (DESIGN.md)

Measured from the live `app/globals.css` runtime hexes, not asserted from memory. Peak-of-cue state, both themes:

| Pair | Light | Dark | Floor | Verdict |
|---|---|---|---|---|
| `text-strong` on `accent-tint` (address text during the wash) | 16.88:1 | 14.66:1 | 4.5:1 AA | pass |
| `accent-edge` ring vs `accent-tint` (ring inner edge at peak) | 7.41:1 | 8.03:1 | 3:1 non-text | pass |
| `accent-edge` ring vs `surface` (ring outer edge, popover ground) | 8.42:1 | 8.84:1 | 3:1 non-text | pass |
| `accent-edge` ring vs `surface-sunken` (ring inner edge post-wash) | 7.59:1 | 9.65:1 | 3:1 non-text | pass |

Only the FIRST row is already pinned by a shipped test — `tests/styles/status-token-contrast.test.ts:144` asserts `text-strong` on `accent-tint` clears 4.5:1 in both modes. No new row needed for it.

**Existing ring coverage is thinner than it looks, and the draft of this spec overstated it (round-1 review, MEDIUM).** Read against the live assertions:

- `tests/styles/status-token-contrast.test.ts:222-230` pins `accent-edge` against the accent track, `bg`, and `surface` — **light mode only** (`const light = MODES[0]!`).
- `tests/styles/status-token-contrast.test.ts:232-236` does NOT test `accent-edge` at all. It reads `--color-accent-runtime` and pins the accent TRACK against dark bg/surface, because in dark the edge is documented as decorative (`app/globals.css:331-332`). Under this cue the dark edge stops being decorative — it becomes the change signal — so it needs its own floor.

Uncovered, and therefore all added by T9:

| Pair | Light | Dark |
|---|---|---|
| `accent-edge` vs `accent-tint` | uncovered | uncovered |
| `accent-edge` vs `surface` | covered at `tests/styles/status-token-contrast.test.ts:229` | uncovered |
| `accent-edge` vs `surface-sunken` | uncovered | uncovered |

Five uncovered pairs, not one.

DESIGN.md gains a `SHARE_LINK_FLASH_MS = 1600` entry alongside `WARNING_HIGHLIGHT_MS` (`DESIGN.md:281`) and a short note recording the cue, its reduced-motion posture, and the measured ratios above. **The section preamble must be reworded in the same edit, and it is false in TWO ways, not one.** `DESIGN.md:274` claims these constants (a) "live as named JS module constants (single source of truth) in `components/admin/wizard/Step3ReviewModal.tsx`" and (b) are gesture or scroll thresholds that "never produce a painted px, so the hardcoding ban doesn't apply to them". `SHARE_LINK_FLASH_MS` breaks (a) — it lives in `components/admin/showpage/ShareHub.tsx`. It breaks (b) too, and so does the `WARNING_HIGHLIGHT_MS` entry already sitting there (`DESIGN.md:281`): a highlight duration governs a painted animation directly, which is the opposite of a behavioural threshold (round-2 review, MEDIUM — the draft repaired only half). Reword BOTH: name the owning module per entry, and split the list into behavioural thresholds (which genuinely paint nothing) and animation durations (which paint, are exempt from the token scale only because they exceed `--duration-slow`, and each carry an explicit reduced-motion override).

### §3.8 Disclosed residual: the remote-rotate path under reduced motion

R7 has the cue fire on ANY accepted token change, including another admin's rotate arriving through `router.refresh()`. The success banner does NOT co-occur on that path: the banner renders off `result`, local state inside the rotate control set only by THIS browser's own action (declared at `app/admin/show/[slug]/RotateShareTokenButton.tsx:82`, written at `app/admin/show/[slug]/RotateShareTokenButton.tsx:159`). A remote rotation changes `token` through the provider without touching `result`, so no banner mounts.

Consequence, stated plainly rather than implied:

| Path | Motion allowed | Reduced motion |
|---|---|---|
| Local rotate | cue + `role="status"` banner | banner only |
| Remote rotate | cue only | **nothing** |

The bottom-right cell is the residual. It is **not a regression** — today a remote rotation swaps the URL silently for every user, so this diff strictly adds a signal for one group and takes none away from any. It is **accepted, not fixed**, because the fix is a new announcement surface: a live region owned by ShareHub that speaks a token change it did not initiate needs its own copy, politeness level, and repeat-suppression design, plus a decision about whether a background URL change should interrupt a screen-reader user at all. That is a separate spec, not a rider on a visual-cue backlog item. Filed as `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE` in §5.

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

- Keep, and this list is a FLOOR not a summary — the exact-value assertions at `tests/components/shareTokenInstantUpdate.test.tsx:113-148` (exact OLD url, exact NEW url, clipboard payload before and after) survive verbatim, popover-scoped. Absence-of-OLD alone would pass while the block rendered a WRONG token and Copy wrote a stale one (round-2 review, MEDIUM). Also kept: the rotate is driven through the REAL rotate control's two-tap confirm (`tests/components/shareTokenInstantUpdate.test.tsx:90-99`), `router.refresh()` is a mocked no-op (`tests/components/shareTokenInstantUpdate.test.tsx:21` and `tests/components/shareTokenInstantUpdate.test.tsx:130`) so the instant update is proven to come from the client cache and not a server re-render, and the OLD token then appears nowhere in the DOM (`tests/components/shareTokenInstantUpdate.test.tsx:142`).
- Drop: the chip and crew-link assertions (`tests/components/shareTokenInstantUpdate.test.tsx:113-116` and `tests/components/shareTokenInstantUpdate.test.tsx:136-139`) and the chip-scoped copy-button helper (`tests/components/shareTokenInstantUpdate.test.tsx:81-84`).
- Keep the popover-scoped copy-button helper (`tests/components/shareTokenInstantUpdate.test.tsx:85-88`); with the chip gone the `within(...)` scoping is no longer strictly required, but it stays — the popover scope is the correct assertion boundary regardless of how many surfaces exist.
- The second test (`tests/components/shareTokenInstantUpdate.test.tsx:151-169`, stale-rotation rejection) currently asserts through the chip. Repoint it at the ShareHub URL block. The monotonic-gate claim it proves is independent of which consumer renders it, and it must NOT be deleted.
- Fold the §9 cue assertions into this file — it already drives a real rotate end to end, which is precisely the fixture the cue tests need.

Rename the file to tests/components/shareTokenRotateSurface.test.tsx and update its header comment: "the three token consumers" is no longer true, and a stale header is how the next reader is misled.

**Stale cross-references the rename leaves behind.** Three comment lines in another test name the old filename and both deleted components, and go stale silently because comments do not typecheck:

- `tests/app/admin/rotateShareToken.test.tsx:9` — names ShareChip and CrewPageLink as live "CARD surfaces".
- `tests/app/admin/rotateShareToken.test.tsx:10` and `tests/app/admin/rotateShareToken.test.tsx:73` — both point at the old filename.

All three are updated in the same commit as the rename.

**Deliberately untouched:** `app/admin/show/[slug]/ShareLinkCopyButton.tsx` and its `compact` variant (R4).

---

## §5 Backlog and doc edits

`BACKLOG.md` — the whole `## Crew-page share-link chrome` section is removed (all three items close in this diff), with each item's resolution recorded in `BACKLOG-archive.md` following the archive's existing per-entry shape:

- `BL-CREWPAGE-ROTATE-URL-FLASH` becomes RESOLVED, citing this spec §3 and the PR.
- `BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE` becomes RESOLVED BY DELETION, citing this spec §4. Record the correction that `max-w-[16rem]` was a singleton, so the "batch it with an app-wide sweep" reasoning is not re-derived from the archive later.
- `BL-CREWPAGE-ROTATE-FOCUS-MGMT` becomes CLOSED, SUPERSEDED, citing `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:34` and `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:82`. Record that the requested behavior is a ratified accepted residual so a future reader does not refile it.

One NEW item is filed in the same edit:

- `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE` — a remote rotation (another admin's, arriving through `router.refresh()`) changes the crew URL with no announcement, so under reduced motion that path signals nothing at all (§3.8). Pre-existing behavior, not a regression from this diff, and deliberately not fixed here: a live region that speaks a change this browser did not initiate needs its own copy, politeness level and repeat-suppression design. Trigger to promote: a screen-reader or reduced-motion admin reporting a surprise URL change, or the next admin a11y pass.

`DESIGN.md` — per §3.7, INCLUDING the preamble rewording at `DESIGN.md:274`, which is not optional: appending the new constant under the existing preamble would make that preamble false.

### §5.1 CI surfaces this diff triggers

Named here so "which gates must be green" is not rediscovered at PR time.

`.github/workflows/screenshots-drift.yml:13` filters on `app/**` and `.github/workflows/screenshots-drift.yml:15` on `components/**`. This diff edits `app/globals.css` and `components/admin/showpage/ShareHub.tsx` and deletes two files under `app/admin/show/[slug]/`, so the **byte-comparison screenshot gate fires on this PR**.

The expected outcome is NO drift, and the reasoning is recorded rather than assumed:

- the keyframes are scoped to `[data-share-link-flash]`, an attribute that exists only in the 1600ms after a live rotate and never during a static route capture;
- ShareHub's resting render is byte-identical — new state plus an attribute that is absent at rest;
- the two deleted components render on no route, so they cannot appear in any capture.

If the gate reds, investigate — do NOT rebaseline. And do not run the capture script locally to "check": this is an arm64 host and the committed baselines are x64-Linux bytes, so a local capture overwrites them with host-architecture noise that looks like a proposed change. If it is ever run by accident, restore with `git restore public/help/screenshots/`.

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
| Empirical spike (stateful/race surface) | **The draft's claim here was wrong and is withdrawn (round-1 review, MEDIUM).** It described "two states with a single monotonic trigger". The RENDERED result has two states, but the state the code must get right is the product of `token` (three-valued: unchanged, changed-both-non-null, changed-with-a-null), `open` (two-valued) and `flash` (null or a nonce), with a timer whose lifetime can outlive the target element. Calling that two states is exactly what let the null-transition defect through. Replaced by the exhaustive interaction table in §6.1, which is the comprehensive re-analysis this rule asks for; every row of it has a test in §9. No probe harness is required on top of that: nothing here is an undocumented framework contract. The one ordering question — whether a CSS animation restarts across an attribute remove then re-add in separate commits — is answered by the shipped step3 precedent, which does exactly this via `setAttribute`/`removeAttribute` plus `setTimeout` (`components/admin/review/ShowReviewSurface.tsx:531-533` and `components/admin/review/ShowReviewSurface.tsx:506`). |

### §6.1 State-interaction table (the withdrawn spike's replacement)

Exhaustive over the transitions the cue can observe. "Cue in flight" means `flash !== null` on entry. **The draft of this table omitted `linkActive` and was therefore not exhaustive (round-2 review, HIGH)** — `linkActive` folds in `published` and `archived` alongside the token (`components/admin/showpage/ShareHub.tsx:419`), so the target can leave the screen with the token untouched. The dimensions are `token` (unchanged / changed-both-non-null / changed-with-a-null), `open`, `linkActive`, and `flash`, plus a timer whose lifetime can outlive the target.

The clear condition `(!open || !linkActive)` is deliberately written over the TARGET'S VISIBILITY rather than over any one of its causes, so rows S4, S6, S9, S12 and S13 are all closed by one predicate instead of five patches.

| # | Transition | Cue in flight on entry | Result | Pinned by |
|---|---|---|---|---|
| S1 | token unchanged, any `open`, any `linkActive` | either | no change | T3 |
| S2 | token A to B, `open` true, `linkActive` true | no | attribute on, element remounts, timer armed | T1, T2 |
| S3 | token A to B, `open` true, `linkActive` true | yes | element remounts so both keyframes restart; nonce bumps; timer re-armed | T12, T14 |
| S4 | token A to B, `open` false | either | `flash` set then cleared in the same render pass; nothing reaches the DOM | T5 |
| S5 | token to null, any `open` | no | no cue; `linkActive` goes false and the block unmounts | T4 |
| S6 | token to null, any `open` | **yes** | cue cancelled by the `!linkActive` arm — round-1 HIGH | T11 |
| S7 | null to token, any `open` | no | no cue (both-non-null guard) | T4 |
| S8 | null to token, any `open` | yes | unreachable once S6 holds; asserted rather than assumed — T11 drives S6 then S8 and proves absence on the remounted block | T11 |
| S9 | `open` true to false | yes | `flash` cleared on the close render | T6 |
| S10 | stale rotation rejected by the epoch gate | either | `token` never changes, so S1 | T7 |
| S11 | unmount with a cue in flight | yes | effect cleanup clears the timer | T13 |
| S12 | **pure unpublish** — `published` true to false, token and epoch UNCHANGED (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2` puts rotation and the epoch bump explicitly out of scope) | **yes** | cue cancelled by the `!linkActive` arm. Without it the block unmounts with `flash` still set | T15 |
| S13 | **republish inside the window** — `published` false to true, token still UNCHANGED | no (S12 cleared it) | block remounts with NO attribute. A cue here would announce a rotation that never happened | T15 |
| S14 | **archive** — `archived` false to true | either | `linkActive` false, and the whole share half is suppressed (`components/admin/showpage/ShareHub.tsx:704`); same arm as S12 | T15 (same predicate) |
| S15 | first mount / remount of `ShareHub` (modal reopened, provider keyed by show id at `app/admin/_showReviewModal.tsx:415`) | n/a — fresh state | `prevToken` seeds to `token`, `flash` starts null: no cue | T3 |
| S16 | `open` false to true with no token change | n/a | nothing set the cue while closed (S4), so no attribute | T5, T6 |
| S17 | timer expiry with the panel still open | yes | attribute removed; `key` unchanged, so NO remount and any text selection survives | T2 |

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

**Kind classification.** The draft's RED/PIN/GATE split was itself wrong — it marked six rows RED that pass against `origin/main` (round-2 review, MEDIUM). Corrected, with a fourth kind that the draft was missing:

- **RED** — fails against `origin/main`, passes only once the implementation lands. Genuinely test-first.
- **GUARD** — passes against `origin/main` (there is no attribute there, so an absence assertion is trivially satisfied) AND passes against the correct implementation. It exists to red against ONE specific wrong implementation, named per row. A guard row is written alongside its implementation, not before it.
- **PIN** — passes today; exists to red on a future regression.
- **GATE** — an existing build command, not a test file.

Only T1, T2, T8, T12, T14 and T16 are red-first. Calling the guards "RED" overstated the TDD claim, so they are labelled for what they are.

| # | Kind | Test | Location | Concrete failure it catches |
|---|---|---|---|---|
| T1 | RED | Rotate through the real two-tap confirm, then the URL block carries `data-share-link-flash` | reworked integration test (§4) | cue never fires |
| T2 | RED | One test, three checkpoints: attribute present immediately; **still present at `SHARE_LINK_FLASH_MS - 1`**; gone at `SHARE_LINK_FLASH_MS` | same | cue never clears, AND an early cutoff — `setTimeout(…, 1000)` passes a present/absent pair taken only at 0 and 1600ms while stripping the attribute 600ms before the CSS animation ends (round-2 review, MEDIUM). The `MS - 1` checkpoint is what pins the constant to the specified duration |
| T3 | GUARD | First render and first panel open leave the attribute ABSENT | same | reds against an implementation that sets the attribute unconditionally on mount. NOTE: it does NOT catch `useState(null)` for `prevToken` — with a null seed the both-non-null guard suppresses that first cue anyway, so the draft's named adversary was wrong (round-2 review). The seed is covered by review, not by this row |
| T4 | GUARD | Provider re-seeded from null to a token at the same epoch (acceptance branch `app/admin/show/[slug]/ShareTokenContext.tsx:68`) leaves the attribute ABSENT | same | reds against a missing both-non-null guard |
| T5 | GUARD | Rotate with the panel CLOSED, then open it: attribute ABSENT | same | reds against a missing `!open` arm |
| T6 | GUARD | Open, rotate (assert present — the positive precondition, without which this row is vacuous), close, reopen inside the window: attribute ABSENT | same | reds against a cue that survives a close |
| T7 | GUARD | Stale rotation (lower epoch, gate at `app/admin/show/[slug]/ShareTokenContext.tsx:47`): URL unchanged AND attribute ABSENT | same | reds against a cue keyed on the rotate event rather than on the token |
| T11 | GUARD | Cue running (assert present first), token to null, then a token returns inside the window: ABSENT on the remounted block | same | round-1 HIGH: a null transition that fails to clear |
| T15 | GUARD | Cue running (assert present first), **a child reporting busy so the panel cannot auto-close**, `published` flips false with token and epoch UNCHANGED, then busy clears, then republish inside the window: ABSENT | same | round-2 HIGH: the `linkActive` leak. **The busy hold is what makes this row non-vacuous (round-3 review, HIGH).** Without it the lifecycle effect closes the popover on the `published` flip (`components/admin/showpage/ShareHub.tsx:490-495`), the `!open` arm alone clears `flash`, and the row passes against the very bug it targets. The production leak needs the busy path specifically: the close is DEFERRED while busy (`components/admin/showpage/ShareHub.tsx:491-493`) and then CANCELLED when busy clears (`components/admin/showpage/ShareHub.tsx:517-520`), so the panel stays open with `linkActive` false. Reds against a clear written over token-nullity instead of target-visibility |
| T12 | RED | Two accepted token changes 800ms apart: the `<code>` element identity DIFFERS across the second change | same | the animation does not restart. jsdom cannot observe a repaint, but a remount is the mechanism that causes one, so element identity is the honest proxy; §9.1 T16 proves the repaint itself in a browser |
| T17 | RED | Open, rotate (assert attribute present, capture the element), advance to `SHARE_LINK_FLASH_MS`: attribute gone AND **the element identity is UNCHANGED** | same | `key={flash}`. Round-3 review, HIGH: every other row passes against that key, because it also remounts on a token change — it just ALSO remounts when the timer clears, silently destroying a URL selection the admin made in order to copy by hand. T12 proves a remount happens on change; this row proves one does NOT happen on expiry. The pair is what pins `key={token}` specifically, and neither half alone does |
| T13 | RED | `vi.getTimerCount()` is greater than zero with a cue in flight, and exactly zero after `unmount()` | same | a missing `return () => clearTimeout(t)`. Replaces the draft's S11 row, which pinned "no orphan-timer warning" — vacuous, since React 18 removed that warning and this repo is on react 19.2.4, and neither `tests/setup.ts` nor the RTL default enables StrictMode (round-2 review, MEDIUM). Idiom already shipped at `tests/devcapture/useDevCapture.test.tsx:350-352` |
| T14 | RED | Two changes 800ms apart: attribute still present 1600ms after the FIRST change, gone 1600ms after the SECOND | same | a boolean instead of a nonce — the timer never re-arms and the second cue is cut short |
| T8 | RED | Source scan of `app/globals.css`: (a) both `@keyframes` blocks exist **exactly once each**; (b) `share-link-flash-bg` declares `background-color` at a `0%,45%` hold of `var(--color-accent-tint)` and `100%` of `var(--color-surface-sunken)`; (c) `share-link-flash-ring` declares `box-shadow` from `0 0 0 2px var(--color-accent-edge)` to a transparent terminus; (d) `[data-share-link-flash]` runs BOTH names at exactly `SHARE_LINK_FLASH_MS`ms; (e) the ONLY `animation: none` for that selector is inside a `prefers-reduced-motion` block; (f) no `animation-play-state` anywhere for it; (g) `ShareHub` declares no keyframes | new transitions test under tests/components/admin/showpage/ (template: `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:723-741`) | round-1 HIGH: name-only scans pass against empty bodies. Sub-assertions (a), (e) and (f) are round-2 MEDIUM: regex EXISTENCE cannot see the cascade, so a later duplicate keyframe, a later unconditional `animation: none`, or a `paused` play-state would all keep a body-only scan green. They bound the hole; they do not close it — T16 does |
| T9 | PIN | Contrast, all five pairs §3.7 lists as uncovered, each clearing 3:1 from the live CSS hexes | new rows in `tests/styles/status-token-contrast.test.ts` | a token retune drops the ring below the non-text floor |
| T10 | GATE | No import of the two deleted components remains | `pnpm typecheck` and `pnpm test` | a half-applied deletion |
| T16 | RED | **Real browser** — §9.1 | resolved-cascade defects no source scan can see |

**Preserved from the current integration test, and non-negotiable (round-2 review, MEDIUM).** The rework must keep the EXACT-VALUE assertions, not just "OLD is absent from the DOM". `tests/components/shareTokenInstantUpdate.test.tsx:113-148` asserts the exact OLD url, the exact NEW url, and the clipboard payload before and after the rotate. Absence-of-OLD alone would pass while the block rendered a WRONG token and Copy wrote a stale one. Every cue row above could also pass in that state. Keep: exact URL text before and after, and both clipboard payloads, popover-scoped.

**The adversary each row is written against.**

| Broken implementation | Row that reds |
|---|---|
| never sets the attribute | T1, T2's first checkpoint |
| sets it and never clears it | T2 |
| clears it early (wrong constant) | T2's `MS - 1` checkpoint |
| sets it unconditionally on mount | T3 |
| omits the both-non-null guard | T4 |
| omits the `!open` arm | T5, T6 |
| keys the cue on the rotate event | T7 |
| omits the null-transition clear | T11 |
| writes the clear over token-nullity instead of target-visibility | T15 |
| omits `key={token}` entirely, so the animation never restarts | T12, T16 |
| uses `key={flash}` — restarts on change but ALSO remounts at timer expiry, destroying a URL selection | T17 |
| clears on `!open` alone, leaking a cue across a busy-deferred unpublish | T15 |
| omits the effect cleanup | T13 |
| uses a boolean instead of a nonce | T14 |
| ships empty, wrong-property or wrong-color keyframes | T8(b), T8(c), T16 |
| drifts the CSS duration from the constant | T8(d), T16 |
| drops the reduced-motion override | T8(e), T16 |
| adds a later duplicate keyframe, an unconditional `animation: none`, or a paused play-state | T8(a), T8(e), T8(f) partially; **T16 conclusively** |
| moves keyframes into the component | T8(g) |
| renders a wrong token, or copies a stale one | preserved exact-value assertions above |
| retunes a token below the ring's contrast floor | T9 |

### §9.0 Test-vacuity is now a tracked vector — the structural defense

**Three consecutive review rounds have found the same class of defect: a test row that passes against the implementation it exists to reject.** Round 1: T8 green against empty keyframes. Round 2: six rows misclassified as red-first, a timer pair that a wrong constant satisfied, and cascade holes a regex cannot see. Round 3: T15 satisfied by the auto-close it forgot to suppress, T16 exercising a transition production never performs, and nothing at all separating `key={token}` from `key={flash}`.

The project rule for a three-round same-vector recurrence is explicit: stop patching instances, re-analyse the vector comprehensively, and ship a structural defense **in this repair commit** rather than waiting for a fourth round to confirm. Patching only the three rows the reviewer named would repeat the drip that the rule exists to stop.

**Comprehensive re-analysis.** Every row was re-audited against one question — *name an implementation that passes this row and should not.* Results:

| Row | Passes against a wrong implementation? |
|---|---|
| T1, T2, T13, T14 | no — each names a distinct defect and reds on it |
| T4, T5, T6, T7, T11 | no, given their positive preconditions (T6 and T11 gained theirs in round 2 and round 1 respectively) |
| T3 | yes, weakly — it is a GUARD and cannot catch the seed defect it once claimed; labelled honestly rather than strengthened, because the seed is a review-time concern |
| T12 | **partially** — it reds against no-key but NOT against `key={flash}`. Closed by the new T17 |
| T15 | **yes** — closed by the busy hold |
| T16 | **yes** — closed by exercising node replacement |
| T8 | bounded, not closed; T16 is what closes it |
| T9, T10 | n/a — PIN and GATE, not red-first by construction |

**The structural defense: an executable adversary matrix.** The plan carries a task that, for every row of the adversary table below, BUILDS the named wrong implementation, runs the suite, and records which rows red. It is mutation testing scoped to this diff, and it converts the vector from "a reviewer finds a vacuous row each round" into "the implementer proves non-vacuity before review".

Rules for that task:

- Every adversary must red at least one row. An adversary that reds nothing is a coverage hole, not a passing grade.
- Every row must red for at least one adversary, except T9 (PIN) and T10 (GATE), which are exempt by kind and declared so.
- The matrix output — adversary, rows red, rows still green — goes in the PR body. A row that reds for nothing is deleted or strengthened before review, never shipped.
- **Commit before mutating.** Reverting an injected mutation with `git checkout --` discards uncommitted work in that same file; the adversary edits land on a committed tree or not at all.

### §9.1 T16 — the real-browser cue spec

**Why it exists.** T8 is a regex scan over CSS SOURCE. Regexes see fragments, not the cascade, so every hole in the round-2 MEDIUM — a later duplicate `@keyframes`, a later unconditional `animation: none`, `animation-play-state: paused`, an `!important` override — leaves all its fragments intact and the row green while the cue renders nothing. Only a resolved computed style settles it.

**Harness.** The shipped pattern from `tests/e2e/skeletonBandParity.spec.ts:123-127`: read the real `app/globals.css`, compile it through the Tailwind CLI, serve a synthetic page carrying the real class string from `components/admin/showpage/ShareHub.tsx:715` on a `<code>`. No dev server, no Supabase — the standalone config's whole purpose.

**Assertions.**

1. Without the attribute: `getComputedStyle(el).animationName === "none"`.
2. With it: `animationName` resolves to BOTH `share-link-flash-bg` and `share-link-flash-ring`, `animationDuration` is `1.6s` twice, and `animationPlayState` is `running`.
3. The paint actually moves: sample `backgroundColor` early in the hold and again after the animation ends, and assert they DIFFER and that the settled value equals the resting `--color-surface-sunken`. This is what an empty or mis-colored keyframe cannot fake.
4. Restart, exercising the PRODUCTION mechanism rather than a convenient stand-in (round-3 review, MEDIUM). React does not toggle the attribute on a surviving node; it REPLACES the node, and the replacement is inserted already carrying the attribute. So the step is: let the animation run partway, then replace the element with a fresh node that already has `data-share-link-flash` set, and assert the animation is running from near zero again (a reset elapsed time or a fresh `animationStartTime`). Removing and re-adding the attribute on the SAME node proves attribute-toggle restart, which is not the transition production performs.
5. Under `emulateMedia({ reducedMotion: "reduce" })`, `animationName === "none"` and the background stays at rest. `skeletonBandParity.spec.ts:153` already does reduced-motion emulation in this harness.

**Wiring — four points, all required, none discoverable by convention.** A spec file that merely exists proves nothing here (`tests/e2e/standalone.config.ts:29-31` says so outright):

1. the spec file itself;
2. an entry in the `testMatch` allow-list at `tests/e2e/standalone.config.ts:35` — without it Playwright reports "No tests found" and the failure looks like a bad path;
3. a dedicated workflow that names the spec, modelled on `.github/workflows/phantom-gap-e2e.yml:158`, with `workflow_dispatch:` enabled so close-out can verify it without waiting for a trigger;
4. a row in the `_metaE2eWorkflowCoverage` registry. That guard "fails by default for NEW dark specs" (`tests/ci/_metaE2eWorkflowCoverage.test.ts:7`), and a spec whose only workflow is PATH-GATED does not count as covered — which is why `tests/e2e/phantomGapHelper.layout.spec.ts` carries a `PATH_GATED` row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:81`. Ours lands in the same bucket and needs its own row with a reason. This point was missing from the round-2 draft; the precedent is four commits old on `main` (`be0bf69b3`, "register the new e2e spec with the workflow-coverage guard"). Path filter: `app/globals.css`, `components/admin/showpage/ShareHub.tsx`, the spec, `tests/e2e/standalone.config.ts`, the workflow itself, AND the runtime inputs the harness actually depends on — `package.json`, `pnpm-lock.yaml`, `postcss.config.mjs`, `.github/actions/setup/**` (round-3 review, MEDIUM). The harness compiles real CSS through the Tailwind CLI and drives Playwright, so a dependency or setup-action bump can break the cue test while a filter listing only source paths skips the job entirely. The cited precedent lists exactly these: `.github/workflows/phantom-gap-e2e.yml:71-73` and `.github/workflows/phantom-gap-e2e.yml:79`.

Leaving any one out reproduces `BL-STANDALONE-CONFIG-CI-DARK` — a spec green once at authoring time and never run again.

## §10 Out of scope

- Any change to the rotate or picker-reset server actions, their RPCs, or their telemetry.
- Any new error-catalog code (so none of the four catalog lockstep gates apply).
- The copy-button component's variant API (R4).
- Focus management on any rotate path (R1, R2).
- Cues on any other surface (the dashboard row, the status strip, notifications).
- A named width token for the deleted chip (§2.2).

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
| share-token shape (64 hex) | `supabase/migrations/20260523000002_show_share_tokens.sql:41` |
| provider keyed by show id (executable) | `app/admin/_showReviewModal.tsx:415` |
| modal remounts per show | `app/admin/page.tsx:167-171` |
| null-to-token acceptance branch | `app/admin/show/[slug]/ShareTokenContext.tsx:68` |
| same-epoch null kept (transient fault) | `app/admin/show/[slug]/ShareTokenContext.tsx:66` |
| local rotate result state, declared / written | `app/admin/show/[slug]/RotateShareTokenButton.tsx:82` / `app/admin/show/[slug]/RotateShareTokenButton.tsx:159` |
| `outline`'s only production assignment | `docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md:628` |
| that assignment removed | `docs/superpowers/specs/2026-07-20-share-hub-design.md:104` |
| live copy-button call sites (two) | `app/admin/show/[slug]/ShareChip.tsx:44`, `components/admin/showpage/ShareHub.tsx:719` |
| `accent-edge` decorative-in-dark note | `app/globals.css:331` |
| screenshot gate path filter | `.github/workflows/screenshots-drift.yml:13` and `.github/workflows/screenshots-drift.yml:15` |
| DESIGN.md constants preamble | `DESIGN.md:274` |
| stale cross-references to the renamed test | `tests/app/admin/rotateShareToken.test.tsx:9`, `tests/app/admin/rotateShareToken.test.tsx:10`, `tests/app/admin/rotateShareToken.test.tsx:73` |
| standalone config IS invoked by CI (five workflows) | `.github/workflows/phantom-gap-e2e.yml:158`, `package.json:52` |
| standalone `testMatch` is an explicit allow-list | `tests/e2e/standalone.config.ts:29-31`, `tests/e2e/standalone.config.ts:35` |
| real-CSS synthetic-page harness | `tests/e2e/skeletonBandParity.spec.ts:123-127` |
| reduced-motion emulation in that harness | `tests/e2e/skeletonBandParity.spec.ts:153` |
| `linkActive` folds in published and archived | `components/admin/showpage/ShareHub.tsx:419` |
| unpublish does NOT rotate or bump the epoch | `supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2` |
| timer-count cleanup idiom | `tests/devcapture/useDevCapture.test.tsx:350-352` |
| its source-marker pinning comment | `components/admin/review/ShowReviewSurface.tsx:59-64` |
| imperative set precedent | `components/admin/review/ShowReviewSurface.tsx:531-533` |
| imperative clear precedent | `components/admin/review/ShowReviewSurface.tsx:506` |
| CSS-pin test template | `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:725-740` |
| attribute-assertion precedent | `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx:997` |
| text-on-tint already pinned | `tests/styles/status-token-contrast.test.ts:144` |
| accent-edge floor, light | `tests/styles/status-token-contrast.test.ts:222` |
| dark block reads the accent TRACK, NOT the edge (why five pairs are uncovered) | `tests/styles/status-token-contrast.test.ts:232-236` |
| three-consumer composition being reworked | `tests/components/shareTokenInstantUpdate.test.tsx:56-75` |
| share-token fixture length | `tests/components/shareTokenInstantUpdate.test.tsx:32` |
| outline variant, test-only | `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:60` |
| compact variant, test-only | `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:149` |

**Round-1 adversarial review.** Codex returned NEEDS-ATTENTION with eight findings (2 HIGH, 5 MEDIUM, 1 LOW-with-four-parts); all eight were verified true against live code and repaired in this revision — the null-transition cue leak (§3.1, §3.2, S6, T11), the inert-keyframe hole in T8, the overstated ring-contrast coverage (§3.7), the banner-does-not-co-occur consequence (§3.8), the untested nonce (T12), the false red-first claim (§9 kind column), the withdrawn spike claim (§6.1), and four citation mismatches. It confirmed all three designated load-bearing claims true, and confirmed the closed-panel render-phase clear terminates without conflicting with placement, busy gating, or portal mounting. Self-review during the same window added three more (the DESIGN.md preamble at `DESIGN.md:274`, the stale test cross-references, and the screenshot gate in §5.1). A citation class-sweep run on top of the four reported mismatches found a fifth the reviewer missed: the `applyPlacement` range, cited as ending at 333, actually ends at `components/admin/showpage/ShareHub.tsx:362`.

**Round-2 adversarial review.** NEEDS-ATTENTION, ten findings; all ten verified true and repaired.

Two HIGH, both real design defects the round-1 repairs did not reach:

1. **The nonce re-armed the timer but never repainted.** A CSS animation does not restart while an already-present attribute stays present, so a second rotation inside the window changed the URL with almost no signal — directly contradicting R7. The draft had called the case unreachable; it is not, because R7 admits remote rotations and nothing spaces two admins 1600ms apart. Fixed with `key={token}` (§3.2), pinned by T12 and conclusively by T16.
2. **The state model omitted `linkActive`.** `components/admin/showpage/ShareHub.tsx:419` folds `published` and `archived` into the target's presence, and a pure unpublish deliberately does NOT rotate the token or bump the epoch (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2`) — so the block can unmount with the token untouched, stranding a live cue that a republish then replays over an UNCHANGED url. The clear condition now reads target VISIBILITY, `(!open || !linkActive)`, which closes the whole class in one predicate rather than per-cause; rows S12 to S14 and T15 pin it.

The LOW citation finding was the most consequential of the rest: **R6's premise was simply false.** Five workflows do invoke the standalone Playwright config; the true statement is only that it is never run wholesale, so a spec stays dark unless a workflow names it. With a browser spec therefore cheap and precedented, and with the round-2 MEDIUM showing a source scan provably cannot see the cascade, R6 is REVERSED and §9.1 specifies the spec plus its three wiring points.

Also repaired: S11's pin was vacuous (React 19 emits no orphan-timer warning and neither `tests/setup.ts` nor the RTL default enables StrictMode) and became a real `vi.getTimerCount()` assertion, T13; six rows were misclassified RED when they only ever guard against one specific wrong implementation, so §9 gained a GUARD kind and honest per-row labels; T3's named adversary was wrong and is restated; the timer rows admitted an early cutoff and now check at `SHARE_LINK_FLASH_MS - 1`; T8 gained uniqueness and no-override sub-assertions; the §4 rework had quietly dropped the exact URL and clipboard assertions; and the DESIGN.md preamble was false in two ways, not the one the round-1 repair fixed.

The reviewer re-confirmed the three load-bearing claims and that the render-phase clear converges without conflicting with placement, busy handling, or portal mounting. It ran `spec:lint` (0 hard, 12 advisory) and `typecheck` directly; vitest could not collect under its sandbox.

**Numeric sweep.** Literals in this document and where each is single-sourced:

- `1600` / `1.6` — the cue duration. §3.2 (`SHARE_LINK_FLASH_MS`), §3.4 CSS twice, §3.5, §8, T2, T8(d), T14, §9.1. Single-sourced by T8(d)'s equality pin against the exported constant; T16 checks the resolved `1.6s`.
- `1599` — expressed in the spec as `SHARE_LINK_FLASH_MS - 1`, never as a literal, so it cannot drift.
- `800` — T12 and T14, the interval between two changes, chosen strictly inside the window.
- `0%`, `45%`, `100%` — keyframe stops. §3.4 and T8(b); the pair must move together and T8(b) is what forces that.
- `2px` — ring width. §3.4 and T8(c).
- `3` and `4.5` — the WCAG non-text and AA floors, §3.7 and T9.
- `308` — panel width, §2.1, matching `components/admin/showpage/ShareHub.tsx:699`.
- `64` — share-token length, §1, matching `supabase/migrations/20260523000002_show_share_tokens.sql:41`.
- `5` — the uncovered contrast pairs, §3.7 and T9.
- Contrast ratios (16.88, 14.66, 8.84, 8.42, 8.03, 7.59, 7.41, 9.65) — computed output, stated once in §3.7's table.
- Row and state counts: §3.5 has two RENDERED states, therefore one pair; §6.1 enumerates seventeen TRANSITIONS, a different axis.

The draft's version of this sweep claimed `45%` and `2px` appeared only in §3.4 while T8 repeated both, and omitted `0%`, `100%` and the contrast literals while claiming to enumerate everything (round-2 review, LOW).

**Contrast computation.** WCAG relative luminance over the live runtime hexes in `app/globals.css` (`--color-text-strong-runtime`, `--color-accent-tint-runtime`, `--color-accent-edge-runtime`, `--color-surface-runtime`, `--color-surface-sunken-runtime`) read from the light root block and the dark block separately. Values in §3.7.
