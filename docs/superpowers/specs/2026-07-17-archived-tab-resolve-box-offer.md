# Spec — Archived-tab pull-sheet offer in the Step-3 "Resolve before publishing" box

**Date:** 2026-07-17
**Slug:** `archived-tab-resolve-box-offer`
**Type:** UI enrichment (onboarding wizard, Step 3). Follow-on to PR #410 / #434.
**Owner:** Opus / Claude Code (UI — invariant-8 dual-gate applies).

---

## 1. Problem

When a scan finds a pull sheet on an archived (`OLD …`) tab it leaves that gear out of the parse and raises a `PULL_SHEET_ON_ARCHIVED_TAB` `ParseWarning` (`lib/sync/pullSheetOverride.ts:83-93`). The admin can **accept** the gear ("use it anyway") or **keep it skipped**. That accept/revoke control already exists and works — it is the `ArchivedTabOffer` (S2 first-discovery / S4 re-confirm) and `ArchivedTabIncludedNote` (S3 revoke) rendered by `PackListBreakdown` inside the modal's scrollable "Pack list" section panel (`components/admin/wizard/step3ReviewSections.tsx:1974-1995`), POSTing to `/api/admin/onboarding/pull-sheet-override`.

Two facts make the decision hard to find:

1. **The "Resolve before publishing" box cannot show it.** That box (`components/admin/wizard/Step3ReviewModal.tsx:725-787`, `aria-label="Resolve before publishing"` at line 728) maps only over `resolution.triggeredReviewItems` (`Step3ReviewModal.tsx:161`). `PULL_SHEET_ON_ARCHIVED_TAB` is a `ParseWarning`, **not** a `TriggeredReviewItem` (its union in `lib/parser/types.ts` carries no such invariant), so it can never reach the box. When an onboarding scan stages the sheet, the box (if present) shows only the generic sentinel line "Onboarding scan staged this sheet for review." (`lib/admin/step3ReviewItemTiers.ts:57-58`).

2. **The box usually is not even present.** `resolution` is defined only when `row.displayState === "needs_review_reapply" && row.stagedId` (`components/admin/wizard/Step3SheetCard.tsx:353-354`); every other displayState leaves it `undefined` and the modal renders a read-only preview with no box (`Step3SheetCard.tsx:350-352`). A pending archived-tab decision most commonly sits on a plain clean staged row (no finalize-failure), so today the admin only ever sees the offer buried in the Pack-list section.

**Net:** the capability exists but is not discoverable from the surface that names what needs resolving before publishing.

## 2. Goal

Surface the **actionable** archived-tab accept offer inside the "Resolve before publishing" box, and make the box **appear** whenever a pending archived-tab decision exists — even on a row that is not re-apply-blocked (chosen scope: Option A). The box shows the "Use this show's gear" accept affordance; skipping is the default outcome and the local "Keep skipped" dismiss stays on the Pack-list instance (§4.5b). The existing Pack-list offer stays; the two coexist.

## 3. Non-goals / out of scope

- No server, route, DB, advisory-lock, email-canonicalization, or `§12.4` catalog change. Reuses the existing `/api/admin/onboarding/pull-sheet-override` route and existing copy verbatim.
- **Revoke (S3 `ArchivedTabIncludedNote`) is not added to the box.** Once an override is accepted the decision is *resolved*; revoke remains available in the Pack-list section only. The box shows only pending offers.
- No suppression of the Pack-list offer when the box also shows it — two live entry points are intended (user-confirmed). After accept, `router.refresh()` reconverges both.
- No change to the generic `ONBOARDING_SCAN_REVIEW` sentinel copy itself, or to any `TriggeredReviewItem` tiering.
- No change to multi-OLD-tab offer suppression. The box inherits Pack-list's exact derivation (§4.2 parity invariant); whether a second pending OLD-tab offer should resurface after the first is accepted is a pre-existing archived-tab-feature behavior, untouched here.

## 4. Design

### 4.1 Data — none added
`data` (`StagedSectionData`) already carries `archivedPullSheetTabs` (`components/admin/review/sectionData.ts:42,153`), and `wizardSessionId` + `dfid` + `driveFileId`. The modal already holds `data`. `ArchivedTabOffer` needs exactly `{ dfid, wizardSessionId, tab, onDismissFocus }` (`step3ReviewSections.tsx:2119-2130`), all in scope. No new prop threading from the server or card is required.

### 4.2 Shared extraction
Extract `ArchivedTabOffer`, `ArchivedTabIncludedNote`, and a pure offer-state derivation into a new module `components/admin/wizard/archivedTabOffer.tsx`, exported. `PackListBreakdown` imports them from there (behavior byte-identical). The Resolve box imports `ArchivedTabOffer` + the derivation.

The pure derivation (single source of the S-state rule, mirrors `step3ReviewSections.tsx:1947-1948`):

```
deriveArchivedOffers(tabs, staged): {
  overrideActive: boolean;        // tabs.some(t => t.included)
  includedTab: ArchivedPullSheetTab | null;
  offers: ArchivedPullSheetTab[]; // staged && !overrideActive ? tabs.filter(t => !t.included) : []
}
```

`staged` = `wizardSessionId != null` at the call site (same gate PackListBreakdown uses).

> **Reconciliation note (PSAT-1 / #443, 2026-07-17):** sibling PR #443 landed the durable-override / S5-divergence model in this same code before merge. `deriveArchivedOffers` was rebuilt to take the third argument `pullSheetOverride: OverrideSnapshot` and return `{ overrideActive, includedTab, previewSnapshot, divergent, offers }`, extracting #443's exact derivation (`overrideActive = pullSheetOverride !== null`; `divergent` = durable-vs-preview mismatch via `overrideSnapshotsEqual`; `offers` empty when not-staged / divergent / override-active). The box calls it with `data.pullSheetOverride`, so an S5-divergent or override-active row yields no box offer — the S5 recovery (`ArchivedTabRescanNeeded`) and S3 revoke stay in the Pack-list section (consistent with revoke-stays-Pack-list, §3). The two-arg formula below is the pre-#443 form; the invariant (single shared derivation, box == Pack-list offer set) is unchanged.

**Parity invariant (load-bearing):** `deriveArchivedOffers` is the extraction of the *exact* current Pack-list derivation (`step3ReviewSections.tsx`), and both `PackListBreakdown` and the box call it. Therefore the box's offer set is **always equal** to Pack-list's — it can never show an offer Pack-list hides, nor hide one Pack-list shows. This makes the following pre-existing behaviors identical in both surfaces, not new decisions of this spec:

- **Mixed state `[{included:true}, {included:false}]`** (one accepted archived tab + another still pending): `overrideActive = true` suppresses the second offer in **both** surfaces. This is the established "only one override at a time" contract — the `set_pull_sheet_override` RPC enforces a single active override (`step3ReviewSections.tsx:1944-1945` comment; `lib/onboarding/setPullSheetOverrideRpc.ts`). Whether a second OLD-tab offer *should* resurface after the first is accepted is a **pre-existing** archived-tab-feature question, unchanged and out of scope here (§3). The box inherits Pack-list's behavior verbatim by construction.
- **`contentChangedSinceAccept` (S4)** tabs are `included:false` re-confirm offers (`lib/sync/pullSheetOverride.ts:175-181` sets the flag on a now-un-included entry after clearing the override), so they appear in `offers` exactly as in Pack-list.

**Why extract `ArchivedTabIncludedNote` too** (even though the box never renders revoke): `ArchivedTabOffer`, `ArchivedTabIncludedNote`, and the derivation are one co-located cluster in `step3ReviewSections.tsx`. Moving the offer + derivation but leaving the sibling note behind would split the cluster across two files and force `PackListBreakdown` to import from both. Extracting the whole cluster into `archivedTabOffer.tsx` keeps one owner; the box imports only `ArchivedTabOffer` + `deriveArchivedOffers`.

### 4.3 Box render gate — decouple from `resolution`
Today the box `<section>` renders inside `resolution ? (…) : null` (`Step3ReviewModal.tsx:725`). Change to render when **`resolution || hasPendingArchivedOffer`**, where `hasPendingArchivedOffer = deriveArchivedOffers(data.archivedPullSheetTabs, data.wizardSessionId != null).offers.length > 0`.

Inside the section:
- **Re-apply items** (`resolutionItems.map(...)`, the corrupt branch) render **only when `resolution` is present** — unchanged.
- **Archived-tab offers** render below the items when pending: `offers.map(tab => <ArchivedTabOffer dfid={data.driveFileId} wizardSessionId={data.wizardSessionId} tab={tab} showDismiss={false} />)`. `dfid` is fed from `data.driveFileId` to match the Pack-list callsite (`step3ReviewSections.tsx:3826` passes `s.driveFileId`); `data.driveFileId === data.dfid` by construction (`sectionData.ts:147`). The mutation contract (accept POST) is identical to Pack-list; the box differs only by suppressing the local "Keep skipped" dismiss — see §4.5b.

Each box offer gets a stable test id `wizard-step3-card-${dfid}-review-resolution-archived-${tabName}` (the box section already carries `data-testid="wizard-step3-card-${dfid}-review-resolution"`, `Step3ReviewModal.tsx:727`). The Pack-list offers keep their own ids, so §9 assertions scope box vs Pack-list unambiguously.

### 4.4 Footer stays `resolution`-gated
The modal footer's re-apply branch (`resolution ? <Approve/Re-scan/Ignore> : <normal footer>`, `Step3ReviewModal.tsx:805`) is **unchanged**. An archived-only row has `resolution === undefined`, so it shows the **normal** footer — never Approve/Ignore. This is the load-bearing decoupling: making the box visible must not make the re-apply footer visible.

### 4.5 Publish-run behavior — no disable (deliberate)
The box offer is **not** frozen during an active publish run, and **no `disabled` prop is added** to `ArchivedTabOffer`. Rationale: the re-apply radios freeze on `isPublishRunActive` because *apply/discard* is the mutation the publish run is executing. The archived-tab **override** is a different, independently server-guarded mutation — the existing Pack-list `ArchivedTabOffer` does **not** freeze during a publish run today. Adding a `disabled` prop to only the box instance would produce the exact asymmetry hazard of one frozen and one live control for the same decision (Codex spec-R1-1). Keeping the box instance's **mutation behavior** identical to the Pack-list instance is both the tighter change and the consistent behavior. Server-side correctness is guaranteed by §4.7, not by a client freeze.

### 4.5b `showDismiss` prop — suppress the box's local dismiss (empty-box fix)
Add an **optional** `showDismiss?: boolean` (default `true`) to `ArchivedTabOffer`. The Pack-list callsite omits it (stays `true` — unchanged). The box passes `showDismiss={false}`, which renders the accept affordance only and omits the local "Keep skipped" button and its `dismissed` state path.

Why: `ArchivedTabOffer` returns `null` once its local `dismissed` state is set (`step3ReviewSections.tsx:2137`). But `hasPendingArchivedOffer` / `offers` derive from **server** data, which a local dismiss does not change. On an archived-only row with a single offer, a box-local "Keep skipped" would unmount the sole child while the section stays mounted (`offers.length > 0`), leaving a **bare titled "Resolve before publishing" box** (Codex spec-R2-2). Suppressing the local dismiss in the box makes the box's archived region a **pure function of server `offers`**: it appears while an offer is pending and disappears only when accept → `router.refresh()` recomputes `offers = []`. No empty-box state exists. "Keep skipped" is not lost to the admin — it remains on the Pack-list instance, and skipping is also the default outcome (not accepting leaves the gear out). This is a rendering prop, not a mutation-path change, so it does not reintroduce the §4.5 asymmetry.

The prop shape is a **discriminated union** so the focus contract is not weakened: `{ showDismiss?: true; onDismissFocus: () => void } | { showDismiss: false; onDismissFocus?: never }`. A dismissible offer (default/`true`) still **requires** `onDismissFocus` (Pack-list unchanged); only `showDismiss={false}` (the box) may omit it. This prevents a future callsite from rendering a dismissible offer without a WCAG focus handoff.

### 4.7 Concurrency safety (two live entry points)
Two mounted `ArchivedTabOffer` instances (box + Pack-list) can each fire an accept `POST` before `router.refresh()`. This is **safe by the route's existing compare-and-set contract**, no shared client pending-state required:

- Accept passes `p_expected_override_snapshot` to the RPC (`app/api/admin/onboarding/pull-sheet-override/route.ts:207`). `set_pull_sheet_override` is the **sole `show:` advisory-lock holder** (route comment `:34`; invariant 2). The first accept commits `null → A`; the second accept still carries `expectedOverrideSnapshot: null`, which no longer matches the committed `A`, so the RPC returns `40001` (row-state CAS mismatch) → the route maps it to `409 { status: "stale_review" }` (`route.ts:225,231`). No double-write; the loser is a safe no-op that re-fetches the preview.
- The route also re-detects the server fingerprint (content CAS, `route.ts:192-200`) — a stale accept 409s and re-persists.
- After the winning accept's `router.refresh()`, the modal re-renders: `overrideActive` becomes true → `offers = []` → **both** offer instances unmount. The double-fire window is the sub-refresh interval only, and the CAS closes it.

So coexistence introduces no new server contract; it relies entirely on the CAS the route already enforces (verified against `route.ts`, not assumed).

### 4.6 Focus management
Because the box passes `showDismiss={false}` (§4.5b), the box offer has **no** local dismiss button, so no unmount-on-dismiss and no focus-move concern in the box. `onDismissFocus` is not passed there. The Pack-list instance keeps its existing dismiss + `onDismissFocus` behavior (WCAG 2.4.3) unchanged. Accept-driven unmount is a `router.refresh()` re-render (the whole modal re-renders), not a localized removal, so it needs no manual focus handoff beyond React's normal dialog focus behavior — identical to how Pack-list accept behaves today.

## 5. Mode boundaries — which elements render in which case

| Row case | Resolve box present? | Box contents | Footer | Pack-list offer |
|---|---|---|---|---|
| Re-apply-blocked, no archived offer (`needs_review_reapply`, no pending tab) | yes (unchanged) | re-apply items | re-apply footer | none |
| Re-apply-blocked **and** pending archived offer | yes | re-apply items **+** archived offer(s) | re-apply footer | offer (duplicate, intended) |
| Clean staged row, pending archived offer (common case) | **yes (new)** | archived offer(s) only | **normal footer** | offer (duplicate, intended) |
| Clean staged row, archived override already accepted (S3) | no box | — | normal footer | `ArchivedTabIncludedNote` (revoke) |
| No archived tabs, not re-apply-blocked | no box (unchanged) | — | normal footer | none |

## 6. Guard conditions

| Input / state | Behavior |
|---|---|
| `data.archivedPullSheetTabs` empty `[]` | `offers = []` → `hasPendingArchivedOffer = false` → box unchanged (re-apply-only or absent). |
| `data.wizardSessionId == null` (non-staged preview) | `staged = false` → `offers = []` → no box offer. |
| all tabs `included` (override active) | `overrideActive = true` → `offers = []` → no box offer (revoke stays in Pack-list). |
| mixed `[{included:true},{included:false}]` | `overrideActive = true` → `offers = []` → no box offer, **identical to Pack-list** (§4.2 parity; pre-existing single-override contract, not changed here). |
| multiple non-included tabs (none included) | `offers.map(...)` renders each (mirror Pack-list; no cap — matches existing unbounded map). |
| box-local "Keep skipped" dismissed | **not possible** — box passes `showDismiss={false}` (§4.5b); the box offer has no dismiss button, so the box region is a pure function of server `offers` and never strands an empty titled box. |
| Pack-list "Keep skipped" dismissed while box duplicate present | deliberate: Pack-list dismiss is instance-local (`dismissed` state), so it hides only the Pack-list card; the box offer remains (server-derived `offers` unchanged). Accepted — the box is the canonical "resolve before publishing" surface; a Pack-list-only local hide does not resolve the server decision, so the box correctly still shows it. Not a stale-UI bug. |
| `reviewItemsCorrupt === true` | corrupt copy renders (unchanged) **and** archived offer renders below if pending (independent branches). |
| `tab.contentChangedSinceAccept === true` (S4) | `ArchivedTabOffer` renders its own S4 re-confirm tone (unchanged component behavior). |
| `isPublishRunActive === true` | offer stays live (no freeze — §4.5); server CAS + finalize override-gate guard correctness. Same as the existing Pack-list offer. |
| `data.driveFileId` value | non-null at the box callsite by construction (`driveFileId === dfid`, `dfid: string` — `sectionData.ts:62,147`). `ArchivedTabOffer` types `dfid: string \| null` and the route 400s a missing/empty `driveFileId` (`route.ts:126-133`), so a hypothetical null degrades to a plain 400, never a silent write. |
| `data.wizardSessionId` empty/`null` | `staged = wizardSessionId != null` (mirrors the existing Pack-list gate `step3ReviewSections.tsx:1946`). Empty string cannot occur: `SectionCore.wizardSessionId` is a non-optional UUID string in staged data (`sectionData.ts:63`), and the route rejects any non-UUID with 400 (`route.ts:130`). |
| `resolution === undefined` **and** no pending offer | box `null` (unchanged). |

## 7. Dimensional invariants
**N/A.** The box (`Step3ReviewModal.tsx:729`) is `flex min-w-0 flex-col gap-4` — a flow column with no fixed-height/width parent constraining flex/grid children. No `getBoundingClientRect` parent==child assertion is required; no Playwright layout task. Stated explicitly per the project checklist.

## 8. Transition inventory
Two visual states for the box's archived region: **absent** ↔ **offer present**, plus **offer present** → **accepted/removed**.

| From → To | Treatment |
|---|---|
| box absent → box with offer (data/props change on load or refresh) | instant — deliberate, matches existing box (`Step3ReviewModal.tsx:724` "§11: instant"). Box presence follows server truth after `router.refresh()`; no animation. |
| offer present → offer removed (accept success → refresh → `overrideActive` true → `offers=[]`) | instant — server-truth reconciliation, no animation. |
| accept fails (409 stale_review / network) → error note | instant — the component's preexisting `error` state renders inline; unchanged behavior. |

The box offer has **no** "Keep skipped" dismiss (`showDismiss={false}`, §4.5b), so no box-local dismiss transition exists; the box region transitions only on server-truth (`offers` recompute after refresh). The Pack-list instance keeps its unchanged dismiss transition.

**Cross-instance pending (compound):** clicking accept sets the local `pending` state on **only that instance**; the peer (box or Pack-list) stays enabled until the winning accept's `router.refresh()` unmounts both. A duplicate accept fired on the peer in that window is reconciled by the route's existing 409 CAS handling (§4.7) — no client coordination. `ArchivedTabOffer`'s internal `pending`/`error` states are preexisting and unchanged. No `disabled`/publish-run compound transition exists — the offer is never frozen (§4.5).

## 9. Testing (failure mode per test)

Component/render tests (jsdom + Testing Library), against a real `Step3ReviewModal` with fixture `data`:

1. **Box appears on a clean staged row with a pending offer, no re-apply block.** Fixture: `resolution` undefined, `data.archivedPullSheetTabs = [{included:false,...}]`, `wizardSessionId` set. Assert the `Resolve before publishing` section renders and contains the offer's accept affordance. *Catches:* the render-gate decoupling regressing to `resolution`-only.
2. **Accept POSTs the correct override payload.** Mock `fetch`/route; click "Use this show's gear"; assert POST to `/api/admin/onboarding/pull-sheet-override` with `{ driveFileId, wizardSessionId, tabName, expectedFingerprint, expectedOverrideSnapshot: null }`. *Catches:* wrong wiring of the reused component in the new mount.
3. **No box offer when override already accepted.** Fixture: one tab `included:true`. Assert no accept affordance in the box (and no box at all when `resolution` undefined). *Catches:* `overrideActive` suppression not applied in the box derivation.
4. **Box offer is not frozen during a publish run (parity with Pack-list).** `isPublishRunActive`/`resolution.isPublishRunActive` true, pending offer present; assert the box's accept button is **enabled** (no `disabled` attribute). *Catches:* a regression that re-introduces the asymmetric-freeze hazard (§4.5) by disabling only the box instance.
5. **Re-apply footer absent on an archived-only row.** Fixture: pending offer, `resolution` undefined; assert the box renders but the Approve/Ignore re-apply footer controls are absent (normal footer present). *Catches:* the footer-decoupling invariant (§4.4) — the highest-value assertion.
6. **Coexistence.** Same fixture as (1) with the Pack-list section rendered; assert the accept affordance appears in **both** the resolution section (`data-testid` prefix `wizard-step3-card-${dfid}-review-resolution-archived-`) and the pack-list section (its own offer id). *Catches:* accidental de-duplication that would violate the confirmed two-entry-point decision.
7. **Box offer has no "Keep skipped" dismiss; box region is server-driven.** Fixture: single pending offer, `resolution` undefined. Assert the box offer renders the accept button but **no** "Keep skipped" control, and that the box section is present while `offers` non-empty. *Catches:* the empty-titled-box defect (§4.5b) — a box that reused the local dismiss and could strand a bare heading.
8. **PackListBreakdown unchanged after extraction.** Existing PackListBreakdown tests must stay green with the components imported from the new module, including its "Keep skipped" dismiss (default `showDismiss`). *Catches:* extraction altering behavior or the new `showDismiss` default leaking to Pack-list.

Concurrency safety (§4.7) is a route/RPC contract (CAS on `expectedOverrideSnapshot`), covered by the existing `pull-sheet-override` route tests — not re-tested at the component layer, where two independent POSTs cannot be meaningfully asserted. Noted here so a reviewer does not read the omission as a gap.

Anti-tautology: every assertion scopes extraction by `data-testid` (resolution section vs pack-list section) so a control rendered in one region cannot satisfy an assertion about the other; expected payload fields derive from the fixture tab, not hardcoded.

## 10. Invariant / meta-test inventory

- **Invariant 8 (impeccable dual-gate):** applies — UI surface. `/impeccable critique` + `/impeccable audit` on the diff before whole-diff review; P0/P1 fixed or `DEFERRED.md`.
- **Invariant 10 (mutation observability):** N/A — no new mutation surface; reuses the existing `pull-sheet-override` route (already instrumented). No new route handler or `"use server"` action added.
- **Invariants 2 / 3 / 4 / 5 / 9:** N/A — no advisory-lock path, no raw email boundary, no sync cursor, no user-visible raw error code (reuses cataloged copy), no new Supabase call boundary.
- **New/extended structural meta-tests:** none. The change is component render wiring + a pure-function extraction; no registry (auth boundary, admin-alert catalog, advisory-lock topology, no-inline-email) is touched. Declared explicitly per the plan-rule.

## 11. Existing-code citations

- Box section + `aria-label`: `components/admin/wizard/Step3ReviewModal.tsx:725-787`, heading `:731`, footer branch `:805`.
- `resolutionItems`, `isPublishRunActive`: `Step3ReviewModal.tsx:161,167`.
- `Step3ReviewResolution` type: `Step3ReviewModal.tsx:75-83`.
- `resolution` construction (gate): `components/admin/wizard/Step3SheetCard.tsx:353-354`, spread `:622`, `data` build `:596-605`.
- Offer components + derivation: `components/admin/wizard/step3ReviewSections.tsx:1925-1948` (PackListBreakdown gate/derivation), `:1974-1995` (render), `:2119-2130` (`ArchivedTabOffer` props), `:2224` (`ArchivedTabIncludedNote`), `:3827-3828` (section-def wiring).
- `postPullSheetOverride` payload: `step3ReviewSections.tsx:2138-2149`.
- `archivedPullSheetTabs` on section data: `components/admin/review/sectionData.ts:42,101,153`.
- Warning emitter (proof it's a `ParseWarning`, not a review item): `lib/sync/pullSheetOverride.ts:83-93`.
- S4 `contentChangedSinceAccept` set on an un-included entry: `lib/sync/pullSheetOverride.ts:175-181`.
- Single-override contract (RPC-enforced): `step3ReviewSections.tsx:1944-1945` (comment), `lib/onboarding/setPullSheetOverrideRpc.ts`.
- Override route + CAS: `app/api/admin/onboarding/pull-sheet-override/route.ts` — `p_expected_override_snapshot` `:207`, sole `show:` lock holder comment `:34`, `40001 → 409 stale_review` `:225,231`, fingerprint re-detect `:192-200`, body 400s `:126-133`.
- Local dismiss return-null: `step3ReviewSections.tsx:2137`.
