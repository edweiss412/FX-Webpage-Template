# Spec — Flow 3 correction-loop clarity (Spec A: audit items 3.1 + 3.3)

**Date:** 2026-07-07
**Slug:** `flow3-correction-loop-clarity`
**Source audit:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 Flow 3 (items 3.1, 3.2, 3.3)
**Grade target:** Flow 3 "Correct a bad parse" C → **B+** (audit: "3.1 + 3.3 alone reach B+; A− requires 3.2").

## 1. Summary

Two pure-UI/copy changes that make the sheet-edit correction loop legible to a non-technical operator (Doug):

- **Unit 1 (audit 3.1)** — a **correction-loop callout**: a one-line instruction ("edit the sheet → save → re-sync/re-scan re-parses") co-located with the flagged-warnings area, ending in / adjacent to the re-sync (per-show) or re-scan (wizard) affordance that actually runs the loop.
- **Unit 2 (audit 3.3)** — **hold explanations**: for each held `approve_reject` row in the changes feed, one sentence saying *why* it was held plus the explicit *consequence* of Approve vs Reject, keyed to the hold's disposition.

No DB, no advisory locks, no Supabase call boundaries, no new error codes. UI surfaces only.

## 2. Scope & non-goals

**In scope:** copy + small layout additions on three existing surfaces:
1. Per-show admin page "Data quality" section — `app/admin/show/[slug]/page.tsx:877`.
2. Onboarding wizard step-3 `WarningsBreakdown` — `components/admin/wizard/step3ReviewSections.tsx:2272`.
3. Changes feed row — `components/admin/ChangeFeedEntry.tsx`.

**Explicit non-goals (do not implement here):**
- **Audit 3.2 (admin_overrides layer)** — L-effort structural DB feature; SPLIT OUT to a separate later milestone. Not in this spec.
- **No relabel** of existing per-field deep-links. `PerShowActionableWarnings.tsx:100` ("Open in Sheet ↗"), `step3ReviewSections.tsx:2366` ("Open in Sheet ↗"), and the `SourceLink` primitive ("In sheet", `components/crew/primitives/SourceLink.tsx`) stay verbatim. Cross-surface consistency; the callout carries the "fix" framing. The per-warning deep-links already satisfy audit 3.1's "Fix in sheet per flagged field."
- **No new re-sync/re-scan mechanism.** Reuse `ReSyncButton` (per-show, `components/admin/ReSyncButton.tsx`, prop `slug`) and the wizard's existing `RescanSheetButton` (`components/admin/RescanSheetButton.tsx`). This spec adds copy + placement, not new server actions.

## 3. Unit 1 — Correction-loop callout (audit 3.1)

A small presentational callout: one instructional line + a re-run affordance, placed at the top of the flagged-warnings area so the "how do I fix this" answer sits next to the warnings themselves.

### 3.1 Per-show admin page

- **Where:** inside the "Data quality" `<section>` (`app/admin/show/[slug]/page.tsx:877-901`), rendered **after** the `<h2>Data quality</h2>` + `HoverHelp` header row (line 882-901) and **before** `BulkIgnoreControls` (line 905).
- **Render gate (exact):** the callout renders **only when `activeActionable.length > 0 && !archived`**.
  - `activeActionable` / `ignoredActionable` are the active/ignored partition (`page.tsx:398`, `partitionByIgnored`). `archived = Boolean(show.archived)` (`page.tsx:422`).
  - **Active-only, not `active || ignored`:** the enclosing section renders when `activeActionable.length > 0 || ignoredActionable.length > 0` (line 876), but **ignored** warnings are content-keyed and survive re-sync (`page.tsx:926-928` "Ignored (N)… content-keyed ignores that survive re-sync"). Re-syncing does NOT clear them, so the callout's "we'll re-parse and clear this" is false for an ignored-only state → the callout must NOT render when `activeActionable.length === 0`.
  - **`!archived`:** an archived show is the read-only surface; `ReSyncButton` is deliberately suppressed on it (`page.tsx:999-1008` renders "Re-sync is paused while this show is archived" instead — per that block's own comment, manual sync mutates `shows`/`pending_syncs` via `/api/admin/sync` whose only server gate is finalize-ownership, NOT archived, so the CTA is suppressed client-side while the server-side archived refusal is deferred). The callout — a second re-sync entry point — must apply the **same guard**: no callout on an archived show. (No "paused" variant of the callout is needed; the footer already carries that message.)
- **Copy (exact):** `Fixed it in the sheet? Edit the cell, save, then re-sync — we'll re-parse and clear this.`
- **Affordance:** an inline `<ReSyncButton slug={show.slug} />` immediately after the copy, forming one callout unit. Because the callout only renders when `!archived`, the mounted `ReSyncButton` is never an archived-show re-sync path. The existing health-section `<ReSyncButton>` (`page.tsx:1008`) **stays** — it answers a different question ("how did the last sync go") in the sync-health context. Two instances of the same underlying action is acceptable because they are framed for different intents; the impeccable audit gate (§8) validates the visual treatment (the callout instance may adopt a quieter/secondary skin if the audit calls for it — a plan-time refinement, not a spec requirement).
- **New component:** extract a small presentational `CorrectionLoopCallout` (Server Component, no `'use client'`) that renders the copy line and accepts the re-run affordance as `children` (so the same component serves both surfaces with different buttons). Lives at `components/admin/CorrectionLoopCallout.tsx`.

### 3.2 Onboarding wizard step-3

- **Where:** inside `WarningsBreakdown` (`components/admin/wizard/step3ReviewSections.tsx:2272`), in the non-empty branch (line 2287), replacing/augmenting the existing intro line at 2288-2293 ("These are informational and don't block publishing.") with the loop copy. The wizard **already** carries a co-located re-scan affordance (`RescanSheetButton`) in the sheet-card / modal footer, so the wizard callout is **copy-only** — it does not mount a second re-scan button.
- **Copy (exact):** `Fixed it in the sheet? Edit the cell, save, then re-scan — we'll re-parse and clear this.` (Only the verb differs from the per-show copy: "re-scan" vs "re-sync", matching the wizard's pre-publish `RescanSheetButton` action vs the per-show live `ReSyncButton`.)
- **Guard:** the empty branch (line 2279-2285, "No parse warnings for this sheet.") renders **no** callout — nothing to fix.
- The existing non-blocking note's intent ("informational, doesn't block publishing") is folded into the callout wording OR retained as a second line — a plan-time layout detail; the requirement is that the loop instruction is present and the "doesn't block publishing" reassurance is not lost.

### 3.3 Guard conditions (Unit 1)

| Condition | Behavior |
|---|---|
| Per-show: `activeActionable.length === 0` (no active warnings, incl. **ignored-only**) | Callout absent — nothing re-sync will clear. |
| Per-show: `archived` true (even with active warnings) | Callout absent — retired/read-only surface; matches the suppressed footer `ReSyncButton`. |
| Per-show: `activeActionable.length > 0 && !archived` | Callout renders with copy + inline `ReSyncButton`. |
| Per-show: `show.drive_file_id` null | `ReSyncButton` still renders (it takes `slug`, not `drive_file_id`); callout renders (subject to the active/archived gate above). The per-field deep-links independently render nothing when the sheet link is unbuildable — unchanged. |
| Wizard: warnings present | Copy renders; no button mounted (existing `RescanSheetButton` is the affordance). |
| Wizard: no warnings | Empty branch renders; no callout. |

### 3.4 Dimensional invariants (Unit 1)

The callout is intrinsic-height flow content (a `<p>` + an inline button or `children`), not a fixed-dimension parent with flex/grid children. **No fixed-height parent → no dimensional-invariant table required.** The inline `ReSyncButton` keeps its own intrinsic height. (Tailwind v4 `.flex` non-stretch caveat does not apply — no flex parent constrains a child's cross-axis size here.)

### 3.5 Transition inventory (Unit 1)

The callout has a single visual state (static copy + a button whose own busy/idle transitions are already owned by `ReSyncButton`/`RescanSheetButton`). **Two states total for the section: present (active warning, not archived) / absent** — the absent↔present transition is **instant, no animation needed** (it is a server-rendered conditional tied to the render gate, matching the section's existing instant render). No `AnimatePresence`, no new ternary animation. This spec adds no new animated states.

## 4. Unit 2 — Hold explanations (audit 3.3)

### 4.1 Where

`components/admin/ChangeFeedEntry.tsx`, in the left column (`<div className="flex min-w-0 flex-col gap-1">`, line 59-67), **after** the summary `<p>` (line 60-62) and **before** the badge/time row (line 63-66). Rendered **only** when `canGate` is true (`entry.action === "approve_reject" && entry.gate != null`, line 52).

### 4.2 Copy (exact), keyed on `entry.gate.disposition.disposition`

The disposition union is `email_change | rename | removal` (`lib/sync/holds/types.ts:8-10`). Cover all three for forward-safety (only `email_change` holds are written today via `lib/sync/holds/writeMi11Holds.ts`, but `rename`/`removal` are in the type and may be written later).

| disposition | Explanation line (exact) |
|---|---|
| `email_change` | `Held for your review: this crew member's sign-in email changed in the sheet. Approve to update their sign-in address; Reject to keep the current one.` |
| `rename` | `Held for your review: this crew member was renamed in the sheet. Approve to apply the new name; Reject to keep the current one.` |
| `removal` | `Held for your review: this crew member was removed from the sheet. Approve to remove them; Reject to keep them.` |

Rendered as a `text-xs text-text-subtle` `<p>` with `data-testid="change-feed-hold-explanation"`.

### 4.3 Guard conditions (Unit 2)

| Row `action` | Explanation rendered? |
|---|---|
| `approve_reject` **and** `gate != null` | Yes — keyed on disposition. |
| `approve_reject` but `gate == null` (defensive guard, `ChangeFeedEntry.tsx:17-19`) | No — the row is notification-only; no gate, no explanation. |
| `undo` | No. |
| `none` | No. |

A `disposition` value outside the three known literals is impossible under the TypeScript union, but the lookup is exhaustive via a `switch`/record keyed on the three literals; **an unmatched disposition renders no explanation line** (fail-quiet, never a raw disposition string leaked to UI — invariant 5 posture, defense-in-depth).

## 5. Copy inventory (single source of truth)

All operator-visible strings introduced by this spec, verbatim (grep target for the numeric/consistency sweep — no other section may contradict these):

1. Per-show callout: `Fixed it in the sheet? Edit the cell, save, then re-sync — we'll re-parse and clear this.`
2. Wizard callout: `Fixed it in the sheet? Edit the cell, save, then re-scan — we'll re-parse and clear this.`
3. Hold `email_change`: `Held for your review: this crew member's sign-in email changed in the sheet. Approve to update their sign-in address; Reject to keep the current one.`
4. Hold `rename`: `Held for your review: this crew member was renamed in the sheet. Approve to apply the new name; Reject to keep the current one.`
5. Hold `removal`: `Held for your review: this crew member was removed from the sheet. Approve to remove them; Reject to keep them.`

The two callout strings differ **only** in the verb ("re-sync" / "re-scan"). To avoid drift, the shared prefix/suffix live in one `CorrectionLoopCallout` definition parameterized by the verb (a single `mode: "resync" | "rescan"` prop or equivalent), not two independently-authored strings.

## 6. Non-catalog rationale (do-not-relitigate)

All copy introduced here is **hard-coded UI copy**, NOT §12.4 catalog error codes:

- Callout copy is instructional guidance (how to run the loop), not an error state.
- Hold-explanation copy is a descriptive **absence-of-failure** state — the same category as the changes feed's already-hard-coded empty-state ("No changes yet…") and truncation ("Showing the 50 most recent changes…") copy, whose header comment (`components/admin/ChangesFeed.tsx:8-11`) states they "are absence-of-overflow / absence-of-failure states, not catalog failure codes (mirrors ParsePanel's empty-state rationale)."

Therefore: **NO** §12.4 prose edit, **NO** `pnpm gen:spec-codes`, **NO** `lib/messages/catalog.ts` row, **NO** three-way lockstep. Invariant 5 (no raw error codes in UI) is satisfied — this is descriptive copy, not codes routed through `lib/messages/lookup.ts`.

## 7. Testing (anti-tautology)

- **Unit 1 (per-show callout):** render the "Data quality" section with ≥1 **active** warning and `archived === false`; assert the exact callout copy string (#5.1) is present AND a `ReSyncButton` (the re-sync action, via its `data-testid`/role + label, not merely "a button exists") is within the callout. Negatives, all asserting the callout copy is **absent**: (a) zero warnings (section absent); (b) **ignored-only** — `activeActionable=[]`, `ignoredActionable.length>0` (section renders its Ignored subsection but no callout); (c) **archived + active warnings** — `archived===true`, `activeActionable.length>0` (no callout, no second re-sync entry point on a retired show).
- **Unit 1 (wizard callout):** render `WarningsBreakdown` with ≥1 warning; assert exact copy (#5.2). Negative: zero warnings → assert the "No parse warnings" empty copy renders and the loop copy does **not**.
- **Unit 2 (hold explanations):** for **each** disposition (`email_change`, `rename`, `removal`), render `ChangeFeedEntry` with `action==='approve_reject'` + a matching gate; assert the **exact** disposition-specific explanation string (#5.3–5.5) renders. Negatives: (a) `action==='undo'` → no `change-feed-hold-explanation`; (b) `action==='none'` → none; (c) `action==='approve_reject'` with `gate==null` → none. The assertion must key on the exact copy per disposition (a shared/generic string would let a wrong-disposition mapping pass — the failure mode this catches is the copy table wired to the wrong disposition).

Concrete failure modes each test catches: callout tests catch "callout silently dropped / wrong verb / button not the re-sync action / callout shown for ignored-only (false 'will clear this') / callout re-enables re-sync on an archived show"; hold tests catch "explanation wired to the wrong disposition / leaked on non-gate rows / missing on gate rows."

## 8. Invariants & meta-test inventory

- **Invariant 5 (no raw codes in UI):** satisfied — §6 rationale.
- **Invariant 8 (impeccable dual-gate):** **APPLIES** — all three surfaces are UI (`app/admin/**` page, `components/**`). Run `/impeccable critique` AND `/impeccable audit` on the affected diff; HIGH/CRITICAL fixed or `DEFERRED.md`-deferred before the Codex whole-diff review.
- **Invariants 2, 3, 4, 9, 10 (advisory locks, email canonicalization, sync cursor, Supabase call-boundary, mutation-surface telemetry):** **N/A** — no DB writes, no mutation surfaces, no Supabase client calls, no advisory-lock code paths added.
- **Meta-test inventory:** this milestone CREATES/EXTENDS **no** structural meta-test. No auth boundary, no admin-alert catalog row, no advisory-lock topology, no email-normalization surface, no new mutation surface. Declared explicitly: *none applies* because the change is presentational copy on existing render-only components.
- **Routing:** UI work → Opus / Claude Code (this session) — correct owner per `ROUTING.md` hard rule.

## 9. Watchpoints (reviewer pre-load — do-not-relitigate)

1. **Hold copy is not a catalog code** — §6, precedent `ChangesFeed.tsx:8-11`. Do not request §12.4 lockstep.
2. **No deep-link relabel** — §2 non-goal; existing "Open in Sheet ↗" / "In sheet" labels are intentionally preserved for cross-surface consistency.
3. **Audit 3.2 (admin_overrides) is intentionally out of scope** — split to a later milestone; this spec targets B+, not A−. Do not flag its absence as incompleteness.
4. **Two per-show `ReSyncButton` instances is intentional** — health-context vs correction-context framing; impeccable audit owns the visual disambiguation. Both are gated on `!archived` (§3.1), so neither is an archived-show re-sync path.
5. **Callout gate is `activeActionable.length > 0 && !archived`, not the section's `active || ignored`** (§3.1) — closes the ignored-only false-guidance case and the archived re-sync-reopen case (round-1 findings). Do not "simplify" it back to the section-level condition.
6. **All-three-disposition coverage is forward-safety, not dead code** — `rename`/`removal` are live members of the `Disposition` union (`holds/types.ts:9-10`); covering them now prevents a blank explanation the day such a hold is first written.
