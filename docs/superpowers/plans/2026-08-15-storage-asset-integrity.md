# Storage Asset Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

impeccable-gate: N/A — no UI surface

**Goal:** Ship the two repairs ratified by the spec — proof-gated recovery cleanup so a losing concurrent recovery can never delete a winner's committed-manifest objects, and `_pending` orphan reclamation (storage-port removal capability + a GC stage over row-less `_pending` prefixes).

**Architecture:** Three surgical surfaces, all behind existing injectable ports: `lib/sync/assetRecovery.ts` (cleanup condition + a `lockedSnapshotRevisionId` carry on `no_op`), `lib/sync/snapshotAssets.ts` + `lib/sync/defaultSnapshotAssetsForApply.ts` (optional `removePrefix` capability, best-effort catch cleanup, an EXPORTED transport-testable adapter factory), `lib/sync/diagramGc.ts` + `app/api/cron/diagram-gc/route.ts` (storage-driven `_pending` sweep with two new result counters and transport-testable default adapters). No DB migration, no UI, no new lock acquisition.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest with in-memory ports plus fake-Supabase-transport adapter tests (the `tests/sync/promoteSnapshotDefaultStorage.test.ts` pattern), Supabase storage JS client.

**Spec:** `docs/superpowers/specs/2026-08-15-storage-asset-integrity-design.md` (adversarially APPROVED R3). The executable probe backing it: `docs/superpowers/specs/probes/2026-08-15-storage-asset-integrity-probe.ts`.

## Global Constraints

- Invariant 1 (TDD): every task is failing test → minimal implementation → passing test → commit.
- Invariant 2: NO new advisory-lock acquisition anywhere in this plan. Holder topology (declared per writing-plans rule): the only holders on `hashtext('show:' || drive_file_id)` touched here are `assetRecovery`'s two existing `withShowLock` calls (JS-wrapper layer via `AssetRecoveryPostgresTx`, `tryOnly: true`) — both unchanged; the GC `_pending` stage holds NO show lock by design (spec §5). `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched.
- Invariant 9: every new Supabase storage call destructures `{ data, error }` / `{ error }` and throws on `error`; each new adapter call site carries `// not-subject-to-meta: sync storage adapter — throws on destructured error; consumed by <caller>'s typed infra outcome`.
- Invariant 10: no new HTTP mutation surface; the diagram-gc GET route's `runCronRoute` summary is extended, not replaced. `snapshotAssets` stays log-free (spec §1.1 R7).
- Conventional commits, one commit per task, scope `sync` (route file rides the Task 4 commit under the same scope).
- No migration → validation-schema-parity checklist N/A (spec §1.1 R4). No §12.4 catalog change.
- Meta-test inventory (declared): EXTENDS `tests/sync/_pendingSnapshotUploadsContract.test.ts` with one source-scan case (Task 4) pinning that the row-less-stage ledger listing carries no state filter. No other meta-suite is created or extended: no new auth boundary (`tests/auth/_metaInfraContract.test.ts` is auth-scoped; the sync storage adapters carry invariant-9 `not-subject-to-meta` comments instead), no admin-alert code changes, no lock-topology change, no tile/sentinel surface. Mutation-family closure: N/A — this plan ships product behavior + unit tests, not a structural guard or mutation harness surface (the one hand-run mutant is recorded in the dry-run bullet below, not a registry enrolment).
- Four pre-dispatch mutants for string-presence guards: applies to exactly ONE planned assertion — the Task 4 Step 1.3 source-scan contract case (a string-presence guard over `lib/sync/diagramGc.ts`). Its four-mutant record (run executably at plan time against the case's regex): (a) query emptied → no match, guard reds; (b) table-name suffix appended (`pending_snapshot_uploads_archive`) → the closing-quote anchor breaks the match, guard reds; (c) live query replaced while an exact quoted copy sits in a comment INSIDE the method → the guard stays green — recorded as the source-scan form's documented limit (the threat model is accidental WHERE-addition or table-swap by an ordinary contributor; a comment carrying the full quoted SQL beside a changed live query is not an accidental shape); (d) discriminating parameters varied → N/A, the query takes none. Every other planned assertion is port-STATE (surviving storage objects, counter values, result objects), per the anti-tautology posture.
- Heavy phases (full suite, build) run under `pnpm heavy` per AGENTS.md; the scoped vitest runs named per task stay unwrapped.
- Mocked-default blind spot rule (from `tests/sync/promoteSnapshotDefaultStorage.test.ts`): every NEW default production adapter this plan introduces gets a real-adapter fake-transport test in the same task that introduces it. Tasks 2 and 4 carry those tests.

## Acceptance criteria (spec traceability)

- AC-1 (spec §2.2): a `skipped` or same-revision/`lockedShow`-null `no_op` outcome removes NOTHING from storage — asserted on surviving object STATE, not the remove call log.
- AC-2 (spec §2.1-§2.2): drift outcomes — pre-check mismatch, CAS-false, and no_op-with-different-revision — still empty the run's own uploads from storage state.
- AC-3 (spec §2.2): `AssetRecoveryResult`'s commit-branch `no_op` carries `lockedSnapshotRevisionId` when a locked manifest was readable.
- AC-4 (spec §3): `SnapshotAssetsStorage.removePrefix` exists (optional); a `snapshotAssets` throw best-effort-removes the run's `_pending` temp prefix, never masks the original error, and still works when the port lacks `removePrefix`.
- AC-5 (spec §3): the apply-path storage adapter is the EXPORTED `applySnapshotStorage(supabase)` factory used by `makeSnapshotAssetsForApply` — the single adapter all three apply callers share (`applyStaged.ts`, `runScheduledCronSync.ts`, `runManualStageForFirstSeen.ts` all route through `makeSnapshotAssetsForApply`) — and its transport behavior (bucket-prefix strip, pagination, folder exclusion, error throw) is tested against a fake Supabase transport.
- AC-6 (spec §4): `runDiagramGc` reclaims a row-less `_pending` run prefix only when every object is STRICTLY older than `PENDING_ORPHAN_MIN_AGE_MS` (24h; a group exactly at the cutoff is retained); row-backed, young, at-cutoff, and missing-`createdAt` groups are retained; missing-`createdAt` groups increment `pendingOrphanPrefixesRetainedNoCreatedAt`; ghost shows (no `public.shows` row) are discovered via storage `listChildren`; a file-shaped entry directly under the shows prefix is ignored.
- AC-7 (spec §4/§5): the diagram-gc route summary surfaces both new counters, and the default adapters feeding the stage (`defaultStorage().listChildren`, `defaultTx().listPendingTempPrefixes`) are themselves tested (fake transport / source-scan contract).
- AC-8 (spec §6): all assertions are against port state, and every fixture-dependent assertion carries its own executable premise (`premise` / `premiseHolds` from `tests/_shared/premise.ts` — signature `premise(description, actual, mustExceed)`).

---

<!-- tasks: depth=3 -->

### Task 1: Proof-gated recovery cleanup

<!-- task: red=`pnpm vitest run tests/sync/assetRecovery.test.ts` ac=AC-1,AC-2,AC-3 -->

**Files:**
- Modify: `lib/sync/assetRecovery.ts` (the `AssetRecoveryResult` `no_op` variant; the commit-branch `no_op` return; the two post-lock cleanup sites)
- Test: `tests/sync/assetRecovery.test.ts` (new `describe` block; ONE existing defect-pinning test deleted per Step 1; every other case untouched)

**Interfaces:**
- Consumes: existing `assetRecovery(showId, deps)` and the test file's module-scope `showId` / `driveFileId` / `snapshotRevisionId` constants and `partialDiagrams()` helper.
- Produces: `AssetRecoveryResult` variant `{ outcome: "no_op"; lockedSnapshotRevisionId?: string }`. Task 5's closeout relies on the behaviors below; no other task consumes this type.

**RED validity:** the production lines whose defect makes the new tests fail are the unconditional cleanups in `lib/sync/assetRecovery.ts` — `await Promise.all(uploadedPaths.map((path) => deps.storage.remove?.(path)))` in BOTH the `isConcurrentSyncSkipped(locked)` branch and the `locked.outcome === "revision_drift" || locked.outcome === "no_op"` branch (currently ~:693-700). While those delete unconditionally, the keep-cases below fail on surviving-object state; the `lockedSnapshotRevisionId` assertions additionally fail because the field does not exist yet.

- [ ] **Step 1: Write the failing tests.** Append this block inside the top-level `describe` of `tests/sync/assetRecovery.test.ts` (add `type AssetRecoveryTx` to the existing `@/lib/sync/assetRecovery` import, and add `premiseHolds` beside the file's existing `premise` import). In the SAME step, DELETE the existing test `"no-op after canonical upload removes uploaded recovery bytes"` — it pins exactly the defect this task repairs (same-revision `no_op` deleting the winner's live objects; probe P1); its replacement is the same-revision keep case below. The sibling test titled "revision drift after canonical upload removes uploaded recovery bytes" (in `tests/sync/assetRecovery.test.ts`) stays UNCHANGED — drift deletion remains correct behavior and that test is the existing pin for it:

```ts
  describe("proof-gated cleanup (spec §2, BL-RECOVERY-CLEANUP-DELETES-LIVE-BYTES)", () => {
    const driftedRev = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

    // Map-backed storage: assertions run against surviving OBJECT STATE, not the
    // remove call log (spec §6 anti-tautology -- a call-count test can pass with
    // the wrong paths removed).
    function liveStorage() {
      const objects = new Map<string, true>();
      const uploads: string[] = [];
      const storagePort: AssetRecoveryStorage = {
        async upload(path) {
          objects.set(path, true);
          uploads.push(path);
        },
        async remove(path) {
          objects.delete(path);
        },
      };
      return { storagePort, objects, uploads };
    }

    type LockedTxOverrides = {
      readLockedShow?: () => Promise<{
        showId: string;
        driveFileId: string;
        diagrams: PersistedDiagrams;
      } | null>;
      updateRecoveredDiagrams?: () => Promise<boolean>;
    };

    // Both lock passes (pre-upload gate, commit) share this builder; the second
    // pass swaps in `secondPass` so tests can model a winner committing between
    // the loser's gate and its commit attempt -- the probe P1 interleaving.
    function depsWithSecondPass(
      storagePort: AssetRecoveryStorage,
      secondPass: LockedTxOverrides | "contended",
    ) {
      let lockCalls = 0;
      return {
        readPreviewShow: async () => ({ showId, driveFileId, diagrams: partialDiagrams() }),
        withShowLock: async <R>(_driveFileId: string, fn: (tx: AssetRecoveryTx) => Promise<R>) => {
          lockCalls += 1;
          if (lockCalls > 1 && secondPass === "contended") {
            return { skipped: CONCURRENT_SYNC_SKIPPED } as const;
          }
          const overrides = lockCalls > 1 && secondPass !== "contended" ? secondPass : {};
          return await fn({
            readLockedShow:
              overrides.readLockedShow ??
              (async () => ({ showId, driveFileId, diagrams: partialDiagrams() })),
            updateRecoveredDiagrams: overrides.updateRecoveredDiagrams ?? (async () => true),
            upsertRecoveryCooldown: async () => undefined,
            deleteRecoveryCooldown: async () => undefined,
            upsertAdminAlert: async () => undefined,
            resolveAdminAlerts: async () => undefined,
          });
        },
        storage: storagePort,
        drive: {
          fetchEmbeddedImageBytes: async () => new TextEncoder().encode("embedded-bytes"),
          fetchLinkedRevisionBytes: async () => new TextEncoder().encode("linked-bytes"),
        },
      };
    }

    test("skipped at the commit lock keeps every uploaded object (no proof, no deletion)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(showId, depsWithSecondPass(storagePort, "contended"));
      premise("the loser uploaded before its contended commit attempt", uploads.length, 0);
      expect(result).toEqual({ outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED });
      expect([...objects.keys()].sort()).toEqual([...uploads].sort());
    });

    test("no_op with the SAME locked revision (winner committed it) keeps the winner's MANIFEST-referenced objects", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      // The winner's committed manifest carries REAL snapshotPath values at the
      // deterministic canonical paths -- the assertion below runs against THESE,
      // not against the loser's upload list, so an empty winner manifest cannot
      // vacuously pass (spec §6, probe P1's manifestTargetExists).
      const base = partialDiagrams();
      const winnerCommitted: PersistedDiagrams = {
        ...base,
        snapshot_status: "complete",
        embeddedImages: base.embeddedImages.map((entry) => ({
          ...entry,
          snapshotPath: `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/embedded-${entry.objectId}.png`,
        })),
        linkedFolderItems: base.linkedFolderItems.map((entry) => ({
          ...entry,
          snapshotPath: `diagram-snapshots/shows/${showId}/${snapshotRevisionId}/folder-${entry.driveFileId}.jpg`,
        })),
      };
      const manifestPaths = [...winnerCommitted.embeddedImages, ...winnerCommitted.linkedFolderItems]
        .map((entry) => entry.snapshotPath)
        .filter((path): path is string => Boolean(path));
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({ showId, driveFileId, diagrams: winnerCommitted }),
        }),
      );
      premise("the winner's manifest references concrete canonical paths", manifestPaths.length, 0);
      premiseHolds(
        "the deterministic canonical paths tie the manifest to the loser's uploads",
        manifestPaths.every((path) => uploads.includes(path)),
      );
      expect(result).toEqual({ outcome: "no_op", lockedSnapshotRevisionId: snapshotRevisionId });
      for (const path of manifestPaths) {
        expect(objects.has(path)).toBe(true);
      }
      // And nothing else was deleted either.
      expect([...objects.keys()].sort()).toEqual([...uploads].sort());
    });

    test("no_op with a NULL locked show keeps uploads (no revision proof)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, { readLockedShow: async () => null }),
      );
      premise("uploads happened before the locked show vanished", uploads.length, 0);
      expect(result).toEqual({ outcome: "no_op" });
      expect([...objects.keys()].sort()).toEqual([...uploads].sort());
    });

    test("no_op with a DIFFERENT locked revision deletes the run's own uploads (proof held)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: {
              ...partialDiagrams(),
              snapshot_revision_id: driftedRev,
              snapshot_status: "complete",
            },
          }),
        }),
      );
      premise("uploads happened under the superseded revision", uploads.length, 0);
      expect(result).toEqual({ outcome: "no_op", lockedSnapshotRevisionId: driftedRev });
      expect(objects.size).toBe(0);
    });

    test("commit-branch revision drift still deletes the run's own uploads (proof held)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: { ...partialDiagrams(), snapshot_revision_id: driftedRev },
          }),
        }),
      );
      premise("uploads happened under the superseded revision", uploads.length, 0);
      expect(result).toMatchObject({ outcome: "revision_drift" });
      expect(objects.size).toBe(0);
    });

    test("CAS-false drift deletes the run's own uploads (spec §2.1 form (b); unreachable via concurrent commits per §2.3, injected via the port seam)", async () => {
      const { storagePort, objects, uploads } = liveStorage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, { updateRecoveredDiagrams: async () => false }),
      );
      premise("uploads happened before the CAS refused the commit", uploads.length, 0);
      expect(result).toMatchObject({ outcome: "revision_drift" });
      expect(objects.size).toBe(0);
    });
  });
```

- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/sync/assetRecovery.test.ts`. Expected (verified at plan time by running exactly this cycle): FOUR cases fail — the three keep-cases on surviving-object state (current code deletes, so `objects` is empty where the test expects survivors), and the no_op-with-a-DIFFERENT-revision case on the missing `lockedSnapshotRevisionId` field — while the drift/CAS delete-cases PASS (they pin deletion behavior so the repair cannot overshoot into never-delete). All remaining pre-existing cases PASS (the defect-pinning no_op test is already deleted in Step 1).
- [ ] **Step 3: Minimal implementation.** In `lib/sync/assetRecovery.ts`:
  1. Change the `no_op` variant of `AssetRecoveryResult` to `{ outcome: "no_op"; lockedSnapshotRevisionId?: string }`.
  2. In the COMMIT-branch `withShowLock` callback, change the early `no_op` return to carry the locked revision when readable:

```ts
        if (!lockedDiagrams || lockedDiagrams.snapshot_status !== "partial_failure") {
          return {
            outcome: "no_op",
            ...(lockedDiagrams
              ? { lockedSnapshotRevisionId: lockedDiagrams.snapshot_revision_id }
              : {}),
          } satisfies AssetRecoveryResult;
        }
```

  3. Replace the two post-lock cleanup sites with the proof-gated single site (the `skipped` branch keeps its early return but loses its `Promise.all` line):

```ts
    if (isConcurrentSyncSkipped(locked)) {
      // No lock was held at the commit attempt -- no proof, no deletion (spec §2.2).
      return { outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED };
    }

    // Deletion authority (spec §2.1): only an in-lock observation that the current
    // revision moved off the uploaded one permits removing the uploads.
    const proofOfDrift =
      locked.outcome === "revision_drift" ||
      (locked.outcome === "no_op" &&
        locked.lockedSnapshotRevisionId !== undefined &&
        locked.lockedSnapshotRevisionId !== previewDiagrams.snapshot_revision_id);
    if (proofOfDrift) {
      await Promise.all(uploadedPaths.map((path) => deps.storage.remove?.(path)));
    }

    return locked;
```

  The pre-upload gate's `no_op`/`revision_drift` returns are untouched (no uploads exist there).
- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/sync/assetRecovery.test.ts`. Expected (dry-run-verified): 20/20 — including the UNCHANGED drift-deletion pin ("revision drift after canonical upload removes uploaded recovery bytes", whose `removed` assertion still holds because drift keeps deletion authority).
- [ ] **Step 5: Commit.** `git add lib/sync/assetRecovery.ts tests/sync/assetRecovery.test.ts && git commit -m "fix(sync): proof-gate recovery cleanup so a losing run never deletes committed bytes"`

### Task 2: `removePrefix` capability, best-effort catch cleanup, and the exported apply adapter

<!-- task: red=`pnpm vitest run tests/sync/snapshotAssets.test.ts tests/sync/applySnapshotStorageDefault.test.ts` ac=AC-4,AC-5 -->

**Files:**
- Modify: `lib/sync/snapshotAssets.ts` (the `SnapshotAssetsStorage` type; the tail `catch`)
- Modify: `lib/sync/defaultSnapshotAssetsForApply.ts` (extract + export `applySnapshotStorage(supabase)`; `makeSnapshotAssetsForApply` consumes it)
- Test: `tests/sync/snapshotAssets.test.ts` (new `describe` block)
- Test (create): tests/sync/applySnapshotStorageDefault.test.ts (real-adapter fake-transport test — the `promoteSnapshotDefaultStorage.test.ts` pattern; the tests/sync directory is already inside the vitest include globs, as every existing file there shows)

**Interfaces:**
- Consumes: existing `snapshotAssets(args)`; the run-private temp prefix `diagram-snapshots/shows/<showId>/_pending/<runUuid>/` built by `tempPrefix()` (`lib/sync/snapshotAssets.ts`); `createSupabaseServiceRoleClient` typing for the factory parameter (mirror of `defaultStorage` in `lib/sync/promoteSnapshot.ts:224`).
- Produces: `SnapshotAssetsStorage.removePrefix?(prefix: string): Promise<void>`; `export function applySnapshotStorage(supabase: ReturnType<typeof createSupabaseServiceRoleClient>): SnapshotAssetsStorage`. Task 4 does NOT consume either (GC has its own ports); only the apply path uses them.

**RED validity:** two production absences make the new tests fail: (a) the missing `removePrefix` attempt in the `catch` at the tail of `snapshotAssets` — today the catch calls only `markPendingSnapshotDeleteStarted` and rethrows, so uploaded `_pending` objects survive the throw (probe P2); (b) `applySnapshotStorage` does not exist as an export, so the adapter test fails to import.

- [ ] **Step 1: Write the failing tests.**
  1. Append to `tests/sync/snapshotAssets.test.ts` (widen its `@/lib/sync/snapshotAssets` import to `{ snapshotAssets, type SnapshotAssetsArgs, type SnapshotAssetsStorage }`; `sha256Base64Url` and `premise` are already imported there; module-scope `showId` / `driveFileId` constants already exist — do NOT redeclare them):

```ts
describe("upload-throw best-effort cleanup (spec §3, BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS)", () => {
  const okBytes = new TextEncoder().encode("embedded-bytes");

  function throwingRunArgs(storagePort: SnapshotAssetsStorage) {
    return {
      showId,
      driveFileId,
      diagrams: {
        linkedFolder: null,
        embeddedImages: [
          {
            sheetTab: "DIAGRAMS",
            objectId: "ok",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: sha256Base64Url(okBytes),
            recovery_disposition: "normal",
          },
          {
            sheetTab: "DIAGRAMS",
            objectId: "boom",
            mimeType: "image/png",
            sheetsRevisionId: "sheet-rev-1",
            embeddedFingerprint: "does-not-matter",
            recovery_disposition: "normal",
          },
        ],
        linkedFolderItems: [],
      } as unknown as SnapshotAssetsArgs["diagrams"],
      tx: { insertPendingSnapshotUpload: async () => undefined },
      storage: storagePort,
      drive: {
        fetchEmbeddedImageBytes: async (entry: { objectId: string }) => {
          if (entry.objectId === "boom") throw new Error("drive 500 mid-run");
          return okBytes;
        },
        fetchLinkedRevisionBytes: async () => null,
      },
    } satisfies SnapshotAssetsArgs;
  }

  test("a mid-run throw removes the run's _pending prefix and rethrows the ORIGINAL error", async () => {
    const objects = new Map<string, Uint8Array>();
    const uploaded: string[] = [];
    const removedPrefixes: string[] = [];
    const storagePort: SnapshotAssetsStorage = {
      async upload(path, bytes) {
        objects.set(path, bytes);
        uploaded.push(path);
      },
      async removePrefix(prefix) {
        removedPrefixes.push(prefix);
        for (const key of [...objects.keys()]) {
          if (key.startsWith(prefix)) objects.delete(key);
        }
      },
    };
    await expect(snapshotAssets(throwingRunArgs(storagePort))).rejects.toThrow(
      "drive 500 mid-run",
    );
    // Own-input premises: an object really was uploaded under _pending before the
    // throw, and the catch really attempted the removal -- without both, the
    // empty-survivors assertion below proves nothing.
    premise(
      "an object was uploaded under _pending before the throw",
      uploaded.filter((path) => path.includes("/_pending/")).length,
      0,
    );
    premise("the catch attempted the prefix removal", removedPrefixes.length, 0);
    const pendingSurvivors = [...objects.keys()].filter((key) => key.includes("/_pending/"));
    expect(pendingSurvivors).toEqual([]);
    expect(removedPrefixes).toHaveLength(1);
    expect(removedPrefixes[0]).toMatch(
      new RegExp(`^diagram-snapshots/shows/${showId}/_pending/[0-9a-f-]+/$`),
    );
  });

  test("a rejecting removePrefix never masks the original error", async () => {
    const storagePort: SnapshotAssetsStorage = {
      async upload() {},
      async removePrefix() {
        throw new Error("storage cleanup also failed");
      },
    };
    await expect(snapshotAssets(throwingRunArgs(storagePort))).rejects.toThrow(
      "drive 500 mid-run",
    );
  });

  test("a port WITHOUT removePrefix still rethrows cleanly (optional capability)", async () => {
    const storagePort: SnapshotAssetsStorage = { async upload() {} };
    await expect(snapshotAssets(throwingRunArgs(storagePort))).rejects.toThrow(
      "drive 500 mid-run",
    );
  });
});
```

  2. Create tests/sync/applySnapshotStorageDefault.test.ts (new file):

```ts
// tests/sync/applySnapshotStorageDefault.test.ts
//
// Drives the REAL apply-path snapshot storage adapter with a fake Supabase
// transport -- the mocked-only blind spot documented in
// promoteSnapshotDefaultStorage.test.ts: snapshotAssets tests inject a mock
// storage port, so without this file a wrong bucket-prefix strip, broken
// pagination, or folder/file misclassification in removePrefix ships silently.
import { describe, expect, test, vi } from "vitest";

import { applySnapshotStorage } from "@/lib/sync/defaultSnapshotAssetsForApply";

type Entry = { name: string; id?: string };

function fakeSupabase(pages: Entry[][], removeError: { message: string } | null = null) {
  const listArgs: Array<{ key: string; options: unknown }> = [];
  const removeArgs: string[][] = [];
  const bucket = {
    upload: vi.fn(async () => ({ error: null })),
    list: vi.fn(async (key: string, options: { limit: number; offset: number }) => {
      listArgs.push({ key, options });
      const page = pages[Math.floor(options.offset / options.limit)] ?? [];
      return { data: page, error: null };
    }),
    remove: vi.fn(async (names: string[]) => {
      removeArgs.push(names);
      return { error: removeError };
    }),
  };
  const from = vi.fn(() => bucket);
  return { supabase: { storage: { from } }, listArgs, removeArgs, from, bucket };
}

describe("applySnapshotStorage.removePrefix (real adapter, fake transport)", () => {
  test("strips the bucket prefix, paginates, skips folder entries, removes file objects", async () => {
    const fullPage: Entry[] = Array.from({ length: 100 }, (_, index) => ({
      name: `file-${index}.png`,
      id: `id-${index}`,
    }));
    const lastPage: Entry[] = [{ name: "tail.png", id: "id-tail" }, { name: "a-folder" }];
    const { supabase, listArgs, removeArgs, from } = fakeSupabase([fullPage, lastPage]);
    const storage = applySnapshotStorage(supabase as never);

    await storage.removePrefix?.("diagram-snapshots/shows/S1/_pending/R1/");

    expect(from).toHaveBeenCalledWith("diagram-snapshots");
    // Stripped object key on every page; offsets advance.
    expect(listArgs.map((call) => call.key)).toEqual([
      "shows/S1/_pending/R1/",
      "shows/S1/_pending/R1/",
    ]);
    expect(listArgs.map((call) => (call.options as { offset: number }).offset)).toEqual([0, 100]);
    // Every FILE entry across both pages removed in one call; the folder entry skipped.
    expect(removeArgs).toHaveLength(1);
    expect(removeArgs[0]).toHaveLength(101);
    expect(removeArgs[0]).toContain("shows/S1/_pending/R1/file-0.png");
    expect(removeArgs[0]).toContain("shows/S1/_pending/R1/tail.png");
    expect(removeArgs[0]).not.toContain("shows/S1/_pending/R1/a-folder");
  });

  test("an empty listing performs no remove call", async () => {
    const { supabase, removeArgs } = fakeSupabase([[]]);
    const storage = applySnapshotStorage(supabase as never);
    await storage.removePrefix?.("diagram-snapshots/shows/S1/_pending/R1/");
    expect(removeArgs).toEqual([]);
  });

  test("a remove error is thrown, not swallowed (invariant 9)", async () => {
    const { supabase } = fakeSupabase([[{ name: "x.png", id: "id-x" }]], {
      message: "remove failed",
    });
    const storage = applySnapshotStorage(supabase as never);
    await expect(
      storage.removePrefix?.("diagram-snapshots/shows/S1/_pending/R1/"),
    ).rejects.toMatchObject({ message: "remove failed" });
  });
});
```

- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/sync/snapshotAssets.test.ts tests/sync/applySnapshotStorageDefault.test.ts`. Expected (verified at plan time): the snapshotAssets suite's test 1 FAILS at runtime on its premise — `premise not met: the catch attempted the prefix removal` (the catch never calls `removePrefix` on current code); tests 2-3 pass already (rethrow is current behavior) — they pin the non-masking contract. The adapter file fails on the missing `applySnapshotStorage` export. (`pnpm typecheck` at this point ALSO reds on the excess `removePrefix` property until the type field lands — either observation is a valid RED.)
- [ ] **Step 3: Minimal implementation.**
  1. `lib/sync/snapshotAssets.ts` — type:

```ts
export type SnapshotAssetsStorage = {
  upload(path: string, bytes: Uint8Array, options: { contentType: string }): Promise<void>;
  removePrefix?(prefix: string): Promise<void>;
};
```

  2. Same file — the tail catch becomes:

```ts
  } catch (error) {
    await args.tx.markPendingSnapshotDeleteStarted?.(snapshotRevisionId);
    try {
      // Best-effort: the run-private _pending prefix is referenced by nobody
      // (fresh runUuid). Failure here is silent by contract (spec §1.1 R7) and
      // the diagram-gc _pending stage reclaims whatever survives (spec §4).
      await args.storage.removePrefix?.(temp);
    } catch {
      /* never mask the original error */
    }
    throw error;
  }
```

  3. `lib/sync/defaultSnapshotAssetsForApply.ts` — add `type SnapshotAssetsStorage` to the `@/lib/sync/snapshotAssets` import, add the exported factory ABOVE `makeSnapshotAssetsForApply`, and replace the inline `storage: { async upload(...) {...} }` object inside `makeSnapshotAssetsForApply` with `storage: applySnapshotStorage(supabase),`:

```ts
/**
 * The apply-path snapshot storage adapter, exported so its transport behavior
 * (bucket-prefix strip, pagination, folder exclusion) is directly testable --
 * the mocked-only blind spot documented in promoteSnapshotDefaultStorage.test.ts.
 */
export function applySnapshotStorage(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient>,
): SnapshotAssetsStorage {
  const bucket = supabase.storage.from(DIAGRAM_BUCKET);
  return {
    // no-variant-stage: storage adapter impl -- forwards the bytes snapshotAssets()
    // already ran the stage on. Generating here would make variants of variants.
    async upload(path, bytes, options) {
      const objectPath = path.startsWith(`${DIAGRAM_BUCKET}/`)
        ? path.slice(DIAGRAM_BUCKET.length + 1)
        : path;
      // not-subject-to-meta: sync storage adapter -- throws on destructured error; consumed by phase2's typed Phase2InfraError wrap
      const { error } = await bucket.upload(objectPath, bytes, {
        contentType: options.contentType,
        upsert: true,
      });
      if (error) throw error;
    },
    async removePrefix(prefix) {
      const objectPrefix = prefix.startsWith(`${DIAGRAM_BUCKET}/`)
        ? prefix.slice(DIAGRAM_BUCKET.length + 1)
        : prefix;
      const pageSize = 100;
      const names: string[] = [];
      let offset = 0;
      while (true) {
        // not-subject-to-meta: sync storage adapter -- throws on destructured error; consumed by snapshotAssets' best-effort catch
        const { data, error } = await bucket.list(objectPrefix, { limit: pageSize, offset });
        if (error) throw error;
        const page = data ?? [];
        for (const entry of page) {
          if ("id" in entry && entry.id) names.push(`${objectPrefix}${entry.name}`);
        }
        if (page.length < pageSize) break;
        offset += page.length;
      }
      if (names.length === 0) return;
      // not-subject-to-meta: sync storage adapter -- throws on destructured error; consumed by snapshotAssets' best-effort catch
      const { error: removeError } = await bucket.remove(names);
      if (removeError) throw removeError;
    },
  };
}
```

  (`_pending/<runUuid>/` holds flat files only — every object is uploaded as `<temp><assetKey>` with no nested directories, so a single-level list is complete; the folder-exclusion guard is belt. `DIAGRAM_BUCKET` is already a module constant in this file.)
- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/sync/snapshotAssets.test.ts tests/sync/applySnapshotStorageDefault.test.ts`. Expected (dry-run-verified): 11/11 + 3/3, pre-existing cases included.
- [ ] **Step 5: Commit.** `git add lib/sync/snapshotAssets.ts lib/sync/defaultSnapshotAssetsForApply.ts tests/sync/snapshotAssets.test.ts tests/sync/applySnapshotStorageDefault.test.ts && git commit -m "fix(sync): best-effort _pending cleanup on snapshot upload throw via optional removePrefix"`

### Task 3: GC `_pending` orphan stage (injected ports)

<!-- task: red=`pnpm vitest run tests/sync/diagramGc.test.ts` ac=AC-6 -->

**Files:**
- Modify: `lib/sync/diagramGc.ts` (`DiagramGcTx` + `DiagramGcStorage` + `DiagramGcResult` types; `PENDING_ORPHAN_MIN_AGE_MS` constant; the new stage inside `runDiagramGc`)
- Test: `tests/sync/diagramGc.test.ts` (new `describe` block with its own mutating map-backed harness)

**Interfaces:**
- Consumes: existing `runDiagramGc(args)`; the test file's module-scope `StoredPath` type and `pathOf()` helper.
- Produces (Task 4 consumes all of these):
  - `export const PENDING_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;`
  - `DiagramGcTx.listPendingTempPrefixes?(): Promise<string[]>`
  - `DiagramGcStorage.listChildren?(prefix: string): Promise<Array<{ name: string; isFolder: boolean }>>`
  - `DiagramGcResult` gains `pendingOrphanPrefixesDeleted: number` and `pendingOrphanPrefixesRetainedNoCreatedAt: number`.

**RED validity:** the production lines whose absence makes the new tests fail: `runDiagramGc` has no `_pending` stage (the object sweep explicitly `continue`s on the `_pending` segment — probe P2 shows zero reclamation even at a zero-day cutoff), and `DiagramGcResult` lacks both counters (compile-time failure on the assertions plus the missing `PENDING_ORPHAN_MIN_AGE_MS` import).

- [ ] **Step 1: Write the failing tests.** Extend the imports of `tests/sync/diagramGc.test.ts` to `{ PENDING_ORPHAN_MIN_AGE_MS, runDiagramGc, type DiagramGcStorage }` plus `{ premise, premiseHolds } from "@/tests/_shared/premise"`, then append:

```ts
describe("row-less _pending reclamation (spec §4, BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS)", () => {
  const ghostShowId = "99999999-9999-4999-8999-999999999999";
  const runA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const now = new Date("2026-08-15T12:00:00.000Z");
  const aged = "2026-08-13T00:00:00.000Z"; // 2.5 days old -- STRICTLY clears the 24h gate
  const young = "2026-08-15T06:00:00.000Z"; // 6h old -- inside the 24h gate
  // Exactly AT the cutoff: age == PENDING_ORPHAN_MIN_AGE_MS, not strictly older.
  const atCutoff = new Date(now.getTime() - PENDING_ORPHAN_MIN_AGE_MS).toISOString();

  function agedPremise() {
    premise(
      "the aged fixture STRICTLY clears the age gate",
      now.getTime() - Date.parse(aged),
      PENDING_ORPHAN_MIN_AGE_MS,
    );
  }

  // Mutating map-backed harness: `removePrefix` deletes from live state so
  // assertions run against SURVIVORS, not the call log (spec §6 anti-tautology).
  function liveGcStorage(initial: StoredPath[]) {
    const live = new Map<string, StoredPath>(initial.map((entry) => [pathOf(entry), entry]));
    const storage: DiagramGcStorage = {
      async list(prefix) {
        return [...live.values()].filter((entry) => pathOf(entry).startsWith(prefix));
      },
      async remove(path) {
        live.delete(path);
      },
      async removePrefix(prefix) {
        for (const key of [...live.keys()]) {
          if (key.startsWith(prefix)) live.delete(key);
        }
      },
      async listChildren(prefix) {
        const names = new Set<string>();
        const files = new Set<string>();
        for (const key of live.keys()) {
          if (!key.startsWith(prefix)) continue;
          const rest = key.slice(prefix.length);
          const slash = rest.indexOf("/");
          if (slash === -1) files.add(rest);
          else names.add(rest.slice(0, slash));
        }
        return [
          ...[...names].map((name) => ({ name, isFolder: true })),
          ...[...files].map((name) => ({ name, isFolder: false })),
        ];
      },
    };
    return { storage, survivors: () => [...live.keys()].sort() };
  }

  function gcTx(tempPrefixes: string[]) {
    return {
      listShows: async () => [],
      claimPendingRows: async () => [],
      deletePromotedRows: async () => 0,
      deletePendingRow: async () => undefined,
      listPendingTempPrefixes: async () => tempPrefixes,
    };
  }

  const ghostObject = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-ok.png`;

  test("a row-less aged ghost-show prefix is reclaimed and counted", async () => {
    agedPremise();
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: aged },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(1);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a row-BACKED prefix is untouched regardless of age", async () => {
    agedPremise();
    const prefix = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/`;
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: `${prefix}embedded-ok.png`, createdAt: aged },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([prefix]) });
    expect(survivors()).toEqual([`${prefix}embedded-ok.png`]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
  });

  test("a young group is retained and NOT counted in either field", async () => {
    premise(
      "the young fixture is inside the age gate",
      PENDING_ORPHAN_MIN_AGE_MS,
      now.getTime() - Date.parse(young),
    );
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: young },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([ghostObject]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a MIXED-age group (one aged, one young, both valid) stays whole -- EVERY object must clear the gate", async () => {
    agedPremise();
    premise(
      "the young member is inside the age gate",
      PENDING_ORPHAN_MIN_AGE_MS,
      now.getTime() - Date.parse(young),
    );
    const agedMember = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-a.png`;
    const youngMember = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-b.png`;
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: agedMember, createdAt: aged },
      { path: youngMember, createdAt: young },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    // An "any object is old" or oldest-timestamp implementation deletes this
    // prefix; the newest-object rule keeps it whole (spec §4 "EVERY object").
    expect(survivors()).toEqual([agedMember, youngMember].sort());
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a group exactly AT the cutoff is retained (strictly-older gate, spec §4)", async () => {
    premiseHolds(
      "the fixture's age equals the gate exactly",
      now.getTime() - Date.parse(atCutoff) === PENDING_ORPHAN_MIN_AGE_MS,
    );
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: atCutoff },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([ghostObject]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("ONE missing createdAt retains the whole group and increments the L6 signal", async () => {
    agedPremise();
    const withCreated = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-a.png`;
    const withoutCreated = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-b.png`;
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: withCreated, createdAt: aged },
      withoutCreated,
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([withCreated, withoutCreated].sort());
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(1);
  });

  test("a file-shaped entry directly under shows/ is ignored while a sibling ghost group is reclaimed", async () => {
    agedPremise();
    const strayFile = "diagram-snapshots/shows/stray.txt";
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: strayFile, createdAt: aged },
      { path: ghostObject, createdAt: aged },
    ]);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(survivors()).toEqual([strayFile]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(1);
  });

  test("ports without the new optional methods leave the stage off (counters stay 0)", async () => {
    agedPremise();
    // Rebuild the harness WITHOUT listChildren: the stage requires both optional
    // methods, so it must stay inert even though the fixture would otherwise qualify.
    const { storage: storagePort, survivors } = liveGcStorage([
      { path: ghostObject, createdAt: aged },
    ]);
    const { listChildren: _dropped, ...withoutListChildren } = storagePort;
    const result = await runDiagramGc({ now, storage: withoutListChildren, tx: gcTx([]) });
    expect(survivors()).toEqual([ghostObject]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/sync/diagramGc.test.ts`. Expected: compile failure on the `PENDING_ORPHAN_MIN_AGE_MS` import and the two counter fields (they do not exist), which is the block-level RED; the ghost-show case is the behavioral RED once types exist.
- [ ] **Step 3: Minimal implementation** in `lib/sync/diagramGc.ts`:
  1. Types + constant:

```ts
/** §4: a row-less _pending group is reclaimable only when its NEWEST object is STRICTLY older than this. */
export const PENDING_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;
```

  - `DiagramGcTx` gains `listPendingTempPrefixes?(): Promise<string[]>;`
  - `DiagramGcStorage` gains `listChildren?(prefix: string): Promise<Array<{ name: string; isFolder: boolean }>>;`
  - `DiagramGcResult` gains `pendingOrphanPrefixesDeleted: number; pendingOrphanPrefixesRetainedNoCreatedAt: number;`
  2. Stage, inserted in `runDiagramGc` AFTER the `claimPendingRows` loop and BEFORE the promotion-retry loop; both counters initialized `0` beside the existing counters and added to the return object:

```ts
    if (storage.listChildren && tx.listPendingTempPrefixes) {
      // Spec §4: candidate discovery is STORAGE-driven so ghost shows (rolled-back
      // first-seen apply, deleted rows) are visited; a DB-driven show list cannot see them.
      const rowPrefixes = new Set(await tx.listPendingTempPrefixes());
      const showDirs = await storage.listChildren("diagram-snapshots/shows/");
      for (const showDir of showDirs) {
        if (!showDir.isFolder) continue;
        const pendingRoot = `diagram-snapshots/shows/${showDir.name}/_pending/`;
        for (const runDir of await storage.listChildren(pendingRoot)) {
          if (!runDir.isFolder) continue;
          const prefix = `${pendingRoot}${runDir.name}/`;
          if (rowPrefixes.has(prefix)) continue;
          const objects = await storage.list(prefix);
          if (objects.length === 0) continue;
          let newest = Number.NEGATIVE_INFINITY;
          let missingCreatedAt = false;
          for (const entry of objects) {
            const createdAt = typeof entry === "string" ? null : (entry.createdAt ?? null);
            const created = createdAt === null ? Number.NaN : Date.parse(createdAt);
            if (!Number.isFinite(created)) {
              missingCreatedAt = true;
              break;
            }
            if (created > newest) newest = created;
          }
          if (missingCreatedAt) {
            // §7 L6: signaled, never silent -- surfaced per run via the counter.
            pendingOrphanPrefixesRetainedNoCreatedAt += 1;
            continue;
          }
          // STRICTLY older than the gate (spec §4/AC-6): an exactly-at-cutoff group is retained.
          if (!(now.getTime() - newest > PENDING_ORPHAN_MIN_AGE_MS)) continue;
          await storage.removePrefix(prefix);
          pendingOrphanPrefixesDeleted += 1;
        }
      }
    }
```

- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/sync/diagramGc.test.ts`. Expected (dry-run-verified): 16/16 (the block's eight cases plus the eight pre-existing ones) — every pre-existing case passes untouched (their storage ports lack `listChildren`, so the stage is inert for them, and the file asserts named result fields — `result.orphanBlobsDeleted` etc. — never whole-object equality; verified at plan time: `grep -c "toEqual({" tests/sync/diagramGc.test.ts` → 0).
- [ ] **Step 5: Mutant check (dry-run-verified).** Temporarily flip the age condition to the non-strict `if (now.getTime() - newest < PENDING_ORPHAN_MIN_AGE_MS) continue;`, run the suite, and confirm EXACTLY the at-cutoff case fails (it does — this pins the destructive off-by-one); restore the strict form and confirm 16/16.
- [ ] **Step 6: Commit.** `git add lib/sync/diagramGc.ts tests/sync/diagramGc.test.ts && git commit -m "feat(sync): diagram-gc stage reclaims row-less aged _pending prefixes"`

### Task 4: Default adapters (tested), contract pin, and route summary counters

<!-- task: red=`pnpm vitest run tests/cron/cronRouteSummaries.test.ts tests/sync/diagramGcDefaultStorage.test.ts tests/sync/_pendingSnapshotUploadsContract.test.ts` ac=AC-7 -->

**Files:**
- Modify: `lib/sync/diagramGc.ts` (`defaultTx` gains `listPendingTempPrefixes`; `defaultStorage` gains `listChildren` and becomes EXPORTED with an injectable client, mirroring `defaultStorage` in `lib/sync/promoteSnapshot.ts:224`)
- Modify: `app/api/cron/diagram-gc/route.ts` (summary counts)
- Test: `tests/cron/cronRouteSummaries.test.ts` (extend the existing diagram-gc case)
- Test (create): tests/sync/diagramGcDefaultStorage.test.ts (real-adapter fake-transport test)
- Test: `tests/sync/_pendingSnapshotUploadsContract.test.ts` (one new source-scan case)

**Interfaces:**
- Consumes: Task 3's optional port methods and counters.
- Produces: `export function defaultStorage(supabase = createSupabaseServiceRoleClient()): DiagramGcStorage` in `lib/sync/diagramGc.ts`. Nothing further — this closes the wiring.

**RED validity:** three production absences make the extended/new tests fail: (a) the route's `summary.counts` object lists only the three existing counters; (b) `defaultStorage` is module-private and has no `listChildren`, so the new adapter test fails to import it; (c) `defaultTx` has no `listPendingTempPrefixes` query text, so the contract source-scan finds no match.

- [ ] **Step 1: Write the failing tests.**
  1. In `tests/cron/cronRouteSummaries.test.ts`, extend the diagram-gc case: retitle to `"diagram-gc: authorized → one ok summary with the five delete counts"`, extend the `vi.doMock` stub result with `pendingOrphanPrefixesDeleted: 4, pendingOrphanPrefixesRetainedNoCreatedAt: 5`, and extend the `toMatchObject` counts to:

```ts
      counts: {
        orphanBlobsDeleted: 1,
        pendingPrefixesDeleted: 2,
        promotedRowsDeleted: 3,
        pendingOrphanPrefixesDeleted: 4,
        pendingOrphanPrefixesRetainedNoCreatedAt: 5,
      },
```

  2. Create tests/sync/diagramGcDefaultStorage.test.ts (new file):

```ts
// tests/sync/diagramGcDefaultStorage.test.ts
//
// Drives the REAL diagram-gc defaultStorage.listChildren with a fake Supabase
// transport (the promoteSnapshotDefaultStorage.test.ts pattern): the GC-stage
// tests inject an in-memory port, so without this file a wrong bucket-prefix
// strip, broken pagination, or inverted folder classification ships silently
// and the production _pending stage goes inert.
import { describe, expect, test, vi } from "vitest";

import { defaultStorage } from "@/lib/sync/diagramGc";

type Entry = { name: string; id?: string };

function fakeSupabase(pages: Entry[][]) {
  const listArgs: Array<{ key: string; offset: number }> = [];
  const bucket = {
    list: vi.fn(async (key: string, options: { limit: number; offset: number }) => {
      listArgs.push({ key, offset: options.offset });
      return { data: pages[Math.floor(options.offset / options.limit)] ?? [], error: null };
    }),
    remove: vi.fn(async () => ({ error: null })),
  };
  const from = vi.fn(() => bucket);
  return { supabase: { storage: { from } }, listArgs, from };
}

describe("defaultStorage().listChildren (real adapter, fake transport)", () => {
  test("strips the bucket prefix and classifies folders (no id) vs files (id)", async () => {
    const { supabase, listArgs, from } = fakeSupabase([
      [{ name: "show-dir-1" }, { name: "stray.txt", id: "id-1" }],
    ]);
    const storage = defaultStorage(supabase as never);

    const children = await storage.listChildren?.("diagram-snapshots/shows/");

    expect(from).toHaveBeenCalledWith("diagram-snapshots");
    expect(listArgs.map((call) => call.key)).toEqual(["shows/"]);
    expect(children).toEqual([
      { name: "show-dir-1", isFolder: true },
      { name: "stray.txt", isFolder: false },
    ]);
  });

  test("paginates past a full page", async () => {
    const fullPage: Entry[] = Array.from({ length: 100 }, (_, index) => ({
      name: `dir-${index}`,
    }));
    const { supabase, listArgs } = fakeSupabase([fullPage, [{ name: "dir-last" }]]);
    const storage = defaultStorage(supabase as never);
    const children = await storage.listChildren?.("diagram-snapshots/shows/");
    expect(listArgs.map((call) => call.offset)).toEqual([0, 100]);
    expect(children).toHaveLength(101);
  });
});
```

  3. In `tests/sync/_pendingSnapshotUploadsContract.test.ts`, add this case (before the existing `"GC production storage listing recurses into revision directories"` case; the file's `readFileSync`/`join`/`root` helpers are module-scope):

```ts
  test("the row-less _pending stage's ledger listing is the exact unfiltered query", () => {
    // Spec §4 step 2: ANY visible row keeps its prefix off-limits to the
    // storage-driven stage, whatever its lifecycle state -- a WHERE clause or a
    // table swap here would hand in-flight prefixes to a deleter. The closing
    // quote is anchored so a suffixed table name (`..._archive`) or ANY trailing
    // clause breaks the match, and the leading method-name tether keeps the
    // guard pointed at the live listPendingTempPrefixes body.
    const source = readFileSync(join(root, "lib/sync/diagramGc.ts"), "utf8");
    expect(source).toMatch(
      /listPendingTempPrefixes\(\)[\s\S]{0,400}?"select temp_prefix from public\.pending_snapshot_uploads"/,
    );
  });
```

  Four-mutant validation for this string guard (executed at plan time; record in Global Constraints): emptied query reds, suffixed table name reds, a WHERE-filtered query reds; the comment-copy mutant is the recorded documented limit of the source-scan form.

- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/cron/cronRouteSummaries.test.ts tests/sync/diagramGcDefaultStorage.test.ts tests/sync/_pendingSnapshotUploadsContract.test.ts`. Expected: the diagram-gc summary case FAILS (two new keys absent), the adapter file FAILS on the missing `defaultStorage` export, and the contract case FAILS (no `listPendingTempPrefixes` body exists to match).
- [ ] **Step 3: Minimal implementation.**
  1. `app/api/cron/diagram-gc/route.ts` — add to `summary.counts`:

```ts
          pendingOrphanPrefixesDeleted: result.pendingOrphanPrefixesDeleted,
          pendingOrphanPrefixesRetainedNoCreatedAt: result.pendingOrphanPrefixesRetainedNoCreatedAt,
```

  2. `lib/sync/diagramGc.ts` `defaultTx` — add beside `close`:

```ts
    async listPendingTempPrefixes() {
      // Deliberately NO state filter: any visible row, whatever its lifecycle
      // state, keeps its prefix off-limits to the row-less _pending stage (§4).
      const prefixRows = await rows<{ temp_prefix: string }>(
        "select temp_prefix from public.pending_snapshot_uploads",
      );
      return prefixRows.map((row) => row.temp_prefix);
    },
```

  3. `lib/sync/diagramGc.ts` `defaultStorage` — export with an injectable client (the `promoteSnapshot.ts` pattern) and add the shallow single-level listing beside the recursive `listPaths`:

```ts
export function defaultStorage(
  supabase: ReturnType<typeof createSupabaseServiceRoleClient> = createSupabaseServiceRoleClient(),
): DiagramGcStorage {
  const bucket = supabase.storage.from(DIAGRAM_BUCKET);
```

```ts
    async listChildren(prefix) {
      const objectPrefix = prefix.startsWith(`${DIAGRAM_BUCKET}/`)
        ? prefix.slice(DIAGRAM_BUCKET.length + 1)
        : prefix;
      const children: Array<{ name: string; isFolder: boolean }> = [];
      const pageSize = 100;
      let offset = 0;
      while (true) {
        // not-subject-to-meta: sync storage adapter -- throws on destructured error; consumed by runDiagramGc's cron-route summary
        const { data, error } = await bucket.list(objectPrefix, { limit: pageSize, offset });
        if (error) throw error;
        const page = data ?? [];
        for (const entry of page) {
          children.push({ name: entry.name, isFolder: !("id" in entry && entry.id) });
        }
        if (page.length < pageSize) break;
        offset += page.length;
      }
      return children;
    },
```

  (Supabase list entries without an `id` are folder placeholders — the same discrimination the file's recursive `listPaths` uses today.)
- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/cron/cronRouteSummaries.test.ts tests/sync/diagramGcDefaultStorage.test.ts tests/sync/_pendingSnapshotUploadsContract.test.ts tests/sync/diagramGc.test.ts tests/api/cron-sync.test.ts`. Expected (dry-run-verified): all pass (`cron-sync` consumes the mocked `runDiagramGc` result shape — additive fields are safe there).
- [ ] **Step 5: Commit.** `git add lib/sync/diagramGc.ts app/api/cron/diagram-gc/route.ts tests/cron/cronRouteSummaries.test.ts tests/sync/diagramGcDefaultStorage.test.ts tests/sync/_pendingSnapshotUploadsContract.test.ts && git commit -m "feat(sync): wire _pending reclamation defaults and diagram-gc summary counters"`

### Task 5: Closeout gates

<!-- task: red=`pnpm typecheck` ac=AC-8 -->

**Files:**
- None beyond prior tasks (the invariant-12 ledger markers come off in the PR's LAST commit per AGENTS.md, handled by the implementer session's finishing flow, not a task step here)

**RED validity:** N/A-by-shape for a gate task — the commands below are verification gates, not new test authorship; `red=` names the first gate that must pass on the finished tree.

- [ ] **Step 1: Full scoped suite.** Run: `pnpm vitest run tests/sync/assetRecovery.test.ts tests/sync/snapshotAssets.test.ts tests/sync/diagramGc.test.ts tests/sync/applySnapshotStorageDefault.test.ts tests/sync/diagramGcDefaultStorage.test.ts tests/sync/_pendingSnapshotUploadsContract.test.ts tests/cron/cronRouteSummaries.test.ts tests/api/cron-sync.test.ts`. Expected: PASS.
- [ ] **Step 2: Static gates.** Run: `pnpm typecheck && pnpm exec eslint lib/sync/assetRecovery.ts lib/sync/snapshotAssets.ts lib/sync/diagramGc.ts lib/sync/defaultSnapshotAssetsForApply.ts app/api/cron/diagram-gc/route.ts tests/sync/assetRecovery.test.ts tests/sync/snapshotAssets.test.ts tests/sync/diagramGc.test.ts tests/sync/applySnapshotStorageDefault.test.ts tests/sync/diagramGcDefaultStorage.test.ts tests/sync/_pendingSnapshotUploadsContract.test.ts tests/cron/cronRouteSummaries.test.ts && pnpm format:check`. Expected: all clean.
- [ ] **Step 3: Full suite under the semaphore.** Run: `pnpm heavy pnpm test`. Expected: green (pre-existing failures, if any, verified against merge-base per the pre-existing-failures rule before attribution).
- [ ] **Step 4: Probe parity.** Run: `pnpm tsx docs/superpowers/specs/probes/2026-08-15-storage-asset-integrity-probe.ts`. Expected (dry-run-verified): P1 now prints `manifestTargetExists: true` (the loser retains) — record the new transcript in the PR body as the before/after evidence. P2's GC section still shows survivors (the probe wires no `listChildren` — its GC run exercises the pre-existing sweep only; the NEW stage's coverage lives in `tests/sync/diagramGc.test.ts`).
- [ ] **Step 5: Push.** `git push` (commits landed per task).

<!-- tasks: end -->

## Self-review (run at plan time — record here)

- Spec coverage: §2 → Task 1; §3 → Task 2; §4 → Tasks 3-4; §5 route summary → Task 4; §6 shapes → Tasks 1-4 test blocks (each §6 bullet has a named case, including the file-shaped-entry case and the strictly-older boundary case); §7 L6 signal → Task 3 counter + Task 4 summary. No spec requirement without a task.
- Registry count reconciliation: one meta-suite row change — `tests/sync/_pendingSnapshotUploadsContract.test.ts` gains exactly one case (Task 4 Step 1.3); declared in Global Constraints. No registry-array-bearing suite changes.
- Type consistency: `lockedSnapshotRevisionId` (Task 1), `removePrefix` / `applySnapshotStorage` (Task 2), `PENDING_ORPHAN_MIN_AGE_MS` / `listPendingTempPrefixes` / `listChildren` / both counters / `defaultStorage` export (Tasks 3-4) — names identical across producer and consumer tasks.
- **Plan-time dry-run (executed, then reverted — this worktree ships spec+plan only):** every task's snippets were applied to the live tree and the full red/green cycles run. Results: Task 1 RED = 4 failing cases (3 keeps on surviving-state + the `lockedSnapshotRevisionId` field case) on unmodified lib, GREEN = 20/20 with the diff; Task 2 RED = one case failing (`premise not met: the catch attempted the prefix removal`) plus the missing-export failure, GREEN = 11/11 + 3/3; Task 3 GREEN = 16/16 (dry-run at 15 cases before the R2-amended mixed-age case landed; the two R2-amended cases — winner-manifest survival with real snapshotPath values, and mixed-age group kept whole with counters 0/0 — were re-dry-run against the patched tree with all premises true); Task 3 Step 5 mutant (non-strict age gate) fails EXACTLY the at-cutoff case and the strict form restores the full green suite; Task 4 GREEN = 33/33 (`tests/cron/cronRouteSummaries.test.ts` + `tests/api/cron-sync.test.ts`) and separately fifteen passing cases spanning the two adapter test files plus the contract suite; `pnpm typecheck` clean; `pnpm exec eslint` clean over all five lib/app files + seven test files; probe re-run with the diff prints `PROBE P1 manifestTargetExists: true` (the Task 5 Step 4 expectation). The snippets in this plan are verbatim what ran.
- Pre-existing-assertion check (run at plan time): exactly TWO assertion sites today in `tests/sync/assetRecovery.test.ts`, both `expect(removed).toEqual(uploads.map((upload) => upload.path))` lines: one in the drift test (stays, still correct) and one in the no_op test (pins the defect; Task 1 Step 1 deletes that test and replaces it with the same-revision keep case). `tests/sync/diagramGc.test.ts` asserts named result fields (`result.orphanBlobsDeleted` etc.), never whole-object equality on the result — additive counters are safe (grep for `toEqual({` in that file → 0 hits).
