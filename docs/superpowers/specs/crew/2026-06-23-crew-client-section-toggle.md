# Spec — Crew section nav: client-side toggle (instant, freshness-safe section switches)

**Date:** 2026-06-23
**Slug:** crew-client-section-toggle
**Status:** Draft → self-review → Codex adversarial review → execution (autonomous ship)
**Milestone:** Navigation-performance follow-up A (`BL-CREWSUBNAV-PREFETCH-ENABLEMENT`, re-scoped — see §1). Phases 1+2 shipped (PRs #85, #86).
**Implementer/Reviewer:** Opus (Claude Code) — UI work, invariant-8 impeccable dual-gate applies. Codex adversarial-reviews.

---

## 1. Problem & goal

The most-tapped crew interaction — switching section tabs (Today / Schedule / Venue / Travel / Crew / Gear / [Budget]) — costs a **full server round-trip per tap**. `CrewSubNav` does `router.push(?s=<id>, {scroll:false})` (`components/crew/CrewSubNav.tsx:92`); the crew route is dynamic (reads `cookies()`/`headers()`), so each `?s=` change re-runs `app/show/[slug]/[shareToken]/page.tsx` → `getShowForViewer` (NOT `cache()`-wrapped, `lib/data/getShowForViewer.ts:244`) → `_CrewShell` renders **only** the active section via `switch(activeSection)` (`_CrewShell.tsx:271-289`). Phase 1 parallelized that fetch, but it still re-fetches all crew data on every tap.

**Re-scope note (corrects `BL-CREWSUBNAV-PREFETCH-ENABLEMENT`):** the backlog item framed this as "enable prefetch." That is a misdiagnosis: (a) the `upsertAdminAlert` side-effect (`_CrewShell.tsx:147`) is already safe because Next never prefetch-renders a *dynamic* route (the `router.push`/`prefetch={false}` are explicit belt-and-suspenders, per `noPrefetchAlert.test.tsx:1-42`); (b) prefetch can't help a `?s=` change on the *same* dynamic route anyway (route-segment prefetch only warms the static `loading.tsx`). The real win is to stop doing a server round-trip per section tap.

**Key enabling fact:** `getShowForViewer` already returns **all** sections' data on every render (it is not section-scoped); `?s=` only chooses which section *component* renders. So everything needed for an instant switch is already fetched.

**Goal:** section switches become **instant** (client-side toggle, no server round-trip), **without** weakening sheet-sync freshness or any existing crew-page contract.

## 2. Scope

**In scope:** convert section switching to a client-side toggle over server-rendered section bodies.
- `_CrewShell.tsx` — render ALL entitled section bodies server-side into a `Record<SectionId, ReactNode>`; hand them to a new client controller. Keep all section-independent chrome (Header, status pill, `ShowRealtimeBridge`, Footer + report-autocapture) server-rendered once.
- NEW client component `components/crew/CrewSections.tsx` — owns `activeSection` client state (init from the server-resolved section), renders `CrewSubNav` (controlled) + `CrewSectionTransition` over `sectionNodes[active]`, sets `data-active-section`, and on select: updates state + **shallow** URL (`?s=`, no server nav) + scroll-to-top.
- `CrewSubNav.tsx` — becomes a **controlled** presentational component: props `activeSection` + `onSelect(id)` + `budgetVisible`; drop `useRouter`/`router.push`/`buildSectionHref` nav. Same DOM (desktop row + mobile bar), same `aria-current`, `data-section`, `data-testid`, budget-gated tab list, equal-width mobile tabs.
- Test updates across the crew nav/shell surface (§7).

**Out of scope:** caching `getShowForViewer` (`BL-NAV-PERF-TAG-CACHING` — orthogonal, can layer on later); any sheet→DB ingestion change; the admin preview-as route behaves identically (it renders the same `CrewShell`).

## 3. Invariants in play (the load-bearing contracts)

1. **Freshness / sheet-sync (NON-NEGOTIABLE).** The page stays in sync via `ShowRealtimeBridge` (`_CrewShell.tsx:309`) → debounced `router.refresh()` → server re-render of `_CrewShell` → fresh `getShowForViewer` → fresh section bodies. Therefore **all section data MUST stay server-sourced**: section bodies are server-rendered ReactNodes passed as props to the client controller; the client toggles *visibility only*, never fetches or caches section data client-side. `router.refresh()` re-renders all bodies (fresh) and the controller's `activeSection` client state survives the refresh (client components stay mounted), so the viewer keeps their section with refreshed content. **A design that fetches/derives section data client-side is forbidden** — it would make sections stale against the sheet.
2. **Budget gate.** `budgetVisible = financialsVisible(...)` (`_CrewShell.tsx:179`) is the single authority. The Budget tab appears AND the Budget body is rendered/toggleable **iff** `budgetVisible`. A non-lead must never receive a Budget body in the payload nor a Budget tab. `resolveActiveSection(rawSection,{budgetVisible})` still resolves the initial section server-side (a non-lead `?s=budget` → `today`).
3. **No-Budget-flash invariant (§4.17).** The toggleable set = exactly `BASE_SECTION_IDS` (6) + `budget` iff entitled — never a Budget tab/body for a non-lead.
4. **Section transition.** `CrewSectionTransition` (`AnimatePresence mode="wait"` keyed on `sectionId`, `CrewSectionTransition.tsx:44-57`) drives the crossfade; reduced-motion → instant (its existing `--duration-normal`/0ms fork). The keyed swap now fires on **client** state change instead of a server re-render — same component, same keys.
5. **Footer report-autocapture.** Section-INDEPENDENT (uses `rightNowCtx` + `viewer.kind`/`crewPreview`, `_CrewShell.tsx:336-353`) — renders once, server, outside the controller. Unchanged.
6. **No raw error codes / em-dash in chrome** (invariant 5 / DESIGN §9) — unchanged.
7. **Phantom-prefetch hazard — now fully moot for section nav.** With no `<Link>`/`router.push` to a `?s=` URL at all (section nav is pure client state + shallow URL), no section-URL anchor exists for Next to prefetch. The dynamic-route guard (the load-bearing half of `noPrefetchAlert.test.tsx`) stays. `SectionChipLink` (the in-body Agenda chip) is NOT in scope and keeps `prefetch={false}`.

## 4. Verified factual basis (live-code citation pass, worktree @ `e11e0fde`)

- `_CrewShell.tsx`: async server component; `:143-160` projection-fetch `upsertAdminAlert` (fires once when `data.tileErrors` non-empty); `:179` `budgetVisible`; `:180` `resolveActiveSection(rawSection,{budgetVisible})`; `:271-289` `renderSection()` `switch(activeSection)` → ONE body; `:292` `<div data-testid="crew-shell" data-active-section={activeSection}>`; `:308` `<CrewSubNav activeSection budgetVisible>`; `:309` `<ShowRealtimeBridge>`; `:310-327` `<main data-testid="page-container">` w/ `<CrewSectionTransition sectionId={activeSection}>{sectionBody}</CrewSectionTransition>`; `:328-353` `<Footer reportAutocapture=…>` (section-independent).
- `CrewSubNav.tsx`: `"use client"`; `:79-96` `useRouter`+`navigate`→`router.push(buildSectionHref(…),{scroll:false})`+`window.scrollTo(0,0)`; `:83-85` budget-gated `sections`; `:98-143` `tab(id,variant)` → `<button data-section aria-current onClick>`; `:145-176` desktop row (`hidden min-[720px]:flex`, wrapped in `CREW_PAGE_CONTAINER`) + mobile bar (`min-[720px]:hidden fixed inset-x-0 bottom-0 z-10`); `:146` `data-testid="crew-sub-nav"`; equal-width mobile via `min-w-0 flex-1` (`:108-115`).
- `CrewSectionTransition.tsx`: `"use client"`; `:38-58` `AnimatePresence mode="wait" initial={false}` + keyed `motion.div` (`key={sectionId}`, `initial/animate/exit`, `data-reduced-motion`).
- `ShowRealtimeBridge.tsx`: subscribes to the show channel; on invalidate → debounced(100ms) `router.refresh()` (`:266-295`).
- `resolveActiveSection.ts`: `BASE_SECTION_IDS` (6) + `SectionId`; `resolveActiveSection(rawSection,{budgetVisible})`.
- `sectionHref.ts`: `buildSectionHref(pathname, searchParams, id)` → `${pathname}?s=<id>[&gate=<allowed>]` (still used by `SectionChipLink`; reused for the shallow-URL string).
- `page.tsx`: `:76` reads `{gate, s}`; passes raw `s` as `rawSection`; dynamic via `buildShowPageChainRequest` (cookies/headers).

## 5. Design

### 5.1 `_CrewShell` (server) — render all bodies, hand to the controller
Replace `renderSection()` (single active body) + the inline `<CrewSubNav>`/`<CrewSectionTransition>` with: build `sectionNodes: Record<SectionId, ReactNode>` by rendering each entitled section on the existing uniform contract `({data, viewer, today, showId})`. Entitled set = `BASE_SECTION_IDS` + (`budget` iff `budgetVisible`) — Budget body is built ONLY when entitled. Render:
```
<Header … />
<CrewSections
  initialSection={activeSection}        // server-resolved (budget-gated)
  budgetVisible={budgetVisible}
  sectionNodes={sectionNodes}            // server-rendered ReactNodes
/>
<ShowRealtimeBridge … />                 // stays; section-independent
<Footer reportAutocapture={…} … />       // stays; section-independent
```
`CrewSections` renders `CrewSubNav` + the `<main data-testid="page-container">` + `CrewSectionTransition` internally so it can own the shared `activeSection`. (Header/Bridge/Footer stay outside it.)

### 5.2 `CrewSections` (NEW, `"use client"`) — the controller
Props: `{ initialSection: SectionId; budgetVisible: boolean; sectionNodes: Partial<Record<SectionId, ReactNode>> }`.
- `const [active, setActive] = useState(initialSection)`.
- `onSelect(id)`: `setActive(id)`; build the shallow URL via `buildSectionHref(pathname, searchParams, id)` and apply it WITHOUT a server render — `window.history.pushState(null, "", href)` (shallow; no `router.push`, so the dynamic route does NOT re-render and `getShowForViewer` does NOT re-run); then `window.scrollTo(0, 0)`. Guard: ignore if `id === active`.
- `popstate` listener: on browser back/forward, re-read `?s=` from `location.search`, resolve through `resolveActiveSection(raw, {budgetVisible})`, `setActive(...)` — so back/forward restores the section without a fetch. Cleanup on unmount.
- Renders:
  ```
  <div data-testid="crew-shell-sections" data-active-section={active}>
    <CrewSubNav activeSection={active} budgetVisible={budgetVisible} onSelect={onSelect} />
    <main data-testid="page-container" className={…same…}>
      <CrewSectionTransition sectionId={active}>{sectionNodes[active]}</CrewSectionTransition>
    </main>
  </div>
  ```
- **`data-active-section`** moves here (client-reactive). `_CrewShell` keeps `data-testid="crew-shell"` on its outer wrapper for the existing selector; the controller adds `data-active-section` on its own wrapper (or `_CrewShell` passes a server `data-active-section={initialSection}` for first paint and the controller updates it — decide in plan: simplest is the controller owns the live attribute; keep `crew-shell` testid on `_CrewShell`'s outer div).

### 5.3 `CrewSubNav` (controlled)
Drop `useRouter`/`usePathname`/`useSearchParams`/`buildSectionHref`/`navigate`. New props `{ activeSection, budgetVisible, onSelect }`. `tab(...)` `onClick={() => onSelect(id)}`. Everything else identical (desktop row + mobile fixed bar, `aria-current`, `data-section`, `data-testid="crew-sub-nav"`, glyphs, equal-width `min-w-0 flex-1`, `CREW_PAGE_CONTAINER` alignment, focus rings, reduced-motion color token).

### 5.4 Guard conditions
- `sectionNodes[active]` missing (e.g. a stale `?s=budget` that resolved away): `initialSection`/`popstate` both pass through `resolveActiveSection`, which only returns entitled ids, so `active` is always a key present in `sectionNodes`. Defensive: if `sectionNodes[active]` is `undefined`, fall back to `today`.
- Empty/degraded projection: the per-section components already guard (e.g. Today's `canBuildRightNow`); rendering all bodies does not change their internal guards.

## 6. Dimensional invariants (fixed-dimension parent)
The mobile sub-nav bar is `position:fixed inset-x-0 bottom-0` and `<main>` reserves matching bottom clearance (`pb-[calc(var(--spacing-tap-min)+env(safe-area-inset-bottom)+1rem)]`, `_CrewShell.tsx:324`). Invariant: each mobile tab fills the bar's full height and the bar clears the safe-area inset; equal-width tabs via `min-w-0 flex-1`. Verify in a real browser (Playwright) — jsdom cannot. (Unchanged from today; the refactor must not regress it.)

## 7. Transition inventory
States: the 6–7 sections. Section X→Y (any pair): `CrewSectionTransition` crossfade (`AnimatePresence mode="wait"`, opacity+`y:4`, `--duration-normal` 220ms) — now triggered by client `active` change. Reduced motion: instant (0ms token / the existing fork). **Compound:** a `router.refresh()` (realtime sync) WHILE on section Y must refresh Y's body in place WITHOUT a spurious crossfade (the key `sectionId` is unchanged across a refresh, so `AnimatePresence` does not re-key → content updates without re-animating). Pin this in the transition-audit test. First paint: `initial={false}` (no entry animation on mount).

## 8. Meta-test / structural inventory
- No Supabase call-boundary change (invariant 9 N/A — `getShowForViewer` untouched; no new reads). No migration; no advisory locks; no admin-alert catalog change.
- `tests/components/crew/noPrefetchAlert.test.tsx` is the structural guard most affected: its group (i) assertions (CrewSubNav uses `router.push`, no `next/link`, `<button>`) must be **rewritten** to the new contract — CrewSubNav does section nav via `onSelect` (no `router.push`, no `next/link`, still `<button>`), and the controller updates the URL via shallow `history.pushState` (NOT `router.push`). Group (ii) (routes are dynamic; `SectionChipLink` keeps `prefetch={false}`) stays UNCHANGED (still load-bearing). Add an assertion that section nav does NOT call `router.push` (no server nav per tap).

## 9. Testing strategy (TDD per task) — concrete failure modes
- **CrewSubNav controlled:** `onSelect(id)` fires with the tapped id; active tab has `aria-current="page"`; budget tab present iff `budgetVisible`; NO `router.push`/`next/link` import. Failure caught: regressing to per-tap server nav.
- **CrewSections controller:** initial render shows `initialSection` body; `onSelect` swaps to the new body WITHOUT re-fetching (mock that `getShowForViewer`/the route is never re-invoked — assert no `router.push`); shallow URL updates to `?s=<id>` (assert `history.pushState`/`location.search`), scroll-to-top called; `popstate` restores the section; `data-active-section` tracks `active`; a non-entitled section never appears. Failure caught: a section switch that does a server round-trip, or loses the URL/back-button.
- **Freshness (the invariant-3 guard):** a `router.refresh()`-style re-render with new `sectionNodes` updates the visible section's content while `active` is preserved (server-sourced data flows through; no client cache). Derive from the data source, not the container. Failure caught: client-cached/stale sections after a sync.
- **Budget gate / no-Budget:** non-lead `viewer` → `sectionNodes` has no `budget`, CrewSubNav has no Budget tab, `?s=budget` resolves to `today`. Lead → Budget present.
- **Transition audit (`transitionAudit.test.tsx`):** section X→Y crossfades (keyed `motion.div`); reduced-motion instant; compound: a refresh on section Y does not re-key/re-animate.
- **Existing shell/section tests** (`crewShell.test.tsx`, `crewShellSections.test.tsx`, `crewSubNav.test.tsx`, `crewShellAlert.test.tsx`, `sourceLinkCoverage.test.tsx`, `previewAsRoute.test.tsx`) updated for: all bodies rendered (toggle, not server-switch), `data-active-section` now on the controller, CrewSubNav controlled.
- **e2e** (`tests/e2e/crew-page.spec.ts`, `picker-flow.spec.ts`): tapping a section updates the view + URL with NO navigation/network round-trip; back-button restores; deep-link `?s=schedule` lands on Schedule.
- **§7-closeout (invariant 8):** `/impeccable critique` + `/impeccable audit` (external attestation) on the diff; HIGH/CRITICAL fixed or `DEFERRED.md`'d. **Real-browser PERF budget (the design-call scrutiny):** measure initial HTML/RSC payload + first-contentful render of the crew page BEFORE vs AFTER (all-sections-rendered). Acceptance: section switch becomes a 0-network-request client toggle (the win) AND initial payload/first-paint does not regress beyond an agreed budget (target: ≤ ~25% payload increase; if a content-heavy show blows the budget, STOP and surface — the all-sections-render tradeoff may need the lazy/cached variant). Also the §6 real-browser dimensional check.

## 9.1 Performance tradeoff (explicit)
Rendering all entitled sections server-side enlarges the initial RSC payload (all section bodies serialized) in exchange for instant, freshness-safe switches. Only the ACTIVE section is mounted client-side (`AnimatePresence mode="wait"` renders just the keyed child), so this is a server-render + transfer cost, not 7× client hydration. The perf gate (§9) measures it; a prohibitive regression on a content-heavy show is a STOP-and-surface condition (fall back to a lazy-with-freshness or cache-backed variant).

## 10. Watchpoints (pre-load the reviewer)
- **DO NOT relitigate** the re-scope from prefetch to client-toggle (§1: prefetch can't help a `?s=` change on a dynamic route; the side-effect is already dynamic-route-guarded).
- **Freshness is the #1 risk** — the spec forbids client-side section data; verify every section body stays server-sourced and `router.refresh()` re-renders them.
- **All-sections-render is a deliberate, gated tradeoff** (§9.1) — not an oversight; the perf gate is the check.
- `noPrefetchAlert.test.tsx` group (ii) + `SectionChipLink prefetch={false}` stay; only group (i) (the CrewSubNav nav mechanism) changes.

## 11. Expected outcome
Section tabs switch instantly (client toggle, 0 server round-trips, URL + back-button preserved), the page stays sheet-synced via the unchanged realtime→`router.refresh` path, and every existing crew contract (budget gate, transition, footer autocapture, a11y, dimensions) is preserved — verified by the impeccable dual-gate + a real-browser perf/dimension measurement.
