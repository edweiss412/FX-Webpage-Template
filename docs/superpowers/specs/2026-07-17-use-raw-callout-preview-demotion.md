# Spec: Demote SectionFlagCallout to a pure preview (resolve USE-RAW-FULL-LIST-1)

**Date:** 2026-07-17
**Slug:** `use-raw-callout-preview-demotion`
**Milestone / area:** Step-3 review wizard (admin onboarding) + shared `ShowReviewSurface`
**Backlog twin:** `BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION` · **Deferral resolved:** `DEFERRED.md` §USE-RAW-FULL-LIST-1
**Autonomy:** user-approved autonomous ship; both user-review gates waived (`AGENTS.md` brainstorming-gate branch "User approves").

---

## 1. Problem

Since PR #399 (`feat/use-raw-wizard-full-list`, spec `docs/superpowers/specs/2026-07-16-use-raw-wizard-full-list-toggle.md`) the Step-3 wizard renders **two** live control instances for any warning that falls in the first `CALLOUT_MAX_ENTRIES = 3` of its section:

1. The section's amber **`SectionFlagCallout`** preview (`components/admin/wizard/step3ReviewSections.tsx:532`), which mounts `UseRawControlBoundary` + `RoleRecognizeControlBoundary` per shown entry (`:610-631`).
2. The uncapped **`WarningsBreakdown`** full list (`:2306`), which mounts the same two boundaries per in-scope row (`:2433-2450`).

`RoleRecognizeControlBoundary` deliberately performs **no client refresh** after a recognize (the 2026-07-15 §8.1 timing contract). So recognizing a role via one instance leaves its sibling in create mode until navigation — the divergence `DEFERRED.md` §USE-RAW-FULL-LIST-1 describes. There is no data risk (a stale-sibling resubmit resolves via the action's existing-row-first branch: set-equal → idempotent success; different grants → benign conflict notice; never a raw code — pinned by `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`), but it can momentarily confuse Doug.

Keep-both was the **ratified** decision (2026-07-16 spec §2.1 / §4.6). This spec **deliberately overrides** that ratification. This is a proactive UX-simplification decision, **not** triggered by a Doug report.

## 2. Goal & non-goals

**Goal.** Demote `SectionFlagCallout` to a **pure preview**: title + jump only, **no mounted controls**. `WarningsBreakdown` becomes the **sole actionable site** in the wizard, making the two-live-instances divergence **structurally impossible** (one control per warning per surface).

**Non-goals.**
- No change to `WarningsBreakdown`'s controls, the `UseRawControlBoundary` / `RoleRecognizeControlBoundary` internals, the server actions, `router.refresh()` timing (§8.1), decision-matching (`findUseRawDecision`, `:514`), or `stableWarningKeys` identity.
- No change to the action-level idempotent/conflict resolution behavior — it still exists and is still tested; only its **two-mounted-siblings** trigger in the wizard disappears.
- No publish-gate change. No DB change. No advisory-lock surface touched.
- **Keep** the `"callout"` value in the `WarningControlSite` union (`components/admin/warningControlSite.ts:8`) — a stable semantic enum. Removing it would churn the just-shipped #454 a11y tests (`tests/components/UseRawControl.test.tsx:835,852` pass `site="callout"` directly to the standalone control, which is unaffected by this demotion) for no functional gain.

## 3. What renders after the demotion

`SectionFlagCallout` keeps, per shown entry (`:585-606`):
- The section icon (`AlertTriangle` flagged / `Info` judgment).
- `reviewWarningTitle(warning)` (§8 hardening applies transitively — no raw tokens, invariant 5).
- The `(fieldLabel)` suffix when `fieldLabelFor(warning.blockRef?.field)` is non-null; omitted otherwise.
- The **"View details"** jump button (`onJump(index)` → scroll + flash the matching Parse-warnings row).

And keeps the section-level chrome:
- The judgment lead line ("We made a judgment call reading this. Worth a glance.") in `variant="judgment"` (`:581-583`).
- The **"+N more in Parse warnings"** overflow button (`:636-644`) when `entries.length > CALLOUT_MAX_ENTRIES`.

`SectionFlagCallout` **removes**:
- The `UseRawControlBoundary` mount (`:610-619`).
- The `RoleRecognizeControlBoundary` mount (`:623-631`).
- The `wizardSessionId ? (...)` guards that wrapped them.

## 4. Orphan-removal chain (traced against live code)

Removing the two mounts orphans a plumbing chain. Every deletion below was grep-confirmed to have **no other consumer**; each is dead after the mounts go.

| # | Site | Action | Confirmation |
|---|------|--------|--------------|
| 4.1 | `step3ReviewSections.tsx:610-631` | Delete the two boundary mounts + their `wizardSessionId ?` guards | The bug source |
| 4.2 | `step3ReviewSections.tsx:538-539,551-552` | Drop `useRawDecisions` + `wizardSessionId` **params** from `SectionFlagCallout` | Only the mounts + `decisionFor` used them |
| 4.3 | `step3ReviewSections.tsx:557-558` | Drop the `decisionFor` local (calls `findUseRawDecision`) | Only fed the removed use-raw mount. `findUseRawDecision` itself stays — `WarningsBreakdown:2439` still calls it |
| 4.4 | `step3ReviewSections.tsx:766-770` | Drop the two `{...(chrome.useRawDecisions…)}` / `{...(chrome.wizardSessionId…)}` spreads in the `ModalSectionChrome`→`SectionFlagCallout` caller | Only pass point into the callout |
| 4.5 | `step3ReviewSections.tsx:483-492` | Drop `useRawDecisions` + `wizardSessionId` **fields** from the `Step3SectionChrome` type + their doc comment | grep: chrome-level fields consumed **only** at `:766-770` |
| 4.6 | `ShowReviewSurface.tsx:822-828` | Drop the `useRawDecisions: data.useRawDecisions` assignment + the `...(isStaged(data) ? { wizardSessionId } : {})` spread from the chrome-context provider value + comment | These populated only the now-removed chrome fields |

**KEEP (not orphaned):**
- `Step3SectionChrome.calloutEntries` + `onJumpToWarning` (`:463`, provider `ShowReviewSurface.tsx:838-840`) — the preview still needs entries + the jump callback.
- `data.useRawDecisions` / `data.wizardSessionId` on `SectionData` — `WarningsBreakdown` reads them from the section source `s` (`step3ReviewSections.tsx:3719`, `:3720`), **not** from chrome. The list stays fully actionable.
- The `isStaged(data)` gate on `calloutEntries` (`ShowReviewSurface.tsx:838`) — the preview stays staged-only (on the published per-show page the list body *is* the warning surface; §5.3 Task-13 amendment 2). Unchanged.
- `WarningControlSite` union incl. `"callout"` — see §2 non-goals.

## 5. Guard conditions (preview render, partial data)

`SectionFlagCallout` receives `entries: readonly {warning, index}[]`. After the demotion the props narrow to `{dfid, sectionId, entries, onJump, variant}`.

- **`entries` empty:** the caller already gates on `chrome.calloutEntries.length > 0` (`:755-761`), so `SectionFlagCallout` never mounts with zero entries. `shown = entries.slice(0,3)` is `[]`-safe regardless; `extra = entries.length - shown.length` = 0 → no "+N more". No controls to guard.
- **`warning.blockRef?.field` null/unknown:** `fieldLabelFor` returns null → the `(fieldLabel)` suffix is omitted (`:597`). Unchanged by this spec.
- **`reviewWarningTitle` on a raw/unknown code:** already hardened (invariant 5); no raw token leaks. Unchanged.
- **`variant` absent:** defaults `"flagged"` (`:537`). Unchanged.
- **No `wizardSessionId` in scope:** previously the guard that hid the controls; now moot — the preview never renders controls in any mode.

## 6. Mode boundaries

`SectionFlagCallout` has two variants — both become preview-only:

| Element | `flagged` | `judgment` |
|---------|-----------|------------|
| Container tone | amber (`border-border-strong bg-warning-bg text-warning-text`) | calm info (`border-border bg-info-bg text-text-subtle`) |
| Lead line | — | "We made a judgment call reading this. Worth a glance." |
| Per-entry icon | `AlertTriangle` | `Info` |
| Title + `(fieldLabel)` | ✔ | ✔ |
| "View details" jump | ✔ | ✔ |
| "+N more" overflow | ✔ (when `>3`) | ✔ (when `>3`) |
| use-raw / recognize-role controls | **removed** | **removed** |

The **actionable** surface in both variants is now exclusively `WarningsBreakdown` (the Parse-warnings section body), reached via "View details" / "+N more".

## 7. Cap / truncation behavior

Unchanged: `CALLOUT_MAX_ENTRIES = 3` (`:506`). `shown = entries.slice(0, 3)`; overflow collapses to "+N more in Parse warnings" (`:636-644`). The demotion removes controls, not the cap or the overflow line.

## 8. Transition inventory

`SectionFlagCallout` is a static text block — the existing `§H N2: instant — deliberate` comments (`:635`, `:577`) already declare it has **no** mount/state animation. This spec **only removes** elements (the two control boundaries, which owned their own expand/collapse transitions, e.g. the role-recognize panel). No transition is added or changed.

- Preview render (flagged): instant — no animation. Unchanged.
- Preview render (judgment): instant — no animation. Unchanged.
- Flagged ↔ judgment: instant (variant is fixed per section render; no in-place toggle). Unchanged.
- **Removed transitions:** the role-recognize panel expand/collapse and use-raw radiogroup state changes no longer exist in the callout (they persist in `WarningsBreakdown`, unchanged).

The plan's transition-audit task confirms `SectionFlagCallout` contains **no** `AnimatePresence` / conditional-mount after the removal (it never did; the removed boundaries did their own).

## 9. Dimensional invariants

None. `SectionFlagCallout` is a `flex flex-col` text block with no fixed-height/width parent constraining flex/grid children. The removed boundaries were self-contained. No `getBoundingClientRect` layout task required. (The plan still adds a real-browser render assertion for the behavioral proof in §11, not for dimensions.)

## 10. Flag lifecycle

No boolean config flag added or removed. The `wizardSessionId` prop was a **presence gate** (present → render controls), not a stored flag; it is removed from `SectionFlagCallout` (§4.2) but persists on `SectionData` for `WarningsBreakdown`. No zombie flag results — every removed field (§4) is dead after removal, grep-confirmed.

## 11. Test plan (anti-tautology)

**Core behavioral proof (new / reworked).** A real-browser (Playwright) or JSDOM render — see note — of a staged `ShowReviewSurface` (or the local `calloutHost` in `warningsBreakdownControls.test.tsx:280`) with a warning that is BOTH in the first-3 callout AND in the list must assert:
- The callout box (`wizard-step3-card-<dfid>-section-<sectionId>-flag-callout`) contains **zero** `use-raw-control*` and **zero** `role-recognize-*` testids. Failure mode caught: a re-added control mount reintroducing divergence.
- The callout still renders the entry title text and a "View details" jump button. Failure mode caught: over-stripping the preview (Option B regression).
- The `WarningsBreakdown` list still mounts `use-raw-control-list` + `role-recognize-*-list` for the same warning. Failure mode caught: accidentally stripping the wrong site.

Assertions scope to the **callout container** vs the **list container** separately (clone/`within`), never a shared ancestor — the two sites emit site-scoped testids (`-callout` / `-list`, #454), so a container-scoped query cannot pass by matching the sibling.

**Reworked existing tests** in `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`:
- `:294-315` (callout role-recognize panel expand) — **invert**: assert the callout has no `role-recognize-trigger-callout`. The panel-state behavior it proved now lives only in the list.
- `:324-368` ("duplicate role-control siblings, §4.6 stale-sibling contract") — the **two-mounted-siblings-in-the-wizard** scenario no longer exists; remove/retarget. The action-level idempotent (set-equal) / benign-conflict (different-grants) resolution stays covered where the action is tested; if that coverage lived only here, port it to a single-site action test so we don't lose it. (Plan enumerates the exact port.)
- `:394-405` ("distinct non-colliding testids at callout + list") — **invert** the callout assertion (`:405`) to expect **no** `use-raw-control-callout`; keep the list assertion.
- `:147` ("every in-scope warning gets a use-raw control — beyond the callout cap") — about the **list**; unchanged.

**Other callout tests to sweep** (grep `flag-callout` / callout control testids): `tests/components/admin/wizard/step3ReviewSections.test.tsx`, `rawUnrecognizedCallout.test.tsx`, `Step3ReviewModal.test.tsx`, `step3ReviewModal.transitions.test.tsx`, `publishedNoStagedTraffic.test.tsx`. The plan's pre-draft pass enumerates which assert callout controls (update to preview-only) vs. merely render the callout (no change).

**Note on harness:** these are structure/presence assertions (which testids mount), not layout/dimension. JSDOM (`@testing-library/react`) is sufficient here — no `getBoundingClientRect`. (Global rule reserves real-browser for fixed-dimension parents; none here.)

## 12. Meta-test inventory

- **Creates:** none.
- **Extends:** `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (the §4.6 dual-site pin) — retargeted to the single-actionable-site contract.
- **N/A:** advisory-lock topology (no `pg_advisory*`), Supabase call-boundary (no client call), `admin_alerts` catalog, §12.4 codes, no-inline-email — none touched.

## 13. Docs / bookkeeping (same PR)

- Move `DEFERRED.md` §USE-RAW-FULL-LIST-1 (its full entry, `DEFERRED.md:31-38`) to `DEFERRED-archive.md` with a resolution note citing this spec.
- Mark `BACKLOG.md` §BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION (`BACKLOG.md:71-75`) **✅ RESOLVED** with the branch + spec ref.
- Sibling deferrals USE-RAW-FULL-LIST-2 / -3 already resolved (#454 / copy pass) — no action.

## 14. Disagreement-loop preempt (for the reviewer)

- **Overriding a ratified decision is intentional.** Keep-both (2026-07-16 §2.1/§4.6) is deliberately superseded here per the user-approved autonomous-ship decision. Do **not** relitigate keep-vs-demote — the demotion IS the resolution of USE-RAW-FULL-LIST-1.
- **`"callout"` enum value stays** by design (§2). Do not flag it as dead code — it's a stable semantic site value and the standalone control still accepts it (`UseRawControl.test.tsx:835,852`).
- **No client refresh is added** to recognize-role. The §8.1 no-refresh contract is untouched; the demotion removes the *need* for a refresh (single site) rather than adding one (Option C, rejected — larger blast radius, contradicts §8.1).
- **The action-level idempotent/conflict behavior is retained**, only its two-siblings trigger is removed. If a reviewer asks "where did the stale-sibling contract go" — it is moot in the wizard (single site) and the resolution branch stays covered by the action test (§11).

## 15. Invariant compliance

- Invariant 5 (no raw error codes in UI): unchanged — `reviewWarningTitle` still hardens titles.
- Invariant 8 (impeccable dual-gate): UI surface (`components/**`) — `/impeccable critique` + `/impeccable audit` run on the diff before cross-model review; P0/P1 fixed or `DEFERRED.md`-deferred.
- Invariants 1 (TDD), 6 (commit-per-task): honored in the plan.
- Invariants 2, 3, 4, 9, 10: **N/A** — no advisory lock, no email boundary, no sync cursor, no Supabase call, no mutation surface added (this is a render-only removal).
