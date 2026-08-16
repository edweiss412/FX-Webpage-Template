# Server Action origin-gate sweep — same-origin gate on every destructive Server Action

**Date:** 2026-08-16
**Branch:** `fix/server-action-origin-sweep`
**Closes:** `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP`
**Routing:** implementation is Opus + Claude Code. The diff touches files under `app/` (non-`app/api`) — by the invariant-8 letter those are UI surfaces, so the impeccable dual-gate runs on the diff at implementation close-out even though no rendered element changes (§5).

This arc finishes what `fix/auth-picker-hardening` started. That arc built `isSameOriginServerAction()` (`lib/auth/sameOriginServerAction.ts:31`) and gated the three `clearIdentity.ts` endpoints, deliberately re-filing the peer surfaces as `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` (class-sweep exception (c); reference spec `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §3.5). This spec:

1. **Derives the census mechanically** — every Server Action surface unit under `app/`, `lib/`, and `components/`, enumerated by the repo's own invariant-10 AST engine, not by grep (§2).
2. **Gates every destructive action** — 47 actions get the same-origin gate as their first statement, in the refusal idiom their surface already uses (§3).
3. **Makes the census a living derivation** — a structural meta-test walks the same enumeration and fails on any future ungated action, so the census cannot rot (§3.6).

No rendered element, no copy, no catalog row, and no DB object changes. The threat closed is the same logout/CSRF primitive the reference arc reproduced from framework source: Next 16's built-in check lets a cross-site POST through when the `Origin` header is absent (reference spec §2.1).

---

## 1.1 Resolved scope — do not relitigate

Each row is a settled decision with its ratifying evidence. Reviewers verify the citation; they do not re-derive the decision.

| # | Decision | Ratified by |
| --- | --- | --- |
| 1 | **The mechanism is the per-action in-code gate via `isSameOriginServerAction()`, applied additively to admin actions already behind a `require`-gate.** A middleware/global chokepoint (matching on Next's `next-action` request header) was considered and rejected: that header is an undocumented framework internal, and the arc brief ratifies the per-action design. Do not propose a transport-level alternative. | Backlog entry `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` (BACKLOG.md, "Trigger / first step"); reference spec §3.2–3.3 |
| 2 | **The helper's truth table is inherited unchanged, including the neither-signal-allowed documented limit and the `same-site` rejection.** Both were fenced in the reference arc; neither is re-opened here. | Reference spec §1.1 rows 1–2, §3.3, §7 |
| 3 | **Admin-gated actions refuse via Next's `forbidden()` interrupt.** That is the refusal channel these surfaces already use for an authed-but-not-admin caller: `resolveAdminIdentity` calls it at `lib/auth/requireAdmin.ts:273`, and `requireAdmin` (`lib/auth/requireAdmin.ts:294`) reaches it through that resolver; the helper is enabled by `authInterrupts` (`next.config.ts:43`). `forbidden()` returns `never`, so one shared helper typechecks against every admin return shape — `Promise<void>`, `Promise<never>`, and every typed-result union — with zero union changes and zero client churn. | §3.3; `resolveAdminIdentity` at `lib/auth/requireAdmin.ts:273` |
| 4 | **Crew picker actions refuse with `{ ok: false, code: "PICKER_INVALID_INPUT" }`, mirroring their already-gated siblings.** No new returned literal, no catalog change — `PICKER_INVALID_INPUT` is catalogued and is exactly what `rejectCrossOrigin` returns today (`lib/auth/picker/clearIdentity.ts:57`). | §3.4; reference spec §1.1 row 9 |
| 5 | **One new forensic code `SERVER_ACTION_ORIGIN_REJECTED`, riding `log.warn` only — never returned, never rendered, no catalog row.** The scanner-exemption for codes inside `log.*` spans is ratified precedent: `PICKER_ORIGIN_REJECTED` ships on main inside a `log.warn` span and `x1` is green (`lib/auth/picker/clearIdentity.ts:60`; `PRODUCER_RE` matches returned literals only after `stripLogEmissionCalls`, `lib/messages/__internal__/codeProducers.ts:14`). Picker-family sites keep the existing `PICKER_ORIGIN_REJECTED` so picker CSRF stays one forensic query. | §3.3–3.4 |
| 6 | **`headers()` throwing (no request scope) means allow.** A direct server-side invocation — a Vitest suite calling the action as a function, an internal server-to-server call — has no request and can carry no victim cookies, so CSRF is unreachable there; refusing would break 35 of the 37 existing suites that import these actions (§2.3 probe) for zero security gain. The catch is scoped to the `headers()` call alone. This is a deliberate, fenced widening of the shipped helper, pinned by a new truth-table row (§6A). | §3.2, §7 |
| 7 | **Read-only actions are not gated.** A cross-site POST to a read-only action mutates nothing, and the same-origin policy already prevents the attacker reading the response. The three read-only units are registry-exempted with an AST tripwire, not silently skipped (§3.5). | §3.5, §7 |
| 8 | **Mutating route handlers (including `app/api/admin/**`) are out of scope.** Different transport, different entry; the backlog entry fences this explicitly. | `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` entry text |
| 9 | **The three inline `.tsx` form-action wrappers are exempted as verified delegators, not edited.** Each unconditionally delegates in its FIRST statement to a module action this arc gates, so the callee's first-line gate runs on the same request headers before any mutation. This mirrors the invariant-10 `ADMIN_SURFACE_EXEMPTIONS` "delegator to a registered surface" pattern, and the meta-test verifies the delegation shape in the AST rather than trusting the registry row (§3.5–3.6). Keeping them unedited also keeps `components/` out of the diff. | §3.5–3.6; AGENTS.md invariant 10 (`ADMIN_SURFACE_EXEMPTIONS`) |
| 10 | **Behavioral proof is per-shape representative, structural proof is per-action.** The meta-test pins gate-first placement for all 56 units; the helper's truth table pins the gate's decision; three representative per-shape tests pin refusal value + no-mutation + emit for each refusal idiom. Per-action behavioral suites for 47 actions would multiply review scope with no marginal proof — the composition (placement × helper behavior × per-shape refusal) covers the class. Do not file rounds demanding per-action behavioral tests. | §6 |
| 11 | **The census counts in this spec are dated at-authoring-time measurements; the executable source of truth going forward is the meta-test.** A count drifting after a future action lands is not a spec defect — the meta-test is the derivation that gates. | §2.2, §3.6 |
| 12a | **The class-B refusal helper's return type is the structural literal, not an imported alias.** `CleanupStaleEntryResult` is module-private (declared without `export`), so no shared helper can annotate against it, and widening it to `export` is churn on a surface this arc otherwise leaves alone. Do not file "should import the named type". | §3.4; `lib/auth/picker/cleanupStaleEntry.ts:26` |
| 12b | **Gating cannot break a page render, and that is derived rather than argued.** A scan of every Next entry file under `app/`, and then of every `.ts`/`.tsx` under `app/`, `components/`, and `lib/`, finds exactly two render-time invocations of any census unit, both read-only and both exempted; every to-be-gated call site is a client-component interaction handler. Do not re-derive this from the diff. | §2.4 |
| 12 | **`isSameOriginServerAction` is enrolled in the source-mutation guard registry as part of this arc.** It is a guard surface with an importable module and a referring suite (`tests/auth/sameOriginServerAction.test.ts`, shipped by the reference arc), i.e. registry-expressible; enrolment precedes the diff review per the AGENTS.md convergence contract, and the diff-review brief states the score plus the unaccepted-survivor set. | §6E; AGENTS.md "Convergence criterion" bullet 4 |

---

## 2. Background — probed, not theorized

### 2.1 The threat (inherited, not re-derived)

Next 16's Server Action handler validates `Origin` against the host but lets a request with **no** `Origin` header through (reproduced from framework source in the reference spec §2.1). A cross-site POST that omits `Origin` reaches the action. Any destructive action reachable this way is a logout/CSRF-class primitive: the attacker forces a signed-in victim's browser to POST, riding the victim's cookies. Per-action blast radius varies (deleting a picker entry, archiving a show, revoking an admin, truncating the dev schema) but the vector is one vector, and the fix is one line per action.

### 2.2 The census is derived, and the filed snapshot was wrong in both directions

The backlog entry's probe (`rg -n '"use server"' lib app`) reported 38 matching paths at filing time. It is wrong in two directions:

- **Eight of those paths carry no directive** — the match is a comment or a string literal. Reproduced by `for f in $(rg -l '"use server"' lib app); do rg -q '^\s*"use server";' "$f" || echo "$f"; done`, which prints exactly: `lib/auth/picker/validateClearIdentityInput.ts`, `lib/audit/authPrimitives.ts` (string literals inside an AST auditor), `app/admin/show/[slug]/_actions/index.ts`, `lib/dev/materialize/run.ts`, `app/admin/show/[slug]/_actions/shared.ts`, `lib/admin/bellTriage.ts` (a comment citing a `"use server"` chain), `lib/admin/watchRetryError.ts`, `lib/async/deferPostResponse.ts` (a comment explaining why it is NOT such a module).
- **The grep's roots missed `components/`** — `components/auth/IdentityChip.tsx` carries a function-scoped inline `"use server"` action (`components/auth/IdentityChip.tsx:31`).

So this spec derives the census with the repo's own invariant-10 enumeration engine: `collectSurfaceUnits(["app", "lib", "components"])` (`tests/log/mutationSurface/enumerate.ts:357`), the same walk the mutation-surface observability meta-test runs (`tests/log/_metaMutationSurfaceObservability.test.ts:640`). It parses directives as leading string-literal statements (comments cannot match), enumerates every export form of a module-level `"use server"` file, and finds function-scoped inline actions. Probe result, re-derived 2026-08-16 at `origin/main` (119895a7c):

- **56 Server Action surface units** (routes excluded) across **31 files**: 53 module-level actions + 3 inline actions.
- The two derivations reconcile exactly: 38 grep paths − 8 comment-only = 30 directive-bearing modules under `lib/` + `app/`, plus the one `components/` file the grep's roots excluded, = the 31 files the engine walks. Neither number is an estimate.
- Spot-checks confirmed the AST engine against the false positives (e.g. `components/admin/BellPanel.tsx:140` is a comment; the engine reports no unit there).

Per-unit signals were probed with `scanBody` (`tests/log/mutationSurface/enumerate.ts:95`) plus body reads: admin `require`-gate presence, direct write-builder/RPC calls, cookie writes, `signOut`, `redirect`, and declared return types (the full first-statement + return-type transcript is reproduced in the review dispatch).

### 2.3 The test-context probe (drives Resolved scope #6)

`isSameOriginServerAction` reads `next/headers` `headers()`, which throws outside a request scope. 37 existing test suites import the target action modules and invoke them directly as functions; only 2 of the 37 mock `next/headers` today (probe: per-suite `rg 'vi\.mock\("next/headers"'` over the import graph). Without Resolved scope #6, gating 47 actions would force a `headers()` mock into ~35 suites — a large mechanical diff whose only purpose is to feed the gate a signal that "this is not a browser request," which is exactly what the thrown error already says. The catch-allow branch encodes that fact once, in the helper, where the truth table pins it.

The one shipped precedent agrees: the already-gated `clearIdentity.ts` suite added a same-origin `headers()` default when the reference arc landed (`tests/auth/picker/clearIdentity.test.ts:27`) — workable for one suite, not for thirty-five.

### 2.4 The render-path probe (drives Resolved scope #7, and is the reason the read-only class is safe to exempt AND necessary to exempt)

A gate that refuses `sec-fetch-site: cross-site` breaks any action invoked during a GET render, because a top-level navigation arriving from an external link carries exactly that value. So "is any census unit called while a page renders?" is not a stylistic question — it decides whether this sweep can ship at all.

Answered by derivation, not by reading the obvious files. A scan over every Next entry file under `app/` — the page, layout, template, default, loading, error, not-found, and route-handler filenames, 103 such entry files — for a call to any of the 56 census names returns **two** sites, and both are read-only units this spec exempts:

```
app/admin/dev/page.tsx:68   const fixtures = await listFixtures();
app/admin/dev/page.tsx:78   result = await getStagedResult(selected);
```

Widened to every `.ts`/`.tsx` under `app/`, `components/`, and `lib/` outside the 31 defining files (887 in total), every call site of a to-be-gated unit sits in a **client** component and fires on user interaction:

| Call site | Unit called |
| --- | --- |
| `components/admin/ShowRowActions.tsx:436` | `archiveShowAction` |
| `app/admin/settings/roles/RoleMappingRow.tsx:110` | `updateRoleTokenMapping` |
| `app/admin/settings/roles/RoleMappingRow.tsx:126` | `deleteRoleTokenMapping` |
| `components/admin/RoleRecognizeControlBoundary.tsx:63` | `updateRoleTokenMapping` |
| `components/admin/RoleRecognizeControlBoundary.tsx:70` | `mapRoleToken` |
| `components/admin/RoleRecognizeControlBoundary.tsx:71` | `mapRoleTokenStaged` |
| `components/admin/MaintenanceResetButtons.tsx:121` | `resetValidationDataAction` |
| `components/admin/MaintenanceResetButtons.tsx:144` | `reseedValidationFixturesAction` |
| `components/admin/settings/AutoPublishToggle.tsx:102` | `setAutoPublish` |
| `components/admin/UseRawControlBoundary.tsx:71` | `setUseRawDecisionAction` |
| `components/admin/UseRawControlBoundary.tsx:72` | `setStagedUseRawDecisionAction` |
| `app/admin/show/[slug]/ResetPickerEpochButton.tsx:151` | `resetPickerEpoch` |
| `components/admin/RecentAutoAppliedStrip.tsx:401` | `undoFromDashboardAction` |
| `app/show/[slug]/[shareToken]/_StaleCleanupAutoSubmit.tsx:57` | `cleanupStaleEntry` |

Each is a browser-issued Server Action POST from a page already on this origin, so its `sec-fetch-site` is `same-origin` and the gate allows it.

Two consequences the design leans on. First, **no gated action is reachable on a render path**, so no navigation can be broken by this sweep. Second, the read-only exemption is not merely defensible on CSRF grounds (Resolved scope #7) — it is load-bearing: `listFixtures` and `getStagedResult` are precisely the units a page awaits during render, and gating them would refuse the dev panel with a 403 for anyone arriving from an external link. That the read-only class and the render-called class coincide is a measured fact here, not a coincidence to rely on going forward, which is why the meta-test pins the exemption registry rather than trusting it (§3.6).

---

## 3. Design

### 3.1 Unit classes and dispositions

Every one of the 56 units falls into exactly one class. The census table in §3.7 assigns each unit its class with `file:line`.

The discriminator is **destructive vs read-only**, NOT admin-gated vs not. All three class-E units are behind a `require`-gate too (`requireDeveloper`), so "a `require`-gate as the first act" separates nothing — it is true of 45 of the 56. What separates A from E is whether the body can mutate.

| Class | Count (at authoring) | Disposition |
| --- | --- | --- |
| **A — admin-gated AND destructive** (behind `requireAdmin` / `requireAdminIdentity` / `requireDeveloper` / `requireDeveloperIdentity`, and mutates) | 42 | Gate first-line, additively, via `await assertSameOriginServerAction("<fn>", "<source>")` — refusal logs `SERVER_ACTION_ORIGIN_REJECTED` and interrupts with `forbidden()` (§3.3) |
| **B — crew destructive, typed picker result** | 4 | Gate first-line via the picker idiom — refusal logs `PICKER_ORIGIN_REJECTED` and returns `{ ok: false, code: "PICKER_INVALID_INPUT" }` (§3.4) |
| **C — crew destructive, useActionState** (`confirmUnpublishAction`) | 1 | Gate first-line — refusal logs `SERVER_ACTION_ORIGIN_REJECTED` and returns `{ status: "neutral" }`, the action's own missing-field refusal value (`app/show/[slug]/unpublish/actions.ts:43`) (§3.4) |
| **D — already gated** (the `clearIdentity` family) | 3 | Unchanged: `clearIdentity` (gate at `lib/auth/picker/clearIdentity.ts:81`), `clearIdentityAndSkip` (gate at `lib/auth/picker/clearIdentity.ts:107`), `clearIdentityCore` (gate at `lib/auth/picker/clearIdentity.ts:211`) |
| **E — admin-gated but read-only** | 3 | Registry-exempt `read-only`, with an AST tripwire (§3.5) |
| **F — inline `.tsx` pure delegators** | 3 | Registry-exempt `delegates-to-gated`, AST-verified (§3.5) |

42 + 4 + 1 = **47 newly gated actions**; 47 + 3 + 3 + 3 = 56.

### 3.2 Helper changes (`lib/auth/sameOriginServerAction.ts`)

Two additive changes; the decision logic and truth table are untouched.

**(a) Scoped catch on `headers()`** (Resolved scope #6):

```ts
export async function isSameOriginServerAction(): Promise<boolean> {
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    // No request scope: a direct server-side invocation (a test calling the
    // action as a function, an internal call). Not a browser request, so no
    // victim cookies and no CSRF surface. Documented limit (spec §7).
    return true;
  }
  // ...existing decision logic unchanged
}
```

The catch wraps ONLY the `headers()` call — a fault in `resolveSiteOrigin` or the decision logic still propagates.

**(b) The admin refusal helper**, exported from the same module:

```ts
import { forbidden } from "next/navigation";
import { log } from "@/lib/log";

/**
 * First line of every admin-gated Server Action (class A). Allows same-origin
 * requests; on a cross-origin request it emits the forensic
 * SERVER_ACTION_ORIGIN_REJECTED and interrupts with forbidden(), the same
 * refusal channel requireAdmin uses for an authed-but-not-admin caller,
 * before any auth work or mutation.
 */
export async function assertSameOriginServerAction(
  action: string,
  source: string,
): Promise<void> {
  if (await isSameOriginServerAction()) return;
  log.warn("cross-origin server action refused", {
    source,
    code: "SERVER_ACTION_ORIGIN_REJECTED", // forensic; rides the log span, stripped by stripLogEmissionCalls
    action,
  });
  forbidden();
}
```

`forbidden()` returns `never`, so the awaited call composes with every class-A return type (`Promise<void>`, `Promise<never>`, and each typed-result union) with no per-union refusal value to choose and no union widened. The victim of a forged top-level form POST sees the 403 boundary — the same page an authed-but-not-admin caller already gets from `requireAdmin` — with no mutation performed.

### 3.3 Class A — admin actions

The gate is the **first statement** of each action, BEFORE the `require`-gate (refuse before any auth I/O, matching the reference "refuse before any teardown" ordering):

```ts
export async function archiveShowAction(slug: string): Promise<LifecycleResult> {
  await assertSameOriginServerAction("archiveShowAction", "admin.show.archive");
  await requireAdmin();
  // ...existing body unchanged
}
```

The first argument is pinned by the meta-test to equal the exported function name (§3.6), so the forensic emit can never mis-attribute; the second is a stable source tag following the file's existing `logAdminOutcome`/`log` source conventions (exact tags fixed in the plan's per-file tasks). Two same-named actions (`acceptChangeAction` in `app/admin/_actions/autoApplied.ts:42` and `app/admin/show/[slug]/_actions/feed.ts:175`) are disambiguated by `source`.

Ordering note: the gate performs no I/O beyond reading request headers, holds no lock, and precedes every `withShowLock`/advisory-lock region — invariant 2 topology is untouched.

### 3.4 Classes B and C — crew actions

**Class B** mirrors the gated siblings exactly. A shared refusal helper lives in a NEW plain (non-directive) module lib/auth/picker/rejectCrossOriginPicker.ts (plain text: it does not exist yet) — it cannot live in the `"use server"` action files themselves, which may only export async functions (precedent: `lib/auth/picker/validateClearIdentityInput.ts` header comment). It reproduces the emit shape of `rejectCrossOrigin` (`lib/auth/picker/clearIdentity.ts:57`): `log.warn` with `code: "PICKER_ORIGIN_REJECTED"` (`lib/auth/picker/clearIdentity.ts:60`), `source: "auth.picker.sameOriginGate"`, plus the action name, returning `{ ok: false as const, code: "PICKER_INVALID_INPUT" as const }` — the same literal `selectIdentity` already returns on malformed input (`lib/auth/picker/selectIdentity.ts:46`) and `cleanupStaleEntry` returns on malformed input (`lib/auth/picker/cleanupStaleEntry.ts:44`). The four class-B actions each open with:

```ts
if (!(await isSameOriginServerAction())) return rejectCrossOriginPicker("selectIdentity");
```

**The helper's declared return type is the structural literal, never an imported alias.** `SelectIdentityResult` is exported (`lib/auth/picker/selectIdentity.ts:28`), but `CleanupStaleEntryResult` is **module-private** — declared without `export` at `lib/auth/picker/cleanupStaleEntry.ts:26` — so a helper annotated with a named import could not serve both call sites, and widening that alias to `export` is churn on a surface this arc has no other reason to touch. The `as const` literal is structurally assignable to the `{ ok: false; code: string }` arm of each union, which is what makes one helper serve four actions with no type change anywhere. An implementer who reaches for `import type { CleanupStaleEntryResult }` will find nothing to import; that is intended, not an oversight.

**Both the FormData wrapper and its exported core are gated, and that is deliberate duplication.** `cleanupStaleEntry` tail-delegates to `cleanupStaleEntryCore` (`lib/auth/picker/cleanupStaleEntry.ts:50`), so on a cross-origin request the wrapper refuses first and the core's gate never runs. The core keeps its own gate for the reason the shipped family already documents: the `action` string in the emit is what makes each guard load-bearing, so deleting the wrapper's guard makes it fall through to the core's, which emits a different `action`, and the per-endpoint test catches it (`lib/auth/picker/clearIdentity.ts:50-56` states this contract for the class-D family). Same posture, same rationale, no new argument.

`clearIdentity.ts` keeps its local `rejectCrossOrigin` unchanged — no churn on the shipped, reviewed surface.

**Class C** (`confirmUnpublishAction`) opens with the same `if` idiom but returns its own established refusal value `{ status: "neutral" }` — the value it already returns for a missing/blank field (`app/show/[slug]/unpublish/actions.ts:43`) — after a `SERVER_ACTION_ORIGIN_REJECTED` `log.warn`. Neutral is the correct rendering: the confirm page's neutral state is deliberately non-committal (spec'd so CONSUMED never leaks), and no token is consumed because `prevalidateUnpublishBinding` is never reached. Note this action's authority is the emailed capability token, not a cookie, so the CSRF value of forging it is nil — it is gated anyway because it is destructive and the gate costs one line (uniform posture beats a per-action threat argument).

### 3.5 Classes E and F — the exemption registry

New registry tests/auth/_originGateExemptions.ts (plain text: it does not exist yet):

```ts
export type OriginGateExemption =
  | { file: string; fn: string; reason: "read-only" }
  | { file: string; fn: string; reason: "delegates-to-gated"; delegate: string };

export const ORIGIN_GATE_EXEMPTIONS: OriginGateExemption[] = [
  { file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry", reason: "read-only" },
  { file: "app/admin/dev/actions.ts", fn: "getStagedResult", reason: "read-only" },
  { file: "app/admin/dev/actions.ts", fn: "listFixtures", reason: "read-only" },
  { file: "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx", fn: "selectIdentityFormAction", reason: "delegates-to-gated", delegate: "selectIdentity" },
  { file: "app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx", fn: "clearIdentityAndSkipFormAction", reason: "delegates-to-gated", delegate: "clearIdentityAndSkip" },
  { file: "components/auth/IdentityChip.tsx", fn: "clearIdentityFormAction", reason: "delegates-to-gated", delegate: "clearIdentity" },
];
```

Rows are claims, and the meta-test makes each claim executable (§3.6): a `read-only` row must scan clean of direct write signals, and a `delegates-to-gated` row must actually delegate, in its first statement, to a gated action. The three delegators' first statements are already exactly that shape: `const result = await selectIdentity(formData);` (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:86`), `await clearIdentityAndSkip(formData);` (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:38`), `return clearIdentity(formData);` (`components/auth/IdentityChip.tsx:35`).

### 3.6 The meta-test — the census that cannot rot

New structural test tests/auth/_metaServerActionOriginGate.test.ts (plain text: it does not exist yet), the derived cover this sweep files instead of an enumerated list. It reuses the invariant-10 engine (`collectSurfaceUnits`, `parse`, `scanBody`, `isLocallyRebound` from `tests/log/mutationSurface/enumerate.ts`) so the two walks can never disagree about what a Server Action is.

For every unit from `collectSurfaceUnits(["app", "lib", "components"])` with `kind !== "route"`, exactly one of:

1. **Gate-first, admin idiom:** the first non-directive statement is `await assertSameOriginServerAction("<fn>", ...)` with the first argument a string literal equal to the unit's exported `fn` — a wrong name is a failure (the forensic emit must attribute correctly).
2. **Gate-first, picker idiom:** the first non-directive statement is an `if` whose condition contains a call to `isSameOriginServerAction`.
3. **Registry exemption** with its claim verified:
   - `read-only`: `scanBody(node, { descend: false })` reports `writeBuilder === false` and `rpc === false` (tripwire — a later edit that adds a direct write to an exempted action fails the walk);
   - `delegates-to-gated`: the unit's first non-directive statement contains a call to `delegate`, and the resolved `delegate` unit itself passes check 1 or 2.

Plus, in either gate idiom, the called identifier must be imported from `@/lib/auth/sameOriginServerAction` and not locally rebound (mirroring `importBindingOk` / `isLocallyRebound`, `tests/log/mutationSurface/enumerate.ts:149`, `tests/log/mutationSurface/enumerate.ts:66`) — a local `const assertSameOriginServerAction = async () => {}` shadow is a failure, not a pass.

Registry hygiene (the reconcile-your-own-counts lesson): every registry row must match exactly one discovered unit (no orphans, no duplicates), and the test asserts `gated + exempted === discovered` so no unit can go unaccounted.

**Executable premise** (the guard-premise discipline): fixture self-tests via the `makeFixture` pattern (`tests/log/_metaMutationSurfaceObservability.test.ts:37`) prove the detector discriminates — an ungated destructive fixture module FAILS the walk; a gate-first fixture passes; an `assertSameOriginServerAction` call whose name literal mismatches its function FAILS; a locally-shadowed gate FAILS; a `delegates-to-gated` fixture whose delegate is ungated FAILS.

### 3.7 The census

56 units at `origin/main` 119895a7c, 2026-08-16, derived per §2.2. Class per §3.1. Line = declaration line of the exported function at the probe commit (drafting-time locator; the symbol is the durable anchor).

**Class A — admin-gated destructive, gate + `forbidden()` (42):**

| # | Unit | Class-A gate already present |
| --- | --- | --- |
| 1 | `app/admin/_actions/autoApplied.ts:42` `acceptChangeAction` | `requireAdminIdentity` |
| 2 | `app/admin/_actions/autoApplied.ts:77` `acceptAllAction` | `requireAdminIdentity` |
| 3 | `app/admin/_actions/autoApplied.ts:110` `undoFromDashboardAction` | `requireAdminIdentity` |
| 4 | `app/admin/actions.ts:46` `resolveAdminAlertFormAction` | `requireAdmin` |
| 5 | `app/admin/actions.ts:222` `resolveHealthAlertFormAction` | `requireDeveloperIdentity` |
| 6 | `app/admin/actions.ts:308` `retryWatchSubscriptionFormAction` | `requireAdmin` |
| 7 | `app/admin/dev/actions.ts:128` `parseAndStage` | `requireDeveloper` |
| 8 | `app/admin/dev/actions.ts:286` `parseAndStageFormAction` | `requireDeveloper` |
| 9 | `app/admin/dev/actions.ts:423` `resetDevSchema` | `requireDeveloper` |
| 10 | `app/admin/dev/actions.ts:441` `resetDevSchemaFormAction` | `requireDeveloper` |
| 11 | `app/admin/dev/actions.ts:532` `applyAttentionScenario` | `requireDeveloperIdentity` |
| 12 | `app/admin/dev/actions.ts:585` `clearAttentionScenario` | `requireDeveloperIdentity` |
| 13 | `app/admin/dev/actions.ts:664` `applyAttentionScenarioFormAction` | `requireDeveloper` |
| 14 | `app/admin/dev/actions.ts:677` `clearAttentionScenarioFormAction` | `requireDeveloper` |
| 15 | `app/admin/onboarding/_actions/roleTokenStaged.ts:40` `mapRoleTokenStaged` | `requireAdmin` |
| 16 | `app/admin/onboarding/_actions/useRawStaged.ts:106` `setStagedUseRawDecisionAction` | `requireAdmin` |
| 17 | `app/admin/settings/_actions/roleTokenMappings.ts:31` `updateRoleTokenMapping` | `requireAdmin` |
| 18 | `app/admin/settings/_actions/roleTokenMappings.ts:86` `deleteRoleTokenMapping` | `requireAdmin` |
| 19 | `app/admin/settings/_actions/setAlertOnAutoPublish.ts:28` `setAlertOnAutoPublish` | `requireAdmin` |
| 20 | `app/admin/settings/_actions/setAlertOnSyncProblems.ts:27` `setAlertOnSyncProblems` | `requireAdmin` |
| 21 | `app/admin/settings/_actions/setAutoPublish.ts:33` `setAutoPublish` | `requireAdmin` |
| 22 | `app/admin/settings/_actions/setDailyReviewDigest.ts:25` `setDailyReviewDigest` | `requireAdmin` |
| 23 | `app/admin/settings/_actions/validationReset.ts:60` `resetValidationDataAction` | `requireDeveloper` (inside its `try`) |
| 24 | `app/admin/settings/_actions/validationReset.ts:150` `reseedValidationFixturesAction` | `requireDeveloper` (inside its `try`) |
| 25 | `app/admin/settings/admins/actions.ts:71` `addAdminAction` | `requireDeveloperIdentity` |
| 26 | `app/admin/settings/admins/actions.ts:161` `revokeAdminAction` | `requireDeveloperIdentity` |
| 27 | `app/admin/settings/admins/developerActions.ts:15` `setDeveloperAction` | `requireDeveloperIdentity` |
| 28 | `app/admin/show/[slug]/_actions/archive.ts:24` `archiveShowAction` | `requireAdmin` |
| 29 | `app/admin/show/[slug]/_actions/feed.ts:62` `mi11ApproveAction` | `requireAdminIdentity` |
| 30 | `app/admin/show/[slug]/_actions/feed.ts:99` `mi11RejectAction` | `requireAdminIdentity` |
| 31 | `app/admin/show/[slug]/_actions/feed.ts:135` `undoChangeAction` | `requireAdminIdentity` |
| 32 | `app/admin/show/[slug]/_actions/feed.ts:175` `acceptChangeAction` | `requireAdminIdentity` |
| 33 | `app/admin/show/[slug]/_actions/feed.ts:207` `acceptAllAction` | `requireAdminIdentity` |
| 34 | `app/admin/show/[slug]/_actions/roleToken.ts:47` `mapRoleToken` | `requireAdmin` |
| 35 | `app/admin/show/[slug]/_actions/setPublished.ts:23` `setShowPublishedAction` | `requireAdmin` |
| 36 | `app/admin/show/[slug]/_actions/unarchive.ts:27` `unarchiveShowAction` | `requireAdmin` |
| 37 | `app/admin/show/[slug]/_actions/useRaw.ts:59` `setUseRawDecisionAction` | `requireAdmin` |
| 38 | `lib/auth/picker/resetCrewMemberSelection.ts:52` `resetCrewMemberSelection` | `requireAdminIdentity` |
| 39 | `lib/auth/picker/resetPickerEpoch.ts:17` `resetPickerEpoch` | `requireAdminIdentity` |
| 40 | `lib/auth/picker/rotateShareToken.ts:26` `rotateShareToken` | `requireAdminIdentity` |
| 41 | `lib/onboarding/serverActions.ts:8` `startOverServerAction` | `requireAdminIdentity` |
| 42 | `lib/onboarding/serverActions.ts:22` `rerunSetupServerAction` | `requireAdminIdentity` |

Rows 7–14 are build-gated dev-panel scaffolding (`scripts/with-admin-dev-flag.mjs` guards production builds, per the file's header comment) — gated anyway: the gate is one line, and the panel exists in dev deployments where a developer's cookies are just as forgeable-against.

**Class B — crew destructive picker actions, gate + `PICKER_INVALID_INPUT` (4):**

| # | Unit | Mutation |
| --- | --- | --- |
| 43 | `lib/auth/picker/selectIdentity.ts:37` `selectIdentity` | writes the picker identity cookie (identity-selection CSRF) |
| 44 | `lib/auth/picker/selectIdentity.ts:99` `selectIdentityCore` | exported core of #43 (mirrors the gated `clearIdentityCore` posture) |
| 45 | `lib/auth/picker/cleanupStaleEntry.ts:30` `cleanupStaleEntry` | deletes a stale picker cookie entry |
| 46 | `lib/auth/picker/cleanupStaleEntry.ts:53` `cleanupStaleEntryCore` | exported core of #45 |

**Class C — crew destructive, useActionState, gate + `{ status: "neutral" }` (1):**

| # | Unit | Mutation |
| --- | --- | --- |
| 47 | `app/show/[slug]/unpublish/actions.ts:36` `confirmUnpublishAction` | consumes the emailed unpublish token, archives the show (capability-token authority; gated for uniformity, §3.4) |

**Class D — already gated (3):** `clearIdentity` (`lib/auth/picker/clearIdentity.ts:77`), `clearIdentityAndSkip` (`lib/auth/picker/clearIdentity.ts:103`), `clearIdentityCore` (`lib/auth/picker/clearIdentity.ts:209`).

**Class E — admin-gated but read-only, registry-exempt (3):** `captureShowTelemetry` (`app/admin/_devCaptureAction.ts:116`; behind `requireDeveloper`, runs `queryEvents` / `queryAlerts` / `querySyncLog` and returns their rows — the file contains no `.insert(` / `.update(` / `.delete(` / `.upsert(` / `.rpc(` at all), `getStagedResult` (`app/admin/dev/actions.ts:311`; its own docblock declares it the read side of the GET-safety refactor and states that it NEVER invokes `dev_phase1_stage`), `listFixtures` (`app/admin/dev/actions.ts:450`; a `readdir` of the fixtures directory). All three are admin-gated — the exemption rests on read-only, not on the absence of a `require`-gate (§3.1).

**Class F — inline `.tsx` pure delegators, registry-exempt (3):** `selectIdentityFormAction` (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:82` → `selectIdentity`), `clearIdentityAndSkipFormAction` (`app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:34` → `clearIdentityAndSkip`), `clearIdentityFormAction` (`components/auth/IdentityChip.tsx:31` → `clearIdentity`).

---

## 4. Acceptance criteria

Each is executable; the plan's task markers reference these ids.

- **AC-1 — every destructive Server Action refuses a cross-origin request before mutating.** For each of the 47 actions in classes A/B/C, the gate call is the FIRST non-directive statement of the action body, ahead of the `require`-gate and ahead of every lock, validation, and write. Proved structurally for all of them by the meta-test (§3.6) and behaviorally per refusal idiom by §6B.
- **AC-2 — refusal is observable, never silent.** Every refusal branch emits a code-carrying `log.warn`: `SERVER_ACTION_ORIGIN_REJECTED` for classes A and C, `PICKER_ORIGIN_REJECTED` for class B. No refusal path is dark, and no emit carries a secret (action name and source tag only).
- **AC-3 — refusal uses each surface's established channel.** Class A interrupts with `forbidden()`; class B returns `{ ok: false, code: "PICKER_INVALID_INPUT" }`; class C returns `{ status: "neutral" }`. No new returned code, no catalog row, no union widened, no client change.
- **AC-4 — the census cannot rot.** The structural meta-test (§3.6) derives its unit set from `collectSurfaceUnits(["app", "lib", "components"])`, and every discovered non-route unit is either gate-first or a verified registry exemption, with `gated + exempted === discovered`. A newly authored ungated destructive action fails the walk by default.
- **AC-5 — exemption rows are claims the test checks, not assertions it trusts.** A `read-only` row whose action grows a direct write signal fails; a `delegates-to-gated` row whose first statement stops delegating, or whose delegate is itself ungated, fails; an orphan or duplicate row fails.
- **AC-6 — the gate cannot be defeated by shadowing.** In either idiom the called identifier must be imported from `@/lib/auth/sameOriginServerAction` and not locally rebound; a local shadow fails the walk. The admin idiom's first argument must be a string literal equal to the exported function name, so a forensic emit cannot mis-attribute.
- **AC-7 — no request scope means allow, and only the `headers()` call is caught.** `isSameOriginServerAction()` resolves `true` when `headers()` throws; a fault raised anywhere else in the helper still propagates. Pinned by a truth-table row and its negative sibling (§6A).
- **AC-8 — nothing on a render path is gated.** No `page.tsx` / `layout.tsx` / `route.ts` or any Server Component render path awaits a gated unit (§2.4 derivation). The three render-called units are class E and stay ungated.
- **AC-9 — no existing suite is forced to change.** The full suite passes with no `next/headers` mock added to any suite that does not already have one (§6D).
- **AC-10 — the helper is enrolled in the source-mutation guard gate.** `pnpm mutation:guards` runs green against its declared `scoreFloor` with an empty unaccepted-survivor set, or each survivor carries an `accepted` row with a backlog ref (§6E).

---

## 5. Plan-wide invariants touched

- **Invariant 1 (TDD):** every task is failing-test-first; the meta-test itself lands red (47 ungated units) and turns green as the gate tasks land, or lands last — the plan sequences this explicitly.
- **Invariant 2 (advisory lock):** untouched. The gate precedes every lock acquisition, holds nothing, and mutates nothing. No lock-holder layer changes; `tests/auth/advisoryLockRpcDeadlock.test.ts` topology is unaffected.
- **Invariant 5 (no raw error codes in UI):** upheld. No new returned code anywhere: class A refuses via `forbidden()` (renders the framework 403 boundary, same as `requireAdmin` today); class B returns the already-catalogued `PICKER_INVALID_INPUT`; class C returns its existing `neutral` state. `SERVER_ACTION_ORIGIN_REJECTED` lives only inside `log.warn` spans (Resolved scope #5).
- **Invariant 8 (UI quality gate):** the diff edits `.ts` action files under `app/` (non-`app/api`), which the invariant's letter defines as UI surfaces, so the impeccable critique + audit dual-gate runs on the diff at implementation close-out. No `components/` file, no `globals.css`, no `DESIGN.md`, no rendered element changes — expected finding surface is nil, but the gate runs. The plan carries the machine-checkable `impeccable-gate:` marker.
- **Invariant 9 (Supabase call-boundary):** no Supabase call is added or changed. The helper reads `next/headers` only. No registry change to `tests/auth/_metaInfraContract.test.ts`.
- **Invariant 10 (mutation-surface observability):** every gated action's rejection branch emits a code-carrying `log.warn` (`SERVER_ACTION_ORIGIN_REJECTED` or `PICKER_ORIGIN_REJECTED`) — previously-dark refusal branches become instrumented. Existing per-surface instrumentation (success emits, `no-telemetry:` exemptions, `AUDITABLE_MUTATIONS` rows) is untouched: the gate adds a branch, not a surface, and `tests/log/_metaMutationSurfaceObservability.test.ts` keys on surfaces. **No registry row, exemption, or ledger entry changes** — checked, not assumed: `evaluateUnit` short-circuits on `noTelemetryExempt` before it looks for an emit (`tests/log/_metaMutationSurfaceObservability.test.ts:179`), and the walk carries no unused-exemption rule, so a `no-telemetry:`-exempt wrapper that gains a coded log still passes for the same reason it passed before. Emits fire outside any advisory-lock region; no secret is logged (the emit carries only the action name and source).
- **Invariant 11/12:** worktree + ledger marker already in place on this branch.

### 5.1 Dimensional Invariants

**None — N/A, and stated rather than omitted.** The invariant-8 letter classes this diff as a UI surface (it edits `.ts` files under `app/` outside `app/api/`), but the diff adds no rendered element, no container, and no flex/grid relationship: every edited site is one statement inside a Server Action body. There is no fixed-dimension parent and no child whose dimension depends on one, so there is no parent→child relationship to pin and no Playwright layout assertion for the plan to carry. If a repair round adds any rendered element to this arc, this section stops being N/A and the plan gains the layout-dimensions task.

### 5.2 Transition Inventory

**None — N/A, and stated rather than omitted.** No component in this diff gains, loses, or changes a visual state, so the state set is unchanged and there are no N\*(N-1)/2 pairs to enumerate. The one user-visible consequence of a refusal is a navigation to the framework's existing 403 boundary — the same destination `requireAdmin` already reaches for an authed-but-not-admin caller (§1.1 row 3), rendered by machinery this arc does not touch. Classes B and C return values that render states those surfaces already have (`PICKER_INVALID_INPUT`, `neutral`), so no new state and no new transition is introduced there either.

---

## 6. Testing strategy

**A — helper truth table (extend `tests/auth/sameOriginServerAction.test.ts`).** Add the no-request-context row: `headers()` mock REJECTS (throws) → `isSameOriginServerAction()` resolves `true`. Premise check: a sibling case proves the same suite's reject rows still reject (the catch must not swallow the decision logic — assert a `resolveSiteOrigin` fault still propagates by making `headers()` resolve and the decision path throw). New `assertSameOriginServerAction` cases: cross-site → `log.warn` spy sees `code: "SERVER_ACTION_ORIGIN_REJECTED"` with the given `action`/`source` AND `forbidden()` (mocked from `next/navigation`) is called; same-origin → resolves, no emit, no interrupt. Anti-tautology: the reject case asserts emit + interrupt both, so a silent-refusal regression or an emit-only (no interrupt) regression each fail a distinct assertion.

**B — representative per-shape behavioral tests (one per refusal idiom):**

1. **Class A** (`setAlertOnAutoPublish`): with cross-site headers, the action throws the `forbidden()` interrupt, the settings write path is NEVER reached (write spy call count 0), and the emit fired. Baseline premise: the same suite's same-origin case performs the write (proves the spy would have recorded).
2. **Class B** (`selectIdentity`): cross-site → returns `{ ok: false, code: "PICKER_INVALID_INPUT" }`, cookie store and RPC spies untouched, `PICKER_ORIGIN_REJECTED` emit fired with `action: "selectIdentity"`. Baseline: same-origin case proceeds past the gate.
3. **Class C** (`confirmUnpublishAction`): cross-site → returns `{ status: "neutral" }`, `prevalidateUnpublishBinding` spy NOT called (no token touched), emit fired. Baseline: same-origin case reaches the pre-check.

Each representative test derives its cross-site fixture from the truth table's reject rows (`sec-fetch-site: cross-site`, and the bypass shape `cross-site` + absent `Origin`), not an ad-hoc header set.

**C — the structural meta-test** (§3.6), including its fixture self-tests. This is the per-action proof: all 47 gate lines, both idioms, name-literal pinning, import binding, registry reconciliation.

**D — existing suites: no churn expected.** Resolved scope #6 means the non-mocking suites keep passing (their direct calls hit the catch-allow branch). Both suites that mock `next/headers` already default to shapes the gate accepts (`tests/auth/picker/clearIdentity.test.ts:27` same-origin; `tests/auth/picker/selectIdentity.test.ts:20` mocks `cookies` only — its module-mock lacks a `headers` export, so the import itself keeps working and the gate's `headers()` call throws into the catch-allow). The plan verifies with a full `pnpm test` run, not by assumption; a suite that DOES need a mock added is a signal to re-read Resolved scope #6, not to add the mock silently.

**E — mutation enrolment** (Resolved scope #12): add a `GuardSurface` row to `tests/mutation/source/registry.ts` (`GuardSurface` is declared at `tests/mutation/source/registry.ts:13`) with `sourcePath: "lib/auth/sameOriginServerAction.ts"`, `suitePaths: ["tests/auth/sameOriginServerAction.test.ts"]`, an `operators` subset and a `scoreFloor` chosen at enrolment, a `control` edit that the suite genuinely notices (the field exists because a silently-inert overlay otherwise reports a perfect score), and an empty `accepted` array unless a survivor is dispositioned with its `BL-`/`DEF-` ref. `validateSurface` (`tests/mutation/source/registry.ts:57`) rejects an empty `operators` list, so the vacuous-pass shape cannot be authored. `pnpm mutation:guards` runs before the diff-review dispatch; the brief states the score and the unaccepted-survivor set.

---

## 7. Documented limits

- **Neither-signal requests are allowed** (inherited, reference spec §7). Reachable only by non-browser clients (no victim cookies → no CSRF) or pre-Fetch-Metadata browsers.
- **No-request-context invocations are allowed** (new, Resolved scope #6). `headers()` throwing means there is no inbound HTTP request — direct function invocation from tests or server-internal code. An attacker cannot induce this state from the network; a browser request always has a request scope.
- **`same-site` is rejected** (inherited). Single-origin app; revisit only if a sibling subdomain ever becomes a legitimate caller.
- **Read-only actions are ungated** (§3.5). A forged POST to them mutates nothing and the response is unreadable cross-origin. The registry names all three; the AST tripwire fails the walk if one grows a direct write. A read-only action that delegates its reads through a helper that LATER gains a write would evade the tripwire — that is the same delegation-blindness limit `scanBody` carries for invariant 10, accepted with the same rationale.
- **Route handlers are out of scope** (Resolved scope #8), including `app/api/admin/**`.
- **The walk covers `app/`, `lib/`, `components/`** — the same roots as the invariant-10 meta-test (`tests/log/_metaMutationSurfaceObservability.test.ts:640`). A Server Action authored under a novel top-level root would evade both walks equally; adopting a new source root is a repo-structure event that revisits both tests.
- **The read-only class and the render-called class coincide today by measurement, not by construction** (§2.4). Nothing prevents someone from later awaiting a gated action during a render, which would 403 that page for a visitor arriving from an external link. The gate's behavior in that case is correct-but-surprising, so the tripwire is placement, not prohibition: the exemption registry is the place such a unit must be declared, and a unit that is both render-called and destructive is a design question for whoever writes it, not a case this sweep can pre-answer.
- **Class-F delegator soundness is first-statement-scoped.** The meta-test verifies the delegate call sits in the wrapper's first statement; a wrapper refactored to mutate BEFORE delegating fails the walk and must take a gate of its own.

## 8. Files touched

| File | Change |
| --- | --- |
| `lib/auth/sameOriginServerAction.ts` | scoped `headers()` catch-allow; new `assertSameOriginServerAction` export (§3.2) |
| lib/auth/picker/rejectCrossOriginPicker.ts (new plain module) | shared class-B refusal helper (§3.4) |
| 42 class-A action sites across 23 source modules (§3.7 table) | one gate line each, first statement |
| `lib/auth/picker/selectIdentity.ts`, `lib/auth/picker/cleanupStaleEntry.ts` | class-B gate lines (units 43–46 of §3.7) |
| `app/show/[slug]/unpublish/actions.ts` | class-C gate line |
| tests/auth/_originGateExemptions.ts (new) | exemption registry (§3.5) |
| tests/auth/_metaServerActionOriginGate.test.ts (new) | structural meta-test + fixture self-tests (§3.6) |
| `tests/auth/sameOriginServerAction.test.ts` | truth-table row + assert-helper cases (§6A) |
| representative suites (3) | per-shape behavioral cases (§6B) |
| `tests/mutation/source/registry.ts` | enrol the helper (§6E) |
| `BACKLOG.md` / `BACKLOG-archive.md` | archive `BL-SERVER-ACTION-ORIGIN-GATE-SWEEP` at close |
