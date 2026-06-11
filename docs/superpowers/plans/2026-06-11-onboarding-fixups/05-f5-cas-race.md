# Phase 5 — F5 wizard-session CAS turnover race (BL-WIZARD-SESSION-CAS-TURNOVER-RACE)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (or superpowers:executing-plans). TDD per task: failing test → minimal impl → passing test → commit. Conventional-commits per AGENTS.md invariant 6.

**Spec:** `docs/superpowers/specs/v1-pre-deployment-amendments/2026-06-10-onboarding-fixups-design.md` §7 (F5), §3.3 (lock matrix row "F5 retry-route hardening"), §8 (do-not-relitigate: "F5's commit-window residue is accepted, not closed"), §9.

**Depends on:** Phase 4 (`04-f4-stale-reap.md`) — Task 5.4's residue-sweep test imports `reapStaleOnboardingSessions`. Tasks 5.1–5.3 have no F4 dependency and may run first.

**Current state (verified against the live repo 2026-06-11):**

- `transitionManifestRow` (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:229-250`) runs FIRST and already carries the currency predicate `exists (select 1 from public.app_settings where id = 'default' and pending_wizard_session_id = $2::uuid)`; a 0-row outcome returns 409 `WIZARD_SESSION_SUPERSEDED` (`:297-300`). Code already cataloged at `lib/messages/catalog.ts:133-142` — no new §12.4 row for IT.
- `upsertWizardDeferral` (`retry/route.ts:177-205`) and `deletePendingIngestion` (`retry/route.ts:207-215`) carry NO currency predicate — the remaining statement-time window.
- The route's abort mechanism is broken-by-shape (spec §7 R9-1): `errorResponse(...)` returned from inside the transaction callback is a normal return value, and `withPostgresSyncPipelineLock` (`lib/sync/runScheduledCronSync.ts:1314-1343`) COMMITS on normal return (`sql.begin` at `:1326`). A post-manifest-UPDATE "409" returned this way commits the manifest transition while reporting refusal.
- Entry: `defaultWithRowTx` → `withPostgresSyncPipelineLock(driveFileId, fn, { tryOnly: false })` at `retry/route.ts:73`. **F5 adds NO locks** (spec §3.3): no `app_settings` row lock from this per-show-locked path (R4-1 deadlock inversion vs `cleanupAbandonedFinalize`'s `finalize:` → `app_settings FOR UPDATE` → show-locks order at `sessionLifecycle.ts:329-374`).
- Live-sync inertness anchor: `readLiveDeferral` (`lib/sync/perFileProcessor.ts:103-122`) filters `.is("wizard_session_id", null)` (`:112`); gate consumed at `:175-183`.
- Class-sweep targets named by the route comment (`retry/route.ts:292-296`): `requireCurrentWizardRow` (`retry/route.ts:157-175`) and `lib/sync/discardStaged.ts`. **Pre-draft sweep findings are recorded in Task 5.5** — sweep DONE, fix shape decided.

**⚠️ Citation correction (live-code pass finding):** the spec (§7) and AGENTS.md cite the x1 parity gate as `tests/messages/codes.test.ts:92`. In the live repo the gate is `tests/cross-cutting/codes.test.ts` (describe `"AC-X.1 §12.4 catalog parity"` at `:79`), run via `pnpm test:audit:x1-catalog-parity` (`package.json:29`, which chains `pnpm gen:spec-codes`). All verification commands below use the real path. (The contract is identical; only the path drifted.)

**Meta-test inventory (declared):**

- `tests/messages/_metaAdminAlertCatalog.test.ts` — EXTEND (Task 5.3): `WIZARD_SESSION_SUPERSEDED_RACE` (singular SESSION — spell-check every layer) registry row in `ADMIN_ALERTS_CODES` (`:57-98`) + write-site entry in `ADMIN_ALERTS_WRITE_SITES` (`:100-264`).
- `tests/auth/advisoryLockRpcDeadlock.test.ts` — **no extension:** F5 acquires no advisory locks (per-statement predicates instead, spec §3.3). Declared explicitly.
- `tests/auth/_metaInfraContract.test.ts` — **no extension:** the alert producer reuses `lib/adminAlerts/upsertAdminAlert.ts` (existing registered Supabase boundary, destructures `{ data, error }` at `:44-52`); the route's SQL flows through the `postgres.js` tx adapter, not Supabase clients.
- `tests/db/postgrest-dml-lockdown.test.ts` — **no extension** (Task 5.6 records the evaluation): F5 adds no RPC and no table; all three mutated tables are ALREADY in `RPC_GATED_TABLES` (`pending_syncs` `:193`, `pending_ingestions` `:208`, `deferred_ingestions` `:222`).

---

## Task 5.1 — Typed rollback error + per-statement currency predicates on deferral upsert and pending-ingestion delete

**Files:**
- `lib/sync/wizardSessionRollback.ts` (new — shared typed error; Task 5.5 reuses it from `discardStaged.ts`)
- `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` (modify `upsertWizardDeferral`, `deletePendingIngestion`, `transitionManifestRow` 0-row handling, `handleAction`)
- `tests/onboarding/pendingIngestionsWizardActions.test.ts` (extend)

**Failure mode caught:** a wizard supersession committing between `requireCurrentWizardRow`'s read and a later statement (a) writes a deferral row for a retired session, (b) deletes a `pending_ingestions` row the superseding session may still need, or (c) — the R9-1 shape — "refuses" with a returned 409 while the already-executed manifest UPDATE silently COMMITS (because `withPostgresSyncPipelineLock` commits on normal return, `runScheduledCronSync.ts:1326`).

- [ ] **RED.** Extend `tests/onboarding/pendingIngestionsWizardActions.test.ts`. The existing fake-tx harness already covers the manifest-CAS 0-row 409s (tests at `:186` and `:201`); add cases where the LATER statements miss, and pin the throw-not-return abort mechanism by recording whether the route callback resolved or rejected:

```ts
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

// Extend the file's fake tx so each mutating statement's row-count is scriptable:
//   fake.manifestCasHits = true | false      (transitionManifestRow returning row)
//   fake.deferralCasHits = true | false      (upsertWizardDeferral returning row)
//   fake.deleteCasHits   = true | false      (deletePendingIngestion returning row)
// and make the injected withRowTx record the callback's settlement:
function recordingWithRowTx(tx: FakeTx, log: { settled: "resolved" | "rejected" | null }) {
  return async <R>(_driveFileId: string, fn: (t: FakeTx) => Promise<R> | R): Promise<R> => {
    try {
      const result = await fn(tx);
      log.settled = "resolved"; // a real tx COMMITS here (runScheduledCronSync.ts:1326)
      return result;
    } catch (error) {
      log.settled = "rejected"; // a real tx ROLLS BACK here
      throw error;
    }
  };
}

test("deferral-upsert predicate miss after a successful manifest UPDATE rejects the tx callback (rollback), then maps to 409", async () => {
  const log = { settled: null as "resolved" | "rejected" | null };
  const tx = makeFakeTx({ manifestCasHits: true, deferralCasHits: false });
  const response = await handleWizardPendingIngestionAction(
    new Request("http://test", { method: "POST" }),
    routeContext("pi-1"),
    { ...defaultTestDeps(tx), withRowTx: recordingWithRowTx(tx, log) },
    "defer_until_modified",
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ ok: false, code: "WIZARD_SESSION_SUPERSEDED" });
  // THE assertion that kills the R9-1 shape: the callback must REJECT (typed error crossing
  // the tx boundary → abort), never resolve a Response from inside the transaction.
  expect(log.settled).toBe("rejected");
});

test("pending-ingestion delete predicate miss also rejects the tx callback and maps to 409", async () => {
  const log = { settled: null as "resolved" | "rejected" | null };
  const tx = makeFakeTx({ manifestCasHits: true, deferralCasHits: true, deleteCasHits: false });
  const response = await handleWizardPendingIngestionAction(
    new Request("http://test", { method: "POST" }),
    routeContext("pi-1"),
    { ...defaultTestDeps(tx), withRowTx: recordingWithRowTx(tx, log) },
    "permanent_ignore",
  );
  expect(response.status).toBe(409);
  expect(log.settled).toBe("rejected");
});

test("manifest CAS miss STILL maps to 409 — but now via the typed rollback error, not a returned Response", async () => {
  const log = { settled: null as "resolved" | "rejected" | null };
  const tx = makeFakeTx({ manifestCasHits: false });
  const response = await handleWizardPendingIngestionAction(
    new Request("http://test", { method: "POST" }),
    routeContext("pi-1"),
    { ...defaultTestDeps(tx), withRowTx: recordingWithRowTx(tx, log) },
    "defer_until_modified",
  );
  expect(response.status).toBe(409);
  expect(log.settled).toBe("rejected");
});

test("the typed error carries the race context for the Task-5.3 alert payload", () => {
  const error = new WizardSessionSupersededRollbackError({
    attemptedAction: "defer_until_modified",
    supersededSessionId: "w1",
    pendingIngestionId: "pi-1",
    driveFileId: "drive-1",
  });
  expect(error.code).toBe("WIZARD_SESSION_SUPERSEDED");
  expect(error.context.attemptedAction).toBe("defer_until_modified");
});
```

  Also update the two existing manifest-CAS tests (`:186`, `:201`) if their fake `withRowTx` swallows throws — they must keep passing with the new mechanism (same 409 surface).
- [ ] **VERIFY (RED).** `pnpm vitest run tests/onboarding/pendingIngestionsWizardActions.test.ts` → new tests fail (`WizardSessionSupersededRollbackError` module missing; `log.settled === "resolved"` for the manifest case).
- [ ] **GREEN.** (1) New `lib/sync/wizardSessionRollback.ts`:

```ts
export type WizardSessionRollbackContext = {
  attemptedAction: "defer_until_modified" | "permanent_ignore" | "discard";
  supersededSessionId: string;
  pendingIngestionId?: string;
  driveFileId: string;
};

/**
 * Thrown INSIDE a per-show-locked transaction when a wizard-session currency
 * predicate matches 0 rows. Throwing (not returning a Response) is load-bearing:
 * withPostgresSyncPipelineLock COMMITS on normal return (runScheduledCronSync.ts:1326),
 * so a returned 409 would commit every statement that already executed (spec §7 R9-1).
 * Callers catch this AFTER the transaction aborts and map it to the existing
 * WIZARD_SESSION_SUPERSEDED 409 (catalog.ts:133).
 */
export class WizardSessionSupersededRollbackError extends Error {
  readonly code = "WIZARD_SESSION_SUPERSEDED";

  constructor(readonly context: WizardSessionRollbackContext) {
    super("wizard session superseded at statement time; transaction rolled back");
    this.name = "WizardSessionSupersededRollbackError";
  }
}
```

  (2) In the retry route: give `upsertWizardDeferral` the currency-predicated INSERT (the exact precedent is `defaultUpsertWizardDeferral` in `lib/sync/discardStaged.ts:297-327` — `select ... where exists (...)` instead of `values (...)`) and return the row count; add the same `and exists (select 1 from public.app_settings where id = 'default' and pending_wizard_session_id = $2::uuid)` clause to `deletePendingIngestion` (pass the session id) and return the row count. (3) In `handleAction`, all three 0-row outcomes THROW `WizardSessionSupersededRollbackError` with the row's context; wrap the `deps.withRowTx(...)` call:

```ts
  try {
    return await deps.withRowTx(driveFileId, async (tx) => {
      // ... unchanged body, except transitionManifestRow/upsertWizardDeferral/
      // deletePendingIngestion 0-row outcomes now throw the typed error ...
    });
  } catch (error) {
    if (error instanceof WizardSessionSupersededRollbackError) {
      // Transaction is already aborted here. Task 5.3 adds the post-rollback alert write.
      return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
    }
    throw error;
  }
```

  Note `deletePendingIngestion`'s 0-row is unambiguous: `requireCurrentWizardRow` holds the row `FOR UPDATE` (`retry/route.ts:114-128`), so within this tx the row cannot vanish — a 0-row delete can only be a predicate miss.
- [ ] **VERIFY (GREEN).** `pnpm vitest run tests/onboarding/pendingIngestionsWizardActions.test.ts` → all pass (old + new).
- [ ] **COMMIT.** `fix(onboarding): per-statement wizard-session currency predicates + typed rollback on defer/ignore`

---

## Task 5.2 — Real-DB partial-commit regression + half (i) of the two-half guarantee

**Files:**
- `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` (export the three statement helpers for the DB test: `transitionManifestRow`, `upsertWizardDeferral`, `deletePendingIngestion`)
- `tests/onboarding/wizardSessionCasRaceDb.test.ts` (new, real-Postgres)

**Failure mode caught:** the unit fakes prove the throw-vs-return shape but cannot prove Postgres semantics — that (a) the EXISTS subquery re-reads `app_settings` at STATEMENT time under READ COMMITTED (a mid-transaction committed flip IS visible to the next statement), and (b) the thrown error actually aborts the `sql.begin` transaction so the already-executed manifest UPDATE does not persist. A mocked test passing while the real path partial-commits is exactly the "mocked-only tests invite tautological APPROVE" class.

- [ ] **RED.** Add `tests/onboarding/wizardSessionCasRaceDb.test.ts` (probe + `test.skipIf(!dbUp)` harness per `tests/onboarding/onboardingApplyRevisionRaceDb.test.ts:38-72`; a SECOND `postgres()` connection plays the superseder; `afterAll` restores the original `app_settings.pending_wizard_session_id` and deletes fixture rows):

```ts
import { withPostgresSyncPipelineLock } from "@/lib/sync/runScheduledCronSync";
import {
  transitionManifestRow,
  upsertWizardDeferral,
} from "@/app/api/admin/onboarding/pending_ingestions/[id]/retry/route";
import { WizardSessionSupersededRollbackError } from "@/lib/sync/wizardSessionRollback";

const W1 = "f5f5f5f5-0001-4001-8001-f5f5f5f5f5f5";
const W2 = "f5f5f5f5-0002-4002-8002-f5f5f5f5f5f5";
const FILE = "f5-cas-race-file";

// seed(): app_settings.pending_wizard_session_id = W1; one onboarding_scan_manifest row
// (W1, FILE, status 'hard_failed'); one pending_ingestions row (W1, FILE) — capture its id.

test.skipIf(!dbUp)(
  "manifest UPDATE succeeds, session flips, deferral predicate misses → ALL THREE rows unchanged after the abort",
  async () => {
    const { pendingIngestionId } = await seed();
    const row = await readPendingIngestionRow(pendingIngestionId); // shape of PendingIngestionRow

    await expect(
      withPostgresSyncPipelineLock(
        FILE,
        async (tx) => {
          const manifestTransitioned = await transitionManifestRow(tx as never, row, "defer_until_modified");
          expect(manifestTransitioned).toBe(true); // statement 1 really executed in-tx
          // The race: a committed supersession lands between statement 1 and statement 2.
          await superseder.unsafe(
            `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
            [W2],
          );
          await upsertWizardDeferral(tx as never, row, "defer_until_modified"); // must throw
          throw new Error("unreachable: deferral upsert should have thrown");
        },
        { tryOnly: false },
      ),
    ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);

    // Post-abort state: NOTHING committed.
    const manifest = await readManifestRow(W1, FILE);
    expect(manifest.status).toBe("hard_failed"); // statement-1's transition rolled back
    expect(await readDeferralRows(FILE)).toEqual([]); // no stale-session deferral
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull(); // row not deleted
  },
);

test.skipIf(!dbUp)(
  "half (i): a supersession visible BEFORE any mutating statement → typed 409, nothing commits (route-level)",
  async () => {
    const { pendingIngestionId } = await seed();
    await superseder.unsafe(
      `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
      [W2],
    );
    const response = await handleWizardPendingIngestionAction(
      new Request("http://test", { method: "POST" }),
      { params: Promise.resolve({ id: pendingIngestionId }) },
      { requireAdminIdentity: async () => ({ email: "admin@example.com" }) }, // real withRowTx + real DB
      "defer_until_modified",
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "WIZARD_SESSION_SUPERSEDED" });
    expect((await readManifestRow(W1, FILE)).status).toBe("hard_failed");
    expect(await readDeferralRows(FILE)).toEqual([]);
    expect(await readPendingIngestionRow(pendingIngestionId)).not.toBeNull();
  },
);
```

- [ ] **GREEN.** Export the three statement helpers from the route module (named exports; no behavior change — Task 5.1 already made them predicate-carrying). If the RED run exposes a real partial commit (it will against a pre-5.1 tree; it must NOT against the 5.1 tree), the fix belongs in Task 5.1's surface.
- [ ] **Negative-regression check:** stash the Task 5.1 route hunk (restore the `values (...)` deferral INSERT), re-run → the partial-commit test FAILS with `manifest.status === "defer_until_modified"` and a stale deferral row present. Unstash. This proves the test pins the contract rather than passing vacuously.
- [ ] **VERIFY.** `pnpm vitest run tests/onboarding/wizardSessionCasRaceDb.test.ts` → 2 pass (local Supabase up).
- [ ] **COMMIT.** `test(onboarding): real-DB partial-commit regression — mid-tx supersession rolls back all three mutations`

---

## Task 5.3 — `WIZARD_SESSION_SUPERSEDED_RACE` admin alert: full §12.4 three-lockstep + producer + durability

**Files (ALL in ONE commit — the three-lockstep rule):**
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 table row + helpfulContext YAML appendix entry)
- `lib/messages/__generated__/spec-codes.ts` (regenerated — `pnpm gen:spec-codes`)
- `lib/messages/catalog.ts` (new row)
- `lib/adminAlerts/upsertAdminAlert.ts` (`AdminAlertCode` union member, `:3-34`)
- `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` (producer: post-rollback alert write in the Task-5.1 catch block)
- `tests/messages/_metaAdminAlertCatalog.test.ts` (registry row `:57-98` + write-site entry `:100-264`)
- `tests/onboarding/pendingIngestionsWizardActions.test.ts` + `tests/onboarding/wizardSessionCasRaceDb.test.ts` (durability tests)

**Failure mode caught:** (a) the race fires and leaves NO durable operator signal (the backlog's original complaint); (b) the alert is written INSIDE the protected transaction and vanishes with the rollback it reports; (c) catalog drift — code present in the union but absent from §12.4/catalog (x1 gate) or with `dougFacing: null` (AlertBanner renders an empty shell — the `_metaAdminAlertCatalog` contract).

- [ ] **RED (unit).** Extend `tests/onboarding/pendingIngestionsWizardActions.test.ts`:

```ts
test("the 0-row supersession path writes WIZARD_SESSION_SUPERSEDED_RACE only AFTER the tx rejected, with the race context", async () => {
  const order: string[] = [];
  const upsertAlert = vi.fn(async () => { order.push("alert"); return "alert-id"; });
  const log = { settled: null as "resolved" | "rejected" | null };
  const tx = makeFakeTx({ manifestCasHits: true, deferralCasHits: false });
  const wrappedWithRowTx = async <R>(d: string, fn: (t: FakeTx) => Promise<R> | R): Promise<R> => {
    try { const r = await fn(tx); log.settled = "resolved"; return r; }
    catch (e) { log.settled = "rejected"; order.push("aborted"); throw e; }
  };
  const response = await handleWizardPendingIngestionAction(
    new Request("http://test", { method: "POST" }),
    routeContext("pi-1"),
    { ...defaultTestDeps(tx), withRowTx: wrappedWithRowTx, upsertAdminAlert: upsertAlert },
    "defer_until_modified",
  );
  expect(response.status).toBe(409);
  expect(order).toEqual(["aborted", "alert"]); // persistence boundary: alert strictly post-abort
  expect(upsertAlert).toHaveBeenCalledWith({
    showId: null,
    code: "WIZARD_SESSION_SUPERSEDED_RACE",
    context: expect.objectContaining({
      attempted_action: "defer_until_modified",
      superseded_session_id: expect.any(String),
      pending_ingestion_id: "pi-1",
      drive_file_id: expect.any(String),
    }),
  });
});

test("alert-writer failure does not mask the 409 (alert is best-effort, the refusal is the contract)", async () => {
  const tx = makeFakeTx({ manifestCasHits: false });
  const response = await handleWizardPendingIngestionAction(
    new Request("http://test", { method: "POST" }),
    routeContext("pi-1"),
    { ...defaultTestDeps(tx), upsertAdminAlert: vi.fn(async () => { throw new Error("alert infra down"); }) },
    "permanent_ignore",
  );
  expect(response.status).toBe(409); // typed refusal survives; the writer error is logged, not thrown
});
```

- [ ] **RED (durability, real DB).** Extend `tests/onboarding/wizardSessionCasRaceDb.test.ts`: rerun the half-(i) route-level case with the DEFAULT alert writer path stubbed to a direct-SQL writer (`insert ... via select public.upsert_admin_alert(null, 'WIZARD_SESSION_SUPERSEDED_RACE', $1::jsonb)` on a fresh connection — the same RPC `lib/adminAlerts/upsertAdminAlert.ts:44-48` calls), then assert: the `admin_alerts` row with `code = 'WIZARD_SESSION_SUPERSEDED_RACE'` EXISTS and is committed (visible from a third connection), while the manifest/deferral/pending-ingestion assertions from Task 5.2 all still hold (none of the three protected mutations persisted). Clean the alert row in `afterAll`.
- [ ] **VERIFY (RED).** `pnpm vitest run tests/onboarding/pendingIngestionsWizardActions.test.ts tests/onboarding/wizardSessionCasRaceDb.test.ts` → new tests fail (no `upsertAdminAlert` dep, code not in union). Also `pnpm test:audit:x1-catalog-parity` still green at this point (no spec/catalog edits yet).
- [ ] **GREEN (one commit, six lockstep layers).**
  1. **Master spec §12.4 row** — insert directly under the `WIZARD_SESSION_SUPERSEDED` row (line 2796), same five-column shape:

     ```
     | `WIZARD_SESSION_SUPERSEDED_RACE` | admin alert written after the wizard defer/ignore route aborts a stale-session mutation post-rollback (a newer wizard superseded the session mid-request) | "A leftover action from a retired setup wizard bumped into the newer one and was safely cancelled. Nothing was changed — continue in the active wizard tab." | — | Doug → continue in the active wizard tab |
     ```

  2. **helpfulContext YAML appendix** (block opening at line 3031, `<!-- §12.4 helpfulContext appendix — machine-parseable -->`; existing `WIZARD_SESSION_SUPERSEDED:` entry at `:3056` is the neighbor):

     ```yaml
     WIZARD_SESSION_SUPERSEDED_RACE: "Setup wizards run one at a time. A defer-or-ignore click from an older wizard tab raced a newer wizard that had just taken over, and we cancelled the older action entirely rather than let it change the new wizard's state. Nothing was lost and nothing needs fixing — this alert exists so you know the old tab tried. Continue in the active wizard tab."
     ```

  3. `pnpm gen:spec-codes` → regenerated `lib/messages/__generated__/spec-codes.ts` staged in the same commit. (`CODE_SCENARIOS` in `tests/cross-cutting/code-scenarios.ts` derives automatically from `SPEC_CODES` keys — no manual scenario row.)
  4. **`lib/messages/catalog.ts`** row adjacent to `WIZARD_SESSION_SUPERSEDED` (`:133-142`). The entry has non-null `dougFacing` and default (warning) severity, so the docs-predicate (`lib/messages/catalogDocsValidator.ts:5-15`) REQUIRES non-null `title`, `longExplanation`, and a `/help/...`-shaped `helpHref`:

     ```ts
       WIZARD_SESSION_SUPERSEDED_RACE: {
         code: "WIZARD_SESSION_SUPERSEDED_RACE",
         dougFacing: "A leftover action from a retired setup wizard bumped into the newer one and was safely cancelled. Nothing was changed — continue in the active wizard tab.",
         crewFacing: null,
         followUp: "Doug → continue in the active wizard tab",
         helpfulContext: "<same string as the YAML appendix, verbatim — x1 deep-compares field-by-field>",
         title: "Stale wizard action cancelled",
         longExplanation: "Setup wizards run one at a time. A defer-or-ignore click from an older wizard tab raced a newer wizard that had just taken over; the older action was rolled back in full so it could not change the new wizard's state. Continue working in the active wizard tab.",
         helpHref: "/help/errors#WIZARD_SESSION_SUPERSEDED_RACE",
       },
     ```

     (`dougFacing`/`crewFacing`/`followUp` must match the §12.4 table cells verbatim and `helpfulContext` the YAML entry verbatim — the x1 parity test deep-compares all four.)
  5. **`AdminAlertCode` union** member in `lib/adminAlerts/upsertAdminAlert.ts:3-34` + **producer** in the route's catch block (alert writer injectable, defaulting to `upsertAdminAlert`; failures caught-and-logged so the 409 survives):

     ```ts
     if (error instanceof WizardSessionSupersededRollbackError) {
       try {
         await (routeDeps.upsertAdminAlert ?? upsertAdminAlert)({
           showId: null,
           code: "WIZARD_SESSION_SUPERSEDED_RACE",
           context: {
             attempted_action: error.context.attemptedAction,
             superseded_session_id: error.context.supersededSessionId,
             current_session_id: await readCurrentSessionIdBestEffort(),
             pending_ingestion_id: error.context.pendingIngestionId ?? null,
             drive_file_id: error.context.driveFileId,
           },
         });
       } catch (alertError) {
         console.error("WIZARD_SESSION_SUPERSEDED_RACE alert write failed", alertError);
       }
       return errorResponse(409, "WIZARD_SESSION_SUPERSEDED");
     }
     ```

     (The alert write runs on the Supabase service-role RPC — its own transaction, the established post-rollback follow-up pattern; it is NEVER inside the aborted tx.)
  6. **Meta-test registry**: append `"WIZARD_SESSION_SUPERSEDED_RACE"` to `ADMIN_ALERTS_CODES` and a write-site entry `{ path: "app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts", pattern: /code:\s*"WIZARD_SESSION_SUPERSEDED_RACE"/ }` to `ADMIN_ALERTS_WRITE_SITES`.
- [ ] **VERIFY (GREEN).**
  - `pnpm test:audit:x1-catalog-parity` → pass (this IS the x1 gate: regen + `tests/cross-cutting/codes.test.ts` + `tests/cross-cutting/extract-spec-codes.test.ts`).
  - `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaErrorCatalogDocs.test.ts tests/onboarding/pendingIngestionsWizardActions.test.ts tests/onboarding/wizardSessionCasRaceDb.test.ts` → all pass.
  - `git status` — confirm ALL six layers staged together before committing (the x1 gate fails the PR otherwise; this is the M12.1 fix-1/fix-2 lesson).
- [ ] **COMMIT.** `feat(onboarding): WIZARD_SESSION_SUPERSEDED_RACE admin alert with §12.4 three-lockstep + post-rollback producer`

---

## Task 5.4 — Half (ii): commit-window residue is inert and swept

**Files:**
- `tests/onboarding/wizardSessionCasRaceDb.test.ts` (extend — residue + reap sweep; **depends on Phase 4's `reapStaleOnboardingSessions`**)
- `tests/sync/perFileProcessor.test.ts` (extend — inertness)

**Failure mode caught:** the explicitly-weakened guarantee (spec §7 R5-2, ratified §8 — do NOT "fix" by adding locks/SERIALIZABLE) depends on three facts that nothing currently pins: (a) a commit-window supersession really does leave a stale deferral row (the residue exists — if a future refactor "closes" the window by accident we want to KNOW, because the spec contract changes); (b) the residue can never suppress live sync — `readLiveDeferral` reads ONLY `wizard_session_id IS NULL` rows (`perFileProcessor.ts:112`); a refactor dropping that filter would let wizard debris permanently skip a live show's sync; (c) the F4 reap actually removes the residue (orphan-row eligibility, regardless of the superseding session reaching `final_cas_done`).

- [ ] **RED (residue exists + reap sweeps, real DB).** Extend `tests/onboarding/wizardSessionCasRaceDb.test.ts`:

```ts
test.skipIf(!dbUp)(
  "half (ii): a flip INSIDE the commit window leaves residue; the residue is wizard-scoped and the F4 reap removes it",
  async () => {
    const { pendingIngestionId } = await seed();
    const row = await readPendingIngestionRow(pendingIngestionId);

    // All three statements succeed while W1 is still current; the supersession commits
    // AFTER the last predicate check and BEFORE this tx's commit — the unclosable window.
    await withPostgresSyncPipelineLock(
      FILE,
      async (tx) => {
        expect(await transitionManifestRow(tx as never, row, "defer_until_modified")).toBe(true);
        await upsertWizardDeferral(tx as never, row, "defer_until_modified");
        await deletePendingIngestion(tx as never, pendingIngestionId, row.wizard_session_id);
        // Commit-window flip: a bare rotation lands now (no purge — purgeWizardRows would
        // block on this tx's FOR UPDATE row and serialize after our commit; the residue
        // class exists precisely when the superseding purge ran first or never saw us).
        await superseder.unsafe(
          `update public.app_settings set pending_wizard_session_id = $1::uuid where id = 'default'`,
          [W2],
        );
        return null; // normal return → COMMIT (this is the documented residue path)
      },
      { tryOnly: false },
    );

    // (a) Residue exists, and it is wizard-scoped — NOT a live deferral.
    const residue = await readDeferralRows(FILE);
    expect(residue).toHaveLength(1);
    expect(residue[0]!.wizard_session_id).toBe(W1); // non-NULL: invisible to readLiveDeferral by shape

    // (c) The F4 reap's orphan-row eligibility sweeps it (W1 is non-active, deferred-only, checkpoint-less).
    const { reapStaleOnboardingSessions } = await import("@/lib/onboarding/sessionLifecycle");
    const result = await reapStaleOnboardingSessions({
      requireAdminIdentity: async () => ({ email: "admin@example.com" }),
    });
    expect(result.sessions.map((s) => s.wizardSessionId)).toContain(W1);
    expect(await readDeferralRows(FILE)).toEqual([]);
  },
);
```

- [ ] **RED (inertness, unit on the REAL filter calls).** Extend `tests/sync/perFileProcessor.test.ts` — its fake honors `.is("wizard_session_id", null)` filtering (`matches()` at `:38-44`), so this is a faithful pin of the production query, not a tautology:

```ts
test("a wizard-scoped deferral residue row can NEVER suppress live sync (F5 inertness proof)", async () => {
  // Residue shape from the F5 commit window: deferral row with NON-NULL wizard_session_id.
  supabaseMock.client = createFakeSupabase({
    deferred_ingestions: [
      {
        drive_file_id: "file-1",
        wizard_session_id: "f5f5f5f5-0001-4001-8001-f5f5f5f5f5f5",
        deferred_kind: "permanent_ignore",
        deferred_at_modified_time: null,
      },
    ],
  }).client;
  const result = await perFileProcessor("file-1", "cron", fileMeta("2026-06-11T00:00:00.000Z"));
  // Concrete failure mode: if readLiveDeferral (perFileProcessor.ts:103-122) ever drops its
  // .is("wizard_session_id", null) filter (:112), the residue matches deferred_kind
  // "permanent_ignore" and this returns { outcome: "skip", reason: "deferred_permanent" } —
  // a live show permanently un-syncable because of wizard debris.
  expect(result).toEqual({ outcome: "proceed", mode: "cron" });
});
```

- [ ] **VERIFY.** `pnpm vitest run tests/onboarding/wizardSessionCasRaceDb.test.ts tests/sync/perFileProcessor.test.ts` → all pass. The residue test goes GREEN immediately on a correct 5.1–5.3 tree (it pins existing semantics); the inertness test must FAIL if `:112`'s filter is removed — verify by temporarily deleting `.is("wizard_session_id", null)` locally (negative regression), then restoring.
- [ ] **COMMIT.** `test(sync): pin F5 commit-window residue as inert (readLiveDeferral) and reapable (F4 sweep)`

---

## Task 5.5 — Class-sweep: `requireCurrentWizardRow` + `discardStaged` (same statement-vs-commit window)

**Files:**
- `lib/sync/discardStaged.ts` (fix)
- `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts` (catch + map)
- `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts` (comment only)
- `tests/sync/discardStaged` test file (extend whichever file covers `discardStaged_unlocked`'s wizard branch)

**Sweep findings (pre-verified against the live tree — this is the "report" half; each gets fix-or-file):**

| # | Surface | Finding | Disposition |
|---|---|---|---|
| S1 | `requireCurrentWizardRow` (`retry/route.ts:157-175`) | Returns `errorResponse` from inside the tx (the R9-1 shape) — but it runs BEFORE any mutating statement, so the committed transaction is EMPTY. No partial-commit possible. | **Report only.** Add a source comment: "safe to return (commits an empty tx) ONLY because no mutation precedes; mutating-statement misses must throw `WizardSessionSupersededRollbackError`." No code change. |
| S2 | `discardStaged.ts` `defaultUpsertWizardDeferral` (`:293-327`) | Already currency-predicated (`where exists`, `:304-308`) — this was the pattern Task 5.1 copied. Its 0-row miss returns `wizard_superseded` at `:431-433` BEFORE any other mutation → empty-tx commit, benign (S1 reasoning). | **Report only.** |
| S3 | `discardStaged.ts` `defaultMarkWizardManifestDiscarded` 0-row AFTER the deferral wrote (`:435-443`; statement order deferral `:422` → manifest `:435` → delete `:444`) | **Same bug class as the retry route:** the function RETURNS `{ outcome: "wizard_superseded" }`, the enclosing per-show-locked tx COMMITS, and the stale-session deferral row written at `:422` PERSISTS. Partial commit. | **Fix now (mechanical, same shape as 5.1):** throw `WizardSessionSupersededRollbackError` instead of returning, for the post-first-mutation misses. |
| S4 | `discardStaged.ts` `defaultDeleteWizardPendingSync` (`:354-370`) | NO currency predicate at all — a supersession visible at its statement time still deletes the wizard `pending_syncs` row. | **Fix now:** add the same `and exists (select 1 from public.app_settings where id = 'default' and pending_wizard_session_id = $2::uuid)` clause + `returning`; 0-row (post-mutation position) throws. |

  Out-of-scope note: `retrySingleFile_unlocked`'s `wizard_superseded` outcome (`retry/route.ts:283-285`) is a pre-mutation refusal inside its own helper (S1-class); swept, no finding. No other `pending_wizard_session_id` consumers exist under `app/` + `lib/` (`rg "pending_wizard_session_id" app lib`) beyond `sessionLifecycle.ts` (lock-ordered, Phase 4) and the surfaces above.

- [ ] **RED.** In the `discardStaged` wizard-branch test file, add (fake-tx, mirroring the file's existing dep-injection style):

```ts
test("S3: manifest miss AFTER the wizard deferral wrote throws the typed rollback error (no partial commit)", async () => {
  const deps = wizardDiscardDeps({
    upsertWizardDeferral: vi.fn(async () => true),       // first mutation succeeded
    markWizardManifestDiscarded: vi.fn(async () => false), // supersession became visible
  });
  await expect(
    discardStaged_unlocked(fakeLockedTx(), wizardArgs({ variant: "permanent_ignore" }), deps),
  ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);
});

test("S4: deleteWizardPendingSync carries the currency predicate and throws on a 0-row miss", async () => {
  // Real-DB variant in wizardSessionCasRaceDb.test.ts: seed wizard pending_syncs row, flip
  // session via the second connection after the manifest statement, assert the tx rejects
  // and the pending_syncs row + manifest status are unchanged post-abort.
  const deps = wizardDiscardDeps({
    upsertWizardDeferral: vi.fn(async () => true),
    markWizardManifestDiscarded: vi.fn(async () => true),
    deleteWizardPendingSync: vi.fn(async () => false), // predicate miss
  });
  await expect(
    discardStaged_unlocked(fakeLockedTx(), wizardArgs({ variant: "permanent_ignore" }), deps),
  ).rejects.toBeInstanceOf(WizardSessionSupersededRollbackError);
});

test("S2 unchanged: a deferral-upsert miss BEFORE any mutation still returns wizard_superseded (no throw)", async () => {
  const deps = wizardDiscardDeps({ upsertWizardDeferral: vi.fn(async () => false) });
  const result = await discardStaged_unlocked(fakeLockedTx(), wizardArgs({ variant: "defer_until_modified" }), deps);
  expect(result).toEqual({ outcome: "wizard_superseded", code: "WIZARD_SESSION_SUPERSEDED" });
});
```

- [ ] **GREEN.** (1) `defaultDeleteWizardPendingSync`: add the EXISTS clause + `returning true as deleted`, change signature to return `Promise<boolean>` (update the `DiscardStagedDeps` type member at `:77+`). (2) In `discardStaged_unlocked`'s wizard branch: `markWizardManifestDiscarded === false` after a successful deferral write (or after `try_again`'s no-deferral path? — NO: `try_again` writes no deferral first, so a manifest miss there is pre-mutation → keep the returned outcome for `try_again`, throw only when `variant !== "try_again"`), and `deleteWizardPendingSync === false`, throw `new WizardSessionSupersededRollbackError({ attemptedAction: "discard", supersededSessionId: args.wizardSessionId, driveFileId: args.driveFileId })`. (3) The onboarding discard route catches the typed error after its tx aborts and maps to the existing 409 `WIZARD_SESSION_SUPERSEDED` (no alert — the spec mandates the `WIZARD_SESSION_SUPERSEDED_RACE` alert for the retry route's defer/ignore path; extending the producer to discard is a separate decision — file to BACKLOG.md if wanted, do not silently widen the meta-test write-site). (4) S1 comment in the retry route.
- [ ] **VERIFY.** `pnpm vitest run tests/sync --silent` (full sync suite — `discardStaged` has live-branch consumers at `app/api/admin/show/staged/[stagedId]/discard/route.ts` and `app/api/admin/staged/[fileId]/discard/route.ts` whose live branch is untouched but shares the file) + `pnpm vitest run tests/onboarding` → all pass.
- [ ] **COMMIT.** `fix(sync): class-sweep discardStaged wizard branch — currency predicate on pending-sync delete + typed rollback after first mutation`

---

## Task 5.6 — PostgREST DML lockdown evaluation + phase verification

**Files:** none (verification + handoff-note task), or `tests/db/postgrest-dml-lockdown.test.ts` only if the evaluation below is wrong at execution time.

- [ ] **Lockdown checklist evaluation (record verbatim in the milestone handoff):** F5 introduces NO new RPC and NO new table. The three mutated tables are already registered in `RPC_GATED_TABLES` with REVOKEs: `pending_syncs` (`tests/db/postgrest-dml-lockdown.test.ts:193`), `pending_ingestions` (`:208`), `deferred_ingestions` (`:222`). `onboarding_scan_manifest` is mutated by this route via direct server-side `postgres.js` SQL (not PostgREST) and is NOT newly RPC-gated by F5 — its lockdown status is pre-existing and unchanged; if the close-out review wants it registered, that is a separate REVOKE migration + registry row (BACKLOG candidate, not an F5 deliverable). → **No extension needed.** If execution finds any of these three rows missing, STOP and add the registry row + REVOKE in the same commit per the class-wide pattern.
- [ ] **Run the full phase verification:**
  - `pnpm vitest run tests/onboarding tests/sync/perFileProcessor.test.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaErrorCatalogDocs.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/db/postgrest-dml-lockdown.test.ts` → all pass.
  - `pnpm test:audit:x1-catalog-parity` → pass.
  - `rg "errorResponse\(" app/api/admin/onboarding/pending_ingestions` → confirm no remaining `errorResponse` return sits AFTER a mutating statement inside the tx callback (fix-round regression budget: re-grep the class across the patched surface).
- [ ] **Handoff notes:** record (a) the §12.4-gate path correction (`tests/cross-cutting/codes.test.ts`, not `tests/messages/codes.test.ts:92`) for the spec's next edit pass; (b) the Task 5.5 sweep table + dispositions; (c) the do-not-relitigate preempts for adversarial review: commit-window residue is ACCEPTED per spec §8 (cite §7 R5-2 + the R4-1 inversion), reviewer must not re-propose `app_settings` locking or SERIALIZABLE.
- [ ] **COMMIT** (only if files changed): `docs(handoff): F5 lockdown evaluation + sweep dispositions` — otherwise fold the notes into the milestone handoff commit.

---

## Phase close-out checklist

- [ ] All tasks committed individually (invariant 6); the Task 5.3 commit contains ALL six lockstep layers (spec row, YAML appendix, regenerated spec-codes, catalog row, union+producer, meta-test rows) — `git show --stat` to confirm.
- [ ] Two-half guarantee fully pinned: half (i) Tasks 5.1/5.2; half (ii) Task 5.4 (residue + inertness + reap sweep).
- [ ] No new advisory-lock holders introduced (spec §3.3: "F5 adds NO locks at all") — `rg "pg_advisory" app/api/admin/onboarding/pending_ingestions lib/sync/wizardSessionRollback.ts` returns nothing new.
- [ ] Adversarial-review brief carries the §8 preempts (residue accepted; no SERIALIZABLE; no app_settings lock from per-show-locked paths) with `file:line` citations, and the REVIEWER ONLY framing.
