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
/** A stub the preview route can actually serve: a TRUSTED legacy per-entry URL
 *  (untrusted string contentUrls 404 at the route — the predicate must agree),
 *  or an XLSX-media entry addressable by fingerprint (fingerprint null =
 *  restage-only, lib/parser/types.ts:258-262 — not servable). */
export function hasStagedPreviewSource(stub: EmbeddedImageStub): boolean {
  // Mirrors the route's branch order: a string contentUrl is AUTHORITATIVE
  // (untrusted → not servable, even if a media pair coexists on a corrupt
  // stub); the media arm applies only when contentUrl is null/absent.
  if (typeof stub.contentUrl === "string") return isTrustedDiagramContentUrl(stub.contentUrl);
  return typeof stub.mediaPartName === "string" && typeof stub.embeddedFingerprint === "string";
}
```

The route's legacy path KEEPS its own explicit `isTrustedDiagramContentUrl` check (defense in depth; behavior identical) — the predicate folding the trust check in is what makes the tile and the route agree on every stub, including untrusted-string `contentUrl` stubs (tile: placeholder without mounting the `<img>`; route: 404, zero fetches).

### A3 Route changes (`.../staged-diagram/.../route.ts`)

- Replace lines 147-148. After the mime allowlist (line 145, unchanged):
  - `contentUrl` is a string → existing path byte-for-byte: `isTrustedDiagramContentUrl` check then fetch (lines 149-161 unchanged).
  - else if `hasStagedPreviewSource(stub)` → media path: fetch via the injected `fetchImageBytes` whose DEFAULT wires `snapshotFetchEmbeddedImageBytesTimed(stub, { fetchXlsxBytes })` with `fetchXlsxBytes = () => fetchCurrentSheetXlsxBytes(driveFileId, {})` (`lib/drive/fetch.ts:510-514`; default Drive client resolved inside).
  - else → `jsonError(404)` (fingerprint null / no media part — same fail-soft posture).
- Deps seam: `StagedDiagramRouteDeps.fetchImageBytes` signature becomes `(stub: EmbeddedImageStub, ctx: { driveFileId: string }) => Promise<SnapshotAssetBytes | null>` so the default can construct `fetchXlsxBytes` from the VALIDATED route param. All existing injected-test call sites update mechanically. The default implementation is a NAMED EXPORT of the route module (e.g. `defaultStagedDiagramFetchImageBytes`) — not an inline closure — so T-A3 can exercise the real default wiring with only the Drive network edge module-mocked.
- Error posture unchanged: helper `null`/throw → 404 `{ok:false}` no-code (lines 154-162 pattern); `findMediaByFingerprint` returns `null` for null fingerprint or no match (`lib/drive/embeddedObjects.ts:146-152`), which the same mapping absorbs.
- **Trust boundary (stated precisely; do not relitigate, §N):** the media path performs NO fetch to any URL derived from the untrusted `parse_result` JSONB. The helper's media branch never touches `entry.contentUrl` (it is null by definition; `defaultSnapshotAssetsForApply.ts:48-58`) — its only outbound requests are made by `fetchCurrentSheetXlsxBytes` for the VALIDATED route param `driveFileId` (`DRIVE_FILE_ID_PATTERN`, `route.ts:25,98`; row-matched against `pending_syncs` + active-session guard, `route.ts:111-125`, before any Drive call): (a) TWO `files.get` metadata reads via the authenticated googleapis client — the before-export read (`lib/drive/fetch.ts:515-520`) and the after-export binding-token re-check (`lib/drive/fetch.ts:537-542`) — and (b) the xlsx `exportLinks` URL RETURNED BY the before-read's Drive metadata response (`lib/drive/fetch.ts:521-527`), fetched with the bearer token (`lib/drive/fetch.ts:276-279,530-535`). The `exportLinks` destination is Google-API-provided (server-to-server response for a validated file id), NOT attacker-influenceable JSONB — the same trust class the Apply snapshot pipeline (`defaultSnapshotAssetsForApply.ts:136-138`) and asset recovery have relied on since the helper shipped. No new host assertion is added for it: hardening the export-URL destination belongs in the shared `fetchXlsxExportBytes`, would change cron/Apply behavior, and is out of scope. `isTrustedDiagramContentUrl` and the legacy contentUrl path are untouched.
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

Slot state space (4 states → all 6 pairs enumerated): **P-idle** (accent "Publish this show"), **P-pending** (accent "Selecting…"), **U-idle** (quiet "Unpublish"), **U-pending** (quiet "Removing…"). The error note (`Step3ReviewModal.tsx:1111-1115`) is a separate binary surface (hidden/visible), enumerated after.

| Pair | Reachability + treatment |
|---|---|
| P-idle ↔ P-pending | forward on Publish click; backward on failure. Instant label swap both ways — deliberate (parent §H posture) |
| P-idle ↔ U-idle | forward via external `checked` settlement while no op is in flight (parent §9.2 waiter, e.g. grid-driven flip); backward on unpublish success. Instant slot swap both ways — deliberate (unchanged parent N5) |
| P-idle ↔ U-pending | forward unreachable (U-pending only enters from U-idle click); backward = unpublish success → P-idle. Instant slot swap — deliberate |
| P-pending ↔ U-idle | N/A — unreachable both ways (publish success closes the modal, `:691-694`; publish failure lands P-idle) |
| P-pending ↔ U-pending | N/A — unreachable both ways (single slot button, disabled while pending, `:1127/:1140`) |
| U-idle ↔ U-pending | forward on Unpublish click; backward on failure. Instant label swap both ways — deliberate |

Error-note surface: hidden ↔ visible — instant both ways, deliberate (unchanged parent T7b); starting ANY new op hides it (pending state clears the error, matching today's `setPublishState("pending")` behavior at `:684/:702`).

Compound transitions:

| Compound | Treatment |
|---|---|
| Error note visible + user clicks the slot button | note hides instantly at op start (above); slot enters the clicked op's pending state |
| Rescan overlay open while slot in any state | independent siblings; no interaction (overlay is out-of-flow, parent §G) |
| `checked` settlement lands while an op is pending | slot ignores `checked` until `pendingOp` clears (§B2 selection rule); on clear it renders the settled `checked` branch — instant |

Footer no-shift invariant (parent §K14) must keep holding: the slot renders exactly one `min-h-tap-min` button in every state (label width may vary; K14 pins footer HEIGHT).

---

## §C Rescan result copy — stop reporting "changed" for unchanged sheets

### C1 Root cause (verified)

`needsReview: true` is overloaded: the CLEAN + not-previously-approved branch returns it for every unapproved row (`lib/onboarding/rescanWizardSheet.ts:434-445` "fresh-unchecked semantics") — the NORMAL state of most Step-3 sheets. The button renders ANY `needsReview: true` as "Updated. This sheet changed…" without consulting the `changed` field it already receives (`components/admin/RescanSheetButton.tsx:79-83`). Separately, a demotion can carry `changed: false` by construction: `changed` compares Drive `staged_modified_time` (`rescanWizardSheet.ts:343`) while `dirty` comes from the independent parse diff (`:377-384`), so a content regression under a stable modifiedTime yields `{needsReview: true, changed: false}` — a response shape the route layer already exercises (`tests/api/rescanSheetRoute.test.ts:96-115`, mocked forwarding). Branching on `changed` alone would mislabel such demotions as "no changes." Hence D4's discriminator.

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

Two surfaces: **disclosure** ∈ {collapsed, expanded} (1 pair) and **status** ∈ {idle, pending, success, error} (`step3ReviewSections.tsx:2073-2087`; 4 states → all 6 pairs enumerated; status state persists while collapsed, it just isn't rendered).

| Pair | Reachability + treatment |
|---|---|
| collapsed ↔ expanded | trigger click, both ways. Instant mount/unmount — deliberate (parent §H posture; no height morph) |
| idle ↔ pending | forward on submit; backward N/A — unreachable (pending always resolves to success or error; no cancel) |
| idle ↔ success | N/A — unreachable both ways directly (always via pending) |
| idle ↔ error | N/A — unreachable both ways directly (always via pending) |
| pending ↔ success | forward on 2xx `ok:true`; backward on next submit (new report). Instant text swap both ways — deliberate (unchanged parent §H N7) |
| pending ↔ error | forward on failure; backward on retry submit. Instant text swap both ways — deliberate (unchanged parent N7) |
| success ↔ error | N/A — unreachable both ways directly (always via pending) |

Compound transitions:

| Compound | Treatment |
|---|---|
| collapse while status = pending | allowed; form unmounts, POST continues fire-and-forget; re-expand renders the settled status |
| collapse while status = success/error | allowed; status persists; re-expand re-renders it |
| expand at any status | instant; focus moves to textarea regardless of status |

---

## §T Test matrix

Every test names the concrete failure mode it catches. Anti-tautology: tile/section assertions query the specific `data-testid`, never the container that also renders sibling copy.

Each row is classed:

- **[BUG]** — reproduces a shipped operator-visible defect; MUST fail against the current implementation: T-A1, T-A3, T-A5, T-B1, T-C1, T-C3 (the S1 row), T-D1, T-D3.
- **[NEW]** — specifies behavior this change introduces; fails pre-fix only because the surface does not exist yet (missing export/field/toggle), which is ordinary TDD red, not a defect reproduction: T-A4 (`hasStagedPreviewSource` does not exist yet), T-C2 (`mapResult` does not forward `demoted` yet), T-D2 (existing report tests mechanically gain an expand-first step once the toggle exists).
- **[PIN]** — same OBSERVABLE behavior before and after (the fix must not change it), even where the implementing branch differs: T-A2 (media stubs 404 today via the `contentUrl == null` gate and 404 after via the servability gate for null-fingerprint/missing-part/helper-null/helper-throw shapes), T-B2 (extends the existing publish-reject test at `Step3ReviewModal.test.tsx:600-621` into the optimistic-flip harness rather than duplicating it).

| ID | Where | Asserts | Failure mode caught |
|---|---|---|---|
| T-A1 | `tests/api/staged-diagram-route.test.ts` | media stub (contentUrl null, mediaPartName + string fingerprint) → 200, body bytes = injected fixture bytes, Content-Type = stub.mimeType | route still 404s XLSX-media stubs (the shipped bug) |
| T-A2 | same | fingerprint `null` → 404; mediaPartName absent → 404; helper resolves null → 404; helper throws → 404 | fail-soft regression / restage-only stubs served |
| T-A3 | same | DEFAULT-path wiring, no `fetchImageBytes` injection: `vi.mock("@/lib/drive/fetch")` replaces ONLY `fetchCurrentSheetXlsxBytes` (returning `tests/fixtures/diagrams/embedded-sample.xlsx` bytes — exact mock + fixture pattern precedent at `tests/sync/snapshotAssetsXlsxMedia.test.ts:7-37`); a media stub whose `mediaPartName`/`embeddedFingerprint` come from `extractEmbeddedObjects(fixture)` → route returns 200 with the exact DIAGRAMS media-part bytes, AND `fetchCurrentSheetXlsxBytes` was called with the route-param driveFileId. Separately: legacy contentUrl path byte-unchanged (untrusted URL still 404s, zero fetches) | the shipped bug itself — default path never wires `fetchXlsxBytes` (`route.ts:78-80` + `defaultSnapshotAssetsForApply.ts:52` return null); wrong id passed to the export fetch; trust-boundary regression |
| T-A4 | `tests/admin/stagedDiagramGuards.test.ts` | `hasStagedPreviewSource` truth table (TRUSTED string contentUrl → true; UNTRUSTED string contentUrl, e.g. `https://google.com.evil.net/x` → false; UNTRUSTED string contentUrl WITH a valid media pair coexisting → false, contentUrl is authoritative; null contentUrl + media pair → true; null fingerprint / missing part / malformed types → false) + `isRenderableDiagramStub` rejects non-string `mediaPartName`, non-(absent\|null\|string) `embeddedFingerprint` | route and tile disagreeing on servability (incl. untrusted-contentUrl and corrupt mixed-shape stubs); unguarded JSONB dereference |
| T-A5 | `tests/components/admin/wizard/step3ReviewSections.test.tsx` | media stub renders `<img>` (tile testid), not placeholder; `embeddedFingerprint: null` stub renders placeholder; both still count in the summary line | tile pre-fails servable stubs (the shipped client bug) |
| T-B1 | `tests/components/admin/wizard/Step3ReviewModal.test.tsx` — a STATEFUL wrapper reproducing the card contract: its `onRequestSetChecked(next)` synchronously re-renders the modal with `checked = next` (the optimistic flip, `Step3SheetCard.tsx:289-292`) and returns a still-unresolved deferred | click Publish → AFTER the wrapper's optimistic flip to `checked=true`, while the deferred is unresolved, the slot button (testid `…-review-publish`) has label "Selecting…" and the ACCENT class; resolve true → `onClose`. Click Unpublish (start `checked=true`) → after flip to false, pending label "Removing…" with the quiet class; resolve true → slot label "Publish this show". This test MUST FAIL against the current implementation (which renders the flipped branch's label — the existing static-prop pending tests at `Step3ReviewModal.test.tsx:624-635,717-724` cannot catch this and are superseded/extended, not duplicated) | swapped labels/styling mid-flight (the reported bug); a fix that derives the label from `checked` again |
| T-B2 | same | publish rejects → error note visible, slot back to "Publish this show", not stuck pending | pendingOp leak on failure paths |
| T-C1 | `tests/onboarding/rescanWizardSheet.db.test.ts` (+ Flow-B file if it asserts the shape) | DIRTY branch returns `demoted: true`; clean re-stamp and clean-unapproved return `demoted: false` | discriminator mis-set at source |
| T-C2 | `tests/api/rescanSheetRoute.test.ts` | `mapResult` forwards `demoted` on `updated` | field dropped at the route boundary |
| T-C3 | `tests/components/admin/RescanSheetButton.test.tsx` (existing needsReview case at `:110-120` updates to the truth table) | copy truth table §C3 rows 1–4 verbatim (incl. `demoted:true, changed:false` → "changed" copy; `demoted:false, changed:false` → S1); `!needsReview` rows unchanged | the false positive itself; demotion mislabeled "no changes" |
| T-D1 | `step3ReviewSections.test.tsx` | default render: toggle present `aria-expanded="false"`, textarea/testid ABSENT; click → form present, textarea focused (`waitFor`); type draft, collapse, re-expand → draft preserved | disclosure missing, focus lost, draft wiped |
| T-D2 | existing report-section tests | updated to expand first (mechanical) | a submit-flow regression hiding behind the disclosure (the pre-existing form assertions keep their teeth once the form is gated) |
| T-D3 | `step3ReviewSections.test.tsx` | status survives collapse: (a) submit to success, collapse, re-expand → status line still "Sent — thanks…"; (b) submit with a DEFERRED fetch, collapse while pending, resolve success, re-expand → success status rendered (and sessionStorage key rotated) | `status`/submit state moved into the conditionally-mounted subtree (wiped on collapse); pending POST orphaned by collapse |

Real-browser (Playwright, existing step3-review-modal e2e harness): extend the interactions spec with ONE scenario — publish-pending label assertion under a real deferred network stub — only if the harness already stubs publish-intent; otherwise T-B1's jsdom deferred-promise coverage is sufficient (no layout/scroll physics involved; §K11-class frame sampling not required for a label swap). K14 footer no-shift and existing e2e suites must stay green unmodified.

---

## §N Do not relitigate

- **Read-only route, no advisory lock** — parent spec §B1 ratified; `route.ts:11-17`.
- **404-no-code posture** for all route failures — `route.ts:59-62` (consumer is `<img>` onError).
- **Media-path trust boundary**: no JSONB-derived URL is fetched; the bearer token's only media-path destinations are the authenticated Drive `files.get` reads (before + after-export binding-token re-check) for the validated route param and the Google-API-returned `exportLinks` URL — the Apply/recovery pipeline's existing trust class (§A3, with citations). No new host assertion on the export URL; that hardening belongs in the shared `fetchXlsxExportBytes` and is out of scope.
- **Per-request workbook export cost** — accepted per D6.
- **`needsReview` semantics at `rescanWizardSheet.ts:445`** (fresh-unchecked) are UNCHANGED — §C is presentational plus a response-only discriminator. No approval/manifest behavior changes.
- **Stacked rescan placement byte-parity**: the §C copy change alters `resultFor` OUTPUT (both placements equally); the byte-pinned STACKED MARKUP/classes are untouched. Tests pinning the old false-positive string update to the truth table — that is the point of the change, not drift.
- **Parent §C2/§H N5 amendment** is ratified in §B2 of this spec.
- **No §12.4 changes**: S1/S2 are plain-English inline UI copy in the same style as the existing `resultFor` literals (`RescanSheetButton.tsx:82,87`) and section copy; no codes added or edited, so the x1/x2/catalog lockstep is not in scope.
