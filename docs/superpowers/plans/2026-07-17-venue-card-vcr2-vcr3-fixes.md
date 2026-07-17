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

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx`
Expected: the SSR test FAILS — current code (`useState("light")`, `:29`) renders the `<img>` with `theme=light` at server render, so `html` contains `venue-map-img` and `/api/admin/venue-map`.

- [ ] **Step 3: Write the minimal implementation**

In `components/admin/wizard/VenueMapTile.tsx`:

Change the state init (`:29`):

```tsx
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
```

Leave the `useEffect` (`:30-33`) and `if (!query) return null;` (`:34`) exactly as they are. Gate the `<img>` on a resolved theme — replace the layer-2 `<img>` block (`:63-78`) with:

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
          src={src}
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

Note `const src = …` (`:36`) is only read inside the `theme !== null` branch, so `theme` is non-null there and no `theme=null` string reaches the URL. (TypeScript: `theme` is narrowed to `"light" | "dark"` inside the branch; if the `src` declaration precedes the guard and trips a type error, move `const src = …` inside the branch.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx`
Expected: PASS — the two new tests plus every pre-existing test (the existing "query + mapHref → theme=light" and "dark theme after hydration → theme=dark" still pass because RTL `render()` flushes the effect, resolving `theme` before assertions).

- [ ] **Step 5: Typecheck the changed file**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm tsc --noEmit`
Expected: no errors. (If `theme` narrowing fails at the `src` declaration, move `const src` inside the branch per Step 3.)

- [ ] **Step 6: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add components/admin/wizard/VenueMapTile.tsx tests/components/admin/wizard/venueMapTile.test.tsx
git commit --no-verify -m "fix(crew-page): mount venue map <img> only after theme resolves (VCR-2)"
```

---

## Task 2: VCR-3 — degraded tile + parent region gate

**Files:**
- Modify: `components/admin/wizard/VenueMapTile.tsx:34` (guard) + the `<img>` predicate from Task 1
- Modify: `components/admin/wizard/step3ReviewSections.tsx:973` (region-mount gate)
- Test: `tests/components/admin/wizard/venueMapTile.test.tsx`, `tests/components/admin/wizard/venueBreakdown.test.tsx`

**Interfaces:**
- Consumes: Task 1's `theme !== null` img gate.
- Produces: `VenueMapTile` returns `null` only when `!query && !mapHref`; renders the `<img>` only when `query !== "" && theme !== null`. `VenueBreakdown` mounts `venue-map-region` when `query || mapHref`.

- [ ] **Step 1: Write / amend the failing tests**

In `tests/components/admin/wizard/venueMapTile.test.tsx`, **replace** the existing `test("empty query → renders nothing (parent owns collapse)", …)` (it uses a valid `mapHref` and now describes the opposite behavior) with two tests:

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

In `tests/components/admin/wizard/venueBreakdown.test.tsx`, **replace** the existing `test("name+address both empty → map region collapses (parent owns), no map tile mounted", …)` (uses valid `https://m.co`) with three tests:

```tsx
test("VCR-3: link-only venue (valid googleLink) → map region MOUNTS with Directions, no <img>, count 1, no empty copy", () => {
  const { container } = render(
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
  expect(container.textContent).not.toContain("No venue details parsed.");
});

test("accepted degenerate: non-parseable googleLink only → region collapses, no tile, count 1 (no empty copy)", () => {
  const { container } = render(
    <VenueBreakdown
      dfid={DFID}
      venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: "TBD" })}
    />,
  );
  expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
  expect(container.querySelector('[data-testid="venue-map-tile"]')).toBeNull();
  expect(container.textContent).not.toContain("No venue details parsed."); // TBD counts → count 1
});

test("true empty: all five fields empty → count 0, empty copy, no region", () => {
  const { container, getByText } = render(
    <VenueBreakdown
      dfid={DFID}
      venue={venue({ name: "", address: "", city: "", loadingDock: null, googleLink: null })}
    />,
  );
  getByText("No venue details parsed.");
  expect(container.querySelector('[data-testid="venue-map-region"]')).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx`
Expected: the VCR-3 tile test and the venueBreakdown link-only test FAIL — current guard `if (!query) return null` makes the empty-query tile render nothing, and the parent (`step3ReviewSections.tsx:973`) gates the region on `query` alone so it does not mount for a link-only venue.

- [ ] **Step 3: Write the minimal implementation**

In `components/admin/wizard/VenueMapTile.tsx`, change the guard (`:34`):

```tsx
  if (!query && !mapHref) return null;
```

And change the `<img>` mount predicate (from Task 1) so an empty query never fetches — the condition becomes `query !== "" && theme !== null`:

```tsx
      {query !== "" && theme !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- proxy PNG stream; native onError drives the fallback
        <img
          data-testid="venue-map-img"
          src={src}
          /* …unchanged attrs from Task 1… */
        />
      ) : null}
```

In `components/admin/wizard/step3ReviewSections.tsx`, change the region-mount gate (`:973`) from `{query ? (` to:

```tsx
            {query || mapHref ? (
```

(The wrapper `<div data-testid="venue-map-region" …>` and `<VenueMapTile query={query} mapHref={mapHref} />` below it are UNCHANGED — `query` may now be `""`, which the tile handles.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx`
Expected: PASS — all tests in both files, including the pre-existing `non-URL googleLink → map region present but no Directions anchor` (full venue with `googleLink:"TBD"` → `query` non-empty → region mounts, `mapHref` null → no Directions) and `null venue → empty copy` tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add components/admin/wizard/VenueMapTile.tsx components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx
git commit --no-verify -m "fix(crew-page): mount venue map region + degraded Directions tile for link-only venues (VCR-3)"
```

---

## Task 3: Link-only DI-1 real-browser layout assertion

**Files:**
- Modify: `tests/e2e/_step3ReviewModalHarness.tsx:254` (add a `linkOnly` page variant to the emitted JSON)
- Modify: `tests/e2e/step3-review-modal.layout.spec.ts` (`beforeAll` `:147-160` write + `@source`; new test after DI-6 `~:681`)

**Harness mechanics (verified live):** `_step3ReviewModalHarness.tsx` (run via `tsx` in `beforeAll`) emits a JSON of pre-rendered HTML strings (`normal`/`long`/`resolution`). The spec `beforeAll` writes each to `harness*.html` (`:147-150`), registers each as a Tailwind `@source` (`:159`), and serves them from a static `createServer`. `openHarness(page, viewport, path)` (`:189`) navigates to a given `harness*.html`. `rect(page, selector)` (`:202`) returns the bounding box. Add a `linkOnly` variant the same way `long`/`resolution` were added.

**Interfaces:**
- Consumes: the degraded tile from Task 2; the `harnessVenue()` fixture (`tests/components/admin/wizard/_step3ReviewFixture.ts:137`).

- [ ] **Step 1: Add the `linkOnly` page variant to the harness emitter**

In `tests/e2e/_step3ReviewModalHarness.tsx`, inside the `writeFileSync(outPath, JSON.stringify({ … }))` object (`:254`), add after the `normal:` line:

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

- [ ] **Step 2: Write the failing test (write the harness file + `@source`, then the assertion)**

In `tests/e2e/step3-review-modal.layout.spec.ts`, first add `linkOnly: string;` to the `pages` cast type (`:129-135`, alongside `normal`/`long`/`resolution`) so `pages.linkOnly` typechecks. Then, in `beforeAll`, after the `harness-resolution.html` write (`:150`), add:

```ts
  writeFileSync(join(workDir, "harness-linkonly.html"), pageHtml("out.css", pages.linkOnly));
```

and extend the `entryCss` `@source` string (`:159`) to include it:

```ts
    `@source "${join(workDir, "harness.html")}";\n@source "${join(workDir, "harness-long.html")}";\n@source "${join(workDir, "harness-resolution.html")}";\n@source "${join(workDir, "harness-linkonly.html")}";\n${globals}`,
```

Then add the test after the DI-6 test (`~:681`):

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

(`TOL` is the existing tolerance constant used by the sibling DI tests — confirm its value at the top of the file; it is `0.5` per the spec. `openHarness`, `rect`, `pageHtml`, `pages`, `workDir` are all already in scope.)

- [ ] **Step 3: Run to verify it passes (and fails for the right reason without Task 2)**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm playwright test tests/e2e/step3-review-modal.layout.spec.ts -g "link-only"`
Expected: with Task 2 applied, PASS. Sanity (optional): stash Task 2's parent-gate change and the region selector times out (region not mounted) — proving the test exercises the fix.

- [ ] **Step 4: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add tests/e2e/step3-review-modal.layout.spec.ts tests/e2e/_step3ReviewModalHarness.tsx
git commit --no-verify -m "test(crew-page): real-browser DI-1 assertion for link-only venue tile (VCR-3)"
```

---

## Task 4: Transition audit + close-out docs

**Files:**
- Test: `tests/components/admin/wizard/venueTransitionAudit.test.ts` (verify still green; extend comment if needed)
- Modify: `DEFERRED.md` (VCR-2 `:376`, VCR-3 `:382`), `docs/superpowers/plans/BACKLOG.md`

**Interfaces:** none.

- [ ] **Step 1: Run the transition audit to confirm no new animation slipped in**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm vitest run tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected: PASS unchanged — the mount-gate + guard changes add no `transition-*` class, no `AnimatePresence`, no `exit`/`initial` prop (the `<img>` is conditionally mounted, not animated). The audit already scans both `VenueMapTile` and the `VenueBreakdown` slice. No edit expected; if the conditional-mount phrasing needs a comment tweak for honesty, make the minimal edit only.

- [ ] **Step 2: Mark DEFERRED.md entries resolved**

In `DEFERRED.md`, prepend to the VCR-2 heading (`:376`) and VCR-3 heading (`:382`), keeping the original body text:

```
### VCR-2 — [P2] Dark-mode first paint fetches the light map, then re-fetches dark — ✅ RESOLVED 2026-07-17 (venue-card VCR fixes, fix/venue-card-vcr2-vcr3: <img> mount-gated on post-hydration-resolved theme; no wrong-theme raster at first paint)
```

```
### VCR-3 — [MEDIUM] Link-only venue (maps link but no name/address/city/dock) renders an empty card — ✅ RESOLVED 2026-07-17 (venue-card VCR fixes, fix/venue-card-vcr2-vcr3: parent mounts map region on query||mapHref; degraded stripe+Directions tile for a valid link-only venue; non-parseable-placeholder degenerate documented)
```

- [ ] **Step 3: Mark BACKLOG.md entries shipped**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && grep -n "BL-VENUE-MAP-DARK-DOUBLE-FETCH\|BL-VENUE-LINK-ONLY-EMPTY-CARD" docs/superpowers/plans/BACKLOG.md`
Then mark each matched entry `✅ SHIPPED (2026-07-17, fix/venue-card-vcr2-vcr3)` with a one-line reference, keeping the original text (mirror the existing `✅ SHIPPED` formatting in BACKLOG.md). If either id is absent, add a one-line `✅ SHIPPED` note in the appropriate section rather than inventing a new backlog row.

- [ ] **Step 4: Verify prettier + full venue-suite green**

Run: `cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3 && pnpm format:check && pnpm vitest run tests/components/admin/wizard/venueMapTile.test.tsx tests/components/admin/wizard/venueBreakdown.test.tsx tests/components/admin/wizard/venueTransitionAudit.test.ts`
Expected: format clean (docs edits can trip prettier — run `pnpm format` if so), all venue vitest suites green.

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/fxav-worktrees/venue-card-vcr2-vcr3
git add DEFERRED.md docs/superpowers/plans/BACKLOG.md tests/components/admin/wizard/venueTransitionAudit.test.ts
git commit --no-verify -m "docs(crew-page): mark VCR-2/VCR-3 resolved + backlog shipped"
```

---

## Task 5: Invariant-8 impeccable dual-gate

**Files:** none (evaluation gate on the Task 1–2 diff).

- [ ] **Step 1: `/impeccable critique`** on the diff (setup gates: `context.mjs` PRODUCT.md+DESIGN.md load → register reference read). Scope: `VenueMapTile.tsx` + `VenueBreakdown` region.
- [ ] **Step 2: `/impeccable audit`** on the same diff.
- [ ] **Step 3:** Record findings + dispositions. P0/P1 → fix in-branch (new commit) or defer via a `DEFERRED.md` entry with rationale. P2/P3 → fix or defer. This runs BEFORE the Stage-4 whole-diff Codex review.

---

## Self-Review

**Spec coverage:** VCR-2 → Task 1 (§2, §4 §6-amendment, §6-test-1). VCR-3 → Task 2 (§3, §4 §5-amendment, §6-test-2). DI-1 link-only → Task 3 (§5, §6-test-3). Transition inventory → Task 4 Step 1 (§4 §8-amendment, §6-test-4). Close-out (§8 checklist) → Task 4 Steps 2-3. Impeccable dual-gate → Task 5. Count contract / accepted degenerate → Task 2 Step 1 (degenerate + true-empty tests). No gaps.

**Placeholder scan:** none — every code step shows the exact code; the only deferred detail (Task 3 harness-open form) is explicitly bounded to "copy the sibling DI-1 test's setup" with a Step-1 inspection, because the harness fixture-injection API must be read from live code, not invented.

**Type consistency:** `theme: "light" | "dark" | null` used consistently across Task 1 (init `null`) and Task 2 (predicate `theme !== null`). `query`/`mapHref` names match `step3ReviewSections.tsx:937,940`. Testids (`venue-map-region`, `venue-map-tile`, `venue-map-img`, `venue-directions`, `venue-map-fallback`, `venue-text-col`) match live source.
