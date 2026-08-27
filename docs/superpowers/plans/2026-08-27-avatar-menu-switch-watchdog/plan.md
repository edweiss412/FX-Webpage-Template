# A hung switch-person clear re-enables the menu row after a watchdog

**Row:** `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` · **Branch:** `fix/avatar-menu-switch-pending-watchdog` · **Worktree:** `../FX-worktrees/switchwatch` · **Implementer:** Claude Code (Opus; UI surface, so Opus-class per ROUTING).

No spec. The design is the same-route sibling's shape and the row names it, so this plan carries the transition inventory and the guard conditions itself. What the arc does amend is the CANONICAL inventory the menu already has: `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.6 enumerates four states and six pairs, and this change adds a fifth state. Leaving that section unamended would make it false, which invariant 7 forbids.

## Reachability, probed rather than inferred

The row shipped `**Reachability:** INFERRED, NOT PROBED` and named the probe that would settle it. The probe was run first, on the branch tree at `b0d9f8dbb`, as a throwaway case against the UNMODIFIED component:

```
 ✓ tests/components/auth/__probeWatchdog.test.tsx (1 test) 36ms
   ✓ REACHABILITY PROBE — today's behaviour
     ✓ a clear that never settles leaves the row dimmed past 8s
```

The case held a `clearAction` unresolved, advanced fake timers by 60,000 ms, and observed `aria-disabled="true"`, `aria-busy="true"`, the announcer still reading `Switching person`, and a second tap leaving `clearAction` at exactly one call. The row is reachable and the fault is permanent short of a reload. The file was deleted; its assertions return in Task 1 pointing the other way.

A second throwaway probe measured the MECHANISM before it was designed into the component, because two of its claims are framework behaviour rather than repo behaviour: that Vitest fake timers cohabit with `useTransition` (they do; React DOM schedules on MessageChannel, which Vitest does not fake, and Vitest fakes neither `queueMicrotask` nor `nextTick` by default, so the awaited promise still settles), and that calling `startTransition` a SECOND time while the first is still in flight invokes the action again and re-asserts `isPending`. Both held, including the compound where the stale first settle lands after the retry. That probe was deleted too.

One typographic note, so it does not read as sloppiness: the new module's path appears WITHOUT backticks throughout. A backticked source path is a citation to `spec:lint`, and it hard-fails a path that is not tracked yet, which is correct of it and true of every file a plan is about to create.

## Round 1 review, and what it changed

Codex, plan stage, round 1: BLOCKING, three findings. Two of them were right about the mechanism rather than about the prose, which is the useful kind.

**F1 (P1) — the five-state model was false, not merely incomplete.** The draft derived busy from `switchPending` and treated it as this attempt's flag. One `useTransition` hook entangles every transition started from it, so with the retry settling BEFORE the older hung attempt, the flag is still true: a successful retry would sit busy until a second watchdog fired, and a failed one would put the error state and a still-pending row on screen together, then paint the timeout notice on top of the alert. Three combinations outside the declared five. Repaired structurally: the component now owns a three-valued `switchPhase` and never reads React's flag, so the extra combinations are unreachable rather than undocumented. Two cases (AC-9) cover both directions of that settlement order.

**F2 (P1) — "a rejection is recovered by the watchdog" was false.** Probed by the reviewer against the installed React 19.2.4: a rejected async transition action surfaces as a render error and the nearest boundary replaces the component, so there is no row left for a watchdog to re-enable. Rejection is inside this arc's own threat fence, so the honest options were to narrow the fence or handle it. Handled: the `await` is wrapped, a Next control-flow `digest` is rethrown untouched, and anything else renders the generic failure the component already owns. AC-10 covers it.

**F3 (P2) — AC-6's premise was satisfiable by an unrelated state.** It asserted only that the row read enabled before the close, which is equally true of ordinary idle. Class-swept rather than patched at the named instance: every case's premise was re-read against the question "what else makes this true?", and both AC-2 and AC-7 carried the same defect. All three now state a premise no other state satisfies.

The three findings share one root, which is worth naming because it is what the sweep should look for next time: each was a claim about a state the tests never entered. F1's order was never driven, F2's rejection was never thrown, F3's premise was never contradicted. The repair in each case is a case that enters the state, not a sentence that describes it.

## Pre-draft code verification (run 2026-08-27, tree at `b0d9f8dbb`)

| Claim | Where | Verified |
| --- | --- | --- |
| `switchPending` comes from `useTransition`, no watchdog beside it | `components/auth/AvatarMenu.tsx:108` | yes |
| `onSwitchSubmit`'s re-entry guard is `if (switchPending) return;` | `components/auth/AvatarMenu.tsx:113`, `components/auth/AvatarMenu.tsx:116` | yes |
| The pending affordances: `aria-disabled`, `aria-busy`, announcer text | `components/auth/AvatarMenu.tsx:408`, `components/auth/AvatarMenu.tsx:413`, `components/auth/AvatarMenu.tsx:459` | yes |
| The announcer is always mounted and OUTSIDE the popover | `components/auth/AvatarMenu.tsx:458` | yes |
| `openAt` resets via `setSwitchStatus` and touches no other switch state | `components/auth/AvatarMenu.tsx:185` | yes |
| Sibling constant and its timer | `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:49`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:118` | yes |
| The §5.5 row pinned in both directions | `DESIGN.md:740`; `tests/docs/_metaInteractionTimingInventory.test.ts:83`, `tests/docs/_metaInteractionTimingInventory.test.ts:96` | yes |
| Row key is `file :: label = value`, order-independent (both sides sorted) | `tests/docs/_metaInteractionTimingInventory.test.ts:72`, `tests/docs/_metaInteractionTimingInventory.test.ts:88` | yes |
| `UNIVERSE_ROOTS` is `app` + `components` | `scripts/scan-interaction-timings.ts:150` | yes |
| `EXPLICIT_INCLUDES` is how a `lib/**` timing gets scanned | `scripts/scan-interaction-timings.ts:167` | yes |
| Module-level `deferredPending<T>()` helper, and the module-level `openMenu()` | `tests/components/auth/avatarMenu.test.tsx:49`, `tests/components/auth/avatarMenu.test.tsx:54` | yes |
| The existing pending-announcement case, which must keep passing | `tests/components/auth/avatarMenu.test.tsx:647` | yes |
| The existing "re-activation while pending is a no-op" case | `tests/components/auth/avatarMenu.test.tsx:674` | yes |
| Sibling's both-sides timing pin idiom (7,900 then 200) | `tests/show/pickerAffordance.test.tsx:153`, `tests/show/pickerAffordance.test.tsx:158` | yes |
| The sibling's conditional census counts `? (`, `&& (`, `if (` and pins the total | `tests/show/claimedRowTransitionAudit.test.ts:77` | yes |
| The sanctioned-island grep is scoped to the picker route directory | `tests/components/StaleCleanupAutoSubmit.test.tsx:63` | yes |
| `itemClass` already carries `min-h-tap-min` | `components/auth/AvatarMenu.tsx:237` | yes |
| The tap-target census pins the sibling's button by LINE, and the hoist moves it | `tests/styles/tapTargetCensus.ts:438`, `tests/styles/tapTargetCensus.ts:439` | yes; `line: 101` becomes 87 |
| `ClearIdentityResult` is `{ ok: true } \| { ok: false; code: string }` | `lib/auth/picker/clearIdentity.ts:39` | yes |
| The sibling action that DOES redirect, so the digest rethrow is not hypothetical | `lib/auth/picker/clearIdentity.ts:119` | yes |
| The canonical four-state inventory this arc amends | `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md:274` | yes |

## Where the shared constant lives, and why not `lib/ui/`

`COPY_FEEDBACK_RESET_MS` sits in `lib/ui/copyFeedback.ts` with an `EXPLICIT_INCLUDES` row carrying its reason, so lib/ui/pendingTimeout.ts is the obvious-looking home. It is the wrong one here, for two reasons that point the same way.

The scanner's own model says `lib/**` is infrastructure and `app/**` + `components/**` is where interaction timing lives (`scripts/scan-interaction-timings.ts:147-150`). A timing shared by a route file and a component is interaction timing in both consumers, and `components/**` is a tree `app/**` already imports from freely. Putting it there agrees with the model instead of needing an exemption from it.

And `scripts/scan-interaction-timings.ts` is an ENROLLED mutation surface (`tests/mutation/source/registry.ts:2325`). Adding an include row to it would edit that surface and oblige this arc to score it, arbitrate the class lock, and re-score at the shipping head, for a constant that needs no exemption at all. Measured rather than argued: with the constant at components/shared/pendingTimeout.ts and both consumers importing it, `node --import tsx scripts/scan-interaction-timings.cli.ts` reported

```
components/shared/pendingTimeout.ts	PENDING_TIMEOUT_MS	8000
312 files, 31 rows, 0 unclassified
```

one row, resolved from both call sites, nothing unclassified, and the scanner untouched.

## The corpus sweep for the constant, run at plan time

`grep -rn "PENDING_TIMEOUT_MS" --include='*.ts' --include='*.tsx' --include='*.md' .` returns nine occurrences. Dispositions:

| Occurrence | Disposition |
| --- | --- |
| `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:49` (declaration) | moves to the shared module |
| `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:118` (the timer) | unchanged; resolves through the import |
| `DESIGN.md:740` | the owning-file cell changes; this is the live citation |
| `BACKLOG.md:15` | the row's own prose, archived by this arc |
| `docs/superpowers/plans/2026-08-03-picker-signin-flow-cluster.md:478` | historical record of a shipped disposition; names no file, still true |
| `docs/superpowers/specs/2026-08-03-picker-signin-flow-cluster-design.md:520` | ratified amendment text; names no file, still true |
| `docs/superpowers/plans/2026-08-25-switch-person-google-signout/closeout.md:16` | the deferral that filed this row; historical, left as written |
| `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md:182` and `docs/superpowers/specs/ci/probes/2026-08-16-timing-scan-binding-probes.md:219` | pasted probe OUTPUT anchored to a past tree; rewriting it would falsify a record |

Only the first three are live claims about where the constant is, and all three land in Task 1. At close-out the mechanical arm runs the same question the other way: `pnpm spec:lint --repair HEAD --claim-about PENDING_TIMEOUT_MS --also DESIGN.md`, advisory by construction.

## Meta-test inventory

- **Runs unchanged, and is the gate for the move:** `tests/docs/_metaInteractionTimingInventory.test.ts`. Its population is derived from the scanner, so the moved declaration needs no registry edit; only `DESIGN.md`'s row follows it.
- **Runs unchanged:** `tests/show/claimedRowTransitionAudit.test.ts`. It counts conditionals in `_ClaimedRowButton.tsx` and pins the total at `DECLARED.length`. The hoist deletes a `const` and a comment carrying no `?`, `&&` or `if (`, and adds an import, so the count is unmoved. Asserted, not assumed: the suite is in Task 1's gate list.
- **EDITED, and it is the one registry this diff must touch:** `tests/styles/tapTargetCensus.ts`. Its row for `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` pins `line: 101`, and the census is DERIVED from a scan, so the row has to follow the button the hoist moves to 87. This was NOT in the plan's first draft; it came out of a sweep run against the whole class after round 1. The derived cover, so the answer is not a list someone has to keep up to date: every row in `tests/**` pairing a `line:` field with any file this diff edits. Two hits, one real, the other a constructed fixture in `tests/styles/_metaControlOutlineResidue.test.ts` whose `file:` names a constructed component that does not exist on disk. `components/auth/AvatarMenu.tsx` is pinned by line nowhere, which is why its own +25 lines cost nothing.
- **Runs unchanged:** `tests/components/StaleCleanupAutoSubmit.test.tsx`'s sanctioned-island grep, which walks only the picker route directory (`tests/components/StaleCleanupAutoSubmit.test.tsx:63`). The new module is under `components/` and carries no `"use client"`.
- **Mutation registry:** none of `components/auth/AvatarMenu.tsx`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` and the new components/shared/pendingTimeout.ts is an enrolled `sourcePath` (`grep -n sourcePath tests/mutation/source/registry.ts`, checked at Stage 0). The one enrolled surface in the neighbourhood, `scripts/scan-interaction-timings.ts`, is deliberately NOT edited. No enrolled surface is touched and nothing is enrolled under review pressure.
- **Advisory locks (invariant 2):** none. No table is mutated by this diff.
- **Invariant 9 (Supabase call boundary):** no new Supabase call. `clearAction` arrives as a prop and is unchanged.
- **Invariant 10 (mutation-surface observability):** no route handler and no `"use server"` action is added or edited. `AvatarMenu` is a client island.
- **Layout-dimensions task:** N/A. No fixed-height or fixed-width parent gains a flex or grid child; the announcer is an `sr-only` span and the menu item's box is unchanged.

## The mechanism

**Round 1 rewrote this section, and the rewrite is structural rather than documentary.** The first draft derived busy from `switchPending`, React's own `useTransition` flag, and treated it as if it described THIS attempt. It does not. One `useTransition` hook entangles every transition started from it, so the flag stays true until the LAST of them settles. The review probed the consequence: start a clear, let the watchdog fire, retry, and let the RETRY settle while the first is still hung, and `switchPending` is still true. A successful retry would leave the row busy until a second watchdog fired; a failed retry would set the error state with `switchPending` still true, and the timeout would then paint the timed-out affordance and the alert together. Those are observable states outside the five the inventory declares, so the model was not merely incomplete, it was false.

The repair is to stop reading React's flag at all. This component's busy-ness is its own three-valued phase, set synchronously at submit and cleared by the attempt that owns it:

```tsx
const [switchPhase, setSwitchPhase] = useState<"idle" | "pending" | "timedout">("idle");
// `useTransition` stays as the SCHEDULING wrapper for the async work, and is no
// longer the source of truth for anything rendered. Its pending flag is
// entangled across concurrent transitions from the same hook, which is exactly
// the property that made the first draft's model false.
const [, startSwitch] = useTransition();

/** Every pending affordance reads THIS. */
const switchBusy = switchPhase === "pending";

useEffect(() => {
  if (switchPhase !== "pending") return;
  const timer = setTimeout(() => setSwitchPhase("timedout"), PENDING_TIMEOUT_MS);
  return () => clearTimeout(timer);
}, [switchPhase]);
```

The retry arms a fresh window for free now: it moves the phase `timedout` to `pending`, the effect's only dependency changes, and a new timer is armed. Unmount and settle both clear the old one through the same cleanup. No second dependency is needed and no reset can be forgotten.

The announcement is derived from the phase, one branch each, so no state can hold pending text while the row is enabled:

```tsx
let switchAnnouncement = "";
if (switchPhase === "pending") switchAnnouncement = "Switching person";
else if (switchPhase === "timedout") switchAnnouncement = SWITCH_TIMEOUT_NOTICE;
```

The submit path carries the other two round-1 repairs. A monotonic attempt ordinal drops a superseded attempt's late result, because enabling a retry is what makes a first attempt's failure arrive while a second is in flight. And the `await` is wrapped, because a REJECTED action does not leave a transition pending, it surfaces as a render error: the review probed it against the installed React 19.2.4 and the nearest error boundary replaces the component. Losing the whole crew page because one switch tap's round trip failed is worse than the failure it reports, and this component already owns the right copy for it.

```tsx
const switchAttempt = useRef(0);

const onSwitchSubmit = (formData: FormData): void => {
  if (switchBusy) return;              // the guard reads the phase
  const attempt = ++switchAttempt.current;
  setSwitchStatus("idle");
  setSwitchPhase("pending");
  startSwitch(async () => {
    let failed: boolean;
    try {
      const result = await clearAction(formData);
      failed = !result.ok;
    } catch (error) {
      // Next's control-flow signals travel as thrown objects carrying a
      // `digest`, and the sibling `clearIdentityAndSkip` in this very module
      // redirects, so swallowing one would be a live bug rather than a
      // hypothetical. Everything else is a clear that failed.
      if (typeof (error as { digest?: unknown } | null)?.digest === "string") throw error;
      failed = true;
    }
    if (switchAttempt.current !== attempt) return;  // superseded by a retry
    setSwitchPhase("idle");
    if (failed) setSwitchStatus("error");
  });
};
```

`setSwitchPhase("idle")` and `setSwitchStatus("error")` are one batched update, which is what keeps Open-error a state rather than a modifier: an error can never be observed while the row is busy.

**Probed before it was written into this plan.** A standalone component with exactly this shape, driven under fake timers:

```
F1 retry settles ok while the first hangs   row aria-disabled=false  status ""
F1 then the stale first settles             row aria-disabled=false  status ""
F1 retry FAILS while the first hangs        row aria-disabled=false  status ""  alert present
F1 …and 30s later                           row aria-disabled=false  status ""
F1 then the stale first failure lands       alert count 1
F2 rejected action                          row aria-disabled=false  status ""  alert present  component still mounted
```

Every compound the review named lands inside the five-state model, and the rejection no longer reaches a boundary.

**Ratified residual, stated rather than hidden, and the sibling's R10 in the menu's own terms.** Once the watchdog has fired, a second tap issues a second `clearIdentity`. That is the accepted price of not stranding the row: the action clears a cookie entry and signs the device out, so a second one lands on an already-cleared entry and a session that is already gone. It is not made impossible and this plan does not claim it is.

## Guard conditions

| Input or condition | Behaviour |
| --- | --- |
| `clearAction` settles inside the window (the ordinary case) | unchanged from today in every observable: `aria-busy` set then removed, announcer `Switching person` then empty, no timeout copy ever rendered |
| `clearAction` never settles | at `PENDING_TIMEOUT_MS` the row re-enables, `aria-busy` is removed, the announcer changes to the timeout notice |
| `clearAction` rejects | caught: the phase returns to idle and the generic failure alert renders, the same copy a `{ ok: false }` produces. NOT the same as never settling, and the first draft said it was: a rejected async transition action surfaces as a render error, so without the catch the nearest error boundary replaces the component and the watchdog never gets to run (round 1 F2, probed against React 19.2.4) |
| The component unmounts mid-window | the effect cleanup clears the timer; no setState on an unmounted node |
| `clearAction` throws a Next control-flow signal (an object with a string `digest`) | rethrown untouched. `clearIdentity` does not redirect today, but its sibling `clearIdentityAndSkip` in the same module does, and a catch that swallowed a redirect would be a live bug |
| A superseded attempt settles, either way | reports nothing at all: the live attempt reports itself |
| The menu is closed mid-window | the timer and the announcer both live on the always-mounted root, so neither is cancelled; reopening shows the state as it then stands |
| Blank `name` and `role` | untouched by this arc; the fallback label contract at `components/auth/AvatarMenu.tsx:71` is not read by anything here |
| `PENDING_TIMEOUT_MS` imported but the module absent | a build error, not a runtime state; there is no defaulting and none is wanted |

## Transition inventory

Five states now: **Closed**, **Open-idle**, **Open-pending**, **Open-timedout**, **Open-error**. Success unmounts and is not a state, as before. Open-timedout is genuinely distinct from Open-idle: the row is enabled in both, but in Open-timedout a clear is still in flight and the status region is announcing, so a settle can still land.

**Five is a claim the mechanism has to earn, and round 1 showed the first draft did not.** A model with three independent booleans has eight combinations, not five; the reason the extra three are unreachable is that the phase is one three-valued state rather than two flags, and that the error write is batched with the phase's return to idle. Concretely: `Open-pending` and `Open-error` cannot coexist because `setSwitchPhase("idle")` and `setSwitchStatus("error")` land in one update; `Open-timedout` and `Open-error` cannot coexist for the same reason; and no state at all can be entered by a SUPERSEDED attempt, which returns before touching anything. The first draft derived the phase from an entangled flag it did not own, so all three of those combinations were reachable. Ten unordered pairs, one row each, both directions stated on every row: the six that predate this arc are unchanged and carried here so the table is complete rather than a diff, and the four that involve Open-timedout are new.

| Pair | Direction and treatment |
| --- | --- |
| Closed ↔ Open-idle | unchanged (`avatar-menu-in` enter, `motion-reduce` instant; close is an unmount) |
| Closed ↔ Open-pending | unchanged; pending survives close and reopen |
| Closed ↔ Open-error | unchanged; `openAt` resets to idle, so Closed→Open-error stays impossible |
| Open-idle ↔ Open-pending | unchanged; submit is instant, the row becomes `aria-disabled` and stays focusable |
| Open-idle ↔ Open-error | unchanged; error is only reachable through pending |
| Open-pending ↔ Open-error | unchanged; instant, the alert appears as a sibling of `role="menu"` |
| **Open-pending ↔ Open-timedout** | **Open-pending→Open-timedout:** the watchdog fires; instant, `aria-disabled` false, `aria-busy` removed, the announcer swaps to the timeout notice. No animation, because the row is returning to its resting appearance. **Open-timedout→Open-pending:** a retry; instant, busy again, and a FRESH window arms |
| **Open-idle ↔ Open-timedout** | **Open-timedout→Open-idle:** the hung clear finally settles ok with no retry; instant, the announcer empties, the row was already enabled. **Open-idle→Open-timedout: IMPOSSIBLE directly** — reaching timed-out needs a clear in flight, so it always passes through Open-pending |
| **Open-timedout ↔ Open-error** | **Open-timedout→Open-error:** the hung clear settles `{ ok: false }` with no retry in flight; instant, the alert appears and the announcer empties. **Open-error→Open-timedout: IMPOSSIBLE directly** — a retry out of error goes to Open-pending first and only then times out |
| **Closed ↔ Open-timedout** | **Open-timedout→Closed:** ordinary close; the timer and the announcer are both on the always-mounted root, so they survive. **Closed→Open-timedout:** reopen during the window; `openAt` resets `switchStatus` only, so the row is enabled and the notice still reads |

Compounds, which is where this class of bug actually lives:

- **C1 — the settle lands after the watchdog re-enabled the row, with no retry.** The announcer must empty rather than hold the timeout notice, and the row must not bounce back to disabled.
- **C2 — a retry starts while the first clear is still in flight.** `clearAction` is called a second time, the row is busy again, and the new window is a full `PENDING_TIMEOUT_MS` rather than the remainder of the old one.
- **C3 — the first attempt fails after the retry started.** No alert paints; the ordinal drops the superseded result and the live attempt keeps the row busy.
- **C4 — closed during the window, reopened after the watchdog fired.** Row enabled, notice intact.
- **C5 — a theme flip while timed out.** Independent state; the menu stays open and the switch row keeps its own state.
- **C6 — the INVERSE settlement order: the retry settles while the first attempt is still hung** (round 1 F1). Both directions of it, because they fail differently. Retry succeeds: the row returns to enabled and the region empties, rather than staying busy until a second watchdog fires. Retry fails: exactly one alert, the row enabled, the region empty, and it must STAY that way past the moment the retry's own watchdog would have fired, since a phase that never returned to idle would paint the timeout notice on top of the alert. The stale first attempt then settling adds nothing in either direction.
- **C7 — the action REJECTS rather than resolving** (round 1 F2). The component stays mounted, the row returns to enabled, the region empties, and the generic failure alert renders. Without the catch the nearest error boundary replaces the component and none of the above is observable.

## Copy

`SWITCH_TIMEOUT_NOTICE = "Still switching. Try again."` Accurate at the moment it renders: the clear has NOT been abandoned, it has stopped being a reason to keep the row inert. Two sentences rather than one clause, because the second is the instruction and it should not have to be inferred. No em dash, no apostrophe, no error code (invariant 5 does not apply: this is UI copy, not a catalogued code). The pre-code mechanical checklist otherwise finds nothing to change: `itemClass` already carries `min-h-tap-min` (`components/auth/AvatarMenu.tsx:237`), the announcer inherits `sr-only`, and no colour token is added or repurposed.

## Files touched

components/shared/pendingTimeout.ts (new), `components/auth/AvatarMenu.tsx`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`, `tests/styles/tapTargetCensus.ts`, `DESIGN.md`, `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md`, `tests/components/auth/avatarMenu.test.tsx`, this plan and its `closeout.md`, `BACKLOG.md`, `BACKLOG-archive.md`.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the watchdog, on one shared constant

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` red-state=authored red-target=`components/auth/AvatarMenu.tsx:108` why=`switchPending comes straight from useTransition with no watchdog beside it and onSwitchSubmit guards re-entry on that raw flag, so every new case asserting the row re-enables at 8s, that a retry reaches clearAction a second time, that the announcer swaps to the timeout notice, or that a rejected clear leaves the component mounted with an alert, fails until the switchPhase machine, its timer and its catch land` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11 -->

**What is red and why.** A new describe in `tests/components/auth/avatarMenu.test.tsx` holds a `clearAction` unresolved and advances fake timers past 8,000 ms. On the live tree `switchPending` is the raw `useTransition` flag (`components/auth/AvatarMenu.tsx:108`) and the re-entry guard reads it (`components/auth/AvatarMenu.tsx:116`), so the row stays `aria-disabled="true"`, `aria-busy="true"`, the announcer keeps reading `Switching person`, and the second tap never reaches `clearAction`. That was measured, not predicted: the reachability probe above ran exactly this shape against the unmodified component and passed. Every new case therefore fails until the implementation lands.

**Acceptance criteria.**

- AC-1: with a clear that never settles, at 7,900 ms the row still reads `aria-disabled="true"` with `aria-busy="true"` and the announcer reads `Switching person`; at 8,100 ms `aria-disabled` is `"false"`, `aria-busy` is absent, and the announcer reads the timeout notice. Pinned from both sides, so a mutant with any shorter timeout fails the first half. (discharged by Task 1)
- AC-2: after the watchdog has fired, a second submit calls `clearAction` a second time, returns the row to `aria-disabled="true"`, and arms a FRESH window: still busy 7,900 ms after the RETRY, which is 16,000 ms after the first tap, and enabled 200 ms later. The premise is stated on the case's own inputs BEFORE the retry: busy at the start, then the timeout notice present, which together are true of no other state. Asserting only that the row is enabled would have been satisfied by ordinary idle (the round-1 F3 shape, swept across every case here). (discharged by Task 1)
- AC-3: a clear that settles at 500 ms behaves exactly as today: busy then not, announcer `Switching person` then empty, and the timeout notice never appears in the document. The existing cases at `tests/components/auth/avatarMenu.test.tsx:647` and `tests/components/auth/avatarMenu.test.tsx:674` pass with no edit. (discharged by Task 1)
- AC-4: compound C1. The clear settles at 20,000 ms with no retry: the announcer is empty, the row is enabled, and `clearAction` was called exactly once. (discharged by Task 1)
- AC-5: compound C3. The first attempt resolves `{ ok: false }` AFTER a retry has started: no `role="alert"` is in the document and the row is still busy for the live attempt. When the retry then fails on its own, the alert DOES appear, so the case cannot pass by the component having stopped reporting failures at all. (discharged by Task 1)
- AC-6: compound C4. Closing and reopening during the timed-out window leaves the row enabled and the announcer text unchanged. Its premise is on its own inputs: `clearAction` ran, and the timeout notice is present BEFORE the close, so the assertion after the reopen is about survival rather than about a notice the close itself could have produced (round 1 F3). (discharged by Task 1)
- AC-7: the window the row actually waits is the SHARED constant, asserted by advancing `PENDING_TIMEOUT_MS - 100` and then a further 200 ms, rather than by the literals AC-1 uses, so a component that kept a literal of its own while the module moved fails. The premise is the tap reaching `clearAction` and the row reading busy before the clock moves. The one-declaration half is discharged by the DERIVED inventory guard rather than by a grep: a second declaration anywhere under `app/**` or `components/**` — a named constant, or a bare literal delay, which the scanner reports as `timer(8000)` — becomes a new scanner row and reds `tests/docs/_metaInteractionTimingInventory.test.ts` until `DESIGN.md` lists it. That is what makes "one definition" enforced rather than asserted. (discharged by Task 1)
- AC-8: `tests/show/pickerAffordance.test.tsx` and `tests/show/claimedRowTransitionAudit.test.ts` pass with no edit, so the hoist changed the sibling's behaviour and its conditional census not at all. Verified at plan time: the census counts `? (`, `&& (` and `if (` and totals 7 before the hoist and 7 after, against `DECLARED.length` of 7. (discharged by Task 1)
- AC-9: compound C6, both directions. With the first attempt still hung, a retry that RESOLVES ok leaves the row enabled, the announcer empty and no alert, and the stale first settle changes nothing. A retry that FAILS leaves the row enabled, the announcer empty and exactly ONE alert, and it is still exactly that 30,000 ms later, so a phase that never returned to idle would paint the timeout notice over the alert and fail here. The stale first failure adds no second alert. (discharged by Task 1)
- AC-10: compound C7. A `clearAction` that REJECTS leaves the component mounted, the row enabled, the announcer empty and the generic alert rendered. The premise is the rejection actually reaching the component, asserted by the action having been called; the discriminating half is `screen.getByTestId("avatar-menu")` still resolving, which is what an error boundary would take away. (discharged by Task 1)
- AC-11: `tests/styles/tapTargetCensus.ts`'s row for the sibling names line 87 rather than 101, and `tests/styles/interactiveScanCore.test.ts` passes. The census is DERIVED from a scan, so the row must follow the button the hoist moved. (discharged by Task 1)

**RED — write the cases.** A new describe at the end of `tests/components/auth/avatarMenu.test.tsx`, using the module-level `deferredPending` (`tests/components/auth/avatarMenu.test.tsx:49`) and `openMenu` (`tests/components/auth/avatarMenu.test.tsx:54`).

**The block was spliced into the real file at plan time and RUN, and the first draft failed its own RED-validity check.** Every case resolved its held promise at the END of its body, which is fine while the case passes and useless while it does not: AC-1's assertion threw before its resolve, the transition it left in flight was tracked past unmount, and the unchanged-behaviour case (AC-3) then went red because its submit was swallowed by the pending guard — the leak the file already records against `onSwitchSubmit` at `tests/components/auth/avatarMenu.test.tsx:675-681`. A red that a later edit to the test file turns green is not evidence about the implementation. The shipped block retires deferreds in an inner `afterEach` instead, so each case's verdict is its own. Re-run after that repair, against the UNMODIFIED component with the constant module present:

```
 × re-enables the row at the timeout and says so (AC-1)          re-enabled just after 8s: expected 'true' to be 'false'
 × the window the row actually waits is the SHARED constant (AC-7)  enabled past the shared window: expected 'true' to be 'false'
 × admits a retry after the timeout, on a fresh window (AC-2)    timed out, not merely idle: expected 'Switching person' to be 'Still switching. Try again.'
 × COMPOUND C1 (AC-4)                                            timed out, waiting on the stale settle: expected 'Switching person' to be 'Still switching. Try again.'
 × COMPOUND C3 (AC-5)                                            two attempts in flight: expected to be called 2 times, but got 1 times
 × COMPOUND C4 (AC-6)                                            the notice exists before the close: expected 'Switching person' to be 'Still switching. Try again.'
 × COMPOUND C6 ok-order (AC-9)                                   two attempts in flight, the older one hung: expected 2 times, got 1
 × COMPOUND C6 fail-order (AC-9)                                 two attempts in flight, the older one hung: expected 2 times, got 1
 × COMPOUND C7 rejection (AC-10)                                 Error: network
 Tests  9 failed | 38 passed (47)
```

Nine red, each on its own first assertion, and the 38 existing cases untouched. AC-10's red is the F2 behaviour itself: `Error: network` escaping as a render error, which is what the catch converts into the inline alert. **AC-3 is GREEN today and that is its job:** it is the unchanged-behaviour guard, green before the change and green after, and it is the case that would go red if the watchdog leaked into the ordinary path. `pnpm typecheck` was clean over the spliced file, so the snippets compile under `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` as written. The splice and the constant module were then reverted; the tree is back to the plan commit.

```tsx
describe("the switch-person watchdog (BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG)", () => {
  const NOTICE = "Still switching. Try again.";

  /**
   * Every deferred this describe hands out, retired after the case whatever the
   * case did. A FAILING assertion returns before its own resolve, and the
   * transition it leaves in flight is tracked past unmount, so the next case's
   * submit is swallowed by the pending guard and it fails for a reason that is
   * not its own. That is measured, not feared: it is the same leak the file
   * already records against onSwitchSubmit at
   * tests/components/auth/avatarMenu.test.tsx:675-681, and the first draft of
   * this describe reproduced it (one red case turned the unchanged-behaviour
   * case red too, which would have made a harness artifact look like the
   * implementation's absence).
   */
  const outstanding: ((value: ClearIdentityResult) => void)[] = [];

  function held() {
    const d = deferredPending<ClearIdentityResult>();
    outstanding.push(d.resolve);
    return d;
  }

  /** A deferred this describe can REJECT, for the rejection case. */
  function rejectable() {
    let reject!: (reason: unknown) => void;
    let resolve!: (value: ClearIdentityResult) => void;
    const promise = new Promise<ClearIdentityResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    outstanding.push(resolve);
    return { promise, reject };
  }

  afterEach(async () => {
    const pending = outstanding.splice(0);
    // Resolve BEFORE the file-level cleanup unmounts, which is why this hook
    // sits in the inner describe: an inner afterEach runs first.
    await act(async () => {
      for (const resolve of pending) resolve({ ok: true });
      await Promise.resolve();
    });
    vi.useRealTimers();
  });

  /** The menu, open, plus the two nodes every case reads. */
  function mount(action: (formData: FormData) => Promise<ClearIdentityResult>) {
    render(<AvatarMenu name="Doug L." role="Lead" {...ROUTE} clearAction={action} />);
    openMenu();
    return {
      item: screen.getByTestId("avatar-menu-switch-person"),
      region: screen.getByTestId("avatar-menu-switch-announcer"),
    };
  }

  /** Two attempts, in order, for every case that drives a retry. */
  function twoAttempts() {
    const first = held();
    const second = held();
    const action = vi
      .fn<(formData: FormData) => Promise<ClearIdentityResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    return { first, second, action };
  }

  it("re-enables the row at the timeout and says so, pinned from both sides (AC-1)", () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise: the case only discriminates if the tap actually started a clear.
    // An action never called would end idle too, and every assertion below
    // would hold for the wrong reason.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    // A 1s-to-7s timeout mutant also ends enabled, so the window is pinned from
    // BOTH sides, the sibling's idiom at tests/show/pickerAffordance.test.tsx:153.
    expect(item.getAttribute("aria-disabled"), "still busy just before 8s").toBe("true");
    expect(item.getAttribute("aria-busy"), "still busy just before 8s").toBe("true");
    expect(region.textContent, "still announcing just before 8s").toBe("Switching person");

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "re-enabled just after 8s").toBe("false");
    expect(item.getAttribute("aria-busy"), "not busy just after 8s").toBeNull();
    expect(region.textContent).toBe(NOTICE);
  });

  it("the window the row actually waits is the SHARED constant (AC-7)", () => {
    // Derived from the constant rather than from 8000, so a component that kept
    // its own literal while the module moved fails HERE. AC-1 pins the value;
    // this pins the linkage, and neither implies the other.
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise on this case's own inputs, not on the clock: the clear started
    // and the row is busy, so "enabled" below can only come from the watchdog.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled"), "busy before the clock moves").toBe("true");

    act(() => {
      vi.advanceTimersByTime(PENDING_TIMEOUT_MS - 100);
    });
    expect(item.getAttribute("aria-disabled"), "still busy inside the shared window").toBe("true");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "enabled past the shared window").toBe("false");
  });

  it("admits a retry after the timeout, on a fresh window (AC-2)", () => {
    vi.useFakeTimers();
    const { action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    // Premise, stated so that no other state satisfies it: busy first, then the
    // TIMEOUT NOTICE. Asserting only "enabled" would be equally true of
    // ordinary idle, which is the round-1 F3 defect swept across every case.
    expect(item.getAttribute("aria-disabled"), "busy before the window elapses").toBe("true");
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    expect(region.textContent, "timed out, not merely idle").toBe(NOTICE);

    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the second tap reached clearAction").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    // A FRESH window, not the remainder of the old one: 7,900ms past the retry
    // is 16,000ms past the first tap.
    act(() => {
      vi.advanceTimersByTime(7_900);
    });
    expect(item.getAttribute("aria-disabled"), "the retry has its own 8s").toBe("true");
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(item.getAttribute("aria-disabled"), "and it expires on schedule").toBe("false");
  });

  it("a clear that settles inside the window is untouched by the watchdog (AC-3)", async () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Premise: the clear ran and is still inside the window at the moment it
    // settles, so this case is the ordinary path and not a disguised timeout.
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-busy"), "settling inside the window").toBe("true");
    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(item.getAttribute("aria-busy")).toBeNull();
    expect(region.textContent).toBe("");
    expect(document.body.textContent).not.toContain(NOTICE);

    // …and the notice does not arrive late, once the old timer's moment passes.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(region.textContent).toBe("");
  });

  it("COMPOUND C1: the stale settle empties the region and does not re-disable the row (AC-4)", async () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(region.textContent, "timed out, waiting on the stale settle").toBe(NOTICE);

    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(region.textContent).toBe("");
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("COMPOUND C3: a superseded failure paints no alert, but the live one still does (AC-5)", async () => {
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    // Premise: there really are two attempts in flight, so "no alert" below is
    // the ordinal dropping a superseded result and not an absent one.
    expect(action, "two attempts in flight").toHaveBeenCalledTimes(2);

    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(screen.queryByRole("alert"), "the superseded failure is dropped").toBeNull();
    expect(item.getAttribute("aria-disabled"), "the live retry keeps the row busy").toBe("true");

    // The component has NOT stopped reporting failures: the LIVE attempt's
    // failure still paints. Without this half, a mutant that never sets the
    // error state at all would pass the assertion above.
    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("COMPOUND C4: closing and reopening during the window keeps the row enabled and the notice (AC-6)", () => {
    vi.useFakeTimers();
    const first = held();
    const action = vi.fn(() => first.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    // Premise on this case's own inputs: the clear ran, and the notice is
    // present BEFORE the close. Asserting only that the row reads enabled would
    // be equally true of ordinary idle, and the post-reopen notice assertion
    // could not then tell survival from something the close itself produced
    // (round 1 F3).
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(region.textContent, "the notice exists before the close").toBe(NOTICE);
    expect(item.getAttribute("aria-disabled"), "timed out before the close").toBe("false");

    act(() => {
      fireEvent.click(screen.getByTestId("avatar-menu-trigger")); // close
    });
    expect(screen.queryByTestId("avatar-menu-popover")).toBeNull();
    // The announcer is on the always-mounted root, so it survives the close.
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe(NOTICE);

    openMenu();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(screen.getByTestId("avatar-menu-switch-announcer").textContent).toBe(NOTICE);
  });

  it("COMPOUND C6: the RETRY settles ok while the first is still hung (AC-9)", async () => {
    // Round 1 F1. React entangles pending across transitions from one hook, so
    // a busy flag derived from it stays true here and the row would sit
    // disabled until a SECOND watchdog fired. The phase is this component's
    // own, so it does not.
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "two attempts in flight, the older one hung").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled"), "busy on the retry").toBe("true");

    await act(async () => {
      second.resolve({ ok: true });
      await second.promise;
    });
    expect(item.getAttribute("aria-disabled"), "the retry settling ends the busy state").toBe(
      "false",
    );
    expect(region.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();

    // The older attempt is still hung. Its window would have expired long ago;
    // nothing may come back on screen.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(region.textContent).toBe("");

    await act(async () => {
      first.resolve({ ok: true });
      await first.promise;
    });
    expect(item.getAttribute("aria-disabled")).toBe("false");
    expect(region.textContent).toBe("");
  });

  it("COMPOUND C6: the RETRY fails while the first is still hung (AC-9)", async () => {
    vi.useFakeTimers();
    const { first, second, action } = twoAttempts();
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "two attempts in flight, the older one hung").toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await second.promise;
    });
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryAllByRole("alert")).toHaveLength(1);
    expect(item.getAttribute("aria-disabled"), "a reported failure is not a busy row").toBe(
      "false",
    );
    expect(region.textContent).toBe("");

    // Past the moment the retry's own window would have closed. A phase that
    // never returned to idle would paint the timeout notice over the alert.
    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(region.textContent, "no late timeout notice on top of the alert").toBe("");
    expect(screen.queryAllByRole("alert")).toHaveLength(1);

    await act(async () => {
      first.resolve({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      await first.promise;
    });
    expect(screen.queryAllByRole("alert"), "the stale failure adds nothing").toHaveLength(1);
  });

  it("COMPOUND C7: a REJECTED clear reports inline instead of reaching an error boundary (AC-10)", async () => {
    // Round 1 F2, probed by the reviewer against React 19.2.4: a rejected async
    // transition action surfaces as a render error, so without the catch the
    // nearest boundary replaces this component and there is no row left for the
    // watchdog to re-enable.
    const attempt = rejectable();
    const action = vi.fn(() => attempt.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the tap reached clearAction").toHaveBeenCalledTimes(1);
    expect(item.getAttribute("aria-disabled"), "busy before the rejection").toBe("true");

    await act(async () => {
      attempt.reject(new Error("network"));
      await attempt.promise.catch(() => {});
    });
    // The discriminating assertion: an error boundary would have taken this
    // node away entirely.
    expect(screen.queryByTestId("avatar-menu"), "the component is still mounted").not.toBeNull();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("avatar-menu-switch-person").getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(region.textContent).toBe("");
  });
});
```

`PENDING_TIMEOUT_MS` and `ClearIdentityResult` are imported at the top of the file; `ClearIdentityResult` already is (`tests/components/auth/avatarMenu.test.tsx:27`).

**GREEN — the implementation.**

1. components/shared/pendingTimeout.ts: the constant, carrying the rationale currently at `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:35-48` plus a paragraph for the menu consumer. No `"use client"` — it is a constant, and adding one would put a needless boundary on both importers.
2. `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`: delete the declaration and its comment, import the constant at the top with the other imports. Nothing else in that file moves.
3. `components/auth/AvatarMenu.tsx`: `switchTimedOut`, `switchAttempt`, the watchdog effect, `switchBusy`, the derived `switchAnnouncement`, and the guard reading `switchBusy`. `aria-disabled` and `aria-busy` on the item read `switchBusy`; the announcer renders `switchAnnouncement`.
4. `DESIGN.md:740`: the owning-file cell becomes components/shared/pendingTimeout.ts, placed in the scanner's walk order.
5. `tests/styles/tapTargetCensus.ts:439`: `line: 101` becomes `line: 87`. Nothing else in that row changes; the reason text is still accurate.
6. `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.6: a dated amendment carrying the five-state, ten-pair table above and the compounds, in the same shape §3 of the connector spec already uses for a ratified change.

**Gate commands.** Each as its own command, none chained into the commit:

```
pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/show/pickerAffordance.test.tsx tests/show/claimedRowTransitionAudit.test.ts tests/components/StaleCleanupAutoSubmit.test.tsx tests/docs/_metaInteractionTimingInventory.test.ts tests/styles/interactiveScanCore.test.ts tests/messages/no-inline-error-strings.test.ts
node --import tsx scripts/scan-interaction-timings.cli.ts
pnpm typecheck
pnpm exec eslint .
pnpm format:check
```

**The four string-presence mutants, run before the diff dispatch and recorded in the commit.** The new cases assert a string appears, so: (a) `SWITCH_TIMEOUT_NOTICE` emptied; (b) the notice with an appended suffix; (c) the notice present in the module but not rendered, the announcer left on the old two-branch text; (d) the discriminating parameter varied, `PENDING_TIMEOUT_MS` set to 4,000 and to 12,000 in turn. Each must red at least one named case, and which case is recorded.

**Anti-tautology.** Every case states its premise on its OWN inputs before the assertion that rests on it: the tap reached `clearAction`; the watchdog fired before the retry; the settle landed inside the window; two attempts really were in flight. AC-5 carries the live-failure half specifically so a component that stopped reporting failures at all cannot pass it, and AC-1 pins the window from both sides so a shorter timeout cannot pass by also ending enabled.

**Commit.** `fix(crew-page): a hung switch-person clear re-enables the menu row after 8s`

<!-- tasks: end -->

## Close-out (after Task 1, in this order)

- C1. `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, then `pnpm heavy pnpm test` at the shipping head.
- C2. Invariant 8: both halves of `/impeccable` on the diff, with the canonical v3 setup gates: the context load over PRODUCT.md and DESIGN.md, then the register reference read. Findings and dispositions go in `closeout.md` beside this plan, with the marker line the invariant-8 closeout spec §3.3 defines. The two half-names are spelled out THERE and not here on purpose: `tests/docs/_metaInvariant8Closeout.test.ts` treats a plan unit naming both halves as declaring the gate and demands a conforming marker in the same tree state, so naming them in a plan committed before the gate runs would red the suite for the whole implementation window.
- C3. `pnpm spec:lint docs/superpowers/plans/2026-08-27-avatar-menu-switch-watchdog/plan.md` to 0 hard, and the advisory claim sweep `pnpm spec:lint --repair HEAD --claim-about PENDING_TIMEOUT_MS --also DESIGN.md`.
- C4. Re-read the `red-target=` citation on Task 1's marker and confirm the line it now resolves to still names `useTransition`; record what it resolved to. Confirming that it RESOLVES establishes nothing.
- C5. Whole-diff Codex review to APPROVE. The brief carries REVIEWER ONLY, the consequence bound, the `PROBE DOMAIN:` line, the threat fence, and the do-not-relitigate list from the arc brief.
- C6. Merge `origin/main`; resolve any `BACKLOG.md` conflict by set arithmetic across both parents; archive `BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG` into `BACKLOG-archive.md` with its reachability now PROBED, and remove the IN PROGRESS marker, both in the PR's LAST commit.
- C7. Push; twelve required contexts green by GraphQL `statusCheckRollup` on the head sha; `git merge-base origin/main HEAD` equal to `git rev-parse origin/main`; READINESS to bl-orch at `wP:p1A`. This arc does not merge.
