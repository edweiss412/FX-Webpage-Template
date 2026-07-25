# Plan — DQ eyebrow divider breakpoint + short-label confirm bar

**Spec:** `docs/superpowers/specs/2026-07-24-dq-eyebrow-divider-and-confirm-bar-design.md` (canonical; section refs below are to it)
**Branch:** `fix/phantom-gap-hairline-crowded-row`
**Implementer:** Opus / Claude Code (UI diff — AGENTS.md "UI work is always Opus")

Every task is TDD: write the failing assertion, watch it fail for the stated reason, implement the minimum, watch it pass, commit.

---

## Pre-draft code verification (run 2026-07-24, before drafting)

| Claim | Command | Result |
| --- | --- | --- |
| Rule element line | `grep -n 'aria-hidden="true"' components/admin/BulkIgnoreControls.tsx` | `179` |
| Eyebrow row line | `grep -n 'flex items-center gap-2' components/admin/BulkIgnoreControls.tsx` | `170` |
| `aria-label` line | `grep -n 'aria-label={group.label' components/admin/BulkIgnoreControls.tsx` | `188` |
| chipText ternary | `grep -n 'const chipText' components/admin/BulkIgnoreControls.tsx` | `154` |
| Bulk eligibility threshold | `grep -n 'contents.size >= 2' lib/dataQuality/bulkIgnoreGroups.ts` | `37` |
| Catalog title | `grep -n 'Phone or email' lib/messages/catalog.ts` | `1767` |
| Standalone allow-list already carries the eyebrow spec | `grep -n 'bulk-ignore-eyebrow' tests/e2e/standalone.config.ts` | `36` |
| Destructive-confirm registry row | `grep -n 'BulkIgnoreControls' tests/styles/_metaDestructiveConfirm.test.ts` | `60` (row spans `59-64`) |
| Ledger row | `grep -n 'KNOWN_PHANTOM_ITEMS' tests/e2e/published-review-modal.layout.spec.ts` | `1525`, filter at `1765` |
| Copy pins to retarget | `grep -rn --include='*.tsx' --include='*.ts' 'Ignore all\|Confirm ignore all' tests/` | `tests/components/admin/bulkIgnoreControls.test.tsx` (11 hits), `tests/components/admin/showpage/crewWarningAttachment.test.tsx:197` + `tests/components/admin/showpage/crewWarningAttachment.test.tsx:212`, `tests/components/admin/showpage/sectionWarningControls.test.tsx:330`, `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx:23` (comment), `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:8` (comment) |

## Meta-test inventory

| Meta-test | This plan |
| --- | --- |
| `tests/styles/_metaDestructiveConfirm.test.ts` | **Extends nothing; must keep passing.** The armed skin stays ONE class literal containing `bg-warning-text` + `text-warning-bg` + `font-semibold` + `hover:opacity-90` and no other `bg-*` token, so it remains hit index 0 of `components/admin/BulkIgnoreControls.tsx`. Splitting it into two literals adds an unregistered occurrence and fails the suite. |
| `tests/e2e/published-review-modal.layout.spec.ts` T-NOPHANTOM | **Ledger row deleted** (Task 5). Its stale-row assertion is what proves the instance is gone. |
| `tests/log/_metaMutationSurfaceObservability.test.ts` (invariant 10) | N/A — no mutation surface added, moved, or renamed; the chip's POST call site is untouched. |
| `tests/auth/_metaInfraContract.test.ts` (invariant 9) | N/A — no Supabase client call added. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (invariant 2) | N/A — no `pg_advisory*` path touched. |
| `tests/cross-cutting/codes.test.ts` x1 catalog parity | N/A — no §12.4 row added or edited. |
| Tailwind/token scanners under `tests/styles/**` | Full `tests/styles` run is part of Task 8's gate (a scoped run misses registry suites). |

## Advisory-lock topology

N/A — this plan touches no `pg_advisory*` surface.

## e2e harness readiness (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts`)

- **Boot mechanism:** none. The spec builds its own artifacts in `beforeAll` — esbuild-bundled `_bulkIgnoreEyebrowLiveEntry.tsx` + Tailwind CLI over `app/globals.css` — and serves them from a `node:http` server on an ephemeral port (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:49-110`). No dev server, no Supabase, no `.env`.
- **Readiness gate:** `await page.waitForSelector(CHIP)` after `page.goto` (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:122`) — the chip only exists once `createRoot(...).render` has committed, so this is a hydration gate, not `networkidle`.
- **Armed gate:** `page.waitForFunction` on the chip's `textContent` (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:125-128`). It currently waits for `startsWith("Confirm")`; Task 4 retargets it to the new string. **Failing to retarget it hangs the spec for 30 s and then fails on timeout, not on the assertion** — retarget it in the same commit as the copy change.
- **Detach safety:** every measurement is a single `page.evaluate` reading `getBoundingClientRect()` off nodes queried inside that same evaluate (`tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:130-147`). Nothing samples across a re-render, so no auto-wait can hang on an unmounted node. New assertions follow the same shape.
- **Viewports:** the existing tests set 390×844. New assertions set 375×812, 480×900, and 1280×900 explicitly per test.

---

## Task 1 — chip copy + accessible name

**Files:** `tests/components/admin/bulkIgnoreControls.test.tsx`, `components/admin/BulkIgnoreControls.tsx`

**Failure mode caught:** the count silently surviving in (or vanishing from) the accessible name; a stale `aria-label` after the armed morph, which breaks WCAG 2.5.3 Label-in-Name; the null-label branch dropping the count.

**Red first.** Retarget the three existing copy pins and add the null-label count assertion:

```tsx
test("chip accessible name TRACKS the visible text + appends the type (WCAG 2.5.3 across the morph)", () => {
  render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
  const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
  expect(chip.textContent).toBe("Ignore");
  expect(chip.getAttribute("aria-label")).toBe("Ignore 2 · Unrecognized row in sheet");
  fireEvent.click(chip); // arm
  expect(chip.textContent).toBe("Are you sure?");
  expect(chip.getAttribute("aria-label")).toBe(
    "Are you sure? Ignore 2 · Unrecognized row in sheet",
  );
});
```

The null-label test (currently "a group with no label omits aria-label", `tests/components/admin/bulkIgnoreControls.test.tsx:158-186`) inverts: the name is now present and carries the count.

```tsx
const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
expect(chip.getAttribute("aria-label")).toBe("Ignore 2");
expect(chip.textContent).toBe("Ignore");
fireEvent.click(chip);
expect(chip.getAttribute("aria-label")).toBe("Are you sure? Ignore 2");
expect(screen.queryByTestId("dq-group-label-UNKNOWN_FIELD")).toBeNull();
```

**Anti-tautology note:** the count in each expectation is written as the literal `2` while the fixture derives it from `bulkGroup().bulk.items.length` (2 distinct snippets, `tests/components/admin/bulkIgnoreControls.test.tsx:24-36`). A test that interpolated `${g.bulk!.items.length}` on both sides could not catch a count read from the wrong source (e.g. `itemCount`, which is also 2 in this fixture). To keep that distinguishable, add ONE assertion on a fixture where `itemCount !== items.length`:

```tsx
test("chip count comes from bulk.items, not itemCount", () => {
  const g = bulkGroup();
  render(<BulkIgnoreControls slug="rpas" groups={[{ ...g, itemCount: 7 }]} />);
  expect(
    screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD").getAttribute("aria-label"),
  ).toBe("Ignore 2 · Unrecognized row in sheet");
});
```

**Green.** In `components/admin/BulkIgnoreControls.tsx`:

```tsx
const count = bulk?.items.length ?? 0;
const chipText = running ? "Ignoring…" : armed ? "Are you sure?" : "Ignore";
// The accessible name carries the count the visible label drops, plus the type
// context, and TRACKS chipText so Label-in-Name (2.5.3) holds in every state.
const chipName = running ? "Ignoring…" : armed ? `Are you sure? Ignore ${count}` : `Ignore ${count}`;
```

and `aria-label={group.label ? `${chipName} · ${group.label}` : chipName}`.

**Commit:** `feat(admin): shorten the bulk-ignore chip to "Ignore" / "Are you sure?"`

---

## Task 2 — armed chip becomes a full-width bar below 480 px

**Files:** `tests/components/admin/bulkIgnoreControls.test.tsx`, `components/admin/BulkIgnoreControls.tsx`

**Failure mode caught:** shipping `w-full` without its `min-[480px]:w-auto` counterpart (a 1240 px confirm bar on desktop — explicitly rejected in §1.1), or applying `flex-wrap` unconditionally (which pushes the idle chip to its own line, +18 px per group at rest — also rejected). jsdom computes no layout, so these are asserted as class-set membership; the geometric consequence is asserted in Task 3.

**Red first:**

```tsx
test("armed chip is full-width below 480px and inline at/above it; idle is neither", () => {
  render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
  const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
  const row = chip.parentElement!;
  const idle = new Set(chip.className.split(/\s+/));
  expect(idle.has("w-full")).toBe(false);
  expect(new Set(row.className.split(/\s+/)).has("flex-wrap")).toBe(false);
  fireEvent.click(chip); // arm
  const armed = new Set(chip.className.split(/\s+/));
  expect(armed.has("w-full")).toBe(true);
  expect(armed.has("min-[480px]:w-auto")).toBe(true);
  expect(armed.has("justify-center")).toBe(true);
  expect(armed.has("min-[480px]:justify-start")).toBe(true);
  expect(new Set(row.className.split(/\s+/)).has("flex-wrap")).toBe(true);
});
```

`chip.parentElement` is the eyebrow row: the chip and its `role="status"` sibling are wrapped in a fragment, not an element (`components/admin/BulkIgnoreControls.tsx:181-198`), so the button's parent IS the row div. Assert that first so the test fails loudly if the tree changes:

```tsx
expect(row.getAttribute("class")).toContain("items-center");
```

**Focus preservation (§3.4):**

```tsx
test("arming does not move focus off the chip", () => {
  render(<BulkIgnoreControls slug="rpas" groups={[bulkGroup()]} />);
  const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD") as HTMLButtonElement;
  chip.focus();
  fireEvent.click(chip);
  expect(document.activeElement).toBe(chip);
  expect(chip.textContent).toBe("Are you sure?");
});
```

*Catches:* a future refactor that renders the confirm as a different element in a different parent — React would unmount the focused node and focus would fall to `<body>`.

**Green.** Keep the armed skin a SINGLE class literal (registry constraint, §6). Rewrite the two constants so the responsive tokens live in `ARMED_BTN`:

```tsx
const ARMED_BTN =
  "inline-flex min-h-tap-min w-full max-w-full items-center justify-center self-start whitespace-normal rounded-sm border border-transparent bg-warning-text px-3 py-1 text-left text-sm font-semibold text-warning-bg transition-opacity duration-fast hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg min-[480px]:w-auto min-[480px]:justify-start";
```

Row: `className={`flex items-center gap-2 ${armed || running ? "flex-wrap" : ""}`}`.

Branch selector becomes `armed || running ? ARMED_BTN : BTN` — the running state shares the armed treatment so the bar does not jump back inline mid-request (§3.7 "armed → running: no reflow").

**Verify the registry did not shift:** `pnpm vitest run tests/styles/_metaDestructiveConfirm.test.ts`.

**Commit:** `feat(admin): drop the armed bulk-ignore chip to a full-width bar below 480px`

---

## Task 3 — divider breakpoint + floor, with real-browser geometry (layout-dimensions task)

**Files:** `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts`, `components/admin/BulkIgnoreControls.tsx`

This is the mandatory layout-dimensions task. jsdom is not sufficient; every assertion below runs in Chromium against the esbuild-bundled real component under real compiled Tailwind.

**Dimensional invariants under test (spec §3.6), verbatim:**

| # | Invariant | Guaranteed by | Width |
| --- | --- | --- | --- |
| DI-1 | Below 480 px, no in-flow child of the eyebrow row has zero extent on the row's gap axis | `hidden` on the rule | 375 |
| DI-2 | At ≥480 px, the rule's width is ≥24 px | `min-w-6` | 480, 1280 |
| DI-3 | Below 480 px, the armed chip's width equals the row's content width (±0.5 px) and its box is disjoint from the label's | `w-full` + `flex-wrap` | 375 |
| DI-4 | At ≥480 px, the armed row occupies one line: chip width < row width | `min-[480px]:w-auto` | 480 |
| DI-5 | Idle row height is unchanged by this spec at every width | idle row has no `flex-wrap` | 375, 1280 |

**Red first.** DI-1 as a generic zero-extent walk (not "the rule is hidden") so it also catches a *different* element collapsing later:

```ts
for (const state of ["idle", "armed"] as const) {
  test(`375px ${state}: no zero-extent in-flow child charges the row's gap`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(baseUrl);
    await page.waitForSelector(CHIP);
    if (state === "armed") {
      await page.click(CHIP);
      await page.waitForFunction(
        (sel) => document.querySelector(sel)!.textContent!.startsWith("Are you sure?"),
        CHIP,
      );
    }
    const offenders = await page.evaluate((chipSel) => {
      const row = document.querySelector(chipSel)!.parentElement!;
      const gap = parseFloat(getComputedStyle(row).columnGap || "0");
      if (!(gap > 0)) return ["row charges no column-gap: assertion would be vacuous"];
      return [...row.children]
        .filter((c) => getComputedStyle(c).display !== "none" && getComputedStyle(c).position !== "absolute")
        .filter((c) => c.getBoundingClientRect().width < 0.5)
        .map((c) => c.outerHTML.slice(0, 80));
    }, CHIP);
    expect(offenders).toEqual([]);
  });
}
```

The `gap > 0` guard is the anti-tautology clamp: if a future change drops `gap-2`, the test must fail loudly rather than pass vacuously. Note the `sr-only` `role="status"` span is `position: absolute` under this project's `sr-only` (`app/globals.css`), so it is excluded as out-of-flow — verify that with `getComputedStyle` in the same evaluate rather than assuming it.

DI-2 / DI-4 / DI-3 / DI-5 follow the same shape; each asserts against measured geometry, and DI-5's baseline is captured from the idle row in the SAME run (`await rowHeight(page)` before any click) rather than hardcoded.

**Green.** In `components/admin/BulkIgnoreControls.tsx`, the rule becomes:

```tsx
{/* Decorative eyebrow rule. Hidden below 480px: in a crowded row `flex-1`
    resolves to 0 width there and the row would still charge gap-2 on BOTH
    sides of an invisible element (spec §1). `min-w-6` keeps the drawn state
    unreachable-by-zero at every width where it IS shown. */}
<span aria-hidden="true" className="hidden h-px min-w-6 flex-1 bg-border min-[480px]:block" />
```

**Run:** `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/bulk-ignore-eyebrow.layout.spec.ts`

**Commit:** `fix(admin): hide the DQ eyebrow rule below 480px, floor it above`

---

## Task 4 — retarget the remaining string pins

**Files:** `tests/components/admin/showpage/crewWarningAttachment.test.tsx:197` + `tests/components/admin/showpage/crewWarningAttachment.test.tsx:212`, `tests/components/admin/showpage/sectionWarningControls.test.tsx:330`, `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:8` + `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:125-128`, `tests/e2e/_bulkIgnoreEyebrowLiveEntry.tsx:23`

Class sweep, not per-instance: `rg -n 'Ignore all|Confirm ignore all' tests/ components/ app/ docs/superpowers/plans/2026-07-24*` and reconcile every hit. Test-body hits are retargeted; historical plan/DEFERRED-archive prose is left alone (it records what shipped then).

The `waitForFunction` at `tests/e2e/bulk-ignore-eyebrow.layout.spec.ts:125-128` is the one that fails as a 30 s timeout rather than an assertion — retarget it here if Task 3 has not already.

**Commit:** `test(admin): retarget bulk-ignore chip copy pins across the suite`

---

## Task 5 — delete the phantom-gap ledger row

**File:** `tests/e2e/published-review-modal.layout.spec.ts:1534-1542`

Delete the two-page `KNOWN_PHANTOM_ITEMS` rows. No new assertion is needed: the existing stale-row check (`tests/e2e/published-review-modal.layout.spec.ts:1783-1787`) fails if the row is kept past its debt, and the offender check (`tests/e2e/published-review-modal.layout.spec.ts:1788-1791`) fails if the instance survives. Together they prove the fix at 375 px on both crew-warning pages.

**Run:** `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/published-review-modal.layout.spec.ts -g T-NOPHANTOM`

**Commit:** `test(admin): drop the phantom-gap ledger row — the instance is fixed`

---

## Task 6 — documentation

- `BACKLOG.md`: delete `BL-PHANTOM-GAP-HAIRLINE-CROWDED-ROW` (repo-root `BACKLOG.md` lines 7-17). `BL-PHANTOM-GAP-PROBE-OTHER-SURFACES` (same file, line 19) stays.
- `DESIGN.md` §7a: one paragraph adding the zero-**width** sibling to the phantom-gap idiom — `empty:hidden` covers a childless flex item; a decorative `flex-1` rule in a crowded row needs a breakpoint plus a `min-w-*` floor. Cite this spec.
- `components/admin/BulkIgnoreControls.tsx:47-59`: the header comment still describes "label + hairline rule" and an `"Ignore all N"` chip. Update both claims.

**Commit:** `docs(admin): record the zero-width phantom-gap idiom; close the backlog item`

---

## Task 7 — UI quality gate (invariant 8)

`/impeccable critique` AND `/impeccable audit` on the diff, with the canonical v3 setup gates (the skill's context load of PRODUCT.md + DESIGN.md, then the register reference read). P0/P1 findings are fixed or explicitly deferred with a `DEFERRED.md` entry. Findings + dispositions are recorded in the PR body (this change has no milestone handoff doc).

Pre-code mechanical checklist, run BEFORE Task 1 and re-verified here: no em dashes in user-visible copy; apostrophe literals (`Are you sure?` has none; `Ignoring…` uses the ellipsis character already in the file); tap target ≥44 px (`min-h-tap-min` retained on both branches); canonical type/token classes only (`text-sm`, `text-xs`, `text-text-subtle`, `bg-border`); no new color token, so no new contrast pin is required.

---

## Task 8 — pre-push gates, review, CI, merge

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm format:check`
4. `pnpm test` (full suite — a scoped run misses `tests/styles` and `tests/help` registry suites)
5. Both standalone Playwright specs from Tasks 3 and 5
6. Whole-diff Codex adversarial review to APPROVE (fresh-eyes posture, REVIEWER ONLY, do-not-relitigate block from spec §1.1)
7. Push, open PR, **real CI green** (not just local)
8. `gh pr merge --merge`, then fast-forward local `main` until `git rev-list --left-right --count main...origin/main` reports `0	0`
