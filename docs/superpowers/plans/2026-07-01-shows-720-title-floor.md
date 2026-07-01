# Shows-table 720→768 breakpoint — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Resolve BL-SHOWSTABLE-720-TITLE-FLOOR by raising the admin shows-table's stacked→columnar breakpoint from `min-[720px]` to `min-[768px]`, so the 5-column grid (title track ~106px at 720) only activates where the columns fit. Remove the #209 `≥810` band-sweep exception.

**Architecture:** Pure Tailwind-breakpoint change in `components/admin/ShowsTable.tsx` (9 `min-[720px]:` utilities → `min-[768px]:`; the `min-[960px]` Status column untouched) + a stacked-aware update to the real-browser band-sweep. UI-only.

**Spec:** `docs/superpowers/specs/2026-07-01-shows-720-title-floor-design.md` (Codex-APPROVED, 2 rounds).

## Global Constraints

- TDD per task; commit per task (`<type>(admin): <summary>`), one task per commit, `--no-verify`.
- `min-[720px]` is the app-wide breakpoint; **only** ShowsTable's 9 grid/cell/sub-line utilities move to 768. Do NOT touch AdminNav / Dashboard / per-show / crew / ArchivedNav / loading skeletons / the admin layout's `min-[720px]:pb-page-pad-desktop`.
- The Status column's `min-[960px]` gate (and its tests) stay exactly as #209 shipped.
- Real-browser band-sweep is the binding layout arbiter (local gate, not PR CI).

## Meta-test inventory

Creates/extends NONE. Presentational breakpoint change; no Supabase boundary, §12.4 code, advisory lock, email, or admin-alert catalog. "None applies."

## File Structure

- **Modify** `components/admin/ShowsTable.tsx` — 9 `min-[720px]:`→`min-[768px]:` + the ROW_GRID comment.
- **Modify** `tests/components/admin/ShowsTable.test.tsx` — pin the new class strings + assert no `min-[720px]` survives.
- **Modify** `tests/e2e/admin-layout-dimensions.spec.ts` — stacked-aware floor check + `768` band + comment updates; remove the `≥810`/`≥90` exception.
- **Modify** `BACKLOG.md` — remove the resolved BL-SHOWSTABLE-720-TITLE-FLOOR entry.

---

### Task 1: Move the ShowsTable breakpoint 720→768 (component + jsdom class pins)

**Files:**
- Modify: `components/admin/ShowsTable.tsx` (ROW_GRID `:65` + comment `:58-64`; sub-line `:447`; cells `:461,465,470,485`)
- Test: `tests/components/admin/ShowsTable.test.tsx`

- [ ] **Step 1: Write the failing tests** — extend the existing `ROW_GRID` class-pin test region (near `tests/components/admin/ShowsTable.test.tsx:201`). Add:

```tsx
it("5-col grid + cells + mobile sub-line gate at min-[768px] (not 720); Status stays min-[960px] — §3", () => {
  const { container } = render(
    <ShowsTable rows={[row({ slug: "bp" })]} now={now} activeCount={1} overflowCount={0} />,
  );
  const header = screen.getByTestId("shows-table-header");
  // 5-col grid now activates at 768; 6-col Status grid still at 960
  expect(header.className).toContain("min-[768px]:grid");
  expect(header.className).toContain(
    "min-[768px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_1.25rem]",
  );
  expect(header.className).toContain(
    "min-[960px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_6rem_1.25rem]",
  );
  // the mobile sub-line hides at 768; a desktop cell shows at 768
  expect(screen.getByTestId("shows-meta-mobile-bp").className).toContain("min-[768px]:hidden");
  expect(screen.getByTestId("shows-sync-bp").className).toContain("min-[768px]:block");
  // COMPREHENSIVE partial-miss guard: NO min-[720px] survives anywhere in the rendered table
  expect(container.innerHTML).not.toContain("min-[720px]");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx -t "gate at min-\[768px\]"`
Expected: FAIL — the rendered classes still contain `min-[720px]` (and not `min-[768px]:grid`).

- [ ] **Step 3: Implement** — in `components/admin/ShowsTable.tsx`, replace **every** `min-[720px]` with `min-[768px]` (9 class utilities across the ROW_GRID string `:65`, the mobile sub-line `:447`, and the Dates/Crew/Sync/chevron cells `:461,465,470,485`). Leave every `min-[960px]` untouched. Update the ROW_GRID comment (`:58-64`) to say the 5-col grid activates at **768px** (was 720; 720 starved the `minmax(0,1fr)` title track to ~106px, below the 120px floor), with the 6-col Status grid still at 960.

Concretely the `ROW_GRID` const becomes:

```tsx
const ROW_GRID =
  "min-[768px]:grid min-[768px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_1.25rem] min-[960px]:grid-cols-[minmax(0,1fr)_10rem_5rem_12rem_6rem_1.25rem] min-[768px]:items-center min-[768px]:gap-4";
```

(A repo-wide sanity check after editing: `grep -c "min-\[720px\]" components/admin/ShowsTable.tsx` must be `0`.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: PASS (all existing ShowsTable tests + the new one). The `min-[960px]` Status tests are unaffected.

- [ ] **Step 5: Commit**

```bash
git add components/admin/ShowsTable.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "fix(admin): raise shows-table stacked→columnar breakpoint 720→768"
```

---

### Task 2: Band-sweep — stacked-aware floor + 768 activation band (LAYOUT-DIMENSIONS task, real browser)

Update the real-browser band-sweep to treat `<768` as stacked (not a floor violation), add the `768` activation band, and remove the #209 `≥810`/`≥90` exception. This is the binding layout gate.

**Files:**
- Modify: `tests/e2e/admin-layout-dimensions.spec.ts`

**Dimensional invariants under test (spec §5):** at every band `≥768` the `minmax(0,1fr)` title track ≥120px, no row overflow, no header Show/Dates overlap; at `<768` the row is stacked (`gridTemplateColumns === "none"`) with the mobile sub-line visible and the desktop chevron hidden.

- [ ] **Step 1: Edit the band-sweep**

(a) `TITLE_BANDS` (`:166`) — add `768`:
```ts
const TITLE_BANDS = [720, 768, 810, 960, 1024, 1080, 1100, 1152, 1240, 1280, 1400, 1520];
```

(b) Replace the `if (width >= 810) { ≥120 } else { ≥90 }` block (`:194-217`) with the stacked-aware check from spec §6.2:
```ts
if (titleTrack === -1) {
  // Grid off (< 768px): flex-col stacked, title is a full-width flex child (never starved).
  // Pin the intended STACKED presentation, not merely "not grid".
  const mobileMetaVisible = await firstRow.locator("[data-testid^='shows-meta-mobile-']").isVisible();
  const desktopChevronHidden = !(await firstRow.locator("[data-testid^='shows-chevron-']").isVisible());
  expect(mobileMetaVisible, `mobile sub-line visible (stacked) at ${width}px`).toBe(true);
  expect(desktopChevronHidden, `desktop chevron hidden (stacked) at ${width}px`).toBe(true);
} else {
  expect(titleTrack, `title grid track width at ${width}px`).toBeGreaterThanOrEqual(MIN_TITLE_PX);
}
```

(c) Update the stale comments: the sweep header (`:147-162`), `:188` ("grid is active at >= 720px, so all bands resolve to px tracks" → "grid is active at >= 768px; bands < 768 resolve `none` = stacked"), the `:191` inline "(< 720px)" → "(< 768px)", and `:218` ("Header grid is active at >= 720px" → "…>= 768px").

- [ ] **Step 2: Run the band-sweep (real browser)**

Setup (worktree lacks it): `cp /Users/ericweiss/FX-Webpage-Template/.env.local .`; seed LOCAL explicitly (never validation): `TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm db:seed`.
Run: `CREW_E2E_ONLY=1 pnpm exec playwright test --project=desktop-chromium tests/e2e/admin-layout-dimensions.spec.ts`
Expected: ALL bands PASS — `720` stacked (mobile meta visible, chevron hidden); `768` grid-on title ≈154 ≥120; `810`/`960`+ unchanged. **Failure mode caught:** the grid activating below 768 (title collapse) or failing to stack below 768.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-layout-dimensions.spec.ts
git commit --no-verify -m "test(admin): band-sweep stacked-aware + 768 activation band (drop 720 exception)"
```

---

### Task 3: Remove the resolved BACKLOG entry

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1:** Delete the `### BL-SHOWSTABLE-720-TITLE-FLOOR — …` entry (heading + its paragraph + surrounding `---` separators as appropriate) from `BACKLOG.md`. Verify with `grep -c "BL-SHOWSTABLE-720-TITLE-FLOOR" BACKLOG.md` → `0`.

- [ ] **Step 2: Commit**

```bash
git add BACKLOG.md
git commit --no-verify -m "docs(backlog): remove BL-SHOWSTABLE-720-TITLE-FLOOR (resolved by 720→768)"
```

---

### Task 4: Invariant-8 — impeccable v3 dual-gate

UI change (`components/admin/ShowsTable.tsx`). Run `/impeccable critique` AND `/impeccable audit` on the diff (external subagent). HIGH/CRITICAL fixed or `DEFERRED.md`. Expected clean (only a breakpoint value shifts — no new elements/tokens/copy; the change makes narrow-window titles readable).

- [ ] **Step 1:** critique → record findings. **Step 2:** audit → record findings. **Step 3:** fix HIGH/CRITICAL or defer. Commit any fixes.

---

### Task 5: Plan self-review + cross-model adversarial review of the plan

- [ ] Self-review against the spec (coverage, placeholders, type consistency). Then invoke `adversarial-review` (Codex) on the plan; iterate to APPROVE. Reviewer is REVIEWER-ONLY. Proceed only on APPROVE.

---

## Self-Review

- **Spec coverage:** §1 goal → T1+T2; §3 exact change → T1; §4 responsive → T1 (breakpoint) + T2 (verify); §5 dimensional invariant → T2; §6 band-sweep → T2; §7 guards → T2 stacked check; §8 BACKLOG → T3; §9 test plan → T1(jsdom)+T2(e2e); §10 impeccable → T4. No gap.
- **Placeholder scan:** none; the ROW_GRID literal + the band-sweep snippet are concrete.
- **Type/name consistency:** `min-[768px]` uniform; `shows-meta-mobile-`/`shows-chevron-`/`shows-sync-` testids match ShowsTable; `TITLE_BANDS`/`MIN_TITLE_PX`/`titleTrack` match the existing test.
