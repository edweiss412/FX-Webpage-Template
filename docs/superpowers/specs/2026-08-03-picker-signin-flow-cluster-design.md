# Picker sign-in flow cluster — design

**Date:** 2026-08-03
**Branch:** `fix/picker-signin-flow-cluster`
**Backlog items closed:** `BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`, `BL-PICKER-CLAIMED-ROW-PENDING-STATE`

**Descoped 2026-08-03 (owner):** `BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT` — see §1.3.

Two defects on the crew first-contact sign-in path, shipped as one PR because they share one
surface (the picker interstitial and the route that returns to it) and one review.

---

## 1. Scope

### 1.1 Resolved scope — do not relitigate

Every row below is ratified. Verify the citation; do not re-derive the decision.

| # | Decision | Ratified by |
|---|---|---|
| R1 | The bootstrap handler **preserves** the allow-listed `next` query rather than stripping to the canonical bare URL. | Owner, 2026-08-03, this branch's brainstorming gate. Rationale: `lib/auth/validateNextParam.ts:77` has already reduced the query to an allow-list before the handler sees it, and the handler already redirects to that same query-carrying string at `app/api/auth/picker-bootstrap/route.ts:189` and `app/api/auth/picker-bootstrap/route.ts:211`. |
| R2 | ~~`cleanupStaleEntry` gains the validate-then-redirect + e2e.~~ **SUPERSEDED and descoped** by the owner on 2026-08-03 after spec review R3 refuted its founding premise. See §1.3. Do not re-add this item to the diff. | Owner, 2026-08-03, after R3. |
| R3 | The claimed-row pending affordance is **spinner in place of the lock + role chip text swapped to `Signing in…`** (mockup option C). Not a bare fade, not a spinner alone, not a second line under the name. | Owner, 2026-08-03, brainstorming gate, chosen against a rendered four-option mockup. |
| R4 | When a claimed row has no **displayable** role, the pending chip **still renders** (it is the only right-side signal) and unmounts on completion. **Premise corrected in R2:** originally written as `role={null}`, which is unrealizable — `role` is non-nullable at `_PickerInterstitial.tsx:50`, `app/show/[slug]/[shareToken]/page.tsx:59`, and in the schema (`supabase/migrations/20260501000000_initial_public_schema.sql:37`, `role text not null`). A `text not null` column still permits `""`, and the `c.role &&` guard at `_PickerInterstitial.tsx:227` is exactly that empty-string check. So the realizable triggering input is `role: ""` and the rejected one is `role={null}`. The owner's decision stands; only the fixture value is corrected. | Owner, 2026-08-03; premise corrected against live code in spec review R2. |
| R5 | **Unclaimed** rows are out of scope and get no pending state. Their form posts a local Server Action, not a three-hop OAuth journey. | This spec, §4.2 mode boundary. The backlog item is scoped to the claimed row (`BACKLOG.md`, `BL-PICKER-CLAIMED-ROW-PENDING-STATE`). |
| R6 | `SHOW_NEXT_RE` stays `$`-anchored against the **path portion**. The fix splits the query off before matching; it does not loosen the path grammar. | This spec, §3.2. Loosening the anchor would admit `/show/<slug>/<token>/anything`. |
| R7 | No DB, migration, RPC, or advisory-lock surface is touched. Invariant 2 and the migration→validation parity checklist are N/A for this diff. | This spec, §7. |
| R8 | Pending comes from **local client state**, NOT `useFormStatus`. The backlog entry's proposed `useFormStatus` fix is wrong for this form and was refuted by probe before drafting. Do not propose reverting to `useFormStatus`; do not cite the admin "no local flag" rule against it without first reading §3.4. | This spec, §3.4, with the probe output inline. |
| R9 | Every behavioral claim about DOM, CSS, or framework semantics in this spec is settled by a recorded probe in §3.6, not by argument — and each is labelled with the environment that can settle it. R1 and R2 both found false asserted-behavior claims; §3.6 is the structural defense against a third round of the same vector. | This spec, §3.6. Project rule: `docs/agents/writing-plans.md:20` (ship the structural defense in the repair commit, do not wait for recurrence). |
| R10 | Pending self-clears after 8s. This AMENDS §9's original rejection of a timeout, which missed that re-tapping was the crew member's only recovery from a hung hop — raised as a P0 by the invariant-8 gate. The residual risk (an idempotent duplicate navigation after 8s) is stated in §9. Do not re-argue the original wording; it is struck. | Invariant-8 impeccable critique P0, 2026-08-03; amendment recorded in §9 and the plan §12. |

### 1.2 Out of scope

- Any change to `lib/auth/validateNextParam.ts`'s allow-lists. `ALLOWED_NEXT_SECTION_VALUES`
  (`validateNextParam.ts:26`) and `ALLOWED_NEXT_GATE_VALUES` (`validateNextParam.ts:30`) are correct as they stand; the bug is downstream
  of them.
- The unclaimed-row select flow. Its redirect fix already shipped
  (`_PickerInterstitial.tsx:113-114`).
- `_StaleCleanupAutoSubmit.tsx`'s auto-submit mechanics. Its empty dependency array is deliberate
  and load-bearing (it is what prevents a resubmit loop); this spec does not touch it.

### 1.3 Descoped: the stale-cleanup redirect, and why

`BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT` was in this cluster through spec review R3 and was
removed by the owner on 2026-08-03. It returns to `BACKLOG.md` — **with a correction**, because the
reason it was filed does not hold.

**The founding premise is refuted.** The entry, and this spec's earlier §2.2, asserted that
`revalidatePath` "takes a path and ignores the query", so a picker reached at `?gate=skip` kept
serving a cached entry. Probed against the installed Next 16.2.10 during R3:

```text
getImplicitTags(page, pathname) → ["_N_T_/show/demo/<token>"]
revalidatePath(originalPath)    → "_N_T_" + removeTrailingSlash(originalPath)
```

Both the tag written at render and the tag invalidated by `revalidatePath` are **pathname-only**.
The query is not a separate cache tag, so there is no `?gate=skip` variant being "missed". Whatever
the observable defect is, that is not its mechanism.

**Why it was split rather than fixed here.** Its diff pulled in surface none of the remaining work
touches, and each review round found a new structural obstacle in it: a seven-hop `gate`/`s`
threading path (two of whose rows this spec stated incorrectly), an e2e requiring a
`shows.picker_epoch` mutation that would be an **unlocked write in violation of invariant 2**, a
frozen-DML guard pinning `picker-flow.spec.ts` to one mutation, and an executed-count registry
pinned at six cases. Three consecutive rounds on one vector is the documented stop condition
(`docs/agents/spec-self-review.md:22`), and descope is one of its three sanctioned exits.

**What the backlog entry must say when re-filed** (close-out task, since another session owns the
ledger): the premise correction above, the invariant-2 obstacle, and the note that any future
attempt should FIRST measure what screen actually renders after a stale cleanup, rather than
reasoning from cache-tag behavior.

**Not relitigable in this PR.** Do not propose re-adding the redirect, the `gate`/`s` threading, or
the stale-cleanup e2e.

---

---

## 2. The defects, as measured

### 2.1 Two validators in one request disagree about queries

`lib/auth/validateNextParam.ts:77` deliberately pushes allow-listed query params onto its
`reattached` list and returns e.g. `{ ok: true, path: "/show/<slug>/<token>?s=schedule" }`.

`app/api/auth/picker-bootstrap/route.ts:21` then matches that string against

```
const SHOW_NEXT_RE = /^\/show\/([a-z0-9-]+)\/([0-9a-f]{64})$/;
```

`$` immediately after the 64-hex token — no query permitted. `parseNextPath` (`route.ts:52-56`) returns
`null` and `route.ts:151` answers `403` with `OAUTH_REDIRECT_INVALID`, rendered as
"Sign-in unavailable / Sign-in landed somewhere we don't recognize." (`lib/messages/catalog.ts`,
`OAUTH_REDIRECT_INVALID` row).

**The blast radius is larger than the backlog entry states.** `lib/crew/buildShowReturnUrl.ts:46`
emits four shapes, and the sole bootstrap-URL constructor
(`app/show/[slug]/[shareToken]/page.tsx:229-231`) can produce any of them:

| Shape | Produced when | Bootstrap today |
|---|---|---|
| `/show/<slug>/<token>` | no section, no gate | ✅ succeeds |
| `/show/<slug>/<token>?s=<section>` | section deep link | ❌ 403 |
| `/show/<slug>/<token>?gate=skip` | gate context | ❌ 403 |
| `/show/<slug>/<token>?s=<section>&gate=skip` | both | ❌ 403 |

Three of four fail. The entry describes this as deep-link-only; `?gate=skip` is an ordinary
first-contact path, not a deep link.

**The fix is smaller than the entry implies.** The handler already redirects to the
query-carrying `nextOutcome.path` at both exit points (`route.ts:189` for the `continue` case, `route.ts:211` for
the claim case). Only the *parse* rejects it. Nothing downstream needs to learn about queries.

### 2.3 The claimed row is visually inert for the whole OAuth journey

`_PickerInterstitial.tsx` is a Server Component (stated at `_PickerInterstitial.tsx:4`). The claimed branch renders
`<form action="/auth/sign-in" method="GET">` wrapping a `<button data-testid="picker-roster-row"
data-claimed="true">` (`_PickerInterstitial.tsx:205`) containing the lock (`_PickerInterstitial.tsx:212`), the name, and an optional role chip
(`_PickerInterstitial.tsx:228`). Tapping it is a full GET to `/auth/sign-in` and onward to Google — three or more hops
with no visual change. On venue wifi people tap again.

---

## 3. Design

### 3.1 Single source of truth for the URL shapes

Everything in this spec that constructs a crew return URL goes through
`buildShowReturnUrl(slug, shareToken, { s, gate })` (`lib/crew/buildShowReturnUrl.ts:33`). No
hand-assembled query strings are introduced anywhere in this diff.

### 3.2 Bootstrap: parse the path, redirect the whole thing

`parseNextPath` splits the query off before matching, and `SHOW_NEXT_RE` keeps its `$` anchor
against the path portion only (R6):

```ts
function parseNextPath(path: string): { slug: string; shareToken: string } | null {
  const match = SHOW_NEXT_RE.exec(path.split("?")[0]!);
  if (!match) return null;
  return { slug: match[1]!, shareToken: match[2]! };
}
```

Nothing else in `route.ts` changes. The intent-token binding at `route.ts:161` continues to compare
`intent.slug` / `intent.shareToken` against the parsed **path** components, which is exactly the
right grain — the query is not part of the signed intent and must not become part of it.

**Why this is safe.** The redirect target is `nextOutcome.path`, which reaches the handler only
after `validateNextParamDetailed` (`route.ts:147`) has (a) confirmed the path is host-relative and
tokenized-crew-shaped and (b) rebuilt the query from an allow-list, discarding every unrecognized
param (`validateNextParam.ts:77`). No caller-supplied string reaches the `Location` header
un-allow-listed. The change widens what the handler *accepts*; it does not widen what it *emits*.

### 3.4 Claimed row: one new client boundary

**Measured first (empirical spike).** The backlog entry proposes `useFormStatus`, matching the
admin surfaces. A probe run against this repo's React on 2026-08-03 refutes that for this form:

```
NATIVE_GET=false          // <form action="/auth/sign-in" method="GET">, submit fired
FUNCTION_ACTION=true      // <form action={async () => …}>, control
```

`useFormStatus` reports pending only when React owns the submission — i.e. when `action` is a
**function**. The claimed row's form has a **string** action (`_PickerInterstitial.tsx:197`), so
the browser performs a native GET navigation and React never enters a pending state.
`useFormStatus` would have returned `false` for the entire OAuth journey and the affordance would
never have appeared.

The admin recipe therefore does not transfer, and the backlog entry's stated fix is wrong. The
pending state comes from **local client state** set on submit:

- New file `_ClaimedRowButton`, `"use client"`.
- `const [pending, setPending] = useState(false)`, flipped in the button's `onClick`. The form's
  native submit proceeds; nothing is prevented.
- **This is a deliberate exception to the "no local flag" rule** stated at
  `components/admin/RetryWatchButton.tsx:8-9` and `tests/components/RetryWatchButton.test.tsx:11-15`.
  That rule exists because a Server Action can return without revalidating, leaving a local flag
  stuck. Here the submit is a full-page navigation that destroys the component, so there is no
  "returns without revalidating" case. The exception is documented in the component header so the
  next reader does not "fix" it back to `useFormStatus`.
- Reset on `pageshow` so a bfcache back-navigation returns the row to idle rather than restoring
  it stuck in pending.

Consequences for the boundary: since pending no longer needs `useFormStatus`, the client component
does **not** have to be a form descendant. It stays the `<button>` subtree anyway — that is the
smallest boundary that can hold the state, and it keeps the `<form>` and hidden input on the
server.
- It renders the entire `<button>` currently inline at `_PickerInterstitial.tsx:203-232`.
- `_PickerInterstitial.tsx` keeps the `<form action="/auth/sign-in" method="GET">` and the hidden
  `next` input server-side; only the button moves.

The `<form>` and hidden input stay where they are because of the comment already at `_PickerInterstitial.tsx:190-196`: a
GET submit rebuilds the query from the form's own fields and discards whatever the action URL
carried, so `next` must ride a hidden input. That contract is unchanged.

Props (all required unless noted):

| Prop | Type | Guard behavior |
|---|---|---|
| `name` | `string` | Rendered truncated. Empty string renders an empty span; the row still has its 44px floor and stays tappable. Not a new case — `c.name` is non-null in the roster query today. |
| `role` | `string` | Empty string → no chip in idle (the live `c.role &&` guard is an empty-string check; `role` is non-nullable — R4). In pending the chip renders regardless. |
| `crewMemberId` | `string` | Passed through to `data-crew-member-id`. |
| `lockHint` | `string` | The `aria-label` on the lock. Falls back to `"Sign in to use this identity"`, matching the existing fallback at `_PickerInterstitial.tsx:212`. |
| `chipClassName` | `string` | Computed server-side and passed in, so the client component holds no role-flag logic. |
| `rowClassName` | `string` | Same, for the row's class string. |

### 3.5 Pending treatment (R3)

Follows the ratified idle/pending idiom
(`docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175`) and the rendered shape
of the recipe at `components/admin/RetryWatchButton.tsx:38-48` — busy signalling + label swap. Two
things differ from that recipe, both deliberate: the **source** of `pending` (§3.4, local state),
and the **disable mechanism** (below).

| Element | Idle | Pending |
|---|---|---|
| Lock glyph (`data-testid="picker-row-lock"`) | 🔒 with `aria-label` | not rendered |
| Spinner | not rendered | `<Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />`, `data-testid="picker-row-spinner"` |
| Name | truncated | unchanged |
| Role chip (`data-testid="picker-role-chip"`) | `role` if present, else absent | text `Signing in…` (R4: renders even when `role` is the empty string) |
| `<button>` | interactive | `aria-disabled="true"`, `aria-busy="true"`, `onClick` guard returns early; **NOT** the `disabled` attribute |

**Why `aria-disabled` and not `disabled`.** A natively `disabled` button is removed from the
focusable set, so a keyboard user who activates the row loses their place the instant it goes
busy — the browser drops focus to `<body>`. `aria-disabled` keeps the element focusable and
announced as unavailable. **The `onClick` handler must call `e.preventDefault()` on the pending
path** — an early `return` alone does NOT cancel a submit button's default action (§3.6 P1:
`submits=2`), and `aria-disabled` does not block activation either (§3.6 P2). Without
`preventDefault` the row looks busy and still double-submits, i.e. the defect is untouched. This is the only mechanism that satisfies both halves of the requirement (stop the
re-tap, keep the focus ring) — see §6, where the focus claim is now testable rather than assumed.

The row must therefore style its own pending appearance: `disabled:` variants do not apply, and
**`hover:bg-surface` is NOT suppressed by `aria-disabled`** (nor would it have been by `disabled` —
Tailwind v4 compiles the `hover:` variant to a bare `&` + hover pseudo-class inside
`@media (hover: hover)` with no not-disabled guard, and the CSS hover pseudo-class matches by
pointer position regardless of disabled state). Pending styling is applied explicitly via `aria-disabled:` variants on the row class, not
inherited from the disabled pseudo-class.

The spinner is `lucide-react`'s `Loader2`, the icon every other spinner in the tree uses
(`components/admin/FinalizeButton.tsx:549`, `components/admin/wizard/Step3ReviewModal.tsx:486`,
`app/admin/settings/roles/RoleMappingRow.tsx:297`). `motion-reduce:animate-none` follows
`components/admin/ReSyncButton.tsx:252`, the one existing spinner that is reduced-motion aware —
the picker is a crew-facing surface and should not be the exception.

The lock is swapped for the spinner rather than sitting beside it so the row's left edge does not
reflow. Both occupy the same slot.

**Copy.** `Signing in…` — U+2026 as a literal ellipsis character, matching `Retrying…` /
`Confirming…`. No em-dash. The apostrophe rule does not apply (no apostrophe).

### 3.6 Measured behaviors (R9)

Every row here was run, not reasoned. Two review rounds each found a false asserted-behavior claim
in this spec (R1: hover suppression and disabled-focus; R2: submit cancellation), so this table is
the convergence device: **a claim about DOM/CSS/framework semantics is admissible only with a row
here**, and the row names the environment that can actually settle it.

| # | Claim | Result | Settled in |
|---|---|---|---|
| P1 | An `onClick` early return alone cancels the second submit | **FALSE — `submits=2`** | jsdom |
| P1b | `onClick` early return **plus `e.preventDefault()`** cancels it | TRUE — `submits=1` | jsdom |
| P2 | `aria-disabled="true"` alone blocks activation | **FALSE** | jsdom |
| P3 | `useFormStatus` reports pending for a string-action GET form | **FALSE** (`NATIVE_GET=false`, `FUNCTION_ACTION=true`) | jsdom |
| P4 | A natively `disabled` button loses focus | **NOT SETTLEABLE IN JSDOM** — jsdom reports `stillFocused=true`, real browsers blur. Must be asserted in Playwright | Playwright only |
| P5 | Tailwind's `hover:` variant is suppressed by a disabled/`aria-disabled` element | **FALSE** — compiles to a bare hover pseudo-class inside `@media (hover: hover)` with no not-disabled guard | Tailwind source + Playwright |
| P6 | The compiled `aria-disabled:` rule comes AFTER the `hover:` rule, so pending background wins on precedence | TRUE — measured in R3: `hoverRuleIndex=139`, `ariaRuleIndex=258`, `ariaAfterHover=true` | Tailwind source |
| P7 | `motion-reduce:animate-none` actually emits suppression | TRUE — measured in R3: `@media (prefers-reduced-motion: reduce) { animation: none }` | Tailwind source |
| P8 | jsdom synthesizes button activation from Enter/Space | **FALSE** — measured in R3: `keyboardClicks=0`, and `@testing-library/user-event` is not installed. A jsdom keyboard assertion is vacuously green | jsdom (negative result) |
| P9 | `aria-disabled` retains focus AND the focus ring | **UNSETTLED in jsdom** — jsdom reports `stillFocused=true` for the native-`disabled` case too (P4), so it discriminates nothing here. Playwright only, and the ring half needs the computed **`boxShadow`** oracle, not `document.activeElement`: `focus-visible:ring-2` paints a box-shadow while Chromium draws its own default outline on any focused element, so an outline check (or a bare activeElement check) stays green with every ring class deleted. Precedent + rationale: `tests/e2e/agendaScheduleLayout.spec.ts:542-555` | Playwright only |
| P10 | A screen reader announces the `aria-disabled` row usefully while busy | **NOT MEASURED — accepted as unproven.** No automated harness in this repo can settle AT announcement text. The design does not depend on it: the chip text swap and the disabled-looking styling carry the state visually, and `aria-busy` is the standard signal. Recorded here rather than asserted | none — documented limit |
| P11 | A native GET submit tears down the component, so local pending state cannot leak | TRUE by navigation semantics; the observable consequence (row not stuck) is asserted in Playwright, and the bfcache exception is the reason `pageshow` exists (§9) | Playwright |
| P12 | `truncate` + `min-w-0` + `shrink-0` + `whitespace-nowrap` + row `items-center` produce the claimed row layout | **Geometry alone settles none of them.** Height and name-edge survive deleting any of these classes; even a long-name fixture leaves `truncate`'s deletion invisible, and a spinner-centre check cannot see `items-center`'s deletion because the left group re-centres within a stretched row. §8.2 therefore pairs each class with a **computed-style or stretch** oracle chosen to kill exactly that mutation | Playwright only |

A claim may legitimately end up as **unproven** (P10) — what R9 forbids is an unproven claim that
is not *labelled* as such, or one the design silently depends on. P10 is load-bearing for nothing;
P9 and P12 are load-bearing and are therefore assigned to the only environment that can settle
them.

**Consequences, wired into the design:**

- P1/P1b/P2 → the `onClick` handler MUST call `e.preventDefault()` on the pending path. An early
  return alone leaves the defect exactly as it was, while making the row *look* fixed. This is the
  R2 BLOCKING finding.
- P4 → the focus-retention claim in §6 is **not** provable by the jsdom component test. It is
  asserted only in Playwright (§8.2), and no jsdom test may be cited as evidence for it. A green
  jsdom suite says nothing about this behavior in either direction.
- P5 → pending background must win by explicit CSS precedence, never by assumed suppression.

---

## 4. Component contract

### 4.1 Rendered vs conceptual

Everything in the §3.5 table is a **rendered element** with the stated `data-testid`. The spinner
is a real DOM node that appears in the pending branch, not a class toggle on the lock.

### 4.2 Mode boundaries

`_PickerInterstitial` renders two row modes, keyed on
`isClaimed = c.claimed_via_oauth_at !== null` (`_PickerInterstitial.tsx:170`):

| Element | Claimed row | Unclaimed row |
|---|---|---|
| Lock glyph | yes (idle only) | no |
| Spinner | yes (pending only) | **no — no pending state at all (R5)** |
| Role chip | yes | yes |
| Client boundary | yes (`_ClaimedRowButton`) | no — stays a Server Component |
| Form action | `/auth/sign-in`, `method="GET"` | `selectIdentityFormAction` |

The unclaimed branch (`_PickerInterstitial.tsx:240-260`) is untouched by this diff.

### 4.3 Guard conditions

- `role` empty string → idle renders no chip; pending renders the `Signing in…` chip anyway (R4). `role` is non-nullable, so there is no null case to guard.
- `name` empty → empty truncating span; row keeps its 44px floor.
- `lockHint` missing → the existing literal fallback.
- Pending with `prefers-reduced-motion: reduce` → spinner renders but does not animate; the chip
  text swap and the `aria-disabled` state still convey pending. Motion is never the sole signal.
- Rapid double-tap → the second tap reaches the `onClick` guard, which calls `e.preventDefault()`
  and returns because `pending` is already true, so no second submit is issued. Both halves are
  required: `aria-disabled` does not stop activation (§3.6 P2) and an early return alone does not
  cancel the default action (§3.6 P1). The `preventDefault` is the load-bearing part and is pinned
  by a submit-count assertion (§8.2), never assumed. Closing this double-submit is the defect.

### 4.4 Cap / truncation

The roster list is not newly unbounded by this change. The name span keeps its existing
`truncate` + `min-w-0` treatment; the pending chip is `shrink-0` like the role chip it replaces, so
a long name yields to the chip rather than pushing it out of the row.

---

## 5. Dimensional invariants

The row is a **min-height** parent (`min-h-tap-min`, the 44px tap floor: `--spacing-tap-min` is `44px` at
`app/globals.css:162`, applied at `_PickerInterstitial.tsx:174`), not a fixed-height one, and it is a flex container with
`items-center`. Tailwind v4 does not default `.flex` to `align-items: stretch`, which is why the
existing `items-center` is explicit and must stay.

| Parent → child | Invariant | Guaranteed by |
|---|---|---|
| row → left group | vertically centered, single line | `items-center` on the row (`_PickerInterstitial.tsx:174`) |
| row → spinner | 16px box, does not raise row height above the 44px floor | `size-4` on `Loader2`; the row's `min-h-tap-min` is a floor and a 16px glyph sits under it. The row carries only `px-4` (`_PickerInterstitial.tsx:174`) — there is **no** vertical padding class, so do not cite one |
| lock slot → spinner slot | **equal WIDTH**, so the name does not shift horizontally | Not equal by construction: the lock is a bare Unicode glyph in a span with no width class (`_PickerInterstitial.tsx:210-224`) while the spinner is `size-4`. The swap needs an explicit fixed-width slot wrapping BOTH. A height-only assertion cannot see this, so §8.2 additionally asserts the name span's left edge is unchanged across the swap (R2 finding 7) |
| row → pending chip | single line, no wrap | `shrink-0` + `whitespace-nowrap` applied to the **pending chip only**, NOT to the shared `chipBase` at `_PickerInterstitial.tsx:182`. `chipBase` feeds both the claimed and the unclaimed chip (`_PickerInterstitial.tsx:253-257`); adding no-wrap there would change unclaimed-row overflow behavior for arbitrary `role` text, which R5 puts out of scope |
| row → name span | truncates rather than wrapping | existing `truncate` + `min-w-0` on the left group |
| row height, idle → pending | **unchanged** | the two states differ only in a 16px-for-16px glyph swap and chip text; neither adds a line |

The plan carries a real-browser Playwright assertion for the last row: measure the claimed row's
`getBoundingClientRect().height` in idle and in pending and assert equality within 0.5px. jsdom
cannot compute this.

---

## 6. Transition inventory

The claimed row has two states, so one pair, plus compounds.

| From → To | Treatment |
|---|---|
| idle → pending | Lock unmounts, spinner mounts in the same slot; chip text swaps. **Instant — no animation**, deliberately: the spinner's own rotation is the motion, and a fade would delay the one signal the user is waiting for. Row background keeps its existing `transition-colors duration-fast` (120ms, `app/globals.css:223`), which is a hover treatment and is unrelated. |
| pending → idle | Does not occur in the normal flow — the pending state ends by navigating away. It **does** occur on a bfcache back-navigation, where the page is restored with its DOM (and React state) intact rather than remounted; the `pageshow` listener from §3.4 is what returns the row to idle. Instant, no exit animation. Without that listener the restored page would show a row stuck in pending. |

Compound transitions:

| Compound | Treatment |
|---|---|
| pending while the pointer is over the row | Hover background is **not** suppressed by `aria-disabled` — Tailwind v4 emits a bare hover pseudo-class with no disabled guard, and CSS hover matches by pointer position regardless. So pending must WIN explicitly: the pending row class sets its background via an `aria-disabled:` variant declared after the hover rule, and a real-browser test asserts the computed background under pointer-over-while-pending. Do not assume the disabled state suppresses anything. |
| pending while the row holds keyboard focus | Focus ring persists, and this is now guaranteed rather than assumed — it is exactly why §3.5 uses `aria-disabled` instead of `disabled`. A natively `disabled` button is not focusable and the browser would drop focus to `<body>`. The row keeps `focus-visible:ring-2 ring-focus-ring ring-offset-2` (`_PickerInterstitial.tsx:176`), asserted in a real browser by checking BOTH that `document.activeElement` is still the row AND that its computed `boxShadow` is not `none` — an active-element check alone stays green with every ring class deleted, and an `outline` check does too, because Chromium paints its own outline on any focused element (§8.2; oracle at `tests/e2e/agendaScheduleLayout.spec.ts:542-555`). |
| pending arriving mid-hover-transition | The 120ms `transition-colors` completes into the pending background rather than the hover background, because of the explicit precedence above. Asserted in the real-browser transition test, not inferred. |
| two rows tapped in quick succession | Each row owns its own `pending` state, so a second tap on a *different* row can legitimately show two pending rows for the instant before the first navigation commits. Accepted: both taps are real, and the navigation that wins is the browser's call. No cross-row coordination is introduced — that would need lifted state and buys nothing. |

---

## 7. Non-surfaces

| Layer | Action |
|---|---|
| Table DDL / CHECK / enum | N/A — no DB change |
| RPC read / write | N/A — no RPC signature change |
| Advisory locks (invariant 2) | N/A — no mutation of `shows`, `crew_members`, `crew_member_auth`, `pending_syncs`, `pending_ingestions` |
| Migration → validation parity | N/A — no `supabase/migrations/**` file |
| §12.4 catalog | N/A — no new or edited error code. `OAUTH_REDIRECT_INVALID` keeps its row and its copy; this diff makes it fire *less often*, not differently |
| Invariant 9 (Supabase call boundary) | N/A — no new Supabase client call site |
| Invariant 10 (mutation surface telemetry) | N/A — no mutation surface is added or modified. `cleanupStaleEntry` is untouched now that §1.3 is descoped |
| Invariant 8 (impeccable dual gate) | **APPLIES** — `_ClaimedRowButton` and `_PickerInterstitial.tsx` are UI surface |

---

## 8. Test plan

Anti-tautology note for every item: assert against the thing under test, not a container that
would pass for an unrelated reason.

### 8.1 Bootstrap route (`tests/auth/picker-bootstrap.test.ts` — existing file)

- **RED first.** A `next` of `/show/<slug>/<64hex>?s=schedule` with a valid intent token currently
  403s. Assert it redirects `302` with `Location` equal to the full query-carrying path.
- One case per shape in the §2.1 table: bare, `?s=`, `?gate=`, `?s=&gate=`. All four assert the
  **exact** `Location`, not merely "not 403" — a handler that stripped the query would pass a
  status-only assertion while reintroducing the deep-link loss R1 rejects.
- **Negative, path grammar (R6):** `next` of `/show/<slug>/<64hex>/extra` still 403s. This is the
  assertion that proves the `$` anchor survived; without it, `split("?")` plus a loosened anchor
  would look identical.
- **Negative, intent binding:** a token signed for a *different* slug still 403s at `route.ts:161` when the
  `next` carries a query — proving the query did not become part of the signed comparison.
- **Negative, unknown param:** `?s=schedule&evil=1` — `validateNextParam` drops `evil`, so the
  emitted `Location` must contain `s=schedule` and must not contain `evil`. Guards the §3.2 safety
  argument at the seam where it actually matters.

### 8.2 Claimed row

Harness: jsdom + `@testing-library/react`, rendering `PickerInterstitial` with a roster fixture —
the shape already used by `tests/show/pickerAffordance.test.tsx:20-26`. Pending is driven by
firing a real click on the row, **not** by a controlled action promise: the controlled-promise
idiom at `tests/components/RetryWatchButton.test.tsx:50-56` exists to hold a Server Action open and
does not apply to a native GET form (§3.4).

- Component test: pending renders `picker-row-spinner`, drops `picker-row-lock`, sets
  `aria-disabled="true"` + `aria-busy="true"` (NEVER the native `disabled` attribute — §3.5), and shows `Signing in…` in `picker-role-chip`. Scope the chip
  query to the claimed row's subtree — the unclaimed rows in the same list render
  `picker-role-chip` too, and an unscoped query would pass on the wrong node.
- **Anti-regression on the probe (§3.4):** the fixture roster must contain BOTH a claimed and an
  unclaimed row, and the test asserts the claimed row reaches pending. A `useFormStatus`
  implementation would leave `pending` false forever and fail here — this is the test that catches
  a future "cleanup" back to the admin idiom. Concrete failure mode: pending never appears.
- Component test, R4: a claimed row with `role=""` renders no chip in idle and the `Signing in…`
  chip in pending. **Not `role={null}`** — the prop is `string` and the column is `not null`, so a
  null fixture is unrealizable and would only prove the test harness accepts an impossible input.
- **Component test, double-activation (the R2 BLOCKING regression guard).** Attach a submit
  listener to the row's form, fire TWO activations, assert exactly ONE submit. Failure mode caught:
  an `onClick` that early-returns without `e.preventDefault()` — measured `submits=2` (§3.6 P1),
  i.e. the row looks busy and still double-submits, leaving the entire defect unfixed. Repeat for
  keyboard activation. **The keyboard half runs in Playwright, not jsdom** — jsdom does not
  synthesize button activation from Enter/Space (measured: `keyboardClicks=0`) and this repo does
  not install `@testing-library/user-event`, so a jsdom keyboard assertion would be vacuously
  green. A pointer-only proof would leave keyboard users still double-submitting.
- Component test, R5: an unclaimed row never renders `picker-row-spinner` in any state.
- Component test, bfcache reset: dispatch a `pageshow` event with `persisted: true` after reaching
  pending, and assert the row returns to idle. Failure mode caught: a restored page showing a
  permanently disabled row.
- Real-browser layout: idle vs pending row `getBoundingClientRect().height` equal within 0.5px
  (§5), plus the name span's left edge unchanged within 0.5px (the lock-vs-spinner width
  invariant), run over **two** fixtures — one row WITH a role and one with `role=""`. The roleless
  case is the higher-risk one and must not be omitted: with a role present, pending merely swaps
  one chip's text for another, but with `role=""` pending ADDS a chip that idle does not have,
  which is the configuration most likely to change the row's height. A single role-bearing fixture
  would prove the easy substitution case and never exercise the addition that R4 introduces.
  jsdom cannot compute layout; this runs in Playwright.
- Real-browser layout oracles that geometry alone cannot supply. Each is paired with the mutation
  it kills, because the obvious geometric version of each does NOT discriminate:
  - `truncate` → assert the name span's computed `textOverflow` is `ellipsis` and computed
    `overflow` is `hidden`, plus its right edge within its parent's content box. Deleting
    `truncate` leaves height, name-edge, chip containment, chip `white-space` and spinner
    geometry all green while the name paints past its allocation.
  - `items-center` on the row → assert the pending chip's measured height is strictly less than the
    row's **`clientHeight`**, NOT its `getBoundingClientRect().height`. Two earlier versions of this
    oracle were vacuous: a spinner-centre-vs-row-centre check fails because the left group carries
    its own `items-center` (`_PickerInterstitial.tsx:210`) and re-centres the spinner inside a
    stretched group; and a border-box comparison fails because the row has a 1px border under
    `box-sizing: border-box`, so a stretched chip measures ~42px against a 44px border-box and stays
    "less than". `clientHeight` excludes the border, so the stretched chip equals it exactly and the
    assertion flips (R7).
  - `size-4` on the spinner → assert a 16×16 box within 0.5px. Without it lucide-react falls back
    to 24×24, still under the 44px row floor, so a row-height comparison cannot see it.
  - `whitespace-nowrap` on the pending chip → assert its computed `white-space` is `nowrap`.
  Fixture for all of these: a 120-character single-token name at a 360px viewport, so `truncate`
  is the only thing that can contain it and there is no wrapping opportunity.
- Real-browser pending-vs-hover precedence: with the pointer over the row, assert the computed
  background while pending is the pending background, not `hover:bg-surface` (§6 row 1).
- Real-browser focus retention AND ring: focus the row, drive it to pending, assert both that
  `document.activeElement` is still the row (failure mode: shipping `disabled`, which drops focus
  to `<body>`) and that the focused row's computed `boxShadow` is not `none` (failure mode: the
  `focus-visible:ring-*` classes deleted or overridden — neither an active-element check nor an
  `outline` check can see that). Oracle: `tests/e2e/agendaScheduleLayout.spec.ts:542-555`.
- Transition audit: enumerate every conditional branch in `_ClaimedRowButton` against the §6 table
  and assert each is either animated as stated or deliberately instant.

### 8.3 Regression — retire the e2e workaround

`tests/e2e/stage-restricted-crew-schedule.spec.ts` currently bootstraps on the bare URL and
re-navigates with `?s=schedule`, at three sites, each carrying the same comment beginning
"TWO-STEP navigation, and it is load-bearing." All three collapse to a single direct navigation to
the `?s=schedule` URL. **This is the highest-value assertion in the plan**: it is the one place
where the fix is proved end-to-end against a real browser and a real Google session, rather than
against a route unit test. If it fails, R1 did not actually ship.

---

## 9. Documented limits

- The bootstrap fix preserves exactly the params `validateNextParam` allow-lists (`s`, `gate`).
  A future section id must be added to `BASE_SECTION_IDS` to survive bootstrap; that is the
  existing contract, not a new limit, and it fails closed (the param is dropped, the user lands on
  the show).
- **Cancelled or hung navigation — SUPERSEDED 2026-08-03, see below.** This section originally
  accepted a permanently-pending row and explicitly rejected a timeout, on the reasoning that
  re-enabling the row while the OAuth hop was still in flight would restore the double-tap defect.
  **That reasoning was wrong in one respect and is amended here** rather than left to disagree
  with the code (invariant 7: the spec is canonical).

  What it missed: **re-tapping WAS the recovery** for a sign-in that never lands, and the pending
  guard is exactly what removes it. Accepting a permanently-pending row therefore does not
  preserve the status quo — it takes away the only escape the crew member had, on the surface
  where the original defect (bad venue wifi) is most likely. Surfaced as a **P0** by the
  invariant-8 impeccable critique; dispositions recorded in the plan's §12.

  **Amended behavior:** pending self-clears after `PENDING_TIMEOUT_MS` (8s,
  `_ClaimedRowButton.tsx`), and the timer is cleared on unmount, on `pageshow`, and on
  re-activation so a stale callback can never clear a later pending.

  **Residual risk, stated rather than hidden.** If the hop is genuinely still in flight at 8s, the
  row becomes tappable again and a second tap issues a second GET to `/auth/sign-in`. That is a
  navigation, not a mutation — it is idempotent, and the second one simply supersedes the first.
  The original concern was real but priced the wrong side: an idempotent duplicate navigation
  after eight seconds is cheaper than an inert row with no recovery at all.

  The `pageshow` listener still covers the common back-navigation recovery.
- The bfcache reset path is specified from the `pageshow` contract and is covered by a component
  test firing a synthetic `pageshow` (§8.2). A synthetic event proves the listener is wired; it
  does not prove a real browser's bfcache restores this page at all (Chrome declines bfcache for
  pages with certain headers). The worst case if it never fires is the cancelled-navigation limit
  above, which is already documented.

---

## 10. Files touched

| File | Change |
|---|---|
| `app/api/auth/picker-bootstrap/route.ts` | `parseNextPath` splits the query before matching (§3.2), and is exported so §8.1's grammar test can reach it directly |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` | claimed `<button>` subtree extracted; `whitespace-nowrap` goes on the PENDING chip only, not shared `chipBase` (§5) |
| `_ClaimedRowButton` | **new**, `"use client"` (§3.4) |
| `tests/components/StaleCleanupAutoSubmit.test.tsx` | `SANCTIONED` gains `_ClaimedRowButton`, else the client-island guard at `StaleCleanupAutoSubmit.test.tsx:61-79` fails. This is the ONLY change to that file — the five-hidden-input assertion stays five, since §1.3 is descoped |
| `tests/auth/picker-bootstrap.test.ts` | §8.1 cases |
| `tests/e2e/picker-flow.spec.ts` | §8.2 real-browser claimed-row assertions (this file, not `crew-layout-dimensions.spec.ts`, because CI runs it) |
| `tests/e2e/stage-restricted-crew-schedule.spec.ts` | §8.3 workaround retired at three sites |

| new component + layout + transition tests | §8.2 |
| `BACKLOG.md` | TWO entries graduated to `BACKLOG-archive.md`; the descoped third is amended and stays OPEN (last commit; see §11 and §1.3) |

## 11. Ledger contention

Several sessions are live on this repo and one of them owns the ledger files. All `BACKLOG.md`
edits are the **last** commit authored before the PR opens; if a ledger-owning branch is still
unmerged at that point, rebase onto it rather than racing it.

That commit does three things:

1. **Graduate two entries** to `BACKLOG-archive.md` — `BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`
   and `BL-PICKER-CLAIMED-ROW-PENDING-STATE`.
2. **Amend, not graduate, `BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT`.** It stays OPEN. Add the
   §1.3 premise refutation (the cache-tag probe), the invariant-2 obstacle its e2e hits, and the
   instruction that any future attempt measures the rendered post-cleanup screen first rather than
   reasoning from cache-tag behavior. Leaving the entry as-is would re-file a known-false cause.
3. **Correct a dangling citation.** `BL-PICKER-CLAIMED-ROW-PENDING-STATE` cites `master spec §16.6`
   for the `Confirming…` pending idiom, but
   `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §16 contains only §16.1 and §16.2. The
   real ratification is `docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175`.
   This rides the same commit because it edits an entry being archived.
