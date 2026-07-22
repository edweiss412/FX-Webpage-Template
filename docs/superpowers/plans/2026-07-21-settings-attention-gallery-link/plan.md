# Settings Attention-Gallery Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dev-gated "Attention gallery" link beside "Open" in the settings-page DevToolsRow, per spec `docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md` (Codex APPROVE R5).

**Architecture:** One client-agnostic server-rendered component edit (`DevToolsRow.tsx`): wrap the trailing link in an action-group `<div className="flex flex-wrap items-center gap-2">`, add a second `<Link>` sharing the exact className via a hoisted constant. Gate unchanged (`DEV_PANEL_PRESENT && isDeveloper`, single early return).

**Tech Stack:** Next.js 16, React, Tailwind v4, Vitest + Testing Library (jsdom), Playwright (existing `admin-dev.spec.ts` 3-project harness).

## Global Constraints

- Gate stays `if (!DEV_PANEL_PRESENT || !isDeveloper) return null;` — no per-link gate, no runtime-env reads (spec §1.1).
- New link: `href="/admin/dev/attention-gallery"`, `data-testid="admin-dev-tools-gallery"`, label `Attention gallery`, className IDENTICAL to the Open link (contains `min-h-tap-min`, `focus-visible:ring-2`).
- Order: "Open" first, "Attention gallery" second (spec §3).
- Row title/description copy unchanged. No em-dashes in new user-visible copy (label has none).
- Worktree: `/Users/ericweiss/FX-worktrees/settings-attention-gallery-link`. Commits `--no-verify`, conventional-commits.
- Meta-test inventory: **none applies** — no Supabase calls, no mutation surface, no admin route/table, no sentinel text, no `pg_advisory*` (spec §5). No layout-dimensions task (no fixed-dimension parent) and no transition-audit task (single visual state) — spec §3 declares both empty.
- Pasted snippets typechecked via `pnpm typecheck` in each task.

---

### Task 1: Component + unit tests (TDD)

**Files:**
- Modify: `components/admin/settings/DevToolsRow.tsx:47-56` (trailing Link block)
- Test: `tests/components/admin/settings/DevToolsRow.test.tsx`
- Unchanged: `tests/components/admin/settings/DevToolsRow.absent.test.tsx` (empty-container assertions already cover the new link; run it to confirm still green)

**Interfaces:**
- Consumes: existing `DevToolsRow` props (`icon?: ReactNode`, `isDeveloper?: boolean`) — unchanged.
- Produces: `data-testid="admin-dev-tools-gallery"` link — consumed by Task 2 e2e assertions.

- [ ] **Step 1: Write the failing tests**

In `tests/components/admin/settings/DevToolsRow.test.tsx`, inside the existing `describe("DevToolsRow — DEV_PANEL_PRESENT true", ...)`, add one test and extend the existing `isDeveloper={false}` test:

```tsx
  it("renders the Attention gallery link beside Open — href, parity, wrapper, order", () => {
    render(<DevToolsRow isDeveloper={true} />);

    const open = screen.getByTestId("admin-dev-tools-open");
    const gallery = screen.getByTestId("admin-dev-tools-gallery");

    // href + label (spec §3; wrong href = 404 class)
    expect(gallery).toHaveAttribute("href", "/admin/dev/attention-gallery");
    expect(gallery).toHaveTextContent("Attention gallery");
    expect(open).toHaveAttribute("href", "/admin/dev");
    expect(open).toHaveTextContent("Open");

    // styling parity (spec §4, R1 F1): identical class attribute, and the
    // shared string keeps the tap-target + focus-ring classes so parity
    // cannot be satisfied by both links losing them together.
    expect(gallery.getAttribute("class")).toBe(open.getAttribute("class"));
    expect(open.getAttribute("class")).toContain("min-h-tap-min");
    expect(open.getAttribute("class")).toContain("focus-visible:ring-2");

    // action-group wrapper (spec §4, R2 F1): same direct parent, NOT the row
    // root (root already has flex-wrap — a root-level check would be vacuous),
    // with all four wrapper classes.
    const parent = open.parentElement;
    expect(parent).not.toBeNull();
    expect(gallery.parentElement).toBe(parent);
    expect(parent).not.toBe(screen.getByTestId("admin-dev-tools-row"));
    const tokens = Array.from(parent!.classList);
    for (const cls of ["flex", "flex-wrap", "items-center", "gap-2"]) {
      expect(tokens).toContain(cls);
    }

    // DOM order (spec §4, R1 F2): Open precedes Attention gallery.
    expect(
      open.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
```

Extend the existing `isDeveloper={false}` test body with one line (after the existing `queryByTestId("admin-dev-tools-row")` assertion):

```tsx
    expect(screen.queryByTestId("admin-dev-tools-gallery")).toBeNull();
```

Failure modes caught: gallery link missing; wrong href; class drift between links; loss of `min-h-tap-min`/focus ring; link added to row root instead of a real action group; wrapper missing `flex`/`flex-wrap`/`items-center`/`gap-2`; reversed order; gate bypass.

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && pnpm vitest run tests/components/admin/settings/ 2>&1 | tail -15`
Expected: new test FAILS with `Unable to find an element by: [data-testid="admin-dev-tools-gallery"]`; all pre-existing tests still pass.

- [ ] **Step 3: Minimal implementation**

In `components/admin/settings/DevToolsRow.tsx`, hoist the shared link class above the component and replace the single trailing `<Link>` (lines 47-56) with the action group:

```tsx
const devLinkClass =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
```

```tsx
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/admin/dev" data-testid="admin-dev-tools-open" className={devLinkClass}>
          Open
        </Link>
        <Link
          href="/admin/dev/attention-gallery"
          data-testid="admin-dev-tools-gallery"
          className={devLinkClass}
        >
          Attention gallery
        </Link>
      </div>
```

Everything else in the file — header comment gate description, props, early return, heading block — unchanged. Update the file's header comment only if it names the single link explicitly (it does not; no change).

- [ ] **Step 4: Run tests to verify green + typecheck**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && pnpm vitest run tests/components/admin/settings/ tests/app/admin/settings-developer-visibility.test.tsx 2>&1 | tail -6 && pnpm typecheck`
Expected: all pass (both DevToolsRow suites + settings visibility suite); typecheck clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link
git add components/admin/settings/DevToolsRow.tsx tests/components/admin/settings/DevToolsRow.test.tsx
git commit --no-verify -m "feat(admin): add Attention gallery link to settings DevToolsRow"
```

---

### Task 2: e2e assertions (build-vs-runtime pin)

**Files:**
- Modify: `tests/e2e/admin-dev.spec.ts:56-60,80-84,110-119` (the three settings-page tests)

**Interfaces:**
- Consumes: `data-testid="admin-dev-tools-gallery"` from Task 1.
- Produces: nothing downstream.

- [ ] **Step 1: Extend the three existing settings tests**

In `tests/e2e/admin-dev.spec.ts`:

dev-build test (`admin: /admin/settings shows the admin-dev-tools-open link`) — add after the existing `admin-dev-tools-open` visibility line:

```ts
    await expect(page.locator("[data-testid=admin-dev-tools-gallery]")).toBeVisible();
```

prod-build test (`admin: /admin/settings shows NO admin-dev-tools-open link`) — add after the existing not-visible line:

```ts
    await expect(page.locator("[data-testid=admin-dev-tools-gallery]")).not.toBeVisible();
```

prod-runtime-flip test (`admin: /admin/settings shows NO admin-dev-tools-open link even with runtime env=true`) — add after the existing not-visible line:

```ts
    await expect(page.locator("[data-testid=admin-dev-tools-gallery]")).not.toBeVisible();
```

Harness readiness (already satisfied by the existing file — no new wiring): server boot = three Playwright `webServer` prod builds on ports 3001/3002/3003 defined in `playwright.config.ts` (`testMatch: /admin-dev\.spec\.ts/`); readiness gate = each test navigates then asserts on `data-testid` locators with Playwright auto-wait (no `networkidle` dependency, no sampler/`locator.evaluate` that can outlive its element); auth = `signInAs(page, ADMIN_FIXTURE)` per existing test bodies. New assertions are plain visibility checks on the same page-load — no new detach-safety surface. Failure mode caught: gallery link shipping in a normal build (build-vs-runtime regression) or missing from the dev build.

- [ ] **Step 2: Typecheck + run the e2e spec locally**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && pnpm typecheck && pnpm exec playwright test tests/e2e/admin-dev.spec.ts 2>&1 | tail -8`
Expected: typecheck clean; all admin-dev spec tests pass across the three projects (env-bound — needs `.env.local` symlink + local Supabase, both preflighted at Stage 0). If the local harness cannot boot the three builds, record the exact failure and rely on CI's e2e job — do NOT claim local green without the output.

- [ ] **Step 3: Commit**

```bash
cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link
git add tests/e2e/admin-dev.spec.ts
git commit --no-verify -m "test(admin): pin attention-gallery link across e2e build postures"
```

---

### Task 3: Gates + full-suite verification (pipeline close-out inputs)

**Files:** none new (verification only; any fixes land as their own commits).

- [ ] **Step 1: Pre-push local gates**

Run in the worktree, each must be green (fix-forward if not):

```bash
cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link
pnpm test 2>&1 | tail -4
pnpm typecheck
pnpm lint 2>&1 | tail -4
pnpm format:check 2>&1 | tail -4
```

Expected: full unit suite green (registry suites included — `tests/styles`, `tests/help` run under `pnpm test`), typecheck clean, eslint clean, prettier clean.

- [ ] **Step 2: impeccable dual gate (invariant 8 — UI surface touched)**

Run `/impeccable critique` then `/impeccable audit` on the diff (canonical v3 setup gates: `context.mjs` context load with PRODUCT.md + DESIGN.md, register reference read). P0/P1 findings fixed or deferred via `DEFERRED.md` entry BEFORE cross-model review. Findings + dispositions recorded for the PR body.

- [ ] **Step 3: Whole-diff Codex adversarial review**

Fresh-eyes posture, REVIEWER ONLY, via `codex-guard`. Iterate to APPROVE (pipeline Stage 4.1).
