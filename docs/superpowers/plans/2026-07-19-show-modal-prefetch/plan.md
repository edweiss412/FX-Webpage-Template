# Show-Modal Prefetch + Revalidate-on-Open Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Row-click on the dashboard serves the show modal from a viewport-prefetched router cache (~100 ms to content on prod) and silently revalidates once on open.

**Architecture:** Two one-line-scale component changes (`prefetch={true}` on both modal-opening row Links; a once-per-mount `router.refresh()` effect in the modal shell) + a prod-server e2e spec that joins the existing #493 `published-modal-e2e.yml` CI gate. No new data layer, no DB, no locks.

**Tech Stack:** Next.js 16.2.4 App Router (segment cache, `FetchStrategy.Full`), React 19, Playwright (desktop-chromium project), Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-07-19-show-modal-prefetch.md` (APPROVED, 4 adversarial rounds). Probe evidence: `docs/superpowers/plans/2026-07-19-show-modal-prefetch/probe/*.json`.

## Global Constraints

- AGENTS.md invariants 1 (TDD per task), 6 (commit per task, conventional style), 8 (impeccable dual-gate — UI files are touched), 11 (this worktree `FX-worktrees/show-modal-prefetch`).
- No `staleTimes` override anywhere (spec §2.3). No new error codes, no Supabase call sites, no mutation surfaces.
- Prefetch is production-only Next behavior; nothing in app code may branch on env (spec §3.1).
- The refresh-once guarantee is a UNIT-level oracle; e2e asserts only presence/boundedness of network traffic (spec §3.4 — ratified, do not strengthen e2e counts).
- `NEXT_DIST_DIR`-based prod builds rewrite `tsconfig.json` include arrays — `git checkout tsconfig.json` before every commit if a probe/build ran.
- Meta-test inventory (writing-plans rule): **none applies** — no Supabase boundary, no admin-alert codes, no advisory locks, no email normalization, no new mutation surface (`tests/log/_metaMutationSurfaceObservability.test.ts` walks routes/actions; a client effect calling `router.refresh()` is a read, not a mutation surface). Layout-dimensions task: N/A — no fixed-dimension parent added. Transition-audit task: N/A — spec §3.3: transition inventory unchanged, no new visual states.

## Prefetch-immunity audit of existing e2e (spec §6 mandatory item)

Under the #493 CI prod server these three specs will run WITH prefetch active. Audit result (test-by-test mechanics verified against source this session):

| Spec | Open mechanics | Verdict |
| --- | --- | --- |
| `published-review-modal.layout.spec.ts` | Standalone node:http harness, never touches :3000 | Immune — no app server. |
| `published-review-modal.deeplink.spec.ts` | Every test opens via direct `page.goto(...)` (lines 120-288) — hard navigations, Link prefetch not involved | Immune. Mount refresh adds one background RSC request per open; no test asserts network quiet. |
| `published-review-modal.interactions.spec.ts` | Three open classes: (a) `openModal` direct goto (`:102`) — immune like deeplink; (b) `openGated` (`:492-509`) installs a `?show=<slug>`-matched route BEFORE `page.goto`, so viewport prefetch requests are HELD by the same gate → cache never populates → the click is the cold path the test assumes — premise preserved; (c) row-click tests (`:337`, `:223`) assert skeleton ABSENCE/handoff and focus restore, never skeleton PRESENCE — a cache-served instant commit satisfies them (the P0 pin "no stranded skeleton after close" is about the pending-reset contract, which still runs). | Immune, with the (c) caveat that a cache-hit open makes those assertions weaker but not vacuous (pending state is still set at click and must still reset). |

Residual risk pinned by the new spec's close-safety tests: a refresh response landing around close. Existing close tests would only catch a resurrection flakily; Task 3's tests pin it deterministically. Final verification is the real `published-modal-e2e.yml` CI run on this PR (it path-triggers on `ShowsTable.tsx` + `showpage/**`).

---

### Task 1: `prefetch={true}` on both row Links (source-scan pinned)

**Files:**
- Modify: `components/admin/ShowsTable.tsx:529` (row `<Link>`)
- Modify: `components/admin/ArchivedShowRow.tsx:75` (Open `<Link>`)
- Test: `tests/components/admin/ShowsTable.test.tsx` (append describe block)

**Interfaces:** Produces the `prefetch={true}` attribute on both Links; no API changes. (Source-scan is the repo idiom for prop pins — `ShowsTable.test.tsx` already `readFileSync`s component source; jsdom cannot observe the prop because next/link consumes it.)

- [ ] **Step 1: Write the failing test** — append to `tests/components/admin/ShowsTable.test.tsx`:

```tsx
describe("modal-prefetch prop pins (spec 2026-07-19-show-modal-prefetch §2.1)", () => {
  // Source-scan, not DOM: next/link CONSUMES `prefetch` (never forwarded to the
  // anchor), so jsdom cannot observe it. Failure mode caught: the prop is
  // removed, typoed, or downgraded (prefetch={false} / auto) — the open would
  // silently fall back to the cold path on prod with zero test signal.
  const rowLink = (src: string, testid: string) => {
    const at = src.indexOf(testid);
    expect(at, `${testid} Link present`).toBeGreaterThan(-1);
    const open = src.lastIndexOf("<Link", at);
    return src.slice(open, src.indexOf(">", at));
  };

  it("ShowsTable row Link carries prefetch={true}", () => {
    const src = readFileSync("components/admin/ShowsTable.tsx", "utf8");
    expect(rowLink(src, "shows-table-row-")).toMatch(/prefetch=\{true\}/);
  });

  it("ArchivedShowRow Open Link carries prefetch={true}", () => {
    const src = readFileSync("components/admin/ArchivedShowRow.tsx", "utf8");
    expect(rowLink(src, "archived-show-open-")).toMatch(/prefetch=\{true\}/);
  });
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `pnpm vitest run tests/components/admin/ShowsTable.test.tsx -t "prefetch prop pins"`
Expected: 2 FAIL (`expected '…' to match /prefetch=\{true\}/`).

- [ ] **Step 3: Implement** — `ShowsTable.tsx` row Link gains one attribute (comment explains the non-obvious constraint):

```tsx
                  <Link
                    href={openHref(row.slug)}
                    // Full viewport prefetch (spec 2026-07-19-show-modal-prefetch):
                    // prod-only by Next's own rules; the href is byte-identical to
                    // the clicked URL, so the open is served from the router cache.
                    prefetch={true}
                    scroll={false}
                    onClick={handleRowClick(row.slug)}
```

`ArchivedShowRow.tsx` Open Link identically:

```tsx
        <Link
          href={`/admin?bucket=archived&show=${encodeURIComponent(row.slug)}`}
          // Full viewport prefetch — same contract as the active-bucket row
          // (spec 2026-07-19-show-modal-prefetch §2.1).
          prefetch={true}
          scroll={false}
```

- [ ] **Step 4: Run the whole file green**

Run: `pnpm vitest run tests/components/admin/ShowsTable.test.tsx`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add components/admin/ShowsTable.tsx components/admin/ArchivedShowRow.tsx tests/components/admin/ShowsTable.test.tsx
git commit --no-verify -m "feat(admin): full viewport prefetch on both show-modal row links"
```

---

### Task 2: once-per-mount `router.refresh()` in `PublishedReviewModal`

**Files:**
- Modify: `components/admin/showpage/PublishedReviewModal.tsx` (import + effect after `const { close } = useShowModalNav();` at :131)
- Test: `tests/components/admin/showpage/publishedReviewModal.test.tsx`

**Interfaces:** Consumes `useRouter` from `next/navigation`. Produces no API change; behavior contract = exactly one `refresh()` per mounted shell instance (spec §3.2/§3.4 unit oracle).

- [ ] **Step 1: Make the mock's refresh spy stable.** The existing unified mock (`publishedReviewModal.test.tsx:27-31`) returns a FRESH `vi.fn()` per `useRouter()` call — a count assertion would be vacuous. Hoist one spy:

```tsx
const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: routerPush }),
  // …keep the file's existing useSearchParams etc. exports unchanged
}));
```

(Only the `refresh:` value changes — keep every other export of the existing mock verbatim. Grep the file for other `refresh` assertions first; none exist today.)

- [ ] **Step 2: Write the failing test** — append:

```tsx
describe("revalidate-on-open (spec 2026-07-19-show-modal-prefetch §3.2)", () => {
  it("fires router.refresh() exactly once per mount — rerenders and StrictMode double-effects do not multiply it", () => {
    routerRefresh.mockClear();
    // StrictMode reproduces the dev double-effect (setup→cleanup→setup): the
    // ref guard must dedupe it. Failure modes caught: dead revalidate (0 calls)
    // and per-render/per-effect refresh storm (>1).
    const { rerender } = render(
      <StrictMode>
        <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
          <PublishedReviewModal {...baseProps()} />
        </ShareTokenProvider>
      </StrictMode>,
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);
    rerender(
      <StrictMode>
        <ShareTokenProvider initialToken="TOK" initialEpoch={5}>
          <PublishedReviewModal {...baseProps()} />
        </ShareTokenProvider>
      </StrictMode>,
    );
    expect(routerRefresh).toHaveBeenCalledTimes(1);
  });
});
```

(`baseProps()` is the file's existing props factory at `publishedReviewModal.test.tsx:132`; the file's `renderModal()` helper (`:176`) is NOT reused because the StrictMode wrapper must own the mount; the `ShareTokenProvider` wrapper is copied from `renderModal` (`:181-183`) — the tree consumes its context. Import `StrictMode` from `react`.)

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx -t "revalidate-on-open"`
Expected: FAIL — `expected 0 to be 1`.

- [ ] **Step 4: Implement** — in `PublishedReviewModal.tsx`, add `useRouter` to the existing `next/navigation`-adjacent imports and the effect right after the `useShowModalNav` line:

```tsx
import { useRouter } from "next/navigation";
```

```tsx
  const { close } = useShowModalNav();
  // Revalidate-on-open (spec 2026-07-19-show-modal-prefetch §3.2): a prefetched
  // open serves the router cache (possibly minutes old); one background
  // router.refresh() streams fresh RSC and reconciles in place. Ref guard =
  // exactly once per mounted instance (StrictMode double-effect dedupe); a
  // REOPEN is a new instance (streams through the Suspense fallback), so it
  // refreshes again — that is the intended per-open cadence.
  const router = useRouter();
  const refreshFiredRef = useRef(false);
  useEffect(() => {
    if (refreshFiredRef.current) return;
    refreshFiredRef.current = true;
    router.refresh();
  }, [router]);
```

- [ ] **Step 5: Run the whole file green**

Run: `pnpm vitest run tests/components/admin/showpage/publishedReviewModal.test.tsx`
Expected: PASS (all — the stable-spy mock change must not break existing tests; if any other test asserted a per-call fresh refresh fn, fix it to use `routerRefresh`).

- [ ] **Step 6: Commit**

```bash
git add components/admin/showpage/PublishedReviewModal.tsx tests/components/admin/showpage/publishedReviewModal.test.tsx
git commit --no-verify -m "feat(admin): show modal revalidates once on open via router.refresh"
```

---

### Task 3: prod-server e2e — `published-review-modal.prefetch.spec.ts`

**Files:**
- Create: `tests/e2e/published-review-modal.prefetch.spec.ts`
- Modify: `playwright.config.ts:70` (desktop-chromium testMatch — add `published-review-modal\.prefetch` to the alternation, next to the existing `published-review-modal\.interactions`)

**Interfaces:** Consumes helpers verbatim from the interactions spec: `signInAs`/`ADMIN_FIXTURE`, `seedShowWithCrew`/`deleteSeededShow`, `settleDashboardAdminState`, plus the selector constants (`BASE`, `MODAL`, `MODAL_ANY`, `CLOSE` — copy the exact definitions from `interactions.spec.ts:51-64`, they are file-local). Env gate: `MODAL_PREFETCH_E2E=1` (prod servers only — desktop-chromium's local :3000 is `pnpm dev`, where prefetch is inert by design; the X.5 env-gate precedent).

- [ ] **Step 1: Write the spec** (all tests red-proofable: each names the failure mode it catches):

```ts
/**
 * tests/e2e/published-review-modal.prefetch.spec.ts
 * (spec docs/superpowers/specs/2026-07-19-show-modal-prefetch.md §6)
 *
 * PROD-SERVER-ONLY (MODAL_PREFETCH_E2E=1): Next disables Link prefetch in dev,
 * so these assertions are meaningful only against a `pnpm build && pnpm start`
 * server — locally that means booting :3000 as a prod artifact (see plan Task 3
 * Step 3); in CI, published-modal-e2e.yml's :3000 webServer already is one.
 *
 * Network-assertion posture (spec §3.4, ratified): presence/boundedness only.
 * Exact refresh-once lives in the unit test (publishedReviewModal.test.tsx).
 */
import { test, expect, type Page } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { settleDashboardAdminState } from "./helpers/dashboardState";

const BASE = "published-show-review";
const MODAL_ANY = `[data-testid="${BASE}-modal"]`;
const MODAL = `${MODAL_ANY}:has([data-testid="${BASE}-title"])`;
const CLOSE = `[data-testid="${BASE}-close"]`;
const POPUP = { width: 1280, height: 800 };

// Spec §6.3(b): cache open (0 nav) + refresh + one re-warm probe/twin pair.
// A per-render storm produces dozens; 4 is the documented ceiling.
const OPEN_SLUG_REQUEST_BOUND = 4;
const PREFETCH_SETTLE_MS = 4_000;
const POST_OPEN_WINDOW_MS = 5_000;

test.skip(
  process.env.MODAL_PREFETCH_E2E !== "1",
  "prod-server-only: Link prefetch is inert on the local dev :3000 server",
);

let show: SeededShow;
let restoreDashboardState: (() => Promise<void>) | null = null;

test.describe("published review modal — prefetch + revalidate (prefetch spec §6)", () => {
  test.beforeAll(async () => {
    restoreDashboardState = await settleDashboardAdminState();
    show = await seedShowWithCrew({});
  });
  test.afterAll(async () => {
    if (show) await deleteSeededShow(show.driveFileId);
    await restoreDashboardState?.();
  });

  /** URL predicate: any RSC request addressing this slug's modal. */
  const isShowReq = (u: URL, slug: string) => u.searchParams.get("show") === slug;

  async function loadDashboard(page: Page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(POPUP);
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin");
    await expect(page.getByTestId(`shows-table-row-${show.slug}`)).toBeVisible({
      timeout: 30_000,
    });
  }

  test("§6.1 dashboard load emits a viewport prefetch for a visible row before any click", async ({
    page,
  }) => {
    // Failure mode caught: prefetch={true} dropped/downgraded → NO ?show=<slug>
    // request exists before the click and this times out.
    const seen = page.waitForRequest(
      (r) => isShowReq(new URL(r.url()), show.slug),
      { timeout: 15_000 },
    );
    await loadDashboard(page);
    await seen;
  });

  test("§6.2 cache proof: loaded modal renders while every post-settle ?show request is HELD", async ({
    page,
  }) => {
    await loadDashboard(page);
    await page.waitForTimeout(PREFETCH_SETTLE_MS);
    // Hold (never fulfill) EVERY subsequent request for this slug — navigation
    // and refresh alike. Only a router-cache-served open can paint the loaded
    // modal now. Failure mode caught: silent prefetch downgrade → the click
    // becomes a cold navigation that blocks on the held route → only the
    // skeleton appears → the MODAL (title-bearing) wait times out.
    const held: Array<() => void> = [];
    await page.route(
      (u) => isShowReq(u, show.slug),
      async (route) => {
        await new Promise<void>((resolve) => held.push(resolve));
        await route.continue();
      },
    );
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
    for (const release of held) release();
  });

  test("§6.3 revalidate reaches the network post-open, bounded (no refresh storm)", async ({
    page,
  }) => {
    await loadDashboard(page);
    await page.waitForTimeout(PREFETCH_SETTLE_MS);
    const openSlugRequests: number[] = [];
    const t0 = Date.now();
    let openAt = Number.POSITIVE_INFINITY;
    page.on("request", (r) => {
      if (isShowReq(new URL(r.url()), show.slug)) openSlugRequests.push(Date.now() - t0);
    });
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
    openAt = Date.now() - t0;
    await page.waitForTimeout(POST_OPEN_WINDOW_MS);
    const postOpen = openSlugRequests.filter((t) => t >= openAt);
    // (a) presence: the mount refresh reaches the network (dead-revalidate
    // detector — with a broken effect this array is empty);
    expect(postOpen.length, "at least one post-open request (the refresh)").toBeGreaterThan(0);
    // (b) boundedness: a per-render refresh storm fires dozens in the window.
    expect(postOpen.length, "no refresh storm").toBeLessThanOrEqual(OPEN_SLUG_REQUEST_BOUND);
  });

  for (const motion of ["reduce", "no-preference"] as const) {
    test(`§6.4 close safety (${motion}): a refresh released around close never resurrects the modal`, async ({
      page,
    }) => {
      // Covers spec §3.2 cases 1+3 (motion=no-preference exercises the exit
      // window; reduce collapses it) and case 2 (release lands after the close
      // commit). Failure mode caught: the refreshed RSC payload for the OPEN
      // URL remounting/re-showing the shell after close.
      await loadDashboard(page);
      await page.emulateMedia({ reducedMotion: motion });
      await page.waitForTimeout(PREFETCH_SETTLE_MS);
      const held: Array<() => void> = [];
      await page.route(
        (u) => isShowReq(u, show.slug),
        async (route) => {
          await new Promise<void>((resolve) => held.push(resolve));
          await route.continue();
        },
      );
      await page.getByTestId(`shows-table-row-${show.slug}`).click();
      await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
      await page.locator(CLOSE).click();
      // Release the held refresh DURING the exit window (no-preference) /
      // right after the instant close (reduce)…
      for (const release of held) release();
      // …and the modal must still end gone, URL stripped, and STAY gone.
      await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 5_000 });
      await expect
        .poll(() => new URL(page.url()).searchParams.has("show"), { timeout: 15_000 })
        .toBe(false);
      await page.waitForTimeout(1_000);
      await expect(page.locator(MODAL_ANY)).toHaveCount(0);
    });
  }
});
```

- [ ] **Step 2: testMatch** — in `playwright.config.ts:70` extend the desktop-chromium alternation: `published-review-modal\.interactions|published-review-modal\.deeplink|published-review-modal\.prefetch|step3-review-modal\.interactions`.

- [ ] **Step 3: Red-proof the gate, then verify green against a local prod server.**

```bash
# (a) skip path: without the env flag the spec must SKIP (not fail) —
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.prefetch.spec.ts
# Expected: 5 skipped.

# (b) boot a prod :3000 (kill any sibling dev server on :3000 first — lsof -i :3000):
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true \
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
NEXT_DIST_DIR=.next-prefetch-probe pnpm build
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true \
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
NEXT_DIST_DIR=.next-prefetch-probe pnpm exec next start -H 127.0.0.1 --port 3000 &
# (c) run gated (reuseExistingServer attaches to the prod server):
MODAL_PREFETCH_E2E=1 ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.prefetch.spec.ts
# Expected: 5 passed. Then kill the server and `git checkout tsconfig.json`.
```

Red-proof note: Task 3 may be implemented before/after Tasks 1-2 land in the worktree; if run BEFORE them, §6.1/§6.2 must FAIL (that is the red state). Run order in this plan (Tasks 1-2 first) means red-proofing is by reverting: `git stash` the Task 1 commit is NOT required — instead red-proof §6.2 by temporarily changing `prefetch={true}` to `prefetch={false}` locally, observing the timeout, and restoring. Record the observation in the commit message body.

- [ ] **Step 4: Commit**

```bash
git checkout tsconfig.json 2>/dev/null; git add tests/e2e/published-review-modal.prefetch.spec.ts playwright.config.ts
git commit --no-verify -m "test(admin): prod-server e2e for show-modal prefetch + revalidate"
```

---

### Task 4: join the #493 CI gate

**Files:**
- Modify: `.github/workflows/published-modal-e2e.yml` — three edits:

- [ ] **Step 1: Edit the workflow.**
  1. `on.pull_request.paths`: add two entries alongside the existing ones:
     ```yaml
     - "components/admin/ArchivedShowRow.tsx"
     - "tests/e2e/published-review-modal.prefetch.spec.ts"
     ```
  2. `jobs.published-modal-e2e.env`: add `MODAL_PREFETCH_E2E: "1"` (with a comment: `# :3000 here IS a prod build (CI=true → pnpm build && pnpm start) — the prefetch spec's gate`).
  3. The run step: append ` tests/e2e/published-review-modal.prefetch.spec.ts` to the existing `pnpm exec playwright test --project=desktop-chromium …` file list.

- [ ] **Step 2: Validate YAML**

Run: `pnpm exec prettier --check .github/workflows/published-modal-e2e.yml || pnpm exec prettier --write .github/workflows/published-modal-e2e.yml` then `node -e "require('js-yaml') && console.log('ok')" 2>/dev/null || python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/published-modal-e2e.yml'));print('yaml ok')"`
Expected: `yaml ok`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/published-modal-e2e.yml
git commit --no-verify -m "infra: prefetch e2e joins the published-modal CI gate"
```

(Real verification is the workflow's own run on the PR — Stage 4. `workflow_dispatch` also allows `gh workflow run published-modal-e2e.yml --ref feat/show-modal-prefetch` after push.)

---

### Task 5: existing-suite regression evidence

**Files:** none (verification-only task; audit table lives in this plan's header).

- [ ] **Step 1:** Run the three existing modal specs against the local dev server (their normal local mode — prefetch inert; proves no incidental breakage from Tasks 1-2):

```bash
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.interactions.spec.ts tests/e2e/published-review-modal.deeplink.spec.ts tests/e2e/published-review-modal.layout.spec.ts
```
Expected: all pass (same counts as pre-change `origin/main` run; if a failure appears, verify it at the merge base first — pre-existing-failure discipline).

- [ ] **Step 2:** Prod-mode spot-check of the two premise-sensitive gated-entrance tests against the Task 3 prod server (prefetch ACTIVE — the audit's held-prefetch argument verified live):

```bash
MODAL_PREFETCH_E2E=1 ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.interactions.spec.ts -g "closed→open entrance"
```
Expected: pass. Record both outcomes in the Task 5 commit-message body (empty commit):

```bash
git commit --allow-empty --no-verify -m "test(admin): existing modal e2e regression evidence under prefetch" -m "<paste the two run summaries>"
```

---

### Task 6: close-out gates (this worktree, before cross-model review)

- [ ] **Step 1:** Delete the scratch probe tooling: `rm -f scripts/dev/prefetch-probe.ts scripts/dev/prefetch-probe-abort.ts scripts/dev/prefetch-probe-settle-abort.ts; rmdir scripts/dev 2>/dev/null || true` (uncommitted — must not ride into the PR).
- [ ] **Step 2:** Full pre-push gate battery (green ≠ green lessons): `pnpm test` → `pnpm typecheck` → `pnpm lint` → `pnpm format:check` → `pnpm build`. All green; `git checkout tsconfig.json` afterwards if dirty.
- [ ] **Step 3:** Invariant-8 impeccable dual-gate on the UI diff (`/impeccable critique` + `/impeccable audit` with the canonical v3 setup: context.mjs load → register read). P0/P1 fixed or DEFERRED.md-logged. The visual delta is tiny (no pixel changes) — expected fast pass; the CDP frame check of spec §3.3 (cache-hit open: no NEW entrance artifact vs today's fast-network open) happens here.
- [ ] **Step 4:** Update `.claude/ship-state.json` → `stage: "4 — close-out"`.
