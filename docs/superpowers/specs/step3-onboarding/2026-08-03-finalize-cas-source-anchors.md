# Spec: Carry source anchors through the existing-show shadow so finalize-cas refreshes them

**Backlog entry:** `BL-ONBOARDING-CAS-SOURCE-ANCHORS` — in the open queue while this ships, then graduated to the archive with the branch. Cited by id, not by line: the entry moves, so a line anchor here would be dead on `main` the day this merges.
**Predecessor:** `docs/superpowers/specs/step3-onboarding/2026-07-01-step3-persist-source-anchors.md` — persist-at-scan; its §7 matrix (line 159) declared the existing-show branches out of scope. This spec closes exactly that row.
**Status:** draft for adversarial review
**Effort:** S. No migration, no new error code, no UI surface.

---

## 1. Problem

`shows.source_anchors` drives the "In sheet" deep links — the map from a parser region id to a `SourceAnchor` — `{title, gid, a1}` (`lib/sheet-links/buildSheetDeepLink.ts:3`). A show with no anchor for a region falls back to the deterministic whole-sheet `#gid=0`. So does an anchor whose `title` is outside `SOURCE_LINK_ALLOWLIST` or whose `gid` is not a number — those two predicates are the entire guard (`lib/sheet-links/buildSheetDeepLink.ts:22`). Nothing else is checked: `a1` is appended whenever truthy, and a non-finite `gid` is a number. Anything that passes those two predicates produces a link, correct or not. §4.1 enumerates what that leaves uncovered.

Anchors are computed once per sheet at scan time and persisted on the staged row (`lib/sync/runOnboardingScan.ts:1332` computes, `lib/sync/runOnboardingScan.ts:797` threads them into the Phase-1 staging upsert, `lib/sync/runOnboardingScan.ts:576` writes `pending_syncs.source_anchors`). This is done for **every** scanned sheet, first-seen or already-live — the column is unconditional (`supabase/migrations/20260701000001_pending_syncs_source_anchors.sql:9`).

The Step-3 finalize reads that column under the generation-scoped show lock and coerces it best-effort (`app/api/admin/onboarding/finalize/route.ts:985` selects it, `app/api/admin/onboarding/finalize/route.ts:1041` coerces it into the `sourceAnchors` local). The coercion happens **before** the first-seen / existing-show branch split, so both branches have the value in hand.

Only one branch uses it:

- **First-seen (Flow A)** spreads it into the apply core — `app/api/admin/onboarding/finalize/route.ts:1280`.
- **Existing-show (Flow B)** drops it. `stageExistingShowShadow` (`app/api/admin/onboarding/finalize/route.ts:602`) writes a shadow payload that carries `parse_result`, `staged_modified_time`, `staged_id`, `reviewer_choices`, `triggered_review_items`, `base_modified_time`, `pull_sheet_override`, `pull_sheet_override_applied`, and `use_raw_decisions` — but not the anchors. `deleteApprovedPending` (`app/api/admin/onboarding/finalize/route.ts:689`) then consumes the `pending_syncs` row in the same Phase-B transaction, so by Phase D the value no longer exists anywhere. `applyShadow` (`app/api/admin/onboarding/finalize-cas/route.ts:410`) builds its `applyStagedCore` args (`app/api/admin/onboarding/finalize-cas/route.ts:546`) with no `sourceAnchors` key.

Consequence: a re-onboarded existing show keeps whatever anchors the last sync-pipeline pass left (§5 — cron, push or manual), even when the operator just re-scanned the sheet and the wizard holds fresher ones. Impact is bounded: a show that never had anchors links safely at `#gid=0`, and the shared per-file sync pipeline (§5) is the other writer that can refresh them — which is why this was filed as backlog rather than deferred. A show that HAS older anchors is the stale-range case in §4.1; this change makes it rarer and does not claim to eliminate it, and §4.1 is explicit that no recovery bound exists.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Phase D performs no Drive I/O.** The backlog entry's wording ("compute anchors pre-lock in `finalize-cas`’s apply path") predates the 2026-07-01 persist-at-scan rewrite and is stale. Phase D is SQL-only. Anchors reach it by riding the shadow payload, never by an XLSX export. | `app/api/admin/onboarding/finalize-cas/route.ts:384`; predecessor spec §6 |
| **The payload is the only available channel.** Re-reading `pending_syncs` at Phase D is not an alternative: Phase B deletes the row immediately after staging, so the read returns zero rows by construction. | `deleteApprovedPending` at `app/api/admin/onboarding/finalize/route.ts:689`, called at `app/api/admin/onboarding/finalize/route.ts:1150`; the same reasoning already forced `use_raw_decisions` into the payload (`app/api/admin/onboarding/finalize/route.ts:613-617`) |
| **Anchors parse tolerantly, not fail-closed.** Absent, null, non-object, or corrupt → `{}`, never a refusal. They are cosmetic deep links; the fields around them in the same parser (`parse_result`, `triggered_review_items`, `base_modified_time`) are fail-closed because they gate correctness of the apply itself. | Mirrors the first-seen posture at `app/api/admin/onboarding/finalize/route.ts:1038-1046`; `use_raw_decisions` sets the tolerant-field precedent at `lib/onboarding/shadowPayload.ts:272-274` |
| **No per-entry validation of the anchor map.** Values are passed through as the cron and first-seen paths already do. The only producer in the system is `extractSourceAnchors`, which emits `{title, gid, a1}` with a numeric gid and a string a1, so a malformed entry requires out-of-band corruption of the jsonb column. The read boundary would not catch one (§4.1) — accepted, and unchanged by this spec, which adds no producer. | `lib/sheet-links/buildSheetDeepLink.ts:22`; first-seen does no element validation either (`app/api/admin/onboarding/finalize/route.ts:1043`) |
| **Never pass a defined `{}` to the apply core.** The `applyShowSnapshot` UPDATE arm is `source_anchors = coalesce($18::jsonb, source_anchors)`, so a defined empty object durably wipes good anchors; an omitted key preserves them. | `lib/sync/runScheduledCronSync.ts:1527`; the contract is already stated at `lib/sync/applyStagedCore.ts:437-443` and honored at `app/api/admin/onboarding/finalize/route.ts:1280` |
| **No migration, no new `§12.4` code, no UI surface.** Both columns already exist and the failure mode has no user-visible error state — a missing anchor is a fallback link, not an error. | `supabase/migrations/20260622000000_add_source_anchors.sql:5`, `supabase/migrations/20260701000001_pending_syncs_source_anchors.sql:9` |

---

## 2. Goal

An existing-show re-onboard writes the anchors from the scan the operator reviewed onto `shows.source_anchors` at Phase-D apply, exactly as the first-seen flow already does — and never wipes existing anchors when the scan could not compute any.

---

## 3. Design overview

Three edits along one channel; every downstream layer already exists.

```
pending_syncs.source_anchors        (already written at scan — runOnboardingScan.ts:576)
  │  read + best-effort coerce      (already — finalize/route.ts:985, :1041)
  ▼
[1] shadow payload 'source_anchors' (NEW — stageExistingShowShadow, finalize/route.ts:626-686)
  ▼
shows_pending_changes.payload       (existing jsonb column, no DDL change)
  ▼
[2] parsed.sourceAnchors            (NEW — shadowPayload.ts parseShadowPayloadForApply)
  ▼
[3] applyStagedCore({sourceAnchors}) (NEW spread — finalize-cas/route.ts:546)
  ▼
runPhase2 → applyShowSnapshot       (already — phase2.ts:436/:516, applyStagedCore.ts:443)
  ▼
shows.source_anchors = coalesce($18::jsonb, source_anchors)   (already — runScheduledCronSync.ts:1527)
```

### 3.1 Edit 1 — Phase B writes the key

`stageExistingShowShadow` takes a new required parameter `sourceAnchors: Record<string, SourceAnchor>` and adds one member to its `jsonb_build_object`:

```
'source_anchors', $14::jsonb
```

bound to the raw object (postgres.js serializes; never `JSON.stringify` — the double-encode trap already documented at `lib/sync/runScheduledCronSync.ts:1427`). The call site (`app/api/admin/onboarding/finalize/route.ts:1140`) passes the `sourceAnchors` local already computed at `app/api/admin/onboarding/finalize/route.ts:1041`.

The parameter is required, not optional: an omitted argument is exactly the silent-drop bug being fixed, and the type system should refuse it. The value may legitimately be `{}` — that is the "scan computed nothing" case, and it is handled at Edit 3, not here.

### 3.2 Edit 2 — Phase D parses the key

`ParsedShadowPayloadForApply`'s `ok: true` arm gains `sourceAnchors: Record<string, SourceAnchor>`, always present, `{}` when unavailable. `parseShadowPayloadForApply` (`lib/onboarding/shadowPayload.ts:153`) resolves it through `coerceJsonbObject` (`lib/db/coerceJsonbObject.ts:61`) inside a bare `try`/`catch` returning `{}` — the same three lines as the first-seen coercion at `app/api/admin/onboarding/finalize/route.ts:1042-1046`. The parser's no-throw contract (`lib/onboarding/shadowPayload.ts:26-28`) is preserved: the catch is unconditional.

This field is tolerant by design (§1.1). It sits with `use_raw_decisions` in the parser's tolerant group, not with the fail-closed fields.

### 3.3 Edit 3 — Phase D forwards it

`applyShadow`'s `applyStagedCore` call (`app/api/admin/onboarding/finalize-cas/route.ts:546`) gains:

```ts
...(Object.keys(parsed.sourceAnchors).length > 0 ? { sourceAnchors: parsed.sourceAnchors } : {}),
```

Byte-for-byte the same guard as Flow A (`app/api/admin/onboarding/finalize/route.ts:1280`), for the same reason (§1.1, wipe protection).

---

## 4. Guard conditions — every input state

| `pending_syncs.source_anchors` at Phase B | Payload value | `parsed.sourceAnchors` | Passed to core | `shows.source_anchors` after apply |
| --- | --- | --- | --- | --- |
| Populated map | the map | the map | yes | replaced with the map |
| `'{}'` (column default; scan computed none) | `{}` | `{}` | omitted | unchanged (coalesce preserves) |
| Corrupt jsonb scalar | coerced to `{}` at `app/api/admin/onboarding/finalize/route.ts:1041`, so `{}` | `{}` | omitted | unchanged |
| Key absent from payload (legacy shadow staged before this change) | absent | `{}` | omitted | unchanged — a pre-existing shadow applies exactly as it does today |
| Payload value is JSON `null` | `null` | `{}` | omitted | unchanged |
| Payload value is an array or a scalar | that value | `{}` | omitted | unchanged |
| Payload value is a legacy double-encoded JSON string of an object | that string | decoded map | yes | replaced with the decoded map |
| Map present but an individual entry is malformed | the map | the map | yes | stored as-is. Falls back to `#gid=0` only if the entry's `title` is not allowlisted or its `gid` is not a number; otherwise it produces a link (§4.1). No producer emits such an entry |

No row in this table is ever WIPED — a value that cannot be used omits the arg, and the coalesce keeps what is stored. That is the only guarantee this change makes. It is not a guarantee of correctness: rows 1, 7 and 8 replace the stored map with whatever the payload holds, and rows 2 through 6 keep a map that may already be wrong. §4.1 is the single place that states what is and is not guaranteed; every other section defers to it rather than restating it.

### 4.1 Documented limits

**What this change guarantees, in full:** an existing-show re-onboard whose scan produced a
non-empty anchor map writes that map to `shows.source_anchors`; every other case leaves the stored
map untouched. Nothing here guarantees the stored map is CURRENT. Two limits follow, and neither is
introduced by this change.

**Limit 1 — a preserved map can predate the applied revision.** The wizard scan yields `{}` for four
distinct reasons, and — unlike the sync pipeline — it cannot tell them apart. `pending_syncs.source_anchors`
is `NOT NULL DEFAULT '{}'` (`supabase/migrations/20260701000001_pending_syncs_source_anchors.sql:9`)
and `lib/sync/runOnboardingScan.ts:1332` collapses all four causes into that one value:

| Cause | Character | Site | What the SYNC pipeline does with it |
| --- | --- | --- | --- |
| The tab-gid fetch failed | fault, transient | `lib/sync/runOnboardingScan.ts:1353` | preserves — this is the ONE case it emits `undefined` for (`lib/sync/runScheduledCronSync.ts:3073`) |
| The XLSX bytes are absent | fault, transient | the `if (bytes)` guard at `lib/sync/runOnboardingScan.ts:1336` leaves the initialized `{}` in place | clears — a defined `{}` reaches the coalesce |
| `extractSourceAnchors` threw | fault, NOT transient if the workbook shape is what defeats it | `lib/sync/runOnboardingScan.ts:1348` | N/A — the sync pipeline does not catch it there |
| Extraction SUCCEEDED and recognized no region | not a fault at all | `lib/drive/sourceAnchors.ts:188`; per-region omission on a successful extraction is pinned at `tests/drive/sourceAnchors.test.ts:37` and `tests/drive/sourceAnchors.test.ts:43`, and a workbook where every region omits yields the whole-map `{}` | clears — a defined `{}` reaches the coalesce |

**Flow B therefore diverges from the sync pipeline, deliberately.** Where a sync pass would CLEAR
the map on rows 2 and 4 (defined `{}` at `lib/sync/runScheduledCronSync.ts:3073`, forwarded at
`lib/sync/runScheduledCronSync.ts:3598`, overwriting through the coalesce at
`lib/sync/runScheduledCronSync.ts:1527`), Flow B preserves it. That is not an oversight: the sync
pipeline can afford to clear because it distinguishes the transient sheets-list failure from the
rest, and Flow B cannot — the staged column has already flattened all four into `{}` by the time
finalize reads it. Clearing on that ambiguous value would wipe good anchors on every transient Drive
hiccup during a re-onboard. Preserving is the conservative read of an ambiguous signal, and the
consequence is stated plainly: after a re-onboard whose scan came back empty, the show keeps its old
anchors, which may describe an older revision.

When that happens, the apply advances `shows.last_seen_modified_time` while the coalesce keeps the
previous map (`lib/sync/runScheduledCronSync.ts:1524` and `lib/sync/runScheduledCronSync.ts:1527`).
If rows moved between the two revisions, the retained anchor is still structurally valid —
allowlisted title, numeric gid — so `lib/sheet-links/buildSheetDeepLink.ts:22` accepts it and the
"In sheet" link opens the old range rather than falling back to `#gid=0`.

**There is no recovery bound, and this spec does not claim one.** Recovery requires a later run of
some anchor writer (§5) that either produces a non-empty map or clears the stale one. Which runs
happen is not a function of edits alone: an automatic pass at or below the watermark skips
(`lib/sync/perFileProcessor.ts:337`), while a manual re-sync bypasses the watermark check entirely
(`lib/sync/perFileProcessor.ts:276`) and the recovery and role-vocab-drift branches proceed at or
below it (`lib/sync/perFileProcessor.ts:322`, `lib/sync/perFileProcessor.ts:341`). So an edit is
neither necessary nor sufficient, and no run is guaranteed. A sync pass over a workbook whose
regions were renamed DOES resolve the stale link — by clearing to `{}`, which falls back to
`#gid=0` — but nothing schedules that pass. Wherever an earlier draft of this spec said stale
anchors are "repopulated on the next sheet edit" or "covered by the cron refresh," this paragraph is
what it should have said.

The preserve-on-ambiguity posture is the shipped system's, not this change's. Flow A already behaves
this way (`app/api/admin/onboarding/finalize/route.ts:1280`), and the sync pipeline takes it for the
one cause it can identify (`lib/sync/runScheduledCronSync.ts:3073`, and the audit idx12/idx63 comment
above it). Flow B today writes no anchors at all, so before this change EVERY existing-show
re-onboard left the stored anchors untouched; after it, the re-onboards whose scan produced a
non-empty map refresh them.

**Limit 2 — the read boundary validates two fields, not the entry.**
`lib/sheet-links/buildSheetDeepLink.ts:22` checks `isAllowed(anchor.title)` and
`typeof anchor.gid === "number"`, then appends `a1` whenever it is truthy. An entry such as
`{title: "AGENDA", gid: 7, a1: {bad: true}}` passes and yields `&range=%5Bobject%20Object%5D`; a
`gid` of `NaN` is a number and yields `#gid=NaN`. No producer emits either shape —
`extractSourceAnchors` is the only writer of the map and it emits a numeric gid and a string a1 —
so reaching this state requires the jsonb column to be corrupted out of band. This spec adds no
producer and no validation (§1.1), so the exposure is unchanged; it is stated here because §4's
guard table would otherwise imply a fallback that does not exist.

**Not covered by the §7 tests, deliberately.** The wipe-guard case asserts `PRIOR` survives an empty
scan; it therefore passes in exactly the state described above and cannot distinguish "correctly
preserved" from "stale but preserved." No test at this layer can: the staleness is a property of the
sheet's revision history, not of the apply. Detecting limit 1 needs a revision stamp stored alongside the
anchors, which is filed as `BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH` and is out of scope here.

---

## 5. Write-path × read-path matrix

| Path | Writes `shows.source_anchors`? | Status after this change |
| --- | --- | --- |
| The shared per-file sync pipeline — `processOneFile` (`lib/sync/runScheduledCronSync.ts:2691`), computing at `lib/sync/runScheduledCronSync.ts:3073`, forwarding at `lib/sync/runScheduledCronSync.ts:3598`, persisting at `lib/sync/runScheduledCronSync.ts:1499` and `lib/sync/runScheduledCronSync.ts:1527`. ONE path, five invocation modes: cron (`lib/sync/runScheduledCronSync.ts:3778`), push (`lib/sync/runPushSyncForShow.ts:294`), manual (`lib/sync/runManualSyncForShow.ts:304`), plus the recovery and drift-rescue branches | Yes (INSERT + UPDATE arms) | Unchanged |
| Wizard first-seen finalize, Flow A (`app/api/admin/onboarding/finalize/route.ts:1280`) | Yes | Unchanged |
| Wizard existing-show re-onboard, Flow B (`app/api/admin/onboarding/finalize-cas/route.ts:546`) | No | **Yes — this spec** |
| Wizard existing-show UNCHECKED (spec §7.4 D10 no-op, `app/api/admin/onboarding/finalize/route.ts:1178`) | No | Unchanged — no shadow is staged, the live show is deliberately untouched |
| Live dashboard staged-apply (`lib/sync/applyStaged.ts`) | No | Unchanged — out of scope; that path never carried anchors, and the cron path remains its only writer (§4.1 bounds what that does and does not guarantee) |
| Validation backfill script (`scripts/backfill-validation-source-anchors.ts:77`) | Yes, under its own `pg_advisory_xact_lock` (`scripts/backfill-validation-source-anchors.ts:75`) | Unchanged — an operator-run one-shot, not a request path; it skips writing when extraction produces zero anchors, so it cannot wipe either |

### 5.1 How that matrix was derived

Run, not described (the sweep discipline in `docs/agents/writing-plans.md`). Every writer was taken
from the output rather than from recall, after three review rounds in which recalled inventories
were wrong:

```
$ grep -rn "source_anchors" --include='*.ts' app lib scripts | grep -v pending_syncs
```

Writing hits, in full: `lib/sync/runScheduledCronSync.ts:1499` and `lib/sync/runScheduledCronSync.ts:1527` (UPDATE arms),
`lib/sync/runScheduledCronSync.ts:1565` (first-seen INSERT), and
`scripts/backfill-validation-source-anchors.ts:78`. The remaining hits are readers or fixtures:
`app/api/admin/onboarding/finalize/route.ts:972`, `app/api/admin/onboarding/finalize/route.ts:985` and `app/api/admin/onboarding/finalize/route.ts:1043` (the Phase-B read this spec threads),
`lib/sync/runOnboardingScan.ts:547` and `lib/sync/runOnboardingScan.ts:576` (the `pending_syncs` staging write, a different column),
`lib/data/getShowForViewer.ts:861` (the crew-page reader), and `lib/dev/publishedModalFixture.ts:93`
(a dev fixture).

The three cron-sync writing hits are all inside `PostgresPipelineTx.applyShowSnapshot`
(`lib/sync/runScheduledCronSync.ts:1353`), whose only caller is `runPhase2`
(`lib/sync/phase2.ts:424`) — which is why the matrix has one pipeline row with five invocation modes
rather than five rows.

## 6. Layer completeness matrix

| Layer | Action |
| --- | --- |
| Table DDL | N/A — `shows.source_anchors` and `pending_syncs.source_anchors` both exist |
| Migration | N/A — no schema change, so no validation-project apply and no `schema-manifest` regen |
| Inline CHECK / enum | N/A — no constraint touches these columns |
| RPC read/write path | N/A — this path is postgres.js transactions, not a SECURITY DEFINER RPC |
| Advisory lock (invariant 2) | No new holder. The Phase-B payload write runs inside `defaultWithRowTx`'s existing per-show lock; the Phase-D apply runs under `adoptShowLockHeld` (`app/api/admin/onboarding/finalize-cas/route.ts:502`), which asserts, never acquires |
| Supabase call boundary (invariant 9) | N/A — no Supabase client call is added |
| Mutation-surface telemetry (invariant 10) | N/A — no new route, action, or mutation surface; both routes already carry their registered emits |
| `§12.4` catalog | N/A — no new code; anchors have no user-visible error state |
| UI | N/A — no file under `app/` outside `app/api/**`, none under `components/` |
| Tests | §7 |

---

## 7. Test plan (TDD, per task)

Each task is failing test → minimal implementation → passing test → commit.

**Task 1 — payload parse boundary.** Extend `tests/onboarding/shadowPayload.test.ts`: a populated map surfaces on `parsed.sourceAnchors`; absent key, JSON `null`, an array, a scalar, and a corrupt value each yield `{}` with `ok: true` (never a refusal — this is the discriminating assertion against a fail-closed implementation); a legacy double-encoded string of an object decodes.

**Task 2 — Phase B writes the key.** Extend the existing Phase-B coverage so the staged shadow payload carries `source_anchors` equal to the anchors on the locked `pending_syncs` row. Asserted against the payload actually written, not against the argument passed in.

**Task 3 — Phase D forwards, and the wipe guard.** A new real-DB test file named finalizeCasSourceAnchors, with the repo's real-DB suffix, alongside its siblings in the onboarding test directory. Modeled on `tests/onboarding/finalizeReadsSourceAnchors.db.test.ts` (first-seen analogue) and `tests/onboarding/finalizeCasFullApply.db.test.ts` (Flow B harness):

- **Refresh case:** seed a live show with anchors `PRIOR`, stage a re-onboard whose `pending_syncs.source_anchors` is `FRESH` (`FRESH ≠ PRIOR`, and both derived from the fixture, not hardcoded to the expectation), run Phase B then Phase D, assert `shows.source_anchors` equals `FRESH`.
- **Wipe guard:** same fixture with `pending_syncs.source_anchors = '{}'`, assert `shows.source_anchors` still equals `PRIOR` after a successful apply. This is the case that fails loudly if the implementation drops the `Object.keys(...)` guard.
- Drive export functions are `vi.mock`'d to throw, as in `tests/onboarding/finalizeReadsSourceAnchors.db.test.ts:16-30`, pinning that Phase D remains Drive-free.

**Anti-tautology note.** Task 3 asserts on the `shows` row read back from Postgres after the apply, not on the args object handed to the core — a test that asserted the latter would pass against an implementation whose plumbing is broken downstream. `FRESH` and `PRIOR` are distinct fixtures so neither case can pass by coincidence, and the wipe-guard case is the negative control for the refresh case. What the wipe guard cannot prove is stated in §4.1.

---

## 8. Invariants preserved

1. **TDD per task** — §7.
2. **Advisory lock, single holder** — no new acquisition; §6.
3. **Email canonicalization** — untouched.
4. **No global sync cursor** — untouched; anchors travel per-show.
5. **No raw error codes in UI** — no new code; no user-visible surface.
6. **Commit per task** — `feat(onboarding):` / `test(onboarding):`.
7. **Spec is canonical** — this spec supersedes exactly one thing outside itself: the backlog entry's prescription to "compute anchors **pre-lock** in `finalize-cas`'s apply path", quoted here so the claim survives the entry being rewritten at graduation. §1.1 records why it is stale.
8. **UI quality gate** — N/A, no UI surface.
9. **Supabase call boundary** — no new call site.
10. **Mutation-surface observability** — no new surface.

---

## 9. Numeric sweep

| Literal | Where it comes from |
| --- | --- |
| 3 edits | §3.1, §3.2, §3.3 — three, and §7 has three tasks covering them |
| `$14` | the 14th bind parameter of `stageExistingShowShadow`, which binds 13 today (`app/api/admin/onboarding/finalize/route.ts:671-685`) |
| `$18` | the `source_anchors` bind in the `applyShowSnapshot` UPDATE arm (`lib/sync/runScheduledCronSync.ts:1527`) |
| 8 guard rows | §4 enumerates every representable payload state: populated, empty, corrupt-upstream, absent, null, array-or-scalar, legacy string, malformed entry |
| 6 matrix rows, 4 of which write | §5 — the shared sync pipeline (one path, five invocation modes), Flow A, Flow B, and the validation backfill script write; the D10 no-op and the live dashboard staged-apply do not. Derived from the sweep below, not from recall |

---

## 10. Out of scope

- **Backfilling existing shows.** No backfill job. A stale show is corrected only by a later anchor-writer run over its sheet — refreshed if that run produces a non-empty map, cleared to `#gid=0` if it produces an empty one — and §4.1 is explicit that no such run is guaranteed.
- **The live dashboard staged-apply path** (`lib/sync/applyStaged.ts`). It has never carried anchors; adding them there is a separate change with its own review. Those shows keep the shared sync pipeline as their only anchor writer, subject to §4.1.
- **Per-entry anchor validation** anywhere in the system (§1.1).
- **The `#gid=0` fallback behavior** (`lib/sheet-links/buildSheetDeepLink.ts:22`) — unchanged. It is what makes a show with NO anchors link safely; it is not what makes a stale or malformed anchor safe, and §4.1 says so.
