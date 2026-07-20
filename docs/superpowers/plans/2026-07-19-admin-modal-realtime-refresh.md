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
- EXTENDS `tests/admin/_metaInfraContract.test.ts` — a `readBridgeVersionToken` registry row (spec §8.3; Task 1 Step 6).
- EXTENDS `tests/log/_auditableMutations.ts` `NEW_FORENSIC_CODES`.
- Advisory locks: NOT touched (spec §9 declaration; no `pg_advisory*` anywhere in the diff).

---

### Task 1: Loader token read + bridge mount (unit TDD)

**Files:**

- Modify: `app/admin/_showReviewModal.tsx` (token read after the slug→id lookup at `:134`, before the `Promise.all` at `:224-240`; bridge mount in the return at `:370-407`)
- Modify: `tests/app/admin/showReviewModalLoader.test.tsx` (mock extension + new describe block)
- Modify: `tests/log/_auditableMutations.ts` (one string in `NEW_FORENSIC_CODES`, `ADMIN_SHOW_*` cluster at `:627-631`)
- Modify: `tests/admin/_metaInfraContract.test.ts` (one `infraRegistry` row — verified schema `{ helper, path, contract }`, rows at `:170-235`; each row gets the registry's standard helper-exists grep, no other schema fields)

**Verified helper facts (this session):** `buildLoaderElement()` returns the RAW loader output — the `ShareTokenProvider` element (`showReviewModalLoader.test.tsx:244-247`), so the `bridgeChild`/`childOrder` helpers below operate on `ui.props.children` directly; `isValidElement` and `type ReactElement` are ALREADY imported at `:23`.

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

(Change the mock signature to `rpc: async (fn: string, args?: unknown)`.) Also add to `state`: `versionTokenGate: null as Promise<void> | null`, and inside the `viewer_version_token` branch, after the push: `if (state.versionTokenGate) await state.versionTokenGate;` (mirrors the existing `snapshotGate` pattern — used by the settlement test below). Add `state.readOrder.push("finalize")` inside the `readfinalizeowned_b2` branch, and `state.readOrder.push("snapshot" | "feed" | "token" | "ignored" | "alerts")` at the top of each corresponding module mock (`readShowReviewSnapshot`, `readShowChangeFeed`, `loadShowShareToken`, `loadIgnoredWarnings`, `fetchPerShowAlerts`). In the suite's `beforeEach`, reset EVERY new field: `state.versionToken = "vt-1"; state.versionTokenError = null; state.versionTokenThrows = false; state.versionTokenGate = null; state.versionTokenArgs = null; state.readOrder = [];` (leaked fault state between tests is exactly the contamination the existing fields' resets prevent).

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
    expect(call![1]).toMatchObject({
      source: "admin.show",
      code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
      slug: "rpas",
      showId: "s1",
    });
    expect((call![1] as { error?: unknown }).error).toBeDefined(); // §8.5.3 full field set on BOTH paths
  });

  it("SUCCESSFUL null rpc data → bridge mounts with renderVersion '' (null is in-contract: no-fence sentinel, NOT a fault)", async () => {
    // A faulty implementation that treats data:null as a read failure would
    // suppress the bridge here — this case distinguishes success-null from
    // the error path (getShowForViewer.ts:885 parity).
    state.versionToken = null;
    const ui = await buildLoaderElement();
    const bridge = bridgeChild(ui);
    expect(bridge).not.toBeNull();
    expect((bridge!.props as { renderVersion: string }).renderVersion).toBe("");
    expect(logSpy.warn.mock.calls.some(
      (c) => (c[1] as { code?: string } | undefined)?.code === "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
    )).toBe(false); // success-null must NOT emit the fault code
  });

  it("out-of-contract non-string rpc data (number) → bridge mounts with renderVersion '' (defensive coercion)", async () => {
    state.versionToken = 12345;
    const ui = await buildLoaderElement();
    const bridge = bridgeChild(ui);
    expect(bridge).not.toBeNull();
    expect((bridge!.props as { renderVersion: string }).renderVersion).toBe("");
  });

  it("read-order: token rpc SETTLES before ANY wave reader starts (token-first, spec §4.1 — settlement, not mere entry order)", async () => {
    // Deferred-token proof: while the token rpc is BLOCKED, no wave reader may
    // have started. Entry-order alone would pass a Promise.all that merely
    // invokes the token first; this gate test cannot.
    let releaseToken!: () => void;
    state.versionTokenGate = new Promise<void>((r) => (releaseToken = r));
    const pending = buildLoaderElement();
    // Let microtasks run so the loader reaches (and blocks on) the token rpc.
    await new Promise((r) => setTimeout(r, 10));
    expect(state.readOrder).toEqual(["versionToken"]); // token entered, NOTHING else
    releaseToken();
    await pending;
    const tokenIdx = state.readOrder.indexOf("versionToken");
    for (const reader of ["snapshot", "finalize", "feed", "token", "ignored", "alerts"]) {
      expect(
        state.readOrder.indexOf(reader),
        `${reader} must start AFTER the version-token read settled`,
      ).toBeGreaterThan(tokenIdx);
    }
  });

  it("lifecycle: archived-but-published show still mounts the bridge (§4.3)", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: true });
    const ui = await buildLoaderElement();
    expect(bridgeChild(ui)).not.toBeNull();
  });

  it("lifecycle: unpublished-but-unarchived show still mounts the bridge (§4.3)", async () => {
    // Split from the archived case deliberately: a mount gated on EITHER
    // `!archived` OR `published` alone must fail exactly one of these two.
    state.snapshot = baseSnapshot({ archived: false, published: false });
    const ui = await buildLoaderElement();
    expect(bridgeChild(ui)).not.toBeNull();
  });

  it("lifecycle: archived AND unpublished show still mounts the bridge (§4.3 — kills compound gates)", async () => {
    // The two split cases alone would PASS a compound gate like
    // `published || !archived`; this combination is the only one that fails it.
    state.snapshot = baseSnapshot({ archived: true, published: false });
    const ui = await buildLoaderElement();
    expect(bridgeChild(ui)).not.toBeNull();
  });

  it("child-order stability: the modal's child INDEX is identical in with-bridge and fault renders", async () => {
    state.versionToken = "vt-live";
    const okOrder = childOrder(await buildLoaderElement());
    state.versionTokenError = { message: "down" };
    const faultOrder = childOrder(await buildLoaderElement());
    // Same modal index in both renders — the reconciliation precondition
    // (§4.3): the bridge's presence/absence must never shift the modal.
    expect(okOrder.indexOf("PublishedReviewModal")).toBe(faultOrder.indexOf("PublishedReviewModal"));
    expect(okOrder.indexOf("PublishedReviewModal")).toBeGreaterThanOrEqual(0);
  });
});
```

(Use the file's existing `buildLoaderElement` / `baseSnapshot` helpers verbatim — they already exist, `showReviewModalLoader.test.tsx:331-339` uses both.) If `buildLoaderElement` unwraps `ShareTokenProvider` (check its return: if it returns the PROVIDER element, the helpers above work on `ui.props.children`; if it returns the modal element directly, add a sibling helper `buildProviderElement()` that returns the raw loader output — same call, no unwrap).

- [ ] **Step 3: Run the new tests — verify the red phase precisely.**

Run: `pnpm vitest run tests/app/admin/showReviewModalLoader.test.tsx -t "realtime bridge"`
Expected: **9 of the 10 new tests FAIL** (ok/args, returned-error, throw, success-null, number-coercion, read-order settlement, and all three lifecycle tests — no bridge in tree, no `versionToken` in `readOrder`, no log emit; the fault cases fail on the LOG assertion even though `bridgeChild` is already null). The **child-order-stability test passes vacuously** pre-implementation (both renders identically bridge-less) — its red-phase proof is deferred to Step 7's negative verification, which breaks the implementation to prove the test can fail.

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
  // Named closure (not inline try/catch) so the invariant-9 registry row in
  // tests/admin/_metaInfraContract.test.ts can grep the helper by name.
  const readBridgeVersionToken = async (): Promise<string | null> => {
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
        return null;
      }
      return typeof data === "string" ? data : "";
    } catch (err) {
      void log.warn("viewer version token read threw:", {
        source: "admin.show",
        code: "ADMIN_SHOW_VERSION_TOKEN_READ_FAILED",
        slug,
        showId,
        error: err,
      });
      return null;
    }
  };
  const versionToken = await readBridgeVersionToken();
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

- [ ] **Step 6: Add the invariant-9 registry row (spec §8.3 — MANDATORY, not conditional).** In `tests/admin/_metaInfraContract.test.ts`, append to `infraRegistry`:

```ts
  {
    // Realtime-refresh (2026-07-19): the modal loader's viewer_version_token
    // fence read for the ShowRealtimeBridge mount.
    helper: "readBridgeVersionToken",
    path: "app/admin/_showReviewModal.tsx",
    contract:
      "viewer_version_token rpc ({ data, error } destructure); returned {error} AND thrown await are distinct paths, BOTH emit ADMIN_SHOW_VERSION_TOKEN_READ_FAILED (source admin.show, slug, showId, error) and return null → the loader renders WITHOUT the bridge (fail-open, realtime-refresh spec §4.2); recovery on any later loader re-run",
  },
```

Follow the registry's existing per-row assertion pattern (a "helper exists" grep against the path; behavioral coverage lives in the loader suite's returned-error/throw tests from Step 2 — reference them if the registry's row schema wants a pointer).

- [ ] **Step 7: Green + negative verification.**

Run: `pnpm vitest run tests/app/admin/showReviewModalLoader.test.tsx tests/log tests/admin`
Expected: PASS (all files), including `_metaInfraContract.test.ts` with the new row resolving.

Negative verifications (all uncommitted breakages, reverted via `git checkout --` after each):

1. Vacuous-pass test (Step 3): temporarily swap the ORDER of the two children — move the ENTIRE `{versionToken !== null ? (…) : null}` conditional block ABOVE `<PublishedReviewModal …/>` (a complete, syntactically valid JSX reorder — never delete just the inner element, which leaves an empty ternary branch and fails the BUILD instead of the test) → rerun the child-order-stability + "bridge rendered LAST" tests → both must FAIL behaviorally → revert.
2. Forensic-code row (Step 5) — **enforcement character stated honestly (verified this session):** `NEW_FORENSIC_CODES` is consumed ONLY as a LEAK-GUARD (`tests/log/_metaAdminOutcomeContract.test.ts:69-73` — asserts these codes stay OUT of the §12.4 producer scan); deleting the row fails nothing, so there is NO meaningful delete-the-row negative verification and the plan does not pretend one. The row is the established convention registration (peers `ADMIN_SHOW_LOOKUP_FAILED`, `ADMIN_SHOW_TOKEN_READ_FAILED` are registered the same way) plus the leak-guard. The EMIT's enforcement is the loader suite's log-spy assertions (Step 2's returned-error/throw tests), whose red phase Step 3 already proves.
3. Invariant-9 row (Step 6): temporarily rename the loader closure `readBridgeVersionToken` → `readBridgeVersionTokenX` → run `pnpm vitest run tests/admin/_metaInfraContract.test.ts` → the row's helper-exists grep must FAIL → revert.

- [ ] **Step 8: Commit.**

```bash
git add app/admin/_showReviewModal.tsx tests/app/admin/showReviewModalLoader.test.tsx tests/log/_auditableMutations.ts tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "feat(admin): mount realtime bridge in show-review modal loader (token-first read, fail-open)"
```

---

### Task 2: Read-path pin extensions (single-caller + never-cached)

**Files:**

- Modify: `tests/admin/_showReviewReadPathPin.test.ts`

**Interfaces:**

- Consumes: the loader source from Task 1 (`.rpc("viewer_version_token"` present exactly once; no cache wrappers).
- Produces: structural pins later refactors can't silently break.

**TDD note (declared, not waived):** these are STRUCTURAL meta-test pins over Task 1's already-TDD'd implementation — the repo's established red-phase equivalent for this class is the explicit negative verification (Step 3 breaks the source to prove each pin can fail), the same discipline every `_meta*` registry test in `tests/` uses. Behavioral TDD happened in Task 1.

- [ ] **Step 1: Write the pins.** Append to the file's test block:

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

This is the spec-§1.1-ratified empirical spike. Requirements are fixed (spec §8.4); this task measures the constants and proves drivability. **TDD note (declared):** a spike produces measurement artifacts, not behavior — there is no failing test to write first; its output is consumed by Task 4's tests, and the drivable/not-drivable outcome selects which Task-4 branch runs. **The Step-5 commit fires ONLY on the drivable outcome** (the constants/predicates are derived from observed frames); on the fallback outcome there are no frames to derive from — skip Step 4/5 entirely and jump to the fallback branch below, whose own files carry the commit.

- [ ] **Step 1: Boot the stack.** `supabase start` (if not running) + `pnpm dev` (port 3000 free — check `lsof -iTCP:3000 -sTCP:LISTEN`; if a sibling worktree owns it, use an alt port config per the sibling-dev-server lesson).

- [ ] **Step 2: Drivability probe.** Seed a show (`pnpm tsx` one-off using `tests/e2e/helpers/seedShowWithCrew.ts`), then in a Playwright headed script: **install `page.on("websocket", …)` (framereceived + framesent + close/error) AND the `?show=`/`/version` request listeners BEFORE `page.goto`** — the probe's whole purpose is capturing the initial join reply and the join→`/version` timing, both of which a late listener misses. Then `page.goto` `http://localhost:3000/admin?show=<slug>` (sign in via the `signInAs` helper pattern), and from a second terminal:

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

Adjust the two predicates to the ACTUAL observed frame shapes — the shapes above are the expected Phoenix envelope; the spike output is authoritative.

**Fallback branch (only if the probe shows local Realtime broadcast is NOT drivable — no frame arrives on a plain `crew_members` UPDATE). This branch REPLACES Task 4 and modifies Task 5 as stated; it is fully specified here:**

**BRANCH OWNERSHIP: on the fallback outcome, this branch REPLACES Task 4 entirely and REPLACES Task 5's steps with its own CI-wiring bullet below — Task 5 as written (env gate `MODAL_REALTIME_E2E`, realtime-spec run line, realtime-spec path filters) executes ONLY on the drivable outcome. One branch runs; never both.**

- Files: Create `tests/e2e/_realtimeBridgeLiveEntry.tsx` (client entry rendering `<ShowRealtimeBridge showId="harness-show" slug="harness" renderVersion="v0"/>`); Create `tests/e2e/_realtimeBridgeBundle.mjs` (esbuild bundler — a COPY of the verified live-bundle precedent `tests/e2e/_step3ReviewModalBundle.mjs`, keeping its use-server-elision plugin, with the entry swapped and TWO aliases added); Create `tests/e2e/_stubs/supabaseBrowserStub.ts` + `tests/e2e/_stubs/nextNavigationStub.ts` (the alias targets); Create `tests/e2e/realtime-bridge-conduction.spec.ts`; Modify `playwright.config.ts` (register `realtime-bridge-conduction` in the desktop-chromium testMatch INSTEAD of `published-review-modal\.realtime`); Modify `.github/workflows/published-modal-e2e.yml` (run line + path filters reference the conduction spec + `_realtimeBridgeLiveEntry.tsx` + `_realtimeBridgeBundle.mjs` + `tests/e2e/_stubs/**` — the bundler owns the alias wiring, so it MUST be path-filtered; NO `MODAL_REALTIME_E2E` env var); Modify `tests/e2e/published-review-modal.interactions.spec.ts` (the appended reconcile-invariants test, TDD cycle below).
- Alias 1 — `@/lib/supabase/browser` → stub module (spec §8.4 contract: the STUB IS THE SUPABASE CLIENT, so the REAL `subscribeToShow` runs — its channel setup, its broadcast-event registration, its readiness Promise). The stub's `getSupabaseBrowserClient()` returns a fake whose `.channel(topic, opts)` returns an object capturing the handler registered via `.on("broadcast", { event: "invalidate" }, handler)` and whose `.subscribe(cb)` synchronously calls `cb("SUBSCRIBED")`; `realtime.setAuth` no-op; `removeChannel` resolves. Expose `window.__driveInvalidation = (payload) => capturedHandler({ payload })`; stub `fetch` for the mint/version endpoints (fixed jwt/version). Alias 2 — `next/navigation` → `useRouter().refresh` increments `window.__refreshCount`.
- **Stub contracts (defined by the REAL `subscribeToShow`'s verified usage, `lib/realtime/subscribeToShow.ts` — `setAuth` before channel open at `:153`, `.channel(topic, {config:{private:true,broadcast:{self:false}}})`, `.on("broadcast", { event: "invalidate" }, handler)`, `.subscribe(statusCb)`):** `supabaseBrowserStub.ts` exports `getSupabaseBrowserClient()` returning `{ realtime: { setAuth() {} }, channel: (topic, opts) => fakeChannel, removeChannel: async () => {} }` where `fakeChannel.on(type, filter, handler)` captures `handler` when `type === "broadcast" && filter.event === "invalidate"` (and returns the channel for chaining), and `fakeChannel.subscribe(cb)` calls `cb("SUBSCRIBED")` and returns the channel; the module also sets `window.__driveInvalidation = (payload) => capturedHandler?.({ payload })` and stubs `globalThis.fetch` for `/api/realtime/subscriber-token` (`{ jwt: "harness-jwt", exp: 9999999999 }`) and `/api/show/*/version` (`{ version_token: "v0" }`). `nextNavigationStub.ts` exports `useRouter()` returning `{ refresh: () => { window.__refreshCount = (window.__refreshCount ?? 0) + 1; } }`. The captured-handler ARGUMENT shape `{ payload }` mirrors what `subscribeToShow`'s handler destructures — verify against `subscribeToShow.ts`'s `.on` callback at implementation time and match exactly.
- **Bundle invocation + serving (deterministic):** the SPEC's `beforeAll` spawns the bundler out-of-process — `execFileSync(node, ["tests/e2e/_realtimeBridgeBundle.mjs", outDir])` where `outDir` is a `mkdtempSync` temp dir (the exact spawn pattern of the layout harness, `published-review-modal.layout.spec.ts:103-116`). The bundler writes `<outDir>/bundle.js` (esbuild output) and `<outDir>/index.html` (`<div id="root"></div><script src="./bundle.js"></script>`); the test `page.goto(pathToFileURL(join(outDir, "index.html")).href)`. No web server, no gitignore concerns (temp dir).
- Conduction spec TDD (executable, alias-attributable): commit sequence is spec + entry + bundler WITHOUT the two alias entries first. Red: `pnpm exec playwright test --project=desktop-chromium tests/e2e/realtime-bridge-conduction.spec.ts` → FAIL (`window.__driveInvalidation` undefined — the un-aliased bundle imports the REAL `@/lib/supabase/browser`, which throws on missing env / never defines the hook). Green: add the two alias entries to `_realtimeBridgeBundle.mjs`, rerun the SAME command → PASS. The delta between red and green is exactly the aliases. Assertions: (a) `__driveInvalidation` burst of 8 within 50ms → exactly ONE `__refreshCount` increment, ≥100ms after the last call (REAL bridge debounce conducted it — never call refresh directly); (b) two invalidations 300ms apart → two increments (negative regression, mirrors the bridge's pinned debounce tests).
- Reconcile-invariants test TDD (executable): append the test to `published-review-modal.interactions.spec.ts` driving a REAL app-owned reconcile (the ignore-warning server action that spec already exercises) with the §4.4 1–4 + skeleton + geometry oracles. Red-phase equivalence: run once (`pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.interactions.spec.ts -g "reconcile invariants"`); if green on first run, perform ONE negative verification — inside a throwaway copy of the test, programmatically `scroller.scrollTop = 0` mid-window and assert the scrollTop oracle FAILS — then delete the throwaway; commit.
- Commits: `test(admin): realtime bridge conduction harness (local realtime not drivable)`, then `test(admin): modal reconcile invariants over action revalidation`, then `infra: wire conduction harness into published-modal-e2e`. PR body records the drivability finding verbatim.

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
2. **Listeners FIRST, before any navigation:** install `page.on("websocket")` (frames + close/error events) AND the `?show=`/`/version` request trackers on the fresh page BEFORE `page.goto` — the Realtime socket opens during hydration, and a listener attached after the loaded modal has already missed the socket open and its join reply, invalidating gates 1–3.
3. Open `/admin?show=<slug>`; wait for the loaded modal; **gate 1**: await completion of the post-open `?show=` RSC response (prefetch-spec request-tracking pattern); **auto-open menu observed, then close it** (§4.4 inv 4 setup). **Gate 2**: wait until a recorded frame satisfies `isJoinReplyOk(text, showId)`.
4. **Gate 3**: quiescence — no in-flight `?show=` or `/version` request, AND no invalidation frame (spec §8.5.1 — a frame restarts the timer), sustained `QUIET_WINDOW_MS`.
5. Prepare oracles: open the ⋮ popover on an UNTOUCHED row; focus its trigger (`crew-row-menu-button-<crewId>`); record `document.activeElement` node identity (tag a `data-probe` attribute via `page.evaluate` to re-identify it); set `scrollTop` to a mid position (≥100px, below max) and record it; record `scroller.scrollHeight` + target row `offsetTop`/`offsetHeight`; install the skeleton `MutationObserver` (testid `published-show-review-loading`); assert target row shows OLD role and NEW role string appears nowhere in the modal.
6. Mutate: service-role `UPDATE crew_members SET role = <new unique role> WHERE id = <target>` (the `admin` client from `tests/e2e/helpers/supabaseAdmin.ts`).
7. Assert (spec §8.4 order): **the full chain, each leg observed in order** — (i) a post-mutation frame satisfying `isInvalidationFrame(text, showId)` was RECEIVED; (ii) AFTER that frame, a `?show=` RSC request whose START timestamp post-dates the frame timestamp is observed AND completes (the request tracker records `page.on("request")` start times — a request merely COMPLETING after the frame could have started before it and prove nothing; the started-after-frame requirement pins the debounced `router.refresh()` as the frame's consequence); (iii) the content swap follows: NEW role appears within the target row locator (URL unchanged); NO `/version` request occurred post-mutation (unless a recorded socket close/reconnect happened → retry per protocol below); skeleton recorder empty; geometry stable (`scrollHeight`, `offsetTop`, `offsetHeight` ±1px — else fail INCONCLUSIVE with a distinct message); `scrollTop` unchanged ±1px; popover still open; `document.activeElement` is the `data-probe` node; attention menu still closed.
8. **Retry protocol**: if (and only if) a socket close/error or re-join was recorded in the observation window, tear down the context, `deleteSeededShow`, re-seed under a NEW driveFileId, new browser context, run the whole scenario once more; second flake → test fails.
9. **Cleanup (always)**: `deleteSeededShow(driveFileId)` in the test's `finally`/`afterAll` for EVERY attempt's fixture (success, terminal failure, and both retry attempts) — never leave seeded residue in the shared local DB (sibling-worktree pollution lesson). The Task 3 spike's seeded show gets the same `deleteSeededShow` at the end of the probe script.

Write the full code for each phase — the prefetch spec is the style/harness reference; every wait uses Playwright auto-waiting or explicit `expect.poll`, never bare timeouts except the quiescence window itself.

- [ ] **Step 3: Register in `playwright.config.ts`** — extend the desktop-chromium `testMatch` regex alternation: `published-review-modal\.prefetch` → `published-review-modal\.prefetch|published-review-modal\.realtime`.

- [ ] **Step 4: Red-phase proof (the e2e is an acceptance test — prove it can fail on the defect it exists to catch).** Task 1's mount is COMMITTED, so stashing does nothing — instead make a temporary uncommitted breakage: edit `app/admin/_showReviewModal.tsx` and replace the ENTIRE `{versionToken !== null ? (…) : null}` conditional block with `{null}` (a complete, valid JSX expression — deleting only the inner element would leave an empty ternary branch and fail the BUILD, proving nothing), rebuild, run the spec:

```bash
# (manual edit: replace the bridge conditional block with {null} in the loader return)
NEXT_DIST_DIR=.next-realtime-probe CI=true pnpm build
MODAL_REALTIME_E2E=1 pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.realtime.spec.ts
```

Expected: FAIL BEHAVIORALLY (build succeeds; no bridge → no subscription → gate 2 times out waiting for the join reply). Restore with `git checkout -- app/admin/_showReviewModal.tsx` (the breakage was never staged or committed).

- [ ] **Step 5: Green run against a prod server.**

```bash
NEXT_DIST_DIR=.next-realtime-probe CI=true pnpm build   # prod build (prefetch/refresh behavior real)
MODAL_REALTIME_E2E=1 pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.realtime.spec.ts
```

Expected: PASS. (The dev server is NOT sufficient — the open-refresh + RSC behavior must be prod. If port 3000 is contested by a sibling worktree, use the scratch alt-port config lesson.)

- [ ] **Step 6: Commit.**

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

- [ ] **Step 4: Validate + commit.** (TDD note, declared: workflow YAML carries no unit-testable behavior; its red→green proof IS the real-CI run in Task 7 Step 3 — the workflow must trigger on this PR's paths and pass.)

```bash
pnpm exec prettier --check .github/workflows/published-modal-e2e.yml
git add .github/workflows/published-modal-e2e.yml
git commit --no-verify -m "infra: run realtime modal e2e in published-modal-e2e workflow"
```

---

### Task 6: Invariant-8 dual-gate + full pre-push gates

- [ ] **Step 1: `/impeccable critique` + `/impeccable audit`** on the affected diff, each run with the canonical v3 setup gates per AGENTS invariant 8: `context.mjs` context load (PRODUCT.md + DESIGN.md) → register reference read (`brand.md` or `product.md`) BEFORE the critique/audit proper. (`app/admin/_showReviewModal.tsx` is a UI-surface file; the bridge renders null so both should be trivial.) P0/P1 findings fixed or DEFERRED.md'd BEFORE the cross-model review. **Repair loop (applies here AND to Task 7's review findings):** every gate/review-triggered code change follows Step 2's failure protocol (failing regression test first for behavioral changes; scoped commit per finding-class), and after ANY repair the affected gates re-run — impeccable repairs re-run the dual-gate on the amended diff; Task-7 review repairs re-run the full local gates AND go back to the reviewer for the next round. Findings + dispositions are recorded in the **PR body** (the feature-scale analogue of a milestone handoff §12 — the #478-established pattern) with `DEFERRED.md` rows for anything deferred.
- [ ] **Step 2: Full local gates** (green ≠ green lessons):

```bash
pnpm test               # full unit+db suite, not just scoped files
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all green. **Failure protocol (bounded — no generic residue commits):** a BEHAVIORAL failure gets a failing regression test first (in the suite that missed it), then the minimal fix, then its own scoped commit `fix(<scope>): <what>` — one failure class per commit. A pure formatting failure: `pnpm format` + commit `chore: format`. A type-only failure with no behavior change: fix + commit `fix(<scope>): typecheck — <what>`. Never batch unrelated fixes into one commit.

- [ ] **Step 3: Update the ship marker** to `stage: "4 — close-out"`.

---

### Task 7: Close-out — push, PR, REAL CI green, merge

- [ ] **Step 1: Whole-diff cross-model adversarial review** (fresh-eyes, REVIEWER ONLY, Codex) to APPROVE; findings triaged land-now / `DEFERRED.md` / `BACKLOG.md`.
- [ ] **Step 2: Push + open the PR.**

```bash
git push -u origin feat/admin-modal-realtime-refresh
gh pr create --title "feat(admin): live realtime refresh for the published show modal" --body "<summary + spec/plan links + spike findings>"
```

- [ ] **Step 3: Verify REAL CI green — by PR number, not SHA** (the `gh pr checks --watch` SHA-form false-green lesson):

```bash
gh pr checks <PR#> --watch
gh pr view <PR#> --json mergeStateStatus --jq .mergeStateStatus   # must be CLEAN, not DIRTY/BEHIND
```

The `published-modal-e2e` run MUST appear and pass on the PR (its path filters match this diff). If it did not trigger, `gh workflow run published-modal-e2e.yml --ref feat/admin-modal-realtime-refresh` and watch that run. If the PR is BEHIND/DIRTY, rebuild on `origin/main` first (merge-ref CI lesson).

- [ ] **Step 4: Merge + sync (same turn as CI-green — never park a green PR):**

```bash
gh pr merge <PR#> --merge
cd /Users/ericweiss/FX-Webpage-Template && git pull --ff-only
git rev-list --left-right --count main...origin/main   # MUST print "0  0"
```

Then set the ship marker `stage: "done"` and `CronDelete` the nudge job.

---

## Self-review notes (writing-plans additions)

- **Layout-dimensions task:** N/A — no fixed-dimension parent changes (bridge renders null).
- **Transition-audit task:** N/A — no visual states added; modal transition pin untouched.
- **Anti-tautology:** Task 2 step 3 is an explicit negative verification; Task 4's oracle carries the spec's attribution gates (quiescence, join-reply, no-/version assertion), row-scoped content check with preconditions, geometry proof separated from the scroll invariant, and the menu-closed check that first observes auto-open. Concrete failure modes each test catches are stated inline in the spec §8.
- **Advisory-lock topology:** untouched (spec §9 declaration).
- **Fix-round regression budget:** after each adversarial repair, re-grep the repaired class across the loader + spec files and rerun `tests/admin` + `tests/log`.
