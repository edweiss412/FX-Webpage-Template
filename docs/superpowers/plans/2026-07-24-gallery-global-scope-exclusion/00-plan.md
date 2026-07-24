# Plan — gallery global-scope exclusion

**Spec:** `docs/superpowers/specs/2026-07-24-gallery-global-scope-exclusion-design.md` (canonical; the spec wins anywhere this plan disagrees).
**Branch:** `fix/gallery-global-scope-exclusion`
**Implementer:** Opus / Claude Code (UI surface under `components/`, so ROUTING.md's hard rule applies).

---

## 0. Pre-draft verification transcript

Every fact this plan names was grepped against the live worktree before drafting.

| claim | command | result |
| --- | --- | --- |
| 45 `ATTENTION_ROUTES` keys | regex over `lib/admin/attentionItems.ts` | 45 |
| 16 `FROZEN_REACHABLE` entries | `tests/adminAlerts/alertProducerScope.registry.ts:281` | 16 |
| 28 `EXPECTED_CUT_IDS` entries | `tests/app/admin/attentionModalGallery.serverProps.test.ts:42-71` | 28 |
| 9 global-only codes | projection over `PRODUCER_SCOPE` (45 rows, 3 seed) | 9 |
| 5 of the 9 are health-audience and already cut | intersect the 9 with `EXPECTED_CUT_IDS` | 5 |
| exactly 4 leak | 9 minus the 5 | 4 |
| 1 composite instance | sweep the 9 across `tier1.ts`/`tier2.ts`/`tier3.ts` | `tier3.ts:114` (`SYNC_STALLED`) |
| `SELF_HEALING_CODE_LIST` has 3 members, 2 global-only | `lib/adminAlerts/audience.ts:75-79` | confirmed |
| `tests/adminAlerts/**` already in the parallel vitest project | `vitest.projects.ts:83` | no config change needed for the new meta-test |
| `tests/dev/**` is not in `PARALLEL_TEST_GLOBS`, so it runs in the serial project | `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:64`) | existing behavior; no change |
| `filesMembership` walks only `page.tsx`/`actions.ts`/`route.ts`/`layout.tsx` | `ROUTE_FILES` (`tests/admin/dev/filesMembership.test.ts:37`) | `buildSwitcherScenarios.ts` is a helper; no registration needed |
| `SwitcherControls.tsx` is absent from the motion-free registry | `tests/components/admin/transitionAudit.test.tsx:41-62` | Task 7 adds it |

`pnpm spec:lint` on the spec: `summary: 0 hard, 0 advisory`.

## 0.3 Measured baseline

`partitionScenarios().rendered` currently holds **132** scenarios, and all four global ids are among them (captured by a throwaway test against the committed tree at `b4603d58`, then removed):

```
alert-live-row-conflict
alert-onboarding-sheet-unreadable
alert-sync-stalled
alert-watch-channel-orphaned
```

Post-change the rendered count is **128** and `excluded` grows 31 → 35. Task 3 checks the full 132-id list in as `RENDERED_IDS_BEFORE`; Task 5 asserts the 128-id subtraction.

## 0.1 Meta-test inventory

- **CREATES** `tests/adminAlerts/_metaGlobalScopeCodes.test.ts (new)` — pins `GLOBAL_SCOPE_CODES` set-equal to the `globalOnlyCodes()` projection, so a producer-scope reclassification fails CI instead of drifting the gallery.
- **EXTENDS** `tests/components/admin/transitionAudit.test.tsx` — adds `components/admin/dev/SwitcherControls.tsx` to the motion-free source scan.
- **Not applicable:** Supabase call-boundary (`tests/auth/_metaInfraContract.test.ts`) — no Supabase call is added. Advisory-lock topology — no `pg_advisory*` surface. `admin_alerts` catalog completeness — no catalogue row changes. Mutation-surface observability — no mutating route or action.

## 0.2 Mandatory-task dispositions

- **Layout-dimensions task: N/A.** Spec §5.1 documents zero parent→child dimension relationships: the new element is a block-level `<p>` in an existing `overflow-y-auto` column with no fixed-height parent and no flex or grid child relationship. There is nothing for a `getBoundingClientRect` assertion to pin. Declared rather than skipped.
- **Transition-audit task: Task 7.** Spec §5.2's inventory is three rows, all "instant" or "unreachable". The audit is a source scan (registry row in `transitionAudit.test.tsx`) rather than an interaction test, because the inventory contains no animated state to compound.
- **e2e harness-readiness: N/A for new Playwright, but the existing spec IS a consumer.** No new Playwright is attached. `tests/e2e/attention-modal-gallery.spec.ts:148-151` calls `partitionScenarios()` at module load and derives `RENDERED_IDS`, `STRUCTURAL`, and `CUT`. Analysed per assertion:
  - `tests/e2e/attention-modal-gallery.spec.ts:372` asserts `STRUCTURAL.length` is `3`. Unaffected: the global arm runs after `cut`, and no structural scenario carries alerts.
  - `tests/e2e/attention-modal-gallery.spec.ts:373` asserts `CUT.length > 0`, and `tests/e2e/attention-modal-gallery.spec.ts:392` asserts the controls render `String(CUT.length)` as a substring. `EXPECTED_CUT_IDS` is unchanged at 28, and the cut paragraph still renders `28`, so both hold. The toggle count moves 31 → 35 but is matched by a different assertion.
  - `RENDERED_IDS` drops 132 → 128 (measured, see §0.3). The sweep at `tests/e2e/attention-modal-gallery.spec.ts:236` iterates whatever is rendered and `tests/e2e/attention-modal-gallery.spec.ts:194` only asserts non-empty, so both hold.
  - **Task 7 adds** a `GLOBAL` derivation and one assertion that the global line's count renders, mirroring the existing `CUT` assertion at `tests/e2e/attention-modal-gallery.spec.ts:392`. Without it the new paragraph is the only excluded-reason line with no end-to-end proof it reaches the DOM.
- **`tests/dev/galleryModalTypes.test.ts:51`** constructs an `ExcludedScenario` with `reason: "cut"` as a type-resolution proof. Widening the union is compatible; verified no change needed.

---

## 1. Tasks

TDD per task, per plan-wide invariant 1: write the failing test, run it and see it fail for the stated reason, implement the minimum, see it pass, commit. One commit per task, conventional-commits style.

### Task 1 — `globalOnlyCodes()` projection

**Test first:** `tests/adminAlerts/_metaGlobalScopeCodes.test.ts (new)`, projection unit tests only (the set-equality assertion arrives in Task 2, after the lib constant exists).

Assert against **synthetic** rows, not `PRODUCER_SCOPE`, so the test cannot pass by coincidence of today's registry data:

```ts
import { describe, expect, it } from "vitest";
import { projectGlobalOnly, type ProducerScopeRow } from "@/tests/adminAlerts/alertProducerScope.registry";

const row = (code: string, scope: "per-show" | "global", seed = false): ProducerScopeRow => ({
  site: `synthetic/${code}-${scope}${seed ? "-seed" : ""}.ts:1`,
  code,
  scope,
  ...(seed ? { seed: true } : {}),
});

describe("projectGlobalOnly", () => {
  it("a code with only global rows is global-only", () => {
    expect([...projectGlobalOnly([row("A", "global")])]).toEqual(["A"]);
  });

  it("a code with BOTH scopes is NOT global-only (per-show wins: it can reach the modal)", () => {
    expect([...projectGlobalOnly([row("A", "global"), row("A", "per-show")])]).toEqual([]);
  });

  it("a seed-only global row does not make its code global-only", () => {
    expect([...projectGlobalOnly([row("A", "global", true)])]).toEqual([]);
  });

  it("a seed per-show row does not rescue a code from global-only", () => {
    expect([...projectGlobalOnly([row("A", "global"), row("A", "per-show", true)])]).toEqual(["A"]);
  });

  it("a code with only per-show rows is absent", () => {
    expect([...projectGlobalOnly([row("A", "per-show")])]).toEqual([]);
  });
});
```

**Failure mode caught:** a projection that forgets the `seed` filter, or that treats a mixed-scope code as global-only (which would wrongly hide a reachable card).

**Implementation:** in `tests/adminAlerts/alertProducerScope.registry.ts`, beside `perShowReachableCodes()` (`tests/adminAlerts/alertProducerScope.registry.ts:270`):

```ts
/** Pure projection over an arbitrary row list, so the unit tests can drive it
 *  with synthetic rows instead of the live registry. */
export function projectGlobalOnly(rows: readonly ProducerScopeRow[]): Set<string> {
  const perShow = new Set<string>();
  const global = new Set<string>();
  for (const r of rows) {
    if (r.seed) continue;
    (r.scope === "global" ? global : perShow).add(r.code);
  }
  return new Set([...global].filter((c) => !perShow.has(c)));
}

/** A code is global-only iff some non-seed producer row emits it with scope
 *  "global" AND no non-seed row emits it per-show. Health audience is NOT
 *  subtracted here (unlike perShowReachableCodes): scope and audience are
 *  orthogonal, and the gallery's cut axis handles audience. */
export function globalOnlyCodes(): Set<string> {
  return projectGlobalOnly(PRODUCER_SCOPE);
}
```

`ProducerScopeRow` is already exported (`alertProducerScope.registry.ts:17`); no type change is needed.

**Commit:** `test(admin-alerts): globalOnlyCodes projection over PRODUCER_SCOPE`

---

### Task 2 — `GLOBAL_SCOPE_CODES` + set-equality pin

**Test first:** append to `tests/adminAlerts/_metaGlobalScopeCodes.test.ts (new)`:

```ts
import { GLOBAL_SCOPE_CODES } from "@/lib/adminAlerts/alertScope";
import { globalOnlyCodes } from "@/tests/adminAlerts/alertProducerScope.registry";

it("GLOBAL_SCOPE_CODES is set-equal to the registry projection", () => {
  const projected = [...globalOnlyCodes()].sort();
  expect([...GLOBAL_SCOPE_CODES].sort(), `regenerate GLOBAL_SCOPE_CODES to: ${JSON.stringify(projected)}`).toEqual(projected);
});

it("the four doug-audience leakers are members (the codes this change exists for)", () => {
  for (const c of ["LIVE_ROW_CONFLICT", "ONBOARDING_SHEET_UNREADABLE", "SYNC_STALLED", "WATCH_CHANNEL_ORPHANED"]) {
    expect(GLOBAL_SCOPE_CODES.has(c), c).toBe(true);
  }
});

it("a per-show-reachable code is NOT a member", () => {
  expect(GLOBAL_SCOPE_CODES.has("DRIVE_FETCH_FAILED")).toBe(false);
  expect(GLOBAL_SCOPE_CODES.has("SHEET_UNAVAILABLE")).toBe(false);
});
```

**Failure mode caught:** the lib set drifting from the registry (a new global producer, or a code reclassified per-show), in either direction. The second and third cases are belt-and-braces against a projection bug that would make the first assertion pass vacuously on two empty sets.

**Implementation:** new `lib/adminAlerts/alertScope.ts (new)`:

```ts
/**
 * lib/adminAlerts/alertScope.ts
 *
 * Codes whose producers ALWAYS write `show_id: null`. `fetchPerShowAlerts`
 * filters `.eq("show_id", showId)` (lib/adminAlerts/fetchPerShowAlerts.ts:83),
 * so no per-show surface can ever receive one.
 *
 * lib/ must not import tests/, so this list is declared here and pinned
 * set-equal to the `globalOnlyCodes()` projection over PRODUCER_SCOPE by
 * tests/adminAlerts/_metaGlobalScopeCodes.test.ts. Same lib-declares /
 * test-pins idiom ATTENTION_ROUTES uses.
 *
 * A code carrying BOTH scopes is deliberately absent: it can reach a show
 * modal, so it is not global-only.
 */
export const GLOBAL_SCOPE_CODES: ReadonlySet<string> = new Set([
  "CALLBACK_CLAIM_THREW",
  "GITHUB_BOT_LOGIN_MISSING",
  "LIVE_ROW_CONFLICT",
  "ONBOARDING_SHEET_UNREADABLE",
  "PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED",
  "PICKER_BOOTSTRAP_RPC_FAILED",
  "SYNC_STALLED",
  "WATCH_CHANNEL_ORPHANED",
  "WEBHOOK_TOKEN_INVALID",
]);
```

**Commit:** `feat(admin-alerts): GLOBAL_SCOPE_CODES pinned set-equal to the producer-scope projection`

---

### Task 3 — carrier-helper extraction (behavior-preserving)

**Test first:** in `tests/app/admin/attentionModalGallery.serverProps.test.ts`, capture the current rendered id set as a checked-in constant and assert `partitionScenarios().rendered` still equals it. Written and passing BEFORE the extraction, so it is a genuine regression net rather than a post-hoc rationalization:

```ts
// Captured from `partitionScenarios()` at commit dec700d8, BEFORE the carrier
// extraction and the global axis. Task 5 subtracts exactly the four global ids
// from this list; anything else moving is a regression.
const RENDERED_IDS_BEFORE: string[] = [/* generated, see below */];

it("the rendered id set is exactly the checked-in baseline", () => {
  expect(partitionScenarios().rendered.map((s) => s.id).sort()).toEqual(RENDERED_IDS_BEFORE);
});
```

Generate the constant with `pnpm vitest run tests/app/admin/attentionModalGallery.serverProps.test.ts -t "rendered id set"` once and paste the failure diff. Do NOT generate it by calling the function inside the test.

**Failure mode caught:** a typo in the extracted carrier list (a dropped `feedNull`, a `??` that changes falsy handling) silently removing an unrelated scenario from the gallery.

**Implementation:** in `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts`, extract the inlined list from `isModalVisible` (`app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:45-56`) verbatim:

```ts
/** Everything besides derived alert items that makes a scenario worth a card.
 *  Extracted from isModalVisible so isShowScopeReachable cannot drift from it. */
function hasNonAlertCarrier(s: AttentionScenario): boolean {
  return (
    (s.warnings?.length ?? 0) > 0 ||
    s.degraded === true ||
    s.feedNull === true ||
    (s.changeLog?.length ?? 0) > 0 ||
    s.fixture !== undefined ||
    s.actionOutcomes !== undefined
  );
}

export function isModalVisible(s: AttentionScenario): boolean {
  return (
    deriveScenarioAttention(s).length > 0 ||
    hasNonAlertCarrier(s) ||
    (s.alerts.length === 0 && s.holds.length === 0)
  );
}
```

Module-local, not exported: it is an implementation detail of the two predicates.

**Commit:** `refactor(admin-dev): extract hasNonAlertCarrier from isModalVisible`

---

### Task 4 — `isShowScopeReachable`

**Test first:** truth table in `tests/app/admin/attentionModalGallery.serverProps.test.ts`, driven by synthetic scenarios built with the file's existing `minimal()` helper (`tests/app/admin/attentionModalGallery.serverProps.test.ts:73-75`):

```ts
const alertRow = (code: string) => ({ code, context: {}, raised_at: "2026-07-01T12:00:00.000Z", occurrence_count: 1 });

describe("isShowScopeReachable", () => {
  it("no alerts → reachable", () => {
    expect(isShowScopeReachable(minimal("x"))).toBe(true);
  });
  it("all-global alerts, no carrier, no holds → NOT reachable", () => {
    expect(isShowScopeReachable(minimal("x", { alerts: [alertRow("LIVE_ROW_CONFLICT")] }))).toBe(false);
  });
  it("two different global codes → still NOT reachable", () => {
    expect(
      isShowScopeReachable(minimal("x", { alerts: [alertRow("SYNC_STALLED"), alertRow("WATCH_CHANNEL_ORPHANED")] })),
    ).toBe(false);
  });
  it("mixed global + per-show → reachable", () => {
    expect(
      isShowScopeReachable(minimal("x", { alerts: [alertRow("SYNC_STALLED"), alertRow("DRIVE_FETCH_FAILED")] })),
    ).toBe(true);
  });
  it("all-global WITH a warning carrier → reachable", () => {
    expect(
      isShowScopeReachable(
        minimal("x", {
          alerts: [alertRow("LIVE_ROW_CONFLICT")],
          warnings: [{ severity: "warn", code: "UNKNOWN_FIELD", message: "x" }],
        }),
      ),
    ).toBe(true);
  });
  it("all-global WITH holds → reachable", () => {
    const s = minimal("x", { alerts: [alertRow("LIVE_ROW_CONFLICT")] });
    expect(isShowScopeReachable({ ...s, holds: [HOLD_FIXTURE] })).toBe(true);
  });
  it("an unknown code is reachable (fail toward VISIBLE)", () => {
    expect(isShowScopeReachable(minimal("x", { alerts: [alertRow("NOT_A_REAL_CODE")] }))).toBe(true);
  });
});
```

`HOLD_FIXTURE` reuses the hold shape already present in the `holds` array of `tier3.ts:117`; lift it into a local const rather than importing the scenario, so the test does not couple to a catalogue entry Task 6 edits.

**Failure mode caught:** the two most likely wrong implementations — `.some()` instead of `.every()` (would exclude `T3_FULL_SPLIT` and every mixed composite), and omitting the carrier arm (would exclude any future global-code-plus-fixture scenario).

**Implementation:**

```ts
export function isShowScopeReachable(s: AttentionScenario): boolean {
  if (s.alerts.length === 0) return true;
  if (!s.alerts.every((a) => GLOBAL_SCOPE_CODES.has(a.code))) return true;
  return hasNonAlertCarrier(s) || s.holds.length > 0;
}
```

**Commit:** `feat(admin-dev): isShowScopeReachable predicate for global-scope-only scenarios`

---

### Task 5 — third partition arm + type widening + pins

**Test first:** in `tests/app/admin/attentionModalGallery.serverProps.test.ts`:

```ts
// The exact global set today (checked-in, NOT derived from GLOBAL_SCOPE_CODES:
// deriving it from the constant the implementation reads would pass regardless
// of what the predicate or the partition does).
const EXPECTED_GLOBAL_IDS = [
  "alert-live-row-conflict",
  "alert-onboarding-sheet-unreadable",
  "alert-sync-stalled",
  "alert-watch-channel-orphaned",
].sort();

it("global excluded set is EXACTLY the four checked-in ids", () => {
  const g = excluded.filter((e) => e.reason === "global");
  expect(g.map((e) => e.id).sort()).toEqual(EXPECTED_GLOBAL_IDS);
});

it("cut set is UNCHANGED: the five health globals keep their cut label", () => {
  expect(excluded.filter((e) => e.reason === "cut").map((e) => e.id).sort()).toEqual(EXPECTED_CUT_IDS);
  for (const id of ["alert-webhook-token-invalid", "alert-callback-claim-threw", "alert-github-bot-login-missing", "alert-picker-bootstrap-rpc-failed", "alert-picker-bootstrap-resolve-show-failed"]) {
    expect(EXPECTED_CUT_IDS).toContain(id);
  }
});

it("no scenario is excluded under two reasons", () => {
  const ids = excluded.map((e) => e.id);
  expect(ids.filter((v, i) => ids.indexOf(v) !== i)).toEqual([]);
});

it("rendered = the pre-change baseline minus exactly the four global ids", () => {
  const expected = RENDERED_IDS_BEFORE.filter((id) => !EXPECTED_GLOBAL_IDS.includes(id));
  expect(partitionScenarios().rendered.map((s) => s.id).sort()).toEqual(expected);
});
```

The Task 3 baseline assertion is updated to the subtracted form in this task (it is the same constant, re-used, not re-captured).

**Failure mode caught:** the ordering contract. If the global arm were evaluated before `cut`, the five health globals would be relabelled and the second assertion fails; if the predicate over-matched, the fourth fails.

**Implementation:** widen `lib/dev/galleryModalTypes.ts:55` to `"structural" | "cut" | "global"`, then add the third arm to `partitionScenarios` AFTER the `cut` arm (`buildSwitcherScenarios.ts:125-128`):

```ts
    if (!isShowScopeReachable(s)) {
      excluded.push({ id: s.id, label: s.label, reason: "global" });
      continue;
    }
```

**Commit:** `feat(admin-dev): exclude global-scope-only scenarios from the gallery switcher`

---

### Task 6 — `T3_FULL_SPLIT` composite correction

**Test first:** update the two existing pins to the post-removal expectation and watch them fail against the current catalogue:

- `tests/dev/fullSplitComposite.test.ts:28` drops `"SYNC_STALLED"` from the expected code list; the derived-count assertion at `tests/dev/fullSplitComposite.test.ts:47` goes from `2` to `1`, as does the `it` title at `tests/dev/fullSplitComposite.test.ts:42`.
- `tests/dev/fullSplitCompositeRender.test.tsx:56` and its `it` title at `tests/dev/fullSplitCompositeRender.test.tsx:53` go to `1 to confirm · 2 to review · 1 monitoring`; the self-heal length assertion at `tests/dev/fullSplitCompositeRender.test.tsx:114` goes from `toHaveLength(2)` to `toHaveLength(1)`.

Add one assertion that pins the reason rather than the number, so a future re-add fails with a readable message:

```ts
it("carries no global-scope code (a real show modal could never show one)", () => {
  const s = tier3Scenarios().find((x) => x.id === T3_FULL_SPLIT)!;
  const offenders = s.alerts.map((a) => a.code).filter((c) => GLOBAL_SCOPE_CODES.has(c));
  expect(offenders, `global-scope codes in ${T3_FULL_SPLIT}`).toEqual([]);
});
```

**Failure mode caught:** the count assertions alone would let someone swap `SYNC_STALLED` for `WATCH_CHANNEL_ORPHANED` and stay green at 2. The offender assertion catches the class, not the instance.

**Implementation:** remove the `SYNC_STALLED` row and its stale comment from `lib/dev/attentionScenarios/tier3.ts:113-114`. Replace the comment with one naming the remaining self-healing code and why it is the only one.

**Commit:** `fix(admin-dev): drop the global-scope SYNC_STALLED row from T3_FULL_SPLIT`

---

### Task 7 — UI: third excluded-panel paragraph + transition audit

**Test first:** in `tests/components/admin/dev/switcherControls.test.tsx`, extend `MIXED` (`tests/components/admin/dev/switcherControls.test.tsx:34-36`) with a `reason: "global"` entry and assert:

- all three lines render when all three reasons are present;
- a global-only `excluded` array renders the global line and neither sibling;
- the global line's count comes from the global-filtered list, not `excluded.length` — assert with a fixture of 3 global + 2 cut and expect the global line to say `3`, which a naive `excluded.length` would render as `5`;
- the toggle still reads `5 excluded` for that same fixture (the toggle IS `excluded.length`).

Extend `tests/components/admin/transitionAudit.test.tsx`'s `SERVER_RENDERED` list (`tests/components/admin/transitionAudit.test.tsx:41-62`) with `components/admin/dev/SwitcherControls.tsx`, satisfying the mandatory transition-audit task: the source scan pins that the new paragraph introduces no mount/route-enter animation, matching spec §5.2's all-instant inventory.

**Failure mode caught:** the count-source assertion is the one that matters — a `{excluded.length}` copy-paste in the new paragraph is the most likely implementation slip and reads correct in a single-reason fixture.

**Implementation:** in `components/admin/dev/SwitcherControls.tsx`, add beside `components/admin/dev/SwitcherControls.tsx:67-68`:

```tsx
const global = excluded.filter((e) => e.reason === "global");
```

and after the cut paragraph (`components/admin/dev/SwitcherControls.tsx:139-143`):

```tsx
{global.length > 0 && (
  <p className="text-xs text-text-subtle">
    {global.length} dashboard-level alerts. These are never attached to a show, so this modal
    cannot show them.
  </p>
)}
```

Copy check before committing: no em-dash, no apostrophe, `text-xs`/`text-text-subtle` matching the two sibling lines.

**Commit:** `feat(admin-dev): excluded-panel line for global-scope alerts`

---

### Task 8 — route annotations + exclusion-set control swap

**Test first:** in `tests/admin/attentionExclusionSet.test.ts:110-122`, swap the `LIVE_ROW_CONFLICT` keeper for `SHEET_UNAVAILABLE` (a `FROZEN_REACHABLE` member) and update the assertion. The test's meaning is unchanged — a non-info, non-health code survives the `DOUG_EXCLUDED_CODES` filter — but the code no longer implies `LIVE_ROW_CONFLICT` is a per-show state.

**Failure mode caught:** none new; this is a fidelity repair to an existing test's premise. Stated plainly rather than dressed up as a new guard.

**Implementation:** inline comment on each of the four `ATTENTION_ROUTES` rows in `lib/admin/attentionItems.ts` (`LIVE_ROW_CONFLICT`, `ONBOARDING_SHEET_UNREADABLE`, `SYNC_STALLED`, `WATCH_CHANNEL_ORPHANED`) noting: global-scope producer, row present for registry totality (`_metaAttentionRoutes` set-equality), never reachable through `fetchPerShowAlerts`.

**Commit:** `docs(admin): annotate the four global-scope ATTENTION_ROUTES rows`

---

### Task 9 — impeccable dual-gate

`components/admin/dev/SwitcherControls.tsx` is under `components/`, so plan-wide invariant 8 applies: `/impeccable critique` AND `/impeccable audit` on the affected diff, both with the canonical v3 setup gates (the context load script, then the register reference read). P0 and P1 findings are fixed or explicitly deferred via a `DEFERRED.md` entry. Findings and dispositions are recorded in the close-out section of this plan.

### Task 10 — pre-push gates

In order, all from the worktree root:

```
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
```

`pnpm test` excludes env-bound and e2e suites by design; that is the expected scope. Check `$?` explicitly rather than reading the summary line — vitest exits 1 on uncaught errors even when every test passes.

---

## 2. Task order and dependencies

```
1 ──► 2 ──► 4 ──► 5 ──► 7 ──► 9 ──► 10
            ▲     ▲
       3 ───┘     │
       6 ─────────┘   (6 is independent of 3/4/5; ordered before 7 only to keep the diff readable)
       8 ─────────┘
```

Task 3 must land before Task 4 (the predicate calls `hasNonAlertCarrier`) and before Task 5 (the baseline constant it introduces is subtracted there). Task 2 must land before Task 4 (the predicate reads `GLOBAL_SCOPE_CODES`) and before Task 6's offender assertion.

## 3. Close-out

- [ ] All 10 tasks committed, one commit each, conventional-commits style.
- [ ] `pnpm typecheck` / `lint` / `format:check` / `test` all green, exit codes checked.
- [ ] Impeccable critique + audit findings and dispositions recorded below.
- [ ] Whole-diff cross-model review to APPROVE.
- [ ] Real CI green on the PR (not just local).
- [ ] Merged, local `main` fast-forwarded, `git rev-list --left-right --count main...origin/main` reports `0	0`.

### 3.1 Impeccable findings

_(filled in at Task 9)_
