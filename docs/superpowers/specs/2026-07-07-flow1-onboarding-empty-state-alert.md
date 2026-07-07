# Spec — Flow 1 → A−: onboarding empty-state, Step-1 branch, first-seen hard-fail alert

**Date:** 2026-07-07
**Slug:** `flow1-onboarding-empty-state-alert`
**Source:** `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §6 "Flow 1 — Add a new show (B → A−)", items 1.1 / 1.2 / 1.3.
**Status:** brainstormed + approved; autonomous ship.

---

## 1. Problem & scope

Flow 1 ("Add a new show": Drive drop → scan → wizard) grades **B**. Three gaps drop it below A−:

- **1.1 (UI).** A scan that stages nothing renders as a muted "Found N items" hover-popover in the wizard footer (`components/admin/wizard/Step2Verify.tsx:528-552`, reached whenever `total === 0` — see `formatTotals` `:95-99`). An empty folder or a folder of unreadable files gives Doug no first-class "nothing to review — here's your next step" state.
- **1.2 (UI).** Step 1 already covers folder creation ("or make a new one", `components/admin/wizard/Step1Share.tsx:117`), but there is no compact end-to-end "I have no folder yet" walkthrough for a first-time Doug.
- **1.3 (backend + catalog).** The onboarding scan's `hard_fail` branch (`lib/sync/runOnboardingScan.ts:856-878`) writes only a `sync_log` + a `hard_failed` manifest row. It raises **no admin alert**. A first-seen sheet the parser cannot read is therefore invisible outside the wizard manifest — a dark signal (audit §4 seam matrix row "MI-1..5b hard fails (first-seen) → onboarding manifest only, no alert").

**In scope:** exactly items 1.1, 1.2, 1.3. **Out of scope:** every other Flow 1..8 action in the audit (email delivery / Resend, digest, single-crew-drop gate, raw-snippet side-by-side, override layer, etc.). No new §12.4 codes beyond the single alert code below. No parser changes. No schema/DDL change.

### Grade target
Done-when (audit §6 Flow 1): "a Doug with an empty folder or a garbage sheet gets an explicit next step without opening a popover or the wizard."

---

## 2. Live-code citations (verified against worktree `feat/flow1-onboarding-empty-state-alert` @ `00e6d7ad2`)

| Concept | Location | Verified shape |
|---|---|---|
| Step 2 wizard component | `components/admin/wizard/Step2Verify.tsx` | client component; `FormState` union `:89-93` (`idle`/`submitting`/`success`/`error`) |
| Zero-scan popover (to replace) | `Step2Verify.tsx:305-307, 486-487, 522-575` | `foundSummary` renders `Step2FoundSummary` in `WizardFooter` `center`; shows "Found {total} items" |
| Totals shape | `lib/onboarding/scanResponse.ts:17-22` | `OnboardingScanTotals = { staged, hard_failed, skipped_non_sheet, live_row_conflict }` (all `number`) |
| Completed body | `lib/onboarding/scanResponse.ts:31-37` | `OnboardingScanCompletedBody = { outcome:"completed", wizardSessionId, folderId, folderName?, totals }` |
| Pasted folder URL (state) | `Step2Verify.tsx:121` | `const [folderUrl, setFolderUrl] = useState(priorScan?.folderUrl ?? "")` |
| `formatTotals` | `Step2Verify.tsx:95-99` | `staged + hard_failed + skipped_non_sheet + (live_row_conflict ?? 0)` |
| Re-scan submit | `Step2Verify.tsx:210-261, 467-480` | `handleSubmit` re-POSTs the same `folderUrl`; button `data-testid="wizard-step2-submit"` |
| Continue-to-Step-3 | `Step2Verify.tsx:498-516` | `canContinue = state.kind === "success" || showResume` |
| Step 1 wizard component | `components/admin/wizard/Step1Share.tsx` | client component; numbered `<ol data-testid="wizard-step1-steps">` `:108-174`; existing `<details data-testid="wizard-step1-explainer">` `:176-191` |
| Step-1 "make a new one" | `Step1Share.tsx:117` | "In Google Drive, find the folder … (or make a new one)." |
| Onboarding hard_fail branch | `lib/sync/runOnboardingScan.ts:856-880` | inside `scanPreparedFileWithTx` `:669`; writes `upsertManifest status:"hard_failed"`; **no alert** |
| LIVE_ROW_CONFLICT emit (mirror) | `lib/sync/runOnboardingScan.ts:979-992` | `tx.upsertAdminAlert({ showId:null, code:LIVE_ROW_CONFLICT, context:{drive_file_id,file_name,folder_id,wizard_session_id,…} })` on the **fresh recovery tx** (`recoverLiveRowConflict`), post-abort |
| `processed[]` entries | `runOnboardingScan.ts:852,878` | `processed.push({ driveFileId, outcome:"hard_failed" })` — carries `driveFileId` per file |
| `upsertAdminAlert` tx method | `runOnboardingScan.ts:624-630` | `select public.upsert_admin_alert($1::uuid,$2,$3::jsonb)` |
| `AdminAlertCode` union (SoT) | `lib/adminAlerts/upsertAdminAlert.ts:3-38` | hand-maintained; `LIVE_ROW_CONFLICT` `:9`; `showId: string \| null` `:41` |
| `failedKeys` union-merge RPC | `supabase/migrations/20260618000000_upsert_admin_alert_failedkeys_merge.sql:38-79` | context with `failedKeys` array is sorted-distinct union-merged across upserts; 10-min occurrence-count debounce; only producer today = `TILE_PROJECTION_FETCH_FAILED` |
| `failedKeys` producer shape (mirror) | `app/show/[slug]/[shareToken]/_CrewShell.tsx:155-167` | `const failedKeys = Object.keys(...).sort(); upsertAdminAlert({ showId, code, context:{…, failedKeys} })` |
| Alert dedup key | `supabase/migrations/20260618000000_...sql:47` | `on conflict (coalesce(show_id::text,''), code) where resolved_at is null` → null-show + one code = one open row |
| Alert → Doug copy render | `components/admin/PerShowAlertSection.tsx` (`safeDougFacingTemplate` `:112-114`, called `:296`) | resolves `code` → copy via `messageFor` (`lib/messages/lookup.ts`) — no private copy map |
| §12.4 catalog | `lib/messages/catalog.ts`; `LIVE_ROW_CONFLICT` row `:1873-1888` | `{ code, resolution:"manual", audience:"doug", dougFacing, crewFacing:null, followUp, helpfulContext, title, longExplanation, helpHref }` |
| Generated spec-codes | `lib/messages/__generated__/spec-codes.ts` (`LIVE_ROW_CONFLICT` `:449`) | regenerated by `pnpm gen:spec-codes` |
| Admin-alert catalog meta-test | `tests/messages/_metaAdminAlertCatalog.test.ts` | asserts per code: non-null `dougFacing` `:493-513`; in `MESSAGE_CATALOG` `:515`; write-site registered `:527,605-609`; lifecycle class `:657-674`; `resolution` matches class `:708-714` |
| Alert code registry | `tests/messages/adminAlertsRegistry.ts:9-54` | `ADMIN_ALERTS_CODES` array (44 entries incl. `LIVE_ROW_CONFLICT` `:23`) |
| Write-site patterns | `tests/messages/_metaAdminAlertCatalog.test.ts:66-,122-125` | `LIVE_ROW_CONFLICT: { pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*LIVE_ROW_CONFLICT/ }` |
| Lifecycle map | `tests/messages/_metaAdminAlertCatalog.test.ts:282-,451` | `LIVE_ROW_CONFLICT: { class: "event-manual" }` |
| Alert action links | `lib/adminAlerts/alertActions.ts:13-24 (ALERT_ACTION_CODES), 85-92` | `LIVE_ROW_CONFLICT` builds an "Open in Sheet" / "Open Drive folder" link from context |
| Action-contract pin (why NO link) | `tests/messages/_metaAlertActionsContract.test.ts:145-161` | `expect(Object.keys(ALERT_ACTIONS).sort()).toEqual(SPEC_CODES)` where `SPEC_CODES` = exactly 10 codes → adding an 11th breaks it |
| Scan route (emit site + telemetry owner) | `app/api/admin/onboarding/scan/route.ts:266-294` | `runtime.runOnboardingScan(...)` then, on `result.outcome === "completed"`, emits `logAdminOutcome ONBOARDING_SCAN_COMPLETED` in a `try/catch {/*best-effort*/}` post-commit block; `result.processed.length` in scope; route in `AUDITABLE_MUTATIONS` (`tests/log/_auditableMutations.ts:158`) |
| Shared scan helper (NOT emit site) | `lib/sync/applyStaged.ts:1726`, `lib/sync/retrySingleFile.ts:274`, `lib/onboarding/applyRescanDecisionUnderLock.ts:190` | all call `scanOnboardingPreparedFiles(..., { tx: scanTx, withShowLock: (_id, fn) => fn(scanTx) })` — injected already-locked tx; emitting in the helper would run under a held lock on non-first-seen paths |
| Bell suppressed during setup | `components/admin/nav/OnboardingTopBar.tsx:70-74`; `app/admin/layout.tsx:161` | no `<NotifBell>` while the wizard owns the screen (owner decision 2026-07-06); alerts surface on the full `AdminNav` bell post-onboarding |
| x1 catalog-parity test | `tests/cross-cutting/codes.test.ts` | the `x1` gate comparing runtime catalog ↔ §12.4 prose (NOT `tests/messages/codes.test.ts`, which does not exist) |

---

## 3. Design — item 1.3 (first-seen hard-fail alert)

### 3.1 New code
`ONBOARDING_SHEET_UNREADABLE` — a single new code that is BOTH:
- an `AdminAlertCode` (union member, `lib/adminAlerts/upsertAdminAlert.ts`), and
- a §12.4 `MessageCode` catalog row (the admin-alert catalog meta-test requires every `AdminAlertCode` to have a non-null `dougFacing` catalog row — same 3-way lockstep as every existing alert code, e.g. `LIVE_ROW_CONFLICT`).

### 3.2 Emit contract
- **Semantics.** The onboarding scan is by definition first-seen (no `shows` row exists during setup). Every `hard_failed` file in a scan is a first-seen hard-fail. Therefore: **if a scan produced ≥1 `hard_failed` file, emit one `ONBOARDING_SHEET_UNREADABLE` alert** for that folder.
- **One alert, not N.** `showId: null` + one code collapses to a single open `admin_alerts` row via the dedup key `(coalesce(show_id::text,''), code) where resolved_at is null`. We additionally supply `context.failedKeys = <sorted distinct driveFileIds of the hard_failed files>` so re-scans union-merge into the same row (mirrors `TILE_PROJECTION_FETCH_FAILED`), and the occurrence count is debounced 10 min by the existing RPC. A folder with 5 unreadable sheets = **one** alert whose `failedKeys` lists 5 ids.
- **Context shape** (mirrors LIVE_ROW_CONFLICT + adds `failedKeys`):
  ```
  { folder_id, wizard_session_id, failedKeys: string[] /* sorted distinct driveFileIds */ }
  ```
  `failedKeys` is the ONLY per-scan-variable field, so the union-merge (which unions `failedKeys` but overwrites every other context field with the latest `p_context`) has no ambiguous counter. The authoritative failed count is `failedKeys.length` (the union) — there is deliberately NO separate `failed_count` scalar (it would be overwritten to the latest scan's count while `failedKeys` accumulates the union — the exact drift called out in review R1 finding 5). No sheet NAMES in the alert context (the wizard manifest already lists failed sheets by name; the alert points Doug there). No PII, no tokens.
- **Placement (invariant 10 — POST-COMMIT, outside the advisory-lock tx). Emit at the ONBOARDING SCAN ROUTE, not in the shared scan helper.** `scanOnboardingPreparedFiles` is NOT onboarding-only: it is also called by `lib/sync/applyStaged.ts:1726`, `lib/sync/retrySingleFile.ts:274`, and `lib/onboarding/applyRescanDecisionUnderLock.ts:190`, each passing an **injected already-locked** `{ tx: scanTx, withShowLock: (_id, fn) => fn(scanTx) }` — so any emit inside that helper would run under a held lock on the retry/rescan/apply paths AND would fire on non-first-seen paths (review R1 finding 1). Therefore the emit lives in the **onboarding scan route** `app/api/admin/onboarding/scan/route.ts`, immediately after `runtime.runOnboardingScan(...)` resolves, in the **same `result.outcome === "completed"` post-commit block** that already emits `logAdminOutcome("ONBOARDING_SCAN_COMPLETED")` (`route.ts:274-286`). At that point every per-file tx has committed, no advisory lock is held, and this route is the FIRST-RUN scan entry exclusively (retry/rescan/applyStaged are separate entry points that never hit this route). The route reads `result.processed` (`{ driveFileId, outcome }[]`, `runOnboardingScan.ts:852,878`); if it contains any `{ outcome: "hard_failed" }`, call the standalone `upsertAdminAlert` (`lib/adminAlerts/upsertAdminAlert.ts`, service-role) once with `failedKeys` = the sorted-distinct hard-failed driveFileIds. Emitting only on the `completed` outcome naturally excludes `schema_missing` / `superseded` (they never enter this block).
- **Idempotency.** Re-running the wizard scan on the same folder re-emits; the union-merge + debounce keep it one open row with the union of failed ids. When Doug fixes all sheets and re-scans clean, `processed` has zero `hard_failed` → no emit; the prior open alert is resolved manually (event-manual lifecycle — Doug dismisses it), exactly like LIVE_ROW_CONFLICT.

### 3.3 Guard conditions (1.3)
| Input state | Behavior |
|---|---|
| `processed` has 0 `hard_failed` | No alert emitted. |
| `processed` has ≥1 `hard_failed` | Exactly one alert; `failedKeys` = all hard-failed driveFileIds (sorted distinct). |
| scan outcome ≠ `completed` (`schema_missing` / `superseded`) | No alert — the emit is inside the `result.outcome === "completed"` block only (`route.ts:274`). |
| emit throws (infra) | Fail-quiet: wrapped in `try/catch { /* best-effort */ }`, identical to the adjacent `ONBOARDING_SCAN_COMPLETED` emit (`route.ts:283-285`). The scan result is already committed and streamed; the alert never blocks the scan outcome. |
| `folderId` / `wizardSessionId` present | Always available at the route seam (`folder.folderId`, `wizardSessionId` — `route.ts:266,289-292`). |

### 3.35 Render surface (where Doug actually sees it)
`NotifBell` is **suppressed during first-run onboarding** — `components/admin/nav/OnboardingTopBar.tsx:70-74` (owner decision 2026-07-06) renders no bell while the setup wizard owns the screen (`app/admin/layout.tsx:161` mounts `OnboardingTopBar`, not the full `AdminNav`). So the alert is NOT the in-setup surface. Its surfaces are:
- **During setup:** the wizard itself — Step 3 lists every hard-failed sheet by name (the manifest), and item 1.1's "files present, none readable" empty-state block (this same spec) directly reports the all-fail case. The alert is not needed as an in-setup signal; the wizard is.
- **After setup finalizes:** the row persists in `admin_alerts` (dedup-keyed, unresolved) and appears in the full-`AdminNav` `NotifBell` the moment Doug lands on the dashboard — a durable reminder that some sheets never got read, exactly when the wizard is no longer on screen. This is the alert's real value: it bridges the gap the suppressed-bell setup screen cannot.

The claim is therefore "the alert is a durable post-onboarding reminder," NOT "Doug sees a bell mid-setup." The in-setup coverage is the wizard (items 1.1 + existing Step-3 manifest).

### 3.4 Doug-facing copy (catalog row)
- `dougFacing` (constant, NOT interpolated — no `<placeholder>`, so NOT added to `INTERPOLATED_DOUG_FACING_CODES`): **"Some sheets in the folder you just added couldn't be read as a show. Open Add a show to see which ones, then fix them in the sheet and re-scan."**
- `resolution: "manual"`, `audience: "doug"`, `crewFacing: null`.
- `title`: "Some sheets couldn't be read".
- `followUp`: "Doug → open Add a show, fix the flagged sheets, re-scan".
- `helpfulContext` / `longExplanation`: one paragraph explaining setup found files it could not parse as a show sheet, they were skipped (not staged), and the wizard's Step 3 lists each by name; fix the sheet layout and re-run setup.
- `helpHref`: `/help/errors#ONBOARDING_SHEET_UNREADABLE`.
- **Severity:** `warning` (default; the meta-test defaults unlisted codes to `warning` `:602`). This is not an infra fault — it is expected operator-fixable data.

### 3.5 No alert action link (deliberately omitted)
The alert does NOT get an `ALERT_ACTIONS` entry. Two reasons: (a) `tests/messages/_metaAlertActionsContract.test.ts:145-161` pins `ALERT_ACTIONS`/`ALERT_ACTION_CODES` to EXACTLY the 10 existing codes (`toEqual(SPEC_CODES)`) — adding an 11th is another lockstep surface; and (b) the only sensible target (`/admin?step=3`) is the setup wizard, which is no longer mounted post-onboarding — precisely when this alert surfaces (§3.35) — so the link would be stale exactly when clickable. The `dougFacing` copy ("Open Add a show … fix them in the sheet and re-scan") is self-contained; no action button is added. `ALERT_ACTION_CODES` and its meta-test are untouched.

---

## 4. Design — item 1.1 (zero-scan empty state)

### 4.1 New render branch in Step2Verify
When a scan completes with `totals.staged === 0`, replace the footer "Found N items" popover (`Step2FoundSummary`) with a first-class **in-card** block rendered in the form body (same region as the error alert, `:450-460`). Two modes, both derivable from `totals`:

| Mode | Condition | Copy | Actions |
|---|---|---|---|
| **Empty folder** | `formatTotals(totals) === 0` (nothing found at all) | Heading "This folder is empty." Body: "Add a show sheet to the folder, then re-scan." | (a) **Open the folder** link → the pasted `folderUrl` (opens Drive, `target="_blank" rel="noopener noreferrer"`), rendered only when `folderUrl.trim()` is a non-empty parseable Drive URL (else omitted); (b) **Re-scan** button → re-submits the same `folderUrl` (reuse `handleSubmit`). |
| **Files present, none readable** | `formatTotals(totals) > 0 && totals.staged === 0` | Heading "We found {formatTotals} file{s} but couldn't read any as a show sheet." Body: names the breakdown (hard_failed / skipped_non_sheet counts, reusing the existing per-bucket lines from `Step2FoundSummary`). | **Continue to Step 3** stays available (the manifest lists the failed sheets); **Re-scan** offered too. |

When `totals.staged > 0` (≥1 sheet to review) → unchanged: footer "Found N items" popover + "Continue to Step 3" primary, exactly as today.

### 4.2 Continue-to-Step-3 in empty modes
- **Empty folder:** there is nothing in Step 3. "Continue to Step 3" is de-emphasized (secondary) but not removed (Doug may still proceed to finalize an empty setup, matching current `canContinue` behavior which already allows it). The empty-state block's **Re-scan** is the emphasized (accent) action.
- **Files-present-none-readable:** "Continue to Step 3" is the emphasized path (the manifest is the payload); Re-scan is secondary.

This keeps the single-accent-per-card rule (DESIGN.md ≤10% accent, cited `Step2Verify.tsx:110-117`): exactly one accent control per state.

### 4.3 Guard conditions (1.1)
| `state.kind` | `totals` | Rendered |
|---|---|---|
| `success` | `staged > 0` | Footer "Found N items" popover (unchanged). |
| `success` | `staged === 0`, `formatTotals === 0` | Empty-folder block. |
| `success` | `staged === 0`, `formatTotals > 0` | Files-present-none-readable block. |
| `submitting` / `error` / `idle` | — | Unchanged (progress readout / error alert / action row). |
| `folderUrl` empty or unparseable in empty-folder mode | — | "Open the folder" link omitted; Re-scan button disabled iff `folderUrl.trim()===""` (reuse existing `submitDisabled`). |

### 4.4 Copy comes through the component, not §12.4
1.1 copy is plain wizard microcopy authored in the component (like every other Step2 string, e.g. `:456` "We could not verify that folder."). It is NOT a §12.4 code — no error code is being surfaced (invariant 5 is about not leaking raw codes; this is descriptive UI copy, no code involved). No catalog change for 1.1.

---

## 5. Design — item 1.2 (Step-1 "no folder yet?" branch)

Add a second `<details>` disclosure below the existing "What's this email?" explainer (`Step1Share.tsx:176-191`), `data-testid="wizard-step1-no-folder"`:
- Summary: **"Don't have a folder yet?"**
- Body: a compact ordered walkthrough reusing the help-page framing (`app/help/admin/onboarding-wizard/*.mdx:20-30`): "1. In Google Drive, click New → Folder and name it (e.g. your show name). 2. Open the folder and drop your show sheet(s) inside. 3. Share the folder with the email above (Viewer). 4. Come back and continue." No service-account email is re-rendered inside (it's already shown above); the walkthrough references "the email above."

Pure additive markup — no restructure of the numbered `<ol>`, no new component, no props. Matches the existing `<details>` pattern/tokens exactly.

### 5.1 Guard conditions (1.2)
Static content; no props consumed beyond the existing `serviceAccountEmail` (unchanged). Collapsed by default (`<details>` without `open`). No dynamic state.

---

## 6. Modes, transitions, dimensions

### 6.1 Mode boundaries (Step2Verify)
The card's lower region is a single surface that swaps between: **progress readout** (submitting), **error alert** (error), **empty-folder block** (success+staged0+total0), **files-none-readable block** (success+staged0+total>0), and **action row** (idle / success+staged>0). Exactly one renders at a time. The footer "Found N items" popover renders ONLY in success+staged>0 (removed for the two staged-0 modes — that is the whole point of 1.1). The two new blocks belong to the success state only.

### 6.2 Transition inventory (Step2Verify lower-region states)
States: `A idle-action-row`, `B submitting-progress`, `C success-popover(staged>0)`, `D empty-folder-block`, `E files-none-readable-block`, `F error-alert`. This component uses **no enter/exit animations today** (blocks swap instantly on `state` change; no `AnimatePresence`, no framer-motion). All transitions are **instant — no animation needed**, consistent with the existing component. Enumerated pairs (each instant): A↔B, A↔C, A↔D, A↔E, A↔F, B↔C, B↔D, B↔E, B↔F, C↔D, C↔E, C↔F, D↔E, D↔F, E↔F. Compound transitions: none — `state` is a single discriminated union; only one block is live at a time; no block animates while another is mid-transition.

### 6.3 Dimensional invariants
The new empty-state blocks are flow-layout `flex flex-col gap-*` inside the auto-height form card — **no fixed-dimension parent with flex/grid children requiring an explicit stretch**. N/A: no `getBoundingClientRect` layout task required. (The blocks size to content exactly like the existing error alert `:450-460`.) Step1's new `<details>` is flow layout — N/A.

---

## 7. Tier × domain × layer matrix (1.3 alert code)

| Layer | Action |
|---|---|
| Table DDL | **N/A** — `admin_alerts` table + `upsert_admin_alert` RPC already exist; no column/enum/DDL change. No migration. |
| Inline CHECK | N/A — `admin_alerts.code` is free `text`; no CHECK enumerates codes. |
| RPC write path | Reuse existing `public.upsert_admin_alert(uuid,text,jsonb)`; `failedKeys` union-merge path already supports the new producer (no RPC change). |
| RPC read path | Reuse `PerShowAlertSection` + `messageFor`; no change. |
| `AdminAlertCode` union | ADD `"ONBOARDING_SHEET_UNREADABLE"` in `lib/adminAlerts/upsertAdminAlert.ts`. |
| §12.4 spec prose | ADD row in `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4. |
| Generated codes | `pnpm gen:spec-codes` → refresh `lib/messages/__generated__/spec-codes.ts`. |
| Runtime catalog | ADD row in `lib/messages/catalog.ts` (fields per §3.4). |
| Alert registry | ADD to `tests/messages/adminAlertsRegistry.ts` `ADMIN_ALERTS_CODES`. |
| Write-site pattern | ADD `ONBOARDING_SHEET_UNREADABLE: { pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"?ONBOARDING_SHEET_UNREADABLE/ , file: "app/api/admin/onboarding/scan/route.ts" }` in `_metaAdminAlertCatalog.test.ts` `ADMIN_ALERTS_WRITE_SITES`. (Route uses the standalone `upsertAdminAlert` with a string-literal `code:`, hence optional-quote in the regex.) |
| Lifecycle class | ADD `ONBOARDING_SHEET_UNREADABLE: { class: "event-manual" }` in `ADMIN_ALERTS_LIFECYCLE` (mirror LIVE_ROW_CONFLICT). |
| Alert action link | **N/A** — deliberately no `ALERT_ACTIONS` entry (§3.5); `ALERT_ACTION_CODES` + `_metaAlertActionsContract.test.ts` untouched. |
| Emit site | `app/api/admin/onboarding/scan/route.ts`, inside the existing `result.outcome === "completed"` post-commit block (`route.ts:274-286`), calling standalone `upsertAdminAlert` when `result.processed` has ≥1 `hard_failed` (§3.2). |
| Telemetry (rule 10) | **N/A extra** — the mutation surface is this same route, already in `AUDITABLE_MUTATIONS` with `logAdminOutcome`. The alert is additional signal on an already-instrumented surface, not a new surface → no new registry obligation. |
| Help page | **N/A edit** — `/help/errors` auto-derives rows from the catalog and groups by code PREFIX (`app/help/errors/_families.ts`). The `ONBOARDING` prefix is already mapped to the `setup-drive` family (`_families.ts:20`), so `ONBOARDING_SHEET_UNREADABLE` auto-assigns; `tests/help/errors-grouping.test.tsx` guarantees no code is dropped. No `_families.ts` change. `helpHref` `/help/errors#ONBOARDING_SHEET_UNREADABLE` resolves to the auto-rendered anchor. |
| Tests | New behavioral test for the emit (§9); meta-tests above extended. |

---

## 8. Meta-test inventory (created / extended)

- **EXTENDS** `tests/messages/_metaAdminAlertCatalog.test.ts` — new code passes only after union + registry + write-site + lifecycle + catalog rows all land (the meta-test is the structural guard for 1.3).
- **EXTENDS** `tests/messages/adminAlertsRegistry.ts` `ADMIN_ALERTS_CODES`.
- **EXTENDS** `tests/cross-cutting/codes.test.ts` (`x1-catalog-parity`) — via the §12.4 ↔ catalog 3-way lockstep (spec prose + gen + catalog.ts in one commit).
- **UNCHANGED** `tests/messages/_metaAlertActionsContract.test.ts` — no action link added (§3.5), so its exactly-10-codes pin is not touched.
- **EXTENDS** the onboarding-scan-route test surface with a new emit assertion (§9).
- **Advisory-lock topology:** NO `pg_advisory*` change — the emit is deliberately OUTSIDE the lock (post-commit fresh tx). Declared per the writing-plans rule: no new lock holder; `tests/auth/advisoryLockRpcDeadlock.test.ts` untouched. The plan states this explicitly.
- **NONE** for validation-schema-parity — no migration.

---

## 9. Test plan (anti-tautology)

1. **Alert emitted on hard-fail (behavioral).** Drive the scan route (or its extracted post-scan emit helper) with a `runOnboardingScan` result whose `processed` contains ≥1 `{outcome:"hard_failed"}` and `outcome:"completed"`; assert `upsertAdminAlert` was called exactly once with `{ showId: null, code: "ONBOARDING_SHEET_UNREADABLE", context: { failedKeys: [<the hard-failed ids, sorted distinct>], folder_id, wizard_session_id } }`. **Failure mode caught:** emit missing, emits per-file (N calls), omits `failedKeys` (breaking union-merge), or re-introduces a `failed_count` scalar. Assert against the recorded call args (the data source), not a rendered surface. Derive expected `failedKeys` from the fixture's driveFileIds, not a hardcoded literal.
2. **No alert when all files stage / skip.** A `completed` result with zero `hard_failed` (all staged, or staged+skipped) → `upsertAdminAlert` NOT called with the new code. **Catches:** over-eager emit.
3. **Non-completed outcome → no emit.** A result with `outcome:"schema_missing"` or `"superseded"` (even if it somehow carried hard_failed) → `upsertAdminAlert` NOT called. **Catches:** emit leaking outside the `completed` block; proves the emit is gated on outcome, and — because the emit lives at the route AFTER `runOnboardingScan` resolves — that it is post-commit/outside-lock by construction (the shared `scanOnboardingPreparedFiles` helper is never the emit site, so the injected-locked-tx callers can't fire it).
4. **1.1 empty-folder block (real-browser or RTL).** Render Step2Verify in `success` with `totals={staged:0,hard_failed:0,skipped_non_sheet:0,live_row_conflict:0}` (formatTotals 0) → the empty-folder block renders (`data-testid="wizard-step2-empty"`), the footer "Found N items" popover does NOT render, Re-scan button present, "Open the folder" link present iff a parseable `folderUrl`. **Catches:** popover leaking into the staged-0 case; missing CTA. Scope the DOM query to the block testid; clone-and-strip the footer before asserting the popover is absent (anti-tautology: don't let the footer's absence be satisfied by a container that also holds the block).
5. **1.1 files-present-none-readable block.** `success` with `{staged:0,hard_failed:2,skipped_non_sheet:1,...}` (formatTotals 3) → the "found 3 files, couldn't read any" block renders with the bucket breakdown; "Continue to Step 3" is the emphasized action. **Catches:** conflating empty-folder with unreadable-files copy; wrong count.
6. **1.1 staged>0 unchanged.** `success` with `staged:2` → footer popover renders, no empty block. **Catches:** regression of the normal path.
7. **1.2 disclosure present.** Step1Share renders `<details data-testid="wizard-step1-no-folder">` collapsed by default with the 4-step walkthrough. **Catches:** missing/opened-by-default disclosure.
8. **Catalog/registry green.** `_metaAdminAlertCatalog`, `adminAlertsRegistry`-consuming tests, and `tests/cross-cutting/codes.test.ts` pass with the new code (proves the 3-way lockstep landed).

Numbers derived from fixtures, never hardcoded expectations that a fixture can't reach.

---

## 10. Disagreement-loop preempts (for the reviewer)

- **Fail-quiet emit (§3.3).** The post-commit alert emit is best-effort: an emit throw is logged-and-swallowed, never failing the already-committed scan. This matches the post-commit-telemetry posture (invariant 10 emits are POST-COMMIT and non-blocking). Do not relitigate as "swallowed error."
- **One alert, not per-file.** Deliberate: `failedKeys` union-merge + null-show dedup key (`...sql:47`) is the established pattern (`TILE_PROJECTION_FETCH_FAILED`). Not a missed per-file loop.
- **1.1 copy not routed through §12.4.** Deliberate: descriptive wizard microcopy, no error code surfaced. Invariant 5 governs raw *codes*; none here. Consistent with existing Step2 inline strings (`:456`).
- **event-manual lifecycle.** Mirrors LIVE_ROW_CONFLICT (`:451`). A clean re-scan does not auto-resolve the row; Doug dismisses it. Not an "auto" candidate.
- **No migration.** `admin_alerts.code` is free text; adding a code string touches no DDL. validation-schema-parity is correctly N/A.
- **Emit lives at the route, NOT in `scanOnboardingPreparedFiles`.** Deliberate (review R1 finding 1): the shared helper runs under an injected already-locked tx on the `applyStaged`/`retrySingleFile`/`applyRescanDecisionUnderLock` callers, and those are not first-seen paths. The route (`route.ts:274-286`) is post-commit, lock-free, and the exclusive first-run entry. Do not relocate the emit into the helper "to mirror LIVE_ROW_CONFLICT."
- **Alert is a post-onboarding reminder, not an in-setup bell (§3.35).** `NotifBell` is intentionally suppressed during setup (`OnboardingTopBar.tsx:70-74`); the wizard (item 1.1 + Step-3 manifest) is the in-setup surface, and the persistent alert surfaces on the full AdminNav bell afterward. Do not flag "the alert is dark during onboarding" as a defect — it is by design, and the coverage is the wizard.

---

## 11. Files touched (summary)

**UI (Opus + impeccable dual-gate):** `components/admin/wizard/Step2Verify.tsx`, `components/admin/wizard/Step1Share.tsx`.
**Backend/catalog:** `app/api/admin/onboarding/scan/route.ts` (emit site), `lib/adminAlerts/upsertAdminAlert.ts` (`AdminAlertCode` union), `lib/messages/catalog.ts`, `lib/messages/__generated__/spec-codes.ts` (generated), `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 row).
**Tests:** `tests/messages/adminAlertsRegistry.ts`, `tests/messages/_metaAdminAlertCatalog.test.ts` (write-site + lifecycle), route emit test (new), Step2/Step1 component tests (new/extended).
**No:** migrations, schema-manifest, advisory-lock topology, `alertActions.ts`, `runOnboardingScan.ts` (emit moved to route), parser, crew route.
