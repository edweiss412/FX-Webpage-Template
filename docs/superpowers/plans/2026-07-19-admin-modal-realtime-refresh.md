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
- EXTENDS `tests/admin/_metaInfraContract.test.ts` — a `readBridgeVersionToken` registry row (spec §8.3; Task 1 Step 3 red set).
- CREATES `tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts` — structural pin for the realtime CI wiring (Task 5; fallback variant on the NOT_DRIVABLE branch).
- EXTENDS `tests/log/_auditableMutations.ts` `NEW_FORENSIC_CODES`.
- Advisory locks: NOT touched (spec §9 declaration; no `pg_advisory*` anywhere in the diff).

---

### Task 1: Loader token read + bridge mount (unit TDD)

**Files:**

- Modify: `app/admin/_showReviewModal.tsx` (token read after the slug→id lookup at `:134`, before the `Promise.all` at `:224-240`; bridge mount in the return at `:370-407`)
- Modify: `tests/app/admin/showReviewModalLoader.test.tsx` (mock extension + new describe block)
- Modify: `tests/log/_auditableMutations.ts` (one string in `NEW_FORENSIC_CODES`, `ADMIN_SHOW_*` cluster at `:627-631`)
- Modify: `tests/admin/_metaInfraContract.test.ts` (one `infraRegistry` row — verified schema `{ helper, path, contract }`, rows at `:170-235`; each row gets the registry's standard helper-exists grep, no other schema fields)
- Modify: `tests/admin/_showReviewReadPathPin.test.ts` (the two structural pins — written in the RED set below, since the single-caller pin genuinely fails before the implementation exists)

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

**Also write the two structural pins NOW** (part of the red set — this is why they live in Task 1, not a later task: the single-caller pin is genuinely red-first). Append to `tests/admin/_showReviewReadPathPin.test.ts`'s test block:

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
    // (getShowForViewer.ts:874-876 hazard). Scan IMPORT + CALL sites only, so a
    // prose comment can never trip it (round-6 F2): the loader must not import
    // next/cache nor invoke a cache wrapper.
    expect(source).not.toMatch(/from\s+["']next\/cache["']/);
    expect(source).not.toMatch(/unstable_cache\s*\(/);
    expect(source).not.toMatch(/["']use cache["']/);
  });
```

**And add the invariant-9 registry row NOW — it is also red-first (round-7 F1).** In `tests/admin/_metaInfraContract.test.ts`, append to `infraRegistry` (spec §8.3 — MANDATORY, not conditional):

```ts
  {
    // Realtime-refresh (2026-07-19): the modal loader's viewer_version_token
    // fence read for the ShowRealtimeBridge mount.
    helper: "readBridgeVersionToken",
    path: "app/admin/_showReviewModal.tsx",
    contract:
      "viewer_version_token rpc ({ data, error } destructure); returned {error} AND thrown await are distinct paths, BOTH emit ADMIN_SHOW_VERSION_TOKEN_READ_FAILED (source admin.show, slug, showId, error) and return null → the loader renders WITHOUT the bridge (fail-open, realtime-refresh spec §4.2); recovery on any later loader re-run. Closure (not importable) — behavioral coverage lives in tests/app/admin/showReviewModalLoader.test.tsx's returned-error/throw cases.",
  },
```

The registry gives every row a "helper exists" grep against its `path` (file header contract, `tests/admin/_metaInfraContract.test.ts`: "the helper is grep-visible in the path it claims to live at"); `readBridgeVersionToken` does not exist in the loader yet, so this row FAILS red-first — Step 4's implementation is what turns it green. (`readBridgeVersionToken` is a loader-scoped closure, not importable, so the registry's optional behavioral assertion does not apply; the loader suite's returned-error/throw tests are the behavioral coverage, as several existing rows already note for their non-importable helpers.)

Run: `pnpm vitest run tests/app/admin/showReviewModalLoader.test.tsx -t "realtime bridge"` AND `pnpm vitest run tests/admin/_showReviewReadPathPin.test.ts` AND `pnpm vitest run tests/admin/_metaInfraContract.test.ts`
Expected: **9 of the 10 new loader tests FAIL** (ok/args, returned-error, throw, success-null, number-coercion, read-order settlement, and all three lifecycle tests — no bridge in tree, no `versionToken` in `readOrder`, no log emit; the fault cases fail on the LOG assertion even though `bridgeChild` is already null), the **single-caller pin FAILS** (`toHaveLength(1)` vs 0 matches — the rpc call doesn't exist yet), AND the **new infraRegistry row FAILS** its helper-exists grep (`readBridgeVersionToken` absent from the loader). Two vacuous-passes pre-implementation, each with an explicit later proof: the **child-order-stability test** (both renders identically bridge-less; broken-and-proven in Step 9) and the **never-cached pin** (no cache import exists yet; broken-and-proven in Step 9).

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
  // catch-up refresh → stuck stale. NEVER cached (a cache wrapper would
  // re-serve a stale fence forever → refresh loop; pinned by the read-path
  // meta-test — which is also why this comment avoids naming the wrapper).
  // Fault posture (§4.2): fail OPEN — log the forensic code and
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

- [ ] **Step 6: (FOLDED INTO STEP 3.)** The invariant-9 registry row is written in Step 3's red set — its helper-exists grep genuinely fails before Step 4 implements the closure (round-7 F1: failing-test-first, not rename-after-commit).

- [ ] **Step 7: Green.**

Run: `pnpm vitest run tests/app/admin/showReviewModalLoader.test.tsx tests/log tests/admin`
Expected: PASS (all files), including `_metaInfraContract.test.ts` with the new row resolving and both read-path pins green.

- [ ] **Step 8: Commit FIRST (so the negative verifications run against committed state and `git checkout --` restores the real implementation, never erases it).**

```bash
git add app/admin/_showReviewModal.tsx tests/app/admin/showReviewModalLoader.test.tsx tests/log/_auditableMutations.ts tests/admin/_metaInfraContract.test.ts tests/admin/_showReviewReadPathPin.test.ts
git commit --no-verify -m "feat(admin): mount realtime bridge in show-review modal loader (token-first read, fail-open)"
```

- [ ] **Step 9: Negative verifications (post-commit; each breakage is uncommitted and reverted via `git checkout -- <file>`, which now restores the COMMITTED implementation):**

1. Child-order-stability + "bridge rendered LAST" (the Step-3 vacuous-pass): temporarily swap the ORDER of the two children — move the ENTIRE `{versionToken !== null ? (…) : null}` conditional block ABOVE `<PublishedReviewModal …/>` (a complete, syntactically valid JSX reorder — never delete just the inner element, which leaves an empty ternary branch and fails the BUILD instead of the test) → rerun → both must FAIL behaviorally → `git checkout -- app/admin/_showReviewModal.tsx`.
2. Never-cached pin (the other Step-3 vacuous-pass): temporarily add `import { unstable_cache } from "next/cache";` to the loader → `pnpm vitest run tests/admin/_showReviewReadPathPin.test.ts` → the pin must FAIL on the import scan → revert. Then temporarily duplicate the `.rpc("viewer_version_token"` line → rerun → the single-caller pin must FAIL → revert.
3. Invariant-9 row (Step 3 red set — this check is belt-and-braces on top of its proven red phase): temporarily rename the loader closure `readBridgeVersionToken` → `readBridgeVersionTokenX` → run `pnpm vitest run tests/admin/_metaInfraContract.test.ts` → the row's helper-exists grep must FAIL → revert.
4. Forensic-code row (Step 5) — **enforcement character stated honestly (verified this session):** `NEW_FORENSIC_CODES` is consumed ONLY as a LEAK-GUARD (`tests/log/_metaAdminOutcomeContract.test.ts:69-73` — asserts these codes stay OUT of the §12.4 producer scan); deleting the row fails nothing, so there is NO meaningful delete-the-row negative verification and the plan does not pretend one. The row is the established convention registration (peers `ADMIN_SHOW_LOOKUP_FAILED`, `ADMIN_SHOW_TOKEN_READ_FAILED` are registered the same way) plus the leak-guard. The EMIT's enforcement is the loader suite's log-spy assertions, whose red phase Step 3 already proved.

---

### Task 2: (FOLDED INTO TASK 1)

The two read-path pins (single-caller, never-cached) are written in Task 1's RED set and negative-verified in Task 1 Step 9 — the single-caller pin is genuinely failing-test-first there (round-6 F3 resolution). No separate task remains.

---

### Task 3: E2E spike — realtime drivability probe + oracle constants (MANDATORY BEFORE Task 4)

**Files:**

- Create: `tests/e2e/_realtimeDrivabilityProbe.ts` (the spike's executable probe — full code in Step 2)
- Create: `tests/e2e/helpers/realtimeOracle.ts` (constants + frame predicates, values filled from measurement)

This is the spec-§1.1-ratified empirical spike. Requirements are fixed (spec §8.4); this task measures the constants and proves drivability. **TDD note (declared):** a spike produces measurement artifacts, not behavior — there is no failing test to write first; its output is consumed by Task 4's tests, and the drivable/not-drivable outcome selects which Task-4 branch runs. **The Step-5 commit fires ONLY on the drivable outcome** (the constants/predicates are derived from observed frames); on the fallback outcome there are no frames to derive from — skip Step 4/5 entirely and jump to the fallback branch below, whose own files carry the commit.

- [ ] **Step 1: Boot the stack.** `supabase start` (if not running), then boot the dev server on a free port 3000 (`lsof -iTCP:3000 -sTCP:LISTEN` must be empty; if a sibling worktree owns it, use an alt port + set `PLAYWRIGHT_BASE_URL` for the probe per the sibling-dev-server lesson) **with the test-auth env** — the probe signs in via `signInAs`, which needs `ENABLE_TEST_AUTH` + `TEST_AUTH_SECRET` on the server. Use the exact env prefix of the config's :3000 webServer local command (`playwright.config.ts:233-236`):

```bash
JWT_SIGNING_SECRET=redeem-link-test-secret-32-bytes-min ADMIN_DEV_PANEL_ENABLED=true ENABLE_TEST_AUTH=true TEST_AUTH_SECRET=fxav-m3-test-auth-2026-DO-NOT-SHIP pnpm dev -H 127.0.0.1
```

- [ ] **Step 2: Write the probe script** at `tests/e2e/_realtimeDrivabilityProbe.ts` — complete, self-contained, committed with the oracle in Step 5 (round-7 F3: the spike's execution is fully specified, no ad-hoc one-offs). It seeds, signs in, records frames/requests with listeners installed BEFORE `goto`, mutates in-process via the service-role client, prints the raw frames + timing summary, and ends with a single machine-readable `PROBE RESULT: DRIVABLE|NOT_DRIVABLE` line — that line IS the branch selector:

```ts
/**
 * tests/e2e/_realtimeDrivabilityProbe.ts — realtime-refresh plan Task 3 spike.
 *
 * Standalone script (NOT a Playwright test): opens /admin?show=<slug> in a real
 * browser, records the realtime websocket frames + the ?show=/version requests
 * around a service-role crew_members.role UPDATE, prints raw frames + timings,
 * and ends with `PROBE RESULT: DRIVABLE` or `PROBE RESULT: NOT_DRIVABLE`.
 * DRIVABLE ⇔ a broadcast frame on realtime:show:<id>:invalidation arrives
 * within FRAME_WAIT_MS of the UPDATE — selects Task 4 as written; otherwise
 * the Task-3 fallback branch runs.
 *
 * Prereqs: supabase local running; Step-1 dev server (test-auth env) on :3000;
 * .env.local sourced into THIS process (standalone scripts don't auto-load it).
 *
 * Run:
 *   set -a && source .env.local && set +a && pnpm tsx tests/e2e/_realtimeDrivabilityProbe.ts
 */
import { chromium } from "@playwright/test";
import { ADMIN_FIXTURE } from "./helpers/fixtures";
import { signInAs } from "./helpers/signInAs";
import { seedShowWithCrew, deleteSeededShow } from "./helpers/seedShowWithCrew";
import { admin } from "./helpers/supabaseAdmin";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const JOIN_WAIT_MS = 30_000; // give hydration + socket join this long before declaring no-join
const QUIESCE_MS = 3_000; // settle window after join before mutating
const FRAME_WAIT_MS = 10_000; // NOT_DRIVABLE if no invalidation frame within this window post-commit

type Stamped = { at: number; text: string };

async function poll<T>(fn: () => T | undefined, timeoutMs: number, stepMs = 100): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v !== undefined) return v;
    if (Date.now() > deadline) return undefined;
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

async function main(): Promise<void> {
  const seeded = await seedShowWithCrew({});
  const target = seeded.crew[0];
  if (!target) throw new Error("probe: seedShowWithCrew({}) returned an empty roster");
  const topic = `realtime:show:${seeded.showId}:invalidation`;
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await (await browser.newContext()).newPage();
    const frames: Stamped[] = [];
    const socketEvents: Stamped[] = [];
    const requests: Stamped[] = [];
    // Listeners BEFORE goto — the socket opens during hydration; a late
    // listener misses the join reply and the join→/version timing.
    page.on("websocket", (ws) => {
      socketEvents.push({ at: Date.now(), text: `open ${ws.url()}` });
      ws.on("framereceived", (f) => frames.push({ at: Date.now(), text: String(f.payload) }));
      ws.on("framesent", (f) => frames.push({ at: Date.now(), text: `SENT ${String(f.payload)}` }));
      ws.on("close", () => socketEvents.push({ at: Date.now(), text: "close" }));
      ws.on("socketerror", (e) => socketEvents.push({ at: Date.now(), text: `error ${String(e)}` }));
    });
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.searchParams.get("show") === seeded.slug || u.pathname.endsWith("/version")) {
        requests.push({ at: Date.now(), text: `${r.method()} ${u.pathname}${u.search}` });
      }
    });
    page.on("response", (r) => {
      const u = new URL(r.url());
      if (u.searchParams.get("show") === seeded.slug || u.pathname.endsWith("/version")) {
        requests.push({ at: Date.now(), text: `RESP ${r.status()} ${u.pathname}${u.search}` });
      }
    });
    await signInAs(page, ADMIN_FIXTURE);
    await page.goto(`${BASE}/admin?show=${seeded.slug}`);
    const join = await poll(
      () => frames.find((f) => !f.text.startsWith("SENT") && f.text.includes(topic) && f.text.includes("phx_reply")),
      JOIN_WAIT_MS,
    );
    if (!join) {
      console.log(`no join reply on ${topic} within ${JOIN_WAIT_MS}ms — socket events:`, socketEvents);
      console.log("PROBE RESULT: NOT_DRIVABLE");
      return;
    }
    await new Promise((r) => setTimeout(r, QUIESCE_MS));
    const commitAt = Date.now();
    const { error } = await admin
      .from("crew_members")
      .update({ role: "Probe Role Realtime" })
      .eq("id", target.id);
    if (error) throw new Error(`probe mutation failed: ${error.message}`);
    const inval = await poll(
      () =>
        frames.find(
          (f) => f.at > commitAt && !f.text.startsWith("SENT") && f.text.includes(topic) && f.text.includes("broadcast"),
        ),
      FRAME_WAIT_MS,
    );
    // Let the debounced refresh land, then check the row text swapped in place.
    await new Promise((r) => setTimeout(r, 3_000));
    const roleVisible = await page.getByText("Probe Role Realtime").count();
    console.log("=== RAW TOPIC FRAMES ===");
    for (const f of frames.filter((x) => x.text.includes(topic))) console.log(f.at, f.text);
    console.log("=== REQUESTS (?show= + /version) ===");
    for (const r of requests) console.log(r.at, r.text);
    console.log("=== TIMINGS (ms) ===");
    console.log("join reply at:", join.at);
    console.log("commit at:", commitAt, "| commit→frame:", inval ? inval.at - commitAt : "NO FRAME");
    const rsc = requests.find((r) => inval && r.at > inval.at && r.text.includes(`show=${seeded.slug}`));
    console.log("frame→?show= request:", rsc && inval ? rsc.at - inval.at : "NONE OBSERVED");
    console.log("new role visible in modal:", roleVisible > 0);
    console.log(`PROBE RESULT: ${inval ? "DRIVABLE" : "NOT_DRIVABLE"}`);
  } finally {
    await deleteSeededShow(seeded.driveFileId);
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
```

(Import shapes verified against the live prefetch spec: `signInAs(page, ADMIN_FIXTURE)` from `./helpers/signInAs` + `./helpers/fixtures`, `seedShowWithCrew({})`/`deleteSeededShow(driveFileId)` from `./helpers/seedShowWithCrew` — `published-review-modal.prefetch.spec.ts:14-17,43,78`; `admin` service-role client from `./helpers/supabaseAdmin` (fact 22); `SeededShow.crew[n].id/.name/.role` from `seedShowWithCrew.ts:83-90,171-181`.)

- [ ] **Step 3: Run the probe + measure.**

```bash
set -a && source .env.local && set +a && pnpm tsx tests/e2e/_realtimeDrivabilityProbe.ts
```

From the printed summary record: time from `phx_reply ok` to the catch-up `/version` response; commit→invalidation-frame; frame→`?show=` RSC request (should be ~100ms debounce + dispatch). Set `QUIET_WINDOW_MS = max(250, ceil(1.5 × observed frame→request))`. The final `PROBE RESULT:` line selects the branch: `DRIVABLE` → Steps 4–5 + Task 4/5 as written; `NOT_DRIVABLE` → skip Steps 4–5, run the fallback branch below.

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
    return (
      f.topic === `realtime:show:${showId}:invalidation` &&
      f.event === "broadcast" &&
      (f as { payload?: { event?: string } }).payload?.event === "invalidate" // discriminator — an unrelated broadcast must NOT satisfy the oracle (round-6 F4)
    );
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
- **Stub contracts (defined by the REAL `subscribeToShow`'s verified usage, `lib/realtime/subscribeToShow.ts` — `setAuth` before channel open at `:153`, `.channel(topic, {config:{private:true,broadcast:{self:false}}})`, `.on("broadcast", { event: "invalidate" }, handler)`, `.subscribe(statusCb)`):** `supabaseBrowserStub.ts` exports `getSupabaseBrowserClient()` returning `{ realtime: { setAuth() {} }, channel: (topic, opts) => fakeChannel, removeChannel: async () => {} }` where `fakeChannel.on(type, filter, handler)` captures `handler` when `type === "broadcast" && filter.event === "invalidate"` (and returns the channel for chaining), and `fakeChannel.subscribe(cb)` calls `cb("SUBSCRIBED")`, sets `window.__subscribed = true` (the READINESS SIGNAL — the spec awaits `expect.poll(() => window.__subscribed)` before driving ANY invalidation, so a burst can never race the bridge's subscription effect; round-6 F6), and returns the channel; the module also sets `window.__driveInvalidation = (payload) => capturedHandler?.({ payload })` and stubs `globalThis.fetch` for `/api/realtime/subscriber-token` (`{ jwt: "harness-jwt", exp: 9999999999 }`) and `/api/show/*/version` (`{ version_token: "v0" }`). `nextNavigationStub.ts` exports `useRouter()` returning `{ refresh: () => { window.__refreshCount = (window.__refreshCount ?? 0) + 1; } }`. The captured-handler ARGUMENT shape `{ payload }` mirrors what `subscribeToShow`'s handler destructures — verify against `subscribeToShow.ts`'s `.on` callback at implementation time and match exactly.
- **Bundle invocation + serving (deterministic):** the SPEC's `beforeAll` spawns the bundler out-of-process — `execFileSync(node, ["tests/e2e/_realtimeBridgeBundle.mjs", outDir])` where `outDir` is a `mkdtempSync` temp dir (the exact spawn pattern of the layout harness, `published-review-modal.layout.spec.ts:103-116`). The bundler writes `<outDir>/bundle.js` (esbuild output) and `<outDir>/index.html` (`<div id="root"></div><script src="./bundle.js"></script>`); the test `page.goto(pathToFileURL(join(outDir, "index.html")).href)`. No web server, no gitignore concerns (temp dir).
- Conduction spec TDD (executable, alias-attributable): commit sequence is spec + entry + bundler WITHOUT the two alias entries first. Red: `pnpm exec playwright test --project=desktop-chromium tests/e2e/realtime-bridge-conduction.spec.ts` → FAIL (`window.__driveInvalidation` undefined — the un-aliased bundle imports the REAL `@/lib/supabase/browser`, which throws on missing env / never defines the hook). Green: add the two alias entries to `_realtimeBridgeBundle.mjs`, rerun the SAME command → PASS. The delta between red and green is exactly the aliases. Assertions: (a) `__driveInvalidation` burst of 8 within 50ms → exactly ONE `__refreshCount` increment, ≥100ms after the last call (REAL bridge debounce conducted it — never call refresh directly); (b) two invalidations 300ms apart → two increments (negative regression, mirrors the bridge's pinned debounce tests).
- Reconcile-invariants test TDD (executable): append the test to `published-review-modal.interactions.spec.ts` driving a REAL app-owned reconcile (the ignore-warning server action that spec already exercises) with the §4.4 1–4 + skeleton + geometry oracles. Red-phase equivalence: run once (`pnpm exec playwright test --project=desktop-chromium tests/e2e/published-review-modal.interactions.spec.ts -g "reconcile invariants"`); if green on first run, perform ONE negative verification — inside a throwaway copy of the test, programmatically `scroller.scrollTop = 0` mid-window and assert the scrollTop oracle FAILS — then delete the throwaway; commit.
- **Fallback CI wiring red phase (same discipline as Task 5, round-7 F2):** before editing the YAML, write `tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts` with the fallback's assertions — the conduction spec anchored to the `playwright test` run line (`/playwright test[^\n]*realtime-bridge-conduction\.spec\.ts/`), plus path-filter pins for `tests/e2e/_realtimeBridgeBundle.mjs` and `tests/e2e/_stubs/` (regex `/-\s*"tests\/e2e\/_realtimeBridgeBundle\.mjs"/` etc.); run it red (`pnpm vitest run tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts` — all fail), then edit the YAML, rerun green, and commit test + YAML together in the `infra:` commit below. No `MODAL_REALTIME_E2E` assertion on this branch (the gate does not exist here).
- Commits: `test(admin): realtime bridge conduction harness (local realtime not drivable)` (includes `tests/e2e/_realtimeDrivabilityProbe.ts` — the branch-selection evidence), then `test(admin): modal reconcile invariants over action revalidation`, then `infra: wire conduction harness into published-modal-e2e` (includes the wiring pin test). PR body records the drivability finding verbatim.

- [ ] **Step 5: Commit.**

```bash
git add tests/e2e/_realtimeDrivabilityProbe.ts tests/e2e/helpers/realtimeOracle.ts
git commit --no-verify -m "test(admin): realtime e2e oracle constants from drivability spike"
```

(On the NOT_DRIVABLE outcome the probe file still gets committed — it is the recorded evidence for the branch selection — as the first commit of the fallback branch: `git add tests/e2e/_realtimeDrivabilityProbe.ts` folded into the conduction-harness commit.)

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

- [ ] **Step 4: Red-phase proof (the e2e is an acceptance test — prove it can fail on the defect it exists to catch).** Task 1's mount is COMMITTED, so stashing does nothing — instead make a temporary uncommitted breakage: edit `app/admin/_showReviewModal.tsx` and replace the ENTIRE `{versionToken !== null ? (…) : null}` conditional block with `{null}` (a complete, valid JSX expression — deleting only the inner element would leave an empty ternary branch and fail the BUILD, proving nothing), then run the spec the way CI does — **the config's own :3000 webServer builds and serves the prod artifact; never build out-of-band** (round-7 F4: a manually-built alternate `NEXT_DIST_DIR` is never what the webServer serves):

```bash
# (manual edit: replace the bridge conditional block with {null} in the loader return)
lsof -iTCP:3000 -sTCP:LISTEN   # MUST be empty — CI mode disables reuseExistingServer and boots its own server
CI=true BASELINE_SERVER_ONLY=1 MODAL_REALTIME_E2E=1 pnpm exec playwright test --retries=0 --project=desktop-chromium tests/e2e/published-review-modal.realtime.spec.ts
```

`CI=true` flips the :3000 baseline webServer entry to `pnpm build && pnpm start -H 127.0.0.1` (prod build+serve, `playwright.config.ts:233-236`) — so the uncommitted `{null}` edit is exactly what gets built and served; `BASELINE_SERVER_ONLY=1` boots ONLY the :3000 entry (filter at `playwright.config.ts:386-388` — the same env `published-modal-e2e.yml` already sets); `--retries=0` overrides CI-mode's `retries: 2` so the red run fails once, crisply. (The CI-mode build lands in the default `.next`, clobbering any dev artifact — accepted; the next `pnpm dev` rebuilds.)

Expected: FAIL BEHAVIORALLY (build succeeds; no bridge → no subscription → gate 2 times out waiting for the join reply). Restore with `git checkout -- app/admin/_showReviewModal.tsx` (the breakage was never staged or committed).

- [ ] **Step 5: Green run against the same CI-mode prod server.**

```bash
CI=true BASELINE_SERVER_ONLY=1 MODAL_REALTIME_E2E=1 pnpm exec playwright test --retries=0 --project=desktop-chromium tests/e2e/published-review-modal.realtime.spec.ts
```

Expected: PASS (`--retries=0` kept — a first-attempt local pass, not a retry-masked one; CI itself runs with its own retry budget). The dev server is NOT sufficient — the open-refresh + RSC behavior must be prod, which is exactly what the CI-mode webServer serves. If port 3000 is contested by a sibling worktree, free it or use the scratch alt-port config lesson.

- [ ] **Step 6: Commit.**

```bash
git add tests/e2e/published-review-modal.realtime.spec.ts playwright.config.ts
git commit --no-verify -m "test(admin): realtime broadcast e2e for the published show modal"
```

---

### Task 5: CI wiring — join `published-modal-e2e.yml` (red-first via a structural workflow pin)

**Files:**

- Create: `tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts` (the failing test — round-7 F2: workflow wiring gets an executable red phase, not just the Task-7 real-CI proof)
- Modify: `.github/workflows/published-modal-e2e.yml`

- [ ] **Step 1: Write the failing structural pin test.** String-match idiom per the established workflow guards (`tests/cross-cutting/ci-workflow-speedup.test.ts:1-17` — `readFileSync` on `.github/workflows/*.yml`, no yaml dependency; runs in `pnpm test` like its cross-cutting peers):

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Realtime-refresh plan Task 5: the realtime e2e's CI gate is DARK unless all
// three wiring points exist in published-modal-e2e.yml — a green workflow
// whose run line lacks the spec is the green-without-running failure mode
// (round-6 F5). This pin is the wiring's red phase (written BEFORE the YAML
// edit) and its structural guard afterward. Idiom per ci-workflow-speedup.
const WORKFLOW = readFileSync(
  join(process.cwd(), ".github", "workflows", "published-modal-e2e.yml"),
  "utf8",
);

describe("published-modal-e2e realtime wiring", () => {
  it("sets the MODAL_REALTIME_E2E env gate (the spec self-skips without it)", () => {
    expect(WORKFLOW).toMatch(/MODAL_REALTIME_E2E:\s*"1"/);
  });

  it("lists the realtime spec on the playwright RUN LINE (not merely in path filters)", () => {
    // Anchored to the `playwright test` invocation so a path-filter entry
    // alone can never satisfy it.
    expect(WORKFLOW).toMatch(/playwright test[^\n]*published-review-modal\.realtime\.spec\.ts/);
  });

  it("path-filters on the bridge component so bridge edits re-run the gate", () => {
    expect(WORKFLOW).toMatch(/-\s*"components\/realtime\/ShowRealtimeBridge\.tsx"/);
  });
});
```

(If the run line is later wrapped across YAML lines, widen the run-line regex to match the wrapped form at implementation time — the anchor stays "the playwright invocation", never a bare `toContain` that a path filter would satisfy.)

- [ ] **Step 2: Run it — verify red.**

Run: `pnpm vitest run tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts`
Expected: **all 3 FAIL** (none of the wiring exists in the workflow yet).

- [ ] **Step 3: Edit the workflow.** (a) Add the env gate next to `MODAL_PREFETCH_E2E: "1"`:

```yaml
      # Realtime-refresh spec §8 CI wiring: the realtime e2e self-skips without it.
      MODAL_REALTIME_E2E: "1"
```

(b) Append `tests/e2e/published-review-modal.realtime.spec.ts` to the existing `playwright test` file list on the run line. (c) Add path filters under `on.pull_request.paths`:

```yaml
      - "components/realtime/ShowRealtimeBridge.tsx"
      - "tests/e2e/published-review-modal.realtime.spec.ts"
```

(`app/admin/_showReviewModal.tsx`, `playwright.config.ts`, `tests/e2e/helpers/**` are already listed.)

- [ ] **Step 4: Green + commit (pin test and YAML land together).** The pin proves the wiring EXISTS; the Task-7 real-CI log proof remains the integration-level check that the wiring EXECUTES (both are required — neither subsumes the other).

```bash
pnpm vitest run tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts   # all 3 PASS
pnpm exec prettier --check .github/workflows/published-modal-e2e.yml
git add tests/cross-cutting/published-modal-e2e-realtime-wiring.test.ts .github/workflows/published-modal-e2e.yml
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

The `published-modal-e2e` run MUST appear and pass on the PR (its path filters match this diff), AND its log must PROVE the new spec actually executed — `gh run view <runId> --log | grep -c "published-review-modal.realtime"` (or `realtime-bridge-conduction` on the fallback branch) must show ≥1 executed-test line; a green run whose log lacks the spec name means the run-line/env-gate wiring was dropped and the gate is DARK (round-6 F5 — green-without-running is the failure mode). If it did not trigger, `gh workflow run published-modal-e2e.yml --ref feat/admin-modal-realtime-refresh` and watch that run. If the PR is BEHIND/DIRTY, rebuild on `origin/main` first (merge-ref CI lesson).

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
- **Anti-tautology:** Task 1 Step 9's post-commit negative verifications + Task 1 Step 3's red-first pins/registry row + Task 5's red-first workflow pin are the explicit negative verifications (Task 2 is folded into Task 1); Task 4's oracle carries the spec's attribution gates (quiescence, join-reply, no-/version assertion), row-scoped content check with preconditions, geometry proof separated from the scroll invariant, and the menu-closed check that first observes auto-open. Concrete failure modes each test catches are stated inline in the spec §8.
- **Advisory-lock topology:** untouched (spec §9 declaration).
- **Fix-round regression budget:** after each adversarial repair, re-grep the repaired class across the loader + spec files and rerun `tests/admin` + `tests/log`.
