# Spec: Carry source anchors through the existing-show shadow so finalize-cas refreshes them

**Backlog entry:** `BL-ONBOARDING-CAS-SOURCE-ANCHORS` (`BACKLOG.md:847`)
**Predecessor:** `docs/superpowers/specs/step3-onboarding/2026-07-01-step3-persist-source-anchors.md` — persist-at-scan; its §7 matrix (line 159) declared the existing-show branches out of scope. This spec closes exactly that row.
**Status:** draft for adversarial review
**Effort:** S. No migration, no new error code, no UI surface.

---

## 1. Problem

`shows.source_anchors` drives the "In sheet" deep links — the map from a parser region id to a `SourceAnchor` — `{title, gid, a1}` (`lib/sheet-links/buildSheetDeepLink.ts:3`). A show with no anchor for a region, or one whose stored anchor is structurally unusable, gets the deterministic whole-sheet fallback `#gid=0`, guarded by `isAllowed(anchor.title)` (`lib/sheet-links/buildSheetDeepLink.ts:22`). That guard is structural only: an anchor that is well-formed but describes an older revision of the sheet passes it and produces a link to a stale range. See §4.1.

Anchors are computed once per sheet at scan time and persisted on the staged row (`lib/sync/runOnboardingScan.ts:1332` computes, `lib/sync/runOnboardingScan.ts:797` threads them into the Phase-1 staging upsert, `lib/sync/runOnboardingScan.ts:576` writes `pending_syncs.source_anchors`). This is done for **every** scanned sheet, first-seen or already-live — the column is unconditional (`supabase/migrations/20260701000001_pending_syncs_source_anchors.sql:9`).

The Step-3 finalize reads that column under the generation-scoped show lock and coerces it best-effort (`app/api/admin/onboarding/finalize/route.ts:985` selects it, `app/api/admin/onboarding/finalize/route.ts:1041` coerces it into the `sourceAnchors` local). The coercion happens **before** the first-seen / existing-show branch split, so both branches have the value in hand.

Only one branch uses it:

- **First-seen (Flow A)** spreads it into the apply core — `app/api/admin/onboarding/finalize/route.ts:1280`.
- **Existing-show (Flow B)** drops it. `stageExistingShowShadow` (`app/api/admin/onboarding/finalize/route.ts:602`) writes a shadow payload that carries `parse_result`, `staged_modified_time`, `staged_id`, `reviewer_choices`, `triggered_review_items`, `base_modified_time`, `pull_sheet_override`, `pull_sheet_override_applied`, and `use_raw_decisions` — but not the anchors. `deleteApprovedPending` (`app/api/admin/onboarding/finalize/route.ts:689`) then consumes the `pending_syncs` row in the same Phase-B transaction, so by Phase D the value no longer exists anywhere. `applyShadow` (`app/api/admin/onboarding/finalize-cas/route.ts:410`) builds its `applyStagedCore` args (`app/api/admin/onboarding/finalize-cas/route.ts:546`) with no `sourceAnchors` key.

Consequence: a re-onboarded existing show keeps whatever anchors the last cron sync left, even when the operator just re-scanned the sheet and the wizard holds fresher ones. Impact is bounded — the cron path repopulates on the next sheet edit (`lib/sync/runScheduledCronSync.ts:1527`), and a show that never had anchors links safely at `#gid=0` meanwhile — which is why this was filed as backlog rather than deferred. A show that HAS older anchors is the stale-range case in §4.1, which this change makes no worse and does not claim to fix.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| **Phase D performs no Drive I/O.** The backlog entry's wording ("compute anchors pre-lock in `finalize-cas`’s apply path") predates the 2026-07-01 persist-at-scan rewrite and is stale. Phase D is SQL-only. Anchors reach it by riding the shadow payload, never by an XLSX export. | `app/api/admin/onboarding/finalize-cas/route.ts:384`; predecessor spec §6 |
| **The payload is the only available channel.** Re-reading `pending_syncs` at Phase D is not an alternative: Phase B deletes the row immediately after staging, so the read returns zero rows by construction. | `deleteApprovedPending` at `app/api/admin/onboarding/finalize/route.ts:689`, called at `app/api/admin/onboarding/finalize/route.ts:1150`; the same reasoning already forced `use_raw_decisions` into the payload (`app/api/admin/onboarding/finalize/route.ts:613-617`) |
| **Anchors parse tolerantly, not fail-closed.** Absent, null, non-object, or corrupt → `{}`, never a refusal. They are cosmetic deep links; the fields around them in the same parser (`parse_result`, `triggered_review_items`, `base_modified_time`) are fail-closed because they gate correctness of the apply itself. | Mirrors the first-seen posture at `app/api/admin/onboarding/finalize/route.ts:1038-1046`; `use_raw_decisions` sets the tolerant-field precedent at `lib/onboarding/shadowPayload.ts:272-274` |
| **No per-entry validation of the anchor map.** Values are passed through as the cron and first-seen paths already do. The read boundary guards every deref and degrades to `#gid=0`. | `lib/sheet-links/buildSheetDeepLink.ts:22`; first-seen does no element validation either (`app/api/admin/onboarding/finalize/route.ts:1043`) |
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
| Map present but an individual entry is malformed | the map | the map | yes | stored as-is; the read boundary falls back to `#gid=0` for that entry (`lib/sheet-links/buildSheetDeepLink.ts:22`) |

Every degraded row lands on "unchanged," never on "wiped." The change can only replace anchors with the freshly scanned ones or leave the prior ones alone. "Unchanged" is the conservative outcome, not an unconditionally safe one — §4.1 states exactly what it does not cover.

### 4.1 Documented limits

**Preserved anchors can predate the applied revision.** When the scan's tab-gid fetch fails,
`lib/sync/runOnboardingScan.ts:1350` yields `{}` and the scan continues; the apply then advances
`shows.last_seen_modified_time` while the coalesce keeps the previous anchor map
(`lib/sync/runScheduledCronSync.ts:1524` and `lib/sync/runScheduledCronSync.ts:1527`). If rows
moved between the two revisions, the retained anchor is still structurally valid — allowlisted
title, numeric gid — so `lib/sheet-links/buildSheetDeepLink.ts:22` accepts it and the "In sheet"
link opens the old range rather than falling back to `#gid=0`. It self-corrects on the next
successful sync of that sheet.

This is the shipped system's ratified posture, not something this change introduces. The cron path
deliberately emits `undefined` rather than `{}` on a genuine sheets-list failure precisely so the
coalesce preserves the stored anchors (`lib/sync/runScheduledCronSync.ts:3073`, and the audit
idx12/idx63 comment above it). Flow A already behaves this way
(`app/api/admin/onboarding/finalize/route.ts:1280`). Flow B today writes no anchors at all, so
before this change every existing-show re-onboard was permanently in the "retained older anchors"
state; after it, the retained-anchor window shrinks to transient-failure scans only.

The alternative — forwarding a defined `{}` so a failed scan clears the map — trades a stale range
for a guaranteed loss of every good anchor on every transient Drive hiccup, on shows whose sheets
did not change. That is why preserve-over-wipe is the ratified choice at all three call sites, and
this spec does not reopen it.

**Not covered by the §7 tests, deliberately.** The wipe-guard case asserts `PRIOR` survives an empty
scan; it therefore passes in exactly the state described above and cannot distinguish "correctly
preserved" from "stale but preserved." No test at this layer can: the staleness is a property of the
sheet's revision history, not of the apply. Detecting it needs a revision stamp stored alongside the
anchors, which is filed as `BL-SOURCE-ANCHORS-STALE-AFTER-FAILED-GID-FETCH` and is out of scope here.

---

## 5. Write-path × read-path matrix

| Path | Writes `shows.source_anchors`? | Status after this change |
| --- | --- | --- |
| Cron scheduled sync (`lib/sync/runScheduledCronSync.ts:1499` and `lib/sync/runScheduledCronSync.ts:1527`) | Yes (INSERT + UPDATE arms) | Unchanged |
| Wizard first-seen finalize, Flow A (`app/api/admin/onboarding/finalize/route.ts:1280`) | Yes | Unchanged |
| Wizard existing-show re-onboard, Flow B (`app/api/admin/onboarding/finalize-cas/route.ts:546`) | No | **Yes — this spec** |
| Wizard existing-show UNCHECKED (spec §7.4 D10 no-op, `app/api/admin/onboarding/finalize/route.ts:1178`) | No | Unchanged — no shadow is staged, the live show is deliberately untouched |
| Live dashboard staged-apply (`lib/sync/applyStaged.ts`) | No | Unchanged — out of scope; that path never carried anchors and the cron refresh covers it |
| Validation backfill script (`scripts/backfill-validation-source-anchors.ts:77`) | Yes, under its own `pg_advisory_xact_lock` (`scripts/backfill-validation-source-anchors.ts:75`) | Unchanged — an operator-run one-shot, not a request path; it skips writing when extraction produces zero anchors, so it cannot wipe either |

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
7. **Spec is canonical** — this spec supersedes only the stale mechanism wording in `BACKLOG.md:853`, and says so in §1.1.
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
| 6 write paths | §5 — cron, Flow A, Flow B, D10 no-op, live staged-apply, validation backfill script |

---

## 10. Out of scope

- **Backfilling existing shows.** Shows whose anchors are stale today are refreshed by the next cron sync of their sheet. No backfill job.
- **The live dashboard staged-apply path** (`lib/sync/applyStaged.ts`). It has never carried anchors; adding them there is a separate change with its own review, and the cron path already covers those shows.
- **Per-entry anchor validation** anywhere in the system (§1.1).
- **The `#gid=0` fallback behavior** (`lib/sheet-links/buildSheetDeepLink.ts:22`) — unchanged, and it is what makes every degraded row in §4 safe.
