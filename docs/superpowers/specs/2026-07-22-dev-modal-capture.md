# Dev-gated show-modal capture bundle

Date: 2026-07-22 · Status: draft · Implementer: Opus / Claude Code (UI surface)

One-click, developer-only capture of a show review modal: a screenshot of the entire modal panel (including scroll-clipped content) plus a comprehensive telemetry JSON, zipped and downloaded in the browser. Purpose: bug-report bundles — grab exactly what the developer is looking at plus the diagnostic context, without reproducing.

## 1.1 Resolved scope — do not relitigate

Ratified during the in-session brainstorm (user-approved design, 2026-07-22):

- **Purpose = bug-report bundle.** Not a visual-regression archive, not an audit trail. No server-side storage.
- **Capture tech = client DOM-to-image** of the live panel state. Server-side Playwright re-render and `getDisplayMedia` were considered and rejected (fresh render loses the buggy state; display capture is viewport-only with a share-picker prompt).
- **Save target = browser download only.** No Supabase Storage bucket, no index table, no retention policy.
- **Telemetry contents = modal data snapshot + server pull via `lib/observe/query` read-core + environment metadata.** Console ring buffer was offered and declined.
- **Both modals in scope:** published review modal (ShareHub kebab item) AND staged Step3 review modal (header icon button). User explicitly chose the two-surface scope.
- **Capture-library choice is a plan-time empirical spike** (§3.3). The spec ratifies the contract, not the library. Per the AGENTS.md empirical-spike rule, the clone-expansion mechanism is marked UNRATIFIED pending that spike; it is a bounded implementation detail behind a fixed contract, not a design-correctness vector.
- **Bundle never contains the share token** (§4.4), even though the developer could see it elsewhere in the admin UI. Fixed posture; do not relitigate toward "dev sees it anyway."
- **PII posture: read-core defaults (`includePii` omitted → `false`)** for every read-core call (e.g. `lib/observe/query/alerts.ts:70`). No `--reveal-email`-style carve-out in v1.

## 2. Surfaces and gating

### 2.1 Developer flag plumbing

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- New client context `components/admin/dev/DeveloperFlagContext.tsx`: `DeveloperFlagProvider({ viewerIsDeveloper, children })` + `useViewerIsDeveloper(): boolean` (default `false` when no provider — fail-to-hidden).
- `app/admin/layout.tsx` already resolves `viewerIsDeveloper` via `isCurrentUserDeveloper()` in its parallel identity batch (`app/admin/layout.tsx:77`). The layout wraps its children in `DeveloperFlagProvider` with that value. No per-page prop drilling (the staged chain would otherwise be 4 layers: page → Step3ReviewWithFinalize → Step3Review → Step3SheetCard → Step3ReviewModal).
- `isCurrentUserDeveloper()` is the visibility-only fail-to-false probe (`lib/auth/requireDeveloper.ts:258`); an infra blip hides the control, never reveals it.
- Server enforcement is independent: the telemetry action calls `requireDeveloper()` (`lib/auth/requireDeveloper.ts:238`; opts omitted — `RequireDeveloperOpts.layer` is `"layout" | "page"` only, `requireDeveloper.ts:80`, and the default `"page"` is the established server-action pattern, `app/admin/dev/actions.ts:142`) as its first statement. A non-developer caller gets `forbidden()` regardless of client state.

### 2.2 Published modal surface

- Mount: a new item in the ShareHub kebab popover (`components/admin/showpage/ShareHub.tsx`, popover `data-testid="share-hub-popover"`), in the "Show" section, rendered only when `useViewerIsDeveloper()` is true.
- Shape: full-width menu-row button matching the existing popover row idiom (`flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 text-sm font-medium` — same classes as the mailto rows at `ShareHub.tsx:455`), lucide `Camera` icon, `data-testid="share-hub-dev-capture"`.
- Copy: `Capture debug bundle` with an adjacent one-word `Dev` eyebrow-style suffix chip is NOT used; instead the row's visual dev marker is the Camera icon plus the label alone. Label text is exactly `Capture debug bundle`.
- On activate: close the kebab popover first (its overlay would occlude the panel in the shot), wait two animation frames, then run the capture flow (§3–§6) against the published panel element `[data-review-modal-panel]` (attribute written by the shell from `dataAttrPrefix="review-modal"`, `components/admin/review/ReviewModalShell.tsx:621`).
- The capture flow's busy/error surface for this mount is the StatusStrip-level live region described in §7.

### 2.3 Staged (Step3) modal surface

- Mount: dev-only icon button in the Step3 review modal header actions row (`components/admin/wizard/Step3ReviewModal.tsx:417-448`), between the status chip and `ModalCloseButton`, rendered only when `useViewerIsDeveloper()` is true.
- Shape: 44px icon button matching the sheet-link anchor idiom at `Step3ReviewModal.tsx:393` (`inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle … focus-visible:ring-2`), lucide `Camera` icon, `aria-label="Capture debug bundle"`, `data-testid={`wizard-step3-card-${dfid}-dev-capture`}`.
- On activate: run the capture flow against the staged panel element `[data-step3-review-panel]` (`dataAttrPrefix="step3-review"`, same shell line).
- No popover to close on this surface.

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
- MUST include the panel's full content height: content clipped by the panel's `max-h-[85vh]`/`sm:max-h-[80vh]` and by the consumer body's inner scroll pane (`ReviewModalShell.tsx:623`, body contract `ReviewModalShell.tsx:688-696`) appears fully in the image, as if the panel had no height cap and the scroll panes were expanded.
- MUST operate on a detached clone; the live DOM's geometry, scroll positions, and styles are never mutated (no visible flicker, no scroll jump).
- MUST include popovers/overlays currently portaled inside the panel (they are positioned inside the panel box by construction — `PopoverHostContext` provider wraps the panel interior, `ReviewModalShell.tsx:625`).
- Cross-origin images (help screenshots, external assets) that taint the raster: the util renders them as-is when the library supports it, else they may appear blank; a tainted-canvas failure is surfaced as a capture error (§7), never a silent empty download.
- Pixel scale: `devicePixelRatio` capped at 2.

### 3.2 Failure semantics

Rejects with an `Error`; the hook maps any rejection to the `error` state (§7). No retry loop.

### 3.3 UNRATIFIED — library + expansion mechanism (plan-time spike)

Candidates: `html-to-image`, `modern-screenshot`, `html2canvas`. The implementation plan MUST start with a spike task that captures the real published modal (dev server, seeded show) with each candidate and picks by: (a) full-height clone expansion achievable (clone-side style overrides lifting `max-h`/`overflow` on panel + inner scroll pane), (b) fidelity on this repo's CSS (Tailwind v4 tokens, `shadow-(--shadow-tile)`, `overflow-clip`, rounded corners), (c) bundle cost. The chosen library and the exact clone-override list are recorded in the plan; the spec deliberately does not assert them.

## 4. Telemetry JSON schema

The telemetry JSON file (zip entry name per §6) is a single object with exactly three top-level keys:

```jsonc
{
  "meta": {
    "capturedAt": "<ISO 8601>",
    "commitSha": "<string | null>",      // server-supplied, §5
    "url": "<location.href>",
    "userAgent": "<navigator.userAgent>",
    "viewport": { "w": 0, "h": 0, "dpr": 1 },
    "modalKind": "published" | "staged",
    "showId": "<uuid | null>",           // published
    "driveFileId": "<string | null>",    // staged
    "panelRect": { "w": 0, "h": 0 }      // getBoundingClientRect of the captured panel
  },
  "clientSnapshot": { /* §4.3 */ },
  "server": { /* §4.2; or { "kind": "unavailable", "reason": "<string>" } */ }
}
```

### 4.2 Server section (action result, §5)

- `published`: `{ kind: "ok", events, alerts, syncLog, commitSha }` where
  - `events` = `queryEvents({ showId, sinceHours: 168 })` (`lib/observe/query/events.ts:101`) — one read-core page, `PAGE_SIZE = 100` (`lib/admin/telemetryTypes.ts:1`), newest first.
  - `alerts` = `queryAlerts({ openOnly: true, limit: 100 })` (`lib/observe/query/alerts.ts:54`; `AlertFilters` has no show filter — `lib/observe/query/types.ts:17-22`), then filtered in the action to rows with `showId === request.showId || showId === null` (global alerts kept deliberately: cron/system faults are bug-relevant context).
  - `syncLog` = `querySyncLog({ showId, sinceHours: 168, limit: 50 })` (`lib/observe/query/syncLog.ts:20`; `SyncLogFilters.showId` exists — `types.ts:121-128`).
- `staged`: `{ kind: "ok", staged, failures, commitSha }` where
  - `staged` = `queryStagedParses({ driveFileId, sinceHours: 168, limit: 10 })` (`lib/observe/query/staged.ts:25`; `StagedFilters.driveFileId` — `types.ts:56-63`).
  - `failures` = `queryIngestFailures({ sinceHours: 168, limit: 100 })` (`lib/observe/query/failures.ts:27`; `FailureFilters` has no driveFileId — `types.ts:82-88`), then filtered in the action to `driveFileId === request.driveFileId`.
- Any read-core sub-result of `kind: "infra_error"` is embedded verbatim in place of that sub-array — partial bundles beat none; the action still returns `kind: "ok"` if the gate passed.
- `includePii` omitted everywhere (defaults false). Token-like substrings are always redacted by the read-core regardless.

### 4.3 Client snapshot

Each mount supplies `clientSnapshot()` returning a JSON-serializable projection of the data props its modal received (fields enumerated at plan time from the live prop types; the spec fixes the rules, not the field list):

- Data only — no functions, no React elements, no refs.
- Serialized via `JSON.stringify` with a replacer that drops `undefined` and functions; a serialization throw degrades to `{ "kind": "unserializable", "reason": "<message>" }` rather than failing the capture.
- MUST exclude: share URL, share token, any `mailto:` hrefs (they embed the share URL).

### 4.4 Secret exclusion (hard rule)

The bundle (both files) never carries the share token string. The telemetry JSON excludes it per §4.3; the screenshot is pixels of what the developer already sees on screen and is exempt from field-level redaction — but the ShareHub popover (which prints the share URL, `ShareHub.tsx:435`) is closed before capture (§2.2), so the URL is not normally in frame. This is the same posture as invariant 10's `rotateShareToken` example: structured data never carries the secret.

## 5. Telemetry server action

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- New file `app/admin/_devCaptureAction.ts`, `"use server"`, single export `captureShowTelemetry(request: CaptureTelemetryRequest): Promise<CaptureTelemetryResult>`.
- NOT under `app/admin/dev/` — that tree is build-gated aside by `scripts/with-admin-dev-flag.mjs` (renames `app/admin/dev/page.tsx`/`actions.ts` to `.disabled` when `ADMIN_DEV_PANEL_ENABLED` is unset, `scripts/with-admin-dev-flag.mjs:6-12`) and this feature must work on production deploys for developer users.
- Request: `{ kind: "published", showId: string } | { kind: "staged", driveFileId: string }`. Validation fail-closed: `kind: "published"` requires a UUID-shaped `showId`; `kind: "staged"` requires a non-empty `driveFileId` (max 128 chars); anything else returns `{ kind: "bad_request" }` without touching the DB.
- First statement: `await requireDeveloper()` (§2.1 citation).
- Then the read-core pulls per §4.2, plus `commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null` (same source as `app/api/health/route.ts:8`).
- Result union: `{ kind: "ok", ... } | { kind: "bad_request" }`. Gate failures never return — `requireDeveloper` redirects/`forbidden()`s.
- Read-only: no Supabase write builder, no `.rpc(` outside the gate's own internals, no `lib/log` import of its own (the read-core never imports `lib/log`; this action also must not — reading telemetry never writes it). Consequence: NO advisory lock (invariant 2 governs mutations only; this surface mutates nothing).

## 6. Zip and download

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- `lib/devcapture/bundle.ts` (client): `zipSync` from `fflate` (already a dependency, `package.json:71`) over `{ "screenshot.png": <png bytes>, "telemetry.json": <utf8 bytes> }`, store-level compression for the PNG (already compressed), default for the JSON.
- Download via object-URL anchor click (`URL.createObjectURL` + `a.download`), revoked after click. First in-app download surface; no shared helper exists to reuse (verified — no `createObjectURL` in `app/`/`components/`).
- Filename: `dev-capture-<seed>-<stamp>.zip` where `seed` = show slug (published) or `dfid` (staged), lowercased, `[^a-z0-9-]` stripped; `stamp` = `YYYYMMDD-HHmmss` local time.

## 7. UX states, guard conditions, transition inventory

### 7.1 States

`idle → busy → idle | error`; `error → busy` (re-run) or `error → idle` (modal closed). Single in-flight guard: `run()` while `busy` is a no-op.

- Published mount: while `busy`, the kebab row is functionally irrelevant (popover already closed); busy/error surface is a small transient status line rendered by the ShareHub host in its root (which stays mounted), `role="status"`, copy below. Error auto-clears after 6 s or on next `run()`.
- Staged mount: the icon button itself carries the state — `disabled` + spinner glyph while `busy` (`aria-disabled`, `aria-label` unchanged); on `error` an adjacent `role="status"` text node shows the error copy with the same 6 s auto-clear.

### 7.2 Copy (user-visible, dev audience)

- Busy: `Capturing the modal…`
- Error: `Capture failed. Details are in the browser console.` (Full error object goes to `console.error`.) No raw §12.4 codes are involved anywhere on this surface — nothing to route through `lib/messages/lookup.ts`; the strings above are static copy, not code-derived (invariant 5 satisfied vacuously). No em-dashes in copy.

### 7.3 Guard conditions

| Input | null/empty/invalid | Behavior |
| --- | --- | --- |
| `useViewerIsDeveloper()` | false or no provider | control not rendered at all |
| `target()` | returns `null` (panel unmounted mid-flow) | error state, no capture attempt |
| `clientSnapshot()` | throws / unserializable | `{ kind: "unserializable" }` embedded, capture proceeds |
| action result | `bad_request` / network throw | `server: { kind: "unavailable", reason }` embedded, capture proceeds |
| screenshot util | rejects | error state — screenshot is the point; no JSON-only bundle |
| modal closes mid-`busy` | component unmounts | in-flight work aborted/ignored via mounted-ref guard; no download fires after unmount |

Sequencing: screenshot capture and the telemetry action run concurrently; the bundle assembles when both settle. Screenshot rejection = whole-run error (even if telemetry succeeded); telemetry rejection alone does not fail the run.

### 7.4 Transition inventory

| Pair | Treatment |
| --- | --- |
| idle → busy | instant — no animation (spinner appears) |
| busy → idle (success) | instant — no animation (download fires) |
| busy → error | instant — status text appears, no animation |
| error → idle (auto-clear/close) | instant |
| error → busy (re-run) | instant |
| compound: modal close during busy | unmount; mounted-ref guard suppresses late setState and the download |
| compound: kebab reopened during busy | allowed; capture row `run()` no-ops while busy |

No `AnimatePresence`, no exit animations anywhere in this feature.

### 7.5 Dimensional invariants

None — no fixed-dimension parent with flex/grid children is introduced. The staged icon button is a `size-tap-min` leaf in an existing shrink-0 row; the ShareHub row matches existing row classes.

## 8. Invariant compliance matrix

| AGENTS.md invariant | Disposition |
| --- | --- |
| 1 TDD per task | plan enforces |
| 2 advisory lock | N/A — no mutation of locked tables; action is read-only |
| 3 email canonicalization | N/A — no raw email input |
| 4 no global sync cursor | N/A |
| 5 no raw codes in UI | vacuous — static copy only (§7.2) |
| 6 commit per task | plan enforces |
| 8 impeccable dual-gate | REQUIRED — diff touches `components/` and `app/admin/layout.tsx` |
| 9 Supabase call-boundary | action performs no direct Supabase calls; all DB access via read-core (already registered/compliant). The action file carries `// not-subject-to-meta: no direct Supabase call sites; all DB access via lib/observe/query read-core` only if the meta-test flags it; otherwise no annotation needed |
| 10 mutation-surface observability | `captureShowTelemetry` is a `"use server"` export with a `require`-gate → admin surface → needs an `ADMIN_SURFACE_EXEMPTIONS` row `{ file: "app/admin/_devCaptureAction.ts", fn: "captureShowTelemetry", kind: "read-only" }` (row type `tests/log/mutationSurface/exemptions.ts:46`; precedent read-only rows `tests/log/mutationSurface/exemptions.ts:75`). The exemption's read-only verification (no write-builder, no `.rpc(`) must actually hold — see §5 |
| 11 worktree isolation | this run lives in `FX-worktrees/dev-modal-capture` |

DB: no migrations, no schema change, no RPC — validation-parity gate untouched.

## 9. Testing

Meta-test inventory (mandatory declaration):

- EXTENDS `tests/log/mutationSurface/exemptions.ts` — one `ADMIN_SURFACE_EXEMPTIONS` row (§8). The discovery meta-test `tests/log/_metaMutationSurfaceObservability.test.ts` fails-by-default on the new action until the row lands; its read-only shape check is the structural proof.
- No other registry applies: no new Supabase call sites (`_metaInfraContract` untouched), no sentinel text, no admin-alert code, no advisory lock, no §12.4 code.

Unit/integration (jsdom unless stated):

1. Action gating: non-developer call hits `requireDeveloper` rejection path (existing test-infra hooks in `requireDeveloper.ts`); developer call with bad request shapes returns `bad_request` without DB access; good request assembles §4.2 shape from mocked read-core, including per-sub-result `infra_error` embedding and the alerts show-or-global filter. Failure mode caught: gate bypass, filter drift.
2. Snapshot serializer: drops functions/undefined, share-URL/token exclusion asserted against a fixture containing a token-shaped string — assert the OUTPUT JSON string does not contain the fixture token (data-source assertion, not container).
3. Zip assembly: unzip (fflate `unzipSync`) the produced bytes and assert exactly two entries with the exact names and byte-identical payloads — derived from the input fixtures, not hardcoded lengths.
4. Hook state machine: busy no-reentry, screenshot-reject ⇒ error even when telemetry resolved, telemetry-reject ⇒ success with `unavailable` embedded, unmount mid-busy fires no download (spy on the anchor-click sink).
5. Visibility: with provider false/absent, neither mount renders its control (query by testid, assert absent); with true, both render. Rendered-DOM scan scoped to the control's own testid (anti-tautology: no label-text scans).
6. Capture util: covered by the spike's real-browser harness (Playwright), not jsdom — jsdom has no layout/canvas. Asserts output PNG dimensions ≥ panel scrollHeight × DPR cap semantics per §3.1 against a seeded modal with known overflow (expected height derived from the harness fixture's content, not hardcoded).

E2e: one dev-flag Playwright spec asserting the published kebab shows the row for a developer session and the download event fires (Playwright `download` event), gated to local runs like other env-bound specs. Layout-dimensions task: N/A (§7.5). Transition-audit task: trivially satisfied — assert no `AnimatePresence`/exit props in the new module (§7.4 is all-instant).

## 10. Numeric literals (single source)

sinceHours `168` (7 d) for every time-bounded pull; alerts limit `100`; syncLog limit `50`; staged limit `10`; failures limit `100`; events page = `PAGE_SIZE` (100, imported constant, not restated); DPR cap `2`; error auto-clear `6000` ms; seed max `128` chars (request validation §5). Any other number appearing in the implementation must trace to one of these or to an existing repo constant.

## 11. Non-goals

- No server-side storage, no share/expiry of bundles.
- No console/network ring buffer.
- No capture on crew-facing pages or any non-modal admin surface.
- No redaction beyond §4.3/§4.4 (read-core defaults govern).
- No i18n of dev-only copy beyond repo copy rules.
