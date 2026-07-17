# Venue card VCR-2 + VCR-3 fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix VCR-2 (dark-mode static-map light→dark double-fetch) and VCR-3 (link-only venue renders an empty card) in the admin venue card.

**Architecture:** Two client-only React changes in `VenueMapTile.tsx` + one parent gate in `step3ReviewSections.tsx`. VCR-2: gate the `<img>` on a post-hydration-resolved theme (`theme: null` sentinel until an effect resolves it) so no wrong-theme raster is ever fetched at first paint. VCR-3: mount the map region when `query || mapHref` and render a degraded (imageless) stripe+Directions tile when the query is empty but the maps link is valid.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vitest (jsdom), Playwright (real-browser layout).

**Spec:** `docs/superpowers/specs/2026-07-17-venue-card-vcr2-vcr3-fixes-design.md` (amends `2026-07-06-venue-card-redesign-design.md` §3.2/§5/§6/§8).

## Global Constraints

- **TDD per task:** failing test → minimal implementation → passing test → commit. Never implementation before its test. (AGENTS invariant 1)
- **Commit per task**, conventional-commits: `<type>(crew-page): <summary>`. One task per commit. Use `--no-verify` (shared global lint-staged hook belongs to the main checkout). (AGENTS invariant 6)
- **No raw error codes in user-visible UI** (invariant 5) — not exercised here (no error copy added).
- **UI quality gate (invariant 8):** both files are UI surfaces → `/impeccable critique` AND `/impeccable audit` on the diff before cross-model review; P0/P1 fixed or deferred.
- **Meta-test inventory:** NONE created/extended. No Supabase call boundary, no admin-alert catalog, no advisory lock (`pg_advisory*` untouched), no email normalization, no new mutation surface, no `§12.4` code. Declared per the writing-plans meta-test-inventory rule.
- **Anti-tautology (tests):** derive expected geometry from the render / the token, never hardcode; each assertion names the failure mode it catches; SSR-render for the pre-effect proof (RTL `render()` flushes effects and cannot observe pre-effect state).
- **`min-h-tile-min-h` = `--spacing-tile-min-h` = 96px** (`app/globals.css:173`).

---

## File Structure

- **Modify** `components/admin/wizard/VenueMapTile.tsx` — theme mount-gate (VCR-2) + guard change (VCR-3).
- **Modify** `components/admin/wizard/step3ReviewSections.tsx:973` — region-mount gate `query` → `query || mapHref` (VCR-3).
- **Modify (tests)** `tests/components/admin/wizard/venueMapTile.test.tsx`, `tests/components/admin/wizard/venueBreakdown.test.tsx`, `tests/e2e/step3-review-modal.layout.spec.ts`, `tests/components/admin/wizard/venueTransitionAudit.test.ts`.
- **Modify (docs)** `DEFERRED.md`, `docs/superpowers/plans/BACKLOG.md` — close-out.

---

## Task 1: VCR-2 — theme mount-gate in `VenueMapTile`

**Files:**
- Modify: `components/admin/wizard/VenueMapTile.tsx` (`:29` state init, `:36` src, `:64-78` img)
- Test: `tests/components/admin/wizard/venueMapTile.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `VenueMapTile` renders the `<img>` (testid `venue-map-img`) **only when `theme !== null`**; `theme` state type `"light" | "dark" | null`, init `null`, resolved once in the existing mount `useEffect`. Guard `if (!query) return null` UNCHANGED in this task (VCR-3 changes it in Task 2).

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/admin/wizard/venueMapTile.test.tsx`. Add the import at the top (alongside the existing imports):

```tsx
import { renderToStaticMarkup } from "react-dom/server";
```

Add these tests inside the `describe("VenueMapTile", …)` block:

```tsx
test("VCR-2 SSR: server markup paints the stripe base but NO <img> / proxy URL (no first-paint fetch)", () => {
  // renderToStaticMarkup never runs effects, so theme stays null → no <img>.
  // This is the load-bearing proof that the light→dark double-fetch is gone at
  // the source: the browser's first paint requests no map image in any theme.
  const html = renderToStaticMarkup(<VenueMapTile query="X" mapHref={null} />);
  expect(html).toContain('data-testid="venue-map-fallback"'); // stripe base painted
  expect(html).not.toContain('data-testid="venue-map-img"'); // no <img> at first paint
  expect(html).not.toContain("/api/admin/venue-map"); // no proxy URL fetched
});

test("VCR-2 post-hydration: exactly one <img>, correct theme; dark never preceded by a light src", () => {
  document.documentElement.dataset.theme = "dark";
  const { container } = render(<VenueMapTile query="X" mapHref={null} />);
  const imgs = container.querySelectorAll('[data-testid="venue-map-img"]');
  expect(imgs.length).toBe(1);
  expect((imgs[0] as HTMLImageElement).getAttribute("src")).toContain("theme=dark");
  expect((imgs[0] as HTMLImageElement).getAttribute("src")).not.toContain("theme=light");
});
```

Also pin the VCR-2 mount-gate in the transition audit (regression guard for the new §8 "theme unresolved → resolved (`<img>` overlays)" row). Add to `tests/components/admin/wizard/venueTransitionAudit.test.ts`, inside the `describe(…)` block (the `tile` const already holds the comment-stripped tile source):

```ts
test("VCR-2: the map <img> is conditionally mounted on the resolved theme (no first-paint fetch), still instant", () => {
  // The <img> must render inside a `theme !== null` gate so SSR/first paint
  // has no <img> (no wrong-theme raster fetched) — §8 row is a mount, not a
  // fade. Assert the gate exists AND no opacity/transition animates it.
  expect(tile).toContain("theme !== null");
  expect(tile).not.toMatch(/\btransition(-\w+)?\b/); // (already covered; kept local + explicit)
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected: the SSR test FAILS — current code (`useState("light")`, `:29`) renders the `<img>` with `theme=light` at server render, so `html` contains `venue-map-img` and `/api/admin/venue-map`. The new audit test FAILS — current source has no `theme !== null` gate.

- [ ] **Step 3: Write the minimal implementation**

In `components/admin/wizard/VenueMapTile.tsx`:

Change the state init (`:29`):

```tsx
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
```

Leave the `useEffect` (`:30-33`) and `if (!query) return null;` (`:34`) exactly as they are. **Delete the unconditional `const src = …` line (`:36`)** — a nullable `theme` in a template literal does NOT raise a TS error (it stringifies to `"theme=null"`), so the URL must be built only where `theme` is guaranteed non-null. Compute `src` **inside** the render branch and gate the `<img>` on a resolved theme — replace the layer-2 `<img>` block (`:63-78`) with:

```tsx
      {/* (2) real map overlay — mounted only once the post-hydration effect
          resolves the theme (theme !== null). At SSR + first client render
          theme is null → no <img>, so no wrong-theme raster is ever fetched at
          first paint (VCR-2). §8: instant, no fade. Plain <img>, not
          next/image: same-origin key-safe proxy + native onError fallback. */}
      {theme !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxy PNG stream; native onError drives the fallback
        <img
          data-testid="venue-map-img"
          src={`/api/admin/venue-map?q=${encodeURIComponent(query)}&theme=${theme}`}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
          onLoad={(e) => {
            e.currentTarget.style.visibility = "visible";
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
```

The `src` is now built inline only inside `theme !== null` (narrowed to `"light" | "dark"`), so no `theme=null` string can ever reach the URL — this is the structural guarantee behind the SSR proof test.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected: PASS — the new SSR + post-hydration + audit tests, plus every pre-existing test (the existing "query + mapHref → theme=light" and "dark theme after hydration → theme=dark" still pass because RTL `render()` flushes the effect, resolving `theme` before assertions).

- [ ] **Step 5: Typecheck the changed file**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm tsc --noEmit`
Expected: no errors. (If `theme` narrowing fails at the `src` declaration, move `const src` inside the branch per Step 3.)

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add components/admin/wizard/VenueMapTile.tsx tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts
git commit --no-verify -m "fix(crew-page): mount venue map <img> only after theme resolves (VCR-2)"
```

---


## Task 2: VCR-3 — degraded tile + parent gate + link-only layout assertion

**Files:**
- Modify: `components/admin/wizard/VenueMapTile.tsx:34` (guard) + the `<img>` predicate from Task 1
- Modify: `components/admin/wizard/step3ReviewSections.tsx:973` (region-mount gate)
- Modify (tests): `tests/components/admin/wizard/venueMapTile.test.tsx`, `tests/components/admin/wizard/venueBreakdown.test.tsx`, `tests/components/admin/wizard/venueTransitionAudit.test.ts`, `tests/e2e/_step3ReviewModalHarness.tsx`, `tests/e2e/step3-review-modal.layout.spec.ts`

**Interfaces:**
- Consumes: Task 1's `theme !== null` img gate.
- Produces: `VenueMapTile` returns `null` only when `!query && !mapHref`; renders the `<img>` only when `query !== "" && theme !== null`. `VenueBreakdown` mounts `venue-map-region` when `query || mapHref`.

**Harness mechanics (verified live):** `tests/e2e/_step3ReviewModalHarness.tsx` (run via `tsx` in `beforeAll`) emits a JSON of pre-rendered HTML strings (`normal`/`long`/`resolution`, `:254`). The spec `beforeAll` writes each to `harness*.html` (`:147-150`), types them in the `pages` cast (`:129-135`), registers each as a Tailwind `@source` (`:159`), and serves them from a static `createServer`. `openHarness(page, viewport, path)` (`:189`) navigates; `rect(page, selector)` (`:202`) returns the box; `TOL = 0.5` (`:77`). This layout spec MUST run under `tests/e2e/standalone.config.ts` (it boots its own server; the default `playwright.config.ts` starts dev servers + seeded Supabase it does not need — `standalone.config.ts:4-10`).

- [ ] **Step 1: Write / amend the failing tests (unit + audit + real-browser layout)**

**(1a)** In `tests/components/admin/wizard/venueMapTile.test.tsx`, **replace** the existing `test("empty query → renders nothing (parent owns collapse)", …)` (uses a valid `mapHref`, now describes the opposite) with:

```tsx
test("VCR-3: empty query + valid mapHref → stripe + Directions anchor, NO <img>", () => {
  const { container } = render(<VenueMapTile query="" mapHref="https://m.co" />);
  const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
  expect(tile.tagName).toBe("A");
  expect(tile.getAttribute("href")).toBe("https://m.co");
  expect(container.querySelector('[data-testid="venue-map-fallback"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="venue-directions"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="venue-map-img"]')).toBeNull(); // nothing to geocode
});

test("guard: empty query + null mapHref → renders nothing", () => {
  const { container } = render(<VenueMapTile query="" mapHref={null} />);
  expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
});
```

**(1b)** In `tests/components/admin/wizard/venueBreakdown.test.tsx`, **replace** the existing `test("name+address both empty → map region collapses (parent owns), no map tile mounted", …)` (uses valid `https://m.co`) with three tests. `getByText("(N)")` matches the legacy-path count span (`step3ReviewSections.tsx:793`, `{count !== null ? <span …>({count})</span> …}`; `VenueBreakdown` renders WITHOUT the chrome context provider in this test, so the count parenthetical is present):

```tsx
test("VCR-3: link-only venue (valid googleLink) → region MOUNTS with Directions, no <img>, count (1), no empty copy", () => {
  const { container, getByText } = render(
    <VenueBreakdown
      dfid={DFID}
      venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: "https://maps.google.com/?q=x" })}
    />,
  );
  expect(container.querySelector('[data-testid="venue-map-region"]')).not.toBeNull();
  const tile = container.querySelector('[data-testid="venue-map-tile"]') as HTMLAnchorElement;
  expect(tile.tagName).toBe("A");
  expect(container.querySelector('[data-testid="venue-directions"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="venue-map-img"]')).toBeNull();
  getByText("(1)"); // count = 1 (googleLink), asserted against the rendered heading
  expect(container.textContent).not.toContain("No venue details parsed.");
});

test("accepted degenerate: non-parseable googleLink only → region collapses, no tile, count (1), no empty copy", () => {
  const { container, getByText } = render(
    <VenueBreakdown
      dfid={DFID}
      venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: "TBD" })}
    />,
  );
  expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
  expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
  getByText("(1)"); // "TBD" is counted by contentRows → count 1, so no empty state
  expect(container.textContent).not.toContain("No venue details parsed.");
});

test("true empty: all five fields empty → count (0), empty copy, no region", () => {
  const { container, getByText } = render(
    <VenueBreakdown
      dfid={DFID}
      venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: null })}
    />,
  );
  getByText("(0)");
  getByText("No venue details parsed.");
  expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
});
```

**(1c)** In `tests/components/admin/wizard/venueTransitionAudit.test.ts`, pin the VCR-3 parent region-mount predicate (regression guard for the new §8 "query-backed ↔ mapHref-only" row) and correct the now-stale comment. Inside the `test("VenueBreakdown: enumerated conditional renders exist and are instant", …)`, change the comment line `// (a) map region rendered only when the geocode query is non-empty.` to `// (a) map region rendered when query OR a valid mapHref (VCR-3 link-only).`, and add after the `venue-map-region` assertion:

```ts
    // VCR-3: the region mounts on `query || mapHref` (not query alone), so a
    // link-only venue still shows a (degraded) tile. Pin the predicate.
    expect(src, "region gated on query || mapHref").toContain("query || mapHref");
```

**(1d)** Add the `linkOnly` page variant. In `tests/e2e/_step3ReviewModalHarness.tsx`, inside the `writeFileSync(outPath, JSON.stringify({ … }))` object (`:254`), add after the `normal:` line:

```tsx
      linkOnly: renderModalHtml({
        showOverrides: {
          venue: {
            name: "",
            address: "",
            city: "",
            loadingDock: null,
            googleLink: "https://maps.google.com/?q=masonic",
          },
        },
      }),
```

**(1e)** In `tests/e2e/step3-review-modal.layout.spec.ts`: add `linkOnly: string;` to the `pages` cast type (`:129-135`); after the `harness-resolution.html` write (`:150`) add `writeFileSync(join(workDir, "harness-linkonly.html"), pageHtml("out.css", pages.linkOnly));`; extend the `entryCss` `@source` string (`:159`) with `@source "${join(workDir, "harness-linkonly.html")}";\n`. Then add after the DI-6 test (`~:681`):

```ts
test("§DI-1 link-only venue: map region fills text column height AND is ≥ tile-min-h (anti-tautology) @ popup 800px", async ({ page }) => {
  await openHarness(page, { width: 800, height: 900 }, "harness-linkonly.html");
  const region = await rect(page, '[data-testid="venue-map-region"]');
  const textCol = await rect(page, '[data-testid="venue-text-col"]');
  const tile = await rect(page, '[data-testid="venue-map-tile"]');
  // (a) DI-1: equal heights (Tailwind v4 items-stretch collapse catcher).
  expect(
    Math.abs(region.height - textCol.height),
    `region ${region.height} === text col ${textCol.height}`,
  ).toBeLessThanOrEqual(TOL);
  // (b) anti-tautology: cannot pass by BOTH columns collapsing to the short
  // eyebrow-only height — the tile's min-h-tile-min-h (96px) floors the region.
  expect(region.height, `link-only region height ${region.height} ≥ 96`).toBeGreaterThanOrEqual(96 - TOL);
  // (c) the imageless tile fills its region box.
  expect(
    Math.abs(tile.height - region.height),
    `tile ${tile.height} fills region ${region.height}`,
  ).toBeLessThanOrEqual(TOL);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected FAIL: the VCR-3 tile test (current guard `if (!query) return null` → empty-query tile renders nothing), the venueBreakdown link-only test (parent gates region on `query` alone → not mounted), and the audit `query || mapHref` pin (string absent from current source). (The `guard: empty query + null mapHref` and `true empty` tests already pass — behavior unchanged for those.)

Then the real-browser layout test:
Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts -g "link-only"`
Expected FAIL: `rect(page, '[data-testid="venue-map-region"]')` times out — the link-only region is not mounted pre-implementation.

- [ ] **Step 3: Write the minimal implementation**

In `components/admin/wizard/VenueMapTile.tsx`, change the guard (`:34`):

```tsx
  if (!query && !mapHref) return null;
```

And change the `<img>` mount predicate (from Task 1) so an empty query never fetches — `theme !== null` becomes `query !== "" && theme !== null` (the inline `src` from Task 1 is unchanged; `query` is non-empty inside the branch):

```tsx
      {query !== "" && theme !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxy PNG stream; native onError drives the fallback
        <img
          data-testid="venue-map-img"
          src={`/api/admin/venue-map?q=${encodeURIComponent(query)}&theme=${theme}`}
          alt=""
          loading="lazy"
          onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          onLoad={(e) => { e.currentTarget.style.visibility = "visible"; }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
```

In `components/admin/wizard/step3ReviewSections.tsx`, change the region-mount gate (`:973`) from `{query ? (` to:

```tsx
            {query || mapHref ? (
```

(The wrapper `<div data-testid="venue-map-region" …>` and `<VenueMapTile query={query} mapHref={mapHref} />` are UNCHANGED — `query` may now be `""`, which the tile handles.)

- [ ] **Step 4: Run tests to verify they pass**

Run (unit + audit): `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected PASS — all tests in all three files, including pre-existing `non-URL googleLink → map region present but no Directions anchor` (full venue, `googleLink:"TBD"` → `query` non-empty → region mounts, `mapHref` null → no Directions) and `null venue → empty copy`.

Run (real browser): `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.layout.spec.ts -g "link-only"`
Expected PASS — region mounts, heights equal, region ≥ 96px, tile fills region.

- [ ] **Step 5: Typecheck**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm tsc --noEmit`
Expected: no errors (the `pages` cast now includes `linkOnly`).

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add components/admin/wizard/VenueMapTile.tsx components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts tests/e2e/_step3ReviewModalHarness.tsx tests/e2e/step3-review-modal.layout.spec.ts
git commit --no-verify -m "fix(crew-page): mount venue map region + degraded Directions tile for link-only venues (VCR-3)"
```

---

## Task 3: Close-out docs (DEFERRED + BACKLOG)

**Files:** `DEFERRED.md` (VCR-2 `:376`, VCR-3 `:382`), `docs/superpowers/plans/BACKLOG.md`. Docs-only — no TDD cycle.

- [ ] **Step 1: Mark DEFERRED.md entries resolved**

In `DEFERRED.md`, append `— ✅ RESOLVED …` to the VCR-2 (`:376`) and VCR-3 (`:382`) headings, keeping the original body text:

```
### VCR-2 — [P2] Dark-mode first paint fetches the light map, then re-fetches dark — ✅ RESOLVED 2026-07-17 (venue-card VCR fixes, fix/venue-card-vcr2-vcr3: <img> mount-gated on post-hydration-resolved theme; no wrong-theme raster at first paint)
```

```
### VCR-3 — [MEDIUM] Link-only venue (maps link but no name/address/city/dock) renders an empty card — ✅ RESOLVED 2026-07-17 (venue-card VCR fixes, fix/venue-card-vcr2-vcr3: parent mounts map region on query||mapHref; degraded stripe+Directions tile for a valid link-only venue; non-parseable-placeholder degenerate documented)
```

- [ ] **Step 2: Mark BACKLOG.md entries shipped**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && grep -n "BL-VENUE-MAP-DARK-DOUBLE-FETCH\|BL-VENUE-LINK-ONLY-EMPTY-CARD" docs/superpowers/plans/BACKLOG.md`
Then mark each matched entry `✅ SHIPPED (2026-07-17, fix/venue-card-vcr2-vcr3)` with a one-line reference, keeping the original text (mirror the existing `✅ SHIPPED` formatting in BACKLOG.md). If either id is absent, add a one-line `✅ SHIPPED` note in the appropriate section rather than inventing a new backlog row.

- [ ] **Step 3: Verify prettier + full venue-suite green**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm format:check && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected: format clean (docs edits can trip prettier — run `pnpm format` if so), all venue vitest suites green.

- [ ] **Step 4: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add DEFERRED.md docs/superpowers/plans/BACKLOG.md
git commit --no-verify -m "docs(crew-page): mark VCR-2/VCR-3 resolved + backlog shipped"
```

---

## Task 4: Invariant-8 impeccable dual-gate

**Files:** none (evaluation gate on the Task 1–2 source diff).

- [ ] **Step 1: `/impeccable critique`** on the diff (setup gates: `context.mjs` PRODUCT.md+DESIGN.md load → register reference read). Scope: `VenueMapTile.tsx` + the `VenueBreakdown` map region in `step3ReviewSections.tsx`.
- [ ] **Step 2: `/impeccable audit`** on the same diff.
- [ ] **Step 3:** Record findings + dispositions in the handoff/close-out notes. P0/P1 → fix in-branch (new commit) or defer via a `DEFERRED.md` entry with rationale. P2/P3 → fix or defer. This runs BEFORE the Stage-4 whole-diff Codex review.

---

## Self-Review

**Spec coverage:** VCR-2 mount-gate → Task 1 (§2, §4 §6-amendment, §6-test-1 SSR proof + post-hydration + audit theme-gate pin). VCR-3 degraded tile + parent gate → Task 2 (§3, §4 §5-amendment, §6-test-2 unit incl. count assertions + §6-test-3 real-browser DI-1 + audit query||mapHref pin). Count contract / accepted degenerate / true-empty → Task 2 (1b). Transition inventory (§4 §8-amendment) → audit pins in Task 1 (1) + Task 2 (1c). Close-out (§8 checklist) → Task 3. Impeccable dual-gate → Task 4. No gaps.

**Placeholder scan:** none — every code step shows exact code and exact file:line anchors; harness plumbing (pages cast, beforeAll write, @source, standalone config) is spelled out against verified live line numbers.

**Type consistency:** `theme: "light" | "dark" | null` consistent across Task 1 (init `null`, gate `theme !== null`) and Task 2 (gate `query !== "" && theme !== null`). `query`/`mapHref` match `step3ReviewSections.tsx:937,940`. `pages.linkOnly` typed at `:129`. Testids (`venue-map-region`, `venue-map-tile`, `venue-map-img`, `venue-directions`, `venue-map-fallback`, `venue-text-col`) match live source. Count span text `(N)` matches `step3ReviewSections.tsx:793`.

**TDD honesty:** every test task authors a test that fails against current code for the stated reason BEFORE the minimal implementation (SSR proof + audit theme-gate red before Task 1 impl; VCR-3 unit + real-browser layout + audit query||mapHref red before Task 2 impl). Task 3 is docs-only (no red needed); Task 4 is an evaluation gate.
