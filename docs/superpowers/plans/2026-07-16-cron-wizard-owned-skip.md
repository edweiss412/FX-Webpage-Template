# Cron Wizard-Ownership Skip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `perFileProcessor` skips files owned by the active pending wizard session so the automatic sync (cron/push) can never stage, apply, or first-seen auto-publish a sheet the onboarding wizard has in flight.

**Architecture:** One new gate stage inside `lib/sync/perFileProcessor.ts`, after the live-deferral short-circuits and before the watermark reads. Ownership = `app_settings.pending_wizard_session_id` non-null AND a wizard-partition row for `(driveFileId, sessionId)` in `pending_syncs`, `pending_ingestions`, or `deferred_ingestions`. New skip reason `"wizard_owned"` flows through the existing generic skip plumbing (`prepareProcessOneFile` → `logSync`). No gate-side staleness clock; no DB migration; no advisory-lock changes.

**Tech Stack:** TypeScript, supabase-js service-role client, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-cron-wizard-owned-skip.md` (adversarially APPROVED, 12 rounds). The spec's §2 semantics, §4 test matrix, and §6 watchpoints govern; where this plan and the spec disagree, the spec wins.

## Global Constraints

- Plan-wide invariants of `AGENTS.md` apply; specifically invariant 9 (Supabase call-boundary discipline — every new read maps returned AND thrown errors to `SyncInfraError`) and invariant 6 (one conventional commit per task).
- The gate must NEVER read `pending_wizard_session_at` (spec §2.1 — no gate-side staleness clock; structurally pinned in Task 4).
- Ownership probes carry literal table names (`.from("pending_syncs")` etc.) so the partition-scope meta-test can enumerate them — do NOT factor into a generic `from(table)` helper.
- Skip-order contract (spec §2.3): live-deferral skips (`deferred_permanent`, `deferred_modtime`) → wizard-ownership → watermark reads.
- `wizard_owned` uses the existing generic logging path — no special-casing next to `ARCHIVED_SKIP_REASON`.
- Meta-test inventory (spec §5): EXTEND `tests/sync/_metaInfraContract.test.ts` and `tests/sync/_partitionScopeContract.test.ts`. Advisory-lock topology test: none applies (gate is pre-lock, read-only). Mutation-surface observability: none applies (reads only).
- Worktree: `/Users/ericweiss/FX-Webpage-Template-worktrees/fix-cron-wizard-owned-skip`. Commit with `--no-verify` (shared hook contention); run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before push (Task 6).

---

### Task 1: Ownership gate — core unit tests + implementation

**Files:**
- Modify: `lib/sync/perFileProcessor.ts` (skip-reason union `:8-22`; new helpers after `readLivePendingSyncGateRow` `:144-163`; gate logic in `perFileProcessor` after the deferral checks `:175-183`)
- Test: `tests/sync/perFileProcessor.test.ts` (extend `FakeDb` + add a `wizard-ownership` describe block)

**Interfaces:**
- Consumes: existing `SyncInfraError`, `createSupabaseServiceRoleClient`, `isAutomaticMode`.
- Produces (Tasks 2–5 rely on these exact names):
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
    app_settings: [...(seed.app_settings ?? [])],
  };
```

The existing `QueryBuilder` (`select/eq/is/maybeSingle`) already covers the new reads — no builder changes. NOTE: every EXISTING test in this file seeds no `app_settings` row, and the new gate fail-louds on a missing singleton. Add a seed default so existing tests keep passing: in `createFakeSupabase`, when the caller seeds no `app_settings`, default to the no-session singleton:

```ts
    app_settings: [
      ...(seed.app_settings ?? [{ id: "default", pending_wizard_session_id: null }]),
    ],
```

(An explicitly-seeded EMPTY array — `app_settings: []` — still models the corrupted install for the missing-singleton tests; `seed.app_settings ?? …` only fills in when the key is absent.)

- [ ] **Step 2: Write the failing core tests**

Append a describe block to `tests/sync/perFileProcessor.test.ts`. Shared constants derive from the fixtures — no magic literals repeated:

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
});
```

- [ ] **Step 3: Run the new tests, verify they fail**

Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts 2>&1 | tail -20` (from the worktree root)
Expected: the four owned-arm tests and the missing-singleton test FAIL (gate currently proceeds to watermark logic / never reads `app_settings`); the no-session and different-session tests may pass incidentally — that is fine at this step.

- [ ] **Step 4: Implement the gate**

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
// read pending_wizard_session_at — session staleness belongs to the lifecycle
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

- [ ] **Step 5: Run the file's full test suite, verify green**

Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts 2>&1 | tail -8`
Expected: ALL tests pass (new block + the 15 pre-existing tests — the Step 1 default `app_settings` seed keeps them green).

- [ ] **Step 6: Commit**

```bash
git add lib/sync/perFileProcessor.ts tests/sync/perFileProcessor.test.ts
git commit --no-verify -m "feat(sync): wizard-ownership skip in perFileProcessor gate"
```

---

### Task 2: Ordering, priority, and no-stale-clock pins

**Files:**
- Test: `tests/sync/perFileProcessor.test.ts` (extend the `wizard-ownership skip` describe block)
- Possibly modify: `lib/sync/perFileProcessor.ts` (only if a pin fails)

**Interfaces:**
- Consumes: Task 1's gate (`"wizard_owned"` reason, gate placement).
- Produces: nothing new — regression pins for spec §4 items 4b, 5(a–c), 6.

- [ ] **Step 1: Write the pin tests**

Append inside the `wizard-ownership skip` describe block (same `SESSION` / `MODIFIED` constants):

```ts
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
```

- [ ] **Step 2: Run, verify green (fix the gate if any pin is red)**

Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts 2>&1 | tail -8`
Expected: PASS. If the deferral-priority or empty-singleton pin fails, the gate is placed wrong (it must sit strictly after BOTH deferral branches); if the watermark pin fails, it sits after the watermark reads — move it per Task 1 Step 4(c) and re-run.

- [ ] **Step 3: Commit**

```bash
git add tests/sync/perFileProcessor.test.ts lib/sync/perFileProcessor.ts
git commit --no-verify -m "test(sync): pin wizard-ownership ordering, deferral priority, and no-stale-clock contracts"
```

---

### Task 3: Infra-contract behavioral cases (8)

**Files:**
- Test: `tests/sync/_metaInfraContract.test.ts` (extend the `perFileProcessor` describe at `:496-511`)

**Interfaces:**
- Consumes: Task 1 helpers (through `perFileProcessor`); the file's existing `infraMock` harness.

- [ ] **Step 1: Read the harness**

Open `tests/sync/_metaInfraContract.test.ts:440-520` and identify how `infraMock` builds failing clients (`throwOnConstruct` / `throwOnFrom`) and how `importProcessor()` resets modules. The new cases need finer-grained failure injection: a client whose builder REJECTS (thrown error) or RESOLVES `{ data: null, error: {...} }` (returned error) for one specific table while other tables succeed.

- [ ] **Step 2: Write the 8 failing-path cases**

Add to the `perFileProcessor` describe block. Build a targeted fake client factory local to the block:

```ts
    type TableBehavior = "ok" | "returned_error" | "thrown_error";

    function gateClientWith(behaviors: Partial<Record<string, TableBehavior>>) {
      return {
        from(table: string) {
          const behavior = behaviors[table] ?? "ok";
          const builder = {
            select: () => builder,
            eq: () => builder,
            is: () => builder,
            async maybeSingle() {
              if (behavior === "thrown_error") throw new Error(`${table} boom`);
              if (behavior === "returned_error")
                return { data: null, error: { message: `${table} returned error` } };
              // "ok" rows: app_settings default with an active session so the
              // gate always proceeds into the ownership probes.
              if (table === "app_settings")
                return {
                  data: {
                    pending_wizard_session_id: "11111111-1111-4111-8111-111111111111",
                  },
                  error: null,
                };
              return { data: null, error: null };
            },
          };
          return builder;
        },
      };
    }

    const GATE_TABLES = [
      "app_settings",
      "pending_syncs",
      "pending_ingestions",
      "deferred_ingestions",
    ] as const;

    for (const table of GATE_TABLES) {
      for (const failure of ["returned_error", "thrown_error"] as const) {
        test(`wizard-ownership ${table} ${failure} → SyncInfraError`, async () => {
          infraMock.client = gateClientWith({ [table]: failure });
          const { perFileProcessor, SyncInfraError } = await importProcessor();

          await expect(perFileProcessor("file-1", "cron", fileMeta())).rejects.toBeInstanceOf(
            SyncInfraError,
          );
        });
      }
    }
```

ADAPT the client-injection line (`infraMock.client = ...`) to the file's actual mock seam found in Step 1 — the existing cases set flags on `infraMock`; if the mock exposes no direct `client` slot, add one to its hoisted object exactly as `tests/sync/perFileProcessor.test.ts` does with `supabaseMock.client`. NOTE the deferral read (`deferred_ingestions` "ok") returns `{ data: null }` so the gate falls through the deferral branches into the ownership stage; a `deferred_ingestions` failure case exercises whichever read hits it FIRST (the live-deferral read) — that read already maps to `SyncInfraError`, which still satisfies the contract under test (every read boundary in the gate fail-louds).

- [ ] **Step 3: Run, verify all 8 pass**

Run: `pnpm vitest run tests/sync/_metaInfraContract.test.ts 2>&1 | tail -8`
Expected: PASS (Task 1 wrote the fail-loud mappings; these pin them). Any failure means a helper collapses an error into `false`/`null` — fix the helper, never the test.

- [ ] **Step 4: Commit**

```bash
git add tests/sync/_metaInfraContract.test.ts
git commit --no-verify -m "test(sync): per-table infra-fault behavioral coverage for the wizard-ownership gate"
```

---

### Task 4: Partition-scope meta-test — dual-topology + no-clock pins

**Files:**
- Test: `tests/sync/_partitionScopeContract.test.ts` (replace the first test `:17-24`; add two tests)

**Interfaces:**
- Consumes: Task 1's source shape (literal `.from("<table>")` occurrences; no `pending_wizard_session_at` reference).

- [ ] **Step 1: Write the new structural tests**

Replace the first test (`"Supabase read-side pending_syncs SELECTs are scoped to live wizard_session_id"`) with:

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
        // The builder chain ends at its terminal await — bound the window there.
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

- [ ] **Step 2: Run, verify green**

Run: `pnpm vitest run tests/sync/_partitionScopeContract.test.ts 2>&1 | tail -6`
Expected: PASS. A count mismatch means Task 1 factored the probes generically (forbidden — see Global Constraints) or added/removed a read.

- [ ] **Step 3: Commit**

```bash
git add tests/sync/_partitionScopeContract.test.ts
git commit --no-verify -m "test(sync): pin dual-partition read topology and no-staleness-clock in perFileProcessor"
```

---

### Task 5: Incident-shape integration pin through processOneFile

**Files:**
- Test: `tests/sync/perFileProcessor.test.ts` (new describe at the end; imports `processOneFile` from `@/lib/sync/runScheduledCronSync`)

**Interfaces:**
- Consumes: real `perFileProcessor` via `processOneFile` (NO `deps.perFileProcessor` injection); `ProcessOneFileDeps["logSync"]`; the `lockWithArchived(false)` pattern from `tests/sync/def4-archived-skip.test.ts:25-36`.

- [ ] **Step 1: Write the integration test**

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

- [ ] **Step 2: Run, verify green**

Run: `pnpm vitest run tests/sync/perFileProcessor.test.ts 2>&1 | tail -8`
Expected: PASS. If `logged` is empty, the skip was routed into a silent branch (forbidden — only `ARCHIVED_SKIP_REASON` is silent); if the entry carries extra keys, match the assertion to the REAL `SyncLogEntry` fields but keep `code: "wizard_owned"` and `outcome: "skipped"` load-bearing (use `toMatchObject` ONLY if the boundary adds an unconditional field like `payload` — prefer the exact `toEqual`).

- [ ] **Step 3: Commit**

```bash
git add tests/sync/perFileProcessor.test.ts
git commit --no-verify -m "test(sync): incident-shape integration pin — cron pipeline skips and logs wizard-owned files"
```

---

### Task 6: Full-suite + quality gates

**Files:** none new — verification only (fix fallout in place if any).

- [ ] **Step 1: Full test suite**

Run: `pnpm test 2>&1 | tail -15`
Expected: green. Watch specifically for: other tests exercising `perFileProcessor` or `processOneFile` against fakes that now need an `app_settings` row (the shared-mock class — sweep with `rg -l "perFileProcessor|processOneFile" tests/` and fix each harness by seeding the no-session singleton, mirroring Task 1 Step 1).

- [ ] **Step 2: Quality gates (CI parity)**

Run: `pnpm typecheck && pnpm lint && pnpm format:check 2>&1 | tail -5`
Expected: all green. `--no-verify` commits skipped the prettier hook — `pnpm format --` any flagged file and re-run.

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

- EXTENDS `tests/sync/_metaInfraContract.test.ts` (Task 3 — 8 behavioral cases; module registry row `perFileProcessor` already present at `:17-20`).
- EXTENDS `tests/sync/_partitionScopeContract.test.ts` (Task 4 — dual-topology counts + no-clock pin).
- None applies: advisory-lock topology (no lock surface), auth infra registry (no auth helper), mutation-surface observability (reads only), sentinel-hiding / alert-catalog / email-normalization (no such surface touched).
