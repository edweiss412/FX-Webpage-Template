# Snapshot promotion validates required names, not counts

**Date:** 2026-08-10 · **Branch:** `fix/promote-identity-validation` · **Closes:** `BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES` (BACKLOG.md)
**Class:** CORRECTNESS (sync pipeline; no UI surface) · **Effort:** S

## 1.1 Resolved scope — do not relitigate

- **The extras policy is ratified by the user, 2026-08-10 (decision round): EXACT SET.** When every required name is present but unexpected objects also exist under the temp prefix, promotion FAILS loudly (typed outcome + telemetry naming the extras) rather than tolerating or GC-ing them. The alternative (tolerate + log) was declined. Do not re-argue toward tolerance.
- **The rollback story is the existing machinery, unchanged.** `promoteSnapshot` already rolls back part-done moves (`renamed.toReversed()` move-back loop) and clears the claim (`clearRolledBack`) on `manifest_mismatch`; this arc changes DETECTION (names instead of counts), not the rollback/cutover mechanics, the advisory-lock topology (`withShowLock` remains the single holder), or the claim protocol.
- **The `manifest_mismatch` outcome value is retained.** It is an internal result discriminant, not a §12.4 user-visible code; renaming it would churn every consumer for no behavior gain. It gains structured fields (§4.3).
- **The SQL-as-exported-text pattern is retained.** `EXPECTED_ASSET_COUNT_SQL`'s doc comment records why the SQL text is exported and evaluated against real Postgres in the realdb suite (the mocked seam cannot test SQL semantics); the replacement names query follows the identical pattern for the identical reason.
- No UI surface; **impeccable gate N/A**.

## 2. Problem (probed at filing, `BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES`)

`promoteSnapshot` computes how many objects the pending manifest describes (`EXPECTED_ASSET_COUNT_SQL`, `lib/sync/promoteSnapshot.ts:63`) and compares that NUMBER to the temp listing's length (`lib/sync/promoteSnapshot.ts:301`) and, post-move, to the canonical listing's length (`lib/sync/promoteSnapshot.ts:321`). It never checks that each required basename is PRESENT. The filing's probe: `countCheckPasses: true` with `missingExpected: ["embedded-a.png@256.webp"]` — a missing required object plus an unrelated object of equal count passes both checks, moves to canonical, and cuts over a manifest pointing at bytes that are not there. Duplicate-basename manifests produce the same class.

## 4. Design

### 4.1 Required-name set

Replace the count query with `EXPECTED_ASSET_NAMES_SQL` (same exported-text pattern, same `$1::uuid` show parameter): for every pending `embeddedImages` and `linkedFolderItems` entry with a non-null `snapshotPath`, emit two DISCRIMINATED row kinds (R5 F1 — provenance must survive the query, because a malformed bare `snapshotPath` is otherwise indistinguishable from a legitimate slash-less variant key): `kind='original'` rows carrying the **FULL `snapshotPath`**, and `kind='variant'` rows carrying the variant `key`. Path binding applies to EVERY `original` row (a bare, slash-less `snapshotPath` is `mispathed` by definition — its dirname cannot equal the canonical prefix); `variant` rows are basenames by construction and take no path check (variant keys ARE storage basenames by construction: `` `${input.assetKey}@${width}.webp` ``, `lib/sync/diagramVariants.ts:79`). **Both JSON legs keep the count query's malformed-`variants` guard verbatim** — `case when jsonb_typeof(…->'variants') = 'array' then … else '[]'::jsonb end` (`lib/sync/promoteSnapshot.ts:67`) — so a non-array `variants` contributes zero names instead of throwing before the typed mismatch signal can be produced (R1 F5); the realdb suite keeps its malformed-variants row, repointed at the names query. The query returns one row per name (`select … as name`). The live transaction seam exposes only `queryOne`, and the tx that reaches the comparison is COMPOSED (R2 F1, probed): `withPromoteLock` builds it via `postgresTxAdapter` (`lib/sync/lockedPromoteTx.ts:26`), `promoteSnapshot` passes it as `options.tx` (`lib/sync/promoteSnapshot.ts:384`), and `withShowLock` uses it AS-IS when `options.tx` exists (`lib/sync/lockedShowTx.ts:93`). So the `queryRows<T>(sql, params): Promise<T[]>` member is added to **`LockablePromoteTx`** (`lib/sync/lockedPromoteTx.ts:5`) and its `postgresTxAdapter` (`lib/sync/lockedPromoteTx.ts:26`) — NOT to the shared `LockableSyncTx` (R3 F1, inventory completed R4 F2: widening the shared interface would force `queryRows` onto every production implementer — `AssetRecoveryPostgresTx` at `lib/sync/assetRecovery.ts:708`, `PostgresPipelineTx` at `lib/sync/runScheduledCronSync.ts:758`, `PostgresOnboardingScanTx` at `lib/sync/runOnboardingScan.ts:398`, `lockedShowTx`'s own adapter at `lib/sync/lockedShowTx.ts:48`, and `PostgresUnpublishTx` via the `UnpublishShowTx` intersection at `lib/sync/unpublishShow.ts:25` and `lib/sync/unpublishShow.ts:76` — none of which needs it). `withShowLock` is generic (`T extends LockableSyncTx`, `lib/sync/lockedShowTx.ts:88`), so the callback statically sees the widened `LockablePromoteTx` when `options.tx` carries it, and the names query is read through `tx.queryRows` inside the comparison. The realdb suite exercises the COMPOSED path (`withPromoteLock` → `withShowLock` → `queryRows`), so a missing implementation fails the suite.

The count query is DELETED, not kept alongside — two sources of "what the manifest requires" is the drift this arc exists to kill. The realdb suite that today evaluates the count SQL against Postgres (`tests/sync/promoteSnapshotExpectedCount.realdb.test.ts`) is repointed at the names SQL, asserting the returned name LIST WITH MULTIPLICITIES (sorted-array equality, not set equality — R2 F2: AC-3's duplicate detection requires the SQL to return `["a.png","a.png"]` distinguishably), including the variants, the null-`snapshotPath` exclusion, and a seeded duplicate-basename manifest yielding the repeated row.

### 4.2 Path binding, then set comparison, at both checkpoints

**Path binding (R4 F1, probe-demonstrated):** before any listing comparison, every returned `snapshotPath`'s dirname must equal the pending revision's canonical prefix (`canonicalPrefix(show_id, snapshot_revision_id)`) — the live asset route requires the complete path to match the canonical show/revision path (`app/api/asset/diagram/[show]/[rev]/[key]/route.ts:149`, `app/api/asset/diagram/[show]/[rev]/[key]/route.ts:263`, variants reconstructed from `dirname(snapshotPath)` at `app/api/asset/diagram/[show]/[rev]/[key]/route.ts:172`), so a stale-revision `snapshotPath` would pass a basename-only check, cut over, and 410 at serve time. A mispathed entry fails promotion with its own delta class (`mispathed`, bounded like the others). Then, at both existing checkpoints (temp listing pre-move, canonical listing post-move), compare basenames as **multisets against the required set**, computing three further deltas:

- `missing` — required names absent from the listing;
- `extra` — listed names not required (exact-set policy: these FAIL promotion);
- `duplicated` — required names appearing more than once in the REQUIRED set itself (two manifest entries claiming one basename). A storage listing cannot duplicate a path, so a duplicated requirement is unsatisfiable-as-a-set and fails as its own named class rather than masquerading as `missing`.

Any non-empty delta → the existing failure path exactly as today: rollback (post-move case), `clearRolledBack`, return `manifest_mismatch`. Count equality is implied by set equality and is not separately checked.

### 4.3 Result fields + telemetry

The `manifest_mismatch` variant of the result union (`lib/sync/promoteSnapshot.ts:29` region) gains an OPTIONAL `deltas?: { missing: string[], extra: string[], duplicated: string[], mispathed: string[], truncated: boolean }`, each list **bounded to 10 names** — diagnostics, not a dump. It is present on the THREE comparison-derived branches — the path-binding failure (`mispathed` populated) and the two set-comparison checkpoints (R5 F2); the function's two OTHER `manifest_mismatch` returns — rollback-failure (`lib/sync/promoteSnapshot.ts:378`, which already raises `emitRollbackStuckAlert`) and the lock-skipped branch (`lib/sync/promoteSnapshot.ts:386`) — carry no `deltas`, because no comparison ran there (R1 F3). **There is NO existing fulfilled-outcome emit — all three production callers discard resolved mismatches (R1 F1, probed: the cron path `lib/sync/runScheduledCronSync.ts:2917` and GC path `lib/sync/diagramGc.ts:415` ignore the result; the admin route logs only THROWN errors, `app/api/admin/staged/[fileId]/apply/route.ts:190`; `lib/sync/promoteSnapshot.ts:395` acts only on `promoted`).** This arc therefore ADDS the emit inside `promoteSnapshotUpload` itself: after the transaction resolves, POST-COMMIT and outside the advisory lock, a `manifest_mismatch` outcome with `deltas` (any of the three comparison-derived branches, including `mispathed`) produces one `log.warn` carrying a durable `code: "SNAPSHOT_PROMOTE_MANIFEST_MISMATCH"` field plus the bounded deltas and `snapshotRevisionId` — satisfying invariant 10's code-carrying-emit requirement for this non-admin surface at the one place every caller shares. Basenames derive from embedded object IDs and Drive file IDs (`lib/sync/snapshotAssets.ts:210`, `lib/sync/snapshotAssets.ts:244`) — identifiers this pipeline already logs, not secrets and not user content (R1 F6 corrected: they are NOT content hashes).

## 5. Tier × domain completeness matrix

| layer | action |
| --- | --- |
| Table DDL / CHECKs | N/A — no schema change; the SQL reads existing `shows.diagrams` JSONB |
| RPC read path | `EXPECTED_ASSET_COUNT_SQL` → `EXPECTED_ASSET_NAMES_SQL`; `LockablePromoteTx` gains `queryRows` (§4.1 — the shared `LockableSyncTx` is untouched) |
| RPC write path / triggers / cleanup | N/A — move/cutover/rollback/GC untouched; `lib/sync/diagramGc.ts:415` invokes `promoteSnapshotUpload` and ignores the result, which is fine because the §4.3 emit lives INSIDE `promoteSnapshotUpload` |
| Advisory lock | unchanged single holder (`withShowLock`, `lib/sync/promoteSnapshot.ts:291`) |
| Frontend | N/A — no UI reads these fields |
| Telemetry | NEW post-commit `log.warn` with `code: "SNAPSHOT_PROMOTE_MANIFEST_MISMATCH"` + bounded deltas inside `promoteSnapshotUpload` (§4.3 — no fulfilled-outcome emit existed) |
| Tests | §6 |

## 6. Verification

- **Unit (mocked seam, red first):** equal-count-wrong-name fixture — the filing's exact probe shape (`missingExpected: ["embedded-a.png@256.webp"]` with an unrelated equal-count extra) — currently PASSES promotion (red), fails it after (green) with `missing` and `extra` both populated; all-required-plus-extra fixture fails with only `extra` (the ratified exact-set behavior); duplicated-requirement fixture fails with `duplicated`; exact match promotes. Anti-tautology: expected names derived from the fixture manifest, never copied from implementation output; the assertion reads the returned deltas, not just the outcome discriminant.
- **Rollback behavior:** the post-move mismatch case asserts every moved object is moved back (existing suite pattern, `tests/sync/promoteSnapshot.test.ts`) — now reachable via a name mismatch that only manifests post-move (an extra appearing in the canonical listing).
- **Realdb:** names SQL evaluated against seeded Postgres per §4.1.
- **Bound check:** an 11-name delta records 10 + `truncated: true`.
- **Telemetry behavior (R1 F1):** a sink-spy on the logger asserts the `SNAPSHOT_PROMOTE_MANIFEST_MISMATCH` warn fires exactly once per deltas-carrying outcome (path-binding failures included), AFTER the transaction resolves (ordering asserted against the tx seam), with the bounded deltas — and does NOT fire on rollback-failure or lock-skipped mismatches (those carry no deltas; rollback-failure keeps its own alert).

## 7. Documented limits

- The exact-set failure blocks THIS revision's cutover and surfaces the defect loudly (the ratified trade). Probed mechanics (R2 F3): `clearRolledBack` nulls pending and resets the claim (`lib/sync/promoteSnapshot.ts:235`); an UNCHANGED file does not re-sync (watermark skip, `lib/sync/perFileProcessor.ts:337`); a sync that does proceed stages under FRESH revision/prefix UUIDs (`lib/sync/snapshotAssets.ts:188`), so the old stray never touches a later promotion, and `diagramGc` eventually claims and removes the detached old prefix (`lib/sync/diagramGc.ts:193`). No operator cleanup is required to unblock future revisions; the exact-set check protects each promotion attempt's own prefix. Behavior parity with today's count-mismatch failure path throughout.
- Names, not bytes: promotion still does not hash content. A required name with wrong bytes passes, exactly as today — out of scope (a content-integrity arc would need its own manifest field and its own filing).
- The temp-prefix orphan classes already filed (`BL-` rows on storage GC) are unchanged by this arc.

## 8. Acceptance criteria

- **AC-1:** The filing's probe shape (equal count, missing required name) fails promotion with the missing name reported.
- **AC-2:** All-required-plus-extras fails promotion (exact set) with extras named; exact match promotes.
- **AC-3:** Duplicated requirements fail as `duplicated`, not `missing`; a stale-revision `snapshotPath` (the R4 probe shape: right basename, wrong revision dirname) fails as `mispathed` BEFORE any listing comparison.
- **AC-4:** Count SQL is gone; realdb suite pins the names SQL; no second requirement source exists.
- **AC-5:** `BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES` graduates; marker off in the PR's last commit (invariant 12).

impeccable-gate: N/A — no UI surface
