# Venue card VCR-2 + VCR-3 fixes — design

**Date:** 2026-07-17
**Slug:** `venue-card-vcr2-vcr3-fixes`
**Amends:** `docs/superpowers/specs/2026-07-06-venue-card-redesign-design.md` §3.2, §5, §6, §8 (the only ratified places this pass supersedes; everywhere else that spec still wins).
**Closes:** `DEFERRED.md` `VCR-2` (§DEFERRED.md:376), `VCR-3` (§DEFERRED.md:382); `BACKLOG.md` `BL-VENUE-MAP-DARK-DOUBLE-FETCH`, `BL-VENUE-LINK-ONLY-EMPTY-CARD`.
**Surfaces:** `components/admin/wizard/VenueMapTile.tsx`, `components/admin/wizard/step3ReviewSections.tsx` (`VenueBreakdown`, `step3ReviewSections.tsx:922`).
**Routing / gates:** UI-touched → Opus-only + invariant-8 impeccable dual-gate (critique + audit). No DB, no advisory locks, no new route, no new secret, no `§12.4` catalog code.

---

## 1. Problem statement

Two ratified deferrals on the admin venue card (`feat/venue-card-redesign`, invariant-8 dual-gate 2026-07-06):

- **VCR-2 [P2] — dark-mode first paint double-fetch.** `VenueMapTile.tsx:29` initializes `theme` to `"light"` and corrects in a post-hydration `useEffect` (`VenueMapTile.tsx:30-33`, reads `document.documentElement.dataset.theme`). A dark-mode reviewer's first `<img>` `src` (`VenueMapTile.tsx:36`) carries `theme=light`; the effect then flips it to `theme=dark`, producing a one-frame light-map flash plus a redundant (billable) proxy round-trip. Originally deferred as an accepted trade-off (original §6) because a `useState` initializer reading `dataset.theme` would break SSR/hydration parity (server has no `document` → `"light"`; a mismatched client initial render throws a hydration error).

- **VCR-3 [MEDIUM] — link-only venue renders an empty card.** `VenueBreakdown` (`step3ReviewSections.tsx:973`) mounts the map region only when `query` is non-empty (`query = [name, address].filter(Boolean).join(", ")`, `step3ReviewSections.tsx:940`). A venue whose ONLY populated field is a valid `googleLink` yields `mapHref` non-null (`step3ReviewSections.tsx:937`) but empty `query`, and `count === 1` (googleLink counted per original §5.4), so the `No venue details parsed.` empty state is suppressed yet the body renders nothing actionable: no name/address block, no map region (gated on `query`), no dock footer, and the maps link is not surfaced (no raw URLs / dead anchors, invariant 5).

Both are now being fixed. Both fixes are client-only React changes; neither reopens the key-safe proxy route (`app/api/admin/venue-map/route.ts`), the static-map helper (`lib/maps/staticMap.ts`), the count contract (original §5.4), or the dimensional invariants (original §7).

---

## 2. VCR-2 fix — client mount-gate (chosen)

**Approach considered & rejected — cookie SSR-hint.** Write an `fxav-theme` cookie from `ThemeToggle` alongside `localStorage`; server reads it and renders the correct `theme` at SSR. Correct first paint for everyone, but touches global theme infra (`ThemeToggle.tsx`, `app/layout.tsx` `NO_FOUC_SCRIPT`, a server read path) — blast radius far beyond the venue card for a P2. Rejected on scope.

**Chosen — client mount-gate.** The `<img>` is not rendered until a post-hydration effect resolves the real theme; until then only the always-painted stripe base shows. Because the server and the first client render agree (both render *no* `<img>`), there is no hydration mismatch, and the `<img>` mounts exactly once with the correct theme — no light `src` is ever emitted.

### 2.1 `VenueMapTile.tsx` changes

- `theme` state type becomes `"light" | "dark" | null`; **initial value `null`** (was `"light"`, `VenueMapTile.tsx:29`).
- The existing post-mount `useEffect` (`VenueMapTile.tsx:30-33`) still calls `setTheme(readTheme())`. `readTheme()` (`VenueMapTile.tsx:8`) is unchanged and always returns `"light" | "dark"` (never `null`), so after hydration `theme` is always a resolved value.
- The `src` string (`VenueMapTile.tsx:36`) is computed **only when the `<img>` is rendered** (see 2.2), so `theme` is guaranteed non-`null` at that point (no `theme=null` string ever reaches the URL).

### 2.2 `<img>` mount predicate

The `<img>` (layer 2) is rendered **iff `query !== "" && theme !== null`**. Layers 1 (stripe base) and the `map` mono label are always painted; layer 3 (Directions) follows `mapHref` (unchanged, and see §3). When `theme === null` (SSR + first client render) or `query === ""` (link-only, see §3), no `<img>` is in the DOM.

`onLoad`/`onError` handlers (`VenueMapTile.tsx:69-76`) are unchanged and only ever attach to a rendered `<img>`.

### 2.3 Guard conditions (VCR-2)

| State | Render |
|---|---|
| `theme === null` (SSR, first client render, pre-effect) | Stripe base + `map` label painted; **no `<img>`**. Deterministic, SSR-safe, matches server ⇒ no hydration mismatch. |
| `theme` resolved (`"light"`/`"dark"`), `query` non-empty | `<img>` mounts once with correct `theme`; single proxy fetch. No light-map flash in dark mode. |
| `theme` resolved, `query === ""` | No `<img>` (nothing to geocode); stripe + `map` label + Directions if `mapHref` (see §3). |

**Cost (accepted):** light-mode reviewers (the common case) also see ~1 frame of stripe-before-`<img>` on first paint, because the `<img>` now mounts post-effect for all themes rather than being present in the initial HTML with `theme=light`. Acceptable for an admin-only tool; the stripe base is token-driven and correct in both modes. This is a strictly better posture than the deferred behavior (which flashed a *wrong-theme raster* in dark mode).

**No regression on runtime theme toggle.** The effect resolving `theme` has empty deps (`VenueMapTile.tsx:30-33`, `[]`) — it runs once at mount and does not re-subscribe to runtime `ThemeToggle` flips while a card is already visible. This is **unchanged** from the deferred behavior (the current `useState("light")` + one-shot effect has the same non-listening posture); the mount-gate only changes the *initial* value from `"light"` to `null`. Re-syncing the raster on a runtime toggle is out of scope and not reopened. The original §8 compound "theme flip while image mid-load → new `src` supersedes the in-flight load" still applies whenever `theme` *does* change (e.g. a fresh mount at the new theme).

---

## 3. VCR-3 fix — degraded tile + Directions (chosen)

**Approaches considered & rejected.** (a) *Text Directions link in the column* — surface `googleLink` as a text affordance in the left column; adds a new text-column link element and diverges from the tile-owns-Directions pattern. (b) *Count fix → empty state* — stop counting `googleLink` so `count → 0` and the empty state renders; drops a real, actionable fact from the card. Both rejected: the tile already owns the Directions affordance, so reusing it is the least-divergent fix.

**Chosen — degraded tile + Directions.** When `query` is empty but `mapHref` is valid, the map region still mounts and shows the always-painted stripe base + `map` label + Directions button, with the whole tile anchored to `googleLink`. No `<img>` is requested (there is nothing to geocode). The link-only venue becomes actionable instead of blank.

### 3.1 Parent `VenueBreakdown` change (`step3ReviewSections.tsx:973`)

- Region mount gate changes from `query ?` to **`query || mapHref ?`**. The region mounts when there is a map to show **or** a directions link to surface.
- The region wrapper keeps its exact classes (`step3ReviewSections.tsx:976`: `h-40 w-full self-stretch border-t border-border sm:h-auto sm:w-[172px] sm:shrink-0 sm:border-t-0 sm:border-l`) and `data-testid="venue-map-region"`. `<VenueMapTile query={query} mapHref={mapHref} />` is passed the (possibly empty) `query` and `mapHref` unchanged.

### 3.2 `VenueMapTile` guard change (`VenueMapTile.tsx:34`)

- Defensive guard `if (!query) return null;` becomes **`if (!query && !mapHref) return null;`** — the tile returns `null` only when there is neither a geocodable query nor a directions link (belt-and-suspenders; the parent already collapses that case).
- All other layers already handle the empty-`query` + valid-`mapHref` case correctly once the `<img>` is gated on `query` (§2.2): stripe base always paints, `map` label always paints, Directions renders on `mapHref`, and the tile root is the `<a>` (`VenueMapTile.tsx:96-107`) because `mapHref` is set.

### 3.3 Amended guard table (supersedes original §5 row "both `name` and `address` empty")

| Input state | Render |
|---|---|
| `name` + `address` both empty, `mapHref` **valid** (`googleLink` parseable) | `query` empty ⇒ no `<img>`; **parent mounts the map region** (`query \|\| mapHref`) showing stripe + `map` label + Directions button, whole tile anchored to `googleLink`. Left column shows only the `VENUE` eyebrow. Dock footer per `loadingDock`. `count ≥ 1` (googleLink), so the empty state does not render — and now the card is actionable. |
| `name` + `address` both empty, `mapHref` **null** (no/again non-parseable `googleLink`) | `query` empty AND `mapHref` null ⇒ **parent collapses the region** (single column, no `border-l`); `VenueMapTile` not mounted. If `loadingDock` also empty ⇒ `count === 0` ⇒ `No venue details parsed.` empty state (unchanged from original). |

All other original §5 rows are unchanged. The original §5.4 count contract (five fields incl. `googleLink`, `notes` excluded) is **unchanged**.

---

## 4. Amendments to the ratified spec

- **§3.2 (`VenueMapTile`).** Guard `!query → null` becomes `!query && !mapHref → null`. `<img>` (layer 2) rendered iff `query !== "" && theme !== null`. Parent region-presence ownership: `VenueBreakdown` mounts the region iff `query || mapHref` (was: `query`); it still collapses when both are absent. "`VenueMapTile` is only ever mounted with a non-empty `query`" is superseded — it may now be mounted with empty `query` + valid `mapHref` (Directions-only tile, no `<img>`).
- **§5 guard table.** Replace the single "both name and address empty" row with the two-row split in §3.3 (mapHref valid vs null).
- **§6 (Theme).** Drop the "one-frame light-map flash in dark mode is acceptable … the `<img>` requests `theme=light` by default; on hydration the client corrects" language. Replace: first paint (SSR + pre-effect client render) paints the stripe base only; the `<img>` mounts once post-hydration with the resolved theme (`document.documentElement.dataset.theme`, same read as `ThemeToggle.tsx:69`). No wrong-theme raster is ever fetched. The `dataset.theme` post-hydration read remains the established pattern; the `null` sentinel is the pre-resolution state.
- **§8 (Transition inventory).** Add two rows:
  - `theme unresolved (stripe base only) → theme resolved (<img> overlays)` — **instant**. The stripe base is always painted; the `<img>` appears on mount with no fade (matches the ratified "no fade on image load" posture, original §8). Reduced-motion irrelevant (no animation).
  - `map region: query-backed (<img> + stripe) ↔ mapHref-only (stripe + Directions, no <img>)` — **instant**. Presence follows data (`query`/`mapHref`), not a runtime toggle; the card re-renders per staged row, no in-place morph.

---

## 5. Dimensional invariants (unchanged, re-verified)

Original §7 DI-1..DI-6 are unchanged. The link-only region still gets the exact wrapper classes (§3.1), so:

- **DI-1** (map region height === text column height at ≥`sm` via `sm:items-stretch` + `self-stretch` + tile `h-full`) must still hold in the link-only case, where the text column is short (VENUE eyebrow only) and the tile's `min-h-tile-min-h` (`VenueMapTile.tsx:95`) drives the region height; `items-stretch` stretches the text column to match. This is a NEW geometry combination (short text column) and gets its own real-browser assertion (§6).
- **DI-2..DI-6** unaffected (stripe base is `absolute inset-0`; Directions button keeps `min-h-tap-min`).

---

## 6. Test plan (TDD)

Anti-tautology: derive expected geometry from the render, never hardcode; clone-and-strip sibling DOM before label scans; each assertion states the failure mode it catches.

1. **`tests/components/admin/wizard/venueMapTile.test.tsx` (extend).**
   - **VCR-2:** on first render (before effects flush) `venue-map-img` is **absent** from the DOM. After effects flush, exactly **one** `venue-map-img` is present; its `src` carries `theme=dark` when `document.documentElement.dataset.theme === "dark"` and `theme=light` otherwise; assert **no rendered `src` ever contains `theme=light`** across the dark-mode render lifecycle (catches: reintroduction of the light-then-dark double-fetch). *Failure mode caught:* initial-light `src` regression / hydration-time wrong-theme fetch.
   - **VCR-3:** `query=""`, `mapHref="https://maps.google.com/..."` → renders `venue-map-fallback` (stripe) + `venue-directions` + the tile root is an `<a>` with that `href`; **`venue-map-img` absent**. *Failure mode caught:* link-only tile silently rendering an `<img>` with empty `q`, or collapsing to null.
   - **Guard:** `query=""`, `mapHref=null` → component returns `null` (nothing rendered). *Failure mode caught:* defensive guard over-rendering an empty tile.
2. **`tests/components/admin/wizard/venueBreakdown.test.tsx` (extend).**
   - Link-only venue (`venue = { name:"", address:"", city:"", loadingDock:"", googleLink:"https://maps.google.com/..." }`) → `venue-map-region` **is mounted** (was: not mounted); `venue-directions` present; `venue-map-img` absent; `count === 1`; the `No venue details parsed.` copy is **not** in the DOM. *Failure mode caught:* empty-card regression for link-only venues; count drift.
   - Negative regression: venue with valid `query` still mounts the region with an `<img>` after effects (VCR-2 mount-gate did not break the normal case). *Failure mode caught:* mount-gate suppressing the `<img>` for good queries.
   - Full-collapse: `name/address/city/loadingDock` empty AND `googleLink` non-parseable → region NOT mounted AND `No venue details parsed.` renders (`count===0`). *Failure mode caught:* the `query || mapHref` gate mounting an empty region.
3. **`tests/e2e/step3-review-modal.layout.spec.ts` (extend) — real browser (Playwright), NOT jsdom.**
   - Add a **link-only** venue fixture. At ≥`sm`, assert `venue-map-region.getBoundingClientRect().height === venue-text-col.height` within **0.5px** (DI-1 with a short text column). Expected height derived from the render, not hardcoded. *Failure mode caught:* the degraded tile failing to stretch to the text column height (Tailwind v4 no default `items-stretch`).
4. **`tests/components/admin/wizard/venueTransitionAudit.test.ts` (extend).**
   - Assert `VenueMapTile`/`VenueBreakdown` still contain no `AnimatePresence`/`exit`/fade; the `<img>` mount is instant (no `transition-opacity` / motion prop introduced by the mount-gate). *Failure mode caught:* accidental layout- or opacity-animating transition sneaking in with the conditional mount.

---

## 7. Out of scope (do-not-relitigate)

- **The count contract (original §5.4).** `googleLink` still counts; `notes` still excluded. Not reopened.
- **The proxy route / static-map helper.** `app/api/admin/venue-map/route.ts` single-status contract and `lib/maps/staticMap.ts` key resolution unchanged. The route is admin-gated read-only GET — invariant 10 (mutation telemetry) does not apply (original §3.3, ratified).
- **Cookie / SSR theme hint.** Explicitly rejected in §2 on scope grounds; the mount-gate is the ratified choice for this pass. Do not relitigate toward a cookie.
- **`next/image`.** Plain `<img>` is required for the native `onError` fallback (original §3.2); unchanged.
- **Crew-side `VenueSection.tsx`.** Out of scope (crew surface, separate component); this pass touches only the admin wizard tile.

---

## 8. Close-out checklist

- `DEFERRED.md`: mark VCR-2 and VCR-3 `✅ RESOLVED 2026-07-17 (venue-card VCR-2/VCR-3 fixes, fix/venue-card-vcr2-vcr3)`, keeping original text.
- `BACKLOG.md`: mark `BL-VENUE-MAP-DARK-DOUBLE-FETCH` and `BL-VENUE-LINK-ONLY-EMPTY-CARD` shipped with date + branch.
- Invariant-8 impeccable dual-gate (critique + audit) on the diff; P0/P1 fixed or deferred before cross-model review.
- Meta-test inventory: **none created/extended** — no Supabase call boundary, no admin-alert catalog, no advisory lock, no email normalization, no new mutation surface. Declared explicitly per the writing-plans meta-test-inventory rule.
