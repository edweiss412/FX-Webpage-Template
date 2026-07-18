# CASP2-4 item 1 — finalize in-flow chip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the inline `PublishedToggle` finalize hint from a shared-`POPOVER_POSITION` absolute overlay banner into an in-flow compact chip beside the switch, so it never overlays rail content during the finalize window.

**Architecture:** Split the previously-shared `POPOVER_POSITION` constant so it serves only the error skin (which stays an absolute full-width banner). Add a `FINALIZE_CHIP` class constant and render the finalize hint as an in-flow `<span>` flex-sibling of the switch, with a compact mode-dependent visible label + `sr-only` full copy. Error path untouched. `StatusStrip.tsx` untouched (chip lives inside `PublishedToggle`).

**Tech Stack:** Next.js 16, React 19, Tailwind v4, Vitest + Testing Library (unit), Playwright standalone harness (real-browser e2e).

**Spec:** `docs/superpowers/specs/2026-07-17-casp2-finalize-inflow-chip.md`

## Global Constraints

- **TDD per task** — failing test → minimal impl → green → commit. Never impl before its test. (AGENTS.md invariant 1.)
- **No raw error codes in UI** — unchanged here (no code added); the finalize hint is a codeless in-product string, same class as the existing `subline`/`RETRY_COPY`. (Invariant 5.)
- **UI quality gate (invariant 8)** — `components/admin/PublishedToggle.tsx` is a UI surface; `/impeccable critique` AND `/impeccable audit` run on the diff, P0/P1 fixed or `DEFERRED.md`-deferred, before the whole-diff Codex review.
- **Ellipsis = `…` (U+2026); apostrophe = `’` (U+2019)** — match existing curly-punctuation discipline.
- **Commit per task**, conventional-commits: `feat(admin):` / `test(admin):` / `test(infra):` / `docs(...)`.
- **`--no-verify`** on commits (shared lint-staged hook belongs to the main checkout); run `pnpm format:check`, `pnpm lint`, `pnpm typecheck` manually before the final push.

## Meta-test inventory

**None created or extended.** No structural meta-test (Supabase call-boundary, admin-alert catalog, advisory-lock topology, sentinel-hiding, no-inline-email) is in scope. The rewritten parity test and e2e geometry tests are per-component unit/e2e tests, not registries. The `pageTransitions.test.tsx` conditional count-pin is **unaffected**: its registry (`PAGE_COMPONENT_COUNTS`) scans only `components/admin/showpage/*`; `PublishedToggle.tsx` is not scanned, and `StatusStrip.tsx` stays pinned at 7 (untouched).

## Advisory-lock holder topology

**N/A** — no `pg_advisory*` code path touched. Pure client-component + test change.

## File structure

| File | Responsibility | Change |
| --- | --- | --- |
| `components/admin/PublishedToggle.tsx` | The publish switch + inline/card variants | Split `POPOVER_POSITION` (error-only); add `FINALIZE_CHIP`; render finalize as in-flow chip |
| `tests/components/admin/PublishedToggle.test.tsx` | Unit behavior of both variants | Strengthen S4; rewrite parity test; add `!published` finalize case |
| `tests/e2e/statusStripToggleLayout.spec.ts` | Real-browser 390px strip geometry | Rewrite (a)→CI-1+CI-1b, (c)→CI-2/CI-3; update header |
| `tests/e2e/_statusStripToggleHarness.tsx` | Renders real components for the e2e | Doc-comment only |
| `DEFERRED.md`, `BACKLOG.md` | Deferral ledger | Mark CASP2-4 item 1 / `BL-CASP2-STRIP-POLISH` RESOLVED |

---

## Task 1: Split `POPOVER_POSITION`; render finalize as an in-flow chip (unit-TDD)

**Files:**
- Modify: `components/admin/PublishedToggle.tsx:45-59` (constants), `:139-151` (finalize branch)
- Test: `tests/components/admin/PublishedToggle.test.tsx:218-228` (S4), `:270-324` (parity), add a new `!published` case

**Interfaces:**
- Consumes: existing `subline` (`PublishedToggle.tsx:86-92`), `popoverId`, `showFinalize`, `SwitchButton` with `describedBy`.
- Produces: `FINALIZE_CHIP: string` (module const); finalize element = a `<span id={popoverId} data-testid="published-toggle-popover" className={FINALIZE_CHIP}>` containing an `aria-hidden` compact label + an `sr-only` full-copy span. No `role`.

- [ ] **Step 1: Rewrite the parity test as a split-mechanism test.** Replace the whole `it("error and finalize popovers share the EXACT positioning class set…")` block (`tests/components/admin/PublishedToggle.test.tsx:270-324`) with:

```tsx
  it("error skin keeps the absolute banner; finalize skin is an in-flow chip (mechanism split)", async () => {
    const POSITION = [
      "absolute",
      "inset-x-0",
      "top-full",
      "z-40",
      "mt-1",
      "break-words",
      "rounded-sm",
      "p-2",
      "text-sm",
      "shadow-tile",
    ]; // === POPOVER_POSITION tokens (error banner only, post-split)
    const ERROR_SKIN = new Set(["border", "border-border-strong", "bg-warning-bg", "text-warning-text"]);
    // Finalize chip must carry NONE of the absolute-geometry tokens (in-flow).
    const ABSOLUTE_GEOMETRY = new Set(["absolute", "inset-x-0", "top-full", "z-40", "mt-1"]);
    const FINALIZE_SKIN = ["bg-surface-sunken", "border-border-strong", "text-xs", "text-text-subtle"];
    // Fixed FORBIDDEN: prefix-match width caps so a real `max-w-60` / `min-w-40` / `w-24` trips it
    // (the old `/…|max-w-|min-w-|…$/` anchored `$` right after the prefix and never matched a capped value).
    const FORBIDDEN = /^(left-0|right-0|left-\d|right-\d|w-max|w-\d+|max-w-\S+|min-w-\S+|translate-x-)/;

    // Finalize chip
    const { unmount } = renderInline({ published: true, finalizeOwned: true });
    const chip = popover()!;
    const chipTokens = chip.className.split(/\s+/).filter(Boolean);
    for (const t of ABSOLUTE_GEOMETRY) {
      expect(chipTokens, `finalize chip must be in-flow, not carry ${t}`).not.toContain(t);
    }
    for (const t of FINALIZE_SKIN) {
      expect(chipTokens, `finalize chip missing skin token ${t}`).toContain(t);
    }
    expect(chip.hasAttribute("role"), "finalize chip is role-less (calm)").toBe(false);
    // Transition-audit: the finalize chip is INSTANT (spec §6) — no animation utility on it.
    expect(
      chipTokens.some((t) => t.startsWith("animate-")),
      "finalize chip must not animate",
    ).toBe(false);
    unmount();

    // Error banner
    const setPublished = vi.fn(async () => ({ ok: false as const, code: "PUBLISH_BLOCKED_PENDING_REVIEW" }));
    renderInline({ published: false, setPublished });
    await act(async () => {
      fireEvent.click(screen.getByTestId("published-toggle"));
    });
    const errorTokens = popover()!.className.split(/\s+/).filter(Boolean);
    for (const t of POSITION) {
      expect(errorTokens, `error banner missing ${t}`).toContain(t);
    }
    const errorExtra = errorTokens.filter((t) => !POSITION.includes(t));
    expect(new Set(errorExtra)).toEqual(ERROR_SKIN);
    for (const t of errorTokens) {
      expect(t, `forbidden geometry class ${t} on error banner`).not.toMatch(FORBIDDEN);
    }
  });
```

- [ ] **Step 2: Strengthen S4 + add the `!published` finalize case.** Replace the S4 block (`:218-228`) with two `it`s:

```tsx
  it("S4a finalize (published): in-flow chip, role-less, aria-describedby wired, visible 'Finalizing…' + full sr-only copy", () => {
    renderInline({ published: true, finalizeOwned: true });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.hasAttribute("disabled")).toBe(true);
    const chip = popover()!;
    expect(chip).not.toBeNull();
    expect(chip.hasAttribute("role")).toBe(false); // role-less, calm (NOT status/note/alert)
    const cls = chip.className.split(/\s+/);
    expect(cls).not.toContain("absolute"); // in-flow
    expect(cls).toContain("bg-surface-sunken");
    expect(chip.textContent).toContain("Finalizing…"); // compact visible label
    expect(chip.textContent).toContain("Changes are being finalized"); // full copy (sr-only span)
    expect(sw.getAttribute("aria-describedby")).toBe(chip.getAttribute("id"));
    expect(chip.getAttribute("id")).toBe("published-toggle-popover-s1");
  });

  it("S4b finalize (not published): visible 'Publishing…' + 'A publish is finishing' sr-only, role-less, aria-describedby wired", () => {
    renderInline({ published: false, finalizeOwned: true });
    const sw = screen.getByTestId("published-toggle");
    expect(sw.hasAttribute("disabled")).toBe(true);
    const chip = popover()!;
    expect(chip.hasAttribute("role")).toBe(false);
    expect(chip.textContent).toContain("Publishing…");
    expect(chip.textContent).toContain("A publish is finishing");
    expect(sw.getAttribute("aria-describedby")).toBe(chip.getAttribute("id"));
  });
```

- [ ] **Step 3: Run the unit tests — verify they FAIL.**

Run: `cd /Users/ericweiss/fxav-worktrees/casp2-finalize-inflow && pnpm vitest run tests/components/admin/PublishedToggle.test.tsx`
Expected: FAIL — S4a `role` absence already holds, but `Finalizing…` label + `bg-surface-sunken` in-flow chip don't exist yet (current finalize element carries `absolute`); parity test fails (chip still has `absolute`).

- [ ] **Step 4: Implement — split the constant + render the chip.** In `components/admin/PublishedToggle.tsx`:

Retro-scope the `POPOVER_POSITION` comment to error-only and add `FINALIZE_CHIP` right after it (replace the comment+const at `:47-59`):

```tsx
// Inline ERROR popover positioning — the error/generic-retry skin is an absolutely-positioned
// FULL-STRIP-WIDTH banner (CASP2-2, BL-CASP2-POPOVER-PROXIMITY). The inline container is
// intentionally NOT `relative`, so the popover's containing block is the sticky StatusStrip
// (`sticky` is a positioned element); `inset-x-0`/`top-full` render it as a banner spanning the
// strip's padding box just below it. break-words caps long ErrorExplainer/HelpAffordance tokens so
// the copy grows only vertically, never overflowing at 390px (§4.4 / §8.10d). This is ERROR-ONLY:
// the finalize skin split off to the in-flow FINALIZE_CHIP below (CASP2-4 item 1, BL-CASP2-STRIP-
// POLISH) so it never overlays rail content during the longer-lived finalize window.
const POPOVER_POSITION =
  "absolute inset-x-0 top-full z-40 mt-1 break-words rounded-sm p-2 text-sm shadow-tile";

// Inline FINALIZE hint — an IN-FLOW compact chip (flex sibling of the switch inside the
// `inline-flex items-center gap-2` container), NOT an absolute overlay. `finalizeOwned` is a
// longer-lived server state, so an absolute banner would float over the rail content below the
// sticky strip for the whole window; an in-flow chip stays inside the strip's flow. Calm sunken
// plate + strong border (reads as strip-chrome-adjacent signal, distinct from the strip's own
// bg-surface). whitespace-nowrap + shrink-0 keep it on one line.
const FINALIZE_CHIP =
  "inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border border-border-strong bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-subtle";
```

Replace the finalize branch (`:139-151`) with:

```tsx
        ) : showFinalize ? (
          <span id={popoverId} data-testid="published-toggle-popover" className={FINALIZE_CHIP}>
            {/* Compact visible label (mode-dependent); the full explanation is the sr-only copy so
                the aria-describedby announcement + the S4 substring assertion get the whole sentence
                without a long visible strip chip. */}
            <span aria-hidden="true">{published ? "Finalizing…" : "Publishing…"}</span>
            <span className="sr-only">{subline}</span>
          </span>
        ) : null}
```

- [ ] **Step 5: Run the unit tests — verify they PASS.**

Run: `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx`
Expected: PASS (all inline S1/S2/S3/S4a/S4b/S5 + parity + card tests green).

- [ ] **Step 6: Commit.**

```bash
git add components/admin/PublishedToggle.tsx tests/components/admin/PublishedToggle.test.tsx
git commit --no-verify -m "feat(admin): finalize hint as in-flow chip, split from error banner (CASP2-4 item 1)"
```

---

## Task 2: Rewrite the e2e geometry for the in-flow chip (real-browser TDD)

**Files:**
- Modify: `tests/e2e/statusStripToggleLayout.spec.ts:1-32` (header), `:151-157` (a), `:168-216` (c)
- Doc-only: `tests/e2e/_statusStripToggleHarness.tsx:11-22` (comment)

**Interfaces:**
- Consumes: harness states `idleShort`, `finalizeShort` (real `StatusStrip`/`PublishedToggle` render — auto-updated by Task 1); testids `show-status-strip`, `published-toggle-popover` (the chip), `published-toggle` (the switch).
- Produces: no new exports; the (b)/(d)/(e) sub-tests are unchanged.

- [ ] **Step 1: Rewrite sub-test (a) → CI-1 containment + CI-1b bound.** Replace the `test("(a) …")` block (`:151-157`) with:

```tsx
  test("(a) the in-flow finalize chip is contained in the strip (no overlay) and does not grow the strip at ≥sm", async ({
    page,
  }) => {
    // CI-1 (390px): the chip's box is fully WITHIN the strip's box — proves in-flow, no overhang
    // over the rail content below the sticky strip (the pre-change absolute banner had bottom > strip.bottom).
    await page.setViewportSize(MOBILE);
    await page.goto(`${baseUrl}finalizeShort.html`);
    const stripBox = await page.getByTestId("show-status-strip").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    const chipBox = await page.getByTestId("published-toggle-popover").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
    expect(chipBox.top, "chip top within strip").toBeGreaterThanOrEqual(stripBox.top - 0.5);
    expect(chipBox.bottom, "chip bottom within strip (no overhang)").toBeLessThanOrEqual(
      stripBox.bottom + 0.5,
    );

    // CI-1b (≥sm, 800px): the chip fits the switch's row, so the strip height is unchanged vs idle
    // (baseline derived from the idle render, never hardcoded) — bounds finalize-state strip growth.
    const DESKTOP = { width: 800, height: 900 };
    await page.setViewportSize(DESKTOP);
    await page.goto(`${baseUrl}idleShort.html`);
    const idleH = await page
      .getByTestId("show-status-strip")
      .evaluate((n) => n.getBoundingClientRect().height);
    await page.goto(`${baseUrl}finalizeShort.html`);
    const finalizeH = await page
      .getByTestId("show-status-strip")
      .evaluate((n) => n.getBoundingClientRect().height);
    expect(Math.abs(idleH - finalizeH), "chip does not grow the strip at ≥sm").toBeLessThanOrEqual(0.5);
  });
```

- [ ] **Step 2: Rewrite sub-test (c) → CI-2/CI-3 compact geometry.** Replace the `test("(c) …")` block (`:168-216`) with:

```tsx
  test("(c) the finalize chip is a compact in-viewport pill right of the switch (not a full-strip banner)", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE);
    await page.goto(`${baseUrl}finalizeShort.html`);
    const chip = await page.getByTestId("published-toggle-popover").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    });
    const sw = await page.getByTestId("published-toggle").evaluate((n) => {
      const r = n.getBoundingClientRect();
      return { right: r.right };
    });
    // CI-2: in-viewport, no page h-scroll.
    expect(chip.left, "chip left in viewport").toBeGreaterThanOrEqual(0);
    expect(chip.right, "chip right in viewport").toBeLessThanOrEqual(390);
    expect(await noHorizontalOverflow(page), "no document h-scroll").toBe(true);
    // CI-3: sits after the switch in flow, and is a compact pill (NOT the >300px full-strip banner
    // the old finalize skin was).
    expect(chip.left, "chip sits right of the switch").toBeGreaterThanOrEqual(sw.right - 0.5);
    expect(chip.width, "chip is a compact pill, not a full-strip banner").toBeLessThan(200);
  });
```

- [ ] **Step 3: Update the file header invariant block** (`:15-29`) so (a)/(c) describe the in-flow chip. Replace the `(a)` and `(c)` bullet text:

```tsx
 *   (a) in-flow containment: the finalize chip's box is fully within the strip's box at 390px
 *       (no overhang → never overlays the rail content below the sticky strip), AND at ≥sm the
 *       chip fits the switch row so the strip height equals the idle height (bounds growth).
 *   (b) compaction: inline idle strip height < card-variant strip height by > 20px (unchanged).
 *   (c) compact chip: the finalize chip is an in-viewport pill (left ≥ 0, right ≤ 390, no h-scroll)
 *       sitting right of the switch, width < 200px (NOT a full-strip banner). The overlay residual
 *       (BL-CASP2-STRIP-POLISH) is gone: an in-flow chip cannot float over content.
```

- [ ] **Step 4: Update the harness doc comment** (`tests/e2e/_statusStripToggleHarness.tsx:14-15`), replacing the "finalize popover" description:

```tsx
 *   finalize  — StatusStrip inline S4 (finalizeOwned): the real in-flow finalize CHIP renders
 *               from the prop (compact pill beside the switch, no overlay; no test-only forced path).
```

- [ ] **Step 5: Run the e2e spec — verify it PASSES (real browser).**

Run: `pnpm playwright test --config tests/e2e/standalone.config.ts statusStripToggleLayout`
Expected: PASS — all of (a)/(b)/(c)/(d)/(e) green. If Playwright browsers are missing, run `pnpm playwright install chromium` first.

- [ ] **Step 6: Commit.**

```bash
git add tests/e2e/statusStripToggleLayout.spec.ts tests/e2e/_statusStripToggleHarness.tsx
git commit --no-verify -m "test(infra): rewrite statusStrip e2e for in-flow finalize chip (CI-1/1b/2/3)"
```

---

## Task 3: Impeccable dual-gate (invariant 8) + fix/defer findings

**Files:** `components/admin/PublishedToggle.tsx` diff (the UI surface); `DEFERRED.md` only if a P0/P1 is deferred.

- [ ] **Step 1: Run impeccable critique on the diff.** Canonical v3 setup (context.mjs → register reference read), then `/impeccable critique` scoped to the `PublishedToggle.tsx` finalize-chip diff.
- [ ] **Step 2: Run impeccable audit on the diff.** `/impeccable audit` on the same surface.
- [ ] **Step 3: Triage findings.** Fix every P0/P1 inline (re-run the Task 1 unit tests after any code change). Anything genuinely deferred gets a `DEFERRED.md` row with rationale. Record findings + dispositions for the close-out handoff §12.
- [ ] **Step 4: Commit any fixes.**

```bash
git add -A
git commit --no-verify -m "fix(admin): address impeccable findings on finalize chip"
```

(Skip the commit if critique + audit are clean with no code change.)

---

## Task 4: Reconcile the deferral ledger

**Files:** `DEFERRED.md` (CASP2-4 item 1 block), `BACKLOG.md` (`BL-CASP2-STRIP-POLISH` block)

- [ ] **Step 1: Mark CASP2-4 item 1 RESOLVED in `DEFERRED.md`.** Edit the CASP2-4 block (the "Item 1 (finalize popover persistent overlay) — STILL DEFERRED" text) to RESOLVED, dated 2026-07-17, branch `feat/casp2-finalize-inflow`, noting the mechanism split (error banner stays absolute; finalize is an in-flow chip) and the CI-1/1b/2/3 pins.
- [ ] **Step 2: Mark `BL-CASP2-STRIP-POLISH` RESOLVED in `BACKLOG.md`** (twin-row reconcile — DEFERRED↔BACKLOG land together, per the KINDDOT-1 lesson).
- [ ] **Step 3: `pnpm format:check`** (the ledger files are prettier-formatted; fix with `pnpm format` if needed — but NEVER prettier the master spec).
- [ ] **Step 4: Commit.**

```bash
git add DEFERRED.md BACKLOG.md
git commit --no-verify -m "docs: mark CASP2-4 item 1 / BL-CASP2-STRIP-POLISH resolved"
```

---

## Pre-push verification (before close-out)

- [ ] `pnpm typecheck` — green (vitest strips types; catches nothing else does).
- [ ] `pnpm lint` — green (canonical-Tailwind ESLint errors are not caught by prettier).
- [ ] `pnpm format:check` — green (`--no-verify` bypassed the prettier hook).
- [ ] `pnpm vitest run tests/components/admin/PublishedToggle.test.tsx` — green.
- [ ] `pnpm playwright test --config tests/e2e/standalone.config.ts statusStripToggleLayout` — green.
- [ ] `pnpm vitest run tests/components/admin/showpage/pageTransitions.test.tsx` — green (confirms StatusStrip count-pin still 7, untouched).
- [ ] Full `pnpm test` — green (scoped gates miss cross-file regressions; run the whole suite before push).
- [ ] Grep for any other reference to the removed absolute-finalize behavior: `grep -rn "published-toggle-popover" tests/` — confirm no test still asserts the finalize element is absolute/full-width.
