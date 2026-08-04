# Per-row undo announcement for the changes feed (BL-SYNCFEED-UI-1)

**Date:** 2026-08-03
**Ledger entry:** `BACKLOG.md` → `BL-SYNC-FEED-UI-POLISH` / `BL-SYNCFEED-UI-1`
**Branch:** `feat/sync-feed-undo-announce`
**Surface:** `components/admin/**` (UI — invariant 8 dual-gate applies; Opus-owned per the routing hard rule)

---

## 0. Summary

Undoing a single change in the sync changes feed currently produces **no screen-reader feedback**. Sighted users see the row self-heal on revalidation; a screen-reader user hears nothing at all. This spec adds a per-row success announcement to both surfaces that render a single-row Undo control, using the append-shaped live-region mechanism this project already ships, extracted into one shared module rather than copied a third time.

It also closes a defect of the same class found by sweeping the surface: the three feed action buttons render their failure card by **conditional mount**, which is the classic not-announced pitfall — so a failed Undo, Accept, or Approve/Reject is silent to AT as well.

Four ledger dispositions ride along: `BL-SYNCFEED-UI-1` resolves, `BL-SYNCFEED-UI-3` graduates as already-shipped, `BL-SYNCFEED-UI-2` is ratified as untriggered, and the parent `BL-SYNC-FEED-UI-POLISH` closes.

---

## 1. Problem

### 1.0 What is broken

`UndoChangeButton` (`components/admin/UndoChangeButton.tsx`) submits a `<form action={dispatch}>` driven by `useActionState` (`UndoChangeButton.tsx:79`). On `{ok: true}` it renders nothing new — the comment at `UndoChangeButton.tsx:15` states the contract outright: "On `{ok:true}` the page revalidation flips the row to undone."

That revalidation is precisely what destroys any announcement placed inside the button. In the feed, `ChangeFeedEntry` gates the control on `canUndo = entry.action === "undo" && entry.changeLogId != null` (`components/admin/ChangeFeedEntry.tsx:88`), rendered at `ChangeFeedEntry.tsx:141`. A successful undo flips `action` to `none`, `canUndo` goes false, and the whole `UndoChangeButton` subtree **unmounts**.

That flip is not inferred — it is what the read path computes. `action: "undo"` is returned only under `row.status === "applied" && isCrewDomainChangeKind(row.change_kind) && row.individually_undoable === true` (`lib/sync/feed/shapeChangeFeed.ts:65-69`); every other row falls through to the `action: "none"` base object at `lib/sync/feed/shapeChangeFeed.ts:52`. Undo moves the row to `undone`, so the first conjunct fails on the next read and the control is gone. A live region that unmounts cannot announce, and one that mounts already-populated is the documented not-announced pitfall (`docs/superpowers/specs/2026-07-22-warning-announcer-copy-design.md:139-142`).

So the remedy the ledger note proposes — "consider an `aria-live` region" inside `UndoChangeButton` — cannot work where it is written. The region has to live in a component that outlives the button.

### 1.1 Resolved scope — do not relitigate

Each row is a decision already made, with its ratification. A reviewer should verify the citation, not re-derive the decision.

| # | Decision | Ratification |
|---|---|---|
| R1 | The announcement region does **not** live inside `UndoChangeButton`. The button unmounts on success (`ChangeFeedEntry.tsx:88` + `ChangeFeedEntry.tsx:141`), so a region there is destroyed before AT can read it. The ledger note that proposed that placement is corrected by this spec, not followed. | §1.0 above |
| R2 | The bulk "Undo all" announcement is **already shipped** and is NOT in scope. `RecentAutoAppliedStrip.tsx:544-558` renders a persistent sr-only `role="status"` region (`auto-applied-bulk-undo-status-${showId}`), covered by tests at `tests/components/admin/RecentAutoAppliedStrip.test.tsx:623`. It is left byte-identical. Only the **per-row** channel is new. | `RecentAutoAppliedStrip.tsx:544-558` |
| R3 | The per-row channel uses the **append-shaped `role="log"`** mechanism, not `role="status"`. An identical text change may not re-announce; an identical *addition* always does. This is the project's stated answer to that class, and the collision is reachable here rather than theoretical — see §1.2. | `2026-07-22-warning-announcer-copy-design.md:134-137`, §1.2 |
| R4 | Clear-then-set (blank the region, then write) is **forbidden** as a re-announce trick and is not an option under consideration. | `2026-07-22-warning-announcer-copy-design.md:361-362` |
| R5 | The announcement copy is **hard-coded**, not a §12.4 catalog row. It is an admin-facing inline success sentence, not a user-visible error code, so invariant 5 does not reach it. | `2026-08-01-announce-a11y-pass-design.md:22` |
| R6 | The shared announce-log module **retrofits** `ShowReviewSurface`'s warnings channel rather than existing alongside it. The alternative — a third near-verbatim copy of the same 12 lines — is the weaker outcome, and the retrofit is proven safe by that surface's existing MutationObserver tests (`tests/components/admin/review/warningsPanelStatusMount.test.tsx:105`), which fail loudly on any DOM change. | §3.1, §6 |
| R7 | The failure-path fix covers **all three** feed action buttons, not only Undo. Patching the named instance while two siblings carry the identical shape is the whack-a-mole the class-sweep rule exists to prevent. | `AGENTS.md` "Class-sweep before patching adversarial findings" |
| R8 | Failure announcements accept a **documented limit on two of the three controls**: for Undo and Accept, two consecutive failures with the *same* error code do not re-announce (`role="status"` text-change semantics; their `failing` ignores pending — `UndoChangeButton.tsx:80`, `AcceptChangeButton.tsx:74`). `Mi11GateActions` is exempt: its `failing` is gated on `!lastPending` (`Mi11GateActions.tsx:137`), so a retry blanks the region and settlement refills it, giving an empty→text transition that announces even for a repeat code. The visible card is present throughout in all three cases. Upgrading the failure channel to append-shape is deliberately not done — it would put error copy through a log region whose entries persist after the card is gone. | §8 |
| R9 | `BL-SYNCFEED-UI-2` (badge `title` tooltips are hover-only) ships **no code**. Its own text conditions action on "if touch-discoverability is raised"; it has not been. The badge already renders a real text label (`ChangeFeedBadge.tsx:55`), so the color-blind floor and the non-hover information floor are both met — the `title` is supplementary. | §9.2 |
| R10 | `BL-SYNCFEED-UI-3` ships **no code**. The off-type fixture it describes was corrected at commit `c3920fe6a`; `tests/components/admin/ChangeFeedEntry.test.tsx:192` now reads `{ disposition: "removal" as const }` and no fixture in the tree carries `name` on a removal literal. The `Disposition` union is unchanged (`lib/sync/holds/types.ts:7-10`). | §9.3 |
| R11 | Announcing the undo **failure** path through the catalog (routing `code` → copy inside the announcement string) is **out of scope**. The fix here makes the existing `ErrorExplainer` card announce by making its wrapper always-mounted; the card already owns the copy and already satisfies invariant 5. No catalog lookup moves into the announcement. | §4.2 |

### 1.2 Why identical announcements are reachable

The choice of an append-shaped region rests on two undoable rows being able to carry byte-identical announcement text.

**The obvious argument is wrong, and was corrected in review.** An earlier draft claimed a crew member removed in one sync and re-added in a later one leaves two identical undoable rows. It does not: every newer same-entity change runs `cleanup_superseded_before_images`, which flips the older row to `status='superseded'` (`supabase/migrations/20260608000003_undo_change_rpc.sql:298`, invoked from `lib/sync/phase2.ts:549`), and `action: "undo"` requires `status='applied'` (`lib/sync/feed/shapeChangeFeed.ts:65`). The database regression test proves exactly this sequence (`tests/db/undo-before-image-cleanup.test.ts:26-45`). Two identical-summary rows for the *same entity on one show* can never both be undoable.

**The reachable collision is across shows, and the layout channel is precisely what makes it reachable.** Summaries are built from the crew member's name alone, with no show, row id, or run discriminator (`lib/sync/changeLog/writeAutoApplyChanges.ts:98`, `writeAutoApplyChanges.ts:112`, `writeAutoApplyChanges.ts:126`). The dashboard strip groups undoable rows from *many shows* into one list (`lib/admin/loadRecentAutoApplied.ts:51`), and under §3.5 they all announce into a single layout-wide region. Two shows that both dropped a crew member of the same name each produce `Crew member Alice Chen removed`, both `applied`, both undoable, both announcing into the same channel. Crew working across concurrent shows is the normal case for this product, not a contrivance.

**The cleanup that refutes the same-show case does not reach the cross-show one.** `cleanup_superseded_before_images(p_show_id)` is scoped to a single show by signature (`supabase/migrations/20260608000003_undo_change_rpc.sql:298`), and its supersession predicates match on `entity_ref` within that show. Two shows that each drop an Alice Chen produce two rows neither of which supersedes the other, both `applied`, both undoable, both announcing the same sentence into the one layout-wide channel. The strip renders a group per show (`lib/admin/loadRecentAutoApplied.ts:46`), so both are on screen at once.

Under `role="status"` the second undo would be silent. Under `role="log"` both announce, because an identical *addition* always announces. The mechanism is additionally pinned by a passing test on the channel being extracted (`tests/components/admin/review/warningsPanelStatusMount.test.tsx:131`).

---

## 2. What ships

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
1. **`components/admin/announceLog.tsx`** (new, client) — the append-shaped announce channel extracted from `ShowReviewSurface`: a `useAnnounceLog()` hook and an `AnnounceLogRegion` component.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
2. **`components/admin/undoAnnounceContext.ts`** (new, client) — a context carrying `{ announce }`, defaulting to a no-op, mirroring `warningAnnounceContext`.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
3. **`components/admin/AdminAnnounceProvider.tsx`** (new, client) — holds the channel, provides the context, and renders the region as its always-first child (§3.5).
4. **`app/admin/layout.tsx`** — wraps its selected branch in `AdminAnnounceProvider`, above `PageTransition`.
5. **`components/admin/UndoChangeButton.tsx`** — consumes the context, announces on the success branch, and makes its failure card announce.
6. **`components/admin/AcceptChangeButton.tsx`**, **`components/admin/Mi11GateActions.tsx`** — the same failure-card fix (class sweep, R7). No success announcement is added to either; that is not this entry's scope.
7. **`components/admin/ChangeFeedEntry.tsx`**, **`components/admin/RecentAutoAppliedStrip.tsx`** — one `announceLabel` prop threaded to each of the two `UndoChangeButton` call sites. Neither provides context nor renders a region; neither holds announcement state.
8. **`components/admin/review/ShowReviewSurface.tsx`** — retrofitted onto the extracted module (R6), DOM output unchanged.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
9. **`tests/styles/_metaUndoAnnounceProvider.test.ts`** (new) — the four-assertion structural guard of §5.
10. **`tests/e2e/published-review-modal.crew-actions.spec.ts`** — the real-browser accessibility-tree assertion (§11); an existing file, because a new one would not be collected.
11. **`BACKLOG.md`** — the four ledger dispositions plus three filed rows (`BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`); **`DESIGN.md`** — the announcement contract paragraph.

`components/admin/ChangesFeed.tsx` is deliberately absent: under §3.5 it needs no change at all.
---

## 3. Component contracts

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
### 3.1 `components/admin/announceLog.tsx`

Extracted verbatim in behavior from `ShowReviewSurface.tsx:382-392` (state + `announce`) and `ShowReviewSurface.tsx:1160-1171` (the region JSX).

```ts
export const ANNOUNCE_LOG_CAP = 50;

export type AnnounceLogEntry = { id: number; text: string };

export function useAnnounceLog(): {
  announce: (message: string) => void;
  entries: ReadonlyArray<AnnounceLogEntry>;
};

export function AnnounceLogRegion(props: {
  entries: ReadonlyArray<AnnounceLogEntry>;
  label: string;
  testId: string;
}): JSX.Element;
```

`useAnnounceLog` semantics, each preserved from the shipped implementation:

- **Ids come from a per-mount monotonic `useRef` counter**, never a timestamp — two `announce` calls batched into one commit must not collide (`ShowReviewSurface.tsx:378-382`).
- **Empty or whitespace-only messages are a no-op**, appending nothing (`ShowReviewSurface.tsx:385`).
- **Cap `ANNOUNCE_LOG_CAP = 50`**; appending the 51st drops the oldest. An entry is only removed once it is 50 announcements old, far beyond any plausible AT delivery-queue residence.
- `announce` is `useCallback`-stable with an empty dependency list, so a consumer may put it in a dependency array without re-subscribing.

`AnnounceLogRegion` renders exactly one element, with no wrapper:

```tsx
<span role="log" aria-label={label} className="sr-only" data-testid={testId}>
  {entries.map((e) => (
    <span key={e.id} data-announce-id={e.id}>
      {e.text}
    </span>
  ))}
</span>
```

`role="log"` carries implicit polite + `aria-atomic="false"` + `aria-relevant="additions text"`, so only the added node is presented and removals are silent — which is what makes the cap safe. No explicit `aria-live`, `aria-atomic`, or `aria-relevant` attribute is written; the role's implicits are the contract (`2026-07-22-warning-announcer-copy-design.md:128-133`).

**Guard conditions.**

| Input | Value | Behavior |
|---|---|---|
| `announce(message)` | `""` / whitespace-only | No-op. No entry appended, no re-render. |
| `announce(message)` | any non-blank string | Appended. No length cap, no truncation (see §8). |
| `entries` | `[]` | Region renders as an empty `<span>` — **still mounted**. This is the load-bearing case: the region exists before the first announcement. |
| `entries` | `> 50` entries | Impossible by construction; the hook caps. If a caller passes a longer array directly, the region renders all of them — the component does not re-cap. |
| `label` | `""` | Not permitted; every call site passes a literal. Not defended at runtime. |
| `testId` | `""` | Same. |

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
### 3.2 `components/admin/undoAnnounceContext.ts`

```ts
export type UndoAnnounce = { announce: (message: string) => void };
export const NOOP_UNDO_ANNOUNCE: UndoAnnounce = { announce: () => {} };
export const UndoAnnounceContext = createContext<UndoAnnounce>(NOOP_UNDO_ANNOUNCE);
```

Modeled on `components/admin/review/warningAnnounceContext.ts:12-16`. The no-op default means a button mounted outside a provider — a standalone test harness, a future surface — announces nothing and never throws. That silence is a real hazard, so §5 pins it with a structural guard rather than trusting it.

### 3.3 `components/admin/UndoChangeButton.tsx`

Two changes.

**(a) Success announcement.** A new optional prop and a wrapped action:

```ts
announceLabel?: string;
```

```ts
const { announce } = useContext(UndoAnnounceContext);
const announcingAction = useCallback<UndoServerAction>(
  async (prev, formData) => {
    const r = await undoAction(prev, formData);
    if (r.ok) announce(undoneAnnouncement(announceLabel));
    return r;
  },
  [undoAction, announce, announceLabel],
);
const [result, dispatch, pending] = useActionState(announcingAction, null);
```

The announcement happens **inside the action's async flow**. The wrapped action is chosen over an effect for a reason that needs no ordering guarantee (§3.7): an effect scheduled on the `{ok:true}` commit is not guaranteed to run at all when the component unmounts in the same commit, whereas an already-executing async continuation always finishes. An earlier draft justified this by claiming the callback necessarily precedes RSC reconciliation; that claim is withdrawn in §3.7 and must not be reintroduced here.

**(b) Failure announcement.** The wrapper around `ErrorExplainer` becomes always-mounted with `role="status"`, so the card's appearance is a text change inside a live region rather than a node insertion:

```tsx
<div data-testid="change-feed-undo-result" role="status" className={failing ? CARD : "sr-only"}>
  {failing ? <ErrorExplainer code={failing.code} surface="admin" /> : null}
</div>
```

`data-testid="change-feed-undo-result"` moves from the conditional node to the persistent one. **Existing tests that assert this testid is absent before a failure now need `toHaveTextContent("")` instead of `toBeNull()`** — see §7.

**No layout changes, and here is why.** The wrapper's parent is `flex flex-col gap-2` (`UndoChangeButton.tsx:83`; identically `AcceptChangeButton.tsx:77` and `Mi11GateActions.tsx:140`), so an always-present second child is the obvious suspicion — a phantom `gap-2` on every button that has never failed. It does not occur: `sr-only` sets `position: absolute`, and an absolutely positioned child is not a flex item, so it contributes neither a track nor a gap. In the failing state the element is back in flow with the same classes it has today. Rendered geometry is byte-identical to current behavior in both states, which is why this spec owes no Playwright layout assertion.

**Guard conditions.**

| Prop | Value | Behavior |
|---|---|---|
| `announceLabel` | `undefined` | Announcement is `"Change undone."` — the bare sentence, no dangling colon. |
| `announceLabel` | `""` / whitespace-only | Same as `undefined`. Treated identically by `undoneAnnouncement`. |
| `announceLabel` | non-blank | `"Change undone: <label>."` — the function supplies the terminal period (§4.1). |
| context | no provider above | `announce` is the no-op; nothing announced, nothing thrown. Guarded structurally (§5). |
| `undoAction` | resolves `{ok:false}` | No success announcement. Failure card announces via (b). |
| `undoAction` | throws | No announcement of either kind. `useActionState` surfaces the rejection; unchanged from today. |
| `stretch` / `quiet` | unchanged | Untouched by this spec. |

### 3.4 `components/admin/AcceptChangeButton.tsx` and `components/admin/Mi11GateActions.tsx`

The (b) fix only, verbatim in shape: the conditional wrapper at `AcceptChangeButton.tsx:86-93` and `Mi11GateActions.tsx:165-172` becomes always-mounted with `role="status"`, testid moving to the persistent node (`change-feed-accept-result`, `mi11-gate-result`).

`Mi11GateActions` computes `failing` from a settled-and-failing predicate (`Mi11GateActions.tsx:137`) — that logic is untouched; only the render shape changes.

Neither gains a success announcement. Accept and Approve/Reject success feedback is a separate question and a separate ledger item if anyone wants it.

### 3.5 The channel is owned by the admin layout, not by any surface

Two review rounds moved this defect one component further out each time, which is the signal to stop moving it and remove the property that lets it move at all.

**What the last round established.** A component keeping its hook state is not the same as its live region keeping its DOM node. When a component's returned tree changes shape, React unmounts the old region and mounts a new one that is already populated — the exact not-announced pitfall, now reached by a different route. Codex reproduced it against React 19 in jsdom on the shape this spec had proposed: `ownerStatePreserved: true, sameNodeAcrossBranch: false`. Every per-surface owner considered so far fails this way:

| Proposed owner | Branch that replaces its region |
|---|---|
| `UndoChangeButton` | `canUndo` flips false (`ChangeFeedEntry.tsx:88`) |
| `GroupSection` | the group empties as its rows leave the `applied` set |
| `RecentAutoAppliedStrip` root | zero-groups and `infra_error` returns are different shapes; and `components/admin/Dashboard.tsx:565` returns an entirely different tree on an infra result, which does not contain the strip at all |
| `ChangesFeed` | `components/admin/showpage/ChangesSection.tsx:60` chooses between the error rendering and `<ChangesFeed>` on `feed === null` |

The pattern is not "pick a component further out." It is that **any owner below a data-dependent branch is wrong**, and every one of these surfaces sits below one.

**This is not a new rule — it is an existing one this surface never followed.** `DESIGN.md:479` already says the region node must be branch-stable, that single-return components render it as a key-stable sibling, and that it must never sit behind `display: contents`. Three review rounds rediscovered, at increasing cost, a constraint the design system had already written down. Two consequences worth stating: §3.5's placement is the documented rule applied rather than a novel invention, and the surfaces enumerated under `BL-ANNOUNCE-REGION-UNMOUNT-CLASS` in §9.5 are violating a ratified rule, not merely an unlucky pattern — which is what makes them a debt row rather than a matter of taste.

**The owner is therefore `app/admin/layout.tsx`.** A new client component `AdminAnnounceProvider` holds `useAnnounceLog`, provides `UndoAnnounceContext`, and renders the region. The layout wraps its chosen branch in it:

```tsx
// app/admin/layout.tsx: EACH of the three returns is wrapped, individually.
// Not one wrapper around a collapsed single return: A1 and A3 are stated over
// the component's returns, and the per-return shape is what makes both
// mechanically checkable (§5).
return (
  <AdminAnnounceProvider testId="admin-undo-status" label="Undo updates">
    {/* this branch's existing tree, whose root carries data-inert-root */}
  </AdminAnnounceProvider>
);
```

The provider is the OUTERMOST element of each return, so it always precedes that branch's `data-inert-root` root (`app/admin/layout.tsx:160`, `layout.tsx:182`) and never nests inside it. That ordering is what A3 checks.

```tsx
// components/admin/AdminAnnounceProvider.tsx ("use client")
export function AdminAnnounceProvider({
  children,
  testId,
  label,
}: {
  children: ReactNode;
  testId: string;
  label: string;
}) {
  const { announce, entries } = useAnnounceLog();
  const ctx = useMemo(() => ({ announce }), [announce]);
  return (
    <UndoAnnounceContext.Provider value={ctx}>
      <AnnounceLogRegion entries={entries} label={label} testId={testId} />
      {children}
    </UndoAnnounceContext.Provider>
  );
}

// Layout:  <AdminAnnounceProvider testId="admin-undo-status"  label="Undo updates">
// Dialog:  <AdminAnnounceProvider testId="dialog-undo-status" label="Undo updates in this dialog">
```

Two properties make this immune rather than merely further away:

- **The region is always the first child, and `{children}` always the second.** Its sibling index never changes, whatever the page below renders, so React never has cause to replace the node.
- **The wrapper sits above the layout's own branching.** `app/admin/layout.tsx` itself returns three different trees (`app/admin/layout.tsx:90`, and again at `layout.tsx:155` and `layout.tsx:177`); wrapping the selected branch rather than editing each return means even a layout-level branch flip preserves the region's position. Those branches key on admin identity and the finalize checkpoint, neither of which an undo can change — but the design does not rely on that argument, which is the kind of reasoning the previous two rounds refuted.

The precedent is already in the file: `DeveloperFlagProvider` (`app/admin/layout.tsx:170`) is a client context provider mounted from this server layout. `AdminAnnounceProvider` goes **outside** `PageTransition` (`app/admin/layout.tsx:171`), because a keyed page transition is exactly the sort of thing that remounts its subtree.

#### 3.5.1 The region must be a SIBLING of `[data-inert-root]`, never a descendant

This is the single most important placement constraint in the spec, and following the `DeveloperFlagProvider` precedent literally would violate it.

**Every feed undo happens inside a modal that hides the layout from assistive technology.** `ChangesFeed` has exactly one render site, `components/admin/showpage/ChangesSection.tsx:71`; `ChangesSection` has exactly one render site, `components/admin/showpage/PublishedReviewModal.tsx:673`. That modal renders through `ReviewModalShell`, whose mount effect queries `[data-inert-root]` and sets both `inert` and `aria-hidden="true"` on every match (`components/admin/review/ReviewModalShell.tsx:180-189`). The matches are the admin layout's own shells (`app/admin/layout.tsx:160` and `app/admin/layout.tsx:182`).

So a region placed *inside* the layout's root div is `aria-hidden` during exactly the interaction it exists to announce. Nothing reaches the accessibility tree. The feature would be dead on its primary surface.

**The wrap-the-branch shape avoids this, and that is why it is mandatory.** The layout's main return *is* the inert-root div (`app/admin/layout.tsx:177-182`). Wrapping the returned element in `AdminAnnounceProvider` puts the region as its **preceding sibling**, outside the subtree `ReviewModalShell` hides. Nesting the provider inside that div — the shape `DeveloperFlagProvider` uses at `app/admin/layout.tsx:170` — puts the region inside the hidden subtree and silently kills the feature.

| Placement | Result |
|---|---|
| `<AdminAnnounceProvider>` wrapping the returned root div | region is a sibling of `[data-inert-root]`; unaffected by the modal. **Required.** |
| provider nested inside the root div, beside `DeveloperFlagProvider` | region is a descendant of `[data-inert-root]`; `aria-hidden="true"` whenever the review modal is open. **Forbidden.** |

**jsdom cannot catch this**, which is why it is also an e2e obligation. `ReviewModalShell.tsx:176` says so outright, and Testing Library ignores `aria-hidden` when querying. A unit test therefore stays green on a completely dead feature. §11 carries a real-browser assertion for it, and §5's A3 pins the structural shape.

#### 3.5.2 A second channel lives INSIDE the dialog

Escaping `aria-hidden` by sitting outside the shell is necessary but not sufficient. `ReviewModalShell` renders its dialog with `role="dialog"` and `aria-modal="true"` (`components/admin/review/ReviewModalShell.tsx:584`). ARIA specifies content outside an `aria-modal` dialog as excluded from the accessibility tree while it is open, and support for announcing a live region outside such a dialog is inconsistent across screen readers. A region that is merely *not hidden* is therefore still not reliably *announceable* from inside the modal.

So the modal gets its own channel:

| Channel | Mounted by | Serves |
|---|---|---|
| Layout channel (`admin-undo-status`) | `AdminAnnounceProvider` in `app/admin/layout.tsx`, wrapping the returned root (§3.5.1) | every non-modal admin surface, including the dashboard strip |
| Dialog channel (`${testIdBase}-undo-status`) | a second `AdminAnnounceProvider` inside `ReviewModalShell`, wrapping the panel interior as `PopoverHostContext` does | every surface rendered inside a review modal, including the per-show changes feed |

**The dialog channel's identifiers are parameterized off `testIdBase`, not hard-coded.** `ReviewModalShell` has three render sites — `components/admin/showpage/PublishedReviewModal.tsx:687`, `components/admin/showpage/ShowReviewModalSkeleton.tsx:44`, and `components/admin/wizard/Step3ReviewModal.tsx:373` — and every existing testid in the shell is already derived from `testIdBase` (`ReviewModalShell.tsx:583`). A hard-coded `dialog-undo-status` would put one id on three shells, reintroducing the strict-mode ambiguity that motivated distinct ids in the first place. The label follows the same rule.

Two of those three shells never host an undo, so their channels are inert by construction. That is acceptable: an unused channel costs one empty `sr-only` span and keeps the shell's contract uniform.

**The skeleton swap is a second post-hydration replacement, and it is added to the spike.** `ShowReviewModalSkeleton` is the Suspense fallback for the published modal (`app/admin/page.tsx:168`), so the fallback-to-real transition destroys one shell and mounts another **after** hydration. The reachability argument that covers the portal flip does not automatically cover this one, because it is a data-load boundary rather than a hydration boundary. What bounds it: announcements originate only in the resolved modal, which mounts once and stays, so nothing announced can be lost to a swap that precedes it. That argument is **not ratified here** — it is the same shape as the arguments five rounds refuted — and §11's spike gains a third part that drives an undo across the Suspense swap.

The two ids differ deliberately, and **so do the two `aria-label`s**: `"Undo updates"` at the layout, `"Undo updates in this dialog"` inside the modal. Both regions are attached at once while a modal is open, so a shared identifier is wrong twice over. A shared `data-testid` makes `page.getByTestId(...)` match two elements, fail Playwright strict mode, and lose the ability to prove the **dialog** region received the announcement. A shared `aria-label` is the same defect one layer up, in the accessibility tree rather than the test locator: a screen-reader user navigating by region would find two identically-named logs and no way to tell which belongs to the dialog they are in. Round 4 caught the test-locator half of this; the label half is the same class.

**The precedent is in the same file, and was itself ratified by review.** `ReviewModalShell` already hosts exactly this shape for a different concern: `PopoverHostContext` makes the shell "the ONE provider site, wrapping the ENTIRE panel interior" so that popovers "stay inside the focus trap / aria-modal / inert subtree" (`components/admin/review/ReviewModalShell.tsx:690-695`), a scope the file records as widened in response to a prior cross-model finding. The dialog channel is the same move for announcements, and it wraps the same region of the tree.

The file also states the premise independently: the shell is inerted `aria-hidden` as "belt-and-suspenders beyond `aria-modal`, which browse-mode readers honor inconsistently" (`ReviewModalShell.tsx:161-163`). This spec does not need to establish that inconsistency; the codebase already treats it as given, and §3.5.2 is the announcement-side consequence.

Nesting is the mechanism, and it needs no coordination: React context resolves to the nearest provider, so a button inside the dialog announces into the dialog's region and the same button on the dashboard announces into the layout's, with no prop, flag, or branch deciding which. Both regions are branch-stable first children of components whose position cannot change, so §3.5's argument applies unchanged to each.

**This is the point where the design stopped being patched and was restructured.** Three review rounds landed on region placement; per `docs/agents/spec-self-review.md:22`, a design-correctness vector surviving three rounds is not to be patched a fourth time. What changed here is structural: instead of finding one position that survives everything, every context in which an announcement can originate now owns a channel at a position that cannot move.

**UNRATIFIED: the cold-load portal flip.** `ReviewModalShell` renders its tree in place until `useHasMounted()` flips, then moves it with `createPortal(tree, document.body)` (`components/admin/review/ReviewModalShell.tsx:723`), and this repository documents that the flip makes React **recreate the host DOM nodes** (`tests/lib/a11y/dialogFocusReattach.test.tsx:6-13`) — a bug it already had to fix once, for the focus trap, via a `reattachKey`. A dialog-channel region lives inside that tree and is therefore recreated on a cold load.

There is a reachability argument that this cannot bite: the flip runs in the first post-mount effect, and an undo requires a React form action, which requires hydration to have completed — so no undo can be initiated before the flip. **That argument is not ratified here, and deliberately so.** Region placement has now absorbed four adversarial rounds, each one refuting the previous round's prose with a new interaction of this codebase's modal machinery. `docs/agents/spec-self-review.md:22` is explicit that a design-correctness vector surviving three rounds is not to be patched a fourth time: build the probe, descope, or mark it unratified pending a spike.

This spec marks it unratified and defines the spike, in two parts, because review established that one of them alone proves less than it appears to.

**Part 1 — post-flip steady state.** Deep-link the modal open (`/admin?show=`), let the portal flip occur, undo, assert the announcement lands. This is necessary but **not sufficient**: by letting the flip finish first it only exercises the settled tree, which is exactly the case nobody disputes.

**Part 2 — across the flip.** Drive an undo whose action is initiated or resolves while the flip is in progress, and assert the announcement is not lost. This is the disputed sequence and the only one that can ratify or refute the claim.

**Part 2 is expected to be unconstructible, and that is itself the finding.** `useHasMounted` is `useSyncExternalStore(emptySubscribe, () => true, () => false)` (`lib/a11y/useHasMounted.ts:22-26`), so its client snapshot is `true` on the FIRST client render: the flip is part of hydration, not a later effect. An undo requires a React form action, which requires hydration to have completed. If the spike cannot construct an interaction that spans the flip, that is evidence the sequence is unreachable — and the task records that outcome explicitly rather than silently passing Part 1 and calling the vector closed.

If either part fails, or if Part 2 turns out to be constructible after all, the dialog channel is not viable in its current form and the design changes before anything is built on it.

**If the probe fails, the redesign is already scoped.** The fallback is the pattern this codebase already uses for the identical problem on the identical flip: `useDialogFocus` accepts a `reattachKey` and re-runs its effect when the container node changes (`lib/a11y/dialogFocus.ts:60`, `dialogFocus.ts:117-122`), which is exactly how the focus trap survives the portal recreation. The announcement analogue keeps the channel's *state* in a provider mounted outside `tree` (so no flip can discard it) and attaches the region *node* to the current dialog element under the same reattach key, so the node always lives inside the `aria-modal` subtree and is re-established whenever React recreates that subtree. It is more machinery than the current design, which is why it is the fallback rather than the proposal.

**What that citation does and does not establish.** `useDialogFocus` rebinds an event listener to a replacement node; it does not preserve a live-region node, and review was right to say so. It is cited as precedent for the *shape* — this codebase already re-establishes a11y machinery against the post-flip node under a reattach key — not as evidence that a live region survives. A live region re-attached this way is a NEW node, so the fallback additionally requires that the announcement be re-appended after re-attachment rather than assumed to have survived, which is the part that makes it more machinery than it first appears.

**The other unratified part, stated as such.** Whether a specific screen reader would have announced the layout region from inside the modal is not settled by this spec, and does not need to be — the dialog channel makes the question moot rather than answering it. What §11's real-browser assertion checks is mechanical and therefore trustworthy: the region that receives a feed undo is inside the dialog subtree, is not `aria-hidden`, and is not `inert`. No claim is made here about specific AT behavior, and none is relied upon.

One residual interaction, documented rather than defended: `FinalizeButton` inerts every direct child of `<body>` except its own portal while the finalize overlay is open. The undo region is a body-level sibling under that rule, so an announcement raised *during* a finalize overlay would not be read. Undo is not reachable from that overlay, so this is unreachable today; it is recorded in §8 as a constraint any future body-level inerting must respect.

**Consequences, all simplifications.** `ChangesFeed`, `ChangeFeedEntry`, `RecentAutoAppliedStrip`, and `GroupSection` gain **no** provider, **no** region, and **no** state. `RecentAutoAppliedStrip` keeps `return null` at `RecentAutoAppliedStrip.tsx:685` and its `infra_error` return exactly as they are — the "no empty card" intent is untouched, and the earlier proposal to return a bare `sr-only` span is withdrawn. The only edits to those four files are threading `announceLabel` to the two `UndoChangeButton` call sites.

| Element | Value |
|---|---|
| Region `testId` | `admin-undo-status` (layout) and `dialog-undo-status` (dialog) — **distinct**, because both are attached simultaneously while a modal is open and a single shared id makes a Playwright `getByTestId` ambiguous under strict mode |
| Region `label` | `"Undo updates"` (layout) and `"Undo updates in this dialog"` (dialog) — distinct for the same reason the ids are |
| Placement | first child of `AdminAnnounceProvider`, above every admin route |

### 3.6 What the two feed surfaces do

`ChangeFeedEntry` passes `announceLabel={entry.summary}` to `UndoChangeButton` (`ChangeFeedEntry.tsx:141`). `FeedEntry.summary` is a non-nullable `string` (`lib/sync/holds/types.ts:64`), already rendered visibly at `ChangeFeedEntry.tsx:104`, so the announcement names the change the user sees.

`StripRow` passes `announceLabel={row.summary}` to the `UndoChangeButton` at `RecentAutoAppliedStrip.tsx:298`. (`AutoAppliedRow` is the row *type* at `lib/admin/loadRecentAutoApplied.ts:36`, not a component.) `summary` is a non-nullable `string` on the row type (`lib/admin/loadRecentAutoApplied.ts:39`).

That is the entire change to both surfaces. The existing bulk region and its `bulkUndoOutcome` state are untouched (R2); §8 records the pre-existing defect that leaves standing and the row it is filed under.

### 3.7 Why the announcement survives

Three independent properties, each checkable rather than argued:

1. **The region's node is never replaced after hydration.** Each region is the first child of a component whose position is invariant under every branch below and above it (§3.5). The qualifier is load-bearing and was added in review: the dialog region **is** replaced once, by the `useHasMounted` portal flip (§3.5.2), so an unqualified "never replaced" contradicted this spec's own §3.5.2. Post-hydration it holds; that is the whole claim.
2. **The state owner outlives every surface that can announce.** `AdminAnnounceProvider` is mounted by the layout for the lifetime of the admin segment.
3. **The async continuation does not depend on its caller surviving.** `announce` is called after `await undoAction(...)` inside the wrapped action; that continuation runs whether or not `UndoChangeButton` has since unmounted, because it closes over the provider's `announce`, not over its own component instance.

The earlier draft argued this from the wrapped action necessarily preceding RSC reconciliation. That claim was framework-lifecycle speculation of the kind `docs/agents/spec-self-review.md:21` forbids without a probe, and it is withdrawn; ordering is now irrelevant because there is nothing for the announcement to race.

**Proved by same-node assertions, not by final text.** The previous round's probes checked only that the text arrived, which passes even when the original region was destroyed and a populated replacement mounted — the failure mode itself. Every probe in §11 now captures the region node before the action and asserts `toBe` on it afterwards.

## 4. Copy

### 4.1 Success

One exported function, so both surfaces are provably one string (`2026-08-01-announce-a11y-pass-design.md:49`):

```ts
// components/admin/undoAnnounceContext.ts
export function undoneAnnouncement(label?: string): string {
  const trimmed = label?.trim() ?? "";
  return trimmed === "" ? "Change undone." : `Change undone: ${trimmed}.`;
}
```

- No em dash (`DESIGN.md:381`, `scripts/spec-lint.ts`).
- Sentence case, and **both forms end in a period the function supplies**. An earlier draft omitted it on the labelled form, reasoning that `summary` is already sentence-shaped. It is not: all three generators emit an unterminated fragment (`lib/sync/changeLog/writeAutoApplyChanges.ts:98`, `writeAutoApplyChanges.ts:112`, `writeAutoApplyChanges.ts:126` produce `Crew member <name> renamed to <name>`, `Crew member <name> removed`, `Crew member <name> added`), so that draft announced `Change undone: Crew member Alice Chen removed` with no terminal punctuation. Screen readers use sentence-final punctuation for prosody, so `undoneAnnouncement` appends it rather than expecting it from the caller.
- **Fixtures must use a real summary shape.** The literal an earlier draft used in §11 (`… removed from crew.`) is not a string any generator produces. A fixture that misrepresents production is the anti-tautology rule's exact failure mode: the assertion passes while proving nothing about real output. Fixtures use `Crew member <name> removed` and its siblings verbatim.
- The colon form leads with the outcome so an AT user hears "Change undone" before the detail, and can stop listening there.

### 4.2 Failure

No new copy. `ErrorExplainer` already resolves `code` through the catalog and renders admin-surface copy; making its wrapper a live region changes only whether that existing copy reaches AT. No raw code enters the DOM at any point — invariant 5 holds unchanged.

---

## 5. Structural guard

Moving the channel to the layout (§3.5) changes what a guard can usefully assert. The old proposal — walk for files rendering `<UndoChangeButton` and demand a nearby provider — was aimed at a per-surface ownership model that no longer exists, and the last round was right that its widened form was under-specified and had no escaping mutant for the second detection branch. It is withdrawn and replaced with four assertions that are each provable.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
`tests/styles/_metaUndoAnnounceProvider.test.ts`:

| Assertion | Why it is checkable | Planted violation that must fail it |
|---|---|---|
| **A1 — the wrapper count matches the return count.** `app/admin/layout.tsx` contains at least as many `<AdminAnnounceProvider` occurrences as `return (` occurrences, and at least one of each. | The layout has three returns (`app/admin/layout.tsx:90`); a future fourth that forgets its wrapper drops the count below and fails. | The layout source with one wrapper deleted. |
| **A3 — the region is never inside an inert root.** `AdminAnnounceProvider` is not rendered as a descendant of any element carrying `data-inert-root` (§3.5.1). | Structural, and the difference between a working feature and a silently dead one. | The layout source with the provider nested inside the `data-inert-root` div instead of wrapping it. |
| **A2 — the channel is mounted only at sanctioned positions.** Every file rendering `<AdminAnnounceProvider` is either `app/admin/layout.tsx` or a modal shell (a file also rendering `role="dialog"`). No file other than the provider module references `UndoAnnounceContext.Provider` directly. Stated as a rule rather than a two-file allowlist, so that adding a channel to a future `aria-modal` surface — the CORRECT fix for that surface — passes, while a channel on an ordinary surface fails. | A third provider on some intermediate surface would shadow both channels with a shorter-lived one, which is the original defect wearing a new hat. An earlier draft of A2 said "nothing else provides", which the dialog channel now legitimately violates. | A third file rendering `<AdminAnnounceProvider>`; and separately a file rendering `<UndoAnnounceContext.Provider>` directly. |
| **A4 — no DIRECT announcing surface outside the admin tree.** Every file rendering `<UndoChangeButton` lives under `app/admin/` or `components/admin/`. | A future non-admin call site rendering the button directly silently consumes `NOOP_UNDO_ANNOUNCE` and announces nothing. | A file outside those trees rendering `<UndoChangeButton`. |

A1 and A3 are checked against `app/admin/layout.tsx` from comment-stripped source; A2 and A4 by a walk over `components/` and `app/` (excluding `app/api/**`). All four use `walk` and `stripCommentsForFile` from `tests/styles/_classScanUtils` (`_classScanUtils.ts:7`, `_classScanUtils.ts:17`), and **each assertion carries its own planted violation** — an earlier round's finding was that a widened guard shipped a mutant for only one branch, so a guard silently ignoring another would still pass.

A1 and A3 are deliberately shallow counting and line-order checks over one known file rather than general JSX analysis. An earlier draft stated A1 over "returns belonging to `AdminLayout`" and demanded a planted nested-helper case that must NOT fail — a discrimination brace depth cannot make, so the assertion was unbuildable as specified while disclaiming a parser. Counting is coarser and honest: it cannot tell which return lost its wrapper, only that one did, which is all the guard needs to say. The runtime proof is the e2e assertion in §11.

No file needs an exemption comment, because no surface component provides anything any more. `ChangeFeedEntry` and `RecentAutoAppliedStrip` simply consume a context their layout guarantees.

**A4 covers the direct case only, and the transitive case is explicitly NOT guarded.** An earlier draft tried to close the transitive hole with a hand-listed set of wrappers. That list was wrong on its first outing: it named `AutoAppliedRow`, which is a TypeScript type (`lib/admin/loadRecentAutoApplied.ts:36`) and not a rendered component, while the real immediate wrapper is `StripRow` (`components/admin/RecentAutoAppliedStrip.tsx:258`), and it omitted the exported transitive wrappers `<ChangesFeed>` (`components/admin/ChangesFeed.tsx:85`) and `<RecentAutoAppliedStrip>` (`RecentAutoAppliedStrip.tsx:561`) entirely. A hand-maintained inventory that is already incomplete on the day it ships is worse than no inventory, because it reads as coverage.

So A4 claims only what a filesystem scan can actually support. Ancestry is a runtime property; the guard reads source. The transitive risk — a non-admin file rendering `<ChangesFeed>` or `<RecentAutoAppliedStrip>` and getting the no-op channel — is real, unguarded, and recorded here rather than papered over. What bounds it today: both components are admin-surface by construction and neither is exported for general use, so reaching that state requires deliberately mounting an admin feed outside the admin tree. If that ever becomes plausible, the fix is a real import-graph check, not a longer list.

**What the guard does not cover, stated plainly.** It cannot prove the provider is an *ancestor* of a given button at runtime — that is what the behavioral tests in §11 are for, each rendering a surface inside `AdminAnnounceProvider` and asserting the announcement lands in the region. Guard for the structural regression, tests for the wiring; neither is claimed to be sufficient alone.


## 6. Retrofit contract for `ShowReviewSurface`

The swap is behavior-preserving and must be provably so. The retrofit replaces `ShowReviewSurface.tsx:382-392` with `useAnnounceLog()` and `ShowReviewSurface.tsx:1160-1171` with `<AnnounceLogRegion entries={announceLog} label="Warning updates" testId="warnings-panel-status" />`.

Pinned invariants, all already asserted by that surface's existing tests:

| Property | Required value | Existing proof |
|---|---|---|
| Region element | single `<span>`, no wrapper | `warningsPanelStatusMount.test.tsx:105` (MutationObserver: zero added/removed nodes across rerender) |
| `role` | `log` | `ShowReviewSurface.tsx:1161` |
| `aria-label` | `Warning updates` | `ShowReviewSurface.tsx:1162` |
| `className` | `sr-only` | `ShowReviewSurface.tsx:1163` |
| `data-testid` | `warnings-panel-status` | `ShowReviewSurface.tsx:1164` |
| Child shape | `<span key={id} data-announce-id={id}>{text}</span>` | `ShowReviewSurface.tsx:1167-1169` |
| Cap | 50, oldest dropped | `ShowReviewSurface.tsx:389` |
| Empty no-op | whitespace message appends nothing | `ShowReviewSurface.tsx:385` |
| Local `ANNOUNCE_CAP` const | deleted, replaced by the shared export | `ShowReviewSurface.tsx:68` |

If any warnings-panel test needs editing to accommodate the retrofit, the retrofit is wrong — stop and reconsider. The only permitted change to those files is none.

---

## 7. Test-shape changes forced by the failure-card fix

Making the error wrapper always-mounted changes what "no failure yet" looks like in the DOM. The sweep is closed at **ten** sites across three files, enumerated here so the implementation does not discover them one failing run at a time. No `e2e/` or Playwright test references any of the three testids.

| File | Line | Current assertion | Disposition |
|---|---|---|---|
| `tests/components/admin/UndoChangeButton.test.tsx` | 38 | `findByTestId(…).toBeInTheDocument()` | **strengthen** |
| `tests/components/admin/UndoChangeButton.test.tsx` | 50 | `findByTestId(…).toBeInTheDocument()` | **strengthen** |
| `tests/components/admin/UndoChangeButton.test.tsx` | 61 | `queryByTestId(…).toBeNull()` | convert |
| `tests/components/admin/AcceptChangeButton.test.tsx` | 53 | `getByTestId(…).toBeInTheDocument()` | **strengthen** |
| `tests/components/admin/AcceptChangeButton.test.tsx` | 69 | `queryByTestId(…).toBeNull()` | convert |
| `tests/components/admin/Mi11GateActions.test.tsx` | 95 | `findByTestId(…).toBeInTheDocument()` | **strengthen** |
| `tests/components/admin/Mi11GateActions.test.tsx` | 252, 258, 282, 287 | `queryByTestId(…).toBeNull()` | convert (4 sites) |

**Convert** means `expect(getByTestId("<x>-result")).toHaveTextContent("")`. That is a widening, not a weakening: it pins both that the node exists and that it is empty, where `toBeNull()` only pinned absence.

**Strengthen is the load-bearing half, and the reason this section exists.** Once the node is always mounted, `toBeInTheDocument()` is true *before the action ever runs* — those four assertions would keep passing while proving nothing, which is precisely the tautology the anti-tautology rule forbids. Each must assert the rendered failure copy instead, scoped to the result node: `expect(getByTestId("<x>-result")).toHaveTextContent(<the catalog copy for the code under test>)`, or an assertion on the nested `error-explainer-message` testid. An implementation that converts the six `toBeNull()` sites and leaves these four untouched has silently deleted four tests.

**One of the four is worse than redundant.** The Undo and Accept tests each carry an independent catalog-copy assertion alongside the node check, so losing the node check costs them redundancy, not coverage. `Mi11GateActions.test.tsx:95` has no such companion — its only positive evidence that a failure rendered is the node's presence plus the absence of a raw code. Convert it without strengthening and the file retains **zero** proof that MI-11 failures surface at all. That test gets a catalog-copy assertion as a hard requirement, not a nicety.

---

## 8. Documented limits

- **Repeat-identical failure, on Undo and Accept only.** Two consecutive failures with the same code do not re-announce there; `role="status"` announces on text change, and the text is unchanged. `Mi11GateActions` does not share the limit — its pending-gated `failing` (`Mi11GateActions.tsx:137`) blanks the region on retry, so settlement is a real text change. The visible card is present throughout in every case. Not fixed (R8).
- **The bulk "Undo all" announcement can still be lost, and is filed rather than fixed.** `bulkUndoOutcome` lives in `GroupSection` (`RecentAutoAppliedStrip.tsx:331`) and its region renders inside that group's panel (`RecentAutoAppliedStrip.tsx:544-558`). Undoing every undoable row in a show empties the group, so the group unmounts and the all-success announcement goes with it — the same defect class this spec fixes for the per-row channel, one component over. It is **pre-existing**, not introduced here. Fixing it means hoisting per-group state and per-group copy to the strip root, which is a redesign of the very channel R2 fences as out of scope and promises to leave byte-identical; doing it under this spec would make the retrofit claim in §6 untrue of §3.6 as well. Filed as **`BL-BULK-UNDO-ANNOUNCE-UNMOUNT`** with this analysis. Recorded here so a reviewer does not read the surviving per-group region as an oversight.
- **Long summaries.** `summary` is announced whole, with no truncation. Feed summaries are short generated sentences; a pathological one would be read in full. Accepted — truncating an announcement is worse than a long one.
- **Announcement ordering under burst.** Two undos resolving in the same commit append in resolution order, which may not be visual row order. AT reads both; only the sequence is unspecified.
- **Cap loss.** After 50 announcements in one mount, the oldest entries leave the DOM. They were announced when added; removals under `role="log"` are silent.
- **An uncatalogued failure code announces nothing.** `ErrorExplainer` returns `null` when the code has no catalog row (`components/messages/ErrorExplainer.tsx:82`, and again at `ErrorExplainer.tsx:93`), so the always-mounted wrapper stays empty and neither AT nor a sighted user learns anything. This is today's behavior exactly — the conditional wrapper also rendered an empty card — so the change neither introduces nor fixes it. Recorded because a reader of §3.3b would otherwise assume every failure now announces.
- **Body-level inerting would suppress the channel.** `FinalizeButton` inerts every direct child of `<body>` except its own portal while its overlay is open (`components/admin/FinalizeButton.tsx:660`). The undo region is a body-level sibling, so an announcement raised during that overlay would not be read. Unreachable today (undo is not available from the finalize overlay), but any future body-level inerting must exempt the region, and §5's A3 is the structural reminder.
- **The dialog channel dies with its dialog.** `ReviewModalShell` returns `null` when closed (`components/admin/review/ReviewModalShell.tsx:126`), so an announcement raised in the same tick the modal closes is lost. Undo does not close the modal, so this is not reachable through the flow this spec adds; it bounds what a future in-modal announcement may assume.
- **The layout region stays browse-navigable while a modal is open.** `app/layout.tsx` renders `<body>{children}</body>`, so the layout channel is a direct body child, and `ReviewModalShell` inerts only `[data-inert-root]` (`components/admin/review/ReviewModalShell.tsx:180`). A virtual-cursor user inside the dialog can therefore still reach a `role="log"` holding up to 50 earlier announcements. It is `sr-only`, carries a label naming it as updates, and holds no interactive content, so the cost is stray history rather than a trap or a leak — but it is a real difference from the shell, which IS hidden. Recorded rather than fixed: hiding it would require the layout channel to know a dialog is open, which reintroduces exactly the cross-surface coupling the two-channel design removes.
- **No success announcement for Accept or Approve/Reject.** Out of scope (§3.4).

---

## 9. Ledger dispositions

### 9.1 `BL-SYNCFEED-UI-1` — RESOLVED by this spec

Resolved, with the note's proposed placement corrected: the region lives in the parent, not the button (R1).

### 9.2 `BL-SYNCFEED-UI-2` — ratified as untriggered, no code

The entry conditions action on touch-discoverability being raised. It has not been. `ChangeFeedBadge` renders the status as a real text node (`ChangeFeedBadge.tsx:55`) with the `title` as pure supplement (`ChangeFeedBadge.tsx:52`), so no information is hover-only. Recorded in the ledger as a decided non-action with the re-open trigger preserved, in the shape the `BL-VERSION-AMBIGUOUS-V1-OVERRIDE` graduation used.

### 9.3 `BL-SYNCFEED-UI-3` — graduated as already-shipped

The fixture was corrected at `c3920fe6a`; `tests/components/admin/ChangeFeedEntry.test.tsx:192` reads `{ disposition: "removal" as const }`. A tree-wide sweep for a removal literal carrying `name` returns nothing. The `Disposition` union at `lib/sync/holds/types.ts:7-10` is unchanged, so the entry's premise ("tighten the fixtures if/when the type is hardened") is moot — the fixtures were tightened without the type moving.

### 9.4 `BL-SYNC-FEED-UI-POLISH` — closes

All three children disposed. The parent graduates to `BACKLOG-archive.md` at its terminal state, carrying its three sub-bullets with it.

**The three `KNOWN_DANGLING` rows stay** (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:108-113`). This is the non-obvious part and the implementation must not "tidy" them away: the guard scans `BACKLOG-archive.md` (`_metaLedgerReferentialIntegrity.test.ts:57`), so an archived entry's body still counts as a citation, and the ids remain heading-less body bullets there — still dangling by the guard's definition. The guard's dead-row ratchet (`_metaLedgerReferentialIntegrity.test.ts:316-322`) fires only when an id is cited **nowhere**, which is not the case here. Their reason strings keep naming `BACKLOG.md`: `BL-LEDGER-GUARD-BODY-DEFINED-IDS` stays OPEN there and cites all three (`BACKLOG.md:84`), so `BACKLOG.md` remains a citing file after the parent archives. The corpus form for a multi-file citation is `"cited in BACKLOG.md +1 more"` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:104`), which is what these rows become.

**`BL-LEDGER-GUARD-BODY-DEFINED-IDS` keeps all eight ids.** An earlier draft of this spec dropped the three from its enumeration on the theory that the entry tracks body-defined ids of *open* parents. It does not say that. Its contract is a body-leading bullet inside a parent whose own heading resolves (`BACKLOG.md:75-86`), and an archived parent's heading resolves through the same scanned ledger set — so the three ids remain exactly the examples the future body-definition guard will have to understand. Narrowing that entry to five would quietly shrink its documented scope while its actual work stayed the same size.

The edit that does land is additive: a parenthetical on the bullet naming the three `BL-SYNCFEED-UI-1` / `-2` / `-3` ids noting that its parent now lives in `BACKLOG-archive.md`, so a reader chasing the reference knows where to look. The count stays eight.

### 9.5 Filed, not fixed

**`BL-FEED-BUTTON-SUCCESS-ANNOUNCE`** — Accept and Approve/Reject announce failures (after this change) but not successes. Same asymmetry this spec fixes for Undo, one surface over. Filed with the analysis rather than fixed, because success copy for those two actions is a copy decision, not a mechanical one.

**`BL-BULK-UNDO-ANNOUNCE-UNMOUNT`** — the pre-existing bulk "Undo all" channel dies with its group (§8). Filed rather than fixed because the fix breaches R2.

**`BL-ANNOUNCE-REGION-UNMOUNT-CLASS`** — the class sweep this defect demanded, run across every live region in `components/` and `app/`. The defect is **not unique to the changes feed**, and the surfaces below violate a rule `DESIGN.md:479` already ratified.

Four surfaces own a success announcement their own success can unmount:

| Severity | Surface | Region | Removal mechanism |
|---|---|---|---|
| P0 | `components/admin/RescanSheetButton.tsx` | `RescanSheetButton.tsx:211` / `RescanSheetButton.tsx:221`, both under the conditional at `RescanSheetButton.tsx:182` | `router.refresh()` on success (`RescanSheetButton.tsx:135`) flips the row's status; Step-3 re-partitions rows, so the card, the button, and the just-set region all unmount. Eight call sites. |
| P1 | `components/admin/FinalizeButton.tsx` | conditionally inserted at `FinalizeButton.tsx:579` | Sets `complete` and refreshes at `FinalizeButton.tsx:437`, immediately before the wizard is replaced by the dashboard. |
| P1 | `components/admin/review/PublishedArchivedTabOffer.tsx` | `PublishedArchivedTabOffer.tsx:135` and `PublishedArchivedTabOffer.tsx:227` | Both mutations set a transient message then refresh (`PublishedArchivedTabOffer.tsx:95`, `PublishedArchivedTabOffer.tsx:188`); the revalidated `gear.wire` switches the parent between two different owning components (`step3ReviewSections.tsx:2515`). |
| P2 | `components/admin/RoleRecognizeControl.tsx:195` | the saved card *is* the region, returned only while `phase === "saved"` | The action syncs, calls `revalidateShow`, then returns the saved result (`app/admin/show/[slug]/_actions/roleToken.ts:179`); a successful convergence removes the warning the control is gated on. Partly mitigated by the focus move at `RoleRecognizeControl.tsx:118`. |

Fifteen conditionally-mounted region elements across thirteen sites, the sibling pitfall. Two sites carry two regions each: `RotateShareTokenButton.tsx:278` has separate active and inactive rotation outcomes, and `Step2Verify.tsx:496` has separate empty-folder and nothing-ready branches. Counting sites where the rest of this list counts elements is the inconsistency an earlier draft shipped while claiming exact counts. **Success** regions: `RoleMappingRow.tsx:212`, `AddAdminForm.tsx:157`, `RotateShareTokenButton.tsx:278`, `ReportModal.tsx:553`, `ReSyncButton.tsx:354`, `Step2Verify.tsx:496`, `MaterializeCard.tsx:222`, `MaintenanceResetButtons.tsx:193`, `MaintenanceResetButtons.tsx:240`, `ReapStaleSessionsButton.tsx:154`. **Error** regions, which an earlier draft misfiled as success regions: `BlockedRowResolver.tsx:251`, `archivedTabOffer.tsx:189`, `archivedTabOffer.tsx:248`.

An earlier draft of this row said "three surfaces" above a four-row table and "roughly eleven" conditional regions above eight, and classified three error regions as success regions. A debt row whose evidence cannot be counted is worth little, so the counts above are exact and the two categories are separated.

**Why filed and not fixed here.** Every one of these is pre-existing, none is on the changes-feed surface this ledger entry covers, and the P0 alone spans eight call sites and the Step-3 row-partitioning logic. Folding them in would turn a scoped accessibility fix into a cross-surface refactor of the admin app, and would put the invariant-8 gate over a diff nobody scoped. The sweep result belongs in the ledger with its evidence, which is what the class-sweep rule asks for — sweep the class, then decide per instance.

Verified clean and deliberately not filed (persistent, always-mounted regions): `PickerResetControl:193`, `ResetPickerEpochButton:210`, `CrewRowActions:242`, `ArchiveShowButton:365`, `StagedReviewCard:693`, `PendingPanelDiscardButtons:259`, `BulkIgnoreControls:224`, `FinalizeButton:515`, `ShareHub:836`, `ShowReviewSurface:1161`, `step3ReviewSections:1638,4095`, `Step3SheetCard:598`, `BellPanel:1266`.

---

## 10. Invariant compliance

| Invariant | Applies | Disposition |
|---|---|---|
| 1 — TDD per task | Yes | Every task: failing test first. |
| 2 — advisory lock | No | No mutation path touched; this is presentation only. |
| 3 — email canonicalization | No | No email boundary. |
| 4 — no global sync cursor | No | No sync source file touched. |
| 5 — no raw error codes in UI | Yes | Unchanged. `ErrorExplainer` still owns all failure copy; the announcement adds no code to the DOM (R11). |
| 6 — commit per task | Yes | Conventional commits, `feat(admin)` / `test(admin)` / `docs(backlog)`. |
| 7 — spec canonical | Yes | No amendment proposed. |
| 8 — impeccable dual-gate | **Yes** | `components/**` changed. `/impeccable critique` + `/impeccable audit` before cross-model review; findings and dispositions recorded in the plan's closeout. `impeccable-gate:` marker required. |
| 9 — Supabase call-boundary | No | No Supabase client call added or moved. |
| 10 — mutation surface instrumented | No | No route handler, no `"use server"` action added. The wrapped action is a client-side wrapper around an already-registered server action; it introduces no new mutation surface. |
| 11 — isolated worktree | Yes | `../FX-worktrees/sync-feed-undo-announce`. |
| 12 — ledger in-flight marker | Yes | Written at Stage 0, cleared at Stage 4.4. |

### 10.1 Dimensional Invariants

None. Every element added is `sr-only` or an existing wrapper whose box is unchanged; no fixed-dimension parent gains a flex or grid child. No Playwright layout assertion is owed.

### 10.2 Transition Inventory

The added regions have two visual states and no visual transition, because they are `sr-only`. The failure wrapper is the only element whose *rendered* state changes:

| From → To | Treatment |
|---|---|
| no failure → failure | Instant. The wrapper is always mounted; only its class and children change. Deliberately no animation — an error card that fades in delays the AT announcement behind a transition. |
| failure → no failure | Instant. Same reason. |
| failure(code A) → failure(code B) | Instant. Text swap inside the live region; announced. |
| announce-log empty → non-empty | Instant, invisible. Node addition inside `sr-only`. |
| non-empty → capped (oldest dropped) | Instant, invisible. Removal is silent under `role="log"`. |
| Compound: failure card appears while an undo announcement is mid-delivery | Two independent regions, one `status` and one `log`; AT queues them politely. No coordination attempted, and none needed — they are different regions with different roles. |

---

## 11. Test plan

Runner: Vitest 4.1.5, jsdom via the per-file `// @vitest-environment jsdom` pragma.

New test files created by this work, named exactly so the runner below is complete:

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `tests/components/admin/announceLog.test.tsx` — the extracted hook and region
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
- `tests/styles/_metaUndoAnnounceProvider.test.ts` — the structural walk

```
pnpm exec vitest run tests/components/admin/announceLog.test.tsx \
  tests/components/admin/UndoChangeButton.test.tsx \
  tests/components/admin/ChangesFeed.test.tsx \
  tests/components/admin/ChangeFeedEntry.test.tsx \
  tests/components/admin/ChangesFeed.a11y.test.tsx \
  tests/components/admin/RecentAutoAppliedStrip.test.tsx \
  tests/components/admin/AcceptChangeButton.test.tsx \
  tests/components/admin/Mi11GateActions.test.tsx \
  tests/components/admin/review/warningsPanelStatusMount.test.tsx \
  tests/styles/_metaUndoAnnounceProvider.test.ts
```

Both new files sit under directories the existing vitest projects already match, so no `testMatch` or workflow path-filter entry is added; the implementation task verifies that by running the command above and confirming ten files are collected, not nine.

Every assertion below names the failure it catches; an assertion that only proves "the function was called" is not admissible (`2026-08-01-announce-a11y-pass-design.md:140`).

**`announceLog` unit tests** (new file)

| Assertion | Failure caught |
|---|---|
| Two `announce` calls in one commit produce two entries with distinct ids | Timestamp-derived or state-derived ids colliding under batching |
| `announce("   ")` appends nothing | Whitespace polluting the region |
| The 51st append leaves 50 entries, oldest dropped, newest last | Off-by-one in the slice, or dropping the newest |
| `announce` identity is stable across rerenders | Re-subscription churn in consumers |
| Region renders `role="log"`, `sr-only`, and no `aria-live`/`aria-atomic` attribute | Someone "helpfully" adding explicit attributes that fight the role implicits |

**`UndoChangeButton` tests**

| Assertion | Failure caught |
|---|---|
| Rendered under a spy provider, a `{ok:true}` action calls `announce` exactly once with the literal `"Change undone: Crew member Alice Chen removed."` | The whole feature silently not firing; and the literal pins the copy without importing it |
| `{ok:false}` calls `announce` zero times | Announcing a success that did not happen |
| `announceLabel` undefined → literal `"Change undone."` with no trailing colon | The dangling-colon guard condition |
| `announceLabel="   "` → same bare sentence | Whitespace treated as a label |
| Rendered with **no** provider, `{ok:true}` does not throw | The no-op default actually holding |
| `change-feed-undo-result` node exists with `""` text before any submit, and is the **same DOM node** after a failure (`toBe`) | The node-insertion pitfall reappearing — this is the assertion the whole failure fix exists for |

**`ChangesFeed` tests** (rendered inside `AdminAnnounceProvider`)

| Assertion | Failure caught |
|---|---|
| `admin-undo-status` renders with `role="log"` and empty text before any action | The channel missing from the layout wrapper |
| Undoing a row appends one child whose text is derived from **that fixture's** `summary`, not a hardcoded string | Announcing the wrong row; and an expectation that would pass against any summary |
| Two rows with **identical** summaries each produce their own appended child | The precise class `role="log"` was chosen for (§1.2) |
| The region node captured before the undo is `toBe` the node after | Node replacement — the round-2 failure mode |

**`RecentAutoAppliedStrip` tests** (rendered inside `AdminAnnounceProvider`)

| Assertion | Failure caught |
|---|---|
| A single-row undo appends one child naming that row's summary | Channel not wired at this surface |
| `auto-applied-bulk-undo-status-${showId}` still has `role="status"` and its existing behavior | R2 regression — the bulk channel swept into this refactor |
| The strip still renders **nothing** when `groups: []` | The withdrawn "return the region instead of null" proposal creeping back in and breaking the no-empty-card intent (`RecentAutoAppliedStrip.tsx:684`) |

**Survival probes — the executable form of §3.7.** Two rounds of this review were spent on owners that a branch could replace, and the round-2 finding was that a probe asserting only final text passes even when the region was destroyed and a populated replacement mounted. **Every probe below captures the region node first and asserts `toBe` on it afterwards**; text equality alone is not an acceptable assertion here.

| Probe | Failure caught |
|---|---|
| Strip with one undoable row; action resolves `{ok:true}`; parent re-renders with `groups: []` so the strip returns `null`; region is the same node and holds the announcement | The original F1 sequence, now expected to be trivially safe because the owner is above the strip |
| Same, with the re-render interleaved **while the action promise is unresolved**, resolving after | A continuation running after its own component is gone |
| Strip re-rendered into its `infra_error` state mid-action; same node, announcement present | The error branch replacing the region (round-2 F1, second instance) |
| The provider's `children` swapped for an entirely different subtree mid-action; same node, announcement present | The `components/admin/Dashboard.tsx:565` shape, where an infra result returns a tree that does not contain the strip at all |
| Feed re-rendered with the undone row's `action` flipped to `"none"` mid-action; same node, announcement present | The feed's version, where the button unmounts but the layout does not |
| `ChangesSection` flipped to its `feed === null` error rendering mid-action; same node, announcement present | `components/admin/showpage/ChangesSection.tsx:60` replacing `ChangesFeed` entirely (round-2 F1, fourth instance) |

| Provider re-rendered across the layout's own branch flip (its `children` replaced with the tree a different layout `return` produces); same node, announcement present | §3.5's central claim that the wrapper sits above the layout's three-way branch (`app/admin/layout.tsx:90`) — which until now shipped with no falsifier at all |

Each names a branch a previous round proved could replace a per-surface region. Under §3.5 all seven must pass without the region ever being re-created; if any fails, the layout-level owner is not immune either and the design is wrong again.

**One test-shape caveat, so these are not read as more than they are.** A jsdom test renders `ChangesFeed` directly inside `AdminAnnounceProvider`. Production nests it further: provider → `[data-inert-root]` → the review modal → `ChangesSection` → `ChangesFeed`. These probes prove node survival across React reconciliation; they say nothing about the accessibility tree, which is the next assertion's job.

**Real-browser assertion (mandatory, and the only proof of §3.5.1).** jsdom enforces neither `inert` nor `aria-hidden` (`components/admin/review/ReviewModalShell.tsx:176`), and Testing Library ignores `aria-hidden` when querying, so every test above stays green even if the region is hidden from assistive technology. A Playwright spec must:

1. In the EXISTING spec `tests/e2e/published-review-modal.crew-actions.spec.ts` (a new spec file would never run: `playwright.config.ts:79` matches by an explicit filename regex), open the published review modal on a seeded show whose feed has an undoable row, using that suite's existing seed and modal-open helpers.
2. Assert **`dialog-undo-status`** resolves and is not `aria-hidden` while the modal is open — `expect(page.getByTestId("dialog-undo-status")).toBeAttached()` plus an explicit check that no ancestor carries `aria-hidden="true"` or `inert`. Target the dialog id, not the layout one: under nearest-provider resolution a modal undo writes only to the dialog channel, so asserting on `admin-undo-status` would assert on a region that correctly stays empty.
3. Click Undo and assert the announcement text lands in `dialog-undo-status`, **and** that `admin-undo-status` is still empty. The second half is what proves the nearest-provider wiring rather than merely that something announced somewhere.

Without step 2 the feature can ship completely dead with a green unit suite. This obligation is why the plan's e2e-readiness section is not N/A.

**Class-sweep tests** — `AcceptChangeButton` and `Mi11GateActions` each get the same always-mounted / same-node assertion as Undo.

**Meta-test** — `_metaUndoAnnounceProvider`, with a planted violation for **each** of its four assertions (§5), including the negative case under A1 that must NOT fail.

---

## 12. Out of scope

- Any change to the bulk "Undo all" channel (R2).
- Success announcements for Accept / Approve/Reject (§9.5, filed).
- Catalog routing of failure copy into announcement strings (R11).
- Touch discoverability for `ChangeFeedBadge` tooltips (R9).
- Any change to `undo_change`, the feed read path, or `applyShowSnapshot`. This spec touches presentation only; `BL-NON-CREW-UNDO` (the entry immediately above in `BACKLOG.md`) remains untouched and open.
