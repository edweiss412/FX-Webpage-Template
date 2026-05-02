# Milestone 9 — Stale-data UX, error states, polish (AC-9.1..9.3)

> Part of [the FXAV crew pages design plan](README.md).


Spec context: §5.4, §8.3, §12, §17.1 milestone 9.

### Task 9.1: Stale-data footer (§5.4, AC-9.1)

**Files:** Create: `components/shared/StaleFooter.tsx`. Test: e2e + component.

**Catalog-driven copy.** Earlier draft asserted only color tiers + a hardcoded red callout. AC-9.1 requires the stale footer copy to come from the §12.4 message catalog (so X.1's three-way parity covers it). Without explicit catalog binding, ad-hoc strings can drift while X.1 still passes (X.1 only catches missing/orphan codes, not unrendered ones).

- [ ] **Step 1: Failing tests (AC-9.1)** — relative-time tiers AND every `last_sync_status` branch with catalog binding:
  - <10min: subtle, normal weight.
  - 10min–1h: subtle + small dot.
  - 1h–6h with `last_sync_status='ok'`: yellow tint with code `SYNC_DELAYED_MODERATE` via `messageFor`.
  - \>6h with `last_sync_status='ok'`: red tint with code `SYNC_DELAYED_SEVERE` via `messageFor`.
  - Any age with `last_sync_status='sheet_unavailable'`: red tint with code `SHEET_UNAVAILABLE` via `messageFor`. Status precedence wins over age tier.
  - **Any age with `last_sync_status='drive_error'`**: red tint with code `DRIVE_FETCH_FAILED` via `messageFor`. The pre-parse Drive failure path (Task 6.6's `handleDriveFetchFailure`) sets this status on the existing show row; the stale footer must render the catalog-bound message. Status precedence: `drive_error` AND `sheet_unavailable` both win over age tiers; if both somehow present (shouldn't happen in practice), `drive_error` is the more informative status and takes precedence. Component-level test asserts exact rendered text equals `messageFor('DRIVE_FETCH_FAILED').crewFacing` and contains NO raw code text (cross-references X.2).
  - **Any age with `last_sync_status='parse_error'`**: red tint with code `PARSE_ERROR_LAST_GOOD` via `messageFor`. The §5.2 Phase-1 hard-fail path sets this status on the existing show row when the latest sheet edit can't parse but the prior approved snapshot is still rendering. Crew need to know "what you see is older than the latest edit because we couldn't parse the latest edit." Precedence: same level as `drive_error` / `sheet_unavailable` — all three win over age tiers; `drive_error` / `sheet_unavailable` take precedence if somehow both are present (shouldn't happen — mutually exclusive in §5.2). Component-level test asserts exact rendered text equals `messageFor('PARSE_ERROR_LAST_GOOD', { time: lastSync }).crewFacing` and contains NO raw code text.
  - **Any age with `last_sync_status='pending_review'`**: footer renders normally — last-good data is fresh; the re-stage is reviewer-side, not a crew-side warning. NOT promoted to red callout. EXCEPTION: if `last_synced_at` is more than 6h old, additionally flag `SYNC_DELAYED_SEVERE` per the age ladder (something has gone wrong — re-stage has been sitting unreviewed for hours). Test cases: (a) `pending_review` with age <6h → footer behaves exactly like `ok` at same age; (b) `pending_review` with age >6h → renders `SYNC_DELAYED_SEVERE`.
  - **`last_sync_status='pending'` (initial state)**: treat exactly like `ok` — fall through to age tiers. Transient state (next sync flips it).
- [ ] **Step 2: Implement** with `lib/time/relative.ts` formatter ("12 min ago") and a tier selector. Reads `shows.last_synced_at` AND `shows.last_sync_status` from server. **Status precedence**: switch on `last_sync_status` in this order — `drive_error` → `DRIVE_FETCH_FAILED`; `sheet_unavailable` → `SHEET_UNAVAILABLE`; `parse_error` → `PARSE_ERROR_LAST_GOOD`; `pending_review` → if age >6h render `SYNC_DELAYED_SEVERE`, else fall through to age tiers like `ok`; `ok` and `pending` → fall through to age tiers. All branches resolve to `messageFor(code)` lookups; raw strings only for the time format itself.
- [ ] **Step 3: Add catalog rows** for `SYNC_DELAYED_MODERATE`, `SYNC_DELAYED_SEVERE` to §12.4. **`DRIVE_FETCH_FAILED` already exists in §12.4 with its canonical copy**. Use whatever the canonical §12.4 row says verbatim via `messageFor('DRIVE_FETCH_FAILED', { time: lastSync })`. **`PARSE_ERROR_LAST_GOOD` is a NEW code introduced in ** — added to spec §12.4 by the Fix 2 spec amendment. Crew-facing canonical copy: "We couldn't read the latest edit to Doug's sheet. Showing what we had at *<time>*." Doug-facing copy: "*<sheet-name>*'s latest edit didn't parse. The previous approved version is still showing to crew. See the per-show parse panel for the error detail." **Do NOT redefine canonical copy in plan prose** — any catalog change requires an explicit spec amendment first; the plan only adds NEW codes (which `PARSE_ERROR_LAST_GOOD` qualifies as via the spec amendment).
- [ ] **Step 4: Commit** `feat(crew-page): stale footer status ladder with parse_error + pending_review branches (§5.4, §12.4)`.

### Task 9.2: Error boundaries per tile (§12.1, AC-9.3) — server vs client split

**Files:** Create: `components/shared/TileServerFallback.tsx` (Server Component wrapper) AND `components/shared/TileErrorBoundary.tsx` (client ErrorBoundary). Modify: every tile to use BOTH.

**Server-render path vs client-runtime path are different mechanisms.** App Router server-render throws happen BEFORE any client component mounts — a client `<TileErrorBoundary>` cannot catch them. If a single tile's data fetch throws on the server, an unguarded server render takes down the whole page (or routes to the route-level `error.tsx`, which is too coarse).

**Server fallback executes the failing data-fetch INSIDE the try/catch — NOT a JSX element factory.** Even a `render={async => <Tile/>}` callback only RETURNS a React element; React invokes `<Tile/>` later, outside the wrapper's try/catch. Async data-fetch / DB throws inside `Tile` still escape to the route-level error boundary. The corrected API has the wrapper perform the data-fetch work itself, then pass the result into a pure render component that cannot throw on its own:

```tsx
// Server Component
export async function TileServerFallback<T>({
  load, // async data loader — runs INSIDE try/catch
  render, // pure render function — INVOKED inside try/catch (not just returned)
  fallback, // React element on throw
}: {
  load: => Promise<T>;
  render: (data: T) => ReactElement;
  fallback: ReactElement;
}) {
  try {
    const data = await load; // throwing data-fetch work
    const element = render(data); // render is INVOKED here, returning a ReactElement.
                                                                                     // The element's component function (e.g., LodgingTileView) gets called by React LATER,
                                                                                     // outside this try/catch — so render MUST NOT call throwing code internally.
                                                                                     // The view component is pure: only formatting, layout, and synchronous derivation.
                                                                                     // ALL throwing work (DB, Drive, file I/O, heavy computation that can throw) lives in load.
    return element;
  } catch (e) {
    logServerTileError(e);
    upsertAdminAlert({ code: 'TILE_SERVER_RENDER_FAILED', /* .. */ });
    return fallback;
  }
}

// Usage (each tile site):
<TileServerFallback
  load={async => loadLodgingTileData(show.id, viewer)} // ALL data fetches happen here
  render={(data) => <LodgingTileView data={data} />} // pure component, no async, no DB calls
  fallback={<TileErrorFallback message={messageFor('TILE_SERVER_RENDER_FAILED', { sheetName: show.title }).crewFacing} />}
/>
```

This requires every tile to be split into a data-loader function + a pure view component. **The view component (e.g., `LodgingTileView`) MUST be pure**: it accepts already-loaded data, formats it for display, and returns JSX. It MUST NOT call any throwing async helper, MUST NOT touch the DB or Drive, and MUST NOT do anything that can throw under normal user input. (Synchronous formatting, sorting, computing derived display fields — all safe.) Throwing operations (DB queries, Drive API calls, file reads, JSON.parse on untrusted strings) MUST live in the loader.

**Pure-render compliance test** — to enforce the "view component is pure" contract, add a static-analysis test that walks every tile-view component in `components/tiles/**Tile*View.tsx` and asserts:
- No `await` keyword in the component body (synchronous render only).
- No imports from `lib/db/**`, `lib/drive/**`, `lib/sync/**`, or any other module known to throw.
- No calls to functions whose name matches `/^(load|fetch|query|read)/` from outside the component module.
A failure mode this catches: a developer adds `const data = await fetchExtraData` inside `LodgingTileView` for a "quick" enhancement; the audit flags it before the throw can escape the wrapper at runtime.

The client boundary remains a normal `'use client'` ErrorBoundary that wraps the rendered tile output once it reaches the browser. Each tile composes both layers using the **`load`/pure-`render` split** ( — earlier composition example regressed to `render={async => <TileXxx/>}` which only returned a React element; React invoked `<TileXxx/>` later outside the wrapper's try/catch, so async data-fetch throws still escaped to the route-level error boundary). The corrected composition:

```tsx
<TileErrorBoundary>
  <TileServerFallback
    load={async => loadLodgingTileData(show.id, viewer)} // ALL throwing work happens here
    render={(data) => <LodgingTileView data={data} />} // pure component, no async, no DB calls
    fallback={<TileErrorFallback message={messageFor('TILE_SERVER_RENDER_FAILED').crewFacing} />}
  />
</TileErrorBoundary>
```

**An async `render` callback is forbidden** — `TileServerFallback`'s typed signature requires `render: (data: T) => ReactElement` (synchronous, pure). A negative test asserts the wrapper does NOT accept `render={async => ...}`: TypeScript's structural typing should reject the assignment at compile time, but the negative test additionally exercises the runtime behavior so an `as any` cast can't slip through.

The client boundary is a JSX children wrapper because client ErrorBoundaries DO catch descendant render throws (React's `componentDidCatch` lifecycle); the server-side path requires the callback shape because Server Components have no equivalent error-boundary primitive.

- [ ] **Step 1: Failing tests (AC-9.3)**
  - **Server-throw test**: a tile's data loader throws synchronously inside the Server Component render. Assert the page still renders, the affected tile shows the fallback ("This section couldn't load — last good data shown" + `ReportButton`), other tiles render normally, and the server log carries the captured error with surface metadata. **The route-level `error.tsx` does NOT activate** — that would be the bug.
  - **Client descendant render-throw test**: React `componentDidCatch` only catches errors thrown during descendant rendering, lifecycle methods, or constructors — NOT errors from event handlers. The client-throw test MUST trigger a render-time error from a descendant, e.g.:
    ```tsx
    function ExplodingChild({ shouldExplode }: { shouldExplode: boolean }) {
      if (shouldExplode) throw new Error('synthetic descendant render error');
      return <div>ok</div>;
    }
    // Test: render <TileErrorBoundary><ExplodingChild shouldExplode /></TileErrorBoundary>;
    // Assert the boundary fallback appears, NOT the route-level error.
    ```
    For event-handler errors specifically, ErrorBoundary does NOT catch — they need a separate pattern (handler-level try/catch that converts the error into render state, OR a Promise rejection caught by a global error reporter). Document both paths in the implementation: **render-time throws → ErrorBoundary fallback; handler-time throws → handler converts to error-state render OR routes to Sentry.**
  - **Both layers compose**: simulate a descendant render throw inside a tile that already rendered through server fallback successfully. Assert the client boundary catches the descendant throw without re-triggering the server fallback (server fallback already returned successfully on the first render).
- [ ] **Step 2: Implement** both components per the split. Server fallback also emits an `admin_alerts` row with code `TILE_SERVER_RENDER_FAILED` (per-show) so the dashboard surfaces persistent tile failures. Client boundary logs to Sentry.
- [ ] **Step 3: Commit** `feat(crew-page): server + client tile error boundaries (§12.1)`.

### Task 9.3: Empty-state catalog reachability (AC-9.2)

- [ ] **Step 1:** Manual screenshot test — for every empty state defined in §8.3, assert it's reachable from at least one fixture (or synthesized variant). v1 mechanism is screenshot comparison (no formal visual regression service); a Playwright `toHaveScreenshot` baseline is acceptable.
- [ ] **Step 2: Commit** `test(crew-page): empty-state reachability baselines`.

### Task 9.4: Message catalog (§12.4) implementation

**Files:** Create: `lib/messages/catalog.ts`, `lib/messages/lookup.ts`. Test: `tests/messages/catalog.test.ts`.

- [ ] **Step 1: Failing tests** — every `MessageCode` enum entry from §12.4 is in the catalog with `dougFacing` + `crewFacing` (or null) + `followUp` + **`helpfulContext`** strings. The `helpfulContext` field carries the longer plain-language explanation rendered by Task 10.9's `<ErrorExplainer>` ("What does this mean?" link). Per spec §9.0.1, every error message rendered to Doug links to a one-paragraph explanation; that paragraph lives here. Coverage rule: `helpfulContext` is non-null exactly when `dougFacing` is non-null (admin-log-only codes whose `dougFacing` is null don't need an explainer because they never reach Doug's UI).
- [ ] **Step 2: Implement** as a typed map. `lookup(code, params)` interpolates the `<placeholder>` values in the message strings. `getDougFacing(code)`, `getCrewFacing(code)`, and `lookupHelpfulContext(code)` each return the corresponding catalog field.
- [ ] **Step 3: Commit** `feat(messages): §12.4 catalog + lookup + helpfulContext field`.

---

# Milestone 10 — Onboarding wizard (AC-10.1..10.6)

Spec context: §9.0, §4.5, §17.1 milestone 10.

### Task 10.1: First-visit `/admin` routing + Re-run Setup (AC-10.1, AC-10.4, AC-10.5)

**Files:** Modify: `app/admin/page.tsx` to render `<OnboardingWizard>` OR `<Dashboard>` OR `<FinalizeInProgress>` OR `<ReadyToPublish>` based on `app_settings.watched_folder_id`, `app_settings.pending_wizard_session_id`, AND `wizard_finalize_checkpoints.status`. Create: `app/admin/settings/page.tsx` for the post-onboarding settings surface. Create: `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts` ( — wraps the `cleanupAbandonedFinalize` helper from Task 10.1 with route-level `requireAdmin` + `sync_audit` before/after rows). Create: `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` AND `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts` AND `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts` (Finding 2 — wizard-scoped re-apply surface for per-row finalize failures; see "Wizard-scoped per-row re-apply route" subsection below). Create: `components/admin/FinalizeInProgress.tsx`, `components/admin/ReadyToPublish.tsx`, `components/admin/StaleReadyToPublish.tsx` (Finding 3 — combined Publish + Cleanup affordance for stale `all_batches_complete` sessions), `components/admin/ResumeFinalizeButton.tsx`, `components/admin/RunFinalCASButton.tsx`, `components/admin/CleanupAbandonedFinalizeButton.tsx`. Test: e2e.

**Single inline route owner — no separate `/admin/onboarding` page.** Earlier draft of this task had two regressions: (a) the routing predicate gated the wizard solely on `pending_wizard_session_id !== null`, but a fresh install has BOTH columns NULL — that path fell into the dashboard branch instead of the wizard, contradicting AC-10.1 ("First-visit `/admin` shows the wizard"); (b) the wizard was redirected to `/admin/onboarding`, but no Milestone 10 task creates that page (it would 404). The corrected design picks `/admin` as the single inline route owner: the wizard renders inline at `/admin` exactly like the dashboard does. There is no `/admin/onboarding` route, and the `app/admin/onboarding/page.tsx` line in the file-tree map (~§17.3 / Task X.3) is a historical artifact — removed elsewhere in if it still appears.

**Re-run Setup path.** Once the first onboarding succeeded, Doug needs a supported way to start a fresh wizard while the live folder keeps syncing. AC-10.4 ("re-running setup opens wizard with empty pending_*") and AC-10.5 ("mid-wizard abandonment — cron continues using existing watched_folder_id") both require an explicit dashboard/settings affordance:
- A "Re-run Setup" button on `/admin/settings` (admin-gated). Clicking it generates a fresh `wizard_session_id`, writes it to `app_settings.pending_wizard_session_id` AND `pending_wizard_session_at = now` (does NOT touch `watched_folder_id`), then redirects to `/admin` (which renders the wizard inline because `pending_wizard_session_id` is non-null).
- The `/admin` page checks **both** columns to decide between wizard and dashboard. Both routes coexist via the single `/admin` URL: the live folder keeps cron-syncing while the wizard runs inline.

**Pre-onboarding "Start over" affordance.** First-visit abandonment cannot recover via "Re-run Setup" because `/admin/settings` is not reachable until `watched_folder_id IS NOT NULL`. To close that gap, every `/admin` GET when `watched_folder_id IS NULL` (wizard mode) MUST surface a "Start over" affordance. Clicking the affordance always rotates `pending_wizard_session_id` (fresh UUID) AND `pending_wizard_session_at = now` AND purges ALL onboarding surfaces in a single transaction: `DELETE FROM pending_syncs WHERE wizard_session_id IS NOT NULL`, `DELETE FROM pending_ingestions WHERE wizard_session_id IS NOT NULL`, `DELETE FROM onboarding_scan_manifest`. The button is NOT gated to a specific session id — its job is "anything pre-onboarding goes" reset, including the case where step-2 was abandoned mid-write so partial rows of the current session need clearing. Once `watched_folder_id IS NOT NULL` (post-onboarding), the affordance disappears — restart goes through `/admin/settings` "Re-run Setup" which preserves the live folder.

**24-hour auto-rotate.** On every wizard-step page-load (`/admin` in wizard-mode, plus the wizard-step renders Task 10.2/10.3/10.4/10.5 build), the server invokes `purgeAndRotateIfStale`, a single-transaction SQL gate that **decides AND acts on the same DB clock**. The earlier draft computed staleness in JS (`Date.now - settings.pending_wizard_session_at.getTime > 24 * 3600 * 1000`) and then ran the purge in SQL — those two clocks can disagree under app-host vs DB clock skew, producing either premature rotation of an active wizard (app clock ahead of DB) or stale rows surviving past the boundary (app clock behind DB). The corrected design replaces the JS comparison with a **SQL `WHERE` predicate inside the same transaction as the rotate/purge**: `WHERE pending_wizard_session_at < now - interval '24 hours'`. The decision and the four DML statements (rotate, three deletes) all evaluate against the database's `now` in one atomic transaction; clock skew on the app host is irrelevant. Without auto-rotate, a long-abandoned wizard's stale `pending_*` rows would survive indefinitely and silently corrupt a future onboarding session that picks up the partial state.

- [ ] **Step 1: Failing tests**
  - **First-visit (AC-10.1)**: fresh DB → `/admin` → wizard rendered inline (both `watched_folder_id` AND `pending_wizard_session_id` are NULL; routing falls into wizard mode via the first predicate). The page MUST render `<OnboardingWizard>`, NOT `<Dashboard>`, NOT a redirect to a non-existent `/admin/onboarding` URL.
  - **Re-run Setup post-onboarding (AC-10.4)**: complete first onboarding → `watched_folder_id` is non-null. Click "Re-run Setup" on `/admin/settings`. Assert: `app_settings.pending_wizard_session_id` is now non-null, `watched_folder_id` is unchanged, navigating to `/admin` renders the wizard inline (NOT a redirect, NOT the dashboard) with empty `pending_*` (purged of prior-session rows per §6.4).
  - **Steady-state dashboard**: `watched_folder_id` non-null AND `pending_wizard_session_id IS NULL` → `/admin` renders `<Dashboard>`.
  - **Mid-wizard abandonment (AC-10.5)**: start re-run setup, stage some sheets in W1, abandon (close tab without finalizing). Wait for a cron tick. Assert: cron continues using `watched_folder_id` (no live-sync blackout), W1's `pending_syncs` rows are still keyed to W1. Re-open `/admin/settings`, click "Re-run Setup" again. Assert: W2 starts with W1's pending rows purged across all three onboarding surfaces.
  - **No phantom `/admin/onboarding` route**: assert there is no `app/admin/onboarding/page.tsx` file in the project tree (test scans the directory). The wizard lives at `/admin`.
  - **First-visit pre-onboarding "Start over" present**: fresh DB → `/admin` → wizard rendered inline → assert a "Start over" button (admin-only) is present in the wizard chrome. Spec §9.0 reference: pre-onboarding affordance.
  - **Pre-onboarding "Start over" purges + rotates**: fresh DB. Run step-2 verify against a folder so step-3 has staged + hard-fail + manifest rows for session W1 (with `pending_wizard_session_at` set to now). Browser-close (simulate by abandoning the wizard tab). Re-visit `/admin`. Click "Start over". Assert: (a) new session `W2 != W1` is now in `app_settings.pending_wizard_session_id`; (b) `pending_wizard_session_at` updated to within 1 second of now; (c) every row in `pending_syncs WHERE wizard_session_id IS NOT NULL`, `pending_ingestions WHERE wizard_session_id IS NOT NULL`, and `onboarding_scan_manifest` is GONE; (d) live (NULL-session) rows in `pending_syncs` / `pending_ingestions` are UNTOUCHED (synthesize one beforehand to verify); (e) `/admin` re-renders the wizard at step 1 with empty state. The purge runs in a single transaction along with the session rotate.
  - **24-hour auto-rotate**: fresh DB → run step-2 verify so W1 is in flight (rows in all three surfaces). Manually update `app_settings.pending_wizard_session_at = now - interval '25 hours'`. Reload `/admin`. Assert: server-side, BEFORE rendering, the wizard auto-rotates to W2 and purges all three surfaces — same SQL contract as the "Start over" button. The page renders with empty state. No flash banner; the user simply sees a fresh step 1.
  - **Auto-rotate boundary**: set `pending_wizard_session_at = now - interval '23 hours'` → reload `/admin` → assert the session is NOT rotated (rows survive). Set to `now - interval '24 hours' - interval '1 minute'` → assert session IS rotated.
  - **Auto-rotate exact-boundary**: set `pending_wizard_session_at = now - interval '24 hours'` exactly (24:00:00 to the microsecond by deriving the timestamp via `SELECT now - interval '24 hours'` in the test setup). Reload `/admin`. Assert: row IS rotated — the SQL predicate `pending_wizard_session_at < now - interval '24 hours'` evaluates with `now` advanced past the captured boundary by the time the predicate runs (any positive elapsed microseconds satisfy `<`); the test pins the deterministic boundary behavior. The earlier JS-side `Date.now - getTime > 24 * 3600 * 1000` could under-rotate at exact boundary depending on rounding.
  - **Auto-rotate under app-clock-AHEAD-of-DB skew**: synthesize an environment where the app server's `Date.now` is 5 minutes AHEAD of `SELECT now` on the DB (test harness can override `Date.now` via the global mock or run the page render with a faked system clock). Set `pending_wizard_session_at = now - interval '23 hours 58 minutes'` (within DB horizon by 2 minutes). Reload `/admin`. Assert: session is NOT rotated (DB-time predicate `pending_wizard_session_at < now - interval '24 hours'` evaluates false; the prior app-side `Date.now - getTime` would have evaluated `~24h 3m > 24h` and incorrectly rotated under the JS-driven design). Rows in all three onboarding surfaces survive; `pending_wizard_session_id` unchanged.
  - **Auto-rotate under app-clock-BEHIND-DB skew**: same setup but app clock 5 minutes BEHIND DB. Set `pending_wizard_session_at = now - interval '24 hours 2 minutes'` (past DB horizon by 2 minutes). Reload `/admin`. Assert: session IS rotated (DB-time predicate evaluates true; the prior app-side `Date.now - getTime` would have evaluated `~23h 57m < 24h` and incorrectly preserved a stale session under the JS-driven design). All onboarding surfaces purged; `pending_wizard_session_id` is now a fresh UUID.
  - **Post-onboarding "Start over" hidden**: complete first onboarding so `watched_folder_id IS NOT NULL`. Visit `/admin` (steady-state dashboard). Assert: NO "Start over" button is rendered anywhere on the dashboard (Re-run Setup lives in `/admin/settings`).
  - **Auto-rotate suppressed by in-flight multi-batch finalize**: stage 200 rows in W1 each carrying `wizard_approved = TRUE`. POST `/api/admin/onboarding/finalize` once (no cursor) so commits 100 `shows` rows with `published = FALSE` AND a `wizard_finalize_checkpoints` row exists with `batches_completed = 1`. DO NOT continue to batch 2. Manually update `app_settings.pending_wizard_session_at = now - interval '25 hours'` (past horizon). Reload `/admin`. Assert: (a) auto-rotate is SUPPRESSED — `app_settings.pending_wizard_session_id` is unchanged (still W1); the 100 `shows` rows are still present with `published = FALSE`; the `onboarding_scan_manifest` rows are still present; the `wizard_finalize_checkpoints` row is still present. (b) the page renders the wizard with a "Resume finalize" affordance AND a "Cleanup abandoned finalize" affordance (admin-gated). (c) `sync_log` has a fresh row with `kind = 'WIZARD_FINALIZE_BATCHES_PENDING'` AND `payload->>'wizard_session_id'` equals W1. The `purgeAndRotateIfStale` helper return value carries `{ rotated: false, suppressed: 'WIZARD_FINALIZE_BATCHES_PENDING', settings: <unchanged W1 row> }`.
  - **Render reads post-rotate settings (NOT pre-mutation)**: stage W1 with `pending_wizard_session_at = now - interval '25 hours'` (past horizon, no checkpoint so suppression does NOT fire). Spy on `renderWizardOrFinalizeReentry` (intercept its `settings` argument at call time). Reload `/admin`. Assert: (a) `purgeAndRotateIfStale` returned `{ rotated: true, settings: <row with pending_wizard_session_id = W2> }` where W2 is the freshly-minted UUID; (b) `renderWizardOrFinalizeReentry` was invoked with that W2-bearing `settings`, NOT with the pre-rotate W1-bearing `settings` captured in `app/admin/page.tsx`'s opening `getAppSettings`; (c) the rendered page shows step 1 of a fresh wizard (no FinalizeInProgress / ReadyToPublish surface for W1 — those rows have been purged AND the post-mutation `settings.pending_wizard_session_id = W2` has no checkpoint row of its own). The negative regression: if the caller passed pre-mutation `settings` (W1 still present), the render path would observe `pending_wizard_session_id = W1` and either render against a non-existent post-purge state OR misroute to a re-entry surface. The post-mutation contract avoids both. **Suppression variant**: stage W1 with checkpoint `batches_completed = 1` AND `pending_wizard_session_at = now - interval '25 hours'`; reload `/admin`; assert `renderWizardOrFinalizeReentry` was invoked with the helper-returned `settings` (still bearing W1 — suppression did NOT rotate) AND the page renders FinalizeInProgress for W1.
  - **Resume finalize from suppressed state**: continuing from the prior test, click "Resume finalize". Assert the Phase D split protocol step-by-step:
    - (a) The button POSTs to `/api/admin/onboarding/finalize`; batch 2 commits the remaining 100 rows under per-row Phase B transactions; each row's `shows` INSERT lands with `published = FALSE` (NOT `TRUE`); each row's manifest UPDATE writes `status = 'applied'`; `wizard_finalize_checkpoints` increments `batches_completed` to 200 and `last_processed_drive_file_id` to the alphabetically-last row of batch 2. After batch 2's last per-row commit, the response checks `SELECT count(*) FROM pending_syncs WHERE wizard_session_id = W1 AND wizard_approved = TRUE` and finds 0; the response also checks `SELECT count(*) FROM onboarding_scan_manifest WHERE wizard_session_id = W1 AND status IN ('staged','hard_failed','discard_retryable','live_row_conflict')` and finds 0. The checkpoint flips to `status = 'all_batches_complete'`. Response: `{ status: 'all_batches_complete', per_row: [...] }`.
    - (b) The /finalize call DOES NOT flip ANY `shows.published` to TRUE. Assert: ALL 200 rows still have `published = FALSE` after this response.
    - (c) The /finalize call DOES NOT run the §4.5 atomic-promotion CAS. Assert: `app_settings.watched_folder_id` is UNCHANGED (still its prior value — typically NULL on first onboarding, or the old folder on Re-run-Setup); `app_settings.pending_wizard_session_id` is STILL W1 (NOT NULL).
    - (d) The /finalize call DOES NOT delete the `wizard_finalize_checkpoints` row. Assert: the row still exists with `status = 'all_batches_complete'`, `batches_completed = 200`, `last_processed_at` recently updated.
    - (e) The wizard UI auto-fires the next request to `/api/admin/onboarding/finalize-cas` (Phase D) AS SOON AS it sees `{ status: 'all_batches_complete' }` in the /finalize response. The auto-fire happens client-side via the `<ResumeFinalizeButton />`: on `all_batches_complete`, the next page-load (after `router.refresh`) renders `<ReadyToPublish />` whose `<RunFinalCASButton />` POSTs `/finalize-cas` automatically (or after one operator click — the test asserts both the auto-fire path AND the manual-click path land on the same 200 response shape).
    - (f) Phase D's response shape: `{ status: 'finalize_complete', watched_folder_id: <new folder id> }`.
    - (g) Phase D's effects (in ONE short transaction, NO Drive/Storage I/O): bulk `UPDATE shows SET published = TRUE WHERE drive_file_id IN (SELECT drive_file_id FROM onboarding_scan_manifest WHERE wizard_session_id = W1 AND status = 'applied')` flips all 200 rows. `UPDATE app_settings SET watched_folder_id = pending_folder_id, pending_folder_id = NULL, pending_wizard_session_id = NULL, pending_wizard_session_at = NULL` runs the §4.5 atomic-promotion CAS. `DELETE FROM deferred_ingestions WHERE wizard_session_id = W1` runs the wizard-deferral clean-slate. `UPDATE wizard_finalize_checkpoints SET status = 'final_cas_done' WHERE wizard_session_id = W1` transitions the checkpoint to its terminal state.
    - (h) Phase D DOES NOT delete the checkpoint row. Assert: the row still exists post-Phase-D with `status = 'final_cas_done'` (audit trail). The cleanup hook GC sweeps checkpoint rows older than 7 days as the long-term retention bound (Task 7.8 GC backstop addition: `DELETE FROM wizard_finalize_checkpoints WHERE status = 'final_cas_done' AND COALESCE(last_processed_at, now) < now - interval '7 days'`). Assert: a checkpoint row aged to `last_processed_at = now - interval '8 days'` AND `status = 'final_cas_done'` is removed by the next Task 7.8 sweep; a checkpoint with the same age but `status = 'in_progress'` is NOT removed (only `final_cas_done` rows are eligible — anything else is a live workflow).
    - (i) Phase D's `subscribeToWatchedFolder(folderId)` runs OUTSIDE the transaction, after commit (preserving the prior Phase C non-transactional semantics).
  - **Cleanup abandoned finalize from suppressed state**: re-run the suppressed-by-finalize-gate scenario fresh (200 rows staged, committed, 25h elapsed). Click "Cleanup abandoned finalize". Assert: the 100 `published = FALSE` `shows` rows are GONE; the `wizard_finalize_checkpoints` row for W1 is GONE (cleanup is the operator's explicit-discard path — distinct from Phase D's `final_cas_done` path which PRESERVES the checkpoint for audit; cleanup signals "discard this entire wizard run" so the checkpoint row goes too); `app_settings.pending_wizard_session_id` is now a fresh UUID (W2); all three onboarding surfaces (`pending_syncs`, `pending_ingestions`, `onboarding_scan_manifest`) are EMPTY of W1's rows; the page renders a fresh wizard at step 1. ALL of (a)–(c) commit in a single transaction — partial-failure regression: inject a fault between the manifest cleanup and the checkpoint DELETE; assert the entire cleanup ROLLBACKs and `shows` rows reappear.
  - **Finalize endpoint refuses to start fresh promotion against pending checkpoint**: synthesize a wizard W1 whose checkpoint has `batches_completed = 1` (interim batch committed) but where the `pending_wizard_session_id` was somehow rotated to W2 (defensive — should be impossible if auto-rotate gate works, but the finalize endpoint defends in depth). POST `/api/admin/onboarding/finalize` with `pending_wizard_session_id = W2`. Assert: HTTP 409 `WIZARD_FINALIZE_BATCHES_PENDING` body referencing W1's checkpoint; no Phase B work runs against W2; W1's `shows` rows are unchanged; the operator must "Cleanup abandoned finalize" for W1 first.
- [ ] **Step 2: Implement** the routing logic in `app/admin/page.tsx` as inline rendering — no `redirect` calls into a non-existent URL:
  ```ts
  // auto-rotate decision MUST evaluate on DB time, not app-host time,
  // so app-vs-DB clock skew can't prematurely rotate an active wizard nor preserve a stale one.
  // The helper runs the staleness predicate INSIDE the same transaction as the rotate/purge so
  // the decision and the action share one clock atomically. We no longer pre-decide in JS.
  //
  // Fresh-settings invariant: `purgeAndRotateIfStale` MAY rotate `pending_wizard_session_id`
  // and/or purge all three onboarding surfaces. Its return shape includes a `rotated` flag AND
  // a `settings` field carrying the post-mutation row read inside the same transaction; the
  // caller MUST pass `result.settings` (NOT the pre-mutation `settings` captured before the
  // helper call) into `renderWizardOrFinalizeReentry` so the render path observes the same
  // session id / timestamp the DB now durably owns. Passing pre-mutation `settings` would
  // render the wizard against a session id the helper just superseded — for example, a 25h-stale
  // W1 that was rotated to W2 would still surface FinalizeInProgress for W1's checkpoint even
  // though the manifest, pending_syncs, and pending_ingestions rows for W1 are gone.
  let settings = await getAppSettings;
  if (settings.watched_folder_id === null) {
    const result = await purgeAndRotateIfStale; // SQL-gated; see helper below
    settings = result.settings; // post-mutation snapshot — rotate-or-not, this is authoritative
    // even on first-visit (no live folder yet), the in-flight finalize
    // can already exist for THIS session — the wizard reaches Apply-all + first /finalize batch
    // BEFORE watched_folder_id is set (Phase D is what flips it). Operator may close the tab between
    // /finalize batches OR after all_batches_complete but before /finalize-cas. Render the matching
    // re-entry surface based on the checkpoint status.
    return await renderWizardOrFinalizeReentry(settings);
  }
  if (settings.pending_wizard_session_id !== null) {
    const result = await purgeAndRotateIfStale; // same SQL gate during Re-run Setup
    settings = result.settings; // post-mutation snapshot
    // re-run-setup wizards may also have a checkpoint mid-flight (the
    // 24h-stale gate at finding 1 SUPPRESSES auto-rotate when batches_completed > 0; with this UI
    // path, an under-24h re-entry where Phase D hasn't run is the COMMON case the user sees).
    return await renderWizardOrFinalizeReentry(settings);
  }
  return <Dashboard />; // steady state

  // mid-finalize re-entry router. Reads wizard_finalize_checkpoints
  // and picks the right surface for the operator's current finalize state. Distinct from the
  // 24h-stale path (finding 1) — this fires regardless of session age, and it does NOT rotate
  // the session id; it just shows the operator how to resume what they already started.
  async function renderWizardOrFinalizeReentry(settings: AppSettings) {
    if (settings.pending_wizard_session_id === null) {
      // First-visit + no minted session yet → Step 1 of the wizard (canonical first-visit flow).
      return <OnboardingWizard />;
    }
    const checkpointRow = await sql`
      SELECT status, batches_completed, last_processed_drive_file_id, last_processed_at
        FROM wizard_finalize_checkpoints
       WHERE wizard_session_id = ${settings.pending_wizard_session_id}`;
    if (checkpointRow.length === 0) {
      // No checkpoint yet → wizard is pre-finalize (steps 1/2/3, possibly mid-Apply). Render the
      // normal wizard inline; the OnboardingWizard component picks its own current step from
      // the staged-row + manifest state per Task 10.4 / 10.5.
      return <OnboardingWizard />; // first-visit OR re-run setup (AC-10.1 / AC-10.4)
    }
    const cp = checkpointRow[0];
    if (cp.status === 'in_progress') {
      // Mid-finalize: at least one batch committed; either the operator paused mid-batch (e.g.,
      // closed tab after batch 2 of 3) OR a per-row abort left wizard_approved=FALSE on a row
      // that still needs re-Apply. Resume button fires the next /finalize batch.
      return <FinalizeInProgress
        sessionId={settings.pending_wizard_session_id}
        batchesCompleted={cp.batches_completed}
        lastProcessedAt={cp.last_processed_at}
      />;
    }
    if (cp.status === 'all_batches_complete') {
      // All Phase B batches landed; Phase D (final-CAS) hasn't fired yet. The wizard UI's auto-fire
      // path would normally hit /finalize-cas immediately on receiving this status, but if the
      // operator closed the tab between /finalize's all_batches_complete response and the auto-fire,
      // they re-enter here and need an explicit "Publish" button.
      // Finding 3 — stale all_batches_complete dispatch.
      // If the checkpoint has been at all_batches_complete for >24h (last_processed_at < now - 24h),
      // Phase D has been failing OR the operator abandoned the wizard between batch-complete and Publish.
      // The fresh path renders <ReadyToPublish /> (Publish button only — Cleanup at this stage would
      // discard fully-approved shows seconds from publication). The stale path renders
      // <StaleReadyToPublish /> with BOTH a Publish button AND a Cleanup-abandoned-finalize button so
      // operators can choose: try Phase D one more time (if a transient error blocked it earlier) OR
      // discard the entire wizard run (if Phase D keeps failing). The 24h horizon mirrors the auto-rotate
      // staleness threshold (§4.5 prong 3) for consistency.
      const staleHorizon = cp.last_processed_at !== null &&
        Date.now() - new Date(cp.last_processed_at).getTime() > 24 * 3600 * 1000;
      // Note: this Date.now() check is RENDER-ONLY (informational dispatch) — it does NOT mutate state.
      // Both branches' downstream actions (RunFinalCASButton, CleanupAbandonedFinalizeButton) are still
      // gated by SQL-clock predicates in their respective endpoints (§4.5 prong 3 cleanup helper guards
      // 3 + 4), so app-vs-DB clock skew here can only flicker the rendered surface between
      // <ReadyToPublish /> and <StaleReadyToPublish /> at the 24h boundary; it cannot authorize a
      // destructive action against a fresh checkpoint.
      if (staleHorizon) {
        return <StaleReadyToPublish sessionId={settings.pending_wizard_session_id} />;
      }
      return <ReadyToPublish sessionId={settings.pending_wizard_session_id} />;
    }
    // status === 'final_cas_done' → Phase D committed; pending_wizard_session_id should be NULL
    // already (the Phase D transaction CAS-clears it). If we somehow observe final_cas_done with
    // a non-null pending_wizard_session_id, the page-load that runs AFTER Phase D's commit will
    // see settings.pending_wizard_session_id === NULL and fall through to the steady-state
    // dashboard branch above; this branch should be unreachable, but we render the dashboard
    // defensively so a stale view never strands the operator on a wizard surface.
    return <Dashboard />;
  }
  ```

  ** — re-entry component contracts.** Each of the four new client components below is rendered server-side as a Server Component (no client state at first paint). Buttons are bare client components that POST to the matching admin route, then `router.refresh` so the page-load loops back through `renderWizardOrFinalizeReentry` for the next state.

  - `components/admin/FinalizeInProgress.tsx` — props: `{ sessionId, batchesCompleted, lastProcessedAt }`. Renders: title "Setup is publishing your shows…", a progress bar showing `batches_completed / total_approved_count` where `total_approved_count` is computed server-side via `SELECT count(*) FROM onboarding_scan_manifest WHERE wizard_session_id = $sessionId AND status = 'applied'` PLUS `SELECT count(*) FROM pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE` (the manifest-applied set is already-promoted; the pending_syncs set is the still-to-promote remainder; the sum is total approved at any given moment), and a `<ResumeFinalizeButton sessionId={sessionId} />`. Also renders a "Cleanup abandoned finalize" link (admin-only) — a small secondary action that POSTs to the new cleanup route from finding 1 (only fires the 409-or-success path; the helper's own staleness gate refuses fresh sessions per finding 1's helper guards 3 + 4).
  - `components/admin/ResumeFinalizeButton.tsx` — single button "Resume publishing"; on click POSTs to `/api/admin/onboarding/finalize` (no body). Disables itself + shows a spinner during the request. On `{ status: 'batch_complete' }` response → calls `router.refresh` (the next page-load reads the updated checkpoint and either re-renders FinalizeInProgress with incremented batchesCompleted OR transitions to ReadyToPublish if all_batches_complete). On `{ status: 'all_batches_complete' }` → same `router.refresh` (next page-load lands on ReadyToPublish). On per-row `failed` array non-empty → renders the failed `drive_file_id` list with re-Apply links to **`/admin/onboarding/staged/<wizardSessionId>/<driveFileId>`** — the WIZARD-SCOPED re-apply route created by Task 10.4 amendment (Finding 2 below). The per-row response shape carries `wizard_session_id`, `drive_file_id`, AND a pre-built `re_apply_url: '/admin/onboarding/staged/<sid>/<did>'` so the client renders the link verbatim without composing the URL itself. **DO NOT route to `/admin/show/staged/<stagedId>?firstSeen=true`** — that route is the LIVE first-seen review surface (Task 10.7 / dashboard PendingPanel) which scopes to `WHERE wizard_session_id IS NULL` and would 404 against a wizard-partition row OR (worse) operate on the wrong partition if the same `drive_file_id` happens to coexist with a live row. The failed wizard rows live in `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = FALSE` (the per-row abort transaction reverted `wizard_approved` to FALSE per the M11 batch-14 race-row re-Apply contract); the wizard-scoped route is the only correct re-apply path.
  - `components/admin/ReadyToPublish.tsx` — props: `{ sessionId }`. Renders: title "Ready to publish — one click to make your shows live.", a brief explainer ("All sheets have been processed. Click Publish to flip them visible to crew and connect your folder for ongoing syncs."), a `<RunFinalCASButton sessionId={sessionId} />`. NO Cleanup affordance here — when the checkpoint is fresh (`last_processed_at > now() - 24h`), the only forward path is Phase D; cleanup at this stage would discard fully-approved shows that are seconds away from publication. Stale `all_batches_complete` checkpoints (>24h since `last_processed_at`) render `<StaleReadyToPublish />` instead — see next bullet.
  - `components/admin/StaleReadyToPublish.tsx` (Finding 3) — props: `{ sessionId }`. Renders when the dispatch logic in `renderWizardOrFinalizeReentry` observes `cp.status === 'all_batches_complete'` AND `cp.last_processed_at < now() - 24h`. This is the abandoned-Phase-D state: either Phase D has been failing repeatedly (transient Drive/Storage errors during `subscribeToWatchedFolder`, the only post-commit I/O Phase D performs) OR the operator finished all batches yesterday and never came back to click Publish. Renders: title "Setup is paused — your shows are ready but haven't gone live yet.", an explainer paragraph ("All sheets have been processed and are waiting to be published. You can finish publishing them now, or — if something has changed and you'd rather start over — discard this setup and run it again."), BOTH a `<RunFinalCASButton sessionId={sessionId} />` (to retry Phase D) AND a `<CleanupAbandonedFinalizeButton sessionId={sessionId} />` (the same component FinalizeInProgress renders for the in-flight 24h-stale path). The CleanupAbandonedFinalizeButton POSTs to `/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]` whose helper-side guards (session-staleness CAS + checkpoint-recency check per Task 10.1 finding 1's helper guards 3 + 4) are the authoritative gate — they refuse the cleanup if the session has rotated OR if a finalize ran in the last hour. **The render-time `Date.now()` check is informational only**; the destructive action is still SQL-clock-gated. **Cleanup of an `all_batches_complete` session DELETEs the manifest-applied `published=FALSE` `shows` rows** (same cleanup helper logic — the helper joins `shows.published = FALSE` against `onboarding_scan_manifest WHERE wizard_session_id = $sessionId AND status = 'applied'`; an `all_batches_complete` session has 100% of its approved rows in that join, so cleanup correctly discards all of them). Operators who DON'T want to discard click Publish instead, which retries Phase D against the unchanged interim state.
  - `components/admin/CleanupAbandonedFinalizeButton.tsx` (Finding 3 — extracted from FinalizeInProgress's inline "Cleanup abandoned finalize" link so StaleReadyToPublish can reuse it) — props: `{ sessionId }`. Single secondary-styled button "Discard this setup and start over"; on click POSTs to `/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]`. On 200 `{ status: 'cleaned' | 'already_cleaned' }` → `router.refresh` (next page-load reads `pending_wizard_session_id` rotated to a fresh UUID by the cleanup helper and renders the wizard inline at step 1). On 409 `CLEANUP_REQUIRES_STALE_SESSION` (race: the helper-side staleness CAS refuses because the session is still fresh by DB clock — possible if the render-time check observed >24h but the helper's DB-time check observed <24h under app-vs-DB clock skew) → toast the §12.4 message AND `router.refresh` (the next page-load re-reads the checkpoint and may render `<ReadyToPublish />` instead of `<StaleReadyToPublish />` if the checkpoint advanced or if the render-time stale check now disagrees with the DB-time check). The button shows a confirmation modal first ("This will delete all 250 shows from this setup. Are you sure?") because it's destructive.
  - `components/admin/RunFinalCASButton.tsx` — single button "Publish all"; on click POSTs to `/api/admin/onboarding/finalize-cas`. Disables itself + shows a spinner during the request. On `{ status: 'finalize_complete', watched_folder_id }` response → calls `router.refresh`; the next page-load sees `pending_wizard_session_id IS NULL` AND `watched_folder_id IS NOT NULL` and falls through to `<Dashboard />`. On 409 `WIZARD_FINALIZE_CHECKPOINT_MISSING` (race: a /finalize call landed between the operator's last refresh and this click and demoted the checkpoint back to in_progress) → toast the §12.4 message + `router.refresh` (next page-load shows FinalizeInProgress).

  **Step-1 failing tests for finding 2 (mid-finalize re-entry UI):**
  - **Close tab during batch 2 of 3 → re-entry shows FinalizeInProgress + Resume works**: stage 250 rows in W1, Apply all. Click Finalize once (batch 1 of 3 commits). Simulate tab close (no further client-side requests). Wait until `last_processed_at` is at the hour-1 mark (well before the 24h horizon) so the auto-rotate gate is irrelevant. Re-load `/admin`. Assert: (a) the page renders `<FinalizeInProgress />` (NOT OnboardingWizard, NOT Dashboard, NOT ReadyToPublish); (b) the progress bar reads "100 / 250" (or whatever the current snapshot is); (c) a "Resume publishing" button is visible. Click Resume. Assert: a POST `/api/admin/onboarding/finalize` is fired; batch 2 lands (200 / 250); the page refreshes via `router.refresh` and renders FinalizeInProgress again with the updated count. Click Resume again — batch 3 lands; the response is `{ status: 'all_batches_complete' }`; the next page-load renders `<ReadyToPublish />`. Click "Publish all". Assert: POST `/api/admin/onboarding/finalize-cas` succeeds; the next page-load renders `<Dashboard />` (the steady-state branch — `pending_wizard_session_id IS NULL` after Phase D); ALL 250 `shows.published = TRUE`.
  - **Close tab AFTER all_batches_complete BEFORE finalize-cas → re-entry shows ReadyToPublish**: stage 50 rows in W1, Apply all. Click Finalize (50 < 100, single batch — the response is `{ status: 'all_batches_complete' }`). Mock the wizard UI's auto-fire of /finalize-cas to be intercepted (simulate operator closing the tab in the few-ms window before the auto-fire). Re-load `/admin`. Assert: (a) the page renders `<ReadyToPublish />` (NOT FinalizeInProgress); (b) the "Publish all" button is visible; (c) NO "Resume publishing" affordance is rendered (Resume is for in_progress only, not for the post-batch-complete pre-Phase-D state). Click Publish. Assert: Phase D runs; ALL 50 rows flip to `published = TRUE`; `watched_folder_id` is now set; next page-load renders Dashboard.
  - **First-visit, no checkpoint → wizard renders normally**: fresh DB. Reload `/admin`. Assert: `<OnboardingWizard />` renders (the `checkpointRow.length === 0` branch); FinalizeInProgress / ReadyToPublish do NOT render; the page is at step 1.
  - **Steady-state with no pending session → Dashboard**: `watched_folder_id IS NOT NULL` AND `pending_wizard_session_id IS NULL`. Reload `/admin`. Assert: `<Dashboard />` renders; none of the re-entry surfaces render.
  - **Defensive `final_cas_done` with non-null `pending_wizard_session_id`** (impossible-but-defended): synthesize an inconsistent state — a checkpoint row with `status = 'final_cas_done'` AND `app_settings.pending_wizard_session_id` STILL pointing at that session (this should never happen after Phase D commits because Phase D atomically clears the session id, but the test is defensive). Reload `/admin`. Assert: the page renders `<Dashboard />` (the defensive fall-through branch in `renderWizardOrFinalizeReentry`); no FinalizeInProgress / ReadyToPublish strands the operator on the wizard.
  - **Cleanup affordance only on FinalizeInProgress (fresh `all_batches_complete`)**: synthesize an in_progress checkpoint state with `last_processed_at = now()`. Reload. Assert: `<FinalizeInProgress />` renders WITH a "Cleanup abandoned finalize" link. Now mutate the checkpoint to `status = 'all_batches_complete'` AND `last_processed_at = now()` (simulate the operator successfully running the next /finalize batch). Reload. Assert: `<ReadyToPublish />` renders WITHOUT any cleanup affordance (the only forward path is Phase D's "Publish all").
  - **Stale `all_batches_complete` renders StaleReadyToPublish with BOTH Publish AND Cleanup (Finding 3)**: synthesize a checkpoint with `status = 'all_batches_complete'` AND `last_processed_at = now() - interval '25 hours'` (past the 24h horizon — Phase D has been failing OR the operator abandoned the wizard between batch-complete and Publish). Reload `/admin`. Assert: (a) the page renders `<StaleReadyToPublish sessionId={W1} />` (NOT `<ReadyToPublish />`, NOT `<FinalizeInProgress />`); (b) BOTH a `<RunFinalCASButton sessionId={W1} />` AND a `<CleanupAbandonedFinalizeButton sessionId={W1} />` are visible; (c) the explainer text reads "Setup is paused — your shows are ready but haven't gone live yet." Click Publish first. Assert: Phase D runs successfully against the unchanged interim state; all manifest-applied rows flip to `published = TRUE`; the next page-load renders Dashboard. **Negative-path variant — Cleanup branch**: re-create the same stale state. Click "Discard this setup and start over" (CleanupAbandonedFinalizeButton). Confirm the modal. Assert: 200 `{ status: 'cleaned' }`; the manifest-applied `published = FALSE` `shows` rows for W1 are GONE; the `wizard_finalize_checkpoints` row for W1 is GONE; `pending_wizard_session_id` is now a fresh UUID; the next page-load renders the wizard inline at step 1.
  - **Boundary: `all_batches_complete` exactly at 24h horizon → StaleReadyToPublish (Finding 3)**: set `last_processed_at = now() - interval '24 hours'` exactly. Reload. Assert `<StaleReadyToPublish />` renders (the dispatch predicate is `Date.now() - last_processed_at.getTime() > 24*3600*1000` — at exactly 24h, the elapsed-microseconds-during-render boundary advance satisfies `>` and the stale branch fires). Set `last_processed_at = now() - interval '23 hours 59 minutes'` → reload → assert `<ReadyToPublish />` renders (under-horizon, fresh path).
  - **Render-time clock-skew flicker is harmless (Finding 3)**: synthesize an `all_batches_complete` checkpoint with `last_processed_at = now() - interval '23 hours 59 minutes'` (under DB-clock 24h horizon). Spoof the app's `Date.now()` to be 5 minutes ahead of DB. Reload. Assert: render-time check observes `~24h 4m > 24h` and renders `<StaleReadyToPublish />`. Click "Discard this setup and start over". Assert: cleanup endpoint returns 409 `CLEANUP_REQUIRES_STALE_SESSION` with `reason: 'session_too_fresh'` (the helper's DB-clock CAS observed `<24h` and refused). The `router.refresh` re-renders against the same state (still skewed). Click Publish instead. Assert: Phase D succeeds. Confirms the render-time skew can flicker the surface but cannot authorize a destructive action against a fresh checkpoint.
  - **Resume button surfaces per-row failed list with wizard-scoped re-Apply links (Finding 2)**: stage 5 rows in W1, Apply all. Force a `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` on the 3rd row by mutating its source sheet between Apply and Resume. Click Resume. Assert: (a) the response carries `per_row` with `[2].code = 'STAGED_PARSE_REVISION_RACE_DURING_FINALIZE'` AND `[2].wizard_session_id = W1` AND `[2].drive_file_id = <the 3rd file's drive id>` AND `[2].re_apply_url = '/admin/onboarding/staged/<W1>/<3rd-driveFileId>'`; (b) the page renders the failed row's `drive_file_id` with a "re-Apply" link whose `href` matches `[2].re_apply_url` exactly; (c) the link is the WIZARD-SCOPED route (`/admin/onboarding/staged/<sessionId>/<driveFileId>`), NOT the live first-seen route (`/admin/show/staged/<stagedId>?firstSeen=true`); (d) the wizard UI does NOT auto-fire `/finalize-cas` (per the Task 10.5 race-row contract). Click the re-Apply link. Assert the wizard-scoped review page (subsection below) renders against the failed `pending_syncs` row, the operator can re-fill reviewer choices, click Apply → `wizard_approved = TRUE` is set with the freshly-captured payload columns → the row re-enters the next /finalize batch's SELECT.

  ** — wizard-scoped per-row re-apply route (Finding 2).** Per-row finalize failures (`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, `STAGED_PARSE_SOURCE_GONE`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `STAGED_PARSE_SUPERSEDED`, `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`, or any unexpected per-row Phase 2 throw) abort THAT row's transaction (ROLLBACK), revert `wizard_approved` to FALSE in a separate follow-up transaction (per the M11 batch-14 finding 1 race-row re-Apply contract), demote the manifest row back to `'staged'` (per the M11 batch-12 finding 2 manifest-lifecycle rule), and surface the failure in the response body's `per_row` array. The earlier draft routed re-Apply links to `/admin/show/staged/<stagedId>?firstSeen=true` — but that route is the LIVE first-seen review surface (Task 10.7 / dashboard PendingPanel) which scopes to `WHERE wizard_session_id IS NULL` AND keys lookups on `pending_syncs.staged_id`. Failed wizard rows live in `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = FALSE` — a different partition AND a different lookup key. Routing to the live route would either 404 (the wizard partition has no matching `WHERE wizard_session_id IS NULL` row for that `staged_id`) OR (worse) operate on the wrong partition if the same `drive_file_id` happens to have a coexisting live row from cron during the wizard run — Apply'ing through the live route would mint a `shows` row in the live partition while the wizard partition's row remains stuck at `wizard_approved = FALSE` with no path to promotion, AND would race the next finalize batch's per-show advisory lock against the live cron pass that just minted the row. The corrected design adds a wizard-scoped re-apply surface keyed on `(wizard_session_id, drive_file_id)`:

  - `app/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/page.tsx` — Server Component admin-gated review surface for wizard-partition failed rows. SELECTs `pending_syncs WHERE wizard_session_id = $wizardSessionId AND drive_file_id = $driveFileId AND wizard_approved = FALSE` (the predicate `wizard_approved = FALSE` ensures only re-Apply candidates appear; rows that were never Apply'd in the first place are reachable via the normal Step3Review flow at `/admin` wizard-mode and shouldn't be reached by per-row failure links). On a row-not-found result: 404 with the §12.4 `STALE_DISCARD_REJECTED` code (the row may have been re-Applied by a sibling tab and is now `wizard_approved = TRUE`, in which case the operator re-loads `/admin` and clicks Resume). On a row-found result: render the same `<StagedReviewCard mode='wizard_failed_reapply' />` shape Task 10.4 builds for wizard step 3, but with these wizard-failed-reapply specifics: (a) display the per-row failure code from `pending_syncs.last_finalize_failure_code` (NEW column added to `pending_syncs` by Task 10.1 step 2 schema amendment — see "Schema amendment" subsection below) along with its §12.4 doug-facing copy; (b) render `parse_result.show.title` AND `staged_modified_time` so the operator knows which sheet/version they're re-Apply'ing; (c) render the `triggered_review_items[]` with reviewer-choice controls (the operator may need to re-make their choices because the source sheet changed between the original Apply and the failed finalize — that's why the row failed); (d) Apply button wired to `POST /api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply`; (e) Discard button wired to `POST /api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard` (operator decides this re-Apply isn't worth pursuing — the wizard-scoped Discard mirrors the §6.8.1 step-3 Discard semantics: `try_again_next_sync` → DELETE the `pending_syncs` row, no deferral; `defer_until_modified` → DELETE + write `deferred_ingestions` row scoped to `wizard_session_id = $wizardSessionId`; `permanent_ignore` → same with `kind = 'permanent_ignore'`). The §9.2 1–3 informational sub-sections do NOT render — same rationale as the live `/admin/show/staged/[stagedId]` route (no `shows` row exists yet for first-seen failures; existing-show re-applies still observe their `shows` row but the surface is intentionally minimal for the per-row-failure use case).

  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/apply/route.ts` — POST handler. **Thin front door delegating to the canonical `applyStaged` helper from Task 6.11**, parameterized for the wizard partition (`wizard_session_id = $wizardSessionId`). Steps: (1) `requireAdmin`. (2) Acquire `pg_advisory_xact_lock(hashtext('show:' || $driveFileId))` (same lock key the finalize per-row Phase B uses, so this re-Apply serializes correctly against any in-flight finalize for the same row). (3) Re-SELECT the `pending_syncs` row inside the lock with the `(wizard_session_id, drive_file_id, wizard_approved=FALSE)` predicate; on row-not-found return 409 `STALE_DISCARD_REJECTED`. (4) Run the §6.8.2 reviewer-choices validation against the operator's payload + the row's `triggered_review_items`. (5) Re-fetch Drive head + parents + trashed (mandatory re-verify per §6.8.1 step 3) and re-parse the sheet; on `STAGED_PARSE_*` errors return the §12.4 code (the operator must retry against the latest sheet version OR Discard). (6) UPDATE `pending_syncs SET wizard_approved = TRUE, wizard_approved_by_email = $adminEmail, wizard_approved_at = now(), wizard_reviewer_choices = $payload, wizard_reviewer_choices_version = $currentVersion, parse_result = $freshParseResult, staged_modified_time = $freshHeadModifiedTime, last_finalize_failure_code = NULL WHERE wizard_session_id = $wizardSessionId AND drive_file_id = $driveFileId`. The `last_finalize_failure_code = NULL` clear is part of the same UPDATE so a successful re-Apply removes the failure record; if the operator clicks Apply again from a stale tab, step (3)'s `wizard_approved = FALSE` predicate refuses (row is now TRUE — idempotent). (7) UPDATE the `onboarding_scan_manifest` row back to `'applied'` in the SAME transaction (the manifest row is currently `'staged'` from the per-row failure demotion; re-Apply restores it to `'applied'` so the §9.0 finalize unresolved-set predicate counts it as resolved). (8) Return 200 `{ status: 'reapplied', wizard_session_id, drive_file_id }`. The client redirects to `/admin` so the operator sees `<FinalizeInProgress />` again with the row re-eligible for the next batch.

  - `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/discard/route.ts` — POST handler. Same admin auth + advisory-lock + re-SELECT-with-CAS pattern as Apply. Body: `{ kind: 'try_again_next_sync' | 'defer_until_modified' | 'permanent_ignore' }`. INSIDE the lock, in one transaction: (a) DELETE the `pending_syncs` row by `(wizard_session_id, drive_file_id)`; (b) for `defer_until_modified` and `permanent_ignore`, INSERT a `deferred_ingestions` row with `wizard_session_id = $wizardSessionId` (wizard-scoped per §4.5 — clean-slate at finalize OR purge at next Start-over), `drive_file_id`, `kind`, `deferred_at_modified_time = pending_syncs.staged_modified_time` (NULL for `permanent_ignore`); (c) UPDATE `onboarding_scan_manifest` to the corresponding terminal status (`discard_retryable` for `try_again_next_sync`, `defer_until_modified`, or `permanent_ignore` per §9.0 step 3 status table). Return 200; client redirects to `/admin` (the row is now resolved-for-finalize per the manifest's terminal status, so the next finalize click won't see it in the unresolved set).

  ** — schema amendment: `pending_syncs.last_finalize_failure_code` (NEW column).** Add `last_finalize_failure_code text` to `pending_syncs` (Task 6.8 schema). Written by the per-row Phase B abort follow-up transaction alongside the `wizard_approved = FALSE` revert (per the M11 batch-14 finding 1 race-row re-Apply contract): UPDATE `pending_syncs SET wizard_approved = FALSE, wizard_approved_at = NULL, wizard_approved_by_email = NULL, wizard_reviewer_choices = NULL, wizard_reviewer_choices_version = NULL, last_finalize_failure_code = $code WHERE wizard_session_id = $sessionId AND drive_file_id = $racedDriveFileId`. The §4.5 symmetry CHECK is updated (see Task 6.8 amendment) to allow `last_finalize_failure_code` to be NON-NULL whenever `wizard_approved = FALSE` AND the four payload columns are NULL — i.e., the row was approved, attempted, failed, and is now waiting for re-Apply. The column is cleared (set to NULL) by the re-apply route's UPDATE in step (6) above. **The column is NOT a substitute for the response body's `per_row` array** — the response carries the immediate per-row outcome for the wizard UI to render the re-Apply link list; the column is the durable record so the wizard-scoped review page can surface the failure code on render even after the operator closed the tab and reopened it tomorrow.

  ** — finalize per-row response shape amendment.** The finalize endpoint's `per_row` array (per M11 batch-14 finding 1 ix and finding 3) now carries an explicit re-apply URL for failed rows so the client doesn't have to compose the URL itself: `per_row[i] = { drive_file_id, wizard_session_id, code: 'OK' | <§12.4 code>, re_apply_url?: string }`. `re_apply_url` is present iff `code !== 'OK'` AND `code` is one of the re-Apply'able failure codes (`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, `STAGED_PARSE_SOURCE_GONE`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `STAGED_PARSE_SUPERSEDED`, `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`, or unexpected per-row Phase 2 throws). For non-re-Apply'able failure codes (`LIVE_ROW_CONFLICT` — which surfaces only via the manifest, not via finalize), `re_apply_url` is omitted; the wizard UI surfaces those via different affordances. The URL format is always `/admin/onboarding/staged/<wizard_session_id>/<drive_file_id>` (URL-encoded segments).

  Implement `purgeAndRotateOnboardingSession` as the **unconditional** single-transaction server helper (lives in `lib/onboarding/sessionLifecycle.ts`) — used by the "Start over" button and the post-onboarding "Re-run Setup" path, both of which have already decided to rotate:
  ```ts
  // shared by "Start over" button and Re-run Setup.
  // Rotates the session id + timestamp AND purges all three onboarding surfaces in one transaction.
  // Always rotates — caller has already decided this is the right action.
  await withTx(async (tx) => {
    const newId = randomUUID;
    await tx.query(
      `UPDATE app_settings
          SET pending_wizard_session_id = $1,
              pending_wizard_session_at = now,
              updated_at = now
        WHERE id = 'default'`,
      [newId]);
    await tx.query(`DELETE FROM pending_syncs WHERE wizard_session_id IS NOT NULL`);
    await tx.query(`DELETE FROM pending_ingestions WHERE wizard_session_id IS NOT NULL`);
    await tx.query(`DELETE FROM onboarding_scan_manifest`);
  });
  ```
  Implement `purgeAndRotateIfStale` as the **conditional** SQL-gated helper used by the auto-rotate path. The staleness predicate is part of the SQL `WHERE` clause inside the same transaction as the rotate + three DELETEs, so DB `now` drives both the decision and the action atomically. The helper ALSO returns the post-mutation `app_settings` row so the caller (`app/admin/page.tsx`) renders the wizard surface against authoritative state — passing the helper's pre-call `settings` capture into `renderWizardOrFinalizeReentry` would route off a stale (rotated-or-purged) view. The post-mutation read happens inside the same transaction (so partial rollback on error guarantees the returned snapshot matches durable state) and ALWAYS runs, regardless of whether the rotate fired:
  ```ts
  // clock-skew-safe auto-rotate. The earlier draft computed staleness
  // in JS (`Date.now - settings.pending_wizard_session_at.getTime > 24 * 3600 * 1000`) and
  // then ran the purge in SQL — those two clocks can disagree under app-vs-DB clock skew. The
  // corrected design moves the comparison into a SQL `WHERE` clause inside the same tx as the
  // rotate/purge so DB `now` drives both the decision and the action.
  //
  // Return shape:
  //   - `settings` — the post-mutation `app_settings` row (or the unchanged row if no rotate
  //     fired). The caller MUST pass THIS into `renderWizardOrFinalizeReentry`, NOT the
  //     pre-call settings capture, so the wizard surface routes against authoritative state.
  //   - `rotated` — true iff the staleness + finalize-gate predicate matched and the row was
  //     rotated (and the three onboarding surfaces purged).
  //   - `suppressed` — present iff the staleness clause matched but the finalize-gate clause
  //     blocked the rotate (M9+M10 batch-14 finding 1 — multi-batch finalize protection).
  export async function purgeAndRotateIfStale: Promise<{
    settings: AppSettings,
    rotated: boolean,
    suppressed?: 'WIZARD_FINALIZE_BATCHES_PENDING',
  }> {
    return await withTx(async (tx) => {
      const newId = randomUUID;
      // multi-batch finalize gate.
      // Conditional rotate: matches 0 rows if pending_wizard_session_at is fresh (or NULL),
      // OR if a multi-batch finalize has committed at least one batch (batches_completed > 0).
      // Without the second clause, an operator who paused overnight after batch 1..N-1 commits
      // would have their interim published=false shows rows orphaned (manifest purged → no
      // durable record of which shows belong to the in-flight promotion set).
      const { rowCount } = await tx.query(
        `UPDATE app_settings
            SET pending_wizard_session_id = $1,
                pending_wizard_session_at = now,
                updated_at = now
          WHERE id = 'default'
            AND pending_wizard_session_at IS NOT NULL
            AND pending_wizard_session_at < now - interval '24 hours'
            AND NOT EXISTS (
              SELECT 1 FROM wizard_finalize_checkpoints c
               WHERE c.wizard_session_id = app_settings.pending_wizard_session_id
                 AND c.batches_completed > 0
            )`,
        [newId]);
      // Read the post-mutation row inside the SAME transaction. This row reflects whatever
      // the UPDATE above did (or did not) — it is authoritative for the caller's render path.
      const fresh = await tx.query<AppSettings>(
        `SELECT * FROM app_settings WHERE id = 'default'`);
      const settings = fresh.rows[0];
      if (rowCount === 0) {
        // distinguish "not stale" vs "stale-but-suppressed-by-finalize-gate".
        // The latter triggers a sync_log entry so operators see why auto-rotate was suppressed AND so
        // the wizard render path can surface the Resume/Cleanup affordances per spec §4.5 prong 3.
        const probe = await tx.query(
          `SELECT 1 FROM app_settings a
            JOIN wizard_finalize_checkpoints c ON c.wizard_session_id = a.pending_wizard_session_id
            WHERE a.id = 'default'
              AND a.pending_wizard_session_at IS NOT NULL
              AND a.pending_wizard_session_at < now - interval '24 hours'
              AND c.batches_completed > 0`);
        if (probe.rowCount > 0) {
          await tx.query(
            `INSERT INTO sync_log (kind, payload)
             VALUES ('WIZARD_FINALIZE_BATCHES_PENDING',
                     jsonb_build_object('wizard_session_id',
                       (SELECT pending_wizard_session_id FROM app_settings WHERE id='default')))`);
          return { settings, rotated: false, suppressed: 'WIZARD_FINALIZE_BATCHES_PENDING' as const };
        }
        return { settings, rotated: false }; // not stale; tx commits with no changes
      }
      // Stale by DB clock AND no in-flight finalize → purge all three onboarding surfaces in the SAME tx.
      await tx.query(`DELETE FROM pending_syncs WHERE wizard_session_id IS NOT NULL`);
      await tx.query(`DELETE FROM pending_ingestions WHERE wizard_session_id IS NOT NULL`);
      await tx.query(`DELETE FROM onboarding_scan_manifest`);
      return { settings, rotated: true };
    });
  }

  // explicit operator escape hatch invoked by the
  // "Cleanup abandoned finalize" admin action when WIZARD_FINALIZE_BATCHES_PENDING fires.
  // Single transaction: (a0 — M6 batch-17 finding 1) DELETE the wizard's `shows_pending_changes`
  // rows so already-live shows that received wizard-staged updates during Phase B revert to their
  // pre-finalize state without ANY `shows` mutation; (a) DELETE shows rows still at published=false
  // in this session's manifest-applied set (these are the FIRST-SEEN interim rows Phase B
  // INSERTed); (b) DELETE the wizard_finalize_checkpoints row; (c) THEN run the standard
  // unconditional purge-and-rotate so the operator gets a fresh wizard.
  //
  // (HIGH — adds four mandatory guards): the prior implementation took
  // NO advisory lock, NO admin auth, NO session-staleness check, AND NO checkpoint-recency
  // check, so a stale tab clicking "Cleanup abandoned finalize" against a session whose
  // /finalize batch was actively running would race with the live finalize: the cleanup's
  // `DELETE FROM wizard_finalize_checkpoints` runs while finalize's per-row tx is mid-commit
  // (which UPDATEs that same checkpoint row), the cleanup's `DELETE FROM shows` removes shows
  // a per-row Phase B is about to UPDATE/INSERT, and the cleanup's `DELETE FROM pending_syncs`
  // strips state Phase D will read. The four guards close every race surface AND restrict the
  // route to the legitimate "abandoned for 24+h" use case:
  // (1) `pg_advisory_xact_lock(hashtext('finalize:' || sessionId))` — same lock /finalize and
  // /finalize-cas use; cleanup waits for any in-flight finalize to complete OR finalize
  // waits for cleanup. NOT `pg_try_advisory_xact_lock` — cleanup is operator-initiated and
  // should block briefly rather than fail noisily.
  // (2) `requireAdmin` + record actor in `sync_audit` — every cleanup is attributable.
  // (3) Session-staleness CAS: `SELECT pending_wizard_session_id, pending_wizard_session_at
  // FROM app_settings FOR UPDATE` AND verify `pending_wizard_session_id = $sessionId` AND
  // `pending_wizard_session_at < now - interval '24 hours'`. The 24h horizon matches the
  // §4.5 auto-rotate clock; cleanup is the manual-equivalent operation. If the session is
  // still fresh (under 24h), refuse with `CLEANUP_REQUIRES_STALE_SESSION` (NEW §12.4 code,
  // 409). This prevents an over-eager operator from nuking a healthy mid-finalize session.
  // (4) Checkpoint-recency check: `SELECT status, last_processed_at FROM
  // wizard_finalize_checkpoints WHERE wizard_session_id = $sessionId`. If `status =
  // 'in_progress'` AND `last_processed_at > now - interval '1 hour'`, refuse with
  // `CLEANUP_REQUIRES_STALE_SESSION` — a finalize that progressed in the last hour is NOT
  // abandoned, even if the broader session is over 24h old (some operators legitimately
  // resume a batched finalize after a long pause).
  // Idempotency: returns `{ status: 'already_cleaned' }` on repeat calls (the session-staleness
  // check refuses if `pending_wizard_session_id` no longer matches the input — a previous
  // cleanup already rotated it).
  export async function cleanupAbandonedFinalize(sessionId: string): Promise<{
    status: 'cleaned' | 'already_cleaned',
  }> {
    await requireAdmin; // (2) admin-only — the route handler also checks; this is defense-in-depth.
    const adminEmail = await currentAdminEmail;
    return withTx(async (tx) => {
      // (1) advisory-xact lock — held until commit; same key as /finalize and /finalize-cas.
      await tx.query(`SELECT pg_advisory_xact_lock(hashtext('finalize:' || $1))`, [sessionId]);

      // (3) session-staleness CAS — refuses fresh sessions. **The 24h horizon predicate is
      // evaluated by Postgres against `now()` INSIDE this transaction, NOT by the app against
      // `Date.now()`.** Mixing app and DB clocks here introduces clock-skew false positives:
      // an app instance whose system clock is 5 minutes ahead of the DB would read a
      // `pending_wizard_session_at` that the DB still considers fresh (under 24h) and incorrectly
      // declare it stale (over 24h by app clock), authorizing a destructive cleanup against an
      // active session. The corrected predicate gates the SELECT on Postgres `now()`: the row
      // is returned ONLY if `pending_wizard_session_id = $sessionId` AND
      // `pending_wizard_session_at < now() - interval '24 hours'`. Zero rows from this SELECT
      // therefore means EITHER (a) the session id no longer matches (already cleaned —
      // idempotent return) OR (b) the session is still fresh (under 24h by DB clock — refuse
      // with `CLEANUP_REQUIRES_STALE_SESSION` reason `session_too_fresh`). To distinguish these
      // two cases for the right response, we run a second short SELECT that ignores the staleness
      // gate and inspects only `pending_wizard_session_id`.
      const staleSession = await tx.query<{
        pending_wizard_session_id: string,
        pending_wizard_session_at: string,
      }>(`SELECT pending_wizard_session_id, pending_wizard_session_at
            FROM app_settings
           WHERE id = 'default'
             AND pending_wizard_session_id = $1
             AND pending_wizard_session_at < now() - interval '24 hours'
           FOR UPDATE`, [sessionId]);
      if (staleSession.rows.length === 0) {
        // Either (a) session id no longer matches, or (b) session still fresh. Distinguish:
        const ownerCheck = await tx.query<{ pending_wizard_session_id: string | null,
                                            pending_wizard_session_at: string | null }>(
          `SELECT pending_wizard_session_id, pending_wizard_session_at
             FROM app_settings WHERE id = 'default'`);
        if (ownerCheck.rows.length === 0 ||
            ownerCheck.rows[0].pending_wizard_session_id !== sessionId) {
          // Already cleaned (or never owned by this session). Idempotent return.
          return { status: 'already_cleaned' as const };
        }
        // Session id matches but the DB-clock 24h gate failed — session is still fresh.
        throw new HttpError(409, 'CLEANUP_REQUIRES_STALE_SESSION', {
          wizard_session_id: sessionId,
          pending_wizard_session_at: ownerCheck.rows[0].pending_wizard_session_at,
          reason: 'session_too_fresh',
        });
      }

      // (4) checkpoint-recency check — refuses if a finalize ran within the past hour. **Same
      // SQL-only-clock principle as (3): the 1h recency predicate is evaluated by Postgres
      // `now()`.** A predicate based on `Date.now()` against `last_processed_at` would let an
      // operator with a fast-running app clock declare an actively-finalizing session stale
      // and authorize a destructive cleanup that races a per-row Phase B commit. The corrected
      // SELECT returns rows ONLY for checkpoints whose `last_processed_at > now() - interval
      // '1 hour'` AND `status = 'in_progress'` — i.e., a finalize that progressed in the last
      // hour by DB clock. A non-zero result triggers the refuse.
      const recentFinalize = await tx.query<{ id: string }>(
        `SELECT id FROM wizard_finalize_checkpoints
          WHERE wizard_session_id = $1
            AND status = 'in_progress'
            AND last_processed_at IS NOT NULL
            AND last_processed_at > now() - interval '1 hour'
          FOR UPDATE`, [sessionId]);
      if (recentFinalize.rows.length > 0) {
        // For the response payload only — we report the actual `last_processed_at` for operator
        // diagnostics. This second SELECT does NOT evaluate any clock predicate.
        const cpDiag = await tx.query<{ last_processed_at: string }>(
          `SELECT last_processed_at FROM wizard_finalize_checkpoints WHERE wizard_session_id = $1`,
          [sessionId]);
        throw new HttpError(409, 'CLEANUP_REQUIRES_STALE_SESSION', {
          wizard_session_id: sessionId,
          last_processed_at: cpDiag.rows[0]?.last_processed_at ?? null,
          reason: 'finalize_active_within_last_hour',
        });
      }

      // Audit trail: record the actor BEFORE doing destructive work.
      await tx.query(`INSERT INTO sync_audit (kind, payload, actor_email, occurred_at)
                       VALUES ('cleanup_abandoned_finalize',
                               jsonb_build_object('wizard_session_id', $1::text),
                               $2, now)`, [sessionId, adminEmail]);

      // Destructive work — same as before, now safely fenced by the four guards above.
      // (M6 batch-17 finding 1) — DELETE the wizard's shadow-surface rows for already-live shows
      // FIRST. These rows captured Phase B's wizard-staged updates to existing live `shows` rows
      // WITHOUT mutating the live data. Deleting them here means abandonment leaves the live shows
      // EXACTLY as they were before finalize started (re-run-setup never half-applies wizard
      // content to a live show). The first-seen `DELETE FROM shows` below removes only the
      // interim `published = FALSE` rows that Phase B INSERTed for new wizard-promoted sheets.
      await tx.query(`DELETE FROM shows_pending_changes WHERE wizard_session_id = $1`, [sessionId]);
      await tx.query(
        `DELETE FROM shows
          WHERE published = FALSE
            AND drive_file_id IN (
              SELECT drive_file_id FROM onboarding_scan_manifest
               WHERE wizard_session_id = $1 AND status = 'applied'
            )`,
        [sessionId]);
      await tx.query(`DELETE FROM wizard_finalize_checkpoints WHERE wizard_session_id = $1`, [sessionId]);
      const newId = randomUUID;
      await tx.query(
        `UPDATE app_settings
            SET pending_wizard_session_id = $1,
                pending_wizard_session_at = now,
                updated_at = now
          WHERE id = 'default'`,
        [newId]);
      await tx.query(`DELETE FROM pending_syncs WHERE wizard_session_id IS NOT NULL`);
      await tx.query(`DELETE FROM pending_ingestions WHERE wizard_session_id IS NOT NULL`);
      await tx.query(`DELETE FROM onboarding_scan_manifest`);
      return { status: 'cleaned' as const };
    });
  }
  ```
  ** — `cleanupAbandonedFinalize` route handler.** The helper above is invoked exclusively through `app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts` (admin-gated, listed in X.3 PROTECTED_ROUTES). The route is the audit-trail-bearing wrapper: it writes `sync_audit` rows BEFORE and AFTER the helper runs so every cleanup action is durably attributable to a specific admin email regardless of the helper's commit/abort outcome.

  ```ts
  // app/api/admin/onboarding/cleanup-abandoned-finalize/[sessionId]/route.ts
  export async function POST(req: Request, { params }: { params: { sessionId: string } }) {
    const adminSession = await requireAdmin; // (1) admin auth at the route layer (defense-in-depth; helper also calls requireAdmin)
    const sessionId = params.sessionId;

    // Pre-action audit row — captures intent + observed state BEFORE any destructive work.
    // Written in its OWN short transaction so the audit trail survives even if the helper aborts.
    // Snapshots: checkpoint state (status / batches_completed), unpublished show count attributed
    // to this session via the manifest-applied join, and total manifest unresolved count. These
    // payload fields are the diagnostic record for "what was the wizard's state when the operator
    // chose to abandon it?" and feed any future post-incident review.
    await withTx(async (tx) => {
      const cp = await tx.query<{ status: string, batches_completed: number, last_processed_at: string | null }>(
        `SELECT status, batches_completed, last_processed_at FROM wizard_finalize_checkpoints WHERE wizard_session_id = $1`,
        [sessionId]);
      const unpublished = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM shows
          WHERE published = FALSE
            AND drive_file_id IN (
              SELECT drive_file_id FROM onboarding_scan_manifest
               WHERE wizard_session_id = $1 AND status = 'applied')`,
        [sessionId]);
      const unresolved = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM onboarding_scan_manifest
          WHERE wizard_session_id = $1
            AND status IN ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')`,
        [sessionId]);
      await tx.query(
        `INSERT INTO sync_audit (kind, payload, actor_email, occurred_at)
              VALUES ('cleanup_abandoned_finalize_started',
                      jsonb_build_object(
                        'wizard_session_id', $1::text,
                        'checkpoint_state', $2::jsonb,
                        'unpublished_show_count', $3::int,
                        'manifest_unresolved_count', $4::int),
                      $5, now)`,
        [
          sessionId,
          cp.rows.length > 0 ? JSON.stringify(cp.rows[0]) : null,
          unpublished.rows[0]?.n ?? 0,
          unresolved.rows[0]?.n ?? 0,
          adminSession.email,
        ]);
    });

    // Invoke the helper. Helper's own four guards apply (advisory lock, requireAdmin DiD,
    // session-staleness CAS, checkpoint-recency CAS). Helper may throw HttpError(409,
    // 'CLEANUP_REQUIRES_STALE_SESSION', ...) — surface that to the client unchanged.
    let result: { status: 'cleaned' | 'already_cleaned' };
    try {
      result = await cleanupAbandonedFinalize(sessionId);
    } catch (e) {
      if (e instanceof HttpError && e.code === 'CLEANUP_REQUIRES_STALE_SESSION') {
        // The helper refused — record that fact in audit too (returns 409 with the existing payload).
        await withTx(async (tx) => {
          await tx.query(
            `INSERT INTO sync_audit (kind, payload, actor_email, occurred_at)
                  VALUES ('cleanup_abandoned_finalize_refused',
                          jsonb_build_object('wizard_session_id', $1::text, 'reason', $2::text),
                          $3, now)`,
            [sessionId, (e.body as any)?.reason ?? 'unknown', adminSession.email]);
        });
        return jsonError(e.status, e.code, e.body);
      }
      throw e;
    }

    // Post-action audit row — captures successful outcome.
    await withTx(async (tx) => {
      await tx.query(
        `INSERT INTO sync_audit (kind, payload, actor_email, occurred_at)
              VALUES ('cleanup_abandoned_finalize_completed',
                      jsonb_build_object('wizard_session_id', $1::text, 'helper_result', $2::text),
                      $3, now)`,
        [sessionId, result.status, adminSession.email]);
    });

    // Idempotent return shape:
    // - 'cleaned' — helper performed destructive work this call.
    // - 'already_cleaned' — repeat call (session-staleness CAS detected the session is no longer owned by this id).
    // The helper's `CLEANUP_REQUIRES_STALE_SESSION` 409 path is handled above and never reaches here;
    // the `session_not_stale` and `finalize_in_progress` shapes referenced in the finding
    // are SUB-classifications of `CLEANUP_REQUIRES_STALE_SESSION` carried in the 409 body's `reason`
    // field (`'session_too_fresh'` for the 24h-window guard, `'finalize_active_within_last_hour'`
    // for the checkpoint-recency guard) — the helper already encodes these distinctions.
    return jsonOk(result);
  }
  ```

  **Step-1 failing tests for the route:**
  - **Idempotency**: stage 200 rows in W1, finalize batch 1 commits, age the session to 25h, click "Cleanup abandoned finalize" → 200 `{ status: 'cleaned' }`; assert `sync_audit` has TWO new rows (`'cleanup_abandoned_finalize_started'` + `'cleanup_abandoned_finalize_completed'`) both bearing the admin's email. Click again → 200 `{ status: 'already_cleaned' }`; assert `sync_audit` has TWO MORE rows (the audit pair fires every call regardless of helper outcome — start-row captures empty state, complete-row carries `helper_result = 'already_cleaned'`).
  - **Refusal under fresh-session guard**: stage 200 rows in W1, finalize batch 1 commits, leave session at <24h. Click "Cleanup abandoned finalize" → 409 `CLEANUP_REQUIRES_STALE_SESSION` with body `{ reason: 'session_too_fresh', .. }`; assert `sync_audit` has the `'cleanup_abandoned_finalize_started'` row AND a `'cleanup_abandoned_finalize_refused'` row (NO `'_completed'` row); assert ALL destructive state is unchanged (the 100 `published=false` shows still exist, checkpoint row still exists, manifest rows still exist, `pending_wizard_session_id` still W1).
  - **Refusal under recent-finalize guard**: stage 200 in W1, finalize batch 1 commits, age session to 25h BUT set `wizard_finalize_checkpoints.last_processed_at = now - interval '30 minutes'`. Cleanup click → 409 `CLEANUP_REQUIRES_STALE_SESSION` with body `{ reason: 'finalize_active_within_last_hour', .. }`; same audit-row pattern + same destructive-state-untouched assertion as the fresh-session guard test.
  - **Pre-action snapshot fidelity**: synthesize a known checkpoint state (`batches_completed = 7`, `status = 'in_progress'`, 4 unpublished shows joined via the manifest, 2 unresolved manifest rows in `'live_row_conflict'`). Cleanup runs (assume staleness gates pass). Read the `'cleanup_abandoned_finalize_started'` row's `payload` JSONB; assert `checkpoint_state.batches_completed === 7`, `checkpoint_state.status === 'in_progress'`, `unpublished_show_count === 4`, `manifest_unresolved_count === 2`. The audit row is the durable diagnostic record of what was discarded.
  - **Concurrent cleanup serializes through the advisory lock**: two parallel POSTs against the same `sessionId`. Helper-level `pg_advisory_xact_lock` serializes them; second call observes `pending_wizard_session_id` already rotated and returns `'already_cleaned'`. Assert FOUR `sync_audit` rows total (two start + two complete; one complete carries `'cleaned'`, the other `'already_cleaned'`).

  Implement the "Start over" button on the wizard surface (admin-gated; rendered when `watched_folder_id IS NULL`). Clicking calls a server action that runs `purgeAndRotateOnboardingSession` and `redirect('/admin')`. The Task 10.2 step-1 component is the canonical render site; subsequent step components ALSO show the same affordance so it's reachable from every wizard step. Once `watched_folder_id IS NOT NULL` the affordance is hidden — restart goes through `/admin/settings` "Re-run Setup".

  Implement `app/admin/settings/page.tsx` with the "Re-run Setup" button calling a server action that:
  1. Calls `requireAdmin`.
  2. **Checkpoint-aware suppression gate.** Re-run Setup invokes `purgeAndRotateOnboardingSession` (the unconditional helper) which would otherwise blindly rotate AND purge `onboarding_scan_manifest` — but a Re-run Setup click while a multi-batch finalize from the CURRENT session is mid-flight (operator clicked Re-run Setup from a stale tab between batches OR while Phase D was racing) would strand the in-flight session's `published=FALSE` `shows` rows AND the checkpoint with no UI path to recovery. The gate is the SAME predicate the auto-rotate path uses (§4.5 prong 3 / Task 10.1 finding 1): inside the same transaction as the rotate, before any DML, run `SELECT EXISTS (SELECT 1 FROM wizard_finalize_checkpoints c JOIN app_settings a ON c.wizard_session_id = a.pending_wizard_session_id WHERE a.id = 'default' AND c.batches_completed > 0) AS in_flight_finalize`. If `in_flight_finalize` is `TRUE`, the server action **MUST NOT rotate or purge**; instead it INSERTs a `sync_log` row coded `WIZARD_FINALIZE_BATCHES_PENDING` (same code emitted by auto-rotate suppression — admin-log-only per §12.4) AND `redirect('/admin?show_finalize=true')` so the operator lands on the FinalizeInProgress / ReadyToPublish surface (Task 10.1 finding 2 dispatch logic) where they can Resume, run final-CAS, OR (after the 24h-stale window) Cleanup. The `?show_finalize=true` query param is informational only — the dispatch logic in `renderWizardOrFinalizeReentry` already routes by checkpoint status; the param exists so the surface can render an explanatory toast ("Re-run Setup is unavailable while a previous setup is still publishing") on first paint.
  3. Generates `pendingWizardSessionId = randomUUID`.
  4. UPDATEs `app_settings` setting `pending_wizard_session_id = $pendingWizardSessionId` AND `pending_wizard_session_at = now` (does NOT touch `watched_folder_id`). This is the SAME session id Task 10.3's verify-folder server action will read back from `app_settings` and pass to `runOnboardingScan` — the wizard does NOT mint a second session id (see Task 10.3 amendment). The `pending_wizard_session_at` write is paired with the id write per §4.5 invariant; without it the 24h auto-rotate cannot work. The UPDATE AND the `purgeAndRotateOnboardingSession` purge DELETEs run in the same transaction as the gate-probe SELECT in step 2, so the gate's "no in-flight finalize" snapshot is consistent with the DML that follows.
  5. `redirect('/admin')` — which then renders the wizard inline because `pending_wizard_session_id` is non-null.

  **Step-1 failing tests for Re-run Setup checkpoint-aware suppression:**
  - **Re-run Setup during in-flight finalize → suppressed**: complete first onboarding so `watched_folder_id` is set. From `/admin/settings`, Re-run Setup mints W2; W2 stages 250 rows, Apply all, click Finalize once (batch 1 of 3 commits — `wizard_finalize_checkpoints.batches_completed = 1`, `status = 'in_progress'`). DO NOT continue. From a stale `/admin/settings` tab, click Re-run Setup again. Assert: (a) `app_settings.pending_wizard_session_id` is UNCHANGED (still W2 — no new UUID minted); (b) `pending_wizard_session_at` is UNCHANGED; (c) the 100 already-committed `published = FALSE` `shows` rows are STILL present; (d) the `wizard_finalize_checkpoints` row for W2 is STILL present with `batches_completed = 1`; (e) `onboarding_scan_manifest` rows for W2 are STILL present; (f) the `pending_syncs` rows for the remaining 150 unprocessed rows are STILL present with `wizard_approved = TRUE`; (g) a fresh `sync_log` row exists with `kind = 'WIZARD_FINALIZE_BATCHES_PENDING'` AND `payload->>'wizard_session_id' = W2` AND `payload->>'source' = 'rerun_setup_suppressed'` (or equivalent diagnostic discriminator distinguishing this entry from the auto-rotate suppression entry); (h) the response is a 302 redirect to `/admin?show_finalize=true`; (i) the resulting `/admin` page renders `<FinalizeInProgress sessionId={W2} />` (per the Task 10.1 finding 2 dispatch logic — checkpoint status `in_progress` → FinalizeInProgress surface). Click Resume on that surface → batch 2 lands → batch 3 lands → ReadyToPublish renders → Publish → all 250 rows flip to `published = TRUE`.
  - **Re-run Setup during in-flight finalize at `all_batches_complete` → suppressed**: same setup as above but advance W2 through all 3 finalize batches (`status = 'all_batches_complete'`); DO NOT run Phase D. From `/admin/settings`, click Re-run Setup. Assert the same suppression outcome — `pending_wizard_session_id` unchanged, `sync_log` entry written, redirect to `/admin?show_finalize=true`; the resulting `/admin` page renders `<ReadyToPublish sessionId={W2} />` (checkpoint status `all_batches_complete` → ReadyToPublish per Task 10.1 finding 2 dispatch). Click Publish → Phase D commits → `pending_wizard_session_id` clears → next `/admin` GET renders Dashboard.
  - **Re-run Setup with NO checkpoint → unconditional rotate (regression)**: complete first onboarding so `watched_folder_id` is set, no in-flight wizard. From `/admin/settings`, click Re-run Setup. Assert: (a) `app_settings.pending_wizard_session_id` is now a fresh UUID (W2); (b) `pending_wizard_session_at` is now within 1s of `now()`; (c) `pending_syncs` / `pending_ingestions` / `onboarding_scan_manifest` rows are GONE (the unconditional purge ran because the gate's `in_flight_finalize = FALSE` — no checkpoint exists); (d) NO `sync_log` row coded `WIZARD_FINALIZE_BATCHES_PENDING` was written; (e) the response is a 302 redirect to `/admin` (NOT `/admin?show_finalize=true`); (f) the resulting `/admin` page renders the wizard inline at step 1.
  - **Re-run Setup with checkpoint at `final_cas_done` → unconditional rotate (NOT suppressed)**: synthesize a stale `wizard_finalize_checkpoints` row with `status = 'final_cas_done'` AND `batches_completed = 5` (a fully-published prior session whose checkpoint row survived per the 7-day audit retention sweep) AND `app_settings.pending_wizard_session_id IS NULL` (Phase D cleared it). Click Re-run Setup. Assert: the rotate fires unconditionally — the gate's predicate joins through `app_settings.pending_wizard_session_id` which is NULL, so the EXISTS clause yields FALSE; the suppression does NOT trigger; a fresh wizard mints. Confirms the gate is keyed on the CURRENT pending session, not on any historical checkpoint.
  - **Re-run Setup with stale checkpoint owned by a DIFFERENT session id → unconditional rotate**: synthesize `wizard_finalize_checkpoints` row owned by W1 with `batches_completed = 1` AND `status = 'in_progress'` AND `app_settings.pending_wizard_session_id = W2` (defensive — the auto-rotate gate prevented W1's session from being rotated to W2; this state should be impossible but the gate must be tight). Click Re-run Setup. Assert: gate's `JOIN ON c.wizard_session_id = a.pending_wizard_session_id` requires the checkpoint to match the CURRENT session; a checkpoint owned by W1 with current session W2 yields zero rows; suppression does NOT fire; rotate proceeds to mint W3. The W1 checkpoint row is unaffected (the rotate path only purges `onboarding_scan_manifest`; checkpoints aren't in the purge list per §4.5 prong 1) — operator-initiated cleanup at `/api/admin/onboarding/cleanup-abandoned-finalize/[W1]` remains the path to remove the orphaned W1 checkpoint.
- [ ] **Step 3: Commit** `feat(admin): first-visit wizard routing + Re-run Setup + Start over + 24h auto-rotate`.

### Task 10.2: Wizard step 1 — share folder (§9.0)

**Files:** Create: `components/admin/OnboardingWizard.tsx`, `components/admin/wizard/Step1Share.tsx`. Test: e2e.

- [ ] **Step 1: Failing test** — service-account email visible + copy button works.
- [ ] **Step 2: Implement** with the §9.0 step 1 copy verbatim. The service-account email is read from the parsed `GOOGLE_SERVICE_ACCOUNT_JSON` env var's `client_email` field.
- [ ] **Step 3: Commit** `feat(admin): wizard step 1 (§9.0)`.

### Task 10.3: Wizard step 2 — verify folder + scan (§9.0, AC-10.2)

**Files:** Create: `components/admin/wizard/Step2Verify.tsx`, `app/api/admin/onboarding/scan/route.ts`. Test: e2e.

**Critical ordering:** the `pending_wizard_session_id` MUST be written to `app_settings` BEFORE `runOnboardingScan` runs. If the scan ran first, staged rows would be tagged with no/stale wizard_session_id, breaking the §6.8.1 wizard-session CAS that gates Apply/Discard against `WIZARD_SESSION_SUPERSEDED`. The §6.4 wizard-session purge in Phase 1 also depends on the new id being authoritative at scan time so prior-session staged rows are correctly purged.

**24-hour auto-rotate check on page-load.** Step 2's component renderer (`components/admin/wizard/Step2Verify.tsx`) is reached via the `/admin` inline wizard route — Task 10.1 owns the `pending_wizard_session_at < now - interval '24 hours'` check at the route level. This task does NOT duplicate the check; it inherits it. **However** the `pending_wizard_session_at` MUST be paired with the id on every step-2 verify-folder action that mints/updates the session (per §4.5 invariant): the verify action's UPDATE on `app_settings` MUST set BOTH `pending_wizard_session_id` AND `pending_wizard_session_at = now` so the auto-rotate timer resets on legitimate progress. This applies to BOTH the first-visit-mints-session path AND the Re-run-Setup-already-minted path: the verify action does NOT need to bump `pending_wizard_session_at` if it's reusing an already-minted id (re-run setup already set it via Task 10.1's settings server action), but it MUST NOT clobber it to NULL.

- [ ] **Step 1: Failing tests (AC-10.2)** — every documented success/failure message:
  - Success → green check + folder name + sheet count.
  - Malformed URL → `ONBOARDING_FOLDER_INVALID_URL`.
  - Folder not shared with service account → `ONBOARDING_FOLDER_NOT_SHARED`.
  - Service-account credentials misconfigured → `ONBOARDING_OPERATOR_ERROR`.
  - **Session-isolation regression (final-validation):** start wizard W1, scan, stage some rows. Start wizard W2 (same admin or another). Assert: every `pending_syncs` row left over from W1 is purged before W2's scan begins; W2's staged rows all carry `wizard_session_id = W2`. Apply against any W1 staged row from a stale tab returns 409 `WIZARD_SESSION_SUPERSEDED` per §6.8.1.
  - **Re-run Setup id-reuse regression**: invoke `/admin/settings` Re-run Setup → `app_settings.pending_wizard_session_id = R` (a brand-new UUID `R`). Then open `/admin` (wizard inline) and complete step-2 verify against a folder. Assert: every `pending_syncs` / `pending_ingestions` / `onboarding_scan_manifest` row written by the verify action carries `wizard_session_id = R` (the same id Re-run Setup minted). The verify action MUST NOT have generated a second UUID; the test reads `app_settings.pending_wizard_session_id` immediately after the redirect AND immediately after verify completes — both reads must return the same value.
  - **First-visit mint regression**: fresh DB (both `watched_folder_id` AND `pending_wizard_session_id` NULL). Open `/admin` (wizard inline). Complete step-2 verify. Assert: `app_settings.pending_wizard_session_id` is now non-null (the verify action minted it because it was the first owner) AND every staged row carries that id.
- [ ] **Step 2: Implement** the server action with this exact ordering:
  1. Validate folder URL → extract ID.
  2. **Read or mint the session id** — the wizard mints **exactly one** `pending_wizard_session_id` per setup attempt, owned by whichever route opens the wizard. `SELECT pending_wizard_session_id, pending_wizard_session_at FROM app_settings WHERE id = 'default'`. If `pending_wizard_session_id` non-null, reuse it as `wizardSessionId` (Re-run Setup case — Task 10.1's `/admin/settings` server action already minted the id AND its `pending_wizard_session_at` BEFORE redirecting to `/admin`); the verify action MUST NOT bump the timestamp on reuse (it's a legitimate continuation of the same session, not a fresh mint). If `pending_wizard_session_id` is NULL, mint `wizardSessionId = randomUUID` AND set `pending_wizard_session_at = now` (first-visit case — the wizard's verify-folder action is the first owner of the session id; the §4.5 paired-write invariant requires the timestamp to be set whenever the id is set). Then UPDATE `app_settings` setting `pending_wizard_session_id = $wizardSessionId` (no-op when reusing; sets the new value when first-visit) AND `pending_wizard_session_at` (only when first-visit minting; left untouched when reusing) AND the other `pending_*` fields (`pending_folder_id`, `pending_folder_set_by_email`, etc.) per §4.5 lifecycle. Do NOT touch `watched_folder_id`. Earlier draft said "Generate fresh `wizardSessionId = randomUUID` .. FIRST" unconditionally, which would silently overwrite the Re-run Setup id minted by `/admin/settings` — every row written through that path would be orphaned and the Re-run Setup id-reuse test wouldn't actually exercise the post-redirect path.
  3. **Purge any prior-session onboarding rows across ALL three onboarding surfaces**: ```sql
     -- pending_syncs (staged parses)
     DELETE FROM pending_syncs
      WHERE wizard_session_id IS NOT NULL AND wizard_session_id != $newId;
     -- pending_ingestions (hard-failed parses) — must also be purged or W1 hard-fails block W2
     DELETE FROM pending_ingestions
      WHERE wizard_session_id IS NOT NULL AND wizard_session_id != $newId;
     -- onboarding_scan_manifest — purge prior-session rows entirely
     DELETE FROM onboarding_scan_manifest
      WHERE wizard_session_id != $newId;
     ```
     All three DELETEs run in the same transaction as the `app_settings.pending_wizard_session_id` write so a stale W1 scan that was about to UPSERT a prior-session row sees its CAS-gated INSERT no-op (the `app_settings.pending_wizard_session_id = $myWizardSessionId` predicate fails). Earlier draft only purged `pending_syncs`; W1 hard-fail rows in `pending_ingestions` would survive and block W2's finalize even after W2 took over, AND stale manifest rows would corrupt step 3's render.
  4. **Call `runOnboardingScan(folderId, wizardSessionId)`** so Phase 1 stages every row with the current session id.
  5. Return the scan summary to the client.

  **CAS gate inside scan writes.** Writing `pending_wizard_session_id` first and purging old rows is necessary but NOT sufficient: a slow W1 scan whose start preceded W2 can still issue UPSERTs after W2 has taken over and clobber W2's freshly-staged rows (since `pending_syncs` and `pending_ingestions` are keyed by `drive_file_id` and W1 didn't know W2 was coming). Every scan-time write inside `runOnboardingScan` MUST CAS-gate against the current `app_settings.pending_wizard_session_id`:

  ```sql
  -- Inside runOnboardingScan — every UPSERT to ALL THREE onboarding surfaces guards
  --. The earlier `OR <table>.wizard_session_id IS NULL` clause was
  -- the wizard-isolation hole — it let a wizard UPSERT overwrite a live (NULL-session)
  -- pending_syncs/pending_ingestions row owned by cron/push/manual, even though spec §9.0
  -- explicitly allows the live folder to keep cron-syncing while a Re-run Setup wizard runs.
  -- The corrected ON CONFLICT predicate matches ONLY the wizard's own session partition.
  INSERT INTO <table> (..., wizard_session_id, ...)
  SELECT ..., $myWizardSessionId, ..
  WHERE EXISTS (
    SELECT 1 FROM app_settings
     WHERE id = 'default'
       AND pending_wizard_session_id = $myWizardSessionId
  )
  ON CONFLICT (drive_file_id, wizard_session_id) WHERE wizard_session_id IS NOT NULL
  DO UPDATE SET ..
   WHERE <table>.wizard_session_id = $myWizardSessionId -- never overwrite a different session's row
  RETURNING wizard_session_id;
  ```

  After the statement, **inspect the RETURNING row**: zero rows AND a successful WHERE-EXISTS gate (verified via a follow-up `SELECT pending_wizard_session_id FROM app_settings`) means no conflict — the live (NULL-session) row, if any, sits in a different partial-index slot per the composite-uniqueness schema in Task 6.8 step 2. **-4 (replaces zero-RETURNING-row heuristic — see Task 6.8 step 2 for the canonical version of this contract)**: missing partial-index arbiter raises a hard SQLSTATE (`42P10` OR `23505`), NOT zero RETURNING rows. Detection has TWO parts: **(A) `pg_indexes` schema-state probe at scan start; abort with `WIZARD_ISOLATION_INDEXES_MISSING` if the four expected partial unique indexes aren't all present.** **(B) per-row SQLSTATE catch — `42P10`/`23505` → `LIVE_ROW_CONFLICT`.** Zero RETURNING rows is NEVER a `LIVE_ROW_CONFLICT` signal. On `LIVE_ROW_CONFLICT` for that file: (a) emit `sync_log` entry coded `onboarding_scan_live_row_conflict` with `payload = { drive_file_id, sqlstate }`; (b) **UPSERT `onboarding_scan_manifest` with `status = 'live_row_conflict'`** using the same SQL shape Task 6.8 specifies (with the wizard-session WHERE-EXISTS gate); finalize blocks until this manifest row leaves the unresolved set; (c) surface the per-file warning in the scan summary; (d) continue to the next file (do NOT abort the whole scan).

  If `app_settings.pending_wizard_session_id` no longer matches (W2 took over mid-scan), the WHERE-EXISTS gate makes the INSERT a no-op AND the scan logs `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, then aborts the rest of the scan loop.

  **Concurrency regression tests**: 1. **Wizard supersession**: spawn W1's scan against a folder of 5 sheets. Mid-scan (between sheet 2 and sheet 3), trigger W2's `app_settings.pending_*` write + purge. Assert: W1's writes for sheets 3-5 become no-ops across ALL THREE surfaces (`pending_syncs`, `pending_ingestions`, `onboarding_scan_manifest`); only W2's freshly-scanned rows survive in each; W1 logs the supersession and exits cleanly.
  2. **Wizard UPSERT alongside live row → coexistence**: cron-mode `runPhase1` stages a `pending_syncs` row for `drive_file_id = X` with `wizard_session_id = NULL`. Then start wizard W1 and run the verify-folder action against a folder containing X. Assert: BOTH rows now exist for X (one live, one wizard); the live row's contents are byte-for-byte unchanged; the wizard does NOT abort.
  3. **Live cron writes during wizard run → both rows coexist**: start wizard W1 and stage an onboarding row for `drive_file_id = X`. Then trigger cron-mode `runPhase1` for X. Assert the cron path's UPSERT into the live partial-index slot succeeds; BOTH rows coexist; dashboard panel queries (live-only) and wizard step-3 queries (W1-only) each see only their own row.
- [ ] **Step 3: Commit** `feat(admin): wizard step 2 — session-first scan ordering (§9.0)`.

### Task 10.4: Wizard step 3 — first sheets review (§9.0, AC-10.3, AC-10.6)

**Files:** Create: `components/admin/wizard/Step3Review.tsx`. Modify: `app/api/admin/onboarding/scan/route.ts` to record a scan manifest per session. Test: e2e.

**Three required surfaces.** Spec §9.0 step 3 requires the wizard list to show **three** statuses: `Parsed and ready`, `Couldn't parse`, and `Skipped (not a Google Sheet)`. Earlier draft only listed `pending_syncs` for the current wizard session. That covers only the first status: hard fails go to `pending_ingestions` (currently has no `wizard_session_id` column), and the scan contract was spreadsheet-only so non-sheet items were never collected. Without all three, finalize cannot prove "every sheet found in the folder is accounted for" — Task 10.5's resolution-completeness gate has no data path.

The fix has two parts:
1. **Scan manifest table** — a new `onboarding_scan_manifest` row per (folder, wizard_session_id) carrying every Drive item the scan saw (sheets + non-sheets), with a status enum `staged | hard_failed | skipped_non_sheet`. This gives the wizard a single per-session source of truth.
2. **Provenance on `pending_ingestions`** — add `wizard_session_id uuid` and `discovered_during_folder_id text` columns so onboarding hard-fails are scoped to the current wizard run (Task 10.5 references this for the finalize provenance fix). **-2: also add `last_seen_modified_time timestamptz`** so the dashboard discard route (`/api/admin/pending-ingestions/[id]/discard`) can populate `deferred_ingestions.deferred_at_modified_time` from the row at discard time without re-fetching Drive metadata. Every `pending_ingestions` UPSERT site (Phase 1 hard-fail in `runPhase1`, `handleDriveFetchFailure`, `runOnboardingScan` hard-fails, `runManualStageForFirstSeen`, wizard `retrySingleFile`) populates it from the just-fetched `fileMeta.modifiedTime`. The §4.5 CREATE TABLE block carries this column. Task 2.2's introspection matrix MUST validate the column exists.

- [ ] **Step 1: Failing tests**
  - AC-10.3: every sheet appears with correct status badge across all three classes:
    - **Parsed and ready** — row in `pending_syncs` with current `wizard_session_id`.
    - **Couldn't parse** — row in `pending_ingestions` with current `wizard_session_id` AND `discovered_during_folder_id = currentFolder` (provenance scope).
    - **Skipped (not a Google Sheet)** — row in `onboarding_scan_manifest` with `status='skipped_non_sheet'` (no `pending_*` row written; this is just a record of what was seen and why we didn't try to parse it).
  - AC-10.6: stale onboarding Apply rescans inline. Stage a sheet during step 3, edit in Drive, click Apply → Drive re-verify finds modtime advanced → rescan inline → fresh staged parse with `STAGED_PARSE_RESTAGED_INLINE`.
  - **Resolution-class coverage**: list synthetic folder with 1 valid sheet + 1 hard-fail sheet + 1 PDF (non-sheet). Assert step 3 renders all 3 with their badges. Apply the valid one, defer-until-modified the hard-fail, leave the PDF as-is (skipped non-sheets need no action — they're informational). Click Finalize → succeeds.
- [ ] **Step 2: Implement schema additions** with a true per-session lifecycle on the manifest. Earlier draft tracked only discovery class (`staged | hard_failed | skipped_non_sheet`); finalize then counted live `pending_syncs` + undeferred `pending_ingestions`. That misses the case where Doug uses default "try again next sync" Discard — the `pending_syncs` row is deleted with NO deferral row inserted (per §6.8.1 that's a deliberate non-resolved state), so the unresolved query returns 0 even though the row is actually unresolved. Premature folder promotion follows. The manifest carries terminal lifecycle states:
  - **the `onboarding_scan_manifest` table is created in Task 2.2 from spec §4.5 (canonical source) — Task 10.4 does NOT redeclare the CREATE TABLE here. M10 stamps rows during scan; the schema lives in the initial migration.** Terminal lifecycle states (referenced from §4.5's CHECK):
    - `'staged'` — parse staged, in `pending_syncs` awaiting Apply/Discard.
    - `'hard_failed'` — parse hard-failed, in `pending_ingestions` awaiting Retry/Defer/Ignore.
    - `'skipped_non_sheet'` — non-spreadsheet, auto-resolved (informational only).
    - `'applied'` — Apply succeeded, row is now in `shows`.
    - `'defer_until_modified'` — Discard variant; `deferred_ingestions` row inserted.
    - `'permanent_ignore'` — Discard variant; `deferred_ingestions` row inserted.
    - `'discard_retryable'` — default "try again next sync" Discard; NO deferral row; explicitly NOT resolved (finalize blocks on this state).
    - `'live_row_conflict'` — schema-rollback collision: the wizard's per-file UPSERT for this `drive_file_id` raised `LIVE_ROW_CONFLICT` because the partial-index target collapsed back to the table's `drive_file_id` PK and a live (NULL-session) row owns the slot. Explicitly NOT resolved — finalize blocks on this state. Resolved only by the operator clearing the live row from the dashboard and re-running the wizard so a fresh `runOnboardingScan` re-attempts the per-file UPSERT (transitions to `'staged'` / `'hard_failed'` / etc. on success; stays at `'live_row_conflict'` on re-collision). The CHECK constraint in §4.5 includes this status; Task 2.2's introspection matrix asserts the eight-value enum.
  - `ALTER TABLE pending_ingestions ADD COLUMN wizard_session_id uuid, ADD COLUMN discovered_during_folder_id text, ADD COLUMN last_seen_modified_time timestamptz`.
  - Update `runOnboardingScan` (Task 6.8) to: (a) list ALL Drive items in the folder; (b) for spreadsheets, run the existing parse path AND tag any resulting `pending_ingestions` row with `wizard_session_id` + `discovered_during_folder_id`; (c) for non-spreadsheets, INSERT a manifest row with `status='skipped_non_sheet'`; (d) for staged parses, INSERT manifest with `status='staged'`; (e) for hard-failed parses, INSERT manifest with `status='hard_failed'`.
  - **Lifecycle transitions** — every Apply/Discard/Retry/Defer/Ignore endpoint MUST update the manifest row's `status` AND `transitioned_at` in the same transaction as its primary effect:
    - Apply succeeds → `status = 'applied'`.
    - Discard variant `try again next sync` → `status = 'discard_retryable'`.
    - Discard variant `defer_until_modified` → `status = 'defer_until_modified'`.
    - Discard variant `permanent_ignore` → `status = 'permanent_ignore'`.
    - `pending_ingestions` Retry → manifest row resets to `status = 'staged'` (or stays `hard_failed` if the retry parse also fails).
    - `pending_ingestions` Defer/Ignore → respective `defer_until_modified`/`permanent_ignore` status.
  - **Finalize gate (Task 10.5) reads from the manifest, NOT from row-absence**: ```sql
    -- Resolved iff status is one of: applied, defer_until_modified, permanent_ignore, skipped_non_sheet.
    -- Unresolved iff status is: staged, hard_failed, discard_retryable, live_row_conflict.
    SELECT count(*) FROM onboarding_scan_manifest
     WHERE wizard_session_id = $sessionId
       AND status IN ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict');
    ```
    If count > 0 → 409 `ONBOARDING_NOT_RESOLVED`.
- [ ] **Step 3: Implement step 3 UI** — query the manifest for `wizard_session_id = current`, render badges by status, group by sheet. Skipped non-sheets render an info-only row with no action button. The "all sheets resolved" check requires every spreadsheet to be either applied OR discarded with `defer_until_modified` OR `permanent_ignore` (the default "try again next sync" Discard does NOT count per §6.8.1). Skipped non-sheets are auto-resolved (they need no action).

  **Action endpoints — separate routes for staged vs hard-failed.** Earlier draft said "Each row's Apply/Discard uses the M6 endpoints," but those endpoints are the staged-parse flow targeting `pending_syncs`. They cannot resolve `pending_ingestions` rows (which carry hard-failed parses with no staged data). Without a dedicated path, finalize blocks on pending_ingestions but Doug has no in-wizard way to resolve them — the wizard dead-ends. Required action endpoints:

  | Row source | Action | Endpoint | DB effect |
  |---|---|---|---|
  | `pending_syncs` (parsed and ready) | Apply | `POST /api/admin/staged/[fileId]/apply` (Task 6.11) | runs Phase 2 |
  | `pending_syncs` (parsed and ready) | Discard (any variant) | `POST /api/admin/staged/[fileId]/discard` (Task 6.12) | DELETE pending_syncs + variant-dependent deferred_ingestions write |
  | `pending_ingestions` (couldn't parse) | **Retry now** | `POST /api/admin/onboarding/pending_ingestions/[id]/retry` (NEW) | calls `retrySingleFile(driveFileId, wizardSessionId)` — a NEW per-file Phase-1 helper introduced for this endpoint (: earlier draft re-triggered folder-wide `runOnboardingScan(folderId, ...)`, which would rescan unrelated staged rows mid-review). The helper runs the same gating + parseSheet + enrichWithDrivePins + Phase 1 chain that `runOnboardingScan`'s per-file inner loop runs, with the same wizard-session CAS gate, scoped to a single `drive_file_id`. On success: DELETE the `pending_ingestions` row + UPSERT `pending_syncs` (with manifest transition to `staged`) OR re-INSERT `pending_ingestions` if the parse hard-fails again (status stays `hard_failed`). |
  | `pending_ingestions` (couldn't parse) | **Defer until modified** | `POST /api/admin/onboarding/pending_ingestions/[id]/defer_until_modified` (NEW) | INSERT `deferred_ingestions` (kind=defer_until_modified) AND DELETE the pending_ingestions row |
  | `pending_ingestions` (couldn't parse) | **Permanently ignore** | `POST /api/admin/onboarding/pending_ingestions/[id]/permanent_ignore` (NEW) | INSERT `deferred_ingestions` (kind=permanent_ignore) AND DELETE the pending_ingestions row |
  | Skipped non-sheet | (no action — informational) | n/a | n/a |

  Each `pending_ingestions` action endpoint runs inside the per-show advisory lock + checks `wizard_session_id` + `discovered_during_folder_id` provenance before mutating. Failing test: a wizard row in `pending_ingestions` from a different folder/wizard cannot be acted on via these endpoints — call returns 409 `WIZARD_SESSION_SUPERSEDED`.
- [ ] **Step 4: Commit** `feat(admin): wizard step 3 + scan manifest + 3-status surface + pending_ingestions action endpoints (§9.0)`.

### Task 10.5: Wizard exit / atomic folder promotion (§4.5, AC-10.4..10.5)

**Files:** Create: `app/api/admin/onboarding/finalize/route.ts`. Test: e2e.

**Server-side resolution check is mandatory before promotion.** §9.0 step 3 says the wizard exits when "every sheet found in the folder is either approved/applied OR has a reason captured (couldn't parse / explicitly discarded for now)." That includes BOTH `pending_syncs` rows (parsed-but-staged) AND `pending_ingestions` rows (hard-failed parses). An earlier draft of finalize only counted `pending_syncs`, which would let folder promotion proceed while parse-failed sheets remained unrepresented. The finalize endpoint MUST verify resolution across the full onboarding scan universe before doing the CAS.

- [ ] **Step 1: Failing tests**
  - AC-10.4: re-running setup opens wizard with empty `pending_*`. `watched_folder_id` is NOT cleared during the wizard run.
  - AC-10.5: mid-wizard abandonment — cron continues using existing `watched_folder_id`. Next "Re-run setup" overwrites pending state. No live-sync blackout.
  - **Resolution-completeness regression (final-validation):** stage two sheets — sheet A passes parse and lands in `pending_syncs` (current `wizard_session_id`); sheet B hard-fails MI-1 and lands in `pending_ingestions`. Apply sheet A. Click Finalize **without resolving sheet B**. Assert: finalize returns 409 `ONBOARDING_NOT_RESOLVED` (new error code, see message catalog). Now Discard sheet B with `permanent_ignore` → click Finalize again → succeeds, promotes the folder. Per the §6.8.1 first-seen Discard semantics, only `defer_until_modified` and `permanent_ignore` count as "resolved"; the default "try again next sync" Discard does NOT.
  - **Stale-tab finalize race:** start wizard W1, stage rows, abandon. Start wizard W2 in another tab. Stale tab clicks Finalize from W1's state. Server's CAS on `pending_wizard_session_id = W1_id` matches 0 rows (W2 has overwritten the pending state). Return 409 `WIZARD_SESSION_SUPERSEDED`.
  - **Durable wizard-approval payload**: stage two sheets in W1, click Apply on each. After step 5W commits, assert (a) BOTH `pending_syncs` rows have `wizard_approved = TRUE` AND `wizard_approved_by_email IS NOT NULL` AND `wizard_approved_at IS NOT NULL` AND `wizard_reviewer_choices IS NOT NULL` AND `wizard_reviewer_choices_version = 1` (the §4.5 symmetry CHECK forces this — try synthesizing a row with `wizard_approved = TRUE` and any of the FOUR payload columns NULL, assert SQL `23514` *check_violation*); (b) `wizard_approved_by_email` matches `canonicalize_email(admin.email)`; (c) `wizard_reviewer_choices` round-trips through the §6.8.2 validator under version 1. **Reviewer-choice replay regression (canonical §6.8.2 shape — `item_id` field, `apply`/`reject`/`rename`/`independent` actions, NOT `id`/`accept`)**: stage a sheet whose parse triggers MI-13 with two review items (`item_id = 'item-A-uuid'` paired-rename candidate, `item_id = 'item-B-uuid'` paired-rename candidate); the wizard Apply UI submits the canonical §6.8.2 payload `{ choices: [{ item_id: 'item-A-uuid', action: 'rename' }, { item_id: 'item-B-uuid', action: 'independent' }] }`. After Apply, assert `pending_syncs.wizard_reviewer_choices` contains the operator's exact A/B pairing (NOT defaults) AND `wizard_reviewer_choices_version = 1`. Click Finalize; assert the `sync_audit` row's `derived_side_effects` matches the operator-choice variant (item-A `rename` bumps both removed_name + added_name auth floors per §6.8.2 derivation table; item-B `independent` does NOT pair-rename), NOT the triggered-review-items default variant. **Operator-attribution regression**: admin Doug clicks Apply (captured as `wizard_approved_by_email = doug@…`); a different admin Eric clicks Finalize. The `sync_audit` row MUST carry `applied_by = doug@…` (the persisted approval-payload column), NOT `eric@…`. **Version-unsupported replay regression**: synthesize a `pending_syncs` row with `wizard_approved = TRUE` and `wizard_reviewer_choices_version = 99` (a future version not in the supported set). Click Finalize. Assert (a) Phase A aborts with HTTP 409 `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED` referencing the offending `drive_file_id`; (b) the offending row's manifest is demoted to `'staged'` in the post-abort follow-up transaction; (c) Phase B never runs (no `shows` writes, no §4.5 CAS).
  - **Manifest lifecycle — no transient pre-commit 'applied'**: insert a Phase B abort barrier (e.g., make `runPhase2WithDurablePayload` throw on the second per-row sub-statement). With two approved rows in W1, click Finalize. Assert (a) Phase B aborts → ROLLBACK; (b) the FIRST row's manifest write that was about to commit IS rolled back (no transient `'promoting'` state — the `onboarding_scan_manifest.status` CHECK rejects any non-listed value); (c) the second row's failure triggers the post-rollback follow-up `UPDATE onboarding_scan_manifest SET status = 'staged'` for THAT `drive_file_id` and that update durably commits (re-query in a fresh transaction confirms the demotion); (d) Phase C cleanup runs and the `_finalize-pending/<W1>/` prefix is empty. Re-run finalize against the same W1 — assert it succeeds because both manifest rows are back to a state the unresolved-gate query handles correctly.
  - **Three-phase finalize lock window**: stage 50 rows in W1 each carrying a synthetic embedded image. Time the finalize call. Assert (a) Phase A takes NO per-show advisory locks (the per-show `show:<drive_file_id>` lock is acquired INSIDE Phase B for each row's per-row sub-transaction, NOT during Phase A); Phase A's reads + Drive re-verify + asset upload run inside the request-scoped outer transaction that holds the `finalize:<sessionId>` advisory xact lock — set up a probe that opens `pg_advisory_xact_lock` for the same `show:` key on every row's `drive_file_id` from a separate connection; assert NO `show:<drive_file_id>` lock contention during Phase A (a separate-connection probe acquiring `show:<id>` succeeds immediately while Phase A is mid-flight); ALSO assert that `pg_try_advisory_xact_lock(hashtext('finalize:' || $sessionId))` from a competing /finalize POST returns FALSE during Phase A (the outer `finalize:<sessionId>` lock is held for the entire request lifetime per Step 2's pseudocode); (b) Phase B's per-show locks are acquired in alphabetical order — instrument `pg_advisory_xact_lock('show:' || $drive_file_id)` to record acquire-time and `drive_file_id` per row; assert the recorded sequence is sorted by `drive_file_id`; (c) each per-row Phase B sub-transaction holds its `show:<drive_file_id>` lock for ~200ms (commit-and-release per row) — NOT for the full Phase B duration; (d) total Phase B duration < 5 seconds for 50 rows. Cron locks on the live folder during finalize never block on Phase A's per-show probe (Phase A doesn't hold `show:<drive_file_id>`); cron MAY contend with the OUTER `finalize:<sessionId>` lock only if cron's code path also takes that key, which it does not — so cron is unaffected by Phase A.
  - **100-row batch protocol (server-owned cursor + per-row Phase B + Phase D split):** the `/finalize` endpoint accepts NO `?after=` query parameter. Each call reads `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE ORDER BY drive_file_id LIMIT 100` authoritatively (server-owned cursor); per-batch progression is recorded in the admin-only `wizard_finalize_checkpoints` table for observability. Phase B runs as N per-row transactions (NOT one batch-wide tx) so the per-show advisory lock is held for ~200ms per row, not ~20s per batch. The §4.5 atomic-promotion CAS + `published = TRUE` flip + clean-slate DELETE all live in a SEPARATE Phase D `/finalize-cas` endpoint (separate request, separate <100ms tx, NO Drive/Storage I/O). **Test cases:** (a) stage-101 first-call test asserts `{ status: 'batch_complete', remaining_count: 1, per_row: [...] }`; 100 `shows` rows `published=false`; 100 `pending_syncs` GONE; 1 remains; checkpoint row exists with `status='in_progress'` AND `batches_completed=100`. (b) stage-101 second-call test asserts `{ status: 'all_batches_complete', per_row: [...] }`; ALL 101 rows still `published=false` (Phase D hasn't run yet); checkpoint `status='all_batches_complete'`; `app_settings.watched_folder_id` UNCHANGED. (c) Phase D promotion: POST `/finalize-cas`. Assert `{ status: 'finalize_complete', watched_folder_id: <new> }`; ALL 101 `shows.published = TRUE`; `app_settings.watched_folder_id = pending_folder_id`; `pending_wizard_session_id IS NULL`; checkpoint `status='final_cas_done'`. (d) Phase D idempotency: POST `/finalize-cas` AGAIN against the same session → 200 `{ status: 'finalize_complete' }` (no extra writes). (e) Phase D early-fire: POST `/finalize-cas` with checkpoint `status='in_progress'` → 409 `WIZARD_FINALIZE_CHECKPOINT_MISSING`. (f) Phase D missing-row: POST `/finalize-cas` with `wizard_approved=TRUE` rows still in `pending_syncs` (synthesize the inconsistent state) → 409 `WIZARD_FINALIZE_CHECKPOINT_MISSING`. (g) Race-row re-Apply: stage 5 rows in W1, Apply all, kick off finalize, force a `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` on the 3rd row. Assert (i) rows 1, 2, 4, 5 commit `published=false` and manifest `'applied'`; (ii) row 3's manifest is `'staged'` AND its `pending_syncs.wizard_approved = FALSE` AND all four payload columns NULL; (iii) the response status is `'batch_complete'` with `remaining_count=0` and `per_row[2].code = 'STAGED_PARSE_REVISION_RACE_DURING_FINALIZE'`; because `wizard_approved=FALSE` for row 3 means the SELECT count = 0, checkpoint flips to `'all_batches_complete'`. The wizard UI re-fires `/finalize` (gets `{ status: 'all_batches_complete' }` with no rows to process) but does NOT auto-fire `/finalize-cas` because the response also surfaces the failed-row list to the operator UI; the operator must re-Apply row 3 first. After re-Apply (`wizard_approved=TRUE` again), the next `/finalize` call processes row 3 alone, flips checkpoint back to `'all_batches_complete'`, and the wizard UI fires `/finalize-cas` to publish all 5. (h) Per-row Phase B concurrency: stage 50 rows in W1, kick off finalize. From a separate connection, run `runScheduledCronSync` against an UNRELATED live folder/show during the per-row loop. Assert cron's per-show advisory-lock acquire on the unrelated drive_file_id NEVER blocks (the per-row Phase B holds the lock for at most ~200ms before commit-and-release). (i) FINALIZE_OWNED_SHOW guard (covered in Task 6.7 step 2b — cross-reference here): same-show admin Re-sync during finalize returns 409, doesn't write. (j) Per-row mid-batch abort: stage 250, Apply all, kick off batch 1; force row 150's per-row tx to throw. Assert rows 1–100 (batch 1) commit; in batch 2, rows 101–149 + 151–250 commit; row 150 manifest `'staged'`, `wizard_approved = FALSE`, `per_row[49].code` matches the synthesized error; checkpoint `batches_completed = 249`; `remaining_count = 1` (row 150 with `wizard_approved = FALSE` is excluded). (k) Concurrent finalize: TWO parallel POSTs against the same session race on `pg_try_advisory_xact_lock(hashtext('finalize:' || $sessionId))` at Phase B start; loser returns 409 `CONCURRENT_FINALIZE_IN_FLIGHT`. (l) Crew NEVER see any rows that promoted at `published=false` during the multi-batch interruption window — instrument a crew-role SELECT loop across the entire finalize lifecycle and assert zero crew-visible rows for the in-flight session until Phase D commits. The §12.4 catalog rows for `WIZARD_FINALIZE_CHECKPOINT_MISSING`, `FINALIZE_OWNED_SHOW`, `CONCURRENT_FINALIZE_IN_FLIGHT`, `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, and `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED` are the canonical error codes for this protocol; `WIZARD_FINALIZE_CURSOR_INVALID` and `ONBOARDING_BATCH_TOO_LARGE` are NOT in the catalog (the server-owned protocol has no cursor to invalidate, and `> 100 rows` is the expected steady-state — never a rejection condition).
  - **Storage temp-prefix isolation**: stage and Apply a sheet in W1. After step 5W, assert NO Storage objects exist under `_finalize-pending/<W1>/` (Phase A hasn't run yet). Click Finalize. Mock the Phase B Storage move to fail on the second sub-statement. Assert (a) Phase B aborts → ROLLBACK; (b) the rollback-time cleanup DELETE under `_finalize-pending/<W1>/` removes all temp blobs; (c) the canonical `shows/<show_id>/<rev>/` prefix is EMPTY (no half-uploaded assets at canonical paths — temp-prefix invariant). The `/api/asset/diagram/<show>/<rev>/<key>` route is NEVER consulted for `_finalize-pending/` paths — attempting to construct an asset URL whose `<rev>` maps to a temp path returns 410.
  - **Shadow-surface preserves already-live `shows` rows during multi-batch finalize AND on cleanup-abandoned**: seed a live show with `(title='OldTitle', published=TRUE, last_seen_modified_time=T0)` AND seed 49 additional LIVE shows (`published = TRUE`; folder F-old). From `/admin/settings`, click "Re-run Setup" (mints fresh wizard W2 against folder F-new which is F-old's 50 drive_file_ids PLUS 50 new ones AND has the seed show's drive_file_id mapped to NEW content — `title='NewTitle'` etc.). Run the wizard scan, Apply all 100. Click Finalize batch 1 (which processes 100 rows — a mix of existing-show updates and first-seen rows). DURING the per-row loop, in a parallel session, run `SELECT id, drive_file_id, published, title FROM shows WHERE drive_file_id IN (<50 live drive_file_ids>)` repeatedly. Assert: (a) every already-live row's `published` value is `TRUE` continuously — NEVER flips; (b) every already-live row's `title` is `'OldTitle'` (or whatever the seeded value was) continuously — NEVER mutated by Phase B; (c) `shows_pending_changes` has one row per existing-show update with `payload->>'title' = 'NewTitle'`; (d) every first-seen row INSERTed by Phase B appears with `published = FALSE` until Phase D; (e) crew can read all 50 already-live rows continuously throughout the multi-batch finalize window AND see `'OldTitle'` continuously — instrument a crew-role SELECT loop and assert zero row-disappearance windows AND zero content-mutation observations. **Cleanup path**: do NOT click /finalize-cas; instead stale the wizard 24h+ and click "Cleanup abandoned finalize". Assert (f) every live row's `title` is STILL `'OldTitle'` (cleanup didn't mutate live data); (g) every interim `published=FALSE` first-seen row is GONE; (h) `shows_pending_changes` is empty for W2; (i) `wizard_finalize_checkpoints` is empty for W2. **Apply path**: re-run the same setup (W3), Apply all, run /finalize, then /finalize-cas. Assert (j) Phase D's per-row apply loop ran `UPDATE shows SET title='NewTitle' WHERE id = $live_show_id` for every existing-show drive_file_id; (k) every live row now reads `title='NewTitle'` AND `published=TRUE`; (l) Phase D's `sync_audit` rows record `applied_by = $first_apply_admin_email` (NOT the cas-time admin); (m) `shows_pending_changes` is empty for W3 post-Phase-D. **Negative regression** (the bug this test catches): a prior implementation that ran `runPhase2WithDurablePayload` directly against `shows` for the existing-show branch causes assertions (b) and (f) to FAIL — every existing-show row's `title` flips to `'NewTitle'` mid-batch-1 of Phase B AND `cleanupAbandonedFinalize` does NOT revert it (the `DELETE FROM shows WHERE published = FALSE` only removes first-seen rows; live rows keep the half-applied wizard content indefinitely). The current contract — Phase B writes shadow rows to `shows_pending_changes` for the existing-show branch — guarantees both (b) the live row stays untouched during finalize AND (f) cleanup-on-abandon reverts cleanly with a single `DELETE FROM shows_pending_changes WHERE wizard_session_id = $sessionId`.

  - ** (CRITICAL) — Re-run-setup preserves `published=TRUE` for already-live shows throughout finalize**: seed 50 LIVE shows (`published = TRUE`, `wizard_session_id = NULL` on every `pending_syncs` row that ever existed for them; folder F-old). From `/admin/settings`, click "Re-run Setup" (mints fresh wizard W2 against folder F-new which contains 50 brand-new sheets PLUS the same 50 drive_file_ids as F-old — i.e., F-new is a superset). Run the wizard scan, Apply all 100. Click Finalize batch 1 (which processes the alphabetically-first 100 — a mix of update-existing rows and first-seen rows). DURING finalize batch 1's per-row loop, in a parallel session, run `SELECT id, drive_file_id, published FROM shows WHERE drive_file_id IN (<the 50 already-live drive_file_ids>)` repeatedly. Assert: (a) every already-live row's `published` value is `TRUE` continuously throughout finalize — NEVER flips to FALSE; (b) every first-seen row appears in the same SELECT (via JOIN to `pending_syncs` post-commit) with `published = FALSE` until Phase D runs; (c) Phase D's bulk `UPDATE shows SET published = TRUE WHERE drive_file_id IN (<manifest-applied set>)` runs and is a no-op for the 50 already-live rows (but flips the 50 first-seen rows to TRUE); (d) crew can read all 50 already-live rows continuously throughout the multi-batch finalize window — instrument a crew-role SELECT loop and assert zero row-disappearance windows. **Negative regression** (the bug this test catches): a prior implementation that hard-coded `publishVisibility: false` for every wizard finalize per-row commit causes assertion (a) to FAIL — every live row's `published` flips to FALSE inside batch 1's per-row UPDATE branch and stays FALSE until Phase D, making it crew-invisible during the entire multi-batch finalize window. **Lock-time re-SELECT regression** (additional case this test catches): an implementation that captures `existing_show_id` / `existing_published` in Phase A (BEFORE the per-show advisory lock) and threads them into the per-row Phase B `publishVisibility` decision is ALSO incorrect — between Phase A and Phase B, a live cron / push / manual-Apply path can mint a fresh `shows` row for the same `drive_file_id` (re-run-setup wizards run alongside the live folder's cron), so a Phase-A first-seen classification (`existing_show_id IS NULL`) can be wrong by Phase B's lock-acquire moment, and a Phase-A-driven `publishVisibility = false` would demote the now-live row. The correct contract: per-row Phase B re-SELECTs `shows WHERE drive_file_id = $row.drive_file_id FOR UPDATE` INSIDE the per-show advisory lock and sets `publishVisibility = lockedShow.length === 0 ? false : lockedShow[0].published`. To force the lock-time-vs-Phase-A drift case, run a parallel insert-as-live for one of the 50 drive_file_ids between this finalize's Phase A and the per-row Phase B lock-acquire moment; assert that row's lock-time `published = TRUE` is observed and preserved.
  - **Phase B abort during Drive re-verify**: stage 3 rows in W1. Trash row 2's source sheet in Drive UI. Click Finalize. Phase A captures `reverify = 'gone'` for row 2. Phase B opens the transaction; the abort fires before the lock loop because `phaseAResults.find(r => r.reverify !== 'ok')` returns row 2. Assert (a) Phase B never acquires per-show locks for any of the 3 rows; (b) ROLLBACK runs; (c) the post-rollback follow-up demotes row 2's manifest to `'staged'`; (d) `_finalize-pending/<W1>/` is cleaned up; (e) the `STAGED_PARSE_SOURCE_GONE` recovery path from §6.8.1 step-3 fires for row 2; (f) HTTP 409 with `{ code: 'STAGED_PARSE_SOURCE_GONE', drive_file_id: row2.drive_file_id }`.
- [ ] **Step 2: Implement** the finalize endpoint reading **`onboarding_scan_manifest` only**. Task 10.4 introduced the manifest with terminal lifecycle states precisely because row absence in `pending_*` is insufficient — the default `try again next sync` Discard deletes the `pending_syncs` row with NO deferral row, and per §6.8.1 that's an explicitly-NOT-resolved state (`discard_retryable`). Earlier draft of this step regressed back to a UNION over `pending_syncs` + `pending_ingestions` row absence, which would let `discard_retryable` rows pass the gate. The corrected query reads the manifest exclusively:
  ```sql
  -- Resolved iff status ∈ { applied, defer_until_modified, permanent_ignore, skipped_non_sheet }.
  -- Unresolved iff status ∈ { staged, hard_failed, discard_retryable, live_row_conflict }.
  SELECT drive_file_id, status
    FROM onboarding_scan_manifest
   WHERE wizard_session_id = $sessionId
     AND status IN ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict');
  ```
  If row count > 0 → return 409 `ONBOARDING_NOT_RESOLVED` with the list of unresolved `(drive_file_id, status)` pairs in the response body so the client can guide the user to the right action.
  If count = 0 → **four-phase finalize.** Phase A: pre-commit work without locks (Drive re-verify + Storage temp-prefix asset upload). Phase B: SEQUENCE of N **per-row** transactions; each per-row tx acquires the per-show advisory lock, runs the per-row Drive head CAS, runs Phase 2 + sync_audit + DELETE + Storage move + manifest UPDATE, UPDATEs the `wizard_finalize_checkpoints` row's high-water `last_processed_drive_file_id` and increments `batches_completed`, then commits and releases the lock. Phase C: best-effort post-batch temp-prefix cleanup. **Phase D:** SEPARATE final-CAS endpoint that reads the checkpoint, verifies `status = 'all_batches_complete'` AND `pending_syncs WHERE wizard_approved = TRUE` count is 0, then runs §4.5 atomic-promotion CAS + `published = TRUE` flip for ALL session-promoted rows + wizard-deferral clean-slate DELETE in ONE short transaction (NO Drive/Storage I/O — the move from inside the per-row loop to a separate endpoint is what makes this transaction <100ms instead of ~20s). The `published = TRUE` flip from inside the FINAL batch's Phase B (per the prior draft) is REMOVED — it now lives in Phase D, after ALL batches across ALL finalize calls have committed. Reviewer-choices version dispatch still applies (any unsupported version aborts Phase A with `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`). The cursor protocol is server-owned — the endpoint accepts NO `?after=` query parameter; each batch's row set is derived authoritatively from `pending_syncs WHERE wizard_session_id = $sessionId AND wizard_approved = TRUE ORDER BY drive_file_id LIMIT 100`. Admin write-action guard propagates to all admin write routes via Task 6.7 step 2b's `FINALIZE_OWNED_SHOW` predicate.

  ```ts
  // supported reviewer-choices versions in this build.
  const SUPPORTED_REVIEWER_CHOICES_VERSIONS = new Set([1]);

  // (server-owned cursor): no `?after=` query parameter.
  // Each batch's row set is derived authoritatively from the live `pending_syncs` partition;
  // previously-promoted rows have already been DELETEd (§6.8.1 step-list 6L); raced rows have
  // their `wizard_approved` reverted to FALSE in the per-row abort follow-up, so re-Approved rows naturally re-enter the next batch's SELECT regardless of
  // where their `drive_file_id` sorts.
  const PER_BATCH_CAP = 100;

  // **MANDATORY — `finalize:<sessionId>` advisory xact lock acquisition before any state inspection.**
  // Open the outer request transaction and acquire `pg_try_advisory_xact_lock(hashtext('finalize:'
  // || $sessionId))` BEFORE the checkpoint read, BEFORE the Phase A SELECT, and BEFORE any per-row
  // Phase B commit. This is the SINGLE mutual-exclusion primitive that serializes /finalize against
  // (a) other concurrent /finalize POSTs for the same session, (b) /finalize-cas (Phase D), and
  // (c) `cleanupAbandonedFinalize`. ALL THREE call sites take the SAME `finalize:<sessionId>` key.
  // Without this acquisition here, two parallel /finalize POSTs (or /finalize racing cleanup) can
  // interleave checkpoint reads, Phase A captures, and per-row Phase B commits — producing
  // duplicate `shows` INSERT attempts, duplicate manifest UPDATEs, or a checkpoint that disagrees
  // with per-row reality. `pg_try_advisory_xact_lock` (NON-blocking) is correct for /finalize: a
  // contending second POST fails fast with 409 `CONCURRENT_FINALIZE_IN_FLIGHT` rather than queueing
  // for the duration of a 100-row batch (~20s+ of Drive/Storage I/O). The lock is held for the
  // ENTIRE outer request transaction — checkpoint read, Phase A pre-commit work (Drive re-verify
  // + asset upload), every per-row Phase B commit, and the trailing checkpoint UPDATE — and
  // auto-releases at the outer transaction's commit/rollback. Per-row Phase B sub-transactions
  // still take their per-row `show:<drive_file_id>` advisory locks (a DIFFERENT key, in their
  // OWN nested `withShowSyncTransaction` calls); the outer `finalize:<sessionId>` lock is held by
  // the OUTER request transaction and is unaffected by inner sub-transaction commits.
  // /finalize-cas's Phase D pseudo-code below also takes
  // `pg_try_advisory_xact_lock(hashtext('finalize:' || $sessionId))` (same key, same NON-blocking
  // semantics); `cleanupAbandonedFinalize` takes the BLOCKING `pg_advisory_xact_lock` with the
  // same key (operator-initiated, allowed to wait briefly).
  return await withShowSyncTransaction(async (outerTx) => {
    const lockOk = (await outerTx.queryOne<{ ok: boolean }>(
      `SELECT pg_try_advisory_xact_lock(hashtext('finalize:' || $1)) AS ok`, [sessionId]
    )).ok;
    if (!lockOk) {
      // Another /finalize / /finalize-cas / cleanupAbandonedFinalize call holds the same
      // `finalize:<sessionId>` lock. Roll back the (still-empty) outer transaction and return
      // 409. NO Phase A work runs; NO Phase B commits run; NO checkpoint mutation.
      throw new HttpError(409, 'CONCURRENT_FINALIZE_IN_FLIGHT', { wizard_session_id: sessionId });
    }
    return await runFinalizeUnderLock(outerTx, sessionId);
  });

  // The body below executes inside `runFinalizeUnderLock(outerTx, sessionId)` with the
  // `finalize:<sessionId>` advisory xact lock held on `outerTx`. Per-row Phase B opens its OWN
  // inner `withShowSyncTransaction` per row because each per-row commit must release the
  // per-show `show:<drive_file_id>` lock independently — but the outer `finalize:<sessionId>`
  // lock is unaffected, since Postgres advisory xact locks are scoped to the transaction that
  // ACQUIRED them, not to nested helper transactions. Every `sql` query below runs as
  // `outerTx` so the advisory xact lock is held for the full request lifetime.

  // ensure the checkpoint row exists for this session. If it's already
  // 'final_cas_done', return idempotency response without doing any work. If it's
  // 'all_batches_complete', the wizard UI should be calling /finalize-cas (Phase D), not
  // /finalize — return the checkpoint state so the UI auto-fires the correct endpoint.
  const checkpoint = await outerTx`
    INSERT INTO wizard_finalize_checkpoints (wizard_session_id) VALUES (${sessionId})
    ON CONFLICT (wizard_session_id) DO UPDATE SET wizard_session_id = EXCLUDED.wizard_session_id
    RETURNING id, status, batches_completed, last_processed_drive_file_id, last_processed_at`;
  if (checkpoint[0].status === 'final_cas_done') {
    return jsonOk({ status: 'finalize_complete' });
  }
  if (checkpoint[0].status === 'all_batches_complete') {
    return jsonOk({ status: 'all_batches_complete' }); // wizard UI fires /finalize-cas next
  }

  // Phase A: pre-commit, NO per-show advisory locks (the per-show `show:<drive_file_id>` lock is
  // acquired INSIDE Phase B per row, NOT here). Phase A's DB reads run on `outerTx` — the
  // request-scoped outer transaction that already holds the `finalize:<sessionId>` advisory xact
  // lock acquired above; this is what serializes /finalize against /finalize-cas +
  // cleanupAbandonedFinalize. (Drive API calls + Storage temp-prefix uploads in Phase A.2 / A.3
  // are I/O — they don't run inside any DB transaction by construction; the "in `outerTx`" rule
  // applies to the SQL reads only.) The lock-window invariant the Step 1 test asserts is "no
  // per-show contention during Phase A," not "no transaction during Phase A."
  // SELECT is authoritative (no `?after` cursor); LIMIT bounds work per call.
  const batchRows = await outerTx`
    SELECT id, drive_file_id, parse_result, triggered_review_items, staged_modified_time,
           wizard_approved_by_email, wizard_approved_at, wizard_reviewer_choices,
           wizard_reviewer_choices_version
      FROM pending_syncs
     WHERE wizard_session_id = ${sessionId} AND wizard_approved = TRUE
     ORDER BY drive_file_id
     LIMIT ${PER_BATCH_CAP}`; // deterministic alphabetical for Phase B deadlock prevention

  // refuse to replay any row whose version this build doesn't support.
  // The version-mismatch UPDATE runs in a SEPARATE follow-up transaction (NOT `outerTx`) so the
  // demotion commits durably even though we're returning 409 from `outerTx`. The `outerTx` itself
  // rolls back on the early return (no destructive Phase A.3 / Phase B work has happened yet).
  const versionMismatch = batchRows.find(r =>
    r.wizard_reviewer_choices_version === null ||
    !SUPPORTED_REVIEWER_CHOICES_VERSIONS.has(r.wizard_reviewer_choices_version)
  );
  if (versionMismatch) {
    await sql`UPDATE onboarding_scan_manifest SET status = 'staged'
               WHERE wizard_session_id = ${sessionId} AND drive_file_id = ${versionMismatch.drive_file_id}`;
    return jsonError(409, 'WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED', {
      drive_file_id: versionMismatch.drive_file_id,
      stored_version: versionMismatch.wizard_reviewer_choices_version,
      supported_versions: [...SUPPORTED_REVIEWER_CHOICES_VERSIONS],
    });
  }

  // capture per-row Phase-A binding so Phase B can re-fetch + CAS-check
  // the live `headRevisionId` INSIDE the per-show advisory lock. Closes the Phase-A → Phase-B
  // TOCTOU window where a Drive edit between Phase A.2 (re-verify) and Phase B's commit could
  // let stale snapshot bytes promote.
  const phaseAResults: Array<{
    row,
    reverify: 'ok' | 'gone' | 'oos' | 'superseded',
    tempPaths: Map<assetKey, storagePath>,
    binding: { headRevisionId: string, modifiedTime: string } | null, // null when reverify !== 'ok'
    // (CRITICAL): per-row capture of whether this drive_file_id ALREADY
    // corresponds to a live `shows` row at finalize-start. Re-run-setup wizards run against
    // folders that may already contain LIVE shows (`published = TRUE`); blindly forcing
    // `publishVisibility = false` for those would demote a live row to `published = false` for
    // the entire multi-batch finalize window — minutes of crew downtime, indefinite if finalize
    // stalls. We capture (existing_show_id, existing_published) here in Phase A (BEFORE Phase B)
    // and use it to choose the correct `publishVisibility` per row at Phase B commit time:
    // existing_show_id IS NULL → first-seen wizard row → publishVisibility = false (interim invisibility)
    // existing_show_id IS NOT NULL → re-run-setup against an already-live show → publishVisibility =
    // existing_published (typically TRUE; the row stays crew-visible
    // throughout finalize because the wizard's content updates are
    // applied to the live row without changing its published flag).
    existing_show_id: string | null,
    existing_published: boolean | null,
  }> = [];
  for (const row of batchRows) {
    // lookup is BEFORE re-verify so we have the existing-show binding
    // even for rows whose source has gone (it's a no-op on the abort-demotion path but the
    // symmetry keeps Phase B's type narrowing simple). Read on `outerTx` so it sits inside
    // the request-scoped outer transaction holding `finalize:<sessionId>`; the lock-time
    // re-SELECT inside Phase B is what's authoritative for `publishVisibility`.
    const existing = await outerTx`SELECT id, published FROM shows
                                  WHERE drive_file_id = ${row.drive_file_id} LIMIT 1`;
    const existing_show_id = existing.length > 0 ? existing[0].id : null;
    const existing_published = existing.length > 0 ? existing[0].published : null;

    const reverify = await reverifyStagedSourceForOnboarding(row); // §6.8.1 step 3 (parents pinned to pending_folder_id)
    if (reverify.outcome !== 'ok') {
      phaseAResults.push({ row, reverify: reverify.outcome, tempPaths: new Map, binding: null,
                          existing_show_id, existing_published });
      continue;
    }
    const tempPaths = await snapshotAssetsToTempPrefix(row, sessionId);
    // Uploads to: diagram-snapshots/_finalize-pending/<sessionId>/<row.drive_file_id>/<asset_key>
    phaseAResults.push({
      row,
      reverify: 'ok',
      tempPaths,
      binding: { headRevisionId: reverify.headRevisionId, modifiedTime: reverify.modifiedTime },
      existing_show_id,
      existing_published,
    });
  }

  // Phase B: SEQUENCE of N per-row transactions. Each per-row tx acquires the lock, does Drive
  // re-verify CAS + Phase 2 + sync_audit + DELETE + Storage move + manifest UPDATE +
  // checkpoint UPDATE, and commits. A per-row abort affects ONLY that row; sibling rows
  // already committed remain committed. Interim-batch rows ALWAYS land at `published = false`;
  // the published flip is moved to Phase D (the separate /finalize-cas endpoint).
  const perRowOutcomes: Array<{ drive_file_id: string, status: 'committed' | 'aborted', code?: string }> = [];
  for (const { row, tempPaths, binding, reverify, existing_show_id, existing_published } of phaseAResults) {
    if (reverify !== 'ok') {
      // .x: revert wizard_approved to FALSE so the row is excluded from
      // subsequent batches' SELECTs until the operator re-Applies. Manifest stays 'staged'.
      await sql`UPDATE onboarding_scan_manifest SET status = 'staged'
                 WHERE wizard_session_id = ${sessionId} AND drive_file_id = ${row.drive_file_id}`;
      await sql`UPDATE pending_syncs
                   SET wizard_approved = FALSE, wizard_approved_at = NULL,
                       wizard_approved_by_email = NULL, wizard_reviewer_choices = NULL,
                       wizard_reviewer_choices_version = NULL
                 WHERE wizard_session_id = ${sessionId} AND drive_file_id = ${row.drive_file_id}`;
      await storage.deletePrefix(`_finalize-pending/${sessionId}/${row.drive_file_id}/`);
      perRowOutcomes.push({ drive_file_id: row.drive_file_id, status: 'aborted',
        code: reverify === 'gone' ? 'STAGED_PARSE_SOURCE_GONE'
            : reverify === 'oos' ? 'STAGED_PARSE_SOURCE_OUT_OF_SCOPE'
            : 'STAGED_PARSE_SUPERSEDED' });
      continue;
    }
    try {
      await withShowSyncTransaction(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(hashtext('show:' || ${row.drive_file_id}))`;
        // MANDATORY pre-commit head re-verify INSIDE the lock.
        // Without this, mid-flight Drive edits between Phase A.2 (re-verify) and now would let
        // stale snapshot bytes promote. CAS-check live `headRevisionId` against the Phase-A binding.
        const liveHead = await driveClient.files.get({
          fileId: row.drive_file_id,
          fields: 'headRevisionId,modifiedTime,trashed,parents',
          supportsAllDrives: true,
        });
        if (liveHead.headRevisionId !== binding!.headRevisionId) {
          throw new FinalizeRowAbort(row, 'STAGED_PARSE_REVISION_RACE_DURING_FINALIZE', {
            phase_a: binding!.headRevisionId, phase_b: liveHead.headRevisionId,
          });
        }
        if (liveHead.trashed) {
          throw new FinalizeRowAbort(row, 'STAGED_PARSE_SOURCE_GONE', { reason: 'trashed' });
        }
        if (!liveHead.parents?.includes(pendingFolderId)) {
          throw new FinalizeRowAbort(row, 'STAGED_PARSE_SOURCE_OUT_OF_SCOPE', { parents: liveHead.parents });
        }
        // §6.8.1 step-list 4L → 5L → 6L: insert/update shows, write sync_audit, DELETE pending_syncs.
        // **MANDATORY — re-SELECT the `shows` row UNDER the per-show advisory lock and derive
        // `publishVisibility` from the LOCK-TIME state, NOT from the Phase-A capture.** Phase A
        // captured `existing_show_id` / `existing_published` BEFORE acquiring the per-show lock;
        // those values are vulnerable to a Phase-A → Phase-B drift window during which the live
        // cron / push / manual-Apply path can mint a fresh `shows` row for the same `drive_file_id`
        // (re-run-setup wizards run against folders that may already contain shows OR may receive
        // first-seen Drive activity while the wizard is open). Concretely: if Phase A observed
        // first-seen (existing_show_id IS NULL) but cron promoted the same drive_file_id between
        // Phase A and this lock acquisition, a Phase-A-driven `publishVisibility = false` would
        // demote the now-live row to `published = false` for the entire multi-batch finalize
        // window — minutes of crew-invisibility, indefinite if finalize stalls. The fix re-reads
        // the row INSIDE the lock with `FOR UPDATE` so we observe the post-lock state; whatever
        // value `published` carries at lock-time IS the authoritative one for this transaction.
        const lockedShow = await tx`
          SELECT id, published FROM shows WHERE drive_file_id = ${row.drive_file_id} FOR UPDATE`;
        // Branching rule (replaces the Phase-A capture branch):
        // - lockedShow row absent → first-seen wizard row → `publishVisibility = false`
        //   (interim invisibility; Phase D bulk-flips to TRUE).
        // - lockedShow row present → re-run-setup against an existing show (live OR an interim
        //   row from an earlier batch of THIS finalize) → `publishVisibility = lockedShow.published`
        //   (preserve current visibility; do NOT demote a live row to FALSE; do NOT promote an
        //   interim FALSE row to TRUE — Phase D owns the bulk TRUE flip).
        // The Phase-A `existing_show_id` / `existing_published` captures are NOT consulted here;
        // they remain on `phaseAResults` purely as observability/diagnostics for the response
        // body. Whether Phase A's classification matches the lock-time observation or differs
        // (the drift case), we trust the LOCK-TIME state and proceed without aborting — the
        // re-Apply contract is unnecessary because no destructive write has yet occurred and
        // the lock-time state is by construction the consistent one.
        const publishVisibility = lockedShow.length === 0 ? false : lockedShow[0].published;
        // (M6 batch-17 finding 1) — branch on lock-time existence for the destination
        // of the per-row Phase-2 payload write. (a) **First-seen branch (`lockedShow.length === 0`)**:
        // unchanged — `runPhase2WithDurablePayload` INSERTs a fresh `shows` row with `published = false`
        // and writes `sync_audit`. (b) **Existing-show branch (`lockedShow.length === 1`)**:
        // `runPhase2WithDurablePayload` is invoked in a NEW staging-mode (`destination: 'shadow'`)
        // that produces the same Phase-2 payload (every sheet-derived column + the freshly-minted
        // `snapshot_revision_id` + the diagram entries with their canonical Storage paths) but
        // INSERTS the payload into `shows_pending_changes (wizard_session_id, drive_file_id, show_id,
        // payload, applied_by_email, applied_at_intent)` ON CONFLICT (wizard_session_id, drive_file_id)
        // DO UPDATE SET payload = EXCLUDED.payload, applied_by_email = EXCLUDED.applied_by_email,
        // applied_at_intent = EXCLUDED.applied_at_intent, staged_at = now()`. The live `shows` row
        // is NEVER mutated. `sync_audit` is also DEFERRED — Phase D writes it at apply time using
        // `applied_by_email` / `applied_at_intent` from `shows_pending_changes` to preserve the
        // existing M11 batch-13 operator-attribution contract. The Storage temp→canonical move
        // STILL runs (the canonical paths under `shows/<lockedShow[0].id>/<newRevisionId>/...` are
        // derived from the existing live show's `id`); on per-row abort the move ROLLBACKs with
        // the rest of the per-row tx along with the `INSERT INTO shows_pending_changes`. This is
        // the central guarantee that `cleanupAbandonedFinalize` reverts re-run-setup cleanly:
        // because no live `shows` UPDATE ever fires during Phase B for an already-live show, a
        // simple `DELETE FROM shows_pending_changes WHERE wizard_session_id = $sessionId` in the
        // cleanup helper is sufficient to undo the wizard's effect without ever touching live data.
        const destination: 'shows' | 'shadow' =
          lockedShow.length === 0 ? 'shows' : 'shadow';
        const newRevisionId = await runPhase2WithDurablePayload(tx, row, {
          choices: row.wizard_reviewer_choices,
          choicesVersion: row.wizard_reviewer_choices_version,
          approvedByEmail: row.wizard_approved_by_email,
          approvedAt: row.wizard_approved_at,
          publishVisibility,
          destination, // 'shows' (first-seen INSERT) | 'shadow' (existing-show shows_pending_changes INSERT)
          existingShowId: lockedShow.length === 0 ? null : lockedShow[0].id,
        });
        // The Storage move uses the existing show's `id` for the canonical destination prefix on
        // the existing-show branch (`lockedShow[0].id`), and for the first-seen branch it uses the
        // freshly-minted `shows.id` that `runPhase2WithDurablePayload` returns alongside
        // `newRevisionId` (out-of-band — implementations should return both via a `{ snapshotRevisionId,
        // showId }` tuple from the helper rather than the bare revision id; the surrounding code
        // is intentionally written to compute the dst prefix from `lockedShow[0].id ?? row.show_id`).
        const targetShowId = lockedShow.length === 0 ? row.show_id : lockedShow[0].id;
        for (const [assetKey, srcPath] of tempPaths) {
          const dstPath = `shows/${targetShowId}/${newRevisionId}/${assetKey}`;
          await storage.move(srcPath, dstPath); // per-row tx rolls back on failure
        }
        await tx`UPDATE onboarding_scan_manifest
                    SET status = 'applied', transitioned_at = now
                  WHERE wizard_session_id = ${sessionId} AND drive_file_id = ${row.drive_file_id}`;
        // per-row checkpoint UPDATE — high-water observability ONLY.
        // The next batch's SELECT does NOT consult `last_processed_drive_file_id`; this UPDATE
        // is purely for the dashboard / progress-indicator readers + Phase D verification.
        await tx`UPDATE wizard_finalize_checkpoints
                    SET last_processed_drive_file_id = ${row.drive_file_id},
                        last_processed_at = now,
                        batches_completed = batches_completed + 1
                  WHERE wizard_session_id = ${sessionId}`;
      });
      perRowOutcomes.push({ drive_file_id: row.drive_file_id, status: 'committed' });
    } catch (err) {
      // Per-row rollback. Demote manifest, revert wizard_approved,
      // clean up THIS row's temp prefix. Sibling rows already committed are unaffected.
      if (err instanceof FinalizeRowAbort) {
        await sql`UPDATE onboarding_scan_manifest SET status = 'staged'
                   WHERE wizard_session_id = ${sessionId} AND drive_file_id = ${row.drive_file_id}`;
        await sql`UPDATE pending_syncs
                     SET wizard_approved = FALSE, wizard_approved_at = NULL,
                         wizard_approved_by_email = NULL, wizard_reviewer_choices = NULL,
                         wizard_reviewer_choices_version = NULL
                   WHERE wizard_session_id = ${sessionId} AND drive_file_id = ${row.drive_file_id}`;
        await storage.deletePrefix(`_finalize-pending/${sessionId}/${row.drive_file_id}/`);
        perRowOutcomes.push({ drive_file_id: row.drive_file_id, status: 'aborted', code: err.code });
      } else {
        throw err; // unexpected error — caller-facing 500
      }
    }
  }

  // after the batch completes, re-SELECT remaining count. If 0, flip the
  // checkpoint to 'all_batches_complete' so the wizard UI knows to fire /finalize-cas next.
  // The §4.5 atomic-promotion CAS + `published = TRUE` flip + clean-slate DELETE that the prior
  // draft ran inside the FINAL batch's Phase B transaction are MOVED to Phase D's separate
  // /finalize-cas endpoint (a separate request, separate short transaction, no Drive/Storage I/O).
  //
  // (HIGH — adds the second predicate): the prior gate only checked
  // `count(pending_syncs WHERE wizard_approved = TRUE) == 0`. That misses the per-row failure-
  // demotion case: when a row's Phase B aborts, the per-row rollback follow-up reverts its
  // `wizard_approved` to FALSE AND demotes its manifest back to 'staged'. With the prior single-
  // predicate gate, that row would be EXCLUDED from this SELECT, the count would erroneously hit
  // 0, and the checkpoint would flip to 'all_batches_complete' — leaving Phase D ready to fire
  // while a real unresolved manifest row still exists. Phase D would then run the §4.5 CAS
  // against an inconsistent session (the watched_folder_id flips while the operator still has
  // an unresolved sheet to re-Apply). The corrected gate requires BOTH (a) zero approved
  // pending_syncs AND (b) zero unresolved manifest rows. The unresolved-manifest predicate
  // mirrors the §9.0 Step 2 resolution-completeness query. The Phase D endpoint enforces the
  // SAME both-predicates gate (see Phase D pseudo-code below) and additionally fails closed with
  // `WIZARD_FINALIZE_UNRESOLVED_ROWS` (NEW §12.4 code) if the unresolved-manifest predicate is
  // non-zero — defense-in-depth against a session that somehow advanced its checkpoint to
  // 'all_batches_complete' while still having unresolved manifest rows.
  const remaining = await sql`SELECT count(*)::int AS n FROM pending_syncs
                                WHERE wizard_session_id = ${sessionId} AND wizard_approved = TRUE`;
  const unresolvedManifest = await sql`
    SELECT count(*)::int AS n FROM onboarding_scan_manifest
     WHERE wizard_session_id = ${sessionId}
       AND status IN ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')`;
  if (remaining[0].n === 0 && unresolvedManifest[0].n === 0) {
    await sql`UPDATE wizard_finalize_checkpoints SET status = 'all_batches_complete'
               WHERE wizard_session_id = ${sessionId} AND status = 'in_progress'`;
    return jsonOk({ status: 'all_batches_complete', per_row: perRowOutcomes });
  }
  return jsonOk({
    status: 'batch_complete',
    remaining_count: remaining[0].n,
    unresolved_manifest_count: unresolvedManifest[0].n,
    per_row: perRowOutcomes,
  });

  // -- Phase D: SEPARATE endpoint POST /api/admin/onboarding/finalize-cas. .
  // Runs the §4.5 atomic-promotion CAS + `published = TRUE` flip + clean-slate DELETE in ONE
  // short transaction with NO Drive/Storage I/O (the move from inside the per-row Phase B loop
  // to a separate endpoint is what makes this transaction <100ms instead of ~20s). Implementation
  // in `app/api/admin/onboarding/finalize-cas/route.ts` (separate route handler):
  //
  // const cp = await sql`SELECT status FROM wizard_finalize_checkpoints WHERE wizard_session_id = ${sessionId}`;
  // if (cp.length === 0 || cp[0].status === 'in_progress') {
  // return jsonError(409, 'WIZARD_FINALIZE_CHECKPOINT_MISSING');
  // }
  // if (cp[0].status === 'final_cas_done') return jsonOk({ status: 'finalize_complete' });
  // const remaining = await sql`SELECT count(*)::int AS n FROM pending_syncs
  // WHERE wizard_session_id = ${sessionId} AND wizard_approved = TRUE`;
  // if (remaining[0].n !== 0) return jsonError(409, 'WIZARD_FINALIZE_CHECKPOINT_MISSING');
  // // (HIGH — Phase D defense-in-depth): even if the checkpoint says
  // // 'all_batches_complete' AND no approved pending_syncs remain, refuse Phase D if any
  // // manifest row is still in an unresolved state. This catches the race where a /finalize
  // // batch flipped the checkpoint based on the OLD single-predicate gate (e.g., during a
  // // mid-rollout window) OR where an operator manually edited the checkpoint table.
  // const unresolvedManifest = await sql`SELECT count(*)::int AS n FROM onboarding_scan_manifest
  // WHERE wizard_session_id = ${sessionId}
  // AND status IN ('staged', 'hard_failed', 'discard_retryable', 'live_row_conflict')`;
  // if (unresolvedManifest[0].n !== 0) return jsonError(409, 'WIZARD_FINALIZE_UNRESOLVED_ROWS', {
  // wizard_session_id: sessionId, unresolved_count: unresolvedManifest[0].n });
  // const folderId = await withShowSyncTransaction(async (tx) => {
  // const lockOk = (await tx.queryOne<{ ok: boolean }>(
  // `SELECT pg_try_advisory_xact_lock(hashtext('finalize:' || $1)) AS ok`, [sessionId]
  // )).ok;
  // if (!lockOk) throw new ConcurrentFinalizeInFlight;
  // await tx`UPDATE shows SET published = TRUE
  // WHERE drive_file_id IN (SELECT drive_file_id FROM onboarding_scan_manifest
  // WHERE wizard_session_id = ${sessionId} AND status = 'applied')`;
  // // (M6 batch-17 finding 1) — apply every wizard-staged shadow-surface payload
  // // BEFORE the §4.5 atomic-promotion CAS. Each per-row apply takes the per-show advisory lock
  // // and CAS-gates against the live row's `last_seen_modified_time` (manual-mode semantics from
  // // §6.8.1 — `last_seen_modified_time IS NULL OR last_seen_modified_time <= $payload_modtime`).
  // // The `sync_audit` row is written here using the staged Apply-time attribution (Doug's email
  // // from `applied_by_email`, NOT the cas-time admin), preserving the M11 batch-13 contract.
  // // On per-row CAS-block (a strictly-newer live row landed mid-finalize): the apply ROLLBACKs
  // // only that show, leaves the staged row in `shows_pending_changes` for re-apply / cleanup,
  // // and pushes a `STAGED_PARSE_OUTDATED_AT_PHASE_D` entry into the response's `per_row` array.
  // const stagedChanges = await tx`SELECT id, drive_file_id, show_id, payload, applied_by_email,
  //                                         applied_at_intent
  //                                  FROM shows_pending_changes
  //                                  WHERE wizard_session_id = ${sessionId}
  //                                  ORDER BY drive_file_id`;
  // const phaseDPerRow: Array<{ drive_file_id: string, status: 'applied' | 'cas_blocked' }> = [];
  // for (const sc of stagedChanges) {
  //   try {
  //     await tx.savepoint(async (sp) => {
  //       await sp`SELECT pg_advisory_xact_lock(hashtext('show:' || ${sc.drive_file_id}))`;
  //       const updated = await sp`UPDATE shows SET <columns from sc.payload>
  //                                  WHERE id = ${sc.show_id}
  //                                    AND (last_seen_modified_time IS NULL
  //                                         OR last_seen_modified_time <= ${sc.payload.last_seen_modified_time})`;
  //       if (updated.rowCount === 0) {
  //         throw new PhaseDApplyBlocked(sc.drive_file_id, 'STAGED_PARSE_OUTDATED_AT_PHASE_D');
  //       }
  //       await sp`INSERT INTO sync_audit (kind, payload, actor_email, occurred_at)
  //                 VALUES ('wizard_finalize_apply',
  //                         jsonb_build_object('wizard_session_id', ${sessionId}::text,
  //                                            'drive_file_id', ${sc.drive_file_id},
  //                                            'show_id', ${sc.show_id}::text,
  //                                            'snapshot_revision_id', ${sc.payload.snapshot_revision_id}),
  //                         ${sc.applied_by_email}, ${sc.applied_at_intent})`;
  //     });
  //     phaseDPerRow.push({ drive_file_id: sc.drive_file_id, status: 'applied' });
  //   } catch (err) {
  //     if (err instanceof PhaseDApplyBlocked) {
  //       phaseDPerRow.push({ drive_file_id: sc.drive_file_id, status: 'cas_blocked' });
  //     } else {
  //       throw err; // unexpected — bubble up; outer tx rolls back
  //     }
  //   }
  // }
  // // After every shadow row applies (or CAS-blocks), DELETE all of them. CAS-blocked rows are
  // // also DELETEd here — the operator can re-Apply against the new live state on the next click,
  // // or invoke "Cleanup abandoned finalize" to discard the wizard run entirely.
  // await tx`DELETE FROM shows_pending_changes WHERE wizard_session_id = ${sessionId}`;
  // await tx`DELETE FROM deferred_ingestions WHERE wizard_session_id = ${sessionId}`;
  // const cas = await tx`UPDATE app_settings
  // SET watched_folder_id = pending_folder_id, pending_folder_id = NULL,
  // pending_wizard_session_id = NULL, pending_wizard_session_at = NULL
  // WHERE id = 'default' AND pending_wizard_session_id = ${sessionId}
  // RETURNING watched_folder_id`;
  // if (cas.length === 0) throw new WizardSessionSuperseded;
  // await tx`UPDATE wizard_finalize_checkpoints SET status = 'final_cas_done'
  // WHERE wizard_session_id = ${sessionId}`;
  // return cas[0].watched_folder_id;
  // });
  // // Phase D's subscribeToWatchedFolder runs OUTSIDE the transaction, after commit.
  // await subscribeToWatchedFolder(folderId);
  // try { await storage.deletePrefix(`_finalize-pending/${sessionId}/`); }
  // catch (e) { /* Task 7.8 GC backstop */ }
  // return jsonOk({ status: 'finalize_complete', watched_folder_id: folderId });
  ```
  **Manifest lifecycle invariant:** the manifest's `'applied'` status is written ONLY in Phase B, in the same per-row sub-statement as the `shows` INSERT/UPDATE. There is NO transient pre-commit `'applied'` state and NO post-commit demotion path that fires inside the rolled-back transaction (which would be a no-op anyway). On Phase B abort, the offending manifest row is demoted back to `'staged'` in a SEPARATE follow-up transaction outside the rolled-back outer one — that follow-up commits independently and durably. The unresolved-gate query continues to treat `'applied'` as resolved AND `'staged'` as unresolved correctly.
  **Storage temp-prefix invariant:** all asset bytes uploaded during Phase A land at `diagram-snapshots/_finalize-pending/<wizard_session_id>/<drive_file_id>/<asset_key>` — a prefix that is OUTSIDE the canonical `shows/<show_id>/<snapshot_revision_id>/<asset_key>` keyspace. The `_finalize-pending/` prefix is reserved by Task 7.8 GC: a backstop sweep deletes any `_finalize-pending/*` blobs older than 24h that finalize cleanup missed (Phase B abort + Phase C failure), so orphan temp blobs cannot accumulate indefinitely. The `/api/asset/diagram/<show>/<rev>/<key>` route REJECTS any `<rev>` whose corresponding storage path includes `_finalize-pending/` — temp blobs are never publicly resolvable.
  **`pending_syncs` and `pending_ingestions` are NOT queried by finalize** — they're internal staging surfaces; the manifest is the authoritative resolution-state source.

  **Regression tests (mandatory):**
  - **Wizard-deferral clean slate**: seed a live `deferred_ingestions` row for `drive_file_id = 'live-X'` with `wizard_session_id = NULL` AND a wizard-scoped row for `drive_file_id = 'wiz-Y'` with `wizard_session_id = $W1`. Run finalize for W1. Assert (a) the wizard-scoped row is GONE post-finalize (`SELECT count(*) FROM deferred_ingestions WHERE wizard_session_id = $W1` is 0); (b) the live row SURVIVES (`SELECT count(*) FROM deferred_ingestions WHERE drive_file_id = 'live-X' AND wizard_session_id IS NULL` is still 1) — clean slate is partition-scoped.
  - **Cross-partition isolation**: seed a live `defer_until_modified` deferral for `drive_file_id = 'shared-X'` (cron's existing suppression) AND construct a wizard candidate folder that ALSO lists `shared-X`. Run `runOnboardingScan` for the wizard. Assert (a) the wizard scan can still see `shared-X` (it does NOT consult `deferred_ingestions` at all per spec §5.2 step 3 "NOT manual or onboarding scan"); (b) a live cron pass for the active folder STILL skips `shared-X` (the live row in `deferred_ingestions_live_drive_file_idx` continues to suppress it). Without partitioning, a wizard-side write would either suppress the live cron OR a live deferral would invisibly disable the wizard scan from surfacing the file — either direction breaks the partition isolation guarantee.
- [ ] **Step 3:** Add `ONBOARDING_NOT_RESOLVED` to the §12.4 message catalog (Doug-facing: "Some sheets in your folder still need review before we can finish setup. Resolve them and try again."). Add `finalize_temp_prefix_cleanup_failed` to the sync_log kind enum (operator-internal log signal; no Doug-facing copy). Add `WIZARD_FINALIZE_BATCHES_PENDING` to the §12.4 catalog as admin-log-only. The finalize protocol is server-owned via `wizard_finalize_checkpoints`: (a) the `/finalize` endpoint signature is `POST /api/admin/onboarding/finalize` (NO query parameter — server-owned cursor); (b) `POST /api/admin/onboarding/finalize-cas` is the Phase D endpoint (separate route handler; see the Phase D pseudo-code in Step 2 above); (c) the response shape carries `{ status: 'batch_complete' | 'all_batches_complete', remaining_count, per_row: [...] }` — no `next_batch_token` field; (d) §12.4 codes added by this milestone — `FINALIZE_OWNED_SHOW`, `WIZARD_FINALIZE_CHECKPOINT_MISSING` (Phase D was called against a session whose checkpoint is `'in_progress'` or absent; Doug-facing: "Setup isn't ready to publish yet. Click 'Promote next batch' until all sheets are processed, then publish."), `CONCURRENT_FINALIZE_IN_FLIGHT`, `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`. Each code has a full §12.4 catalog row + matching `lib/messages/catalog.ts` entry + matching YAML appendix entry (X.1 three-way parity test). The catalog does NOT contain `WIZARD_FINALIZE_CURSOR_INVALID` or `ONBOARDING_BATCH_TOO_LARGE` — both are inapplicable to the server-owned protocol (no client cursor to invalidate; > 100 rows is the expected steady-state, not a rejection condition). Phase D's `subscribeToWatchedFolder` call runs OUTSIDE the Phase D transaction (after commit), preserving the Phase C semantics that watch-channel registration is non-transactional.
- [ ] **Step 4: Commit** `feat(admin): wizard finalize — Phase A/B/C/D + per-row Phase B txn + server-owned checkpoint + FINALIZE_OWNED_SHOW guard`.

### Task 10.6: Dashboard panels + admin_alerts banner (§9.1, §9.1.1, §4.6)

**Files:** Create: `components/admin/Dashboard.tsx`, `components/admin/ActiveShowsPanel.tsx`, `components/admin/PendingPanel.tsx`, `components/admin/AdminAlertsBanner.tsx`. Test: e2e.

**admin_alerts banner is a required dashboard surface.** Spec §4.6 makes unresolved `admin_alerts` rows a persistent top-bar banner. Earlier milestones already produce alerts (`AMBIGUOUS_EMAIL_BINDING`, `WEBHOOK_TOKEN_INVALID`, `WATCH_CHANNEL_ORPHANED`, `LEAKED_LINK_DETECTED`, `REPORT_ORPHANED_LOST_LEASE`, etc.). Earlier draft of this task only planned Active/Pending panels; without the banner, those alerts have no UI binding and the only durable surface for those faults is silently dropped.

**Pending-panel action workflows are required.** Spec §9.1 panel 2 requires every row in the "Sheets we couldn't auto-apply" panel to expose concrete actions: `pending_ingestions` rows → "Open in Drive" + "Retry now"; first-seen `pending_syncs` rows → "Review and Apply" + "Discard". Earlier draft of this task verified listing + banner only; without action workflows, brand-new sheets that hard-failed parse have NO admin-side recovery path on the dashboard — the operator sees the row but cannot act. The fix wires four concrete action endpoints + UI buttons + tests below.

- [ ] **Step 1: Failing tests**
  - Active shows panel lists `shows` rows with status.
  - Sheets-we-couldn't-auto-apply panel combines `pending_ingestions` + first-seen `pending_syncs` — both filtered to LIVE rows only (`WHERE wizard_session_id IS NULL`), per the live-row isolation. Onboarding-staged rows tagged with a `wizard_session_id` belong to the wizard's step-3 surface, NOT the dashboard.
  - Existing-show stages appear in Active panel as "⚠ Review staged changes" (§9.1.1).
  - **PendingPanel: pending_ingestions row actions**: - Render `drive_file_name`, first-seen timestamp, attempt_count, `last_error_code` + `last_error_message` (rendered via `messageFor(code, params).dougFacing` where applicable; never raw code text — see Task X.2 substring detection).
    - "Open in Drive" anchor links to `https://drive.google.com/open?id=<drive_file_id>` with `target="_blank" rel="noopener"`. Test asserts the href is the exact Drive URL constructed from `drive_file_id`; assert `target="_blank"` for correct UX (operator stays on dashboard while inspecting the sheet in Drive).
    - "Retry now" button → POST `/api/admin/pending-ingestions/[id]/retry` (NEW route, defined in step 2). Tests:
      - **First-seen retry MUST NEVER bypass the mandatory review gate.** Earlier draft routed every `pending_ingestions` retry through the full `runManualSyncForShow(...)` helper, which can return `{ status: 'applied', slug }` for a clean parse — bypassing the spec §5.2 / §9.1.1 first-seen-mandatory-review rule that says brand-new sheets always need Doug's review before crew see content. The dashboard retry route MUST split into TWO paths discriminated by whether a `shows` row already exists for `drive_file_id`:
        - **First-seen path** (`NOT EXISTS(SELECT 1 FROM shows WHERE drive_file_id = $driveFileId)`): the route MUST run a stage-only helper `runManualStageForFirstSeen(driveFileId)` (NEW — Phase-1-only; symmetric with the wizard's `retrySingleFile` helper from Task 10.4 except scoped to a live `pending_ingestions` row, i.e. `wizard_session_id IS NULL`). The helper runs gate → `parseSheet` → `enrichWithDrivePins` → Phase 1 ONLY. It is forbidden from calling Phase 2 OR inserting a `shows` row OR returning an `applied` outcome. On Phase 1 outcome 1 (hard_fail) → re-UPSERT `pending_ingestions` with incremented `attempt_count` and updated `last_error_code`. On Phase 1 outcome 2 (stage) → INSERT `pending_syncs` (with `wizard_session_id = NULL`, live partition) + DELETE the originating `pending_ingestions` row IN THE SAME TX → return `{ status: 'parsed_pending_review', stagedId }`. On Phase 1 outcome 3 (auto-apply-eligible — every MI invariant including MI-6..MI-14 passes) → FORCE-DOWNGRADE to outcome 2 by appending a synthetic `FIRST_SEEN_REVIEW` review item to `triggered_review_items` (matches Task 6.6 §5.2 routing precedence: first-seen ALWAYS routes to STAGE, never auto-apply). The helper's outcome enum has NO `applied` variant.
        - **Existing-show path** (`EXISTS(SELECT 1 FROM shows WHERE drive_file_id = $driveFileId)` — possible when an existing show somehow re-acquired a `pending_ingestions` row, e.g. after a sheet_unavailable→DRIVE_FETCH_FAILED→re-share path): full `runManualSyncForShow_unlocked(driveFileId, mode='manual')` (the unlocked inner variant introduced for fix-3 below) is allowed because the show is already public; auto-apply is fine and the existing operator-review surface is `/admin/show/<slug>` not the panel-2 first-seen review.
      - Success path test (first-seen, parse passes all invariants): synthesize a first-seen `pending_ingestions` row whose underlying sheet now parses cleanly with EVERY invariant passing. POST retry. Assert: response is `{ status: 'parsed_pending_review', stagedId }` (NOT `{ status: 'applied', slug }`); a `pending_syncs` row exists with `wizard_session_id IS NULL` AND `triggered_review_items` contains `FIRST_SEEN_REVIEW`; the originating `pending_ingestions` row is GONE; **NO `shows` row was minted; NO public `/show/<slug>` URL is reachable yet**. Doug must explicitly Apply from the panel-2 first-seen surface to mint the show row.
      - Success path test (first-seen, MI hard-fail): the parse still trips MI-1..MI-5b. POST retry. Assert: the same `pending_ingestions` row's `attempt_count` increments and `last_error_code` updates; `pending_syncs` is empty; NO `shows` row.
      - Success path test (existing-show retry, auto-apply eligible): a `shows` row already exists. POST retry. Assert: full `runManualSyncForShow_unlocked` runs end-to-end; on auto-apply the show updates and `last_seen_modified_time` advances; on stage the `pending_syncs` row appears with `wizard_session_id IS NULL`.
      - Validation failure: missing or non-existent `id` → 404 `PENDING_INGESTION_NOT_FOUND`. Calling against a wizard-session row (`wizard_session_id IS NOT NULL`) → 409 `LIVE_ROW_REQUIRED` (the dashboard route only operates on live rows; wizard rows go through Task 10.4's wizard endpoint).
      - **Concurrent retry → 409 without blocking**: spawn TWO parallel POST `/retry` calls for the same id. Assert exactly one returns 200 with the sync result; the other returns 409 `CONCURRENT_SYNC_SKIPPED` within ~100ms WITHOUT blocking on the first call's lock. The route uses `pg_try_advisory_xact_lock(hashtext('show:' || drive_file_id))` (NOT the blocking `pg_advisory_xact_lock`) — if try-lock returns `false` the route emits 409 immediately. The inner helper (`runManualStageForFirstSeen` OR `runManualSyncForShow_unlocked`) MUST NOT acquire its own advisory lock — the route owns the single lock acquisition for the entire call. Earlier draft ran the route's blocking `pg_advisory_xact_lock` AND then called the locked outer `runManualSyncForShow` (which itself acquires `pg_try_advisory_xact_lock`), producing a self-conflict where the second call would BLOCK on the route's outer lock instead of returning 409. Fix-3 below extracts the lock-free body of `runManualSyncForShow` into the `_unlocked` variant so the route is the sole lock owner.
      - **Race regressions — row-state read sequencing**: 1. **Retry-then-discard race (the canonical scenario)**: synthesize a first-seen `pending_ingestions` row whose underlying sheet now parses cleanly. Run two parallel calls: POST `/retry` (call A) and POST `/discard` with `kind='permanent_ignore'` (call B). Use a test-only barrier (e.g., a `pg_advisory_lock` acquired by an external probe just before A's per-show lock) to force A to win the lock first, complete its restage (DELETE the original row + INSERT a fresh `pending_syncs`), then release. Assert: A returns 200 `parsed_pending_review` (or `applied`); B returns 409 `PENDING_INGESTION_TRANSITIONED` (the row is gone after the lock acquires; B's post-lock re-SELECT FOR UPDATE returns 0 rows). NO `deferred_ingestions` row was written by B (its work was correctly aborted before the INSERT).
        2. **Discard-then-retry race**: same setup. Call A is `/discard kind='defer_until_modified'`; call B is `/retry`. Force A to win first. A inserts `deferred_ingestions` and DELETEs the row. B's lock acquires, post-lock re-SELECT returns 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`. NO restage happened (no `pending_syncs` row exists with this `drive_file_id`).
        3. **Retry-then-retry race**: TWO parallel `/retry` calls. Force A to win the lock first; A restages and DELETEs. B's lock acquires; post-lock re-SELECT FOR UPDATE returns 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`. The first 409 path (`CONCURRENT_SYNC_SKIPPED` on `try_lock = false`) ALSO covers this scenario when the lock contention is the path that happens first; the test pins both outcomes by gating with the external probe so the second call definitively reaches its post-lock re-SELECT after A committed. (Both outcomes — `CONCURRENT_SYNC_SKIPPED` from try-lock failure AND `PENDING_INGESTION_TRANSITIONED` from post-lock re-SELECT — are valid race signals; the test asserts the response is ONE OF the two codes, never 200, never 500.)
        4. **Discard-then-discard race**: TWO parallel `/discard` calls (e.g., both `kind='permanent_ignore'`). Same gate. A inserts `deferred_ingestions` and DELETEs. B's lock acquires; post-lock re-SELECT returns 0 rows → 409 `PENDING_INGESTION_TRANSITIONED`. EXACTLY ONE `deferred_ingestions` row exists for this `drive_file_id` (B did NOT write a duplicate).
        Common assertion across all four: NO state-mutating effect happens after the loser detects transition. Specifically: (a) no extra `deferred_ingestions` row beyond what the winner wrote; (b) no extra `pending_syncs` row beyond what the winner wrote; (c) no extra `sync_audit` row from the loser; (d) no error log entry coded `LOCK_OWNERSHIP_ASSERTION_FAILED` (that code is reserved for the impossible bootstrap-vs-relock drive_file_id mismatch, NOT the normal transition race).
      - **Bootstrap-vs-post-lock drive_file_id consistency**: synthesize a row, capture its id and drive_file_id. The route's bootstrap read returns `drive_file_id_X`. If by some impossible mechanism the row's `drive_file_id` could change between bootstrap and post-lock re-SELECT (e.g., a buggy migration that alters PKs in flight), the route MUST detect via the post-lock guard `(c) drive_file_id mismatch → 500 LOCK_OWNERSHIP_ASSERTION_FAILED`. Test stub: monkey-patch the bootstrap read to return a fixed value differing from the current row's drive_file_id; assert the route returns 500 with that code. (This test is a defensive sanity check; in normal operation the path is unreachable because `pending_ingestions.drive_file_id` is immutable.)
    - "Discard — permanently ignore" button (the `pending_ingestions` analog of `pending_syncs`'s permanent-ignore Discard) → POST `/api/admin/pending-ingestions/[id]/discard` (NEW route, defined in step 2). Tests: success path INSERTs a `deferred_ingestions` row with `kind = 'permanent_ignore'` AND DELETEs the `pending_ingestions` row. Validation/wizard-row guards as above.
  - **PendingPanel: first-seen pending_syncs row actions**: - Render candidate `title`/`dates` from `parse_result.show`, the `staged_id`, and the triggered invariants list (each invariant code via `messageFor`).
    - "Review and Apply" link routes to `/admin/show/staged/[stagedId]?firstSeen=true` — the same parse-panel review UI Task 10.7 builds, scoped to first-seen mode (the URL is distinct from `/admin/show/<slug>` because no slug exists yet for first-seen rows). Assert: clicking opens the review surface; on Apply the `pending_syncs` row is DELETEd, a fresh `shows` row is INSERTed with the slug derived from `parse_result` (per §6.9), and the operator is redirected to `/admin/show/<derived-slug>`.
    - "Discard" button → POST `/api/admin/staged/[fileId]/discard` (existing Task 6.12 route) with the rendered `staged_id` for CAS. Test: success path DELETEs the `pending_syncs` row; no `shows` row is ever created. Test the three §6.8.1 first-seen Discard variants — `try again next sync`, `defer_until_modified`, `permanent_ignore` — each exercising the corresponding `deferred_ingestions` write.
  - **AdminAlertsBanner: per-show alert**. Synthesize an `admin_alerts` row with code `AMBIGUOUS_EMAIL_BINDING` for a specific show. Assert (a) banner renders at the top of the dashboard with the §12.4 doug-facing copy via `messageFor`, (b) banner has `position: sticky; top: 0; z-index: 100;` and red tint, (c) **the per-show banner row does NOT render an inline "Mark resolved" button** — only global rows do, (d) clicking through routes to `/admin/show/<slug>?alert_id=<id>` (highlight + resolution wired in Task 10.7 — see split note below), (e) marking resolved through the per-show route in Task 10.7 removes the banner on next render. **Listing + banner-row click-through ONLY in this task.** The per-show alert section (highlight-on-arrival + resolve mutation) is owned by Task 10.7 to keep that task the single owner of `/admin/show/<slug>` surfaces.
  - **AdminAlertsBanner: global alert**. Synthesize a row with `show_id = NULL` (a system-wide alert like a config error). Banner renders without a click-through to a specific show; resolution flow is a "Mark resolved" button on the banner itself that POSTs to `/api/admin/admin-alerts/[id]/resolve` (NEW route, defined in step 2). Per-show banners do NOT carry this button — clicking through to `/admin/show/<slug>?alert_id=<id>` triggers the per-show resolve flow Task 10.7 owns.
  - **AdminAlertsBanner client never sends per-show alerts to the global route**. Negative test: synthesize a per-show alert. Render the banner. Inspect the banner-row component's "Mark resolved" affordance. Assert: it is NOT a `<button onClick={postGlobalResolve}>` element — it is a `<Link href={'/admin/show/<slug>?alert_id=<id>'}>` clickthrough. Conversely, synthesize a global alert; assert the banner row IS a `<button>` that POSTs to the global route. The banner code never has a code path that sends a per-show alert id to `/api/admin/admin-alerts/[id]/resolve`. (Defense-in-depth complement to the route's server-side 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE` rejection.)
  - **Per-show alert sent to global route is rejected**. Synthesize a per-show alert on Show A. Bypass the banner-renderer client logic and POST directly to `/api/admin/admin-alerts/<alert-id>/resolve`. Assert: response is 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`; the response body's `redirect_to` field points at `/api/admin/show/<show-A-slug>/alerts/<alert-id>/resolve`; the alert row's `resolved_at` remains NULL. POST against `redirect_to`; assert 200 success and `resolved_at` is now non-null.
  - **Multi-alert ordering**: synthesize 3 unresolved alerts with different `raised_at`. Banner renders the most recent first per §4.6 (`ORDER BY raised_at DESC`).
- [ ] **Step 2: Implement Dashboard with AdminAlertsBanner mounted at the top.** Banner reads `SELECT * FROM admin_alerts WHERE resolved_at IS NULL ORDER BY raised_at DESC` and renders all of them stacked (or just the topmost with a "+N more" disclosure if count > 3). **Each row uses `messageFor(alert.code, params)` with the params object derived from `alert.show_id` AND `alert.context` JSONB** — earlier draft only used `messageFor(alert.code)` without params. Codes like `TILE_SERVER_RENDER_FAILED` carry `<sheet-name>` placeholders in their §12.4 doug-facing copy; rendering without params would surface raw placeholder text. Concretely:
  ```ts
  function deriveBannerParams(alert: AdminAlert): Record<string, string> {
    const params: Record<string, string> = {};
    if (alert.show_id) {
      const show = await getShowMeta(alert.show_id); // small DB lookup; cached per-render
      params['sheet-name'] = show.title;
      params['show-slug'] = show.slug;
    }
    // Spread alert.context JSONB into params (e.g., context.collidingEmails for AMBIGUOUS_EMAIL_BINDING).
    return { ...params, ...flattenJsonForParams(alert.context) };
  }
  // …
  <BannerRow message={messageFor(alert.code, deriveBannerParams(alert)).dougFacing} />
  ```
  Required test for placeholder-bearing codes: synthesize a `TILE_SERVER_RENDER_FAILED` alert tied to a specific show. Assert the rendered banner text contains the show's actual `title`, NOT the literal `<sheet-name>` placeholder, NOT the literal code.

  **Pending-panel action endpoints.** Implement THREE new server actions / route handlers on top of the existing M6 staged routes. Each runs inside `requireAdmin` + the per-show advisory lock + scopes by `wizard_session_id IS NULL` to enforce live-row isolation:
  - `app/api/admin/pending-ingestions/[id]/retry/route.ts` — POST handler. Accepts `{ id: string }`. **Lock contract: the route is the SOLE owner of the per-show advisory lock for this call.** **Row-state read sequencing: every state-bearing read on `pending_ingestions` MUST happen INSIDE the advisory lock.** Earlier draft selected the row BEFORE acquiring the lock, opening a retry-then-discard race: between the route's pre-lock SELECT and lock acquisition, the row could transition (a sibling Discard could DELETE it; a sibling Retry could DELETE-and-restage it as `pending_syncs`); the route would then proceed under the lock with stale state and write effects against an already-transitioned row. The corrected ordering is: (1) `requireAdmin`. (2) **Lock-key bootstrap read (no state decisions)** — `SELECT drive_file_id FROM pending_ingestions WHERE id = $1` to derive the lock key only. If row missing here → 404 `PENDING_INGESTION_NOT_FOUND` (early-exit; the row will not appear later). NO state checks against `wizard_session_id`, `last_seen_modified_time`, `attempt_count`, or any other field happen at this read — those are gathered post-lock in step 4. (3) Open a transaction via `withShowSyncTransaction(...)` and acquire `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $driveFileId))` — **non-blocking** so a contending second click returns immediately (NOT the blocking `pg_advisory_xact_lock` the earlier draft used; see Step-1 idempotency test). If try-lock returns `false` → ROLLBACK and return 409 `CONCURRENT_SYNC_SKIPPED` within ~100ms. (4) **INSIDE the lock — re-SELECT the row authoritative state with `FOR UPDATE`**: `SELECT id, drive_file_id, wizard_session_id, last_seen_modified_time FROM pending_ingestions WHERE id = $1 FOR UPDATE`. **(a)** If the re-SELECT returns 0 rows → ROLLBACK and return 409 `PENDING_INGESTION_TRANSITIONED`: the row was deleted between the bootstrap read and lock acquisition (a sibling Retry restaged it OR a sibling Discard wrote a deferral and removed it). The error response carries `{ id, transitioned_to_state: 'unknown' }` so the client can re-fetch the panel and present the latest state. **(b)** If the re-SELECT row's `drive_file_id` differs from the bootstrap value (theoretically impossible but defended) → ROLLBACK and return 500 `LOCK_OWNERSHIP_ASSERTION_FAILED`. **(c)** If `wizard_session_id IS NOT NULL` → ROLLBACK and return 409 `LIVE_ROW_REQUIRED` (this endpoint operates on live rows ONLY; wizard rows have a separate Task 10.4 endpoint). (5) **Branch on `EXISTS(SELECT 1 FROM shows WHERE drive_file_id = $driveFileId)` (fix-1)**: if no `shows` row → call `runManualStageForFirstSeen(tx, driveFileId)` (NEW; Phase-1-only; cannot mint `shows`; on outcome 3 forces synthetic `FIRST_SEEN_REVIEW` per the bullet above). The helper accepts the existing `tx` and MUST NOT acquire its own lock OR open a fresh transaction. If a `shows` row exists → call `runManualSyncForShow_unlocked(tx, driveFileId, mode='manual')` — the lock-free inner variant introduced in this fix (see Task 6.7 amendment). The unlocked variant accepts the existing `tx` and MUST NOT call any `pg_*advisory*_lock` itself; it runs gate → parseSheet → enrichWithDrivePins → Phase 1 → Phase 2 on the passed-in connection. (6) On COMMIT, return the resulting state to the client (`{ status: 'parsed_pending_review', stagedId }` for first-seen success, `{ status: 'applied', slug }` for existing-show auto-apply, `{ status: 'parsed', stagedId }` for existing-show stage, or `{ status: 'still_failed', errorCode }`). Test the success/validation-failure/concurrent-409/transitioned-409 paths.
  - `app/api/admin/pending-ingestions/[id]/discard/route.ts` — POST handler. Accepts `{ id: string, kind: 'permanent_ignore' | 'defer_until_modified' }`. **Row-state read sequencing: identical lock-first ordering as the retry route**, so a retry-then-discard race cannot let this handler write `deferred_ingestions` against an already-restaged row. Steps: (1) `requireAdmin`. (2) **Lock-key bootstrap read (no state decisions)** — `SELECT drive_file_id FROM pending_ingestions WHERE id = $1` to derive the lock key only. If row missing → 404 `PENDING_INGESTION_NOT_FOUND`. NO state checks at this read. (3) Open a transaction via `withShowSyncTransaction(...)` and acquire the per-show advisory lock — `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $driveFileId))`. **Non-blocking** (matches retry route's contract): on `false` → ROLLBACK and return 409 `CONCURRENT_SYNC_SKIPPED` within ~100ms. (4) **INSIDE the lock — re-SELECT the row authoritative state with `FOR UPDATE`**: `SELECT id, drive_file_id, wizard_session_id, last_seen_modified_time FROM pending_ingestions WHERE id = $1 FOR UPDATE`. **(a)** 0 rows → ROLLBACK and return 409 `PENDING_INGESTION_TRANSITIONED` — the row was deleted between the bootstrap read and lock acquisition (a sibling Retry restaged it OR a sibling Discard already wrote a deferral). **(b)** `wizard_session_id IS NOT NULL` → ROLLBACK and return 409 `LIVE_ROW_REQUIRED`. **(c)** `last_seen_modified_time IS NULL` AND `kind = 'defer_until_modified'` → ROLLBACK and return 500 `MISSING_PENDING_INGESTION_MODTIME` (deferral cannot be safely created without a watermark; the Phase 1 hard-fail / `handleDriveFetchFailure` / `runManualStageForFirstSeen` UPSERT sites are required to populate this column — a NULL is a corruption signal). For `kind = 'permanent_ignore'` the column is irrelevant and not checked. (5) INSERT `deferred_ingestions` (`drive_file_id`, **`wizard_session_id = NULL`**, `kind`, `deferred_at_modified_time = pending_ingestions.last_seen_modified_time` for `defer_until_modified`; NULL for `permanent_ignore`). (6) DELETE the `pending_ingestions` row by `id`. (7) Return 200. Test: `permanent_ignore` writes `kind = 'permanent_ignore'` AND `deferred_at_modified_time IS NULL` AND **`wizard_session_id IS NULL`** AND DELETEs the source row; `defer_until_modified` writes `kind = 'defer_until_modified'` AND `deferred_at_modified_time = pending_ingestions.last_seen_modified_time` (assert non-null) AND **`wizard_session_id IS NULL`** AND DELETEs the source row.
  - `app/api/admin/admin-alerts/[id]/resolve/route.ts` — **Global-only route**. POST handler. Admin-gated. Resolves **strictly global alerts** (rows where `show_id IS NULL`). Used by the AdminAlertsBanner's "Mark resolved" button on global alerts. **The earlier draft phrased this as "resolves any alert by id, regardless of show_id" — that undercut §4.6's per-show resolution model where a per-show alert persists until the operator clicks through to `/admin/show/<slug>?alert_id=<id>` and resolves it from the show context.** A per-show alert silently dismissed via the global route would lose its show-scoped audit trail (the per-show resolve flow records the implicit show context) and would let stale dashboard tabs accidentally close per-show alerts the operator has not actually triaged. Steps: (1) `requireAdmin`. (2) `SELECT id, show_id, resolved_at FROM admin_alerts WHERE id = $1`. If row missing → 404 `ADMIN_ALERT_NOT_FOUND`. **(3) NEW: if the row's `show_id IS NOT NULL` → return 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE` (new code in §12.4) with response body `{ id, show_id, redirect_to: '/api/admin/show/<resolved-slug>/alerts/<id>/resolve' }` so the client knows to retry against the show-scoped route. The handler resolves the slug via `SELECT slug FROM shows WHERE id = $showId` (or omits `redirect_to` if the show was deleted, in which case the response carries `show_id` only and the client surfaces a manual cleanup hint via the §9.0.1 explainer).** (4) If `resolved_at IS NOT NULL` → return 200 with the row as-is (idempotent on already-resolved); do NOT update timestamps. (5) Otherwise `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $1 AND resolved_at IS NULL AND show_id IS NULL` (the `show_id IS NULL` predicate enforces the global-only contract at the SQL layer as a belt-and-suspenders against application-layer bugs that bypass step 3) and return 200 with the updated row. Tests: first-call success on a `show_id IS NULL` row writes timestamps; second call against an already-resolved global row returns 200 with the SAME `resolved_at` (idempotent — does NOT write a new timestamp); 404 only on a truly missing id. **NEW negative test**: synthesize a per-show alert on Show A (`show_id = <show-A-id>`). POST `/api/admin/admin-alerts/<alert-id>/resolve`. Assert: response is 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`; the response body contains `redirect_to` pointing at `/api/admin/show/<show-A-slug>/alerts/<alert-id>/resolve`; the alert row is UNCHANGED (`resolved_at` still NULL). Then POST against the redirect URL → assert 200 success and `resolved_at` is now set. **NEW belt-and-suspenders test**: bypass step 3 by patching the application layer to skip the per-show check and go straight to the UPDATE; assert the SQL `AND show_id IS NULL` predicate matches 0 rows so the per-show alert is STILL not resolved (defensive — guards a future application-layer bug that re-introduces the original hole). **Cross-show forgery is also NOT a concern here** — this route now refuses ALL per-show alerts, so cross-show is by definition impossible to reach via this surface; the show-scoped variant in Task 10.7 owns cross-show forgery rejection for legitimate per-show resolves.

  **Pending-panel SELECT scope**: the panel's data-loader runs:
  ```sql
  -- Live (NULL-session) hard-fails
  SELECT id, drive_file_id, drive_file_name, last_error_code, last_error_message,
         attempt_count, first_seen_at, last_attempt_at
    FROM pending_ingestions
   WHERE wizard_session_id IS NULL
   ORDER BY first_seen_at ASC;
  -- Live first-seen stages (where no shows row exists)
  SELECT ps.drive_file_id, ps.staged_id, ps.parse_result->'show' AS show_meta,
         ps.triggered_review_items, ps.staged_modified_time, ps.parsed_at
    FROM pending_syncs ps
    LEFT JOIN shows s ON s.drive_file_id = ps.drive_file_id
   WHERE ps.wizard_session_id IS NULL
     AND s.id IS NULL -- first-seen only; existing-show stages live in ActiveShowsPanel
   ORDER BY ps.parsed_at ASC;
  ```
  Both queries' `WHERE wizard_session_id IS NULL` is the live-row scope; without it, onboarding rows would leak into the dashboard during a Re-run Setup.

- [ ] **Step 3: Commit** `feat(admin): dashboard panels + admin_alerts banner + pending-panel action endpoints (§9.1, §9.1.1, §4.6)`.

### Task 10.7: Per-show parse panel + per-show alerts (§9.2, §4.6)

**Files:** Create: `app/admin/show/[slug]/page.tsx`, `components/admin/ParsePanel.tsx`, `components/admin/StagedReviewCard.tsx`, `components/admin/PerShowAlertSection.tsx`. Test: e2e.

**Per-show alert clickthrough + resolve is owned by this task.** Task 10.6 routes per-show banners to `/admin/show/<slug>?alert_id=<id>` but the highlight-on-arrival behavior + the resolve mutation have no task owner. This task owns both — keeping `/admin/show/<slug>` as the single owner of all surfaces under that URL prefix. The alert section is rendered above the four §9.2 parse-panel sub-sections so a clicked-through banner takes the operator straight to a highlighted, resolvable surface.

- [ ] **Step 1: Failing tests** — four sub-sections per §9.2; staged-review card appears at top when `pending_syncs` exists; Apply/Discard buttons wire to M6 endpoints. Reviewer-choices payload uses the §6.8.2 client-submission shape.
  - **Per-show alert section: data load + render**: synthesize an unresolved `admin_alerts` row with `show_id = <thisShow.id>` and code `AMBIGUOUS_EMAIL_BINDING`. Navigate to `/admin/show/<slug>` (no `?alert_id` param). Assert: `<PerShowAlertSection>` renders ABOVE the four §9.2 sub-sections, listing every unresolved alert for this show with `messageFor(code, params).dougFacing` headline + an `<ErrorExplainer>` link (Task 10.9) + a "Mark resolved" button. Multiple unresolved alerts render stacked, ordered by `raised_at DESC` (mirroring the dashboard banner).
  - **Per-show alert section: highlight-on-arrival**: navigate to `/admin/show/<slug>?alert_id=<id>` for an unresolved alert. Assert: (a) the matching alert row is rendered with a visual emphasis ring (Tailwind class such as `ring-2 ring-amber-500 ring-offset-2`) and a different background tint than other alerts in the list; (b) on first paint the page scrolls the matching row into view (`element.scrollIntoView({ behavior: 'smooth', block: 'center' })`); (c) the URL `?alert_id` param can match at most one row — if no match (already-resolved or different-show alert id), render the section as if no `?alert_id` was provided AND emit a `sync_log` entry coded `admin_alert_clickthrough_stale` with `payload = { alert_id, show_id }` so ops can spot a misrouted click; (d) the highlight does NOT auto-resolve the alert — the operator must click the "Mark resolved" button.
  - **Per-show alert section: resolve mutation**: click "Mark resolved" on a highlighted row. Assert: POST `/api/admin/show/[slug]/alerts/[id]/resolve` (NEW show-scoped route created by this task — distinct from Task 10.6's global-by-id route). Server action runs `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $1 AND show_id = (SELECT id FROM shows WHERE slug = $2) AND resolved_at IS NULL`. The `show_id` predicate is the per-show scope guard — a path-bound resolve on `/admin/show/<otherSlug>` cannot resolve an alert belonging to a different show even if the operator forges the `id` param. Assert: (a) row updates with `resolved_at` and `resolved_by` populated; (b) banner clears for that show on next render; (c) if the alert was already resolved (UPDATE matches 0 rows because of the `resolved_at IS NULL` filter) → return 200 idempotent on the already-resolved row, NOT 404; (d) if the alert belongs to a different show OR doesn't exist → return 404 `ADMIN_ALERT_NOT_FOUND`; (e) idempotency — second click after success returns 200 with the SAME `resolved_at` timestamp (does NOT write a new one).
  - **Cross-show forgery hardening**: synthesize alert A on show A. (a) Call POST `/api/admin/show/<show-B-slug>/alerts/<alert-A-id>/resolve` (cross-show forgery via show-scoped route). Assert: 404 `ADMIN_ALERT_NOT_FOUND` (the show-scoped route's `show_id = (SELECT id FROM shows WHERE slug = $slug)` predicate doesn't match alert A's row). Alert A remains unresolved. (b) Call POST `/api/admin/admin-alerts/<alert-A-id>/resolve` (per-show alert posted to the global route). Assert: 400 `ALERT_REQUIRES_SHOW_SCOPED_RESOLVE` with response body carrying `redirect_to: '/api/admin/show/<show-A-slug>/alerts/<alert-A-id>/resolve'`. Alert A remains unresolved. (c) POST against the `redirect_to` URL — assert 200 success and `resolved_at` is now non-null (this is the legitimate show-scoped resolve flow). (d) Call POST `/api/admin/show/<show-A-slug>/alerts/<alert-C-id>/resolve` with a cross-show id (synthesize a SECOND alert C on show C, then call show-A-scoped resolve with `<alert-C-id>`). Assert: 404 `ADMIN_ALERT_NOT_FOUND` (the show-scoped route's `show_id = (SELECT id FROM shows WHERE slug = $slug)` predicate doesn't match alert C's row).
  - **Cross-show clickthrough hardening regression**: synthesize alert A on show A and navigate to `/admin/show/<show-B-slug>?alert_id=<alert-A-id>`. Assert: per-show alert section does NOT render alert A under show B (the SELECT scopes by `show_id = $thisShow.id`); the highlight code path falls through to "no match" and emits `admin_alert_clickthrough_stale`; show B's own unresolved alerts (if any) render normally with no highlight.
- [ ] **Step 2: Implement.** Reviewer choices use server-derived per-item options (FIRST_SEEN_REVIEW → `apply` only; MI-12 → `rename` | `reject`; MI-13 → `rename` | `independent`; etc.). The diff view per section shows prior vs incoming with deletions in red and changes in yellow.

  **Per-show alert section implementation.** Render `<PerShowAlertSection showId={show.id} highlightAlertId={searchParams.alert_id} />` ABOVE the four §9.2 sub-sections. Component data load: `SELECT id, code, context, raised_at, last_seen_at, occurrence_count FROM admin_alerts WHERE show_id = $showId AND resolved_at IS NULL ORDER BY raised_at DESC`. Render each row with the §12.4 doug-facing copy (via `messageFor(code, deriveBannerParams(alert)).dougFacing`), the §9.0.1 `<ErrorExplainer>` (Task 10.9), and a "Mark resolved" button that POSTs to the **show-scoped route** `/api/admin/show/[slug]/alerts/[id]/resolve`. The matching row receives a `data-testid="alert-row-highlighted"` AND a visual emphasis ring; non-matching rows receive `data-testid="alert-row"` only. On mount, the client component runs `document.querySelector('[data-testid="alert-row-highlighted"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })`.

  **Show-scoped resolve route — `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts`.** POST handler. Admin-gated. The route owns cross-show forgery rejection — Task 10.6's global-by-id route is the unscoped variant for global alerts; this route enforces the per-show match. Steps: (1) `requireAdmin`. (2) Resolve `slug → show_id`: `SELECT id FROM shows WHERE slug = $slug`. If no row → 404 `ADMIN_ALERT_NOT_FOUND` (the slug doesn't exist). (3) `SELECT id, show_id, resolved_at FROM admin_alerts WHERE id = $alertId`. If row missing → 404. If `show_id` does NOT match the resolved show id → 404 (cross-show forgery rejection — DON'T leak the alert's existence). (4) If `resolved_at IS NOT NULL` → return 200 idempotent (alert already resolved; don't write a new timestamp). (5) Otherwise `UPDATE admin_alerts SET resolved_at = now, resolved_by = $admin WHERE id = $alertId AND show_id = $resolvedShowId AND resolved_at IS NULL` and return 200 with the updated row. The `AND show_id = $resolvedShowId` predicate is the second line of defense (the SELECT in step 3 is the first); together they make cross-show resolution impossible regardless of param forgery.

  **Why two routes.** The earlier draft tried to use a single `/api/admin/admin-alerts/[id]/resolve` route for both global and per-show alerts, with Task 10.7 "adding" a `show_id` predicate via a server-action prop. That couples the route's behavior to the caller's claim about which surface invoked it — which is exactly the forgery hole the per-show predicate is supposed to close. The corrected design exposes TWO distinct routes with non-overlapping contracts: the global route resolves by id with no scope check (used only by the AdminAlertsBanner for `show_id IS NULL` rows); the show-scoped route enforces the slug-id match server-side and is the only path used by `<PerShowAlertSection>`. Server logic is statically tied to the route, not to caller-supplied scope.

- [ ] **Step 3: Commit** `feat(admin): per-show parse panel + staged review + per-show alerts section (§9.2, §4.6)`.

### Task 10.8: Impersonation / preview-as (§9.3)

**Files:** Create: `app/admin/show/[slug]/preview/[crewId]/page.tsx`, `components/admin/PreviewBanner.tsx`. Test: e2e.

**Identity-only `admin_preview` kind.** Earlier draft passed `{ kind: 'admin_preview', impersonate: crewMember }` to `getShowForViewer`. That breaks Task 4.3's locked **identity-only** contract: the helper accepts only `{ kind: 'crew', crewMemberId }` or `{ kind: 'admin' }` — passing a caller-supplied `crewMember` object reopens the role-spoof hole the contract was specifically designed to close (Task 4.3's regression test asserts the signature does NOT accept role flags or pre-derived role objects). The corrected design adds a third `Viewer` kind that resolves like crew (re-derives role from `crew_members.role_flags` bound to `(crewMemberId, showId)` inside the helper, with the same fail-closed cross-show behavior) but is auth-gated as admin and renders the sticky banner:

```ts
type Viewer =
  | { kind: 'crew'; crewMemberId: string }
  | { kind: 'admin' }
  | { kind: 'admin_preview'; crewMemberId: string }; //

// Inside getShowForViewer (Task 4.3): for 'admin_preview', the role-derivation lookup is
// IDENTICAL to 'crew' — bind by `id = $crewMemberId AND show_id = $showId`, fail closed if
// no match (LINK_NO_CREW_MATCH), derive role flags fresh from crew_members.role_flags. The
// only difference from 'crew' is the surface auth (route requires requireAdmin) and the
// rendered banner. The helper does NOT accept a caller-supplied crewMember object.
```

- [ ] **Step 1: Failing tests** — admin opens preview-as page → page renders crew page exactly as that crew would see it; sticky banner visible; banner has `position: sticky; top: 0; z-index: 100;` and yellow tint.
  - **Identity-only signature regression**: `lib/data/getShowForViewer.ts` source MUST accept `Viewer` discriminated union with exactly three kinds — `crew` / `admin` / `admin_preview` — and the `admin_preview` variant carries ONLY `crewMemberId`, NEVER an `impersonate` object or any role-bearing field. Test reads the source file and asserts the type definition matches; greps for `impersonate:` and asserts zero hits across `lib/data/` and `app/admin/show/[slug]/preview/`.
  - **Cross-show fail-closed for admin_preview**: seed two shows. Show A has crew member Alice. Call `getShowForViewer(showB.id, { kind: 'admin_preview', crewMemberId: alice.id })`. Assert the call THROWS `LINK_NO_CREW_MATCH` exactly like the `kind: 'crew'` variant — does NOT return show B's data with Alice's role flags applied. Same fail-closed contract as the regular crew path.
  - **Role re-derivation regression for admin_preview**: stage a crew_members.role_flags update demoting `alice` from LEAD to A1. Then call `getShowForViewer(showA.id, { kind: 'admin_preview', crewMemberId: alice.id })`. Assert `result.financials` is absent (helper re-derived role from current DB row, not from any cached / passed-in value).
- [ ] **Step 2: Implement** the route as `requireAdmin` gated, then call `getShowForViewer(showId, { kind: 'admin_preview', crewMemberId })`. Render the sticky `<PreviewBanner>` above the crew page content. Do NOT pass any `impersonate` field — the helper derives everything from `crewMemberId` + `showId`.
- [ ] **Step 3: Commit** `feat(admin): preview-as impersonation via identity-only admin_preview kind (§9.3)`.

### Task 10.9: In-app help + tour + error explainer (§9.0.1)

**Files:** Create: `components/admin/HelpTooltip.tsx`, `components/admin/Tour.tsx`, `components/admin/ErrorExplainer.tsx`. Modify: `lib/messages/catalog.ts` (Task 9.4) to add a `helpfulContext` field to every catalog entry that has `dougFacing` non-null. Test: e2e smoke + per-code coverage assertion.

**Three first-class help affordances per spec §9.0.1.** Spec §9.0.1 names THREE first-class help requirements: (a) `?` icons next to every section header, (b) "Take the tour" link in dashboard footer, (c) every error message links to "What does this mean?" with a one-paragraph plain-language explanation. Earlier draft of this task scheduled only (a) and (b). Without (c), every error message in `/admin` (banner alerts, parse-panel warnings, action-failure toasts) violates a documented spec requirement.

The explainer is implemented as a small inline link rendered next to every catalog-bound error message render-site, opening a popover/modal that shows the §12.4 catalog row's `dougFacing` copy as the headline plus a longer `helpfulContext` string (a new catalog field) explaining what the error means in plain language and what the operator should do.

- [ ] **Step 1: Failing tests**
  - **Section-header help icons**: every section header in `/admin/dashboard`, `/admin/show/[slug]`, `/admin/settings`, and the wizard steps has a `?` icon adjacent to it; clicking opens a tooltip with the section's plain-language description.
  - **"Take the tour" link**: dashboard footer renders a "Take the tour" link; clicking starts a guided walkthrough of dashboard → per-show parse panel → preview-as.
  - **Error explainer link rendered for every catalog-bound error**: at every error-message render site in admin UI, assert a "What does this mean?" link is rendered next to the message text. Earlier draft enumerated only `AdminAlertsBanner` + parse-panel warnings + Apply/Discard toasts. The corrected enumeration covers ALL admin error surfaces:
    - **Dashboard surfaces**: `AdminAlertsBanner` (Task 10.6) — banner rows AND global-alert "Mark resolved" failure toasts; `PendingPanel` row error rendering — `pending_ingestions.last_error_code` with `<ErrorExplainer>` next to the message (Task 10.6 retry-2 amendment); Pending-panel action-failure toasts on `/api/admin/pending-ingestions/[id]/retry|discard` failures including the finding-2/4 codes (`PENDING_INGESTION_NOT_FOUND`, `LIVE_ROW_REQUIRED`, `MISSING_PENDING_INGESTION_MODTIME`, `PENDING_INGESTION_TRANSITIONED`).
    - **Per-show parse panel**: parse-panel warnings (Task 10.7), per-show alert section rows (Task 10.7 retry-2 amendment) including `AMBIGUOUS_EMAIL_BINDING` etc., Apply/Discard action-failure toasts (Task 6.11/6.12), per-show "Mark resolved" failure toasts.
    - **Wizard step 2 (verify-folder) failures**: every error message rendered by `<Step2Verify>` MUST carry an `<ErrorExplainer>` next to it — `ONBOARDING_FOLDER_INVALID_URL`, `ONBOARDING_FOLDER_NOT_SHARED`, `ONBOARDING_OPERATOR_ERROR`, `WIZARD_SESSION_SUPERSEDED`, `LIVE_ROW_CONFLICT`, `WIZARD_ISOLATION_INDEXES_MISSING`. **NOT** `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` — that code is admin-log-only per §12.4 conventions and never reaches Doug's UI; the new wizard's UI implicitly reflects the supersession via the rotated session id. The wizard inline-error component reads the §12.4 catalog via `messageFor(code).dougFacing` AND wires `<ErrorExplainer code=.. />` so Doug can read the longer plain-language explanation without leaving the wizard.
    - **Auth — OAuth callback**: `/auth/sign-in` callback failure surface renders `OAUTH_STATE_INVALID` and `OAUTH_REDIRECT_INVALID` with `<ErrorExplainer>` next to the message.
    - **Wizard step 3 action-failure toasts**: Task 10.4's three `pending_ingestions` endpoints (Retry / Defer / Ignore) and the staged Apply/Discard flows return error codes that surface as toasts; each toast renders the message via `messageFor` AND attaches `<ErrorExplainer>`.
    - **Wizard finalize failures**: `ONBOARDING_NOT_RESOLVED`, `WIZARD_SESSION_SUPERSEDED` rendered by Task 10.5's finalize button — toast carries `<ErrorExplainer>`.
    - **Settings page failures**: Re-run Setup action-failure messages render with `<ErrorExplainer>`.
    - **Report-flow surfaces**: the admin report modal (§13) and the per-page Report buttons that surface `REPORT_RATE_LIMITED_ADMIN`, `IDEMPOTENCY_IN_FLIGHT`, `REPORT_HORIZON_EXPIRED`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_LEASE_THRASHING` — each error-rendering toast/inline message in `components/report/**` MUST attach `<ErrorExplainer>`. The crew Report flow surfaces only crew-facing copy and no explainer (per spec §9.0.1 the explainer is admin-side only).
  - **Per-code catalog-explainer coverage assertion**: enumerate every code in `lib/messages/catalog.ts` that has `dougFacing` non-null. For each code, assert the catalog entry also has `helpfulContext` non-null AND non-empty. (Codes whose `dougFacing` is `—` / null don't need an explainer because they never reach Doug's UI — they're admin-log only.) Test fails if any new code is added without `helpfulContext`.
  - **Catalog-explainer renderer-coverage assertion**: enumerate every spec §12.4 code whose `dougFacing` is non-null AND assert it has at least one renderer site in source that uses `<ErrorExplainer code="<code>"` (or pulls the code from a runtime variable bound to that code). Use the X.1 `CODE_SCENARIOS` registry as the spec input: for each entry whose §12.4 row has `dougFacing` non-null, run the scenario and assert the rendered tree contains at least one `<ErrorExplainer>` instance whose `code` prop matches. Failure mode this catches: a new admin-facing code added to §12.4 that falls into a render site (wizard, settings, report modal, dashboard) which forgot to attach the explainer. Scope: admin-facing codes only — codes whose §12.4 audience is crew-only (`crewFacing` non-null, `dougFacing` null, e.g., `LINK_EXPIRED`, `SESSION_IDLE_TIMEOUT`) are exempt because the explainer per §9.0.1 is admin-only. Required to fail if any of the following codes lacks renderer coverage: `ONBOARDING_FOLDER_INVALID_URL`, `ONBOARDING_FOLDER_NOT_SHARED`, `ONBOARDING_OPERATOR_ERROR`, `ONBOARDING_NOT_RESOLVED`, `WIZARD_SESSION_SUPERSEDED`, `LIVE_ROW_CONFLICT`, `WIZARD_ISOLATION_INDEXES_MISSING`, `REPORT_RATE_LIMITED_ADMIN`, `IDEMPOTENCY_IN_FLIGHT`, `REPORT_HORIZON_EXPIRED`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_LEASE_THRASHING`, `STALE_DISCARD_REJECTED`, `STAGED_PARSE_OUTDATED`, `STAGED_PARSE_SOURCE_GONE`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `STAGED_PARSE_RESTAGED_INLINE`, `STAGED_PARSE_SUPERSEDED`, **: `PENDING_INGESTION_NOT_FOUND`, `LIVE_ROW_REQUIRED`, `MISSING_PENDING_INGESTION_MODTIME`, `PENDING_INGESTION_TRANSITIONED`, `ADMIN_ALERT_NOT_FOUND`, `OAUTH_STATE_INVALID`, `OAUTH_REDIRECT_INVALID`** — surface inventory: `PENDING_INGESTION_NOT_FOUND` / `LIVE_ROW_REQUIRED` / `MISSING_PENDING_INGESTION_MODTIME` / `PENDING_INGESTION_TRANSITIONED` render in PendingPanel action-failure toasts (Task 10.6); `ADMIN_ALERT_NOT_FOUND` renders in AdminAlertsBanner global-resolve failure toasts (Task 10.6) AND PerShowAlertSection resolve-failure toasts (Task 10.7); `OAUTH_STATE_INVALID` / `OAUTH_REDIRECT_INVALID` render in `/auth/sign-in` callback failure surface. **`ALERT_REQUIRES_SHOW_SCOPED_RESOLVE`** — surface inventory: renders in AdminAlertsBanner global-resolve failure toasts (Task 10.6) when the route returns 400 because a per-show alert was incorrectly POSTed to the global route. The toast surfaces the `redirect_to` URL from the response body as a clickable link so the operator can hop directly to `/admin/show/<slug>?alert_id=<id>` (where the per-show resolve flow lives). **Codes explicitly EXEMPT (admin-log-only — `dougFacing` is null per §12.4 conventions section)**: `WIZARD_SESSION_SUPERSEDED_DURING_SCAN`, `CONCURRENT_SYNC_SKIPPED`, `LOCK_OWNERSHIP_ASSERTION_FAILED`, `STAGED_PARSE_REVISION_RACE`, `STALE_WRITE_ABORTED`, `STALE_PUSH_ABORTED`, `WEBHOOK_NOOP_ALREADY_SYNCED`, `LINK_CROSS_SHOW_REUSE`, `UNEXPECTED_PARENT`, `DIAGRAMS_TAB_MISSING`, `TYPO_NORMALIZED` — these fire only into structured logs / `sync_log`, never to Doug's UI, and are exempt from explainer wiring. The exempt-set is auto-derived from `SPEC_CODES` (any row whose `dougFacing` is null is exempt) per the X.1 contract — manual maintenance of the exempt list above is for documentation only. The full list is auto-derived from `SPEC_CODES` per the X.1 contract.
  - **Explainer renders catalog content, NOT raw code text**: synthesize an admin alert (`AMBIGUOUS_EMAIL_BINDING`) and click its "What does this mean?" link. Assert the popover content contains the §12.4 `dougFacing` copy AND the `helpfulContext` text; assert it does NOT contain the literal string `AMBIGUOUS_EMAIL_BINDING` (the code stays internal). Cross-references X.2 substring detection.
- [ ] **Step 2: Implement** `?` icons next to every section header in admin; "Take the tour" link in dashboard footer.
- [ ] **Step 3: Implement `<ErrorExplainer>`** as a small inline link/icon (`<button>` element with text "What does this mean?", styled as a link). Props: `{ code: MessageCode; params?: Record<string, string> }`. On click, opens a popover/modal containing:
  1. Headline: `messageFor(code, params).dougFacing`.
  2. Body: `lookupHelpfulContext(code)` — a longer one-paragraph plain-language explanation pulled from the new `helpfulContext` catalog field (added in Step 4 below).
  3. Optional follow-up: if the catalog row's `followUp` column is non-empty, render it as a hint line ("Doug → fix sheet", etc.) translated to user-facing copy.

  Wire `<ErrorExplainer code=.. params=.. />` into every error-message render site in admin UI:
  - **Dashboard surfaces**: - `AdminAlertsBanner` (Task 10.6): explainer next to every banner row.
    - `PendingPanel`: explainer next to each `pending_ingestions.last_error_code` rendering AND next to action-failure toasts on `/api/admin/pending-ingestions/[id]/retry|discard` failures, including the codes `PENDING_INGESTION_NOT_FOUND`, `LIVE_ROW_REQUIRED`, `MISSING_PENDING_INGESTION_MODTIME`, and `PENDING_INGESTION_TRANSITIONED`.
    - `AdminAlertsBanner`: explainer next to every banner row AND next to global-alert "Mark resolved" failure toasts including `ADMIN_ALERT_NOT_FOUND`.
  - **Per-show parse panel**: explainer next to every triggered-MI item, every parse warning, every per-show alert section row, every Apply/Discard action-failure toast, AND next to per-show "Mark resolved" failure toasts including `ADMIN_ALERT_NOT_FOUND`.
  - **Wizard surfaces**: - `<Step2Verify>` (Task 10.3): explainer next to every inline error rendering — `ONBOARDING_FOLDER_INVALID_URL`, `ONBOARDING_FOLDER_NOT_SHARED`, `ONBOARDING_OPERATOR_ERROR`, `WIZARD_SESSION_SUPERSEDED`, `LIVE_ROW_CONFLICT`, `WIZARD_ISOLATION_INDEXES_MISSING`. **NOT** `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` — that code is admin-log-only per §12.4 conventions and never reaches Doug's UI; the new wizard's UI implicitly reflects the supersession via the rotated session id.
    - `<Step3Review>` (Task 10.4): explainer next to action-failure toasts on Retry / Defer / Ignore / Apply / Discard endpoints.
    - Wizard finalize button (Task 10.5): explainer next to `ONBOARDING_NOT_RESOLVED` and `WIZARD_SESSION_SUPERSEDED` toasts.
  - **Auth — OAuth callback surface**: `/auth/sign-in` callback failure surface — explainer next to inline rendering of `OAUTH_STATE_INVALID` and `OAUTH_REDIRECT_INVALID` (these codes are crew-facing AND admin-facing; per §9.0.1 the explainer is admin-side only, BUT both codes have non-null `dougFacing` because they can also fire when an admin completes the OAuth round-trip).
  - **Settings surface**: `/admin/settings` Re-run Setup action-failure toasts carry the explainer.
  - **Report-flow surfaces**: admin Report modal AND per-page admin Report buttons (§13) carry `<ErrorExplainer>` next to error toasts/inline messages — `REPORT_RATE_LIMITED_ADMIN`, `IDEMPOTENCY_IN_FLIGHT`, `REPORT_HORIZON_EXPIRED`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_LEASE_THRASHING`. Crew Report flow surfaces only crew-facing copy and does NOT carry the explainer (per spec §9.0.1 the explainer is admin-side only).
  - **Generic action-failure toasts (Tasks 6.11/6.12, 10.4)**: explainer inside the toast next to the message text.
- [ ] **Step 4: Extend catalog** — modify `lib/messages/catalog.ts` (Task 9.4) to add a `helpfulContext: string | null` field to every entry. Populate `helpfulContext` for every code whose `dougFacing` is non-null. The `helpfulContext` copy is one paragraph of plain-language explanation written for a non-technical reader (Doug). Examples:
  - `AMBIGUOUS_EMAIL_BINDING` → `helpfulContext`: "When two people on the crew list share the same email address, we can't safely tell who's logging in. The duplicate-email check should normally catch this in the parse step. If you're seeing this code, the safest fix is to look at the most recent edits to your crew block — usually one of the two emails is a typo or a paste mistake. Once you correct the duplicate in your sheet, this alert will clear automatically on the next sync."
  - `DRIVE_FETCH_FAILED` → `helpfulContext`: "Google Drive temporarily blocked or refused our request to read this sheet. The most common cause is a transient network or permissions hiccup; we keep retrying automatically. If this stays for more than an hour, double-check that the folder is still shared with the service account email and that the sheet hasn't been moved out of the watched folder."
  - … one row per dougFacing-non-null code. **Spec §12.4 catalog amendment is required** — the new `helpfulContext` column is added to the spec's §12.4 table by the Fix 4 spec amendment so the source of truth and the implementation stay in lockstep.
- [ ] **Step 5:** Commit `feat(admin): help + tour + error explainer with catalog helpfulContext (§9.0.1, §12.4)`.

### Task 10.10: First-seen staged review surface

**Files:** Create: `app/admin/show/staged/[stagedId]/page.tsx`, `app/api/admin/show/staged/[stagedId]/apply/route.ts`, `app/api/admin/show/staged/[stagedId]/discard/route.ts`. Test: e2e + unit.

**Why this task exists.** Task 10.6's PendingPanel renders first-seen `pending_syncs` rows with a "Review and Apply" link routed to `/admin/show/staged/[stagedId]?firstSeen=true`. Earlier draft of M10 had no task creating that route — clicking the link would 404 and dead-end every first-seen review flow. Spec §9.1 panel 2 + §9.2 sub-section 0 require a real review surface for first-seen candidates. The route is distinct from `/admin/show/<slug>` because **no slug exists yet** for the candidate (the slug is minted only on Apply, derived from `parse_result` per §6.9). Lookup is keyed on `pending_syncs.staged_id`.

**Why a separate route, not a query param on `/admin/show/<slug>`.** The slug is the lookup key for `/admin/show/[slug]/page.tsx`'s `SELECT * FROM shows WHERE slug = $1`. First-seen candidates have NO `shows` row, so there is no slug to put in the URL. A slug-less route at `/admin/show/staged/[stagedId]` keys off the `pending_syncs.staged_id` directly and avoids contorting the `[slug]` route to handle the no-row-yet case.

**Apply contract.** The Apply path is its OWN route handler (`POST /api/admin/show/staged/[stagedId]/apply`), distinct from the existing `/api/admin/staged/[fileId]/apply` route (Task 6.11) which is keyed on `drive_file_id`. The new route is keyed on `staged_id` (a stronger CAS — same `staged_id` is per-version, whereas `drive_file_id` is per-file and survives across re-stages), and runs the §5.2 Phase 2 path with the operator-supplied `reviewer_choices` payload. On success it returns `{ slug }` so the client can redirect to `/admin/show/<slug>`. On reviewer-choices validation failure it returns the §12.4 codes (`MISSING_REVIEWER_CHOICE`, `EXTRA_REVIEWER_CHOICE`, `DUPLICATE_REVIEWER_CHOICE`, `INVALID_REVIEWER_ACTION`).

- [ ] **Step 1: Failing tests**
  - **Page renders staged data**: synthesize a first-seen `pending_syncs` row with `staged_id = <stagedId>`, `wizard_session_id IS NULL`, no matching `shows` row. Navigate to `/admin/show/staged/<stagedId>`. Assert: page renders the same review-card UI shape as `/admin/show/<slug>?review=staged_id` (from Task 10.7). Specifically: the `triggered_review_items[]` are listed with their §12.4-resolved doug-facing copy (via `messageFor`), each with a reviewer-choice control wired to its invariant's enum (per §6.8.2); the candidate `title`/`dates` from `parse_result.show` render at the top; `staged_modified_time` renders as "staged from edits Doug made on …"; the diff against an empty prior state (since no `shows` row exists) renders as "all incoming rows are new"; an Apply button is enabled once every `triggered_review_items[]` entry has a non-default choice; a Discard button is always enabled. **The §9.2 1–3 informational sub-sections (last 5 sync attempts, parse_warnings history, crew preview links) do NOT render** — they assume an existing `shows` row.
  - **Page on missing stagedId returns 404**: navigate to `/admin/show/staged/<unknown-stagedId>`. Assert: 404 response with the §12.4 `STALE_DISCARD_REJECTED` code.
  - **Page on EXISTING-show staged_id rejects**: synthesize a `pending_syncs` row whose `drive_file_id` matches an existing `shows` row (a re-stage of an already-live show). Navigate to `/admin/show/staged/<stagedId>`. Assert: the route 302-redirects to `/admin/show/<slug>?review=<stagedId>` (the existing-show review surface owned by Task 10.7); the first-seen route is exclusively for candidates without an existing `shows` row. Without this guard a re-stage could be reviewed twice (once via slug, once via stagedId) and produce inconsistent reviewer-choice audit trails.
  - **Apply success path**: synthesize a first-seen `pending_syncs` row whose `triggered_review_items[]` are all approvable (e.g., a `FIRST_SEEN_REVIEW` invariant where `action='approve'`). POST `/api/admin/show/staged/<stagedId>/apply` with the §6.8.2 reviewer-choices payload. Assert: response is 200 `{ slug: '<derived-slug>' }`; a `shows` row exists with the slug derived from `parse_result.show.title` + dates per §6.9; the original `pending_syncs` row is GONE; both writes happen in the same transaction (verify by injecting a fault between the INSERT and DELETE — both should rollback together). The route then issues a 302 redirect to `/admin/show/<derived-slug>` for client-side navigation, OR the client reads the `{ slug }` body and navigates itself; both behaviors are tested.
  - **Apply on slug-derivation collision**: synthesize a first-seen candidate whose derived slug would collide with an existing `shows.slug` (e.g., another show with the same title + dates). Assert: §6.9 retry-on-unique-violation loop produces `<slug>-2` (or `-3`, etc.) by catching Postgres `23505` *unique_violation* on the INSERT and advancing the suffix; the loser's INSERT raises `23505`, the loop catches it, retries with the next suffix, and INSERTs successfully. On 100 attempts exhausted (`<base>` + `<base>-2`..`<base>-100` all collided) the route returns 500 with `SLUG_COLLISION_EXHAUSTED` per §12.4 (renamed from `SLUG_COLLISION_LIMIT`).
  - **Concurrent first-seen Applies — slug-derivation race regression**: synthesize TWO first-seen `pending_syncs` rows with DISTINCT `drive_file_id`s (`drive_file_id_A`, `drive_file_id_B`) whose `parse_result.show.title` and dates yield the SAME `<base>` slug (e.g., both titled "RPAS Central 2026" with set date 2026-03-23). POST both `/api/admin/staged/<fileId>/apply` calls in parallel. Assert: exactly one wins with `slug = <base>` and the other wins with `slug = <base>-2`; both `shows` rows exist; both `pending_syncs` rows are GONE; both `sync_audit` rows are written. Without the retry loop, a non-deterministic outcome would result: either both INSERTs see the same empty `existingSlugs`, both pick `<base>`, and one fails with `23505` and surfaces as a 500 to the operator (UX failure mode), OR a pre-check-then-INSERT TOCTOU window allows two `<base>` rows briefly which violates the UNIQUE constraint. The retry loop closes both windows: the database's UNIQUE constraint is the authoritative check, observed via `23505`, and the loser silently advances to `-2`. Repeat the test with THREE concurrent Applies for the same base — assert one `<base>`, one `<base>-2`, one `<base>-3`.
  - **Apply with invalid reviewer choices**: POST with a missing/extra/duplicate/invalid `reviewer_choices` entry. Assert: response is 400 with `MISSING_REVIEWER_CHOICE` / `EXTRA_REVIEWER_CHOICE` / `DUPLICATE_REVIEWER_CHOICE` / `INVALID_REVIEWER_ACTION` per §12.4; the `pending_syncs` row is UNCHANGED; no `shows` row was created.
  - **Apply with stale staged_id (CAS race)**: synthesize a candidate. Then in a sibling transaction, DELETE the `pending_syncs` row (simulating a sibling Discard or a fresh re-stage that DELETED + INSERTed with a new `staged_id`). Now POST `/api/admin/show/staged/<old-stagedId>/apply`. Assert: response is 404 `STALE_DISCARD_REJECTED`; no `shows` row was created.
  - **Discard success path (three §6.8.1 variants)**: POST `/api/admin/show/staged/<stagedId>/discard` with `{ kind: 'try_again_next_sync' | 'defer_until_modified' | 'permanent_ignore' }`. Assert: for `try_again_next_sync` — `pending_syncs` row is DELETEd, no `deferred_ingestions` row written. For `defer_until_modified` — `pending_syncs` row DELETEd AND a `deferred_ingestions` row is written with `kind = 'defer_until_modified'` AND `deferred_at_modified_time = pending_syncs.staged_modified_time`. For `permanent_ignore` — `pending_syncs` row DELETEd AND `deferred_ingestions` written with `kind = 'permanent_ignore'`. In all three, NO `shows` row is created.
  - **Concurrent Apply + Discard race**: two parallel POSTs (Apply + Discard) targeting the same `staged_id`. Assert: exactly one wins (the loser returns 404 `STALE_DISCARD_REJECTED`). If Apply won — `shows` row exists, `pending_syncs` GONE, NO `deferred_ingestions`. If Discard won — no `shows` row, `pending_syncs` GONE, `deferred_ingestions` written iff `kind != 'try_again_next_sync'`. The race is gated by the per-show advisory lock derived from `pending_syncs.drive_file_id`.
  - **End-to-end happy path**: from the dashboard PendingPanel, click "Review and Apply" → land on `/admin/show/staged/<stagedId>` → fill reviewer choices → click Apply → assert redirect to `/admin/show/<derived-slug>` → assert the `<derived-slug>` page renders successfully (the new show is live).
- [ ] **Step 2: Implement** `app/admin/show/staged/[stagedId]/page.tsx` as a Server Component. Steps:
  1. `requireAdmin`.
  2. `SELECT staged_id, drive_file_id, parse_result, triggered_review_items, staged_modified_time, parsed_at, wizard_session_id FROM pending_syncs WHERE staged_id = $1 AND wizard_session_id IS NULL`. **The `wizard_session_id IS NULL` clause enforces live-row scope** — wizard-staged rows have their own Task 10.4 surface and must not surface here.
  3. If no row → render 404 page (use `notFound` from `next/navigation`).
  4. If `EXISTS(SELECT 1 FROM shows WHERE drive_file_id = <row.drive_file_id>)` → 302 redirect to `/admin/show/<slug>?review=<stagedId>` (existing-show review surface).
  5. Render the same `<StagedReviewCard>` component Task 10.7 builds, parameterized for first-seen mode. Pass `parse_result.show` for title/dates header, `triggered_review_items` for the reviewer-choice controls, `staged_modified_time` for the "staged from …" line, and `mode = 'first_seen'` so the card knows to (a) hide the §9.2 1–3 sub-sections, (b) wire Apply to `POST /api/admin/show/staged/[stagedId]/apply` instead of the slug-keyed route, (c) wire Discard to `POST /api/admin/show/staged/[stagedId]/discard`.
- [ ] **Step 3: Implement** `app/api/admin/show/staged/[stagedId]/apply/route.ts` as a **THIN FRONT DOOR** delegating to the canonical `applyStaged` helper from Task 6.11 ( — the route MUST NOT carry its own §6.8.1 gates; the inline draft skipped `base_modified_time` CAS, the mandatory Drive `files.get(modifiedTime,parents,trashed)` re-verify, and the `sync_audit` write that exist as **non-negotiable canonical gates** in Task 6.11). The first-seen route is **always live-scope** (wizard step-3 first-seen review is a separate Task 10.4 surface). Steps:
  1. `requireAdmin`.
  2. **Bootstrap row read** (lock-key derivation only, no state decisions): `SELECT drive_file_id FROM pending_syncs WHERE staged_id = $1 AND wizard_session_id IS NULL`. If 0 rows → 404 `STALE_DISCARD_REJECTED`.
  3. Parse and validate the request body's `reviewer_choices` payload shape (light JSON-shape check — full per-item validation happens inside `applyStaged`). On JSON-shape failure → 400.
  4. **Delegate to the canonical helper**: call `applyStaged({ stagedId, sourceScope: 'live', reviewerChoices, adminEmail: $admin.email })` (Task 6.11's exported `lib/sync/applyStaged.ts`). The helper enforces ALL of: per-show advisory lock acquisition (`CONCURRENT_SYNC_SKIPPED` on `pg_try_advisory_xact_lock` returning false), source-scoped re-SELECT with `FOR UPDATE` (row missing post-lock → `STALE_DISCARD_REJECTED`), **`staged_id` CAS + `base_modified_time IS NOT DISTINCT FROM` CAS**, **mandatory Drive `files.get(modifiedTime,parents,trashed)` re-verify** with `STAGED_PARSE_OUTDATED` / `STAGED_PARSE_SOURCE_GONE` (recovery UPSERTs `pending_ingestions` with `wizard_session_id IS NULL` per AC-6.27) / `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` (recovery UPSERTs `pending_ingestions` with `wizard_session_id IS NULL` per AC-6.26) — these recovery paths were missing from the inline draft, reviewer-choices validation per §6.8.2, slug derivation per §6.9 with the on-unique-violation loop, Phase 2 INSERT of `shows` row, **`sync_audit` row write** with full attribution, DELETE of the `pending_syncs` row by `staged_id`, and auth side-effects per §6.8.2 (the first-seen branch has no MI-11/12/13/14 — only the universal "bump on add" floor applies). Same helper call shape live Apply uses; the only difference is the helper's first-seen branch INSERTs a fresh `shows` row + derives a slug instead of UPDATE-ing. The route is intentionally a thin shell so first-seen Apply cannot drift away from the canonical gates as Task 6.11 evolves.
  5. **First-seen branch in `applyStaged`**: when no existing `shows` row matches `drive_file_id`, the helper (a) derives the slug per §6.9 with the on-unique-violation loop (wraps `INSERT INTO shows (slug, ...) VALUES ($candidateSlug, ...)` in a `for (let attempt = 1; attempt <= MAX_SLUG_COLLISION_ATTEMPTS; attempt++)` where **`MAX_SLUG_COLLISION_ATTEMPTS = 100`** is the SINGLE canonical constant exported from `lib/parser/slug.ts` and referenced by every callsite — pseudocode at spec §6.9, the helper here, the deriveSlug `SLUG_COLLISION_EXHAUSTED` test at line 1327, the §12.4 catalog row at spec line 2320, and the catalog-completeness assertion in Task X.1 — all read this same constant, never a hardcoded literal; catches Postgres `23505` *unique_violation* on `shows.slug`, advances to next collision suffix `<base>-<attempt+1>` and retries; on `attempt > MAX_SLUG_COLLISION_ATTEMPTS` throws `SLUG_COLLISION_EXHAUSTED` per §12.4), (b) writes `sync_audit` with `applied_by = $admin.email`, `applied_at = now`, `mode = 'first_seen_apply'`, `source_scope = 'live'`, (c) DELETEs the `pending_syncs` row by `staged_id`, (d) returns `{ status: 'first_seen_applied', slug }`. The route returns 200 with `{ slug }`. The "existing-show guard" from the prior inline draft is now enforced by the helper's pre-existing logic: when `EXISTS(SELECT 1 FROM shows WHERE drive_file_id = $driveFileId)` AND `sourceScope: 'live'`, the helper returns 409 `STAGED_PARSE_SUPERSEDED` with `redirect_to: '/admin/show/<slug>?review=<stagedId>'`. **Observability**: the helper emits a `slug_collision_count` metric per Apply (the final loop iteration count, 1 on first-attempt success); a `sync_log` `SLUG_COLLISION_STORM` entry (admin-log-only) is written when any single Apply records `slug_collision_count > 50` (operational red flag — well below the exhaustion ceiling at 100, but indicative of a parser bug or attack scenario; payload `{ drive_file_id, base_slug, count }`).
  6. **Regression tests for the delegated gate coverage:** four canonical-gate scenarios. (a) **Stale `base_modified_time`**: synthesize a `pending_syncs` row, then `UPDATE pending_syncs SET base_modified_time = base_modified_time + interval '1 second' WHERE staged_id = $1` in a sibling tx. POST `/apply`. Assert: 409 `STAGED_PARSE_OUTDATED`; no `shows` row; no `sync_audit`. (b) **Drive 404 mid-Apply (`STAGED_PARSE_SOURCE_GONE`)**: mock `drive.files.get` to return 404. POST `/apply`. Assert: 409 `STAGED_PARSE_SOURCE_GONE`; helper UPSERTs `pending_ingestions` with `wizard_session_id IS NULL`; no `shows`; no `sync_audit`. (c) **Drive moved out of scope (`STAGED_PARSE_SOURCE_OUT_OF_SCOPE`)**: mock parents to NOT include `app_settings.watched_folder_id`. POST `/apply`. Assert: 409 `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`; same `pending_ingestions` UPSERT; no `shows`; no `sync_audit`. (d) **Success — sync_audit gate is the canary**: clean staged row, all gates pass. POST `/apply`. Assert: 200 `{ slug }`; new `shows` row with derived slug; `pending_syncs` GONE; **`sync_audit` row written** with `applied_by = $admin.email`, `applied_at` populated, `mode = 'first_seen_apply'`, `source_scope = 'live'`.
- [ ] **Step 4: Implement** `app/api/admin/show/staged/[stagedId]/discard/route.ts` as a POST handler. Accepts `{ kind: 'try_again_next_sync' | 'defer_until_modified' | 'permanent_ignore' }`. Same lock-first ordering as Apply. INSIDE the lock, DELETE the `pending_syncs` row by `staged_id` AND, for `defer_until_modified` and `permanent_ignore`, INSERT a `deferred_ingestions` row with `wizard_session_id = NULL` (live partition per §4.5), `drive_file_id`, `kind`, and `deferred_at_modified_time = pending_syncs.staged_modified_time` (NULL for `permanent_ignore`). For `try_again_next_sync` only the DELETE happens — the next cron pass will re-stage the candidate.
- [ ] **Step 5: Update PendingPanel link** (Task 10.6 amendment). The "Review and Apply" link in `components/admin/PendingPanel.tsx` already routes to `/admin/show/staged/[stagedId]?firstSeen=true`. Drop the `?firstSeen=true` query param — the route is now exclusively first-seen by design (the existing-show guard in step 3 above redirects re-stages elsewhere), so the query param is redundant. Update the Task 10.6 test bullet that asserts the link href to expect the bare `/admin/show/staged/<stagedId>` URL.
- [ ] **Step 6: Update §9.0.1 explainer renderer-coverage assertion** (Task 10.9 amendment). Add `/admin/show/staged/[stagedId]` to the "Per-show parse panel" surface inventory in Task 10.9 Step 3, since the same `<ErrorExplainer>` requirement applies to the first-seen review surface's reviewer-choice validation toasts and Apply/Discard action-failure toasts.
- [ ] **Step 7: Commit** `feat(admin): first-seen staged review surface`.

---

