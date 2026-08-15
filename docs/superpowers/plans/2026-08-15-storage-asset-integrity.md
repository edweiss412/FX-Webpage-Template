# Storage Asset Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

impeccable-gate: N/A — no UI surface

**Goal:** Ship the two repairs ratified by the spec — proof-gated recovery cleanup so a losing concurrent recovery can never delete a winner's committed-manifest objects, and `_pending` orphan reclamation (storage-port removal capability + a GC stage over row-less `_pending` prefixes).

**Architecture:** Three surgical surfaces, all behind existing injectable ports: `lib/sync/assetRecovery.ts` (cleanup condition + a `lockedSnapshotRevisionId` carry on `no_op`), `lib/sync/snapshotAssets.ts` + `lib/sync/defaultSnapshotAssetsForApply.ts` (optional `removePrefix` capability, best-effort catch cleanup), `lib/sync/diagramGc.ts` + `app/api/cron/diagram-gc/route.ts` (storage-driven `_pending` sweep with two new result counters). No DB migration, no UI, no new lock acquisition.

**Tech Stack:** TypeScript (strict, `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`), Vitest with in-memory ports, Supabase storage JS client.

**Spec:** `docs/superpowers/specs/2026-08-15-storage-asset-integrity-design.md` (adversarially APPROVED R3). The executable probe backing it: `docs/superpowers/specs/probes/2026-08-15-storage-asset-integrity-probe.ts`.

## Global Constraints

- Invariant 1 (TDD): every task is failing test → minimal implementation → passing test → commit.
- Invariant 2: NO new advisory-lock acquisition anywhere in this plan. Holder topology (declared per writing-plans rule): the only holders on `hashtext('show:' || drive_file_id)` touched here are `assetRecovery`'s two existing `withShowLock` calls (JS-wrapper layer via `AssetRecoveryPostgresTx`, `tryOnly: true`) — both unchanged; the GC `_pending` stage holds NO show lock by design (spec §5). `tests/auth/advisoryLockRpcDeadlock.test.ts` is untouched.
- Invariant 9: every new Supabase storage call destructures `{ data, error }` / `{ error }` and throws on `error`; each new adapter call site carries `// not-subject-to-meta: sync storage adapter — throws on destructured error; consumed by <caller>'s typed infra outcome`.
- Invariant 10: no new HTTP mutation surface; the diagram-gc GET route's `runCronRoute` summary is extended, not replaced. `snapshotAssets` stays log-free (spec §1.1 R7).
- Conventional commits, one commit per task, scope `sync` (route file rides the Task 4 commit under the same scope).
- No migration → validation-schema-parity checklist N/A (spec §1.1 R4). No §12.4 catalog change.
- Meta-test inventory (declared): none created or extended. Reasons: no new auth boundary (`tests/auth/_metaInfraContract.test.ts` is auth-scoped; the sync storage adapters carry invariant-9 `not-subject-to-meta` comments instead), no admin-alert code changes, no lock-topology change, no tile/sentinel surface. Mutation-family closure: N/A — this plan ships product behavior + unit tests, not a structural guard or mutation harness surface.
- Four pre-dispatch mutants for string-presence guards: N/A — no planned assertion is a string-presence-in-output guard; assertions are port-state (storage map keys, counter values, result objects).
- Heavy phases (full suite, build) run under `pnpm heavy` per AGENTS.md; the scoped vitest runs named per task stay unwrapped.

## Acceptance criteria (spec traceability)

- AC-1 (spec §2.2): a `skipped` or same-revision/`lockedShow`-null `no_op` outcome removes NOTHING from storage.
- AC-2 (spec §2.1-§2.2): drift outcomes — pre-check mismatch, CAS-false, and no_op-with-different-revision — still delete exactly the run's own `uploadedPaths`.
- AC-3 (spec §2.2): `AssetRecoveryResult`'s commit-branch `no_op` carries `lockedSnapshotRevisionId` when a locked manifest was readable.
- AC-4 (spec §3): `SnapshotAssetsStorage.removePrefix` exists (optional); a `snapshotAssets` throw best-effort-removes the run's `_pending` temp prefix, never masks the original error, and still works when the port lacks `removePrefix`.
- AC-5 (spec §3): the apply-path storage adapter (`makeSnapshotAssetsForApply`) implements `removePrefix` with invariant-9 destructuring — the single adapter all three apply callers share (`applyStaged.ts`, `runScheduledCronSync.ts`, `runManualStageForFirstSeen.ts` all route through `makeSnapshotAssetsForApply`).
- AC-6 (spec §4): `runDiagramGc` reclaims a row-less `_pending` run prefix only when every object is older than `PENDING_ORPHAN_MIN_AGE_MS` (24h); row-backed, young, and missing-`createdAt` groups are retained; missing-`createdAt` groups increment `pendingOrphanPrefixesRetainedNoCreatedAt`; ghost shows (no `public.shows` row) are discovered via storage `listChildren`.
- AC-7 (spec §4/§5): the diagram-gc route summary surfaces both new counters.
- AC-8 (spec §6): all assertions are against port state (storage contents / counters / results), with executable premises where discrimination depends on a fixture condition.

---

<!-- tasks: depth=3 -->

### Task 1: Proof-gated recovery cleanup

<!-- task: red=`pnpm vitest run tests/sync/assetRecovery.test.ts` ac=AC-1,AC-2,AC-3 -->

**Files:**
- Modify: `lib/sync/assetRecovery.ts` (the `AssetRecoveryResult` `no_op` variant; the commit-branch `no_op` return; the two post-lock cleanup sites)
- Test: `tests/sync/assetRecovery.test.ts` (new `describe` block; ONE existing defect-pinning test deleted per Step 1; every other case untouched)

**Interfaces:**
- Consumes: existing `assetRecovery(showId, deps)` and the test file's `storage()` / `partialDiagrams()` helpers (`tests/sync/assetRecovery.test.ts:26-67`).
- Produces: `AssetRecoveryResult` variant `{ outcome: "no_op"; lockedSnapshotRevisionId?: string }`. Task 5's closeout and the spec's §6 case list rely on the five behaviors below; no other task consumes this type.

**RED validity:** the production lines whose defect makes the new tests fail are the unconditional cleanups in `lib/sync/assetRecovery.ts` — `await Promise.all(uploadedPaths.map((path) => deps.storage.remove?.(path)))` in BOTH the `isConcurrentSyncSkipped(locked)` branch and the `locked.outcome === "revision_drift" || locked.outcome === "no_op"` branch (currently ~:693-700). While those delete unconditionally, the keep-cases below fail; the `lockedSnapshotRevisionId` assertions additionally fail because the field does not exist yet.

- [ ] **Step 1: Write the failing tests.** Append this block to `tests/sync/assetRecovery.test.ts` (inside the top-level `describe("assetRecovery")`; reuses the file's `showId` / `driveFileId` / `snapshotRevisionId` constants, `partialDiagrams()`, `storage()`, and `premise`; add `type AssetRecoveryTx` to the existing `@/lib/sync/assetRecovery` import). In the SAME step, DELETE the existing test `"no-op after canonical upload removes uploaded recovery bytes"` (`tests/sync/assetRecovery.test.ts:264-299`) — it pins exactly the defect this task repairs (same-revision `no_op` deleting the winner's live objects; probe P1); its replacement is the same-revision keep case below. The sibling `"revision drift after canonical upload removes uploaded recovery bytes"` (`tests/sync/assetRecovery.test.ts:223-262`) stays UNCHANGED — drift deletion remains correct behavior and that test is the existing pin for it:

```ts
  describe("proof-gated cleanup (spec §2, BL-RECOVERY-CLEANUP-DELETES-LIVE-BYTES)", () => {
    const driftedRev = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

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
      const { storagePort, uploads, removed } = storage();
      const result = await assetRecovery(showId, depsWithSecondPass(storagePort, "contended"));
      premise("the loser uploaded before its contended commit attempt", uploads.length, 0);
      expect(result).toEqual({ outcome: "skipped", code: CONCURRENT_SYNC_SKIPPED });
      expect(removed).toEqual([]);
    });

    test("no_op with the SAME locked revision (winner committed it) keeps the winner's live objects", async () => {
      const { storagePort, uploads, removed } = storage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, {
          readLockedShow: async () => ({
            showId,
            driveFileId,
            diagrams: { ...partialDiagrams(), snapshot_status: "complete" },
          }),
        }),
      );
      premise("the loser uploaded the same canonical paths the winner committed", uploads.length, 0);
      expect(result).toEqual({ outcome: "no_op", lockedSnapshotRevisionId: snapshotRevisionId });
      expect(removed).toEqual([]);
    });

    test("no_op with a NULL locked show keeps uploads (no revision proof)", async () => {
      const { storagePort, uploads, removed } = storage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, { readLockedShow: async () => null }),
      );
      premise("uploads happened before the locked show vanished", uploads.length, 0);
      expect(result).toEqual({ outcome: "no_op" });
      expect(removed).toEqual([]);
    });

    test("no_op with a DIFFERENT locked revision deletes the run's own uploads (proof held)", async () => {
      const { storagePort, uploads, removed } = storage();
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
      expect([...removed].sort()).toEqual(uploads.map((u) => u.path).sort());
    });

    test("commit-branch revision drift still deletes the run's own uploads (proof held)", async () => {
      const { storagePort, uploads, removed } = storage();
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
      expect([...removed].sort()).toEqual(uploads.map((u) => u.path).sort());
    });

    test("CAS-false drift deletes the run's own uploads (spec §2.1 form (b) -- the WHERE evaluated inequality under the row lock; unreachable via concurrent commits per §2.3, injected via the port seam)", async () => {
      const { storagePort, uploads, removed } = storage();
      const result = await assetRecovery(
        showId,
        depsWithSecondPass(storagePort, { updateRecoveredDiagrams: async () => false }),
      );
      premise("uploads happened before the CAS refused the commit", uploads.length, 0);
      expect(result).toMatchObject({ outcome: "revision_drift" });
      expect([...removed].sort()).toEqual(uploads.map((u) => u.path).sort());
    });
  });
```

- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/sync/assetRecovery.test.ts`. Expected (verified at plan time by running exactly this cycle): FOUR cases fail — the three keep-cases on `expect(removed).toEqual([])` (current code deletes), and the no_op-with-a-DIFFERENT-revision case on the missing `lockedSnapshotRevisionId` field — while the drift/CAS delete-cases PASS (they pin deletion behavior so the repair cannot overshoot into never-delete). All remaining pre-existing cases PASS (the defect-pinning no_op test is already deleted in Step 1).
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
- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/sync/assetRecovery.test.ts`. Expected: ALL pass — including the UNCHANGED drift-deletion pin at `tests/sync/assetRecovery.test.ts:223` ("revision drift after canonical upload removes uploaded recovery bytes", whose `removed` assertion still holds because drift keeps deletion authority).
- [ ] **Step 5: Commit.** `git add lib/sync/assetRecovery.ts tests/sync/assetRecovery.test.ts && git commit -m "fix(sync): proof-gate recovery cleanup so a losing run never deletes committed bytes"`

### Task 2: `removePrefix` capability + best-effort snapshot catch cleanup

<!-- task: red=`pnpm vitest run tests/sync/snapshotAssets.test.ts` ac=AC-4,AC-5 -->

**Files:**
- Modify: `lib/sync/snapshotAssets.ts` (the `SnapshotAssetsStorage` type; the tail `catch`)
- Modify: `lib/sync/defaultSnapshotAssetsForApply.ts` (storage adapter gains `removePrefix`)
- Test: `tests/sync/snapshotAssets.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: existing `snapshotAssets(args)`; the run-private temp prefix `diagram-snapshots/shows/<showId>/_pending/<runUuid>/` built by `tempPrefix()` (`lib/sync/snapshotAssets.ts:164-166`).
- Produces: `SnapshotAssetsStorage.removePrefix?(prefix: string): Promise<void>` — Task 4's GC stage does NOT consume it (GC has its own `DiagramGcStorage`); only the apply adapters implement it.

**RED validity:** the production line whose absence makes the new tests fail is the missing `removePrefix` attempt in the `catch` at `lib/sync/snapshotAssets.ts:287-290` — today the catch calls only `markPendingSnapshotDeleteStarted` and rethrows, so uploaded `_pending` objects survive the throw (probe P2).

- [ ] **Step 1: Write the failing tests.** Append to `tests/sync/snapshotAssets.test.ts` (mirror the file's existing arg-builder helpers; the block below is self-contained if the file's helpers differ — it builds its own args):

```ts
  describe("upload-throw best-effort cleanup (spec §3, BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS)", () => {
    const showId = "11111111-1111-4111-8111-111111111111";
    const driveFileId = "sheet-file-1";
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
      const removedPrefixes: string[] = [];
      const storagePort: SnapshotAssetsStorage = {
        async upload(path, bytes) {
          objects.set(path, bytes);
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

  Imports to add at the top of the test file if not present: `snapshotAssets, type SnapshotAssetsArgs, type SnapshotAssetsStorage` from `@/lib/sync/snapshotAssets`; `sha256Base64Url` from `@/lib/crypto/sha256`; `premise` from `@/tests/_shared/premise`.
- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/sync/snapshotAssets.test.ts`. Expected (verified at plan time by running exactly this cycle): test 1 FAILS at runtime on its premise — `premise not met: the catch attempted the prefix removal` (the catch never calls `removePrefix` on current code); tests 2-3 pass already (rethrow is current behavior) — they pin the non-masking contract. (`pnpm typecheck` at this point ALSO reds on the excess `removePrefix` property until the type field lands — either observation is a valid RED.)
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

  3. `lib/sync/defaultSnapshotAssetsForApply.ts` — extend the storage adapter object (beside its existing `upload`):

```ts
        async removePrefix(prefix) {
          const objectPrefix = prefix.startsWith(`${DIAGRAM_BUCKET}/`)
            ? prefix.slice(DIAGRAM_BUCKET.length + 1)
            : prefix;
          const bucket = supabase.storage.from(DIAGRAM_BUCKET);
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
```

  (`_pending/<runUuid>/` holds flat files only — every object is uploaded as `<temp><assetKey>` with no nested directories, so a single-level list is complete. `DIAGRAM_BUCKET` is already a module constant in this file.)
- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/sync/snapshotAssets.test.ts`. Expected: ALL pass, pre-existing cases included.
- [ ] **Step 5: Commit.** `git add lib/sync/snapshotAssets.ts lib/sync/defaultSnapshotAssetsForApply.ts tests/sync/snapshotAssets.test.ts && git commit -m "fix(sync): best-effort _pending cleanup on snapshot upload throw via optional removePrefix"`

### Task 3: GC `_pending` orphan stage (injected ports)

<!-- task: red=`pnpm vitest run tests/sync/diagramGc.test.ts` ac=AC-6 -->

**Files:**
- Modify: `lib/sync/diagramGc.ts` (`DiagramGcTx` + `DiagramGcStorage` + `DiagramGcResult` types; `PENDING_ORPHAN_MIN_AGE_MS` constant; the new stage inside `runDiagramGc`)
- Test: `tests/sync/diagramGc.test.ts` (new `describe` block; extends the file's `storage()` helper with `listChildren`)

**Interfaces:**
- Consumes: existing `runDiagramGc(args)`; the test file's `storage(paths)` helper (`tests/sync/diagramGc.test.ts:14-31`).
- Produces (Task 4 consumes all three):
  - `export const PENDING_ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;`
  - `DiagramGcTx.listPendingTempPrefixes?(): Promise<string[]>`
  - `DiagramGcStorage.listChildren?(prefix: string): Promise<Array<{ name: string; isFolder: boolean }>>`
  - `DiagramGcResult` gains `pendingOrphanPrefixesDeleted: number` and `pendingOrphanPrefixesRetainedNoCreatedAt: number`.

**RED validity:** the production lines whose absence makes the new tests fail: `runDiagramGc` has no `_pending` stage (the object sweep explicitly `continue`s on the `_pending` segment at `lib/sync/diagramGc.ts:392`, probe P2 shows zero reclamation), and `DiagramGcResult` lacks both counters (compile-time failure on the assertions).

- [ ] **Step 1: Write the failing tests.** Append to `tests/sync/diagramGc.test.ts`:

```ts
describe("row-less _pending reclamation (spec §4, BL-SNAPSHOT-UPLOAD-THROW-ORPHANS-OBJECTS)", () => {
  const ghostShowId = "99999999-9999-4999-8999-999999999999";
  const runA = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const now = new Date("2026-08-15T12:00:00.000Z");
  const aged = "2026-08-13T00:00:00.000Z"; // 2.5 days old -- clears the 24h gate by construction
  const young = "2026-08-15T06:00:00.000Z"; // 6h old -- inside the 24h gate by construction

  function childrenFrom(paths: StoredPath[]) {
    return async (prefix: string) => {
      const names = new Set<string>();
      const files = new Set<string>();
      for (const entry of paths) {
        const path = pathOf(entry);
        if (!path.startsWith(prefix)) continue;
        const rest = path.slice(prefix.length);
        const slash = rest.indexOf("/");
        if (slash === -1) files.add(rest);
        else names.add(rest.slice(0, slash));
      }
      return [
        ...[...names].map((name) => ({ name, isFolder: true })),
        ...[...files].map((name) => ({ name, isFolder: false })),
      ];
    };
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

  test("a row-less aged ghost-show prefix is reclaimed and counted", async () => {
    premise(
      "the aged fixture clears the age gate",
      now.getTime() - Date.parse(aged),
      PENDING_ORPHAN_MIN_AGE_MS,
    );
    const paths: StoredPath[] = [
      {
        path: `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-ok.png`,
        createdAt: aged,
      },
    ];
    const { storage: storagePort, deleted } = storage(paths);
    const result = await runDiagramGc({
      now,
      storage: { ...storagePort, listChildren: childrenFrom(paths) },
      tx: gcTx([]),
    });
    expect(deleted).toEqual([
      `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-ok.png`,
    ]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(1);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("a row-BACKED prefix is untouched regardless of age", async () => {
    const prefix = `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/`;
    const paths: StoredPath[] = [{ path: `${prefix}embedded-ok.png`, createdAt: aged }];
    const { storage: storagePort, deleted } = storage(paths);
    const result = await runDiagramGc({
      now,
      storage: { ...storagePort, listChildren: childrenFrom(paths) },
      tx: gcTx([prefix]),
    });
    expect(deleted).toEqual([]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
  });

  test("a young group is retained and NOT counted in either field", async () => {
    premise(
      "the young fixture is inside the age gate",
      PENDING_ORPHAN_MIN_AGE_MS,
      now.getTime() - Date.parse(young),
    );
    const paths: StoredPath[] = [
      {
        path: `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-ok.png`,
        createdAt: young,
      },
    ];
    const { storage: storagePort, deleted } = storage(paths);
    const result = await runDiagramGc({
      now,
      storage: { ...storagePort, listChildren: childrenFrom(paths) },
      tx: gcTx([]),
    });
    expect(deleted).toEqual([]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });

  test("ONE missing createdAt retains the whole group and increments the L6 signal", async () => {
    const paths: StoredPath[] = [
      {
        path: `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-a.png`,
        createdAt: aged,
      },
      `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-b.png`,
    ];
    const { storage: storagePort, deleted } = storage(paths);
    const result = await runDiagramGc({
      now,
      storage: { ...storagePort, listChildren: childrenFrom(paths) },
      tx: gcTx([]),
    });
    expect(deleted).toEqual([]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(1);
  });

  test("ports without the new optional methods leave the stage off (counters stay 0)", async () => {
    const paths: StoredPath[] = [
      {
        path: `diagram-snapshots/shows/${ghostShowId}/_pending/${runA}/embedded-ok.png`,
        createdAt: aged,
      },
    ];
    const { storage: storagePort, deleted } = storage(paths);
    const result = await runDiagramGc({ now, storage: storagePort, tx: gcTx([]) });
    expect(deleted).toEqual([]);
    expect(result.pendingOrphanPrefixesDeleted).toBe(0);
    expect(result.pendingOrphanPrefixesRetainedNoCreatedAt).toBe(0);
  });
});
```

  Imports to extend: `PENDING_ORPHAN_MIN_AGE_MS` from `@/lib/sync/diagramGc`; `premise` from `@/tests/_shared/premise`. Note the "ports without methods" case passes `tx: gcTx([])` — `listPendingTempPrefixes` present but `listChildren` absent; the stage requires BOTH.
- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/sync/diagramGc.test.ts`. Expected: compile failure on `PENDING_ORPHAN_MIN_AGE_MS` / the two counter fields (they do not exist), which is the block-level RED; the ghost-show case is the behavioral RED once types exist.
- [ ] **Step 3: Minimal implementation** in `lib/sync/diagramGc.ts`:
  1. Types + constant:

```ts
/** §4: a row-less _pending group is reclaimable only when its NEWEST object is older than this. */
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
          if (now.getTime() - newest < PENDING_ORPHAN_MIN_AGE_MS) continue;
          await storage.removePrefix(prefix);
          pendingOrphanPrefixesDeleted += 1;
        }
      }
    }
```

- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/sync/diagramGc.test.ts`. Expected: ALL pass including every pre-existing case (the stage is inert for them: their storage ports lack `listChildren`, so counters are 0 — and their result assertions use named fields, not object equality; verified at plan time: the file asserts `result.orphanBlobsDeleted` / `result.pendingPrefixesDeleted` style, never `toEqual` on the whole result).
- [ ] **Step 5: Commit.** `git add lib/sync/diagramGc.ts tests/sync/diagramGc.test.ts && git commit -m "feat(sync): diagram-gc stage reclaims row-less aged _pending prefixes"`

### Task 4: Default adapters + route summary counters

<!-- task: red=`pnpm vitest run tests/cron/cronRouteSummaries.test.ts` ac=AC-7 -->

**Files:**
- Modify: `lib/sync/diagramGc.ts` (`defaultTx` gains `listPendingTempPrefixes`; `defaultStorage` gains `listChildren`)
- Modify: `app/api/cron/diagram-gc/route.ts` (summary counts)
- Test: `tests/cron/cronRouteSummaries.test.ts` (extend the existing diagram-gc case)

**Interfaces:**
- Consumes: Task 3's optional port methods and counters.
- Produces: nothing further — this closes the wiring.

**RED validity:** the production lines whose absence makes the extended test fail: the route's `summary.counts` object in `app/api/cron/diagram-gc/route.ts` lists only the three existing counters, so asserting the two new keys fails until the route (and the `runDiagramGc` result it forwards) carries them.

- [ ] **Step 1: Extend the failing test.** In `tests/cron/cronRouteSummaries.test.ts`, the diagram-gc case (~:165-185) stubs `runDiagramGc`'s result and asserts the summary counts. Extend the stubbed result with `pendingOrphanPrefixesDeleted: 3, pendingOrphanPrefixesRetainedNoCreatedAt: 1` and assert both appear in `summaries[0]!.counts` (exact assertion shape mirrors the existing three counters in that test; update its title to "…with the five delete counts").
- [ ] **Step 2: Run to verify the RED.** Run: `pnpm vitest run tests/cron/cronRouteSummaries.test.ts`. Expected: the diagram-gc case FAILS — the two new keys are absent from the route's summary counts.
- [ ] **Step 3: Minimal implementation.**
  1. `app/api/cron/diagram-gc/route.ts` — add to `summary.counts`:

```ts
          pendingOrphanPrefixesDeleted: result.pendingOrphanPrefixesDeleted,
          pendingOrphanPrefixesRetainedNoCreatedAt: result.pendingOrphanPrefixesRetainedNoCreatedAt,
```

  2. `lib/sync/diagramGc.ts` `defaultTx` — add:

```ts
    async listPendingTempPrefixes() {
      const prefixRows = await rows<{ temp_prefix: string }>(
        "select temp_prefix from public.pending_snapshot_uploads",
      );
      return prefixRows.map((row) => row.temp_prefix);
    },
```

  3. `lib/sync/diagramGc.ts` `defaultStorage` — add a SHALLOW single-level listing beside the recursive `listPaths`:

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

  (`defaultStorage` already closes over `bucket`; Supabase list entries without an `id` are folder placeholders — the same discrimination `listPaths` uses today at `lib/sync/diagramGc.ts:106`.)
- [ ] **Step 4: Run to verify GREEN.** Run: `pnpm vitest run tests/cron/cronRouteSummaries.test.ts tests/sync/diagramGc.test.ts`. Expected: ALL pass.
- [ ] **Step 5: Commit.** `git add lib/sync/diagramGc.ts app/api/cron/diagram-gc/route.ts tests/cron/cronRouteSummaries.test.ts && git commit -m "feat(sync): wire _pending reclamation defaults and diagram-gc summary counters"`

### Task 5: Closeout gates

<!-- task: red=`pnpm typecheck` ac=AC-8 -->

**Files:**
- Modify: `BACKLOG.md` (nothing here — the IN PROGRESS markers come off in the PR's LAST commit per invariant 12, handled at merge time by the implementer session's finishing flow)

**RED validity:** N/A-by-shape for a gate task — the commands below are verification gates, not new test authorship; `red=` names the first gate that must pass on the finished tree (typecheck covers both vitest-stripped and compiled paths per the pre-push rules).

- [ ] **Step 1: Full scoped suite.** Run: `pnpm vitest run tests/sync/assetRecovery.test.ts tests/sync/snapshotAssets.test.ts tests/sync/diagramGc.test.ts tests/cron/cronRouteSummaries.test.ts tests/api/cron-sync.test.ts`. Expected: PASS (cron-sync included because it consumes `DiagramGcResult` — additive fields must not break it).
- [ ] **Step 2: Static gates.** Run: `pnpm typecheck && pnpm exec eslint lib/sync/assetRecovery.ts lib/sync/snapshotAssets.ts lib/sync/diagramGc.ts lib/sync/defaultSnapshotAssetsForApply.ts app/api/cron/diagram-gc/route.ts tests/sync/assetRecovery.test.ts tests/sync/snapshotAssets.test.ts tests/sync/diagramGc.test.ts tests/cron/cronRouteSummaries.test.ts && pnpm format:check`. Expected: all clean.
- [ ] **Step 3: Full suite under the semaphore.** Run: `pnpm heavy pnpm test`. Expected: green (pre-existing failures, if any, verified against merge-base per the pre-existing-failures rule before attribution).
- [ ] **Step 4: Probe parity.** Run: `pnpm tsx docs/superpowers/specs/probes/2026-08-15-storage-asset-integrity-probe.ts`. Expected: P1 now prints `manifestTargetExists: true` (the loser retains) — record the new transcript in the PR body as the before/after evidence. P2's GC section still shows survivors (the probe wires no `listChildren` — its GC run exercises the pre-existing sweep only; the NEW stage's coverage lives in `tests/sync/diagramGc.test.ts`).
- [ ] **Step 5: Commit any residue and push.** `git add -A && git commit -m "chore(sync): closeout gates for storage-asset-integrity" --allow-empty && git push`

<!-- tasks: end -->

## Self-review (run at plan time — record here)

- Spec coverage: §2 → Task 1; §3 → Task 2; §4 → Tasks 3-4; §5 route summary → Task 4; §6 shapes → Tasks 1-4 test blocks (each §6 bullet has a named case); §7/L6 signal → Task 3 counter + Task 4 summary. No spec requirement without a task.
- Registry count reconciliation: N/A — no registry-bearing meta-suite gains or loses rows (declared in Global Constraints with reasons).
- Type consistency: `lockedSnapshotRevisionId` (Tasks 1), `removePrefix` (Task 2), `PENDING_ORPHAN_MIN_AGE_MS` / `listPendingTempPrefixes` / `listChildren` / both counters (Tasks 3-4) — names identical across producer and consumer tasks.
- **Plan-time dry-run (executed, then reverted — this worktree ships spec+plan only):** every task's snippets were applied to the live tree and the full red/green cycle run. Results: Task 1 RED = 4 failing cases (3 keeps + the `lockedSnapshotRevisionId` field case) on unmodified lib, GREEN = 20/20 with the diff; Task 2 RED = one case failing (`premise not met: the catch attempted the prefix removal`), GREEN = 11/11; Task 3 GREEN = 13/13; Task 4 GREEN = 33/33 across `tests/cron/cronRouteSummaries.test.ts` + `tests/api/cron-sync.test.ts`; `pnpm typecheck` clean; `pnpm exec eslint` clean over all five lib/app files + four test files; probe re-run with the diff prints `PROBE P1 manifestTargetExists: true` (the Task 5 Step 4 expectation). The snippets in this plan are verbatim what ran.
- Pre-existing-assertion check (run at plan time): `grep -n "removed" tests/sync/assetRecovery.test.ts` → exactly TWO assertion sites today in `tests/sync/assetRecovery.test.ts`, both `expect(removed).toEqual(uploads.map((upload) => upload.path))` lines: one in the drift test (stays, still correct) and one in the no_op test (pins the defect; Task 1 Step 1 deletes that test and replaces it with the same-revision keep case). `tests/sync/diagramGc.test.ts` asserts named result fields (`result.orphanBlobsDeleted` etc.), never whole-object equality on the result — additive counters are safe (grep for `toEqual({` in that file → 0 hits).
