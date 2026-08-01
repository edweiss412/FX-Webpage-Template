# Plan — archive/lifecycle race cluster (v2, post plan-R1 restructure)

**Spec:** `docs/superpowers/specs/2026-07-31-archive-lifecycle-race-cluster-design.md` (canonical; APPROVED at spec-R3; §-refs below are to it) · **Branch:** `fix/archive-lifecycle-race-cluster` · **Mode:** autonomous ship (owner-ratified; spec §1.1) · TDD per task — each task carries its OWN red tests and its OWN implementation and lands as ONE commit (plan-R1 finding 1 restructure: the old T1↔T2 / T5↔T6 splits were commit-order-impossible and are merged).

## Meta-test inventory (mandatory declaration)

- **EXTENDS:** `tests/db/unarchive_show_rpc.test.ts` sibling coverage via a NEW test file `lifecycle_rpc_performed` under tests/db (T1); `tests/showLifecycle/callers.test.ts` (T2); `tests/log/adminOutcomeBehavior.test.ts` (T3); `tests/db/_b2Helpers.ts` gains three returning helpers (T1, plan-R1 finding 2).
- **CREATES:** no new registry. `AUDITABLE_MUTATIONS` rows unchanged (spec §1.1 row 10); `tests/log/_metaMutationSurfaceObservability` discovery unaffected (same emit call sites, narrower guard).
- **UNCHANGED-BY-CONTRACT:** `tests/auth/advisoryLockRpcDeadlock.test.ts` — spec §9.2 requires it green WITHOUT modification.

## Advisory-lock topology (mandatory: plan touches `pg_advisory*` code text)

Each migrated RPC keeps its existing single in-RPC holder (`pg_advisory_xact_lock(hashtext('show:' || v_drive))` inside `archive_show` / `publish_show` / `unpublish_show`); JS callers hold nothing (`lib/showLifecycle/archiveShow.ts` doc comment: "The RPC self-locks; do NOT wrap in withShowLock"). The migration re-emits identical lock lines; no layer added or moved. Holders per hashkey `show:<drive_file_id>`: exactly one (in-RPC), before and after.

## e2e harness-readiness (mandatory; corrected per plan-R1 finding 4)

- **Boot:** the mobile-safari webServer entry at `playwright.config.ts:244` — **CI runs `pnpm build` + `pnpm start -H 127.0.0.1`; only local runs use `pnpm dev`** (both on `E2E_PORT`, default 3000, `reuseExistingServer` locally).
- **Readiness/hydration gate:** the suite's existing kebab-click `toPass` hydration proof (`waitForHydration` idiom, `tests/e2e/admin-lifecycle-transitions.spec.ts:79-85` region) plus nav-retry on `admin-layout-infra-error` (probe-measured local `is_session_live` flake, spec §2 environmental note).
- **Detach-safety:** the rAF sampler runs entirely in page context over `document.querySelector` (never a Playwright locator that can auto-wait on an unmounted node); it is stopped and drained via one `page.evaluate` before any assertion reads it.
- **Cleanup:** the suite's `afterAll` currently only deletes the seeded show (`tests/e2e/admin-lifecycle-transitions.spec.ts:207` region). T4 introduces `settleDashboardAdminState()` and MUST store its returned restore callback and invoke it in `afterAll` (plan-R1 finding 4; same contract the probe used).

## Tasks

Each task: write the listed tests (RED — run the exact command, observe the exact failure class), implement, re-run (GREEN), then `pnpm typecheck`, one commit.

### T1 — DB: performed discriminator (spec §3, §6.1)

**Red tests first** — a new test file `lifecycle_rpc_performed` under tests/db (harness idioms of `tests/db/unarchive_show_rpc.test.ts`), PLUS three helpers in `tests/db/_b2Helpers.ts` mirroring `unarchiveShowReturning` (`tests/db/_b2Helpers.ts:59-66`) exactly (plan-R1 finding 2):

```ts
/** Call archive_show as admin and return its boolean result (true iff it performed live/held→archived). */
export async function archiveShowReturning(showId: string): Promise<boolean> {
  return asAdminTx(sql, async (tx) => {
    const [row] = await tx.unsafe(`select public.archive_show($1::uuid) as transitioned`, [showId]);
    return (row as unknown as { transitioned: boolean }).transitioned;
  });
}
```

(`publishShowReturning` / `unpublishShowReturning` identical modulo the function name. `asAdminRpc`'s `AdminRpcFn` union is untouched — the returning helpers are self-contained.)

Test cases (failure mode each):

- `archiveShowReturning`: seeded Held (`seedHeldShow`) → `true` + `readShow` shows `archived=true, published=false`; second call → `false` + `readShareToken` value unchanged between call 1 and call 2 (catches: recreate dropped the early-return — core would rotate the token twice).
- `publishShowReturning`: seeded Held → `true` + `published=true`; second call → `false`, state unchanged (catches: `_publish_show_core` lost `if v_pub then return false`).
- `unpublishShowReturning`: the published show from above → `true` + `published=false`; second call → `false` (catches: outer lost `if not v_published then return false`).
- Refusal preservation: `publishShowReturning` on `seedArchivedShow()` rejects with message containing `SHOW_ARCHIVED_IMMUTABLE` (catches: recreate lost a gate).

RED command: `pnpm vitest run tests/db/lifecycle_rpc_performed.test.ts` (file created by this task) — expected failure class: the returning helpers read no boolean from the still-void RPCs (`transitioned` undefined ≠ true), so the three discriminator cases fail. **The refusal-preservation case PASSES during RED** (plan-R2 finding 5: the shipped `_publish_show_core` already raises `SHOW_ARCHIVED_IMMUTABLE`); it is a regression pin, not part of the red set — the RED gate is "the three discriminator cases fail".

**Then the migration** — a new migration file `<timestamp>_lifecycle_rpc_performed_discriminator` under supabase/migrations, exact skeleton:

```sql
begin;  -- atomic on BOTH the runner path and autocommit surgical psql -f (spec §3)
drop function if exists public.archive_show(uuid);
create function public.archive_show(p_show_id uuid) returns boolean ...; -- body verbatim from 20260601000000; no-op arm `return false`; tail `return true`
revoke all on function public.archive_show(uuid) from public, anon, authenticated, service_role;
grant execute on function public.archive_show(uuid) to authenticated;
-- _publish_show_core (basis: 20260716210000 body incl. freshness gate): drop, create returns boolean, revoke-all, NO grant
-- publish_show (basis: 20260601000000 outer): drop, create returns boolean, tail `return public._publish_show_core(p_show_id);`, revoke+grant
-- unpublish_show (basis: 20260701000000): drop, create returns boolean, no-op arm `return false`, tail `return true`, revoke+grant
notify pgrst, 'reload schema';
commit;
```

`unarchive_show`: untouched (spec §1.1 row 8). **Apply to the LOCAL DB before the GREEN run** (plan-R2 finding 1 — writing the file changes nothing; the db tests hit the live local instance per `tests/db/_b2Helpers.ts:25`): `psql -v ON_ERROR_STOP=1 "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/migrations/<file>.sql` (plan-R3 finding 1: without `ON_ERROR_STOP` psql continues past SQL errors and exits 0 — the M12.1 handoff documents this exact false-green). GREEN: same vitest command. Then apply-twice idempotency: run the same `psql -v ON_ERROR_STOP=1 -f` a second time; clean exit. `pnpm gen:schema-manifest`; commit manifest with migration + tests + helpers.

Commit: `feat(db): lifecycle RPCs return performed discriminator (archive/publish/unpublish)`

### T2 — type + caller chokepoint (spec §4, §6.2, §6.5)

**Red first** — extend `tests/showLifecycle/callers.test.ts`: injected rpc `{data:true, error:null}` → result `{ok:true, performed:true}`; `{data:false}` / `{data:null}` → `performed:false`; thrown → `{ok:false, code:"infra_error"}` (unchanged refusal arm). RED command: `pnpm vitest run tests/showLifecycle/callers.test.ts` — fails on missing `performed` property.

**Then**, `lib/showLifecycle/_shared.ts`:

```ts
export type LifecycleResult = { ok: true; performed: boolean } | { ok: false; code: string };

export function mapRpcResult(
  error: { message?: string } | null,
  data: unknown,
): LifecycleResult {
  if (!error) return { ok: true, performed: data === true };
  const msg = error.message ?? "";
  const code = KNOWN.find((c) => msg.includes(c));
  return { ok: false, code: code ?? "infra_error" };
}
```

`callLifecycleRpc` passes its `data` into `mapRpcResult(error, data)`; its catch arm stays `{ result: { ok: false, code: "infra_error" }, data: null }` (spec §4 guard conditions — thrown never becomes `performed:false`). Callers unchanged (chokepoint is the only `{ok:true}` producer — pre-draft transcript below).

**Mock/assertion sweep in the same commit** (spec §6.5 + plan-R1 finding 5, ALL instances):

- Literals gaining `performed: true`: `tests/app/admin/set-published-action.test.ts:24-25` region mocks; `tests/app/admin/show-lifecycle-actions.test.ts:37-39` region mocks; `tests/components/admin/per-show-lifecycle.test.tsx:73-75`.
- Runtime `toEqual` assertions gaining the field: `tests/app/admin/show-lifecycle-actions.test.ts:96` (`expect(res).toEqual({ ok: true })` → `{ ok: true, performed: true }`), `tests/app/admin/set-published-action.test.ts:76` and `tests/app/admin/set-published-action.test.ts:83` (same change).
- Per-test success-shaped overrides/casts (plan-R4 finding 1, completing the sweep): `tests/app/admin/set-published-action.test.ts:70` and `tests/app/admin/show-lifecycle-actions.test.ts:86` (`{ok:true}` overrides gain `performed: true`); `tests/app/admin/set-published-action.test.ts:124` and `tests/app/admin/show-lifecycle-actions.test.ts:182` (mock return types become incompatible after the type change; update the cast/shape); `tests/app/admin/show-lifecycle-actions.test.ts:148` (`as never` cast would yield `performed === undefined` post-T3 and silently suppress its expected telemetry; replace with a typed `{ok:true, performed:true}`).
- GREEN: `pnpm vitest run tests/showLifecycle/callers.test.ts tests/app/admin/set-published-action.test.ts tests/app/admin/show-lifecycle-actions.test.ts tests/components/admin/per-show-lifecycle.test.tsx` + `pnpm typecheck`.

Commit: `feat(showLifecycle): LifecycleResult carries performed discriminator`

### T3 — action emission gating (spec §4, §6.3)

**Red first** — extend `tests/log/adminOutcomeBehavior.test.ts`: per action (archive / unarchive / setPublished both directions), a no-op case injecting `{ok:true, performed:false}` through the existing deps/mocking seam asserting the sink-spy records ZERO codes while the revalidate spy IS called; existing success cases updated to inject `performed:true` (they must keep recording exactly one code). RED: `pnpm vitest run tests/log/adminOutcomeBehavior.test.ts` — no-op cases fail (emission still fires on `ok`).

**Then** the three actions: wrap `await logAdminOutcome(...)` in `if (result.performed) { ... }` — `app/admin/show/[slug]/_actions/archive.ts` (inside the existing `if (result.ok)` block), `app/admin/show/[slug]/_actions/unarchive.ts` (same), `app/admin/show/[slug]/_actions/setPublished.ts` (same). Revalidates stay on `ok` (spec §1.1 row 4). Comment repairs: the three "never on a refusal/no-op" claims now true — reword each to say emission requires a PERFORMED transition.

GREEN + `pnpm typecheck`. Commit: `fix(admin): lifecycle telemetry emits only on performed transitions`

### T4 — ShareHub pre-paint close + restored e2e case (spec §5, §6.4)

One task, one commit (plan-R1 finding 1): the e2e case IS the red test for the ShareHub change.

**Red first** — in `tests/e2e/admin-lifecycle-transitions.spec.ts`:

1. Replace the header removal note (`tests/e2e/admin-lifecycle-transitions.spec.ts:11-17` region) with the restoration rationale (realtime vector, backdrop-immune).
2. `beforeAll` gains `restoreDashboardState = await settleDashboardAdminState()`; `afterAll` invokes it after the existing seeded-show delete (harness-readiness section above).
3. New case (probe Case D productionized): two pages in one context; tab B → `/admin?show=<slug>` with infra-error nav retry → hydration proof → open hub → arm Archive; install sampler on tab B; tab A archives via its own modal confirm; wait for the `SHOW_ARCHIVED` telemetry row **scoped to the seeded show and this run** — capture `baseline = count(app_events where message='SHOW_ARCHIVED' and show_id=<seeded>::uuid)` BEFORE tab A confirms, then poll for `count > baseline` (plan-R2 finding 2 — the destination suite has no per-case app_events cleanup, so an unscoped poll can satisfy on a historical row); **then wait for tab B's terminal UI condition** — `pageB.waitForFunction` until the latest sampler frame has `!popoverOpen` (timeout 15s) — before draining (plan-R2 finding 3: the telemetry row signals tab A's action, not tab B's refresh; the probe waited a further fixed 8s, this uses the condition itself); then drain sampler and assert.

Sampler (page context, install/drain via `page.evaluate`), with health assertions (plan-R1 finding 3 anti-tautology set):

```ts
// install: samples on every animation frame until stopped
(window as any).__frames = [];
const sample = () => {
  const popover = document.querySelector('[data-testid="share-hub-popover"]');
  const unarch = document.querySelector<HTMLButtonElement>('[data-testid^="unarchive-show-button-"]');
  // LOADED modal only. Skeleton and loaded roots share the testid and can transiently COEXIST
  // (tests/e2e/admin-lifecycle-transitions.spec.ts:59-64), so scan ALL roots for the one holding
  // the title marker: first-match querySelector can land on the skeleton sibling and report
  // modal:false while a loaded root exists (plan-R2 finding 4 + plan-R3 finding 2).
  const modal = Array.from(
    document.querySelectorAll('[data-testid="published-show-review-modal"]'),
  ).find((r) => r.querySelector('[data-testid="published-show-review-title"]') !== null) ?? null;
  const armed = document.querySelector('[data-testid="archive-show-confirm-button"]');
  (window as any).__frames.push({
    t: performance.now(),
    modal: modal !== null,
    popoverOpen: popover !== null,
    armed: armed !== null,
    enabledUnarchInsidePopover:
      unarch !== null && !unarch.disabled && popover !== null && popover.contains(unarch),
  });
  if (!(window as any).__stopSampler) requestAnimationFrame(sample);
};
requestAnimationFrame(sample);
```

Assertions (each with its failure mode):

- **Sampler health:** `frames.length > 30` (catches: sampler never ran); ≥1 pre-archive frame with `popoverOpen && armed && modal` (catches: case armed nothing / sampled too late).
- **Positive terminal:** final frame has `modal && !popoverOpen && !armed` — popover closed while the LOADED modal (title-marker-discriminated, see sampler) remained mounted (catches: wholesale loaded-modal detachment masquerading as "closed" — a lingering skeleton no longer satisfies it; torn state).
- **Paint invariant:** NO frame has `enabledUnarchInsidePopover` (catches: regression of the layout-effect close; the spec §5 contract). Containment via `popover.contains(unarch)` scopes the forbidden state to INSIDE the open popover.
- **No error banner:** `archive-show-error` / `unarchive-show-error-*` absent at drain.

RED command: `E2E_PORT=<free port> pnpm exec playwright test tests/e2e/admin-lifecycle-transitions.spec.ts --project=mobile-safari -g "<new case name>"` — expected failure: the paint-invariant assertion (probe measured the 6ms painted frame on the shipped `useEffect` in Cases A AND D; WebKit rAF samples it). RED gate: fails on the paint invariant in ≥2 of 3 attempts; if it will not reproduce red, STOP and escalate (spec §7 documents the headless-scheduler caveat — a never-red test here is a genuine ambiguity, not a skip).

**Then** `components/admin/showpage/ShareHub.tsx`: the §4 lifecycle-close effect (`prevLifecycleRef` effect over `[published, archived, open, busy]`) switches `useEffect` → `useLayoutEffect` at the CALL SITE ONLY — `useLayoutEffect` is already imported and used elsewhere in the file (`components/admin/showpage/ShareHub.tsx:91` and `components/admin/showpage/ShareHub.tsx:372`; plan-R2 finding 6 — do NOT touch the import line). Body byte-identical; keep/adjust the `eslint-disable-next-line react-hooks/set-state-in-effect` pragma as the linter dictates. All sibling effects (deferral cancel, Escape handler, dialog focus) untouched.

GREEN: same command, then the full file 3 consecutive green runs (spec §9.4), then `pnpm typecheck` (covers vitest AND playwright configs).

Commit: `fix(admin): close ShareHub pre-paint on lifecycle flip; restore armed-vs-concurrent-refresh e2e coverage`

### T5 — validation apply + backlog graduation (spec §3, §8)

1. Surgical validation apply: `psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -f supabase/migrations/<file>.sql` then `psql -v ON_ERROR_STOP=1 "$TEST_DATABASE_URL" -c "notify pgrst, 'reload schema';"` (plan-R3 finding 1) (file is transaction-wrapped; single atomic apply).
2. Parity pre-check: `pnpm vitest run tests/db/validation-schema-parity.test.ts` (asserts validation ⊇ committed manifest).
3. `BACKLOG.md`: rewrite + graduate the three entries to `BACKLOG-archive.md` per spec §8. Reconciliation sweep RUN AT PLAN TIME (plan-R4 finding 2; writing-plans rule) — `rg -n "BL-ARCHIVE-PENDING-REALTIME-SWAP-RACE|BL-ARCHIVE-REPEAT-TELEMETRY-DEDUP|BL-ARCHIVE-ARMED-CONCURRENT-REFRESH" BACKLOG.md BACKLOG-archive.md docs/` returned 17 hits, dispositions:
   - BACKLOG lines 165, 937, and 943 — the three active entries: REWRITE + GRADUATE (the T5 mutation set, exactly these).
   - `BACKLOG-archive.md:1027` — historical reference inside an already-graduated entry: KEEP unchanged.
   - `docs/superpowers/specs/2026-07-24-archive-row-menu-idiom.md` (5 hits: lines 28, 29, 79, 81, 87) and `docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-and-archive-copy.md:348` — provenance in the specs that FILED the items; specs are immutable records: KEEP unchanged.
   - `docs/superpowers/specs/2026-07-31-archive-lifecycle-race-cluster-design.md` (6 hits) and this plan's own sweep line — self-references of the closing feature: KEEP unchanged.
   No CI-dark umbrella hit exists (earlier draft's conjecture; the sweep is the authority).
4. Delete the untracked probe spec file from the worktree.

Commit: `docs: graduate archive race-cluster backlog items (probe-resolved)`

### T6 — close-out gates

Full suite (`pnpm test`) + `pnpm typecheck` + `pnpm lint` + `pnpm format:check`; impeccable dual-gate (`/impeccable critique` + `/impeccable audit`) on the T4 ShareHub diff (invariant 8; P0/P1 fixed or DEFERRED.md); whole-diff Codex cross-model review to APPROVE (fresh-eyes brief; split-scope per AGENTS.md if the file list warrants); push; PR; real CI green (all twelve required contexts); `gh pr merge --merge`; ff-sync the main checkout and verify `git rev-list --left-right --count main...origin/main` → `0  0`; Stage 4.4: CronDelete nudge + clear pane label.

## Checklist

- [ ] T1 DB tests + helpers + migration + manifest (one commit)
- [ ] T2 caller tests + type change + mock/assertion sweep (one commit)
- [ ] T3 behavioral tests + emission gating (one commit)
- [ ] T4 e2e case + ShareHub layout-effect, 3× green (one commit)
- [ ] T5 validation apply + backlog graduation
- [ ] Self-review + spec:lint (plan) — rerun on v2
- [ ] Adversarial review (cross-model) — plan (R1 BLOCKING → this v2; redispatch)
- [ ] T6 close-out (impeccable → whole-diff review → CI → merge → 0 0)

## Pre-draft verification transcript (updated for v2)

- Returning-helper basis: `tests/db/_b2Helpers.ts:50-56` (`asAdminRpc`, void by design — untouched), `tests/db/_b2Helpers.ts:59-66` (`unarchiveShowReturning` — template; T1 snippet mirrors it byte-for-byte modulo names, same `asAdminTx`/`sql`/`tx.unsafe` symbols in the same file scope).
- Runtime assertions needing `performed`: `tests/app/admin/show-lifecycle-actions.test.ts:96`, `tests/app/admin/set-published-action.test.ts:76` and `tests/app/admin/set-published-action.test.ts:83` — read this session; exact-match `toEqual({ ok: true })` shapes (plan-R1 finding 5).
- Boot mechanism: `playwright.config.ts:244-249` — CI `pnpm build && pnpm start -H 127.0.0.1 -p $E2E_PORT`, local `pnpm dev -H 127.0.0.1 -p $E2E_PORT` (plan-R1 finding 4).
- Cleanup baseline: `tests/e2e/admin-lifecycle-transitions.spec.ts:207` region — afterAll deletes the seeded show only; no dashboard-state restore today (plan-R1 finding 4).
- `settleDashboardAdminState` export: `tests/e2e/helpers/dashboardState.ts:36`, returns a restore callback (probe stored + invoked it; same contract for T4).
- Producer sweep: `rg "ok: true" lib/showLifecycle` → `lib/showLifecycle/_shared.ts:4` (type) and line 40 (`mapRpcResult`) only. Consumer files: 13 (session log).
- Latest RPC definitions: per spec §3 table, verified via `grep -l "create or replace function public.<fn>(" supabase/migrations/*.sql | sort | tail` for each of the seven lifecycle functions.
- Snippet typecheck posture: T1's helper snippet reuses the exact symbols of its template in the same file (compiles by construction); T2's `_shared.ts` snippet drafted against the current body read this session (`KNOWN` in scope; strict-clean shapes); T4's sampler body is page-context code inside `page.evaluate` (browser DOM APIs; TS-checked as the evaluate callback when written in-spec). Each snippet still lands red-first in-repo where `pnpm typecheck` gates its commit.
