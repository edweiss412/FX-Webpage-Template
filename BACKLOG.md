# BACKLOG

Speculative / lower-priority hardening items. "Might do" — not blocking, no concrete near-term trigger. (Contrast `DEFERRED.md`: "will do, concrete trigger".)

---

## BL-ROLE-VOCAB-STAGING-OVERLAY — run the role-mapping overlay in the wizard staging/rescan pipeline

**Filed:** 2026-07-16 (extend-role-scope-vocab whole-diff R1, `DEFERRED.md` ROLE-VOCAB-2) · **Class:** UX completeness (staged preview parity) · **Effort:** M (staging-core change + step-3 preview semantics + tests)

The wizard rescan parses without the role-mapping overlay, so a just-recognized role's `UNKNOWN_ROLE_TOKEN` warning persists in step 3 until publish (staged saves always `apply_pending`; mapping applies at finalize via phase2 — no data loss). Integrate the overlay (or a use-raw-style decision-display state on the control) into the staging path so step 3 previews post-overlay state and the staged `"applied"` branch becomes reachable (spec §8.3 amendment 2026-07-16 reserves it).

## BL-MUTATION-LEDGER-ROLETOKEN-DRIFT — ✅ RESOLVED IN-PR (2026-07-16): ledger re-blessed on feat/extend-role-scope-vocab

**Filed:** 2026-07-16 (extend-role-scope-vocab Task 15) · **Class:** benign ledger drift · **Effort:** S (corpus re-run + surgical re-bless)

The `roleToken` field added to `UNKNOWN_ROLE_TOKEN` warnings (feat/extend-role-scope-vocab) changes parse output for every corpus fixture whose mutated cells produce unknown role tokens, so the redacted parse-output fingerprints in `tests/parser/mutation/knownHoles.ts` drift. Local run 2026-07-16: **~1013 DRIFTED fingerprint rows across 7 shards — SAME siteIds, fingerprint-only (`driftedAlarms`/`driftedStale`), zero NEW siteIds, zero fixed holes** — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER status above: fixture-data-driven sites; a source edit cannot add a site). The nightly `mutation-harness` workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it does not gate this PR. **Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run --project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the next mutation-file-touching PR or the first post-merge nightly triage.

**Resolution (2026-07-16):** the nightly on MAIN went red with this exact class the same day, promoting the refresh into this PR. Root cause correction: the drift is ENTIRELY from PR #388-era parser-output changes — the `roleToken` field is empirically fingerprint-neutral (collection dumps from main's parser and this branch's parser are byte-identical). Full corpus collection on the branch + surgical `reconcileLedger` drift-bucket re-bless: 7912 rows, 1017 fingerprints swapped, 0 new holes, 0 fixed holes (machine-verified pure drift; the re-bless script fails loud otherwise). First post-merge nightly should be green.

## BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID — one-line desktop grid rows for the roles settings list

**Filed:** 2026-07-16 (extend-role-scope-vocab impeccable dual-gate, `DEFERRED.md` ROLE-VOCAB-1) · **Class:** UX density (P2) · **Effort:** S (responsive layout branch + tests + dual-gate re-run)

`/admin/settings/roles` renders the stacked mobile card at every viewport; the committed mock (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html`, Desktop width section) specifies a compact one-line grid row (`150px | chips | meta | actions`, short "Edit" label) at >=760px. Implement the desktop variant when the list grows past ~8 rows or Doug reports desk-context sparseness. UI work -> Opus + invariant-8 impeccable dual-gate.

**Status:** ✅ SHIPPED — `feat/role-vocab-settings-desktop-grid` (PR #402, 2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`). Single-DOM responsive branch in `RoleMappingRow` (`min-[760px]:` grid, header dissolves via `contents`, panels `col-span-4`), `max-w-3xl` container, `EDIT_LABEL_SHORT` re-added behind a constant Edit `aria-label`. Real-browser layout gate `tests/e2e/roles-settings-layout.spec.ts` (desktop-chromium). Dual-gate: critique 33/40, audit 20/20, no P0/P1 (`docs/superpowers/plans/2026-07-16-role-vocab-settings-desktop-grid/DUAL-GATE.md`).

## BL-EXTEND-ROLE-SCOPE-VOCAB — map novel role tokens to scope-capability flags

**Filed:** 2026-07-10 (admin field-override removal, `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` §1/§6) · **Class:** capability gap · **Effort:** M (needs a visibility-mapping design)

When a crew member's role in the sheet is a legitimate token the parser doesn't recognize, `role_flags` resolution fails closed (`UNKNOWN_ROLE_TOKEN` → no flag) and that person gets no scope tiles. `role_flags` are a **closed vocabulary** gating scope-tile visibility (`lib/visibility/*`), so editing the sheet cannot elicit the correct scope — the token is spelled fine, the app just doesn't map it. This is one of the two residual needs the removed admin field-override feature was gesturing at but did not properly solve (an override stored a display value, not a capability mapping). **Follow-up:** let an admin map a novel/unrecognized role token to the correct scope-capability flags so it grants the right tiles. Needs a visibility-mapping design (where the mapping lives, per-show vs global, how it survives re-sync, audit trail). Explicitly NOT a free-form value override — it maps a token to a closed-vocab capability set.

**Status:** ✅ SHIPPED — `feat/extend-role-scope-vocab` (PR #396, 2026-07-16; spec `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md`). Global `role_token_mappings` table (capability-checkbox model: Audio/Video/Lighting/Financial details, recognize-only valid), pure post-parse overlay applied in phase 2, `ROLE_TOKEN_MAPPED` telemetry with delta gate, admin control on UNKNOWN_ROLE_TOKEN warnings + `/admin/settings/roles` list page. Two residual UX items deferred → `BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID`, `BL-ROLE-VOCAB-STAGING-OVERLAY`.

## BL-STRUCTURAL-TRANSFORM-USE-RAW — "use the sheet's raw value" reversal on recoverable structural transforms

**Filed:** 2026-07-10 (admin field-override removal, `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` §1/§6) · **Class:** correction gap · **Effort:** M–L (per-transform revert semantics)

The one territory where a sheet edit genuinely **can't** elicit correct output: transforms where the sheet is right but the parser mis-structures it and no reword fixes it — room name/dim split (`lib/parser/blocks/rooms.ts`), hotel guest/address glue (`lib/parser/blocks/hotels.ts`), and inverted check-in/out date ordering. The raw value is **already captured** on the corresponding ambiguity warnings (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY` — ambiguity-warnings-v1 #367). **Follow-up:** an admin affordance attached to those recoverable structural-transform warnings that says "decline this transform / use the sheet's raw value," deriving the corrected value from the sheet's raw content (never fabricated in-app — no second source of truth). Needs per-transform revert semantics (what "raw" means for each transform, how the reversal survives re-sync, how it renders). This is the sheet-canonical-preserving successor to the removed override layer, scoped to structural transforms only (NOT verbatim fields, which are sheet-editable).

**Status:** ✅ SHIPPED — `feat/structural-transform-use-raw` (spec `docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md`). Content-pinned decisions, pure post-parse overlay, both admin surfaces. One residual UX enhancement deferred → `BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE`.

## BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE — wizard use-raw toggle beyond the 3-per-section callout cap

**Filed:** 2026-07-15 (structural-transform use-raw whole-diff review R4, `DEFERRED.md` USE-RAW-1) · **Class:** UX completeness (P2) · **Effort:** S–M (thread props + invariant-8 impeccable dual-gate + Playwright/component tests)

The Step-3 wizard renders the use-raw toggle only inside `SectionFlagCallout`, which caps at `CALLOUT_MAX_ENTRIES = 3` per section (`components/admin/wizard/step3ReviewSections.tsx:519`). A section with >3 recoverable warnings (realistically only room-header splits in a room-heavy show) leaves warnings 4+ without a wizard toggle — they collapse to "+N more in Parse warnings." Not a correctness bug: the decision is reachable post-publish on the uncapped per-show live page (`app/admin/show/[slug]/page.tsx:971-994`), content-pinned by `(code, contentHash)`, so it carries through. **Follow-up:** render the toggle for every in-scope recoverable warning in the wizard's full uncapped `WarningsBreakdown` list (`:2374`), matching the live page — threading `useRawDecisions`/`wizardSessionId` into that component and resolving the summary-callout-vs-full-list redundancy (either the breakdown becomes the sole actionable site or the callout stays a compact preview). UI work → Opus + invariant-8 impeccable critique+audit + real-browser layout/transition tests.

**Status:** ✅ SHIPPED — `feat/use-raw-wizard-full-list` (PR #399, 2026-07-16; spec `docs/superpowers/specs/2026-07-16-use-raw-wizard-full-list-toggle.md`). WarningsBreakdown mounts `UseRawControlBoundary` + `RoleRecognizeControlBoundary` on every in-scope warning when `wizardSessionId` is threaded (callout kept as capped actionable preview); `stableWarningKeys` identity keys at both render sites (reorder state-migration guards); stale-sibling role-control contract pinned (idempotent/conflict). Three impeccable findings deferred → `DEFERRED.md` USE-RAW-FULL-LIST-1/2/3 (`BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`, `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`, `BL-WIZARD-WARNINGS-COPY-QUALIFIER`).

## BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION — demote SectionFlagCallout to pure preview (title + jump only)

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-1) · **Class:** UX simplification (P1→ratified+deferred) · **Effort:** S

With PR #399 the wizard's `WarningsBreakdown` is a complete actionable list, so a warning in the first 3 of its section's callout has two live control instances. Use-raw converges via `router.refresh()`; the recognize-role control deliberately performs no client refresh (2026-07-15 §8.1 timing contract), so a recognized role leaves the sibling instance in create mode until navigation — resubmit resolves deterministically (set-equal → idempotent, different → benign conflict notice; pinned by `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`) but can momentarily confuse. Keep-both is the ratified spec decision (spec §2.1/§4.6, 2026-07-16). **Follow-up:** if Doug reports double-recognizing from the two sites, demote the callout to a compact preview (title + jump link, no mounted controls), revisiting the keep-both ratification. UI work → Opus + invariant-8 dual-gate.

## BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y — site-scoped testids + qualified aria-labels for duplicated warning controls

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-2) · **Class:** accessibility (P2) · **Effort:** S–M (touches shared controls + every existing control test)

Both render sites emit identical `data-testid` values (`use-raw-control`, `role-recognize-control`, toggle ids) and identical radiogroup `aria-label`s — screen-reader users hear the same group twice per warning with no disambiguation, and unscoped `getByTestId` queries multi-match. Fix lives inside the shared `UseRawControl`/`RoleRecognizeControl` components (site-scoped testids, warning-title-qualified aria-labels); blast radius spans the live page and all existing control tests. All in-repo queries are container-scoped today, so nothing is broken. **Follow-up:** land with the next accessibility pass over the wizard modal or any diff already touching the shared controls.

## BL-WIZARD-WARNINGS-COPY-QUALIFIER — qualify the "informational / don't block publishing" line above consequential controls

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-3) · **Class:** copy (P2) · **Effort:** XS

The §3.10-pinned "These are informational and don't block publishing" line now headlines rows whose controls can grant financial access (recognize-role) or rewrite crew-visible values (use-raw). Still factually true — warnings never block publishing and the controls are optional — but the framing undersells consequence. **Follow-up:** qualify at the next wizard copy pass (copy is §3.10-pinned; requires the spec-copy update discipline).

## BL-CREW-RENAME-SILENT-REPLACEMENT — rename (drop+add) bypasses the single-drop shrink gate on published shows

**Status:** ✅ RESOLVED — `feat/crew-rename-shrink-gate` (PR #383, 2026-07-11). Option A tiered, per spec `docs/superpowers/specs/2026-07-10-crew-rename-shrink-gate.md` (4 adversarial rounds APPROVE): the publish gate now keys on crew **removal-class items** (MI-13/MI-14 pairs + their orphan-removes) instead of net `crewDrop`, so drop+add can no longer mask a removal (net-zero rename AND swap both hold); MI-12 (same canonical email) auto-links as an identity-preserving in-place rename — `crew_members.id` survives, so the picker cookie keeps resolving; confirmed MI-13/14 holds also link on the version-bound accept (confirm = vouch); unconfirmed heuristic pairs never merge identities (fail-safe re-pick). `describeShrink` names rename candidates/removals (8-part cap). `undo_change` analyzed and deliberately unchanged (no FK references `crew_members(id)` in the final schema; linked + replaced undo shapes pinned by DB tests). No schema change, no UI files.

**Filed:** 2026-07-10 (e2e preparedness re-rating, `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §10) · **Class:** seam gap (P0-1 residual) · **Effort:** S–M (rename-vs-drop classification)

The #359 fix routes `crewDrop === 1` on published shows through the `shrink_held` confirm path (`lib/sync/phase1.ts:441-444`; MI-6 proper still fires only at `crewDrop > 1`, `lib/parser/invariants.ts:250-252`). But a **rename** arrives as drop+add in the same sync — net crew delta 0 — so neither gate fires: the old member row is silently replaced on a published show. Consequences match the original P0-1: the renamed member's picker identity vanishes (their cookie gets the re-pick banner, so crew-side is fail-safe), and Doug's only trace is an unsurfaced changes-feed row. Two further known carve-outs, both **by design**: unpublished shows auto-apply single drops (`phase1.ts:44`), and `onboarding_scan` mode is excluded from the gate (`phase1.ts:441`). **Follow-up:** classify drop+add pairs within one sync (name-similarity and/or matching email/phone on the added row) as a rename candidate and either auto-link identity (preserve `crew_member_auth`/picker continuity) or route through `shrink_held` for confirm. Note MI-7b precedent: rename re-staging keyed on `(kind,name)` already exists for rooms — the crew rename class is the unhandled sibling.

## BL-MUTATION-LEDGER-REFRESH-AMBIGUITY — refresh known-holes fingerprints after ambiguity-warnings-v1

**Status:** ✅ RESOLVED — `feat/mutation-ledger-triage-classify` (2026-07-09). Refreshed via a full `COLLECT_MUTATION_ALARMS` corpus run + surgical re-bless: **1017 fingerprints swapped, 1 fixed hole dropped** (`merged-cell:fixed-income:B8:L48:X1` — the ambiguity parse change now CATCHES that mutant), ledger 7913 → 7912, **zero new holes** (no regression). The original "benign drift, NO new siteIds/holes" claim below held on the regression axis; the one correction is that there was also 1 coverage-improving FIX (a shrink, per the ratchet), not pure drift. The drop was proven legit, not a generation regression or flake (Codex #369 finding): the site is still GENERATED (1 of 853 merged-cell mutants on `fixed-income`) and its oracle verdict flipped `SILENT_WRONG` → `SIGNALED` (the ambiguity warning now makes the corruption visible). The SHIPPED harness never auto-heals — the shard assertion requires `fixedHoles == []`, so any future fixed hole reddens the nightly for human triage; the auto-drop was a supervised one-off in the re-bless tool. Same PR added drift/new/fixed classification to `reconcileLedger` (triage now names which bucket fired) and a schedule-only auto-filed tracking issue so a red nightly is no longer invisible.

The ambiguity-warnings-v1 feature adds four `severity:"warn"` ParseWarning codes (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `HOTEL_CARDINALITY_EXCEEDED`, `DATE_ORDER_SUGGESTS_DMY`), so the parser OUTPUT for any corpus fixture that now triggers one of them changes. The mutation harness fingerprints (a redacted parse-output hash) stored in `tests/parser/mutation/knownHoles.ts` `RAW_HOLES` therefore drift for those fixtures (e.g. `2026-04-asset-mgmt-cfo-coo-waldorf` `ref-sub` rows). **Confirmed BENIGN:** same `siteId`s, changed fingerprints only, NO new `siteId`s/holes — mutation sites are fixture-data-driven (`ref-sub`/`blank-row`/… corrupt input cells), not parser-source-line-driven, so a source edit cannot add a site. The nightly `mutation-harness` workflow (NON-required check, path-filtered to `tests/parser/mutation/**` + vitest wiring, self-documented "red is triaged, not a merge blocker") will flag these until the ledger is refreshed; the feature PR deliberately does NOT touch mutation files, so the workflow never ran on it. **Refresh:** run `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run --project mutation`, rebuild `RAW_HOLES` from the 8 shard dumps (comparison key is `siteId|kind|fingerprint`; `finding`/`note` are metadata), and commit. Trigger to promote: the next mutation-file-touching PR, or the first post-merge nightly triage.

## BL-TEST-PG-CLIENT-TEARDOWN — leak-proof postgres.js clients in DB tests

~55 test files (`tests/db/**`, `tests/notify/**`, `tests/sync/**`, `tests/onboarding/**`, `tests/agenda/**`, `tests/show/**`, `tests/app/admin/**`) create module-level `postgres(DB_URL, { max, prepare: false })` clients with **no `idle_timeout` and no `.end()`**. postgres.js default `idle_timeout` is 0 (never auto-close), so in the serial DB-test worker these pools hold their connections for the whole run and can exhaust local Postgres `max_connections` (~100) after a long session — surfacing as spurious "too many clients" failures on untouched code (the class `pnpm db:reset-pool` mitigates at runtime, added 2026-07-06).

Structural fix (scoped, TDD, needs local DB to verify — do NOT blind-sweep):

1. Shared factory `tests/db/testSql.ts` → `makeTestSql(opts)` returning `postgres(url, { max: 1, idle_timeout: 1, prepare: false, ...opts })`, registered in a module-level set; export `endAllTestSql()`.
2. Global per-file teardown: `afterAll(endAllTestSql)` (or the vitest global-teardown hook) so any factory client closes at end of each test file.
3. Migrate the ~55 files to the factory. **Exclude / hand-audit** the connection-hold tests — `*concurrency*`, `advisoryLock*`, deadlock/lock-topology tests — where an aggressive `idle_timeout` could drop a held connection mid-test and break lock semantics. Those keep an explicit long-lived client with a manual `.end()`.
4. Structural meta-test: fail if a `tests/**` file calls `postgres(` directly instead of `makeTestSql(` (allowlist the audited lock-hold exceptions).

Trigger to promote out of backlog: next time a full local suite exhausts the pool and `db:reset-pool` between runs stops being enough.

## INFO-tab data-fidelity audit (2026-06-29)

The seven items below were surfaced by a parser → review-modal → crew-page audit of the **AII/III - Consultants Roundtable** show (source sheet `1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4`). Every finding carries verified `file:line` evidence (parser re-run on `fixtures/shows/exporter-xlsx/consultants.md`). Full field-by-field table + evidence: **`docs/audits/info-tab-fidelity-audit-2026-06-29.md`**. Suggested order: parser-only cluster first (DRESS, ROOM-DEDUP, TITLE — GS-dims was investigated and is NOT a live parse drop, folded into BL-ROOM-DETAIL-UNRENDERED as render-only) → render surfaces (Opus + impeccable v3) → review-modal completeness.

### BL-PARSER-DRESS-DROP — capture the DRESS block (parser data drop)

**Status:** ✅ RESOLVED — PR #191 (2026-06-30) · **Severity:** high (systemic; crew never learn what to wear) · **Class:** DROPPED-BY-PARSER

`parseEventDetails` slices markdown from the `DETAILS` header (`lib/parser/blocks/event.ts:135`), but the INFO `DRESS` block sits **before** that header, so the `dress`/`attire`→`dress_code` aliases (`event.ts:97-100`) never fire; `crew.ts:34` uses `"DRESS"` only as a terminator. Verified: `parseEventDetails(...).dress_code === undefined` on both fixture families; `TodaySection.tsx:297-299,467` renders the dress card null. This is the standard exporter template layout → affects every show. **Fix (resolved in spec `docs/superpowers/specs/parser/2026-06-29-parser-info-tab-fidelity-design.md`):** add a dedicated `parseDress` independent of the DETAILS slice that captures the full DRESS block (header value + continuation rows) into the existing `event_details.dress_code` as a **label-retaining multi-line value** (`Set/Strike: …\nShow: …`) — both values preserved with zero loss, NOT new structured fields (which would be zombie fields; the sole consumer `TodaySection.tsx:297` reads `event_details.dress_code` only). TDD: assert both labeled lines populate from a DRESS-before-DETAILS fixture; the crew dress card renders immediately (no UI change). A richer two-card split can come with the deferred UI work.

### BL-ROOM-GEAR-MERGE-DEDUP — fix lunch-room duplication (parser fidelity)

**Status:** ✅ RESOLVED — PR #191 (2026-06-30) · **Severity:** high (real prod show renders the lunch room as two split cards, on crew + review) · **Class:** FIDELITY BUG

`mergeGearIntoRooms` (`lib/parser/index.ts:355`) matches a GEAR room to an INFO room by `(kind, name-token)`. The lunch room is INFO `breakout`/`"BALLROOM C"` vs GEAR `additional`/`"GRAND BALLROOM C"` (token normalizer `index.ts:328-336` strips `LUNCH SESSION` but not `GRAND`) → double miss → two cards (times on one, gear on the other). Verified via `parseSheet()` → 9 rooms; the lunch room is the only genuine duplicate. **Fix (resolved in spec `docs/superpowers/specs/parser/2026-06-29-parser-info-tab-fidelity-design.md`):** align the GEAR lunch kind to `breakout` AND strip a leading `GRAND` from the GEAR lunch room NAME — both **scoped to gear.ts's `^LUNCH` branch only** — so the GEAR lunch room becomes `(breakout, "BALLROOM C")` and merges onto the INFO lunch room. The `(kind, name-token)` merge key and the shared `gearNameToken` are **preserved unchanged** (per the R8-H1 decision at `index.ts:341-348` — do NOT relax to token-only / drop `kind`, and do NOT globally strip `GRAND`, which would false-merge distinct same-kind `GRAND X`/`X` rooms). The generic `"Additional rooms"` card (`rooms.ts:158-167`) and GEAR `"FOYER"` (real gear) are **intentional and stay** — they only look empty in the Step-3 modal, which is the M2 modal-render gap (`BL-REVIEW-MODAL-COMPLETENESS`), not a parser bug. TDD: assert exactly one `BALLROOM C` room (kind `breakout`) carrying both the INFO times and the GEAR gear; plus a collision negative — a non-lunch `GRAND X`/`X` same-kind pair must NOT merge.

### BL-EVENT-DETAILS-UNRENDERED — surface the technical DETAILS specs to crew + operator (render gap)

**Status:** ✅ RESOLVED — PR #195 (2026-06-30) · **Severity:** high (crew-impacting) · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus + impeccable v3

The parser captures all 19 `event_details` keys but the crew page renders 5 and the review modal 2 (`Step3SheetCard.tsx:380-385`). Never rendered anywhere: **Stage Size, GS Podium Type, Polling, LED, Backdrop/Scenic, Equipment Storage, Test Pattern, Fonts** (+ sentinels). No component iterates the `event_details` map. **Fix:** a crew-facing Tech-Specs card (Venue or Gear section) iterating the full map with sentinel-hiding (highest crew impact: stage size, podium, polling); extend `EventDetailsBreakdown` to render all non-sentinel keys for the operator pre-publish. **Shipped:** shared closed-vocab whitelist `lib/crew/eventDetailsSpecs.ts` (`EVENT_DETAILS_LABELS` + `CREW_TECH_SPEC_KEYS`) feeding (1) a full-width "Tech specs" card in `GearSection` (2-col `KeyValueRows`, sentinel-hidden, `gear-tech-specs` card-id → `details` deep-link) and (2) the extended `EventDetailsBreakdown` (all known text specs, shown as-parsed incl. sentinels — the existing review-surface contract).

### BL-ROOM-DETAIL-UNRENDERED — deliver per-room setup/dimensions/floor/times

**Status:** ✅ RESOLVED — PR #197 (2026-06-30) · **Severity:** medium · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus

`room.setup` ("Chevron theater for 60" / "Boardroom for 12"), `room.floor`, `room.dimensions`, and per-room set/show/strike times are parsed but read by zero components; per-room times collapse only into the show-wide `KeyTimesStrip`. **Correction (2026-06-29, spec review):** GS dimensions are NOT a parse drop on live data — the live Consultants sheet carries them **inline** in the `GENERAL SESSION\nNAME\nDIMS\nFLOOR` header cell, which `splitRoomHeader` already captures (pinned by `tests/parser/exporterFixtures.test.ts:1168-1185`; the standalone-`ROOM DIMENSIONS:`-row shape is obsolete). The earlier "parse drop" reading was an artifact of the stale `exporter-xlsx` fixture; a separate-row backfill was attempted in the parser-cluster spec and DROPPED. **Fix (this BL):** purely render — show setup + dimensions + floor + per-room times per room on crew Gear/Venue + the review modal. If a genuine live capture gap is found, design it against the inline-header shape, not the obsolete standalone row. **Shipped:** render-only via shared `lib/crew/roomDetailFields.ts` (`ROOM_DETAIL_FIELDS`) feeding (1) a room-first "Room details" card in GearSection (`gear-room-details` → `rooms`; per-room `<h3>` + single-column `KeyValueRows` of dimensions/floor/setup + set/show/strike times; sentinel-hidden, cap 12) and (2) the Step-3 `RoomsBreakdown` per-room detail sub-list (as-parsed). No parser change (live-verified: East Coast populates these inline; Consultants is sentinel-empty → card hides). `power`/`digital_signage`/`notes` deliberately excluded.

### BL-REVIEW-MODAL-COMPLETENESS — close the Step-3 publish-gate blind spots (review-only gap)

**Status:** ✅ RESOLVED — PR #199 (2026-06-30) · **Severity:** medium · **Class:** REVIEW-ONLY GAP · **Routing:** UI → Opus + impeccable v3

The modal body is exactly 6 BreakdownSections + Agenda + Warnings (`Step3SheetCard.tsx:1431-1472`). It omits transportation (T1-T7), loading dock (V3), COI/Proposal/PO# (O1-O3), client contact (C2-C4), in-house AV (O5), hotel contact (O4), 17/19 event-details, crew phone, venue address, hotel address — all of which DO render on the published crew page. So the operator cannot pre-publish-verify this data. **Fix:** add operator-only review sections (Transport, Loading dock, Ops/COI/PO, Contacts, full Event details, addresses, crew phone) so the gate sees everything the crew page will show. **Shipped:** event-details + room-detail already closed by #195/#197; #199 added 4 new BreakdownSections (Venue, Transport, Contacts incl. client+secondary, Billing & docs = COI/Proposal/PO/Invoice) + Crew(+phone)/Hotels(+address), all from ParseResult, as-parsed via `contentRows`/`hasContent` (no SourceLink; confirmation_no stays private). PO/Proposal read ungated from `pr.show.*` (modal is admin-only).

### BL-TITLE-EVENT-NAME-PREFERENCE — prefer the line-1 banner over the "Event Name:" cell (parser fidelity)

**Status:** ✅ RESOLVED — PR #191 (2026-06-30) · **Severity:** medium · **Class:** FIDELITY BUG

`extractTitleFromMarkdown` priority #1 (`lib/parser/index.ts:121-133`) returns the first `"Event Name:"` cell — `"AII/III - CONSULTANTS ROUNDTABLE"` (uppercased, `2025` dropped) — before the proper line-1 banner `"AII/III - Consultants Roundtable 2025"` (priority #6). Mangled title renders on the crew header (`Header.tsx:83,98`) + review-modal link (`Step3SheetCard.tsx:10`). **Fix:** prefer the line-1 banner; fall back to `"Event Name:"` only when no banner exists. TDD: assert proper-case + year preserved for the consultants fixture.

### BL-CREW-PARTIAL-ATTENDANCE-CHIP — show who is partial-attendance to teammates (render gap)

**Status:** ✅ RESOLVED — PR #201 (2026-06-30) · **Severity:** low–medium (coordination gap) · **Class:** PARSED-NOT-RENDERED · **Routing:** UI → Opus

`(10/7 ONLY)` / `(10/7 and 10/9 ONLY)` are stripped from names into `date_restriction` (`personalization.ts:118-126`) and drive the viewer's own schedule, but no roster surface shows a badge — `CrewSection.tsx:175-183` (crew) and `CrewBreakdown` (`Step3SheetCard.tsx:194-199`) render name+role only. **Fix:** render a small "Oct 7 & 9 only" chip from `date_restriction.days` next to the role on both the crew roster and the review modal. **Shipped:** new `humanizeDayList` + shared `lib/crew/partialAttendance.ts` `partialAttendanceLabel({humanize})` → a mixed-case `PersonRow` chip (`data-partial`, CalendarDays glyph, "Oct 7 & 9 only" / "Partial (dates TBD)"; not viewer-gated) on the crew roster + an as-parsed inline `· …` segment in the Step-3 `CrewBreakdown`. Render-only.

---

## BL-FINALIZE-APPROVAL-DECISION-RACE — re-read the full finalize decision row under the per-show lock

**Status:** ✅ RESOLVED — PR #188 (2026-06-29) · **Severity:** medium (pre-existing; narrow window; recoverable) · **Surfaced:** agenda-PDF-schedule whole-diff review R8 (2026-06-29)

**Resolution:** Shipped per the recommended fix below. The generation-scoped locked re-read was widened from `parse_result`-only to the full decision row (kept in place after the Drive fence), the version gate moved to after `coercedRow`, every checked/unchecked branch re-pointed to the locked `coercedRow.*`, and a finishable re-validation skip added (forward-defense). Spec: `docs/superpowers/specs/data-quality/2026-06-29-finalize-approval-decision-race-design.md`; plan: `docs/superpowers/plans/data-quality/2026-06-29-finalize-approval-decision-race.md`; tests: `tests/onboarding/finalizeApprovalRace.test.ts`. Client defense-in-depth (recommended-fix item 3 below) was intentionally NOT shipped — the server-side locked re-read fully closes the race.

**Problem.** `finalize` reads `wizard_approved` (and approval provenance, reviewer choices, failure code, manifest status) at _select_ time in `selectFinishableCleanRows`, BEFORE taking the per-show row lock. The approve/unapprove routes serialize on the **same** `show:` advisory lock. So a concurrent approve/unapprove that commits _after_ finalize's select but _before_ finalize acquires that row's lock makes finalize act on the **stale** select-time `wizard_approved`: a row the operator just unchecked can publish, or a row just checked can be Held. The operator's final checkbox intent is then not what ships.

**Pre-existing.** Verified at merge-base `0481c9dc` (before the agenda feature): finalize always used the select-time `wizard_approved` with no locked re-read. The agenda feature added ONLY a generation-scoped `parse_result` re-read under that lock (for agenda publish-safety); it did **not** introduce or worsen this race. The approve route updates `wizard_approved` **without** bumping `staged_modified_time`, so the agenda feature's generation-scoped re-read does not catch it.

**Why deferred (not fixed in the agenda PR).** Fixing it correctly means extending the locked re-read to the FULL decision row and re-driving finalize's 4-branch checked/unchecked/Held/failure split from the locked values — a substantial change to the intricate finalize state machine (the `finishable` predicate `wizard_approved = true OR last_finalize_failure_code is null`, the failure-code lifecycle, manifest `publish_intent`). A naive "demote on `wizard_approved` change" interacts badly with that predicate (a demoted unchecked-clean row may not be re-selected on the next finalize). This is finalize-core concurrency work, orthogonal to agenda extraction, and belongs in a focused finalize PR — not bolted onto a feature PR where it expands blast radius on the publish path.

**Recommended fix (for the focused PR).**

1. Inside the per-show locked tx, generation-re-read the full finalize decision row — `wizard_approved`, `wizard_approved_by_email`/`wizard_approved_at`, `wizard_reviewer_choices`, `last_finalize_failure_code`, manifest `publish_intent`/status — not only `parse_result`.
2. Drive ALL checked/unchecked/Held/failure branching from that locked re-read; re-validate the `finishable` predicate against the locked values; route a row that no longer matches to a typed per-row skip/retry (NOT a publish/Held on stale intent), with careful handling of the failure-code lifecycle so a re-finalize re-selects it correctly.
3. Defense in depth (client): disable/serialize the Step-3 "Finish" action while approval-checkbox writes are in flight.
4. Regression: commit an approve/unapprove AFTER `selectFinishableCleanRows` but BEFORE `processApprovedRow` takes the show lock; assert finalize honors the latest intent (publishes the checked, Holds the unchecked).

**Reference:** `app/api/admin/onboarding/finalize/route.ts` (`selectFinishableCleanRows` ~:346, `processApprovedRow` ~:710 incl. the agenda re-read ~:729); approve `app/api/admin/onboarding/staged/[wizardSessionId]/[driveFileId]/approve/route.ts:125`.

## BL-WATCH-RECONCILE-BACKOFF — dedicated reconcile cron + backoff state for watch channels

**Status:** OPEN · **Severity:** low (Approach A ships hourly reconcile; this is the richer variant) · **Surfaced:** watch-channel-health brainstorming (2026-07-01), user-ratified as backlog

Approach B from `docs/superpowers/specs/observability/2026-07-01-watch-channel-health-design.md` §2/D1: a dedicated `fxav_cron_reconcile_watch` (`*/15`) plus a `drive_watch_reconcile_state` table (attempts, `next_attempt_at`, last error class) giving precise exponential backoff and faster recovery than the shipped hourly reconcile pass. Adopt if the hourly cadence proves too slow in practice (e.g., renewal failures near show start) or if escalation cadence needs sub-hour precision. Costs: new cron + migration + validation-parity surface + cronJobsParity/pg-cron registrations + more tests.

## BL-COPY-CRON-SWEEP — de-jargon "cron" across the remaining catalog codes

**Status:** ✅ RESOLVED (2026-07-03, branch `chore/copy-cron-sweep`) · **Severity:** low (copy quality; admin-facing) · **Surfaced:** watch-channel-health spec §3.5 (2026-07-01)

All four catalog entries de-jargoned via the §12.4 three-way lockstep (spec prose + `pnpm gen:spec-codes` + catalog.ts, x1 gate green): `STAGED_PARSE_SUPERSEDED` ("a cron run" → "an automatic sync"), `NO_FOLDER_CONFIGURED` ("Cron ran" → "The automatic sync ran"), `MISSING_PENDING_INGESTION_MODTIME` ("so cron knows" → "so the scheduled sync knows"), `SYNC_DELAYED_SEVERE` ("Push or cron is stalled" / "normal cron interval" / "the cron job" → "the scheduled sync" phrasing, plus the sibling "push subscriptions" → "instant updates" per user's cron+push scope choice). Replacement vocabulary matches the shipped `WATCH_CHANNEL_ORPHANED` / `SYNC_STALLED` voice.

## BL-COPY-CRON-SWEEP-2 — de-jargon "cron" on the two non-catalog admin surfaces

**Status:** OPEN · **Severity:** low (copy quality; admin-facing) · **Surfaced:** BL-COPY-CRON-SWEEP execution (2026-07-03)

The cron sweep of the catalog surfaced two more admin-facing "cron" mentions outside the §12.4 catalog, left out of the copy-lockstep PR because both are UI files (`app/**`, so touching them would drag the impeccable dual-gate into a pure-copy PR): `app/admin/settings/page.tsx:306` ("per-job cron run health for troubleshooting") and `app/help/admin/onboarding-wizard/page.mdx:117` ("points cron at the folder for ongoing sync"). Neither is a §12.4 code, so neither needs the three-way lockstep — but both should ship through the UI gate (Opus + impeccable) if picked up. Re-grep line numbers before executing.

---

## Picker-flow app bugs (3) — surfaced by the skipped picker-flow e2e (PR #60)

PR #60 landed the picker-flow e2e (`tests/e2e/picker-flow.spec.ts`) with three `test.skip` stubs whose SKIP comments each say the blocker is **app behavior, not a helper/config gap**. PR #60's summary claimed these were "filed as follow-ups in BACKLOG.md," but no entries existed — the bugs lived only as `// SKIP:` comments and are still live. These three entries make the tracking honest. Do NOT un-skip the tests until the paired app fix ships; enabling a stub without its fix just re-surfaces a known red. (Each SKIP comment records a direct repro.)

### BL-PICKER-BOOTSTRAP-HOST-FLIP — bootstrap redirect canonicalizes 127.0.0.1 → localhost and drops the auth cookie

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (blocks the authed picker-bootstrap leg; the host flip drops the host-scoped Supabase auth cookie) · **Class:** APP-BEHAVIOR BLOCKER

The authed leg redirects through `/api/auth/picker-bootstrap`, whose `NextResponse.redirect(new URL(nextOutcome.path, request.url), …)` (`app/api/auth/picker-bootstrap/route.ts:181,199`) canonicalizes the host `127.0.0.1` → `localhost` (`request.url` reports `localhost` even under `pnpm start -H 127.0.0.1`; `NEXT_PUBLIC_SITE_ORIGIN` does not influence it). That host flip drops the `127.0.0.1`-scoped Supabase auth cookie, so the revisit resolves to Mode A instead of `needs_picker_bootstrap` and the crew-shell never renders. Verified reproducing under both `pnpm dev` and `pnpm build && pnpm start`. **Fix:** emit a host-relative `Location` from the bootstrap redirect (app fix in `app/api/auth/picker-bootstrap/route.ts`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:77` ("first-contact gate -> tap 'Sign in with Google' -> OAuth happy path -> show body renders"; SKIP note at :68).

### BL-PICKER-GATE-SKIP-MISMATCH — "Continue as guest" can't reach the picker while an authed non-roster session persists

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (a cleared-but-present session can't reach the picker via guest-skip) · **Class:** APP-BEHAVIOR BLOCKER

"Continue as guest" (`clearIdentityAndSkip`, wired at `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:96`) clears the stale picker entry, but the browser STILL carries the authed non-roster Google session, so the post-action resolve is `reason: 'google_mismatch'` (NOT `first_contact`); `page.tsx` honors `?gate=skip` only for `first_contact` (`app/show/[slug]/[shareToken]/page.tsx:25-28,77`), so the Mode B mismatch gate re-renders and `picker-interstitial-root` never mounts. Confirmed by direct repro: after the guest click the page stays on the Mode B gate (mismatch header still visible), not the picker. **Fix:** let the gate semantics reach the picker via `?gate=skip` when the session is present-but-cleared (app decision in `app/show/[slug]/[shareToken]/page.tsx` + `clearIdentityAndSkip`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:173` ("Mode B 'Continue as guest' atomically clears the stale entry and lands on the picker"; SKIP note at :164).

### BL-PICKER-CLAIMED-ROW-NEXT-DROP — claimed-row recovery GET form discards the `next` query param

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (post-sign-in return target is lost on the claimed-row recovery path) · **Class:** APP-BEHAVIOR BLOCKER

The claimed-row recovery control is `<form action={signInRecoveryUrl} method="GET">` with NO hidden inputs (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:154`; `signInRecoveryUrl = /auth/sign-in?next=<encoded>` built at :86). On a GET submit the browser DISCARDS the action URL's query string and rebuilds it from the (empty) form fields, so the navigation lands on bare `/auth/sign-in` with no `?next=`. `waitForURL(/auth/sign-in\?next=/)` therefore never matches (final page is `/auth/sign-in` with no `next`). **Fix:** carry `next` as a hidden `<input>` rather than in the action query (app fix in `_PickerInterstitial.tsx`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:234` ("Deactivated row: tapping a claimed crew member redirects through /auth/sign-in"; SKIP note at :226).

---

## BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE — auto-resolve GITHUB_BOT_LOGIN_MISSING on successful bot auth

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: GITHUB_BOT_LOGIN_MISSING / DEFER)

The `GITHUB_BOT_LOGIN_MISSING` alert tracks that the bot login env is unset (`lib/reports/submit.ts:778`). This is config state observable inside the M8 report pipeline, but the review discipline for report features requires live GitHub integration probes. Auto-resolution deferred pending M8 shipping and validation-environment gates. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 line 94.

## BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE — auto-resolve branch-protection alerts on policy sync

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: BRANCH_PROTECTION_DRIFT / BRANCH_PROTECTION_MONITOR_AUTH_FAILED / DEFER)

`BRANCH_PROTECTION_DRIFT` and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` track state of the GitHub branch-protection CI monitor (`scripts/verify-branch-protection.ts`). Both are raised outside app runtime (CI-side ops script), making auto-resolution a separate ops-pipeline concern orthogonal to the app's admin-alert infrastructure. Deferred to a future branch-protection monitoring redesign. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 lines 95–96.

## BL-ALERT-REPORT-FAMILY-AUTORESOLVE — evaluate manual-by-design posture for report-family incidents

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: REPORT\_\* codes / EVENT)

The six report-family codes (`REPORT_ORPHANED_LOST_LEASE`, `REPORT_LOOKUP_INCONCLUSIVE`, `REPORT_DUPLICATE_LIVE_MATCHES`, `REPORT_OPEN_ORPHAN_LABEL`, `REPORT_LEASE_THRASHING`, `STALE_ORPHAN_REPORT`) are all incident notices and observational audit records (external GitHub state changes, impossible-state alarms). They're event-shaped by design and cannot auto-resolve on condition recovery because there is no recoverable condition — a manual acknowledgment is the correct workflow. Revisit post-M8 if new incident classes emerge that blur the event/state boundary. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 lines 88–93.

## BL-ALERT-TILE-RENDER-PER-TILE-KEYING — per-tile keyed auto-resolution for TILE_SERVER_RENDER_FAILED

**Status:** OPEN · **Severity:** low · **Class:** DEFERRAL (spec §3: TILE_SERVER_RENDER_FAILED / EVENT\*)

`TILE_SERVER_RENDER_FAILED` is state-shaped (a tile's render threw) but has no aggregation point: tiles stream independently per-request, and the alert row is deduped per (show, code) with `context.tileId` replaced on re-raise. Tile A's successful render cannot prove tile B is healthy; auto-resolving on any tile success masks ongoing failures. A per-tile-keyed redesign (persist `tileId` in the alert row, auto-resolve on that tile's next success) closes this structurally but requires schema change. See `docs/superpowers/specs/alerts/2026-07-03-admin-alert-auto-resolution.md` §3 line 76.

---

## BL-KNOWN-SECTIONS-WALKER — real auto-drift enforcement for the known-section-header registry

**Status:** OPEN · **Severity:** low (defense-in-depth; today's guard is a hand-maintained pin) · **Class:** TEST-ENFORCEMENT GAP

`tests/parser/_metaKnownSectionsRegistry.test.ts` is documented as a drift guard that keeps `KNOWN_SECTION_HEADERS` (`lib/parser/knownSections.ts`) from falling behind the block parsers, but it only asserts a **hardcoded** `REQUIRED_HEADERS` list ⊆ `KNOWN_SECTION_HEADERS`. Both lists are hand-maintained, so a new block parser whose header is registered in NEITHER list passes CI green and its rows would false-positive `UNKNOWN_SECTION_HEADER`. The docstrings in both files were corrected (audit idx87) to describe the real, narrower guarantee (catches an accidental DELETION of a registered header; does NOT detect a genuinely-new unregistered header).

**Why not fixed now:** a robust, low-false-positive walker over `lib/parser/blocks/*.ts` is not cheaply achievable without a parser refactor. Header detection is heterogeneous — plain uppercase literals (`col0Upper === "VENUE"`), lowercase literals (`label === "hotel stays"`), and **regexes** whose matched header is computed, not a literal (`event.ts` `EVENT_DETAILS_HEADER_RE`, `hotels.ts` `/^HOTEL\s+RESERVATIONS?$/`, `rooms.ts` `gsFieldRe`) — and only `dress.ts`/`client.ts` import from `knownSections.ts`. The block-parser sources are also dense with intentional non-header uppercase literals ("NAME", "PHONE", "LED", "TRAVEL", "FRIDAY", "II", "N/A", warning codes), so a naive "every uppercase literal must be registered" walker would need a large hand-maintained exclusion list — the same drift-prone artifact this would replace.

**Fix (when prioritized):** route ALL section-header detection through a single shared, introspectable constant/helper (e.g. a per-parser exported `SECTION_HEADERS` const the parsers match against), then have the meta-test import each parser's constant and assert it ⊆ `KNOWN_SECTION_HEADERS`. Add a proof test that an unregistered header fails. This closes the class structurally instead of by hand-maintained parallel lists.

---

## Secondary-name Drive-ID columns — deferred from the drive_file_id nonblank CHECK (2026-07-02)

The empty/whitespace `drive_file_id` DB-CHECK work (migration `20260702120200_drive_file_id_nonblank.sql`; spec `docs/superpowers/specs/data-quality/2026-07-02-empty-drive-file-id-check-design.md` §9) deliberately scoped itself to **every column named exactly `drive_file_id`** (14 public + 5 dev mirror). The two columns below are Drive-ID-bearing but carry a _secondary_ name and are **not reachable-empty**, so they were documented out of scope rather than silently dropped. The scope rule stays crisp ("every column named exactly `drive_file_id`").

### BL-OPENING-REEL-DRIVE-ID-NONBLANK — nonblank CHECK on `shows.opening_reel_drive_file_id`

**Status:** OPEN · **Severity:** low (not reachable-empty) · **Class:** DEFENSE-IN-DEPTH

`shows.opening_reel_drive_file_id` (`supabase/migrations/20260501000000_initial_public_schema.sql:16`, nullable) has no nonblank CHECK. Its write source `extractOpeningReel()` returns non-empty-or-null, and any read of it flows through the JS read-path guard (`assertNonEmptyDriveFileId`), so it is not reachable-empty from untrusted input. **Fix (when prioritized):** add `check (opening_reel_drive_file_id is null or opening_reel_drive_file_id ~ '[^[:space:]]')` (+ dev mirror) following the same idempotent DROP-IF-EXISTS/ADD shape as the primary migration. Ref spec §9.

### BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK — nonblank CHECK on `wizard_finalize_checkpoints.last_processed_drive_file_id`

**Status:** OPEN · **Severity:** low (cursor copy of an already-CHECK'd id) · **Class:** DEFENSE-IN-DEPTH

`wizard_finalize_checkpoints.last_processed_drive_file_id` (`supabase/migrations/20260501001000_internal_and_admin.sql:423`, nullable) is a cursor copy of a `drive_file_id` that is itself already covered by the primary nonblank CHECK, so a blank cannot originate here. **Fix (when prioritized):** add the nullable-form nonblank CHECK (+ dev mirror if the column is cloned) for defense-in-depth. Ref spec §9.

---

## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)

Deferred out of the forensic code-stamping batch (`docs/superpowers/specs/observability/2026-07-03-nullcode-forensic-batch2-design.md` §9) — separate user-facing / alerting surfaces beyond the pure log-code enrichment.

### BL-SCAN-SSE-BODY-NULL-CODE — onboarding scan SSE result body emits a user-facing `code:null`

**Status:** OPEN · **Severity:** low · **Class:** USER-FACING SURFACE

`app/api/admin/onboarding/scan/route.ts` emits `{ type: "result", body: { ok: false, code: null } }` to the client on catch (adjacent to the now-forensic-coded `ONBOARDING_SCAN_FAILED` log). The `code:null` is a distinct client-facing surface — arguably warrants a real §12.4 code so the client can catalog-look-up, but that is an expensive 3-way §12.4 change out of scope for the forensic batch. **Fix (when prioritized):** assign a cataloged code + regen `gen:spec-codes` + add the `catalog.ts` row.

### BL-PICKER-TAMPER-ADMIN-ALERT — selectIdentity tamper breadcrumb could also raise an `admin_alerts` upsert

**Status:** OPEN · **Severity:** low · **Class:** ALERTING GAP

`lib/auth/picker/selectIdentity.ts` logs a `PICKER_IDENTITY_CLAIMED_TAMPER` forensic warn on a hand-crafted claimed-row bypass, but does not raise an `admin_alerts` upsert. The forensic batch is code-stamping only; whether this security/tamper breadcrumb should also surface as an operator-visible admin alert is a separate alerting decision. **Fix (when prioritized):** design the alert severity/dedupe + add the `admin_alerts.upsert` under the per-show lock.

### BL-AGENDA-PERDAY-VIEWER-FILTER — Schedule agenda area is whole-show / not day-filtered for restricted crew

**Status:** OPEN · **Severity:** low · **Class:** VISIBILITY SCOPE

The Schedule section's Agenda area (`components/crew/sections/ScheduleSection.tsx:117-152`) renders `AgendaEmbed` + per-link `AgendaScheduleBlock` from `link.extracted` as a **whole-show** artifact: `AgendaScheduleBlock` receives no date/stage restriction and shows the full-show agenda to **every** viewer (the only branch that suppresses it is the `unknown_asterisk` early-return, `:157-168`). So date-restricted AND (post-#248) stage-restricted crew see the full-show agenda above their filtered day cards. This is pre-existing behavior, not introduced by #248 (spec §3.5) — a stage-restricted crew (e.g. Calvin, on-site to strike) legitimately benefits from the agenda, so it was scoped out. **Fix (when prioritized):** thread the effective visible-day set into `AgendaScheduleBlock` and filter its per-day rows to the viewer's worked days (affects all date-restricted crew, so decide the product posture first — whole-show vs per-viewer agenda).

### BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — quiet-link affordance family: small tap target + no SR new-tab announcement

**Status:** OPEN · **Severity:** low · **Class:** A11Y / RESPONSIVE

The shared quiet-link affordance (`components/admin/PerShowActionableWarnings.tsx:98` precedent, copied by the per-show alert action link in `components/admin/PerShowAlertSection.tsx`) is a `text-xs` underline anchor without `min-h-tap-min`, below the comfortable venue-floor thumb-target bar, and its external variant marks the `↗` as `aria-hidden` with no visually-hidden "(opens in new tab)" so screen readers do not hear the new-tab behavior. Surfaced by the 2026-07-04 alert-action-links impeccable dual-gate (handoff §12). **Fix (when prioritized):** family-wide — add a min-height tap padding treatment and a `sr-only` new-tab suffix to the shared affordance on BOTH surfaces in one pass, not per-call-site divergence.

### BL-ALERT-ACTION-LINKS-E2E — real-browser e2e pass over all 9 alert action links

**Status:** OPEN · **Severity:** low · **Class:** TEST COVERAGE

PR #287 shipped the per-code action-link registry (`lib/adminAlerts/alertActions.ts`, 9 codes) with unit + jsdom-render + structural-meta coverage, but no real-browser e2e: nobody has clicked the links in a live app. Coverage gap: fragment-scroll behavior of the `#share-access` internal links on the deployed show page, real seeded alert rows carrying each code's context shape (incl. absent-field variants rendering NO link), the banner global-vs-per-show split on a live `/admin`, and external hrefs (`docs.google.com` / `drive.google.com` / `github.com`) asserted verbatim without navigating off-app. **Fix (when prioritized):** a Playwright spec (harness precedent: `tests/e2e/`) that seeds one alert row per registered code (`SHOW_FIRST_PUBLISHED`, `PICKER_EPOCH_RESET`, `PICKER_SELECTION_RACE`, `ROLE_FLAGS_NOTICE`, `LIVE_ROW_CONFLICT`, `WIZARD_SESSION_SUPERSEDED_RACE`, `REPORT_ORPHANED_LOST_LEASE`, `BRANCH_PROTECTION_DRIFT`, `BRANCH_PROTECTION_MONITOR_AUTH_FAILED`) plus per-code negative rows (context field absent → no anchor), renders `/admin` and `/admin/show/[slug]`, clicks each internal link asserting the landed section, and asserts external anchors' exact href/target/rel without following them. Pair with a one-time validation-deployment smoke click-through.

### BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC — WATCH_CHANNEL_ORPHANED renders a raw provider error string in the admin banner

**Status:** OPEN · **Severity:** low · **Class:** INVARIANT-5 / UI COPY

The `WATCH_CHANNEL_ORPHANED` expanded panel renders `context.error_message` verbatim inside a `<code>` block (`components/admin/AlertBanner.tsx:239-240,423-429`) — a free-form provider/infra error string (e.g. a Google Drive API failure message), not cataloged copy. This predates the 2026-07-04 at-a-glance-identity work and is a deliberate infra-diagnostic affordance for an infra-only, Eric-facing alert (the copy escalates to support). Surfaced during that spec's Codex adversarial review (R9 F17) as a tension with invariant 5 (no raw error codes/diagnostics in user-visible UI). Deliberately left out of scope there — the identity-line work was proven to add no new diagnostic exposure. **Fix (when prioritized):** decide whether the watch detail should be mapped to a cataloged/sanitized status class (e.g. a small enum of "config error / transient / auth revoked") rather than the raw provider string, and if so route it through `lib/messages/lookup.ts`; keep a debug-only affordance for the raw text behind the developer tier if Eric still needs it.

### BL-HEALTH-RESOLVE-DB-LOCKDOWN — DB-enforce developer-only health-alert resolution

**Status:** OPEN · **Severity:** low · **Class:** SECURITY / DEFENSE-IN-DEPTH

alert-audience-split (spec §6.7) makes health-alert resolution developer-gated at every PRODUCT surface (the dev-gated `resolveHealthAlertFormAction` plus HEALTH_CODES rejects on the three legacy user-facing resolve surfaces: `resolveAdminAlertFormAction`, `app/api/admin/admin-alerts/[id]/resolve`, `app/api/admin/show/[slug]/alerts/[id]/resolve`). This is app-surface defense-in-depth + UI coherence, NOT a DB-enforced trust boundary: `admin_alerts` still GRANTs UPDATE to `authenticated` and its RLS policy allows any `public.is_admin()` caller to update rows (`supabase/migrations/20260501002000_rls_policies.sql`), so a non-developer admin could in principle `PATCH admin_alerts.resolved_at` directly through PostgREST, bypassing the app layer. We ACCEPT this (Doug is the trusted business owner, not an adversary; role filtering is UX not security). **Fix (when prioritized):** revoke direct `admin_alerts` UPDATE from `authenticated`/`anon` and route ALL resolution — doug alerts included — through `SECURITY DEFINER` RPCs with an `is_developer()` check for health codes. Materially larger, whole-resolve-path change; deferred as a cross-reference of the broader `BL-ADMIN-POSTGREST-DML-LOCKDOWN` admin_alerts-class DML lockdown item.

### BL-STEP3-IMPECCABLE-LIVE-RENDER — live-render impeccable pass on the Step-3 Variant-B page

**Status:** OPEN · **Severity:** low · **Class:** UI EVALUATION

The Step-3 "Review & publish" Variant-B redesign (spec/plan `2026-07-04-step3-review-page-variant-b`) shipped its UI quality gate (invariant 8) via a real-browser static-harness (DI-1…DI-4, bite-verified), a manual DESIGN.md/PRODUCT.md/mock conformance review (close-out §12), and the whole-diff Codex cross-model review as external attestation. What it could NOT do: a `/impeccable critique` + `/impeccable audit` pass on the LIVE rendered page — this repo has no live-app Step-3 seed (every Step-3 layout spec is a standalone static harness). **Fix (when prioritized):** stand up a minimal admin Step-3 seed (a reserved wizard session + a manifest with ≥1 clean, ≥1 needs-a-look, ≥1 demoted, ≥1 no-details, ≥1 blocking, ≥1 set-aside row), then run the impeccable v3 dual-gate against the live `/admin?step=3` render — including an explicit dark-mode warn-contrast check and the double-"Review" affordance on demoted RESCAN cards (close-out §12 finding 7).

---

## Mutation-surface observability (invariant #10, 2026-07-04)

Filed alongside AGENTS.md plan-wide invariant #10 (mutation-surface observability). The invariant is live and enforced; these two entries are the scoped debt it deliberately grandfathers.

### BL-CREW-PICKER-OBSERVABILITY — telemetry taxonomy for the crew/system picker functions

**Status:** CLOSED (2026-07-05) · **Severity:** low · **Class:** OBSERVABILITY DEBT

**Shipped** the `auth.picker.*` crew-telemetry taxonomy (coded `log.info`, distinct from `logAdminOutcome` since the actor is an anonymous crew member on an emailed link): `PICKER_IDENTITY_SELECTED` (`selectIdentityCoreImpl`), `PICKER_IDENTITY_CLEARED` (`clearIdentityCoreImpl`, existence-guarded), `PICKER_STALE_ENTRY_CLEANED` (`cleanupStaleEntryCoreImpl`, cleaned branch). The 6 exported wrappers carry `// no-telemetry:` delegation comments and `KNOWN_UNINSTRUMENTED` (`tests/log/mutationSurface/exemptions.ts`) is now empty; the discovery floor forces any NEW picker mutation to be accounted for regardless. The 3 **admin-gated** picker mutations (`resetPickerEpoch`, `rotateShareToken`, `resetCrewMemberSelection`) remain instrumented via `logAdminOutcome` (invariant #10 §3.1 A) and were never part of this debt.

### BL-ADMIN-OUTCOME-BEHAVIOR — backfill executable behavioral proofs for the 30 grandfathered admin surfaces

**Status:** ✅ CLOSED (2026-07-09) · **Severity:** low · **Class:** TEST COVERAGE

**Done across 3 autonomous PRs — Batch 1 #365 (6 per-show actions, pin 30→24), Batch 2 #368 (16 clean DI-seam route POSTs, pin 24→8), Batch 3 #371 (final 8 — 4 heavy DI-seam incl. the `fakeLeasePool` extract-agenda proof + 4 plain-POST, pin 8→0).** The `ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` allowlist + `GrandfatherUnit` type + both pin tests were then **deleted entirely**; Task 18 in `tests/log/adminOutcomeBehavior.test.ts` is now a strict completeness assertion (`missing = AUDITABLE_MUTATIONS(admin) − recorded`, no grandfather subtraction) so every admin mutation surface must carry a live inline `proveAdminOutcomeBehavior` proof — no escape hatch remains. Test-only throughout; no production change.

<details><summary>Original entry</summary>

`ADMIN_OUTCOME_BEHAVIOR_GRANDFATHER` (`tests/log/mutationSurface/exemptions.ts`) froze 30 pre-existing admin surface units — 24 admin route `POST`s + 6 pre-existing admin action functions — that already emitted a success outcome at `origin/main` HEAD but did not yet carry the new **executable** sink-spy success-branch proof in `tests/log/adminOutcomeBehavior.test.ts` (they were registry-verified only). The invariant-#10 behavioral-coverage assertion already forced EVERY new/non-grandfathered admin surface to ship a proof; this entry backfilled the frozen 30 so the grandfather set could shrink to zero.

</details>

---

## Test-safety hardening (2026-07-05)

### BL-DBTEST-LOOPBACK-EVAL-GUARD — retrofit module-eval loopback guard onto pre-existing db tests

**Status:** OPEN · **Severity:** low · **Class:** TEST SAFETY

The finalize-resume-deadlock whole-diff R1 review surfaced (and fixed, for the 3 suites in that diff) a latent pattern shared by ~20 pre-existing `tests/onboarding/*.db.test.ts` files: `LOCAL_URL = process.env.LOCAL_TEST_DATABASE_URL ?? <loopback default>` is consumed by a probe `beforeAll` that opens `postgres(LOCAL_URL)` and sets `dbUp = true` BEFORE the loopback assertion (`expect(LOCAL_URL).toMatch(/127…/)`) runs in a later `beforeAll`. If `LOCAL_TEST_DATABASE_URL` is mispointed to a remote host (`TEST_DATABASE_URL` is the validation project), the probe connects remote and `dbUp` flips true; even when the later assertion throws, `afterAll`'s `if (dbUp)` teardown still issues DELETE/UPDATE against the remote. The default is loopback so this only bites on an explicit remote override, hence low severity. **Fix (when prioritized):** wrap each file's `LOCAL_URL` in `assertLocalDbUrl(...)` from `tests/db/_remediationHelpers.ts` (synchronous module-eval throw on non-loopback host, before any handle) — the proven pattern in `cleanupReapCrossSession.db.test.ts` + 7 others and now the 3 finalize-resume-deadlock suites. Consider a structural meta-test that fails any `*.db.test.ts` opening `postgres(...)` on a URL not passed through `assertLocalDbUrl`.

### BL-RESCAN-PREPARE-ERROR-GRANULARITY — distinguish parse vs Drive-fetch failure in re-scan fail-closed paths

**Status:** OPEN · **Severity:** low · **Class:** TELEMETRY GRANULARITY

Both re-scan fail-closed catch sites — the finalize inline auto-heal (`app/api/admin/onboarding/finalize/route.ts`, the `prepareOnboardingFiles` try/catch) and the standalone `rescanWizardSheet` (`lib/onboarding/rescanWizardSheet.ts:127`) — map ANY `prepareOnboardingFiles` throw to `DRIVE_FETCH_FAILED`. Because `prepareOnboardingFiles` does export AND parse, a parser/schema failure or malformed-workbook fault is reported to Doug as a Drive fetch failure, and telemetry loses the export-vs-parse distinction. The recovery path is identical (both demote fail-closed to the re-apply page), so this is a wrong-reason/observability issue, not a correctness bug — surfaced by whole-diff R5. **Fix (when prioritized):** have `prepareOnboardingFiles` throw a discriminated error (e.g. `{ kind: 'drive_fetch' | 'parse' }`) and map each to a distinct §12.4 code at BOTH call sites (new code needs the full 3-way lockstep + CI touchpoints). Deferred to keep the two sites consistent and avoid a new catalog code mid-feature.

### BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS — deletion-safety Link guard misses helper-built hrefs

**Status:** OPEN · **Severity:** low · **Class:** TEST COVERAGE

The Step-3 consolidation deletion-safety guard (`tests/admin/step3DeletionSafety.test.ts`, the "no in-app `<Link href>` out to the retired staged page" test) matches only a literal `/admin/onboarding/staged/` substring on the SAME source line as `href`. A helper-built href (`href={buildStagedUrl(id)}` where the path lives in a const or is assembled elsewhere) could reintroduce a link to the retired staged page without tripping the guard — surfaced by whole-diff R5 (LOW). A blanket "path appears anywhere" scan is NOT a clean fix: the path is LEGITIMATELY referenced by the finalize race-row `re_apply_url` builder and the `next.config.ts` 307 redirect source (both ratified in spec §4.6 — they now 307 to /admin), so a stricter guard false-positives on those. **Fix (when prioritized):** a JSX-aware check that resolves `<Link>`/`<a>` href expressions (including one-hop helper returns) to a URL and asserts none resolve under `/admin/onboarding/staged/`, while allow-listing the ratified non-Link string references. Low value + false-positive risk mid-feature, so deferred; the literal same-line guard plus the retired-import guard already cover the common regressions.

### BL-ROOM-DIMS-ONLY-NOVEL-HEADER — parse a dims-only novel breakout header (no DAY-range)

**Status:** OPEN · **Severity:** low · **Class:** PARSER COVERAGE

The parser-anchor-de-literalization PR (spec `docs/superpowers/specs/2026-07-05-parser-anchor-deliteralization.md`, audit finding #6) de-literalizes the v1 breakout-room loop from the two literal names `MABEL`/`LAUDERDALE` to any `NAME + trailing DAY-range` header, so a future differently-named DAY-range breakout (`GRAND BALLROOM DAY 1 & 2`) now parses. A dims-ONLY header with NO DAY-range (`SALON ABCD&#10;60' x 45'`, `MERIDIAN HALL&#10;50' x 30'`) is deliberately **out of scope** (spec §2 "Descoped", adversarial-review R31 f1): it is structurally identical to a dims-bearing ASSET/equipment row (`PROJECTION SCREEN&#10;5' x 9'`, `4' X 8' RISER`), so a name-blind admit gate cannot tell a novel dims-only room from an asset — 14 adversarial rounds confirmed every dims-based admit/evidence/ownership gate reopened asset fabrication or field theft. origin/main never parsed this shape, so it is NOT a regression, and a blanket data-gap signal is rejected (it would fire on every gear row = noise). **Fix (when prioritized):** parse a dims-only room only under a POSITIVE room-context signal the sheets actually carry — a `BREAKOUT`/room-section header above the row, or an explicit room label — NOT a dims token. Add fixtures with a real dims-only room inside a room section and assert it parses without any asset row (dims-bearing gear elsewhere on the sheet) becoming a room.

**Update (2026-07-06, spec `docs/superpowers/specs/2026-07-06-bo-venue-header-anchor.md`):** partially addressed by the BO-venue-header anchor — a dims-only header sitting above a **`BO` field block** now parses, anchored on the field block (not the dims token), so no asset is fabricated. The remaining unaddressed sub-case is a dims-only header with **no** field block of any kind (a bare `NAME&#10;dims` cell), which stays out of scope (indistinguishable from an asset without an anchor).

### BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER — parse show-prefixed `<PREFIX> BREAKOUT N` room headers

**Status:** DONE (2026-07-06, feat/bo-show-prefixed-breakout) · **Severity:** low · **Class:** PARSER COVERAGE

**Resolved:** `boBlockRe` now admits an optional single UPPERCASE-alnum-token prefix; `splitRoomHeader` strips it case-sensitively; a prefixed-admission gate (`roomHasBoFieldValue`) requires positive BO-field content so header dims/floor alone cannot fabricate a room; `NEXT_ROOM_HEADER_RE` terminates a BO block on a prefixed header. The two RPAS BREAKOUT 1/2 headers now parse as `LASALLE A`/`LASALLE B` with their dims/floor/fields; the `dci-rpas-central` rooms baseline was regenerated (only that key). Spec `docs/superpowers/specs/2026-07-06-bo-show-prefixed-breakout-header.md`, plan `docs/superpowers/plans/2026-07-06-bo-show-prefixed-breakout-header.md`.

`parseBoRooms`'s `boBlockRe` (`lib/parser/blocks/rooms.ts:1020`) is `^\|\s*BREAKOUT`-anchored (case-sensitive), so it does **not** own a header that carries a show prefix before the `BREAKOUT` keyword — e.g. `RPAS BREAKOUT 1&#10;LASALLE A&#10;30' x 25' x 10.5'&#10;7th Floor` and `RPAS BREAKOUT 2&#10;LASALLE B…` in `fixtures/shows/raw/2025-03-dci-rpas-central.md:207,152` (both above real `BO Setup`/`BO Set Time`/… blocks). No other pass claims them either, so these two breakout rooms are **currently unparsed** (the fixture's baseline rooms contain only GS). Surfaced during the BO-venue-header-anchor review (Codex R1). The BO-venue-header anchor deliberately does **not** start parsing them (its substring ownership gate excludes any `BREAKOUT`-bearing header to keep the frozen corpus byte-identical). **Fix (when prioritized):** extend `boBlockRe` (or add a pass) to admit a `<optional prefix> BREAKOUT N <name> <dims> <floor>` header, deriving the room name from the non-prefix, non-BREAKOUT portion (`LASALLE A`); regenerate the room baseline and assert the two RPAS breakouts parse with their dims/floor/fields. Changes the frozen `origin-main-rooms.json` baseline for `dci-rpas-central`, so it is its own PR, not a rider.

### BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO — derive Step-3 override state from the durable row, not the preview

**Status:** OPEN · **Severity:** medium · **Class:** UI ROBUSTNESS (Opus-only + invariant-8 impeccable)

Step-3 (`components/admin/wizard/step3ReviewSections.tsx`) derives `overrideActive` solely from the persisted preview (`pr.archivedPullSheetTabs.some((t) => t.included)`), not from the durable `pending_syncs.pull_sheet_override` row. When an accept/revoke RPC commits but its best-effort follow-up re-scan fails (transient infra; route returns 200 on RPC success per §5.8 audit-before-re-scan), the durable override and the preview `included` flag diverge, so Step-3 re-offers S2 (accept, `expectedOverrideSnapshot: null`) → RPC row-state CAS 40001 → 409 → `router.refresh()` reloads the same stale envelope → loop (revoke-failure is the inverse stale-S3). Surfaced by whole-diff Codex review R2 on `feat/pull-sheet-archived-tab-override`. **Not a data or publication bug** — the override commits correctly and the Task-11 finalize gate (`STAGED_PARSE_OUTDATED_AT_PHASE_D`) fail-safes publication; only the recovery UX loops, and only on a re-scan infra failure. **Fix (when prioritized):** thread a `pullSheetOverrideActive: boolean` (from `pending_syncs.pull_sheet_override != null`) through the Step-3 DTO (`Step3SheetCard` → `SectionData`) and derive `overrideActive` from it; where durable-override and preview-`included` disagree, render the §5.8 "re-scan needed" divergent state ("gear saved; preview refreshing — reload to update") instead of S2/S3. UI is Opus-only + `/impeccable critique`+`audit` (invariant 8). Tracked in `DEFERRED.md` → PSAT-1.

---

### BL-MUTATION-HARNESS-OPEN-HOLES — parser silent-fragility classes pinned by the mutation harness

**Status:** OPEN (2026-07-06, feat/mutation-harness) · **Severity:** medium · **Class:** PARSER ROBUSTNESS

The rec-5 mutation-testing harness (`tests/parser/mutationHarness.test.ts`, nightly workflow) pins **7,885 day-1 silent holes** — mutants whose parse changed with no compensating signal (`SILENT_WRONG` / `SILENT_SIGNAL_LOSS`), recorded in `tests/parser/mutation/knownHoles.ts`. Each hole's `finding` field maps its operator class to the audit finding it exercises (`OPERATOR_FINDING_MAP`), so a ledger failure is triageable by operator. Documented-finding classes: **`header-typo` → audit #5** (short-header typo intolerance, `sectionHeaderNormalize.ts:16,66`); **`blank-row:inject` / `blank-row:remove` → audit #10** (blank-row block segmentation, `exportSheetToMarkdown.ts:104`). The remaining operator classes are silent-fragility surfaces the audit did not enumerate as a numbered finding; each is tracked as a backlog sub-item below and its holes shrink when that class is hardened:

- **`BL-MUTATION-REF-SUB`** — a body cell rewritten to the literal `#REF!` (a real broken-reference export artifact, present in 3/7 live shows) is absorbed into the parse with no signal. Value-corruption class.
- **`BL-MUTATION-UNICODE`** — a zero-width non-joiner (U+200C) injected into a cell value is silently retained (the fintech live ZWNJ shape). Invisible-character class.
- **`BL-MUTATION-COLUMN-SHIFT`** — a spurious leading empty column shifts a section's row grid with no signal (the East Coast column-shifted outlier). Layout-shift class.
- **`BL-MUTATION-MERGED-CELL`** — deleting one interior pipe (how a merged cell exports) fuses two adjacent cells silently. Cell-fusion class.
- **`BL-MUTATION-SECTION-ORDER`** — reordering two adjacent top-level blocks silently reorders the parser's output arrays (the parser preserves source order). **Order-sensitivity discovered by the harness on 2026-07-06** (58 `SILENT_WRONG` + 24 `SILENT_SIGNAL_LOSS` across the corpus); section-reorder was reclassified cosmetic → corrupting as a result.

**Ratchet:** the ledger is a shrink-only baseline. When a downstream fix hardens one of these classes, the corresponding holes become `staleRows` and the nightly harness fails until they are removed from `knownHoles.ts` — turning each parser-robustness fix into a measurable ledger reduction. Do NOT grow the ledger silently; a NEW hole (regression) fails the harness as `newAlarms`.

---

### BL-EXPORT-BLANK-ROW-SEGMENTATION — blank-row block segmentation fuses/splits sections silently (audit #10)

**Status:** OPEN (2026-07-15; audit finding #10, 2026-07-04) · **Severity:** medium · **Class:** EXPORT/PARSER ROBUSTNESS

`splitBlocks` (`lib/drive/exportSheetToMarkdown.ts:127-144`) segments the sheet grid into blocks using fully-blank rows as the **only** delimiter. Two failure modes, both silent: (a) a stray value in a spacer row (normal authoring noise — a forgotten cell, a note typed into the gap) **fuses** two adjacent sections into one block, so the downstream parser attributes one section's rows to another; (b) a blank row inserted mid-section **splits** one section into two blocks, orphaning the tail rows from their header. Neither emits a signal — mis-grouped sections flow into the parser as plausible structure. The 2026-07-07 e2e audit re-verified this unchanged; the 2026-07-10 re-rating (§10) left it as the only numbered finding with zero movement (2 fixed, 2 partial, 1 by-design). The mutation harness pins the blast radius (`blank-row:inject` / `blank-row:remove` holes in `knownHoles.ts`, mapped via `OPERATOR_FINDING_MAP` — see BL-MUTATION-HARNESS-OPEN-HOLES above) but detection-in-tests is not detection-at-runtime. **Fix directions (pick at spec time):** (a) near-blank-row heuristic — a row with exactly one short non-blank cell adjacent to blank rows emits a warn-severity `ParseWarning` instead of fusing; (b) section-header-aware segmentation — a row matching a `KNOWN_SECTION_HEADERS` shape mid-block starts a new block (closes the fuse case structurally); (c) orphan-block detection — a block with no recognizable header row adjacent to a recognized section warns as a probable split. Any fix hardens a mutation-harness class → the corresponding ledger holes become `staleRows` per the ratchet above. Trigger to promote: a live show where a spacer-row stray value or mid-section blank row mis-groups data with no operator signal.

---

### BL-TRANSPORT-ID-RESOLUTION — id-based transport visibility + no-match admin warning (deferred from Flow 8.4 to 8.3)

**Status:** PARTIALLY CLOSED (2026-07-09, Flow 8.4 PR #374) · **Severity:** medium · **Class:** CREW VISIBILITY / ENRICH

**Partial closure (Flow 8.4, PR #374 — `docs/superpowers/specs/2026-07-09-flow8.4-transport-assignee-warning.md`):** the **enrich-time no-match admin warning** shipped. `lib/sync/enrichTransportAssignees.ts` emits one admin-only aggregate data-gap warning (`TRAVEL_TRANSPORT_NAME_UNMATCHED`, `gateExempt: true`) when a transport driver/assignee name references a crew member who would not see their own tile — turning silent invisibility into a staged-review data-quality signal. **Still deferred to 8.3:** id-persistence + id-based visibility matching (a crew `id` does not exist at enrich time — the uuid is DB-assigned at APPLY via `gen_random_uuid()`, `initial_public_schema.sql:32` — so resolve-to-id-and-persist is architecturally infeasible in the enrich pass; 8.3 must move it to an apply-time step). The regression pins below also remain for 8.3, which changes the `transportTileVisible` predicate.

The Flow-8 audit item 8.4 (`docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §Flow 8) asks that a transport name mis-parse cannot hide a driver's own itinerary. `transportTileVisible` (`lib/visibility/scopeTiles.ts:177-202`) matches assigned crew by **fuzzy name** (`namesRefer`, `lib/data/nameMatch.ts`), which closes the common variance (nickname / legal-name / case / trim / prefix) but NOT a **hard** mis-parse (a merged-cell overflow that shifts the surname token, e.g. a driver stored as `"Doug Larson Loadout"` — the adjacent column fused onto the name — vs roster `"Doug Larson"`; verified `namesRefer` returns false because the multi-token rule compares last tokens `"loadout"`≠`"larson"`). In that case the driver silently does not see their own ground-transport block. Flow 8.4 (PR #374, see Partial closure above) now emits an **admin-visible no-match warning** for this case, so it is no longer _silent_ — but the driver still does not see their tile until the operator fixes the name, because id-based visibility matching remains deferred to 8.3.

**Deferred defensive regression pins (moved out of `flow8-self-serve-trio` at plan-review Round-11; land red-first in 8.3):** pin `transportTileVisible`'s _current_ fuzzy tolerance against name-parse-variance regression — driver `"Doug"` vs viewer `"Doug Larson"` → visible (prefix); `"Douglas Larson"` vs `"Doug Larson"` → visible (surname); assigned-names `["Bill Werner"]` vs `"William Werner"` → visible; case/trim `"  doug larson "` → visible; negative controls (`"Jane Smith"` → not visible, empty/`null` → not visible, admin → visible when transportation exists); and the **known-gap fixture** driver `"Doug Larson Loadout"` vs `"Doug Larson"` → **not visible** (verified live: multi-token rule compares last tokens `"loadout"`≠`"larson"`, `nameMatch.ts:50-53`). These were removed from the milestone because a green-only regression-pin task conflicts with plan-wide invariant 1 (non-negotiable red-first per task); they belong red-first in 8.3, which changes this exact predicate.

**Fix (deferred to the 8.3 venue-timezone / enrich spec, same enrich domain + admin-warning machinery):** at enrich time, resolve free-text `driver_name` / `assigned_names` → `crew_member` ids against the show roster, persist the resolved id set on the transportation legs / driver, match viewer visibility by id (robust to any later render-time name garble), and emit an admin-visible alert when an assigned name resolves to **no** roster member (turns silent invisibility into a data-quality signal — parallels 8.3's ET-default admin warning). Add fixtures with a hard-mis-parsed driver name and assert the driver's own transport becomes visible via id resolution AND that the no-match name raises the admin warning. Interim crew recourse until this lands: the Flow-8.1 picker "Don't see your name?" affordance.

---

## Parser ambiguity-warning coverage (2026-07-07, ambiguity-warnings-v1)

Transform sites the transform-sites walker (`tests/parser/_metaTransformSitesWalker.test.ts`, spec `2026-07-07-ambiguity-warnings-v1-design.md` §6) declares as `exempt: "deferred:BL-..."` — value-producing judgment sites that do NOT yet emit an `AMBIGUITY_CODES` warning. Each is a concrete deferral (the walker fails if the ref is missing here), not a silent gap.

### BL-PARSER-HOTEL-INLINE-AMBIGUITY — emit an ambiguity warning for inline (unstructured) hotel-guest paths

**Status:** OPEN (2026-07-07, ambiguity-warnings-v1) · **Severity:** low · **Class:** PARSER AMBIGUITY COVERAGE

`hotels.ts` emits `HOTEL_GUEST_SPLIT_AMBIGUOUS` only from the **structured** `parseGuestCell` path (spec §4.2). The **inline** guest-extraction paths (guest names glued into an unstructured hotel/reservation line, not the pipe-structured guest cell) make the same class of split judgment but do not yet surface a warning. Deferred: the inline paths are lower-frequency in the live corpus and share no collector with `parseGuestCell`, so wiring them is a separate emit unit + fixture effort. Declared as `{ site: "inline guest paths", exempt: "deferred:BL-PARSER-HOTEL-INLINE-AMBIGUITY" }` in `hotels.ts` `TRANSFORM_SITES`. Trigger to promote: a live show where an inline guest line is mis-split with no operator signal.

### BL-PARSER-ADDRESS-SPLIT-AMBIGUITY — emit an ambiguity warning for `splitHotelNameAddress` name/address splits

**Status:** OPEN (2026-07-07, ambiguity-warnings-v1) · **Severity:** low · **Class:** PARSER AMBIGUITY COVERAGE

`splitHotelNameAddress` (`hotels.ts:329`) splits a combined `<hotel name> <street address>` string into a name and an address by a suffix-only heuristic — a genuine judgment call that produces a value but emits no ambiguity warning when the boundary is uncertain. Deferred: the current heuristic is strictly suffix-anchored and low-risk; adding an ambiguity signal needs a defined uncertainty threshold + its own emit unit test to avoid warn-spam on the common unambiguous case. Declared as `{ site: "splitHotelNameAddress", exempt: "deferred:BL-PARSER-ADDRESS-SPLIT-AMBIGUITY" }` in `hotels.ts` `TRANSFORM_SITES`. Trigger to promote: a live show where a name/address split lands wrong with no operator signal.

### BL-AUTOAPPLIED-CARD-LAYOUT-E2E — real-browser width-distribution assertion for the auto-applied card button grid

**Status:** OPEN (2026-07-14, recent-auto-applied-redesign) · **Severity:** low · **Class:** UI LAYOUT COVERAGE

The redesigned "Recently auto-applied" change card distributes Accept/Undo via CSS grid (`grid-cols-2` 1fr/1fr, or `grid-cols-1`) + `w-full` buttons. The jsdom suite pins the mechanism (grid template + `w-full`); a real-browser Playwright assertion of the actual pixel widths (each button ≈ half / full card content width) is deferred because 1fr columns split equally by CSS-grid spec (not the flex-stretch failure mode). Trigger to promote: an auto-applied-strip e2e harness lands, or the button layout moves off CSS-grid `1fr`.

### BL-AUTOAPPLIED-SINGLETON-FLATTEN — flatten card-in-card for single-change groups

**Status:** OPEN (2026-07-14, recent-auto-applied-redesign) · **Severity:** low · **Class:** UI POLISH
A per-show group with one change renders a group-card wrapper around a single inner change-card (card-in-card). Consider dropping the inner border/padding when `rows.length === 1`. Deferred: marginal gain, adds a render branch, matches the approved mock.

### BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF — structured field-level From→To for field_changed

**Status:** OPEN (2026-07-14, recent-auto-applied-redesign) · **Severity:** low · **Class:** FEATURE / DB WRITE-PATH
`field_changed` rows show a generic summary ("A field changed on this sync"); naming the field / showing its From→To needs structured before/after stored at write time (`writeAutoApplyChanges.ts`) — the DB write-path arc this read-only redesign excluded. Trigger: the spec §1 "Full fidelity" option, if pursued.

### BL-AUTOAPPLIED-COLLAPSED-KIND-HINT — surface change kind in the collapsed group header

**Status:** OPEN (2026-07-15, auto-applied-collapsible-groups) · **Severity:** low · **Class:** UI TRIAGE DENSITY
Collapsed-by-default group headers (per explicit user directive) show only showName + a bare count; the change kind (incl. a destructive "Removed") is hidden until expand. Consider a small per-kind dot cluster / severity chip in the collapsed header so a destructive auto-apply is visible without expanding. Net-new affordance beyond the requested change; needs its own impeccable pass + tests. Trigger: a Doug report of a missed destructive auto-apply behind a collapsed header, or a dashboard triage-density pass. See `DEFERRED.md` AUTOAPPLIED-COLLAPSE-1.

### BL-DISCLOSURE-FAMILY-HEIGHT-MORPH — animate the disclosure family (accordions) at once

**Status:** OPEN (2026-07-15, auto-applied-collapsible-groups) · **Severity:** low · **Class:** UI MOTION / SYSTEM-WIDE
The dashboard disclosure components (`RecentAutoAppliedStrip` groups, `IgnoredSheetsDisclosure`, `AddAdminDisclosure`) all mount/unmount their panels instantly while the chevron animates; DESIGN.md lists "accordion expand" at `duration-normal`. Adopt the `globals.css` height-morph disclosure pattern across the whole family in one deliberate pass (animating just one diverges from the shared idiom). Trigger: a cross-cutting disclosure-motion pass. See `DEFERRED.md` AUTOAPPLIED-COLLAPSE-2.

### BL-CREWPAGE-ROTATE-URL-FLASH — one-shot highlight on the crew URL when it updates after a rotate

**Status:** OPEN (2026-07-14, share-link-instant-rotate-dedup) · **Severity:** low · **Class:** UI POLISH

The instant-rotate rework updates the crew URL on every surface (header ShareChip, ShareLinkBody card, CrewPageLink) the moment a rotate resolves, and the confirmation-only banner says "The updated link is shown above." The swap itself is silent — the token is an opaque random string, so an admin watching the banner may not register that the URL above just changed. Deferred (impeccable critique P2): a brief reduced-motion-safe highlight/flash on `admin-current-share-link-url` (and the chip) keyed on the epoch advance would draw the eye, but it introduces a new transient visual state that needs its own transition-inventory + reduced-motion handling + test, and the banner copy already directs attention upward. Trigger to promote: admin feedback that a rotate's new URL is easy to miss.

### BL-CREWPAGE-SHARE-CHIP-TOKEN-DISCIPLINE — replace `max-w-[16rem]` magic + confirm tap-target width on crew-link chrome

**Status:** OPEN (2026-07-14, share-link-instant-rotate-dedup) · **Severity:** low · **Class:** UI TOKEN DISCIPLINE

`ShareChip.tsx` uses an arbitrary `max-w-[16rem]` (pre-existing, mirrored from the prior inline chip) rather than a named width token, and `CrewPageLink.tsx` sets `min-h-tap-min` but no `min-w` (text width clears 44px in practice but is not guaranteed). Both are pre-existing patterns carried forward verbatim by the component-extraction refactor, not regressions. Deferred: token-izing the width + adding an explicit min-width is cosmetic and app-wide (the same magic appears elsewhere); batch it with a DESIGN token pass. Trigger to promote: a DESIGN.md token-discipline sweep.

### BL-CREWPAGE-ROTATE-FOCUS-MGMT — restore keyboard focus across the two-tap rotate state edges

**Status:** OPEN (2026-07-14, share-link-instant-rotate-dedup) · **Severity:** low · **Class:** A11Y

The `RotateShareTokenButton` two-tap state machine (idle → confirm → resolving → idle) unmounts the focused button on each edge, so a keyboard user's focus drops to `<body>` after tapping Rotate and again after the action resolves. Pre-existing (the state machine + 3s auto-revert predate the instant-rotate dedup; this diff only changed the success-banner content), and impeccable-audit-rated P2 (not a WCAG-A blocker — the controls remain reachable by re-tabbing). Deferred: a correct fix moves focus to the Confirm button on entering confirm and to the idle Rotate button (or the banner) on resolve via a ref/effect, plus `waitFor`-based focus assertions (async activeElement). Out of scope for a dedup/instant-update refactor. Trigger to promote: an a11y pass on the admin per-show action rows.
