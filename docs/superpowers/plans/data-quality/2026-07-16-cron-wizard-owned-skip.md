# Cron Wizard-Ownership Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `perFileProcessor` skips files owned by the active pending wizard session so the automatic sync (cron/push) can never stage, apply, or first-seen auto-publish a sheet the onboarding wizard has in flight.

**Architecture:** One new gate stage inside `lib/sync/perFileProcessor.ts`, after the live-deferral short-circuits and before the watermark reads. Ownership = `app_settings.pending_wizard_session_id` non-null AND a wizard-partition row for `(driveFileId, sessionId)` in `pending_syncs`, `pending_ingestions`, or `deferred_ingestions`. New skip reason `"wizard_owned"` flows through the existing generic skip plumbing (`prepareProcessOneFile` → `logSync`). No gate-side staleness clock; no DB migration; no advisory-lock changes.

**Tech Stack:** TypeScript, supabase-js service-role client, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-cron-wizard-owned-skip.md` (adversarially APPROVED, 12 rounds). The spec's §2 semantics, §4 test matrix, and §6 watchpoints govern; where this plan and the spec disagree, the spec wins.

## Global Constraints

- Plan-wide invariants of `AGENTS.md` apply; specifically invariant 9 (Supabase call-boundary discipline — every new read maps returned AND thrown errors to `SyncInfraError`) and invariants 1+6 (TDD per task; one conventional commit per task).
- The gate must NEVER read `pending_wizard_session_at` (spec §2.1 — no gate-side staleness clock; structurally pinned in Step 5's meta-test).
- Ownership probes carry literal table names (`.from("pending_syncs")` etc.) so the partition-scope meta-test can enumerate them — do NOT factor into a generic `from(table)` helper.
- Ownership probes use the spec §2.5 shape exactly: `select("drive_file_id").eq("drive_file_id", F).eq("wizard_session_id", S).limit(1).maybeSingle()` — the `.limit(1)` keeps a duplicate wizard row (no unique index guarantee across all three tables' wizard partitions) from turning `maybeSingle` into a spurious error.
- Skip-order contract (spec §2.3): live-deferral skips (`deferred_permanent`, `deferred_modtime`) → wizard-ownership → watermark reads.
- `wizard_owned` uses the existing generic logging path — no special-casing next to `ARCHIVED_SKIP_REASON`.
- Meta-test inventory (spec §5): EXTEND `tests/sync/_metaInfraContract.test.ts` and `tests/sync/_partitionScopeContract.test.ts`. Advisory-lock topology test: none applies (gate is pre-lock, read-only). Mutation-surface observability: none applies (reads only).
- Worktree: `/Users/ericweiss/FX-Webpage-Template-worktrees/fix-cron-wizard-owned-skip`. Commit with `--no-verify` (shared hook contention); run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before push (Task 2).

## TDD shape (why this is two tasks, not six)

The gate is ONE deliverable: every spec-§4 test targets the same ~90-line change, so the whole battery is written FIRST (Steps 1–5), proven red (Step 6), then the gate is implemented once (Step 7) and proven green (Step 8) — a single honest failing-test → implementation → green cycle with one commit (invariants 1+6).

Two test groups by pre-implementation expectation, enumerated in Step 6:

- **MUST-BE-RED before implementation** (they specify the new behavior): the four owned-arm skips, push-mode skip, missing-singleton fail-loud, ownership-beats-watermark, no-stale-clock, all 8 infra-fault cases, the partition-topology counts + no-clock pin, and the incident-shape integration test.
- **EXPECTED-GREEN before implementation** (regression pins on behavior that already holds and must SURVIVE the change): no-session proceeds (with the no-probes assertion), different-session proceeds, and the three deferral-priority cases. These cannot fail against pre-gate code by construction; their value is guarding the gate's PLACEMENT (a wrong implementation — gate before the deferral branches, or probing before reading the singleton — turns them red).

---

### Task 1: Wizard-ownership gate — full TDD cycle

**Files:**
- Modify: `lib/sync/perFileProcessor.ts` (skip-reason union `:8-22`; new helpers after `readLivePendingSyncGateRow` `:144-163`; gate logic in `perFileProcessor` after the deferral checks `:175-183`)
- Test: `tests/sync/perFileProcessor.test.ts` (extend `FakeDb`; new `wizard-ownership skip` + integration describes)
- Test: `tests/sync/_metaInfraContract.test.ts` (8 behavioral cases in the `perFileProcessor` describe `:496-511`)
- Test: `tests/sync/_partitionScopeContract.test.ts` (replace first test `:17-24`; add no-clock pin)

**Interfaces:**
- Consumes: existing `SyncInfraError`, `createSupabaseServiceRoleClient`, `isAutomaticMode`; `ProcessOneFileDeps["logSync"]` and the `lockWithArchived(false)` pattern from `tests/sync/def4-archived-skip.test.ts:25-36`.
- Produces (Task 2 and reviewers rely on these exact names):
  - union member `"wizard_owned"` in `PerFileProcessorResult["reason"]`
  - `readPendingWizardSessionId(supabase: SyncSupabaseClient): Promise<string | null>` — throws `SyncInfraError` on returned error, thrown error, or ABSENT `'default'` row
  - `readWizardPendingSyncOwnership(supabase, driveFileId, wizardSessionId): Promise<boolean>`
  - `readWizardPendingIngestionOwnership(supabase, driveFileId, wizardSessionId): Promise<boolean>`
  - `readWizardDeferralOwnership(supabase, driveFileId, wizardSessionId): Promise<boolean>`
  (helpers are module-private — not exported; tests exercise them through `perFileProcessor`)

- [ ] **Step 1: Extend the FakeDb harness**

In `tests/sync/perFileProcessor.test.ts`, extend the `FakeDb` type and `createFakeSupabase` seed (`:6-10`, `:47-52`) with the two missing tables:

```ts
type FakeDb = {
  shows: Row[];
  pending_syncs: Row[];
  deferred_ingestions: Row[];
  pending_ingestions: Row[];
  app_settings: Row[];
};
```

```ts
  const db: FakeDb = {
    shows: [...(seed.shows ?? [])],
    pending_syncs: [...(seed.pending_syncs ?? [])],
    deferred_ingestions: [...(seed.deferred_ingestions ?? [])],
    pending_ingestions: [...(seed.pending_ingestions ?? [])],
    app_settings: [
      ...(seed.app_settings ?? [{ id: "default", pending_wizard_session_id: null }]),
    ],
  };
```

Every EXISTING test in this file seeds no `app_settings` row and the new gate fail-louds on a missing singleton — the `seed.app_settings ?? [default no-session row]` default keeps them green. An explicitly-seeded EMPTY array (`app_settings: []`) still models the corrupted install for the missing-singleton tests.

Add a no-op `limit()` to the `QueryBuilder` (`:55-97`) so the probe chain parses:

```ts
    limit(_count: number) {
      return this;
    }
```

- [ ] **Step 2: Write the gate unit tests (red + pins)**

Append to `tests/sync/perFileProcessor.test.ts`:

```ts
describe("wizard-ownership skip", () => {
  const SESSION = "11111111-1111-4111-8111-111111111111";
  const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";
  const MODIFIED = "2026-05-08T12:00:00.000Z";
  const settingsWithSession = { id: "default", pending_wizard_session_id: SESSION };

  test("cron skips a file the active wizard session has staged (pending_syncs arm)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("push mode is gated too (pending_syncs arm)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "push", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("pending_ingestions arm: a wizard hard-fail row owns the file", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_ingestions: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("deferred_ingestions arm: a wizard-deferred row owns the file", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: SESSION, deferred_kind: "defer_until_modified" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });

  test("no pending session: proceeds and issues NO ownership probes", async () => {
    const fake = createFakeSupabase({
      app_settings: [{ id: "default", pending_wizard_session_id: null }],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
    const probeCalls = fake.calls.filter((call) =>
      call.filters.some((f) => f.kind === "eq" && f.column === "wizard_session_id"),
    );
    expect(probeCalls).toEqual([]);
  });

  test("rows belonging to a DIFFERENT session do not own the file", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: OTHER_SESSION }],
      pending_ingestions: [{ drive_file_id: "file-1", wizard_session_id: OTHER_SESSION }],
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: OTHER_SESSION, deferred_kind: "defer_until_modified" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "proceed",
      mode: "cron",
    });
  });

  test("missing app_settings singleton → SyncInfraError (fail-loud, not fail-open)", async () => {
    const fake = createFakeSupabase({ app_settings: [] });
    supabaseMock.client = fake.client;
    const { perFileProcessor, SyncInfraError } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).rejects.toBeInstanceOf(
      SyncInfraError,
    );
  });

  test("ownership beats watermark: an up-to-date show row still yields wizard_owned", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      shows: [
        {
          drive_file_id: "file-1",
          last_sync_status: "synced",
          last_seen_modified_time: MODIFIED, // watermark would skip: not isAfter
          diagrams: null,
          archived: false,
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
    // §2.3 ordering: the gate must RETURN before the watermark reads — not
    // read them and override. No shows read; no live-scoped pending_syncs read.
    expect(fake.calls.filter((c) => c.table === "shows")).toEqual([]);
    const liveWatermarkReads = fake.calls.filter(
      (c) =>
        c.table === "pending_syncs" &&
        c.filters.some((f) => f.kind === "is" && f.column === "wizard_session_id"),
    );
    expect(liveWatermarkReads).toEqual([]);
  });

  test("manual and onboarding_scan modes return proceed BEFORE any wizard reads", async () => {
    for (const mode of ["manual", "onboarding_scan"] as const) {
      const fake = createFakeSupabase({
        app_settings: [settingsWithSession],
        pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      });
      supabaseMock.client = fake.client;
      const { perFileProcessor } = await importProcessor();

      await expect(perFileProcessor("file-1", mode, fileMeta(MODIFIED))).resolves.toEqual({
        outcome: "proceed",
        mode,
      });
      // §2.2: non-automatic modes return before ANY read — zero queries issued.
      expect(fake.calls).toEqual([]);
    }
  });

  test("live permanent_ignore beats wizard ownership (deferral priority a)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_permanent",
    });
  });

  test("live defer_until_modified (unmodified) beats wizard ownership (deferral priority b)", async () => {
    const fake = createFakeSupabase({
      app_settings: [settingsWithSession],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      deferred_ingestions: [
        {
          drive_file_id: "file-1",
          wizard_session_id: null,
          deferred_kind: "defer_until_modified",
          deferred_at_modified_time: MODIFIED, // fileMeta(MODIFIED) is NOT after → deferral holds
        },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_modtime",
    });
  });

  test("deferral priority holds even on a corrupted install (empty app_settings)", async () => {
    const fake = createFakeSupabase({
      app_settings: [],
      deferred_ingestions: [
        { drive_file_id: "file-1", wizard_session_id: null, deferred_kind: "permanent_ignore" },
      ],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    // Live-deferral short-circuits BEFORE the app_settings read (spec §2.3) —
    // no SyncInfraError despite the missing singleton.
    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "deferred_permanent",
    });
  });

  test("no stale-clock: a 25h-old pending_wizard_session_at still owns (gate reads no timestamp)", async () => {
    const fake = createFakeSupabase({
      app_settings: [
        {
          id: "default",
          pending_wizard_session_id: SESSION,
          // 25h before the file's modifiedTime — irrelevant to the gate by contract.
          pending_wizard_session_at: "2026-05-07T11:00:00.000Z",
        },
      ],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
    });
    supabaseMock.client = fake.client;
    const { perFileProcessor } = await importProcessor();

    await expect(perFileProcessor("file-1", "cron", fileMeta(MODIFIED))).resolves.toEqual({
      outcome: "skip",
      reason: "wizard_owned",
    });
  });
});
```

- [ ] **Step 3: Write the incident-shape integration test (red)**

Append to `tests/sync/perFileProcessor.test.ts` (real `perFileProcessor` through `processOneFile` — NO `deps.perFileProcessor` injection):

```ts
describe("incident-shape integration: cron pipeline honors wizard ownership", () => {
  test("wizard-staged file with no shows row → skipped:wizard_owned, sync_log entry written", async () => {
    const SESSION = "11111111-1111-4111-8111-111111111111";
    const MODIFIED = "2026-05-08T12:00:00.000Z";
    const fake = createFakeSupabase({
      app_settings: [{ id: "default", pending_wizard_session_id: SESSION }],
      pending_syncs: [{ drive_file_id: "file-1", wizard_session_id: SESSION }],
      // no shows row — the validation-incident shape (post-reset first-seen)
    });
    supabaseMock.client = fake.client;
    vi.resetModules();
    const { processOneFile } = await import("@/lib/sync/runScheduledCronSync");

    const logged: unknown[] = [];
    const result = await processOneFile("file-1", "cron", fileMeta(MODIFIED), {
      logSync: async (entry: unknown) => {
        logged.push(entry);
      },
      // Non-archived under-lock re-read (DEF-4 relabel branch not taken).
      withShowLock: (async (_driveFileId: string, fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          async queryOne(sql: string) {
            if (/select archived from public\.shows/i.test(sql)) return { archived: false };
            throw new Error(`unexpected SQL in lock tx: ${sql}`);
          },
        })) as never,
    });

    expect(result).toEqual({ outcome: "skipped", reason: "wizard_owned" });
    // reason → SyncLogEntry.code at the boundary (runScheduledCronSync.ts:2197-2198).
    expect(logged).toEqual([
      { driveFileId: "file-1", outcome: "skipped", code: "wizard_owned" },
    ]);
  });
});
```

If the logged entry carries an extra unconditional boundary field, match the assertion to the REAL `SyncLogEntry` fields but keep `code: "wizard_owned"` and `outcome: "skipped"` load-bearing.

- [ ] **Step 4: Write the 8 infra-fault cases (red)**

In `tests/sync/_metaInfraContract.test.ts`, inside the `perFileProcessor` describe (`:496-511`). First read `:440-495` to identify the mock seam (`infraMock` hoisted object + `importProcessor()`); if the mock exposes no direct client slot, add `client: null as unknown` to the hoisted object and have the mocked `createSupabaseServiceRoleClient` return it when set (exactly the `supabaseMock.client` pattern in `tests/sync/perFileProcessor.test.ts:18-25`).

**Mock-state hygiene (mandatory):** the file's `beforeEach` currently resets only the existing flags (`throwOnConstruct` / `throwOnFrom`); a sticky `infraMock.client` would leak the probe client into every later case in the file. Add `infraMock.client = null;` to that same `beforeEach` alongside the existing flag resets, and make the mocked factory prefer the flags, then the client slot, then the default fake.

The failure injection keys on the OWNERSHIP-PROBE chain (an `.eq("wizard_session_id", …)` filter), NOT on the table alone — otherwise the `deferred_ingestions` and `pending_syncs` cases would trip the earlier live-scoped reads (`.is("wizard_session_id", null)`) and never exercise the new probes:

```ts
    type GateFailure = { table: string; failure: "returned_error" | "thrown_error" };

    // Fails ONLY the wizard-scoped ownership probe (.eq("wizard_session_id", …))
    // for the given table (app_settings keyed on the table itself — it has no
    // wizard-scoped filter). All other reads succeed with benign rows.
    function gateClientWithProbeFailure(target: GateFailure) {
      function builderFor(table: string) {
        let wizardScoped = false;
        const builder = {
          select: () => builder,
          limit: () => builder,
          is: () => builder,
          eq: (column: string) => {
            if (column === "wizard_session_id") wizardScoped = true;
            return builder;
          },
          async maybeSingle() {
            const isTarget =
              table === target.table && (table === "app_settings" || wizardScoped);
            if (isTarget) {
              if (target.failure === "thrown_error") throw new Error(`${table} boom`);
              return { data: null, error: { message: `${table} returned error` } };
            }
            if (table === "app_settings")
              return {
                data: { pending_wizard_session_id: "11111111-1111-4111-8111-111111111111" },
                error: null,
              };
            return { data: null, error: null };
          },
        };
        return builder;
      }
      return { from: (table: string) => builderFor(table) };
    }

    const PROBE_TABLES = [
      "app_settings",
      "pending_syncs",
      "pending_ingestions",
      "deferred_ingestions",
    ] as const;

    for (const table of PROBE_TABLES) {
      for (const failure of ["returned_error", "thrown_error"] as const) {
        test(`wizard-ownership ${table} probe ${failure} → SyncInfraError`, async () => {
          infraMock.client = gateClientWithProbeFailure({ table, failure });
          const { perFileProcessor, SyncInfraError } = await importProcessor();

          await expect(perFileProcessor("file-1", "cron", fileMeta())).rejects.toBeInstanceOf(
            SyncInfraError,
          );
        });
      }
    }
```

Because ownership probes for the three row tables return `{ data: null }` when not targeted, the gate under test proceeds through every arm and each targeted case fails exactly at the NEW probe (`readWizardPendingSyncOwnership` / `readWizardPendingIngestionOwnership` / `readWizardDeferralOwnership`) — spec §4 item 10's per-probe coverage.

- [ ] **Step 5: Write the partition-topology + no-clock meta-tests (red)**

In `tests/sync/_partitionScopeContract.test.ts`, REPLACE the first test (`:17-24`) with:

```ts
  test("perFileProcessor partitioned reads: every occurrence is live-scoped or wizard-scoped, counts pinned", () => {
    const gate = source("lib/sync/perFileProcessor.ts");
    const expectedCounts: Record<string, number> = {
      pending_syncs: 2, // live watermark read + wizard ownership probe
      deferred_ingestions: 2, // live deferral read + wizard ownership probe
      pending_ingestions: 1, // wizard ownership probe only
    };

    for (const [table, expectedCount] of Object.entries(expectedCounts)) {
      const occurrences = [...gate.matchAll(new RegExp(`\\.from\\("${table}"\\)`, "g"))];
      expect(occurrences, `${table} .from() count`).toHaveLength(expectedCount);

      for (const match of occurrences) {
        const start = match.index ?? 0;
        const chainEnd = gate.indexOf(".maybeSingle()", start);
        expect(chainEnd, `${table} chain at ${start} has a terminal maybeSingle`).toBeGreaterThan(
          start,
        );
        const chain = gate.slice(start, chainEnd);
        const liveScoped = chain.includes('.is("wizard_session_id", null)');
        const wizardScoped = chain.includes('.eq("wizard_session_id"');
        expect(
          liveScoped !== wizardScoped,
          `${table} read at ${start} must be exactly one of live-scoped / wizard-scoped:\n${chain}`,
        ).toBe(true);
        if (wizardScoped) {
          // Spec §2.5 probe shape: a duplicate wizard row must not turn
          // maybeSingle into a spurious error — .limit(1) is load-bearing.
          expect(
            chain.includes(".limit(1)"),
            `${table} wizard-scoped probe at ${start} must carry .limit(1):\n${chain}`,
          ).toBe(true);
        }
      }
    }
  });

  test("perFileProcessor never reads the session staleness clock", () => {
    const gate = source("lib/sync/perFileProcessor.ts");
    // Spec 2026-07-16 §2.1: lifecycle transitions are the only release
    // authorities; a gate-side staleness clock diverges and reopens the hijack.
    expect(gate).not.toContain("pending_wizard_session_at");
  });
```

(The no-clock pin is EXPECTED-GREEN pre-implementation — the string doesn't exist yet — but it is structural insurance, not a behavior test; it stays.)

- [ ] **Step 6: Run all four test files, verify the red/green split**

Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts tests/sync/_metaInfraContract.test.ts tests/sync/_partitionScopeContract.test.ts 2>&1 | tail -25`

Expected FAILURES (MUST be red — if any passes, the test is tautological; fix the test):
- all four owned-arm tests, push-mode, missing-singleton, ownership-beats-watermark, no-stale-clock (unit)
- the incident-shape integration test
- all 8 infra-fault cases
- the partition-topology counts test (`pending_syncs` 1≠2, `deferred_ingestions` 1≠2, `pending_ingestions` 0≠1)

Expected PASSES (pre-existing-behavior pins per the "TDD shape" section): no-session, different-session, deferral priorities a/b/corrupted-install, the manual/onboarding_scan zero-reads pin, the no-clock string pin, and every pre-existing test in the three files.

- [ ] **Step 7: Implement the gate**

In `lib/sync/perFileProcessor.ts`:

(a) Extend the skip-reason union (`:8-22`):

```ts
      reason:
        | "deferred_permanent"
        | "deferred_modtime"
        | "watermark"
        | "partial_failure_restage_required"
        | "WEBHOOK_NOOP_ALREADY_SYNCED"
        | "wizard_owned"
        | typeof ARCHIVED_SKIP_REASON;
```

(b) Add the four helpers after `readLivePendingSyncGateRow` (each mirrors the existing try/catch + `SyncInfraError` shape; literal table names are load-bearing for the partition meta-test):

```ts
type AppSettingsGateRow = {
  pending_wizard_session_id: string | null;
};

// Spec 2026-07-16 §2.1: the gate reads ONLY the session pointer. It must never
// read the session staleness timestamp — staleness belongs to the lifecycle
// (finalize-cas / setup takeover / cleanupAbandonedFinalize / reap), never here.
async function readPendingWizardSessionId(supabase: SyncSupabaseClient): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("pending_wizard_session_id")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readPendingWizardSessionId", "returned_error", error);
    }
    if (!data) {
      // A missing singleton is a corrupted install, not "no session" — failing
      // open here would reopen the wizard-hijack path (spec §2.2).
      throw new SyncInfraError(
        "readPendingWizardSessionId",
        "returned_error",
        new Error("app_settings 'default' row is missing"),
      );
    }
    return (data as AppSettingsGateRow).pending_wizard_session_id ?? null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readPendingWizardSessionId", "thrown_error", cause);
  }
}

async function readWizardPendingSyncOwnership(
  supabase: SyncSupabaseClient,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("pending_syncs")
      .select("drive_file_id")
      .eq("drive_file_id", driveFileId)
      .eq("wizard_session_id", wizardSessionId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readWizardPendingSyncOwnership", "returned_error", error);
    }
    return data !== null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readWizardPendingSyncOwnership", "thrown_error", cause);
  }
}

async function readWizardPendingIngestionOwnership(
  supabase: SyncSupabaseClient,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("pending_ingestions")
      .select("drive_file_id")
      .eq("drive_file_id", driveFileId)
      .eq("wizard_session_id", wizardSessionId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readWizardPendingIngestionOwnership", "returned_error", error);
    }
    return data !== null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readWizardPendingIngestionOwnership", "thrown_error", cause);
  }
}

async function readWizardDeferralOwnership(
  supabase: SyncSupabaseClient,
  driveFileId: string,
  wizardSessionId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("deferred_ingestions")
      .select("drive_file_id")
      .eq("drive_file_id", driveFileId)
      .eq("wizard_session_id", wizardSessionId)
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new SyncInfraError("readWizardDeferralOwnership", "returned_error", error);
    }
    return data !== null;
  } catch (cause) {
    if (cause instanceof SyncInfraError) throw cause;
    throw new SyncInfraError("readWizardDeferralOwnership", "thrown_error", cause);
  }
}
```

(c) Insert the gate stage in `perFileProcessor`, immediately AFTER the `defer_until_modified` block (`:179-183`) and BEFORE the `const [show, pendingSync] = await Promise.all([...])` watermark reads (`:185-188`):

```ts
  // Wizard-ownership skip (spec 2026-07-16-cron-wizard-owned-skip §2): a file
  // the ACTIVE pending wizard session has in flight (staged preview, wizard
  // hard-fail, or session-scoped deferral) belongs to the wizard until the
  // session releases it. Ordering contract (§2.3): live-deferral skips above
  // keep priority; this returns before the watermark reads so wizard_owned
  // wins over watermark. Probes short-circuit on the first owning arm.
  const pendingWizardSessionId = await readPendingWizardSessionId(supabase);
  if (pendingWizardSessionId !== null) {
    const owned =
      (await readWizardPendingSyncOwnership(supabase, driveFileId, pendingWizardSessionId)) ||
      (await readWizardPendingIngestionOwnership(supabase, driveFileId, pendingWizardSessionId)) ||
      (await readWizardDeferralOwnership(supabase, driveFileId, pendingWizardSessionId));
    if (owned) {
      return { outcome: "skip", reason: "wizard_owned" };
    }
  }
```

- [ ] **Step 8: Run all four test files, verify green**

Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts tests/sync/_metaInfraContract.test.ts tests/sync/_partitionScopeContract.test.ts 2>&1 | tail -10`
Expected: ALL pass (every Step 6 red test now green; every Step 6 green pin still green).

- [ ] **Step 9: Commit**

```bash
git add lib/sync/perFileProcessor.ts tests/sync/perFileProcessor.test.ts tests/sync/_metaInfraContract.test.ts tests/sync/_partitionScopeContract.test.ts
git commit --no-verify -m "feat(sync): wizard-ownership skip in perFileProcessor gate"
```

---

### Task 2: Full-suite + quality gates

**Files:** none new — verification only (fix fallout in place if any).

**Interfaces:**
- Consumes: Task 1's committed gate.

- [ ] **Step 1: Full test suite**

Run: `pnpm test 2>&1 | tail -15`
Expected: green. Watch specifically for: other tests exercising `perFileProcessor` or `processOneFile` against hand-rolled fakes that now need an `app_settings` row (the shared-mock class — sweep with `rg -l "perFileProcessor|processOneFile" tests/` and fix each harness by seeding the no-session singleton, mirroring Task 1 Step 1).

- [ ] **Step 2: Quality gates (CI parity)**

Run: `pnpm typecheck && pnpm lint && pnpm format:check 2>&1 | tail -5`
Expected: all green. `--no-verify` commits skipped the prettier hook — `pnpm format` any flagged file and re-run.

- [ ] **Step 3: Commit any fallout fixes**

```bash
git add -A
git commit --no-verify -m "test(sync): harness fallout for wizard-ownership gate (app_settings singleton seeds)"
```

(Skip the commit if Steps 1–2 required no changes.)

---

## Advisory-lock holder topology declaration

This plan touches NO `pg_advisory*` surface. The gate runs before `withPostgresSyncPipelineLock` in `processOneFile` (pre-lock reads, same as the existing watermark gate reads). No existing holder changes; `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected.

## Meta-test inventory (declared)

- EXTENDS `tests/sync/_metaInfraContract.test.ts` (Task 1 Step 4 — 8 behavioral cases keyed on the ownership-probe chain; module registry row `perFileProcessor` already present at `:17-20`).
- EXTENDS `tests/sync/_partitionScopeContract.test.ts` (Task 1 Step 5 — dual-topology counts + no-clock pin).
- None applies: advisory-lock topology (no lock surface), auth infra registry (no auth helper), mutation-surface observability (reads only), sentinel-hiding / alert-catalog / email-normalization (no such surface touched).
