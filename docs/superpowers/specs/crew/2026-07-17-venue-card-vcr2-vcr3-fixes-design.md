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

- **VCR-3 [MEDIUM] — link-only venue renders an empty card.** `VenueBreakdown` (`step3ReviewSections.tsx:973`) mounts the map region only when `query` is non-empty (`query = [name, address].filter(Boolean).join(", ")`, `step3ReviewSections.tsx:940`). A venue whose ONLY populated field is a valid `googleLink` yields `mapHref` non-null (`step3ReviewSections.tsx:937`) but empty `query`, and `count === 1` (googleLink counted per original §5.4), so the `No venue details parsed.` empty state is suppressed yet the body renders nothing actionable: no name/address block, no map region (gated on `query`), no dock footer, and the maps link is not surfaced as text (the card's no-raw-URL / no-dead-anchor UX rule, mirroring `VenueSection.tsx:126` and original §3.2 — distinct from AGENTS invariant 5, which concerns raw error codes).

Both are now being fixed. Both fixes are client-only React changes; neither reopens the key-safe proxy route (`app/api/admin/venue-map/route.ts`), the static-map helper (`lib/maps/staticMap.ts`), the count contract (original §5.4), or the dimensional invariants (original §7).

---

## 2. VCR-2 fix — client mount-gate (chosen)

**Approach considered & rejected — cookie SSR-hint.** Write an `fxav-theme` cookie from `ThemeToggle` alongside `localStorage`; server reads it and renders the correct `theme` at SSR. Correct first paint for everyone, but touches global theme infra (`ThemeToggle.tsx`, `app/layout.tsx` `NO_FOUC_SCRIPT`, a server read path) — blast radius far beyond the venue card for a P2. Rejected on scope.

**Chosen — client mount-gate.** The `<img>` is not rendered until a post-hydration effect resolves the real theme; until then only the always-painted stripe base shows. Because the server and the first client render agree (both render *no* `<img>`), there is no hydration mismatch, and the `<img>` mounts exactly once with the correct theme — no light `src` is ever emitted.

### 2.1 `VenueMapTile.tsx` changes

- `theme` state type becomes `"light" | "dark" | null`; **initial value `null`** (was `"light"`, `VenueMapTile.tsx:29`).
- The existing post-mount `useEffect` (`VenueMapTile.tsx:30-33`) still calls `setTheme(readTheme())`. `readTheme()` (`VenueMapTile.tsx:8`) is unchanged and always returns `"light" | "dark"` (never `null`), so after hydration `theme` is always a resolved value. `readTheme()` is a **dataset-only read** (`document.documentElement.dataset.theme === "dark" ? "dark" : "light"`) — it deliberately does NOT replicate `ThemeToggle`'s `matchMedia` fallback (`ThemeToggle.tsx:readAppliedTheme`), because the `NO_FOUC_SCRIPT` (`app/layout.tsx:49`) always stamps `dataset.theme` before hydration, so the fallback branch is dead here. Not changed by this pass; the shared read is the `dataset.theme` line (`ThemeToggle.tsx:69`).
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

**No regression on runtime theme toggle.** The effect resolving `theme` has empty deps (`VenueMapTile.tsx:30-33`, `[]`) — it runs once at mount and does not re-subscribe to runtime `ThemeToggle` flips while a card is already visible. This is **unchanged** from the deferred behavior (the current `useState("light")` + one-shot effect has the same non-listening posture); the mount-gate only changes the *initial* value from `"light"` to `null`. Re-syncing the raster on a runtime toggle is out of scope and not reopened. **This supersedes the original §8 compound row "theme flip while image mid-load → new `src` supersedes the in-flight load":** under the mount-gate, the initial `null → resolved` transition mounts the `<img>` exactly once with no prior in-flight (light) request to supersede, and runtime flips are non-listening — so that compound row is **not applicable to this pass**. The honest inventory is the two/three `null → resolved` rows in §4 (§8 amendment).

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

Region-mount + `<img>` presence depend **only** on `(query, mapHref, theme)`. The left text column independently renders name / address / city per their **own** original §5 guards (unchanged) — the rows below describe the region, not the text column, so a present `city` still renders its line even when `name`/`address` are empty.

| Input state | Render |
|---|---|
| `name` + `address` both empty, `mapHref` **valid** (`googleLink` parseable) | `query` empty ⇒ no `<img>`; **parent mounts the map region** (`query \|\| mapHref`) showing stripe + `map` label + Directions button, whole tile anchored to `googleLink`. Left column still shows the `VENUE` eyebrow plus any present `city` line (own guard). Dock footer per `loadingDock`. `count ≥ 1` (googleLink), so the empty state does not render — and now the card is actionable. **This is the VCR-3 fix.** |
| `name` + `address` both empty, `googleLink` **non-empty but non-parseable** (e.g. `"TBD"`, `isParseableUrl` false ⇒ `mapHref` null) | `query` empty AND `mapHref` null ⇒ **parent collapses the region**; `VenueMapTile` not mounted. But `contentRows` counts any non-empty string incl. sentinels (`contentRows` at `step3ReviewSections.tsx:226`, comment: "sentinels (TBD/N/A) show as-parsed") ⇒ `count ≥ 1` ⇒ the `No venue details parsed.` copy does **not** render; the left column shows the `VENUE` eyebrow (+ any `city`). **Accepted degenerate:** there is no *valid* link to surface, and the card's no-raw-URL / no-dead-anchor UX rule (original §3.2, `VenueSection.tsx:126`) forbids rendering the raw `"TBD"` text or a dead anchor, so nothing actionable can be shown. This is strictly the pre-existing behavior for a garbage placeholder and is NOT the VCR-3 case (which requires a parseable `googleLink`). Not reopened. |
| ALL five fields (`name`/`address`/`city`/`loadingDock`/`googleLink`) empty/whitespace | `count === 0` (`rows.length === 0`) ⇒ `No venue details parsed.` empty state; no region, no dock. Unchanged from original. |

All other original §5 rows are unchanged. The original §5.4 count contract (five fields incl. `googleLink`, parseable **or not**; `notes` excluded) is **unchanged** — the empty state is gated on `rows.length === 0`, never on `mapHref` parseability.

---

## 4. Amendments to the ratified spec

- **§3.2 (`VenueMapTile`).** Guard `!query → null` becomes `!query && !mapHref → null`. `<img>` (layer 2) rendered iff `query !== "" && theme !== null`. Parent region-presence ownership: `VenueBreakdown` mounts the region iff `query || mapHref` (was: `query`); it still collapses when both are absent. "`VenueMapTile` is only ever mounted with a non-empty `query`" is superseded — it may now be mounted with empty `query` + valid `mapHref` (Directions-only tile, no `<img>`).
- **§5 guard table.** Replace the single "both name and address empty" row with the three-row split in §3.3 (mapHref valid → region mounts; googleLink non-empty non-parseable → region collapses but count ≥ 1, accepted degenerate; all five empty → count 0 empty state). Region-mount depends only on `(query, mapHref)`; the text column renders name/address/city per their own unchanged guards.
- **§6 (Theme).** Drop the "one-frame light-map flash in dark mode is acceptable … the `<img>` requests `theme=light` by default; on hydration the client corrects" language. Replace: first paint (SSR + pre-effect client render) paints the stripe base only; the `<img>` mounts once post-hydration with the resolved theme (`document.documentElement.dataset.theme`, same read as `ThemeToggle.tsx:69`). No wrong-theme raster is ever fetched. The `dataset.theme` post-hydration read remains the established pattern; the `null` sentinel is the pre-resolution state.
- **§8 (Transition inventory).** Add three rows:
  - `theme unresolved (stripe base only) → theme resolved (<img> overlays)` — **query-backed case only** (`query !== ""`). **Instant.** The stripe base is always painted; the `<img>` appears on mount with no fade (matches the ratified "no fade on image load" posture, original §8). Reduced-motion irrelevant (no animation).
  - `theme unresolved → resolved, link-only case (query === "" && mapHref)` — **no-op**. No `<img>` is ever rendered in this case, so theme resolution changes nothing in the DOM (no visual change, instant by absence). Enumerated for completeness so the audit is honest.
  - `map region: query-backed (<img> + stripe) ↔ mapHref-only (stripe + Directions, no <img>)` — **instant**. Presence follows data (`query`/`mapHref`), not a runtime toggle; the card re-renders per staged row, no in-place morph.

---

## 5. Dimensional invariants (unchanged, re-verified)

Original §7 DI-1..DI-6 are unchanged. The link-only region still gets the exact wrapper classes (§3.1), so:

- **DI-1** (map region height === text column height at ≥`sm` via `sm:items-stretch` + `self-stretch` + tile `h-full`) must still hold in the link-only case, where the text column is short (VENUE eyebrow only) and the tile's `min-h-tile-min-h` (`VenueMapTile.tsx:95`) drives the region height; `items-stretch` stretches the text column to match. This is a NEW geometry combination (short text column) and gets its own real-browser assertion (§6).
- **DI-2 reframed (consequence of VCR-2).** The standalone layout harness renders via `renderToStaticMarkup` (no hydration/effects), so post-VCR-2 the `<img>` — now client-only, mount-gated on the resolved theme — is **absent** from the static HTML. The original §7 DI-2 test located `venue-map-img`; it is reframed to assert the always-painted **stripe base** (`venue-map-fallback`, `absolute inset-0` — `inset-0` pins all four edges, so it fills the region box) fills the region content box (no letterbox). This is the same fill result the `<img>` obeys (`absolute inset-0 size-full object-cover`), now theme-independent and valid in a static render. The `<img>`-present path is instead covered by the RTL component tests (`venueMapTile` / `venueBreakdown`, which flush effects).
- **DI-3..DI-6** unaffected (stripe base is `absolute inset-0`; Directions button keeps `min-h-tap-min`).

---

## 6. Test plan (TDD)

Anti-tautology: derive expected geometry from the render, never hardcode; clone-and-strip sibling DOM before label scans; each assertion states the failure mode it catches.

1. **`tests/components/admin/wizard/venueMapTile.test.tsx` (extend).**
   - **VCR-2 (SSR proof — the load-bearing assertion).** RTL `render()` flushes passive effects, so it observes the *post-effect* state and CANNOT prove the pre-effect no-`<img>` state. Use `renderToStaticMarkup(<VenueMapTile query="X" mapHref={null} />)` (from `react-dom/server`): assert the server HTML contains `data-testid="venue-map-fallback"` (stripe base painted) AND contains **neither** `venue-map-img` **nor** the substring `/api/admin/venue-map` (no `<img>`, no proxy URL, hence no first-paint fetch — in any theme, because the server has no `document` so `theme === null`). This is what proves the light-then-dark double-fetch is gone at the source. *Failure mode caught:* an initial-`theme=light` `src` (or any `src`) reaching first paint.
   - **VCR-2 (post-hydration, RTL).** After effects flush with `document.documentElement.dataset.theme = "dark"`: exactly **one** `venue-map-img`, `src` carries `theme=dark`. With no `data-theme`: one img, `src` carries `theme=light`. *Failure mode caught:* the mount-gate suppressing the img entirely, or emitting the wrong theme post-hydration.
   - **VCR-3:** `query=""`, `mapHref="https://maps.google.com/..."` → renders `venue-map-fallback` (stripe) + `venue-directions` + the tile root is an `<a>` with that `href`; **`venue-map-img` absent** (empty `query` gates the img even post-effect). *Failure mode caught:* link-only tile silently rendering an `<img>` with empty `q`, or collapsing to null.
   - **Guard:** `query=""`, `mapHref=null` → component returns `null` (nothing rendered). *Failure mode caught:* defensive guard over-rendering an empty tile.
2. **`tests/components/admin/wizard/venueBreakdown.test.tsx` (extend / amend the existing "name+address both empty → collapses" test, which currently uses a *valid* `https://m.co` and now describes the opposite behavior).**
   - **VCR-3 fix:** link-only venue (`{ name:"", address:"", city:"", loadingDock:"", googleLink:"https://maps.google.com/..." }`) → `venue-map-region` **is mounted** (was: not mounted); `venue-directions` present; `venue-map-tile` is an `<a>` to the link; `venue-map-img` absent; `count === 1`; the `No venue details parsed.` copy is **not** in the DOM. *Failure mode caught:* empty-card regression for link-only venues; count drift.
   - Negative regression: venue with valid `query` still mounts the region with an `<img>` after effects (VCR-2 mount-gate did not break the normal case). *Failure mode caught:* mount-gate suppressing the `<img>` for good queries.
   - **Accepted degenerate** (non-parseable placeholder): `{ name:"", address:"", city:"", loadingDock:"", googleLink:"TBD" }` → region **NOT** mounted (`query` empty AND `mapHref` null), no `venue-map-tile`, `count === 1` (TBD counted), `No venue details parsed.` **not** rendered, `VENUE` eyebrow present. *Failure mode caught:* the `query || mapHref` gate mounting an empty region for a non-parseable link; false assumption that non-parseable ⇒ empty state.
   - True empty: ALL five fields empty/whitespace → `count === 0`, `No venue details parsed.` renders, no region. *Failure mode caught:* empty-state gate drifting off `rows.length === 0`.
3. **`tests/e2e/step3-review-modal.layout.spec.ts` (extend) — real browser (Playwright), NOT jsdom.**
   - Add a **link-only** venue fixture (`name`/`address`/`city` empty, valid `googleLink`). At ≥`sm` (popup 800px, matching the sibling DI tests): assert (a) `venue-map-region.height === venue-text-col.height` within **0.5px** (DI-1); AND (b) **anti-tautology guard** — `venue-map-region.height` is **≥ 96px** (`--spacing-tile-min-h`, `app/globals.css:173`), so the equality cannot be satisfied by *both* columns collapsing to the short eyebrow-only height if the tile lost `min-h-tile-min-h`; AND (c) the tile (`venue-map-tile`) fills its region — `tile.height === region.height` within 0.5px. Expected values derived from the render / the token, never hardcoded pixel heights beyond the token floor. *Failure mode caught:* the degraded (imageless) tile losing `min-h-tile-min-h` and both columns mutually collapsing, or the tile not stretching to the region (Tailwind v4 no default `items-stretch`).
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
