# Step-3 Review Modal Follow-ups, Batch 2 — Spec

Date: 2026-07-04. Parent: PR #295 (`docs/superpowers/specs/2026-07-03-step3-modal-followups.md`, merged `5d7f5386`). Four operator-reported defects/changes on the shipped Step-3 review modal. Autonomous-ship pipeline; spec/plan user-review gates waived.

Scope: NO DB schema change, NO migration, NO advisory-lock surface change, NO new §12.4 code, NO catalog edit. Two API-adjacent changes (staged-diagram route fetch path; rescan response gains one boolean), the rest is `components/` UI (Opus-only per routing rule; invariant-8 impeccable dual gate applies).

---

## §1 Resolved decisions

| # | Decision |
|---|----------|
| D1 | Diagram previews: the staged-diagram route serves XLSX-media stubs (`contentUrl: null` + `mediaPartName` + non-null `embeddedFingerprint`) by fetching the current sheet export and extracting the media part by fingerprint — the same mechanism Apply uses (`lib/sync/defaultSnapshotAssetsForApply.ts:48-58,136-138`). No snapshot storage is introduced pre-finalize. |
| D2 | Servability is decided by ONE new shared predicate `hasStagedPreviewSource` in `lib/admin/stagedDiagramGuards.ts`, consumed by both the route and `DiagramTile` gating, so the surfaces can never disagree (same pattern as `isRenderableDiagramStub`). |
| D3 | Footer publish/unpublish: while a publish-intent request is in flight, the footer slot renders the branch for the OPERATION IN FLIGHT (not the optimistically-flipped `checked` prop). Amends parent spec §C2/§H N5 ("slot follows the checked prop") — see §B. |
| D4 | Rescan copy: `RescanResult`'s `updated` arm gains `demoted: boolean` (true only from the DIRTY demotion branch). Button copy branches on `demoted || changed`; the "changed" sentence is byte-identical to today's, so only ONE new copy string is introduced. |
| D5 | Report an issue: collapsed by default behind a disclosure trigger; expanding reveals the existing form unchanged. Draft and status state persist across collapse/expand (component stays mounted; the form subtree conditionally renders). |
| D6 | Per-tile cost of D1 (one workbook export per preview request) is ACCEPTED: admin-only surface, tile cap 12 (`DIAGRAM_TILE_CAP`, `components/admin/wizard/step3ReviewSections.tsx:1766`), `Cache-Control: private, max-age=300` already set (`route.ts:21,172`). No route-side memoization. |

New copy strings (single source of truth; no em dashes, DESIGN.md UI-copy rule):

| Key | String |
|---|---|
| S1 (rescan, unchanged-needs-review) | `No changes found. This sheet still needs your review before publishing.` |
| S2 (report disclosure trigger) | `Write a report` |

No new numeric constants.

---

## §A Diagram previews for XLSX-media stubs

### A1 Root cause (verified)

Onboarding parses from XLSX bytes: `lib/sync/runOnboardingScan.ts` passes `xlsxBytes` into `enrichWithDrivePins`, whose XLSX-media branch emits every embedded image with `contentUrl: null` plus `mediaPartName`/`embeddedFingerprint` (`lib/sync/enrichWithDrivePins.ts:235-237`). Only the cron/Sheets-API branch mints a real `contentUrl`. The preview route 404s all null-`contentUrl` stubs (`app/api/admin/onboarding/staged-diagram/[wizardSessionId]/[driveFileId]/[objectId]/route.ts:147-148`), and `DiagramTile` initializes `failed = !hasContentUrl` (`step3ReviewSections.tsx:1782`), so the tile renders "Preview unavailable" without mounting the `<img>`. Net: NO wizard-staged diagram has ever previewed. Additionally, the route's default `fetchImageBytes` calls `snapshotFetchEmbeddedImageBytesTimed(stub)` with no deps (`route.ts:78-80`), and the helper's media branch requires `deps.fetchXlsxBytes` (`defaultSnapshotAssetsForApply.ts:52`) — so even without the 404 the media path was unreachable.

### A2 Guard changes (`lib/admin/stagedDiagramGuards.ts`)

1. `isRenderableDiagramStub` additionally requires: `mediaPartName` absent-or-string; `embeddedFingerprint` absent, `null`, or string. (parse_result is untrusted JSONB — every field a consumer dereferences must be shape-checked; type shape per `lib/parser/types.ts:256-258`.) Stubs failing these checks are excluded exactly like today's malformed stubs (filtered from tiles/counts at `step3ReviewSections.tsx:1837`; skipped in route matching at `route.ts:139-141`).
2. New export:

```ts
/** A stub the preview route can actually serve: a legacy per-entry URL, or an
 *  XLSX-media entry addressable by fingerprint (fingerprint null = restage-only,
 *  lib/parser/types.ts:258-262 — not servable). */
export function hasStagedPreviewSource(stub: EmbeddedImageStub): boolean {
  return (
    typeof stub.contentUrl === "string" ||
    (typeof stub.mediaPartName === "string" && typeof stub.embeddedFingerprint === "string")
  );
}
```

### A3 Route changes (`.../staged-diagram/.../route.ts`)

- Replace lines 147-148. After the mime allowlist (line 145, unchanged):
  - `contentUrl` is a string → existing path byte-for-byte: `isTrustedDiagramContentUrl` check then fetch (lines 149-161 unchanged).
  - else if `hasStagedPreviewSource(stub)` → media path: fetch via the injected `fetchImageBytes` whose DEFAULT wires `snapshotFetchEmbeddedImageBytesTimed(stub, { fetchXlsxBytes })` with `fetchXlsxBytes = () => fetchCurrentSheetXlsxBytes(driveFileId, {})` (`lib/drive/fetch.ts:510-514`; default Drive client resolved inside).
  - else → `jsonError(404)` (fingerprint null / no media part — same fail-soft posture).
- Deps seam: `StagedDiagramRouteDeps.fetchImageBytes` signature becomes `(stub: EmbeddedImageStub, ctx: { driveFileId: string }) => Promise<SnapshotAssetBytes | null>` so the default can construct `fetchXlsxBytes` from the VALIDATED route param. All existing injected-test call sites update mechanically.
- Error posture unchanged: helper `null`/throw → 404 `{ok:false}` no-code (lines 154-162 pattern); `findMediaByFingerprint` returns `null` for null fingerprint or no match (`lib/drive/embeddedObjects.ts:146-152`), which the same mapping absorbs.
- **Trust boundary (do not relitigate, §N):** the media path performs NO fetch to any JSONB-derived URL. The only outbound request is the Drive export for `driveFileId` — a route param already validated against `DRIVE_FILE_ID_PATTERN` (`route.ts:25,98`) and row-matched against `pending_syncs` + active-session guard (`route.ts:111-125`) before any Drive call. `isTrustedDiagramContentUrl` and the legacy path are untouched. The bearer token goes only to URLs constructed by `lib/drive/fetch.ts` or (legacy path) trust-checked contentUrls.
- Union normalization at line 164 already handles `Uint8Array` (media path returns `Uint8Array` from `findMediaByFingerprint`) — unchanged.

### A4 Client changes (`step3ReviewSections.tsx`)

- `DiagramTile` prop `hasContentUrl: boolean` renames to `hasPreviewSource: boolean`; `failed` initializer becomes `useState(!hasPreviewSource)` (line 1782). Everything else in the tile is unchanged.
- `DiagramsBreakdown` passes `hasPreviewSource={hasStagedPreviewSource(stub)}` (replacing line 1872), importing the predicate from `stagedDiagramGuards` (import site already exists for `isRenderableDiagramStub`/`trustedDriveFolderHref`).
- Guard conditions: a stub with `embeddedFingerprint: null` (restage-only) or missing `mediaPartName` still passes `isRenderableDiagramStub`, still counts in the summary/cap math, and renders the placeholder tile — identical to today's non-servable behavior, now with an accurate predicate.

---

## §B Footer pending-label / pending-style fix

### B1 Root cause (verified)

`Step3SheetCard`'s `requestSetChecked` flips `checked` OPTIMISTICALLY before the awaited POST resolves (`components/admin/wizard/Step3SheetCard.tsx:289-292`; the controlled path flips the parent overlay just as eagerly). The modal footer chooses which button renders from `checked` (`Step3ReviewModal.tsx:1122`) and each branch owns a pending label (`:718` "Selecting…" on the unchecked/publish CTA; `:1133` "Removing…" on the checked/unpublish button). So during publish-pending the CHECKED branch renders ("Removing…", quiet styling); during unpublish-pending the UNCHECKED branch renders ("Selecting…", accent styling). Labels AND visual treatment are both wrong mid-flight.

### B2 Contract

- New state: the in-flight operation, `pendingOp: "publish" | "unpublish" | null` (exact state shape is plan's choice — it MAY be folded into `publishState` as a discriminated union — but the rendered behavior below is the contract). `pendingOp` is set at the top of `handlePublish`/`handleUnpublish` (`Step3ReviewModal.tsx:683,701`) and cleared on every resolution path (success, error, caught throw).
- Slot selection: `const showCheckedSlot = pendingOp !== null ? pendingOp === "unpublish" : checked;` replaces the bare `checked` test at line 1122.
  - Publish in flight → accent CTA persists, label "Selecting…" (existing `:718` pair).
  - Unpublish in flight → quiet secondary persists, label "Removing…" (existing `:1133` pair).
- Post-resolution behavior UNCHANGED: publish success closes the modal (`:691-694`); unpublish success stays open and the slot follows `checked` back to the publish CTA instantly; failure shows the existing error note (`:1111-1115`) with the slot back on the pre-click branch (since `checked` settles back false/true via the card's settlement contract — parent spec §9.2 waiter queue untouched).
- `disabled`/`aria-busy` semantics unchanged (driven by the pending condition, whatever shape the state takes).
- **Amendment note:** parent spec §C2/§H N5 said "the publish ↔ unpublish slot follows the checked prop (instant)". Amended to: "…follows the checked prop EXCEPT while a publish-intent request is in flight, when it follows the operation in flight." This spec section is the ratifying text.

### B3 Transition inventory (slot states)

States: publish-idle (accent CTA), publish-pending (accent, "Selecting…"), unpublish-idle (quiet), unpublish-pending (quiet, "Removing…"), error-note-visible (either idle state + note).

| Pair | Treatment |
|---|---|
| publish-idle ↔ publish-pending | instant label swap — deliberate (matches parent §H N5/T7b posture) |
| unpublish-idle ↔ unpublish-pending | instant label swap — deliberate |
| publish-pending → unpublish-idle (unpublish never follows publish-pending; publish success closes modal) | N/A — unreachable |
| unpublish-pending → publish-idle (success) | instant slot swap — deliberate (unchanged parent N5) |
| any-pending → same-idle + error note | instant — deliberate (unchanged parent T7b) |
| Compound: rescan overlay open while slot pending | independent siblings; no interaction (overlay is out-of-flow, parent §G) |

Footer no-shift invariant (parent §K14) must keep holding: the slot renders exactly one `min-h-tap-min` button in every state (label width may vary; K14 pins footer HEIGHT).

---

## §C Rescan result copy — stop reporting "changed" for unchanged sheets

### C1 Root cause (verified)

`needsReview: true` is overloaded: the CLEAN + not-previously-approved branch returns it for every unapproved row (`lib/onboarding/rescanWizardSheet.ts:434-445` "fresh-unchecked semantics") — the NORMAL state of most Step-3 sheets. The button renders ANY `needsReview: true` as "Updated. This sheet changed…" without consulting the `changed` field it already receives (`components/admin/RescanSheetButton.tsx:79-83`). Separately, a REAL demotion can carry `changed: false` (modifiedTime-stable content regression — tested shape, `tests/api/rescanSheetRoute.test.ts` demotion case), so branching on `changed` alone would mislabel real demotions as "no changes." Hence D4's discriminator.

### C2 Changes

1. `lib/onboarding/rescanWizardSheet.ts`: the `updated` arm of `RescanResult` (`:28-29`) becomes `{ status: "updated"; needsReview: boolean; changed: boolean; demoted: boolean }`. Return sites: `:398` (DIRTY demotion) → `demoted: true`; `:431` and `:445` → `demoted: false`. No DB or behavior change — response-only.
2. `app/api/admin/onboarding/rescan-sheet/route.ts` `mapResult` (`:33-41`): forward `demoted: result.demoted` in the `updated` case.
3. `components/admin/RescanSheetButton.tsx`: `RescanResponse` `ok: true` arm (`:49`) gains `demoted: boolean`. `resultFor` (`:77-94`) `needsReview` branch becomes:

```ts
if (body.needsReview) {
  return {
    kind: "info",
    copy:
      body.demoted || body.changed
        ? "Updated. This sheet changed and needs your review before publishing."
        : "No changes found. This sheet still needs your review before publishing.",
  };
}
```

The first string is byte-identical to today's (`:82`); S1 is the only new literal. The `!needsReview` branches (`:85-88`) and all `ok: false` branches are untouched.

### C3 Copy truth table (all six `ok: true` shapes)

| needsReview | demoted | changed | Copy |
|---|---|---|---|
| true | true | true | Updated. This sheet changed and needs your review before publishing. |
| true | true | false | Updated. This sheet changed and needs your review before publishing. (content regressed; modifiedTime stable) |
| true | false | true | Updated. This sheet changed and needs your review before publishing. (edited while unapproved) |
| true | false | false | **S1** — the reported false positive, fixed |
| false | — (false) | true | Updated. Still ready to publish. (unchanged, `:87`) |
| false | — (false) | false | No changes found. (unchanged, `:87`) |

(`needsReview: false` implies `demoted: false` by construction — only `:398` sets true and it returns `needsReview: true`.)

### C4 Flag lifecycle (`demoted`)

storage: none (response-only, derived per request) | write: `rescanWizardSheet.ts:398/431/445` | read: `resultFor` via `mapResult` | effect: copy branch above. No zombie state.

---

## §D Report an issue — progressive disclosure

### D1 Contract

`ReportIssueSection` (`step3ReviewSections.tsx:1968-2092`) renders collapsed by default:

- Always rendered: the section chrome (rail entry, heading, count null — unchanged), the intro `<p>` (`:2039-2042`, unchanged copy), and a NEW disclosure trigger button — label **S2 "Write a report"**, quiet secondary treatment (same border/surface recipe as the existing submit button `:2069`), `data-testid` `wizard-step3-card-${dfid}-report-toggle`, `aria-expanded`, `aria-controls` pointing at the form container id (a `useId()` value).
- Expanded (`expanded === true`, `useState(false)`): the existing `<form>` subtree (`:2043-2089`) renders UNCHANGED — same testids, same submit flow, same status line. The trigger remains visible above it and toggles both ways.
- On expand: focus moves to the textarea (tests use `waitFor` — async focus contract). On collapse via the trigger: focus stays on the trigger (natural); the form subtree unmounts from the DOM but `draft`/`status` React state persists (component stays mounted), so re-expanding restores the draft and the last status line.
- Guard conditions: collapsing while `status.kind === "pending"` is allowed — the in-flight POST completes fire-and-forget (same posture as modal-unmount mid-flight, parent §D3); the idempotency key persists in sessionStorage so a retry after re-expand dedupes. Losing sight of the "Sent" confirmation by collapsing immediately after send is Doug-initiated and accepted.
- Rail jump to "Report an issue" scrolls to the section but does NOT auto-expand (the trigger is the first thing in view).

### D2 Transition inventory

States: collapsed, expanded (× status idle/pending/success/error inside the form — those pairs are unchanged parent §H N7 instant swaps).

| Pair | Treatment |
|---|---|
| collapsed ↔ expanded | instant mount/unmount — deliberate (matches parent §H posture; no height morph) |
| Compound: collapse while status pending | allowed; form unmounts, POST continues; re-expand shows the settled status |

---

## §T Test matrix

Every test names the concrete failure mode it catches. Anti-tautology: tile/section assertions query the specific `data-testid`, never the container that also renders sibling copy.

| ID | Where | Asserts | Failure mode caught |
|---|---|---|---|
| T-A1 | `tests/api/staged-diagram-route.test.ts` | media stub (contentUrl null, mediaPartName + string fingerprint) → 200, body bytes = injected fixture bytes, Content-Type = stub.mimeType | route still 404s XLSX-media stubs (the shipped bug) |
| T-A2 | same | fingerprint `null` → 404; mediaPartName absent → 404; helper resolves null → 404; helper throws → 404 | fail-soft regression / restage-only stubs served |
| T-A3 | same | default-deps wiring: the media path invokes the xlsx fetch with the ROUTE-PARAM driveFileId (injected `fetchImageBytes` ctx assertion) and legacy contentUrl path is byte-unchanged (trust check still 404s untrusted URL) | trust-boundary regression; deps never wired (the second shipped bug) |
| T-A4 | `tests/admin/stagedDiagramGuards.test.ts` | `hasStagedPreviewSource` truth table (string contentUrl / media pair / null fingerprint / missing part / malformed types) + `isRenderableDiagramStub` rejects non-string `mediaPartName`, non-(absent\|null\|string) `embeddedFingerprint` | route and tile disagreeing on servability; unguarded JSONB dereference |
| T-A5 | `tests/components/admin/wizard/step3ReviewSections.test.tsx` | media stub renders `<img>` (tile testid), not placeholder; `embeddedFingerprint: null` stub renders placeholder; both still count in the summary line | tile pre-fails servable stubs (the shipped client bug) |
| T-B1 | `tests/components/admin/wizard/Step3ReviewModal.test.tsx` (jsdom, deferred-promise `onRequestSetChecked`) | click Publish → while unresolved, the slot button (single testid `…-review-publish`) has label "Selecting…" and the ACCENT class; resolve true → `onClose` called. Click Unpublish → pending label "Removing…" with the quiet class; resolve true → slot label "Publish this show" | swapped labels/styling mid-flight (the reported bug) |
| T-B2 | same | publish rejects → error note visible, slot back to "Publish this show", not stuck pending | pendingOp leak on failure paths |
| T-C1 | `tests/onboarding/rescanWizardSheet.db.test.ts` (+ Flow-B file if it asserts the shape) | DIRTY branch returns `demoted: true`; clean re-stamp and clean-unapproved return `demoted: false` | discriminator mis-set at source |
| T-C2 | `tests/api/rescanSheetRoute.test.ts` | `mapResult` forwards `demoted` on `updated` | field dropped at the route boundary |
| T-C3 | `tests/components/admin/RescanSheetButton.test.tsx` (existing needsReview case at `:110-120` updates to the truth table) | copy truth table §C3 rows 1–4 verbatim (incl. `demoted:true, changed:false` → "changed" copy; `demoted:false, changed:false` → S1); `!needsReview` rows unchanged | the false positive itself; demotion mislabeled "no changes" |
| T-D1 | `step3ReviewSections.test.tsx` | default render: toggle present `aria-expanded="false"`, textarea/testid ABSENT; click → form present, textarea focused (`waitFor`); type draft, collapse, re-expand → draft preserved | disclosure missing, focus lost, draft wiped |
| T-D2 | existing report-section tests | updated to expand first (mechanical) | — |

Real-browser (Playwright, existing step3-review-modal e2e harness): extend the interactions spec with ONE scenario — publish-pending label assertion under a real deferred network stub — only if the harness already stubs publish-intent; otherwise T-B1's jsdom deferred-promise coverage is sufficient (no layout/scroll physics involved; §K11-class frame sampling not required for a label swap). K14 footer no-shift and existing e2e suites must stay green unmodified.

---

## §N Do not relitigate

- **Read-only route, no advisory lock** — parent spec §B1 ratified; `route.ts:11-17`.
- **404-no-code posture** for all route failures — `route.ts:59-62` (consumer is `<img>` onError).
- **Media-path trust boundary**: no JSONB-derived URL is fetched; export URL built from the validated route param (§A3). `isTrustedDiagramContentUrl` scope unchanged.
- **Per-request workbook export cost** — accepted per D6.
- **`needsReview` semantics at `rescanWizardSheet.ts:445`** (fresh-unchecked) are UNCHANGED — §C is presentational plus a response-only discriminator. No approval/manifest behavior changes.
- **Stacked rescan placement byte-parity**: the §C copy change alters `resultFor` OUTPUT (both placements equally); the byte-pinned STACKED MARKUP/classes are untouched. Tests pinning the old false-positive string update to the truth table — that is the point of the change, not drift.
- **Parent §C2/§H N5 amendment** is ratified in §B2 of this spec.
- **No §12.4 changes**: S1/S2 are plain-English inline UI copy in the same style as the existing `resultFor` literals (`RescanSheetButton.tsx:82,87`) and section copy; no codes added or edited, so the x1/x2/catalog lockstep is not in scope.
