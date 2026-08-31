# The nav badge counts say themselves once, when they arrive

Row: `NAV-BADGE-ARRIVAL-ANNOUNCE-1` (`DEFERRED.md` › `NAV-BADGE-ARRIVAL-ANNOUNCE-1`). Branch `feat/nav-badge-arrival-announce`.

## 1. Purpose

`feat/admin-nav-badge-suspense` moved both nav badge reads out of the layout's
blocking path, so the counts land after the nav has painted. Two accessible
names change at that moment and nothing announces the change:

- the bell, `"Notifications"` becoming `"Notifications: N unseen"`
  (`components/admin/nav/NotifBell.tsx:79-81`)
- the mobile attention tab, `"Needs attention"` becoming
  `"Needs attention, N items"` (`components/admin/nav/AdminNav.tsx:237-243`)

A screen-reader user who reads either control inside the pending window and
never returns to it keeps the count-less name for the rest of the visit. Both
halves of the invariant-8 dual gate raised this independently on that branch
(critique P1, audit P2; disposition at
`docs/superpowers/plans/2026-08-09-admin-nav-badge-suspense.md:89`).

The repair is one polite sentence, spoken once, through the channel the admin
shell already owns.

## 1.1 Resolved scope — do not relitigate

| # | Decision | Ratification |
|---|---|---|
| R1 | The nav badges DO announce. Whether this surface should speak at all was the product question that held the row; it is answered. | Eric, 2026-08-31 15:10, via bl-orch. Recorded in that row's `DEFERRED.md` un-defer trigger ("the owner rules on announcing badge arrivals"). |
| R2 | **First resolution only.** The counts announce once per mount of the admin shell. Later changes to either count never announce. | Same ruling. |
| R3 | **Nonzero only.** A count of zero contributes nothing. Both zero, or both unavailable, is silence. | Same ruling. |
| R4 | One combined utterance rather than two. If both counts are announceable they ride one sentence pair in one `announce()` call. | This spec, §3.3. Two back-to-back polite utterances on page load is the venue-floor chatter `PRODUCT.md`'s register rejects, and it is the reason the row sat deferred. |
| R5 | The utterance goes through `AdminAnnounceProvider`. No second live region is minted anywhere in the nav. | `DESIGN.md:983-985` (two sanctioned region shapes; branch-stability applies to the OWNER). The layout already wraps `<AdminNav>` in the provider at `app/admin/layout.tsx:205` and `app/admin/layout.tsx:221`. NOT enforced by `tests/components/_metaLiveRegionMounting.test.ts` as shipped, which is R1's finding and §3.11's repair: that detector recognizes `role="status"` and `aria-live="polite"` only. |
| R6 | No new `lib/messages` code. The utterance is plain live-region copy describing state the user can already see, not a user-visible error or outcome code, so §12.4 does not reach it. | §3.5. |
| R7 | The onboarding chrome stays silent. It renders `<OnboardingTopBar>` and no `<AdminNav>`, so it holds neither count. | `app/admin/layout.tsx:143-165`. |
| R8 | No viewport gating. The utterance states the counts, not the control names, so it is true at every width. | §3.4. |

## 2. What is there now

### 2.1 The two counts and where they live

The layout issues both reads un-awaited and hands the PROMISES to the client
tree (`app/admin/layout.tsx:192-197`):

```
const bellCountPromise = loadBellUnseenCount(adminEmail, viewerIsDeveloper).catch(() => ({
  kind: "infra_error" as const,
}));
const attentionCountPromise = loadNeedsAttentionCount().catch(() => ({
  kind: "infra_error" as const,
}));
```

Both are `.catch`-wrapped, so **neither ever REJECTS.** That is the whole of
what the wrapper buys, and an earlier draft overclaimed it as "both always
settle": a `catch` converts a rejection into a fulfilment and does nothing at
all to a promise that stays pending. A hung read is therefore still possible,
and it is a documented limit (§6 limit 2), not something this contract excludes.
§5 pins the claim in its true form.

`<AdminNav>` receives both (`app/admin/layout.tsx:221-227`). It consumes the
attention promise itself through `useNeedsAttentionBadge`
(`components/admin/nav/AdminNav.tsx:89`) and forwards the bell promise to
`<NotifBell>`, which consumes it through `useBellBadge`
(`components/admin/nav/NotifBell.tsx:41-44`).

So the two counts are held by two different components. Nothing today sees both.

### 2.2 The pending shapes are not symmetric

This asymmetry is the whole reason the join in §3.2 is shaped the way it is.

| | `useBellBadge` | `useNeedsAttentionBadge` |
|---|---|---|
| Return | `{ count: number \| null, degraded, refetch, zeroNow, pingSignal }` (`useBellBadge.ts:44-56`) | `number \| null` (`useNeedsAttentionBadge.ts:21-24`) |
| Pending | `count === null`, `degraded === false` | `count === null` |
| Read failed | `degraded === true`; `count` keeps its last-known value, or stays `null` if none (`useBellBadge.ts:64`, `useBellBadge.ts:119`) | `count === null` — fail-quiet, ratified D-4 (`useNeedsAttentionBadge.ts:88`) |
| Distinguishable from pending? | **Yes**, by `degraded` | **No.** `null` is overloaded |

**The bell's three commit sites all take a number:** `useBellBadge.ts:111`
(`body.count`, guarded by a `typeof === "number"` check two lines above),
`useBellBadge.ts:143` (`0`), and `useBellBadge.ts:169` (`value.count`, inside the
`kind === "ok"` branch). So `typeof count === "number" || degraded` is a
complete SETTLEMENT test for the bell, computable in the component.

The sibling hook is not symmetric and an earlier draft said otherwise. It has
TWO nulling commit sites, not one: `useNeedsAttentionBadge.ts:88` commits `null`
directly, and `useNeedsAttentionBadge.ts:65` is `setCount(next)` with
`next: number | null`, reached with `null` from `useNeedsAttentionBadge.ts:114`.
Which is exactly why the attention half cannot compute settlement from its own
return value and takes that signal from the promise instead.

**Settlement is not display.** For the bell the two come apart in a state that is
reachable and already pinned: `{count: 4, degraded: true}`
(`tests/components/admin/nav/badgeSeedInterleavings.test.tsx:536`). The hook
retains the last-known count by ratified posture (`useBellBadge.ts:17-24`), but
the component renders the DEGRADED branch there, which has no numeric badge at
all (`NotifBell.tsx:56-74`). §3.2's selector is what keeps the announcement on
the display side of that line.

### 2.3 The attention tab exists only on mobile

`attention` is `mobileOnly` (`components/admin/nav/navConfig.ts:24-31`), so it
renders only in the bottom tab bar, which is `min-[840px]:hidden`
(`components/admin/nav/AdminNav.tsx:216-219`). At >= 840px the tab is
`display: none` and therefore absent from the accessibility tree: there is no
stale accessible name to repair up there. The bell's topbar carries no `hidden`
class (`AdminNav.tsx:98-103`) and is present at every width.

§3.4 is where this lands.

### 2.4 The announce channel

`AdminAnnounceProvider` owns one `role="log"` region rendered as its
always-first child (`components/admin/AdminAnnounceProvider.tsx:53-58`),
consumed via `UndoAnnounceContext` (`components/admin/undoAnnounceContext.ts:18`).
`announce("")` and whitespace are a no-op rather than a blank entry
(`components/admin/announceLog.tsx:90`). Entries prune after
`ANNOUNCE_LOG_TTL_MS` = 30s on the layout instance
(`components/admin/announceLog.tsx:52`, opted into at
`AdminAnnounceProvider.tsx:51`).

The worked precedent for a component that announces on arrival and renders no
region of its own is `components/admin/wizard/DraftRestoredNote.tsx:59-78`.

## 3. The design

### 3.1 Shape

Three pieces, all under `components/admin/nav/`:

1. **navArrivalAnnounce.ts** — a new pure module under `components/admin/nav/`, holding the copy builder.
   No React. This is what the tests assert against, and what keeps the copy in
   one place.
2. **`NotifBell.tsx`** — gains ONE optional prop, `onBellState`, reporting
   `{settled, announceable}` whenever that tuple changes, and derives its own
   `aria-label` from `bellAccessibleName` instead of spelling the ternary
   inline.
3. **`AdminNav.tsx`** — holds the join: it already has the attention half, it
   receives the bell half through that prop, and it calls `announce()`.

No new live region, no new context, no new provider, no change to either badge
hook.

**Why the join lives in `AdminNav` and not in a new component.** `AdminNav`
already renders `<NotifBell>` and already calls `useNeedsAttentionBadge`. A
separate announcer component would have to receive both halves anyway, so it
would add a file and a prop hop without removing a dependency.

**Why `NotifBell` reports upward instead of `AdminNav` reading the bell promise
directly.** The promise's resolved value is not always what the bell displays.
`useBellBadge` demotes a seed that arrives after the hook is claimed: if the
operator opens the bell before the seed lands, `zeroNow()` sets the count to 0
and every later prop value becomes a fetch trigger rather than a value
(`useBellBadge.ts:138-176`). Announcing the promise's number there would speak
a count the badge had just zeroed. Reporting from the component reads the same
state the accessible name reads.

Reporting is necessary but not sufficient, and R1 found the gap: a report taken
once and frozen goes stale for the same reason the promise does. §3.2's live
read is the other half.

### 3.2 The join

Two things are tracked per half and they are NOT the same thing, which is the
correction R1 forced: **whether the half has settled** is a latch, set once and
never cleared; **what the half would announce** is read LIVE, at the instant the
announcement is built.

An earlier draft froze both together, and a probe defeated it: the bell settles
at 4, attention is still pending, the operator opens the panel, `zeroNow()`
commits 0 (`useBellBadge.ts:138-144`), and the join then speaks "4 unseen
notifications" while the control displays no badge and is named
`"Notifications"`. Freezing the value announces a number the badge has already
retracted.

**The announceable value is whatever the accessible name would say.** One
selector answers both questions, so they cannot drift:

```
bellAnnounceableCount(count: number | null, degraded: boolean): number | null
```

`null` when `degraded` is true, because the degraded branch renders a different
control entirely: a `!` chip, no numeric badge, and the name
`ADMIN_ALERT_COUNT_FAILED`'s Doug-facing label (`NotifBell.tsx:56-74`). A
retained count under `degraded` is real state, reachable and already pinned at
`tests/components/admin/nav/badgeSeedInterleavings.test.tsx:536`, but it is not
DISPLAYED, so it is not spoken. Otherwise the count when it is finite and above
zero, and `null` when it is not.

`NotifBell` derives its own `aria-label` from the same selector through
`bellAccessibleName` (§3.3), so the sentence and the name are two renderings of
one decision rather than two implementations of one rule.

**Settlement latches.**

| Half | Settled when |
|---|---|
| Bell | `typeof count === "number"`, OR `degraded === true`, OR neither `initialCount` nor `countPromise` was supplied (nothing will ever arrive) |
| Attention | `typeof badgeCount === "number"`, OR `attentionCountPromise` settled to `kind !== "ok"`, OR neither `attentionCountPromise` nor `initialBadgeCount` was supplied |

The attention half needs its promise for the settlement signal alone, because
`null` cannot be told apart from pending in that hook's return (§2.2). The
announced number still comes from `badgeCount`, never from the promise.

**Mechanism.** `NotifBell` takes one optional prop, `onBellState`, and calls it
from an effect whenever `{settled, announceable}` changes. `AdminNav` writes
that tuple into a REF, which triggers no render, and latches a `bellSettled`
state exactly once. The announce effect fires on the first render in which both
halves are latched, and reads the ref at that instant.

The value is therefore current as of the announcement, and an interaction after
the announcement cannot falsify a sentence that was true when it was spoken.

**Not keyed on promise settlement**, deliberately: a settled latch requires the
hook to have actually committed, so the effect can never read a count that has
not landed, and the design does not rest on React's auto-batching of two `.then`
callbacks.

Once it fires, a ref marks the mount spoken and nothing announces again,
**including when the computed message is empty.** Silence is a resolution, and
R2 says the first one is the only one.

**The `(0, 0)` case, stated rather than left implicit.** If the first settled
pair is both-zero the mount goes silent and is marked spoken, and a later push
taking the bell to 5 announces nothing. That is R2 by the letter, and it is also
right on the merits: at a count of 0 the accessible name is `"Notifications"`
(`NotifBell.tsx:80`, the `count > 0` ternary), the same name the pending window
showed, so nothing went stale and there is nothing to repair.

### 3.3 Copy

Three exports from the new module navArrivalAnnounce.ts under
`components/admin/nav/`. The first two are the shared decision §3.2 rests on;
the third builds the sentence.

```
bellAnnounceableCount(count: number | null, degraded: boolean): number | null
bellAccessibleName(count: number | null, degraded: boolean): string
navBadgeArrivalAnnouncement(bell: number | null, attention: number | null): string | null
```

`bellAccessibleName` is what `NotifBell`'s non-degraded branch renders into its
`aria-label`, and it is defined ON `bellAnnounceableCount`: `"Notifications"`
when the selector returns `null`, `` `Notifications: ${n} unseen` `` otherwise.
That is the whole anti-drift mechanism. There is no scanner asserting that the
label and the announcement agree, because there is one decision and two callers
of it, so they cannot disagree. Both are covered exhaustively by the module's
own suite.

`navBadgeArrivalAnnouncement` filters both arguments by
`Number.isFinite(n) && n > 0`; everything else drops out.

| Bell | Attention | Returns |
|---|---|---|
| 3 | 2 | `"3 unseen notifications. 2 items need attention."` |
| 1 | 1 | `"1 unseen notification. 1 item needs attention."` |
| 3 | none | `"3 unseen notifications."` |
| none | 2 | `"2 items need attention."` |
| none | none | `null` — the caller announces nothing |

Nouns are taken verbatim from the accessible names they explain: `unseen` from
`"Notifications: ${count} unseen"` (`NotifBell.tsx:80`) and `item`/`items` from
`"Needs attention, ${badgeCount} item${badgeCount === 1 ? "" : "s"}"`
(`AdminNav.tsx:240`). Singular and plural are handled on both halves
independently.

**The utterance carries the TRUE count, never the `9+` display cap.** The cap
at `NotifBell.tsx:93` and `AdminNav.tsx:230` is a badge-width constraint; both
accessible names already interpolate the real number, so the announcement
matches the names rather than the pills.

No em dash (`DESIGN.md:874` house rules). No apostrophe. Sentence-final periods
supplied here, matching `undoneAnnouncement`'s reasoning at
`components/admin/undoAnnounceContext.ts:33-38` — screen readers use
sentence-final punctuation for prosody.

**Why the bell sentence leads.** The bell is present at every width (§2.3) and
its panel is the destination for what it counts. The attention sentence is the
one a desktop listener may have no nav control for, so it goes second.

### 3.4 Why there is no viewport gate

At >= 840px the attention tab is out of the accessibility tree (§2.3), so a
reader might argue the attention half should be suppressed there.

It is not, for three reasons.

1. **The utterance is about the state, not the control.** The sentence "2 items need attention." is true
   whether or not a tab bar is on screen, and
   `/admin/needs-attention` (`navConfig.ts:28`) is a real route at every width.
   The desktop dashboard renders its own "Needs attention" panel
   (`components/admin/Dashboard.tsx:770`, `components/admin/Dashboard.tsx:787`), so the count is congruent with
   what is on the page rather than orphaned.
2. **A gate would need a state machine this row does not justify.** The only
   way to read a CSS-driven `display: none` from React is `matchMedia`, which
   makes the announcer viewport-reactive: a resize across 840px after mount
   would then need a defined behavior (announce late? never?), and R2 says
   there is exactly one utterance per mount. Adding a second axis to a
   once-per-mount decision buys a suppression and costs a contradiction.
3. **The failure it prevents is mild and the failure it introduces is not.**
   Ungated, a desktop listener hears one extra true sentence. Gated wrongly,
   a mobile listener hears nothing at all, which is the defect this row exists
   to close.

Recorded in §6 as a documented limit rather than left implicit.

### 3.5 No error code

The utterance names no failure and carries no code. §12.4 catalogs
**user-visible error codes**; this is descriptive live-region copy for state
already rendered, the same class as `DRAFT_RESTORED_NOTE`
(`components/admin/wizard/DraftRestoredNote.tsx:24-25`), which mints no code
either. Failed reads produce SILENCE from this surface, not a spoken error:
the bell's own degraded affordance already carries
`ADMIN_ALERT_COUNT_FAILED`'s Doug-facing label on the control
(`NotifBell.tsx:60-61`), and attention is fail-quiet by ratified D-4.

So none of the three lockstep §12.4 updates apply, and `x1-catalog-parity` and
`x2-no-raw-codes` are unaffected.

### 3.6 Guard conditions

Every input, and what happens.

**`navBadgeArrivalAnnouncement(bell, attention)`** — the pure function:

| Input | Behavior |
|---|---|
| `null` (either arg) | contributes nothing |
| `0` | contributes nothing (R3) |
| negative | contributes nothing (`n > 0` fails) |
| `NaN` | contributes nothing (`Number.isFinite` fails) |
| `Infinity` | contributes nothing (`Number.isFinite` fails) |
| non-integer, e.g. `2.5` | contributes; renders as `String(n)`. Neither loader can produce one; this is stated so the function is total, not because it is reachable |
| both drop out | returns `null`; the caller does not call `announce()` at all |

The caller additionally never passes an empty string to `announce()`, so the
whitespace no-op at `announceLog.tsx:90` is a second net, not the mechanism.

**`bellAnnounceableCount(count, degraded)`** — the shared selector:

| Input | Returns |
|---|---|
| `degraded === true`, any count | `null`. The degraded branch renders no number (`NotifBell.tsx:56-74`) |
| `count === null` | `null` |
| `count === 0` | `null` |
| `count` negative, `NaN`, or `Infinity` | `null` |
| `count` finite and above zero | `count` |

**`bellAccessibleName(count, degraded)`** returns `"Notifications"` whenever the
selector returns `null`, and `` `Notifications: ${n} unseen` `` otherwise. It is
called only from the non-degraded branch, where `degraded` is false by
construction; passing `true` returns `"Notifications"`, which is total rather
than reachable.

**`NotifBell.onBellState`** — new optional prop:

| Input | Behavior |
|---|---|
| absent (every existing caller) | no report is attempted; `NotifBell` behaves exactly as today |
| present | called from an effect whenever `{settled, announceable}` changes, so the parent always holds the current pair. Not once-only: R1 showed a frozen report goes stale |

**`AdminNav`** — existing props, under the new code:

| Input | Behavior |
|---|---|
| `attentionCountPromise` absent AND `initialBadgeCount` null | attention reports `null` immediately |
| `attentionCountPromise` absent, `initialBadgeCount` a number | `badgeCount` is that number from first render, so attention reports it immediately. Correct: a synchronous count means there was no pending window on that half |
| `bellCountPromise` and `bellCount` both absent | bell reports `null` immediately |
| both halves absent | both report `null`, the message is `null`, the mount is marked spoken, nothing is announced |
| provider absent above `<AdminNav>` | `UndoAnnounceContext`'s default is a no-op (`undoAnnounceContext.ts:16-18`), so nothing throws and nothing is spoken. The layout always provides one (`app/admin/layout.tsx:205`) |

### 3.7 Mode boundaries

| Chrome | Renders | Announces |
|---|---|---|
| Settled admin shell (`app/admin/layout.tsx:199-242`) | `<AdminNav>` with both promises | Yes, per this spec |
| Onboarding shell (`app/admin/layout.tsx:143-165`) | `<OnboardingTopBar>`, no `<AdminNav>`, no badge reads | No, structurally |
| Infra-error shell (`app/admin/layout.tsx:91-107`) | a static error card | No, structurally |
| Step-3 review modal | its own `AdminAnnounceProvider` inside `ReviewModalShell` | Unaffected. The nav is outside the dialog and its announcement rides the layout channel; the modal's channel is a different provider instance |

### 3.8 Transition inventory

The announcer has three states: **pending** (at least one half unlatched),
**spoken** (both latched, message emitted), **settled-silent** (both latched,
message empty). Three states, three ordered pairs.

| From | To | Treatment |
|---|---|---|
| pending | spoken | Instant. One `announce()` call appends one keyed child to the existing `role="log"` region. No animation: the region is `sr-only` (`announceLog.tsx:134`) and has no visual presence |
| pending | settled-silent | Instant, and invisible by definition. No call is made |
| spoken | settled-silent | **Unreachable.** The spoken ref is set once and never cleared, so no transition out of either terminal state exists |

**Compound transitions.** Two concurrent states matter, and the second is the
one R1 found.

1. **The bell panel opens while the bell half is still pending.** `zeroNow()`
   commits `count = 0` (`useBellBadge.ts:138-144`), the bell latches settled, and
   the selector returns `null`. The bell sentence is suppressed and the attention
   sentence is unaffected. Correct: the operator is looking at the panel.
2. **The bell panel opens AFTER the bell half has settled but BEFORE attention
   settles.** The latch stays set, but the announceable value is re-read at
   announce time and is now `null`, so the bell sentence is suppressed here too.
   This is the case a frozen report gets wrong, and the probe that found it
   showed the join speaking "4 unseen notifications" against a control displaying
   no badge.
3. **The bell degrades between settling and announcing.** Same shape: the
   selector returns `null` under `degraded`, so a retained-but-undisplayed count
   is not spoken.

All three are the same rule seen three times: what is spoken is what the label
says at the moment of speaking.

### 3.9 Dimensional invariants

None. This spec adds no rendered element. navArrivalAnnounce.ts returns a
string, `NotifBell` gains a prop and no DOM, and `AdminNav` gains an effect. The
only DOM touched is a text child appended inside the existing `sr-only` region
by machinery that already ships (`announceLog.tsx:88-106`).

### 3.10 Pre-code mechanical UI checklist

| Item | Status |
|---|---|
| No em dash in user-visible copy | Every string in §3.3 uses periods only |
| Apostrophe literals | No apostrophe in any string |
| 44px tap targets | No new control |
| Canonical type and token classes | No new class; no visual element added |
| No raw error codes in UI | §3.5 — no code is rendered or spoken |

### 3.11 Meta-test inventory

**Creates:** none. An earlier draft proposed a `setCount(` census under
`components/admin/nav/`, and R1 was right that a lexical call-site count cannot
establish a semantic commit inventory: it sees neither a new settlement branch
reusing an existing setter, nor a changed argument, nor any edit to the settle
predicate itself. It was also a recognizer bounded by a NUMBER, the shape
`docs/agents/writing-plans.md` names under repair economy.

The class is closed by construction instead, which is why no guard replaces it.
The drift the census was watching for is "the announcement and the accessible
name disagree", and §3.3 makes that unrepresentable: `bellAccessibleName` is
DEFINED on `bellAnnounceableCount`, so there is one decision with two callers
rather than two implementations of one rule. Deleting the mechanism beats
guarding it.

**Extends:** one, and it is a repair rather than an addition.
`tests/components/_metaLiveRegionMounting.test.ts` does NOT today recognize
`role="log"`. Its detector fires on `role === "status" || aria-live === "polite"`
and on nothing else, so a conditionally-mounted raw `<span role="log">` evades
the guard whose entire subject is regions born populated. R5 and AC-10 cited that
guard for a protection it does not provide, and the citation was false.

The repair adds `role === "log"` to the recognized set, in this branch, as the
class-sweep default requires. It is free: the only actual `role="log"` JSX
attribute in the repository is `components/admin/announceLog.tsx:134`, inside
`AnnounceLogRegion`'s single return, which is ungated and therefore not a hit.
Every other occurrence under `components/` and `app/` is prose in a comment.
Verified by `grep -rn 'role="log"' components/ app/`, which returns nine lines,
eight of them comments.

The guard's header already argues the exclusion of `role="alert"` on the merits
(alerts ARE announced on insertion). `role="log"` has no such argument: it is
polite and append-shaped, so a region inserted together with its text announces
nothing, which is precisely the defect the file exists to catch.

**Does not apply:** `tests/auth/_metaInfraContract.test.ts` (no Supabase call
boundary), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutation
surface), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no lock),
`tests/messages/_metaAdminAlertCatalog.test.ts` (no alert code).
`tests/styles/_metaUndoAnnounceProvider.test.ts` A1/A2/A3 are unaffected: no
`<AdminAnnounceProvider>` is added or moved.

### 3.12 Mutation enrolment

No file this arc changes is an enrolled `sourcePath` in
`tests/mutation/source/registry.ts` (checked at Stage 0: the registry holds no
path under `components/admin/nav/`). No surface is scored, and none is enrolled
under review pressure.

## 4. Plan-wide invariants

| Invariant | Bearing |
|---|---|
| 1 TDD per task | Applies. Every task is red-then-green on the same command |
| 2 Advisory lock | N/A — no DB mutation |
| 3 Email canonicalization | N/A |
| 4 No global sync cursor | N/A |
| 5 No raw error codes in UI | Applies; satisfied by §3.5 |
| 6 Commit per task | Applies. Scope `crew-page` is wrong here; `admin` is the surface |
| 7 Spec is canonical | Applies |
| 8 UI quality gate | **Applies.** `components/admin/nav/**` is a UI surface. The impeccable critique + audit pair runs before the whole-diff review; the closeout marker line is required |
| 9 Supabase call-boundary | N/A — no Supabase client call is added |
| 10 Mutation surface instrumented | N/A — no route handler, no server action |
| 11 Isolated worktree | Satisfied at Stage 0 |
| 12 Ledger claim | Satisfied at Stage 0; the marker comes off in the PR's last commit |

## 5. Assumptions this design rests on

Each is verified, not assumed, and each is a place a future change could break
the feature silently.

| Assumption | Verified at | If it breaks |
|---|---|---|
| Neither badge promise ever REJECTS | `app/admin/layout.tsx:192-197`, the two `.catch` wrappers | An un-caught rejection crosses the RSC boundary with no owner; the half never latches, the join stalls, and the surface goes silent. Silence is today's behavior, so the failure is a non-repair, not a regression. **A `catch` says nothing about a promise that stays PENDING**, which is a separate hazard and a documented limit (§6 limit 2), not something this assumption covers |
| `<AdminNav>` is always inside `AdminAnnounceProvider` | `app/admin/layout.tsx:205` and `app/admin/layout.tsx:221` | The no-op context default (`undoAnnounceContext.ts:16`) makes it silent. `tests/styles/_metaUndoAnnounceProvider.test.ts` A1 already pins one wrapper per layout return |
| `useNeedsAttentionBadge` commits a number for every successful read | `useNeedsAttentionBadge.ts:65`, `useNeedsAttentionBadge.ts:85` | The attention half never becomes definite and the join stalls |
| `useBellBadge` never commits `null` to `count` | `useBellBadge.ts:111`, `useBellBadge.ts:143`, `useBellBadge.ts:169` — all three take numbers | `typeof count === "number" \|\| degraded` stops being a complete SETTLEMENT test and the bell half could latch late or never |
| The bell's degraded branch renders no numeric badge | `NotifBell.tsx:56-74` | `bellAnnounceableCount`'s `degraded` arm would be wrong in the other direction, suppressing a count the control does display |
| `AdminNav` mounts once per admin-shell load and survives `/admin/*` navigation | The layout renders it outside `<PageTransition>` (`app/admin/layout.tsx:221`, `app/admin/layout.tsx:238`) | If it remounted per route, the utterance would repeat on every navigation, violating R2 |

## 6. Documented limits

Filed here rather than as ledger rows, per the arc's no-new-rows rule.

1. **Desktop hears the attention sentence with no attention tab on screen.**
   §3.4 argues why. Re-file trigger: a screen-reader user reports the desktop
   attention sentence as noise.
2. **A hung badge read is silence.** If a promise never settles (as opposed to
   settling with an `infra_error`), its half never latches and the whole
   utterance is withheld, including the other half's count. The `.catch`
   wrappers do not bear on this: a catch converts a rejection, it does not
   resolve a pending promise. The outcome equals today's behavior.
3. **A demoted attention seed can withhold the utterance.** If a pathname change
   claims `useNeedsAttentionBadge` before its seed resolves
   (`useNeedsAttentionBadge.ts:117-127`) and the demoted fetch then fails,
   `badgeCount` stays `null` while the promise settled `ok`, so the attention
   half never latches. Requires a navigation inside the pending window followed
   by a failing fetch.
4. **Dev-mode double announcement.** React StrictMode unmounts and remounts on
   mount in development, creating a fresh spoken ref. Development only; not
   present in any production build or in any test environment that does not
   opt into StrictMode.
5. **The utterance is polite, so a screen reader may drop it** if it lands while
   something higher-priority is speaking. Inherent to `role="log"`; the same
   limit every announcement on this channel carries.
6. **The sentence is true when spoken, not afterwards.** The announceable value
   is read at announce time (§3.2), so an interaction one tick later can leave a
   spoken count no longer on screen. That is a property of speech, not a defect,
   and the alternative is worse: R2 forbids a correction, and a retraction on a
   polite channel would be more chatter than the count was worth.

## 7. Acceptance criteria

- AC-1 With both counts nonzero, exactly one announcement is appended to the
  layout's `role="log"` region, containing both sentences in bell-then-attention
  order.
- AC-2 With one count nonzero and the other zero, the announcement contains
  only the nonzero half's sentence.
- AC-3 With both counts zero, nothing is appended to the region.
- AC-4 With a failed read on one half and a nonzero count on the other, the
  announcement contains only the succeeding half's sentence.
- AC-5 With failed reads on both halves, nothing is appended.
- AC-6 After the announcement, a later change to either count appends nothing
  further to the region.
- AC-7 A count of 1 on either half uses the singular noun.
- AC-8 A count above 9 announces the true number, not `9+`.
- AC-9 `NotifBell` rendered without `onBellState` behaves identically to
  today: same accessible names, same badge, same panel behavior.
- AC-10 No `role="log"`, `role="status"` or `aria-live` attribute is added to
  any file under `components/admin/nav/`.
- AC-11 Opening the bell panel suppresses the bell sentence, whether it is
  opened BEFORE the bell half settles or after it settles and before the
  announcement, and the attention sentence is unaffected in both.
- AC-12 The onboarding chrome announces nothing.
- AC-13 A bell in the retained-count-under-degraded state
  (`{count: n, degraded: true}`) announces no bell sentence, matching the
  degraded branch, which displays no number.
- AC-14 `tests/components/_metaLiveRegionMounting.test.ts` fails on a
  conditionally-mounted `role="log"` region, and the existing corpus stays
  green under the widened detector.
- AC-15 The row `NAV-BADGE-ARRIVAL-ANNOUNCE-1` is absent from `DEFERRED.md`,
  present in `DEFERRED-archive.md`, and carries no `**Status:** IN PROGRESS`
  field anywhere in the merged tree.

## 8. Out of scope

- Announcing later count changes. R2 forecloses it.
- Announcing zero counts. R3 forecloses it.
- Any change to either badge hook's behavior, return type, or commit paths.
  The selectors in §3.3 read the hooks' outputs; they do not alter them.
- Any change to the bell panel, its feed, or its realtime channel.
- Viewport-aware suppression. §3.4 and §6 limit 1.
- A second announce channel anywhere in the nav. R5.
- Repairing any conditionally-mounted `role="log"` region the widened detector
  finds elsewhere in the corpus. There are none: the sweep in §3.11 found the
  detector's widening to be free, so this fence describes an empty set and
  exists only so a future reader does not read the widening as a deferral.
