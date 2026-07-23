# Dev-gated show-modal capture bundle

Date: 2026-07-22 · Status: converged (see §12 review record) · Implementer: Opus / Claude Code (UI surface)

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

- Mount: a new item in the ShareHub kebab popover (`components/admin/showpage/ShareHub.tsx`, popover `data-testid="share-hub-popover"`), as the popover's OWN final "Developer" section — deliberately independent of the share half (suppressed while archived) and the Show section (omitted entirely while `finalizeOwned`, `ShareHub.tsx:514`): per §7.3 the ONLY visibility gate is the developer flag, so the capture row renders in every lifecycle mode (archived, paused, finalize-owned) whenever the popover itself exists. Rendered only when `useViewerIsDeveloper()` is true. (Plan-review amendment 2026-07-22: original draft said "in the Show section", which would have hidden capture during finalize-owned — contradicting the §7.3 guard table; the guard table wins.)
- Shape: full-width menu-row button matching the existing popover row idiom (`flex min-h-tap-min w-full items-center gap-2 rounded-sm px-2 text-sm font-medium` — same classes as the mailto rows at `ShareHub.tsx:455`), lucide `Camera` icon, `data-testid="share-hub-dev-capture"`. Label text is exactly `Capture debug bundle`.
- On activate: the flow enters `busy` SYNCHRONOUSLY on the click (lockout engages before anything else — plan-review amendment #2, 2026-07-22: the original "close popover, wait two frames, THEN run" ordering left a two-frame window in which the toggles were still live and the popover could reopen into frame); then, inside the busy window, the flow closes the kebab popover (its overlay would occlude the panel in the shot), waits two animation frames, and rasterizes the published panel element `[data-review-modal-panel]` (attribute written by the shell from `dataAttrPrefix="review-modal"` — consumer passes it at `components/admin/showpage/PublishedReviewModal.tsx:657`, shell writes it at `components/admin/review/ReviewModalShell.tsx:621`).
- **Busy lockout (share-token race guard, §4.5):** while the capture flow is `busy`, the ShareHub root suppresses BOTH popover toggles — the share-link button and the kebab render `aria-disabled="true"` and their `toggle(...)` calls no-op — so the popover (which prints the share URL, `ShareHub.tsx:435`) cannot be reopened into the frame before the clone is taken. Lockout spans activation through settle (success or error).
- The capture flow's busy/error surface for this mount is a transient status line rendered by the ShareHub root as an inline text node immediately after the kebab button in the same strip row (`ml-2 text-xs text-text-subtle`, `role="status"`, `data-testid="share-hub-dev-capture-status"`); copy per §7.2.

### 2.3 Staged (Step3) modal surface

- Mount: dev-only icon button in the Step3 review modal header actions row (`components/admin/wizard/Step3ReviewModal.tsx:417-448`), between the status chip and `ModalCloseButton`, rendered only when `useViewerIsDeveloper()` is true.
- Shape: `size-tap-min` icon button matching the sheet-link anchor idiom at `Step3ReviewModal.tsx:393` (`inline-flex size-tap-min shrink-0 items-center justify-center rounded-sm text-text-subtle … focus-visible:ring-2`), lucide `Camera` icon, `aria-label="Capture debug bundle"`, `data-testid={`wizard-step3-card-${dfid}-dev-capture`}`.
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

The spike harness (and the real-browser test it becomes, §9.6) runs at a ≥ lg viewport and seeds the modal so BOTH inner scroll panes overflow, with a distinct solid-color sentinel block (fixed-size divs of two colors unused by the design tokens) as the LAST element of each pane's scrolled-out content: one in the main content pane (`ShowReviewSurface.tsx:997`), one in the section rail (`ShowReviewSurface.tsx:842` — `hidden lg:flex`, hence the ≥ lg viewport requirement). Acceptance: the captured PNG contains ≥ 1 pixel of EACH sentinel color (decoded pixel scan), proving expansion of every documented pane end-to-end. The harness exercises BOTH modal kinds — published (`[data-review-modal-panel]`) and staged (`[data-step3-review-panel]`) — so staged target resolution and staged full-height capture are proven, not assumed. A secondary sanity check may compare output height against the clone's expanded height, but the sentinel scan is the proof; a `panel.scrollHeight` inequality is explicitly NOT accepted (§3.1 rationale).

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
  - `alerts` = `queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: showId })` — `showIdOrGlobal` is a NEW optional `AlertFilters` field (extends `lib/observe/query/types.ts:17-22`) implemented in `lib/observe/query/alerts.ts` as a PostgREST `.or("show_id.eq.<id>,show_id.is.null")` filter, so the page is the newest MATCHING rows — server-side filtering, no post-cap starvation (global alerts kept deliberately: cron/system faults are bug-relevant context).
  - `syncLog` = `querySyncLog({ showId, sinceHours: 168, limit: 51 })` (`lib/observe/query/syncLog.ts:20`; `SyncLogFilters.showId` exists — `types.ts:121-128`).
- `staged`: `{ kind: "ok", staged, failures, commitSha }` where
  - `staged` = `queryStagedParses({ driveFileId, sinceHours: 168, limit: 11 })` (`lib/observe/query/staged.ts:25`; `StagedFilters.driveFileId` — `types.ts:56-63`).
  - `failures` = `queryIngestFailures({ sinceHours: 168, limit: 101, driveFileId })` — `driveFileId` is a NEW optional `FailureFilters` field (extends `types.ts:82-88`) implemented as `.eq("drive_file_id", …)`, same no-starvation rationale as alerts.
- **Truthful truncation (probe-row pattern):** for alerts/syncLog/staged/failures the action requests one row MORE than the embed cap (caps: alerts 100, syncLog 50, staged 10, failures 100; `clampLimit` accepts any value in [1, 500] — `types.ts:12-14`), embeds only the first cap-many rows, and sets `truncated` = "more than cap rows were returned". An exact-cap result is therefore NOT marked truncated. Each list embeds as `{ rows, truncated }`.
- Nested warning arrays inside rows (`StagedRow.warnings` — `types.ts:75`; `FailureRow.lastWarnings` — `types.ts:99`): each capped at the first 200 entries with a sibling `warningsTruncated: true` marker when the cap bites.
- Any read-core sub-result of `kind: "infra_error"` is embedded verbatim in place of that sub-object — partial bundles beat none; the action still returns `kind: "ok"` if the gate passed.
- `includePii` omitted everywhere (defaults false). Redaction provenance: `queryAlerts` identity strings pass through the read-core sanitizer with its always-on token-like redaction (AGENTS.md "Redaction posture"); `app_events.context` is redaction-guaranteed at write time (same section); staged/syncLog/failure identity strings pass through `sanitizeIdentityString`/`serializeWarningArray` (`staged.ts:59-62`, `syncLog.ts:43-46`, `failures.ts:50-57`). The read-core layer is defense-in-depth, not the guarantee: the §4.5 value-walk redaction runs over the ENTIRE assembled telemetry object (all three top-level sections) and is the mechanism the hard rules of §4.4 rest on.
- Read-core filter extensions (`showIdOrGlobal`, `driveFileId`) stay `.select(...)`-only and inside `lib/observe/query/**`, so the read-only pin `tests/observe/_metaReadOnlyQueryCore.test.ts` continues to cover them; read-core never imports `lib/log` (same pin). The observe CLI gains no new flags (internal filter fields only; the CLI fail-closed flag contract is untouched).

### 4.3 Client snapshot (allowlist, ratified here — not deferred)

`clientSnapshot` is built by an explicit per-surface allowlist projection; anything not listed is absent. Caps: every top-level array in the snapshot is capped at its stated limit with a sibling `<name>Truncated: true` marker when the cap bites.

- **Published** (from `PublishedReviewModalProps`, `components/admin/showpage/PublishedReviewModal.tsx:77-123`): `slug`, `showId`, `title`, `archived`, `published`, `finalizeOwned`, `isLive`, `lastSyncedAt`, `lastCheckedAt`, `lastSyncStatus`, `alertsDegraded`, `alertId`, `openSheetHref`, `attentionItems` (cap 50), `attentionItemsTruncated` (marker, present when the cap bites), `feed` (cap 50), `feedTruncated` (marker), `bySection`, `data`. EXCLUDED (never serialized): `crewEmails` (raw emails), `pickerCrew` (roster identity rows), every function prop, `now` (redundant with `capturedAt`).
- **Staged** (from the Step3 props, `components/admin/wizard/Step3ReviewModal.tsx:120-143`): `data` (the `StagedSectionData`), `checked`, `isDirtyRescan`, `isPublishRunActive`, plus `resolution` — the prop is OPTIONAL (`resolution?:` — `Step3ReviewModal.tsx:137`): when absent, the `resolution` key is OMITTED from the snapshot entirely; when present, it is projected to exactly `{ stagedId, reviewItemsCorrupt, isPublishRunActive, triggeredReviewItemCount: resolution.triggeredReviewItems.length }` (`Step3ReviewResolution` — `Step3ReviewModal.tsx:73-81`; the callbacks and the item array itself are never serialized). EXCLUDED: every function prop.
- Assembly pipeline (order fixed): (1) allowlist projection; (2) `JSON.stringify` with a replacer returning `undefined` for function values — note JSON semantics: an `undefined`-valued OBJECT property is dropped, an `undefined` ARRAY element serializes as `null`; both are acceptable and documented here; (3) `JSON.parse` back to a plain object. `clientSnapshot` embeds in the telemetry document as that OBJECT (never a double-encoded string); the §4.5 value-walk then covers it along with the rest of the document, and the whole document is serialized exactly once at zip time (§6).
- **Size bound (unknown-depth guard):** `data`/`bySection`/`feed` interiors are typed server payloads whose nesting the spec does not enumerate; instead of per-field caps, the serialized snapshot string (pipeline step 2) is bounded at 1,000,000 chars — beyond it the snapshot degrades to `{ "kind": "too_large", "chars": <actual> }` and capture proceeds. This bounds the bundle regardless of nested collection growth.
- A throw anywhere in steps 1–3 degrades that surface's snapshot to `{ "kind": "unserializable", "reason": "serialize_threw" }` (fixed enum string — never the exception message, §4.5); capture proceeds.

### 4.4 Secret exclusion (hard rule)

The structured bundle (telemetry JSON) never carries the share token string: the allowlist (§4.3) never selects the share URL, token, or `mailto:` hrefs; `meta.url` strips query and hash; the value-walk redaction (§4.5) backstops the whole document — and the share token's shape is KNOWN, not assumed: it is a 64-char lowercase-hex string (`encode(gen_random_bytes(32), 'hex')` — `supabase/migrations/20260523000002_show_share_tokens.sql:7`, rotation same shape `supabase/migrations/20260523000004_rotate_show_share_token.sql:31`), squarely inside the §4.5 hex rule. The screenshot is pixels of what the developer already sees; the only on-screen element that prints the share URL is the ShareHub popover (`ShareHub.tsx:435`), and ShareHub's sole mount is the published modal's StatusStrip (`components/admin/showpage/StatusStrip.tsx:48` — "sole render site is the published review modal"; the staged modal renders no share affordance at all). The popover is closed before capture and cannot reopen during it (busy lockout, §2.2) — closing the race the popover would otherwise create. This is the same posture as invariant 10's `rotateShareToken` example: structured data never carries the secret.

### 4.5 Document-wide guards

- **Value-walk redaction** (client-side, in the bundle module §6, after the full telemetry object — `meta` + `clientSnapshot` + `server` — is assembled, before the single serialization at zip time). The walk visits every STRING VALUE in the object tree recursively AND applies the same three rules to every object KEY (a key whose text matches any rule is rewritten by the same replacement). This is safe for legitimate keys by construction: code-defined property names cannot contain `@`, cannot be a pure 32+-char hex run (identifiers like `lastFinalizeFailureCodeUnrecognized` contain non-hex letters), and cannot be JWT-shaped — the earlier review round's key-corruption problem came from a broad base64-alphabet rule that no longer exists. Per string (value or key), in order:
  1. **Email redaction:** every match of `/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g` → `[email redacted]`. This is the implementable grammar; RFC-5322 corner cases beyond it are out of scope by declaration.
  2. **Hex-secret redaction:** every contiguous `[0-9a-fA-F]` run ≥ 32 chars → `[redacted]`. Catches the 64-hex share token (§4.4) with 2× margin; UUIDs are safe (dash-separated runs ≤ 12); a 64-hex `emailHash` in event context is redacted too — accepted correlation loss, fail-safe direction.
  3. **JWT redaction:** every match of `/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g` → `[redacted]` (defense in depth; no JWT should ever reach the bundle).
- **Exempt field paths** (rule 2 only; rules 1 and 3 always apply): `meta.commitSha` and `server.commitSha` — and the exemption is SHAPE-GATED: it applies only when the value is EXACTLY 40 hex chars (git SHA-1 provenance). Any other value at those paths gets the standard rules (so a 64-hex token planted there is still redacted). §5 additionally validates the env source to the same shape. No other exemptions.
- **Deterministic reason classification:** every `reason` field comes from a closed set with an observable criterion — `"bad_request"`: the action RESOLVED with `{ kind: "bad_request" }`; `"network_error"`: the action call REJECTED (any rejection — network, serialization, server crash); `"action_failed"`: the action resolved with any shape other than `ok`/`bad_request`; `"serialize_threw"`: the snapshot pipeline threw (§4.3). Never a raw exception message (exception objects go to `console.error` only).
- **URL stripping:** `meta.url` is `location.origin + location.pathname`; query and hash never enter the bundle.

## 5. Telemetry server action

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- New file `app/admin/_devCaptureAction.ts`, `"use server"`, single export `captureShowTelemetry(request: CaptureTelemetryRequest): Promise<CaptureTelemetryResult>`.
- NOT under `app/admin/dev/` — the build gate `scripts/with-admin-dev-flag.mjs` renames an enumerated `FILES` list under `app/admin/dev/` (including `actions.ts` and the dev pages — `with-admin-dev-flag.mjs:43-60`) to `.disabled` when `ADMIN_DEV_PANEL_ENABLED` is unset (`with-admin-dev-flag.mjs:6-12`); anything in that list is absent from production builds, and this feature must work on production deploys for developer users. (File-list gating, not directory gating; the conclusion is the same — do not join that list.)
- Execution order (fixed): (1) `await requireDeveloper()` (§2.1 citation) — this itself performs Supabase session/RPC reads; (2) request validation; (3) read-core pulls. A developer call with an invalid request returns `{ kind: "bad_request" }` after the gate but WITHOUT any telemetry read-core access (the gate's own auth reads are unavoidable and out of scope of that claim).
- Request: `{ kind: "published", showId: string } | { kind: "staged", driveFileId: string }`. Validation fail-closed: `kind: "published"` requires a UUID-shaped `showId`; `kind: "staged"` requires a non-empty `driveFileId` of at most 128 chars; anything else → `bad_request`.
- Then the read-core pulls per §4.2, plus `commitSha`: `process.env.VERCEL_GIT_COMMIT_SHA` accepted ONLY if it matches `/^[0-9a-f]{40}$/i`, else `null` (source as `app/api/health/route.ts:8`; the shape gate matches the §4.5 exemption so nothing non-SHA can ride the exempt path). `meta.commitSha` in the bundle copies this value when the server section is `kind: "ok"` and is `null` otherwise.
- Result union: `{ kind: "ok", ... } | { kind: "bad_request" }`. Gate failures never return — `requireDeveloper` redirects or `forbidden()`s (`requireDeveloper.ts:214`).
- Read-only: no Supabase write builder, no `.rpc(` of its own (the gate's internals are the gate's), no `lib/log` import (reading telemetry never writes it). Consequence: NO advisory lock (invariant 2 governs mutations only; this surface mutates nothing).

## 6. Zip and download

<!-- spec-lint: ignore — new file created by this spec; not yet tracked -->
- `lib/devcapture/bundle.ts` (client): `zipSync` from `fflate` (already a dependency, `package.json:71`) over `{ "screenshot.png": <png bytes>, "telemetry.json": <utf8 bytes> }`, store-level compression for the PNG (already compressed), default for the JSON.
- Download via object-URL anchor click (`URL.createObjectURL` + `a.download`). Lifecycle contract: revocation runs in a `finally` — it happens whether the anchor click succeeds or throws; if the owner unmounts between URL creation and click, the mounted-ref guard (§7.3) skips the click and the same `finally` still revokes. No code path leaves the URL alive. First in-app download surface; no shared helper exists to reuse (verified: zero `createObjectURL` matches under `app/`, `components/`, `lib/`).
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
| action result | non-`ok` per §4.5 classification | `server: { kind: "unavailable", reason: <§4.5 deterministic enum> }` embedded, capture proceeds; `meta.commitSha` = null |
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

1. Action gating: non-developer call is rejected by the gate (developer-identity test seams already exist — `tests/auth/requireDeveloper.test.ts`, `tests/auth/developerGatingContract.test.ts`, and the `parseAndStage` precedent `tests/admin/parseAndStage-auth.test.ts`); developer call with bad request shapes returns `bad_request` with zero read-core invocations (read-core mocked, assert not called); good request assembles §4.2 shape from mocked read-core, including per-sub-result `infra_error` embedding and nested-warnings 200-cap with marker. Failure mode caught: gate bypass, filter drift, silent truncation.
2. Read-core filter extensions: `showIdOrGlobal` builds the show-or-global `.or(...)` clause exactly as §4.2 states; `FailureFilters.driveFileId` builds `.eq` — asserted against the mocked builder's received calls (data-source assertion). Failure mode: post-cap starvation regression (filter silently dropped → global page returns).
3. Truthful truncation (probe-row): with mocked read-core returning cap+1 rows → embedded rows length == cap AND `truncated: true`; returning exactly cap rows → `truncated: false` (the R2 review's exact counterexample); returning fewer → `truncated: false`. Asserted per list.
4. Redaction value-walk, against the final assembled telemetry OBJECT (the thing actually zipped): (a) allowlist excludes `crewEmails`/`pickerCrew`/functions (fixture props include a function and a `crewEmails` array; assert neither appears anywhere in the walked output); (b) email redaction — fixture embeds an email deep inside `data`; assert `[email redacted]` present and no email-grammar match survives anywhere in the document; (c) hex rule — fixtures embed a REAL share-token-shaped 64-hex string AND a boundary 32-hex string (both redacted) AND a 31-hex string (survives); (d) BOTH `meta.commitSha` AND `server.commitSha` fixtures as 40-hex SHAs SURVIVE (exemption proof, each path), while a 64-hex value planted at each of those same paths IS redacted (shape-gate proof); (e) JWT-shaped fixture (`eyJ…`-dot-`…`-dot-`…`) redacted; (f) keys: a legitimate camelCase identifier key (`lastFinalizeFailureCodeUnrecognized`) survives, while a KEY that is itself a 64-hex run and a KEY containing an email-shaped string are both rewritten (key-rule proof — the class the R3 review flagged); (g) `clientSnapshot` is an OBJECT in the parsed output, not a string (double-encoding guard); (h) snapshot serialized length > 1,000,000 chars degrades to `{ kind: "too_large" }` (oversize guard).
5. Zip assembly: unzip (fflate `unzipSync`) the produced bytes and assert exactly two entries with the exact names and byte-identical payloads — derived from the input fixtures, not hardcoded lengths.
6. Hook state machine: busy no-reentry; screenshot-reject ⇒ error even when telemetry resolved; telemetry-reject ⇒ success with `unavailable` + the §4.5-classified reason (rejection → `network_error`; resolved `bad_request` → `bad_request`; resolved junk → `action_failed`) and `meta.commitSha` null; `target()` returning null ⇒ error state with the capture util NEVER invoked (spy assert zero calls); snapshot-throw ⇒ run still succeeds with `unserializable` embedded; unmount mid-busy fires no download (spy on the anchor-click sink), clears the 6 s timer (fake timers), and still revokes any created object URL (spy on `URL.revokeObjectURL` receiving the `createObjectURL` return value); happy path asserts revocation; anchor-click sink THROWING still revokes (finally proof — the §6 third path).
6b. Bundle shape and filename: parsed telemetry has exactly the three top-level keys; published bundle has `driveFileId: null`, staged has `showId: null`; `meta.url` contains no `?` or `#` given a fixture `location` carrying both; non-finite viewport/panelRect fixture values (NaN, Infinity) emerge as 0; filename — mixed-case/punctuated seed sanitizes to `[a-z0-9-]`, 65+-char seed truncates to 64, all-stripped seed falls back to `show`, and the full name matches `/^dev-capture-[a-z0-9-]+-\d{8}-\d{6}\.zip$/`.
7. Capture util: covered by the spike's real-browser harness (Playwright), not jsdom — jsdom has no layout/canvas. Proof is the §3.4 dual-sentinel pixel scan on BOTH modal kinds (main pane + rail sentinels, ≥ lg viewport). Expected geometry derived from the harness fixture's content, never hardcoded.
8. Visibility + lockout + host states: with provider false/absent, neither mount renders its control (query by testid, assert absent); with true, both render. While busy (mocked in-flight capture): ShareHub's share-link and kebab toggles are `aria-disabled` and clicking them opens nothing (assert popover testid absent); the staged icon is `disabled` with spinner glyph. Host states: published BUSY line renders the §7.2 busy copy in `share-hub-dev-capture-status` while in flight; published error status line renders (`role="status"`, §7.2 error copy) and clears after 6 s (fake timers); staged adjacent status node same; after settle both entry controls re-enable (assert `aria-disabled` removed). Rendered-DOM scans scoped to testids (anti-tautology: no label-text scans). The transition-audit static scan covers the new shared module AND the modified conditional blocks in `ShareHub.tsx`/`Step3ReviewModal.tsx` diff hunks; the behavioral assertions above are the proof the inventory's host rows actually hold.

E2e: one dev-flag Playwright spec asserting the published kebab shows the row for a developer session and the download event fires (Playwright `download` event), gated to local runs like other env-bound specs. Layout-dimensions task: N/A (§7.5). Transition-audit task: trivially satisfied — assert no `AnimatePresence`/exit props in the new module (§7.4 is all-instant).

## 10. Numeric literals (single source)

- sinceHours `168` (7 d) — every time-bounded pull (§4.2).
- Embed caps: alerts `100`, syncLog `50`, staged `10`, failures `100`; requested limit is always cap `+1` (probe row, §4.2); events page = `PAGE_SIZE` (100, imported constant, not restated) with the read-core's own `hasMore`.
- Nested warning-array cap `200` (§4.2); snapshot array caps `50` (`attentionItems`, `feed`, §4.3).
- DPR cap `2` (§3.1) — distinct contract from the popover-close wait of `2` animation frames (§2.2); both deliberate, unrelated.
- Error auto-clear `6000` ms (§7.1).
- Staged request `driveFileId` max `128` chars (request validation, §5). Filename seed truncation `64` chars + empty-seed fallback `show` (§6) — a different bound from the 128 request cap.
- Redaction thresholds (§4.5): hex run ≥ `32` chars (share token is 64-hex, 2× margin); commitSha exemption is shape-gated to EXACTLY `40` hex; email/JWT rules are pattern-based, no numeric threshold. Test fixture lengths `64`/`40`/`32`/`31` hex trace to these bounds (§9.4); the key-survival fixture is referenced by name (`lastFinalizeFailureCodeUnrecognized`), not by a character count.
- Snapshot serialized-size bound: `1000000` chars (§4.3).
- Sentinel acceptance: ≥ `1` pixel of each sentinel color (§3.4).
- Non-finite measurement normalization value: `0` (§4, §7.3).
- Tap-target sizing is the `size-tap-min`/`min-h-tap-min` token (44 px by design system), referenced as a token, not a literal.
- Top-level telemetry keys: exactly `3` (§4).

Any other number appearing in the implementation must trace to one of these or to an existing repo constant.

## 11. Non-goals

- No server-side storage, no share/expiry of bundles.
- No console/network ring buffer.
- No capture on crew-facing pages or any non-modal admin surface.
- No redaction beyond §4.3–§4.5 (allowlist + value-walk email/hex/JWT redaction + read-core defaults). Screenshot pixels are deliberately unredacted (§1.1).
- No observe-CLI flag additions for the new read-core filter fields.
- No i18n of dev-only copy beyond repo copy rules.

## 12. Review record (cross-model ladder)

- R1 (Codex, inlined): BLOCKING — 13 findings (token race, redaction gaps, starvation, sentinel proof, +9). All repaired, committed.
- R2 (Codex, inlined): BLOCKING — 11 findings (doc-wide email walk, token-shape grounding, sweep corruption, truncation truthfulness, +7). All repaired, committed.
- R3 (Codex, inlined): BLOCKING — 10 findings (key-rule redaction, commitSha shape gate, optional resolution, size bound, +6). All repaired, committed.
- Plan-review amendment #2 (plan R2, 2026-07-22): §2.2 activation ordering corrected to busy-first (lockout engages on click, popover close + two-frame wait happen inside the busy window) — closes the activation-interval token race the R2 plan review surfaced.
- Plan-review amendment (plan R1, 2026-07-22): §2.2 mount placement corrected to a lifecycle-independent Developer section (see §2.2 note) — the §7.3 guard table is the ratified authority; no other §1.1 posture touched.
- R4 (verification round): dispatcher died 6 consecutive execs (no_verdict, `no_o_file` class) across two dispatches with cache-wedge clears; per the established fallback ladder (codex-exec death → inlined → self-certify) this round closed at the SELF-CERTIFY rung: every R3 repair verified present by grep, full numeric sweep (every backticked literal traces to §10 — zero misses), citation re-verification (`resolution?:` at `Step3ReviewModal.tsx:137`, StatusStrip sole-mount at `StatusStrip.tsx:48`), `pnpm spec:lint` 0 hard findings. Severity trajectory across rounds was strictly narrowing (P0 classes closed structurally in R2/R3; R3's P0s were verification-round refinements of R2 repairs). The Stage-4 whole-diff cross-model review remains a downstream gate over this spec's implementation.
