# Settings Attention-Gallery Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dev-gated "Attention gallery" link beside "Open" in the settings-page DevToolsRow, per spec `docs/superpowers/specs/2026-07-21-settings-attention-gallery-link.md` (Codex APPROVE R5).

**Architecture:** One component edit (`DevToolsRow.tsx`): wrap the trailing link in an action-group `<div className="flex flex-wrap items-center gap-2">`, add a second `<Link>` sharing the exact className via a hoisted constant. Gate unchanged (`DEV_PANEL_PRESENT && isDeveloper`, single early return). All tests (unit + e2e) are written and verified RED before the implementation lands (plan R1 F1); the feature is one commit carrying its full test cycle.

**Tech Stack:** Next.js 16, React, Tailwind v4, Vitest + Testing Library (jsdom), Playwright (existing `admin-dev.spec.ts` 3-project harness, `DEV_GATE_ONLY=1`).

## Global Constraints

- Gate stays `if (!DEV_PANEL_PRESENT || !isDeveloper) return null;` — no per-link gate, no runtime-env reads (spec §1.1).
- New link: `href="/admin/dev/attention-gallery"`, `data-testid="admin-dev-tools-gallery"`, label `Attention gallery`, className IDENTICAL to the Open link (contains `min-h-tap-min`, `focus-visible:ring-2`).
- Order: "Open" first, "Attention gallery" second (spec §3).
- Row title/description copy unchanged. No em-dashes in new user-visible copy (label has none).
- Worktree: `/Users/ericweiss/FX-worktrees/settings-attention-gallery-link`. Commits `--no-verify`, conventional-commits.
- Meta-test inventory: **none applies** — no Supabase calls, no mutation surface, no admin route/table, no sentinel text, no `pg_advisory*` (spec §5). No layout-dimensions task (no fixed-dimension parent) and no transition-audit task (single visual state) — spec §3 declares both empty.
- Local e2e for this surface MUST set `DEV_GATE_ONLY=1` (boots ONLY the three dev-gate webServers on ports 3001-3003, `playwright.config.ts:402`; without it Playwright boots every configured webServer and the serialized cold builds contend — `.github/workflows/dev-gate-e2e.yml:14-16`).
- The dev-gate e2e workflow is `workflow_dispatch`-only (`.github/workflows/dev-gate-e2e.yml:26-30`); PR/push does NOT trigger it. Task 3 dispatches it on the branch explicitly.

---

### Task 1: Feature TDD — unit + e2e tests RED, then implementation, one commit

**Files:**
- Test: `tests/components/admin/settings/DevToolsRow.test.tsx`
- Test: `tests/e2e/admin-dev.spec.ts:56-60,80-84,110-119` (the three settings-page tests)
- Modify: `components/admin/settings/DevToolsRow.tsx:47-56` (trailing Link block)
- Unchanged: `tests/components/admin/settings/DevToolsRow.absent.test.tsx` (empty-container assertions already cover the new link; run it to confirm still green)

**Interfaces:**
- Consumes: existing `DevToolsRow` props (`icon?: ReactNode`, `isDeveloper?: boolean`) — unchanged.
- Produces: `data-testid="admin-dev-tools-gallery"` link (unit + e2e assertions target it; no later task consumes anything else).

- [ ] **Step 1: Write the failing unit tests**

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

- [ ] **Step 2: Write the failing e2e assertions**

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

Harness readiness (already satisfied by the existing file — no new wiring): server boot = three Playwright `webServer` prod builds on ports 3001/3002/3003 (`playwright.config.ts` dev-gate projects, `testMatch: /admin-dev\.spec\.ts/`, gated behind `DEV_GATE_ONLY=1` at `playwright.config.ts:402`); readiness gate = navigate + `data-testid` locator assertions with Playwright auto-wait (no `networkidle`, no sampler/`locator.evaluate` that can outlive its element); auth = `signInAs(page, ADMIN_FIXTURE)` per existing test bodies. Failure mode caught: gallery link shipping in a normal build (build-vs-runtime regression) or missing from the dev build.

- [ ] **Step 3: Verify unit tests RED**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && pnpm vitest run tests/components/admin/settings/ 2>&1 | tail -15`
Expected: new test FAILS with `Unable to find an element by: [data-testid="admin-dev-tools-gallery"]`; all pre-existing tests still pass.

- [ ] **Step 4: Verify e2e RED (dev-build project)**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && DEV_GATE_ONLY=1 pnpm exec playwright test tests/e2e/admin-dev.spec.ts --project=dev-build 2>&1 | tail -8`
Expected: the dev-build settings test FAILS on the `admin-dev-tools-gallery` visibility assertion (element absent — implementation not yet written). The prod-build/prod-runtime-flip projects are skipped in this run; their not-visible assertions are vacuously green pre-implementation, so RED is only demonstrable on dev-build (that is the meaningful red: it proves the new assertion exercises the missing element).

- [ ] **Step 5: Minimal implementation**

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

Everything else in the file — header comment gate description, props, early return, heading block — unchanged.

- [ ] **Step 6: Verify unit GREEN + typecheck**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && pnpm vitest run tests/components/admin/settings/ tests/app/admin/settings-developer-visibility.test.tsx 2>&1 | tail -6 && pnpm typecheck`
Expected: all pass (both DevToolsRow suites + settings visibility suite); typecheck clean.

- [ ] **Step 7: Verify e2e GREEN (all three projects)**

Run: `cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link && DEV_GATE_ONLY=1 pnpm exec playwright test tests/e2e/admin-dev.spec.ts 2>&1 | tail -8`
Expected: all admin-dev spec tests pass across dev-build, prod-build, prod-runtime-flip (env-bound — needs `.env.local` symlink + local Supabase, both preflighted at Stage 0; three serialized prod builds, allow ~10-15 min). If the local harness cannot boot the builds, record the exact failure output and rely on the Task 3 branch-ref `dev-gate-e2e` workflow dispatch — do NOT claim local green without the output.

- [ ] **Step 8: Commit (one task, one commit — full test cycle included)**

```bash
cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link
git add components/admin/settings/DevToolsRow.tsx tests/components/admin/settings/DevToolsRow.test.tsx tests/e2e/admin-dev.spec.ts
git commit --no-verify -m "feat(admin): add Attention gallery link to settings DevToolsRow"
```

---

### Task 2: Local gates (full suite + impeccable dual gate)

**Files:** none new (verification only; any fixes land as their own `fix(admin):`/`style(admin):` commits).

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

---

### Task 3: Cross-model review, push, real CI, merge (pipeline Stage 4 — R1 F3)

**Files:** none new.

- [ ] **Step 1: Whole-diff Codex adversarial review**

Fresh-eyes posture, REVIEWER ONLY, via `codex-guard` with the full branch diff scope inlined in the brief. Iterate to APPROVE.

- [ ] **Step 2: Push + PR**

```bash
cd /Users/ericweiss/FX-worktrees/settings-attention-gallery-link
git push -u origin feat/settings-attention-gallery-link
gh pr create --title "feat(admin): Attention gallery link in settings DevToolsRow" --body-file <generated-body>
```

PR body: spec/plan paths, review round counts, impeccable dispositions, e2e evidence.

- [ ] **Step 3: Real CI green + dev-gate dispatch**

- Watch required checks: `gh pr checks <PR#> --watch` (confirm `mergeStateStatus: CLEAN`, not DIRTY/behind).
- The dev-gate e2e workflow does NOT auto-run (workflow_dispatch-only). Dispatch it on the branch and watch:

```bash
gh workflow run dev-gate-e2e.yml --ref feat/settings-attention-gallery-link
gh run watch $(gh run list --workflow=dev-gate-e2e.yml --branch feat/settings-attention-gallery-link --limit 1 --json databaseId -q '.[0].databaseId')
```

Expected: required PR checks all green AND the dispatched dev-gate-e2e run concludes success.

- [ ] **Step 4: Merge + sync (same turn as CI green)**

```bash
gh pr merge <PR#> --merge
cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only
git rev-list --left-right --count main...origin/main   # must print: 0  0
```

Then mark ship-state `done` and CronDelete the nudge job.
