# Dev-gated show-modal capture bundle

Date: 2026-07-22 · Status: draft (R1 repairs applied) · Implementer: Opus / Claude Code (UI surface)

One-click, developer-only capture of a show review modal: a screenshot of the entire modal panel (including scroll-clipped content) plus a comprehensive telemetry JSON, zipped and downloaded in the browser. Purpose: bug-report bundles — grab exactly what the developer is looking at plus the diagnostic context, without reproducing.

## 1.1 Resolved scope — do not relitigate

Ratified during the in-session brainstorm (user-approved design, 2026-07-22):

- **Purpose = bug-report bundle.** Not a visual-regression archive, not an audit trail. No server-side storage.
- **Capture tech = client DOM-to-image** of the live panel state. Server-side Playwright re-render and `getDisplayMedia` were considered and rejected (fresh render loses the buggy state; display capture is viewport-only with a share-picker prompt).
- **Save target = browser download only.** No Supabase Storage bucket, no index table, no retention policy.
- **Telemetry contents = modal data snapshot + server pull via `lib/observe/query` read-core + environment metadata.** Console ring buffer was offered and declined.
- **Both modals in scope:** published review modal (ShareHub kebab item) AND staged Step3 review modal (header icon button). User explicitly chose the two-surface scope.
- **Capture-library choice is a plan-time empirical spike** (§3.3). The spec ratifies the contract, not the library. Per the AGENTS.md empirical-spike rule, the clone-expansion mechanism is marked UNRATIFIED pending that spike; it is a bounded implementation detail behind a fixed contract, not a design-correctness vector.
- **The structured bundle never carries the share token or raw email addresses** (§4.3–§4.5). Screenshot pixels show what the developer already sees on screen and are exempt from field-level redaction (§4.5 defines the one popover-race guard). Fixed posture; do not relitigate toward "dev sees it anyway."
- **PII posture: read-core defaults (`includePii` omitted → `false`)** for every read-core call (e.g. `lib/observe/query/alerts.ts:70`), PLUS the client-side redaction pipeline of §4.3 for everything that does not pass through the read-core. No `--reveal-email`-style carve-out in v1.

## 2. Surfaces and gating

### 2.1 Developer flag plumbing

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- New client context `components/admin/dev/DeveloperFlagContext.tsx`: `DeveloperFlagProvider({ viewerIsDeveloper, children })` + `useViewerIsDeveloper(): boolean` (default `false` when no provider — fail-to-hidden).
- `app/admin/layout.tsx` already resolves `viewerIsDeveloper` via `isCurrentUserDeveloper()` in its parallel identity batch (`app/admin/layout.tsx:77`). The layout wraps its children in `DeveloperFlagProvider` with that value. No per-page prop drilling (the staged chain would otherwise be 4 layers: page → Step3ReviewWithFinalize → Step3Review → Step3SheetCard → Step3ReviewModal).
- `isCurrentUserDeveloper()` is the visibility-only fail-to-false probe (`lib/auth/requireDeveloper.ts:258`); an infra blip hides the control, never reveals it.
- Server enforcement is independent: the telemetry action calls `requireDeveloper()` (`lib/auth/requireDeveloper.ts:238`; opts omitted — `RequireDeveloperOpts.layer` is `"layout" | "page"` only, `requireDeveloper.ts:80`, and the default `"page"` is the established server-action pattern, `app/admin/dev/actions.ts:142`) as its first statement. A confirmed non-developer caller gets `forbidden()` (`requireDeveloper.ts:214`) regardless of client state.

### 2.2 Published modal surface

- Mount: a new item in the ShareHub kebab popover (`components/admin/showpage/ShareHub.tsx`, popover `data-testid="share-hub-popover"`), in the "Show" section, rendered only when `useViewerIsDeveloper()` is true.
- Shape: full-width menu-row button matching the existing popover row idiom (`flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 text-sm font-medium` — same classes as the mailto rows at `ShareHub.tsx:455`), lucide `Camera` icon, `data-testid="share-hub-dev-capture"`. Label text is exactly `Capture debug bundle`.
- On activate: close the kebab popover first (its overlay would occlude the panel in the shot), wait two animation frames, then run the capture flow (§3–§6) against the published panel element `[data-review-modal-panel]` (attribute written by the shell from `dataAttrPrefix="review-modal"` — consumer passes it at `components/admin/showpage/PublishedReviewModal.tsx:657`, shell writes it at `components/admin/review/ReviewModalShell.tsx:621`).
- **Busy lockout (share-token race guard, §4.5):** while the capture flow is `busy`, the ShareHub root suppresses BOTH popover toggles — the share-link button and the kebab render `aria-disabled="true"` and their `toggle(...)` calls no-op — so the popover (which prints the share URL, `ShareHub.tsx:435`) cannot be reopened into the frame before the clone is taken. Lockout spans activation through settle (success or error).
- The capture flow's busy/error surface for this mount is a transient status line in the ShareHub root (§7).

### 2.3 Staged (Step3) modal surface

- Mount: dev-only icon button in the Step3 review modal header actions row (`components/admin/wizard/Step3ReviewModal.tsx:417-448`), between the status chip and `ModalCloseButton`, rendered only when `useViewerIsDeveloper()` is true.
- Shape: 44px icon button matching the sheet-link anchor idiom at `Step3ReviewModal.tsx:393` (`inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle … focus-visible:ring-2`), lucide `Camera` icon, `aria-label="Capture debug bundle"`, `data-testid={`wizard-step3-card-${dfid}-dev-capture`}`.
- On activate: run the capture flow against the staged panel element `[data-step3-review-panel]` (`dataAttrPrefix="step3-review"`, same shell line). No popover to close and no share URL exists on this surface (staged shows have no share link), so no lockout beyond the button's own busy state.

### 2.4 Shared control module

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
Both mounts delegate to one client module `components/admin/dev/DevCaptureControl.tsx` exporting:

- `useDevCapture(opts): { state, run }` — the state machine (§7) and orchestration (capture → telemetry action → zip → download). `opts` carries `{ target: () => HTMLElement | null, request: CaptureTelemetryRequest, clientSnapshot: () => unknown, filenameSeed: string }`.
- The two mount-specific buttons live with their host components (ShareHub row, Step3 header icon) and call `run()`; presentation stays host-owned so each surface keeps its own idiom.

## 3. Screenshot capture contract

### 3.1 Contract (ratified)

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
`lib/devcapture/captureElement.ts` (client-only module):

```
captureElementPng(el: HTMLElement): Promise<Blob>
```

- Input: the live shell panel element. Output: a PNG blob.
- MUST include the panel's full content height: content clipped by the panel's `max-h-[85vh]`/`sm:max-h-[80vh]` (`ReviewModalShell.tsx:623`) AND content clipped inside the consumer body's own inner scroll panes appears fully in the image, as if the panel had no height cap and every inner scroll pane were expanded. The consumer body mounts directly in the panel (`ReviewModalShell.tsx:688-696`); its inner scroll panes are the section-rail (`components/admin/review/ShowReviewSurface.tsx:842`, `overflow-y-auto`) and the main content pane (`ShowReviewSurface.tsx:997`, `overflow-y-auto`). Because inner-pane content does NOT contribute to the panel's own `scrollHeight`, no `scrollHeight`-based inequality can prove this contract — proof is sentinel-based (§3.4).
- MUST operate on a detached clone; the live DOM's geometry, scroll positions, and styles are never mutated (no visible flicker, no scroll jump).
- MUST include popovers/overlays currently portaled inside the panel (they are positioned inside the panel box by construction — `PopoverHostContext` provider wraps the panel interior, `ReviewModalShell.tsx:625`).
- Cross-origin images that taint the raster: rendered as-is when the library supports it, else they may appear blank; a tainted-canvas failure is surfaced as a capture error (§7), never a silent empty download.
- Pixel scale: `devicePixelRatio` capped at 2 (the DPR cap; distinct from the two-animation-frame popover-close wait in §2.2 — see §10).

### 3.2 Failure semantics

Rejects with an `Error`; the hook maps any rejection to the `error` state (§7). No retry loop.

### 3.3 UNRATIFIED — library + expansion mechanism (plan-time spike)

Candidates: `html-to-image`, `modern-screenshot`, `html2canvas`. The implementation plan MUST start with a spike task that captures the real published modal (dev server, seeded show) with each candidate and picks by: (a) full-height clone expansion achievable — clone-side style overrides lifting `max-h`/`overflow` on the panel AND on the inner scroll panes cited in §3.1, (b) fidelity on this repo's CSS (Tailwind v4 tokens, `shadow-(--shadow-tile)`, `overflow-clip`, rounded corners), (c) bundle cost. The chosen library and the exact clone-override list are recorded in the plan; the spec deliberately does not assert them.

### 3.4 Proof of full-content capture (sentinel-based)

The spike harness (and the real-browser test it becomes, §9.6) seeds the modal so the main content pane (`ShowReviewSurface.tsx:997`) overflows, with a solid-color sentinel block (a fixed-size div of a color unused by the design tokens) as the LAST element of the scrolled-out content. Acceptance: the captured PNG contains ≥ 1 pixel of the sentinel color (decoded pixel scan), proving inner-pane expansion end-to-end. A secondary sanity check may compare output height against the clone's expanded height, but the sentinel scan is the proof; a `panel.scrollHeight` inequality is explicitly NOT accepted (§3.1 rationale).

## 4. Telemetry JSON schema

The telemetry JSON file (zip entry name per §6) is a single object with exactly three top-level keys (`meta`, `clientSnapshot`, `server`):

```jsonc
{
  "meta": {
    "capturedAt": "<ISO 8601>",
    "commitSha": "<string | null>",      // from the server section when kind:"ok", else null (§4.2)
    "url": "<location.origin + location.pathname>",   // query/hash deliberately stripped (§4.5)
    "userAgent": "<navigator.userAgent>",
    "viewport": { "w": 0, "h": 0, "dpr": 1 },   // non-finite values normalized to 0 (§7.3)
    "modalKind": "published" | "staged",
    "showId": "<uuid | null>",           // published; explicitly null when modalKind is "staged"
    "driveFileId": "<string | null>",    // staged; explicitly null when modalKind is "published"
    "panelRect": { "w": 0, "h": 0 }      // getBoundingClientRect of the captured panel; non-finite → 0
  },
  "clientSnapshot": { /* §4.3 */ },
  "server": { /* §4.2; or { "kind": "unavailable", "reason": "<enum, §4.5>" } */ }
}
```

### 4.2 Server section (action result, §5)

- `published`: `{ kind: "ok", events, alerts, syncLog, commitSha }` where
  - `events` = `queryEvents({ showId, sinceHours: 168 })` (`lib/observe/query/events.ts:101`; `AppEventFilters.showId` and `sinceHours` applied at `events.ts:86-90`) — one read-core page, `PAGE_SIZE = 100` (`lib/admin/telemetryTypes.ts:1`), newest first. The bundle embeds `{ rows, truncated }` with `truncated` = the read-core's `hasMore` (`events.ts:113`); `nextCursor` is discarded (no pagination in a bundle).
  - `alerts` = `queryAlerts({ openOnly: true, limit: 100, showIdOrGlobal: showId })` — `showIdOrGlobal` is a NEW optional `AlertFilters` field (extends `lib/observe/query/types.ts:17-22`) implemented in `lib/observe/query/alerts.ts` as a PostgREST `.or("show_id.eq.<id>,show_id.is.null")` filter, so the page is the newest 100 MATCHING rows — server-side filtering, no post-cap starvation (global alerts kept deliberately: cron/system faults are bug-relevant context). Embedded as `{ rows, truncated: rows.length === 100 }`.
  - `syncLog` = `querySyncLog({ showId, sinceHours: 168, limit: 50 })` (`lib/observe/query/syncLog.ts:20`; `SyncLogFilters.showId` exists — `types.ts:121-128`). Embedded as `{ rows, truncated: rows.length === 50 }`.
- `staged`: `{ kind: "ok", staged, failures, commitSha }` where
  - `staged` = `queryStagedParses({ driveFileId, sinceHours: 168, limit: 10 })` (`lib/observe/query/staged.ts:25`; `StagedFilters.driveFileId` — `types.ts:56-63`). Embedded as `{ rows, truncated: rows.length === 10 }`.
  - `failures` = `queryIngestFailures({ sinceHours: 168, limit: 100, driveFileId })` — `driveFileId` is a NEW optional `FailureFilters` field (extends `types.ts:82-88`) implemented as `.eq("drive_file_id", …)`, same no-starvation rationale as alerts. Embedded as `{ rows, truncated: rows.length === 100 }`.
- Nested warning arrays inside rows (`StagedRow.warnings` — `types.ts:75`; `FailureRow.lastWarnings` — `types.ts:99`): each capped at the first 200 entries with a sibling `warningsTruncated: true` marker when the cap bites.
- Any read-core sub-result of `kind: "infra_error"` is embedded verbatim in place of that sub-object — partial bundles beat none; the action still returns `kind: "ok"` if the gate passed.
- `includePii` omitted everywhere (defaults false). Redaction provenance: `queryAlerts` identity strings pass through the read-core sanitizer with its always-on token-like redaction (AGENTS.md "Redaction posture"); `app_events.context` is redaction-guaranteed at write time (same section); staged/syncLog/failure identity strings pass through `sanitizeIdentityString`/`serializeWarningArray` (`staged.ts:59-62`, `syncLog.ts:43-46`, `failures.ts:50-57`). The client-side token sweep of §4.5 additionally covers the whole document.
- Read-core filter extensions (`showIdOrGlobal`, `driveFileId`) stay `.select(...)`-only and inside `lib/observe/query/**`, so the read-only pin `tests/observe/_metaReadOnlyQueryCore.test.ts` continues to cover them; read-core never imports `lib/log` (same pin). The observe CLI gains no new flags (internal filter fields only; the CLI fail-closed flag contract is untouched).

### 4.3 Client snapshot (allowlist, ratified here — not deferred)

`clientSnapshot` is built by an explicit per-surface allowlist projection; anything not listed is absent. Caps: every top-level array in the snapshot is capped at its stated limit with a sibling `<name>Truncated: true` marker when the cap bites.

- **Published** (from `PublishedReviewModalProps`, `components/admin/showpage/PublishedReviewModal.tsx:77-123`): `slug`, `showId`, `title`, `archived`, `published`, `finalizeOwned`, `isLive`, `lastSyncedAt`, `lastCheckedAt`, `lastSyncStatus`, `alertsDegraded`, `alertId`, `openSheetHref`, `attentionItems` (cap 50), `feed` (cap 50), `bySection`, `data`. EXCLUDED (never serialized): `crewEmails` (raw emails), `pickerCrew` (roster identity rows), every function prop, `now` (redundant with `capturedAt`).
- **Staged** (from the Step3 props, `components/admin/wizard/Step3ReviewModal.tsx:120-143`): `data` (the `StagedSectionData`), `checked`, `isDirtyRescan`, `isPublishRunActive`, plus `resolution` reduced to its scalar flags (no callbacks). EXCLUDED: every function prop.
- Serialization pipeline (order fixed): (1) allowlist projection; (2) `JSON.stringify` with a replacer returning `undefined` for function values — note JSON semantics: an `undefined`-valued OBJECT property is dropped, an `undefined` ARRAY element serializes as `null`; both are acceptable and documented here; (3) email redaction — every RFC-5322-shaped substring in the serialized string is replaced with `[email redacted]` (this scrubs any email embedded inside `data`/`bySection`/`feed` content without field-by-field knowledge); (4) the document-wide token sweep of §4.5.
- A throw anywhere in steps 1–3 degrades that surface's snapshot to `{ "kind": "unserializable", "reason": "serialize_threw" }` (fixed enum string — never the exception message, §4.5); capture proceeds.

### 4.4 Secret exclusion (hard rule)

The structured bundle (telemetry JSON) never carries the share token string: the allowlist (§4.3) never selects the share URL, token, or `mailto:` hrefs; `meta.url` strips query and hash; the token sweep (§4.5) backstops the whole document. The screenshot is pixels of what the developer already sees; the only on-screen element that prints the share URL is the ShareHub popover (`ShareHub.tsx:435`), which is closed before capture and cannot reopen during it (busy lockout, §2.2) — closing the race the popover would otherwise create. This is the same posture as invariant 10's `rotateShareToken` example: structured data never carries the secret.

### 4.5 Document-wide guards

- **Token sweep:** after assembly, the full serialized telemetry JSON string passes a token-like redaction (contiguous hex or base64-alphabet runs ≥ 24 chars → `[redacted]`), mirroring the read-core's always-on rule (AGENTS.md "Redaction posture"). Applied client-side in the bundle module (§6) as the last step before zipping.
- **Fixed-enum reasons:** every `reason` field in the bundle comes from a closed set — `"serialize_threw"`, `"action_failed"`, `"network_error"`, `"bad_request"` — never a raw exception message (exception objects go to `console.error` only).
- **URL stripping:** `meta.url` is `location.origin + location.pathname`; query and hash never enter the bundle.

## 5. Telemetry server action

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- New file `app/admin/_devCaptureAction.ts`, `"use server"`, single export `captureShowTelemetry(request: CaptureTelemetryRequest): Promise<CaptureTelemetryResult>`.
- NOT under `app/admin/dev/` — the build gate `scripts/with-admin-dev-flag.mjs` renames an enumerated `FILES` list under `app/admin/dev/` (including `actions.ts` and the dev pages — `with-admin-dev-flag.mjs:43-60`) to `.disabled` when `ADMIN_DEV_PANEL_ENABLED` is unset (`with-admin-dev-flag.mjs:6-12`); anything in that list is absent from production builds, and this feature must work on production deploys for developer users. (File-list gating, not directory gating; the conclusion is the same — do not join that list.)
- Execution order (fixed): (1) `await requireDeveloper()` (§2.1 citation) — this itself performs Supabase session/RPC reads; (2) request validation; (3) read-core pulls. A developer call with an invalid request returns `{ kind: "bad_request" }` after the gate but WITHOUT any telemetry read-core access (the gate's own auth reads are unavoidable and out of scope of that claim).
- Request: `{ kind: "published", showId: string } | { kind: "staged", driveFileId: string }`. Validation fail-closed: `kind: "published"` requires a UUID-shaped `showId`; `kind: "staged"` requires a non-empty `driveFileId` of at most 128 chars; anything else → `bad_request`.
- Then the read-core pulls per §4.2, plus `commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null` (same source as `app/api/health/route.ts:8`). `meta.commitSha` in the bundle copies this value when the server section is `kind: "ok"` and is `null` otherwise.
- Result union: `{ kind: "ok", ... } | { kind: "bad_request" }`. Gate failures never return — `requireDeveloper` redirects or `forbidden()`s (`requireDeveloper.ts:214`).
- Read-only: no Supabase write builder, no `.rpc(` of its own (the gate's internals are the gate's), no `lib/log` import (reading telemetry never writes it). Consequence: NO advisory lock (invariant 2 governs mutations only; this surface mutates nothing).

## 6. Zip and download

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- `lib/devcapture/bundle.ts` (client): `zipSync` from `fflate` (already a dependency, `package.json:71`) over `{ "screenshot.png": <png bytes>, "telemetry.json": <utf8 bytes> }`, store-level compression for the PNG (already compressed), default for the JSON.
- Download via object-URL anchor click (`URL.createObjectURL` + `a.download`), revoked after click. First in-app download surface; no shared helper exists to reuse (verified: zero `createObjectURL` matches under `app/`, `components/`, `lib/`).
- Filename: `dev-capture-<seed>-<stamp>.zip`. `seed` = show slug (published) or `dfid` (staged), lowercased, `[^a-z0-9-]` stripped, then truncated to 64 chars; if the sanitized seed is empty, the literal `show` is used. `stamp` = `YYYYMMDD-HHmmss` local time.

## 7. UX states, guard conditions, transition inventory

### 7.1 States

`idle → busy → idle | error`; `error → busy` (re-run) or `error → idle` (modal closed). Single in-flight guard: `run()` while `busy` is a no-op AND every entry control is `aria-disabled` while busy (§2.2 lockout; staged icon `disabled`), so no control remains visibly actionable while inert.

- Published mount: busy/error surface is a small transient status line rendered by the ShareHub host in its root (which stays mounted), `role="status"`, copy below. Error auto-clears after 6 s or on next `run()`; the timer is cleared in the owning effect's unmount cleanup (§7.3).
- Staged mount: the icon button itself carries the state — `disabled` + spinner glyph while `busy` (`aria-disabled`, `aria-label` unchanged); on `error` an adjacent `role="status"` text node shows the error copy with the same 6 s auto-clear.

### 7.2 Copy (user-visible, dev audience)

- Busy: `Capturing the modal…`
- Error: `Capture failed. Details are in the browser console.` (Full error object goes to `console.error`.) No raw §12.4 codes are involved anywhere on this surface — nothing to route through `lib/messages/lookup.ts`; the strings above are static copy, not code-derived (invariant 5 satisfied vacuously). No em-dashes in copy.

### 7.3 Guard conditions

| Input | null/empty/invalid | Behavior |
| --- | --- | --- |
| `useViewerIsDeveloper()` | false or no provider | control not rendered at all |
| `target()` | returns `null` (panel unmounted mid-flow) | error state, no capture attempt |
| `clientSnapshot()` | throws / unserializable | `{ kind: "unserializable", reason: "serialize_threw" }` embedded, capture proceeds |
| action result | `bad_request` / rejected promise | `server: { kind: "unavailable", reason: "bad_request" \| "action_failed" \| "network_error" }` embedded, capture proceeds; `meta.commitSha` = null |
| screenshot util | rejects | error state — screenshot is the point; no JSON-only bundle |
| viewport / panelRect measurement | non-finite (NaN/Infinity) | normalized to 0 |
| error auto-clear timer | unmount before 6 s | cleared in effect cleanup; no late setState |
| modal closes mid-`busy` | component unmounts | in-flight work aborted/ignored via mounted-ref guard; no download fires after unmount |

Sequencing: screenshot capture and the telemetry action run concurrently; the bundle assembles when both settle. Screenshot rejection = whole-run error (even if telemetry succeeded); telemetry rejection alone does not fail the run.

### 7.4 Transition inventory

| Pair | Treatment |
| --- | --- |
| idle → busy | instant — no animation (spinner appears; entry controls disable) |
| busy → idle (success) | instant — no animation (download fires; controls re-enable) |
| busy → error | instant — status text appears, no animation |
| error → idle (auto-clear/close) | instant |
| error → busy (re-run) | instant |
| compound: modal close during busy | unmount; mounted-ref guard suppresses late setState, timer cleanup runs, no download |
| compound: kebab/share toggle pressed during busy | no-op — both toggles `aria-disabled` while busy (§2.2); popover cannot open |
| compound: capture row pressed during busy | unreachable (popover closed + toggles locked); `run()` re-entry guard is the belt-and-suspenders |

No `AnimatePresence`, no exit animations anywhere in this feature.

### 7.5 Dimensional invariants

None — no fixed-dimension parent with flex/grid children is introduced. The staged icon button is a `size-tap-min` leaf in an existing shrink-0 row; the ShareHub row matches existing row classes.

## 8. Invariant compliance matrix

| AGENTS.md invariant | Disposition |
| --- | --- |
| 1 TDD per task | plan enforces |
| 2 advisory lock | N/A — no mutation of locked tables; action is read-only |
| 3 email canonicalization | N/A — no raw email input; snapshot email-redaction (§4.3) is output scrubbing, not boundary intake |
| 4 no global sync cursor | N/A |
| 5 no raw codes in UI | vacuous — static copy only (§7.2) |
| 6 commit per task | plan enforces |
| 8 impeccable dual-gate | REQUIRED — diff touches `components/` and `app/admin/layout.tsx` |
| 9 Supabase call-boundary | action performs no direct Supabase calls; all DB access via read-core. The read-core filter extensions (§4.2) are new filter branches inside already-compliant registered functions (`queryAlerts`, `queryIngestFailures`), not new call sites |
| 10 mutation-surface observability | `captureShowTelemetry` is a `"use server"` export with a `require`-gate → admin surface → needs an `ADMIN_SURFACE_EXEMPTIONS` row `{ file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry", kind: "read-only" }` (row type `tests/log/mutationSurface/exemptions.ts:46`; read-only semantics — no write-builder, no `.rpc(` — `exemptions.ts:56`; precedent read-only rows `exemptions.ts:75`). The exemption's read-only verification must actually hold — see §5 |
| 11 worktree isolation | this run lives in `FX-worktrees/dev-modal-capture` |

DB: no migrations, no schema change, no RPC — validation-parity gate untouched.

## 9. Testing

Meta-test inventory (mandatory declaration):

- EXTENDS `tests/log/mutationSurface/exemptions.ts` — one `ADMIN_SURFACE_EXEMPTIONS` row (§8). The discovery meta-test `tests/log/_metaMutationSurfaceObservability.test.ts` fails-by-default on the new action until the row lands; its read-only shape check is the structural proof.
- COVERED-BY (no edit expected): `tests/observe/_metaReadOnlyQueryCore.test.ts` continues to pin the extended read-core files as select-only / no-`lib/log` (§4.2).
- No other registry applies: no new Supabase call sites (`_metaInfraContract` untouched), no sentinel text, no admin-alert code, no advisory lock, no §12.4 code.

Unit/integration (jsdom unless stated):

1. Action gating: non-developer call is rejected by the gate (developer-identity test seams already exist — `tests/auth/requireDeveloper.test.ts`, `tests/auth/developerGatingContract.test.ts`, and the `parseAndStage` precedent `tests/admin/parseAndStage-auth.test.ts`); developer call with bad request shapes returns `bad_request` with zero read-core invocations (read-core mocked, assert not called); good request assembles §4.2 shape from mocked read-core, including per-sub-result `infra_error` embedding, `truncated` flags at each boundary (length == limit and length < limit cases), and nested-warnings 200-cap with marker. Failure mode caught: gate bypass, filter drift, silent truncation.
2. Read-core filter extensions: `showIdOrGlobal` builds the show-or-global `.or(...)` clause exactly as §4.2 states; `FailureFilters.driveFileId` builds `.eq` — asserted against the mocked builder's received calls (data-source assertion). Failure mode: post-cap starvation regression (filter silently dropped → global page returns).
3. Snapshot pipeline: allowlist excludes `crewEmails`/`pickerCrew`/functions (fixture props include a function and a `crewEmails` array; assert output JSON string contains neither); email redaction (fixture embeds an email deep inside `data`; assert `[email redacted]` and no `@`-form survives); token sweep (fixture embeds a 32-char hex run; assert absent from output). All assertions run against the final serialized string — the data actually zipped.
4. Zip assembly: unzip (fflate `unzipSync`) the produced bytes and assert exactly two entries with the exact names and byte-identical payloads — derived from the input fixtures, not hardcoded lengths.
5. Hook state machine: busy no-reentry; screenshot-reject ⇒ error even when telemetry resolved; telemetry-reject ⇒ success with `unavailable` + fixed-enum reason embedded and `meta.commitSha` null; unmount mid-busy fires no download (spy on the anchor-click sink) and clears the 6 s timer (fake timers).
6. Capture util: covered by the spike's real-browser harness (Playwright), not jsdom — jsdom has no layout/canvas. Proof is the §3.4 sentinel-pixel scan (seeded overflow in the `ShowReviewSurface.tsx:997` pane; sentinel color found in decoded PNG). Expected geometry derived from the harness fixture's content, never hardcoded.
7. Visibility + lockout: with provider false/absent, neither mount renders its control (query by testid, assert absent); with true, both render. While busy (mocked in-flight capture), ShareHub's share-link and kebab toggles are `aria-disabled` and clicking them opens nothing (assert popover testid absent). Rendered-DOM scans scoped to testids (anti-tautology: no label-text scans).

E2e: one dev-flag Playwright spec asserting the published kebab shows the row for a developer session and the download event fires (Playwright `download` event), gated to local runs like other env-bound specs. Layout-dimensions task: N/A (§7.5). Transition-audit task: trivially satisfied — assert no `AnimatePresence`/exit props in the new module (§7.4 is all-instant).

## 10. Numeric literals (single source)

- sinceHours `168` (7 d) — every time-bounded pull (§4.2).
- Outer list limits: alerts `100`, syncLog `50`, staged `10`, failures `100`; events page = `PAGE_SIZE` (100, imported constant, not restated).
- Nested warning-array cap `200` (§4.2); snapshot array caps `50` (`attentionItems`, `feed`, §4.3).
- DPR cap `2` (§3.1) — distinct contract from the popover-close wait of `2` animation frames (§2.2); both deliberate, unrelated.
- Error auto-clear `6000` ms (§7.1).
- Staged request `driveFileId` max `128` chars (request validation, §5). Filename seed truncation `64` chars + empty-seed fallback `show` (§6) — a different bound from the 128 request cap.
- Token-sweep threshold `24` chars (§4.5, mirrors read-core rule).
- Tap-target sizing is the `size-tap-min`/`min-h-tap-min` token (44 px by design system), referenced as a token, not a literal.
- Top-level telemetry keys: exactly `3` (§4).

Any other number appearing in the implementation must trace to one of these or to an existing repo constant.

## 11. Non-goals

- No server-side storage, no share/expiry of bundles.
- No console/network ring buffer.
- No capture on crew-facing pages or any non-modal admin surface.
- No redaction beyond §4.3–§4.5 (allowlist + email redaction + token sweep + read-core defaults). Screenshot pixels are deliberately unredacted (§1.1).
- No observe-CLI flag additions for the new read-core filter fields.
- No i18n of dev-only copy beyond repo copy rules.
