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

Open-mechanics classes: **[G]oto** = direct `page.goto("/admin?show=…")`, a hard navigation — Link prefetch never participates; immune by construction (the mount refresh adds one background RSC request post-open; no test asserts network quiet). **[GATED]** = `openGated` (`interactions.spec.ts:492-509`) installs a `?show=<slug>`-matched route BEFORE `page.goto`, so viewport prefetch requests are held by the same gate → cache never populates → the click is the cold path the test assumes. **[ROW]** = dashboard row click, where a cache hit changes timing but the test's oracle does not require a cold open (argued per test). **[HARNESS]** = self-hosted node:http server (`layout.spec.ts:42,141`), :3000 never contacted.

Every test, enumerated:

| Test (file:line) | Class | Immunity argument |
| --- | --- | --- |
| layout `:168` §6.6 panel-column equations (mode × width matrix, one `test()` per combination) · `:232` header rhythm (title→strip gap) | HARNESS | Immune — the spec self-hosts its fixture over node:http (`:42,141`) and never contacts :3000. |
| deeplink `:160` cold open · `:180` alert_id highlight · `:199` #share-access · `:207` legacy 307 · `:225` combined legacy · `:266` unknown slug D8 · `:282` signed-out D10 | G | Immune — all hard navigations. |
| interactions `:172` focus trap · `:278` Esc strips params · `:306` scrim · `:322` X close · `:382` browser Back · `:400` drag dismiss · `:429` spring-back · `:461` slop tap · `:554` reduced-motion entrance · `:562` compound viewport-cross · `:607` sheet sanity · `:714` §7.5(a) Esc exit · `:750` §7.5(a) desktop exit · `:786` §7.5(c) focus after exit · `:801` §7.5(d) drag+Esc · `:825` §7.5(e) spring-back close · `:860` §7.5(f) entrance close | G | Immune — every one opens via `openModal` (direct goto `:102`); close/exit oracles are about the shell, not the open path. |
| interactions `:511` §6.5 entrance <sm · `:538` §6.5 entrance ≥sm | GATED | Premise (cold open, skeleton frozen) preserved: the pre-goto gate holds prefetch requests too, so the cache never fills and the click blocks on the held navigation exactly as today. |
| interactions `:223` focus continuity (row click) | ROW | Oracle = focus restored to trigger after Esc-close; open speed is irrelevant. Uses `waitForRowHydration` (`:137`), so the click is always a client nav — cache-hit or cold both exercise the shell mount/unmount pair it pins. |
| interactions `:337` no stranded skeleton (row click, critique P0) | ROW | Oracle = pending-reset contract: skeleton ABSENCE after close commit + focus restore + zero frames post-commit. `pending` state is still set at click and must still reset on the (now faster) commit — non-vacuous under cache hits; never asserts skeleton PRESENCE. |

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

  /** Copied from interactions.spec.ts:137-152 (file-local there): a
   *  pre-hydration row click is a full document navigation — no client nav, no
   *  router cache, no optimistic path — which would make every click-driven
   *  assertion here measure hydration timing instead of prefetch behavior. */
  async function waitForRowHydration(page: Page, slug: string): Promise<void> {
    await expect
      .poll(
        () =>
          page.evaluate((tid) => {
            const el = document.querySelector(`[data-testid="${tid}"]`) as
              | (Element & Record<string, { onClick?: unknown }>)
              | null;
            if (!el) return false;
            return Object.keys(el).some(
              (k) => k.startsWith("__reactProps$") && typeof el[k]?.onClick === "function",
            );
          }, `shows-table-row-${slug}`),
        { message: "row link hydrated (React onClick attached)", timeout: 30_000 },
      )
      .toBe(true);
  }

  async function loadDashboard(page: Page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(POPUP);
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto("/admin");
    await expect(page.getByTestId(`shows-table-row-${show.slug}`)).toBeVisible({
      timeout: 30_000,
    });
    await waitForRowHydration(page, show.slug);
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
    page.on("request", (r) => {
      if (isShowReq(new URL(r.url()), show.slug)) openSlugRequests.push(Date.now() - t0);
    });
    // Window anchored at CLICK time, not modal-visible time: the mount refresh
    // is only guaranteed to fire after React mount, which can precede the
    // Playwright visibility assertion resolving — an openAt anchor would race
    // a correct implementation into a false failure. A cache-served open
    // issues NO navigation request, so any post-click ?show=<slug> traffic is
    // revalidate/re-warm by construction (a silent prefetch downgrade instead
    // surfaces in the §6.2 cache proof, not here).
    const clickAt = Date.now() - t0;
    await page.getByTestId(`shows-table-row-${show.slug}`).click();
    await expect(page.locator(MODAL)).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(POST_OPEN_WINDOW_MS);
    const postClick = openSlugRequests.filter((t) => t >= clickAt);
    // (a) presence: the mount refresh reaches the network (dead-revalidate
    // detector — with a broken effect this array is empty);
    expect(postClick.length, "at least one post-click request (the refresh)").toBeGreaterThan(0);
    // (b) boundedness: a per-render refresh storm fires dozens in the window.
    expect(postClick.length, "no refresh storm").toBeLessThanOrEqual(OPEN_SLUG_REQUEST_BOUND);
  });

  /** Shared §6.4 scaffold: open with every post-settle ?show request HELD, then
   *  close, then hand the release decision to the case. Each case ASSERTS the
   *  refresh was genuinely captured (held.length > 0) before releasing — a
   *  vacuous release-of-nothing cannot pass. */
  async function openHeldThenClose(page: Page, motion: "reduce" | "no-preference") {
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
    // EVERY ?show=<slug> request from pre-click onward is in the trap — the
    // cache-served open issues no navigation, so whatever lands here arrives
    // post-mount: the mount refresh (proved to fire by the unit oracle and
    // §6.3's presence assertion) is necessarily AMONG the held requests when
    // the case releases them; re-warm twins may be held alongside it, which
    // only widens the release. held.length > 0 additionally proves the trap
    // actually captured traffic (a release-of-nothing cannot pass).
    await expect.poll(() => held.length, { timeout: 10_000 }).toBeGreaterThan(0);
    await page.locator(CLOSE).click();
    return held;
  }

  async function assertClosedForGood(page: Page) {
    await expect(page.locator(MODAL_ANY)).toHaveCount(0, { timeout: 5_000 });
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), { timeout: 15_000 })
      .toBe(false);
    await page.waitForTimeout(1_000);
    await expect(page.locator(MODAL_ANY)).toHaveCount(0);
  }

  test("§6.4a close safety — refresh released DURING the animated exit (spec §3.2 case 1)", async ({
    page,
  }) => {
    // CLOSE MODEL (do not "fix" this to expect an instant URL strip): under
    // normal motion the shell's requestClose plays the exit and calls onClose
    // only at exit-END (transitionend, ReviewModalShell.tsx:389; reduced
    // motion short-circuits at :345) — PublishedReviewModal.handleClose (:141, the
    // "instant close" header comment predates #488) therefore pushes the
    // close URL ~220ms AFTER the click, so the URL check below runs inside
    // that window. Release immediately after the close click: the refreshed
    // payload for the OPEN URL lands mid-exit. Failure mode: the refresh
    // remounts/reshows the shell (resurrection) or restarts the exit.
    const held = await openHeldThenClose(page, "no-preference");
    expect(new URL(page.url()).searchParams.get("show"), "URL still open mid-exit").toBe(
      show.slug,
    );
    for (const release of held) release();
    await assertClosedForGood(page);
  });

  test("§6.4b close safety — refresh released AFTER the close commit (spec §3.2 case 2)", async ({
    page,
  }) => {
    // Keep the trap shut until the close navigation commits (?show stripped),
    // THEN release. Failure mode: a late refresh response for the pre-close
    // URL re-rendering the modal slot over the closed dashboard.
    const held = await openHeldThenClose(page, "no-preference");
    await expect
      .poll(() => new URL(page.url()).searchParams.has("show"), { timeout: 15_000 })
      .toBe(false);
    for (const release of held) release();
    await assertClosedForGood(page);
  });

  test("§6.4c close safety — reduced motion (spec §3.2 case 3)", async ({ page }) => {
    // Instant close (exit collapsed): case 1 degenerates into case 2.
    const held = await openHeldThenClose(page, "reduce");
    for (const release of held) release();
    await assertClosedForGood(page);
  });
});
```

- [ ] **Step 2: testMatch** — in `playwright.config.ts:71` (desktop-chromium), INSERT `published-review-modal\.prefetch|` into the existing alternation immediately after `published-review-modal\.layout|` — an insertion, never a rewrite; the post-edit tail must read `…|published-review-modal\.interactions|published-review-modal\.deeplink|published-review-modal\.layout|published-review-modal\.prefetch|step3-review-modal\.interactions)…` with every pre-existing entry (including `\.layout`) intact. Verify with `rg -o 'published-review-modal\\.(interactions|deeplink|layout|prefetch)' playwright.config.ts | sort | uniq -c` — expected output: one count line for EACH of the four variants (interactions, deeplink, layout, prefetch), i.e. all four entries present; a dropped `.layout` or missing `.prefetch` shows up as a missing row.

- [ ] **Step 3: Red-proof the gate, then verify green against a local prod server.**

```bash
# (a) skip path: without the env flag the spec must SKIP (not fail) —
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.prefetch.spec.ts
# Expected: 6 skipped.

# (b) boot a prod :3000 (kill any sibling dev server on :3000 first — lsof -i :3000):
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true \
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
NEXT_DIST_DIR=.next-prefetch-probe pnpm build
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true \
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
NEXT_DIST_DIR=.next-prefetch-probe pnpm exec next start -H 127.0.0.1 --port 3000 &
# (b2) READINESS GATE — without this, Playwright may find :3000 unreachable and
# boot its own `pnpm dev` webServer (playwright.config.ts:233), silently running
# the prod-only spec against a dev server and voiding the proof:
until curl -sf -o /dev/null http://127.0.0.1:3000/auth/sign-in; do sleep 1; done
# (c) run gated (reuseExistingServer now attaches to the READY prod server):
MODAL_PREFETCH_E2E=1 ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.prefetch.spec.ts
# Expected: 6 passed. Then kill the server and `git checkout tsconfig.json`.
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

- [ ] **Step 1: Write the failing check** (the red half — a structural assertion the workflow carries all three prefetch-gate entries; parses the YAML, no string matching on comments):

```bash
cat > /tmp/check-prefetch-gate.py <<'PY'
import sys, yaml
wf = yaml.safe_load(open(".github/workflows/published-modal-e2e.yml"))
paths = wf[True]["pull_request"]["paths"] if True in wf else wf["on"]["pull_request"]["paths"]
job = wf["jobs"]["published-modal-e2e"]
run = next(s["run"] for s in job["steps"] if "playwright test" in s.get("run", ""))
ok = True
for want, where in [
    ("components/admin/ArchivedShowRow.tsx", paths),
    ("tests/e2e/published-review-modal.prefetch.spec.ts", paths),
]:
    if want not in where: print(f"MISSING path filter: {want}"); ok = False
if job.get("env", {}).get("MODAL_PREFETCH_E2E") != "1":
    print("MISSING env MODAL_PREFETCH_E2E=1"); ok = False
if "tests/e2e/published-review-modal.prefetch.spec.ts" not in run:
    print("MISSING prefetch spec in run line"); ok = False
sys.exit(0 if ok else 1)
PY
python3 /tmp/check-prefetch-gate.py
```

- [ ] **Step 2: Run to verify it fails** — Expected: all four `MISSING …` lines (two path filters, the env var, the run-line entry), exit 1.

- [ ] **Step 3: Edit the workflow.**
  1. `on.pull_request.paths`: add two entries alongside the existing ones:
     ```yaml
     - "components/admin/ArchivedShowRow.tsx"
     - "tests/e2e/published-review-modal.prefetch.spec.ts"
     ```
  2. `jobs.published-modal-e2e.env`: add `MODAL_PREFETCH_E2E: "1"` (with a comment: `# :3000 here IS a prod build (CI=true → pnpm build && pnpm start) — the prefetch spec's gate`).
  3. The run step: append ` tests/e2e/published-review-modal.prefetch.spec.ts` to the existing `pnpm exec playwright test --project=desktop-chromium …` file list.

- [ ] **Step 4: Run the check green + format**

Run: `python3 /tmp/check-prefetch-gate.py && pnpm exec prettier --check .github/workflows/published-modal-e2e.yml`
Expected: exit 0, prettier clean (write+re-check if not).

- [ ] **Step 5: Commit**

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

- [ ] **Step 2:** Prod-mode spot-check of the two premise-sensitive gated-entrance tests (prefetch ACTIVE — the audit's held-prefetch argument verified live). The Task 3 server was killed at the end of Task 3, so boot a fresh one FIRST and gate on readiness — without a ready :3000, Playwright silently boots `pnpm dev` (playwright.config.ts:233,237) and the "prefetch active" claim is void:

```bash
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true \
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
NEXT_DIST_DIR=.next-prefetch-probe pnpm build
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true \
ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
NEXT_DIST_DIR=.next-prefetch-probe pnpm exec next start -H 127.0.0.1 --port 3000 &
until curl -sf -o /dev/null http://127.0.0.1:3000/auth/sign-in; do sleep 1; done
MODAL_PREFETCH_E2E=1 ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP \
pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.interactions.spec.ts -g "closed→open entrance"
# then kill the server and `git checkout tsconfig.json`
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
