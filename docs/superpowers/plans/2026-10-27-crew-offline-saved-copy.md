# Crew page offline, piece 1 (saved copy): implementation plan

**Spec (canonical):** `docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md`, Draft v7, with this branch's §4.6 completeness amendment. Piece 1 is §4 (all subsections, §4.11 included), the `CREW_OFFLINE_*` rows of §6, the piece-1 bullets of §7, §8 row B, §9 and §10.
**Spike record:** `docs/superpowers/specs/probes/2026-10-26-crew-offline-sw-spike.md`. Its probe scripts (probe.mjs and tlsproxy.mjs in the session scratchpad) are prior art for the e2e proxy in Task 24.
**Branch:** `feat/crew-offline-saved-copy`, worktree `../FX-worktrees/crew-offline-saved-copy`, cut from `origin/main` after the spec PR (row A of §8) merges.
**Implementer:** Opus / Claude Code for every task (AGENTS.md hard rule: the diff touches `app/` and `components/`).
**Suggested home once committed:** docs/superpowers/plans/crew/2026-10-27-crew-offline-saved-copy.md.

This plan does not redesign the spec. Where the spec leaves a choice to the builder (§10) the choice is recorded in §1 below with its reason. Where the live code and the spec disagree, the disagreement is in §0 and the plan takes the reading stated there until the owner answers.

---

## 0. Spec questions

Each question names the plan's provisional reading so implementation is not blocked. None changes the shape of the work; each changes one test row or one string.

**Q1. The Inter font: an HTML preload and a CSS declaration.** §4.6 "Completeness" requires every `/_next/static/**` and `/fonts/**` URL "referenced in the saved HTML" to be cached before a save commits. The HTML does reference the font, through the preload link the root layout renders (`components/FontPreload.tsx:27`, `app/layout.tsx:61`), so the HTML rule already covers it on every crew page. The font is also declared in CSS (`app/fonts.css:28`, imported by `app/layout.tsx:4` and compiled into a `/_next/static/**` CSS chunk), and a font declared there without a preload would be missed, leaving an offline copy in the system font on a phone whose HTTP cache was evicted. **Resolved (decision below):** completeness also follows `url(...)` references to `/fonts/**` inside the saved HTML's CSS files, one level deep, and spec §4.6 is amended on this branch to say so. Task 7 adds the pure function, Task 10 drives it through the worker, and Task 25 case 1 checks the font in the worker's cache in a browser.

**Decision (orchestrator, 2026-10-27): yes.** Completeness also follows `url(...)` references to `/fonts/**` inside the `/_next/static/**` CSS files the saved HTML references, one level deep. Task 7 adds the pure function and Task 10 the case; this branch amends the spec's §4.6 completeness sentence to match. Q2 to Q4: the plan readings stand.

**Q2. A 5xx HTML page with no marker.** §4.4's paragraph after the step-3 table opens "A response that is not HTML:" and then says "any other response with status 500 or above and no marker (a platform error before the app ran) serves `S(U)` in `server-error` mode". A platform error page is usually HTML. **Plan reading:** any complete response with status 500 or above and no marker is handled as server-error, whatever its content type; only status below 500 without a marker is "treated as purge". Task 5 pins both rows.

**Q3. Copy when the saved time is unknown, for `ended` and `sheet-gone-saved`.** §4.7.2's guard row gives two examples ("Showing your saved copy." / "This is the last version we have.") and says "Copy drops the time and age". It does not give the `ended` string. **Plan reading:** drop only the time clause and keep everything else: `ended` body becomes "You're seeing the last version." and `sheet-gone-saved` body becomes "This is the last version we have. Check with Doug before relying on it." The `saved-fresh`/`saved-old` unknown-time case renders the old-copy tone and clock icon with body "Showing your saved copy." after the lead. Task 4 pins all three.

**Q4. DESIGN.md §1.2 has no matching row for any of the four bar pairs.** §4.7.2 "Accessibility" says text contrast uses "`DESIGN.md` §1.2 pairs (text on `info-bg`, `stale-tint`, `warning-bg`)". Measured against the live tokens in `app/globals.css` at plan time: §1.2 (`DESIGN.md:150`) has no row for text on `--color-info-bg`, none for text on `--color-stale-tint`, and none for `--color-warning-text` on `--color-warning-bg`, whose only figures are in the token table at `DESIGN.md:38` ("Light 9.5:1, dark 9.2:1", computed 8.8 and 9.6); and the `updated` state's pair, `--color-status-positive-text` on surface, sits in a combined "on bg/surface" row at `DESIGN.md:169` (6.4 / 12.3) that matches bg but not surface (computed 6.7 / 11.5). **Plan reading:** Task 20 adds or corrects every one of those rows with computed values and pins them with a test that recomputes the ratios. That is a `DESIGN.md` edit, so it is inside the invariant-8 UI gate scope at closeout.

---

## 1. Readings the plan relies on (builder latitude and live-code facts)

1. **Viewer HMAC secret (§10).** The viewer-key helper (lib/offline/viewerKey.ts) derives its key from the existing `PICKER_COOKIE_SIGNING_KEY` (`lib/env/pickerCookieSigningKey.ts:5`) with a fixed label: `subkey = HMAC-SHA256(pickerKey, "fxav-saved-copy-viewer-v1")`, then `viewer = base64url(HMAC-SHA256(subkey, showId + ":" + crewMemberId))`. Reason: that key is already required by every path that can resolve a crew identity, it rotates rarely, and a new environment variable would need plumbing through Vercel, `.env.local`, every e2e workflow env and preflight for no gain. The label separates the two uses. The function returns `null` when the key is unavailable, and a marker that would carry a null viewer is written as `purge` (fail closed).
2. **The picker epoch for `data-epoch`.** The `resolved` access result carries no epoch today (`lib/auth/picker/resolveShowPageAccess.ts:17`). Task 14 adds `pickerEpoch` to it, read from the show row `resolveShowPageAccess` already loads (its select at `lib/auth/picker/resolveShowPageAccess.ts:158` gains `picker_epoch`). That value is the resolved selection's epoch: `resolvePickerSelection` returns `resolved` only when the entry's `e` equals the row's epoch on its own later read (`lib/auth/picker/resolvePickerSelection.ts:110`), the entry was minted before this request at an epoch no higher than the first read, and the epoch never decreases, so the first read, the second read and the entry agree. `ResolvePickerSelectionResult` is unchanged, so none of its consumers or mocks change. The epoch reaches the slot as a new optional `CrewShell` prop, `savedCopyEpoch`, which `page.tsx` passes on the crew arm (Task 18). It does not ride on the crew `Viewer`: that union's exact shape is pinned by `tests/data/getShowForViewer.test.ts:240`, and the viewer the page builds is pinned by `tests/show/resolvedArmCrewMembersGuard.test.tsx:116`.
3. **Where the identity extraction lives.** In a new module, lib/auth/picker/resolveCrewIdentity.ts. Three constraints decide it: `tests/cross-cutting/picker-resolver-callsite-contract.test.ts:37` forbids any `app/api` file from containing the string `resolveShowPageAccess`; `tests/cross-cutting/picker-resolver-callsite-contract.test.ts:45` pins the `auth_email_canonical` RPC to `lib/auth/picker/resolvePickerSelection.ts`; and seven suites mock that module (the exhaustiveness suite plus the six listed in Task 14), the exhaustiveness suite with a factory that exposes only `resolvePickerSelection` (`tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:13`), so a function placed inside that module would be undefined under such a mock. A separate module calls `resolvePickerSelection` through its import, which those mocks still intercept. `resolvePickerSelection` itself gains only an optional `epochCheck` input.
4. **`needs_picker_bootstrap` in the status route** is a deny (`gone`): the page would redirect rather than render the saved viewer, so the identity verdict is not "the crew member whose viewer key is `viewer`" (§4.5).
5. **The `save` disposition's client action is the registrar's `ensure-saved`.** §4.3 says `save` "is the live-page `ensure-saved` (§4.7.3)" and §4.7.7 says the registrar "runs the `ensure-saved` messages". Both are rendered by the slot for crew viewers, so the action is implemented once, in `<SavedCopyRegistrar>`; `<SavedCopyMarker disposition="save">` posts nothing. A unit test pins exactly one `ensure-saved` per `renderedAt` change.
6. **`purged(showId)` is handled by the marker, not the bar.** §4.4 step 5 says "any page whose marker names that show reloads". Every page has a marker but only crew pages have a bar, so the listener lives in `<SavedCopyMarker>`.
7. **Storage layout (§4.6, builder detail).** One IndexedDB database holds a `meta` record (`generation`, `nextOrdinal`, `schemaVersion`) and a `copies` store keyed by show id with a unique index on `url`. The HTML is stored in the copy record, so a commit is one IDB read-write transaction across `meta` and `copies`. Assets and static files live in Cache Storage (`fxav-assets-v<schema>`, `fxav-static-v<schema>`), with a `statics` IDB store recording each static entry's stored-at time for the 14-day rule. All decisions are pure functions over plain records (`planBeginSave`, `planCommit`, `planPurge`), shared by the in-memory store the unit tests use and the IDB adapter the worker uses.
8. **Step 1 server-error (spec v7 §4.4).** A 500 from the status route means the app answered without a verdict. The worker fetches the page under the step 2 budget (8 seconds for headers and body) and keeps `S(U)`: a complete response is served as is, without the step 3 table; a network error or a timeout serves `S(U)` in `ended` mode, because the app then gave no answer at all.
9. **Agenda bytes in e2e.** The agenda proxy route reads Google Drive (`app/api/asset/agenda/[show]/[id]/route.ts:297`), which the e2e harness cannot reach. The e2e proxy answers `GET /api/asset/agenda/**` itself with a small fixture PDF. The worker still sees an ordinary network response, so the save path under test is unchanged.
10. **Realtime under the HTTPS proxy.** The crew page opens Supabase realtime at `ws://127.0.0.1:54321`, which WebKit blocks as mixed content under the HTTPS proxy (spike observation 6). The §7 "Client-side renders" bullet therefore runs in Chromium only, in its own spec file matched only by the Chromium project. §7 lists that bullet separately from the both-engines case list.
11. **Production server for e2e.** The baseline webServer runs `pnpm build && pnpm start` when `CI` is set (`playwright.config.ts:264`) and `pnpm dev` otherwise. The crew offline e2e therefore always runs with `CI=1` (locally too, with `E2E_PORT` to avoid a sibling's port 3000 and `CREW_E2E_ONLY=1` so only that server boots, `playwright.config.ts:476`), and its `beforeAll` refuses to run without `CI`.
12. **dev.* shadow schema.** The new column is added to `public.shows` only, following `supabase/migrations/20260810150000_source_anchors_modified_time.sql:9`, which added a `public.shows` column with no `dev.shows` mirror. The status route reads `public` only.
13. **Client telemetry source.** The registrar logs with source `client.crew`, the source crew-page components already use (`components/crew/RightNowHero.tsx:425`) and one of the five the client-error route accepts (`app/api/observe/client-error/route.ts:4`). Any other source is refused with 400, so the telemetry test posts through the real route handler (Task 22).
14. **Server-side marker construction.** Every server-rendered marker that carries a viewer key is built by one helper module, lib/offline/serverMarkers.ts (Task 17), which falls back to `purge` when the key or the epoch is missing. `page.tsx`, `_CrewShell.tsx` and the slot never import the viewer-key function themselves, which also keeps `_CrewShell.tsx` clear of a name clash: `CrewShell` declares `const viewerKey` at `app/show/[slug]/[shareToken]/_CrewShell.tsx:362`.
15. **IndexedDB adapter tests.** The adapter is tested against fake-indexeddb, added as an exact-pinned devDependency (Task 6). R12 rules out a new runtime dependency only.

---

## 2. Meta-test inventory (declared before the tasks)

| Meta-test | Action | Task |
|---|---|---|
| `tests/auth/_metaInfraContract.test.ts` | EXTEND: add the status route to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`tests/auth/_metaInfraContract.test.ts:220`), add `app/api/saved-copy` to `AUTH_DOMAIN_ROOTS` (`tests/auth/_metaInfraContract.test.ts:353`), add a destructure pin for the status route's show-row read. The new identity module receives its client from the caller and constructs none, so it needs no row | 15 |
| `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` | EXTEND: a positive case asserting the status route imports `resolveCrewIdentity` from its own module, lib/auth/picker/resolveCrewIdentity.ts, and contains no `.rpc(` of its own, so a later restatement of identity logic in the route fails | 15 |
| `tests/cross-cutting/no-jwt-surface.test.ts` | EXTEND: add `app/api/saved-copy` to `DATA_API_ROOTS` (`tests/cross-cutting/no-jwt-surface.test.ts:6`) | 15 |
| `lib/audit/trustDomains.ts` (read by `tests/cross-cutting/auth-chain-audit.test.ts`) | EXTEND: one `PROTECTED_ROUTES` row for the status route, `chain: "auth-library-exception"`, beside the version route at `lib/audit/trustDomains.ts:76`; `lib/audit/protectedRoutes.ts:47` fails the walk otherwise | 15 |
| `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts` | EXTEND: the local `ShowRow` type and its three fixture rows gain `picker_epoch`, the `unpublished` expectation gains `showId`, the `resolved` expectation gains `pickerEpoch` (every line is listed in Task 14) | 14 |
| `lib/audit/authPrimitives.ts` (`AUTH_LIB_ALLOWLIST`, read by `tests/cross-cutting/auth-chain-audit.test.ts`) | EXTEND: the new identity module beside its siblings at `lib/audit/authPrimitives.ts:77` | 14 |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | NONE: both new routes export only `GET`, and the walker counts only `POST`/`PUT`/`PATCH`/`DELETE` (`tests/log/mutationSurface/enumerate.ts:176`). No server action is added. Run at closeout to confirm | closeout |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | NONE: the trigger takes no lock and calls no lock function; it runs inside whatever transaction already holds the per-show lock (§4.11 write-path row) | n/a |
| `tests/admin/no-inline-email-normalization.test.ts` | NONE: no email handling | n/a |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | NONE: no `admin_alerts` write | n/a |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | NONE: no tile rendering change | n/a |
| `tests/db/validation-schema-parity.test.ts` + `supabase/__generated__/schema-manifest.json` | EXTEND by regeneration (`pnpm gen:schema-manifest`) and the surgical validation apply | 13 |
| `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` | EXTEND: `ENROLLED` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:283`) gains three specs, `EXPECTED_SKIPS` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:161`) gains three empty rows. Enrolment also runs `expectNoUndeclaredProjectGate` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:563`) on each spec: no `.fail(`, and, with no PROJECT_GATED row, none of `project`, `testInfo`, `test.info(` or `browserName` in the spec's source (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:596`); Task 25 keeps the engine choice in a helper fixture and writes no early return and no all-conditional case | 28 |
| `scripts/check-crew-e2e-executed.mjs` | EXTEND: `REQUIRED` (`scripts/check-crew-e2e-executed.mjs:31`) gains three rows with the full executable count | 28 |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | NONE expected: the specs run from `crew-e2e.yml`, which the scanner already reads, and no new env key is introduced (`CREW_E2E_ONLY` is already allowlisted). Run after Task 28 | 28 |
| `tests/e2e/_metaLiveEntryToolchain.test.ts` | CONSTRAINT: no file under `tests/e2e/` may import or spawn `esbuild` (`tests/e2e/_metaLiveEntryToolchain.test.ts:75`); the e2e reads the committed worker string and never runs `pnpm gen:sw` | 24, 25 |
| `tests/components/auth/avatarMenuTransitionAudit.test.ts` | EXTEND: one `DECLARED` row (`tests/components/auth/avatarMenuTransitionAudit.test.ts:130`) per conditional Task 23 adds to `AvatarMenu.tsx` | 23 |
| `tests/docs/_metaInvariant8Closeout.test.ts` | CONSTRAINT: this plan names neither gate half and carries no closeout marker line; the closeout commit adds both | closeout |
| NEW tests/lib/offline/crewUrl.test.ts | CREATE: the crew-URL exclusion is derived from the route tree on disk | 1 |
| NEW tests/lib/offline/swSourceFreshness.test.ts | CREATE: committed worker bundle equals a fresh build, and the bundle's inputs stay inside an allowlist (no server-only module, no `node:` import, no `process.env`) | 11 |
| NEW tests/auth/picker/savedCopyIdentityParity.test.ts | CREATE: §4.5 parity table, with outcome-kind coverage derived from `CREW_IDENTITY_OUTCOMES` | 15 |
| NEW tests/show/savedCopyMarkerCoverage.test.ts | CREATE: AST walk over `app/show/[slug]/[shareToken]/**`; every `<TerminalFailure>` JSX element carries a `savedCopy` attribute and every sibling surface renders `<SavedCopyMarker>` | 19 |
| NEW tests/components/offline/savedCopyBarTransitionAudit.test.ts | CREATE: AST bijection over the bar's conditionals, modelled on `tests/components/auth/avatarMenuTransitionAudit.test.ts:130` | 27 |

### 2.1 Registry count reconciliation (run at plan time)

Run from the repo root at plan time (the same block is re-run at closeout, so the counts are re-derived, never retyped):

```bash
echo "SUPABASE_CONSTRUCTOR_CONTRACT_FILES: $(sed -n '/^const SUPABASE_CONSTRUCTOR_CONTRACT_FILES = \[/,/^\] as const;/p' tests/auth/_metaInfraContract.test.ts | grep -c '^  "')"
echo "AUTH_LIB_ALLOWLIST: $(sed -n '/^const AUTH_LIB_ALLOWLIST = \[/,/^\];/p' lib/audit/authPrimitives.ts | grep -c '^  "')"
echo "PROTECTED_ROUTES path rows: $(grep -c '{ path: "' lib/audit/trustDomains.ts)"
echo "DATA_API_ROOTS: $(sed -n '/^const DATA_API_ROOTS = \[/,/^\]/p' tests/cross-cutting/no-jwt-surface.test.ts | grep -c '^  "')"
echo "ENROLLED: $(sed -n '/^const ENROLLED = \[/,/^\] as const;/p' tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts | grep -c '^  "')"
echo "REQUIRED: $(sed -n '/^export const REQUIRED = {/,/^};/p' scripts/check-crew-e2e-executed.mjs | grep -cE '^  "[^"]+\.spec\.ts":')"
echo "EXPECTED_SKIPS: $(sed -n '/^const EXPECTED_SKIPS/,/^};/p' tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts | grep -cE '^  "tests/e2e/')"
echo "DATA_API_CONSUMERS: $(sed -n '/^const DATA_API_CONSUMERS = \[/,/^\] as const;/p' tests/cross-cutting/picker-resolver-callsite-contract.test.ts | grep -c '^  "')"
```

Output:

```text
SUPABASE_CONSTRUCTOR_CONTRACT_FILES: 13
AUTH_LIB_ALLOWLIST: 13
PROTECTED_ROUTES path rows: 66
DATA_API_ROOTS: 4
ENROLLED: 6
REQUIRED: 10
EXPECTED_SKIPS: 6
DATA_API_CONSUMERS: 6
```

Every count is non-zero, so no pipeline is matching nothing. After this plan, in the same order: 14, 14, 67, 5, 9, 13, 9, 6 (`DATA_API_CONSUMERS` is deliberately unchanged: the status route is not a cookie-only data API and must run the Google session check). The closeout re-runs the block and compares.

---

## 3. Sweeps authored and run at plan time

**S1. Every `<TerminalFailure>` the crew route renders** (`grep -n "<TerminalFailure" "app/show/[slug]/[shareToken]/page.tsx" "app/show/[slug]/[shareToken]/_CrewShell.tsx" | grep -v ":\s*\*"`):

```text
app/show/[slug]/[shareToken]/page.tsx:111   renderPickerRepick roster failure        -> purge, showId
app/show/[slug]/[shareToken]/page.tsx:150   renderRacedCrewMiss roster failure       -> purge, showId
app/show/[slug]/[shareToken]/page.tsx:161   renderRacedCrewMiss availability failure -> purge, showId
app/show/[slug]/[shareToken]/page.tsx:222   infra_error arm                          -> hold, no showId
app/show/[slug]/[shareToken]/page.tsx:244   admin data failure                       -> purge, showId
app/show/[slug]/[shareToken]/page.tsx:282   resolved arm getShowForViewer failure    -> keep, showId + viewer
app/show/[slug]/[shareToken]/page.tsx:341   no_auth roster failure                   -> purge, showId
app/show/[slug]/[shareToken]/_CrewShell.tsx:236   Malformed (crew viewer)          -> keep, showId + viewer
                                                  Malformed (any other viewer)     -> purge, showId
                                                  UnmatchedViewerError             -> purge, showId
```

Eight JSX sites today; `_CrewShell.tsx:236` splits into three branches (§4.3), so ten `<TerminalFailure>` elements after Task 18. The structural test in Task 19 re-derives this set from the AST so a later site cannot be added without a marker.

**S2. Every write that can set `published = false`** (`grep -rnE "set\s+published\s*=\s*false|published\s*=\s*false\s*," supabase/migrations lib app | grep -v "^[^:]*:[0-9]*:\s*--"`), with the trigger's verdict for each:

```text
20260601000000_b2_show_lifecycle.sql:43          archive: new.archived true          -> not stamped (correct, R3)
20260602000000_b2_r4_unarchive_held...sql:51     unarchive: old.published false      -> not stamped
20260701000000_published_toggle_unpublish...:12  _unpublish_show_core                -> stamped (R15)
20260602000001_b2_r5_archived_crew_read...:26    one-time repair of archived rows    -> not stamped (new.archived true)
20260602000002_b2_r8_unarchive_returns...:37     unarchive: old.published false      -> not stamped
20260718000001_unarchive_show_apply_gate_free:19 unarchive: old.published false      -> not stamped
lib/admin/step3DisplayState.ts:19                comment, not a write                -> n/a
lib/sync/unpublishShow.ts:158                    token unpublish                     -> stamped (R15)
```

The two "stamped" rows are exactly the two paths §4.11 names; Task 13's DB test drives both and the archive row.

**S3. Ledger entries this branch would close** (`grep -n -i "offline\|service worker" BACKLOG.md DEFERRED.md`): no output, exit 1. Invariant 12 has nothing to mark; Stage 0 records the empty result.

**S4. Static siblings of `[shareToken]`** (`ls -d "app/show/[slug]"/*/`): `[shareToken]/` and `unpublish/`. Task 1's test derives this list from disk rather than copying it.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**S5. New Playwright spec names against every existing `testMatch`** (a node one-liner evaluating each `testMatch:` regex in `playwright.config.ts` against `tests/e2e/crew-offline.spec.ts` and `tests/e2e/crew-offline-layout.spec.ts`): `regexes: 10`, zero matches. `tests/e2e/crew-offline-realtime.spec.ts` is checked the same way in Task 25 before the projects are added.

---

## 4. Acceptance criteria

Each criterion paraphrases the spec section it cites; the spec text wins on any difference.

- AC-1 Worker scope: crew-URL navigations, the `/auth/sign-out` and `/auth/callback` brackets, static and asset handling, and nothing else, with the crew-URL exclusion derived from the route tree (§4.2).
- AC-2 Marker contract: one `#fxav-saved-copy` template per page, `data-v="3"`, the five dispositions and their attributes, `data-show-id` whenever the server knows the show, fail-closed parsing (§4.3).
- AC-3 Navigation steps 1 to 5 and the first-visit `ensure-saved`, including the 8-second buffer, the 60-second continuation, and the status-route outcomes (§4.4).
- AC-4 Ordering and storage: one copy per show, `S(U)` for serving and `C(X)` for purging, one persisted generation counter, a monotonic request ordinal, and the identity-transition brackets (§4.6).
- AC-5 Completeness, asset list from server data, agenda viewer prefetch, static retention, caps and eviction (§4.6, §4.8).
- AC-6 A served copy carries the injected meta and the CSS notice, and hydrates without warnings (§4.7.1).
- AC-7 The bar: inputs, eight states, exact copy, precedence, guard rows, accessibility, contrast pairs (§4.7.2).
- AC-8 Coming back online: probes, `updating`/`updated`, purge reloads, the `s` parameter rewrite (§4.7.3, §4.7.4).
- AC-9 The "not saved yet" page and its reload on `online` (§4.7.5).
- AC-10 Registration, worker updates and schema-versioned caches, and the kill switch read at request time (§4.7.7, §4.9, §4.10).
- AC-11 `shows.unpublished_at`, its trigger, the snapshot field, the manifest and the validation project (§4.11).
- AC-12 The status route: lifecycle conditions, the shared identity resolution, no-store, 500 on infra faults, and the parity test (§4.5).
- AC-13 Every render arm of the crew route carries the marker the §4.3 table assigns it.
- AC-14 Offline actions: "Not you? Switch person" disabled with "Needs signal" while offline, and the AvatarMenu purge bracket (§4.6, §4.7.6).
- AC-15 Telemetry codes `CREW_OFFLINE_SW_REGISTER_FAILED` and `CREW_OFFLINE_SAVE_FAILED` through `clientLog`, never in UI (§6).
- AC-16 The real-browser e2e cases of §7 in Chromium and WebKit against a production build, wired into CI.
- AC-17 The bar's Dimensional Invariants hold in a real browser (§4.7.2).
- AC-18 The bar's Transition Inventory holds, compound transitions included (§4.7.2).

---

## 5. Conventions for every task

- **Worktree.** All commands run in `/Users/ericweiss/FX-worktrees/crew-offline-saved-copy` (invariant 11). The main checkout is read-only.
- **TDD shape (invariant 1).** RED: write the test, run the task's `red=` command, observe the stated failure. GREEN: minimal implementation, same command passes. Then the task's extra checks, then one commit (invariant 6).
- **New modules and RED validity.** When a task creates a module, the RED step also creates a typed stub of it whose exported functions `throw new Error("unimplemented")` (the stubs shown in this plan typecheck under the repo's strict config). The observed RED is then assertion or throw failures in the new cases, never "Cannot find module". The marker's `red-target` names the module the task creates.
- **Scoped vs heavy.** Scoped `pnpm exec vitest run <files>` runs unwrapped. Full-suite vitest, every Playwright run, and every build go through `pnpm heavy` (AGENTS.md heavy-phase rule). `pnpm typecheck` runs unwrapped as `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck` (the default heap dies on this tree).
- **Test placement.** `tests/lib/**`, `tests/components/**` and `tests/styles/**` are in the parallel, DB-free project (`vitest.projects.ts:104`). `tests/api/**`, `tests/auth/**`, `tests/db/**`, `tests/show/**`, `tests/sync/**` and `tests/e2e/**/*.test.ts` default to the serial project. No new directory needs a partition edit.
- **Component tests** use `// @vitest-environment jsdom` on line 1 and `@testing-library/react`, as `tests/components/scheduleAgendaPlacement.test.tsx:1` does.
- **Strings under test.** Every test that asserts a string appears in output (bar copy, CSS notice, not-saved page, marker attributes) runs the four pre-dispatch mutants from `docs/agents/writing-plans.md` (value emptied; expected content plus a suffix; content present but not live, for example in an attribute or behind a false branch; each discriminating parameter varied) and records the four results in the commit body.
- **Premises.** Any assertion whose power depends on a fixture or environment states that condition with `premise`/`premiseHolds` from `tests/_shared/premise.ts:26`, unconditionally, above the assertion.
- **Wire contracts are tested through the real receiver.** A test of a log, request or message that crosses a boundary drives the real handler on the other side (Task 22's telemetry through the client-error route; Task 10's message cases through the worker's handlers), never only a spy on the sender.
- **Copy.** Exact strings come from spec §4.7.2 and §4.7.5. No em dash in any user-visible string or in any code block of this plan. Straight apostrophes in TypeScript string literals, as `components/crew/RightNowHero.tsx:305` does.
- **Pre-code mechanical UI checklist** (AGENTS.md cross-cutting) before each UI task: no em dash in copy, 44px targets where interactive (the bar has none; the AvatarMenu row keeps `min-h-tap-min`), canonical token classes only, contrast rows for every text/background pair the task introduces.
- **Commits.** Conventional commits with scope: `feat(offline)`, `feat(crew-page)`, `feat(auth)`, `feat(db)`, `test(e2e)`, `infra(ci)`-style is `infra:` per AGENTS.md invariant 6.

---

## 6. Stage 0 (before any edit)

1. Confirm the spec merged: `git -C /Users/ericweiss/FX-Webpage-Template fetch origin && git -C /Users/ericweiss/FX-Webpage-Template cat-file -e origin/main:docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md`. A non-zero exit means §8 row A has not merged: stop.
2. Worktree: `git -C /Users/ericweiss/FX-Webpage-Template worktree add -b feat/crew-offline-saved-copy ../FX-worktrees/crew-offline-saved-copy origin/main`.
3. Pane and agent labels: `[ -n "$HERDR_PANE_ID" ] && herdr pane rename "$HERDR_PANE_ID" "feat/crew-offline-saved-copy" && herdr agent rename "$HERDR_PANE_ID" "feat/crew-offline-saved-copy"`.
4. `pnpm install`, `pnpm worktree:link-env`, `pnpm preflight` (prints live ledger claims).
5. Ledger: sweep S3 found no entry, so there is nothing to `pnpm ledger:claims --check` or mark. Record that in the first commit body.
6. Autonomous-run plumbing per the AGENTS.md autonomous-ship gate: ship-state marker with this session's id, the 10-minute nudge, push the branch.
7. Local Supabase must be up with the seed applied (`pnpm db:seed` touches only `seed-fixture:` rows; the Waldorf show `seed-fixture:2026-04-asset-mgmt-cfo-coo-waldorf` with two diagrams is used read-only by Task 25).

---

## 7. Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1: Crew-URL classification derived from the route tree

<!-- task: red=`pnpm exec vitest run tests/lib/offline/crewUrl.test.ts` red-state=authored red-target=`lib/offline/crewUrl.ts:31` why=`crewPath and classifyRequest are stubs that throw and NON_CREW_SEGMENTS is empty, so the derivation case fails comparing an empty list to the on-disk siblings and every classification case throws` ac=AC-1 -->

**What is red and why:** the derivation case compares `NON_CREW_SEGMENTS` (empty in the stub) to the static siblings read from disk (`["unpublish"]` today), and every classification case calls a stub that throws.

**Files**

```text
create  lib/offline/crewUrl.ts
create  tests/lib/offline/crewUrl.test.ts
```

**Stub (RED step):**

```ts
/** Static siblings of [shareToken] under app/show/[slug]/ that are NOT crew URLs. */
export const NON_CREW_SEGMENTS: readonly string[] = [];

export type FetchKind = "crew-nav" | "bracket-nav" | "static" | "asset" | "ignore";

export type RequestFacts = {
  method: string;
  mode: string;
  url: string;
  rscHeader: string | null;
};

export function crewPath(pathname: string): string | null {
  void pathname;
  throw new Error("unimplemented");
}

export function classifyRequest(facts: RequestFacts, origin: string): FetchKind {
  void facts;
  void origin;
  throw new Error("unimplemented");
}
```

**Test (derivation half shown; the classification cases are a table in the same file):**

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { premise } from "@/tests/_shared/premise";
import { NON_CREW_SEGMENTS, crewPath } from "@/lib/offline/crewUrl";

const SHOW_DIR = join(process.cwd(), "app", "show", "[slug]");

/** Every static (non-bracketed) directory beside [shareToken], read from disk. */
function staticSiblings(): string[] {
  return readdirSync(SHOW_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("["))
    .map((e) => e.name)
    .sort();
}

describe("crew URL exclusion is derived from the route tree", () => {
  test("every static sibling of [shareToken] is excluded, and nothing else is", () => {
    const siblings = staticSiblings();
    premise("static siblings under app/show/[slug]/", siblings.length, 0);
    expect([...NON_CREW_SEGMENTS].sort()).toEqual(siblings);
    for (const name of siblings) {
      expect(crewPath(`/show/some-slug/${name}`), name).toBeNull();
    }
  });

  test("a token-shaped second segment is a crew URL", () => {
    expect(crewPath("/show/some-slug/0a1b2c")).toBe("/show/some-slug/0a1b2c");
  });
});
```

**Classification table cases (each a row):** `GET` + `mode: "navigate"` + `/show/s/t` is `crew-nav`; the same with a trailing slash is `ignore` (Next's 308 handles it); `/show/s/unpublish` is `ignore`; `/show/s` and `/show/s/t/x` are `ignore`; a query string does not change the class and `crewPath` drops it; `_rsc` in the query or `rscHeader === "1"` is `ignore` even with `mode: "navigate"`; `GET` or `POST` navigations to `/auth/sign-out` and `/auth/callback` are `bracket-nav`; **`/api/auth/picker-bootstrap` is `ignore` (§4.6 says the bootstrap is not bracketed; a negative row pins it)**; `GET /_next/static/**` and `GET /fonts/**` are `static`; `GET /api/asset/diagram/**` and `GET /api/asset/agenda/**` are `asset` (the "listed by a saved copy" filter is applied later, in Task 10); a cross-origin URL is `ignore`; any non-navigation `POST` (Server Actions) is `ignore`; `/admin`, `/api/report`, `/auth/sign-in` are `ignore`.

**Failure mode caught:** a future sibling route under `app/show/[slug]/` being swallowed by the worker as a crew URL; the picker bootstrap regaining a bracket the spec removed; an RSC request being answered with a document.

**Commit:** `feat(offline): crew-URL and request classification derived from the route tree`

### Task 2: Marker contract and fail-closed reader

<!-- task: red=`pnpm exec vitest run tests/lib/offline/marker.test.ts` red-state=authored red-target=`lib/offline/marker.ts:39` why=`markerAttributes and readMarker are stubs that throw, so the round-trip, fail-closed and decoy cases all fail on the throw rather than on a missing module` ac=AC-2 -->

**What is red and why:** both exported functions throw; every case calls one of them.

**Files**

```text
create  lib/offline/marker.ts
create  tests/lib/offline/marker.test.ts
```

**Stub and types (RED step):**

```ts
export const MARKER_ID = "fxav-saved-copy";
export const MARKER_VERSION = "3";

export type SaveMarker = {
  disposition: "save";
  showId: string;
  renderedAt: string;
  epoch: number;
  viewer: string;
  assets: readonly string[];
};
export type KeepMarker = { disposition: "keep"; showId: string; viewer: string };
export type BareMarker = { disposition: "hold" | "check" | "purge"; showId: string | null };
export type Marker = SaveMarker | KeepMarker | BareMarker;

/** What the worker read from a complete body. "absent" and "invalid" both act as purge. */
export type MarkerRead =
  | { kind: "valid"; marker: Marker }
  | { kind: "invalid"; showId: string | null }
  | { kind: "absent" };

export function markerAttributes(marker: Marker): Record<string, string> {
  void marker;
  throw new Error("unimplemented");
}

export function readMarker(html: string): MarkerRead {
  void html;
  throw new Error("unimplemented");
}
```

**GREEN:** `markerAttributes` returns `id`, `data-v`, `data-disposition`, and per disposition `data-show-id` (omitted when null), `data-rendered-at`, `data-epoch`, `data-viewer`, `data-assets` (JSON). `readMarker` finds the first `<template` start tag whose attributes include `id="fxav-saved-copy"` as an HTML attribute (not a JSON property), decodes HTML entities in attribute values (`&quot;`, `&amp;`, `&#x27;`, `&#39;`, `&lt;`, `&gt;`), and validates: unknown `data-v` or disposition is `invalid`; `save` missing any of its five attributes, a non-ISO `data-rendered-at`, a non-integer `data-epoch`, or a `data-assets` that is not a JSON array of same-origin paths under `/api/asset/` is `invalid`; `keep` without `data-show-id` and `data-viewer` is `invalid`. `invalid` keeps a syntactically valid show id (UUID shape) so the purge can name the show (§4.4 v6 purge row); otherwise `null`.

**Cases:** a round trip for each of the five dispositions, rendering `<template {...markerAttributes(m)} />` with `react-dom/server`'s `renderToStaticMarkup` and reading it back (this is the same React serialization the page uses, so entity escaping of `data-assets` is exercised for real); two markers in one body, first wins; an RSC flight decoy `self.__next_f.push([1,"...\"id\":\"fxav-saved-copy\"..."])` placed before the real marker is ignored; the marker inside a streamed hidden segment (`<div hidden id="S:0">`) after the skeleton is found; each invalid shape above; no marker is `absent`.

**Failure mode caught:** a page whose marker React escaped differently being read as `invalid` and wiping a good copy; a decoy in the flight payload being read as the marker.

**Commit:** `feat(offline): saved-copy marker contract and fail-closed reader`

### Task 3: Saved time and age formatting

<!-- task: red=`pnpm exec vitest run tests/lib/offline/format.test.ts` red-state=authored red-target=`lib/offline/format.ts:43` why=`formatSavedTime and formatAgo are stubs that throw, so every exact-string case fails before comparing` ac=AC-7 -->

**What is red and why:** both functions are throwing stubs.

**Files**

```text
create  lib/offline/format.ts
create  tests/lib/offline/format.test.ts
```

**Contract:** `formatSavedTime(iso: string, nowMs: number, timeZone?: string): string | null` and `formatAgo(iso: string, nowMs: number): string | null`, both `null` for a missing, empty or unparseable value. Locale is fixed to `en-US` (the copy is English). `{time}` is `h:mm AM` style (`2:14 PM`) when the saved instant falls on the same calendar day as `nowMs` in `timeZone`, otherwise `Fri Oct 24, 6:02 PM`, built from `formatToParts` as `weekday month day, time` because `en-US` would otherwise insert a comma after the weekday. `{ago}`: `just now` under 1 minute and for any future instant; `N min ago` under 60 minutes (floor); `N hr ago` under 48 hours (floor); `N days ago` after that (floor).

**Cases:** every boundary (59 s, 60 s, 59 min, 60 min, 47 h 59 min, 48 h), a future instant, midnight crossings in two time zones (`America/New_York`, `America/Los_Angeles`) where "today" differs, invalid input. Expected strings are written out literally from the spec examples; the fixture instants are chosen so each boundary is reached (premise: each pair straddles its boundary by computing both sides from the same base).

**Failure mode caught:** "Fri, Oct 24" drift from the locale default; an off-by-one at the 6-hour or 48-hour line.

**Commit:** `feat(offline): saved time and age formatting`

### Task 4: Bar state derivation with exact copy

<!-- task: red=`pnpm exec vitest run tests/lib/offline/barState.test.ts` red-state=authored red-target=`lib/offline/barState.ts:124` why=`deriveBarView is a stub that throws, so every state, precedence and guard case fails on the throw` ac=AC-7 -->

**What is red and why:** `deriveBarView` is a throwing stub.

**Files**

```text
create  lib/offline/barState.ts
create  tests/lib/offline/barState.test.ts
```

**Stub and types (RED step):**

```ts
export type BarMode = "live" | "offline" | "slow" | "server-error" | "ended";

export type BarInputs = {
  mode: BarMode;
  online: boolean;
  /** renderedAt on a live page, the meta's data-saved-at on a saved copy. */
  savedAt: string | null;
  nowMs: number;
  sheetUnavailable: boolean;
  updating: boolean;
  justUpdated: boolean;
};

export type BarState =
  | "hidden"
  | "saved-fresh"
  | "saved-old"
  | "ended"
  | "sheet-gone"
  | "sheet-gone-saved"
  | "updating"
  | "updated";

export type BarView = {
  state: BarState;
  tone: string | null;
  icon: "signal-off" | "clock" | "alert" | "sync" | "check" | null;
  lead: string | null;
  body: string;
};

export const OLD_COPY_MS = 6 * 60 * 60 * 1000;

export function deriveBarView(inputs: BarInputs, timeZone?: string): BarView {
  void inputs;
  void timeZone;
  throw new Error("unimplemented");
}
```

**GREEN, the exact table (from §4.7.2; `lead` renders bold, `body` follows after one space):**

| State | Tone | Icon | Lead | Body |
|---|---|---|---|---|
| `hidden` | none | none | none | empty |
| `saved-fresh` | `bg-info-bg` | signal-off | per mode | `Showing your saved copy from {time} ({ago}).` |
| `saved-old` | `bg-stale-tint` | clock | per mode | `Your saved copy is from {time} ({ago}). Things may have changed since then.` |
| `ended` | `bg-stale-tint` | clock | `This show has ended.` | `You're seeing the last version, from {time}.` |
| `sheet-gone` | `bg-warning-bg text-warning-text` | alert | `Doug's sheet for this show isn't available in Google Drive anymore.` | `You're seeing the last version we have. Check with Doug before relying on it.` |
| `sheet-gone-saved` | `bg-warning-bg text-warning-text` | alert | same lead | `This is the last version we have, from {time}. Check with Doug before relying on it.` |
| `updating` | `bg-info-bg` | sync | `Signal's back.` | `Loading the latest version.` |
| `updated` | `bg-surface text-status-positive-text` | check | none | `Updated. You're on the latest version.` |

Leads per mode: `offline` `No signal.`; `slow` `Slow connection.`; `server-error` `Couldn't load the latest version.`; `live` with `online` false `No signal.`. Precedence: `ended` > `updating` > `sheet-gone-saved` > `sheet-gone` > `saved-old`/`saved-fresh` > `updated` > `hidden`. Conditions: `ended` iff mode `ended`; `sheet-gone-saved` iff `sheetUnavailable` and mode is `offline`, `slow` or `server-error`; `sheet-gone` iff `sheetUnavailable` and mode `live` (online or not); saved states iff mode is `offline`, `slow` or `server-error`, or mode `live` with `online` false; fresh below `OLD_COPY_MS`, old at or above it. Unknown saved time (Q3 reading): saved states render `saved-old` tone and icon with body `Showing your saved copy.`; `ended` body `You're seeing the last version.`; `sheet-gone-saved` body `This is the last version we have. Check with Doug before relying on it.`. `isSheetUnavailable(lastSyncStatus)` lives here too, so no `.tsx` file compares against the raw status string.

**Cases:** one per state per lead; every precedence pair where both apply (derived by enumerating the `BarState` union pairwise and constructing inputs that satisfy both, so a new state without a precedence row fails the enumeration); age exactly `OLD_COPY_MS` is old; future `savedAt` reads `just now`; the three unknown-time rows; `live` + `sheetUnavailable` + offline is `sheet-gone`. Four string mutants per the conventions.

**Failure mode caught:** a precedence inversion that shows "Updated" over an old copy; a copy drift from the spec.

**Commit:** `feat(offline): bar state derivation with exact copy`

### Task 5: Navigation decision tables (§4.4)

<!-- task: red=`pnpm exec vitest run tests/lib/offline/navigation.test.ts` red-state=authored red-target=`lib/offline/navigation.ts:82` why=`decideStep3, decideEndedStep1, decideEndedFetch, decideCheckOutcome and decideNoResponse are stubs that throw (with lib/offline/store.ts holding the types, per preflight ruling D1), so every row of the step tables fails on the throw` ac=AC-3 -->

**What is red and why:** every decision function is a throwing stub.

**Files**

```text
create  lib/offline/navigation.ts
create  tests/lib/offline/navigation.test.ts
```

**Stub and types (RED step; `decideEndedStep1`, `decideEndedFetch`, `decideCheckOutcome` and `decideNoResponse` follow the same stub pattern):**

```ts
import type { MarkerRead } from "@/lib/offline/marker";
import type { PurgeScope, StoredCopy } from "@/lib/offline/store";

export const NAV_BUDGET_MS = 8_000;
export const CONTINUATION_MS = 60_000;
export const STATUS_TIMEOUT_MS = 5_000;

export type ServeMode = "offline" | "slow" | "server-error" | "ended";

export type CompleteResponse =
  | { kind: "opaque-redirect" }
  | { kind: "body"; status: number; marker: MarkerRead };

/** S(U) is the copy saved at the request path; C(X) is show X's one copy wherever it lives. */
export type SavedView = {
  atUrl: StoredCopy | null;
  byShow: ReadonlyMap<string, StoredCopy>;
};

export type Step3 =
  | { serve: "network"; then: "commit" | "none" }
  | { serve: "network"; then: "purge"; scope: PurgeScope }
  | { serve: "saved"; mode: "server-error" }
  | { serve: "ask-status" };

/** "no-verdict" is a 500 from the status route; "no-answer" is a network error or timeout. */
export type StatusOutcome = "ended" | "gone" | "no-verdict" | "no-answer";

export function decideStep3(url: string, response: CompleteResponse, saved: SavedView): Step3 {
  void url;
  void response;
  void saved;
  throw new Error("unimplemented");
}
```

This task imports the `StoredCopy` and `PurgeScope` types from Task 6's module, so Task 6's type-only file is written first in this task's RED step (types only; Task 6 adds the functions).

**Rows (one test case each, expected values written from the spec rows, never from the implementation):**

- Step 3, `save`: network, then commit (as the copy of the marker's show).
- `keep`, `S(U)` is the marker's show and viewer: serve saved in `server-error`.
- `keep`, `C(show)` exists at `U` or another link for a different viewer: network, purge `{ by: "show" }`.
- `keep`, otherwise (no copy of that show; or `S(U)` belongs to a different show): network, none.
- `hold`: network, none, whether or not `S(U)` exists.
- `check` with `S(U)`: ask-status. `check` without: network, none.
- valid `purge` naming a show: purge `{ by: "show" }`. Valid `purge` with null show id: purge `{ by: "url", url }`.
- `invalid` with a show id: purge by show; `invalid` without: purge by url.
- `absent`, status below 500: purge by url. `absent`, status 500 or above, with `S(U)`: serve saved `server-error`; without: network, none (Q2 reading: content type does not matter).
- opaque redirect: network, none.
- `decideCheckOutcome`: `ended` marks and serves ended; `gone` purges `C(show)` and serves network; `no-verdict` and `no-answer` serve network and keep.
- `decideEndedStep1` (spec v7): `ended` serves ended; `gone` purges `C(show)` and continues at step 2; `no-answer` serves ended; `no-verdict` fetches the page under the step 2 budget and keeps the copy. `decideEndedFetch` then serves a complete response as is, without the step 3 table (a `check` or `purge` marker in it changes nothing), and serves `S(U)` in `ended` mode on a network error or a timeout.
- `decideNoResponse`: network error with `S(U)` offline; without, the not-saved page; timeout with `S(U)` slow plus continuation; timeout without `S(U)` keep waiting.

**Failure mode caught:** the split between serving (`S(U)`) and purging (`C(X)`) collapsing into one key, which would either serve a copy at a link it was not saved under or leave a different viewer's copy alive at an old link.

**Commit:** `feat(offline): navigation decision tables`

### Task 6: One copy per show, the generation counter, the ordinal, and the IndexedDB adapter

<!-- task: red=`pnpm exec vitest run tests/lib/offline/store.test.ts tests/lib/offline/idbStore.test.ts` red-state=authored red-target=`lib/offline/store.ts:92` why=`planBeginSave, planCommit, planPurge and copyAtUrl are stubs that throw and every IndexedDB adapter method is a stub that throws, so each ordering race, each one-copy-per-show case and each persistence case fails on the throw` ac=AC-4 -->

**What is red and why:** the plan functions and the adapter's methods are throwing stubs (the types already exist from Task 5's RED step).

**Files**

```text
edit    lib/offline/store.ts          (types landed in Task 5; plan functions and createMemoryStore here)
create  lib/offline/storeSchema.ts    (database, store and cache names, SCHEMA_VERSION)
create  lib/offline/idbStore.ts       (the IndexedDB adapter the worker uses)
create  tests/lib/offline/store.test.ts
create  tests/lib/offline/idbStore.test.ts
edit    package.json                  (devDependency fake-indexeddb, pinned exactly to 6.2.5)
```

**Types and stubs:**

```ts
export type PurgeScope =
  | { by: "show"; showId: string }
  | { by: "url"; url: string }
  | { by: "all" };

export type SaveToken = { generation: number; ordinal: number };

export type StoredCopy = {
  showId: string;
  url: string;
  html: string;
  viewer: string;
  epoch: number;
  savedAt: string;
  ordinal: number;
  assets: readonly string[];
  statics: readonly string[];
  endedAt: number | null;
  lastOpenedAt: number;
};

export type StoreState = {
  generation: number;
  nextOrdinal: number;
  /** Keyed by show id: one copy per show (spec section 4.6). */
  copies: ReadonlyMap<string, StoredCopy>;
};

export type CommitOutcome = "committed" | "stale-generation" | "stale-ordinal";

export function planBeginSave(state: StoreState): { token: SaveToken; next: StoreState } {
  void state;
  throw new Error("unimplemented");
}

export function planCommit(
  state: StoreState,
  token: SaveToken,
  copy: StoredCopy,
): { outcome: CommitOutcome; next: StoreState } {
  void state;
  void token;
  void copy;
  throw new Error("unimplemented");
}

export function planPurge(state: StoreState, scope: PurgeScope): StoreState {
  void state;
  void scope;
  throw new Error("unimplemented");
}

export function copyAtUrl(state: StoreState, url: string): StoredCopy | null {
  void state;
  void url;
  throw new Error("unimplemented");
}
```

**GREEN, the plan functions:** `planBeginSave` returns the current generation and the next ordinal and increments `nextOrdinal`. `planCommit` refuses when `token.generation !== state.generation` (`stale-generation`) or when the show's stored copy has an ordinal at or above the token's (`stale-ordinal`); otherwise it replaces the show's copy wherever it was saved. `planPurge` always increments `generation` (every purge of any scope, including one that removes nothing) and removes `C(show)`, `S(url)`, or everything. `createMemoryStore()` wraps these behind the async `SavedCopyStore` interface the worker uses.

**GREEN, the adapter:** `createIdbStore(factory: IDBFactory)` implements the same `SavedCopyStore` interface over the database named in the schema module (version `SCHEMA_VERSION`), with stores `meta` (one record: generation, next ordinal), `copies` (key path `showId`, unique index on `url`) and `statics` (URL to stored-at time). Every method is one IndexedDB transaction that reads what the matching plan function needs, calls it, and writes its result, with no non-IndexedDB `await` inside, so a commit is a single read-write transaction over `copies` and `meta`.

**Why fake-indexeddb.** It implements the IndexedDB API in Node, transaction scheduling included, so the adapter's real calls run in Vitest and a race can be staged on purpose; the e2e suite reaches the adapter only through whatever timing the browser happens to produce. It is a devDependency used by one test file; R12 forbids only a new runtime dependency. Version 6.2.5 is pinned exactly because it is the newest release older than two weeks (6.2.6 is from 2026-10-16).

**Cases, plan functions and memory store:** a save that began before any purge never commits after it (first save and replacement both); a purge of show A voids an in-flight save of show B; two saves of one show commit in ordinal order and the older one loses whichever finishes last; each §4.6 bracket (purge, save starts, purge, save commits) refuses the save, including the first save of a show with no copy; **one copy per show:** a save at a new link replaces the copy saved at an old link and `copyAtUrl(oldLink)` is then `null`; a show-scoped purge at a new link removes a copy saved at an old link; a url-scoped purge at a new link leaves an older-link copy of the same show in place (the bootstrap case of §4.6, also driven end to end in Task 10).

**Cases, adapter** (each with its own `new IDBFactory()` from fake-indexeddb, so no state leaks between cases): the same contract cases, run as one parameterized suite over both stores; the generation counter and the next ordinal survive closing the database and opening a second adapter on the same factory, so a save begun before a worker restart cannot commit after a purge made after it; a commit opens exactly one transaction, read-write, whose scope is `copies` and `meta` (spy on `transaction` of the database the adapter opened); a purge committed between `beginSave` and `commitIfCurrent` makes the commit return `stale-generation` through the real API; `copyAtUrl` reads through the unique `url` index; two copies cannot share a URL.

**Failure mode caught:** a save racing an identity transition and landing a previous viewer's page after the purge (the anti-goal in §2), including across a worker restart, which only a persisted counter prevents.

**Commit:** `feat(offline): one copy per show, a persisted generation counter and an IndexedDB adapter`

### Task 7: Completeness (HTML and CSS font references), caps, eviction and static retention

<!-- task: red=`pnpm exec vitest run tests/lib/offline/completeness.test.ts tests/lib/offline/caps.test.ts` red-state=authored red-target=`lib/offline/caps.ts:38` why=`requiredStaticUrls and fontUrlsFromCss (lib/offline/completeness.ts) and admitAsset, evictionVictims and staticEvictions (lib/offline/caps.ts) are throwing stubs, so each extraction, cap boundary, eviction and retention case fails on the throw (preflight ruling D23)` ac=AC-5 -->

**What is red and why:** all five functions are throwing stubs.

**Files**

```text
create  lib/offline/completeness.ts
create  lib/offline/caps.ts
create  tests/lib/offline/completeness.test.ts
create  tests/lib/offline/caps.test.ts
create  tests/lib/offline/fixtures/crew-page.html
```

**GREEN:** `requiredStaticUrls(html, origin)` returns the de-duplicated same-origin `/_next/static/**` and `/fonts/**` URLs from `src`, `href` and `srcset` attributes of the saved HTML. `fontUrlsFromCss(css, origin)` returns the de-duplicated same-origin `/fonts/**` URLs named by `url(...)` in one CSS file, quoted or unquoted, ignoring `data:` URIs and anything outside `/fonts/`. The worker applies it to every CSS file among the HTML's statics, one level deep, never to CSS a CSS file imports (the Q1 decision; spec §4.6 as amended on this branch). The caps module holds `ASSET_MAX_BYTES = 25 * 1024 * 1024`, `SHOW_PREFETCH_MAX_BYTES = 75 * 1024 * 1024`, `MAX_SAVED_SHOWS = 10` and `STATIC_RETENTION_MS = 14 days`. `admitAsset(bytesSoFar, contentLength)` skips one asset over 25 MB and stops the show's prefetch once the running total passes 75 MB; an unknown `contentLength` is admitted and re-checked against the bytes read. `evictionVictims(copies, incomingShowId)` returns the least recently opened copies beyond 10. `staticEvictions(index, referenced, nowMs)` returns the entries no copy references that were stored more than 14 days ago.

**Cases:** HTML extraction against a real production HTML fixture captured once from a production build, with a premise that it holds at least one `/_next/static/` script, one stylesheet and the font preload link the root layout renders (`components/FontPreload.tsx:27`), all three of which the result must include; CSS extraction against a copy of the rule at `app/fonts.css:28` (the source the build compiles into a CSS chunk), which yields the Inter woff2 URL, plus a minified unquoted url pointing at /fonts/x.woff2, while a `data:` URI, a relative url pointing at ../media/x.woff2 and a `/_next/static/media/` URL yield nothing; cap boundaries at exactly 25 MB and 75 MB; the 11th show evicts the least recently opened copy and not the oldest-saved one, and 10 or fewer copies evict nothing; static retention in both directions: an unreferenced entry stored 15 days ago **is** returned (so an implementation that returns `[]` fails), while an unreferenced entry stored 13 days ago and a referenced one stored 15 days ago are not.

**Failure mode caught:** a committed copy that cannot hydrate offline because a chunk was never cached, or that loses its typeface because the font was never required; unbounded storage growth.

**Commit:** `feat(offline): completeness, caps and eviction rules`

### Task 8: Head injection and the CSS notice

<!-- task: red=`pnpm exec vitest run tests/lib/offline/inject.test.ts` red-state=authored red-target=`lib/offline/inject.ts:45` why=`injectSavedCopyHead is a stub that throws, so the placement, escaping and allowlist cases all fail on the throw` ac=AC-6 -->

**What is red and why:** `injectSavedCopyHead` throws.

**Files**

```text
create  lib/offline/inject.ts
create  tests/lib/offline/inject.test.ts
```

**GREEN:** `injectSavedCopyHead(html, { mode, savedAt, noticeText })` inserts, immediately after the first `<head>` start tag (attributes allowed), `<meta name="fxav-served" content="<mode>" data-saved-at="<iso>">` and a `<style>` block: `html:not([data-fxav-bar="mounted"]) body::before { content: "<notice>"; position: sticky; top: 0; display: block; ... }` with light and dark values copied from `app/globals.css:366` and `app/globals.css:370` and their dark counterparts. `noticeText` is `Saved copy from {time}` or `Saved copy` when the time is unknown, and is escaped for a CSS string (backslash, double quote, newline). `mode` must be one of the four serve modes or the function throws (the caller only passes the union). A document without `<head>` gets both elements prepended (fail visible, never silent).

**Cases:** placement after `<head>` and after `<head lang="en">`; the meta is the first element child of head; CSS escaping of a quote and a backslash; byte length grows by exactly the inserted string; the input's `<template id="fxav-saved-copy">` is untouched. Four string mutants per the conventions.

**Failure mode caught:** a served copy without a visible notice when JavaScript fails (the P0 anti-goal in §2).

**Commit:** `feat(offline): saved-copy head injection and CSS notice`

### Task 9: The "not saved yet" page

<!-- task: red=`pnpm exec vitest run tests/lib/offline/notSavedPage.test.ts` red-state=authored red-target=`lib/offline/notSavedPage.ts:94` why=`notSavedPageHtml is a stub that throws, so the copy, theming and reload cases fail on the throw` ac=AC-9 -->

**What is red and why:** `notSavedPageHtml()` throws.

**Files**

```text
create  lib/offline/notSavedPage.ts
create  tests/lib/offline/notSavedPage.test.ts
```

**GREEN:** a self-contained HTML document (no Next chunks, no external requests): heading `No signal, and this show isn't saved on this phone yet.`, body `Open this link once while you have signal or wifi. After that it works here even with no signal.`, small text `This page reloads by itself when signal comes back.`, inline styles with the light values and a `prefers-color-scheme: dark` block (bg `#0f1014`, text `#e8e6e0`, subtle `#9c9a93`, from `app/globals.css:437`), viewport meta, and an inline `addEventListener("online", () => location.reload())`.

**Cases:** each string present in the right element (parsed with jsdom, not substring-matched on the raw HTML, so a string inside a comment does not satisfy it); no `src=` or `href=` pointing anywhere; no em dash anywhere in the document; the reload listener executes in jsdom (`window.dispatchEvent(new Event("online"))` with `location.reload` spied). Four string mutants.

**Commit:** `feat(offline): built-in not-saved-yet page`

### Task 10: Worker state machine with injected dependencies

<!-- task: red=`pnpm exec vitest run tests/lib/offline/workerInstall.test.ts` red-state=authored red-target=`lib/offline/worker/install.ts:263` why=`installWorker registers no listeners in its stub, so every fetch and message case finds no handler and fails its respondWith, reply and store assertions` ac=AC-3,AC-4,AC-5 -->

**What is red and why:** the stub `installWorker(scope, deps)` registers nothing, so dispatching a fake `fetch` or `message` event finds no listener and the respondWith, reply and store assertions fail.

**Files**

```text
create  lib/offline/worker/install.ts     (all handlers; deps injected)
create  lib/offline/worker/swTypes.ts     (minimal FetchEvent, ExtendableEvent, ExtendableMessageEvent, Clients types; the repo's tsconfig has no webworker lib)
create  lib/offline/protocol.ts           (page <-> worker message shapes)
create  tests/lib/offline/workerInstall.test.ts
```

**Protocol** (the protocol module): page to worker: `marker` (`purge` with `showId | null` and `url`; `check` with `url`), `ensure-saved` (`url`, `renderedAt`), `probe` (`url`), `purge-show` (`showId`, from AvatarMenu). Each carries a `MessagePort` for its reply (`ack`, or an outcome: `saved | purged | ended | failed | skipped | kept`). Worker to every open page: `fresh-ready` (`url`), `purged` (`showId`), `save-failed` (`url`, `reason: "quota"`).

**Deps:** `store` (the `SavedCopyStore` interface from Task 6; the tests use `createMemoryStore()`), `staticCache` and `assetCache` (a `match`/`put`/`delete`/`keys` subset of `Cache`), `fetch`, `now`, `clients` (`matchAll` + `postMessage`), `timers`. Node 20 provides real `Request`, `Response`, `Headers`, `AbortController` and `MessageChannel`, so the tests use real ones and fake only the event objects, the caches and `fetch`.

**Cases (each a test; fake fetch scripted per case):**
- Steps 2 and 3 for every Task 5 row, end to end through `respondWith`: the served `Response` body is the network body, the saved copy with injected meta (assert the meta `content`), or the not-saved page.
- **Serving a copy drops the stored transport headers (§4.7.1):** a copy saved from a network response carrying `content-encoding: gzip` and `content-length` is served with neither header, with `content-type: text/html; charset=utf-8`, and with a body whose byte length equals the injected HTML.
- **Step 1 for an ended copy (spec v7):** `ended` serves the copy in `ended` mode; `gone` purges and continues at step 2; `no-answer` serves `ended`; `no-verdict` fetches the page under the 8-second budget and keeps the copy in every branch: a complete response is served byte for byte without consulting its marker (a `purge` marker in it leaves the copy in place), and a network error, or a fetch still pending at 8 seconds, serves the copy in `ended` mode.
- Steps 4 and 5: a fetch that never settles serves `slow` at 8 s (fake timers); the continuation completing with `save` commits and posts `fresh-ready(U)`; completing with `purge` naming the show posts `purged(showId)` to every client; a continuation past 60 s is abandoned; no `S(U)` means no 8-second cut-off.
- Buffering: a body that errors mid-stream counts as a network error (step 4), not a partial page.
- Brackets: a `POST` navigation to `/auth/sign-out` purges all before calling fetch and again after the response, and a save begun between the two never commits; same for `/auth/callback`; a navigation to `/api/auth/picker-bootstrap` gets no `respondWith`.
- **`purge-show` (AvatarMenu bracket, §4.6):** the message removes `C(show)` wherever it was saved, bumps the generation so a save of that show begun before it never commits, and replies `ack` only after the purge has completed. With the handler removed, the copy is still present and the case fails.
- **Bootstrap case (§4.6):** `C(X)` saved at `U_old`; a navigation to `U_new` returns a markerless 200; the `S(U_new)` purge removes nothing and `C(X)` stays at `U_old`; the next save at `U_new` replaces it; a network-error navigation to `U_old` then serves the not-saved page.
- **One copy per show (§7):** a save at a new link replaces the old-link copy; a show-named purge at the new link removes the old-link copy; the old link then gets the not-saved page with no network.
- `ensure-saved`: skipped when `S(U)` already has that `renderedAt` or a save of it is in flight; otherwise fetches with `redirect: "manual"` and runs the step 3 table without serving.
- `probe`: runs steps 2 and 3 silently and replies with the outcome.
- `marker` messages: `purge` with a show id purges `C(show)`, without one purges `S(url)`; `check` runs the status check for `S(url)` and replies `ended` only when it transitioned the copy.
- **Completeness (§4.6 as amended):** before a commit, every static URL in the HTML and every `/fonts/**` URL named inside those CSS files (read from the static cache, or fetched, one level deep) is in the static cache; a failed font fetch abandons the save exactly like a failed chunk, and the show's previous copy stays; a quota error on `put` abandons and posts `save-failed`; assets over the caps are skipped without blocking the commit; asset requests go network first with a 5-second timeout and fall back to the stored asset only for URLs a saved copy lists.
- **Eviction and retention in the glue (§4.8):** serving a copy and saving one both update its `lastOpenedAt`; committing an 11th show deletes the least recently opened show's copy and removes from the asset cache every URL only that copy listed; after a commit and on `activate`, the entries `staticEvictions` returns (fake clock past 14 days) are deleted from the static cache and from the `statics` index, and entries a copy references are kept.
- `activate`: caches whose name starts with `fxav-` but carries another schema version are deleted; `skipWaiting` and `clients.claim` are called.
- Requests classified `ignore` (Task 1) never reach `respondWith`, asserted for an RSC request, a Server Action `POST`, `/admin` and `/api/report`.

**Failure mode caught:** every §4.4, §4.6 and §4.8 rule wired wrongly in the glue even though the pure tables are right.

**Commit:** `feat(offline): service worker state machine`

### Task 11: Worker entry and `pnpm gen:sw` with a freshness test

<!-- task: red=`pnpm exec vitest run tests/lib/offline/swSourceFreshness.test.ts` red-state=authored red-target=`lib/offline/__generated__/swSource.ts:2` why=`the RED step commits a placeholder generated module whose SW_SOURCE is an empty string while the entry, the build script and buildSwSource are real, so the equality case fails on content and nothing in the RED step throws` ac=AC-10,AC-4 -->

**What is red and why:** the RED step writes the test, the real build script, the one-line entry, and a placeholder generated module whose `SW_SOURCE` is `""`. The equality case then fails on content, because the placeholder differs from the bundle a real `buildSwSource()` produces. The input-allowlist case runs on that same real build and may already pass at RED; it is a guard on the bundle's inputs, with its premise stated, not the red.

**Files**

```text
create  lib/offline/worker/entry.ts
create  lib/offline/__generated__/swSource.ts
create  scripts/generate-sw-source.ts
create  tests/lib/offline/swSourceFreshness.test.ts
edit    package.json         ("gen:sw": "tsx scripts/generate-sw-source.ts", beside gen:spec-codes)
edit    .prettierignore      (add the generated directory beside the other generated dirs)
```

The generated directory follows the same rule as `lib/admin/__generated__/` at `.prettierignore:38`: gen scripts emit raw output, and a reformat would drift from the next regeneration.

**RED step contents:** the entry is one call, `installWorker(self, realDeps())`, where `realDeps()` wires `createIdbStore(indexedDB)` (Task 6), Cache Storage, `fetch`, `clients` and timers. The script exports `buildSwSource(): Promise<{ code: string; inputs: string[] }>` using `esbuild.build` (`entryPoints: ["lib/offline/worker/entry.ts"]`, `bundle: true`, `format: "iife"`, `platform: "browser"`, `target: ["es2020"]`, `write: false`, `metafile: true`, `minify: false`, `legalComments: "none"`, `absWorkingDir` pinned to the repo root so path comments are repo-relative and identical on every machine). Its `main` runs only when the file is executed directly, and writes `export const SW_SOURCE: string = <JSON string>;`.

**GREEN:** `pnpm gen:sw`, which replaces the placeholder with the real bundle.

**Cases:** the committed `SW_SOURCE` equals `buildSwSource().code`; every metafile input is under `lib/offline/`, is none of the server-only modules (the viewer-key helper, the server marker helpers, the kill switch, the status lifecycle and the asset list, named by path even though later tasks create some of them, so a later import into the worker graph fails here), and is not under the client directory; premise: the input list is non-empty and includes the worker's install module; the bundle contains no `process.env`, no `require(` and no `node:` specifier. Mutation check recorded in the commit: change one string in the not-saved page module without regenerating, observe the equality case fail, revert.

**Commit:** `feat(offline): bundle the service worker with pnpm gen:sw`

### Task 12: The /sw.js route and the kill switch

<!-- task: red=`pnpm exec vitest run tests/app/swRoute.test.ts tests/lib/offline/killSwitch.test.ts` red-state=authored red-target=`app/sw.js/route.ts:16` why=`the stub GET returns an empty 404 and the kill-switch source is an empty string, so the header, body-selection and self-removal cases all fail on status and content` ac=AC-10 -->

**What is red and why:** the stub route returns `new Response(null, { status: 404 })`, and the stub kill-switch source is empty.

**Files**

```text
create  app/sw.js/route.ts
create  lib/offline/killSwitch.ts       (crewOfflineDisabled(env) and KILL_SWITCH_SOURCE)
create  tests/app/swRoute.test.ts
create  tests/lib/offline/killSwitch.test.ts
edit    .env.local.example               (commented CREW_OFFLINE_DISABLED line under the Auth block)
```

The `.env.local.example` entry goes under the `# Auth` heading at `.env.local.example:20` as a commented, documented line.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN:** the route exports `dynamic = "force-dynamic"` (the repo's convention, as `app/api/health/route.ts:4` does) and `GET`, which reads `crewOfflineDisabled(process.env)` per request (`CREW_OFFLINE_DISABLED === "1"`) and returns `SW_SOURCE` or `KILL_SWITCH_SOURCE` with `Content-Type: application/javascript; charset=utf-8` and `Cache-Control: no-cache, no-store, must-revalidate` (§3.6). `KILL_SWITCH_SOURCE` is a small hand-written worker: on `install` it calls `skipWaiting`; on `activate` it deletes every Cache Storage entry whose name starts with `fxav-`, deletes the IndexedDB database named in `lib/offline/storeSchema.ts`, calls `self.registration.unregister()`, and it registers no `fetch` listener.

**Cases:** route with the variable unset returns `SW_SOURCE` byte for byte; set to `1` returns the kill-switch source; set to `0` or `true` returns `SW_SOURCE`; toggling the variable between two calls in one test process changes the answer (proves the read is per request, not module scope); both headers exact; `dynamic` export equals `"force-dynamic"`. The kill-switch source is evaluated with `node:vm` in a fake worker global (spied `caches`, `indexedDB`, `registration`, `addEventListener`): it registers no `fetch` listener, deletes only `fxav-` caches, deletes the database, unregisters. The same source runs in a real browser in Task 25 case 14.

**Failure mode caught:** a worker that cannot be switched off without a deploy (§2 anti-goal).

**Commit:** `feat(offline): serve the worker from a route with a runtime kill switch`

### Task 13: `shows.unpublished_at` and its trigger

<!-- task: red=`pnpm exec vitest run tests/db/showsUnpublishedAt.test.ts tests/sync/unpublishArchiveParity.test.ts` red-state=authored red-target=`supabase/migrations/20261027000000_shows_unpublished_at.sql:4` why=`no migration adds the column or the trigger, so the information_schema case finds no unpublished_at column, the explicit select after each unpublish path errors on the missing column, and the snapshot helper throws when the row it reads has no unpublished_at key` ac=AC-11 -->

**What is red and why:** three checks fail before the migration, each on the column's absence. The new DB test's `information_schema.columns` lookup finds no `unpublished_at` on `public.shows`. Its explicit `select unpublished_at` after each unpublish path errors. And `unpublishedStateSnapshot` (`tests/db/_b2Helpers.ts:302`) now throws when the row it reads with `select *` (`tests/db/_b2Helpers.ts:95`) has no `unpublished_at` key, so the existing parity test at `tests/sync/unpublishArchiveParity.test.ts:43` cannot pass by comparing `undefined` with `undefined`.

**Files**

```text
create  supabase/migrations/20261027000000_shows_unpublished_at.sql
create  tests/db/showsUnpublishedAt.test.ts
edit    tests/db/_b2Helpers.ts                     (unpublishedStateSnapshot: key guard plus unpublished_at_null)
edit    supabase/__generated__/schema-manifest.json (regenerated, never hand-edited)
```

**Migration:**

```sql
-- Spec docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md section 4.11.
-- Nullable, no default, no backfill: null means never unpublished since this shipped.
alter table public.shows
  add column if not exists unpublished_at timestamptz;

comment on column public.shows.unpublished_at is
  'Last unpublish without archive (published true to false, archived false). Stamped by trigger shows_stamp_unpublished_at. Read by GET /api/saved-copy/status.';

-- Touches only NEW, so it needs no elevated rights (security invoker, unlike
-- bump_picker_epoch_bumped_at, which predates this convention).
create or replace function public.stamp_shows_unpublished_at()
  returns trigger
  language plpgsql
  set search_path = public, pg_temp
as $$
begin
  if old.published is true and new.published is false and new.archived is false then
    new.unpublished_at := clock_timestamp();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_shows_unpublished_at() from public;

drop trigger if exists shows_stamp_unpublished_at on public.shows;
create trigger shows_stamp_unpublished_at
  before update on public.shows
  for each row
  execute function public.stamp_shows_unpublished_at();
```

The trigger is `before update` (all columns), literally per §4.11, rather than `before update of published`. It acquires no lock (invariant 2: it runs inside the caller's transaction, under that path's existing per-show lock; sweep S2 lists every writer).

**Snapshot edit:** in the object returned at `tests/db/_b2Helpers.ts:309`, first throw `shows.unpublished_at missing` when `!("unpublished_at" in show)`, then add `unpublished_at_null: show.unpublished_at == null`, in the same null-or-not form as `archived_at_null` (§4.11). The guard is what makes the parity test a real check of this column: without it, a row read with `select *` before the migration gives `undefined` on both sides and the comparison passes.

**DB test cases:** the column exists on `public.shows`, is nullable, is `timestamp with time zone` and has no default (`information_schema.columns`); `_unpublish_show_core` (via the admin RPC helper pattern `tests/db/_b2Helpers.ts:50`) leaves a non-null value, read back with an explicit `select unpublished_at` on that row; the token path in `lib/sync/unpublishShow.ts:158` does the same on its own row (so "neither path stamps" fails on each path separately, not only on their equality); `archive_show` leaves it null; unarchive leaves it unchanged; republish leaves the old value in place; an unrelated update of a published show leaves it null; a second unpublish after republish moves the value forward.

**Apply, then the checklist (AGENTS.md validation-schema-parity, all in this task):**
1. Local: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/20261027000000_shows_unpublished_at.sql`. Never `supabase db reset` (the local DB is shared by every worktree). Applying twice is a no-op (idempotent DDL).
2. `pnpm gen:schema-manifest`, commit the regenerated manifest.
3. Validation project: `supabase db query --linked` with the migration body, then `notify pgrst, 'reload schema';`.
4. `pnpm test:audit:validation-schema-parity`.

DB completeness matrix (every §4.11 layer): DDL (migration); inline CHECKs N/A, no constraint; write path the trigger; read path the status route (Task 15, service role); triggers one new, cleanup none; RLS and grants unchanged; manifest regenerated; validation applied; `dev.shows` N/A (§1 item 12); tests above.

**Commit:** `feat(db): stamp shows.unpublished_at on unpublish`

### Task 14: Extract the post-unpublished identity resolution

<!-- task: red=`pnpm exec vitest run tests/auth/picker/resolveCrewIdentity.test.ts tests/auth/picker/resolvePickerSelection.test.ts tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts tests/show/showUnavailablePaused.test.tsx tests/show/resolvedArmCrewMembersGuard.test.tsx` red-state=authored red-target=`lib/auth/picker/resolveShowPageAccess.ts:178` why=`the unpublished result at this line carries no showId and the resolved result carries no pickerEpoch, so the updated exhaustiveness expectations fail on both fields, the new saved-epoch cases fail because resolvePickerSelection ignores an epochCheck input, and the resolveCrewIdentity cases throw from its stub` ac=AC-12 -->

**What is red and why:** `lib/auth/picker/resolveShowPageAccess.ts:229` returns `{ kind: "unpublished" }` with no show id and the `resolved` result has no `pickerEpoch`, so the updated expectations fail; `resolvePickerSelection` has no `epochCheck` input, so the new saved-epoch cases resolve against the row's epoch and fail; the new module's cases call a stub that throws.

**Files**

```text
create  lib/auth/picker/resolveCrewIdentity.ts            (resolveCrewIdentity, EpochCheck, CREW_IDENTITY_OUTCOMES)
edit    lib/auth/picker/resolvePickerSelection.ts          (optional epochCheck input; result type unchanged)
edit    lib/auth/picker/resolveShowPageAccess.ts           (gates, then resolveCrewIdentity; select gains picker_epoch; unpublished gains showId; resolved gains pickerEpoch)
edit    lib/audit/authPrimitives.ts                        (AUTH_LIB_ALLOWLIST gains the new module beside its two siblings)
create  tests/auth/picker/resolveCrewIdentity.test.ts
edit    tests/auth/picker/resolvePickerSelection.test.ts   (new saved-epoch cases only)
edit    tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts
edit    tests/show/showUnavailablePaused.test.tsx
edit    tests/show/resolvedArmCrewMembersGuard.test.tsx
```

**Every edit to an existing test, enumerated** (from a plan-time grep of `kind: "resolved"` and `kind: "unpublished"` across `tests/`):
- `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:26`: the local `ShowRow` type gains `picker_epoch: number`; the fixture rows at `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:75`, `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:95` and `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:104` gain `picker_epoch: 7`, the epoch the file's cookie carries at `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:48`; the `unpublished` expectation at `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:116` gains `showId: SHOW_ID`; the `resolved` expectation at `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:193` gains `pickerEpoch: 7`. The objects at lines 181 and 205 of that file mock `resolvePickerSelection`, whose result type does not change, so they stay.
- `tests/show/showUnavailablePaused.test.tsx:45`: the mock gains `showId` (the type requires it).
- `tests/show/resolvedArmCrewMembersGuard.test.tsx:92`: the mock gains `pickerEpoch` (the type requires it).
- No edit: `tests/show/flow8Repick.test.tsx:97` and `tests/show/loadRosterSanitizeBoundary.test.tsx:34` cast with `as unknown as Access`; flow8's `resolved` arm then renders with an undefined epoch, which the slot turns into a purge marker (Task 17). `tests/show/resolvedArmCrewMembersGuard.test.tsx:116` keeps passing because the viewer the page builds does not change.
- No edit anywhere `resolvePickerSelection` is mocked (`tests/api/show-version.test.ts`, `tests/api/realtime/subscriber-token.test.ts`, `tests/reports/auth.test.ts`, `tests/auth/picker/validatePickerAssetSession.test.ts`, `tests/auth/authBoundaryStamps-telemetry.test.ts`, `tests/api/_apiGoogleSessionRejectsWithoutCookie.test.ts`), because its result type is unchanged and the new input is optional.

**Shape of the new module:**

```ts
import type { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/** How the picker entry's epoch is checked (spec section 4.5). */
export type EpochCheck = { kind: "current" } | { kind: "saved"; epoch: number };

export type CrewIdentityResult =
  | { kind: "resolved"; crewMemberId: string }
  | { kind: "needs_picker_bootstrap" }
  | { kind: "no_auth"; reason: "first_contact" | "google_mismatch" }
  | { kind: "epoch_stale"; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: "removed_from_roster"; expectedEpoch: number; expectedCrewMemberId: string }
  | { kind: "selection_reset"; expectedEpoch: number; expectedCrewMemberId: string }
  | {
      kind: "identity_invalidated";
      expectedEpoch: number;
      expectedCrewMemberId: string;
      reason: "claimed_after_pick" | "session_mismatch";
    }
  | { kind: "show_unavailable" }
  | { kind: "infra_error"; code: "PICKER_RESOLVER_LOOKUP_FAILED" };

/** Every outcome kind, in one place, so the parity table can prove it covers them all. */
export const CREW_IDENTITY_OUTCOMES = [
  "resolved",
  "needs_picker_bootstrap",
  "no_auth",
  "epoch_stale",
  "removed_from_roster",
  "selection_reset",
  "identity_invalidated",
  "show_unavailable",
  "infra_error",
] as const satisfies readonly CrewIdentityResult["kind"][];

type MissingKinds = Exclude<CrewIdentityResult["kind"], (typeof CREW_IDENTITY_OUTCOMES)[number]>;
const _exhaustive: MissingKinds extends never ? true : never = true;
void _exhaustive;

export async function resolveCrewIdentity(input: {
  showId: string;
  req: Request;
  epochCheck: EpochCheck;
  /** The caller's client, so this module constructs none (invariant 9 registry). */
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>;
}): Promise<CrewIdentityResult> {
  void input;
  throw new Error("unimplemented");
}
```

**GREEN:** move the Google-session block (`lib/auth/picker/resolveShowPageAccess.ts:231` through `lib/auth/picker/resolveShowPageAccess.ts:292`) into `resolveCrewIdentity` unchanged in order and conditions. It uses the caller's service-role client rather than constructing one, so the invariant-9 registry at `tests/auth/_metaInfraContract.test.ts:220` needs no row for it, and its `infraError` keeps the `source` `auth.picker.resolveShowPageAccess` and the same `site` values, so `tests/auth/picker/resolveShowPageAccessLogging.test.ts` and the telemetry stay unchanged. It returns `{ kind: "needs_picker_bootstrap" }` without a token; `resolveShowPageAccess` signs the intent token around it exactly as today. The picker half calls `resolvePickerSelection({ showId, cookie, epochCheck })`: the input is optional and defaults to `current`, which keeps today's comparison at `lib/auth/picker/resolvePickerSelection.ts:110` and the archived/published check at `lib/auth/picker/resolvePickerSelection.ts:109`; `saved` skips that lifecycle check (the status route has its own) and compares `entry.e` to the saved epoch. `EpochCheck` is imported type-only, so the module cycle carries no runtime import. `resolveShowPageAccess` keeps its gate order (archived, admin, unpublished, then the call); its show-row select at `lib/auth/picker/resolveShowPageAccess.ts:158` gains `picker_epoch`; `unpublished` gains `showId`; `resolved` gains `pickerEpoch: showRow.picker_epoch` (§1 item 2 says why that equals the selection's epoch). `page.tsx` passes it to `CrewShell` in Task 18, once `CrewShellProps` accepts it; until then the field is carried on the result and unused, and `Viewer` itself never changes. The `auth_email_canonical` RPC stays in `lib/auth/picker/resolvePickerSelection.ts` (`tests/cross-cutting/picker-resolver-callsite-contract.test.ts:45`).

**Cases:** the existing suites pass with only the edits enumerated above (the refactor's safety net); in `resolvePickerSelection`, `saved` mode with the entry epoch equal to the saved epoch and the row one higher resolves, the entry epoch one below the saved epoch is `epoch_stale`, `saved` mode on an archived, unpublished row still resolves (lifecycle is the caller's job), and the default on an archived row is `show_unavailable` as today; in `resolveCrewIdentity`, the picker half is called with the given `epochCheck` (assert the call's argument on the mocked `resolvePickerSelection`), each Google-branch outcome matches today's `resolveShowPageAccess`, `createSupabaseServiceRoleClient` is never called (spy), and `needs_picker_bootstrap` carries no token.

**Failure mode caught:** the extraction changing the page's gate behavior, or the status route resolving identity differently from the page.

**Commit:** `refactor(auth): extract crew identity resolution shared by the page and the status route`

### Task 15: Viewer key, status route, and identity parity

<!-- task: red=`pnpm exec vitest run tests/lib/offline/viewerKey.test.ts tests/lib/offline/statusLifecycle.test.ts tests/api/savedCopyStatus.test.ts tests/auth/picker/savedCopyIdentityParity.test.ts tests/auth/_metaInfraContract.test.ts tests/cross-cutting/picker-resolver-callsite-contract.test.ts tests/cross-cutting/no-jwt-surface.test.ts tests/cross-cutting/auth-chain-audit.test.ts` red-state=authored red-target=`app/api/saved-copy/status/route.ts:92` why=`the stub route answers 200 ended for every request with no Cache-Control header, so every deny row of the parity table, every gone and 500 case of the route suite and the no-store case fail, and the new registry rows name a route that reads no show row and imports no shared resolver` ac=AC-12 -->

**What is red and why:** the RED step writes a stub route that returns `200 { "state": "ended" }` for everything and sets no `Cache-Control`, so every deny row, every `gone` and `500` case of the route suite and the no-store case fail; the `viewerKey` and `lifecycleAllowsEnded` stubs throw; the registry extensions fail because the stub reads no show row (no destructure to pin) and does not import `resolveCrewIdentity`.

**Files**

```text
create  lib/offline/viewerKey.ts
create  lib/offline/statusLifecycle.ts
create  app/api/saved-copy/status/route.ts
create  tests/lib/offline/viewerKey.test.ts
create  tests/lib/offline/statusLifecycle.test.ts
create  tests/api/savedCopyStatus.test.ts
create  tests/auth/picker/savedCopyIdentityParity.test.ts
edit    tests/auth/_metaInfraContract.test.ts
edit    tests/cross-cutting/picker-resolver-callsite-contract.test.ts
edit    tests/cross-cutting/no-jwt-surface.test.ts
edit    lib/audit/trustDomains.ts
```

**Stubs:**

```ts
/** HMAC-SHA256 over `${showId}:${crewMemberId}`, base64url; null when the key is unavailable. */
export function viewerKey(showId: string, crewMemberId: string): string | null {
  void showId;
  void crewMemberId;
  throw new Error("unimplemented");
}
```

```ts
export type LifecycleRow = {
  archived: boolean;
  picker_epoch: number;
  unpublished_at: string | null;
};

/** The three lifecycle conditions of spec section 4.5. Identity is checked separately. */
export function lifecycleAllowsEnded(
  row: LifecycleRow | null,
  savedEpoch: number,
  savedAtMs: number,
): boolean {
  void row;
  void savedEpoch;
  void savedAtMs;
  throw new Error("unimplemented");
}
```

**GREEN, the route:** `GET` parses `show`, `epoch`, `viewer`, `saved`; anything malformed or missing answers `200 gone` without touching the database. It constructs the service-role client and reads `archived, picker_epoch, unpublished_at` by id inside `try`, destructuring `{ data, error }` (invariant 9); a constructor throw, a returned `error` or a thrown read answers `500 { "error": "SAVED_COPY_STATUS_LOOKUP_FAILED" }`. `lifecycleAllowsEnded` false answers `gone`. Then the admin-session check the page runs (`isAdminSession`; `ok` is `gone`, the infra reason is 500). Then `resolveCrewIdentity({ showId, req, epochCheck: { kind: "saved", epoch }, serviceRole })` from the Task 14 module: `resolved` whose `viewerKey(showId, crewMemberId)` equals `viewer` (constant-time compare, unequal lengths compared as unequal without throwing) is `ended`, `infra_error` is 500, everything else `gone`. Every response carries `Cache-Control: no-store`. The 500 code is a log and wire code only, never rendered (invariant 5); the worker maps any 500 to `no-verdict` (§4.5).

**Route cases** (the route test file; `GET` called directly with real `Request` objects, identity boundaries mocked as in the parity suite below, the show row supplied through the mocked service-role client):
- Lifecycle through the route, identity mocked to pass: not archived is `gone`; an epoch gap of 0 or 2 is `gone`; a gap of 1 is `ended`; `unpublished_at` null is `ended`; earlier than `saved` is `ended`; equal to `saved` is `gone`; **later than `saved` is `gone` (R15)**; a missing row is `gone`.
- `Cache-Control: no-store` on every response class: `ended`, `gone`, `500`, and the malformed-parameter `gone`.
- `500` with the body above for each infra fault: the service-role constructor throws; the show-row read returns an error; the read throws; `isAdminSession` reports its infra reason; `resolveCrewIdentity` returns `infra_error`.
- Malformed or missing parameters answer `200 gone` and the mocked client's `from` is never called: no `show`; a non-UUID `show`; no `epoch`; a negative or non-integer `epoch`; no or empty `viewer`; no or unparseable `saved`.
- Identity resolving to a different crew member is `gone`; a `viewer` of a different length is `gone`, not a throw.

R15 is also reached end to end, through the worker and this route against the real database, in Task 25 case 13.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Parity table (`tests/auth/picker/savedCopyIdentityParity.test.ts`):** one array of scenarios; each row sets the mocked boundaries (`@/lib/auth/isAdminSession`, `@/lib/auth/validateGoogleSession`, `@/lib/supabase/server` for the show row, crew row and `auth_email_canonical`, following `tests/auth/picker/resolvePickerSelection.test.ts:6`) and a real signed picker cookie built with `encodePickerCookie` (`lib/auth/picker/cookieEnvelope.ts:52`) under the test key from `tests/setup.ts:37`. Each row runs twice: through `resolveShowPageAccess` for the live show (allow iff `resolved` for the saved crew member), and through the route's `GET` for the same show archived with `picker_epoch` one higher (allow iff `ended`). Both paths run the real `resolveCrewIdentity`; only its boundaries are mocked. Rows, each in a passing and a failing state: admin session; picker entry present for this show; entry for another show only; entry for a different crew member; entry epoch stale; roster membership; `selections_reset_at` after the pick; `claimed_via_oauth_at` after the pick; signed-in email equal to and different from the crew row; Google session matching the entry; Google session with no crew match; Google session whose entry differs (bootstrap); Google session for an unclaimed member; Google terminal failure. Two derived checks run unconditionally before the table: every `CREW_IDENTITY_OUTCOMES` kind is produced by at least one row (so a new outcome kind fails the test until a row covers it), and the table holds at least one allow and one deny (`premiseHolds`).

**Pre-dispatch mutants (record in the commit):** pass `{ kind: "current" }` instead of `saved` in the route and observe the allow rows fail; drop the admin-session check and observe the admin row fail; flip the `unpublished_at` comparison and observe the R15 route case fail.

**Lifecycle unit cases:** missing row; `archived` false; epoch gap 0, 2 and 3; `unpublished_at` before, equal to and after `saved`; null `unpublished_at`.

**Registry edits:** add the status route path to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`tests/auth/_metaInfraContract.test.ts:220`) and app/api/saved-copy to `AUTH_DOMAIN_ROOTS` (`tests/auth/_metaInfraContract.test.ts:353`), plus a destructure pin for the show-row read; a `PROTECTED_ROUTES` row with `chain: "auth-library-exception"` beside `lib/audit/trustDomains.ts:76`; app/api/saved-copy in `DATA_API_ROOTS` (`tests/cross-cutting/no-jwt-surface.test.ts:6`); a positive case in `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` asserting the route imports `resolveCrewIdentity` from its module and contains no `.rpc(` and no `validateGoogleSession` of its own.

**viewerKey cases:** deterministic; base64url with no padding; differs by show and by crew member; never contains the crew id; differs from a plain HMAC under the picker key (proves the label); returns null when the key throws.

**Then:** `pnpm test:audit:x3-trust-domain`.

**Commit:** `feat(api): saved-copy status route with identity parity`

### Task 16: `<SavedCopyMarker>` and the client messaging helper

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyMarker.test.tsx tests/lib/offline/clientMessaging.test.ts` red-state=authored red-target=`components/offline/SavedCopyMarker.tsx:54` why=`the stub component renders nothing and posts nothing and postToWorker is a stub that throws, so the template, per-disposition post and purged-reload cases fail` ac=AC-2,AC-13 -->

**What is red and why:** the stub component returns `null` and the messaging stub throws.

**Files**

```text
create  components/offline/SavedCopyMarker.tsx
create  lib/offline/client/messaging.ts
create  tests/components/offline/savedCopyMarker.test.tsx
create  tests/lib/offline/clientMessaging.test.ts
```

**GREEN:** a `"use client"` component taking a `Marker` and rendering `<template {...markerAttributes(marker)} />`. On mount it waits for `navigator.serviceWorker.ready` (not `controller`, so a hard-reloaded uncontrolled page still reaches an existing registration; `ready` never resolves without one, which is harmless) and posts: `purge` with `showId` and `location.pathname`; `check` with the path, reloading only on an `ended` reply; nothing for `keep`, `hold` and `save` (§1 item 5). It also listens for `purged` messages and reloads when the message's `showId` equals its own (§1 item 6). `postToWorker(message, { timeoutMs })` sends over a `MessageChannel` and resolves with the reply or `{ outcome: "timeout" }`. Absent `navigator.serviceWorker`: renders the template and does nothing else.

**Cases:** the rendered template round-trips through `readMarker` (Task 2) for all five dispositions; exactly one `purge` post per mount with the right show id or null; `check` reloads on `ended` and not on `gone`/`kept`; `purged` for another show does not reload; no post at all for `keep`, `hold`, `save`; nothing throws without `navigator.serviceWorker`; `postToWorker` times out at the given bound (fake timers).

**Commit:** `feat(crew-page): saved-copy marker component`

### Task 17: `<SavedCopySlot>`, the server marker helpers, and the server-built asset list

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopySlot.test.tsx tests/lib/offline/assetList.test.ts tests/lib/offline/serverMarkers.test.ts` red-state=authored red-target=`components/offline/SavedCopySlot.tsx:63` why=`the stub slot renders no marker and savedCopyAssetUrls and the marker helpers are stubs that throw, so the disposition-per-viewer cases, the fallback cases and the Gallery comparison case fail` ac=AC-5,AC-13 -->

**What is red and why:** the stub slot renders nothing; the asset-list and marker-helper stubs throw.

**Files**

```text
create  components/offline/SavedCopySlot.tsx
create  lib/offline/assetList.ts
create  lib/offline/serverMarkers.ts
create  tests/components/offline/savedCopySlot.test.tsx
create  tests/lib/offline/assetList.test.ts
create  tests/lib/offline/serverMarkers.test.ts
```

**GREEN, the marker helpers (§1 item 14):** `saveMarkerFor({ showId, crewMemberId, epoch, renderedAt, assets })`, `keepMarkerFor(showId, crewMemberId)` and `purgeMarkerFor(showId | null)`, each returning a `Marker` (Task 2). `save` and `keep` call the viewer-key helper and fall back to `purge` naming the show when it returns null or when `epoch` is not a non-negative integer (fail closed). Every server-rendered marker that needs a key is built here, so `page.tsx`, `_CrewShell.tsx` and the slot never call the viewer-key helper themselves.

**GREEN, the asset list:** `savedCopyAssetUrls(showId, data)` builds the diagram URLs with the very functions the crew components use, `makeDiagramLoader` (`lib/images/diagramLoader.ts:112`) and `diagramAssetKeyFromPath`/`isAllowedDiagramMime` (`lib/data/diagrams.ts:72`, `lib/data/diagrams.ts:38`), over `resolveCurrentDiagrams` output: for every available item, the original (`pinOriginal`, which the lightbox requests) plus the loader's URL at every width Next can put in a `srcset` (the configured device and image sizes), de-duplicated. Agenda URLs are `/api/asset/agenda/<showId>/<fileId>` for each `data.show.agenda_links` entry with a `fileId`, the same shape `components/agenda/AgendaEmbed.tsx:97` builds.

**Comparison test (the spec's "a test that renders both and compares"):** render `DiagramsTile` (`components/crew/DiagramsBlock.tsx:112`) in jsdom with a fixture carrying embedded and linked items with variant ladders (`makeShowForViewer`, `tests/fixtures/showForViewer.ts:164`), collect every URL from `src` and `srcset` attributes, and assert each is in `savedCopyAssetUrls`; premise that the render produced at least one `srcset` with two or more candidates, so the comparison sees the variant ladder. The reverse direction (every listed URL is one the Gallery could request) is asserted against `makeDiagramLoader` output for the same items, since the lightbox original is not in the closed gallery's markup.

**GREEN, the slot:** a synchronous server component (no hooks, no `await`, no import of `@/lib/time/now`) taking `viewer`, `showId`, `data`, `slug`, `shareToken`, `renderedAt` and `epoch`. `_CrewShell.tsx` passes `renderedAt` from the `today` it already computes with `nowDate()` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:251`, the render-side clock `tests/show/page-today-uses-now-utility.test.ts` pins) and `epoch` from its new `savedCopyEpoch` prop (Task 18). For `viewer.kind === "crew"` it renders `saveMarkerFor` with those values and the asset list. For `admin` and `admin_preview` (the `staticPreview` caller passes an `admin_preview` viewer) it renders `purgeMarkerFor(showId)`. Tasks 20 and 25 add the bar and the registrar.

**Why synchronous.** Eight suites render `CrewShell` (most by calling `await CrewShell(props)`) and mount the result with Testing Library, which cannot mount an async child (`tests/components/crew/previewAsRoute.test.tsx:249` explains), and four of them mock `@/lib/time/now`, whose exports are `now` (`lib/time/now.ts:12`) and `nowDate` (`lib/time/now.ts:22`): three supply `{ nowDate }` alone (`tests/components/crew/crewShell.test.tsx:41`, `tests/components/crew/crewShellSections.test.tsx:36`, `tests/components/crew/previewAsRoute.test.tsx:111`), so `now()` is undefined there, and `tests/components/crew/crewShellStaticPreview.test.tsx:41` supplies both. A synchronous slot that takes its clock from `CrewShell` renders inside all of them unchanged; Task 18 lists them.

**Cases:** each viewer kind's disposition and attributes; an undefined `epoch` and a null key each fall back to purge naming the show; the slot is not an async function (`SavedCopySlot.constructor.name` is not `AsyncFunction`), so a later edit cannot quietly break the CrewShell render suites; the asset list in the marker equals `savedCopyAssetUrls` output; an agenda entry without `fileId` is not listed; each helper's fallback in isolation.

**Commit:** `feat(crew-page): saved-copy slot, server marker helpers and asset list`

### Task 18: `<TerminalFailure>` markers, the page arms, and `_CrewShell.tsx`

<!-- task: red=`pnpm exec vitest run tests/show/savedCopyMarkerArms.test.tsx` red-state=authored red-target=`components/auth/TerminalFailure.tsx:25` why=`TerminalFailure accepts no savedCopy prop and no arm passes one, and CrewShell renders no slot after Header, so every arm-to-disposition assertion finds no template element` ac=AC-13 -->

**What is red and why:** `components/auth/TerminalFailure.tsx:25` takes no marker prop, no arm in `page.tsx` passes one, and `_CrewShell.tsx` renders no slot, so the per-arm test finds no `#fxav-saved-copy` element anywhere.

**Files**

```text
edit    components/auth/TerminalFailure.tsx                 (optional savedCopy?: Marker, rendered as <SavedCopyMarker>)
edit    app/show/[slug]/[shareToken]/page.tsx               (one import line; sweep S1 dispositions at seven sites; savedCopyEpoch on the crew CrewShell)
edit    app/show/[slug]/[shareToken]/_CrewShell.tsx         (four edits, listed below)
create  tests/show/savedCopyMarkerArms.test.tsx
```

**GREEN, `page.tsx`:** one import line for the marker helpers (Task 17); the S1 disposition passed to each `<TerminalFailure>` at `app/show/[slug]/[shareToken]/page.tsx:111`, `app/show/[slug]/[shareToken]/page.tsx:150`, `app/show/[slug]/[shareToken]/page.tsx:161`, `app/show/[slug]/[shareToken]/page.tsx:222`, `app/show/[slug]/[shareToken]/page.tsx:244`, `app/show/[slug]/[shareToken]/page.tsx:282`, `app/show/[slug]/[shareToken]/page.tsx:341`, where the `keep` at line 282 is `keepMarkerFor(result.showId, result.crewMemberId)`; and `savedCopyEpoch={result.pickerEpoch}` on the crew `<CrewShell>` at `app/show/[slug]/[shareToken]/page.tsx:306`.

**GREEN, `_CrewShell.tsx`, every edit:**
1. Two import lines: `SavedCopySlot`, and `keepMarkerFor`/`purgeMarkerFor`.
2. `CrewShellProps` (`app/show/[slug]/[shareToken]/_CrewShell.tsx:114`) gains `savedCopyEpoch?: number`, and the destructure at `app/show/[slug]/[shareToken]/_CrewShell.tsx:156` gains `shareToken` (declared at `app/show/[slug]/[shareToken]/_CrewShell.tsx:129` but not destructured today) and `savedCopyEpoch`.
3. The slot line after the `<Header>` element closes at `app/show/[slug]/[shareToken]/_CrewShell.tsx:517`, passing `renderedAt={today.toISOString()}` (the `today` from `app/show/[slug]/[shareToken]/_CrewShell.tsx:251`) and `epoch={savedCopyEpoch}`.
4. The catch at `app/show/[slug]/[shareToken]/_CrewShell.tsx:236` split into three returns: `MalformedProjectionError` with `viewer.kind === "crew"` passes `keepMarkerFor(showId, viewer.crewMemberId)`; `MalformedProjectionError` for any other viewer passes `purgeMarkerFor(showId)`; `UnmatchedViewerError` passes `purgeMarkerFor(showId)` (§4.3).

Edits 3 and 4 are the two behavioral changes §8 names; edits 1 and 2 are the imports, prop and destructure they need. The helpers deliberately do not bring a function named `viewerKey` into this file: `CrewShell` declares `const viewerKey` at `app/show/[slug]/[shareToken]/_CrewShell.tsx:362`, which would shadow such an import for the whole function body and make the catch at line 236 a TS2448 use-before-declaration error. The epoch travels as its own prop rather than on the crew `Viewer`, because that union's exact shape is pinned (`tests/data/getShowForViewer.test.ts:240`) and so is the viewer the page passes (`tests/show/resolvedArmCrewMembersGuard.test.tsx:116`).

**Every existing suite this touches, swept at plan time** (`grep -rln "await CrewShell(\|<CrewShell" tests`, plus the suites that render the route page; then `grep -rln 'vi.mock("@/lib/time/now"' tests`):
- Suites that render `CrewShell` and mount it: `tests/components/crew/crewShell.test.tsx`, `tests/components/crew/crewShellAlert.test.tsx`, `tests/components/crew/crewShellSections.test.tsx`, `tests/components/crew/crewShellStaticPreview.test.tsx`, `tests/components/crew/crewShellSweep.test.tsx`, `tests/components/crew/crewShellTwoDistinctAlerts.test.tsx`, `tests/components/crew/previewAsRoute.test.tsx`, `tests/show/crewShellUnmatchedViewer.test.tsx`. No edit: the slot is synchronous (Task 17), its client children do nothing without `navigator.serviceWorker` (jsdom has none), and the viewer-key helper finds the test key `tests/setup.ts:37` sets. A crew render without `savedCopyEpoch` gets a purge marker, which these suites do not inspect. None asserts the shell's child count or a snapshot (plan-time grep for `toMatchSnapshot`, `childElementCount`, `.children` over them: no hits in a CrewShell assertion).
- Suites that mock `@/lib/time/now` (`crewShell`, `crewShellSections`, `crewShellStaticPreview`, `previewAsRoute`): no edit, because the slot takes `renderedAt` from `CrewShell` and imports nothing from that module.
- Suites that render the route page: `tests/show/flow8Repick.test.tsx`, `tests/show/resolvedArmCrewMembersGuard.test.tsx` (its mock edit is in Task 14; its viewer assertion at line 116 stays valid because `Viewer` is unchanged), `tests/admin/stagedPreviewRoute.test.tsx`. No further edit.
- `tests/data/getShowForViewer.test.ts:240`: no edit, `Viewer` unchanged.

**Then:** run that whole list scoped, `pnpm exec vitest run tests/components/crew/crewShell.test.tsx tests/components/crew/crewShellAlert.test.tsx tests/components/crew/crewShellSections.test.tsx tests/components/crew/crewShellStaticPreview.test.tsx tests/components/crew/crewShellSweep.test.tsx tests/components/crew/crewShellTwoDistinctAlerts.test.tsx tests/components/crew/previewAsRoute.test.tsx tests/show/crewShellUnmatchedViewer.test.tsx tests/show/flow8Repick.test.tsx tests/show/resolvedArmCrewMembersGuard.test.tsx tests/admin/stagedPreviewRoute.test.tsx tests/data/getShowForViewer.test.ts tests/show/page-today-uses-now-utility.test.ts`.

**Cases:** one per arm with `resolveShowPageAccess` and `getShowForViewer` mocked, following `tests/show/flow8Repick.test.tsx`; each asserts the disposition, the show id (present or absent as S1 says) and, for each `keep`, that `data-viewer` equals the viewer key for that crew member. The `resolved` happy path asserts the `save` marker's `data-epoch` equals the mocked `pickerEpoch`. The three `_CrewShell.tsx` catch branches each have a case (crew malformed, `admin_preview` malformed, unmatched).

**Commit:** `feat(crew-page): markers on every TerminalFailure and the crew shell`

### Task 19: Markers on the sibling surfaces and a structural coverage guard

<!-- task: red=`pnpm exec vitest run tests/show/savedCopyMarkerCoverage.test.ts tests/show/savedCopySiblingMarkers.test.tsx` red-state=authored red-target=`app/show/[slug]/[shareToken]/ShowUnavailable.tsx:20` why=`ShowUnavailable, not-found, error, the picker and the sign-in gate render no SavedCopyMarker, so the AST coverage walk lists all five as uncovered and each render case finds no template` ac=AC-13 -->

**What is red and why:** none of the five sibling surfaces renders a marker; `ShowUnavailable` at `app/show/[slug]/[shareToken]/ShowUnavailable.tsx:20` takes no props at all.

**Files**

```text
edit    app/show/[slug]/[shareToken]/ShowUnavailable.tsx      (showId prop; purge marker; header comment updated)
edit    app/show/[slug]/[shareToken]/not-found.tsx            (check marker, no show id)
edit    app/show/[slug]/[shareToken]/error.tsx                (hold marker, no show id)
edit    app/show/[slug]/[shareToken]/_PickerInterstitial.tsx  (purge marker naming showId)
edit    app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx    (purge marker naming showId)
edit    app/show/[slug]/[shareToken]/page.tsx                 (pass showId to both ShowUnavailable sites)
create  tests/show/savedCopyMarkerCoverage.test.ts
create  tests/show/savedCopySiblingMarkers.test.tsx
```

The two `ShowUnavailable` render sites are `app/show/[slug]/[shareToken]/page.tsx:172` (raced crew miss, `args.showId`) and `app/show/[slug]/[shareToken]/page.tsx:211` (the `unpublished` arm, `result.showId` from Task 14). The header comment of `ShowUnavailable.tsx` says it "Deliberately takes NO props"; it is rewritten to say it takes only the show id, which reaches the page solely as the marker's `data-show-id` (an opaque UUID the token holder already resolved), and still renders no show data.

**Coverage guard:** walks every `.tsx` under `app/show/[slug]/[shareToken]/` with the TypeScript AST (not a regex), and asserts: every `TerminalFailure` JSX element has a `savedCopy` attribute; each of `ShowUnavailable.tsx`, `not-found.tsx`, `error.tsx`, `_PickerInterstitial.tsx`, `_SignInOrSkipGate.tsx` renders a `SavedCopyMarker` element; `_CrewShell.tsx` renders `SavedCopySlot` exactly once. Premise: the walk saw at least ten `TerminalFailure` elements (sweep S1 after Task 18) and found `page.tsx`, so a broken walk cannot pass by seeing nothing.

**Existing suites that render these surfaces directly** (plan-time grep): `PickerInterstitial` in `tests/show/pickerAffordance.test.tsx` and `tests/components/PickerInterstitial.test.tsx:60`; `SignInOrSkipGate` in `tests/components/SignInOrSkipGate.test.tsx:35` and `tests/components/SignInOrSkipGateCopySource.test.tsx:34`; the not-found page in `tests/show/crewLinkNotFound.test.tsx:44`; `error.tsx` in `tests/observe/crewError.test.tsx:20` and `tests/observe/errorBoundaryLayout.test.tsx:13`. None needs an edit: the marker adds a `<template>` with no text content and posts nothing without `navigator.serviceWorker`, and none of these suites compares whole-container markup (the `outerHTML` check at `tests/components/PickerInterstitial.test.tsx:168` reads only the banner, and `tests/components/SignInOrSkipGate.test.tsx:143` checks only that crew names are absent). No test renders `ShowUnavailable` directly, so its new required `showId` prop breaks only the two page call sites this task edits.

**Then:** `pnpm exec vitest run tests/show/pickerAffordance.test.tsx tests/components/PickerInterstitial.test.tsx tests/components/SignInOrSkipGate.test.tsx tests/components/SignInOrSkipGateCopySource.test.tsx tests/show/crewLinkNotFound.test.tsx tests/observe/crewError.test.tsx tests/observe/errorBoundaryLayout.test.tsx tests/show/showUnavailablePaused.test.tsx tests/show/flow8Repick.test.tsx`.

**Render cases:** each sibling renders its disposition and show id per the §4.3 table; the picker's marker is present on first render (its mount purge is the first half of the "picking a name" transition).

**Mutation families for the guard (closed set, §9 below):** attribute removed from one `TerminalFailure`; marker removed from one sibling; a new `TerminalFailure` added without the attribute; the walk root renamed.

**Commit:** `feat(crew-page): markers on every crew-route surface with a coverage guard`

### Task 20: `<SavedCopyBar>` rendering, hydration and contrast rows

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyBar.test.tsx tests/styles/savedCopyBarContrast.test.ts` red-state=authored red-target=`components/offline/SavedCopyBar.tsx:236` why=`the stub bar renders nothing and never marks html as mounted, and DESIGN.md section 1.2 has no matching row for any of the four bar pairs, so the per-state DOM cases, the hydration case and the DESIGN.md row-pin cases fail` ac=AC-7 -->

**What is red and why:** the stub returns `null` and never sets `data-fxav-bar`, so the DOM and hydration cases fail. The contrast test has two halves. The computed half reads the live hex values from `app/globals.css` and asserts each bar pair clears 4.5:1; those pairs already pass today, so that half is a regression pin with a premise that every hex value parsed. The red half pins `DESIGN.md`: for each bar pair it requires a §1.2 row whose stated light and dark ratios are within 0.05 of the computed ones, and none of the four has one today (Q4).

**Files**

```text
create  components/offline/SavedCopyBar.tsx
create  lib/offline/client/online.ts            (useOnlineStatus, shared with AvatarMenu in Task 23)
create  tests/components/offline/savedCopyBar.test.tsx
create  tests/styles/savedCopyBarContrast.test.ts
edit    components/offline/SavedCopySlot.tsx    (render the bar for crew viewers)
edit    DESIGN.md                                (section 1.2 rows added and corrected; the warning-text token row corrected)
```

**GREEN, the component:** a `"use client"` component with props `renderedAt`, `sheetUnavailable`, `slug`, `shareToken`. **It hydrates in exactly the state the server rendered, which is always `hidden`:** the server never sees the `fxav-served` meta (the worker injects it into stored HTML) and cannot know the phone's connection, so the first client render must not read either. The meta and the age are read in a mount effect, and `navigator.onLine` through a shared hook, `useOnlineStatus()` in lib/offline/client/online.ts, built on `useSyncExternalStore` with a server snapshot of online (Task 23 reuses it), so the saved state appears on the first commit after hydration, and until then the injected CSS notice is what the person sees (§4.7.1). After mounting it sets `data-fxav-bar="mounted"` on `document.documentElement`, tracks `online` from the `online`/`offline` events, re-evaluates age every 60 seconds, and renders `deriveBarView` (Task 4): nothing in `hidden`; otherwise one element `data-testid="saved-copy-bar"` with `role="status"`, `aria-live="polite"`, the tone classes, an `aria-hidden` icon carrying `data-testid="saved-copy-bar-icon"` (`WifiOff`, `Clock`, `TriangleAlert`, `RefreshCw`, `Check`, all verified exported by `lucide-react`), and the copy in `data-testid="saved-copy-bar-content"` with the lead in `<strong>`. The `updating` icon spins with `animate-spin motion-reduce:animate-none`, the repo's reduced-motion convention (`components/layout/Skeleton.tsx:19`). An unknown meta `content` reads as `offline`; no meta is `live`. Layout classes for the Dimensional Invariants are deliberately NOT added here; Task 26 adds them. Mode becomes `live` when `renderedAt` differs from its value at mount.

**GREEN, `DESIGN.md`** (values computed from the live tokens in `app/globals.css` at plan time; the test recomputes them):

| Pair | Light | Dark | Edit |
|---|---|---|---|
| `--color-text` on `--color-info-bg` | 14.8:1 (14.755) | 13.3:1 (13.280) | new §1.2 row |
| `--color-text` on `--color-stale-tint` | 14.7:1 (14.684) | 12.7:1 (12.679) | new §1.2 row |
| `--color-warning-text` on `--color-warning-bg` | 8.8:1 (8.792) | 9.6:1 (9.639) | new §1.2 row; also correct the token table at `DESIGN.md:38`, which says "Light 9.5:1, dark 9.2:1" |
| `--color-status-positive-text` on `--color-surface` | 6.7:1 (6.701) | 11.5:1 (11.526) | split the row at `DESIGN.md:169` ("on bg/surface", 6.4 / 12.3) into this row and an "on bg" row |
| `--color-status-positive-text` on `--color-bg` | 6.4:1 (6.416) | 12.2:1 (12.245) | the other half of that split; its dark figure is corrected from 12.3 |

**Contrast test** (reads the live hex values the way `tests/styles/status-token-contrast.test.ts:1` does): each of the four bar pairs (text on info-bg, text on stale-tint, warning-text on warning-bg, status-positive-text on surface) is at least 4.5:1 in both themes, and `DESIGN.md` §1.2 has a row for it whose two stated ratios are each within 0.05 of the computed value.

**Cases:** each state's DOM (role, live region, icon testid present and hidden, exact text from the content element); `hidden` renders no element but still sets the mounted attribute; no meta is `live`; meta `content="bogus"` is `offline`; `online` false on a live page shows the `No signal.` lead; the 60-second tick moves `saved-fresh` to `saved-old` across the 6-hour line (fake timers); `navigator.serviceWorker` absent changes nothing about rendering; the `updating` icon carries `animate-spin` and `motion-reduce:animate-none` and no other animation class, so it is static under reduced motion. **Hydration case:** render the bar to a string with `react-dom/server` (premise: the markup holds no bar element), place it in a document whose head carries `<meta name="fxav-served" content="offline" data-saved-at="2026-10-27T11:30:00.000Z">` with the clock faked at `2026-10-27T12:00:00.000Z` (Task 8 always injects `data-saved-at`), `hydrateRoot` it with `console.error` spied, and assert no hydration error is logged and that after effects flush the bar shows `saved-fresh` with the `No signal.` lead and `(30 min ago)`. **Hook hydration case:** a probe component renders `useOnlineStatus() ? "on" : "off"`; render it to a string with `react-dom/server` (it reads `on`), then hydrate that markup with `navigator.onLine` stubbed false and `console.error` spied: no hydration error is logged, and after effects flush the probe reads `off`. A hook that read `navigator.onLine` in its first client render would log a mismatch here, so the case discriminates. Four string mutants, including "content present but not live" (the lead inside an `aria-hidden` span must fail the accessible-name assertion).

**Commit:** `feat(crew-page): saved-copy bar`

### Task 21: Coming back online, purge reloads, and the section in the URL

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyBarRecovery.test.tsx` red-state=authored red-target=`components/offline/SavedCopyBar.tsx:302` why=`the bar from Task 20 never probes, never sets the updating flag and never rewrites the s parameter, so every probe, reload and replaceState case fails` ac=AC-8 -->

**What is red and why:** Task 20's bar has no recovery logic.

**Files**

```text
edit    components/offline/SavedCopyBar.tsx
create  tests/components/offline/savedCopyBarRecovery.test.tsx
```

**GREEN (§4.7.3, §4.7.4):** in modes `offline`, `slow` and `server-error`, probe on `online`, on `fresh-ready` for this URL, and every 30 seconds while `navigator.onLine` is true, never two at once. Outcomes: `saved` shows `updating`, sets a `sessionStorage` flag, calls `location.reload()`; `purged` reloads at once; `ended` shows `ended` without reloading; `failed` changes nothing. On mount, a set flag is consumed and drives `justUpdated` for 4 seconds. An RSC refresh during `updating` (mode becomes `live`) cancels the recovery. In a saved-copy mode, replace `s` in the URL with `data-active-section` from the `crew-shell-sections` wrapper (`components/crew/CrewSections.tsx:107`) via `history.replaceState`, leaving the URL alone when the attribute is absent.

**Cases:** each outcome; a `fresh-ready` message for this page's URL starts a probe and one for another URL does not; a second `online` event during a probe does not start a second probe; the 30-second timer stops when `navigator.onLine` turns false; the session flag is consumed exactly once; the age tick crossing 6 hours during `updating` keeps `updating`; RSC refresh during `updating` cancels; `replaceState` called with the rendered section and not called when the wrapper lacks the attribute.

**Commit:** `feat(crew-page): bar recovery when signal returns`

### Task 22: `<SavedCopyRegistrar>` and the two telemetry codes

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyRegistrar.test.tsx tests/components/offline/savedCopyRegistrarTelemetry.test.tsx` red-state=authored red-target=`components/offline/SavedCopyRegistrar.tsx:245` why=`the stub registrar does nothing, so the registration, persist-once, kill-switch, ensure-saved throttle and agenda prefetch cases fail, and the telemetry cases capture no request body to replay through the client-error route handler` ac=AC-10,AC-15,AC-5 -->

**What is red and why:** the stub component does nothing, so no registration call, no `persist`, no message and no client-error POST happens.

**Files**

```text
create  components/offline/SavedCopyRegistrar.tsx
create  tests/components/offline/savedCopyRegistrar.test.tsx
create  tests/components/offline/savedCopyRegistrarTelemetry.test.tsx
```

**GREEN:** props `renderedAt`, `disabled`, `hasAgenda`. When idle (`requestIdleCallback`, else `setTimeout` after `load`, since WebKit lacks the former): if `disabled`, unregister every registration and stop; otherwise register the /sw.js URL with `{ scope: "/", updateViaCache: "none" }` and call `navigator.storage.persist()` once per page load. Once a controller exists (`controller` or `controllerchange`), and only when the page is live (no `fxav-served` meta), post `ensure-saved` with `location.pathname` and `renderedAt`, again whenever `renderedAt` changes, at most once per 10 seconds. If `hasAgenda`, import the agenda viewer module (`components/agenda/AgendaPdfViewer.tsx`, the same specifier `components/agenda/AgendaEmbed.tsx:40` loads) and then `react-pdf`, and `fetch` the `pdfjs.GlobalWorkerOptions.workerSrc` that module set at `components/agenda/AgendaPdfViewer.tsx:47`. Registration failure logs `clientLog("warn", "client.crew", ..., undefined, "CREW_OFFLINE_SW_REGISTER_FAILED")` (`lib/observe/clientLog.ts:5`); a `save-failed` message logs `CREW_OFFLINE_SAVE_FAILED` the same way. `client.crew` is the source crew-page components already use (`components/crew/RightNowHero.tsx:425`) and is in the route's `ALLOWED_SOURCES` (`app/api/observe/client-error/route.ts:5`); any other source is refused with 400 at `app/api/observe/client-error/route.ts:92`. Neither code reaches the UI (invariant 5). The registrar is not yet mounted; Task 25 mounts it.

**Cases (registrar behavior):** registration options exact; `persist` called exactly once across three `renderedAt` changes and re-renders; `disabled` unregisters and never registers; no `ensure-saved` on a saved-copy page; one `ensure-saved` per `renderedAt` change with the 10-second throttle (fake timers); agenda prefetch only when `hasAgenda`; `navigator.serviceWorker` absent does nothing and throws nothing.

**Cases (telemetry through the real route, not a `clientLog` spy):** jsdom, with `@/lib/log` mocked the way `tests/observe/clientErrorRoute.test.ts:3` does, the transport's dedup reset (`lib/observe/clientErrorTransport.ts:28`) and global `fetch` stubbed to capture the POST the transport sends (`lib/observe/clientErrorTransport.ts:236`). Render the registrar with a rejecting `register`, take the captured body, wrap it in a same-origin `Request` built as `tests/observe/clientErrorRoute.test.ts:12` does, and pass it to `handleClientError` (`app/api/observe/client-error/route.ts:71`): the response is 202 and the mocked `log.warn` received `code: "CREW_OFFLINE_SW_REGISTER_FAILED"` and `source: "client.crew"`. The same for a `save-failed` message and `CREW_OFFLINE_SAVE_FAILED`. Pre-dispatch mutant (record in the commit): change the source to `client.offline` and observe a 400 and the case failing.

**Commit:** `feat(crew-page): service worker registrar`

### Task 23: AvatarMenu purge bracket and "Needs signal"

<!-- task: red=`pnpm exec vitest run tests/components/auth/avatarMenu.test.tsx tests/components/auth/avatarMenuTransitionAudit.test.ts tests/components/auth/avatarMenuSavedCopy.test.tsx` red-state=authored red-target=`components/auth/AvatarMenu.tsx:185` why=`clearAction is awaited here with no purge before or after it and the switch row ignores navigator.onLine, so the bracket-order, settle-purge and Needs-signal cases fail, and the transition audit fails once the new conditionals land without DECLARED rows` ac=AC-14 -->

**What is red and why:** `components/auth/AvatarMenu.tsx:185` awaits `clearAction(formData)` with no purge around it, and the switch row at `components/auth/AvatarMenu.tsx:487` to `components/auth/AvatarMenu.tsx:513` never reads `navigator.onLine`.

**Files**

```text
edit    components/auth/AvatarMenu.tsx
edit    tests/components/auth/avatarMenuTransitionAudit.test.ts   (one DECLARED row per new conditional)
create  tests/components/auth/avatarMenuSavedCopy.test.tsx
```

**GREEN:** in `onSwitchSubmit` (`components/auth/AvatarMenu.tsx:180`), before `clearAction`, `await postToWorker({ type: "purge-show", showId }, { timeoutMs: 500 })`; after the action settles, success, typed failure, or a thrown error (including a redirect that `unstable_rethrow` rethrows), post `purge-show` again, without awaiting, before the rethrow. While offline, the switch row stays focusable with `aria-disabled="true"`, its visible label reads `Needs signal` instead of `Not you? Switch person`, its `aria-label` (today `Switch crew member` at `components/auth/AvatarMenu.tsx:489`, which replaces the visible text for assistive technology) becomes `Switch crew member, needs signal` so the accessible name says why and contains the visible words, the online state is read after mount (`useSyncExternalStore` over `navigator.onLine` and the `online`/`offline` events, with a server snapshot of online), so a menu hydrating on a saved copy served with no signal first renders exactly the server's online markup and switches to `Needs signal` on the next commit, and activation is blocked the same way the busy phase blocks it (the comment at `components/auth/AvatarMenu.tsx:491` explains why both statements are needed). No other visible change.

**Cases:** order of calls (purge, then action, then purge) with a delayed ack; a missing ack proceeds after 500 ms; the second purge runs on success, on a `{ ok: false }` result and on a thrown redirect; offline shows `Needs signal`, the row is found by `getByRole("menuitem", { name: /needs signal/i })` and carries `aria-disabled="true"`, and a click does not call `clearAction`; going back online restores both the visible label and the accessible name `Switch crew member`; the offline cases open the menu first (click `avatar-menu-trigger`), because the switch row renders only while the menu is open (`components/auth/AvatarMenu.tsx:374`, and `open` starts false at `components/auth/AvatarMenu.tsx:109`); for the same reason a closed menu cannot mismatch on that row during hydration, so the hydration guarantee is tested once, on the shared `useOnlineStatus` hook (Task 20), and here the case asserts the menu reads offline through that hook (a stub of the hook returning false yields the `Needs signal` row once opened). The existing AvatarMenu suites (`tests/components/auth/avatarMenu.test.tsx`, `tests/components/IdentityChip.test.tsx`, `tests/components/identityChipSrSeparator.test.tsx`) run with jsdom's `navigator.onLine` true and need no edit; the transition audit gains its rows as stated above. The audit bijection gains exactly the new conditionals, each with treatment "instant: label swap, no animation".

**Commit:** `feat(auth): purge saved copies around Not you and disable it offline`

### Task 24: E2E proxy and lifecycle helpers

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/crewOfflineProxy.unit.test.ts` red-state=authored red-target=`tests/e2e/helpers/crewOfflineProxy.ts:142` why=`startCrewOfflineProxy is a stub that throws, so the pass, refuse, hang, release, selective-refuse and stub cases all fail on the throw` ac=AC-16 -->

**What is red and why:** the proxy stub throws.

**Files**

```text
create  tests/e2e/helpers/crewOfflineProxy.ts
create  tests/e2e/helpers/crewOfflineProxy.unit.test.ts
create  tests/e2e/helpers/crewOfflineLifecycle.ts
create  tests/e2e/helpers/savedCopyProbe.ts
create  tests/e2e/fixtures/agenda-fixture.pdf    (a one-page PDF of a few hundred bytes)
```

**Interface:**

```ts
export type ProxyMode = "pass" | "refuse" | "hang";

export type ProxiedRequest = {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
};

export type CrewOfflineProxy = {
  /** http://127.0.0.1:<port>; Chromium treats loopback http as a secure context. */
  httpOrigin: string;
  /** https://127.0.0.1:<port> with a throwaway self-signed certificate (WebKit). */
  httpsOrigin: string;
  /** PEM of the throwaway certificate, so a test client can trust it instead of disabling checks. */
  caPem: string;
  setMode(mode: ProxyMode): void;
  /** In "pass" mode, refuse only the requests this predicate matches; null clears it. */
  refuseMatching(match: ((req: ProxiedRequest) => boolean) | null): void;
  /** Answer GET requests under this path prefix locally instead of forwarding, with extra response headers. */
  stub(pathPrefix: string, body: Buffer, contentType: string, headers?: Record<string, string>): void;
  close(): Promise<void>;
};

export async function startCrewOfflineProxy(opts: {
  upstreamPort: number;
}): Promise<CrewOfflineProxy> {
  void opts;
  throw new Error("unimplemented");
}
```

**GREEN:** one `http` and one `https` listener on ephemeral ports (port 0), both forwarding to 127.0.0.1 on the upstream port with the `Host` header kept (the test-auth endpoint allowlists 127.0.0.1 with any port) and `x-forwarded-proto` set on the HTTPS side, as the spike's tlsproxy.mjs did. The certificate is generated per run with `openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1 -addext subjectAltName=IP:127.0.0.1` (the IP SAN is what lets a verifying client accept it) into a `mkdtemp` directory, so no key is committed; WebKit accepts it through the context's `ignoreHTTPSErrors`, which applies to this loopback test origin only. Modes: `pass` forwards; `refuse` destroys the client socket on each request (the browser sees a network error, not a 502); `hang` accepts and holds the request. Every mode change destroys idle keep-alive sockets so the browser opens a new connection under the new mode; a change from `hang` to `pass` forwards the held requests upstream, which lets the worker's step-5 continuation complete. In `pass` mode, `refuseMatching` refuses only the requests its predicate matches (Task 25 uses it to fail a Server Action, which carries a `next-action` header, while every page load still passes); `stub` answers matching `GET`s locally with the given content type plus any extra `headers` (Task 25 case 11 passes `{ "cache-control": "no-store" }`).

The lifecycle helper exposes `archiveShow`, `unpublishShow`, `rotateShareToken` and `readShareToken`, each one `psql` call through `resolvePsqlTarget` and `psqlChildEnv` (`tests/e2e/helpers/psqlTarget.ts:145`, `tests/e2e/helpers/psqlTarget.ts:274`) that sets `role authenticated` and the admin claims literal used by `tests/db/_holdsHelpers.ts:41`, then calls the admin RPC, which takes the per-show lock and publishes the realtime invalidation itself. `archive_show` has no published precondition (`supabase/migrations/20260801000000_lifecycle_rpc_performed_discriminator.sql:21`), so an unpublished show can be archived, which Task 25 case 13 needs. The probe helper exposes document-level functions (`waitForCrewHydrated`, `waitForWorkerControl`, `waitForSavedCopy(page, { showId, url })`, `readSavedCopies`, `poisonStaticScripts`) that read IndexedDB and Cache Storage through `page.evaluate` with the names from the worker's schema module.

**Unit cases:** pass forwards status, headers and body; refuse makes a Node client see `ECONNRESET` or `socket hang up`; hang does not answer within 500 ms; hang then pass completes the held request; `refuseMatching` on `POST` requests with a `next-action` header refuses exactly those while a `GET` on the same connection pool passes, and `null` clears it; a stub answers without contacting upstream (upstream spy); a stub given `{ "cache-control": "no-store" }` answers with exactly that header and the given content type, and one given no headers sends no `cache-control` at all; the HTTPS listener answers a client that passes `caPem` as its `ca`, so the test never disables verification.

**Commit:** `test(e2e): offline proxy and lifecycle helpers`

### Task 25: Real-browser offline cases; mount the registrar

<!-- task: red=`CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test --project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline.spec.ts tests/e2e/crew-offline-realtime.spec.ts` red-state=authored red-target=`components/offline/SavedCopySlot.tsx:90` why=`the slot does not yet render SavedCopyRegistrar, so no page ever registers the worker and every case times out in the worker-control readiness gate with an explicit message` ac=AC-16,AC-3,AC-6 -->

**What is red and why:** the registrar exists (Task 22) but nothing mounts it, so the readiness gate that waits for `navigator.serviceWorker.controller` times out in every case, with a message naming the gate.

**Files**

```text
edit    components/offline/SavedCopySlot.tsx      (render <SavedCopyRegistrar disabled={crewOfflineDisabled(process.env)} ...> for crew viewers)
edit    tests/components/offline/savedCopySlot.test.tsx   (registrar present for crew only; disabled flag passed through)
edit    playwright.config.ts                       (projects crew-offline-chromium and crew-offline-webkit)
create  tests/e2e/helpers/crewOfflineFixture.ts
create  tests/e2e/crew-offline.spec.ts
create  tests/e2e/crew-offline-realtime.spec.ts
```

**Projects (added to the `projects` array at `playwright.config.ts:57`):** `crew-offline-chromium` (`devices["Desktop Chrome"]`, viewport 390x844, `testMatch: /crew-offline(-layout|-realtime)?\.spec\.ts/`) and `crew-offline-webkit` (`devices["iPhone 14"]`, viewport 390x844, `ignoreHTTPSErrors: true`, `testMatch: /crew-offline(-layout)?\.spec\.ts/`). Both spec files take `test` from a helper fixture module (the `base.extend` precedent is `tests/e2e/helpers/fontFidelityFixture.ts:271`) that starts the proxy once per worker and gives every case an `origin`: `httpOrigin` under Chromium, `httpsOrigin` under WebKit, chosen from Playwright's `browserName` fixture inside the helper. Cases navigate to that origin, never to the inherited `baseURL`. The engine choice lives in the helper because the CI wiring guard reads each enrolled spec's source and, for a spec with no PROJECT_GATED row, rejects any `project`, `testInfo`, `test.info(` or `browserName` in it, test titles and other strings included, since only comments are stripped before the scan (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:596`); the specs also contain no `.fail(`, no early return in a test body and no case whose assertions are all conditional, so every case asserts under both engines. Before adding them, re-run sweep S5 with the realtime file name included and paste the result in the commit body.

**Harness readiness checklist (writing-plans, mandatory):**
- (a) Server: the baseline webServer on `E2E_PORT` in production mode (`CI=1` makes it `pnpm build && pnpm start -H 127.0.0.1`, `playwright.config.ts:264`), alone (`CREW_E2E_ONLY=1`, `playwright.config.ts:476`). `beforeAll` throws when `process.env.CI` is unset, then fetches the /sw.js URL through the proxy and requires its body to equal the committed `SW_SOURCE`, so a stale or foreign server on the port fails loudly instead of testing other code.
- (b) Readiness before the first assertion of every case: `crew-shell` visible, `html[data-fxav-bar="mounted"]` present (the bar's own hydration signal), `navigator.serviceWorker.controller` non-null, and for saving cases `waitForSavedCopy` resolving with the expected show id and URL. Never `networkidle`.
- (c) Detach safety: every sampler is document-level (`page.evaluate`, `page.waitForFunction`) and re-acquired after each reload; no `locator.evaluate` is held across a navigation.
- Contexts: one new ephemeral context per case (`browser.newContext()`), never `launchPersistentContext` (spike: WebKit persistent contexts lose Cache Storage); never `context.setOffline` (spike M1).
- Identity: drive the picker at `?gate=skip` and click the roster row, as `tests/e2e/picker-flow.spec.ts:292` does. Google identity and the admin view go through `signInAs` (`tests/e2e/helpers/signInAs.ts:43`) **with `{ baseUrl: origin }`** (`tests/e2e/helpers/signInAs.ts:40`), where `origin` is the proxy origin of the case: without it the request resolves against the project `baseURL` (`playwright.config.ts:53`, a `localhost` host) and the Supabase cookies are scoped to a host the proxied pages never send them to. `NON_ADMIN_CREW_FIXTURE` is on the seeded roster for the Google cases; `ADMIN_FIXTURE` (`tests/e2e/helpers/fixtures.ts:25`) for the admin view.
- Data: `seedShowWithCrew` per case (`tests/e2e/helpers/seedShowWithCrew.ts:234`) and `deleteSeededShow` in `afterEach`; the diagram case reads the db:seed Waldorf show read-only.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**`tests/e2e/crew-offline.spec.ts` (both engines):**
1. First visit is saved, then an offline reload shows full content, a working tab switch and the bar: pick, wait saved, `refuse`, reload; `crew-shell` visible, bar text starts `No signal. Showing your saved copy from`, Venue tab shows `section-venue`, the avatar menu opens; the seeded diagrams render from stored assets (Waldorf show); the font is checked in the worker's Cache Storage, not through `document.fonts`, because the browser's HTTP cache holds `/fonts/**` as immutable for a year (`next.config.ts:134`) and could satisfy the page whatever the worker did: right after the first visit's save, before any further navigation, the worker's static cache holds the URL of the font preload link (`components/FontPreload.tsx:27`); the page fetched the font and its chunks while loading, before the worker activated, so none of those fetches reached the worker; the worker then claims the page (readiness gate b waits for that), and the registrar's `ensure-saved` runs the save whose completeness step is what stores them. No assertion in this case expects a null controller. In the same window, every `/_next/static/**` URL the saved HTML references is in that cache too, for the same reason: the browser's HTTP cache would hide a missing chunk during the offline reload.
2. Hang shows `slow`, then updates by itself: `hang`, reload; the bar reads `Slow connection.` after at least 8 seconds; `pass` releases the held request; the bar passes through `updating` to `Updated. You're on the latest version.` and then disappears.
3. Archive keeps the copy with the ended bar: `archiveShow`, reload online; `This show has ended.`; `refuse`, reload; still ended.
4. Reset wipes: `rotateShareToken`, reload the old link online (not-found, check, status `gone`); no copy for the show; `refuse`, reload; the not-saved heading.
5. Unpublish wipes: `unpublishShow`, reload (paused page, purge); `refuse`, reload; the not-saved heading.
6. "Not you?" wipes: open the avatar menu, switch; no copy; `refuse`, reload; the not-saved heading. (The picker's mount purge also runs here, so this case alone cannot show the AvatarMenu bracket works; case 7 does.)
7. The AvatarMenu bracket purges on its own: `refuseMatching` for `POST` requests carrying a `next-action` header, open the avatar menu, switch; `avatar-menu-switch-error` appears and the crew shell stays on screen, so no page render could have purged; the copy is gone anyway (only the two `purge-show` posts could remove it); clear the predicate, `refuse`, reload; the not-saved heading.
8. Sign-out wipes: Google identity, visit (bootstrap, resolved, saved), `/me`, submit `me-sign-out-form`; no copy; `refuse`, reload the show link; the not-saved heading.
9. An admin view wipes: save as crew, `signInAs(page, ADMIN_FIXTURE, { baseUrl: origin })` in the same context, reload online; no copy.
10. The not-saved page with no copy: save show A, `refuse`, open show B's link; the three strings; dispatch `online` with the proxy back in `pass`; the real page loads.
11. An unopened agenda opens offline: `stub("/api/asset/agenda/", fixturePdf, "application/pdf", { "cache-control": "no-store" })`, so the browser's HTTP cache can never answer for it and only the worker's asset cache can; visit without opening the agenda; wait until the saved copy lists the agenda URL and the static cache holds the pdf.js worker; `refuse`, reload; Schedule tab, `View agenda`; `agenda-active-page` reads `1`.
12. JavaScript failing to load still shows the CSS notice: save; then, from the page, `poisonStaticScripts` overwrites every `/_next/static/**` script entry in the worker's static Cache Storage with a body that sets `self.__fxavScriptBlocked = true` and throws. Deleting the entries would not work: the worker would refetch on a miss, and the browser's HTTP cache, which holds these hashed URLs as immutable, would answer even with the proxy refusing. `refuse`, reload; premise, stated before the assertion: `window.__fxavScriptBlocked === true`, which proves the page ran the poisoned entries, so the case cannot pass on a page that got its real scripts from another cache; then `getComputedStyle(document.body, "::before").content` contains `Saved copy from` and `html` lacks `data-fxav-bar`.
13. An unpublish the phone never saw still wipes an ended copy (R15): save, close the page, `unpublishShow`, then `archiveShow` (one epoch bump, so only `unpublished_at` can make the status route say `gone`), open the old link online in a new page (not-found, check, status `gone`); no copy; `refuse`, reload; the not-saved heading. Case 3 is the same sequence without the unpublish and keeps the copy, so the pair isolates R15.
14. The kill-switch worker removes itself and every saved copy in a real browser: save a copy, `stub` the /sw.js URL with `KILL_SWITCH_SOURCE` (imported from the kill-switch module, a plain string; nothing is bundled in `tests/e2e/`) served as `application/javascript`, call `registration.update()` from the page and wait until `navigator.serviceWorker.getRegistrations()` is empty; no Cache Storage name starting with `fxav-` remains and the saved-copy database is gone; `refuse`, reload; the navigation fails with a network error instead of serving anything. Task 12 covers the route's choice of source; this case covers what that source does.
15. Hydration is clean on a served copy: the console has no React hydration error (#418, #423, #425) and no `pageerror` across cases 1 and 3 (§4.7.1 "the plan proves that with the same hydration check").

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**`tests/e2e/crew-offline-realtime.spec.ts` (Chromium only, §1 item 10):** with the page open, a reset, an archive and an unpublish each arrive by realtime refresh; the copy is wiped (reset, unpublish) or marked ended (archive, followed by the reload the marker triggers and the ended bar); a following `refuse` reload shows the matching result.

**Commit:** `test(e2e): crew offline cases; mount the registrar`

### Task 26: Layout dimensions in a real browser

<!-- task: red=`CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test --project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline-layout.spec.ts` red-state=authored red-target=`components/offline/SavedCopyBar.tsx:444` why=`the bar carries no sticky, top or z-index class yet, so after scrolling past the header its top is far below the viewport top and the elementFromPoint check lands on section content` ac=AC-17 -->

**What is red and why:** Task 20 deliberately left the layout classes out. The sticky row and the z-index row are observed red (the bar scrolls away). The width, height and icon rows may already hold by CSS defaults (a flex column's default `align-items: normal` stretches); they are regression pins, each with its premise stated, and the commit body records which rows were red.

**Files**

```text
create  tests/e2e/crew-offline-layout.spec.ts
edit    components/offline/SavedCopyBar.tsx     (self-stretch flex-none sticky top-0 plus a z-index token class on the bar; flex-none on the icon)
```

**The spec's Dimensional Invariants, verbatim:**

| Parent to child | Relationship | Guaranteed by |
|---|---|---|
| `crew-shell` to `saved-copy-bar` | bar width equals shell width | `self-stretch` on the bar (Tailwind v4 does not default `.flex` to stretch) |
| `crew-shell` to `saved-copy-bar` | bar height is its content, never grows | `flex-none` on the bar |
| viewport to `saved-copy-bar` | bar top stays at the viewport top after scrolling past the header | `sticky top-0` plus a `z-index` above section content |
| `saved-copy-bar` to icon | icon keeps its size when the copy wraps | `flex-none` on the icon |

The spec takes `test` from the Task 25 helper fixture, so, like the other two enrolled specs, its source names no `project`, `testInfo`, `test.info(` or `browserName` (Task 28 enrols it).

**Assertions (both engines, saved copy served with `refuse`, 390x844), all through `getBoundingClientRect()` within 0.5 px:** bar width equals `crew-shell` width; bar height equals `saved-copy-bar-content` height plus the bar's vertical padding and borders read from computed style; after `scrollTo` past `page-header`'s bottom plus 200 px, bar top is 0 and `document.elementFromPoint` at the bar's centre is inside the bar; at 320 px width the content wraps (premise: content height exceeds one line height) and `saved-copy-bar-icon` keeps the size its class declares. The z-index class is an existing token (`app/globals.css:80` lists them), chosen above the sub-nav's `z-raised`.

**Commit:** `feat(crew-page): bar layout invariants pinned in a real browser`

### Task 27: Transition audit and the `updated` fade

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyBarTransitionAudit.test.ts tests/components/offline/savedCopyBarTransitions.test.tsx` red-state=authored red-target=`components/offline/SavedCopyBar.tsx:267` why=`updated still unmounts instantly when its 4-second window ends, so the fade-phase, reduced-motion and fade-cancel cases fail, and the bijection has no declared row for the fade conditional` ac=AC-18 -->

**What is red and why:** Task 20 ends `updated` instantly; the fade cases fail and the AST audit finds the bar's conditionals with no `DECLARED` row for the fade.

**Files**

```text
create  tests/components/offline/savedCopyBarTransitionAudit.test.ts
create  tests/components/offline/savedCopyBarTransitions.test.tsx
edit    components/offline/SavedCopyBar.tsx     (the fade on the duration-normal token, skipped under reduced motion)
```

**The spec's Transition Inventory, verbatim:**

| | saved-fresh | saved-old | ended | sheet-gone | sheet-gone-saved | updating | updated |
|---|---|---|---|---|---|---|---|
| **hidden** | I | I | I | I | I | I | updated to hidden: F. Otherwise I |
| **saved-fresh** | | I | I | I | I | I | I |
| **saved-old** | | | I | I | I | I | I |
| **ended** | | | | I | I | I | I |
| **sheet-gone** | | | | | I | I | I |
| **sheet-gone-saved** | | | | | | I | I |
| **updating** | | | | | | | I (via reload) |

Key: **I** instant. **F** 200 ms fade, instant under reduced motion. Compound transitions: any input change during the `updated` fade cancels it and renders the new state instantly; the age tick crossing 6 hours while `updating` keeps `updating`; a second `online` event during a probe starts no second probe; an RSC refresh during `updating` cancels the recovery.

**Duration.** No 200 ms token exists; the motion tokens are 0, 120, 220 and 360 ms (`app/globals.css:284` to `app/globals.css:287`). The fade uses `duration-normal` (220 ms, `app/globals.css:286`), the nearest token, because the spec's figure is approximate and a literal would bypass the reduced-motion collapse that zeroes every duration token. The unmount fallback timer is 220 ms to match.

**GREEN:** when the 4-second window ends, the bar enters a fade phase (`opacity-0` with `transition-opacity duration-normal`) and unmounts on `transitionend` or after 220 ms; when `matchMedia("(prefers-reduced-motion: reduce)")` matches, it unmounts at once.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Audit (modelled on `tests/components/auth/avatarMenuTransitionAudit.test.ts:130`):** every ternary, `&&`, `||`, `if` and `switch` in `components/offline/SavedCopyBar.tsx` is claimed by exactly one `DECLARED` row with a treatment, and every row matches exactly one conditional; a premise that the census found a real population; no `transition` or `duration` class on any element except the fade. **Behavioral:** the 28 pairs are generated from the `BarState` union and each non-fade pair asserts the new state renders in the same commit with no transition class (instant); the fade pair asserts the intermediate faded frame then removal at 220 ms; reduced motion removes at once; the four compound transitions above.

**Commit:** `feat(crew-page): bar transition audit and updated fade`

### Task 28: Wire the offline specs into crew-e2e

<!-- task: red=`pnpm heavy pnpm exec vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` red-state=authored red-target=`.github/workflows/crew-e2e.yml:188` why=`the three offline specs are enrolled in ENROLLED and EXPECTED_SKIPS and all three exist after Tasks 25 and 26, but this run command names neither the specs nor the two offline projects, so expectWired fails for each enrolled spec` ac=AC-16 -->

**What is red and why:** this task runs last among the e2e tasks so that all three spec files exist and resolve tests under their projects (`expectWired` requires a `--list` count above zero, `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:790`). The RED step adds the three specs to `ENROLLED` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:283`) and `EXPECTED_SKIPS` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:161`, empty arrays, no static skips) before touching the workflow, so `expectWired` fails: no `playwright test` segment in `.github/workflows/crew-e2e.yml:188` names them. The command is wrapped in `pnpm heavy` because the test shells out to `playwright test --list` (AGENTS.md heavy-phase rule, transitive shape).

**Files**

```text
edit    .github/workflows/crew-e2e.yml                       (run command; timeout)
edit    tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
edit    scripts/check-crew-e2e-executed.mjs                  (REQUIRED rows)
```

**GREEN:** append `--project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline.spec.ts tests/e2e/crew-offline-realtime.spec.ts tests/e2e/crew-offline-layout.spec.ts` to the run command at `.github/workflows/crew-e2e.yml:188`. Add `REQUIRED` rows at `scripts/check-crew-e2e-executed.mjs:31` with each spec's full executable count, derived with `pnpm heavy pnpm exec playwright test --list --project=crew-offline-chromium --project=crew-offline-webkit <spec>` and pasted with that command in the comment, never typed from memory. Raise `timeout-minutes` at `.github/workflows/crew-e2e.yml:99` by the measured duration of the offline cases plus margin, recording the measurement. Then run, wrapped for the same reason, `pnpm heavy pnpm exec vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts tests/cross-cutting/workflowActivation.test.ts tests/cross-cutting/ci-workflow-speedup.test.ts`.

**Commit:** `infra: run the crew offline e2e in crew-e2e`

<!-- tasks: end -->

---

## 8. E2E commands, for reference

Local, production server, isolated port, only the baseline server booted:

```text
CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test \
  --project=crew-offline-chromium --project=crew-offline-webkit \
  tests/e2e/crew-offline.spec.ts tests/e2e/crew-offline-realtime.spec.ts tests/e2e/crew-offline-layout.spec.ts
```

`CI=1` also sets retries to 2 (`playwright.config.ts:51`); a case that passes only on retry is a finding, so grep the JSON report for `"status": "flaky"` after every run rather than trusting the exit code.

---

## 9. Mutation-family closure for the guards this plan ships

| Guard | Families (the closed set review converges against) |
|---|---|
| Crew-URL derivation (Task 1) | sibling directory added on disk; `NON_CREW_SEGMENTS` entry removed; trailing-slash rule inverted; bracket list widened to the picker bootstrap |
| Worker freshness (Task 11) | source edited without regeneration; generated file hand-edited; a server-only module imported into the bundle |
| Identity parity (Task 15) | route passes `current` instead of `saved`; admin check removed; one boundary input dropped from `resolveCrewIdentity`; a new outcome kind without a row |
| Marker coverage (Task 19) | `savedCopy` attribute removed from one site; marker removed from one sibling; new `TerminalFailure` added bare; walk root renamed |
| Transition audit (Task 27) | conditional added without a row; row left after its conditional is deleted; transition class added to an instant branch |

A reviewer-proposed family outside this set is admissible only with a live escaping mutant against the shipped guard.

---

## 10. Closeout

1. Full suite: `pnpm heavy pnpm test`.
2. `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
3. Audits: `pnpm test:audit:x2-no-raw-codes` (no raw code renders; the bar compares `sheet_unavailable` only inside lib/offline/barState.ts), `pnpm test:audit:x3-trust-domain`, `pnpm test:audit:validation-schema-parity`.
4. Worker freshness by regeneration: `pnpm gen:sw` followed by `git diff --exit-code` on the generated directory.
5. Registry counts: re-run the §2.1 pipeline and compare with 14, 14, 67, 5, 9, 13, 9, 6.
6. Every `red-target` with a line number in §7 is re-read and matched to the symbol its `why` names (line drift from this plan's own edits is the documented failure of that check).
7. E2E: the §8 command, then the whole crew-e2e set the workflow runs, under `pnpm heavy`, with `CI=1`.
8. `pnpm heavy pnpm build`.
9. Help screenshots: if the screenshots-drift job reds because crew pages now register a worker, investigate rather than regenerate; a local capture runs as `pnpm heavy pnpm screenshot:help` and is followed by `git restore public/help/screenshots/`.
10. The invariant-8 UI gate on the diff's UI surfaces: `components/offline/**`, `components/auth/AvatarMenu.tsx`, `components/auth/TerminalFailure.tsx`, every edited file under `app/show/[slug]/[shareToken]/`, app/sw.js/route.ts (under `app/` and outside `app/api/`, so it is in scope by path), and the `DESIGN.md` rows. P0 and P1 findings fixed or deferred with a `DEFERRED.md` entry. Findings and dispositions go in the handoff §12, and the closeout commit adds the machine-checkable closeout marker line. This plan carries neither.
11. Whole-diff cross-model review, split by surface (worker and lib; auth and status route; UI and e2e), each brief stating the consequence bound, the probe domain, the threat fence, REVIEWER ONLY, and the §9 families as the closed set.
12. Push, real CI green (all required checks), `gh pr merge --merge`, fast-forward local main, verify `git rev-list --left-right --count main...origin/main` is `0  0`, clear pane and agent labels.

---

## 11. Plan review gates

1. Self-review against `docs/agents/writing-plans.md` (every citation re-grepped, snippets re-typechecked).
2. Adversarial review (cross-model): Codex through `codex-guard` with `--stage plan`, to APPROVE.
3. Execution handoff.

## 12. Gate record

Reserved. The closeout commit records the invariant-8 UI gate results here.
