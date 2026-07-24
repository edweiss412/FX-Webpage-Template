# Archive Row Menu-Idiom Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the ShareHub "Archive show" idle row to the §4.1 borderless full-width menu-row idiom, per `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md` (spec is canonical; 19 adversarial rounds APPROVED).

**Architecture:** One client component's idle branch changes (`ArchiveShowButton` row variant); its host drops a 2px inset and gains `w-full`; the §7.0 shared row assertions pin the new render; a real-browser e2e pins width + scrollport; a new CI workflow un-darkens the e2e spec; a new meta-test closes the dark-spec class.

**Tech Stack:** Next.js 16 / React 19, Tailwind v4, Vitest + Testing Library (jsdom), Playwright (mobile-safari/WebKit), GitHub Actions.

## Global Constraints

- Worktree: `/Users/ericweiss/FX-worktrees/archive-row-menu-idiom` (never the main checkout). Commits use `--no-verify`.
- Armed-state markup/behavior unchanged EXCEPT the outer-wrapper `py-3` collapse (spec §1.1, ratified). No timer in the row variant.
- Idle row button literal class string (spec §2.1, = rotate's, = `ROW_TOKENS`): `flex min-h-tap-min w-full items-center gap-2 rounded-sm p-2 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring`
- Wrapper literal (`WRAPPER_CLASS_VALUE`, `tests/components/admin/showpage/_rowWrapperScan.ts:24`): `flex w-full flex-col gap-2` — MUST be a literal string on a plain div (AST-scanned).
- `asRow` gate tightens to `compact && rowLabel != null && rowLabel.trim() !== ""` (spec §2.1).
- Testids unchanged: `archive-show-button`, `archive-show-confirm-button`, `archive-show-cancel-button`, `archive-show-confirm-row`, `share-hub-show-section`.
- No DB, no advisory locks, no §12.4 codes, no new mutation surfaces (spec §7).
- Strict tsconfig: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` — every snippet below was written against it; keep non-null assertions where shown.
- Run all vitest via `pnpm exec vitest run <file>` from the worktree. e2e via `E2E_PORT=3005 TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm exec playwright test <file> --project=mobile-safari --no-deps`.
- If the admin surface bounces to the onboarding wizard mid-e2e, a sibling wiped `app_settings` — run `pnpm db:seed` (spec §10 operational note).

**Meta-test inventory (declared per AGENTS.md):** EXTENDS `tests/components/admin/showpage/_metaRowWrapperInert.test.ts` (Task 4). CREATES `tests/ci/_metaE2eWorkflowCoverage.test.ts` (Task 7). MOVES `ROW_TOKENS` into `_rowAssertions.ts` (Task 1). `_metaDestructiveConfirm` registry untouched (no `bg-warning-text`+`text-warning-bg` literal added/removed). No advisory-lock surface (no `pg_advisory*` in diff).

---

### Task 1: Export ROW_TOKENS from _rowAssertions

**Files:**
- Modify: `tests/components/admin/showpage/_rowAssertions.ts` (append export)
- Modify: `tests/components/admin/showpage/shareHub.test.tsx:421-436` (delete local const, import instead)

**Interfaces:**
- Produces: `export const ROW_TOKENS: readonly string[]` from `_rowAssertions.ts` — Tasks 2 and 4 import it.

- [ ] **Step 1: Add the export** — append to `tests/components/admin/showpage/_rowAssertions.ts` (after `WRAPPER_CLASSES`):

```ts
/** The §4.1 row-button token set (spec 2026-07-24-archive-row-menu-idiom §2.1;
 *  moved here from shareHub.test.tsx so the ArchiveShowButton suite shares one
 *  source). Asserted with `exactly` - an overriding extra must FAIL. */
export const ROW_TOKENS = [
  "flex",
  "w-full",
  "items-center",
  "gap-2",
  "rounded-sm",
  "min-h-tap-min",
  "p-2",
  "text-left",
  "hover:bg-surface-sunken",
  "transition-colors",
  "duration-fast",
  "focus-visible:outline-none",
  "focus-visible:ring-2",
  "focus-visible:ring-focus-ring",
] as const;
```

- [ ] **Step 2: Replace the local const** — in `shareHub.test.tsx`, delete the `const ROW_TOKENS = [ ... ];` block at lines 421-436 and add `ROW_TOKENS` to the existing `_rowAssertions` import (line ~27 already imports `expectRowText` etc.). Verify the deleted literal matches the moved one token-for-token BEFORE deleting (they must be identical — `git diff` shows a pure move).

- [ ] **Step 3: Run** `pnpm exec vitest run tests/components/admin/showpage/shareHub.test.tsx tests/components/admin/showpage/_rowAssertions.selftest.test.tsx` — Expected: PASS (pure move; zero behavior change).

- [ ] **Step 4: Commit** `git add -A && git commit --no-verify -m "test(admin): move ROW_TOKENS into _rowAssertions for cross-suite reuse"`

---

### Task 2: ArchiveShowButton row-variant tests (RED)

**Files:**
- Modify: `tests/components/admin/ArchiveShowButton.test.tsx` (replace the idle-layout test at ArchiveShowButton.test.tsx:71-82; add new tests inside the existing row-variant describe block at ArchiveShowButton.test.tsx:58)

**Interfaces:**
- Consumes: `ROW_TOKENS`, `expectClasses`, `expectRowText`, `expectRowBoundary`, `expectNoDescriptionNode`, `NO_BORDER`, `NO_REST_BACKGROUND`, `WRAPPER_CLASSES` from `../showpage/_rowAssertions` (relative from `tests/components/admin/`: `./showpage/_rowAssertions`).

- [ ] **Step 1: Add imports** at the top of `ArchiveShowButton.test.tsx`:

```ts
import {
  ROW_TOKENS,
  WRAPPER_CLASSES,
  NO_BORDER,
  NO_REST_BACKGROUND,
  expectClasses,
  expectRowText,
  expectRowBoundary,
  expectNoDescriptionNode,
  tokensOf,
} from "../showpage/_rowAssertions";
```

- [ ] **Step 2: Replace the idle-layout test** (`ArchiveShowButton.test.tsx:71-82`, "resting: titled row + SHORT trigger…") with:

```tsx
  it("resting: ONE §4.1 menu row - full token set, icon+column topology, bound name (spec §2.1)", () => {
    const { getByTestId, container } = renderRow();
    const trigger = getByTestId("archive-show-button");
    expect(trigger.tagName).toBe("BUTTON");
    expectClasses(trigger, {
      exactly: ROW_TOKENS,
      forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/],
    });
    // One call covers containment, exact text, uniqueness, typography, stacking
    // order, and row topology for BOTH strings (§7.0).
    expectRowText(trigger, container, {
      label: "Archive show",
      description: "Crew links stop working immediately",
    });
    const icon = trigger.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-archive"] });
    // The OLD shape must be GONE, not merely joined by the new one: no button
    // whose accessible name is the bare short label.
    expect(within(container).queryByRole("button", { name: "Archive" })).toBeNull();
    expectRowBoundary(trigger, {
      scope: container,
      descriptionId: trigger.getAttribute("aria-describedby"),
      container,
    });
  });

  it("aria-label is PROP-bound, not hardcoded (R1-3 anti-tautology)", () => {
    const { getByTestId, container } = render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel="Retire this show"
        rowDescription="Crew links stop working immediately"
      />,
    );
    const trigger = getByTestId("archive-show-button");
    expect(trigger.getAttribute("aria-label")).toBe("Retire this show");
    expect(within(container).getByRole("button", { name: "Retire this show" })).toBe(trigger);
    // A kept-hardcoded aria-label="Archive show" or leftover literal fails here.
    expect(container.textContent).not.toContain("Archive show");
  });

  it("absent description: no carrier node at all (§3 guard)", () => {
    const { getByTestId, container } = render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel="Archive show"
      />,
    );
    expectNoDescriptionNode(getByTestId("archive-show-button"), container, "Archive show");
  });

  it.each(["", "   "])("blank rowLabel %j: legacy compact render, never an unnamed row (§2.1 gate)", (blank) => {
    const { getByTestId, container } = render(
      <ArchiveShowButton
        archiveAction={vi.fn(async () => ({ ok: true }) as const)}
        compact
        rowLabel={blank}
        rowDescription="Crew links stop working immediately"
      />,
    );
    // Legacy compact button: self-named by visible text.
    expect(within(container).getByRole("button", { name: "Archive show" })).toBe(
      getByTestId("archive-show-button"),
    );
    // No §4.1 wrapper anywhere (the row variant did not render).
    const wrapperHits = [...container.querySelectorAll("div")].filter(
      (d) => [...tokensOf(d)].sort().join(" ") === [...WRAPPER_CLASSES].sort().join(" "),
    );
    expect(wrapperHits).toEqual([]);
  });

  it("both states keep the wrapper at exactly WRAPPER_CLASSES; armed group keeps its own py-3 (§1.1 spacing ratification)", () => {
    const { getByTestId } = renderRow();
    const idleWrapper = getByTestId("archive-show-button").parentElement!;
    expectClasses(idleWrapper, { exactly: WRAPPER_CLASSES });
    fireEvent.click(getByTestId("archive-show-button"));
    const armedGroup = getByTestId("archive-show-confirm-row");
    expectClasses(armedGroup, { exactly: ["flex", "flex-col", "gap-2", "py-3"] });
    expectClasses(armedGroup.parentElement!, { exactly: WRAPPER_CLASSES });
  });

  it("pending → idle on refusal: banner mounts as wrapper sibling, busy released, trigger back (§6 item 1a)", async () => {
    const onBusyChange = vi.fn();
    let settle: ((v: { ok: false; code: string }) => void) | null = null;
    const action = vi.fn(
      () => new Promise<{ ok: false; code: string }>((res) => (settle = res)),
    );
    const { getByTestId, queryByTestId } = render(
      <ArchiveShowButton
        archiveAction={action}
        compact
        onBusyChange={onBusyChange}
        rowLabel="Archive show"
        rowDescription="Crew links stop working immediately"
      />,
    );
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    await act(async () => {
      settle?.({ ok: false, code: "FINALIZE_OWNED_SHOW" });
    });
    expect(queryByTestId("archive-show-confirm-button")).toBeNull();
    expect(getByTestId("archive-show-error")).toBeTruthy();
    expect(getByTestId("archive-show-button")).toBeTruthy();
    // Banner is a WRAPPER sibling (not nested in the row button).
    expect(getByTestId("archive-show-error").parentElement).toBe(
      getByTestId("archive-show-button").parentElement,
    );
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("rejecting action: reaches the boundary, busy gate never wedges (§6 item 1b)", async () => {
    const onBusyChange = vi.fn();
    class Boundary extends React.Component<
      { children: React.ReactNode },
      { caught: boolean }
    > {
      override state = { caught: false };
      static getDerivedStateFromError() {
        return { caught: true };
      }
      override render() {
        return this.state.caught ? <p data-testid="boundary-caught">caught</p> : this.props.children;
      }
    }
    const action = vi.fn(async (): Promise<{ ok: true }> => {
      throw new Error("transport down");
    });
    const { getByTestId, findByTestId } = render(
      <Boundary>
        <ArchiveShowButton
          archiveAction={action}
          compact
          onBusyChange={onBusyChange}
          rowLabel="Archive show"
          rowDescription="Crew links stop working immediately"
        />
      </Boundary>,
    );
    fireEvent.click(getByTestId("archive-show-button"));
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });
    expect(await findByTestId("boundary-caught")).toBeTruthy();
    // The unmount cleanup must have released a still-pending busy level.
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });
```

Also add `import React from "react";` and `within` to the Testing Library import if not present, and keep every existing armed-branch test (`ArchiveShowButton.test.tsx:84-218`) byte-identical.

- [ ] **Step 3: Run to verify RED** — `pnpm exec vitest run tests/components/admin/ArchiveShowButton.test.tsx`. Expected: the NEW/replaced tests FAIL (current idle render is label-outside + outlined trigger + hardcoded aria-label; blank gate not tightened); armed tests PASS.

- [ ] **Step 4: Commit** `git add -A && git commit --no-verify -m "test(admin): archive row 4.1 contract tests (red): idle topology, bound name, blank gate, pending-failure, rejection"`

---

### Task 3: ArchiveShowButton implementation (GREEN)

**Files:**
- Modify: `components/admin/ArchiveShowButton.tsx` — gate (:102), `labelHeader` (:186-195), row-variant return (:238-310), stale comments (:233-237, :251-253)

**Interfaces:**
- Produces: unchanged public props `ArchiveShowButtonProps`; unchanged testids.

- [ ] **Step 1: Tighten the gate** — replace line 102:

```ts
  const asRow = compact && rowLabel != null && rowLabel.trim() !== "";
```

and update its doc comment to note blank labels fall back to the legacy compact render (self-named by its visible text; spec §2.1, R1 finding 2).

- [ ] **Step 2: Make `labelHeader` confirm-branch-only** — replace the comment above it (mirror `RotateShareTokenButton.tsx:205-207`):

```tsx
  /** Confirm-branch header ONLY. The idle row renders its own label/description
   *  inside the button (see the row variant below); these stay SEPARATE so
   *  restyling the idle row cannot shift the ratified confirm render. */
```

(The JSX of `labelHeader` itself is unchanged.)

- [ ] **Step 3: Replace the row-variant return** (lines 233-310) with:

```tsx
  // ── ROW VARIANT (the hub popover) - the §4.1 menu-row idiom, byte-for-byte
  // the rotate recipe (spec 2026-07-24-archive-row-menu-idiom §2.1; fidelity-
  // fixes §4.1). Idle: one borderless full-width row, icon + stacked
  // label/description INSIDE the button. Armed: the owner-ratified
  // Confirm/Cancel render (no timer) - unchanged. The wrapper below is a plain,
  // non-interactive div written with a LITERAL class string - a source-form
  // contract `_metaRowWrapperInert.test.ts` parses to prove no handler is
  // attached to it.
  if (asRow) {
    return (
      <div className="flex w-full flex-col gap-2">
        {!armed ? (
          <button
            type="button"
            ref={triggerRef}
            data-testid="archive-show-button"
            onClick={onArmClick}
            aria-label={rowLabel}
            aria-describedby={rowDescription?.trim() ? descId : undefined}
            className="flex min-h-tap-min w-full items-center gap-2 rounded-sm p-2 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            <Archive aria-hidden="true" size={16} className="shrink-0 text-text-subtle" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-text-strong">{rowLabel}</span>
              {rowDescription?.trim() ? (
                <span id={descId} className="text-xs text-text-subtle">
                  {rowDescription}
                </span>
              ) : null}
            </span>
          </button>
        ) : (
          <div
            role="group"
            aria-label="Confirm archiving this show"
            data-testid="archive-show-confirm-row"
            className="flex flex-col gap-2 py-3"
          >
            {labelHeader}
            <p id={warnId} className="text-sm text-text-subtle">
              Crew links stop working now and won&rsquo;t come back until you re-publish and issue a
              new link.
            </p>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <form
                action={async () => {
                  clearAutoRevert();
                  const result = await archiveAction();
                  onResult(result);
                }}
              >
                <ConfirmButton
                  onConfirmClick={clearAutoRevert}
                  compact
                  row
                  describedBy={warnId}
                  label="Confirm archive"
                  onBusyChange={onConfirmBusy}
                />
              </form>
              <button
                type="button"
                ref={cancelRef}
                data-testid="archive-show-cancel-button"
                disabled={submitting}
                aria-busy={submitting}
                onClick={() => {
                  clearAutoRevert();
                  restoreFocusRef.current = true;
                  setArmed(false);
                }}
                className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface px-4 py-2 text-sm text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {banners}
      </div>
    );
  }
```

The armed branch above is byte-identical to today's (only its former OUTER wrapper changed: `flex flex-col gap-2 py-3` → the literal `flex w-full flex-col gap-2`). The `aria-label={rowLabel}` is unconditional inside `asRow` — the tightened gate guarantees non-blank.

- [ ] **Step 4: Run** `pnpm exec vitest run tests/components/admin/ArchiveShowButton.test.tsx` — Expected: ALL PASS. Then `pnpm exec vitest run tests/components/admin/showpage/shareHub.test.tsx tests/styles/_metaDestructiveConfirm.test.ts tests/components/admin/per-show-lifecycle.test.tsx` — Expected: PASS (testids/confirm literal unchanged).

- [ ] **Step 5: Transition audit** (mandatory — spec §4 inventory): grep the component for `AnimatePresence` (none — instant swaps only), enumerate the ternaries: `!armed ? row : confirmGroup` (instant, C3/C5 focus effects pinned by existing tests `ArchiveShowButton.test.tsx:134-151`), `pending ?` label morph in `ConfirmButton` (only animated property = `transition-opacity duration-fast`, ratified). Confirm the both-states wrapper test from Task 2 passes — it IS the audit's pin. No new animation added; record "audit clean" in the commit body.

- [ ] **Step 6: Commit** `git add -A && git commit --no-verify -m "feat(admin): archive row adopts the §4.1 menu-row idiom (idle only; armed render ratified-unchanged)" -m "Transition audit clean: no AnimatePresence; instant swaps pinned by both-states wrapper test; only animated property is the ratified confirm transition-opacity."`

---

### Task 4: ShareHub host + hub-level row test + wrapper-inert registry

**Files:**
- Modify: `components/admin/showpage/ShareHub.tsx:591-592` (section div class)
- Modify: `tests/components/admin/showpage/shareHub.test.tsx` (new archive §4.1 test, mirrors the rotate one at :438-472)
- Modify: `tests/components/admin/showpage/_metaRowWrapperInert.test.ts:25-28` (FILES += ArchiveShowButton)

- [ ] **Step 1: Write the failing hub test** — add to `shareHub.test.tsx` next to the rotate row test (:438):

```tsx
  it("archive idle state is ONE §4.1 menu row anchored to the full section width (spec §2.1/§2.3)", () => {
    renderHub();
    fireEvent.click(primary());

    const archive = screen.getByTestId("archive-show-button");
    expect(archive.tagName).toBe("BUTTON");
    expectClasses(archive, {
      exactly: ROW_TOKENS,
      forbids: [NO_BORDER, NO_REST_BACKGROUND, /(?:^|:)focus-visible:ring-offset-/],
    });
    expectRowText(archive, popover(), {
      label: "Archive show",
      description: "Crew links stop working immediately",
    });
    const icon = archive.querySelector("svg")!;
    expect(icon.getAttribute("width")).toBe("16");
    expect(icon.getAttribute("height")).toBe("16");
    expectClasses(icon, { has: ["shrink-0", "text-text-subtle", "lucide-archive"] });
    expect(within(popover()).queryByRole("button", { name: "Archive" })).toBeNull();
    expectClasses(archive.parentElement!, { exactly: WRAPPER_CLASSES });
    expectRowBoundary(archive, {
      scope: popover(),
      descriptionId: archive.getAttribute("aria-describedby"),
    });
    // §2.3 width-chain link: the Show-section host div is w-full with NO inset.
    const section = screen.getByTestId("share-hub-show-section");
    expectClasses(section, { exactly: ["w-full"] });
  });
```

Run `pnpm exec vitest run tests/components/admin/showpage/shareHub.test.tsx` — Expected: this test FAILS on the section-class assertion (`px-0.5` still present); the row assertions pass already (Task 3 landed).

- [ ] **Step 2: Change the section div** — `ShareHub.tsx:592`: `className="px-0.5"` → `className="w-full"`. Update the comment block above it to note the §2.3 width-chain rationale (flex children do NOT stretch by default in this Tailwind v4 build; `w-full` is load-bearing).

- [ ] **Step 3: Extend the wrapper-inert registry** — `_metaRowWrapperInert.test.ts:25-28`:

```ts
const FILES = [
  "app/admin/show/[slug]/RotateShareTokenButton.tsx",
  "app/admin/show/[slug]/PickerResetControl.tsx",
  "components/admin/ArchiveShowButton.tsx",
] as const;
```

- [ ] **Step 4: Run** `pnpm exec vitest run tests/components/admin/showpage/` — Expected: ALL PASS (wrapper scan finds the Task 3 literal div; hub test green).

- [ ] **Step 5: Commit** `git add -A && git commit --no-verify -m "feat(admin): share-hub Show section carries the §4.6 width chain; archive row pinned by §7.0 assertions + wrapper-inert registry"`

---

### Task 5: Real-browser e2e — idle width + 390x560 scrollport (spec §5)

**Files:**
- Modify: `tests/e2e/admin-lifecycle-layout.spec.ts` (extend the hub-popover test at :215-260; add one new test)

- [ ] **Step 1: Add idle-width assertions** inside the existing per-width hub test, immediately after `await expect(restingBtn).toBeVisible();` (:231):

```ts
      // ── Spec §5 items 1-2 (2026-07-24-archive-row-menu-idiom): the idle row
      // spans the popover CONTENT box (clientWidth excludes the 1px borders;
      // bounding-box width would over-state the target by 2px), and equals the
      // sibling rotate row - the "one idiom" statement.
      const popMetrics = await popover.evaluate((el) => {
        const cs = getComputedStyle(el);
        return el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      });
      const archiveRow = await rect(page, "archive-show-button");
      expect(
        Math.abs(archiveRow.width - popMetrics),
        `archive idle row width == popover content width @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
      const rotateRow = await rect(page, "admin-rotate-share-token-button");
      expect(
        Math.abs(archiveRow.width - rotateRow.width),
        `archive row width == rotate row width @ ${width}px`,
      ).toBeLessThanOrEqual(TOL);
```

- [ ] **Step 2: Add the 390x560 scrollport test** (new `test(...)` in the same describe, after the width loop):

```ts
  test("390x560: arming scrolls the popover's OWN scroller to the confirm (spec §5 item 3)", async ({
    page,
  }) => {
    // (1) Instrument BEFORE any navigation: bracketed capture attributes the
    // scroll to the production scrollIntoView call itself - the arming
    // cancelRef.focus() also scrolls (probe: before=212), so raw scrollTop
    // deltas prove nothing.
    await page.addInitScript(() => {
      const w = window as unknown as {
        __siv: Array<{ testid: string | null; opts: unknown; before: number | null; after: number | null }>;
      };
      w.__siv = [];
      const pop = () => document.querySelector('[data-testid="share-hub-popover"]');
      const orig = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function (this: Element, opts?: unknown) {
        const before = pop() ? (pop() as Element).scrollTop : null;
        const r = orig.call(this, opts as ScrollIntoViewOptions);
        const after = pop() ? (pop() as Element).scrollTop : null;
        w.__siv.push({ testid: this.getAttribute("data-testid"), opts, before, after });
        return r;
      };
    });
    await page.setViewportSize({ width: 390, height: 560 });
    await page.goto(`/admin?show=${held.slug}`);
    const modal = page.locator(LOADED_REVIEW_MODAL);
    await expect(modal).toBeVisible({ timeout: 30_000 });
    // Sentinel: the init script reached this document.
    expect(await page.evaluate(() => Array.isArray((window as never as { __siv: unknown[] }).__siv))).toBe(true);

    await modal.getByTestId("share-hub-kebab").click();
    const popover = modal.getByTestId("share-hub-popover");
    await expect(popover).toBeVisible();
    // (2) Fresh open, untouched scroller.
    expect(await popover.evaluate((el) => el.scrollTop)).toBe(0);

    // (3) Direct DOM click - Playwright actionability scrolling never enters.
    await popover.getByTestId("archive-show-button").evaluate((el: HTMLElement) => el.click());
    const confirm = popover.getByTestId("archive-show-confirm-button");
    await expect(confirm).toBeVisible();
    // Let the handler's requestAnimationFrame settle.
    await page.waitForTimeout(250);

    // (4a) Below-fold precondition, content coordinates (probe: 483 > 390
    // pre-restyle, ~471 post): fails loudly if the armed morph stops
    // overflowing at this viewport.
    const geom = await popover.evaluate((el) => {
      const c = el.querySelector('[data-testid="archive-show-confirm-button"]') as HTMLElement;
      return {
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
        confirmTop: c.offsetTop,
        confirmH: c.offsetHeight,
      };
    });
    expect(geom.scrollHeight).toBeGreaterThan(geom.clientHeight);
    expect(geom.confirmTop + geom.confirmH).toBeGreaterThan(geom.clientHeight);

    // (4b) Causality: the production handler's OWN call placed the scroller at
    // the block-end target (probe: before=212 focus overshoot, after=93).
    const calls = await page.evaluate(
      () =>
        (window as never as {
          __siv: Array<{ testid: string | null; opts: { block?: string } | undefined; after: number | null }>;
        }).__siv,
    );
    const handlerCall = calls.find((c) => c.testid === "archive-show-confirm-button");
    expect(handlerCall, "production scrollIntoView(confirm) must have been called").toBeTruthy();
    expect(handlerCall!.opts?.block).toBe("end");
    const target = geom.confirmTop + geom.confirmH - geom.clientHeight;
    expect(Math.abs((handlerCall!.after ?? -1) - target)).toBeLessThanOrEqual(TOL);

    // (4c) Geometry: confirm fully inside the popover's scroll window.
    expect(geom.confirmTop).toBeGreaterThanOrEqual(geom.scrollTop - TOL);
    expect(geom.confirmTop + geom.confirmH).toBeLessThanOrEqual(geom.scrollTop + geom.clientHeight + TOL);
  });
```

- [ ] **Step 3: Run** `E2E_PORT=3005 TEST_DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" pnpm exec playwright test tests/e2e/admin-lifecycle-layout.spec.ts --project=mobile-safari --no-deps` — Expected: ALL PASS (assertions recompute targets live; probe-grounded premises hold post-restyle). If the onboarding wizard appears: `pnpm db:seed`, rerun.

- [ ] **Step 4: Commit** `git add -A && git commit --no-verify -m "test(admin): real-browser idle-width parity + 390x560 armed-scrollport contract for the archive row"`

---

### Task 6: CI workflow — lifecycle-layout-e2e (spec §6 item 6)

**Files:**
- Create: `.github/workflows/lifecycle-layout-e2e.yml`

- [ ] **Step 1: Write the workflow** — clone `crew-e2e.yml`'s job body verbatim (env block, setup, supabase 2.107.0, psql, bootstrap, db:seed, playwright cache + `install-deps chromium webkit` + `install chromium webkit`) with these deltas:

```yaml
name: Lifecycle layout e2e (mobile-safari)
# Un-darkens tests/e2e/admin-lifecycle-layout.spec.ts (spec
# 2026-07-24-archive-row-menu-idiom §6 item 6). Deliberately NO
# pull_request.paths filter: four spec-review rounds proved any enumerated
# filter re-opens the dark-path hole (the spec's dependency graph is
# effectively the whole app + harness). workflow_dispatch for close-out
# verification. Advisory-context posture per the owner's quality-only branch
# protection (plans DEFERRED.md 2026-06-22); the ship pipeline's
# all-checks-green gate is the procedural enforcement.
on:
  pull_request:
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}-${{ github.event_name }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  lifecycle-layout-e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    env:
      # ... crew-e2e.yml env block verbatim, EXCEPT:
      BASELINE_SERVER_ONLY: "1"   # replaces CREW_E2E_ONLY (same :3000-only filter, playwright.config.ts:396-400)
    steps:
      # ... crew-e2e.yml steps verbatim through browser install, then:
      - name: Run admin lifecycle layout e2e (mobile-safari, :3000 only)
        run: pnpm exec playwright test --project=mobile-safari tests/e2e/admin-lifecycle-layout.spec.ts
```

(Write the FULL file — copy each env line and step from `crew-e2e.yml:44-105`; the comments above are the only original prose. No `paths:`. No `continue-on-error`. No `if:`.)

- [ ] **Step 2: Validate** — `pnpm exec prettier --check .github/workflows/lifecycle-layout-e2e.yml` and `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/lifecycle-layout-e2e.yml')); print('yaml ok')"` (safe_load — plain data only). Expected: both clean. (The real parse authority is the Actions run itself at close-out.)

- [ ] **Step 3: Commit** `git add -A && git commit --no-verify -m "infra: lifecycle-layout-e2e workflow to un-darken admin-lifecycle-layout.spec.ts on every PR"`

(Real-CI green for this job is verified at close-out via the PR run + `gh workflow run` if needed.)

---

### Task 7: Workflow-coverage meta-test (spec §6 item 6, CREATES)

**Files:**
- Create: `tests/ci/_workflowCoverageScan.ts` (pure scanner)
- Create: `tests/ci/_metaE2eWorkflowCoverage.test.ts` (registry + self-tests)

**Interfaces:**
- Produces: `scanWorkflowCoverage(opts: { workflows: Record<string, string>; packageScripts: Record<string, string> }): { covered: Set<string>; rejected: Array<{ file: string; spec: string; reason: string }> }` — file-driven wrapper in the test walks the real repo.

- [ ] **Step 1: Write the scanner** — `tests/ci/_workflowCoverageScan.ts`:

```ts
/**
 * tests/ci/_workflowCoverageScan.ts
 *
 * Pure scanner for the e2e workflow-coverage meta-test (spec
 * 2026-07-24-archive-row-menu-idiom §6 item 6). Answers: which
 * tests/e2e/*.spec.ts paths are invoked by an AUTOMATIC, PR-BLOCKING-CAPABLE
 * workflow run?
 *
 * An invocation COUNTS only when ALL hold:
 *   - the workflow declares a `pull_request` trigger (workflow_dispatch-only
 *     and push-only are post-merge/manual discovery, not a PR gate);
 *   - the workflow has NO `pull_request.paths` filter (an enumerated filter
 *     that fires on the spec file but not on production dependencies is the
 *     documented dark-path hole - spec R12-R16);
 *   - neither the job nor the step carries `if:` or `continue-on-error`;
 *   - the run command does not suppress the exit code (`|| true`, `; exit 0`,
 *     a trailing status-swallowing pipe).
 * Commands are resolved transitively through package.json scripts (`pnpm
 * test:e2e:*`-style aliases carry the real spec list).
 *
 * Regex-on-YAML is deliberate and TESTED below (the _rowWrapperScan lesson:
 * a scanner that silently matches nothing is worse than none).
 */

const SPEC_RE = /tests\/e2e\/[\w.-]+\.spec\.ts/g;
const SUPPRESS_RE = /(\|\|\s*true)|(;\s*exit\s+0)|(\|\s*(tee|cat|grep)[^|]*$)/;

type Opts = {
  /** workflow file basename -> raw YAML text */
  workflows: Record<string, string>;
  /** package.json "scripts" map, for alias resolution */
  packageScripts: Record<string, string>;
};

export function scanWorkflowCoverage({ workflows, packageScripts }: Opts): {
  covered: Set<string>;
  rejected: Array<{ file: string; spec: string; reason: string }>;
} {
  const covered = new Set<string>();
  const rejected: Array<{ file: string; spec: string; reason: string }> = [];

  const resolveSpecs = (cmd: string): string[] => {
    const direct = cmd.match(SPEC_RE) ?? [];
    // pnpm alias resolution: `pnpm foo` / `pnpm run foo` -> scripts.foo
    const aliases = [...cmd.matchAll(/pnpm(?:\s+run)?\s+([\w:.-]+)/g)]
      .map((m) => m[1]!)
      .filter((name) => name in packageScripts)
      .flatMap((name) => resolveSpecs(packageScripts[name]!));
    return [...direct, ...aliases];
  };

  for (const [file, yaml] of Object.entries(workflows)) {
    const hasPr = /(^|\n)\s*pull_request\s*:/.test(yaml);
    const hasPathsFilter = /(^|\n)\s*pull_request\s*:\s*\n(\s+)[\s\S]*?\2paths\s*:/.test(yaml);
    const hasIf = /(^|\n)\s*if\s*:/.test(yaml);
    const hasCoe = /(^|\n)\s*continue-on-error\s*:\s*true/.test(yaml);
    const runCmds = [...yaml.matchAll(/(^|\n)\s*run\s*:([^\n]*(?:\n\s{6,}[^\n]*)*)/g)].map(
      (m) => m[2]!,
    );
    for (const cmd of runCmds) {
      for (const spec of resolveSpecs(cmd)) {
        if (!hasPr) rejected.push({ file, spec, reason: "no pull_request trigger" });
        else if (hasPathsFilter) rejected.push({ file, spec, reason: "pull_request.paths filter" });
        else if (hasIf) rejected.push({ file, spec, reason: "if: condition present" });
        else if (hasCoe) rejected.push({ file, spec, reason: "continue-on-error" });
        else if (SUPPRESS_RE.test(cmd)) rejected.push({ file, spec, reason: "exit-code suppression" });
        else covered.add(spec);
      }
    }
  }
  return { covered, rejected };
}
```

- [ ] **Step 2: Write the meta-test** — `tests/ci/_metaE2eWorkflowCoverage.test.ts`:

```ts
/**
 * tests/ci/_metaE2eWorkflowCoverage.test.ts
 *
 * Structural guard: a Playwright-project-matched e2e spec that NO automatic
 * PR workflow invokes is DARK - it exists, matches a testMatch, and proves
 * nothing (spec 2026-07-24-archive-row-menu-idiom §6 item 6; the class cost
 * R11-R16). Fails by default for NEW dark specs; the pre-existing darkness is
 * inventoried below with reasons, not silently blessed.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanWorkflowCoverage } from "./_workflowCoverageScan";

const ROOT = process.cwd();

/** Deliberately-not-PR-gated specs. Every row carries a reason or backlog ref.
 *  Deleting a spec removes its row (the assertion below flags stale rows). */
const LOCAL_ONLY_ALLOWLIST: Record<string, string> = {
  // Populated at implementation time: run the scan, copy every currently-dark
  // spec in with the reason "pre-existing dark (BL-E2E-LIFECYCLE-SPECS-CI-DARK
  // umbrella)" - EXCEPT tests/e2e/admin-lifecycle-layout.spec.ts, which
  // Task 6's workflow covers and MUST NOT appear here.
};

describe("e2e workflow coverage (spec §6 item 6)", () => {
  const workflows = Object.fromEntries(
    readdirSync(join(ROOT, ".github/workflows"))
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => [f, readFileSync(join(ROOT, ".github/workflows", f), "utf8")]),
  );
  const packageScripts = (
    JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
  const specs = readdirSync(join(ROOT, "tests/e2e"))
    .filter((f) => f.endsWith(".spec.ts"))
    .map((f) => `tests/e2e/${f}`);

  const { covered } = scanWorkflowCoverage({ workflows, packageScripts });

  it("every e2e spec is PR-covered or reason-allowlisted", () => {
    const dark = specs.filter((s) => !covered.has(s) && !(s in LOCAL_ONLY_ALLOWLIST));
    expect(dark, "dark specs - wire a workflow or add a reasoned allowlist row").toEqual([]);
  });

  it("the allowlist carries no stale or shadowing rows", () => {
    const stale = Object.keys(LOCAL_ONLY_ALLOWLIST).filter((s) => !specs.includes(s));
    expect(stale, "allowlist rows for deleted specs").toEqual([]);
    const shadowing = Object.keys(LOCAL_ONLY_ALLOWLIST).filter((s) => covered.has(s));
    expect(shadowing, "allowlisted specs that ARE covered - remove the row").toEqual([]);
  });

  it("the lifecycle layout spec is covered by the Task-6 workflow (not allowlisted)", () => {
    expect(covered.has("tests/e2e/admin-lifecycle-layout.spec.ts")).toBe(true);
  });
});

describe("the scanner itself (self-tests - a guard that matches nothing is worse than none)", () => {
  const spec = "tests/e2e/foo.spec.ts";
  const base = (trigger: string, extra: string, run: string) =>
    `name: x\non:\n${trigger}\njobs:\n  j:\n    runs-on: ubuntu-latest\n${extra}    steps:\n      - run: ${run}\n`;
  const S = (w: string, scripts: Record<string, string> = {}) =>
    scanWorkflowCoverage({ workflows: { "w.yml": w }, packageScripts: scripts });

  it("counts a clean pull_request workflow with a direct invocation", () => {
    const r = S(base("  pull_request:\n  workflow_dispatch:", "", `pnpm exec playwright test ${spec}`));
    expect(r.covered.has(spec)).toBe(true);
  });
  it("resolves a pnpm script alias through package.json", () => {
    const r = S(base("  pull_request:", "", "pnpm test:e2e:foo"), {
      "test:e2e:foo": `playwright test ${spec}`,
    });
    expect(r.covered.has(spec)).toBe(true);
  });
  it("rejects workflow_dispatch-only", () => {
    const r = S(base("  workflow_dispatch:", "", `playwright test ${spec}`));
    expect(r.covered.has(spec)).toBe(false);
    expect(r.rejected[0]!.reason).toBe("no pull_request trigger");
  });
  it("rejects push-only", () => {
    const r = S(base("  push:\n    branches: [main]", "", `playwright test ${spec}`));
    expect(r.rejected[0]!.reason).toBe("no pull_request trigger");
  });
  it("rejects a pull_request.paths filter (spec-file-only filters included)", () => {
    const r = S(base(`  pull_request:\n    paths:\n      - "${spec}"`, "", `playwright test ${spec}`));
    expect(r.rejected[0]!.reason).toBe("pull_request.paths filter");
  });
  it("rejects an if:-conditioned job/step", () => {
    const r = S(base("  pull_request:", "    if: false\n", `playwright test ${spec}`));
    expect(r.rejected[0]!.reason).toBe("if: condition present");
  });
  it("rejects continue-on-error", () => {
    const r = S(base("  pull_request:", "    continue-on-error: true\n", `playwright test ${spec}`));
    expect(r.rejected[0]!.reason).toBe("continue-on-error");
  });
  it("rejects exit-code suppression", () => {
    const r = S(base("  pull_request:", "", `playwright test ${spec} || true`));
    expect(r.rejected[0]!.reason).toBe("exit-code suppression");
  });
});
```

- [ ] **Step 3: Run RED-then-populate** with `pnpm exec vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts`. Expected first run: FAIL listing every currently-dark spec. Copy that exact list into `LOCAL_ONLY_ALLOWLIST` with reason strings (`"pre-existing dark: BL-E2E-LIFECYCLE-SPECS-CI-DARK umbrella"`), EXCLUDING `admin-lifecycle-layout.spec.ts`. Re-run — Expected: PASS (self-tests + registry + lifecycle-covered assertion).

- [ ] **Step 4: Commit** `git add -A && git commit --no-verify -m "test(infra): e2e workflow-coverage meta-test; dark specs fail by default, reasoned allowlist for pre-existing"`

---

### Task 8: Full gates + impeccable dual-gate

- [ ] **Step 1: Full local suite** — `pnpm test` (full, not scoped — registry suites live outside touched dirs). Expected: green, exit 0 (check `$?`, not the Tests line).
- [ ] **Step 2: Typecheck + lint + format** — `pnpm typecheck && pnpm lint && pnpm format:check`. Expected: all clean.
- [ ] **Step 3: e2e re-run** — the Task 5 command plus `tests/e2e/admin-lifecycle-transitions.spec.ts` (run-to-confirm, don't edit). Expected: green.
- [ ] **Step 4: Impeccable dual-gate (invariant 8; UI diff = ArchiveShowButton + ShareHub)** — run `/impeccable critique` then `/impeccable audit` on the affected diff with the canonical v3 setup gates. P0/P1 fixed or DEFERRED.md-deferred before cross-model review.
- [ ] **Step 5: Commit any gate fixes** individually (`fix(admin): …` per finding).

---

### Task 9: Close-out (ship pipeline Stage 4)

- [ ] Whole-diff cross-model review (fresh-eyes, REVIEWER ONLY) → APPROVE. If Codex remains dead (5x this session), use the same-harness fresh-eyes fallback already exercised at spec R19.
- [ ] Push; open PR (merge-commit convention). Body: spec path, 19-round spec review note, deferral inventory (SHAREHUB-ARM-VIEWPORT-REVEAL-1 + 4 BL entries), preflight declared.
- [ ] Real CI green — ALL checks including the new `lifecycle-layout-e2e`; `gh workflow run` it if the PR firing is inconclusive.
- [ ] `gh pr merge --merge`; fast-forward local main; verify `git rev-list --left-right --count main...origin/main` = `0  0`; set marker `done`; `CronDelete` job f79be1de.

## Self-Review (completed at authoring)

- Spec coverage: §2.1/§2.2 → Tasks 2-3; §2.3 → Task 4; §3 guards → Task 2 (blank/absent tests); §4 inventory → Task 3 step 5 audit + Task 2 pending/rejection tests; §5 → Task 5 (layout-dimensions task, real browser); §6 items 1-1b/2/3/4/5 → Tasks 2/4/4/–/5; §6 item 6 → Tasks 6-7; §7 → declared above; §8 → Task 8 step 4; §10 probe deletion → already done pre-plan.
- Placeholder scan: LOCAL_ONLY_ALLOWLIST population is an explicit RED-then-populate step with exact instructions, not a TBD.
- Type consistency: `scanWorkflowCoverage` signature identical in Task 7 steps 1-2; `ROW_TOKENS` import path `./showpage/_rowAssertions` from `tests/components/admin/` and same-dir in shareHub test; non-null assertions (`m[2]!`, `handlerCall!`, `rejected[0]!`) required by `noUncheckedIndexedAccess`.
