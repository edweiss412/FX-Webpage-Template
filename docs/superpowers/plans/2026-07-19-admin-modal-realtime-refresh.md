# Admin Show Modal — Realtime Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the existing `ShowRealtimeBridge` in the admin published-show modal loader so a cron publish broadcasts a debounced `router.refresh()` and the open modal reconciles in place.

**Architecture:** One serial `viewer_version_token` RPC read added to `app/admin/_showReviewModal.tsx` (token-first, before the Promise.all wave), feeding a `<ShowRealtimeBridge>` mounted as the LAST child inside `ShareTokenProvider`. Fail-open on read fault (log + render without bridge). Zero changes to the bridge, its API routes, channel topology, RLS, or DB.

**Tech Stack:** Next 16 App Router RSC, Supabase Realtime (private Broadcast channel), Vitest (jsdom loader suite), Playwright (desktop-chromium, CI prod server via `published-modal-e2e.yml`).

**Spec:** `docs/superpowers/specs/2026-07-19-admin-modal-realtime-refresh.md` (APPROVED, 6 adversarial rounds). Its §1.1 resolved-scope table binds; §8.5 advisories are MANDATORY here.

## Global Constraints

- Invariant 5: no raw error codes in UI — the new code is log-only, never rendered.
- Invariant 9: the new Supabase call destructures `{ data, error }`; returned-error and thrown paths distinct; both emit `ADMIN_SHOW_VERSION_TOKEN_READ_FAILED` (a forensic code — `NEW_FORENSIC_CODES` row, NOT §12.4).
- Invariant 11: all work in this worktree (`/Users/ericweiss/FX-worktrees/admin-modal-realtime-refresh`); commits `--no-verify`; conventional-commits.
- Token read is NEVER cached (`unstable_cache`/`"use cache"` forbidden — pinned by test, spec §8.5.2).
- Bridge mount is UNCONDITIONAL across published/unpublished/archived.
- Bridge renders after `PublishedReviewModal` — strictly the LAST child.
- E2E oracle constants (quiet window ≥ 250ms floor, websocket frame predicate) are pinned by Task 3's spike measurements — requirements fixed by spec §8.4, constants by measurement.

## Meta-test inventory (declared)

- EXTENDS `tests/app/admin/showReviewModalLoader.test.tsx` (loader behavior).
- EXTENDS `tests/admin/_showReviewReadPathPin.test.ts` (new single-caller pin for `viewer_version_token` in the loader + never-cached source pin).
- CONFIRMS `tests/admin/_metaInfraContract.test.ts` §B proximity guard passes over the new call boundary (registry row only if the guard demands one — the read is an inline loader closure like `readToken`, which carries no standalone registry row).
- EXTENDS `tests/log/_auditableMutations.ts` `NEW_FORENSIC_CODES`.
- Advisory locks: NOT touched (spec §9 declaration; no `pg_advisory*` anywhere in the diff).

---

### Task 1: Loader token read + bridge mount (unit TDD)

**Files:**

- Modify: `app/admin/_showReviewModal.tsx` (token read after the slug→id lookup at `:134`, before the `Promise.all` at `:224-240`; bridge mount in the return at `:370-407`)
- Modify: `tests/app/admin/showReviewModalLoader.test.tsx` (mock extension + new describe block)
- Modify: `tests/log/_auditableMutations.ts` (one string in `NEW_FORENSIC_CODES`, `ADMIN_SHOW_*` cluster at `:627-631`)

**Interfaces:**

- Consumes: `ShowRealtimeBridge` props `{ showId: string; slug: string; renderVersion: string }` (`components/realtime/ShowRealtimeBridge.tsx:110-114`); `supabase.rpc("viewer_version_token", { p_show_id })` returning `{ data: string | null, error }`.
- Produces: the loader renders `<ShareTokenProvider>[<PublishedReviewModal …/>, <ShowRealtimeBridge …/> | null]</ShareTokenProvider>` — Task 4's e2e relies on the bridge being live on `/admin?show=<slug>`.

- [ ] **Step 1: Extend the test file's mocks.** In `tests/app/admin/showReviewModalLoader.test.tsx`:

In the `state` hoisted object, add:

```ts
  // viewer_version_token RPC (realtime-refresh plan Task 1).
  versionToken: "vt-1" as string | number | null, // number → exercises the non-string coercion
  versionTokenError: null as { message: string } | null,
  versionTokenThrows: false as boolean,
  // Ordered read log: every mocked read pushes its name on ENTRY. The
  // read-order test asserts "versionToken" precedes EVERY wave reader.
  readOrder: [] as string[],
  // Captured rpc args for the arg-binding pin.
  versionTokenArgs: null as unknown,
```

In the `createSupabaseServerClient` mock's `rpc` handler, add a branch BEFORE the fallback:

```ts
      if (fn === "viewer_version_token") {
        state.readOrder.push("versionToken");
        state.versionTokenArgs = args; // second rpc param — extend the signature to (fn, args)
        if (state.versionTokenThrows) throw new Error("META: version token rpc await fault");
        return { data: state.versionToken, error: state.versionTokenError };
      }
```

(Change the mock signature to `rpc: async (fn: string, args?: unknown)`.) Add `state.readOrder.push("finalize")` inside the `readfinalizeowned_b2` branch, and `state.readOrder.push("snapshot" | "feed" | "token" | "ignored" | "alerts")` at the top of each corresponding module mock (`readShowReviewSnapshot`, `readShowChangeFeed`, `loadShowShareToken`, `loadIgnoredWarnings`, `fetchPerShowAlerts`). Reset `state.readOrder = []` and `state.versionTokenArgs = null` in the suite's `beforeEach`.

Mock the bridge so tree assertions are cheap (top of file with the other `vi.mock`s):

```ts
vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: (props: Record<string, unknown>) => (
    <div data-testid="mock-realtime-bridge" data-props={JSON.stringify(props)} />
  ),
}));
```

- [ ] **Step 2: Write the failing tests.** New describe block at the end of the file:

```tsx
describe("show review modal loader — realtime bridge (realtime-refresh spec §4)", () => {
  function bridgeChild(ui: ReactElement): ReactElement | null {
    // Loader returns <ShareTokenProvider>{[modal, bridge?]}</ShareTokenProvider>.
    const children = (ui.props as { children: unknown }).children;
    const arr = Array.isArray(children) ? children : [children];
    const bridges = arr.filter(
      (c) => isValidElement(c) && typeof c.type === "function" &&
        (c.type as { name?: string }).name === "ShowRealtimeBridge",
    );
    return (bridges[0] as ReactElement) ?? null;
  }
  function childOrder(ui: ReactElement): string[] {
    const children = (ui.props as { children: unknown }).children;
    const arr = Array.isArray(children) ? children : [children];
    return arr
      .filter((c) => isValidElement(c))
      .map((c) => ((c as ReactElement).type as { name?: string }).name ?? "anon");
  }

  it("token ok → bridge rendered LAST with { showId, slug, renderVersion }, rpc arg-bound to p_show_id", async () => {
    state.versionToken = "vt-live";
    const ui = await buildLoaderElement();
    const bridge = bridgeChild(ui);
    expect(bridge).not.toBeNull();
    expect(bridge!.props).toMatchObject({ showId: "s1", slug: "rpas", renderVersion: "vt-live" });
    // Arg binding pin (spec §8.1 bullet 1): exact args, not just the rpc name.
    expect(state.versionTokenArgs).toEqual({ p_show_id: "s1" });
    // Child-order pin: bridge strictly AFTER the modal (last child).
    const order = childOrder(ui);
    expect(order[order.length - 1]).toBe("ShowRealtimeBridge");
    expect(order.indexOf("PublishedReviewModal")).toBeLessThan(order.indexOf("ShowRealtimeBridge"));
  });

  it("rpc returned-error → NO bridge + ADMIN_SHOW_VERSION_TOKEN_READ_FAILED warn with full field set", async () => {
    state.versionTokenError = { message: "db sad" };
    const ui = await buildLoaderElement();
    expect(bridgeChild(ui)).toBeNull();
    // Fault render still ends with the modal as the last element child —
    // removing the bridge must not shift the modal's position.
    const order = childOrder(ui);
    expect(order[order.length - 1]).toBe("PublishedReviewModal");
    const call = logSpy.warn.mock.calls.find(
      (c) => (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
    );
    expect(call, "returned-error path must emit the forensic code").toBeTruthy();
    // Spec §8.5.3: full field set, not just the code.
    expect(call![1]).toMatchObject({
      source: "admin.show",
      code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
      slug: "rpas",
      showId: "s1",
    });
    expect((call![1] as { error?: unknown }).error).toBeDefined();
  });

  it("rpc throw → NO bridge + same forensic warn (distinct thrown path)", async () => {
    state.versionTokenThrows = true;
    const ui = await buildLoaderElement();
    expect(bridgeChild(ui)).toBeNull();
    const call = logSpy.warn.mock.calls.find(
      (c) => (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
    );
    expect(call).toBeTruthy();
    expect(call![1]).toMatchObject({ source: "admin.show", slug: "rpas", showId: "s1" });
  });

  it("non-string rpc data → bridge mounts with renderVersion '' (getShowForViewer coercion parity)", async () => {
    state.versionToken = 12345;
    const ui = await buildLoaderElement();
    const bridge = bridgeChild(ui);
    expect(bridge).not.toBeNull();
    expect((bridge!.props as { renderVersion: string }).renderVersion).toBe("");
  });

  it("read-order: token rpc settles before EVERY wave reader starts (token-first, spec §4.1)", async () => {
    await buildLoaderElement();
    const tokenIdx = state.readOrder.indexOf("versionToken");
    expect(tokenIdx).toBeGreaterThanOrEqual(0);
    for (const reader of ["snapshot", "finalize", "feed", "token", "ignored", "alerts"]) {
      const idx = state.readOrder.indexOf(reader);
      expect(idx, `${reader} must start AFTER the version-token read`).toBeGreaterThan(tokenIdx);
    }
  });

  it("lifecycle variants: archived AND unpublished shows still mount the bridge (unconditional, §4.3)", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: false });
    const ui = await buildLoaderElement();
    expect(bridgeChild(ui)).not.toBeNull();
  });
});
```

(Use the file's existing `buildLoaderElement` / `baseSnapshot` helpers verbatim — they already exist, `showReviewModalLoader.test.tsx:331-339` uses both.) If `buildLoaderElement` unwraps `ShareTokenProvider` (check its return: if it returns the PROVIDER element, the helpers above work on `ui.props.children`; if it returns the modal element directly, add a sibling helper `buildProviderElement()` that returns the raw loader output — same call, no unwrap).

- [ ] **Step 3: Run the new tests — verify they FAIL.**

Run: `pnpm vitest run tests/app/admin/showReviewModalLoader.test.tsx -t "realtime bridge"`
Expected: all 6 FAIL (no bridge in tree, no rpc branch consumed, no log emit).

- [ ] **Step 4: Implement in `app/admin/_showReviewModal.tsx`.**

Import (with the other component imports):

```tsx
import { ShowRealtimeBridge } from "@/components/realtime/ShowRealtimeBridge";
```

Immediately after `const showId = showIdRow.id;` (line ~135), BEFORE `readFinalizeOwned` is defined / the wave fires:

```tsx
  // Realtime-refresh spec §4.1: viewer_version_token, TOKEN-FIRST — sampled
  // serially BEFORE the data wave (the getShowForViewer.ts:920-935 read-order
  // precedent, audit idx19): data-then-token lets a write committing between
  // the reads yield fresh-token + stale-data, which suppresses the bridge's
  // catch-up refresh → stuck stale. NEVER cached (unstable_cache would
  // re-serve a stale fence forever → refresh loop; pinned by the read-path
  // meta-test). Fault posture (§4.2): fail OPEN — log the forensic code and
  // render this pass without the bridge; the modal's revalidate-on-open
  // refresh re-runs the loader and recovers the bridge when the read heals.
  let versionToken: string | null = null;
  try {
    const { data, error } = await supabase.rpc("viewer_version_token", { p_show_id: showId });
    if (error) {
      void log.warn("viewer version token read failed:", {
        source: "admin.show",
        code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
        slug,
        showId,
        error: error.message,
      });
    } else {
      versionToken = typeof data === "string" ? data : "";
    }
  } catch (err) {
    void log.warn("viewer version token read threw:", {
      source: "admin.show",
      code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
      slug,
      showId,
      error: err,
    });
  }
```

In the return, inside `ShareTokenProvider`, AFTER `<PublishedReviewModal …/>` (strictly last child — spec §4.3 position pin):

```tsx
      {versionToken !== null ? (
        <ShowRealtimeBridge showId={showId} slug={slug} renderVersion={versionToken} />
      ) : null}
```

(NOTE: a `{null}` trailing child keeps the child ARRAY shape stable across fault/ok renders — the conditional is inside the same slot, so the modal's index never shifts either way.)

- [ ] **Step 5: Add the forensic-code registry row.** In `tests/log/_auditableMutations.ts`, inside `NEW_FORENSIC_CODES` next to `"ADMIN_SHOW_CREW_ROSTER_OVERFLOW"` (the `ADMIN_SHOW_*` cluster):

```ts
  // Realtime-refresh (2026-07-19): loader viewer_version_token read fault —
  // fail-open (render without bridge), log-only (inside log.* span; NOT cataloged).
  "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
```

- [ ] **Step 6: Run the new tests — verify they PASS, then the full adjacent suites.**

Run: `pnpm vitest run tests/app/admin/showReviewModalLoader.test.tsx tests/log tests/admin`
Expected: PASS (all files). If `_metaInfraContract.test.ts`'s §B proximity guard flags the new await, satisfy it the way the guard demands (it scans for `{ data, error }` destructuring proximity — the implementation above complies; if it requires a registry row for a named helper, the read is an inline closure like `readToken` and carries a `// not-subject-to-meta:` inline comment ONLY if the guard's error message says so — never silence it any other way).

- [ ] **Step 7: Commit.**

```bash
git add app/admin/_showReviewModal.tsx tests/app/admin/showReviewModalLoader.test.tsx tests/log/_auditableMutations.ts
git commit --no-verify -m "feat(admin): mount realtime bridge in show-review modal loader (token-first read, fail-open)"
```

---

### Task 2: Read-path pin extensions (single-caller + never-cached)

**Files:**

- Modify: `tests/admin/_showReviewReadPathPin.test.ts`

**Interfaces:**

- Consumes: the loader source from Task 1 (`.rpc("viewer_version_token"` present exactly once; no cache wrappers).
- Produces: structural pins later refactors can't silently break.

- [ ] **Step 1: Write the failing-or-green pins** (they PASS against Task 1's implementation — that is fine for structural pins; verify each FAILS by temporarily breaking the source, step 3). Append to the file's test block:

```ts
  test("the loader calls viewer_version_token exactly once (realtime-refresh §4.1 single caller)", () => {
    const source = readFileSync(join(REPO_ROOT, "app/admin/_showReviewModal.tsx"), "utf8");
    const matches = source.match(/\.rpc\(\s*["']viewer_version_token["']/g) ?? [];
    expect(matches).toHaveLength(1);
    // Arg binding is part of the pin: the call must pass p_show_id.
    expect(source).toMatch(/\.rpc\(\s*["']viewer_version_token["']\s*,\s*\{\s*p_show_id:/);
  });

  test("the loader's token read is NEVER cached (realtime-refresh §4.1 / §8.5.2)", () => {
    const source = readFileSync(join(REPO_ROOT, "app/admin/_showReviewModal.tsx"), "utf8");
    // A cached fence re-serves a stale token forever → infinite refresh loop
    // (getShowForViewer.ts:874-876 hazard). The loader must not import or use
    // any cache wrapper around its reads.
    expect(source).not.toMatch(/unstable_cache/);
    expect(source).not.toMatch(/["']use cache["']/);
  });
```

- [ ] **Step 2: Run them.**

Run: `pnpm vitest run tests/admin/_showReviewReadPathPin.test.ts`
Expected: PASS.

- [ ] **Step 3: Negative verification (anti-tautology).** Temporarily duplicate the `.rpc("viewer_version_token"` line in the loader → rerun → expect the single-caller pin FAILS; revert. Temporarily add `import { unstable_cache } from "next/cache";` → rerun → expect the never-cached pin FAILS; revert. (Do not commit the breakages.)

- [ ] **Step 4: Commit.**

```bash
git add tests/admin/_showReviewReadPathPin.test.ts
git commit --no-verify -m "test(admin): pin viewer_version_token single-caller + never-cached in modal loader"
```

---

### Task 3: E2E spike — realtime drivability probe + oracle constants (MANDATORY BEFORE Task 4)

**Files:**

- Create: `tests/e2e/helpers/realtimeOracle.ts` (constants + frame predicates, values filled from measurement)

This is the spec-§1.1-ratified empirical spike. Requirements are fixed (spec §8.4); this task measures the constants and proves drivability.

- [ ] **Step 1: Boot the stack.** `supabase start` (if not running) + `pnpm dev` (port 3000 free — check `lsof -iTCP:3000 -sTCP:LISTEN`; if a sibling worktree owns it, use an alt port config per the sibling-dev-server lesson).

- [ ] **Step 2: Drivability probe.** Seed a show (`pnpm tsx` one-off using `tests/e2e/helpers/seedShowWithCrew.ts`), open `http://localhost:3000/admin?show=<slug>` in a Playwright headed script (sign in via the `signInAs` helper pattern), then from a second terminal:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "update crew_members set role = 'Probe Role X' where show_id = '<showId>' and name = '<name>';"
```

Observe: (a) the websocket frames in the probe script (`page.on("websocket", ws => ws.on("framereceived", …))`) — record the EXACT join-reply and invalidation frame shapes for the `show:<id>:invalidation` topic; (b) whether the modal's row text updates without navigation. Record both raw frames in the spike log (step 4).

- [ ] **Step 3: Measure timings.** From the probe run, record: time from `phx_reply ok` to the catch-up `/version` response; time from DB commit to invalidation frame; time from frame to the `?show=` RSC request (should be ~100ms debounce + dispatch). Set `QUIET_WINDOW_MS = max(250, ceil(1.5 × observed debounce-to-dispatch))`.

- [ ] **Step 4: Write `tests/e2e/helpers/realtimeOracle.ts`** with the measured values:

```ts
/**
 * tests/e2e/helpers/realtimeOracle.ts (realtime-refresh plan Task 3 spike)
 *
 * Constants + frame predicates for the modal realtime e2e, pinned from the
 * 2026-07-19 spike measurements (spec §1.1: requirements are spec-fixed,
 * constants are measurement-fixed). Raw spike frames are quoted in the
 * comments below so a future Supabase realtime upgrade can re-derive them.
 */

// Quiet window for the pre-mutation quiescence gate. MUST exceed the bridge's
// 100ms debounce + dispatch latency (spec §8.4 gate 3; floor 250ms, never lower).
export const QUIET_WINDOW_MS = 250; // <- replace with measured value if higher

// Realtime websocket frame predicates (Phoenix protocol), measured in the spike:
// join reply:   {"ref":..,"topic":"realtime:show:<id>:invalidation","event":"phx_reply","payload":{"status":"ok",...}}
// invalidation: {"topic":"realtime:show:<id>:invalidation","event":"broadcast","payload":{"event":"invalidate",...}}
export function isJoinReplyOk(frameText: string, showId: string): boolean {
  try {
    const f = JSON.parse(frameText) as { topic?: string; event?: string; payload?: { status?: string } };
    return (
      f.topic === `realtime:show:${showId}:invalidation` &&
      f.event === "phx_reply" &&
      f.payload?.status === "ok"
    );
  } catch {
    return false;
  }
}

export function isInvalidationFrame(frameText: string, showId: string): boolean {
  try {
    const f = JSON.parse(frameText) as { topic?: string; event?: string };
    return f.topic === `realtime:show:${showId}:invalidation` && f.event === "broadcast";
  } catch {
    return false;
  }
}
```

Adjust the two predicates to the ACTUAL observed frame shapes — the shapes above are the expected Phoenix envelope; the spike output is authoritative. If the probe shows local Realtime broadcast is NOT drivable (no frame ever arrives on a plain `crew_members` UPDATE), STOP: implement the spec's ratified fallback (module-stubbed Supabase client harness injecting through the bridge's broadcast callback) instead of Task 4's DB-driven scenario, and record the finding in the PR body.

- [ ] **Step 5: Commit.**

```bash
git add tests/e2e/helpers/realtimeOracle.ts
git commit --no-verify -m "test(admin): realtime e2e oracle constants from drivability spike"
```

---

### Task 4: Real-browser e2e — `published-review-modal.realtime.spec.ts`

**Files:**

- Create: `tests/e2e/published-review-modal.realtime.spec.ts`
- Modify: `playwright.config.ts` (add `published-review-modal\.realtime` to the desktop-chromium `testMatch` alternation, next to `published-review-modal\.prefetch`)

**Interfaces:**

- Consumes: Task 1's live bridge on `/admin?show=<slug>`; Task 3's `realtimeOracle.ts`; existing helpers `seedShowWithCrew`, `signInAs`, `settleDashboardAdminState`, and the request-tracking patterns from `tests/e2e/published-review-modal.prefetch.spec.ts`.
- Produces: the spec-§8.4 behavioral contract, run by Task 5's CI wiring.

- [ ] **Step 1: Write the spec skeleton with the env gate** (self-skips off-CI like the prefetch spec's `MODAL_PREFETCH_E2E` pattern):

```ts
import { expect, test, type Page, type WebSocket as PWWebSocket } from "@playwright/test";
import { seedShowWithCrew, deleteSeededShow, type SeededShow } from "./helpers/seedShowWithCrew";
import { QUIET_WINDOW_MS, isInvalidationFrame, isJoinReplyOk } from "./helpers/realtimeOracle";
// + the sign-in / settle helpers exactly as published-review-modal.prefetch.spec.ts imports them.

test.skip(process.env.MODAL_REALTIME_E2E !== "1", "prod-server realtime gate (CI sets MODAL_REALTIME_E2E=1)");
```

- [ ] **Step 2: Implement the scenario as ONE test with the spec-§8.4 phases**, factored into helpers within the file. The oracle requirements, verbatim from the spec:

1. Fixture: `seedShowWithCrew` with ≥ enough crew rows that the modal scroller scrolls (`scrollHeight > clientHeight` — assert it; grow the roster if the assertion fails), UNIQUE roles per row, plus one seeded actionable attention alert (copy the alert-seeding fixture from `tests/e2e/published-show-attention.spec.ts`).
2. Open `/admin?show=<slug>`; wait for the loaded modal; **gate 1**: await completion of the post-open `?show=` RSC response (prefetch-spec request-tracking pattern); **auto-open menu observed, then close it** (§4.4 inv 4 setup).
3. **Gate 2**: `page.on("websocket")` → collect frames; wait until some frame satisfies `isJoinReplyOk(text, showId)`. Also record socket close/error events (spec §8.5.4).
4. **Gate 3**: quiescence — no in-flight `?show=` or `/version` request, AND no invalidation frame (spec §8.5.1 — a frame restarts the timer), sustained `QUIET_WINDOW_MS`.
5. Prepare oracles: open the ⋮ popover on an UNTOUCHED row; focus its trigger (`crew-row-menu-button-<crewId>`); record `document.activeElement` node identity (tag a `data-probe` attribute via `page.evaluate` to re-identify it); set `scrollTop` to a mid position (≥100px, below max) and record it; record `scroller.scrollHeight` + target row `offsetTop`/`offsetHeight`; install the skeleton `MutationObserver` (testid `published-show-review-loading`); assert target row shows OLD role and NEW role string appears nowhere in the modal.
6. Mutate: service-role `UPDATE crew_members SET role = <new unique role> WHERE id = <target>` (the `admin` client from `tests/e2e/helpers/supabaseAdmin.ts`).
7. Assert (spec §8.4 order): NEW role appears within the target row locator (URL unchanged); NO `/version` request occurred post-mutation (unless a recorded socket close/reconnect happened → retry per protocol below); skeleton recorder empty; geometry stable (`scrollHeight`, `offsetTop`, `offsetHeight` ±1px — else fail INCONCLUSIVE with a distinct message); `scrollTop` unchanged ±1px; popover still open; `document.activeElement` is the `data-probe` node; attention menu still closed.
8. **Retry protocol**: if (and only if) a socket close/error or re-join was recorded in the observation window, tear down the context, `deleteSeededShow`, re-seed under a NEW driveFileId, new browser context, run the whole scenario once more; second flake → test fails.

Write the full code for each phase — the prefetch spec is the style/harness reference; every wait uses Playwright auto-waiting or explicit `expect.poll`, never bare timeouts except the quiescence window itself.

- [ ] **Step 3: Register in `playwright.config.ts`** — extend the desktop-chromium `testMatch` regex alternation: `published-review-modal\.prefetch` → `published-review-modal\.prefetch|published-review-modal\.realtime`.

- [ ] **Step 4: Run locally against a prod server.**

```bash
NEXT_DIST_DIR=.next-realtime-probe CI=true pnpm build   # prod build (prefetch/refresh behavior real)
MODAL_REALTIME_E2E=1 pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.realtime.spec.ts
```

Expected: PASS. (The dev server is NOT sufficient — the open-refresh + RSC behavior must be prod. If port 3000 is contested by a sibling worktree, use the scratch alt-port config lesson.)

- [ ] **Step 5: Commit.**

```bash
git add tests/e2e/published-review-modal.realtime.spec.ts playwright.config.ts
git commit --no-verify -m "test(admin): realtime broadcast e2e for the published show modal"
```

---

### Task 5: CI wiring — join `published-modal-e2e.yml`

**Files:**

- Modify: `.github/workflows/published-modal-e2e.yml`

- [ ] **Step 1: Add the env gate** next to `MODAL_PREFETCH_E2E: "1"`:

```yaml
      # Realtime-refresh spec §8 CI wiring: the realtime e2e self-skips without it.
      MODAL_REALTIME_E2E: "1"
```

- [ ] **Step 2: Add the spec to the run line** (append to the existing `playwright test` file list): `tests/e2e/published-review-modal.realtime.spec.ts`.

- [ ] **Step 3: Add path filters** under `on.pull_request.paths`:

```yaml
      - "components/realtime/ShowRealtimeBridge.tsx"
      - "tests/e2e/published-review-modal.realtime.spec.ts"
```

(`app/admin/_showReviewModal.tsx`, `playwright.config.ts`, `tests/e2e/helpers/**` are already listed.)

- [ ] **Step 4: Validate + commit.**

```bash
pnpm exec prettier --check .github/workflows/published-modal-e2e.yml
git add .github/workflows/published-modal-e2e.yml
git commit --no-verify -m "infra: run realtime modal e2e in published-modal-e2e workflow"
```

Real-CI green on this workflow is a CLOSE-OUT gate (fire via `gh workflow run` / the PR's own run) — local green is not sufficient.

---

### Task 6: Invariant-8 dual-gate + full pre-push gates

- [ ] **Step 1: `/impeccable critique` + `/impeccable audit`** on the affected diff (`app/admin/_showReviewModal.tsx` is a UI-surface file; the bridge renders null so both should be trivial). P0/P1 findings fixed or DEFERRED.md'd BEFORE the cross-model review.
- [ ] **Step 2: Full local gates** (green ≠ green lessons):

```bash
pnpm test               # full unit+db suite, not just scoped files
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all green. Fix anything that isn't; commit fixes as `fix(admin): …`.

- [ ] **Step 3: Commit any residue and update the ship marker** to `stage: "4 — close-out"`.

---

## Self-review notes (writing-plans additions)

- **Layout-dimensions task:** N/A — no fixed-dimension parent changes (bridge renders null).
- **Transition-audit task:** N/A — no visual states added; modal transition pin untouched.
- **Anti-tautology:** Task 2 step 3 is an explicit negative verification; Task 4's oracle carries the spec's attribution gates (quiescence, join-reply, no-/version assertion), row-scoped content check with preconditions, geometry proof separated from the scroll invariant, and the menu-closed check that first observes auto-open. Concrete failure modes each test catches are stated inline in the spec §8.
- **Advisory-lock topology:** untouched (spec §9 declaration).
- **Fix-round regression budget:** after each adversarial repair, re-grep the repaired class across the loader + spec files and rerun `tests/admin` + `tests/log`.
