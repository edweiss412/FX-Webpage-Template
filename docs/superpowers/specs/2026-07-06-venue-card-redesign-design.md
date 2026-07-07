# Venue Card Redesign — design spec

**Date:** 2026-07-06
**Slug:** `venue-card-redesign`
**Register:** product (admin surface — Doug's Stage-3 review modal)
**Mock:** `docs/superpowers/mocks/venue-card-redesign/Venue Card Redesign.dc.html`
**Owner surface:** `components/admin/wizard/step3ReviewSections.tsx` → `VenueBreakdown` (currently `:783`)

---

## 1. Intent

Replace the flat label:value `FieldRowList` body of the admin Stage-3 review **Venue** card with a bespoke, spatial layout that matches the provided mock: a two-column row (venue name + address on the left, a **real map** tile on the right with a Directions affordance) above a full-bleed **loading-dock** footer row.

Scope is the **admin review modal only**. The crew venue surface (`components/crew/sections/VenueSection.tsx`) is explicitly **out of scope** — it is not touched by this change.

### Why now

Doug reviews parsed shows in the Stage-3 modal. The current Venue card is five undifferentiated `Label: value` rows. Address and loading-dock are the two facts he acts on (share directions, brief the crew on dock access); the redesign leads with them and gives the address a glanceable map. This follows the existing Stage-3 restyle arc (PRs #310/#346/#348: Hotels / Transport / Event-details / rooms cards moved off the generic field-list to bespoke bodies). The spec at `step3ReviewSections.tsx:625` already sanctions per-section content shapes ("varying content shape per §4.3 — never an identical sub-card grid"), so a bespoke venue body is grammar-compliant, not a departure.

---

## 2. Current state (live-code citations)

| Concept | Location | Shape |
|---|---|---|
| `VenueBreakdown` | `components/admin/wizard/step3ReviewSections.tsx:783` | `({ dfid, venue }: { dfid: string; venue: ShowRow["venue"] })` → `BreakdownSection` wrapping `FieldRowList` |
| Invocation | `step3ReviewSections.tsx:3217` | `<VenueBreakdown dfid={s.dfid} venue={s.pr.show.venue} />` |
| `venue` type | `lib/parser/types.ts:104-115` | `{ name: string; address: string; loadingDock?: string \| null; googleLink?: string \| null; notes?: string \| null; city?: string \| null } \| null` |
| `BreakdownSection` | `step3ReviewSections.tsx:628` | Inside the modal's chrome provider renders `ModalSectionChrome` (§6.4 heading + §5.2 panel card); `count` drives the `(N)` counter |
| `ModalSectionChrome` panel | `step3ReviewSections.tsx:600-620` | `flex min-w-0 flex-col gap-1.5 rounded-md border bg-surface p-tile-pad shadow-(--shadow-tile)` — **the single card**. `p-tile-pad` = 20px (`--spacing-tile-pad`) |
| Heading row (MapPin chip + "Venue" + "In sheet ↗") | `step3ReviewSections.tsx:556-599` | Already rendered by `ModalSectionChrome`; **unchanged** by this spec |
| `contentRows` | `step3ReviewSections.tsx:206` | keep-if-nonempty coercion; reused for the address block presence checks |
| `FieldRowList` | `step3ReviewSections.tsx:275` | current body — **removed** from the venue path |
| `Step3SectionChrome` type | `step3ReviewSections.tsx:400-452` | provider payload (Icon, label, flagged, dfid, sectionId, sourceAnchors, …) |
| Modal panel responsive | `Step3ReviewModal.tsx:896` | bottom sheet `w-full` below `sm`; centered `sm:max-w-5xl` at ≥`sm` (640px); breakpoint confirmed `matchMedia("(min-width: 640px)")` at `:786` |
| `isParseableUrl` (private) | `components/crew/sections/VenueSection.tsx:79` | `(value) => URL-parses to http(s)`; used at `:126` to gate `mapHref` |
| `buildSheetDeepLink` | `lib/sheet-links/buildSheetDeepLink.ts:9` | unchanged; used only by the existing heading link |
| Geocoding HTTP client (posture to mirror) | `lib/geocoding/client.ts` | `{data,error}` result, **never throws**, `not_configured` when key unset, per-attempt `AbortSignal.timeout`, bounded retry on 429/5xx. Explicitly out of scope for the Supabase call-boundary meta-test (its own header comment, lines 13-15) |
| Admin GET route pattern | `app/api/admin/needs-attention-count/route.ts` | `requireAdminIdentity()` in try/catch (`AdminInfraError`→503, else rethrow); `export const dynamic = "force-dynamic"` |
| Layout-test template | `tests/e2e/step3-review-modal.layout.spec.ts` + `tests/e2e/_step3ReviewModalHarness.tsx` / `_step3ReviewModalLiveEntry.tsx` | Playwright real-browser harness for the modal |
| Section component tests dir | `tests/components/admin/wizard/` | where a new `VenueBreakdown` test lives |

### Token map (mock hex → live `@theme` token, `app/globals.css`)

The mock was authored against this token system; translation is near-1:1.

| Mock hex | Role | Token |
|---|---|---|
| `#FFFFFF` | card surface | `bg-surface` (`--color-surface`) |
| `#E5E4E0` | hairline borders / dividers | `border-border` (`--color-border`) |
| `#CFCDC7` | Directions button border | `border-border-strong` (`--color-border-strong`) |
| `#0E0F12` | venue name | `text-text-strong` |
| `#1A1B1F` | dock text, Directions label | `text-text` |
| `#5A5B62` | address, subtle | `text-text-subtle` |
| `#8B8C92` | eyebrows | `text-text-faint` |
| `#F4F3F1` | dock footer bg, map fallback stripe base | `bg-surface-sunken` (`--color-surface-sunken`) |
| `#C25E00` | dock icon glyph | `text-accent-on-bg` (`--color-accent-on-bg`, the AA-contrast orange for glyph-on-light) |
| `12px` / `6px` radii | card / chip | `rounded-md` / `rounded-sm` |
| `0.12em` eyebrow tracking | — | `--tracking-eyebrow` |

No inline hex values are introduced. Every neutral and the accent come from tokens, so dark mode inherits automatically via the `*-runtime` swaps.

---

## 3. Architecture

Three units, each independently testable:

### 3.1 `VenueBreakdown` (rewritten body) — `step3ReviewSections.tsx`

Keeps its signature `({ dfid, venue })` and its `BreakdownSection` wrapper (so heading chrome, flagged tone, count, and the "In sheet" link are untouched). The **children** change from `<FieldRowList>` to a bespoke layout:

- A **full-bleed wrapper** that cancels the panel's `p-tile-pad` (`-m-tile-pad`) so the map's left-border divider and the dock footer's top-border/tint reach the card edges. The wrapper carries `overflow-hidden rounded-md` (the shared `ModalSectionChrome` panel at `step3ReviewSections.tsx:601` has `rounded-md` but **no** `overflow-hidden`, so without this the tinted footer's square bottom corners poke past the panel's 12px radius). This keeps **one** card (the panel) with internal divisions — **no nested card** (the mock's inner "box" IS the panel; regions are dividers, not a second bordered card). The shared panel component is **not** modified (out of scope, shared across 12 sections); clipping is local to the venue wrapper.
- **Region A — two-column info row** (`flex` + `sm:items-stretch`):
  - Left column (`flex-1 min-w-0`, padded): `VENUE` eyebrow, venue name (`text-lg`≈19px `font-bold text-text-strong`, `wrap-break-word`), address block (`text-sm text-text-subtle`).
  - Right column — **map region**, fixed `sm:w-[172px] shrink-0`, `border-l border-border` divider, `self-stretch` to fill row height. Contains `<VenueMapTile>`.
- **Region B — loading-dock footer** (full-bleed, `border-t border-border bg-surface-sunken`, padded): dock icon chip (`Truck` from lucide, `text-accent-on-bg` on a `bg-surface`/`border` chip), `LOADING DOCK` eyebrow, dock text (`text-sm text-text`). **Rendered only when `loadingDock` is present** (guard §5).

`count` for the `(N)` counter = number of populated regions/facts present (see §5.4), preserving the existing counter contract.

### 3.2 `VenueMapTile` (new client component) — `components/admin/wizard/VenueMapTile.tsx`

Pure presentational, no data fetching of its own. Props: `{ query: string | null; mapHref: string | null }` where `query` = the geocodable address string (`[name, address].filter(Boolean).join(", ")`, mirroring `geocodeQuery` at `lib/geocoding/client.ts:44`) and `mapHref` = the parseable `googleLink` or `null`.

Render decision (pure, deterministic):
1. **Map image path** — when `query` is non-empty: an `<img>` whose `src` is our same-origin proxy `/api/admin/venue-map?q=<enc>&theme=<light|dark>` (theme from a `useTheme`-style read; see §6), `loading="lazy"`, `object-cover`, filling the region. On `onError` the component swaps to the **fallback tile** (striped placeholder) via local state — the browser could not load the proxy (key unset → 404/204, Static Maps error, offline). The proxy returns a non-2xx for any failure so `onError` reliably fires.
2. **Fallback tile** — the mock's diagonal-stripe placeholder built from tokens (`repeating-linear-gradient` over `--color-surface-sunken`/`--color-border`), with a small `map` mono label.
3. **Directions affordance** overlays both image and fallback: when `mapHref` is set, the whole tile is an `<a href={mapHref} target="_blank" rel="noopener noreferrer">` with an inset "Directions" button (`Navigation` icon + label, `bg-surface border-border-strong`, `min-h-tap-min`). When `mapHref` is null, no anchor and no Directions button — the tile is a static image/placeholder only (no dead anchor, mirroring `VenueSection.tsx:126`).

No same-origin proxy request is ever built when `query` is empty — the map region collapses (see §5).

### 3.3 `/api/admin/venue-map` GET route (new) — `app/api/admin/venue-map/route.ts`

Server-side key-safe proxy to Google Static Maps.

- `export const dynamic = "force-dynamic"`.
- Gate: `await requireAdminIdentity()` in try/catch (`AdminInfraError`→503, else rethrow), identical to `needs-attention-count/route.ts`. **Admin-gated but read-only (GET)** — AGENTS.md telemetry invariant 10 covers *mutations* (POST/PUT/PATCH/DELETE) only, so no `AUDITABLE_MUTATIONS` row is required. Documented explicitly here to preempt relitigation.
- Read `q` (required, trimmed, length-capped ≤512) and `theme` (`light`|`dark`, default `light`; any other value → `light`).
- Missing/empty `q` → `204 No Content` (component shows fallback).
- Key resolution via a small helper `lib/maps/staticMap.ts`:
  - `isStaticMapConfigured()` → `!!process.env.GOOGLE_STATIC_MAPS_API_KEY?.trim() || !!process.env.GOOGLE_GEOCODING_API_KEY?.trim()`. **The Static Maps key reuses the existing `GOOGLE_GEOCODING_API_KEY`** (same GCP project) unless a dedicated `GOOGLE_STATIC_MAPS_API_KEY` is set (checked first). No new **required** secret; a dedicated key is optional.
  - Key unset → route returns `204` (fallback). This is the **runtime gate**; there is no build-time artifact decision.
  - `buildStaticMapUrl(query, theme)` → `https://maps.googleapis.com/maps/api/staticmap?center=<enc>&markers=color:0xff8c1a%7C<enc>&zoom=15&size=176x120&scale=2&format=png&key=…` plus, for `theme=dark`, a compact inline `&style=` dark rule set (documented constant). URL never leaves the server.
- Fetch mirrors `geocoding/client.ts` hardening: `AbortSignal.timeout(8000)`, bounded retry (2) on 429/5xx, **never throws**. On any non-OK Google response or fetch failure → `502`/`204` (component shows fallback; body carries no raw upstream error text — invariant 5). Redact: never echo the key or Google's error body to the client.
- Success → stream the PNG through with `Content-Type: image/png` and `Cache-Control: private, max-age=3600` (admin-gated, so `private`; 1h is plenty for a review session). Upstream `fetch` uses `next: { revalidate: 86400 }` so repeated reviews of the same show hit the Next fetch cache.

---

## 4. Data flow

```
Step3 registry (:3217)
  → <VenueBreakdown dfid venue={show.venue}/>
      → BreakdownSection (unchanged chrome: heading + In-sheet link + panel card)
          → [full-bleed body]
              Region A: text column  |  <VenueMapTile query mapHref/>
                                          → <img src="/api/admin/venue-map?q&theme"/>  (client)
                                              → GET route (server): requireAdminIdentity
                                                  → staticMap helper: key? → Google Static Maps
                                                  → PNG  |  204/502  → <img onError> → fallback tile
              Region B: loading-dock footer (only if loadingDock present)
```

The component never sees the key. The proxy is the only key holder. The address string is passed as `q`; Google Static Maps geocodes it server-side (no separate geocode call, no stored lat/lng).

---

## 5. Guard conditions (every input)

Partial/edited data is the norm during Stage-3 review. Every branch is explicit and tested.

| Input state | Render |
|---|---|
| `venue === null` | Body renders `No venue details parsed.` (`text-sm text-text-subtle`) — unchanged from current empty state; `count = 0`. No map region, no footer. |
| `venue.name` empty, `venue.address` present | Left column shows address block; venue-name line omitted. Eyebrow still shown. |
| `venue.name` present, `venue.address` empty | Venue name shown; address block omitted. Map `query` falls back to `name` alone (still geocodable). |
| both `name` and `address` empty (venue object exists via `notes`/`googleLink` only) | Left column shows only the `VENUE` eyebrow + any present fact; `query` empty → **map region collapses entirely** (two-column becomes single column, no border-l). |
| `venue.city` empty | Address block shows street line(s) only; no trailing city/state line. City, when present, appends as a second line (mock: `San Francisco, CA 94108`). |
| `venue.city` present | Second address line = `city`. (We do NOT re-parse street/state; we render `address` verbatim as line 1 and `city` as line 2, matching the parser's fields — no `streetFromAddress` splitting, which is crew-only.) |
| `venue.loadingDock` empty/whitespace/null | **Entire dock footer (Region B) omitted** — no border-t, no tint band. |
| `venue.loadingDock` present | Footer rendered. Long text wraps (`wrap-break-word`), no cap. |
| `venue.googleLink` missing or non-http(s) (`isParseableUrl` false) | Map tile renders (image or fallback) as a **static** element — no `<a>`, no Directions button. No dead anchor. |
| `venue.googleLink` parseable | Tile is an anchor to it; Directions button shown. |
| Static-map key unset / Static Maps disabled / upstream error / offline | `<img onError>` → **fallback striped tile** (still an anchor + Directions if `mapHref`). CI-green without GCP enablement. |
| `query` non-empty but Google returns ZERO_RESULTS / bad geocode | Google returns a generic "no map" image or an error; route treats non-OK as failure → `204`/`502` → fallback tile. |

### 5.4 Count contract

`count` = number of present top-level facts among: venue name, address, city, loadingDock, googleLink (via `contentRows` on those five, same set as today). Preserves the existing `(N)` counter numbers so `COUNT_SECTIONS` behavior and any count-pinning tests are unaffected. The map tile is a presentation of the address, not a separate counted fact.

---

## 6. Theme (dark + light, both first-class)

DESIGN.md §1: both modes are designed, not auto-derived. The chrome (card, borders, text, dock band, fallback stripe) is fully tokenized, so it inverts correctly with zero extra work. The **map image** is the only raster element:

- The component reads the active theme from `document.documentElement.dataset.theme` (values `"light"`/`"dark"`, stamped pre-hydration by the `NO_FOUC_SCRIPT` in `app/layout.tsx:49` from `localStorage['fxav-theme']`; the same read `ThemeToggle.tsx:69` uses) inside a client `useEffect`/`useState`, and passes `theme=light|dark` to the proxy. No `useTheme` hook exists in this project — the `dataset.theme` read is the established pattern.
- `theme=dark` requests a dark-styled Static Map via inline `&style=` rules (a documented constant `DARK_MAP_STYLE`), so the tile reads as a dim map in backstage/dark mode rather than a glaring white rectangle.
- **Fallback posture if inline dark styling proves brittle:** the styled request failing is just another non-OK response → fallback striped tile (which is token-driven and already dark-correct). So dark mode degrades safely regardless.
- First paint before hydration: the `<img>` requests `theme=light` by default; on hydration the client corrects to the real theme. A one-frame light-map flash in dark mode is acceptable for an admin tool and avoids blocking first paint on theme detection. (Chrome/text is SSR-correct via CSS tokens; only the raster may flip.)

---

## 7. Dimensional invariants (Tailwind v4 — NO default `items-stretch` on this project)

Per AGENTS.md and `memory/feedback_tailwind_v4_flex_items_stretch.md`, every parent→child dimension relationship is stated and guaranteed by an explicit class, and verified by a **real-browser Playwright** assertion (jsdom insufficient).

| # | Relationship | Guaranteeing class |
|---|---|---|
| DI-1 | At ≥`sm`, the map region fills the full height of Region A (equal to the text column's height). | Region A: `flex sm:items-stretch`; map region: `self-stretch` (+ `<VenueMapTile>` root `h-full`). |
| DI-2 | The map `<img>` (and fallback tile) fills its region box with no letterbox gaps. | `h-full w-full object-cover` on the img; fallback tile `absolute inset-0`. |
| DI-3 | The map region is exactly `172px` wide at ≥`sm`; the text column takes the rest. | map region `sm:w-[172px] shrink-0`; text column `flex-1 min-w-0`. |
| DI-4 | Below `sm` (bottom-sheet), columns **stack**: text full width on top, map region full width below (fixed height, e.g. `h-40`), border-l becomes border-t. | Region A `flex-col sm:flex-row`; map region `w-full border-t sm:w-[172px] sm:border-t-0 sm:border-l h-40 sm:h-auto`. |
| DI-5 | Full-bleed regions reach the panel's inner edges despite the panel's `p-tile-pad`, and clip to its 12px radius. | body wrapper `-m-tile-pad overflow-hidden rounded-md` (panel has `rounded-md` but no `overflow-hidden`, so the wrapper must clip its own square-cornered full-bleed regions). |
| DI-6 | The Directions button meets the tap-target floor. | `min-h-tap-min` (44px, `--spacing-tap-min`) on the button. |

**Layout test (mandatory):** extend `tests/e2e/step3-review-modal.layout.spec.ts` (or a sibling `.spec.ts` using the same harness) to render the modal with a venue fixture and assert, via `getBoundingClientRect()` on `data-testid` nodes:
- `venue-map-region.height` === `venue-text-column.height` within **0.5px** at a ≥`sm` viewport (DI-1).
- At a `<sm` viewport (e.g. 390px), the map region's `top` is **below** the text column's `bottom` (stacked, DI-4), and the map region width === card inner width.

Test fixtures derive expected geometry from the render, never hardcoded pixel heights (anti-tautology).

---

## 8. Transition inventory

The card is static content inside an already-animated modal; it introduces **no** new state-machine animations. States enumerated for completeness:

| State pair | Treatment |
|---|---|
| map-image ↔ fallback-tile (on `<img>` error) | **Instant** — a swap on load failure; no animation (would call attention to a degraded state). |
| image loading → loaded | Optional 150ms `opacity` fade-in on the `<img>` (`transition-opacity`, honors `prefers-reduced-motion`). Not layout-animating (DI safe). Deliberate, minor. |
| loadingDock present ↔ absent | **Instant** — presence follows data, not a runtime toggle (the card re-renders per staged row; no in-place morph). |
| desktop two-col ↔ mobile stacked | **Instant** — a media-query layout change, not a JS transition. Matches the modal's own sheet/popup switch (`Step3ReviewModal.tsx:786`), which is also instant at the breakpoint. |
| Directions present ↔ absent | **Instant** — follows `mapHref` presence. |
| Compound: theme flip while image is mid-load | New `theme` → new `src` → the in-flight load is superseded; React swaps `src`, browser cancels the stale request. No animation, no flash beyond the one documented in §6. |

No `AnimatePresence`, no `exit`/`initial` props introduced. The transition-audit task confirms this inventory against the final component.

---

## 9. Copy

- Eyebrows: `VENUE`, `LOADING DOCK` (uppercase via `.eyebrow` tracking token).
- Button: `Directions`.
- Fallback tile label: `map` (mono, matches mock).
- Empty state: `No venue details parsed.` (unchanged).
- No error codes surface to the UI under any failure branch (invariant 5): a failed map silently shows the fallback tile; there is no "map unavailable" error text.
- No em dashes in any rendered copy.

---

## 10. Flag / config lifecycle

| Field | Storage | Write path | Read path | Effect |
|---|---|---|---|---|
| `GOOGLE_STATIC_MAPS_API_KEY` (optional) | env | ops-set (optional) | `lib/maps/staticMap.ts` `isStaticMapConfigured()` + `buildStaticMapUrl` | when set, route serves real maps; else falls through to `GOOGLE_GEOCODING_API_KEY` |
| `GOOGLE_GEOCODING_API_KEY` (existing) | env (`.env.local`, `.env.local.example`) | already present | `staticMap.ts` fallback key | same GCP project; reused so no new required secret |
| `theme` query param | request-scoped | `VenueMapTile` (client) | route → `buildStaticMapUrl` | selects light/dark map styling |

No zombie flags: the key is read AND applied; `theme` is written AND consumed. If **no** key is configured, the feature degrades to the fallback tile everywhere — a documented, tested state, not a broken one.

`.env.local.example` gains a commented `# GOOGLE_STATIC_MAPS_API_KEY=` note documenting the optional dedicated key and the reuse fallback.

---

## 11. Build-vs-runtime gate

The map is a pure **runtime** check: `isStaticMapConfigured()` is evaluated per request inside the route handler. There is no build-time artifact decision — the route and component ship identically regardless of key presence; behavior differs only at request time. Test shape: a route unit test with the key env **unset** asserts `204` (fallback path); with a stubbed key + stubbed `fetch` asserts the PNG streams through. No `pnpm build` gate involved.

---

## 12. Testing

TDD per task. Concrete failure mode stated per test.

1. **`staticMap.ts` unit** — `isStaticMapConfigured` (unset both keys → false; either set → true); `buildStaticMapUrl` (address encoded into `center`+`markers`; key never absent in output when configured; `theme=dark` includes `style=`; key value taken from dedicated var first, geocoding var second). *Catches:* key leakage into logs, missing marker, dark param dropped.
2. **Route handler test** — admin gate rejects unauthenticated (rethrow path) / `AdminInfraError`→503; empty `q`→204; key unset→204; stubbed `fetch` OK → `image/png` + `Cache-Control: private`; stubbed `fetch` 500 (after retries) → non-2xx, no upstream body echoed. *Catches:* key exposure, raw-error leak (invariant 5), missing auth gate.
3. **`VenueMapTile` component test** — `query` empty → region absent; `query` set, `mapHref` set → `<img>` with proxy src + anchor + Directions; `mapHref` null → no anchor/button; simulate `<img>` `onError` → fallback striped tile still renders (and still anchored if `mapHref`). *Catches:* dead anchors, missing fallback, proxy URL built when it shouldn't be.
4. **`VenueBreakdown` component test** — `venue null` → empty copy; full venue → venue name/address/city lines, map region, dock footer; `loadingDock` absent → **no** footer; `count` equals present-fact count (derive from fixture, not hardcoded). Clone-and-strip sibling DOM before label scans (anti-tautology). *Catches:* footer shown when dock empty, count drift, address/city mis-render.
5. **Layout Playwright (real browser)** — DI-1 equal-height at ≥`sm`; DI-4 stacked at `<sm`; DI-6 Directions ≥44px. Geometry derived from render. *Catches:* Tailwind-v4 stretch collapse (the #1 layout bug class here).
6. **Transition audit** — assert `VenueMapTile`/`VenueBreakdown` contain no `AnimatePresence`/`exit`; the only motion is the documented `<img>` opacity fade guarded by `motion-reduce:`. *Catches:* accidental layout-animating transitions.

### Meta-test inventory

- **No new meta-test required.** The route is an HTTP client to Google (like `lib/geocoding/client.ts`), **not** a Supabase call boundary → out of scope for `tests/auth/_metaInfraContract.test.ts` (mirror the geocoding client's documented exemption). It is a read-only GET → out of scope for `tests/log/_metaMutationSurfaceObservability.test.ts` (mutations only). No advisory-lock surface (`pg_advisory*` untouched) → no `advisoryLockRpcDeadlock` extension. No new §12.4 error code (failures degrade silently, no user-facing code). This is declared explicitly per the writing-plans meta-test-inventory rule.

---

## 13. Disagreement-loop preempts (for the reviewer)

Cite-and-close the contracts a reviewer is likely to relitigate:

1. **Fail-open map posture is intentional.** A failed/absent map degrades *silently* to the fallback tile with no error copy. Precedent: `lib/geocoding/client.ts:9-11` ("fall back silently to the offline heuristics… A missing key is a benign `not_configured` result, not an error"). Do not "add an error state."
2. **Admin GET route needs no telemetry registry row.** Invariant 10 is mutation-scoped; this is a read-only GET (`app/api/report` precedent for a non-instrumented admin-reading route). Documented in §3.3.
3. **Crew `VenueSection.tsx` is out of scope by owner decision** (the ship brief). `isParseableUrl` is duplicated (a tiny shared helper `lib/url/isParseableUrl.ts` is introduced for the admin side; crew is intentionally left importing its private copy to avoid touching an out-of-scope file). Not a bug.
4. **Nested-card ban is honored.** The mock's inner "box" is the existing `ModalSectionChrome` panel; the map/dock regions are border-divided sub-regions of that single card, full-bled via `-m-tile-pad` — no second bordered card is introduced.
5. **`sm:max-w-5xl` modal, not 560px.** The mock's 560px frame is the design tool's canvas; the real modal is up to `5xl` wide with the section as a column. Two-column at ≥`sm`, stacked below. Not a fidelity miss.
6. **City rendered verbatim as a second line, not re-split.** We do not port crew's `streetFromAddress`; the parser gives `address` and `city` as separate fields and we render them as-is.

---

## 14. Out of scope

- Crew `components/crew/sections/VenueSection.tsx` (owner decision).
- Storing venue lat/lng (Static Maps geocodes the address string itself).
- A dedicated GCP Static Maps key provisioning step (optional; reuse of the geocoding key covers it; feature degrades gracefully if neither is enabled).
- `next/image` / `remotePatterns` config (the img is same-origin to our proxy; a plain `<img>` is used).
- Any change to the modal shell, heading chrome, or the "In sheet" deep link.
