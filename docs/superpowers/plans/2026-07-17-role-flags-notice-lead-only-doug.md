# ROLE_FLAGS_NOTICE capability-narrow + audience reclassify — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Narrow the `ROLE_FLAGS_NOTICE` bell alert to capability changes (LEAD ∪ FINANCIALS), reclassify it `audience: health → doug` (dismissible, accent tone, sheet deep-link), add identifiable per-member change-log rows for role changes, and broaden the durable `LEAD_ROLE_APPLIED` event to all capability changes — without weakening any audit.

**Architecture:** All changes are in `lib/sync`, `lib/log`, `lib/messages`, `tests`, and `docs` — **no UI files** (`components/`, `app/`) are modified; the bell's new behavior is entirely catalog-derived (proven by a component render test). The producer gains a capability predicate + a three-arm roster diff (change / add / remove); the durable event filter broadens; a new tx-scoped writer emits identifiable change-log rows; the catalog row is reclassified in a §12.4 three-way lockstep.

**Tech Stack:** TypeScript, Vitest, Next.js 16, Supabase/Postgres (postgres.js), pnpm.

**Reference:** The spec `docs/superpowers/specs/2026-07-17-role-flags-notice-lead-only-doug.md` is the exhaustive detail source — its §2.0–§2.5 (fix), §4 (reconciliation), §6 (guards), §7 (test matrix), §8 (do-not-relitigate) are cited per task. Read the cited spec section before each task.

## Global Constraints (verbatim from spec + AGENTS.md)

- **Capability set:** `isCapabilityFlag(f) = f === "LEAD" || f === "FINANCIALS"`. Only these two gate financials (`lib/visibility/scopeTiles.ts:141`). Scope-tile flags (A1/A2/V1/L1/BO/SHOP/…) get a change-log row but NO bell/event.
- **Invariant 5:** no raw error/invariant codes in `summary`/`change_kind` (role tokens like `A1` are domain data, allowed).
- **Invariant 9:** every Supabase/`persistAppEventStrict` call destructures `{ ok, error }` / `{ data, error }`; failures surface loudly.
- **Invariant 10:** telemetry emits are post-commit outside the lock. (The new change-log WRITE is inside the lock via `port`, like `writeAutoApplyChanges` — it is a feed write, not a post-commit emit; no invariant-10 interaction.)
- **§12.4 lockstep:** any §12.4 catalog-row copy edit lands three updates in ONE commit — master spec §12.4 prose + `pnpm gen:spec-codes` regen + `lib/messages/catalog.ts` row. Enforced by `tests/messages/codes.test.ts` (x1) + `tests/cross-cutting/codes.test.ts`. **NEVER run prettier on the master spec.**
- **Commit per task**, conventional-commits (`feat(sync):`, `test(sync):`, `docs(spec):`, `feat(db)`/`refactor(...)`). One task per commit.
- **`entity_ref = null`** on every role `field_changed` row (supersession safety — `cleanup_superseded_before_images` `20260608000003_undo_change_rpc.sql:323-352` matches older undoable rows by `entity_ref` without restricting the newer row's kind).

## Meta-test inventory (declared per AGENTS.md)

- **EXTENDS** `tests/messages/_metaAlertAudienceContract.test.ts` — move `ROLE_FLAGS_NOTICE` from `NOTICE` (health) to `DOUG`; update partition counts (currently `19 doug + 26 health = 45; 16 degraded + 10 notice` → **`20 doug + 25 health = 45; 16 degraded + 9 notice`**). (Task 5)
- **RECONCILES** `tests/messages/_metaAdminAlertCatalog.test.ts` — `ROLE_FLAGS_NOTICE` rows (`:130` producer pattern, `:475` class `event-manual`, `:618` severity `info`) stay UNCHANGED; confirm still green. (Task 5)
- **EXTENDS** x1 parity (`tests/messages/codes.test.ts`) + `tests/cross-cutting/codes.test.ts` — after the `helpfulContext` copy edit + `gen:spec-codes`. (Task 5)
- **VERIFY-UNCHANGED** `tests/sync/_metaLeadRoleAppliedTopology.test.ts` — co-emit topology is unchanged (the new change-log write is not a roleFlagsNotice emit). Run it; must stay green. (Task 3)
- **CREATES** `tests/sync/roleChangeLogCoverageParity.test.ts` — pins change-log-writer row set == producer arm (a) minus capability filter. (Task 3)
- **Advisory-lock topology:** N/A — no `pg_advisory*` is touched; the change-log write rides the existing `runPhase2` locked tx via `port`, acquiring no new lock.

---

### Task 1: Capability predicate helpers + producer three-arm narrowing

**Files:**
- Modify: `lib/sync/phase2.ts` (`hasLead` `:241`; `roleFlagChangesForNotice` `:250-296`; caller `:547`; comment `:245-249`)
- Test: `tests/sync/phase2.test.ts` (existing `roleFlagsNotice` block)

**Interfaces:**
- Produces: `isCapabilityFlag(f: RoleFlag | string): boolean`, `capabilityDelta(prior: readonly string[], next: readonly string[]): boolean`, and `capabilityRoleChangesForNotice(previousCrewMembers, nextCrewMembers, identityLinkRenames)` returning `Array<{ crew_name; prior_flags: string[]; new_flags: string[] }>` (unchanged shape; renamed from `roleFlagChangesForNotice`). The returned array is what `RoleFlagsNotice.context.changes` (`phase2.ts:153`) carries.

Read spec §2.0 (capability model) + §2.1 (three-arm table) + §6 (guards) before starting.

- [ ] **Step 1: Write failing tests** in `tests/sync/phase2.test.ts` — add these cases to the `roleFlagsNotice` block (derive expected from fixture flags, anti-tautology per spec §7):
  - scope-tile-only `["A1"] → ["V1"]` and `["A1"] → ["A1","BO"]` → **no** `roleFlagsNotice`.
  - capability `["A1"] → ["A1","LEAD"]` (LEAD gain), `["LEAD","A1"] → ["A1"]` (LEAD loss), `[] → ["FINANCIALS"]` (FIN gain), `["FINANCIALS"] → []` (FIN loss), mixed `["A1"] → ["V1","FINANCIALS"]` → **notice IS** produced with correct `context.changes`.
  - identical set `["LEAD"] → ["LEAD"]` → no notice.
  - new-crew: `+FINANCIALS` new member and `+LEAD` new member → notice (`prior_flags: []`); new member with only `["A1"]` → no notice.
  - removed-member: a `["LEAD"]` member and a `["FINANCIALS"]` member REMOVED (in `previousCrewMembers`, absent from `nextCrewMembers`), `identityLinkRenames=[]` → notice each (`prior → []`); a removed `["A1"]`-only member → no notice.
  - **arm-(c) exclusion:** `identityLinkRenames=[{removedName:"Old",addedName:"New"}]`, `previousCrewMembers=[{name:"Old",role_flags:["LEAD","A1"]}]`, `nextCrewMembers=[{name:"New",role_flags:["LEAD","A1"]}]` → **no** notice (renamed, unchanged capability; arm (c) must exclude `Old`, arm (a) sees no delta via the rename map).

- [ ] **Step 2: Run tests, verify they fail** — `pnpm vitest run tests/sync/phase2.test.ts -t roleFlagsNotice` → FAIL (capability/FINANCIALS/removed cases not yet handled).

- [ ] **Step 3: Implement** in `lib/sync/phase2.ts`:
  - Add near `hasLead` (`:241`):
    ```ts
    const CAPABILITY_FLAGS = ["LEAD", "FINANCIALS"] as const;
    function isCapabilityFlag(f: string): boolean {
      return f === "LEAD" || f === "FINANCIALS";
    }
    function capabilityDelta(prior: readonly string[], next: readonly string[]): boolean {
      return CAPABILITY_FLAGS.some((f) => prior.includes(f) !== next.includes(f));
    }
    ```
  - Rename `roleFlagChangesForNotice` → `capabilityRoleChangesForNotice`; update the `:245-249` comment to describe the capability (LEAD ∪ FINANCIALS) three-arm model.
  - Existing-crew push (`:287-292`): after the `roleFlagsEqual` skip, add `if (!capabilityDelta(priorMember.role_flags, nextMember.role_flags)) continue;` (arm a).
  - New-crew branch (`:278`): change `if (hasLead(nextMember.role_flags))` → `if (nextMember.role_flags.some(isCapabilityFlag))` (arm b).
  - **Add arm (c)** after the `nextCrewMembers` loop: build `const nextByName = new Set(nextCrewMembers.map((m) => m.name));` and `const renamedAway = new Set(identityLinkRenames.map((r) => r.removedName));`, then:
    ```ts
    for (const prev of previousCrewMembers ?? []) {
      if (nextByName.has(prev.name)) continue;          // still present → not a removal
      if (renamedAway.has(prev.name)) continue;         // identity-link renamed → arm (a) handles it; NOT a loss
      if (!prev.role_flags.some(isCapabilityFlag)) continue; // scope-tile-only removal → no notice
      changes.push({ crew_name: prev.name, prior_flags: [...prev.role_flags], new_flags: [] });
    }
    ```
  - Update the caller at `:547` to the new name.

- [ ] **Step 4: Run tests, verify pass** — `pnpm vitest run tests/sync/phase2.test.ts -t roleFlagsNotice` → PASS. Then typecheck: `pnpm tsc --noEmit` (or `pnpm typecheck`).

- [ ] **Step 5: Commit** — `git add lib/sync/phase2.ts tests/sync/phase2.test.ts && git commit --no-verify -m "feat(sync): narrow ROLE_FLAGS_NOTICE producer to capability changes (LEAD ∪ FINANCIALS) + removed-member arm"`

---

### Task 2: Broaden the durable event to capability changes + per-flag payload

**Files:**
- Modify: `lib/log/emitLeadRoleApplied.ts` (`hasLead` `:28`; filter `:39`; context `:52`; error path `:59-62`)
- Test: `tests/log/emitLeadRoleApplied.test.ts`

**Interfaces:**
- Consumes: `RoleFlagsNotice` (unchanged). Produces: `app_events` rows `code:"LEAD_ROLE_APPLIED"` whose `context` = `{ crew_name, prior_flags, new_flags, capability_changes: Array<{flag:"LEAD"|"FINANCIALS", direction:"gained"|"lost"}> }` (replaces the scalar `direction`).

Read spec §2.1 durable-event paragraph + §7 durable-event test bullet.

- [ ] **Step 1: Write failing tests** in `tests/log/emitLeadRoleApplied.test.ts`:
  - `[] → ["FINANCIALS"]` emits `LEAD_ROLE_APPLIED` with `capability_changes: [{flag:"FINANCIALS",direction:"gained"}]`.
  - scope-tile-only `["A1"] → ["V1"]` change in the notice → emits **nothing**.
  - compound `["LEAD"] → ["FINANCIALS"]` → ONE event, `capability_changes` contains BOTH `{LEAD,lost}` and `{FINANCIALS,gained}` (assert as a set, order-insensitive).
  - `[] → ["LEAD","FINANCIALS"]` → both `gained`.
  - existing LEAD gain `["A1"] → ["A1","LEAD"]` → `[{flag:"LEAD",direction:"gained"}]` (regression: existing behavior preserved, now array-shaped).

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/log/emitLeadRoleApplied.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `lib/log/emitLeadRoleApplied.ts`:
  - Add `const CAPABILITY_FLAGS = ["LEAD","FINANCIALS"] as const;` and reuse/define a local `capabilityDelta`.
  - Replace the filter at `:39` `if (hasLead(change.prior_flags) === hasLead(change.new_flags)) continue;` with `if (!capabilityDelta(change.prior_flags, change.new_flags)) continue;`.
  - Replace the scalar `direction` derivation with:
    ```ts
    const capability_changes = CAPABILITY_FLAGS
      .filter((f) => change.prior_flags.includes(f) !== change.new_flags.includes(f))
      .map((f) => ({ flag: f, direction: change.new_flags.includes(f) ? "gained" as const : "lost" as const }));
    ```
  - `context`: replace `direction` with `capability_changes` (keep `crew_name`, `prior_flags`, `new_flags`). Update the failure-escalation `log.error` (`:57-62`) to log `capability_changes` instead of `direction`.
  - Generalize the doc-comment (`:7-24`) to "capability role applied (LEAD or FINANCIALS)".
  - Keep `persistAppEventStrict` + the `{ ok, error }` destructure + loud failure escalation (invariant 9) UNCHANGED.

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/log/emitLeadRoleApplied.test.ts` → PASS. `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(log): broaden LEAD_ROLE_APPLIED to capability changes; per-flag capability_changes payload"`

---

### Task 3: Identifiable role change-log rows (shared runPhase2 writer)

**Files:**
- Create: `lib/sync/changeLog/writeRoleChangeLogRows.ts`
- Modify: `lib/sync/phase2.ts` (call the writer in `runPhase2` near the `roleFlagChanges` computation `:547`, inside the locked tx via `port`); remove the `MI-9` arm from `lib/sync/changeLog/writeAutoApplyChanges.ts:142-160` (keep `MI-8`/`8b`/`8c`).
- Test: `tests/sync/roleChangeLog.test.ts` (new); `tests/sync/roleChangeLogCoverageParity.test.ts` (new); extend `tests/sync/runScheduledCronSync.test.ts` + `tests/sync/applyStaged.test.ts` (DB-path assertions).

**Interfaces:**
- Consumes: `port` (HoldPort), `showId`, `driveFileId`, `previousCrewMembers`, `appliedCrewMembers`, `identityLinkRenames`.
- Produces: `writeRoleChangeLogRows(port, showId, driveFileId, previousCrewMembers, appliedCrewMembers, identityLinkRenames, occurredAt?): Promise<void>` — inserts one `show_change_log` row per has-a-prior member whose `role_flags` changed (rename-resolved), `change_kind:'field_changed'`, `source:'auto_apply'`, `entity_ref: null`, `before_image=after_image=null`, `summary` naming the member + `fmt(prior) → fmt(next)`.

Read spec §2.4 (writer + coverage principle + supersession safety + held-fold + rename) + §2.5 (staged) + §7 (change-log tests) before starting.

- [ ] **Step 1: Write failing tests** — `tests/sync/roleChangeLog.test.ts` (unit, against a fake `port` capturing inserts):
  - scope-tile change `["A1"] → ["V1"]` (has-prior) → ONE row: `change_kind==="field_changed"`, `source==="auto_apply"`, `entity_ref===null`, `before_image===null`, `summary` contains the member name AND `A1` AND `V1`.
  - held-fold: a member whose flags fold on the retained OLD name (present in both lists) → row written (writer has NO held-skip).
  - applied rename (`identityLinkRenames=[{removedName:"Old",addedName:"New"}]`, `Old:["A1"]` → `New:["V1"]`) → ONE row, `summary` names `New`, `entity_ref===null`.
  - no-op `["A1"] → ["A1"]` → NO row.
  - new crew (`!prior`) → NO role row; removed member → NO role row (roster, not a change).
  - `fmt([])` renders `none`.
  - **MI-9 no-double-emit (spec §7):** in `tests/sync/roleChangeLog.test.ts` (or the DB-path test), a LEAD role change on a has-a-prior member → exactly ONE identifiable role row (summary names the member + LEAD) AND assert the anonymous `"A field changed on this sync"` `field_changed` row is NOT emitted (the MI-9 arm was removed from `writeAutoApplyChanges`). A co-occurring MI-8 financial change still emits its own generic row (that arm is unchanged) — so assert exactly one anonymous row for the MI-8 change and one identifiable row for the LEAD change, never a duplicate for LEAD.
  - **Coverage-parity** (`tests/sync/roleChangeLogCoverageParity.test.ts`): over fixtures {scope-tile change, held-fold, applied-rename, new-crew, removed-capability, staged-shaped empty-identityLinkRenames}, assert the SET of member names the writer emits == the set an UNFILTERED `capabilityRoleChangesForNotice` arm (a) (existing-member diff, capability filter removed) would flag. Roster arms (b/c) excluded.
  - **Supersession regression** (DB test, `tests/sync/roleChangeLog.db.test.ts` or extend an existing DB test): sync 1 inserts a `crew_added` "Alice" row (undoable, before_image set); sync 2 writes a role row for Alice's `["A1"] → ["V1"]` and runs `cleanup_superseded_before_images($show)`; assert the older `crew_added` row is STILL `status='applied'` with `before_image` intact (null entity_ref triggered no supersession).

- [ ] **Step 1b: Write the failing DB-path (wiring) tests FIRST** (TDD invariant 1 — these exercise the `runPhase2` writer call, so they precede its implementation). Extend `tests/sync/runScheduledCronSync.test.ts` (cron auto-apply) and `tests/sync/applyStaged.test.ts` (staged) per spec §7: a scope-tile role change → identifiable row + no `ROLE_FLAGS_NOTICE`; a LEAD change → row + `LEAD_ROLE_APPLIED`; a FINANCIALS change → row + `ROLE_FLAGS_NOTICE` + `LEAD_ROLE_APPLIED`; held-fold FINANCIALS → all three; a staged remove+add of a capability holder → arm (c) loss event + arm (b) grant. Anti-tautology: derive expected member/flags from the fixture.

- [ ] **Step 2: Run, verify all fail** — `pnpm vitest run tests/sync/roleChangeLog.test.ts tests/sync/roleChangeLogCoverageParity.test.ts` AND the extended `tests/sync/runScheduledCronSync.test.ts` / `tests/sync/applyStaged.test.ts` cases → FAIL (writer + `runPhase2` wiring not yet present).

- [ ] **Step 3: Implement** `lib/sync/changeLog/writeRoleChangeLogRows.ts` per spec §2.4 pseudocode:
  ```ts
  function roleFlagsSetEqual(a, b) { /* sorted-join compare, local (avoid phase2 import cycle) */ }
  function fmt(flags) { return flags.length ? [...flags].sort().join(", ") : "none"; }
  export async function writeRoleChangeLogRows(port, showId, driveFileId, previousCrewMembers, appliedCrewMembers, identityLinkRenames, occurredAt) {
    const prevByName = new Map(previousCrewMembers.map((m) => [m.name, m]));
    const priorNameForAdded = new Map(identityLinkRenames.map((r) => [r.addedName, r.removedName]));
    const occ = occurredAt ?? new Date().toISOString(); // optional param defaulted, exactly like writeAutoApplyChanges.ts:177 (tests pass an explicit occurredAt for determinism)
    for (const next of appliedCrewMembers) {
      const priorName = priorNameForAdded.get(next.name) ?? next.name;
      const prior = prevByName.get(priorName);
      if (!prior) continue;
      if (roleFlagsSetEqual(prior.role_flags, next.role_flags)) continue;
      await port.unsafe(
        `insert into public.show_change_log (show_id, drive_file_id, occurred_at, source, change_kind, entity_ref, summary, before_image, after_image, status, created_by)
         values ($1,$2,$3::timestamptz,'auto_apply','field_changed',null,$4,null::jsonb,null::jsonb,'applied','system')`,
        [showId, driveFileId, occ, `Crew member ${next.name} role assignment changed: ${fmt(prior.role_flags)} → ${fmt(next.role_flags)}`],
      );
    }
  }
  ```
  (Add a `// not-subject-to-meta: service-role SQL inside the JS-held show lock (no {data,error} client)` comment on the `port.unsafe`, mirroring `writeAutoApplyChanges.ts:182`.)
  - In `lib/sync/phase2.ts` `runPhase2`, after `roleFlagChanges` is computed (`~:547`), add the call **guarded on `if (port)`** (port is `tx.holdPort?.()` — typed optional, `:440`; the writer's `port` param is a required `HoldPort`, so the guard narrows it) and NOT gated by `feedPolicy`, and **omitting `occurredAt`** (there is no `occurredAt` binding in `runPhase2`; the writer defaults it internally, exactly as the `writeAutoApplyChanges` call at `:491-511` omits it):
    ```ts
    if (port) {
      await callTx("writeRoleChangeLogRows", () =>
        writeRoleChangeLogRows(
          port,
          snapshot.showId,
          args.driveFileId,
          snapshot.previousCrewMembers ?? [],
          applyOutcome.appliedCrewMembers,
          args.identityLinkRenames ?? [],
        ),
      );
    }
    ```
    **Port availability (verified, load-bearing):** both real apply paths wire `holdPort` — cron (`runScheduledCronSync.ts:735`) and the staged/dashboard path (the locked `applyStaged` tx, `applyStaged.ts:1751`) — so `port` is DEFINED on every real apply path; the `if (port)` guard only no-ops for port-less test doubles / legacy raw txs. Critically, the capability AUDIT (notice + durable `LEAD_ROLE_APPLIED` event) is produced by `capabilityRoleChangesForNotice` (arms a/b/c, in-memory, returned to the tail callers and emitted post-commit) and does **NOT** depend on `port` — so a missing port drops only the Doug-visible change-log ROW, never the security-critical capability audit. The change-log row is Doug-visible sugar for role changes; the durable event is the audit of record. The writer's optional `occurredAt` defaults to `new Date().toISOString()` (mirrors `writeAutoApplyChanges.ts:177`); unit tests pass an explicit value for determinism.
  - In `lib/sync/changeLog/writeAutoApplyChanges.ts:142-152`, remove `|| i.invariant === "MI-9"` from the field_changed `hasInvariant` predicate (keep MI-8/8b/8c).

- [ ] **Step 4: Run, verify ALL pass** — `pnpm vitest run tests/sync/roleChangeLog.test.ts tests/sync/roleChangeLogCoverageParity.test.ts tests/sync/runScheduledCronSync.test.ts tests/sync/applyStaged.test.ts` → PASS (unit writer + DB-path wiring). Run the topology meta-test: `pnpm vitest run tests/sync/_metaLeadRoleAppliedTopology.test.ts` → PASS (unchanged). `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(sync): identifiable role change-log rows via shared runPhase2 writer; drop MI-9 arm from writeAutoApplyChanges"`

---

### Task 4: Grep-flip stale scope-tile no-notice tests + full sync-suite green

**Files:**
- Modify: any `tests/sync/**` / `tests/log/**` asserting a **scope-tile** role change emits `ROLE_FLAGS_NOTICE` (pre-#439 M6 behavior) — flip to assert no-notice. **Do NOT flip a FINANCIALS case.**

Read spec §7 last two bullets before starting.

- [ ] **Step 1: Grep** — `rg -n "ROLE_FLAGS_NOTICE" tests/sync tests/log tests/messages` and inspect each fixture's flags. For every test asserting a PURE scope-tile delta (A1→V1, +BO) emits the notice, flip it to assert no-notice. Verify each flipped fixture holds no `LEAD`/`FINANCIALS` transition (leave capability cases asserting notice).
- [ ] **Step 2: Run the affected files** → PASS.
- [ ] **Step 3: Commit** — `git commit --no-verify -m "test(sync): flip scope-tile role-change fixtures to no-notice (capability-only narrowing)"`

---

### Task 5: Audience reclassify + copy tighten + master-spec reconciliation (§12.4 lockstep, one commit)

**Files:**
- Modify: `lib/messages/catalog.ts` (`ROLE_FLAGS_NOTICE` `:866-883`)
- Modify: `tests/messages/_metaAlertAudienceContract.test.ts` (`:52` NOTICE→DOUG; `:71-76` counts)
- Modify (master spec, NEVER prettier): `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §6.8 MI-9 `:1624`, MI-10 `:1629`, §6.8.2 `:1713`, §12.4 `:2863`, help `:3157`
- Modify: `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md` amendment 8 `:163,:170`
- Modify: `docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md` — add a dated one-line amendment note at §3.2 (spec §2.2): "2026-07-17: `ROLE_FLAGS_NOTICE` moved `audience: health → doug` (dismissible operator nudge; see `2026-07-17-role-flags-notice-lead-only-doug.md`)". Do NOT reconcile the doc's stale `42` count (already stale vs the live meta-test; not CI-enforced).
- Regen: `lib/messages/__generated__/spec-codes.ts` via `pnpm gen:spec-codes`
- Test: `tests/messages/_metaAlertAudienceContract.test.ts`, `tests/messages/codes.test.ts` (x1), `tests/cross-cutting/codes.test.ts`, resolve-route + BellPanel render tests

Read spec §2.2 (reclassify cascade) + §2.3 (copy) + §4 (reconciliation, all 6 items + grep-verification) + §7 (resolve/tone/copy tests) before starting.

- [ ] **Step 1: Write failing tests:**
  - `_metaAlertAudienceContract.test.ts`: move `"ROLE_FLAGS_NOTICE"` from `NOTICE` to `DOUG`; change the count test to `expect(DOUG.length).toBe(20); expect(HEALTH.length).toBe(25); expect(DEGRADED.length).toBe(16); expect(NOTICE.length).toBe(9);`. (These now FAIL against the un-reclassified catalog.)
  - Resolve-route test (extend `tests/api/.../resolve` or add): seed a **show-scoped** `ROLE_FLAGS_NOTICE` `admin_alerts` row → the **show-scoped** resolve route (`/api/admin/show/[slug]/alerts/[id]/resolve`) returns **200**, NOT 403 `ALERT_HEALTH_RESOLVE_FORBIDDEN`; a still-health show-scoped code (e.g. `SYNC_STALLED`) still 403s; the GLOBAL route still returns its 400 scope-door for a show-scoped row.
  - BellPanel render test (`tests/components/admin/BellPanel*.test.tsx`): a `ROLE_FLAGS_NOTICE` bell entry carrying a `slug` renders the **Dismiss** button (`bell-resolve-*`) and NOT the telemetry link; `resolveUrl` targets `/api/admin/show/<slug>/alerts/<id>/resolve`; `data-tone` on `bell-sev-*` === `"info"` (accent), NOT `"critical"`.
  - Legacy-copy truthfulness: render `ROLE_FLAGS_NOTICE.dougFacing` against a non-LEAD `context.changes` (A1→V1) → does NOT assert an unconditional "gained or lost LEAD".

- [ ] **Step 2: Run, verify fail** — `pnpm vitest run tests/messages/_metaAlertAudienceContract.test.ts` (+ the resolve/render tests) → FAIL.

- [ ] **Step 3: Implement (ONE commit — §12.4 lockstep):**
  - `lib/messages/catalog.ts` ROLE_FLAGS_NOTICE: `audience: "doug"`; **remove** `healthWeight: "notice"` and `dougSummary`; keep `severity: "info"`, `resolution: "manual"`. Tighten `helpfulContext` to drop the "department swap (A1 → V1) / additive flag like BO" enumeration and frame as a **capability** change (LEAD or financial-data access) without asserting the specific row is LEAD (§2.3). `dougFacing` stays as-is (conditional/truthful).
  - Master spec + 00-overview: apply §4 items 1-6 (capability → alert+event, scope-tile → change-log row; CORRECT the false "LEAD is the only capability element" sentence in §6.8 MI-9 to name **LEAD and FINANCIALS**; de-example the help string). Edit the master spec by hand (NEVER prettier).
  - `docs/superpowers/specs/alerts/2026-07-04-alert-audience-split.md`: add the dated §3.2 amendment note (spec §2.2) recording the `health → doug` move; do NOT touch its stale `42` count.
  - `pnpm gen:spec-codes` → regen `lib/messages/__generated__/spec-codes.ts`.
  - `_metaAlertAudienceContract.test.ts`: apply the NOTICE→DOUG move + count updates from Step 1.

- [ ] **Step 4: Run, verify pass** — `pnpm vitest run tests/messages tests/cross-cutting/codes.test.ts` + the resolve/render tests → PASS. Then the **grep-verification** (§4) — check BOTH orderings AND the dept-swap example rows on the canonical surfaces (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` + `docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md`):
    ```bash
    rg -nE "non-LEAD.*ROLE_FLAGS_NOTICE|ROLE_FLAGS_NOTICE.*non-LEAD|AUTO-?APPLIES.*ROLE_FLAGS_NOTICE|ROLE_FLAGS_NOTICE.*(department|dept|scope|A1 → V1|→ V1|BO)|(department|dept|scope|A1 → V1|→ V1|additive).*ROLE_FLAGS_NOTICE" \
      docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md \
      docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/00-overview.md
    ```
    Manually inspect each hit: ZERO may assert that a scope-tile/department/non-capability change emits `ROLE_FLAGS_NOTICE`. Every §6.8/§6.8.2/§12.4/help dept-swap example must read "change-log row, no bell alert" (a mention of "department" NEAR ROLE_FLAGS_NOTICE is only OK if it explicitly says the dept change gets a change-log row, NOT the alert). (Historical docs 06-drive-sync.md / handoffs / doug-validation-questions.md / html-plans are NOT edited — §4 classifies them historical.)

- [ ] **Step 5: Commit** — `git commit --no-verify -m "feat(admin): reclassify ROLE_FLAGS_NOTICE audience health→doug + capability master-spec reconciliation (§12.4 lockstep)"`

---

### Task 6: BACKLOG entries + whole-diff verification

**Files:**
- Modify: `BACKLOG.md`

- [ ] **Step 1** — add two `BACKLOG.md` rows: (a) `BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT` — the `rowTone` `isHealth → critical` short-circuit (`BellPanel.tsx:129`) still renders OTHER notice-weight health codes red; fix to `DEGRADED_HEALTH_CODES.includes(code) ? "critical" : "notice"` (spec §5, deferred to keep this change non-UI); (b) `BL-STAGED-IDENTITYLINK-RENAME-IDENTITY` — the dashboard staged path applies identity-link renames as remove+add (R33-2); if identity-preservation on that path is ever wanted, thread `identityLinkRenames` (out of scope; capability AUDIT is already complete via arms b/c).
- [ ] **Step 2: Full suite + gates** — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test` all green. Grep for any removed test-ids / renamed symbols (`rg -rln "roleFlagChangesForNotice" tests lib` → 0). Confirm `tests/sync/_metaLeadRoleAppliedTopology.test.ts`, `tests/messages/_metaAdminAlertCatalog.test.ts`, x1 all green.
- [ ] **Step 3: Commit** — `git commit --no-verify -m "docs(backlog): file BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT + BL-STAGED-IDENTITYLINK-RENAME-IDENTITY"`

---

## Task order & dependencies

1 (producer) → 2 (event) → 3 (change-log writer, depends on 1's rename) → 4 (flip stale tests) → 5 (reclassify + reconciliation) → 6 (backlog + whole-diff). Tasks 1-3 are `lib/sync`/`lib/log`; 4-5 are tests/catalog/docs; 6 is close-out. No task touches `components/`/`app/` (non-UI milestone; no impeccable gate).

## Post-implementation (ship pipeline Stage 4)

Whole-diff cross-model review (Codex) → APPROVE; push; **real CI green**; `gh pr merge --merge`; fast-forward local `main`; verify `rev-list --left-right --count main...origin/main` == `0  0`.
