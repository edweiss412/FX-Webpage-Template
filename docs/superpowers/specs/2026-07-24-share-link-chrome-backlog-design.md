# Crew-page share-link chrome — backlog closure (2026-07-24)

**Status:** DRAFT · **Branch:** `feat/share-link-chrome-backlog` · **Routing:** Opus / Claude Code (UI — AGENTS.md "Hard rule: UI work is always Opus")

Closes the three open items under BACKLOG.md `## Crew-page share-link chrome (2026-07-14, share-link-instant-rotate-dedup)`: `BL-CREWPAGE-ROTATE-URL-FLASH`, `BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE`, `BL-CREWPAGE-ROTATE-FOCUS-MGMT`.

Only ONE of the three results in feature code. The other two are closed by deletion and by supersession — both dispositions are grounded in live-code and ratified-spec citations below, not in judgement calls.

---

> **A note on the paths below.** This spec names files it DELETES (the two orphaned components, their two tests, and the pre-rename integration test). Those appear as plain text rather than code spans on purpose: `spec:lint` resolves every code-span path against the tracked tree, so citing a file this change removes would make the document fail its own linter forever once it ships.

## §1 Problem

Rotating a show's share-token mints a brand-new crew URL. Every live crew-URL surface updates instantly through the client epoch-gated cache (`app/admin/show/[slug]/ShareTokenContext.tsx:46-49`), and the success banner says _"The updated link is shown above."_ (`app/admin/show/[slug]/RotateShareTokenButton.tsx:279-281`). But the swap itself is **visually silent**: the token is an opaque 64-hex-character random string (`supabase/migrations/20260523000002_show_share_tokens.sql:41` pins the shape; `supabase/migrations/20260523000002_show_share_tokens.sql:7` is the generator), so the only thing that changes on screen is a run of characters inside a monospace block. An admin watching the confirmation has no motion cue that the address above it is now different.

The two companion items are stale bookkeeping, not defects — §2 shows why.

### §1.1 Resolved scope — do not relitigate

Each row is a decision already ratified, with the citation that ratifies it. A reviewer should VERIFY the citation, not re-derive the decision.

| # | Resolved decision | Ratification |
|---|---|---|
| R1 | **`BL-CREWPAGE-ROTATE-FOCUS-MGMT` ships ZERO code.** Its requested fix — restoring focus after the rotate resolves — is an explicitly ACCEPTED RESIDUAL, not an open defect. C5 governs cancel/auto-revert paths only; submit-outcome paths get "no focus move, announcement via the surface’s existing `role="alert"`/`role="status"` result element, accepted residual where the control unmounts." Rotate is named by name in the per-surface enumeration. | `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:34` (C5 definition) and `docs/superpowers/specs/admin/2026-07-16-destructive-confirm-pass.md:82` (submit-outcome matrix case (c), Rotate enumerated) |
| R2 | The **cancel/auto-revert half of that item is already shipped**, so there is nothing left to build even on the governed paths. C3 focuses the cancel button on confirm-open; C5 restores the trigger on cancel/auto-revert. | `app/admin/show/[slug]/RotateShareTokenButton.tsx:115` (C3); `app/admin/show/[slug]/RotateShareTokenButton.tsx:106` and `app/admin/show/[slug]/RotateShareTokenButton.tsx:126` (C5 two-phase guard) |
| R3 | **app/admin/show/[slug]/ShareChip.tsx and app/admin/show/[slug]/CrewPageLink.tsx are orphans** — imported by no production module. Already recorded as such, with cleanup named as backlog material. This spec is that cleanup. | `docs/superpowers/specs/2026-07-18-admin-show-modal.md:214`; verified live in §11 |
| R4 | **`ShareLinkCopyButton`'s `variant="compact"` is NOT removed** even though this diff deletes its last production call site. It joins `variant="outline"`, which is ALREADY production-orphaned with test-only coverage under a ratified spec. Two variants in the same accepted condition is the status quo, not new debt introduced here. Removing either is a separate decision about that component's API, out of scope. `outline`'s ONLY production assignment was `StatusStrip.tsx:261` (`docs/superpowers/specs/2026-07-18-modal-header-reconciliation.md:628`), and the share-hub consolidation then removed that render outright (`docs/superpowers/specs/2026-07-20-share-hub-design.md:104`, "StatusStrip copy-link render + its `copyUrl` derivation"). Confirmed executable: the only two live call sites today are app/admin/show/[slug]/ShareChip.tsx:44 (`compact`) and `components/admin/showpage/ShareHub.tsx:719` (`accent`) — see §11. Test-only coverage survives at `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:60` (`outline`) and `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:149` (`compact`) |
| R5 | **Reduced motion renders NO cue at all** — deliberately NOT the shipped `[data-step3-warning-flash]` fallback, which leaves a steady tint (`app/globals.css:848-852`). That fallback is right for a persistent jump-target the user must still locate; it is wrong for a one-shot "this just changed" cue, where a permanent tint would assert a state that is no longer true. On the LOCAL rotate path nothing is lost — the `role="status"` banner announces the change (`app/admin/show/[slug]/RotateShareTokenButton.tsx:271-282`). On the REMOTE path it is silent; that residual is disclosed and bounded in §3.8 rather than waved away. | This spec §3.4, §3.8 |
| R6 | **REVERSED in round 2. A real-browser spec IS added, with its own dedicated workflow.** The draft justified skipping one on the claim that the standalone Playwright config "is invoked by NO CI workflow". That claim is FALSE and the reviewer was right to call it: five dedicated workflows invoke it today, each naming its own spec subset — `.github/workflows/phantom-gap-e2e.yml:158` is the clearest example, and `package.json:52` and `package.json:53` are named script entries doing the same. What IS true is narrower: the config is never run WHOLESALE, so a spec added to it stays dark unless a workflow names it (`.github/workflows/modal-header-layout-e2e.yml:39` says exactly that about the ~15 specs still dark). Since the cost is a workflow file that five precedents show how to write, and since a source scan provably cannot close the CSS cascade holes registered as A16 to A18, the browser spec is the correct call rather than a residual to disclose. §9.3 specifies it. | `.github/workflows/phantom-gap-e2e.yml:158`; `.github/workflows/modal-header-layout-e2e.yml:39`; `package.json:52` |
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

1. Replace the arbitrary `max-w-[16rem]` with a named token (app/admin/show/[slug]/ShareChip.tsx:28).
2. Add an explicit `min-w` to the crew-page link, which sets `min-h-tap-min` with no width floor (app/admin/show/[slug]/CrewPageLink.tsx:28).

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
| `null` becomes a token — a read fault recovering, OR an unarchive, OR a republish restoring eligibility | **no** | guarded on `prevToken !== null`. A same-epoch null usually produces NO context transition at all — the gate keeps the held token, so `token` never changes and there is nothing to observe; the guard earns its place on the cases that DO transition, chiefly an authoritative null at a strictly-advanced epoch followed later by a token (round-7 review). `app/admin/show/[slug]/ShareTokenContext.tsx:66` returns the held state for a same-epoch null (a transient read fault), and `app/admin/show/[slug]/ShareTokenContext.tsx:68` is the branch that accepts the returning token, so this transition means "the read recovered", not "the link rotated" |
| A token becomes `null` (show went ineligible; authoritative null at a strictly-advanced epoch) | **no** | guarded on `token !== null`, and the target does not render either way. WHAT replaces it depends on the mode: unpublished or unavailable shows the corresponding note (`components/admin/showpage/ShareHub.tsx:748-764`), but ARCHIVED shows nothing at all — the entire share half is suppressed (`components/admin/showpage/ShareHub.tsx:704`). An earlier draft claimed a note always renders (round-7 review) |
| `ShareHub` remounts (modal reopened; the provider is keyed by show id at its mount, `app/admin/_showReviewModal.tsx:415`, and the modal's remount-per-show behaviour is established at `app/admin/page.tsx:167-171`) | **no** | fresh mount reseeds `prevToken` |
| Rotate on an INACTIVE crew link (unpublished or archived) | **no** | `onRotated` is not called at all when `isCrewLinkActive` is false (`app/admin/show/[slug]/RotateShareTokenButton.tsx:165`), so `token` never changes |
| Rotation at a STRICTLY LOWER epoch, rejected by the monotonic gate (`app/admin/show/[slug]/ShareTokenContext.tsx:47`) | **no** | the gate returns the previous state object, so `token` is unchanged. Note the gate is `epoch >= held`, so an EQUAL epoch carrying a different token is ACCEPTED and correctly DOES cue — the URL really changed. Earlier drafts said `epoch <= current` is rejected, which overstates it (round-5 review, MEDIUM) |
| Panel closed when the token changes | **no cue on the next open** | §3.3 clears the pending cue whenever `open` is false |
| A token becomes `null` **while an earlier cue is still running** | **the running cue is CANCELLED** | closed by the VISIBILITY predicate `(!open || !linkActive)`, since a null token forces `linkActive` false. The ternary's clearing half is redundant here and §3.2 records it as such (round-4 review). Without the cancel the cue outlives its element and a token returning inside the same window remounts it wearing a stale attribute (round-1 HIGH). The returning token need NOT come from a rotation: a republish flips `published` alone and rotates nothing (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2`), which is the round-2 leak |

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
  // Both-non-null bumps the nonce; anything else clears. The CLEARING half is
  // redundant with the visibility predicate below (a null token forces
  // `linkActive` false, which clears anyway) and is kept only as a local
  // invariant - round-4 review showed no adversary can distinguish it, so it
  // earns no test. The GUARD half is load-bearing in the null-to-token
  // direction, where `linkActive` becomes TRUE and nothing else would suppress
  // a false cue (adversary A5).
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

**Why a nonce counter and not a boolean.** With `key={token}` handling the repaint, the nonce's remaining job is the TIMER: its effect dependency is `flash`, so a second change bumps the count, the effect re-runs, the old `setTimeout` is cleared and a fresh window starts. A boolean would no-op on the second change and clear the attribute on the FIRST change's deadline, cutting the second cue short. Both halves are needed and they are separable — A9 pins the remount, A11 pins the re-armed deadline.

### §3.3 Guard conditions (every input state)

Per the mandatory guard-conditions rule. The cue consumes FOUR inputs — `token` (`string | null`), `open` (`boolean`), and `published` plus `archived` via the derived `linkActive` (`components/admin/showpage/ShareHub.tsx:419`) — plus its own `flash` (`number | null`). The draft named only the first two, the same omission that produced the round-2 leak (round-6 review, MEDIUM).

| Input state | Rendered result |
|---|---|
| `token === null`, not archived | target element not rendered (`linkActive` false, so the unavailable or paused note renders instead, `components/admin/showpage/ShareHub.tsx:748-764`); no attribute, no cue |
| `token === null`, archived | no note either — the whole share half is suppressed (`components/admin/showpage/ShareHub.tsx:704`). The draft claimed a note always renders (round-6 review, MEDIUM) |
| `token` unchanged since last render, no cue in flight | no attribute |
| `token` unchanged since last render, cue IN FLIGHT | **attribute PERSISTS.** The cue survives every unrelated re-render — a busy flip, a result banner mounting, a placement pass — and ends only on the timer or on the visibility predicate. An implementation that clears whenever the token did not change kills the cue within about one frame (round-6 review, MEDIUM: the draft's blanket "no attribute" row said exactly that) |
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
  0%,
  45% {
    box-shadow: 0 0 0 2px var(--color-accent-edge);
  }
  100% {
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

Animates `background-color` and `box-shadow` only — no layout property, so the DESIGN.md layout-property ban holds. No bounce, elastic or overshoot (DESIGN.md motion bans).

**Both tracks share the `0%,45%` hold.** An earlier draft held only the wash and let the ring fade from t=0, reasoning that the outline should carry the tail. Shipped, that read as TWO events rather than one cue: under `ease-out` the ring was roughly two thirds gone while the fill was still at full strength. The impeccable critique and audit reached this independently, and it is the track DESIGN.md calls the change signal itself in dark. The shared stop is now pinned by its own assertion, so the two cannot drift apart again.

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

**N/A.** The cue introduces no fixed-dimension parent and no new flex or grid child relationship. It animates `background-color` and `box-shadow` on an existing element whose box model is untouched — `box-shadow` does not participate in layout, and the element keeps the exact class string it has at `components/admin/showpage/ShareHub.tsx:715`. No parent-to-child dimension relationship changes, so no real-browser DIMENSION assertion is warranted. That is a separate question from §9.3's browser spec, which measures resolved ANIMATION rather than layout and does have a CI home (R6, reversed in round 2).

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

Uncovered, and therefore all added by A22:

| Pair | Light | Dark |
|---|---|---|
| `accent-edge` vs `accent-tint` | uncovered | uncovered |
| `accent-edge` vs `surface` | covered at `tests/styles/status-token-contrast.test.ts:228` | uncovered |
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
| app/admin/show/[slug]/ShareChip.tsx | orphan; sole holder of the `max-w-[16rem]` the backlog item names |
| app/admin/show/[slug]/CrewPageLink.tsx | orphan; the `min-h-tap-min`-without-`min-w` the item names |
| tests/components/ShareChip.test.tsx | covers only the deleted component |
| tests/components/CrewPageLink.test.tsx | covers only the deleted component |

**Reworked:** tests/components/shareTokenInstantUpdate.test.tsx. Today it proves ONE provider fans a rotate out to three consumers (tests/components/shareTokenInstantUpdate.test.tsx:56-75 composes all three; tests/components/shareTokenInstantUpdate.test.tsx:113-148 asserts across them). Two of the three vanish. The test's load-bearing claim survives in reduced form and must be preserved explicitly, not quietly dropped:

- Keep, and this list is a FLOOR not a summary — the exact-value assertions at tests/components/shareTokenInstantUpdate.test.tsx:113-148 (exact OLD url, exact NEW url, clipboard payload before and after) survive verbatim, popover-scoped. Absence-of-OLD alone would pass while the block rendered a WRONG token and Copy wrote a stale one (round-2 review, MEDIUM). Also kept: the rotate is driven through the REAL rotate control's two-tap confirm (tests/components/shareTokenInstantUpdate.test.tsx:90-99), `router.refresh()` is a mocked no-op (tests/components/shareTokenInstantUpdate.test.tsx:21 and tests/components/shareTokenInstantUpdate.test.tsx:130) so the instant update is proven to come from the client cache and not a server re-render, and the OLD token then appears nowhere in the DOM (tests/components/shareTokenInstantUpdate.test.tsx:142).
- Drop: the chip and crew-link assertions (tests/components/shareTokenInstantUpdate.test.tsx:113-116 and tests/components/shareTokenInstantUpdate.test.tsx:136-139) and the chip-scoped copy-button helper (tests/components/shareTokenInstantUpdate.test.tsx:81-84).
- Keep the popover-scoped copy-button helper (tests/components/shareTokenInstantUpdate.test.tsx:85-88); with the chip gone the `within(...)` scoping is no longer strictly required, but it stays — the popover scope is the correct assertion boundary regardless of how many surfaces exist.
- The second test (tests/components/shareTokenInstantUpdate.test.tsx:151-169, stale-rotation rejection) currently asserts through the chip. Repoint it at the ShareHub URL block. The monotonic-gate claim it proves is independent of which consumer renders it, and it must NOT be deleted.
- Fold the §9 cue assertions into this file — it already drives a real rotate end to end, which is precisely the fixture the cue tests need.

Rename the file to tests/components/shareTokenRotateSurface.test.tsx and update its header comment: "the three token consumers" is no longer true, and a stale header is how the next reader is misled.

**Stale cross-references the rename leaves behind.** Three comment lines in another test name the old filename and both deleted components, and go stale silently because comments do not typecheck:

- `tests/app/admin/rotateShareToken.test.tsx:9` — names ShareChip and CrewPageLink as live "CARD surfaces".
- `tests/app/admin/rotateShareToken.test.tsx:10` and `tests/app/admin/rotateShareToken.test.tsx:73` — both point at the old filename.

All three are updated in the same commit as the rename.

**Partly touched, contrary to the R4 plan.** The `compact` variant is untouched, but `app/admin/show/[slug]/ShareLinkCopyButton.tsx` itself gained two guards once the cue landed, because a rotate invalidates what the clipboard holds — the OLD url is dead for the whole crew the moment the token changes, so a button still reading "Copied" asserts something false two pixels from the cue announcing the change:

1. a render-phase reset of `copied` when `url` changes, so no frame paints the stale confirmation;
2. a captured-url check in the async handler, so a `writeText` still in flight when the rotate lands does not announce success on resolution. The render-phase reset cannot cover this — it has already run, with the new url, before the promise settles.

Both are pinned by `tests/components/admin/shareLinkCopyButtonRotate.test.tsx`, including a row proving the second guard is not blanket suppression. That file was added in round 5 after review found the guards shipped with no test at all; the red-first order invariant 1 requires was not followed here, and the tests were mutation-checked against both guards rather than merely written after the fact.

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

`.github/workflows/screenshots-drift.yml:14` filters on `app/**` and `.github/workflows/screenshots-drift.yml:15` on `components/**`. This diff edits `app/globals.css` and `components/admin/showpage/ShareHub.tsx` and deletes two files under `app/admin/show/[slug]/`, so the **byte-comparison screenshot gate fires on this PR**.

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
| Empirical spike (stateful/race surface) | **The draft's claim here was wrong and is withdrawn (round-1 review, MEDIUM).** It described "two states with a single monotonic trigger". The RENDERED result has two states, but the state the code must get right is the product of `token` (three-valued: unchanged, changed-both-non-null, changed-with-a-null), `open` (two-valued) and `flash` (null or a nonce), with a timer whose lifetime can outlive the target element. Calling that two states is exactly what let the null-transition defect through. Replaced by the exhaustive interaction table in §6.1, which is the comprehensive re-analysis this rule asks for; every row states a required result; which test proves it is the plan's business (§9.0). No probe harness is required on top of that: nothing here is an undocumented framework contract. The one ordering question — whether a CSS animation restarts across an attribute remove then re-add in separate commits — is answered by the shipped step3 precedent, which does exactly this via `setAttribute`/`removeAttribute` plus `setTimeout` (`components/admin/review/ShowReviewSurface.tsx:531-533` and `components/admin/review/ShowReviewSurface.tsx:506`). |

### §6.1 The transition rule (total and disjoint by construction)

Three rounds tried to make an enumerated S-row table disjoint and total, and three rounds found overlaps and omissions — S10 reducing to S1, archive matching both S6 and S14, no row for closing without a cue, none for unpublish without a cue. That is the enumeration failure again, now in the transition space. So the table stops being the definition.

Let **visible** = `open && linkActive` (`components/admin/showpage/ShareHub.tsx:419`), evaluated AFTER the transition. Let the token transition be exactly one of **unchanged**, **both-non-null** (A to B, neither null), or **involves-null** (either side null). These partition their spaces, so the pair is a total, disjoint key. The rule, applied in order:

1. **If `visible` is false after the transition** — attribute ABSENT and any in-flight cue is cleared. Covers a closed panel, a null token, an unpublish, an archive, and every combination of them, whether or not a cue was running.
2. **Else if the token transition is both-non-null** — attribute PRESENT, the URL block remounts on its new `key`, the timer is armed or re-armed.
3. **Else** — attribute UNCHANGED from the prior render: it persists if a cue was in flight and stays absent otherwise. Covers every unrelated re-render — a busy flip, a banner mounting, a placement pass — and the involves-null transitions that leave the target visible.

Every reachable transition falls in exactly one branch, so N7's "if and only if" has a unique total predicate. Unmount is not a transition of this machine; it is covered by the effect cleanup (§3.2) and by K-obligation coverage, not by this rule.

**Worked examples** — illustrative, not the definition, and no longer load-bearing for totality:

| Case | Branch | Result |
|---|---|---|
| this admin rotates, panel open, link active | 2 | cue fires, block remounts |
| a remote rotate arrives while open | 2 | same — R7 |
| first render / first panel open | 3 | `prevToken` seeded, nothing in flight, no attribute |
| rotate while the panel is closed | 1 | nothing reaches the DOM |
| close the panel mid-cue | 1 | cleared |
| close the panel with no cue | 1 | no-op |
| token goes null mid-cue | 1 | cleared |
| token returns inside the window | 3 | involves-null, so no new cue |
| pure unpublish mid-cue, busy-deferred close | 1 | cleared — the round-2 leak |
| republish inside the window | 3 | token unchanged, so no false cue |
| archive | 1 | cleared; the share half is suppressed entirely |
| strictly-lower-epoch rotation rejected | 3 | the gate leaves `token` unchanged |
| busy flips, banner mounts, placement runs, all mid-cue | 3 | the cue PERSISTS |

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


**This section no longer specifies test bodies.** Four review rounds proved that pre-specifying them in prose and reasoning about their vacuity does not work here; §9.0 explains the failure and the replacement. What the spec owns is the NORMATIVE CONTRACT N0 to N7 (§9.1), plus the design-level coverage obligations in §9.2 and the completion obligations in §9.4. The adversary register (§9.1.1) is worked examples for the matrix to run — useful, never authoritative. Rows, fixtures and assertion order belong to the plan, where they are executed and mutation-proved rather than argued about.

TDD per plan-wide invariant 1 still applies: the implementation is written test-first. What changed is that the spec stops asserting which row catches what, a claim it has now been wrong about in four consecutive rounds.

### §9.0 The vector is DECLARED UNRESOLVED — and this section is the structural convergence

Four consecutive review rounds have found the same class of defect: **a test row that passes against the implementation it exists to reject.** Round 1: A13 green against empty keyframes. Round 2: six rows misclassified red-first, a timer pair a wrong constant satisfied, cascade holes a regex cannot see. Round 3: A6 satisfied by the auto-close it forgot to suppress, A17 exercising a transition production never performs, nothing separating `key={token}` from `key={flash}`. Round 4: A6 vacuous a SECOND time for a different reason, A17 sampling only one of the two paints, and A7 unable to red against its own assigned adversary.

Round 3 already triggered the comprehensive re-analysis. Round 4 found more of the same vector anyway, which under the project rule means that analysis was incomplete and the response is no longer another pass of prose repairs: **declare the vector unresolved and converge structurally.**

**Root cause.** This spec has been pre-specifying executable test BODIES in prose and then reasoning about whether each would red. That reasoning has now been wrong in four consecutive rounds, and twice the wrongness was introduced BY a repair — round 3's uniqueness rewrite of the reduced-motion assertion silently dropped the existence half round 2 had added (that gap is now registered as A15), and round 3's busy hold for the unpublish row fixed one vacuity while leaving a second. Prose cannot settle "does this assertion fail against that implementation?" Only running it can. A document that keeps asserting it will keep being wrong.

**The convergence: invert the artifact.** Adversaries are design-level, stable, and verifiable by reading. Test bodies are executable detail, only verifiable by execution. So:

- **The spec's contract is N0 to N7 in §9.1.** The adversary register that follows it is worked examples, not a completion gate.
- **Test bodies are the plan's business, not the spec's.** This section no longer claims "A6 does X and therefore catches Y" — that claim form is what has failed four times.
- **The proof obligation is executable.** The implementation ships when N0 to N7 (§9.1) hold and every §9.4 obligation is met. The adversary matrix is EVIDENCE toward that rather than the gate itself: it demonstrates the suite has teeth. The plan carries it; its output goes in the PR body.

**A note on the T-numbers below.** The round-by-round history in §11 still names rows T1 to T17. Those were the row names in earlier drafts and are retired; they are kept in the history so the review trail stays legible, and they correspond to nothing in the current contract. Forward-looking references use adversary IDs.

**Rules for the matrix.**

- Every adversary must be rejected by at least one row. An adversary nothing reds against is a coverage hole, and the fix is a new test, never a note.
- Every row must reject at least one adversary. A row that rejects nothing is deleted, not kept for reassurance. Three exemptions, declared: the contrast pins and the typecheck gate, which are regression guards rather than red-first rows; and `tests/components/admin/showpage/shareChipOrphanRemoval.test.ts`, which is a §9.4 completion guard for K1/K2 rather than a cue row — it asserts the ABSENCE of deleted code, so no mutation of the cue can red it. Exempt does not mean optional: K1/K2 require it.
- The matrix runs against the FINAL assertion set, once, not incrementally per repair. Running it per-repair is precisely how the reduced-motion assertion regressed — a later narrowing undid an earlier widening and nothing re-checked the whole.
- **Commit before mutating.** Reverting an injected mutation with `git checkout --` discards uncommitted work in that file.

### §9.1 The observable contract — closed by REFERENCE, not by paraphrase

Round 7 broke the previous version of this section, and the way it broke is the lesson. N0 to N7 tried to state the required appearance as a property list: two keyframes, these durations, this delay. An implementation can satisfy every such clause and still be wrong — `data-share-link-flash="true"` instead of the empty string, a 1px linear ring instead of 2px, a 5% wash hold instead of 45%, an extra `opacity` animation nobody asked for. Each is a property the list did not happen to mention.

That is the third time the same shape has failed: enumerated test bodies (rounds 1-4), enumerated adversaries (rounds 5-6), enumerated observable properties (round 7). **Prose enumeration of an executable property is never complete**, because completeness is judged against an unbounded space and the list is finite.

The fix is to stop paraphrasing and make the artifact itself normative:

> **N0 — `SHARE_LINK_FLASH_MS` is `1600`.** Asserted as a VALUE, not as an equality against the CSS. N1 locks the stylesheet; without N0 an implementation could ship the normative CSS with a 2000ms timer, leaving the attribute present for 400ms after the paint settled — satisfying every other clause while violating §3.2 and §3.5 (round-8 review, HIGH). N0 and N1 together keep the two in step; neither does it alone.
>
> **N1 — The CSS block in §3.4 is NORMATIVE, verbatim.** The shipped `app/globals.css` contains those two `@keyframes` blocks and that `[data-share-link-flash]` rule with exactly those declarations — same properties, same stops, same colour tokens, same widths, same easing, same duration, no additional animated properties — and the reduced-motion override exactly as written. The test compares the shipped rules against the ratified block, not against a description of it. Any 1px ring, 5% hold, stray `opacity` track or altered easing fails by construction, without anyone having predicted it.
>
> **N2 — The attribute is exactly `data-share-link-flash=""`.** Present with the empty-string value, or absent. `"true"` is a failure.
>
> **N3 — Exactly one element carries it,** the one with `data-testid="admin-current-share-link-url"`.
>
> **N4 — Element identity across an accepted token change.** The round-7 wording scoped this to nodes that "still exist after", which is vacuous: a wrongly REPLACED node fails that filter and leaves the comparison before it can be judged (round-8 review, HIGH). Instead, name the elements and require each to be re-resolvable by its own stable selector:
>
> - the URL block (`data-testid="admin-current-share-link-url"`) resolves to a DIFFERENT element object;
> - the Copy button, the row wrapper and the popover panel each resolve to the SAME element object, by their own selectors. Keying the whole row on the token therefore FAILS, because the Copy button re-resolves to a new object rather than dropping out of scope;
> - the rotate changes the panel's animation state in exactly one place. Take a per-element census of resolved `animation-name` across the panel before and after, keyed by structural path; the multiset difference must be **empty in the removal direction** and, in the addition direction, exactly the URL block carrying the cue's two tracks. An extra animated child mounted during the window is caught, and so is a rotate that silences motion already running.
>
>   Stated as a delta rather than as an absolute, because an absolute is false here: the panel animates at rest. StatusStrip's synced-dot heartbeat (DESIGN.md SYNC-PULSE-1) runs continuously, so "no element carries another `animation-name`" would forbid shipped, intended motion. Both directions are required — an additions-only diff is satisfied by stopping one animation and mounting another with the same key (round-3 review).
>
> **N5 — Element identity across timer expiry.** Same selectors, and EVERY one of them — including the URL block — resolves to the same object it did before expiry. `key={flash}` fails here rather than escaping as a non-survivor.
>
> **N6 — Paint.** With the attribute present and motion allowed, both `background-color` and `box-shadow` differ from their resting values early in the window and equal them again at or after `SHARE_LINK_FLASH_MS`. Under `prefers-reduced-motion: reduce`, both equal resting at every sample and the resolved `animation-name` is `none`.
>
> **N7 — Presence predicate.** The attribute is present exactly when §6.1's transition table says the cue is live. §6.1 is disjoint and total over its input tuple, which is what makes this delegable.

N1 is what closes the class: it admits no paraphrase gap, because there is no paraphrase. Its scope is the cue's OWN rules, selected by naming it — a rule that retunes the cue without mentioning it (by testid, class, or an ancestor) is outside N1 and is caught by N6's resolved-longhand pin instead. N1 owns byte-exactness; it does not own the absence of other rules. N2 to N7 cover what a CSS comparison cannot see — which element, which identities, what actually painted, and when.

### §9.1.1 Adversary register — WORKED EXAMPLES, explicitly not exhaustive

The register keeps its value as concrete mutations for the matrix to run, and as the record of what six review rounds actually found. It is no longer claimed complete, and completeness is no longer what the contract rests on: N0 to N7 are.


| # | Wrong implementation | Why it is wrong |
|---|---|---|
| A1 | never sets the attribute | no cue at all |
| A2 | sets it, never clears it | a permanently ringed URL block after the first rotate |
| A3 | clears it on a duration other than `SHARE_LINK_FLASH_MS` | the attribute leaves before or after the animation ends |
| A4 | sets it unconditionally on mount | every panel open flashes |
| A5 | bumps on ANY token change, including a null on either side | a transient read fault recovering, or a show regaining eligibility, reads as a rotation and fires a false cue. **This, not the missing null-clear, is the real adversary for the both-non-null guard** — round-4 review showed the null-CLEAR half is redundant, since the visibility predicate already clears whenever `linkActive` goes false. The guard's load-bearing direction is null-to-token, where `linkActive` becomes TRUE and nothing else would suppress the cue |
| A6 | clears on `!open` alone | a cue survives a busy-deferred unpublish and replays on republish |
| A7 | clears on token-nullity alone | same leak, reached through the `published` axis instead |
| A8 | keys the cue on the rotate EVENT rather than on the token changing | a rotation the epoch gate rejected — strictly lower epoch, `app/admin/show/[slug]/ShareTokenContext.tsx:47` — still flashes |
| A9 | omits `key` entirely | the animation never restarts, so a second rotation inside the window is nearly invisible |
| A10 | uses `key={flash}` | restarts correctly on a change but ALSO remounts at timer expiry, destroying a URL selection made in order to copy by hand |
| A11 | uses a boolean instead of a nonce | the timer never re-arms; the second cue is cut short at the first deadline |
| A12 | omits the effect cleanup | the timer outlives the unmount |
| A13 | ships empty, wrong-property, or wrong-colour keyframes | the attribute is scheduled and nothing paints |
| A14 | drifts the CSS duration from the exported constant | attribute and animation disagree about when the cue ends |
| A15 | ships NO reduced-motion override | motion reaches users who opted out. Registered explicitly because the round-3 wording — "the ONLY `animation: none` is inside a reduced-motion block" — is VACUOUSLY TRUE when there are zero such rules, so the source scan alone cannot reject this one |
| A16 | ships the override but a later rule outranks it | same outcome as A15, invisible to an existence check |
| A17 | adds a later duplicate `@keyframes`, an unconditional `animation: none`, an `animation-play-state: paused`, or an `!important` on `background-color` | the cue is dead while every source fragment a regex looks for is still present |
| A18 | adds an ancestor-qualified rule that suppresses the cue only inside ShareHub's real ancestry | a harness rendering a bare element cannot see it. **The browser harness must therefore reproduce the production ancestry**, not an isolated node (round-4 review, HIGH) |
| A19 | suppresses the RING while the wash still works, or leaves a static ring under reduced motion | half the ratified treatment silently disappears. **The browser spec must sample `boxShadow` as well as `backgroundColor`**, in both the motion and reduced-motion arms — sampling one paint cannot see the other (round-4 review, HIGH) |
| A20 | moves the keyframes into the component | breaks the CSS-owns-motion split this codebase pins elsewhere |
| A21 | renders a wrong token, or leaves Copy writing a stale one | the admin shares a dead link. Rejected by the exact-value assertions §4 preserves, NOT by any cue row |
| A22 | retunes `accent-tint`, `accent-edge` or `surface-sunken` below the ring's contrast floor | the cue stops being perceivable |
| A23 | puts the attribute on the wrapper row rather than the `<code>` | the ring draws around the wrong box |
| A24 | drops the `!open` arm, clearing on `!linkActive` alone | a cue set while the panel is shut survives to replay on the next open. A6 is its mirror (dropping `!linkActive`); neither covers the other, and round-5 review found only one of the pair registered |
| A25 | moves the TypeScript constant AND the CSS duration together to some other value | every drift check compares the two against EACH OTHER, so a coordinated move keeps them agreeing while the ratified duration is gone. Rejected by pinning the literal itself — the `DESIGN.md` interaction-constants row and §3.4 both name `1600`, and one of them must be asserted as a value, not as an equality |
| A26 | keeps the properties and colours but alters the `0%,45%` hold, the `2px` ring width, the endpoint direction (fading IN rather than out), or the easing | the cue paints, so a property-and-colour check passes, while the ratified treatment is not what ships. A13 covers substance; this covers shape |
| A27 | leaves a steady background wash under reduced motion | the mirror of A19's static ring. R5 rules out any residual paint, not merely residual motion, and a check written only against the ring cannot see a wash |

### §9.2 Coverage obligations that are design-level, not row-level

These survive here because they constrain WHAT must be measured, not how a row is written:

1. **Both paints, both arms.** The browser spec samples `backgroundColor` AND `boxShadow`, under normal motion and under `emulateMedia({ reducedMotion: "reduce" })` (`tests/e2e/skeletonBandParity.spec.ts:156` is the shipped emulation call). Reduced motion must show no animation AND no residual static ring.
2. **Production ancestry.** The harness renders the cue inside ShareHub's real ancestor chain, not a bare element on a blank page — otherwise A18 is unreachable.
3. **The production restart mechanism.** React replaces the keyed node and the replacement is inserted already carrying the attribute. The restart assertion exercises node REPLACEMENT, not attribute toggling on a surviving node.
4. **Exact values, not absence.** The reworked integration test keeps the exact OLD url, exact NEW url and both clipboard payloads (§4). Absence-of-OLD alone cannot reject A21.
5. **Contrast.** All five pairs §3.7 identifies as uncovered, from the live CSS hexes.
6. **Suppress the second lifecycle close.** Any scenario that flips `published` twice must account for BOTH transitions closing the popover (`components/admin/showpage/ShareHub.tsx:490-495`), and must assert the target is PRESENT after the republish before asserting anything about its attributes. An absence assertion against a target that no longer exists proves nothing — the defect round 4 found in A6 for the second time.

### §9.3 The real-browser spec

**Why it exists.** A regex over CSS source sees fragments, not the cascade. A17, A18 and A16 all leave every fragment intact. Only a resolved computed style settles them.

**Harness — the LIVE esbuild-bundled family, NOT the static one.** An earlier draft named `tests/e2e/skeletonBandParity.spec.ts:123-127`. That harness renders out of process to an HTML string and never hydrates, so it cannot reach this target at all: the cue lives inside a popover that renders only while `open` is true, and is portaled. A static render of ShareHub produces no popover, which makes §9.2 items 2 and 3 unreachable through it. This is the failure the project memo calls a static-render harness hiding client-only mounts.

The correct template is `tests/e2e/hoverhelp-geometry.spec.ts`, whose subject is also a portaled popover, with its `tests/e2e/_hoverHelpGeometryLiveEntry.tsx` entry file. Two properties are load-bearing and both must be copied:

- the real component tree is bundled with VERSION-PINNED esbuild (`tests/e2e/hoverhelp-geometry.spec.ts:58` pins `esbuild@0.28.0`, because Playwright's babel transform otherwise rewrites the bundle), and hydrated, so the popover can be opened and a real React remount driven;
- the token CSS is compiled from `app/globals.css` through the Tailwind CLI with explicit `@source` entries naming each component file (`tests/e2e/hoverhelp-geometry.spec.ts:76` and `tests/e2e/hoverhelp-geometry.spec.ts:80-82`). An `@source` for `components/admin/showpage/ShareHub.tsx` is REQUIRED — without it the compiled stylesheet omits the very classes the cue paints over, and the spec measures a bare box while reporting green.

**Wiring — four points, all required, none discoverable by convention.** A spec file that merely exists proves nothing here (`tests/e2e/standalone.config.ts:29-31` says so outright):

1. the spec file;
2. an entry in the `testMatch` allow-list at `tests/e2e/standalone.config.ts:35` — without it Playwright reports "No tests found" and the failure looks like a bad path;
3. a dedicated workflow naming the spec, modelled on `.github/workflows/phantom-gap-e2e.yml:158`, with `workflow_dispatch:` enabled. Its path filter covers the source paths AND the runtime inputs the harness depends on — `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `postcss.config.mjs`, `tsconfig.json`, `.github/actions/setup/**` — because the harness compiles CSS through the Tailwind CLI and drives Playwright, so a dependency, workspace-policy, TypeScript-config or setup-action change can break it while a source-only filter skips the job. The precedent lists all of them: `.github/workflows/phantom-gap-e2e.yml:71-73`, `.github/workflows/phantom-gap-e2e.yml:79`, `.github/workflows/phantom-gap-e2e.yml:84-85`;
4. a row in the `_metaE2eWorkflowCoverage` registry. That guard "fails by default for NEW dark specs" (`tests/ci/_metaE2eWorkflowCoverage.test.ts:7`) and a path-gated workflow does not count as covered — which is why `tests/e2e/phantomGapHelper.layout.spec.ts` carries a `PATH_GATED` row at `tests/ci/_metaE2eWorkflowCoverage.test.ts:81`. Precedent four commits old on `main`: `be0bf69b3`.

Leaving any one out reproduces `BL-STANDALONE-CONFIG-CI-DARK` — a spec green once at authoring time and never run again.

### §9.4 Completion obligations (the non-cue half of the contract)

The adversary register covers the CUE. It cannot cover the rest of this spec, because the rest is not an implementation with wrong variants — it is a set of deliverables that are either done or not. Round-5 review made the gap concrete: **every adversary could be rejected, the cue could ship perfectly, and the backlog closure could still be incomplete.** So these are contract items in their own right, each verifiable by inspection rather than by mutation:

| # | Obligation | Done when |
|---|---|---|
| K1 | app/admin/show/[slug]/ShareChip.tsx and app/admin/show/[slug]/CrewPageLink.tsx deleted | `rg 'ShareChip\|CrewPageLink' app components tests` returns nothing EXCEPT the orphan guard itself, which necessarily names both to assert their absence. The executable form of this obligation is that guard, which self-excludes; the bare command is a human spot-check and will always show that one hit (round-2 review corrected an earlier wording that claimed a zero-hit result) |
| K2 | tests/components/ShareChip.test.tsx and tests/components/CrewPageLink.test.tsx deleted | same sweep |
| K3a | the false test TITLE at tests/components/shareTokenInstantUpdate.test.tsx:151 corrected — it says "epoch <= current is rejected", but the gate accepts EQUAL epochs (`app/admin/show/[slug]/ShareTokenContext.tsx:47`). The assertion is right; the name lies about it (round-8 review) | the title says strictly-lower |
| K3 | the integration test renamed, its header comment rewritten, and EVERY item §4 lists as preserved actually preserved — not a paraphrase of it: the real two-tap Rotate driver, the mocked no-op `router.refresh()` that proves the update came from the client cache, the exact OLD url, the exact NEW url, both clipboard payloads, the OLD-token-nowhere-in-the-DOM sweep, the lower-epoch rejection case, and popover-scoped locators. Cue coverage is colocated in this same file | each listed item is present in the renamed file; `pnpm test` green |
| K4 | **every** stale topology claim corrected, not merely the three obvious ones. A name-only grep misses these, because they describe the OLD fan-out in prose without naming a deleted component (round-8 review, MEDIUM): `app/admin/show/[slug]/ShareTokenContext.tsx:6-8` and `app/admin/show/[slug]/ShareTokenContext.tsx:72-74` ("every crew-URL surface", "the three consumers"); `app/admin/show/[slug]/RotateShareTokenButton.tsx:14-17` and `app/admin/show/[slug]/RotateShareTokenButton.tsx:161-164` (card / header chip / crew link fan-out); `components/admin/showpage/StatusStrip.tsx:7-9`, `components/admin/showpage/StatusStrip.tsx:18-24`, `components/admin/showpage/StatusStrip.tsx:27`, `components/admin/showpage/StatusStrip.tsx:39`, `components/admin/showpage/StatusStrip.tsx:99` (the retired standalone strip copy-link); `tests/components/RotateShareTokenButton.test.tsx:4-6` and `tests/components/RotateShareTokenButton.test.tsx:71-73`; plus the three in `tests/app/admin/rotateShareToken.test.tsx:9`, `tests/app/admin/rotateShareToken.test.tsx:10`, `tests/app/admin/rotateShareToken.test.tsx:73`. The sweep is by CLAIM, not by identifier | none of the listed sites still describes a fan-out that no longer exists |
| K5 | all three backlog items removed from `BACKLOG.md` and archived with their resolutions in `BACKLOG-archive.md` (§5) | the section is gone from `BACKLOG.md`; three archive entries exist |
| K6 | `BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE` filed (§3.8) | the entry exists in `BACKLOG.md` |
| K7 | `DESIGN.md` gains (a) the constant with its owning module, (b) BOTH false halves of the `DESIGN.md:274` preamble corrected, and (c) the note §3.7 requires — what the cue is, its reduced-motion posture, and the measured ratios | all three present; the preamble no longer claims single-file ownership, nor that every listed constant paints nothing |
| K8 | the four §9.3 wiring points all present | the browser spec runs in CI on a PR that touches `app/globals.css`, and `tests/ci/_metaE2eWorkflowCoverage.test.ts` is green |
| K9 | `screenshots-drift` green on the real PR without rebaselining (§5.1) | the job reports no diff |

K4, K7 and K8 are the ones a "the feature works" reading would miss, which is why they are enumerated rather than left to the plan.


### §9.5 Why this spec proceeds to implementation without a clean adversarial APPROVE

Eight review rounds have run. Every finding in all eight was verified true against live code — no false positives — and they have been worth the rounds: the null-transition leak, the `linkActive` leak, the auto-close vacuity, the reversed R6, the `key={token}` repaint gap and the timer-pin gap were all real, and several would have shipped.

But the record now shows two clearly separated things:

- **The DESIGN has been confirmed correct in every round since round 2** — the three load-bearing factual claims, render-phase convergence, independence from placement/busy/portal machinery, the epoch gate, the reduced-motion posture, and §4's preserved coverage were each re-verified round after round.
- **What has kept failing is the ORACLE PROSE** — the attempt to specify, in a document, exactly what a not-yet-written test must assert. That vector has now failed in four distinct forms: enumerated test bodies (rounds 1-4), enumerated adversaries (rounds 5-6), enumerated observable properties (round 7), and enumerated transitions (rounds 6-8). Each repair narrowed or widened a clause and created the next round's finding; that mechanism fired at least three times in our own repairs.

The project rule for exactly this situation is explicit: when a design-correctness vector survives three rounds, "stop patching prose: build the probe/prototype", and for such vectors "the comprehensive re-analysis IS the spike, not another document audit." The sanctioned convergence is to deep-dive **spec and diff together** — and the diff does not exist yet.

So the oracle vector is DECLARED UNRESOLVED IN PROSE and resolved by construction instead. N0 to N7 plus §9.2 and §9.4 are the contract the plan implements; the executable adversary matrix, run against real code, settles what eight rounds of prose could not. The whole-diff cross-model review is where the oracle gets its adversarial pass, against assertions that exist and can be run rather than against sentences describing them.

This is a deliberate, cited deviation from "spec review to APPROVE", not an abandonment of the gate. Round 8's substantive findings are all repaired above; what is being declined is round 9 of the same class.

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
| the arbitrary max-width | app/admin/show/[slug]/ShareChip.tsx:28 |
| tap-height with no width floor | app/admin/show/[slug]/CrewPageLink.tsx:28 |
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
| live copy-button call sites (two) | app/admin/show/[slug]/ShareChip.tsx:44, `components/admin/showpage/ShareHub.tsx:719` |
| `accent-edge` decorative-in-dark note | `app/globals.css:331` |
| screenshot gate path filter | `.github/workflows/screenshots-drift.yml:14` and `.github/workflows/screenshots-drift.yml:15` |
| DESIGN.md constants preamble | `DESIGN.md:274` |
| stale cross-references to the renamed test | `tests/app/admin/rotateShareToken.test.tsx:9`, `tests/app/admin/rotateShareToken.test.tsx:10`, `tests/app/admin/rotateShareToken.test.tsx:73` |
| standalone config IS invoked by CI (five workflows) | `.github/workflows/phantom-gap-e2e.yml:158`, `package.json:52` |
| standalone `testMatch` is an explicit allow-list | `tests/e2e/standalone.config.ts:29-31`, `tests/e2e/standalone.config.ts:35` |
| real-CSS synthetic-page harness | `tests/e2e/skeletonBandParity.spec.ts:123-127` |
| reduced-motion emulation in that harness | `tests/e2e/skeletonBandParity.spec.ts:156` |
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
| three-consumer composition being reworked | tests/components/shareTokenInstantUpdate.test.tsx:56-75 |
| share-token fixture length | tests/components/shareTokenInstantUpdate.test.tsx:32 |
| outline variant, test-only | `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:60` |
| compact variant, test-only | `tests/components/admin/shareLinkCopyButtonVariant.test.tsx:149` |

**Round-1 adversarial review.** Codex returned NEEDS-ATTENTION with eight findings (2 HIGH, 5 MEDIUM, 1 LOW-with-four-parts); all eight were verified true against live code and repaired in this revision — the null-transition cue leak (§3.1, §3.2, S6, T11), the inert-keyframe hole in T8, the overstated ring-contrast coverage (§3.7), the banner-does-not-co-occur consequence (§3.8), the untested nonce (T12), the false red-first claim (§9 kind column), the withdrawn spike claim (§6.1), and four citation mismatches. It confirmed all three designated load-bearing claims true, and confirmed the closed-panel render-phase clear terminates without conflicting with placement, busy gating, or portal mounting. Self-review during the same window added three more (the DESIGN.md preamble at `DESIGN.md:274`, the stale test cross-references, and the screenshot gate in §5.1). A citation class-sweep run on top of the four reported mismatches found a fifth the reviewer missed: the `applyPlacement` range, cited as ending at 333, actually ends at `components/admin/showpage/ShareHub.tsx:362`.

**Round-2 adversarial review.** NEEDS-ATTENTION, ten findings; all ten verified true and repaired.

Two HIGH, both real design defects the round-1 repairs did not reach:

1. **The nonce re-armed the timer but never repainted.** A CSS animation does not restart while an already-present attribute stays present, so a second rotation inside the window changed the URL with almost no signal — directly contradicting R7. The draft had called the case unreachable; it is not, because R7 admits remote rotations and nothing spaces two admins 1600ms apart. Fixed with `key={token}` (§3.2), pinned by T12 and conclusively by T16.
2. **The state model omitted `linkActive`.** `components/admin/showpage/ShareHub.tsx:419` folds `published` and `archived` into the target's presence, and a pure unpublish deliberately does NOT rotate the token or bump the epoch (`supabase/migrations/20260701000000_published_toggle_unpublish_show.sql:2`) — so the block can unmount with the token untouched, stranding a live cue that a republish then replays over an UNCHANGED url. The clear condition now reads target VISIBILITY, `(!open || !linkActive)`, which closes the whole class in one predicate rather than per-cause; rows S12 to S14 and T15 pin it.

The LOW citation finding was the most consequential of the rest: **R6's premise was simply false.** Five workflows do invoke the standalone Playwright config; the true statement is only that it is never run wholesale, so a spec stays dark unless a workflow names it. With a browser spec therefore cheap and precedented, and with the round-2 MEDIUM showing a source scan provably cannot see the cascade, R6 is REVERSED and §9.3 specifies the spec plus its four wiring points.

Also repaired: S11's pin was vacuous (React 19 emits no orphan-timer warning and neither `tests/setup.ts` nor the RTL default enables StrictMode) and became a real `vi.getTimerCount()` assertion, T13; six rows were misclassified RED when they only ever guard against one specific wrong implementation, so §9 gained a GUARD kind and honest per-row labels; T3's named adversary was wrong and is restated; the timer rows admitted an early cutoff and now check at `SHARE_LINK_FLASH_MS - 1`; T8 gained uniqueness and no-override sub-assertions; the §4 rework had quietly dropped the exact URL and clipboard assertions; and the DESIGN.md preamble was false in two ways, not the one the round-1 repair fixed.

The reviewer re-confirmed the three load-bearing claims and that the render-phase clear converges without conflicting with placement, busy handling, or portal mounting. It ran `spec:lint` (0 hard, 12 advisory) and `typecheck` directly; vitest could not collect under its sandbox.

**Round-4 adversarial review, and the structural turn.** NEEDS-ATTENTION, five findings, all verified true. Every one was the same vector as findings in rounds 1 through 3: a test that passes against the implementation it exists to reject.

Two mattered most. T15 was vacuous a SECOND time, for a different reason than round 3 fixed: the republish is itself a lifecycle transition, so it closes the popover (`components/admin/showpage/ShareHub.tsx:490-495`) and the final absence assertion passes because the target is GONE, not because the cue was cleared. And T11 could not red against its own assigned adversary at all — removing the null-clear while keeping the visibility predicate is behaviourally identical, because a null token forces `linkActive` false. That second finding is a real simplification, now recorded in §3.2: the clearing half of the ternary is redundant, and only its guarding half is load-bearing (adversary A5).

Round 3 had already triggered the mandatory comprehensive re-analysis. Round 4 found the same vector anyway, which under the project rule means that analysis was incomplete and the answer is no longer more prose. §9.0 declares the vector unresolved and inverts the artifact: the spec's contract moved out of test bodies entirely; after round 7 it settled as the normative N0 to N7 in §9.1, with test bodies in the plan where they are executed and mutation-proved. The spec stops making per-row claims it has been wrong about four consecutive times.

Also repaired from round 4: the browser spec must sample `boxShadow` as well as `backgroundColor` and must render ShareHub's production ancestry (a bare node cannot see an ancestor-qualified override) — both now obligations A18, A19 and §9.2; the workflow filter gained `pnpm-workspace.yaml` and `tsconfig.json` (`.github/workflows/phantom-gap-e2e.yml:84-85`); and three citation line numbers drifted.

**Round-5 adversarial review.** NEEDS-ATTENTION, five findings, all verified true. **The vector finally MOVED**: none of the five was a vacuous test. Every one was about the newly-introduced register's own completeness or internal consistency, which is what the inversion was for — the class that ran rounds 1 through 4 is closed.

Repairs: four wrong implementations were unregistered and are now A24 to A27 — dropping the `!open` arm (A6's mirror, and only one of the pair had been registered), moving the TypeScript constant and the CSS duration TOGETHER so every equality check still passes while the ratified value is gone, altering the hold stop, ring width, endpoint direction or easing while keeping properties and colours, and leaving a steady WASH under reduced motion (A19's mirror). §6.1's "rejects adversary" column is DELETED: five of its cells were behaviourally wrong, because that column was mechanically remapped from retired row names, and asserting rejection in prose is exactly what §9.0 exists to stop — rejection is matrix output. New §9.4 registers the nine completion obligations the cue-focused register structurally could not cover; the reviewer's framing was that every adversary could be rejected and the backlog closure still be incomplete. The stale-epoch claim was overstated: the gate is `epoch >= held` (`app/admin/show/[slug]/ShareTokenContext.tsx:47`), so an EQUAL epoch carrying a new token is accepted and correctly cues; only a strictly lower one is rejected. Finally the inversion had left stale cross-references — §9.1 versus §9.3 for the browser spec, a "every state row has a test" claim, and bogus sub-lettered adversary IDs the mechanical remap invented.

**Round-6 adversarial review, and the second structural turn.** NEEDS-ATTENTION, four findings, all verified true. The reviewer also confirmed three things positively: A1 to A27 contained no behaviourally indistinguishable adversary, §6.1 is sufficient without a rejection column, and the hardcoded 1600ms is defensible given its explicit reduced-motion override.

The decisive finding was the register being incomplete AGAIN — three more wrong implementations, one round after four had been added for the same reason. That is the signal that mattered: asking "name an uncovered wrong implementation" will always produce an answer, because the space of wrong implementations is unbounded. An enumerated register can never be proven complete, which is the open-ended-list failure that enumerated test bodies had, one level up. So §9.1 is now a CLOSED observable contract, N0 to N7, and the register is demoted to worked examples in §9.1.1. All three newly-named implementations fail a clause without having been foreseen — that is the point of the change.

The most serious of the rest was a genuine correctness bug in §3.3, not bookkeeping: the guard table said an unchanged token means no attribute, full stop. During a live cue the component re-renders constantly — busy flips, the result banner mounting, placement passes — and every one of those has an unchanged token. Following the table as written would clear the cue within about a frame. The row is now split on whether a cue is in flight.

Also repaired: §9.4 could certify incomplete work (K3 paraphrased §4's preserved assertions instead of naming them, K7 omitted the required DESIGN.md note, and K1's zero-result sweep collided with a stale comment in a file §4 marks untouched); §3.1 had a row calling the null-clear load-bearing while §3.2 records it redundant, and another claiming a republish rotates and bumps the epoch when it flips `published` alone; §3.3 omitted `linkActive` from its input model and claimed a note always renders when a token is null, which archived mode contradicts; and the numeric sweep had gone stale against its own text.

Separately self-found: §9.3 named the STATIC harness (`skeletonBandParity`), which never hydrates and therefore cannot open a portaled popover at all — so the production-ancestry and real-remount obligations were unreachable through it. Corrected to the live esbuild-bundled `hoverhelp-geometry` template, including the version-pinned esbuild and the `@source` entry without which the compiled stylesheet omits the classes the cue paints over.

**Round-7 adversarial review, and the third and final turn.** NEEDS-ATTENTION, six findings, all verified true. The reviewer again confirmed the three load-bearing claims, render-phase convergence, the epoch gate, the reduced-motion handling, §4's preserved coverage, and K1 to K9.

The HIGH that mattered: **N0 to N7 were not closed either.** An implementation could satisfy every clause and still ship `data-share-link-flash="true"`, a 1px linear ring, a 5% wash hold and a stray `opacity` track — each a property the list did not happen to mention.

That is the same shape failing a THIRD time: enumerated test bodies (rounds 1-4), enumerated adversaries (rounds 5-6), enumerated observable properties (round 7). Prose enumeration of an executable property is never complete, because the space it is judged against is unbounded and any list is finite. Two structural turns had each replaced one list with a better list.

So §9.1 stops paraphrasing. **N1 makes the §3.4 CSS block itself normative, verbatim**, and the test compares shipped rules against that block rather than against a description of it. There is no paraphrase gap because there is no paraphrase; every example above fails by construction, unforeseen. N2 to N7 carry only what a CSS comparison cannot see: the exact attribute value, which element holds it, which element identities change and when, what actually painted, and the presence predicate.

The other HIGHs were real precision defects in the same section: N4 now quantifies over ELEMENT nodes that existed before the change and survive it, so text nodes and freshly-mounted banner nodes stop being counterexamples; and §6.1 was neither disjoint nor total — S1 overlapped the token-unchanged transitions that DO clear, and no row covered a both-non-null change with `linkActive` false. Both fixed, which is what lets N7 delegate to it.

Also repaired: §9 held two incompatible statements of what the contract IS, so a plan could not tell whether the register or the observables were the gate — the register is now unambiguously worked examples; the null-transition rows overstated how often a same-epoch null even produces a transition and omitted unarchive and republish as sources of a returning token; and the archived mode renders no note at all, which an earlier row contradicted.

**Numeric sweep.** Literals in this document and where each is single-sourced:

- `1600` — the cue duration. Declared as `SHARE_LINK_FLASH_MS` in §3.2, written twice in the normative §3.4 CSS, and referenced by N1 and N6. N1's verbatim comparison is what keeps the two in step.
- `1.6` — appears only inside this sweep, as the seconds form of the above. No clause depends on it.
- `800` — appears only inside this sweep, as the illustrative gap between two changes inside the window. Earlier drafts attributed it to §3.2, which no longer contains it.
- `1599` — does not appear. Earlier drafts claimed it was expressed as `SHARE_LINK_FLASH_MS - 1`; that phrasing left the document with the test bodies in round 4.
- `0%`, `45%`, `100%`, `2px` — keyframe geometry, stated ONCE each, in the normative §3.4 block. Nothing paraphrases them any more; N1 is why they need no second home.
- `3` and `4.5` — the WCAG non-text and AA floors, in §3.7's table; §9.2 item 5 references the pairs without repeating the numbers.
- `308` — panel width, §2.1, matching `components/admin/showpage/ShareHub.tsx:699`.
- `64` — share-token length, §1, matching `supabase/migrations/20260523000002_show_share_tokens.sql:41`.
- `5` — the uncovered contrast pairs, §3.7 and §9.2 item 5.
- `4` — the wiring points, §9.3.
- `8` — the normative clauses N0 to N7.
- Contrast ratios (16.88, 14.66, 8.84, 8.42, 8.03, 7.59, 7.41, 9.65) — computed output, stated once in §3.7's table.
- Counts on three different axes, deliberately not reconciled: §3.5 has two RENDERED states, therefore one pair; §6.1 states a three-branch transition RULE with thirteen worked examples; §9.1.1 lists twenty-seven WORKED-EXAMPLE adversaries, explicitly not a closed set; §9.1 states eight NORMATIVE clauses, N0 to N7.

The draft's version of this sweep claimed `45%` and `2px` appeared only in §3.4 while A13 repeated both, and omitted `0%`, `100%` and the contrast literals while claiming to enumerate everything (round-2 review, LOW).

**Contrast computation.** WCAG relative luminance over the live runtime hexes in `app/globals.css` (`--color-text-strong-runtime`, `--color-accent-tint-runtime`, `--color-accent-edge-runtime`, `--color-surface-runtime`, `--color-surface-sunken-runtime`) read from the light root block and the dark block separately. Values in §3.7.
