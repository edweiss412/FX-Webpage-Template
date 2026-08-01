# Archive/lifecycle race cluster — probe-informed design

**Date:** 2026-07-31 · **Branch:** `fix/archive-lifecycle-race-cluster` · **Status:** ratified for autonomous ship (owner-approved this session)

Closes three backlog items with one probe-informed change set:

- `BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE` (MEDIUM) — **refuted by probe**; reclassified, no race fix needed. A 6ms painted-frame residue is hardened (§5).
- `BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP` (LOW) — **confirmed by probe** (2× `SHOW_ARCHIVED`, one transition); fixed family-wide (§3–§4).
- `BL-ARCHIVE-ARMED-CONCURRENT-REFRESH` (LOW) — coverage restored via the realtime vector the popover backdrop cannot block (§6.4).

## §1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
| - | -------- | ------------ |
| 1 | Dedup fix covers the FULL lifecycle family (archive/unarchive/publish/unpublish), not archive alone | Owner selection "One spec, full family", this session; class-sweep rule (AGENTS.md "Class-sweep before patching") |
| 2 | The mid-pending swap race is REFUTED same-tab; no settlement latch, no pending-UI freeze ships. Option "A + settlement latch" was offered and declined | Probe Case A/A2/B (§2); owner selection "A: dedup + coverage + 6ms hardening" |
| 3 | Hardening is exactly one mechanism change: ShareHub §4 lifecycle-close effect `useEffect` → `useLayoutEffect` | Owner approval of design S3, this session |
| 4 | Revalidates stay gated on `ok`; ONLY `logAdminOutcome` gates on `performed`. A no-op's revalidate heals the stale tab's UI and stays | Design S2 approval |
| 5 | `performed` maps fail-closed: `data === true`. If the new APP runs before the migration lands (void RPC → `data:null`), a performed transition's emission is SUPPRESSED, never mis-attributed. The reverse ordering (migration first, old app) simply prolongs the pre-existing duplicate behavior until deploy — a status-quo window, not a regression (§7) | Design S2 approval; R1 finding 3 wording repair |
| 6 | No e2e duplicate-emission repro ships. Layered composition covers it: DB test (RPC returns `false` on no-op) + behavioral test (action suppresses on `false`). The e2e repro exists only as the probe (Case C, §2) | Design S4 approval; mocked-only-tautology is mitigated because the DB layer test runs against the real local DB |
| 7 | Probe script is NOT committed; timelines + script land in this spec (§2, Appendix) | Design S5 approval |
| 8 | `unarchive_show` needs NO migration — already `returns boolean` (`supabase/migrations/20260718000001_unarchive_show_apply_gate_free.sql`, `_unarchive_show_apply` returns `false` on no-op at the `if not v_archived then return false` line). Only the action-side emission gate is missing | Citation pass, this session |
| 9 | The DOM (not paint) still passes through the swapped state pre-close; a MutationObserver can see it. Accepted as a documented limit (§7) — the paint-level invariant is the shipped contract | Consequence-bound convergence rule (`docs/agents/spec-self-review.md`) |
| 10 | `SHOW_ARCHIVED` / `SHOW_UNARCHIVED_BY_ADMIN` / `SHOW_PUBLISHED` / `SHOW_UNPUBLISHED_BY_ADMIN` codes, sources, and `AUDITABLE_MUTATIONS` rows are UNCHANGED — only the emission condition narrows. No §12.4 edits, no catalog work, x1 untouched | S4 approval |

## §2 Probe data (settles every behavioral claim below)

Probe: 5-case Playwright suite (mobile-safari project, dev server :3117, local Supabase), 2026-07-31. Script in Appendix A. Recorder = MutationObserver logging DOM-state transitions with `performance.now()` timestamps.

**Case A — forced race (archive action POST response held 3000ms at proxy after server fully processed):**

```
5246ms  confirm:armed | resting:absent | unarchive:absent | popover:open
5251ms  CLICK:confirm
5287ms  confirm:busy  | resting:absent | unarchive:absent | popover:open
5592ms  PROXY:action-response-arrived   (server done: RPC committed, broadcast published)
8596ms  PROXY:action-response-released  (3s hold; ZERO state changes during hold)
8611ms  confirm:gone  | resting:present | unarchive:absent | popover:open   (settle)
9124ms  confirm:gone  | resting:absent  | unarchive:ENABLED | popover:closed-6ms-later
9130ms  popover:closed
```

Finding: the same-tab realtime-driven `router.refresh()` does NOT commit archived props while the form is pending — Next's app-router action queue serializes refresh behind the in-flight action. The swap lands only post-settle; the §4 lifecycle-close effect (`components/admin/showpage/ShareHub.tsx`, `prevLifecycleRef` effect) closes the popover **6ms** (one commit) after the swap paints.

**Case A2 — same, tapping Unarchive the instant it appears:** `CLICK:unarchive-not-clickable` — Playwright actionability could not click the 6ms window. Final DB state correct (`archived=true`), single `SHOW_ARCHIVED`.

**Case B — natural timing, 8 unforced runs:** 8/8 `settled first`. No natural race.

**Case C — stale-tab repeat archive (tab B's realtime disabled via subscriber-token abort, tab A archives, stale tab B confirms):**

```
after tab-A archive:        [SHOW_ARCHIVED @ 21:18:10]
after stale tab-B archive:  [SHOW_ARCHIVED @ 21:18:10, SHOW_ARCHIVED @ 21:18:11]   ← DUPLICATE
```

The filed dedup defect is real: `archive_show`'s under-lock no-op (`supabase/migrations/20260601000000_b2_show_lifecycle.sql`, `if v_archived then return`) returns void, `archiveShowAction` treats it as committed success and re-emits.

**Case D — cross-tab, armed-not-pending while the other tab archives:**

```
2458ms  confirm:armed  | popover:open      (tab B armed, no action in flight)
3466ms  TAB-A:archived-committed
4218ms  confirm:gone   | unarchive:ENABLED | popover:open    (tab B realtime refresh)
4224ms  popover:closed                     (§4 close works; 6ms painted window)
```

Finding: cross-tab, the §4 close behaves as designed; the only exposure is the same one-paint enabled-replacement frame.

**Environmental note:** local `is_session_live` RPC intermittently returns "An invalid response was received from the upstream server" under rapid e2e navigation (`lib/auth/requireAdmin.ts`, `AdminInfraError` path). Probe harness retried; the restored e2e case must use nav-retry (§6.4).

## §3 DB design — performed/no-op discriminator

**Latest-definition inventory (the migration bases each body on the LATEST shipped definition, not the original):**

| RPC | Latest definition | No-op site | Change |
| --- | ----------------- | ---------- | ------ |
| `archive_show` | `20260601000000_b2_show_lifecycle.sql` | outer: `if v_archived then return` | DROP + recreate `returns boolean`; no-op → `return false`; after `_archive_show_core` → `return true` |
| `unarchive_show` | `20260718000001_unarchive_show_apply_gate_free.sql` | `_unarchive_show_apply`: `if not v_archived then return false` | **NONE** (already boolean) |
| `publish_show` | outer `20260601000000`; core `_publish_show_core` in `20260716210000_role_mappings_publish_freshness.sql` | core: `if v_pub then return` | core: DROP + recreate `returns boolean` (`return false` no-op / `return true` after flip); outer: DROP + recreate `returns boolean`, `return public._publish_show_core(...)` |
| `unpublish_show` | `20260701000000_published_toggle_unpublish_show.sql` | outer: `if not v_published then return` | DROP + recreate `returns boolean`; no-op → `return false`; after `_unpublish_show_core` → `return true` |

Migration mechanics (one new file, apply-twice idempotent):

- `DROP FUNCTION IF EXISTS public.<fn>(uuid);` then `CREATE FUNCTION` — required because `CREATE OR REPLACE` cannot change a return type. Bodies otherwise byte-faithful to the latest definitions: every gate (`is_admin`, not-found raise, `SHOW_ARCHIVED_IMMUTABLE`, `FINALIZE_OWNED_SHOW`, `PUBLISH_BLOCKED_PENDING_REVIEW`, role-mappings freshness gate in the 20260716 core), every `pg_advisory_xact_lock(hashtext('show:' || v_drive))`, and every post-lock re-read preserved. Advisory-lock single-holder topology UNCHANGED (in-RPC layer; `tests/auth/advisoryLockRpcDeadlock.test.ts` must stay green untouched).
- After each recreate: `REVOKE ALL ... FROM public, anon, authenticated, service_role;` then `GRANT EXECUTE ... TO authenticated;` (outer RPCs) / revoke-all-no-grant (`_publish_show_core`, matching its current posture).
- **The entire migration body is wrapped in one explicit `begin;` … `commit;` (R1 finding 1, BLOCKING-class).** Supabase's default privileges grant EXECUTE on new public functions to anon/authenticated/service_role directly (documented at `supabase/migrations/20260716120000_admin_show_review_snapshot_rpc.sql:32-35`), and the mandated surgical path (`psql "$TEST_DATABASE_URL" -f …`, AGENTS.md validation-parity rule) autocommits per statement — without the wrap, the gate-free lock-free `_publish_show_core` would be publicly executable between its CREATE and its REVOKE. The explicit transaction makes recreate+revoke atomic on BOTH apply paths (the `supabase db reset` runner's per-file transaction and the surgical `psql -f`). Precedent: `20260611000002_lockdown_wizard_staging_tables.sql`, `20260619000001_lockdown_shows_internal.sql` (same class, same wrap). `notify pgrst` sits inside the transaction (NOTIFY delivers on commit). Class-sweep: the wrap covers all four DROP+CREATE pairs in this file, not only the core.
- `_archive_show_core` and `_unpublish_show_core` stay `returns void` — their outers own the no-op decision.
- End of migration: `notify pgrst, 'reload schema';`.
- DROP of an in-use function under PostgREST: the reload notify closes the stale-cache window; transient 404s during the local apply are absorbed by the app's `infra_error` mapping (fail-closed, §4).

**Completeness matrix (layer × RPC):**

| Layer | archive | unarchive | publish | unpublish |
| ----- | ------- | --------- | ------- | --------- |
| DDL (return type) | migration | N/A — shipped | migration (core+outer) | migration |
| Grants re-issued | yes | N/A | yes | yes |
| JS caller reads `data` | `lib/showLifecycle/archiveShow.ts` | already (`unarchiveShow.ts` R8 comment, `data === true`) | `publishShow` caller | `unpublishShow` caller |
| Action emission gate | `archive.ts` | `unarchive.ts` | `setPublished.ts` | `setPublished.ts` |
| DB test | new/extended | extend existing `tests/db/unarchive_show_rpc.test.ts` | new | new |
| Behavioral no-op test | `tests/log/adminOutcomeBehavior.test.ts` | same | same | same |
| Validation apply + manifest | one surgical apply + `pnpm gen:schema-manifest` regen, committed | — | — | — |

## §4 Action/type design

- `lib/showLifecycle/_shared.ts`: `LifecycleResult` ok arm becomes `{ ok: true; performed: boolean }` (required field). **Ownership (R1 finding 2): the chokepoint constructs it** — `mapRpcResult(error, data)` gains the `data` parameter and returns `{ ok: true, performed: data === true }`; `callLifecycleRpc` passes its `data` through. Callers (`lib/showLifecycle/archiveShow.ts:16`, `lib/showLifecycle/publishShow.ts:16`, `lib/showLifecycle/unpublishShow.ts:23`, `lib/showLifecycle/unarchiveShow.ts:25-34`) return the shared result unchanged; `unarchiveShow`'s own `data === true` catch-up gate is untouched. Refusal arm unchanged. The required field forces every TYPED producer; untyped test-mock literals are enumerated in §6.5 (the compiler forces those too wherever the mock is assigned to an action/caller signature).
- `archiveShowAction` (`app/admin/show/[slug]/_actions/archive.ts`), `unarchiveShowAction` (`app/admin/show/[slug]/_actions/unarchive.ts`), `setShowPublishedAction` (`app/admin/show/[slug]/_actions/setPublished.ts`): `revalidateShow`/`revalidatePath` stay on `result.ok`; `await logAdminOutcome(...)` moves inside `result.performed`. Emission remains POST-COMMIT, outside any lock (invariant 10 posture unchanged).
- Comment repairs where drift now exists ("never on a refusal/no-op" claims become true): all three actions.
- `unarchiveShow`'s catch-up-sync gate (`data === true`) keeps working unchanged; it additionally surfaces `performed` on its return.
- Non-lifecycle `{ ok: true }` LifecycleResult producers: plan runs `rg "ok: true" lib/showLifecycle app` to enumerate and update every constructor site (e.g. `SHOW_NOT_FOUND` sentinel is `ok:false`, unaffected).

**Guard conditions (R2 finding 1 repair):** `data` null on a RETURNED-ok call (void RPC transitional window) or non-boolean garbage → `{ok:true, performed:false}` → emission suppressed, revalidate still runs. A THROWN fault never reaches this mapping — `callLifecycleRpc`'s catch keeps producing `{ok:false, code:"infra_error"}` (invariant 9, refusal arm unchanged): no revalidate, no emission, retry copy rendered. No new stored flags (`performed` is a transient return value; no flag-lifecycle table).

## §5 UI hardening — kill the 6ms painted frame

`components/admin/showpage/ShareHub.tsx` §4 lifecycle-close effect (the `prevLifecycleRef` effect over `[published, archived, open, busy]`) changes `useEffect` → `useLayoutEffect`. The close then commits synchronously between the swap commit and paint: the frame that painted an enabled `UnarchiveShowButton` inside the still-open popover (measured 6ms, Cases A/D) becomes unpaintable. The deferred-while-busy branch, the cancel-on-settle effect, and focus restore are byte-identical — only the scheduling primitive changes.

### Dimensional Invariants

N/A — the diff changes effect scheduling only; no fixed-dimension parent/child relationship is added or altered.

### Transition Inventory

Delta only — all other pairs unchanged from the shipped §3.4 inventory in the `tests/e2e/admin-lifecycle-transitions.spec.ts` header:

| Pair | Treatment |
| ---- | --------- |
| popover open + Archive arm → popover closed + arm swapped (lifecycle flip while NOT busy) | instant, single paint (was: two paints, 6ms intermediate) |
| lifecycle flip while busy (rotate/reset in flight) | unchanged: close deferred; cancel-on-settle unchanged |
| compound: flip lands while close-deferral active | unchanged behavior (deferral path not rescheduled) |

Impeccable dual-gate (invariant 8) runs on the diff — this is a `components/` change.

## §6 Test design

Anti-tautology notes inline; every test names the failure mode it catches.

1. **DB discriminator tests** (real local DB, per RPC): seed show in state X → call RPC → assert return value AND row state. Cases per RPC: performed path returns `true` + state flipped; repeat call returns `false` + state unchanged + side-effect-free (share token NOT re-rotated on archive no-op — asserts the no-op really early-returned, not "ran core twice"). Catches: a recreate that drops the early-return (would return `true` twice + rotate twice).
2. **Caller mapping** (`tests/showLifecycle/callers.test.ts`): injected rpc returning `{data:true}`, `{data:false}`, `{data:null}`, thrown → `performed` true/false/false/(infra_error). Catches: a caller mapping `performed: !!data` or dropping the field.
3. **Behavioral emission** (`tests/log/adminOutcomeBehavior.test.ts`): per action, performed-success branch → sink-spy records the code exactly once; no-op branch (`{ok:true, performed:false}`) → sink-spy records NOTHING while revalidate still observed. This is the repeat-submit regression in deterministic form. Registry rows in `tests/log/_auditableMutations.ts` unchanged. Catches: emission gated on `ok` alone regressing back.
4. **E2e — restored ARMED-CONCURRENT-REFRESH case** (in `tests/e2e/admin-lifecycle-transitions.spec.ts`, mobile-safari, wired via `lifecycle-layout-e2e.yml` already running this spec): productionized Case D. Two tabs; tab B popover open + Archive armed, no action pending; tab A archives; assert on tab B: popover closes, no torn state (no armed confirm remnant, no error banner), and an rAF-aligned sampler recorded NO painted frame containing an enabled `unarchive-show-button-*` inside an open popover. Nav uses the infra-error retry idiom (§2 environmental note). The spec-header note recording the case's removal is replaced with the restoration rationale. Catches: regression of the layout-effect close AND the original coverage gap (refresh-from-another-source while armed).
5. **Type-level + mock sweep (R1 finding 2 completion):** `pnpm typecheck` sweeps every `LifecycleResult` consumer. Untyped/`{ok: true}` lifecycle-mock literals needing `performed: true` (or `false` for new no-op cases), enumerated by `rg -l "archiveShow|unarchiveShow|publishShow|unpublishShow" tests/` ∩ `grep -l "ok: true"`, full disposition: `tests/showLifecycle/callers.test.ts` (§6.2), `tests/log/adminOutcomeBehavior.test.ts` (§6.3), `tests/app/admin/set-published-action.test.ts`, `tests/app/admin/show-lifecycle-actions.test.ts`, `tests/components/admin/per-show-lifecycle.test.tsx:73-75` (missed by R1's own sweep; caught by the class-sweep). Non-lifecycle `ok: true` hits verified unrelated: `tests/notify/*undo*` (sendEmail shape), `tests/sync/_metaInfraContract.test.ts:1009` (rpc payload), `tests/api/show-unpublish-route.test.ts:63` (route JSON shape).

## §7 Documented limits

- DOM-level pass-through: between the swap commit and the layout-effect close, the document briefly CONTAINS an enabled Unarchive row (unpainted). Observable to MutationObserver/tests, not to users. Consequence bound: even a landed tap fires a legitimate, reversible, advisory-locked, now-deduped action from what the user saw as a live control.
- Cross-tab armed control vanishing mid-aim (Case D) is the DESIGNED §4 behavior (close on lifecycle change), not a defect.
- Rollout-skew matrix (§1.1 row 5, direction corrected per R1 finding 3): (a) NEW app + OLD void RPC (app deployed before migration applied) — `data:null` → `performed:false` → a performed transition's emission is suppressed; fail-closed by choice, forensic gap of minutes. (b) NEW boolean RPC + OLD app (migration applied before deploy) — the old chokepoint ignores `data` and emits on `ok`, so the pre-existing duplicate behavior persists until the deploy lands; a status-quo window, not a regression. Both bounded by same-PR ordering (surgical validation apply at T7, Vercel deploy on merge).
- The e2e sampler is paint-aligned via rAF; a headless scheduler could theoretically coalesce differently than real Safari. Accepted: mobile-safari project is the shipped fidelity bar.

## §8 Backlog dispositions (same PR)

- `BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE`: rewritten RESOLVED-REFUTED with Case A/B timelines; graduates to `BACKLOG-archive.md`.
- `BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP`: RESOLVED (family-wide); graduates.
- `BL-ARCHIVE-ARMED-CONCURRENT-REFRESH`: RESOLVED (case restored via realtime vector); graduates.

## §9 Acceptance criteria

1. Full suite + typecheck + eslint + format:check green locally; real CI green (all twelve required contexts).
2. `tests/auth/advisoryLockRpcDeadlock.test.ts` green WITHOUT modification.
3. Repeat archive via stale surface emits exactly one `SHOW_ARCHIVED` (behavioral test, layered per §1.1 row 6).
4. Restored e2e case green 3/3 consecutive local runs before push (flake-history surface).
5. `validation-schema-parity` green after surgical validation apply + committed manifest regen.
6. Impeccable critique + audit pass on the ShareHub diff (P0/P1 fixed or DEFERRED.md).

## Appendix A — probe script

Probe file (a Playwright spec named `probe-admin-lifecycle-transitions`, deliberately untracked; deleted from the worktree once its timelines were banked here — this appendix is the durable record): 5 cases — A forced-hold via `page.route` POST interception (+3s), A2 tap-attempt, B ×8 natural, C stale-tab via subscriber-token abort, D cross-tab armed. Full timelines in §2. Recorder: MutationObserver over `[archive-show-confirm-button, archive-show-button, unarchive-show-button-*, share-hub-popover]` presence/disabled/aria-busy, consecutive-dedup, `performance.now()` stamps.
