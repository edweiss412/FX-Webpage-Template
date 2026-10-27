# Crew page offline, piece 1 (saved copy): implementation plan

**Spec (canonical):** `docs/superpowers/specs/2026-10-26-crew-offline-saved-copy-design.md`, Draft v6. Piece 1 is §4 (all subsections, §4.11 included), the `CREW_OFFLINE_*` rows of §6, the piece-1 bullets of §7, §8 row B, §9 and §10.
**Spike record:** `docs/superpowers/specs/probes/2026-10-26-crew-offline-sw-spike.md`. Its probe scripts (probe.mjs and tlsproxy.mjs in the session scratchpad) are prior art for the e2e proxy in Task 24.
**Branch:** `feat/crew-offline-saved-copy`, worktree `../FX-worktrees/crew-offline-saved-copy`, cut from `origin/main` after the spec PR (row A of §8) merges.
**Implementer:** Opus / Claude Code for every task (AGENTS.md hard rule: the diff touches `app/` and `components/`).
**Suggested home once committed:** docs/superpowers/plans/crew/2026-10-27-crew-offline-saved-copy.md.

This plan does not redesign the spec. Where the spec leaves a choice to the builder (§10) the choice is recorded in §1 below with its reason. Where the live code and the spec disagree, the disagreement is in §0 and the plan takes the reading stated there until the owner answers.

---

## 0. Spec questions

Each question names the plan's provisional reading so implementation is not blocked. None changes the shape of the work; each changes one test row or one string.

**Q1. The Inter font is referenced from CSS, not from the saved HTML.** §4.6 "Completeness" requires every `/_next/static/**` and `/fonts/**` URL "referenced in the saved HTML" to be cached before a save commits. The only font is declared in `app/fonts.css:28` (a CSS url to the Inter woff2 under /fonts/), imported by `app/layout.tsx:4` and compiled into a `/_next/static/**` CSS chunk, so the HTML references the CSS chunk and never the font. Read literally, completeness never requires the font, and an offline copy on a phone whose HTTP cache was evicted renders in the system font (spike Q1 noted the font came from the HTTP cache). **Plan reading:** implement the rule literally (HTML references only); the font is still stored by the §4.2 cache-first rule on the first controlled load. **Question:** should completeness also follow `url(...)` references inside the saved CSS chunks (one level, `/fonts/**` only)? If yes, it is one more pure function in Task 7 and one more case in Task 10.

**Decision (orchestrator, 2026-10-27): yes.** Completeness also follows `url(...)` references to `/fonts/**` inside the `/_next/static/**` CSS files the saved HTML references, one level deep. Task 7 adds the pure function and Task 10 the case; this branch amends the spec's §4.6 completeness sentence to match. Q2 to Q4: the plan readings stand.

**Q2. A 5xx HTML page with no marker.** §4.4's paragraph after the step-3 table opens "A response that is not HTML:" and then says "any other response with status 500 or above and no marker (a platform error before the app ran) serves `S(U)` in `server-error` mode". A platform error page is usually HTML. **Plan reading:** any complete response with status 500 or above and no marker is handled as server-error, whatever its content type; only status below 500 without a marker is "treated as purge". Task 5 pins both rows.

**Q3. Copy when the saved time is unknown, for `ended` and `sheet-gone-saved`.** §4.7.2's guard row gives two examples ("Showing your saved copy." / "This is the last version we have.") and says "Copy drops the time and age". It does not give the `ended` string. **Plan reading:** drop only the time clause and keep everything else: `ended` body becomes "You're seeing the last version." and `sheet-gone-saved` body becomes "This is the last version we have. Check with Doug before relying on it." The `saved-fresh`/`saved-old` unknown-time case renders the old-copy tone and clock icon with body "Showing your saved copy." after the lead. Task 4 pins all three.

**Q4. DESIGN.md §1.2 has no rows for text on `info-bg` or `stale-tint`.** §4.7.2 "Accessibility" says text contrast uses "`DESIGN.md` §1.2 pairs (text on `info-bg`, `stale-tint`, `warning-bg`)". The §1.2 table (`DESIGN.md:150`) pins `--color-text` and `--color-text-strong` on `--color-warning-bg` and `--color-status-positive-text` on bg/surface, but grep finds no row for any text token on `--color-info-bg` or `--color-stale-tint`. **Plan reading:** Task 20 adds those two rows (computed from the live hex values) and a contrast test that reads `app/globals.css`, following `tests/styles/status-token-contrast.test.ts:1`. That is a `DESIGN.md` edit, so it is inside the invariant-8 UI gate scope at closeout.

---

## 1. Readings the plan relies on (builder latitude and live-code facts)

1. **Viewer HMAC secret (§10).** The viewer-key helper (lib/offline/viewerKey.ts) derives its key from the existing `PICKER_COOKIE_SIGNING_KEY` (`lib/env/pickerCookieSigningKey.ts:5`) with a fixed label: `subkey = HMAC-SHA256(pickerKey, "fxav-saved-copy-viewer-v1")`, then `viewer = base64url(HMAC-SHA256(subkey, showId + ":" + crewMemberId))`. Reason: that key is already required by every path that can resolve a crew identity, it rotates rarely, and a new environment variable would need plumbing through Vercel, `.env.local`, every e2e workflow env and preflight for no gain. The label separates the two uses. The function returns `null` when the key is unavailable, and a marker that would carry a null viewer is written as `purge` (fail closed).
2. **The picker epoch for `data-epoch`.** The `resolved` access result carries no epoch today (`lib/auth/picker/resolveShowPageAccess.ts:17`). Task 14 adds `pickerEpoch` to it (the entry's `e`, which `lib/auth/picker/resolvePickerSelection.ts:110` has already proven equal to the row's epoch). To keep `_CrewShell.tsx` to the two edits §8 allows, the epoch travels inside the crew `Viewer` (`lib/data/getShowForViewer.ts:98`) as an optional `pickerEpoch` field, which `page.tsx` already constructs at `app/show/[slug]/[shareToken]/page.tsx:264`. `getShowForViewer` ignores the field. This touches one type line in `lib/data/getShowForViewer.ts`, outside §8's file list; the layout redesign does not own `lib/data`.
3. **Where the identity extraction lives.** `tests/cross-cutting/picker-resolver-callsite-contract.test.ts:37` forbids any `app/api` file from containing the string `resolveShowPageAccess`, and `tests/cross-cutting/picker-resolver-callsite-contract.test.ts:45` pins the `auth_email_canonical` RPC to `lib/auth/picker/resolvePickerSelection.ts`. The extracted function, `resolveCrewIdentity`, therefore lives in `lib/auth/picker/resolvePickerSelection.ts`; `resolveShowPageAccess` becomes gates plus a call to it, and the status route imports it from there.
4. **`needs_picker_bootstrap` in the status route** is a deny (`gone`): the page would redirect rather than render the saved viewer, so the identity verdict is not "the crew member whose viewer key is `viewer`" (§4.5).
5. **The `save` disposition's client action is the registrar's `ensure-saved`.** §4.3 says `save` "is the live-page `ensure-saved` (§4.7.3)" and §4.7.7 says the registrar "runs the `ensure-saved` messages". Both are rendered by the slot for crew viewers, so the action is implemented once, in `<SavedCopyRegistrar>`; `<SavedCopyMarker disposition="save">` posts nothing. A unit test pins exactly one `ensure-saved` per `renderedAt` change.
6. **`purged(showId)` is handled by the marker, not the bar.** §4.4 step 5 says "any page whose marker names that show reloads". Every page has a marker but only crew pages have a bar, so the listener lives in `<SavedCopyMarker>`.
7. **Storage layout (§4.6, builder detail).** One IndexedDB database holds a `meta` record (`generation`, `nextOrdinal`, `schemaVersion`) and a `copies` store keyed by show id with a unique index on `url`. The HTML is stored in the copy record, so a commit is one IDB read-write transaction across `meta` and `copies`. Assets and static files live in Cache Storage (`fxav-assets-v<schema>`, `fxav-static-v<schema>`), with a `statics` IDB store recording each static entry's stored-at time for the 14-day rule. All decisions are pure functions over plain records (`planBeginSave`, `planCommit`, `planPurge`), shared by the in-memory store the unit tests use and the IDB adapter the worker uses.
8. **Step 1 server-error (v6).** "Fetch the page and serve whatever it returns as is, without running steps 3 to 5": the worker calls `fetch(request)` and returns its promise. A network error on that fetch reaches the browser as a network error, literally per the spec.
9. **Agenda bytes in e2e.** The agenda proxy route reads Google Drive (`app/api/asset/agenda/[show]/[id]/route.ts:297`), which the e2e harness cannot reach. The e2e proxy answers `GET /api/asset/agenda/**` itself with a small fixture PDF. The worker still sees an ordinary network response, so the save path under test is unchanged.
10. **Realtime under the HTTPS proxy.** The crew page opens Supabase realtime at `ws://127.0.0.1:54321`, which WebKit blocks as mixed content under the HTTPS proxy (spike observation 6). The §7 "Client-side renders" bullet therefore runs in Chromium only, in its own spec file matched only by the Chromium project. §7 lists that bullet separately from the both-engines case list.
11. **Production server for e2e.** The baseline webServer runs `pnpm build && pnpm start` when `CI` is set (`playwright.config.ts:264`) and `pnpm dev` otherwise. The crew offline e2e therefore always runs with `CI=1` (locally too, with `E2E_PORT` to avoid a sibling's port 3000 and `CREW_E2E_ONLY=1` so only that server boots, `playwright.config.ts:476`), and its `beforeAll` refuses to run without `CI`.
12. **dev.* shadow schema.** The new column is added to `public.shows` only, following `supabase/migrations/20260810150000_source_anchors_modified_time.sql:9`, which added a `public.shows` column with no `dev.shows` mirror. The status route reads `public` only.

---

## 2. Meta-test inventory (declared before the tasks)

| Meta-test | Action | Task |
|---|---|---|
| `tests/auth/_metaInfraContract.test.ts` | EXTEND: add the status route to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`tests/auth/_metaInfraContract.test.ts:220`), add `app/api/saved-copy` to `AUTH_DOMAIN_ROOTS` (`tests/auth/_metaInfraContract.test.ts:353`), add a destructure pin for the status route's show-row read | 15 |
| `tests/cross-cutting/picker-resolver-callsite-contract.test.ts` | EXTEND: a positive case asserting the status route imports `resolveCrewIdentity` from `lib/auth/picker/resolvePickerSelection.ts` and contains no `.rpc(` of its own, so a later restatement of identity logic in the route fails | 15 |
| `tests/cross-cutting/no-jwt-surface.test.ts` | EXTEND: add `app/api/saved-copy` to `DATA_API_ROOTS` (`tests/cross-cutting/no-jwt-surface.test.ts:6`) | 15 |
| `lib/audit/trustDomains.ts` (read by `tests/cross-cutting/auth-chain-audit.test.ts`) | EXTEND: one `PROTECTED_ROUTES` row for the status route, `chain: "auth-library-exception"`, beside the version route at `lib/audit/trustDomains.ts:76`; `lib/audit/protectedRoutes.ts:47` fails the walk otherwise | 15 |
| `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts` | EXTEND: the `unpublished` expectation at `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:116` gains `showId` | 14 |
| `tests/log/_metaMutationSurfaceObservability.test.ts` | NONE: both new routes export only `GET`, and the walker counts only `POST`/`PUT`/`PATCH`/`DELETE` (`tests/log/mutationSurface/enumerate.ts:176`). No server action is added. Run at closeout to confirm | closeout |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | NONE: the trigger takes no lock and calls no lock function; it runs inside whatever transaction already holds the per-show lock (§4.11 write-path row) | n/a |
| `tests/admin/no-inline-email-normalization.test.ts` | NONE: no email handling | n/a |
| `tests/messages/_metaAdminAlertCatalog.test.ts` | NONE: no `admin_alerts` write | n/a |
| `tests/components/tiles/_metaSentinelHidingContract.test.ts` | NONE: no tile rendering change | n/a |
| `tests/db/validation-schema-parity.test.ts` + `supabase/__generated__/schema-manifest.json` | EXTEND by regeneration (`pnpm gen:schema-manifest`) and the surgical validation apply | 13 |
| `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` | EXTEND: `ENROLLED` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:283`) gains three specs, `EXPECTED_SKIPS` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:161`) gains three empty rows | 26 |
| `scripts/check-crew-e2e-executed.mjs` | EXTEND: `REQUIRED` (`scripts/check-crew-e2e-executed.mjs:31`) gains three rows with the full executable count | 26 |
| `tests/ci/_metaE2eWorkflowCoverage.test.ts` | NONE expected: the specs run from `crew-e2e.yml`, which the scanner already reads, and no new env key is introduced (`CREW_E2E_ONLY` is already allowlisted). Run after Task 26 | 26 |
| `tests/e2e/_metaLiveEntryToolchain.test.ts` | CONSTRAINT: no file under `tests/e2e/` may import or spawn `esbuild` (`tests/e2e/_metaLiveEntryToolchain.test.ts:75`); the e2e reads the committed worker string and never runs `pnpm gen:sw` | 24, 25 |
| `tests/components/auth/avatarMenuTransitionAudit.test.ts` | EXTEND: one `DECLARED` row (`tests/components/auth/avatarMenuTransitionAudit.test.ts:130`) per conditional Task 23 adds to `AvatarMenu.tsx` | 23 |
| `tests/docs/_metaInvariant8Closeout.test.ts` | CONSTRAINT: this plan names neither gate half and carries no closeout marker line; the closeout commit adds both | closeout |
| NEW tests/lib/offline/crewUrl.test.ts | CREATE: the crew-URL exclusion is derived from the route tree on disk | 1 |
| NEW tests/lib/offline/swSourceFreshness.test.ts | CREATE: committed worker bundle equals a fresh build, and the bundle's inputs stay inside an allowlist (no server-only module, no `node:` import, no `process.env`) | 11 |
| NEW tests/auth/picker/savedCopyIdentityParity.test.ts | CREATE: §4.5 parity table, with outcome-kind coverage derived from `CREW_IDENTITY_OUTCOMES` | 15 |
| NEW tests/show/savedCopyMarkerCoverage.test.ts | CREATE: AST walk over `app/show/[slug]/[shareToken]/**`; every `<TerminalFailure>` JSX element carries a `savedCopy` attribute and every sibling surface renders `<SavedCopyMarker>` | 19 |
| NEW tests/components/offline/savedCopyBarTransitionAudit.test.ts | CREATE: AST bijection over the bar's conditionals, modelled on `tests/components/auth/avatarMenuTransitionAudit.test.ts:130` | 28 |

### 2.1 Registry count reconciliation (run at plan time)

Command, run on the spec worktree at plan time:

```text
SUPABASE_CONSTRUCTOR_CONTRACT_FILES: 13
PROTECTED_ROUTES path rows: 66
DATA_API_ROOTS: 4
ENROLLED: 6
REQUIRED: 10
EXPECTED_SKIPS: 6
DATA_API_CONSUMERS: 6
```

(produced by `sed -n '/^const X = \[/,/^\]/p' <file> | grep -c '^  "'` per array; the exact pipeline is in the closeout checklist so it is re-derived, never retyped). After this plan: 14, 67, 5, 9, 13, 9, 6 (`DATA_API_CONSUMERS` is deliberately unchanged: the status route is not a cookie-only data API and must run the Google session check). The closeout re-runs the same pipeline and compares.

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

Eight JSX sites today; `_CrewShell.tsx:236` splits into three branches (§4.3 v6), so ten `<TerminalFailure>` elements after Task 18. The structural test in Task 19 re-derives this set from the AST so a later site cannot be added without a marker.

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

<!-- task: red=`pnpm exec vitest run tests/lib/offline/crewUrl.test.ts` red-state=authored red-target=`lib/offline/crewUrl.ts` why=`crewPath and classifyRequest are stubs that throw and NON_CREW_SEGMENTS is empty, so the derivation case fails comparing an empty list to the on-disk siblings and every classification case throws` ac=AC-1 -->

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

**Classification table cases (each a row):** `GET` + `mode: "navigate"` + `/show/s/t` is `crew-nav`; the same with a trailing slash is `ignore` (Next's 308 handles it); `/show/s/unpublish` is `ignore`; `/show/s` and `/show/s/t/x` are `ignore`; a query string does not change the class and `crewPath` drops it; `_rsc` in the query or `rscHeader === "1"` is `ignore` even with `mode: "navigate"`; `GET` or `POST` navigations to `/auth/sign-out` and `/auth/callback` are `bracket-nav`; **`/api/auth/picker-bootstrap` is `ignore` (v6 removed that bracket; a negative row pins it)**; `GET /_next/static/**` and `GET /fonts/**` are `static`; `GET /api/asset/diagram/**` and `GET /api/asset/agenda/**` are `asset` (the "listed by a saved copy" filter is applied later, in Task 10); a cross-origin URL is `ignore`; any non-navigation `POST` (Server Actions) is `ignore`; `/admin`, `/api/report`, `/auth/sign-in` are `ignore`.

**Failure mode caught:** a future sibling route under `app/show/[slug]/` being swallowed by the worker as a crew URL; the picker bootstrap regaining a bracket the spec removed; an RSC request being answered with a document.

**Commit:** `feat(offline): crew-URL and request classification derived from the route tree`

### Task 2: Marker contract and fail-closed reader

<!-- task: red=`pnpm exec vitest run tests/lib/offline/marker.test.ts` red-state=authored red-target=`lib/offline/marker.ts` why=`markerAttributes and readMarker are stubs that throw, so the round-trip, fail-closed and decoy cases all fail on the throw rather than on a missing module` ac=AC-2 -->

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

<!-- task: red=`pnpm exec vitest run tests/lib/offline/format.test.ts` red-state=authored red-target=`lib/offline/format.ts` why=`formatSavedTime and formatAgo are stubs that throw, so every exact-string case fails before comparing` ac=AC-7 -->

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

<!-- task: red=`pnpm exec vitest run tests/lib/offline/barState.test.ts` red-state=authored red-target=`lib/offline/barState.ts` why=`deriveBarView is a stub that throws, so every state, precedence and guard case fails on the throw` ac=AC-7 -->

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

<!-- task: red=`pnpm exec vitest run tests/lib/offline/navigation.test.ts` red-state=authored red-target=`lib/offline/navigation.ts` why=`decideStep3, decideEndedStep1, decideCheckOutcome and decideNoResponse are stubs that throw, so every row of the step tables fails on the throw` ac=AC-3 -->

**What is red and why:** every decision function is a throwing stub.

**Files**

```text
create  lib/offline/navigation.ts
create  tests/lib/offline/navigation.test.ts
```

**Stub and types (RED step; `decideEndedStep1`, `decideCheckOutcome` and `decideNoResponse` follow the same stub pattern):**

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
- `decideEndedStep1`: `ended` serve ended; `gone` purge then step 2; `no-answer` serve ended; `no-verdict` passthrough (serve the fetched response as is, steps 3 to 5 skipped).
- `decideNoResponse`: network error with `S(U)` offline; without, the not-saved page; timeout with `S(U)` slow plus continuation; timeout without `S(U)` keep waiting.

**Failure mode caught:** the v6 split between serving (`S(U)`) and purging (`C(X)`) collapsing into one key, which would either serve a copy at a link it was not saved under or leave a different viewer's copy alive at an old link.

**Commit:** `feat(offline): navigation decision tables`

### Task 6: One copy per show, the generation counter and the ordinal

<!-- task: red=`pnpm exec vitest run tests/lib/offline/store.test.ts` red-state=authored red-target=`lib/offline/store.ts` why=`planBeginSave, planCommit, planPurge and copyAtUrl are stubs that throw, so every ordering race and every one-copy-per-show case fails on the throw` ac=AC-4 -->

**What is red and why:** the plan functions are throwing stubs (the types already exist from Task 5's RED step).

**Files**

```text
edit    lib/offline/store.ts          (types landed in Task 5; functions here)
create  lib/offline/storeSchema.ts    (DB, store and cache names, SCHEMA_VERSION)
create  tests/lib/offline/store.test.ts
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

**GREEN:** `planBeginSave` returns the current generation and the next ordinal and increments `nextOrdinal`. `planCommit` refuses when `token.generation !== state.generation` (`stale-generation`) or when the show's stored copy has an ordinal at or above the token's (`stale-ordinal`); otherwise it replaces the show's copy wherever it was saved. `planPurge` always increments `generation` (every purge of any scope, including a purge that removes nothing) and removes `C(show)`, `S(url)`, or everything. `createMemoryStore()` wraps these with an async API identical to the IDB adapter's (Task 11).

**Cases:** a save that began before any purge never commits after it (first save and replacement both); a purge of show A voids an in-flight save of show B; two saves of one show commit in ordinal order and the older one loses whichever finishes last; each §4.6 bracket (purge, save starts, purge, save commits) refuses the save, including the first save of a show with no copy; **one copy per show:** a save at a new link replaces the copy saved at an old link and `copyAtUrl(oldLink)` is then `null`; a show-scoped purge at a new link removes a copy saved at an old link; a url-scoped purge at a new link leaves an older-link copy of the same show in place (the v6 bootstrap case, also driven end to end in Task 10).

**Failure mode caught:** a save racing an identity transition and landing a previous viewer's page after the purge (the anti-goal in §2).

**Commit:** `feat(offline): one copy per show with a global generation counter`

### Task 7: Completeness, caps, eviction and static retention

<!-- task: red=`pnpm exec vitest run tests/lib/offline/completeness.test.ts tests/lib/offline/caps.test.ts` red-state=authored red-target=`lib/offline/caps.ts` why=`requiredStaticUrls, admitAsset, evictionVictims and staticEvictions are throwing stubs, so each extraction, cap boundary and eviction case fails on the throw` ac=AC-5 -->

**What is red and why:** all four functions are throwing stubs.

**Files**

```text
create  lib/offline/completeness.ts
create  lib/offline/caps.ts
create  tests/lib/offline/completeness.test.ts
create  tests/lib/offline/caps.test.ts
```

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN:** `requiredStaticUrls(html, origin)` returns the de-duplicated same-origin `/_next/static/**` and `/fonts/**` URLs from `src`, `href` and `srcset` attributes of the saved HTML (Q1: HTML only). `lib/offline/caps.ts` holds `ASSET_MAX_BYTES = 25 * 1024 * 1024`, `SHOW_PREFETCH_MAX_BYTES = 75 * 1024 * 1024`, `MAX_SAVED_SHOWS = 10`, `STATIC_RETENTION_MS = 14 days`. `admitAsset(bytesSoFar, contentLength)` skips one asset over 25 MB and stops the show's prefetch once the running total passes 75 MB; an unknown `contentLength` is admitted and re-checked against the byte count read. `evictionVictims(copies, incomingShowId)` returns the least recently opened copies beyond 10. `staticEvictions(index, referenced, nowMs)` returns entries no copy references and stored more than 14 days ago.

**Cases:** extraction against a real production HTML fixture captured once from the spike's build (committed under `tests/lib/offline/fixtures/`), with a premise that the fixture contains at least one `/_next/static/` script and one stylesheet; cap boundaries at exactly 25 MB and 75 MB; the 11th show evicts the oldest-opened and not the oldest-saved; a static entry referenced by any copy survives at 15 days; an unreferenced one at 13 days survives.

**Failure mode caught:** a committed copy that cannot hydrate offline because a chunk was never cached; unbounded storage growth.

**Commit:** `feat(offline): completeness, caps and eviction rules`

### Task 8: Head injection and the CSS notice

<!-- task: red=`pnpm exec vitest run tests/lib/offline/inject.test.ts` red-state=authored red-target=`lib/offline/inject.ts` why=`injectSavedCopyHead is a stub that throws, so the placement, escaping and allowlist cases all fail on the throw` ac=AC-6 -->

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

<!-- task: red=`pnpm exec vitest run tests/lib/offline/notSavedPage.test.ts` red-state=authored red-target=`lib/offline/notSavedPage.ts` why=`notSavedPageHtml is a stub that throws, so the copy, theming and reload cases fail on the throw` ac=AC-9 -->

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

<!-- task: red=`pnpm exec vitest run tests/lib/offline/workerInstall.test.ts` red-state=authored red-target=`lib/offline/worker/install.ts` why=`installWorker registers no listeners in its stub, so every fetch and message case finds no handler and fails its respondWith and reply assertions` ac=AC-3,AC-4,AC-5 -->

**What is red and why:** the stub `installWorker(scope, deps)` registers nothing, so dispatching a fake `fetch` or `message` event finds no listener and the respondWith/reply assertions fail.

**Files**

```text
create  lib/offline/worker/install.ts     (all handlers; deps injected)
create  lib/offline/worker/swTypes.ts     (minimal FetchEvent, ExtendableEvent, ExtendableMessageEvent, Clients types; the repo's tsconfig has no webworker lib)
create  lib/offline/protocol.ts           (page <-> worker message shapes)
create  tests/lib/offline/workerInstall.test.ts
```

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Protocol (`lib/offline/protocol.ts`):** page to worker: `marker` (`purge` with `showId | null` and `url`; `check` with `url`), `ensure-saved` (`url`, `renderedAt`), `probe` (`url`), `purge-show` (`showId`, from AvatarMenu). Each carries a `MessagePort` for its reply (`ack`, or an outcome: `saved | purged | ended | failed | skipped | kept`). Worker to every open page: `fresh-ready` (`url`), `purged` (`showId`), `save-failed` (`url`, `reason: "quota"`).

**Deps:** `store` (the async store API), `staticCache` and `assetCache` (a `match`/`put`/`delete`/`keys` subset of `Cache`), `fetch`, `now`, `clients` (`matchAll` + `postMessage`), `timers`. Node 20 provides real `Request`, `Response`, `Headers`, `AbortController` and `MessageChannel`, so the tests use real ones and fake only the event objects, caches and fetch.

**Cases (each a test; fake fetch scripted per case):**
- Step 2 and 3 for every Task 5 row, end to end through `respondWith`: the served `Response` body is the network body, the saved copy with injected meta (assert the meta `content`), or the not-saved page.
- Step 1 for an ended copy, all four status outcomes; `no-verdict` serves the fetched response byte for byte and does not touch the store.
- Step 4 and 5: a fetch that never settles serves `slow` at 8 s (fake timers); the continuation completing with `save` commits and posts `fresh-ready(U)`; completing with `purge` naming the show posts `purged(showId)` to every client; a continuation past 60 s is abandoned; no `S(U)` means no 8-second cut-off.
- Buffering: a body that errors mid-stream counts as a network error (step 4), not a partial page.
- Brackets: a `POST` navigation to `/auth/sign-out` purges all before calling fetch and again after the response, and a save begun between the two never commits; same for `/auth/callback`; a navigation to `/api/auth/picker-bootstrap` gets no `respondWith`.
- **v6 bootstrap case:** `C(X)` saved at `U_old`; a navigation to `U_new` returns a markerless 200; `S(U_new)` purge removes nothing and `C(X)` stays at `U_old`; the next save at `U_new` replaces it; a network-error navigation to `U_old` then serves the not-saved page.
- **One copy per show (§7):** save at a new link replaces the old-link copy; a show-named purge at the new link removes the old-link copy; the old link then gets the not-saved page with no network.
- `ensure-saved`: skipped when `S(U)` already has that `renderedAt` or a save of it is in flight; otherwise fetches with `redirect: "manual"` and runs the step 3 table without serving.
- `probe`: runs steps 2 and 3 silently and replies with the outcome.
- `marker` messages: `purge` with a show id purges `C(show)`, without one purges `S(url)`; `check` runs the status check for `S(url)` and replies `ended` only when it transitioned the copy.
- Completeness: a save whose static file fetch fails is abandoned and the show's previous copy stays; a quota error on `put` abandons and posts `save-failed`; assets over the caps are skipped and do not block the commit; asset requests go network first with a 5-second timeout and fall back to the stored asset only for URLs listed by a saved copy.
- `activate`: caches whose name starts with `fxav-` but carries another schema version are deleted; `skipWaiting` and `clients.claim` are called.
- Requests classified `ignore` (Task 1) never reach `respondWith`, asserted for an RSC request, a Server Action `POST`, `/admin` and `/api/report`.

**Failure mode caught:** every §4.4 and §4.6 rule wired wrongly in the glue even though the pure tables are right.

**Commit:** `feat(offline): service worker state machine`

### Task 11: IndexedDB adapter, worker entry, and `pnpm gen:sw` with a freshness test

<!-- task: red=`pnpm exec vitest run tests/lib/offline/swSourceFreshness.test.ts` red-state=authored red-target=`lib/offline/__generated__/swSource.ts` why=`the committed module holds an empty placeholder string while buildSwSource bundles the real entry, so the equality case fails on content and the input-allowlist case fails because the placeholder has no metafile to compare` ac=AC-10,AC-4 -->

**What is red and why:** the RED step commits a placeholder generated module whose `SW_SOURCE` is `""`; the freshness case compares it with a fresh `buildSwSource()` and fails on content.

**Files**

```text
create  lib/offline/worker/idbStore.ts
create  lib/offline/worker/entry.ts
create  lib/offline/__generated__/swSource.ts
create  scripts/generate-sw-source.ts
create  tests/lib/offline/swSourceFreshness.test.ts
edit    package.json         ("gen:sw": "tsx scripts/generate-sw-source.ts", beside gen:spec-codes)
edit    .prettierignore      (add the generated directory beside the other generated dirs)
```

The generated directory follows the same rule as `lib/admin/__generated__/` at `.prettierignore:38`: gen scripts emit raw output, and a reformat would drift from the next regeneration.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**GREEN:** `lib/offline/worker/idbStore.ts` implements the store API by running `planBeginSave`, `planCommit` and `planPurge` inside one IDB read-write transaction over `meta` and `copies` (no non-IDB await inside a transaction). `lib/offline/worker/entry.ts` is one call: `installWorker(self, realDeps())`. `scripts/generate-sw-source.ts` exports `buildSwSource(): Promise<{ code: string; inputs: string[] }>` using `esbuild.build` (`entryPoints: ["lib/offline/worker/entry.ts"]`, `bundle: true`, `format: "iife"`, `platform: "browser"`, `target: ["es2020"]`, `write: false`, `metafile: true`, `minify: false`, `legalComments: "none"`, `absWorkingDir` pinned to the repo root so path comments are repo-relative and identical on every machine). Its `main` runs only when the file is executed directly, and writes `export const SW_SOURCE: string = <JSON string>;`.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Cases:** the committed `SW_SOURCE` equals `buildSwSource().code`; every metafile input is under `lib/offline/` and is not one of `lib/offline/viewerKey.ts`, `lib/offline/killSwitch.ts`, `lib/offline/statusLifecycle.ts`, `lib/offline/assetList.ts` or anything under `lib/offline/client/` (premise: the input list is non-empty and includes `lib/offline/worker/install.ts`); the bundle contains no `process.env` and no `require(`. Mutation check recorded in the commit: change one string in `lib/offline/notSavedPage.ts` without regenerating and observe the freshness case fail, then revert.

**Commit:** `feat(offline): bundle the service worker with pnpm gen:sw`

### Task 12: The /sw.js route and the kill switch

<!-- task: red=`pnpm exec vitest run tests/app/swRoute.test.ts tests/lib/offline/killSwitch.test.ts` red-state=authored red-target=`app/sw.js/route.ts` why=`the stub GET returns an empty 404 and the kill-switch source is an empty string, so the header, body-selection and self-removal cases all fail on status and content` ac=AC-10 -->

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

**Cases:** route with the variable unset returns `SW_SOURCE` byte for byte; set to `1` returns the kill-switch source; set to `0` or `true` returns `SW_SOURCE`; toggling the variable between two calls in one test process changes the answer (proves the read is per request, not module scope); both headers exact; `dynamic` export equals `"force-dynamic"`. The kill-switch source is evaluated with `node:vm` in a fake worker global (spied `caches`, `indexedDB`, `registration`, `addEventListener`): it registers no `fetch` listener, deletes only `fxav-` caches, deletes the database, unregisters.

**Failure mode caught:** a worker that cannot be switched off without a deploy (§2 anti-goal).

**Commit:** `feat(offline): serve the worker from a route with a runtime kill switch`

### Task 13: `shows.unpublished_at` and its trigger

<!-- task: red=`pnpm exec vitest run tests/db/showsUnpublishedAt.test.ts tests/sync/unpublishArchiveParity.test.ts` red-state=authored red-target=`supabase/migrations/20261027000000_shows_unpublished_at.sql` why=`no migration adds the column or the trigger, so the new DB test fails selecting unpublished_at and the parity snapshot field unpublished_at_null fails reading an undefined column` ac=AC-11 -->

**What is red and why:** the new DB test selects `unpublished_at` after each path and fails because the column does not exist; the extended snapshot in `tests/db/_b2Helpers.ts:302` reads a column that is not there.

**Files**

```text
create  supabase/migrations/20261027000000_shows_unpublished_at.sql
create  tests/db/showsUnpublishedAt.test.ts
edit    tests/db/_b2Helpers.ts                     (unpublishedStateSnapshot gains unpublished_at_null)
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

**Snapshot edit:** add `unpublished_at_null: show.unpublished_at == null` to the object returned at `tests/db/_b2Helpers.ts:309`, in the same null-or-not form as `archived_at_null` (§4.11 v6). The existing parity test at `tests/sync/unpublishArchiveParity.test.ts:43` then compares whether both paths stamped it.

**DB test cases:** `_unpublish_show_core` (via the admin RPC helper pattern `tests/db/_b2Helpers.ts:50`) stamps a non-null value; the token path in `lib/sync/unpublishShow.ts:158` stamps it; `archive_show` leaves it null; unarchive leaves it unchanged; republish leaves the old value in place; an unrelated update of a published show leaves it null; a second unpublish after republish moves the value forward.

**Apply, then the checklist (AGENTS.md validation-schema-parity, all in this task):**
1. Local: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/migrations/20261027000000_shows_unpublished_at.sql`. Never `supabase db reset` (the local DB is shared by every worktree). Applying twice is a no-op (idempotent DDL).
2. `pnpm gen:schema-manifest`, commit the regenerated manifest.
3. Validation project: `supabase db query --linked` with the migration body, then `notify pgrst, 'reload schema';`.
4. `pnpm test:audit:validation-schema-parity`.

DB completeness matrix (every §4.11 layer): DDL (migration); inline CHECKs N/A, no constraint; write path the trigger; read path the status route (Task 15, service role); triggers one new, cleanup none; RLS and grants unchanged; manifest regenerated; validation applied; `dev.shows` N/A (§1 item 12); tests above.

**Commit:** `feat(db): stamp shows.unpublished_at on unpublish`

### Task 14: Extract the post-unpublished identity resolution

<!-- task: red=`pnpm exec vitest run tests/auth/picker/resolveCrewIdentity.test.ts tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts tests/auth/picker/resolvePickerSelection.test.ts` red-state=authored red-target=`lib/auth/picker/resolveShowPageAccess.ts:229` why=`the unpublished result carries no showId at this line and no resolver accepts a saved epoch, so the updated exhaustiveness expectation fails on the missing showId and the new saved-epoch cases throw from the resolveCrewIdentity stub` ac=AC-12 -->

**What is red and why:** `lib/auth/picker/resolveShowPageAccess.ts:229` returns `{ kind: "unpublished" }` with no show id, so the updated expectation at `tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts:116` fails; the new `resolveCrewIdentity` cases call a stub that throws.

**Files**

```text
edit    lib/auth/picker/resolvePickerSelection.ts   (resolveCrewIdentity, EpochCheck, CREW_IDENTITY_OUTCOMES)
edit    lib/auth/picker/resolveShowPageAccess.ts    (gates, then resolveCrewIdentity; unpublished gains showId; resolved gains pickerEpoch)
edit    lib/data/getShowForViewer.ts                (crew Viewer gains optional pickerEpoch)
edit    tests/cross-cutting/resolve-show-page-access-exhaustiveness.test.ts
edit    tests/show/showUnavailablePaused.test.tsx    (its mock at :45 gains showId)
create  tests/auth/picker/resolveCrewIdentity.test.ts
```

**Shape added to `lib/auth/picker/resolvePickerSelection.ts`:**

```ts
/** How the picker entry's epoch is checked (spec section 4.5). */
export type EpochCheck = { kind: "current" } | { kind: "saved"; epoch: number };

export type CrewIdentityResult =
  | { kind: "resolved"; crewMemberId: string; pickerEpoch: number }
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
}): Promise<CrewIdentityResult> {
  void input;
  throw new Error("unimplemented");
}
```

**GREEN:** move the Google-session block (`lib/auth/picker/resolveShowPageAccess.ts:231` through `lib/auth/picker/resolveShowPageAccess.ts:292`) into `resolveCrewIdentity` unchanged in order and conditions, returning `{ kind: "needs_picker_bootstrap" }` without a token; `resolveShowPageAccess` signs the intent token around it exactly as today. The picker-selection half calls `resolvePickerSelection` with a new `epochCheck` input: `current` keeps today's comparison at `lib/auth/picker/resolvePickerSelection.ts:110` and the archived/published check at `lib/auth/picker/resolvePickerSelection.ts:109`; `saved` skips that lifecycle check (the status route has its own) and compares `entry.e` to the saved epoch. `resolved` carries `pickerEpoch: entry.e`. `resolveShowPageAccess`'s gate order is untouched (archived, admin, unpublished, then the call), the `unpublished` result gains `showId`, the `resolved` result gains `pickerEpoch`, and `page.tsx` passes it into the crew `Viewer`. The `auth_email_canonical` RPC stays in `lib/auth/picker/resolvePickerSelection.ts` (`tests/cross-cutting/picker-resolver-callsite-contract.test.ts:45`).

**Cases:** the existing suites for both resolvers pass unchanged except the two expectation edits (the refactor's safety net); `saved` mode with entry epoch equal to the saved epoch and the row one higher resolves; `saved` mode with entry epoch one lower than the saved epoch is `epoch_stale`; `saved` mode on an archived, unpublished row still resolves (lifecycle is the caller's job); `current` mode on an archived row is `show_unavailable` as today.

**Commit:** `refactor(auth): extract crew identity resolution shared by the page and the status route`

### Task 15: Viewer key, status route, and identity parity

<!-- task: red=`pnpm exec vitest run tests/lib/offline/viewerKey.test.ts tests/lib/offline/statusLifecycle.test.ts tests/api/savedCopyStatus.test.ts tests/auth/picker/savedCopyIdentityParity.test.ts tests/auth/_metaInfraContract.test.ts tests/cross-cutting/picker-resolver-callsite-contract.test.ts tests/cross-cutting/no-jwt-surface.test.ts tests/cross-cutting/auth-chain-audit.test.ts` red-state=authored red-target=`app/api/saved-copy/status/route.ts` why=`the stub route answers ended for every request, so every deny row of the parity table and every failing lifecycle case fails, and the new registry rows name a route that consults neither the lifecycle row nor the shared resolver` ac=AC-12 -->

**What is red and why:** the RED step writes the stub route returning `200 { "state": "ended" }` for everything, so every deny row and every failing lifecycle condition fails; the `viewerKey` and `lifecycleAllowsEnded` stubs throw; the registry extensions fail because the stub reads no show row (no destructure to pin) and does not import `resolveCrewIdentity`.

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

**GREEN, the route:** `GET` parses `show`, `epoch`, `viewer`, `saved` (malformed or missing: `200 gone`); reads `archived, picker_epoch, unpublished_at` by id with the service-role client inside `try`, destructuring `{ data, error }` (invariant 9), `error` or a throw returns `500 { "error": "SAVED_COPY_STATUS_LOOKUP_FAILED" }`; `lifecycleAllowsEnded` false returns `gone`; then the same admin-session check the page runs (`isAdminSession`; `ok` is `gone`, infra is 500); then `resolveCrewIdentity({ showId, req, epochCheck: { kind: "saved", epoch } })`, where `resolved` whose `viewerKey(showId, crewMemberId)` equals `viewer` (constant-time compare) is `ended`, `infra_error` is 500, everything else `gone`. Every response carries `Cache-Control: no-store`. The 500 code is a log and wire code only, never rendered (invariant 5); the worker maps any 500 to `no-verdict` (§4.5 v6).

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Parity table (`tests/auth/picker/savedCopyIdentityParity.test.ts`):** one array of scenarios; each row sets the mocked boundaries (`@/lib/auth/isAdminSession`, `@/lib/auth/validateGoogleSession`, `@/lib/supabase/server` for the show row, crew row and `auth_email_canonical`, following `tests/auth/picker/resolvePickerSelection.test.ts:6`) and a real signed picker cookie built with `encodePickerCookie` (`lib/auth/picker/cookieEnvelope.ts:52`) under the test key from `tests/setup.ts:37`. Each row runs twice: through `resolveShowPageAccess` for the live show (allow iff `resolved` for the saved crew member), and through the route's `GET` for the same show archived with `picker_epoch` one higher (allow iff `ended`). Rows, each in a passing and a failing state: admin session; picker entry present for this show; entry for another show only; entry for a different crew member; entry epoch stale; roster membership; `selections_reset_at` after the pick; `claimed_via_oauth_at` after the pick; signed-in email equal to and different from the crew row; Google session matching the entry; Google session with no crew match; Google session whose entry differs (bootstrap); Google session for an unclaimed member; Google terminal failure. Two derived checks run unconditionally before the table: every `CREW_IDENTITY_OUTCOMES` kind is produced by at least one row (so a new outcome kind fails the test until a row covers it), and the table holds at least one allow and one deny (`premiseHolds`).

**Pre-dispatch mutant (record in the commit):** pass `{ kind: "current" }` instead of `saved` in the route and observe the allow rows fail; drop the admin-session check and observe the admin row fail.

**Lifecycle cases:** missing row; `archived` false; epoch gap 0, 2 and 3; `unpublished_at` before, equal to and after `saved`; null `unpublished_at`.

**Registry edits:** add the status route path to `SUPABASE_CONSTRUCTOR_CONTRACT_FILES` (`tests/auth/_metaInfraContract.test.ts:220`) and app/api/saved-copy to `AUTH_DOMAIN_ROOTS` (`tests/auth/_metaInfraContract.test.ts:353`), plus a destructure pin for the show-row read; a `PROTECTED_ROUTES` row with `chain: "auth-library-exception"` beside `lib/audit/trustDomains.ts:76`; app/api/saved-copy in `DATA_API_ROOTS` (`tests/cross-cutting/no-jwt-surface.test.ts:6`); the positive callsite case in `tests/cross-cutting/picker-resolver-callsite-contract.test.ts`.

**viewerKey cases:** deterministic; base64url with no padding; differs by show and by crew member; never contains the crew id; differs from a plain HMAC under the picker key (proves the label); returns null when the key throws.

**Then:** `pnpm test:audit:x3-trust-domain`.

**Commit:** `feat(api): saved-copy status route with identity parity`

### Task 16: `<SavedCopyMarker>` and the client messaging helper

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyMarker.test.tsx tests/lib/offline/clientMessaging.test.ts` red-state=authored red-target=`components/offline/SavedCopyMarker.tsx` why=`the stub component renders nothing and posts nothing and postToWorker is a stub that throws, so the template, per-disposition post and purged-reload cases fail` ac=AC-2,AC-13 -->

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

### Task 17: `<SavedCopySlot>` and the server-built asset list

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopySlot.test.tsx tests/lib/offline/assetList.test.ts` red-state=authored red-target=`components/offline/SavedCopySlot.tsx` why=`the stub slot renders no marker and savedCopyAssetUrls is a stub that throws, so the disposition-per-viewer cases and the Gallery comparison case fail` ac=AC-5,AC-13 -->

**What is red and why:** the stub slot renders nothing, and the asset-list stub throws.

**Files**

```text
create  components/offline/SavedCopySlot.tsx
create  lib/offline/assetList.ts
create  tests/components/offline/savedCopySlot.test.tsx
create  tests/lib/offline/assetList.test.ts
```

**GREEN, the asset list:** `savedCopyAssetUrls(showId, data)` builds the diagram URLs with the very functions the crew components use, `makeDiagramLoader` (`lib/images/diagramLoader.ts:112`) and `diagramAssetKeyFromPath`/`isAllowedDiagramMime` (`lib/data/diagrams.ts:72`, `lib/data/diagrams.ts:38`), over `resolveCurrentDiagrams` output: for every available item, the original (`pinOriginal`, which the lightbox requests) plus the loader's URL at every width Next can put in a `srcset` (the configured device and image sizes), de-duplicated. Agenda URLs are `/api/asset/agenda/<showId>/<fileId>` for each `data.show.agenda_links` entry with a `fileId`, the same shape `components/agenda/AgendaEmbed.tsx:97` builds.

**Comparison test (the spec's "a test that renders both and compares"):** render `DiagramsTile` (`components/crew/DiagramsBlock.tsx:112`) in jsdom with a fixture carrying embedded and linked items with variant ladders (`makeShowForViewer`, `tests/fixtures/showForViewer.ts:164`), collect every URL from `src` and `srcset` attributes, and assert each is in `savedCopyAssetUrls`; premise that the render produced at least one `srcset` with two or more candidates, so the comparison sees the variant ladder. The reverse direction (every listed URL is one the Gallery could request) is asserted against `makeDiagramLoader` output for the same items, since the lightbox original is not in the closed gallery's markup.

**GREEN, the slot:** an async server component taking `viewer`, `showId`, `data`, `slug`, `shareToken`. For `viewer.kind === "crew"` it renders a `save` marker with `renderedAt` from `now()` (`lib/time/now.ts:12`, the render-side clock), `epoch` from `viewer.pickerEpoch`, `viewer` from `viewerKey(showId, viewer.crewMemberId)` and the asset list; if the key or the epoch is missing it renders `purge` naming the show (fail closed). For `admin` and `admin_preview` (and the `staticPreview` caller, which passes an `admin_preview` viewer), it renders `purge` naming the show. The bar and the registrar are added to the slot by Tasks 20 and 25.

**Cases:** each viewer kind's disposition and attributes; missing epoch or key falls back to purge; the asset list in the marker equals `savedCopyAssetUrls` output; an agenda entry without `fileId` is not listed.

**Commit:** `feat(crew-page): saved-copy slot with server-built asset list`

### Task 18: `<TerminalFailure>` markers, the page arms, and `_CrewShell.tsx`

<!-- task: red=`pnpm exec vitest run tests/show/savedCopyMarkerArms.test.tsx` red-state=authored red-target=`components/auth/TerminalFailure.tsx:25` why=`TerminalFailure accepts no savedCopy prop and no arm passes one, and CrewShell renders no slot after Header, so every arm-to-disposition assertion finds no template element` ac=AC-13 -->

**What is red and why:** `components/auth/TerminalFailure.tsx:25` takes no marker prop, no arm in `page.tsx` passes one, and `_CrewShell.tsx` renders no slot, so the per-arm test finds no `#fxav-saved-copy` element anywhere.

**Files**

```text
edit    components/auth/TerminalFailure.tsx                 (optional savedCopy?: Marker, rendered as <SavedCopyMarker>)
edit    app/show/[slug]/[shareToken]/page.tsx               (sweep S1 dispositions; pickerEpoch into the crew Viewer)
edit    app/show/[slug]/[shareToken]/_CrewShell.tsx         (the two edits section 8 allows)
create  tests/show/savedCopyMarkerArms.test.tsx
```

**GREEN:** The route page passes the S1 disposition to each `<TerminalFailure>` at `app/show/[slug]/[shareToken]/page.tsx:111`, `app/show/[slug]/[shareToken]/page.tsx:150`, `app/show/[slug]/[shareToken]/page.tsx:161`, `app/show/[slug]/[shareToken]/page.tsx:222`, `app/show/[slug]/[shareToken]/page.tsx:244`, `app/show/[slug]/[shareToken]/page.tsx:282`, `app/show/[slug]/[shareToken]/page.tsx:341`; the `keep` at line 282 carries `viewerKey(result.showId, result.crewMemberId)` and falls back to `purge` naming the show when that is null. `_CrewShell.tsx` gets exactly two edits: the slot line after the `<Header>` element closes at `app/show/[slug]/[shareToken]/_CrewShell.tsx:517`, and the catch at `app/show/[slug]/[shareToken]/_CrewShell.tsx:236` split into three returns: `MalformedProjectionError` with `viewer.kind === "crew"` is `keep` with that viewer's key; `MalformedProjectionError` for any other viewer is `purge` naming the show; `UnmatchedViewerError` is `purge` naming the show (§4.3 v6). The `admin` arm's `<CrewShell>` gets its purge from the slot (Task 17).

**Cases:** one per arm with `resolveShowPageAccess` and `getShowForViewer` mocked, following `tests/show/flow8Repick.test.tsx`; each asserts the disposition, the show id (present or absent as S1 says) and, for `keep`, that `data-viewer` equals `viewerKey` for that crew member. The `resolved` happy path asserts the `save` marker carries `data-epoch` equal to the mocked `pickerEpoch`.

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

**Render cases:** each sibling renders its disposition and show id per the §4.3 table; the picker's marker is present on first render (its mount purge is the first half of the "picking a name" transition).

**Mutation families for the guard (closed set, §9 below):** attribute removed from one `TerminalFailure`; marker removed from one sibling; a new `TerminalFailure` added without the attribute; the walk root renamed.

**Commit:** `feat(crew-page): markers on every crew-route surface with a coverage guard`

### Task 20: `<SavedCopyBar>` rendering and contrast rows

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyBar.test.tsx tests/styles/savedCopyBarContrast.test.ts` red-state=authored red-target=`components/offline/SavedCopyBar.tsx` why=`the stub bar renders nothing and never marks html as mounted, and DESIGN.md has no rows for text on info-bg or stale-tint, so the per-state DOM cases and the contrast-row cases fail` ac=AC-7 -->

**What is red and why:** the stub returns `null` and never sets `data-fxav-bar`; the contrast test fails on the missing `DESIGN.md` rows (Q4).

**Files**

```text
create  components/offline/SavedCopyBar.tsx
create  tests/components/offline/savedCopyBar.test.tsx
create  tests/styles/savedCopyBarContrast.test.ts
edit    components/offline/SavedCopySlot.tsx    (render the bar for crew viewers)
edit    DESIGN.md                                (section 1.2 rows: text on info-bg, text on stale-tint)
```

**GREEN:** a `"use client"` component with props `renderedAt`, `sheetUnavailable`, `slug`, `shareToken`. It reads `<meta name="fxav-served">` synchronously in its initial state (unknown `content` is `offline`, absent is `live`), sets `data-fxav-bar="mounted"` on `document.documentElement` in a mount effect, tracks `online` from `navigator.onLine` and the `online`/`offline` events, re-evaluates age every 60 seconds, and renders `deriveBarView` (Task 4): nothing in `hidden`; otherwise one element `data-testid="saved-copy-bar"` with `role="status"`, `aria-live="polite"`, the tone classes, an `aria-hidden` icon (`WifiOff`, `Clock`, `TriangleAlert`, `RefreshCw` with a reduced-motion-safe spin, `Check`, all verified exported by `lucide-react`) carrying `data-testid="saved-copy-bar-icon"`, and the copy in `data-testid="saved-copy-bar-content"` with the lead in `<strong>`. Layout classes for the Dimensional Invariants are deliberately NOT added here; Task 27 adds them. Mode becomes `live` when `renderedAt` differs from its value at mount.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Contrast:** compute and add `DESIGN.md` §1.2 rows for `--color-text` on `--color-info-bg` and on `--color-stale-tint` (light and dark, from `app/globals.css:111` and `app/globals.css:108` and their dark counterparts), and `tests/styles/savedCopyBarContrast.test.ts` reads the live hex values the way `tests/styles/status-token-contrast.test.ts:1` does and asserts every bar pair is at least 4.5:1 in both themes: text on info-bg, text on stale-tint, warning-text on warning-bg, status-positive-text on surface.

**Cases:** each state's DOM (role, live region, icon testid present and hidden, exact text from the content element); `hidden` renders no element but still sets the mounted attribute; meta absent is `live`; meta `content="bogus"` is `offline`; `online` false on a live page shows the `No signal.` lead; the 60-second tick moves `saved-fresh` to `saved-old` across the 6-hour line (fake timers); `navigator.serviceWorker` absent changes nothing about rendering. Four string mutants, including "content present but not live" (the lead inside an `aria-hidden` span must fail the accessible-name assertion).

**Commit:** `feat(crew-page): saved-copy bar`

### Task 21: Coming back online, purge reloads, and the section in the URL

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyBarRecovery.test.tsx` red-state=authored red-target=`components/offline/SavedCopyBar.tsx` why=`the bar from Task 20 never probes, never sets the updating flag and never rewrites the s parameter, so every probe, reload and replaceState case fails` ac=AC-8 -->

**What is red and why:** Task 20's bar has no recovery logic.

**Files**

```text
edit    components/offline/SavedCopyBar.tsx
create  tests/components/offline/savedCopyBarRecovery.test.tsx
```

**GREEN (§4.7.3, §4.7.4):** in modes `offline`, `slow` and `server-error`, probe on `online`, on `fresh-ready` for this URL, and every 30 seconds while `navigator.onLine` is true, never two at once. Outcomes: `saved` shows `updating`, sets a `sessionStorage` flag, calls `location.reload()`; `purged` reloads at once; `ended` shows `ended` without reloading; `failed` changes nothing. On mount, a set flag is consumed and drives `justUpdated` for 4 seconds. An RSC refresh during `updating` (mode becomes `live`) cancels the recovery. In a saved-copy mode, replace `s` in the URL with `data-active-section` from the `crew-shell-sections` wrapper (`components/crew/CrewSections.tsx:107`) via `history.replaceState`, leaving the URL alone when the attribute is absent.

**Cases:** each outcome; a second `online` event during a probe does not start a second probe; the 30-second timer stops when `navigator.onLine` turns false; the session flag is consumed exactly once; the age tick crossing 6 hours during `updating` keeps `updating`; RSC refresh during `updating` cancels; `replaceState` called with the rendered section and not called when the wrapper lacks the attribute.

**Commit:** `feat(crew-page): bar recovery when signal returns`

### Task 22: `<SavedCopyRegistrar>` and the two telemetry codes

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyRegistrar.test.tsx` red-state=authored red-target=`components/offline/SavedCopyRegistrar.tsx` why=`the stub registrar does nothing, so the registration options, kill-switch unregister, ensure-saved throttle, agenda prefetch and both clientLog cases fail` ac=AC-10,AC-15,AC-5 -->

**What is red and why:** the stub component does nothing.

**Files**

```text
create  components/offline/SavedCopyRegistrar.tsx
create  tests/components/offline/savedCopyRegistrar.test.tsx
```

**GREEN:** props `renderedAt`, `disabled`, `hasAgenda`. When idle (`requestIdleCallback`, else `setTimeout` after `load`, since WebKit lacks the former): if `disabled`, unregister every registration and stop; otherwise register the /sw.js URL with `{ scope: "/", updateViaCache: "none" }`, call `navigator.storage.persist()` once. Once a controller exists (`controller` or `controllerchange`), and only when the page is live (no `fxav-served` meta), post `ensure-saved` with `location.pathname` and `renderedAt`, again whenever `renderedAt` changes, at most once per 10 seconds. If `hasAgenda`, import the agenda viewer module (`components/agenda/AgendaPdfViewer.tsx`, the same specifier `components/agenda/AgendaEmbed.tsx:40` loads) and then `react-pdf`, and `fetch` the `pdfjs.GlobalWorkerOptions.workerSrc` that module set at `components/agenda/AgendaPdfViewer.tsx:47`. Registration failure logs `clientLog("warn", "client.offline", ..., undefined, "CREW_OFFLINE_SW_REGISTER_FAILED")` (`lib/observe/clientLog.ts:5`); a `save-failed` message logs `CREW_OFFLINE_SAVE_FAILED` the same way. Neither code reaches the UI (invariant 5). The registrar is not yet mounted; Task 25 mounts it.

**Cases:** registration options exact; `disabled` unregisters and never registers; no `ensure-saved` on a saved-copy page; one `ensure-saved` per `renderedAt` change with the 10-second throttle (fake timers); agenda prefetch only when `hasAgenda`; each telemetry code emitted with level `warn` and the exact code (spy on `clientLog`); `navigator.serviceWorker` absent does nothing and throws nothing.

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

**GREEN:** in `onSwitchSubmit` (`components/auth/AvatarMenu.tsx:180`), before `clearAction`, `await postToWorker({ type: "purge-show", showId }, { timeoutMs: 500 })`; after the action settles, success, typed failure, or a thrown error (including a redirect that `unstable_rethrow` rethrows), post `purge-show` again, without awaiting, before the rethrow. While offline, the switch row stays focusable with `aria-disabled="true"`, its label reads `Needs signal` instead of `Not you? Switch person`, and activation is blocked the same way the busy phase blocks it (the comment at `components/auth/AvatarMenu.tsx:491` explains why both statements are needed). No other visible change.

**Cases:** order of calls (purge, then action, then purge) with a delayed ack; a missing ack proceeds after 500 ms; the second purge runs on success, on a `{ ok: false }` result and on a thrown redirect; offline shows `Needs signal`, `aria-disabled="true"`, and a click does not call `clearAction`; going back online restores the label. The existing `avatarMenu.test.tsx` suite stays green. The audit bijection gains exactly the new conditionals, each with treatment "instant: label swap, no animation".

**Commit:** `feat(auth): purge saved copies around Not you and disable it offline`

### Task 24: E2E proxy and lifecycle helpers

<!-- task: red=`pnpm exec vitest run tests/e2e/helpers/crewOfflineProxy.unit.test.ts` red-state=authored red-target=`tests/e2e/helpers/crewOfflineProxy.ts` why=`startCrewOfflineProxy is a stub that throws, so the pass, refuse, hang, release and stub cases all fail on the throw` ac=AC-16 -->

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

export type CrewOfflineProxy = {
  /** http://127.0.0.1:<port>; Chromium treats loopback http as a secure context. */
  httpOrigin: string;
  /** https://127.0.0.1:<port> with a throwaway self-signed certificate (WebKit). */
  httpsOrigin: string;
  setMode(mode: ProxyMode): void;
  /** Answer GET requests under this path prefix locally instead of forwarding. */
  stub(pathPrefix: string, body: Buffer, contentType: string): void;
  close(): Promise<void>;
};

export async function startCrewOfflineProxy(opts: {
  upstreamPort: number;
}): Promise<CrewOfflineProxy> {
  void opts;
  throw new Error("unimplemented");
}
```

**GREEN:** one `http` and one `https` listener on ephemeral ports (port 0), both forwarding to 127.0.0.1 on the upstream port with the `Host` header kept (the test-auth endpoint allowlists 127.0.0.1 with any port) and `x-forwarded-proto` set on the HTTPS side, as the spike's tlsproxy.mjs did. The certificate is generated per run with `openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=127.0.0.1` into a `mkdtemp` directory, so no key is committed. Modes: `pass` forwards; `refuse` destroys the client socket on each request (the browser sees a network error, not a 502); `hang` accepts and holds the request. Every mode change destroys idle keep-alive sockets so the browser opens a new connection under the new mode; a change from `hang` to `pass` forwards the held requests upstream, which lets the worker's step-5 continuation complete. `stub` answers matching `GET`s locally in `pass` mode only.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
`tests/e2e/helpers/crewOfflineLifecycle.ts` exposes `archiveShow`, `unpublishShow`, `rotateShareToken` and `readShareToken`, each one `psql` call through `resolvePsqlTarget` and `psqlChildEnv` (`tests/e2e/helpers/psqlTarget.ts:145`, `tests/e2e/helpers/psqlTarget.ts:274`) that sets `role authenticated` and the admin claims literal used by `tests/db/_holdsHelpers.ts:41`, then calls the admin RPC, which takes the per-show lock and publishes the realtime invalidation itself. `tests/e2e/helpers/savedCopyProbe.ts` exposes document-level helpers (`waitForCrewHydrated`, `waitForWorkerControl`, `waitForSavedCopy(page, { showId, url })`, `readSavedCopies`, `deleteStaticScripts`) that read IndexedDB and Cache Storage through `page.evaluate` with the names from the worker's schema module.

**Unit cases:** pass forwards status, headers and body; refuse makes a Node client see `ECONNRESET` or `socket hang up`; hang does not answer within 500 ms; hang then pass completes the held request; a stub answers without contacting upstream (upstream spy); the HTTPS listener answers with `rejectUnauthorized: false`.

**Commit:** `test(e2e): offline proxy and lifecycle helpers`

### Task 25: Real-browser offline cases; mount the registrar

<!-- task: red=`CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test --project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline.spec.ts tests/e2e/crew-offline-realtime.spec.ts` red-state=authored red-target=`components/offline/SavedCopySlot.tsx` why=`the slot does not yet render SavedCopyRegistrar, so no page ever registers the worker and every case times out in the worker-control readiness gate with an explicit message` ac=AC-16,AC-3,AC-6 -->

**What is red and why:** the registrar exists (Task 22) but nothing mounts it, so the readiness gate that waits for `navigator.serviceWorker.controller` times out in every case, with a message naming the gate.

**Files**

```text
edit    components/offline/SavedCopySlot.tsx      (render <SavedCopyRegistrar disabled={crewOfflineDisabled(process.env)} ...> for crew viewers)
edit    tests/components/offline/savedCopySlot.test.tsx   (registrar present for crew only; disabled flag passed through)
edit    playwright.config.ts                       (projects crew-offline-chromium and crew-offline-webkit)
create  tests/e2e/crew-offline.spec.ts
create  tests/e2e/crew-offline-realtime.spec.ts
```

**Projects (added to the `projects` array at `playwright.config.ts:57`):** `crew-offline-chromium` (`devices["Desktop Chrome"]`, viewport 390x844, `testMatch: /crew-offline(-layout|-realtime)?\.spec\.ts/`) and `crew-offline-webkit` (`devices["iPhone 14"]`, viewport 390x844, `ignoreHTTPSErrors: true`, `testMatch: /crew-offline(-layout)?\.spec\.ts/`). Neither sets `baseURL`; tests navigate to the proxy origin from a worker-scoped fixture (Chromium uses `httpOrigin`, WebKit `httpsOrigin`). Before adding them, re-run sweep S5 with the realtime file name included and paste the result in the commit body.

**Harness readiness checklist (writing-plans, mandatory):**
- (a) Server: the baseline webServer on `E2E_PORT` in production mode (`CI=1` makes it `pnpm build && pnpm start -H 127.0.0.1`, `playwright.config.ts:264`), alone (`CREW_E2E_ONLY=1`, `playwright.config.ts:476`). `beforeAll` throws when `process.env.CI` is unset, then fetches the /sw.js URL through the proxy and requires its body to equal the committed `SW_SOURCE`, so a stale or foreign server on the port fails loudly instead of testing other code.
- (b) Readiness before the first assertion of every case: `crew-shell` visible, `html[data-fxav-bar="mounted"]` present (the bar's own hydration signal), `navigator.serviceWorker.controller` non-null, and for saving cases `waitForSavedCopy` resolving with the expected show id and URL. Never `networkidle`.
- (c) Detach safety: every sampler is document-level (`page.evaluate`, `page.waitForFunction`) and re-acquired after each reload; no `locator.evaluate` is held across a navigation.
- Contexts: one new ephemeral context per case (`browser.newContext()`), never `launchPersistentContext` (spike: WebKit persistent contexts lose Cache Storage); never `context.setOffline` (spike M1).
- Identity: drive the picker at `?gate=skip` and click the roster row, as `tests/e2e/picker-flow.spec.ts:292` does; Google identity through `signInAs` (`tests/e2e/helpers/signInAs.ts:43`) with `NON_ADMIN_CREW_FIXTURE` on the seeded roster; admin through `ADMIN_FIXTURE` (`tests/e2e/helpers/fixtures.ts:25`).
- Data: `seedShowWithCrew` per case (`tests/e2e/helpers/seedShowWithCrew.ts:234`) and `deleteSeededShow` in `afterEach`; the diagram case reads the db:seed Waldorf show read-only.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**`tests/e2e/crew-offline.spec.ts` (both engines):**
1. First visit is saved, then an offline reload shows full content, a working tab switch and the bar: pick, wait saved, `refuse`, reload; `crew-shell` visible, bar text starts `No signal. Showing your saved copy from`, Venue tab shows `section-venue`, the avatar menu opens; the seeded diagrams render from stored assets (Waldorf show).
2. Hang shows `slow`, then updates by itself: `hang`, reload; the bar reads `Slow connection.` after at least 8 seconds; `pass` releases the held request; the bar passes through `updating` to `Updated. You're on the latest version.` and then disappears.
3. Archive keeps the copy with the ended bar: `archiveShow`, reload online; `This show has ended.`; `refuse`, reload; still ended.
4. Reset wipes: `rotateShareToken`, reload the old link online (not-found, check, status `gone`); no copy for the show; `refuse`, reload; the not-saved heading.
5. Unpublish wipes: `unpublishShow`, reload (paused page, purge); `refuse`, reload; the not-saved heading.
6. "Not you?" wipes: open the avatar menu, switch; no copy; `refuse`, reload; the not-saved heading.
7. Sign-out wipes: Google identity, visit (bootstrap, resolved, saved), `/me`, submit `me-sign-out-form`; no copy; `refuse`, reload the show link; the not-saved heading.
8. An admin view wipes: save as crew, `signInAs(ADMIN_FIXTURE)` in the same context, reload online; no copy.
9. The not-saved page with no copy: save show A, `refuse`, open show B's link; the three strings; dispatch `online` with the proxy back in `pass`; the real page loads.
10. An unopened agenda opens offline: proxy `stub` for `/api/asset/agenda/` with the fixture PDF; visit without opening the agenda; wait until the saved copy lists the agenda URL and the static cache holds the pdf.js worker; `refuse`, reload; Schedule tab, `View agenda`; `agenda-active-page` reads `1`.
11. JavaScript failing to load still shows the CSS notice: save, `deleteStaticScripts`, `refuse`, reload; `getComputedStyle(document.body, "::before").content` contains `Saved copy from`; `html` lacks `data-fxav-bar`.
12. Hydration is clean on a served copy: console has no React hydration error (#418, #423, #425) and no `pageerror` across cases 1 and 3 (§4.7.1 "the plan proves that with the same hydration check").

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**`tests/e2e/crew-offline-realtime.spec.ts` (Chromium only, §1 item 10):** with the page open, a reset, an archive and an unpublish each arrive by realtime refresh; the copy is wiped (reset, unpublish) or marked ended (archive, followed by the reload the marker triggers and the ended bar); a following `refuse` reload shows the matching result.

**Commit:** `test(e2e): crew offline cases; mount the registrar`

### Task 26: Wire the offline specs into crew-e2e

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` red-state=authored red-target=`.github/workflows/crew-e2e.yml:188` why=`the new specs are enrolled in ENROLLED and EXPECTED_SKIPS but this run command names neither the specs nor the two offline projects, so expectWired fails for each enrolled spec` ac=AC-16 -->

**What is red and why:** the RED step adds the three specs to `ENROLLED` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:283`) and `EXPECTED_SKIPS` (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:161`, empty arrays, no static skips) before touching the workflow, so `expectWired` fails: no `playwright test` segment in `.github/workflows/crew-e2e.yml:188` names them.

**Files**

```text
edit    .github/workflows/crew-e2e.yml                       (run command; timeout)
edit    tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts
edit    scripts/check-crew-e2e-executed.mjs                  (REQUIRED rows)
```

**GREEN:** append `--project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline.spec.ts tests/e2e/crew-offline-realtime.spec.ts tests/e2e/crew-offline-layout.spec.ts` to the run command at `.github/workflows/crew-e2e.yml:188` (Task 27 creates the layout spec; until then the wiring test's own resolution is what proves the segment). Add `REQUIRED` rows at `scripts/check-crew-e2e-executed.mjs:31` with each spec's full executable count, derived with `pnpm exec playwright test --list --project=crew-offline-chromium --project=crew-offline-webkit <spec>` and pasted with that command in the comment, never typed from memory. Raise `timeout-minutes` at `.github/workflows/crew-e2e.yml:99` by the measured duration of the offline cases plus margin, recording the measurement. Then run `tests/ci/_metaE2eWorkflowCoverage.test.ts`, `tests/cross-cutting/workflowActivation.test.ts` and `tests/cross-cutting/ci-workflow-speedup.test.ts` scoped.

**Commit:** `infra: run the crew offline e2e in crew-e2e`

### Task 27: Layout dimensions in a real browser

<!-- task: red=`CI=1 E2E_PORT=3417 CREW_E2E_ONLY=1 pnpm heavy pnpm exec playwright test --project=crew-offline-chromium --project=crew-offline-webkit tests/e2e/crew-offline-layout.spec.ts` red-state=authored red-target=`components/offline/SavedCopyBar.tsx` why=`the bar carries no sticky, top or z-index class yet, so after scrolling past the header its top is far below the viewport top and the elementFromPoint check lands on section content` ac=AC-17 -->

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

**Assertions (both engines, saved copy served with `refuse`, 390x844), all through `getBoundingClientRect()` within 0.5 px:** bar width equals `crew-shell` width; bar height equals `saved-copy-bar-content` height plus the bar's vertical padding and borders read from computed style; after `scrollTo` past `page-header`'s bottom plus 200 px, bar top is 0 and `document.elementFromPoint` at the bar's centre is inside the bar; at 320 px width the content wraps (premise: content height exceeds one line height) and `saved-copy-bar-icon` keeps the size its class declares. The z-index class is an existing token (`app/globals.css:80` lists them), chosen above the sub-nav's `z-raised`.

**Commit:** `feat(crew-page): bar layout invariants pinned in a real browser`

### Task 28: Transition audit and the `updated` fade

<!-- task: red=`pnpm exec vitest run tests/components/offline/savedCopyBarTransitionAudit.test.ts tests/components/offline/savedCopyBarTransitions.test.tsx` red-state=authored red-target=`components/offline/SavedCopyBar.tsx` why=`updated still unmounts instantly when its 4-second window ends, so the fade-phase, reduced-motion and fade-cancel cases fail, and the bijection has no declared row for the fade conditional` ac=AC-18 -->

**What is red and why:** Task 20 ends `updated` instantly; the fade cases fail and the AST audit finds the bar's conditionals with no `DECLARED` row for the fade.

**Files**

```text
create  tests/components/offline/savedCopyBarTransitionAudit.test.ts
create  tests/components/offline/savedCopyBarTransitions.test.tsx
edit    components/offline/SavedCopyBar.tsx     (the 200 ms fade, skipped under reduced motion)
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

**GREEN:** when the 4-second window ends, the bar enters a fade phase (`opacity-0` with a `transition-opacity` class using the 200 ms motion token) and unmounts on `transitionend` or after 200 ms; when `matchMedia("(prefers-reduced-motion: reduce)")` matches, it unmounts at once.

<!-- spec-lint: ignore — new file created by this plan; not tracked until implementation -->
**Audit (modelled on `tests/components/auth/avatarMenuTransitionAudit.test.ts:130`):** every ternary, `&&`, `||`, `if` and `switch` in `components/offline/SavedCopyBar.tsx` is claimed by exactly one `DECLARED` row with a treatment, and every row matches exactly one conditional; a premise that the census found a real population; no `transition` or `duration` class on any element except the fade. **Behavioral:** the 28 pairs are generated from the `BarState` union and each non-fade pair asserts the new state renders in the same commit with no transition class (instant); the fade pair asserts the intermediate faded frame then removal at 200 ms; reduced motion removes at once; the four compound transitions above.

**Commit:** `feat(crew-page): bar transition audit and updated fade`

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
| Transition audit (Task 28) | conditional added without a row; row left after its conditional is deleted; transition class added to an instant branch |

A reviewer-proposed family outside this set is admissible only with a live escaping mutant against the shipped guard.

---

## 10. Closeout

1. Full suite: `pnpm heavy pnpm test`.
2. `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`.
3. Audits: `pnpm test:audit:x2-no-raw-codes` (no raw code renders; the bar compares `sheet_unavailable` only inside lib/offline/barState.ts), `pnpm test:audit:x3-trust-domain`, `pnpm test:audit:validation-schema-parity`.
4. Worker freshness by regeneration: `pnpm gen:sw` followed by `git diff --exit-code` on the generated directory.
5. Registry counts: re-run the §2.1 pipeline and compare with 14, 67, 5, 9, 13, 9, 6.
6. Every `red-target` with a line number in §7 is re-read and matched to the symbol its `why` names (line drift from this plan's own edits is the documented failure of that check).
7. E2E: the §8 command, then the whole crew-e2e set the workflow runs, under `pnpm heavy`, with `CI=1`.
8. `pnpm heavy pnpm build`.
9. Help screenshots: if the screenshots-drift job reds because crew pages now register a worker, investigate rather than regenerate; any local capture is followed by `git restore public/help/screenshots/`.
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
