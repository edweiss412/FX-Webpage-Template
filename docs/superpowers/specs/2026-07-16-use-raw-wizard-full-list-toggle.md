# Wizard use-raw + recognize-role controls in the full Parse-warnings list

**Date:** 2026-07-16 · **Backlog:** `BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE` (BACKLOG.md:43) · **Deferral origin:** `DEFERRED.md` USE-RAW-1 (structural-transform use-raw whole-diff R4, 2026-07-15) · **Class:** UX completeness (P2) · **Surfaces:** wizard Step-3 review only

## 1. Problem

The Step-3 wizard renders the per-warning **use-raw toggle** and **recognize-role control** only inside `SectionFlagCallout`, which caps rendered entries at `CALLOUT_MAX_ENTRIES = 3` per section (`components/admin/wizard/step3ReviewSections.tsx:480`, slice at `:520`). A section with more than 3 recoverable warnings (realistically `ROOM_HEADER_SPLIT_AMBIGUOUS` in a room-heavy show) leaves warnings 4+ with no wizard control — they collapse to "+N more in Parse warnings" (`:591-599`), and the Parse-warnings section they land in (`WarningsBreakdown`, `:2386`) renders **zero** controls today.

The per-show live page has no such cap: it renders `UseRawControlBoundary` and `RoleRecognizeControlBoundary` next to **every** active and ignored actionable warning (`app/admin/show/[slug]/page.tsx:952-960` active, `:997-1005` ignored). This spec brings the wizard's full warnings list to parity.

## 2. Resolved decisions (user-approved 2026-07-16)

1. **Keep both render sites.** `SectionFlagCallout` keeps its capped, in-context toggles unchanged. `WarningsBreakdown` becomes the complete list — every in-scope warning gets its controls there. The cross-site consistency contract is **per control** and is normative in §4.6: use-raw converges via `router.refresh()` on every save; recognize-role performs no client refresh (§8.1 timing contract), so a saved token's sibling instance may remain mounted in create mode — an accepted, pre-existing class whose stale-sibling save resolves to idempotent success or the benign conflict notice (pinned by the §7.5 test).
2. **Both controls, not just use-raw.** `RoleRecognizeControlBoundary` has the identical capped-callout gap for `UNKNOWN_ROLE_TOKEN`; it ships in the same rows.
3. **Approach: optional prop threading** (mirrors the `SectionFlagCallout` pattern at `:504-508`). No context provider, no reuse of the live-page list component.

## 3. Scope

**Changed file:** `components/admin/wizard/step3ReviewSections.tsx` only (component + section registry). Plus new/extended component tests.

**Out of scope:**

- Uncapping or restyling `SectionFlagCallout` (cap is pre-existing §E3 behavior, spec-canonical).
- Any live-page (`app/admin/show/[slug]/page.tsx`) or staged-review-card (`components/admin/StagedReviewCard.tsx`) change.
- New server actions, DB, locks, telemetry. The boundaries reuse `setStagedUseRawDecisionAction` / `mapRoleTokenStaged`, which are already shipped, registered mutation surfaces.

## 4. Behavior

### 4.1 `WarningsBreakdown` props

Current signature: `{ dfid: string; warnings: ParseWarning[] }` (`step3ReviewSections.tsx:2386`). Add two optional props, exactOptionalPropertyTypes discipline (present or ABSENT, never explicit `undefined` — same doc contract as `Step3SectionChrome` at `:465-474`):

- `useRawDecisions?: UseRawDecision[]` — staged decisions for this sheet.
- `wizardSessionId?: string` — the session that binds the staged actions.

### 4.2 Registry wiring

The `warnings` section def (`step3ReviewSections.tsx:3601-3608`) passes both from `SectionData`, which already carries them (`wizardSessionId` at `:2956`, `useRawDecisions` at `:2967`):

```tsx
render: (s) => (
  <WarningsBreakdown
    dfid={s.dfid}
    warnings={s.warnings}
    useRawDecisions={s.useRawDecisions}
    wizardSessionId={s.wizardSessionId}
  />
),
```

Both fields are required on `SectionData`, so the modal path always provides them.

### 4.3 Per-row controls

Inside each warning `<li>`'s text column (the `flex min-w-0 flex-1 flex-col gap-0.5` span, `:2436`), after the existing label/context/"Open in Sheet" block, when `wizardSessionId` is present render:

```tsx
{wizardSessionId ? (
  <UseRawControlBoundary
    surface="wizard"
    wizardSessionId={wizardSessionId}
    driveFileId={dfid}
    warning={w}
    decision={decisionFor(w)}
  />
) : null}
{wizardSessionId ? (
  <RoleRecognizeControlBoundary
    surface="wizard"
    wizardSessionId={wizardSessionId}
    driveFileId={dfid}
    warning={w}
  />
) : null}
```

This is byte-for-byte the callout's mounting pattern (`:567-586`): same boundary components, same wizard surface locator (`driveFileId` = the sheet's `dfid`, required because two sheets in one session can share a warning's `(code, blockRef, contentHash)` — `components/admin/UseRawControlBoundary.tsx:37-40`).

### 4.4 Decision matching — shared helper

The callout's inline `decisionFor` (`:513-519`) matches by `d.code === w.code && w.resolution?.resolvable === true && d.contentHash === w.resolution.contentHash`. Extract it to a module-level exported function in the same file so both render sites share one matcher:

```ts
export function findUseRawDecision(
  w: ParseWarning,
  decisions: UseRawDecision[] | undefined,
): UseRawDecision | undefined;
```

`SectionFlagCallout` and `WarningsBreakdown` both call it. Behavior identical to today's inline closure.

### 4.5 Guard conditions (per prop/input)

| Input | Value | Rendered result |
| --- | --- | --- |
| `wizardSessionId` | ABSENT | No controls anywhere in the breakdown (existing test mounts unchanged). |
| `useRawDecisions` | ABSENT or `[]` | Controls still mount (session present); toggle derives its default un-toggled state from `decision === undefined` (existing `UseRawControl` state machine). |
| `warnings` | `[]` | Existing affirmative empty state (`:2393-2399`); no controls. |
| warning out of scope | code ∉ {`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY`} | `UseRawControl` self-hides — returns `null` via its `IN_SCOPE` guard (`components/admin/UseRawControl.tsx:42-46,58`). |
| warning in scope but `resolution` absent / `resolvable: false` | any | `UseRawControl`'s shipped guard precedence: absent → `legacy-unavailable` note, `resolvable: false` → `disabled` with reason (`deriveUseRawControlState`, `components/admin/UseRawControl.tsx:65-66`); `findUseRawDecision` returns `undefined` (never matches without a resolvable resolution). No new logic. |
| warning not `UNKNOWN_ROLE_TOKEN`, or blank/absent `roleToken` | any | `RoleRecognizeControlBoundary` returns `null` (`components/admin/RoleRecognizeControlBoundary.tsx:48-49`). |
| `severity: "info"` rows | any | Same rules as above — the boundaries key on code/resolution, not severity. |

No component in this diff introduces its own conditional logic beyond the `wizardSessionId ? … : null` mounts and the extracted matcher; every hide/show decision is the shipped boundaries' own.

### 4.6 Mode boundaries / redundancy contract

- **Callout (capped preview, ≤3 entries/section):** unchanged, still actionable.
- **Breakdown (complete list):** the sole surface guaranteed to show controls for **every** in-scope warning.
- A warning in the first 3 of its section's callout therefore has **two** live control instances in the same modal. The consistency contract differs per control:
  - **Use-raw:** both instances read the same persisted `UseRawDecision` (matched by the shared helper) and every save calls `router.refresh()` (`UseRawControlBoundary.tsx:78`), so after any save both instances re-derive from the same persisted row. Mid-flight (pre-refresh) divergence is the shipped control's existing optimistic/in-flight behavior, unaltered here.
  - **Recognize-role:** `RoleRecognizeControlBoundary` deliberately performs NO `router.refresh()` — the saved card is client-local until a later refresh unmounts it (2026-07-15 §8.1 timing contract, `RoleRecognizeControlBoundary.tsx:21-25`). So after one instance saves, a sibling instance for the same token remains mounted in create mode. **This is a pre-existing, shipped class, not one this spec introduces:** `UNKNOWN_ROLE_TOKEN` is emitted per token *occurrence* (`lib/parser/personalization.ts:346-353`), so two crew rows with the same unknown token — or the same token on two sheets in one session — already mount two live create controls in today's callouts. The staged action resolves the stale-sibling save deterministically via its EXISTING-ROW-first branch (`app/admin/onboarding/_actions/roleTokenStaged.ts:70-86`): set-equal grants → idempotent success (re-stage), different grants → `{ ok: false, code: "conflict" }`, which the control renders as its benign §9 conflict notice, never error styling and never a raw code (`components/admin/RoleRecognizeControl.tsx:233-239`). A stale sibling can therefore never corrupt a mapping or mislead terminally — its save either confirms the existing mapping or surfaces the benign conflict notice naming the disagreement. This spec adopts that shipped contract for the breakdown's instances and adds a test pinning it (§7.5); it does NOT alter the §8.1 no-refresh timing contract.

### 4.7 Cap/truncation

The breakdown list is already uncapped (`warnings.map`, `:2412`) and stays uncapped — control count grows with in-scope warning count, no new cap. The callout cap (`CALLOUT_MAX_ENTRIES = 3`) is untouched.

## 5. Transition inventory

New visual states introduced by this diff: control block **mounted** (session present) vs **absent** (no session). That is a build-time/props distinction, never a runtime toggle within a mounted breakdown — **instant, no animation needed** (matches §H N2 precedent for the callout's static render, `:590`).

All intra-control transitions (idle → in-flight → saved/error, stale/conflict notices) belong to the shipped `UseRawControl` / `RoleRecognizeControl` state machines, already pinned by `tests/components/UseRawControl.transitions.test.tsx` and `tests/components/RoleRecognizeControl.test.tsx`. This diff adds mount sites, not states. Compound case — toggling one warning's control while another's is in-flight — is N independent component instances with independent state; no shared client state exists between rows (each boundary is self-contained).

## 6. Dimensional invariants

None. No fixed-height/width parent is introduced; rows grow naturally in a `flex flex-col` list. (Project layout-dimensions task rule not triggered.)

## 7. Testing

New/extended component tests (jsdom is sufficient — no fixed-dimension layout, no animation):

1. **Full-list control coverage:** mount `WarningsBreakdown` with `wizardSessionId` + a fixture of N in-scope resolvable warnings where **N > CALLOUT_MAX_ENTRIES** (import the constant; derive N as `CALLOUT_MAX_ENTRIES + 2` — never hardcode 5), plus ≥1 out-of-scope warning and ≥1 `UNKNOWN_ROLE_TOKEN` warning with a `roleToken`. Assert: use-raw control instances == N (count derived from the fixture filtered by the same in-scope predicate, not a literal); role control instances == count of role-token warnings; out-of-scope rows contain neither. Scope every query inside the row testid `wizard-step3-card-${dfid}-warning-${i}` so a callout rendered elsewhere can never satisfy the assertion (anti-tautology).
2. **Absent-session mount:** no `wizardSessionId` → zero control instances (protects existing standalone mounts).
3. **Decision binding:** pass a `useRawDecisions` entry matching warning i's `(code, contentHash)` with `useRaw: true`; assert row i's control renders its raw-active state and row j (same code, different `contentHash`) does not — proves the shared matcher keys on contentHash, not code alone. Failure mode caught: matcher regression to code-only matching.
4. **Shared-matcher refactor safety:** existing callout tests keep passing (the extraction must be behavior-preserving); run the full `tests/components/admin/wizard/step3ReviewSections.test.tsx` + `tests/components/step3SheetCard.test.tsx` suites.
5. **Duplicate role-control siblings (§4.6 contract):** mount two role controls for the same `roleToken` (as the callout + breakdown pair produces). Save through one (mock `mapRoleTokenStaged` success). Then drive the sibling: (a) mocked set-equal outcome → saved card (idempotent); (b) mocked `conflict` outcome → the benign conflict notice (`role-recognize-conflict` testid), never error styling, no raw code in the DOM. Failure mode caught: a future change that turns the stale-sibling save into a raw-code error or a silent wrong-grants overwrite.

Concrete failure modes: (1) catches the cap regression class itself (a future cap on the breakdown fails the N-derived count); (2) catches control leakage into session-less mounts; (3) catches matcher key drift; (5) pins the stale-sibling contract.

**Meta-test inventory:** none created or extended — no new Supabase call sites, no new mutation surfaces (both boundaries call already-registered actions: `setStagedUseRawDecisionAction`, `mapRoleTokenStaged`, `updateRoleTokenMapping`), no sentinel-hiding text, no advisory-lock code. Declared per project rule: "none applies because the diff is UI-only and reuses registered mutation surfaces."

**Invariant-8 gate:** `/impeccable critique` + `/impeccable audit` on the affected diff before cross-model review; P0/P1 fixed or `DEFERRED.md`-deferred.

## 8. Flag lifecycle

No new flags, toggles beyond the shipped per-warning decision (storage `pending_syncs` staged decisions; write path `setStagedUseRawDecisionAction`; read path `SectionData.useRawDecisions`; effect = parse overlay — all pre-existing, unchanged).

## 9. Invariants check

- Invariant 5 (no raw codes): titles keep flowing through `reviewWarningTitle` (`:2358`); the boundaries' error paths render plain copy (shipped behavior).
- Invariant 2 (advisory locks): untouched — no mutation-path change.
- Invariant 10 (mutation observability): no new mutation surface.
- Routing: UI file → Opus-owned (this session).
