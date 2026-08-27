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
- **Runs unchanged:** `tests/components/StaleCleanupAutoSubmit.test.tsx`'s sanctioned-island grep, which walks only the picker route directory (`tests/components/StaleCleanupAutoSubmit.test.tsx:63`). The new module is under `components/` and carries no `"use client"`.
- **Mutation registry:** none of `components/auth/AvatarMenu.tsx`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx` and the new components/shared/pendingTimeout.ts is an enrolled `sourcePath` (`grep -n sourcePath tests/mutation/source/registry.ts`, checked at Stage 0). The one enrolled surface in the neighbourhood, `scripts/scan-interaction-timings.ts`, is deliberately NOT edited. No enrolled surface is touched and nothing is enrolled under review pressure.
- **Advisory locks (invariant 2):** none. No table is mutated by this diff.
- **Invariant 9 (Supabase call boundary):** no new Supabase call. `clearAction` arrives as a prop and is unchanged.
- **Invariant 10 (mutation-surface observability):** no route handler and no `"use server"` action is added or edited. `AvatarMenu` is a client island.
- **Layout-dimensions task:** N/A. No fixed-height or fixed-width parent gains a flex or grid child; the announcer is an `sr-only` span and the menu item's box is unchanged.

## The mechanism

`switchPending` belongs to React, so the watchdog cannot clear it; it can only stop TREATING it as busy. One derived flag does that, and every affordance reads the derived one.

```tsx
const [switchTimedOut, setSwitchTimedOut] = useState(false);
/** In flight AND the watchdog has not fired. Every pending affordance reads THIS. */
const switchBusy = switchPending && !switchTimedOut;

useEffect(() => {
  if (!switchPending || switchTimedOut) return;
  const timer = setTimeout(() => setSwitchTimedOut(true), PENDING_TIMEOUT_MS);
  return () => clearTimeout(timer);
}, [switchPending, switchTimedOut]);
```

`switchTimedOut` is in the dependency list on purpose, and it is what makes the RETRY work. A retry sets it back to false while `switchPending` is still true, so the effect re-runs and arms a FRESH window; keyed on `switchPending` alone the effect would not re-run at all and the second attempt would have no watchdog. Unmount and settle both clear the timer through the same cleanup.

The announcement is derived rather than stored, which is what keeps the compound honest: when the hung clear finally settles, `switchPending` goes false and the region empties on its own, with no reset to forget.

```tsx
let switchAnnouncement = "";
if (switchBusy) switchAnnouncement = "Switching person";
else if (switchPending) switchAnnouncement = SWITCH_TIMEOUT_NOTICE;
```

The retry needs one more thing. Enabling a second attempt makes a FIRST attempt's late result arrive while a second is in flight, and the failure branch writes shared state. A monotonic attempt ordinal drops the superseded result, so a stale failure cannot paint an alert under a live retry:

```tsx
const switchAttempt = useRef(0);

const onSwitchSubmit = (formData: FormData): void => {
  if (switchBusy) return;              // the guard reads the DERIVED flag
  const attempt = ++switchAttempt.current;
  setSwitchStatus("idle");
  setSwitchTimedOut(false);
  startSwitch(async () => {
    const result = await clearAction(formData);
    if (switchAttempt.current !== attempt) return;  // superseded by a retry
    if (!result.ok) setSwitchStatus("error");
  });
};
```

**Ratified residual, stated rather than hidden, and the sibling's R10 in the menu's own terms.** Once the watchdog has fired, a second tap issues a second `clearIdentity`. That is the accepted price of not stranding the row: the action clears a cookie entry and signs the device out, so a second one lands on an already-cleared entry and a session that is already gone. It is not made impossible and this plan does not claim it is.

**A side effect worth naming:** a `clearAction` that REJECTS rather than hanging also leaves `switchPending` set today, because `onSwitchSubmit` has no catch. The watchdog recovers that row too. The arc does not add a catch, which would be a different change to a different contract.

## Guard conditions

| Input or condition | Behaviour |
| --- | --- |
| `clearAction` settles inside the window (the ordinary case) | unchanged from today in every observable: `aria-busy` set then removed, announcer `Switching person` then empty, no timeout copy ever rendered |
| `clearAction` never settles | at `PENDING_TIMEOUT_MS` the row re-enables, `aria-busy` is removed, the announcer changes to the timeout notice |
| `clearAction` rejects | same as never settling; the transition stays pending and the watchdog re-enables the row |
| The component unmounts mid-window | the effect cleanup clears the timer; no setState on an unmounted node |
| The menu is closed mid-window | the timer and the announcer both live on the always-mounted root, so neither is cancelled; reopening shows the state as it then stands |
| Blank `name` and `role` | untouched by this arc; the fallback label contract at `components/auth/AvatarMenu.tsx:71` is not read by anything here |
| `PENDING_TIMEOUT_MS` imported but the module absent | a build error, not a runtime state; there is no defaulting and none is wanted |

## Transition inventory

Five states now: **Closed**, **Open-idle**, **Open-pending**, **Open-timedout**, **Open-error**. Success unmounts and is not a state, as before. Open-timedout is genuinely distinct from Open-idle: the row is enabled in both, but in Open-timedout a clear is still in flight and the status region is announcing, so a settle can still land. Ten unordered pairs, one row each, both directions stated on every row: the six that predate this arc are unchanged and carried here so the table is complete rather than a diff, and the four that involve Open-timedout are new.

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

## Copy

`SWITCH_TIMEOUT_NOTICE = "Still switching. Try again."` Accurate at the moment it renders: the clear has NOT been abandoned, it has stopped being a reason to keep the row inert. Two sentences rather than one clause, because the second is the instruction and it should not have to be inferred. No em dash, no apostrophe, no error code (invariant 5 does not apply: this is UI copy, not a catalogued code). The pre-code mechanical checklist otherwise finds nothing to change: `itemClass` already carries `min-h-tap-min` (`components/auth/AvatarMenu.tsx:237`), the announcer inherits `sr-only`, and no colour token is added or repurposed.

## Files touched

components/shared/pendingTimeout.ts (new), `components/auth/AvatarMenu.tsx`, `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`, `DESIGN.md`, `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md`, `tests/components/auth/avatarMenu.test.tsx`, this plan and its `closeout.md`, `BACKLOG.md`, `BACKLOG-archive.md`.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the watchdog, on one shared constant

<!-- task: red=`pnpm vitest run tests/components/auth/avatarMenu.test.tsx` red-state=authored red-target=`components/auth/AvatarMenu.tsx:108` why=`switchPending comes straight from useTransition with no watchdog beside it and onSwitchSubmit guards re-entry on that raw flag, so every new case asserting the row re-enables at 8s, that a retry reaches clearAction a second time, or that the announcer swaps to the timeout notice, fails until the derived switchBusy flag and its timer land` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8 -->

**What is red and why.** A new describe in `tests/components/auth/avatarMenu.test.tsx` holds a `clearAction` unresolved and advances fake timers past 8,000 ms. On the live tree `switchPending` is the raw `useTransition` flag (`components/auth/AvatarMenu.tsx:108`) and the re-entry guard reads it (`components/auth/AvatarMenu.tsx:116`), so the row stays `aria-disabled="true"`, `aria-busy="true"`, the announcer keeps reading `Switching person`, and the second tap never reaches `clearAction`. That was measured, not predicted: the reachability probe above ran exactly this shape against the unmodified component and passed. Every new case therefore fails until the implementation lands.

**Acceptance criteria.**

- AC-1: with a clear that never settles, at 7,900 ms the row still reads `aria-disabled="true"` with `aria-busy="true"` and the announcer reads `Switching person`; at 8,100 ms `aria-disabled` is `"false"`, `aria-busy` is absent, and the announcer reads the timeout notice. Pinned from both sides, so a mutant with any shorter timeout fails the first half. (discharged by Task 1)
- AC-2: after the watchdog has fired, a second submit calls `clearAction` a second time, returns the row to `aria-disabled="true"`, and arms a FRESH window: still busy 7,900 ms after the RETRY, which is 16,000 ms after the first tap. A mutant that leaves `switchTimedOut` out of the effect's dependency list fails the second half. (discharged by Task 1)
- AC-3: a clear that settles at 500 ms behaves exactly as today: busy then not, announcer `Switching person` then empty, and the timeout notice never appears in the document. The existing cases at `tests/components/auth/avatarMenu.test.tsx:647` and `tests/components/auth/avatarMenu.test.tsx:674` pass with no edit. (discharged by Task 1)
- AC-4: compound C1. The clear settles at 20,000 ms with no retry: the announcer is empty, the row is enabled, and `clearAction` was called exactly once. (discharged by Task 1)
- AC-5: compound C3. The first attempt resolves `{ ok: false }` AFTER a retry has started: no `role="alert"` is in the document and the row is still busy for the live attempt. When the retry then fails on its own, the alert DOES appear, so the case cannot pass by the component having stopped reporting failures at all. (discharged by Task 1)
- AC-6: compound C4. Closing and reopening during the timed-out window leaves the row enabled and the announcer text unchanged. (discharged by Task 1)
- AC-7: the window the row actually waits is the SHARED constant, asserted by advancing `PENDING_TIMEOUT_MS - 100` and then a further 200 ms, rather than by the literals AC-1 uses, so a component that kept a literal of its own while the module moved fails. The one-declaration half is discharged by the DERIVED inventory guard rather than by a grep: a second declaration anywhere under `app/**` or `components/**` — a named constant, or a bare literal delay, which the scanner reports as `timer(8000)` — becomes a new scanner row and reds `tests/docs/_metaInteractionTimingInventory.test.ts` until `DESIGN.md` lists it. That is what makes "one definition" enforced rather than asserted. (discharged by Task 1)
- AC-8: `tests/show/pickerAffordance.test.tsx` and `tests/show/claimedRowTransitionAudit.test.ts` pass with no edit, so the hoist changed the sibling's behaviour and its conditional census not at all. (discharged by Task 1)

**RED — write the cases.** A new describe at the end of `tests/components/auth/avatarMenu.test.tsx`, using the module-level `deferredPending` (`tests/components/auth/avatarMenu.test.tsx:49`) and `openMenu` (`tests/components/auth/avatarMenu.test.tsx:54`).

**The block was spliced into the real file at plan time and RUN, and the first draft failed its own RED-validity check.** Every case resolved its held promise at the END of its body, which is fine while the case passes and useless while it does not: AC-1's assertion threw before its resolve, the transition it left in flight was tracked past unmount, and the unchanged-behaviour case (AC-3) then went red because its submit was swallowed by the pending guard — the leak the file already records against `onSwitchSubmit` at `tests/components/auth/avatarMenu.test.tsx:675-681`. A red that a later edit to the test file turns green is not evidence about the implementation. The shipped block retires deferreds in an inner `afterEach` instead, so each case's verdict is its own. Re-run after that repair, against the UNMODIFIED component with the constant module present:

```
 × re-enables the row at the timeout and says so (AC-1)   re-enabled just after 8s: expected 'true' to be 'false'
 × the window the row actually waits is the SHARED constant (AC-7)   enabled past the shared window: expected 'true' to be 'false'
 × admits a retry after the timeout, on a fresh window (AC-2)   the watchdog fired: expected 'true' to be 'false'
 × COMPOUND C1 (AC-4)   timed out, waiting on the stale settle: expected 'Switching person' to be 'Still switching. Try again.'
 × COMPOUND C3 (AC-5)   two attempts in flight: expected to be called 2 times, but got 1 times
 × COMPOUND C4 (AC-6)   timed out before the close: expected 'true' to be 'false'
 Tests  6 failed | 38 passed (44)
```

Six red, each on its own first assertion, and the 38 existing cases untouched. **AC-3 is GREEN today and that is its job:** it is the unchanged-behaviour guard, green before the change and green after, and it is the case that would go red if the watchdog leaked into the ordinary path. `pnpm typecheck` was clean over the spliced file, so the snippets compile under `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` as written. The splice and the constant module were then reverted; the tree is back to the plan commit.

```tsx
describe("the switch-person watchdog (BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG)", () => {
  const NOTICE = "Still switching. Try again.";

  /**
   * Every deferred this describe hands out, retired after the case whatever
   * the case did. A FAILING assertion returns before its own resolve, and the
   * transition it leaves in flight is tracked past unmount, and the next case's
   * submit is then swallowed by the pending guard and it fails for a reason
   * that is not its own. That is measured, not feared: it is the same leak the
   * file already records at tests/components/auth/avatarMenu.test.tsx:675-681,
   * and the first draft of this describe reproduced it (one red case turned the
   * unchanged-behaviour case red too, which would have made a harness artifact
   * look like the implementation's absence).
   */
  const outstanding: ((value: ClearIdentityResult) => void)[] = [];

  function held() {
    const d = deferredPending<ClearIdentityResult>();
    outstanding.push(d.resolve);
    return d;
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
    const { item } = mount(vi.fn(() => first.promise));
    act(() => {
      fireEvent.click(item);
    });
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
    const first = held();
    const second = held();
    const action = vi
      .fn<(formData: FormData) => Promise<ClearIdentityResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { item, region } = mount(action);
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    // Premise: this is only a retry if the row got re-enabled first.
    expect(item.getAttribute("aria-disabled"), "the watchdog fired").toBe("false");

    act(() => {
      fireEvent.click(item);
    });
    expect(action, "the second tap reached clearAction").toHaveBeenCalledTimes(2);
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(region.textContent).toBe("Switching person");

    // A FRESH window, not the remainder of the old one: 7,900ms past the retry
    // is 16,000ms past the first tap. An effect keyed on switchPending alone
    // never re-runs here, so this row would still read enabled.
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
    // Premise: still inside the window at the moment it settles, so this case
    // is about the ordinary path and not a disguised timeout case.
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
    const first = held();
    const second = held();
    const action = vi
      .fn<(formData: FormData) => Promise<ClearIdentityResult>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
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
    const { item } = mount(vi.fn(() => first.promise));
    act(() => {
      fireEvent.click(item);
    });
    act(() => {
      vi.advanceTimersByTime(8_100);
    });
    // Premise: timed out BEFORE the close, so the reopen is being asked about
    // the timed-out state rather than about an ordinary pending one.
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
});
```

`PENDING_TIMEOUT_MS` and `ClearIdentityResult` are imported at the top of the file; `ClearIdentityResult` already is (`tests/components/auth/avatarMenu.test.tsx:27`).

**GREEN — the implementation.**

1. components/shared/pendingTimeout.ts: the constant, carrying the rationale currently at `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx:35-48` plus a paragraph for the menu consumer. No `"use client"` — it is a constant, and adding one would put a needless boundary on both importers.
2. `app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`: delete the declaration and its comment, import the constant at the top with the other imports. Nothing else in that file moves.
3. `components/auth/AvatarMenu.tsx`: `switchTimedOut`, `switchAttempt`, the watchdog effect, `switchBusy`, the derived `switchAnnouncement`, and the guard reading `switchBusy`. `aria-disabled` and `aria-busy` on the item read `switchBusy`; the announcer renders `switchAnnouncement`.
4. `DESIGN.md:740`: the owning-file cell becomes components/shared/pendingTimeout.ts, placed in the scanner's walk order.
5. `docs/superpowers/specs/2026-08-15-auth-picker-hardening-design.md` §4.6: a dated amendment carrying the five-state, ten-pair table above and the compounds, in the same shape §3 of the connector spec already uses for a ratified change.

**Gate commands.** Each as its own command, none chained into the commit:

```
pnpm vitest run tests/components/auth/avatarMenu.test.tsx tests/show/pickerAffordance.test.tsx tests/show/claimedRowTransitionAudit.test.ts tests/components/StaleCleanupAutoSubmit.test.tsx tests/docs/_metaInteractionTimingInventory.test.ts
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
