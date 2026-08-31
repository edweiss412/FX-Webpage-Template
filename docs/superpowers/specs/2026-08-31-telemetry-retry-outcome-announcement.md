# Spec: the telemetry retry announces its outcome, not just its intent

**Date:** 2026-08-31 · **Branch:** `feat/telemetry-retry-outcome` · **Closes:** `TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1` (DEFERRED.md, heading `### TELEMETRY-RETRY-OUTCOME-ANNOUNCEMENT-1`)

Deferring arc: `feat/telemetry-fallback-retry`, plan `docs/superpowers/plans/2026-08-27-telemetry-fallback-retry.md`, closeout beside it. That arc shipped the intent half (impeccable critique P1, disposition DEFERRED in the closeout's §12 table); this arc ships the outcome half.

## 1.1 Resolved scope — do not relitigate

- **The three dead ends are measured, not assumed.** (1) `router.refresh(): void` returns no promise; nothing to await. (2) `bfcacheId` explicitly stays the same across `refresh()`, per its own doc comment. (3) A sync `useTransition` never exposes pending in this harness (probed by the deferring arc, FAILED); an async one needs something real to await, and (1) says there is nothing; a timer would make `aria-busy` lie. Both type-declaration facts live in Next's vendored app-router shared-runtime type declarations (untracked vendor file under `node_modules`; re-verified on this branch 2026-08-31: `refresh(): void`, and the `bfcacheId` doc "Stays the same for ... router.refresh()"), and all three probes are recorded on the DEFERRED.md row body and in the closeout §12 table. Settled; a review round re-proving any of them is a review defect.
- **Intent-only was the right ship for the deferring arc.** Its closeout fenced that decision. This spec's mandate is the outcome half only.
- **No pending disable.** `TelemetryRetryButton.tsx` doc block ("No pending state, deliberately", `components/admin/telemetry/TelemetryRetryButton.tsx:25-27`): a disable could strand a surface whose entire defect is having no recourse. This arc does not add `disabled`, `aria-busy`, or any visual pending state. See Documented limits.
- **The census's indirect-usage limit stands.** `tests/components/telemetry/telemetryRetryButtonSites.test.ts` header records the documented limit (aliased/`createElement` usage invisible) and its re-file trigger. This arc widens the canonical form (see §5.2) and does not reopen the AST-walk decision.
- **Copy is settled in this spec plus adversarial review** (fenced by the 2026-08-31 dispatch brief, which lives outside the repo); it is not an Eric ruling. Register: calm, matching the sibling fallback copy (`Couldn’t load … right now.`, e.g. `app/admin/dev/telemetry/page.tsx:88`).
- **Success stays silent by construction.** On a successful re-read the fallback branch unmounts and takes the control and its live region with it (closeout, "The one behavioural limit"). The 20-second auto-refresh already performs that swap unannounced. Out of scope.

## 2. The mechanism (pre-derived on the row; this section binds it)

The honest completion signal is one the server render changes. All three call sites hold a per-render timestamp today:

- `app/admin/dev/telemetry/page.tsx:28` — `const now = await nowDate();`, in scope at the cron fallback (health ternary at `app/admin/dev/telemetry/page.tsx:78-92`, control at `app/admin/dev/telemetry/page.tsx:90`).
- `components/admin/telemetry/EventTimeline.tsx:12` — receives `now: Date` as a prop; control at `components/admin/telemetry/EventTimeline.tsx:23` in the `infra_error` branch.
- `components/admin/telemetry/HealthAlertsPanel.tsx:272-276` — computes its own `now` via `Promise.all([..., nowDate()])`; control at `components/admin/telemetry/HealthAlertsPanel.tsx:295`.

`nowDate()` (`lib/time/now.ts:22`) returns a fresh `Date` per call in production shape; the frozen-header branch is gated behind `ENABLE_TEST_AUTH === "true"` plus a bearer secret (`lib/time/now.ts:23-48`).

**Threading.** `TelemetryRetryButton` gains a required prop `renderedAt: number` (epoch milliseconds). Every call site passes `renderedAt={now.getTime()}` from its own per-render `now`. A number, not a `Date`: primitive equality, `Number.isFinite` guardable, serializes across the RSC boundary with no identity question.

**Detection.** The control records the `renderedAt` it sees at tap time (the baseline). `router.refresh()` re-renders the server tree; if the branch still fails, the same client component instance (state preserved — same position, no remount) receives a new, different `renderedAt`. A changed value while a baseline is recorded means: a server re-read completed and this branch still failed. That is a settled outcome worth announcing. The baseline clears on announcement so later renders stay silent until the next tap.

The changed value need not come from the tapped refresh specifically. The 20-second auto-refresh poll (`AUTO_REFRESH_MS = 20_000`, `components/admin/telemetry/AutoRefreshControl.tsx:6`) can land first; the announcement is still honest, because any changed `renderedAt` on a still-mounted fallback is a fresh server read of the same loader that still failed.

## 3. Behavior contract

Let `finite(x)` mean `Number.isFinite(x)`.

1. **Mount:** status region rendered with the button, empty. Unchanged (`TelemetryRetryButton.tsx:80`, pinned by `telemetryRetryButton.test.tsx` case 1).
2. **Tap:** announce intent `Retrying {what}` (`retryAnnouncement`, `TelemetryRetryButton.tsx:49`, unchanged); if `finite(renderedAt)`, record `baseline = renderedAt`. If not finite, record nothing.
3. **Render while baseline recorded and `finite(renderedAt)` and `renderedAt !== baseline`:** announce outcome `Still couldn’t load {what}`; clear the baseline. This is the new behavior.
4. **Render while baseline recorded and `renderedAt === baseline`:** no change to the region (the RSC payload has not arrived yet, or arrived within the same millisecond — see Documented limits).
5. **Render with no baseline recorded** (auto-refresh with no tap in flight): silent, whatever `renderedAt` does. Matches today's auto-refresh silence.
6. **Repeats distinguishable:** any two consecutive announcements, identical text or not, must be perceivable as separate utterances by a screen reader. Mechanism: a sequence counter drives the trailing ` ` parity, subsuming the current `attempts % 2` toggle (`TelemetryRetryButton.tsx:81-85`; precedent `components/admin/ShowRowActions.tsx:608`). The existing pinned contract "a second activation is distinguishable from the first" (`telemetryRetryButton.test.tsx`, case 3) must keep passing.
7. **Tap while an outcome is pending** (double-tap before the refresh lands): announce intent again (parity makes it heard), re-record `baseline` from the current `renderedAt`. One outcome per settled re-read, not one per tap.
8. **State adjustment happens during render** (React's adjust-state-when-props-change idiom), not in an effect, so the announcement text and the clearing of the baseline land in the same committed render as the new prop. The plan carries the exact shape.

## 4. Copy

- Intent (unchanged): `Retrying {what}` — `retryAnnouncement` at `TelemetryRetryButton.tsx:49`.
- Outcome (new): `Still couldn’t load {what}`, exported as `retryOutcomeAnnouncement(what)` beside `retryAnnouncement` so a call site cannot spell them independently. Curly apostrophe (house rule, DESIGN.md §9; sibling copy `Couldn’t load activity right now.` at `EventTimeline.tsx:22`). No em dash, no `--` (DESIGN.md §9, enforced by `tests/styles/_metaEmDashCopy.test.ts`). Calm register per PRODUCT.md density/rhythm posture: states the fact, instructs nothing, no exclamation.
- The two strings must differ for every `what` (trivially true by prefix; asserted anyway, see §5.3).

## 5. Guards

### 5.1 The owed guard on the signal itself

Row-stated fragility: if `nowDate()` were ever memoized stable across server renders, the announcement silently dies and no existing test reds. The guard is on the SIGNAL, not the string: a test that calls `nowDate()` twice with the clock advanced between calls (fake timers) and asserts the returned instants differ. If someone wraps `nowDate` in a module-level constant or a cross-request memo, this reds. A per-request React `cache()` wrap would not trip it and would not break the feature (each refresh is a new request); the guard pins exactly the property the feature needs: fresh value per call under an advancing clock.

### 5.2 The threading guard (census widening)

`telemetryRetryButtonSites.test.ts` pins the canonical call-site form and its totality bridge (tag mentions == canonical matches). Adding a third prop makes every site diverge from the shipped two-prop `CANONICAL` regex, so the bridge reds on this diff by design — the case's own text names the remedy: "widen the pattern deliberately." The widened canonical form is exactly:

```
<TelemetryRetryButton what="…" testId="…" renderedAt={now.getTime()} />
```

with `renderedAt={now.getTime()}` a fixed literal expression, identical at all three sites (each site has a local `now: Date` in scope, §2). The census additionally asserts every canonical site carries that exact expression, so a fourth site added without threading the timestamp reds at the census, and an aliased-variable drift (`renderedAt={0}`, `renderedAt={then.getTime()}`) reds the bridge. This is a fixed-string widening, not a recognizer: the expression is pinned verbatim, and any legitimate future divergence is a deliberate re-widening with its reason.

### 5.3 Component behavior tests

`telemetryRetryButton.test.tsx` gains cases for contract items 3, 4, 5, 7 (§3), the NaN guard, and intent/outcome string divergence. Assertions read the RENDERED region text (existing anti-tautology posture in that file: "Asserted on the RENDERED text rather than on the constant"). Rerender with a changed `renderedAt` prop simulates the RSC payload landing; `telemetryPage.test.tsx` already models a refresh that re-renders (its retry cases install a re-rendering `refresh` implementation, `tests/app/admin/telemetryPage.test.tsx:47`).

## 6. Guard conditions for every prop (spec-self-review)

| Prop | null/undefined | NaN / non-finite | 0 | empty string |
| --- | --- | --- | --- | --- |
| `what` | TS-required; census rejects empty (`telemetryRetryButtonSites.test.ts`, "none is empty") | n/a | n/a | census reds |
| `testId` | TS-required; census uniqueness | n/a | n/a | census reds |
| `renderedAt` (new) | TS-required; census pins presence at every site | never recorded as baseline; outcome never announced; intent behavior unchanged (§3.2) | valid epoch; normal comparison | n/a |

A non-finite `renderedAt` degrades to exactly the shipped intent-only behavior: conservative, silent on the new half, never a wrong announcement.

## 7. Mode boundaries, transitions, dimensions

One mode; no shared elements across modes because there is only one.

### 7.1 Dimensional Invariants

None introduced. No fixed-dimension parent is added or changed; the only mutated DOM is the `sr-only` status region's text, which renders at zero visual size by definition. The control's plate layout (parent flex container tokens) is pinned by the census's container-parity case (`telemetryRetryButtonSites.test.ts`, "every site's fallback plate carries the same container layout") and this diff does not touch it.

### 7.2 Transition Inventory

Region text states: {empty, intent, outcome}. N=3, so three pairs:

| Pair | Treatment |
| --- | --- |
| empty ↔ intent | instant — no animation needed (`sr-only` region, no visual rendering) |
| intent ↔ outcome | instant — no animation needed (same) |
| empty ↔ outcome | unreachable by construction (an outcome requires a recorded baseline, which requires a tap, which announces intent first; §3.3) — and instant if ever rendered |

Compound transitions: none — the region is the only stateful visual element in the component, and it is invisible. `tests/components/telemetry/transitionAudit.test.tsx` pins "every OTHER telemetry component is instant"; this diff keeps `TelemetryRetryButton` in that instant population (no `AnimatePresence`, no `motion`).

## 8. Documented limits

1. **Same-millisecond re-render:** two server renders inside one millisecond produce equal `renderedAt`; the outcome stays unannounced until the next differing render. Worst case is silence identical to today's shipped behavior, never a wrong announcement.
2. **Frozen-clock capture environment:** under `ENABLE_TEST_AUTH` with a valid frozen-now header (`lib/time/now.ts:36-48`), `renderedAt` is stable across renders and the outcome never fires. Screenshot-capture-only environment, gated by a bearer secret; the feature is inert there by construction.
3. **Outcome text does not say WHY.** The failure cause is the plate's own paragraph; the announcement settles the outcome, not the diagnosis. Sibling row `DIAGRAM-PLACEHOLDER` (DEFERRED.md) owns the why-half on its surface.
4. **No pending/`aria-busy` state.** Deliberate (§1.1). The baseline mechanism would support an honest one; whether to add it is a future product call, not this row.
5. **Indirect component usage** stays outside the census, unchanged (its header's documented limit and re-file trigger).
6. **Success remains silent** (unmount, §1.1).

## 9. Acceptance criteria

- AC-1: A tap announces `Retrying {what}` and records a baseline when `renderedAt` is finite. (Existing intent contract preserved.)
- AC-2: A subsequent render with a different finite `renderedAt` announces `Still couldn’t load {what}` exactly once and clears the baseline.
- AC-3: A render with a changed `renderedAt` and NO recorded baseline announces nothing.
- AC-4: A render with an unchanged `renderedAt` announces nothing new.
- AC-5: With non-finite `renderedAt`, no baseline is ever recorded and no outcome is ever announced; intent behavior is unchanged.
- AC-6: Consecutive announcements are pairwise perceivable (sequence-driven parity); the existing "second activation is distinguishable" case keeps passing.
- AC-7: All three call sites pass `renderedAt={now.getTime()}` verbatim; the census's widened canonical form and totality bridge are green, and a site missing the prop reds.
- AC-8: The signal guard reds when `nowDate()` returns a stable instant across calls under an advancing clock.
- AC-9: Outcome copy carries no em dash and uses the curly apostrophe; intent and outcome strings differ for every non-empty `what`.
- AC-10: The invariant-8 impeccable dual gate runs on the affected diff and the sibling closeout carries the `impeccable-gate:` marker with dispositions recorded.
- AC-11: The ledger row is graduated to the archive with its IN PROGRESS marker removed in the PR's last commit; the marker never reaches main.

(AC-10 and AC-11 were added after spec round 1's APPROVE to give the plan's process tasks citable criteria; they restate standing repo invariants — AGENTS.md invariant 8 and invariant 12 — rather than new design, and the plan-stage review covers them.)

## 10. Test-surface inventory (files this diff touches)

- `components/admin/telemetry/TelemetryRetryButton.tsx` — prop, baseline state, outcome announcement, exported `retryOutcomeAnnouncement`.
- `app/admin/dev/telemetry/page.tsx`, `components/admin/telemetry/EventTimeline.tsx`, `components/admin/telemetry/HealthAlertsPanel.tsx` — one-line prop threading each.
- `tests/components/telemetry/telemetryRetryButton.test.tsx` — new behavior cases (§5.3).
- `tests/components/telemetry/telemetryRetryButtonSites.test.ts` — widened canonical form + threading assertion (§5.2).
- `tests/lib/time/` (or the suite the plan names) — the signal guard (§5.1).
- `tests/app/admin/telemetryPage.test.tsx`, `tests/components/telemetry/eventTimeline.test.tsx` — updated only as the prop threading requires (`HealthAlertsPanel`'s coverage lives in `telemetryPage.test.tsx`; there is no dedicated suite for it); their pinned contracts are unchanged.

No DB, no migration, no RPC, no flag: the tier×domain matrix, CHECK/enum matrix, and flag lifecycle table are N/A — client/RSC prop threading only. No enrolled mutation surface is touched (checked against `tests/mutation/source/registry.ts` at Stage 0; none of the files above appears as a `sourcePath`).
