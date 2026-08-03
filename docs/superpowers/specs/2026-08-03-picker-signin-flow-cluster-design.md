# Picker sign-in flow cluster — design

**Date:** 2026-08-03
**Branch:** `fix/picker-signin-flow-cluster`
**Backlog items closed:** `BL-PICKER-BOOTSTRAP-NEXT-QUERY-REJECTED`, `BL-PICKER-CLEANUP-REVALIDATE-QUERY-VARIANT`, `BL-PICKER-CLAIMED-ROW-PENDING-STATE`

Three defects on the crew first-contact sign-in path, shipped as one PR because they share one
surface (the picker interstitial and the route that returns to it) and one review.

---

## 1. Scope

### 1.1 Resolved scope — do not relitigate

Every row below is ratified. Verify the citation; do not re-derive the decision.

| # | Decision | Ratified by |
|---|---|---|
| R1 | The bootstrap handler **preserves** the allow-listed `next` query rather than stripping to the canonical bare URL. | Owner, 2026-08-03, this branch's brainstorming gate. Rationale: `lib/auth/validateNextParam.ts:77` has already reduced the query to an allow-list before the handler sees it, and the handler already redirects to that same query-carrying string at `app/api/auth/picker-bootstrap/route.ts:189` and `app/api/auth/picker-bootstrap/route.ts:211`. |
| R2 | `cleanupStaleEntry` gains the validate-then-redirect its sibling already has, **and** a new prod-build e2e lands in the same PR. Not e2e-only, not won't-fix. | Owner, 2026-08-03, brainstorming gate. The entry's own precondition ("write a prod-build e2e first so the change is provable") is satisfied by shipping both together. |
| R3 | The claimed-row pending affordance is **spinner in place of the lock + role chip text swapped to `Signing in…`** (mockup option C). Not a bare fade, not a spinner alone, not a second line under the name. | Owner, 2026-08-03, brainstorming gate, chosen against a rendered four-option mockup. |
| R4 | When a claimed row has no `role`, the pending chip **still renders** (it is the only right-side signal) and unmounts on completion. | This spec, §4.3. Routine guard-condition call; `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:227` renders the chip conditionally on `c.role` today. |
| R5 | **Unclaimed** rows are out of scope and get no pending state. Their form posts a local Server Action, not a three-hop OAuth journey. | This spec, §4.2 mode boundary. The backlog item is scoped to the claimed row (`BACKLOG.md`, `BL-PICKER-CLAIMED-ROW-PENDING-STATE`). |
| R6 | `SHOW_NEXT_RE` stays `$`-anchored against the **path portion**. The fix splits the query off before matching; it does not loosen the path grammar. | This spec, §3.2. Loosening the anchor would admit `/show/<slug>/<token>/anything`. |
| R7 | No DB, migration, RPC, or advisory-lock surface is touched. Invariant 2 and the migration→validation parity checklist are N/A for this diff. | This spec, §7. |

### 1.2 Out of scope

- Any change to `lib/auth/validateNextParam.ts`'s allow-lists. `ALLOWED_NEXT_SECTION_VALUES`
  (`validateNextParam.ts:26`) and `ALLOWED_NEXT_GATE_VALUES` (`validateNextParam.ts:30`) are correct as they stand; the bug is downstream
  of them.
- The unclaimed-row select flow. Its redirect fix already shipped
  (`_PickerInterstitial.tsx:113-114`).
- `_StaleCleanupAutoSubmit.tsx`'s auto-submit mechanics. Its empty dependency array is deliberate
  and load-bearing (it is what prevents a resubmit loop); this spec does not touch it.

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

### 2.2 Stale cleanup revalidates a path, not a URL

`lib/auth/picker/cleanupStaleEntry.ts:107` calls
`revalidatePath(\`/show/${input.slug}/${input.shareToken}\`)` and the file contains no `redirect`.
`revalidatePath` takes a path and ignores the query, so a picker reached at `?gate=skip` keeps
serving its cached entry and the cleared stale hint lingers until the next navigation.

This is the same defect already fixed one file over, in the sibling select-identity action
(`_PickerInterstitial.tsx:113-114`):

```ts
if (!isValidShowPathPair({ slug, shareToken })) return;
redirect(buildShowReturnUrl(slug, shareToken, { s: typeof s === "string" ? s : undefined }));
```

Severity stays low: the intended screen after cleanup **is** the picker, so the user is already
looking at the right thing. The observable defect is a stale hint, not lost access.

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

### 3.3 Stale cleanup: mirror the ratified sibling

After the existing `revalidatePath` at `cleanupStaleEntry.ts:107`, add the same guard-then-redirect
pair the select action uses. `revalidatePath` is kept, not replaced — it invalidates the cache
entry; the redirect moves the browser to the canonical URL. They do different jobs.

Ordering constraint: the redirect goes **after** the `log.info` emit
(`PICKER_STALE_ENTRY_CLEANED`, `cleanupStaleEntry.ts:124-130`) and after the best-effort
`PICKER_SELECTION_RACE` alert. Next.js `redirect()` throws a control-flow exception; anything
placed below it does not run. Invariant 10 requires the telemetry emit to survive, so it must
precede the throw.

### 3.4 Claimed row: one new client boundary

`useFormStatus` reads from the nearest enclosing `<form>` and only fires for a **descendant** of
that form. So the boundary is the `<button>` subtree, not the `<form>`:

- New file `_ClaimedRowButton`, `"use client"`.
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
| `role` | `string \| null` | `null` / empty → no chip in idle. In pending the chip renders regardless (R4). |
| `crewMemberId` | `string` | Passed through to `data-crew-member-id`. |
| `lockHint` | `string` | The `aria-label` on the lock. Falls back to `"Sign in to use this identity"`, matching the existing fallback at `_PickerInterstitial.tsx:212`. |
| `chipClassName` | `string` | Computed server-side and passed in, so the client component holds no role-flag logic. |
| `rowClassName` | `string` | Same, for the row's class string. |

### 3.5 Pending treatment (R3)

Follows the ratified idle/pending idiom
(`docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175`) and the
`useFormStatus` recipe at `components/admin/RetryWatchButton.tsx:36-47`
(`disabled={pending}` + `aria-busy={pending}` + label swap).

| Element | Idle | Pending |
|---|---|---|
| Lock glyph (`data-testid="picker-row-lock"`) | 🔒 with `aria-label` | not rendered |
| Spinner | not rendered | `<Loader2 aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />`, `data-testid="picker-row-spinner"` |
| Name | truncated | unchanged |
| Role chip (`data-testid="picker-role-chip"`) | `role` if present, else absent | text `Signing in…` (R4: renders even when `role` is null) |
| `<button>` | enabled | `disabled`, `aria-busy="true"` |

The spinner is `lucide-react`'s `Loader2`, the icon every other spinner in the tree uses
(`components/admin/FinalizeButton.tsx:549`, `components/admin/wizard/Step3ReviewModal.tsx:486`,
`app/admin/settings/roles/RoleMappingRow.tsx:297`). `motion-reduce:animate-none` follows
`components/admin/ReSyncButton.tsx:252`, the one existing spinner that is reduced-motion aware —
the picker is a crew-facing surface and should not be the exception.

The lock is swapped for the spinner rather than sitting beside it so the row's left edge does not
reflow. Both occupy the same slot.

**Copy.** `Signing in…` — U+2026 as a literal ellipsis character, matching `Retrying…` /
`Confirming…`. No em-dash. The apostrophe rule does not apply (no apostrophe).

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

- `role` null/empty → idle renders no chip; pending renders the `Signing in…` chip anyway (R4).
- `name` empty → empty truncating span; row keeps its 44px floor.
- `lockHint` missing → the existing literal fallback.
- Pending with `prefers-reduced-motion: reduce` → spinner renders but does not animate; the chip
  text swap and the `disabled` state still convey pending. Motion is never the sole signal.
- Rapid double-tap → the second tap hits a `disabled` button and is a no-op at the DOM level, which
  is the actual defect being closed.

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
| row → spinner | 16px box, does not raise row height above the 44px floor | `size-4` on `Loader2`; row's `min-h-tap-min` is a floor, and 16px + `py` stays under it |
| row → pending chip | single line, no wrap | `shrink-0` + `whitespace-nowrap` on the chip; `whitespace-nowrap` is **added** by this diff — `chipBase` (`_PickerInterstitial.tsx:182`) does not carry it today and `Signing in…` is wider than most role strings |
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
| pending → idle | Does not occur in the normal flow — the pending state ends by navigating away. It **can** occur if the browser restores the page from bfcache after a back-navigation, in which case React remounts with `pending: false` and the row returns to idle instantly. No exit animation. |

Compound transitions:

| Compound | Treatment |
|---|---|
| pending while the pointer is over the row | Hover background (`hover:bg-surface`) is suppressed — a `disabled` button takes no hover styling. No conflict with the 120ms color transition. |
| pending while the row holds keyboard focus | Focus ring persists on the disabled button. The row keeps its `focus-visible:ring-2 ring-focus-ring ring-offset-2` (`_PickerInterstitial.tsx:176`). Keyboard users must not lose their place because the row went busy. |
| pending arriving mid-hover-transition | The 120ms color transition completes against the disabled state's background; no interruption, no flash. Verified in the plan's transition-audit task. |
| two rows tapped in quick succession | Impossible to have two pending: the first tap begins a full-page navigation. If it were possible, `useFormStatus` is per-form, so each row reports only its own form's status. |

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
| Invariant 10 (mutation surface telemetry) | `cleanupStaleEntry` is an existing registered surface and keeps its `PICKER_STALE_ENTRY_CLEANED` emit; §3.3 pins the emit above the redirect throw so it still runs |
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

### 8.2 Stale cleanup

- Unit: `cleanupStaleEntryCoreImpl` still emits `PICKER_STALE_ENTRY_CLEANED` **and** the redirect is
  attempted, in that order. Assert on the emit spy having recorded before the redirect throw — an
  assertion that merely checks both happened would pass with the order inverted, which is the exact
  regression §3.3 exists to prevent.
- Prod-build e2e: one stale reason (`epoch_stale`), driven at `?gate=skip`, asserting the browser
  lands on the canonical URL with the stale hint gone. Extends `tests/e2e/picker-flow.spec.ts`,
  which already runs prod-build on `desktop-chromium` in `.github/workflows/crew-e2e.yml`.
  Derive the expected URL from the fixture's slug/token, never a hardcoded string.

### 8.3 Claimed row

- Component test: pending renders `picker-row-spinner`, drops `picker-row-lock`, sets
  `disabled` + `aria-busy="true"`, and shows `Signing in…` in `picker-role-chip`. Scope the chip
  query to the claimed row's subtree — the unclaimed rows in the same list render
  `picker-role-chip` too, and an unscoped query would pass on the wrong node.
- Component test, R4: a claimed row with `role={null}` renders no chip in idle and the
  `Signing in…` chip in pending.
- Component test, R5: an unclaimed row never renders `picker-row-spinner` in any state.
- Real-browser layout: idle vs pending `getBoundingClientRect().height` equal within 0.5px (§5).
- Transition audit: enumerate every conditional branch in `_ClaimedRowButton` against the §6 table
  and assert each is either animated as stated or deliberately instant.

### 8.4 Regression — retire the e2e workaround

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
- The stale-cleanup redirect is proved for one of the three stale reasons (`epoch_stale`). The
  other two (`removed_from_roster`, `identity_invalidated`) share the same code path below the
  branch that classifies them, so the coverage is representative rather than exhaustive. Stated
  here rather than discovered in review.
- `pending → idle` via bfcache (§6) is reasoned from React remount semantics, not measured. It is
  not a designed state — no behavior depends on it — and the worst case is a row that correctly
  reads as tappable again.

---

## 10. Files touched

| File | Change |
|---|---|
| `app/api/auth/picker-bootstrap/route.ts` | `parseNextPath` splits the query before matching (§3.2) |
| `lib/auth/picker/cleanupStaleEntry.ts` | guard-then-redirect after the existing emit (§3.3) |
| `app/show/[slug]/[shareToken]/_PickerInterstitial.tsx` | claimed `<button>` subtree extracted; `whitespace-nowrap` added to `chipBase` (§5) |
| `_ClaimedRowButton` | **new**, `"use client"` (§3.4) |
| `tests/auth/picker-bootstrap.test.ts` | §8.1 cases |
| `tests/e2e/picker-flow.spec.ts` | §8.2 stale-cleanup e2e |
| `tests/e2e/stage-restricted-crew-schedule.spec.ts` | §8.4 workaround retired at three sites |
| new component + layout + transition tests | §8.3 |
| `BACKLOG.md` | three entries graduated to `BACKLOG-archive.md` (last commit; see §11) |

## 11. Ledger contention

Three sessions are live on this repo and one of them owns the ledger files. The `BACKLOG.md`
graduation is the **last** commit before the PR opens; if a ledger-owning branch is still unmerged
at that point, rebase onto it rather than racing it. Same rule for the dangling `§16.6` citation
noted below.

**Adjacent defect, not fixed here:** `BL-PICKER-CLAIMED-ROW-PENDING-STATE` cites `master spec §16.6` for the
`Confirming…` pending idiom. `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`
§16 contains only §16.1 and §16.2 — that citation is dangling. The real ratification is
`docs/superpowers/specs/2026-07-20-show-scoped-alert-copy-design.md:175`. The correction rides the
graduation commit, since it edits the same entry being archived.
