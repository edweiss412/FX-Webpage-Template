# Per-row undo announcement for the changes feed (BL-SYNCFEED-UI-1)

**Date:** 2026-08-03
**Ledger entry:** `BACKLOG.md` → `BL-SYNC-FEED-UI-POLISH` / `BL-SYNCFEED-UI-1`
**Branch:** `feat/sync-feed-undo-announce`
**Surface:** `components/admin/**` (UI — invariant 8 dual-gate applies; Opus-owned per the routing hard rule)

---

## 0. Summary

Undoing a single change in the sync changes feed currently produces **no screen-reader feedback**. Sighted users see the row self-heal on revalidation; a screen-reader user hears nothing at all. This spec adds a per-row success announcement to both surfaces that render a single-row Undo control, using the append-shaped live-region mechanism this project already ships, extracted into one shared module rather than copied a third time.

It also closes a defect of the same class found by sweeping the surface: the three feed action buttons render their failure card by **conditional mount**, which is the classic not-announced pitfall — so a failed Undo, Accept, or Approve/Reject is silent to AT as well.

Three ledger dispositions ride along: `BL-SYNCFEED-UI-1` resolves, `BL-SYNCFEED-UI-3` graduates as already-shipped, `BL-SYNCFEED-UI-2` is ratified as untriggered, and the parent `BL-SYNC-FEED-UI-POLISH` closes.

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

The choice of an append-shaped region over a simpler one rests on two undoable rows being able to carry byte-identical announcement text. They can.

Summaries are built from the crew member's **name alone**, with no row id, timestamp, or run discriminator: `Crew member ${prior} renamed to ${added}` (`lib/sync/changeLog/writeAutoApplyChanges.ts:98`), `Crew member ${member.name} removed` (`writeAutoApplyChanges.ts:111`), and the matching added form. Within a single sync run a name appears at most once per kind, so a naive reading suggests collisions cannot happen.

The feed is not a single run. It shows up to 50 rows accumulated across many runs (`ChangesFeed.tsx` truncation note). A crew member removed in one sync and re-added in a later one produces two `crew_added` rows with identical `summary`, both `applied`, both `individually_undoable` — simultaneously undoable, and indistinguishable by announcement text. Under `role="status"` the second undo would be silent. Under `role="log"` both are announced, because an identical *addition* always announces.

This is the evidence behind R3; it is not a defensive over-build.

---

## 2. What ships

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
1. **`components/admin/announceLog.tsx`** (new, client) — the append-shaped announce channel extracted from `ShowReviewSurface`: a `useAnnounceLog()` hook and an `AnnounceLogRegion` component.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
2. **`components/admin/undoAnnounceContext.ts`** (new, client) — a context carrying `{ announce }`, defaulting to a no-op, mirroring `warningAnnounceContext`.
3. **`components/admin/UndoChangeButton.tsx`** — consumes the context, announces on the success branch, and makes its failure card announce.
4. **`components/admin/AcceptChangeButton.tsx`**, **`components/admin/Mi11GateActions.tsx`** — the same failure-card fix (class sweep, R7). No success announcement is added to either; that is not this entry's scope.
5. **`components/admin/ChangesFeed.tsx`** — provides the context and renders the region for the per-show feed.
6. **`components/admin/RecentAutoAppliedStrip.tsx`** — the same, per group section.
7. **`components/admin/review/ShowReviewSurface.tsx`** — retrofitted onto the extracted module (R6), DOM output unchanged.
<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
8. **`tests/styles/_metaUndoAnnounceProvider.test.ts`** (new) — a structural guard so a future parent cannot render `UndoChangeButton` outside a provider and silently get the no-op.
9. **`BACKLOG.md`** — the four ledger dispositions plus three filed rows (`BL-FEED-BUTTON-SUCCESS-ANNOUNCE`, `BL-BULK-UNDO-ANNOUNCE-UNMOUNT`, `BL-ANNOUNCE-REGION-UNMOUNT-CLASS`); **`DESIGN.md`** — the announcement contract paragraph.

---

## 3. Component contracts

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
### 3.1 `components/admin/announceLog.tsx`

Extracted verbatim in behavior from `ShowReviewSurface.tsx:382-392` (state + `announce`) and `ShowReviewSurface.tsx:1160-1170` (the region JSX).

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

Modeled on `components/admin/review/warningAnnounceContext.ts:11-15`. The no-op default means a button mounted outside a provider — a standalone test harness, a future surface — announces nothing and never throws. That silence is a real hazard, so §5 pins it with a structural guard rather than trusting it.

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

The announcement happens **inside the action's async flow**, before React can process the revalidation that unmounts this component. That ordering is the whole reason the callback is not an effect: an effect scheduled on the `{ok:true}` commit races the RSC refresh, and the parent-owned state written here does not.

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
| `announceLabel` | non-blank | `"Change undone: <label>"`. |
| context | no provider above | `announce` is the no-op; nothing announced, nothing thrown. Guarded structurally (§5). |
| `undoAction` | resolves `{ok:false}` | No success announcement. Failure card announces via (b). |
| `undoAction` | throws | No announcement of either kind. `useActionState` surfaces the rejection; unchanged from today. |
| `stretch` / `quiet` | unchanged | Untouched by this spec. |

### 3.4 `components/admin/AcceptChangeButton.tsx` and `components/admin/Mi11GateActions.tsx`

The (b) fix only, verbatim in shape: the conditional wrapper at `AcceptChangeButton.tsx:86-93` and `Mi11GateActions.tsx:165-172` becomes always-mounted with `role="status"`, testid moving to the persistent node (`change-feed-accept-result`, `mi11-gate-result`).

`Mi11GateActions` computes `failing` from a settled-and-failing predicate (`Mi11GateActions.tsx:137`) — that logic is untouched; only the render shape changes.

Neither gains a success announcement. Accept and Approve/Reject success feedback is a separate question and a separate ledger item if anyone wants it.

### 3.5 `components/admin/ChangesFeed.tsx`

```tsx
const { announce, entries: announcements } = useAnnounceLog();
const announceCtx = useMemo(() => ({ announce }), [announce]);
```

The provider wraps the section's contents; the region renders **inside the `<section>`, unconditionally** — including when `entries.length === 0` and the empty state shows. An always-mounted region is the point; gating it on having rows would reintroduce the insertion pitfall the moment the first row arrives.

| Element | Value |
|---|---|
| Region `testId` | `change-feed-undo-status` |
| Region `label` | `"Undo updates"` |
| Placement | Last child of the `<section>`, after the truncation note |

`ChangeFeedEntry` gains one pass-through prop, `announceLabel={entry.summary}` → `UndoChangeButton`. `FeedEntry.summary` is a non-nullable `string` (`lib/sync/holds/types.ts:64`) and is already rendered visibly at `ChangeFeedEntry.tsx:104`, so the announcement names the same change the user sees.

### 3.6 `components/admin/RecentAutoAppliedStrip.tsx`

**The region lives at the strip root, NOT in `GroupSection`** — and the reason is the whole point of this spec applied one level further out.

The strip reads only `status='applied'` rows: `loadRecentAutoApplied` filters `.eq("status", "applied")` (`lib/admin/loadRecentAutoApplied.ts:164`). A successful undo moves the row to `undone`, so it leaves the strip's result set entirely. Undo the last undoable row in a show's group and that `GroupSection` disappears; undo the last row across all shows and `RecentAutoAppliedStrip` hits `if (data.groups.length === 0) return null;` (`RecentAutoAppliedStrip.tsx:685`). A group-owned region would therefore vanish on exactly the success it exists to announce — the identical defect as putting the region in the button, displaced by one component.

The fix has two halves:

1. **State and region live in `RecentAutoAppliedStrip` itself**, above every group, with one channel for the whole strip.
2. **The zero-groups early return renders the region instead of `null`.** `return null` becomes a return of the bare `AnnounceLogRegion` — an `sr-only` span. The "no empty card" intent (`RecentAutoAppliedStrip.tsx:684`) is preserved exactly: `sr-only` is invisible and occupies no layout, so nothing appears on screen where nothing appeared before. The `infra_error` early return (`RecentAutoAppliedStrip.tsx:670-681`) already renders a `<section>`; the region is added inside it too, so the channel survives a transient read failure.

That leaves one way for the region to die: the strip element itself being unmounted by a parent. It is not. Both consumers render it unconditionally, with no `key` and no surrounding conditional — `components/admin/Dashboard.tsx:791` and `app/admin/needs-attention/page.tsx:105`. React reconciles the same element type at the same position across a revalidation, so the instance and its `useAnnounceLog` state persist even as the group list empties underneath it.

| Element | Value |
|---|---|
| Region `testId` | `auto-applied-undo-status` (no `showId` suffix — the channel is strip-wide) |
| Region `label` | `"Undo updates"` |
| Placement | Last child of the strip's `<section>`; and the sole child of both early returns |

`AutoAppliedRow` passes `announceLabel={row.summary}` to the `UndoChangeButton` at `RecentAutoAppliedStrip.tsx:298`. `summary` is a non-nullable `string` on the row type (`lib/admin/loadRecentAutoApplied.ts:39`).

The existing bulk region and its `bulkUndoOutcome` state are **not** migrated to the log channel (R2). See §8 for the pre-existing defect that decision leaves standing, and the row it is filed under.

### 3.7 Why the announcement is order-insensitive

The announcement crosses a component that is being unmounted, so the natural question is whether it wins a race against RSC reconciliation. The design's answer is that **there is no race to win** — and that property is load-bearing enough to state as a contract rather than leave implicit.

Two independent facts make the ordering irrelevant:

- **The state owner outlives the announcement.** After §3.5 and §3.6, the component holding `useAnnounceLog` is `ChangesFeed` (rendered whenever `feed !== null`, `components/admin/showpage/ChangesSection.tsx:71`, and unaffected by undo because the feed keeps `undone` rows and renders an Undone badge for them) or `RecentAutoAppliedStrip` (never unmounted by either consumer, and no longer returning `null`). Whether the announce lands before or after the revalidation commits, it lands in a live region on a mounted component.
- **The async continuation does not depend on the caller surviving.** `announce` is called after `await undoAction(...)` inside the wrapped action. That continuation runs regardless of whether `UndoChangeButton` has since unmounted; it closes over the parent's `announce`, not over its own component instance. Setting state on a live parent from a dead child's continuation is ordinary React, not a leak.

The earlier draft of this spec justified the wrapped-action placement by asserting it necessarily precedes RSC reconciliation while an effect necessarily races it. That claim was framework-lifecycle speculation of exactly the kind `docs/agents/spec-self-review.md:21` forbids without a probe, and it is withdrawn. The wrapped action is still the chosen placement, but for a reason that needs no ordering guarantee: an effect on the `{ok:true}` commit is not guaranteed to run at all when the component unmounts in the same commit, whereas an already-executing async continuation always finishes.

**This is proved, not argued.** §11 requires an executable probe that drives an undo through a parent whose row list empties mid-action, asserting the announcement still lands. If the probe fails, this section is wrong and the design changes — that is the point of writing it as a test rather than a paragraph.

---

## 4. Copy

### 4.1 Success

One exported function, so both surfaces are provably one string (`2026-08-01-announce-a11y-pass-design.md:49`):

```ts
// components/admin/undoAnnounceContext.ts
export function undoneAnnouncement(label?: string): string {
  const trimmed = label?.trim() ?? "";
  return trimmed === "" ? "Change undone." : `Change undone: ${trimmed}`;
}
```

- No em dash (`DESIGN.md:381`, `scripts/spec-lint.ts`).
- Sentence case, terminal period on the bare form; the labelled form ends with the summary's own text and takes no added period, because `summary` is itself a sentence-shaped string rendered as a visible paragraph.
- The colon form leads with the outcome so an AT user hears "Change undone" before the detail, and can stop listening there.

### 4.2 Failure

No new copy. `ErrorExplainer` already resolves `code` through the catalog and renders admin-surface copy; making its wrapper a live region changes only whether that existing copy reaches AT. No raw code enters the DOM at any point — invariant 5 holds unchanged.

---

## 5. Structural guard

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
`tests/styles/_metaUndoAnnounceProvider.test.ts` walks `components/` and `app/` (excluding `app/api/**`) and asserts: **any file whose source contains `<UndoChangeButton` must also reference `UndoAnnounceContext.Provider`, or carry an inline `// no-undo-announce: <reason>` exemption on a line within the file.**

This is the `_metaDestructiveConfirm` T4 shape (`2026-08-01-announce-a11y-pass-design.md:156-158`): a file-walk, so a NEW parent fails by default rather than being silently exempt. It exists because the no-op context default converts "forgot the provider" from a crash into silence, and silence is exactly what this feature is fixing.

**Exactly two files render the button**, and the split is not the intuitive one:

| File | Renders `<UndoChangeButton` | Holds the provider | Guard disposition |
|---|---|---|---|
| `components/admin/ChangeFeedEntry.tsx:141` | yes | no — the provider is one level up in `ChangesFeed` | **inline exemption**, naming `ChangesFeed` as the providing parent |
| `components/admin/RecentAutoAppliedStrip.tsx:298` | yes (in `AutoAppliedRow`) | yes (in `GroupSection`, same file) | passes on the file-level rule |
| `components/admin/ChangesFeed.tsx` | **no** — it imports only `type UndoButtonResult` (`ChangesFeed.tsx:17`) | yes | not a member; the walk never sees it |

`ChangesFeed.tsx` is not a guard member despite owning a provider, and `ChangeFeedEntry.tsx` is a member despite owning nothing.

**A file-local walk cannot enforce the contract, and pretending otherwise would be the worst outcome** — a guard that looks authoritative while permitting the exact regression it names. Exempt `ChangeFeedEntry` and two real breakages sail through: deleting the provider from `ChangesFeed` (invisible to the walk, which never scans that file), and rendering `ChangeFeedEntry` from some future parent that provides nothing (the exemption travels with the child, not the parent).

The contract is therefore enforced in two layers, with the walk demoted to what it can actually do:

| Layer | Enforces | Catches | Blind to |
|---|---|---|---|
| **Behavioral tests** (§11) — render `ChangesFeed` and the strip, undo a row, assert the region received the text | that the provider is actually wired on each shipped surface | provider deleted from `ChangesFeed`; provider misplaced; context value wrong | a NEW surface nobody wrote a test for |
| **Structural walk** — files rendering `<UndoChangeButton` **or** `<ChangeFeedEntry` must reference `UndoAnnounceContext.Provider` or carry `// no-undo-announce: <reason>` | that a new direct parent cannot be added silently | a new file rendering either component with no provider | transitive chains more than one component deep |

Adding `<ChangeFeedEntry` to the scanned set is what closes the first breakage: `ChangesFeed.tsx` becomes a member (it renders `<ChangeFeedEntry` at `ChangesFeed.tsx:85`) and must keep its provider or fail. `ChangeFeedEntry.tsx` still takes the exemption, but the exemption is now backed by a guard on its only importer rather than trusting prose.

The residual blind spot — a chain two components deep — is accepted and stated rather than papered over. The behavioral tests are the real proof that the wiring works; the walk is a tripwire for the common case of someone adding a parent. Neither is claimed to be complete on its own.

Two implementation details the walk must get right, both learned from `_metaDestructiveConfirm`: detection of `<UndoChangeButton` runs against **comment-stripped** source (`tests/styles/_classScanUtils` exposes `stripCommentsForFile`), so a commented-out usage cannot make a file a member; the exemption is matched against the **raw** source, because the exemption is itself a comment.

The guard must be proven by a **planted violation** (a temp file rendering the button with no provider and no exemption, asserted to fail the walk), not merely by passing on the current tree.

**Consumers need no changes.** Both providers live inside the components that already exist, so the three call sites above them — `components/admin/showpage/ChangesSection.tsx:71`, `app/admin/needs-attention/page.tsx:105`, `components/admin/Dashboard.tsx:791` — are untouched. No prop is threaded through a page.

---

## 6. Retrofit contract for `ShowReviewSurface`

The swap is behavior-preserving and must be provably so. The retrofit replaces `ShowReviewSurface.tsx:382-392` with `useAnnounceLog()` and `ShowReviewSurface.tsx:1160-1170` with `<AnnounceLogRegion entries={announceLog} label="Warning updates" testId="warnings-panel-status" />`.

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

**The three `KNOWN_DANGLING` rows stay** (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:108-113`). This is the non-obvious part and the implementation must not "tidy" them away: the guard scans `BACKLOG-archive.md` (`_metaLedgerReferentialIntegrity.test.ts:57`), so an archived entry's body still counts as a citation, and the ids remain heading-less body bullets there — still dangling by the guard's definition. The guard's dead-row ratchet (`_metaLedgerReferentialIntegrity.test.ts:316-322`) fires only when an id is cited **nowhere**, which is not the case here. Their reason strings are refreshed to name the archive as the citing file instead of `BACKLOG.md`.

**`BL-LEDGER-GUARD-BODY-DEFINED-IDS` keeps all eight ids.** An earlier draft of this spec dropped the three from its enumeration on the theory that the entry tracks body-defined ids of *open* parents. It does not say that. Its contract is a body-leading bullet inside a parent whose own heading resolves (`BACKLOG.md:75-86`), and an archived parent's heading resolves through the same scanned ledger set — so the three ids remain exactly the examples the future body-definition guard will have to understand. Narrowing that entry to five would quietly shrink its documented scope while its actual work stayed the same size.

The edit that does land is additive: a parenthetical on the `BL-SYNCFEED-UI-*` bullet noting that its parent now lives in `BACKLOG-archive.md`, so a reader chasing the reference knows where to look. The count stays eight.

### 9.5 Filed, not fixed

**`BL-FEED-BUTTON-SUCCESS-ANNOUNCE`** — Accept and Approve/Reject announce failures (after this change) but not successes. Same asymmetry this spec fixes for Undo, one surface over. Filed with the analysis rather than fixed, because success copy for those two actions is a copy decision, not a mechanical one.

**`BL-BULK-UNDO-ANNOUNCE-UNMOUNT`** — the pre-existing bulk "Undo all" channel dies with its group (§8). Filed rather than fixed because the fix breaches R2.

**`BL-ANNOUNCE-REGION-UNMOUNT-CLASS`** — the class sweep this defect demanded, run across every live region in `components/` and `app/`. The defect this spec exists to fix is **not unique to the changes feed**; three other surfaces own a success announcement that their own success can unmount, and roughly eleven more mount their success region conditionally, which is the sibling not-announced pitfall.

| Severity | Surface | Region | Removal mechanism |
|---|---|---|---|
| P0 | `components/admin/RescanSheetButton.tsx` | `RescanSheetButton.tsx:211` / `RescanSheetButton.tsx:221`, both under the `{result ? …}` conditional at `RescanSheetButton.tsx:182` | `router.refresh()` on success (`RescanSheetButton.tsx:135`) flips the row's status; Step-3 re-partitions rows between `publishRows` and `blockingRows`, so the card, the button, and the just-set region all unmount. Eight call sites. |
| P1 | `components/admin/review/PublishedArchivedTabOffer.tsx` | `PublishedArchivedTabOffer.tsx:135` and `PublishedArchivedTabOffer.tsx:227` | Both set state then `router.refresh()` (`PublishedArchivedTabOffer.tsx:108`, `PublishedArchivedTabOffer.tsx:201`); the parent branches on `gear.wire !== null` (`step3ReviewSections.tsx:3268-3283`), so offer and note swap and whichever just announced unmounts. |
| P2 | `components/admin/RoleRecognizeControl.tsx:196-201` | the saved card *is* the region | Rendered only while `phase === "saved"`; the CREATE re-sync clears the warning the control is gated on. Partly mitigated by the focus move at `RoleRecognizeControl.tsx:118`. |

Conditionally-mounted success regions, same class, lower stakes: `RoleMappingRow.tsx:212`, `AddAdminForm.tsx:157`, `RotateShareTokenButton.tsx:278`, `ReportModal.tsx:553`, `ReSyncButton.tsx:354`, `Step2Verify.tsx:496`, `BlockedRowResolver.tsx:251`, `archivedTabOffer.tsx:189` (which additionally uses `role="status"` for error copy).

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
| Rendered under a spy provider, a `{ok:true}` action calls `announce` exactly once with the literal `"Change undone: Alice Chen removed from crew."` | The whole feature silently not firing; and the literal pins the copy without importing it |
| `{ok:false}` calls `announce` zero times | Announcing a success that did not happen |
| `announceLabel` undefined → literal `"Change undone."` with no trailing colon | The dangling-colon guard condition |
| `announceLabel="   "` → same bare sentence | Whitespace treated as a label |
| Rendered with **no** provider, `{ok:true}` does not throw | The no-op default actually holding |
| `change-feed-undo-result` node exists with `""` text before any submit, and is the **same DOM node** after a failure (`toBe`) | The node-insertion pitfall reappearing — this is the assertion the whole failure fix exists for |

**`ChangesFeed` tests**

| Assertion | Failure caught |
|---|---|
| `change-feed-undo-status` exists with `role="log"` and empty text on first render, including when `entries=[]` | Region gated on having rows |
| Undoing a row appends one child whose text names **that row's** summary, derived from the fixture's summary rather than hardcoded | Announcing the wrong row; and a fixture-derived expectation cannot pass on a hardcoded string |
| Undoing two rows with **identical** summaries appends two children | The exact class `role="log"` was chosen for (R3) |
| The region node captured before the undo is `toBe` the node after | Remount destroying the announcement |

**`RecentAutoAppliedStrip` tests**

| Assertion | Failure caught |
|---|---|
| `auto-applied-undo-status` exists at strip level, empty, `role="log"` | Missing region |
| A single-row undo appends one child naming that row's summary | The channel not wired |
| The existing bulk region `auto-applied-bulk-undo-status-${showId}` still has `role="status"` and its existing behavior | R2 regression — the bulk channel being swept into the refactor |
| Rendering the strip with `groups: []` still renders `auto-applied-undo-status`, and renders no `recent-auto-applied-strip` section | The `return null` path silently dropping the channel; and the "no empty card" intent being broken in the fix |
| Rendering the strip in its `infra_error` state still renders the region | The error early-return dropping the channel |

**Unmount probe — the executable form of §3.7** (the finding this spec's first round was blocked on)

| Assertion | Failure caught |
|---|---|
| Strip rendered with one undoable row in one group; the undo action resolves `{ok:true}`; the parent then re-renders with `groups: []` **before** the assertion — the region still contains the announcement | The whole §3.7 contract. This is the exact production sequence: the last undoable row leaves the `applied` result set, the group and then the strip body disappear, and a group-owned region would take the announcement with it |
| Same sequence driven with the re-render interleaved **while the action promise is unresolved**, resolving after | The narrower race: an announcement whose continuation runs after its own component is gone |
| Feed equivalent: `ChangesFeed` re-rendered with the undone row's `action` flipped to `"none"` mid-action; region still holds the text | The feed's own version of the same sequence, where the button unmounts but the section does not |

These three are not a formality. If any fails, §3.7 is false, the wrapped-action placement is not sufficient, and the design needs an owner further out than this spec proposes — so they run before the implementation of §3.5/§3.6 is considered done.

**Class-sweep tests** — `AcceptChangeButton` and `Mi11GateActions` each get the same always-mounted / same-node assertion as Undo.

**Meta-test** — `_metaUndoAnnounceProvider`, proven by a planted violation (§5).

---

## 12. Out of scope

- Any change to the bulk "Undo all" channel (R2).
- Success announcements for Accept / Approve/Reject (§9.5, filed).
- Catalog routing of failure copy into announcement strings (R11).
- Touch discoverability for `ChangeFeedBadge` tooltips (R9).
- Any change to `undo_change`, the feed read path, or `applyShowSnapshot`. This spec touches presentation only; `BL-NON-CREW-UNDO` (the entry immediately above in `BACKLOG.md`) remains untouched and open.
