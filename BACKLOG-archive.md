# BACKLOG-archive.md

Historical ledger of resolved / shipped / superseded BACKLOG items — full provenance kept (what, why, how it was resolved). The live speculative queue is **[BACKLOG.md](./BACKLOG.md)**; entries graduate here when they ship.

Order follows the original BACKLOG.md layout, not resolution date — **grep by id**. Ids are preserved verbatim so every `BL-*` reference elsewhere in the repo (specs, plans, test comments, `DEFERRED.md`) still resolves to a readable entry.

Same split as [DEFERRED.md](./DEFERRED.md) ↔ [DEFERRED-archive.md](./DEFERRED-archive.md): the working queue stays a queue, the changelog lives here.

---

## BL-HOVERHELP-PORTAL — portal the HoverHelp popover so it survives clipping ancestors

**Filed:** 2026-07-20 (show-alert-compact spec, adversarial R2 F7/F8/F10) · **Class:** UI robustness · **Effort:** M (portal + positioning, or an anchor-positioning polyfill, plus containment assertions)

`HoverHelp` positions its popover body absolutely IN FLOW rather than portaling it (components/admin/HoverHelp.tsx:193). Inside a scrolling surface the popover can be visually clipped by an ancestor, and `getBoundingClientRect()` does not reveal it (it reports the unclipped box, so a naive assertion passes). The concrete case: `AttentionBanner` cards sit in an `overflow-y-auto` scroll container (components/admin/review/ShowReviewSurface.tsx:869) nested in an `overflow-clip` panel (components/admin/review/ReviewModalShell.tsx:614), so a popover opened near the bottom of the scroll viewport is cut off until the user scrolls.

Pre-existing for every HoverHelp consumer inside a scrolling admin surface; NOT introduced by show-alert-compact, whose spec explicitly descopes placement policy to the shipped default (amendment A6) rather than inventing an unmeasurable geometry rule. Fixing it means portaling the body to `document.body` with anchored positioning (or adopting CSS anchor positioning with a polyfill), then asserting popover containment against BOTH clipping ancestors in a real-browser test.

**Status:** ✅ RESOLVED — `feat/hoverhelp-smart-position` (2026-07-22; spec `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md`). The shared `HoverHelp` body now portals — into the `ReviewModalShell` panel via `PopoverHostContext` (staying inside the focus trap / aria-modal / inert subtree) or `document.body` elsewhere — with a pure collision-aware positioning core (`lib/popover/position.ts`). The exact AttentionBanner-at-pane-bottom geometry this entry documents is the T4a elementFromPoint kill-shot in `tests/e2e/published-review-modal.interactions.spec.ts`; body-host geometry is covered by `tests/e2e/hoverhelp-geometry.spec.ts` (19 cases). Follow-up carve-out: `BL-HOVERHELP-VISUAL-VIEWPORT` below.

---

## BL-CREW-WARN-STACK-E2E-GEOMETRY — real-browser width-fill assertion for the crew under-row warning stack

**Filed:** 2026-07-24 (retroactive — deferred in PR #534's body 2026-07-21, never filed) · **Status:** ✅ SHIPPED (2026-07-24, branch `test/crew-warn-stack-width-fill`) · **Class:** test coverage (real-browser layout)

PR #534 descoped its Task 10 (real-browser layout) with: "`CrewUnderRowStack`'s parent is not fixed-dimension, so the rule's trigger doesn't apply; width-fill is unit-asserted. Deferred `BL-CREW-WARN-STACK-E2E-GEOMETRY`." The id was cited in the PR body but no row was ever added to BACKLOG.md, DEFERRED.md, or this archive — found by a PR-body-vs-ledger reconciliation sweep on 2026-07-24.

PR #563 (crew-warning-attachment T5) had already landed real-browser geometry for the surface at `tests/e2e/published-review-modal.layout.spec.ts`: the under-row stack `[data-testid="crew-warn-stack-<key>"]` measured inside the crew panel card's border box on all four edges, and between its member's row and the next. Those are CONTAINMENT bounds, not the width-FILL equality the deferral named — a stack rendered at half width or indented satisfies them.

**Shipped:** `T-WARN-WIDTHFILL @1280` + `@390` in that spec's existing T5 describe block (harness page `crewwarnings.html`, shared `TOL`; no new harness or config). Asserts `stack.x === row.x` and `stack.width === row.width` against the member ROW's measured box, where the row is resolved from the rendered name span upward to the hosting `<li>`'s direct child — never from the stack's own parent — and the resolver throws if the row turns out to contain the stack, so the equality cannot pass vacuously. Anti-vacuity floor (`row.w > viewport * 0.4`) plus `row.w === li.w` rule out a collapsed layout satisfying any equality. Negative-regression verified by hoisting the per-kind `pl-6` onto the stack (both viewports fail on left edge + width) and by `inline-flex` (fails on width).

---

## BL-SPEC-LINT — mechanize the checkable subset of spec/plan pre-review passes

**Filed:** 2026-07-19 (round-burn retrospective, PRs #470–#500) · **Class:** review-round reduction (tooling) · **Effort:** M (script + wiring into review-dispatch discipline)

R1–R3 adversarial rounds are dominated by non-compliance with passes AGENTS.md already mandates, not rule gaps. A `pnpm spec:lint <doc>` script closes the mechanizable subset: (a) every `file:line` citation resolves and the line matches the claimed symbol; (b) numeric-literal cross-check (each count/duration appears consistently everywhere the doc repeats it); (c) copy-rule scan on quoted user-visible strings (em-dash ban, apostrophe literals); (d) presence check for the mandatory §1.1 "Resolved scope — do not relitigate" section and, for UI specs, Dimensional Invariants + Transition Inventory sections. Until it exists, the attached citation-grep/numeric-sweep transcript is the compliance artifact (AGENTS.md spec self-review additions, 2026-07-19).

**Status:** ✅ SHIPPED — `feat/spec-lint` (2026-07-19; spec `docs/superpowers/specs/2026-07-19-spec-lint.md`).

---

## BL-CASP2-STRIP-POLISH — StatusStrip finalize-popover persistent overlay — ✅ RESOLVED (2026-07-17)

**Filed:** 2026-07-17 (CASP2-4 residual, `DEFERRED.md` CASP2-4) · **Resolved:** 2026-07-17, branch `feat/casp2-finalize-inflow` · **Class:** UI polish (transient-state overlay) · **Effort:** S

The calm finalize hint in the inline `PublishedToggle` no longer persists as an absolute overlay. `POPOVER_POSITION` is now **error-skin-only**; the finalize skin split off to an in-flow compact chip (`FINALIZE_CHIP`, a flex sibling of the switch) that stays inside the sticky strip's flow and can never overlay the rail content below the strip. Mode-dependent visible label ("Finalizing…" / "Publishing…", `aria-hidden`) + `sr-only` full sentence (the `aria-describedby` target); role-less/calm. Real-browser geometry rewritten (CI-1 containment + CI-1b height-bound + CI-2/CI-3 compact pill) in `tests/e2e/statusStripToggleLayout.spec.ts`; unit parity test now pins error-banner-absolute vs finalize-chip-in-flow (and fixes the `FORBIDDEN` width-cap regex). Impeccable dual-gate: critique no-slop + detector clean, audit 20/20, contrast AA both themes. Twin row in `DEFERRED.md` CASP2-4 item 1 marked RESOLVED in the same PR. This was the sole open CASP2 residual — CASP2 fully closed.

---

## BL-ROLE-VOCAB-STAGING-OVERLAY — run the role-mapping overlay in the wizard staging/rescan pipeline

**Filed:** 2026-07-16 (extend-role-scope-vocab whole-diff R1, `DEFERRED.md` ROLE-VOCAB-2) · **Class:** UX completeness (staged preview parity) · **Effort:** M (staging-core change + step-3 preview semantics + tests)

The wizard rescan parses without the role-mapping overlay, so a just-recognized role's `UNKNOWN_ROLE_TOKEN` warning persists in step 3 until publish (staged saves always `apply_pending`; mapping applies at finalize via phase2 — no data loss). Integrate the overlay (or a use-raw-style decision-display state on the control) into the staging path so step 3 previews post-overlay state and the staged `"applied"` branch becomes reachable (spec §8.3 amendment 2026-07-16 reserves it).

**Status:** ✅ SHIPPED — `feat/role-vocab-staging-overlay` (2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-staging-overlay.md`, 16 adversarial rounds). Overlay + always-written consumed-token stamp at the `prepareOnboardingFiles` chokepoint; stamp persisted to `shows_internal.applied_role_mappings` on every phase2 apply; one VOLATILE `FOR SHARE` SQL predicate (`role_mappings_stamp_satisfied`) gates the wizard apply, the final-CAS Held-to-Live flip (completion-blocking), and the `publish_show` RPC with the new §12.4 code `ROLE_MAPPINGS_OUTDATED_AT_PUBLISH`. Whole-feature convergence gap surfaced by review → `BL-ROLE-VOCAB-MAPPING-CONVERGENCE`.

---

## BL-ROLE-VOCAB-MAPPING-CONVERGENCE — mapping-only changes never advance the cron watermark

**Filed:** 2026-07-16 (role-vocab staging-overlay adversarial review R2/R7, spec `2026-07-16-role-vocab-staging-overlay.md` §3.4) · **Class:** convergence gap (parent feature) · **Effort:** M (watermark design decision)

Editing/deleting a `role_token_mappings` row changes no sheet bytes, so cron/push watermark-skip every unmodified sheet (`lib/sync/perFileProcessor.ts` — `modifiedTime <= effective_watermark → skip`) and a published show's `role_flags`/warnings converge only on its next sheet edit or manual sync. The publish freshness gate (staging-overlay spec §3.5) closes every `published=false→true` path; this item is the residual class for ALREADY-published shows and genuinely post-publish revokes. Candidate designs: `role_token_mappings.updated_at` participating in the effective cron watermark, or targeted re-sync fan-out on settings mutations. Pinned by the `tests/sync/perFileProcessor.test.ts` role-vocab drift-window test — revisit it with any watermark change.

**Status:** ✅ SHIPPED — `feat/role-vocab-mapping-convergence` (2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-mapping-convergence.md`, 6 spec + 2 plan adversarial rounds). Drift-derived cron re-sync eligibility: per-tick content-based batch predicate over published shows (`lib/sync/roleVocabDrift.ts` — stamp exact-match drift + newly-mapped `UNKNOWN_ROLE_TOKEN` warnings; no timestamps, no migration), watermark-skip rescue in `perFileProcessor` (cron-only, never past a live pending_syncs row), in-lock pre-Phase-1 recheck (published + no-pending; DEF-4 owns archived), `less_than_or_equal` Phase 2 stale guard for `driftResync` runs, fail-open scan telemetry (`ROLE_VOCAB_DRIFT_SCAN_FAILED` / `ROLE_VOCAB_DRIFT_RESYNC_ELIGIBLE`). Drift-window pin test revised to the bounded topology. Legacy pre-`roleToken` warnings remain outside direction (b) until the show's next processed sync (spec §3.1 carve-out).

---

## BL-MUTATION-LEDGER-ROLETOKEN-DRIFT — ✅ RESOLVED IN-PR (2026-07-16): ledger re-blessed on feat/extend-role-scope-vocab

**Filed:** 2026-07-16 (extend-role-scope-vocab Task 15) · **Class:** benign ledger drift · **Effort:** S (corpus re-run + surgical re-bless)

The `roleToken` field added to `UNKNOWN_ROLE_TOKEN` warnings (feat/extend-role-scope-vocab) changes parse output for every corpus fixture whose mutated cells produce unknown role tokens, so the redacted parse-output fingerprints in `tests/parser/mutation/knownHoles.ts` drift. Local run 2026-07-16: **~1013 DRIFTED fingerprint rows across 7 shards — SAME siteIds, fingerprint-only (`driftedAlarms`/`driftedStale`), zero NEW siteIds, zero fixed holes** — the benign class per the 2026-07-09 triage discipline (see BL-MUTATION-LEDGER status above: fixture-data-driven sites; a source edit cannot add a site). The nightly `mutation-harness` workflow is non-required and path-filtered to `tests/parser/mutation/**`, so it does not gate this PR. **Refresh:** `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run --project mutation`, then surgical re-bless via `reconcileLedger` (drift bucket only). Trigger: the next mutation-file-touching PR or the first post-merge nightly triage.

**Resolution (2026-07-16):** the nightly on MAIN went red with this exact class the same day, promoting the refresh into this PR. Root cause correction: the drift is ENTIRELY from PR #388-era parser-output changes — the `roleToken` field is empirically fingerprint-neutral (collection dumps from main's parser and this branch's parser are byte-identical). Full corpus collection on the branch + surgical `reconcileLedger` drift-bucket re-bless: 7912 rows, 1017 fingerprints swapped, 0 new holes, 0 fixed holes (machine-verified pure drift; the re-bless script fails loud otherwise). First post-merge nightly should be green.

---

## BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID — one-line desktop grid rows for the roles settings list

**Filed:** 2026-07-16 (extend-role-scope-vocab impeccable dual-gate, `DEFERRED.md` ROLE-VOCAB-1) · **Class:** UX density (P2) · **Effort:** S (responsive layout branch + tests + dual-gate re-run)

**Status:** ✅ SHIPPED — PR #402 (`feat/role-vocab-settings-desktop-grid`, spec `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`, commits `21819c1b5` + `11d6fdd9d`). Single-DOM `min-[760px]:` grid branch in `RoleMappingRow`, `max-w-3xl` container, real-browser layout spec `tests/e2e/roles-settings-layout.spec.ts` + component suite green, invariant-8 dual-gate ran. `DEFERRED.md` ROLE-VOCAB-1 marked resolved.

`/admin/settings/roles` renders the stacked mobile card at every viewport; the committed mock (`docs/superpowers/specs/2026-07-15-extend-role-scope-vocab-mock/Roles You've Added.dc.html`, Desktop width section) specifies a compact one-line grid row (`150px | chips | meta | actions`, short "Edit" label) at >=760px. Implement the desktop variant when the list grows past ~8 rows or Doug reports desk-context sparseness. UI work -> Opus + invariant-8 impeccable dual-gate.

**Status:** ✅ SHIPPED — `feat/role-vocab-settings-desktop-grid` (PR #402, 2026-07-16; spec `docs/superpowers/specs/2026-07-16-role-vocab-settings-desktop-grid.md`). Single-DOM responsive branch in `RoleMappingRow` (`min-[760px]:` grid, header dissolves via `contents`, panels `col-span-4`), `max-w-3xl` container, `EDIT_LABEL_SHORT` re-added behind a constant Edit `aria-label`. Real-browser layout gate `tests/e2e/roles-settings-layout.spec.ts` (desktop-chromium). Dual-gate: critique 33/40, audit 20/20, no P0/P1 (`docs/superpowers/plans/2026-07-16-role-vocab-settings-desktop-grid/DUAL-GATE.md`).

---

## BL-EXTEND-ROLE-SCOPE-VOCAB — map novel role tokens to scope-capability flags

**Filed:** 2026-07-10 (admin field-override removal, `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` §1/§6) · **Class:** capability gap · **Effort:** M (needs a visibility-mapping design)

When a crew member's role in the sheet is a legitimate token the parser doesn't recognize, `role_flags` resolution fails closed (`UNKNOWN_ROLE_TOKEN` → no flag) and that person gets no scope tiles. `role_flags` are a **closed vocabulary** gating scope-tile visibility (`lib/visibility/*`), so editing the sheet cannot elicit the correct scope — the token is spelled fine, the app just doesn't map it. This is one of the two residual needs the removed admin field-override feature was gesturing at but did not properly solve (an override stored a display value, not a capability mapping). **Follow-up:** let an admin map a novel/unrecognized role token to the correct scope-capability flags so it grants the right tiles. Needs a visibility-mapping design (where the mapping lives, per-show vs global, how it survives re-sync, audit trail). Explicitly NOT a free-form value override — it maps a token to a closed-vocab capability set.

**Status:** ✅ SHIPPED — `feat/extend-role-scope-vocab` (PR #396, 2026-07-16; spec `docs/superpowers/specs/2026-07-15-extend-role-scope-vocab.md`). Global `role_token_mappings` table (capability-checkbox model: Audio/Video/Lighting/Financial details, recognize-only valid), pure post-parse overlay applied in phase 2, `ROLE_TOKEN_MAPPED` telemetry with delta gate, admin control on UNKNOWN_ROLE_TOKEN warnings + `/admin/settings/roles` list page. Two residual UX items deferred → `BL-ROLE-VOCAB-SETTINGS-DESKTOP-GRID`, `BL-ROLE-VOCAB-STAGING-OVERLAY`.

---

## BL-STRUCTURAL-TRANSFORM-USE-RAW — "use the sheet's raw value" reversal on recoverable structural transforms

**Filed:** 2026-07-10 (admin field-override removal, `docs/superpowers/specs/2026-07-10-remove-admin-field-overrides.md` §1/§6) · **Class:** correction gap · **Effort:** M–L (per-transform revert semantics)

The one territory where a sheet edit genuinely **can't** elicit correct output: transforms where the sheet is right but the parser mis-structures it and no reword fixes it — room name/dim split (`lib/parser/blocks/rooms.ts`), hotel guest/address glue (`lib/parser/blocks/hotels.ts`), and inverted check-in/out date ordering. The raw value is **already captured** on the corresponding ambiguity warnings (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `DATE_ORDER_SUGGESTS_DMY` — ambiguity-warnings-v1 #367). **Follow-up:** an admin affordance attached to those recoverable structural-transform warnings that says "decline this transform / use the sheet's raw value," deriving the corrected value from the sheet's raw content (never fabricated in-app — no second source of truth). Needs per-transform revert semantics (what "raw" means for each transform, how the reversal survives re-sync, how it renders). This is the sheet-canonical-preserving successor to the removed override layer, scoped to structural transforms only (NOT verbatim fields, which are sheet-editable).

**Status:** ✅ SHIPPED — `feat/structural-transform-use-raw` (spec `docs/superpowers/specs/2026-07-10-structural-transform-use-raw.md`). Content-pinned decisions, pure post-parse overlay, both admin surfaces. One residual UX enhancement deferred → `BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE`.

---

## BL-USE-RAW-WIZARD-FULL-LIST-TOGGLE — wizard use-raw toggle beyond the 3-per-section callout cap

**Filed:** 2026-07-15 (structural-transform use-raw whole-diff review R4, `DEFERRED.md` USE-RAW-1) · **Class:** UX completeness (P2) · **Effort:** S–M (thread props + invariant-8 impeccable dual-gate + Playwright/component tests)

The Step-3 wizard renders the use-raw toggle only inside `SectionFlagCallout`, which caps at `CALLOUT_MAX_ENTRIES = 3` per section (`components/admin/wizard/step3ReviewSections.tsx:519`). A section with >3 recoverable warnings (realistically only room-header splits in a room-heavy show) leaves warnings 4+ without a wizard toggle — they collapse to "+N more in Parse warnings." Not a correctness bug: the decision is reachable post-publish on the uncapped per-show live page (`app/admin/show/[slug]/page.tsx:971-994`), content-pinned by `(code, contentHash)`, so it carries through. **Follow-up:** render the toggle for every in-scope recoverable warning in the wizard's full uncapped `WarningsBreakdown` list (`:2374`), matching the live page — threading `useRawDecisions`/`wizardSessionId` into that component and resolving the summary-callout-vs-full-list redundancy (either the breakdown becomes the sole actionable site or the callout stays a compact preview). UI work → Opus + invariant-8 impeccable critique+audit + real-browser layout/transition tests.

**Status:** ✅ SHIPPED — `feat/use-raw-wizard-full-list` (PR #399, 2026-07-16; spec `docs/superpowers/specs/2026-07-16-use-raw-wizard-full-list-toggle.md`). WarningsBreakdown mounts `UseRawControlBoundary` + `RoleRecognizeControlBoundary` on every in-scope warning when `wizardSessionId` is threaded (callout kept as capped actionable preview); `stableWarningKeys` identity keys at both render sites (reorder state-migration guards); stale-sibling role-control contract pinned (idempotent/conflict). Three impeccable findings deferred → `DEFERRED.md` USE-RAW-FULL-LIST-1/2/3 (`BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION`, `BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y`, `BL-WIZARD-WARNINGS-COPY-QUALIFIER`).

---

## BL-USE-RAW-CALLOUT-PREVIEW-DEMOTION — demote SectionFlagCallout to pure preview (title + jump only)

**Status:** ✅ RESOLVED — `feat/use-raw-callout-preview-demotion` (2026-07-17; spec + plan `docs/superpowers/{specs,plans}/2026-07-17-use-raw-callout-preview-demotion*`). Deliberately overrode the ratified keep-both: stripped the `UseRawControlBoundary` + `RoleRecognizeControlBoundary` mounts from `SectionFlagCallout` so `WarningsBreakdown` is the sole actionable site (one live control instance per warning; divergence structurally impossible). Resolves `DEFERRED.md` USE-RAW-FULL-LIST-1 (moved to `DEFERRED-archive.md`). Impeccable dual-gate: audit 20/20, critique clean; one follow-on UX note → `CALLOUT-PREVIEW-ACTION-CUE-1`, itself ✅ RESOLVED 2026-07-18 (`feat/callout-preview-action-cue`; action-forward "Fix/Review in Parse warnings" jump label — see `DEFERRED-archive.md`).

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-1) · **Class:** UX simplification (P1→ratified+deferred) · **Effort:** S

With PR #399 the wizard's `WarningsBreakdown` is a complete actionable list, so a warning in the first 3 of its section's callout has two live control instances. Use-raw converges via `router.refresh()`; the recognize-role control deliberately performs no client refresh (2026-07-15 §8.1 timing contract), so a recognized role leaves the sibling instance in create mode until navigation — resubmit resolves deterministically (set-equal → idempotent, different → benign conflict notice; pinned by `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`) but can momentarily confuse. Keep-both is the ratified spec decision (spec §2.1/§4.6, 2026-07-16). **Follow-up:** if Doug reports double-recognizing from the two sites, demote the callout to a compact preview (title + jump link, no mounted controls), revisiting the keep-both ratification. UI work → Opus + invariant-8 dual-gate.

---

## BL-USE-RAW-CONTROL-SITE-SCOPED-A11Y — site-scoped testids + qualified aria-labels for duplicated warning controls

**Status:** ✅ RESOLVED — `fix/use-raw-control-site-a11y-copy` (2026-07-17; spec `docs/superpowers/specs/2026-07-17-use-raw-control-site-a11y-copy.md`).

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-2) · **Class:** accessibility (P2) · **Effort:** S–M (touches shared controls + every existing control test)

Both render sites emit identical `data-testid` values (`use-raw-control`, `role-recognize-control`, toggle ids) and identical radiogroup `aria-label`s — screen-reader users hear the same group twice per warning with no disambiguation, and unscoped `getByTestId` queries multi-match. All in-repo queries are container-scoped today, so nothing was broken. **Resolution:** an optional `WarningControlSite` (`"callout"|"list"|"showpage"`) threads mount→boundary→control and site-scopes **every** leaf testid (not just the container) — `use-raw-control`/`role-recognize-control` plus the toggle/panel/check/etc. leaves. Accessible names are **kind/token-qualified**, NOT warning-title-qualified as originally scoped: the use-raw radiogroup is qualified by `resolution.parsed.kind` (room split / hotel guest split / show dates) and the recognize-role trigger by its `roleToken` (label-in-name preserved). This avoided threading `reviewWarningTitle` through the shared controls (the user-ratified approach for this diff). Absent `site` = bare testids, so the standalone unit suites stayed unchanged.

---

## BL-WIZARD-WARNINGS-COPY-QUALIFIER — qualify the "informational / don't block publishing" line above consequential controls

**Status:** ✅ RESOLVED — `fix/use-raw-control-site-a11y-copy` (2026-07-17). Line now reads "These warnings don't block publishing. Some include an optional fix you can apply below." — drops "informational," keeps the non-blocking clause, names the fixes.

**Filed:** 2026-07-16 (use-raw full-list dual-gate, `DEFERRED.md` USE-RAW-FULL-LIST-3) · **Class:** copy (P2) · **Effort:** XS

The §3.10-pinned "These are informational and don't block publishing" line now headlines rows whose controls can grant financial access (recognize-role) or rewrite crew-visible values (use-raw). Still factually true — warnings never block publishing and the controls are optional — but the framing undersells consequence. **Follow-up:** qualify at the next wizard copy pass (copy is §3.10-pinned; requires the spec-copy update discipline).

---

## BL-CREW-RENAME-SILENT-REPLACEMENT — rename (drop+add) bypasses the single-drop shrink gate on published shows

**Status:** ✅ RESOLVED — `feat/crew-rename-shrink-gate` (PR #383, 2026-07-11). Option A tiered, per spec `docs/superpowers/specs/2026-07-10-crew-rename-shrink-gate.md` (4 adversarial rounds APPROVE): the publish gate now keys on crew **removal-class items** (MI-13/MI-14 pairs + their orphan-removes) instead of net `crewDrop`, so drop+add can no longer mask a removal (net-zero rename AND swap both hold); MI-12 (same canonical email) auto-links as an identity-preserving in-place rename — `crew_members.id` survives, so the picker cookie keeps resolving; confirmed MI-13/14 holds also link on the version-bound accept (confirm = vouch); unconfirmed heuristic pairs never merge identities (fail-safe re-pick). `describeShrink` names rename candidates/removals (8-part cap). `undo_change` analyzed and deliberately unchanged (no FK references `crew_members(id)` in the final schema; linked + replaced undo shapes pinned by DB tests). No schema change, no UI files.

**Filed:** 2026-07-10 (e2e preparedness re-rating, `docs/audits/e2e-real-world-variation-preparedness-2026-07-07.md` §10) · **Class:** seam gap (P0-1 residual) · **Effort:** S–M (rename-vs-drop classification)

The #359 fix routes `crewDrop === 1` on published shows through the `shrink_held` confirm path (`lib/sync/phase1.ts:441-444`; MI-6 proper still fires only at `crewDrop > 1`, `lib/parser/invariants.ts:250-252`). But a **rename** arrives as drop+add in the same sync — net crew delta 0 — so neither gate fires: the old member row is silently replaced on a published show. Consequences match the original P0-1: the renamed member's picker identity vanishes (their cookie gets the re-pick banner, so crew-side is fail-safe), and Doug's only trace is an unsurfaced changes-feed row. Two further known carve-outs, both **by design**: unpublished shows auto-apply single drops (`phase1.ts:44`), and `onboarding_scan` mode is excluded from the gate (`phase1.ts:441`). **Follow-up:** classify drop+add pairs within one sync (name-similarity and/or matching email/phone on the added row) as a rename candidate and either auto-link identity (preserve `crew_member_auth`/picker continuity) or route through `shrink_held` for confirm. Note MI-7b precedent: rename re-staging keyed on `(kind,name)` already exists for rooms — the crew rename class is the unhandled sibling.

---

## BL-MUTATION-LEDGER-REFRESH-AMBIGUITY — refresh known-holes fingerprints after ambiguity-warnings-v1

**Status:** ✅ RESOLVED — `feat/mutation-ledger-triage-classify` (2026-07-09). Refreshed via a full `COLLECT_MUTATION_ALARMS` corpus run + surgical re-bless: **1017 fingerprints swapped, 1 fixed hole dropped** (`merged-cell:fixed-income:B8:L48:X1` — the ambiguity parse change now CATCHES that mutant), ledger 7913 → 7912, **zero new holes** (no regression). The original "benign drift, NO new siteIds/holes" claim below held on the regression axis; the one correction is that there was also 1 coverage-improving FIX (a shrink, per the ratchet), not pure drift. The drop was proven legit, not a generation regression or flake (Codex #369 finding): the site is still GENERATED (1 of 853 merged-cell mutants on `fixed-income`) and its oracle verdict flipped `SILENT_WRONG` → `SIGNALED` (the ambiguity warning now makes the corruption visible). The SHIPPED harness never auto-heals — the shard assertion requires `fixedHoles == []`, so any future fixed hole reddens the nightly for human triage; the auto-drop was a supervised one-off in the re-bless tool. Same PR added drift/new/fixed classification to `reconcileLedger` (triage now names which bucket fired) and a schedule-only auto-filed tracking issue so a red nightly is no longer invisible.

The ambiguity-warnings-v1 feature adds four `severity:"warn"` ParseWarning codes (`ROOM_HEADER_SPLIT_AMBIGUOUS`, `HOTEL_GUEST_SPLIT_AMBIGUOUS`, `HOTEL_CARDINALITY_EXCEEDED`, `DATE_ORDER_SUGGESTS_DMY`), so the parser OUTPUT for any corpus fixture that now triggers one of them changes. The mutation harness fingerprints (a redacted parse-output hash) stored in `tests/parser/mutation/knownHoles.ts` `RAW_HOLES` therefore drift for those fixtures (e.g. `2026-04-asset-mgmt-cfo-coo-waldorf` `ref-sub` rows). **Confirmed BENIGN:** same `siteId`s, changed fingerprints only, NO new `siteId`s/holes — mutation sites are fixture-data-driven (`ref-sub`/`blank-row`/… corrupt input cells), not parser-source-line-driven, so a source edit cannot add a site. The nightly `mutation-harness` workflow (NON-required check, path-filtered to `tests/parser/mutation/**` + vitest wiring, self-documented "red is triaged, not a merge blocker") will flag these until the ledger is refreshed; the feature PR deliberately does NOT touch mutation files, so the workflow never ran on it. **Refresh:** run `VITEST_INCLUDE_MUTATION_HARNESS=1 COLLECT_MUTATION_ALARMS=<dir> pnpm exec vitest run --project mutation`, rebuild `RAW_HOLES` from the 8 shard dumps (comparison key is `siteId|kind|fingerprint`; `finding`/`note` are metadata), and commit. Trigger to promote: the next mutation-file-touching PR, or the first post-merge nightly triage.

---

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

---

## BL-COPY-CRON-SWEEP — de-jargon "cron" across the remaining catalog codes

**Status:** ✅ RESOLVED (2026-07-03, branch `chore/copy-cron-sweep`) · **Severity:** low (copy quality; admin-facing) · **Surfaced:** watch-channel-health spec §3.5 (2026-07-01)

All four catalog entries de-jargoned via the §12.4 three-way lockstep (spec prose + `pnpm gen:spec-codes` + catalog.ts, x1 gate green): `STAGED_PARSE_SUPERSEDED` ("a cron run" → "an automatic sync"), `NO_FOLDER_CONFIGURED` ("Cron ran" → "The automatic sync ran"), `MISSING_PENDING_INGESTION_MODTIME` ("so cron knows" → "so the scheduled sync knows"), `SYNC_DELAYED_SEVERE` ("Push or cron is stalled" / "normal cron interval" / "the cron job" → "the scheduled sync" phrasing, plus the sibling "push subscriptions" → "instant updates" per user's cron+push scope choice). Replacement vocabulary matches the shipped `WATCH_CHANNEL_ORPHANED` / `SYNC_STALLED` voice.

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

## BL-ROOM-SHOW-PREFIXED-BREAKOUT-HEADER — parse show-prefixed `<PREFIX> BREAKOUT N` room headers

**Status:** DONE (2026-07-06, feat/bo-show-prefixed-breakout) · **Severity:** low · **Class:** PARSER COVERAGE

**Resolved:** `boBlockRe` now admits an optional single UPPERCASE-alnum-token prefix; `splitRoomHeader` strips it case-sensitively; a prefixed-admission gate (`roomHasBoFieldValue`) requires positive BO-field content so header dims/floor alone cannot fabricate a room; `NEXT_ROOM_HEADER_RE` terminates a BO block on a prefixed header. The two RPAS BREAKOUT 1/2 headers now parse as `LASALLE A`/`LASALLE B` with their dims/floor/fields; the `dci-rpas-central` rooms baseline was regenerated (only that key). Spec `docs/superpowers/specs/2026-07-06-bo-show-prefixed-breakout-header.md`, plan `docs/superpowers/plans/2026-07-06-bo-show-prefixed-breakout-header.md`.

`parseBoRooms`'s `boBlockRe` (`lib/parser/blocks/rooms.ts:1020`) is `^\|\s*BREAKOUT`-anchored (case-sensitive), so it does **not** own a header that carries a show prefix before the `BREAKOUT` keyword — e.g. `RPAS BREAKOUT 1&#10;LASALLE A&#10;30' x 25' x 10.5'&#10;7th Floor` and `RPAS BREAKOUT 2&#10;LASALLE B…` in `fixtures/shows/raw/2025-03-dci-rpas-central.md:207,152` (both above real `BO Setup`/`BO Set Time`/… blocks). No other pass claims them either, so these two breakout rooms are **currently unparsed** (the fixture's baseline rooms contain only GS). Surfaced during the BO-venue-header-anchor review (Codex R1). The BO-venue-header anchor deliberately does **not** start parsing them (its substring ownership gate excludes any `BREAKOUT`-bearing header to keep the frozen corpus byte-identical). **Fix (when prioritized):** extend `boBlockRe` (or add a pass) to admit a `<optional prefix> BREAKOUT N <name> <dims> <floor>` header, deriving the room name from the non-prefix, non-BREAKOUT portion (`LASALLE A`); regenerate the room baseline and assert the two RPAS breakouts parse with their dims/floor/fields. Changes the frozen `origin-main-rooms.json` baseline for `dci-rpas-central`, so it is its own PR, not a rider.

---

## BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO — derive Step-3 override state from the durable row, not the preview

**Status:** ✅ RESOLVED 2026-07-17 · **Severity:** medium · **Class:** UI ROBUSTNESS (Opus-only + invariant-8 impeccable)

Shipped: the durable `pending_syncs.pull_sheet_override` is reduced (`coerceOverrideSnapshotFromRow`, finalize-parity) onto `Step3Row.pullSheetOverride` → `SectionCore.pullSheetOverride`, and `PackListBreakdown` derives override state from the durable snapshot compared against the preview via `overrideSnapshotsEqual`. On divergence it renders the S5 re-scan recovery block (no S2/S3 re-offer, so the loop cannot recur); the S5 Re-scan is frozen during publish runs via `Step3RunStateContext`. Plan `docs/superpowers/plans/2026-07-17-psat1-durable-override-dto/`. Original context below.

Step-3 (`components/admin/wizard/step3ReviewSections.tsx`) derives `overrideActive` solely from the persisted preview (`pr.archivedPullSheetTabs.some((t) => t.included)`), not from the durable `pending_syncs.pull_sheet_override` row. When an accept/revoke RPC commits but its best-effort follow-up re-scan fails (transient infra; route returns 200 on RPC success per §5.8 audit-before-re-scan), the durable override and the preview `included` flag diverge, so Step-3 re-offers S2 (accept, `expectedOverrideSnapshot: null`) → RPC row-state CAS 40001 → 409 → `router.refresh()` reloads the same stale envelope → loop (revoke-failure is the inverse stale-S3). Surfaced by whole-diff Codex review R2 on `feat/pull-sheet-archived-tab-override`. **Not a data or publication bug** — the override commits correctly and the Task-11 finalize gate (`STAGED_PARSE_OUTDATED_AT_PHASE_D`) fail-safes publication; only the recovery UX loops, and only on a re-scan infra failure. **Fix (when prioritized):** thread a `pullSheetOverrideActive: boolean` (from `pending_syncs.pull_sheet_override != null`) through the Step-3 DTO (`Step3SheetCard` → `SectionData`) and derive `overrideActive` from it; where durable-override and preview-`included` disagree, render the §5.8 "re-scan needed" divergent state ("gear saved; preview refreshing — reload to update") instead of S2/S3. UI is Opus-only + `/impeccable critique`+`audit` (invariant 8). Tracked in `DEFERRED.md` → PSAT-1.

---

## BL-AUTOAPPLIED-CARD-LAYOUT-E2E — real-browser width-distribution assertion for the auto-applied card button grid

**Status:** ✅ SHIPPED (2026-07-17) · **Severity:** low · **Class:** UI LAYOUT COVERAGE

The redesigned "Recently auto-applied" change card distributes Accept/Undo via CSS grid (`grid-cols-2` 1fr/1fr, or `grid-cols-1`) + `w-full` buttons. ~~The jsdom suite pins the mechanism; a real-browser pixel-width assertion is deferred.~~ **Shipped:** `tests/e2e/autoAppliedCardGrid.layout.spec.ts` (+ harness `_autoAppliedCardGridHarness.tsx`, in `standalone.config.ts`) renders the real `RecentAutoAppliedStrip` and asserts the 1fr/1fr split and the single==double+gap full-width invariant from measured button boxes only (no hardcoded pixel, no grid-class selector); negative-regression verified. See `DEFERRED.md` AUTOAPPLIED-REDESIGN-1.

---

## BL-AUTOAPPLIED-SINGLETON-FLATTEN — flatten card-in-card for single-change groups

**Status:** ✅ RESOLVED-BY-SUPERSESSION (2026-07-17) · **Severity:** low · **Class:** UI POLISH
A per-show group with one change renders a group-card wrapper around a single inner change-card (card-in-card). Consider dropping the inner border/padding when `rows.length === 1`. ~~Deferred: marginal gain, adds a render branch, matches the approved mock.~~ **Resolved:** `StripRow` now takes a `flatten` path — singleton groups flatten the inner row card (no card-in-card) while multi-row groups keep per-row cards; pinned green by `tests/components/admin/RecentAutoAppliedStrip.test.tsx` ("singleton group flattens the inner row card"). See `DEFERRED.md` AUTOAPPLIED-REDESIGN-2. (Verified live during the KINDDOT-1 ship; BACKLOG had drifted.)

---

## BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF — structured field-level From→To for field_changed

**Status:** ✅ RESOLVED (PR #453, 2026-07-17) · **Severity:** low · **Class:** FEATURE / DB WRITE-PATH
~~`field_changed` rows show a generic summary ("A field changed on this sync"); naming the field / showing its From→To needs structured before/after stored at write time (`writeAutoApplyChanges.ts`) — the DB write-path arc this read-only redesign excluded.~~ **Resolved:** shipped as REDESIGN-3. `field_changed` rows render a structured per-field list (MI-8 "cleared" note-only / MI-8b COI From→To / MI-8c "N cases removed" / **MI-9 role From→To**, existing-crew-only) stored on `show_change_log.after_image.fieldChanges` — no migration (freeform jsonb, `after_image` already selected), no `TriggeredReviewItem` widening, no old financial value stored. New `lib/sync/changeLog/fieldChanges.ts` (`buildFieldChangesRow` writer + `deriveFieldsDiff` reader, 500-entry read cap + forensic `AUTOAPPLIED_FIELDCHANGES_INVALID` warn); component renders all entries (no "+N more"), field name as the heading, all-malformed/corrupt → a visible "Unavailable" warning row. Spec + plan under `docs/superpowers/{specs,plans}/2026-07-17-autoapplied-field-structured-diff`. See `DEFERRED.md` AUTOAPPLIED-REDESIGN-3.

---

## BL-AUTOAPPLIED-COLLAPSED-KIND-HINT — surface change kind in the collapsed group header

**Status:** ✅ RESOLVED-BY-SUPERSESSION (2026-07-17) · **Severity:** low · **Class:** UI TRIAGE DENSITY
~~Collapsed-by-default group headers (per explicit user directive) show only showName + a bare count; the change kind (incl. a destructive "Removed") is hidden until expand.~~ **Resolved:** the collapsed `GroupSection` header now renders `KindDotCluster` — one dot per distinct change kind (incl. destructive "Removed") + an `aria-label` naming every kind, visible before expanding; pinned by `tests/components/admin/RecentAutoAppliedStrip.test.tsx` ("collapsed header shows a kind-dot cluster"). KINDDOT-1 (2026-07-17) then hardened the destructive dot with a shape-distinct minus-bar (non-color tell). See `DEFERRED.md` AUTOAPPLIED-COLLAPSE-1 + KINDDOT-1. (Verified live during the KINDDOT-1 ship; BACKLOG had drifted.)

---

## BL-DISCLOSURE-FAMILY-HEIGHT-MORPH — animate the disclosure family (accordions) at once

**Status:** ✅ RESOLVED-BY-SUPERSESSION (2026-07-17) · **Severity:** low · **Class:** UI MOTION / SYSTEM-WIDE
~~The dashboard disclosure components (`RecentAutoAppliedStrip` groups, `IgnoredSheetsDisclosure`, `AddAdminDisclosure`) all mount/unmount their panels instantly while the chevron animates~~; DESIGN.md lists "accordion expand" at `duration-normal`. **Resolved:** all three named disclosures now use the shared `components/admin/CollapsePanel.tsx` — a height-morph track (`grid-template-rows 0fr→1fr` over `duration-normal`, `inert`-when-closed, reduced-motion aware), so the whole family shares one animated idiom. (Other instant `{open ? … : null}` surfaces like `AppHealthIndicator`/`ReportModal` are a nav indicator + modal, outside this disclosure family.) See `DEFERRED.md` AUTOAPPLIED-COLLAPSE-2. (Verified live during the KINDDOT-1 ship; BACKLOG had drifted.)

---

## BL-DESTRUCT-ARMED-REFLOW — verify/fix armed morph label reflow under the finger at 360px

**Status:** RESOLVED (2026-07-17, branch `fix/destruct1-armed-reflow`) · **Severity:** medium · **Class:** UI MOBILE ERGONOMICS

The three two-tap guards (BulkIgnoreControls, PendingPanelDiscardButtons, StagedReviewCard) swap in a longer armed label, so the confirm hit-target can grow/wrap between tap 1 and tap 2 while a phone user's finger is already traveling. (`RescanSheetButton`'s G3 arm guard was withdrawn in PR #411 — it no longer arms — so the surface is three, not the four this row originally listed.) **Resolved:** real-browser measurement at 360px found only `PendingPanelDiscardButtons` relocates the target (armed label wraps to a new flex row); fixed by stacking its two discard buttons full-width `< sm` (`basis-full sm:basis-auto`) so the ignore box is stable across the morph. `BulkIgnoreControls` (right-edge pinned) + `StagedReviewCard` (left-edge pinned) measured benign, no change. Real-browser layout spec with negative control: `tests/e2e/pendingDiscardReflow.layout.spec.ts`. DEFERRED.md DESTRUCT-1. Spec `docs/superpowers/specs/2026-07-17-destruct1-armed-reflow.md`.

---

## BL-RPC-RESET-SELECTION-LIFECYCLE-GUARD — lifecycle-guard the per-member picker-reset RPC + sweep sibling admin RPCs

**Status:** RESOLVED (2026-07-17) · **Severity:** low (pre-existing; admin-gated; defense-in-depth) · **Class:** DB SECURITY / RPC LIFECYCLE GUARD

**Resolution (2026-07-17):** (a) `reset_crew_member_selection` gained the byte-identical DEF-1 post-lock guard (archived/published/finalize-owned refusal); its JS boundary discriminates the P0001 lifecycle refusal from infra so no false `PICKER_SELECTION_RESET_INFRA_FAILED` is emitted. (b) The sibling sweep audited every crew/share-mutating SECURITY DEFINER surface against the live `pg_catalog`; the one further gap — `undo_change` — gained an archived + finalize-owned guard (structured `UNDO_SHOW_ARCHIVED` / `UNDO_FINALIZE_OWNED` returns, NOT published-gated; two new §12.4 codes). A `undoChange.ts` post-success read `{data,error}` invariant-9 swallow was fixed in passing. The whole class is pinned by the fails-by-default `tests/db/crew-rpc-lifecycle-guard-meta.test.ts` (GUARDED / EXEMPT / TRIGGER / PRIVATE_HELPERS registries). `publish_show`/`unpublish_show`/`validation_finalize_all_atomic` verified out-of-scope (no target-table mutation); the crew-auth link RPCs + `set_field_override` were confirmed dropped, not gaps. See spec `docs/superpowers/specs/crew/2026-07-17-rpc-crew-lifecycle-guard-design.md`.

`reset_crew_member_selection(p_show_id, p_crew_member_id)` (`supabase/migrations/20260703000001_reset_crew_member_selection.sql:16`) gates only on `is_admin()` — it has NO archived / published / finalize-owned lifecycle guard, unlike its lifecycle-aware siblings (`archive_show` carries a finalize-owned refusal; the published toggle refuses under finalize). It is therefore invocable against a read-only (archived/unpublished) or finalize-owned show, mutating `crew_member_auth` selection state on a show the admin UI presents as read-only. The consolidated per-show page fix (`app/admin/show/[slug]/page.tsx` — shareSlot serialization gate) stops the affordance being SERIALIZED into the RSC payload for ineligible shows, so this is no longer reachable through the rendered UI; the RPC itself remains a lifecycle-agnostic entry point via a direct PostgREST `rpc()` call. **Fix (when prioritized):** (a) add the `archived`/`published`/finalize-owned refusal to `reset_crew_member_selection` (mirror `archive_show`'s `readfinalizeowned_b2` + `shows.archived/published` checks under the per-show advisory lock, AGENTS.md invariant 2); (b) structural sweep of sibling admin picker/crew RPCs (`reset_picker_epoch`, `rotate_show_share_token`, and the crew-mutating SECURITY DEFINER set) for the same lifecycle-guard gap — enumerate each RPC × {archived, unpublished, finalize-owned} × has-guard, and pin the invariant with a meta-test. Trigger: next admin-RPC security pass, or a report of a reset/rotate landing on an archived show.

---

## BL-BELLPANEL-ROWTONE-NOTICE-WEIGHT — rowTone renders notice-weight health codes red — ✅ SHIPPED

**✅ SHIPPED (branch `feat/bell-triage-severity-grouping`, 2026-07-17):** `rowTone` now returns `critical` only when `DEGRADED_HEALTH_CODES.includes(entry.code)`, else `notice` — so the 9 `audience:"health"` + `healthWeight:"notice"` codes render amber (Warning), matching the health rollup. `rowTone` moved to the new pure `lib/admin/bellTriage.ts`; the color-blind floor still holds (glyph SHAPE carries severity). Landed with its DEFERRED twin BELL-2 (triage grouping) in one PR, per the DEFERRED↔BACKLOG twin rule. Coverage: `tests/admin/bellTriage.test.ts` + `tests/components/bellPanelRedesign.test.tsx` (notice-health → Warning, not Critical).

**Filed:** 2026-07-17 (role-flags-notice-lead-only-doug §5, deferred to keep the change non-UI) · **Class:** UI (bell severity tone) · **Effort:** S (2-line fix + impeccable gate)

`BellPanel.tsx` `rowTone` short-circuits `if (entry.isHealth) return "critical"` BEFORE consulting `healthWeight`/`severity`, so EVERY notice-weight health code (SYNC_STALLED, WATCH_CHANNEL_ORPHANED, and the ~7 other `healthWeight: "notice"` codes) renders a red `CircleAlert` even though the health rollup treats them amber. Moot for `ROLE_FLAGS_NOTICE` after its health→doug reclassify (it is no longer `isHealth`), but latent for the rest. Fix: `if (entry.isHealth) return DEGRADED_HEALTH_CODES.includes(entry.code) ? "critical" : "notice"` (`DEGRADED_HEALTH_CODES`/`NOTICE_HEALTH_CODES` already exist, `lib/adminAlerts/audience.ts`). UI change → invariant-8 impeccable dual-gate applies. Trigger: next bell/health-panel UI pass.

---

## BL-MI9-LEAD-ROUTING-DIVERGENCE — auth-sensitive LEAD-bit routing (RESOLVED: ratified as auto-apply + audit)

**Status:** RESOLVED (2026-07-17, PR #439 `fix/mi9-lead-staging` merged) · **Severity:** was HIGH (security / authorization) · **Class:** AUTH ROUTING — resolved by ratification, not by restoring staging

**Resolution (owner option B, opposite of this entry's original "restore staging" proposal):** the owner ratified that a LEAD-bit change **AUTO-APPLIES** — it is a deliberate sheet edit (Doug typing/removing `LEAD`), not a parser guess, and severs no access. Instead of staging, the change is made **auditable**: every `role_flags` delta emits `ROLE_FLAGS_NOTICE` (`admin_alerts`, info severity) and a LEAD gain/loss additionally writes a durable failure-visible `LEAD_ROLE_APPLIED` audit `app_event` (forensic, recoverable via `observe events`). Ratified plan amendment #8 (`plans/…/00-overview.md:158-175`), master spec §6.8/§12.4/help copy, and `tests/sync/phase1.test.ts` were all reconciled to auto-apply in PR #439; the dead `MI-9_ROLE_FLAGS_DELTA` §12.4 code was retired to `RETIRED_CODES`. `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` (REDESIGN-3) now **enriches** MI-9's auto-applied `field_changed` row (a role From→To entry) rather than treating it as out-of-scope. The original problem statement below is retained as history — its proposed "route MI-9 to staging" fix was **not** adopted.

---

_History (superseded — the fix below was NOT adopted; auto-apply was ratified instead):_

**Original framing — surfaced by REDESIGN-3 adversarial review R13/R21:**

The **canonical master spec** requires an MI-9 LEAD-bit set-membership change (crew member gains or loses `LEAD`) to **STAGE for admin approval** — LEAD grants ops + `shows_internal` financial access. Sources (all say STAGE): master spec §6.8 (`docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md:1624` "Stage for approval", with the exact examples `['A1']→['LEAD','A1']` / `['LEAD','A1']→['A1']`); §12.4 (`:2862` `MI-9_ROLE_FLAGS_DELTA` → "Doug → review staged"); help copy (`:3155` "we hold every LEAD toggle for review"); ratified plan amendment #8 (`plans/…/00-overview.md:158-175`, 2026-05-09); M6 handoff (`plans/…/handoffs/M6-drive-sync.md:324`); Phase-1 test plan (`plans/…/06-drive-sync.md:66`).

**But the live code auto-applies it.** The "Phase 2 Task 2.1 decision rule" (`lib/sync/phase1.ts:504-511`, landed 2026-06-09 — a month after amendment #8) over-broadened to "MI-11 is the ONLY gated invariant; every other invariant auto-applies", sweeping MI-9 LEAD-bit into `outcome: "pass"` (auto-apply). `tests/sync/phase1.test.ts:807-849` **pins the wrong behavior** (asserts MI-9 LEAD-gain and LEAD-loss → `"pass"`). No document ratifies auto-apply; per invariant 7 (spec canonical) this is an **unratified divergence / security bug**: a LEAD promotion/demotion in a sheet currently grants/revokes ops+financial access silently, without the required staged admin review.

**Fix:** route MI-9 LEAD-bit items to the staging path so Phase-1 returns `outcome: "stage"` (whole parse to `pending_syncs`, Phase 2 not executed), per §6.8 + the drive-sync test plan ("Phase 1 returns `stage`; `pending_syncs` row exists; Phase 2 NOT executed"). Compose with the existing shrink-held (MI-6/7/13/14), MI-11 hold, debounce, and first-seen gates. Correct `phase1.test.ts:807-849` to assert `stage` for the MI-9 cases + add a dedicated MI-9-stages regression. Non-LEAD `role_flags` deltas stay auto-apply with `ROLE_FLAGS_NOTICE` (unchanged). **Blocks/precedes** `BL-AUTOAPPLIED-FIELD-STRUCTURED-DIFF` (REDESIGN-3): once MI-9 stages it never reaches the auto-applied `field_changed` writer, simplifying that feature. Trigger: fix NOW per owner decision 2026-07-17 (chosen over shipping REDESIGN-3 first).
