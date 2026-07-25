# BACKLOG-archive.md

Historical ledger of resolved / shipped / superseded BACKLOG items — full provenance kept (what, why, how it was resolved). The live speculative queue is **[BACKLOG.md](./BACKLOG.md)**; entries graduate here when they ship.

Order follows the original BACKLOG.md layout, not resolution date — **grep by id**. Ids are preserved verbatim so every `BL-*` reference elsewhere in the repo (specs, plans, test comments, `DEFERRED.md`) still resolves to a readable entry.

Same split as [DEFERRED.md](./DEFERRED.md) ↔ [DEFERRED-archive.md](./DEFERRED-archive.md): the working queue stays a queue, the changelog lives here.

---

## BL-PHANTOM-GAP-PROBE-OTHER-SURFACES — run the zero-extent-flex-item probe on the crew page and dashboard harnesses

**Filed:** 2026-07-24 (branch `fix/overview-phantom-gap`). **Class:** layout hardening. **Effort:** S per harness.

`T-NOPHANTOM` (tests/e2e/published-review-modal.layout.spec.ts) walks the rendered tree for in-flow items with zero extent on their parent's gap axis — an always-rendered wrapper whose entire content is state-gated is invisible but still charges its parent's `gap`. It found two instances on its first run: the reported Overview `overview-sheet-sync` slot (32px) and `ScheduleDayRow`'s time grid (4px per entry-less day). Both are now fixed with `empty:hidden`.

The probe is scoped to the PUBLISHED MODAL tree only, so the crew page, the admin dashboard, and the wizard's own surfaces are unmeasured. A static sweep of `components/` + `app/` for the conditional-only-wrapper shape found no further true positives, but it cannot see the `{items.map(...)}` form — an empty array leaves no textual trace, and that is exactly the form the ScheduleDayRow instance took. So static coverage is not a substitute.

**Work:** extract the probe into a shared helper and mount it in the existing standalone crew-page and dashboard layout harnesses. Expect false positives to need the same `checkVisibility()` treatment per surface (on the modal, the `lg:hidden` chip rail alone produced 25).

**Status:** ✅ SHIPPED — `test/phantom-gap-probe-real-pages` (2026-07-25, PR #581). The walk lives in `tests/e2e/helpers/phantomGap.ts` (`scanForPhantomGaps` + `reconcilePhantomLedger`) and is mounted on the REAL routes rather than new harnesses — a fixture chosen to look complete is exactly the one that cannot catch an emptied-out wrapper. Mounts: `T-NOPHANTOM-DASH` on `/admin` (390 / 1280), `T-NOPHANTOM-SHOW` on the HYDRATED show modal at `/admin?show=<slug>` (375 / 1280 — the static harness never hydrates, which its own header names as its blind spot), and `T-NOPHANTOM-CREW` on all six crew sections (390 / 1000). All wired into `.github/workflows/phantom-gap-e2e.yml`, because both host specs were matched by playwright projects but invoked by no workflow — mounting a probe into a dark spec would have made the probe dark too.

Two defects it paid for immediately: a PROBE defect (grid axes were admitted on item count; grid gaps sit between TRACKS, and track count is independent of item count in both directions — `shows-table-header`, 7 items across 7 tracks in one row, was reported as an offender it is not), and a real layout instance on the hydrated modal that no static fixture crowds enough to reveal, carried forward as `BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW`.

Not covered, deliberately: the wizard's own pre-publish surfaces, `BellPanel`, and the admin nav — no probe mount reaches them yet. Adding one is the same recipe (scan root + named non-vacuity anchor + a workflow step).

---

## BL-HOVERHELP-PORTAL — portal the HoverHelp popover so it survives clipping ancestors

**Filed:** 2026-07-20 (show-alert-compact spec, adversarial R2 F7/F8/F10) · **Class:** UI robustness · **Effort:** M (portal + positioning, or an anchor-positioning polyfill, plus containment assertions)

`HoverHelp` positions its popover body absolutely IN FLOW rather than portaling it (components/admin/HoverHelp.tsx:193). Inside a scrolling surface the popover can be visually clipped by an ancestor, and `getBoundingClientRect()` does not reveal it (it reports the unclipped box, so a naive assertion passes). The concrete case: `AttentionBanner` cards sit in an `overflow-y-auto` scroll container (components/admin/review/ShowReviewSurface.tsx:869) nested in an `overflow-clip` panel (components/admin/review/ReviewModalShell.tsx:614), so a popover opened near the bottom of the scroll viewport is cut off until the user scrolls.

Pre-existing for every HoverHelp consumer inside a scrolling admin surface; NOT introduced by show-alert-compact, whose spec explicitly descopes placement policy to the shipped default (amendment A6) rather than inventing an unmeasurable geometry rule. Fixing it means portaling the body to `document.body` with anchored positioning (or adopting CSS anchor positioning with a polyfill), then asserting popover containment against BOTH clipping ancestors in a real-browser test.

**Status:** ✅ RESOLVED — `feat/hoverhelp-smart-position` (2026-07-22; spec `docs/superpowers/specs/2026-07-22-hoverhelp-smart-position.md`). The shared `HoverHelp` body now portals — into the `ReviewModalShell` panel via `PopoverHostContext` (staying inside the focus trap / aria-modal / inert subtree) or `document.body` elsewhere — with a pure collision-aware positioning core (`lib/popover/position.ts`). The exact AttentionBanner-at-pane-bottom geometry this entry documents is the T4a elementFromPoint kill-shot in `tests/e2e/published-review-modal.interactions.spec.ts`; body-host geometry is covered by `tests/e2e/hoverhelp-geometry.spec.ts` (19 cases). Follow-up carve-out: `BL-HOVERHELP-VISUAL-VIEWPORT` below.

---

## BL-HOVERHELP-VISUAL-VIEWPORT — position HoverHelp against the visual viewport under pinch-zoom

**Graduated:** 2026-07-25. Shipped on `fix/hoverhelp-visual-viewport-tdd` (PR #595).

**Filed:** 2026-07-22 (hoverhelp-smart-position spec §9, deferred by design) · **Class:** UI robustness (mobile pinch-zoom) · **Effort:** S-M (`window.visualViewport` rect + resize/scroll listeners in the shell measure path)

`computePopoverPlacement` bounds body-host popovers by the LAYOUT viewport (`window.innerWidth/innerHeight`). Under pinch-zoom the visual viewport is a smaller, offset window onto the layout viewport, so an open popover can sit partially outside what the zoomed-in user can see. Ratified as out of scope for v1 (spec §1.1): admin surfaces are desktop-first, pinch-zoom on the crew page is transient, and the popover is dismissible/reopenable at the new zoom. Fix shape: use `window.visualViewport` (rect + `resize`/`scroll` events feeding the existing rAF coalescer) as the bounds rect when present.

**Status:** CLOSED — implemented per `docs/superpowers/specs/2026-07-24-hoverhelp-visual-viewport.md`. Scope grew during review: `ShareHub` carries the identical placement code and was fixed in the same change; WebKit is explicitly excluded (its coordinate convention is unverifiable in this repo's harness); and the guarantee that zoom can never newly hide a popover is pinned by a property suite rather than a boundary rule.

---

## BL-CREW-WARN-STACK-E2E-GEOMETRY — real-browser width-fill assertion for the crew under-row warning stack

**Filed:** 2026-07-24 (retroactive — deferred in PR #534's body 2026-07-21, never filed) · **Status:** ✅ SHIPPED (2026-07-24, branch `test/crew-warn-stack-width-fill`) · **Class:** test coverage (real-browser layout)

PR #534 descoped its Task 10 (real-browser layout) with: "`CrewUnderRowStack`'s parent is not fixed-dimension, so the rule's trigger doesn't apply; width-fill is unit-asserted. Deferred `BL-CREW-WARN-STACK-E2E-GEOMETRY`." The id was cited in the PR body but no row was ever added to BACKLOG.md, DEFERRED.md, or this archive — found by a PR-body-vs-ledger reconciliation sweep on 2026-07-24.

PR #563 (crew-warning-attachment T5) had already landed real-browser geometry for the surface at `tests/e2e/published-review-modal.layout.spec.ts`: the under-row stack `[data-testid="crew-warn-stack-<key>"]` measured inside the crew panel card's border box on all four edges, and between its member's row and the next. Those are CONTAINMENT bounds, not the width-FILL equality the deferral named — a stack rendered at half width or indented satisfies them.

**Shipped:** `T-WARN-WIDTHFILL @1280` + `@390` in that spec's existing T5 describe block (harness page `crewwarnings.html`, shared `TOL`; no new harness or config). Asserts left edge + width on BOTH the border box and the content box of the stack against the member ROW's measured spans. The row is resolved from the rendered name span upward to the hosting `<li>`'s direct child — never from the stack's own parent, which would restate `display: block` — and the resolver throws if the resolved row turns out to contain the stack, so a future markup collapse fails instead of passing vacuously. Anti-vacuity floor (`row.contentW > viewport * 0.4`) plus row-fills-li rule out a collapsed layout satisfying any equality.

Both spans are measured because the first cut measured only `getBoundingClientRect()` and the named regression SURVIVED: under `box-sizing: border-box`, hoisting the per-kind `pl-6` (crewwarn-underrow-polish §2) onto the stack leaves the border box byte-identical while insetting every card 24px. Negative-regression verified per mutation: `pl-6` on the stack fails content-box left at both viewports; `mx-4` fails border-box left at both; `w-fit` fails border-box width at 1280 but SURVIVES at 390, where the widest card already fills the narrow row so shrink-to-fit is geometrically indistinguishable from fill (documented in the test comment, not a gap the assertion can close).

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

## BL-COPY-CRON-SWEEP-2 — de-jargon "cron" on the two non-catalog admin surfaces

**Status:** ✅ RESOLVED (2026-07-25, branch `chore/copy-cron-sweep-2`) · **Severity:** low (copy quality; admin-facing) · **Surfaced:** BL-COPY-CRON-SWEEP execution (2026-07-03)

The two filed surfaces plus the destination they link to, so the vocabulary is coherent end to end rather than a de-jargoned label opening a page headed "Cron health". Replacement word is **scheduled job**, not the archived sweep's "automatic sync": the telemetry page covers 9 jobs (notify, diagram-gc, report-reaper, asset-recovery, keepalive, sync, refresh-watch, gc-watch, plus sync), so a sync word would have narrowed it. The help-MDX line describes the sync specifically and does use "automatic syncing".

Shipped: `app/admin/settings/page.tsx` (Diagnostics link title + sub), `app/help/admin/onboarding-wizard/page.mdx:117` ("points cron at the folder for ongoing sync" → "starts automatic syncing of the folder"), `app/admin/dev/telemetry/page.tsx` (header sub + degraded fallback), `components/admin/telemetry/CronHealthHeader.tsx` + `CronHealthList.tsx` ("Cron health" → "Scheduled jobs"), `TelemetryOverviewStrip.tsx` ("Cron jobs" → "Scheduled jobs"; "Cron health unavailable" → "Health unavailable", non-redundant under the relabelled card). Identifiers, `data-testid`s, `aria-labelledby` ids, route paths, and component/file names keep "cron" — they name the real pg_cron mechanism and are not user-visible.

Test pins added in the same commit (each fails on re-introduction): `tests/components/telemetry/cronHealthHeader.test.tsx` heading, `cronHealthList.test.tsx` heading, `telemetryOverviewStrip.test.tsx` (label in both ok + infra_error states, plus `not.toMatch(/cron/i)` on the card's text), `tests/app/admin/telemetryPage.test.tsx` (header sub + degraded fallback), `tests/help/page-onboarding-wizard.test.tsx` (`not.toMatch(/\bcron\b/i)` over the whole MDX source), `tests/e2e/developer-tier.spec.ts` (link copy + `not.toContainText(/cron/i)` on the Diagnostics section).

No repo-wide static jargon guard was added: there was no regression vector to close — the leftovers were the first sweep's deliberate deferral, not copy someone re-introduced — and a scanner over `app/**` + `components/**` would have to distinguish copy from the many legitimate `cron` identifiers, testids, and route paths. The per-surface `not.toMatch(/cron/i)` pins cover the surfaces that actually carry the copy.

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

---

## Picker-flow app bugs (3) — RESOLVED on branch `fix/picker-flow-app-bugs` (2026-07-25)

**All three shipped together**, each with the paired e2e stub un-skipped as its red phase, and the suite wired into `crew-e2e.yml` so the cases actually run in CI (they were dark for two independent reasons: the job named exactly one spec file, and `PICKER_COOKIE_SIGNING_KEY` was set in no workflow at all, so the suite would have crashed at setup rather than failing cleanly). That workflow's trigger was also inverted from `paths` to `paths-ignore` after six review rounds each found another missing entry in the allow-list, so the job now runs unless a change touches only prose no script reads (not `docs/`, which prebuild's manifest reads). It is still path-gated, not PR-blocking-capable: an interim claim that the specs became "PR-covered" was an artifact of the coverage scanner matching only `paths:`, which this branch fixed. Spec: `docs/superpowers/specs/2026-07-24-picker-flow-app-bugs.md`; plan: `docs/superpowers/plans/2026-07-24-picker-flow-app-bugs.md`.

Two of the fixes differ from what these entries proposed, both for reasons review established:

- **BL-PICKER-BOOTSTRAP-HOST-FLIP** was swept as a class, not patched at the two named sites. The grep found **six** `new URL(..., request.url)` redirect expressions across four files, two of which build the URL through a local variable. All six route through a new `hostRelativeRedirect` helper, and an AST guard bans the shape under `app/`.
- **BL-PICKER-GATE-SKIP-MISMATCH**'s proposed fix was **rejected as insufficient**. Honoring `?gate=skip` on a cleared session reaches the picker exactly once: `google_mismatch` is decided before the picker cookie is ever consulted, so the very next request re-renders the gate. The shipped fix signs the browser out device-locally (`scope: "local"` — the library default is global and would revoke a colleague's other devices), after which the chain resolves to `first_contact` and the existing guard applies unchanged. `page.tsx` was not touched.
- **BL-PICKER-CLAIMED-ROW-NEXT-DROP** shipped as proposed: `next` rides a hidden input.

Original entries follow, verbatim.

PR #60 landed the picker-flow e2e (`tests/e2e/picker-flow.spec.ts`) with three `test.skip` stubs whose SKIP comments each say the blocker is **app behavior, not a helper/config gap**. PR #60's summary claimed these were "filed as follow-ups in BACKLOG.md," but no entries existed — the bugs lived only as `// SKIP:` comments and are still live. These three entries make the tracking honest. Do NOT un-skip the tests until the paired app fix ships; enabling a stub without its fix just re-surfaces a known red. (Each SKIP comment records a direct repro.)

### BL-PICKER-BOOTSTRAP-HOST-FLIP — bootstrap redirect canonicalizes 127.0.0.1 → localhost and drops the auth cookie

**Resolved on branch `fix/picker-flow-app-bugs` (2026-07-25).** See the section header above for what shipped differently from what this entry proposed.

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (blocks the authed picker-bootstrap leg; the host flip drops the host-scoped Supabase auth cookie) · **Class:** APP-BEHAVIOR BLOCKER

The authed leg redirects through `/api/auth/picker-bootstrap`, whose `NextResponse.redirect(new URL(nextOutcome.path, request.url), …)` (`app/api/auth/picker-bootstrap/route.ts:181,199`) canonicalizes the host `127.0.0.1` → `localhost` (`request.url` reports `localhost` even under `pnpm start -H 127.0.0.1`; `NEXT_PUBLIC_SITE_ORIGIN` does not influence it). That host flip drops the `127.0.0.1`-scoped Supabase auth cookie, so the revisit resolves to Mode A instead of `needs_picker_bootstrap` and the crew-shell never renders. Verified reproducing under both `pnpm dev` and `pnpm build && pnpm start`. **Fix:** emit a host-relative `Location` from the bootstrap redirect (app fix in `app/api/auth/picker-bootstrap/route.ts`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:77` ("first-contact gate -> tap 'Sign in with Google' -> OAuth happy path -> show body renders"; SKIP note at :68).

### BL-PICKER-GATE-SKIP-MISMATCH — "Continue as guest" can't reach the picker while an authed non-roster session persists

**Resolved on branch `fix/picker-flow-app-bugs` (2026-07-25).** See the section header above for what shipped differently from what this entry proposed.

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (a cleared-but-present session can't reach the picker via guest-skip) · **Class:** APP-BEHAVIOR BLOCKER

"Continue as guest" (`clearIdentityAndSkip`, wired at `app/show/[slug]/[shareToken]/_SignInOrSkipGate.tsx:96`) clears the stale picker entry, but the browser STILL carries the authed non-roster Google session, so the post-action resolve is `reason: 'google_mismatch'` (NOT `first_contact`); `page.tsx` honors `?gate=skip` only for `first_contact` (`app/show/[slug]/[shareToken]/page.tsx:25-28,77`), so the Mode B mismatch gate re-renders and `picker-interstitial-root` never mounts. Confirmed by direct repro: after the guest click the page stays on the Mode B gate (mismatch header still visible), not the picker. **Fix:** let the gate semantics reach the picker via `?gate=skip` when the session is present-but-cleared (app decision in `app/show/[slug]/[shareToken]/page.tsx` + `clearIdentityAndSkip`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:173` ("Mode B 'Continue as guest' atomically clears the stale entry and lands on the picker"; SKIP note at :164).

### BL-PICKER-CLAIMED-ROW-NEXT-DROP — claimed-row recovery GET form discards the `next` query param

**Resolved on branch `fix/picker-flow-app-bugs` (2026-07-25).** See the section header above for what shipped differently from what this entry proposed.

**Status:** OPEN (e2e stub skipped) · **Severity:** low–medium (post-sign-in return target is lost on the claimed-row recovery path) · **Class:** APP-BEHAVIOR BLOCKER

The claimed-row recovery control is `<form action={signInRecoveryUrl} method="GET">` with NO hidden inputs (`app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:154`; `signInRecoveryUrl = /auth/sign-in?next=<encoded>` built at :86). On a GET submit the browser DISCARDS the action URL's query string and rebuilds it from the (empty) form fields, so the navigation lands on bare `/auth/sign-in` with no `?next=`. `waitForURL(/auth/sign-in\?next=/)` therefore never matches (final page is `/auth/sign-in` with no `next`). **Fix:** carry `next` as a hidden `<input>` rather than in the action query (app fix in `_PickerInterstitial.tsx`). **Test:** un-skip `tests/e2e/picker-flow.spec.ts:234` ("Deactivated row: tapping a claimed crew member redirects through /auth/sign-in"; SKIP note at :226).

---

## BL-ALERT-GITHUB-BOT-LOGIN-AUTORESOLVE — auto-resolve GITHUB_BOT_LOGIN_MISSING on successful bot auth

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3, DEFER row) · **Class:** DEFERRAL · **Effort:** S

The `GITHUB_BOT_LOGIN_MISSING` alert tracks that the bot login env is unset. Config state observable inside the M8 report pipeline, but the review discipline for report features requires live GitHub integration probes, so auto-resolution was deferred pending M8 shipping and validation-environment gates.

**Status:** ✅ RESOLVED — already shipped before this entry was revisited. `docs/superpowers/specs/alerts/2026-07-04-alert-resolve-truthing.md` §6 superseded the DEFER row. The stated blocker did not apply: resolution is gated on an explicit env-presence read (`botLoginConfigured`, `lib/reports/botLoginAlert.ts:15`), not on "a submit succeeded", so no live-GitHub probe is needed. Two raw resolvers (the code is a NON_UPSERT producer deliberately excluded from the `AdminAlertCode` union, so the typed helper is unusable): `resolveBotLoginAlertRow` (`lib/reports/botLoginAlert.ts:45`, invoked by maintenance at `lib/notify/runNotify.ts:237-248`) and `resolveBotLoginAlertFailOpen` (`lib/reports/submit.ts`). Registry row is `class: "auto"` with both sites pinned (`tests/messages/_metaAdminAlertCatalog.test.ts:493-499`); behavioral coverage in `tests/reports/submit.botLoginResolve.test.ts` and `tests/notify/runMaintenance.botLogin.test.ts`. Confirmed live during `2026-07-24-alert-autoresolve-tile-and-report-family` §2.1, including independently by the cross-model reviewer.

---

## BL-ALERT-BRANCH-PROTECTION-AUTORESOLVE — auto-resolve branch-protection alerts on policy sync

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3, DEFER rows) · **Class:** DEFERRAL · **Effort:** S

`BRANCH_PROTECTION_DRIFT` and `BRANCH_PROTECTION_MONITOR_AUTH_FAILED` track state of the GitHub branch-protection CI monitor. Both are raised outside app runtime (CI-side ops script), making auto-resolution look like a separate ops-pipeline concern.

**Status:** ✅ RESOLVED — already shipped by `docs/superpowers/specs/alerts/2026-07-05-bell-notification-center-design.md` D6 / §10. The bell spec ratified the conversion AHEAD of the workflow re-enable trigger deliberately: the bell surface makes premature manual resolution of these codes an attractive nuisance, so the manual button had to go even while the detector stays disabled. Resolver `defaultResolveAlerts` (`scripts/verify-branch-protection.ts:253`) with healthy-path call sites wired (`:361-379`); both codes `class: "auto"` with resolve sites pinned (`tests/messages/_metaAdminAlertCatalog.test.ts:502-513`); auto-clear copy at `lib/adminAlerts/audience.ts:118-122`.

**Residual (tracked, not blocking):** the resolver is dormant in CI. Its only producer runs in the `verify-branch-protection` and `verify-branch-protection-status` jobs, both `if: false` under the X6-D-1 solo-dev variant (`.github/workflows/x-audits.yml:443`, `:474`). Re-enabling those jobs is the one remaining step, recorded at `DEFERRED-archive.md:861`; it needs no further alert-side work. Full provenance: `DEFERRED-archive.md:853-862`.

---

## BL-ALERT-REPORT-FAMILY-AUTORESOLVE — evaluate manual-by-design posture for report-family incidents

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3, EVENT rows) · **Class:** DEFERRAL (evaluation) · **Effort:** S

The six report-family codes are incident notices and observational audit records, event-shaped by design. Revisit post-M8 if new incident classes emerge that blur the event/state boundary.

**Status:** ✅ RESOLVED as EVALUATED — **no change**. Full evaluation in `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` §5. The entry asked for an evaluation; the answer is that the existing `event-manual` classification is correct for all six. Now guarded against silent drift by a named per-code test in `tests/messages/_metaAdminAlertCatalog.test.ts`.

Two auto-resolution designs were drafted and **rejected on evidence**, recorded so a future session does not re-derive them:

1. **Local anti-join (rejected, adversarial round 1).** Three of the six raise through a state-gated insert whose `SELECT` gate is a live predicate over `reports`, which makes them LOOK state-shaped. But they are raised only when a GitHub lookup has ALREADY returned `LookupInconclusive` (`lib/reports/submit.ts:771-819`), so the raise condition is a conjunction and the anti-join negates only the local half. `REPORT_DUPLICATE_LIVE_MATCHES` means multiple live GitHub issues share a marker; `REPORT_OPEN_ORPHAN_LABEL` means an open issue carries the orphan-cleanup label. Reaping the local report closes neither. Worse, flipping `resolution` to `"auto"` also suppresses the manual button, so the operator would lose both the signal and the control while the fix is still outstanding.
2. **Resolve on a fresh successful lookup (rejected, adversarial round 3).** `findIssueByMarker` IS a complete fresh check for one `idempotency_key`, and the alert context carries that key, so this satisfies same-instance and whole-condition. It fails **repeatability**: once `writeRecoveredIssueUrl` persists a URL, every later submit short-circuits as a duplicate before reaching the lookup (`lib/reports/submit.ts:1073-1075`). If GitHub's state changes right after the check, the alert is already cleared and nothing will ever look again — a permanent wrong answer with no re-raise path and no independent durable record.

**Durable rule extracted** (spec §3): a recovery observation may clear a row only if it identifies the same instance, re-evaluates EVERY conjunct of the raise condition, and is repeatable. A state-shaped LOCAL gate is not evidence that a code is state-shaped overall.

---

## BL-ALERT-TILE-RENDER-PER-TILE-KEYING — per-tile keyed auto-resolution for TILE_SERVER_RENDER_FAILED

**Filed:** 2026-07-03 (admin-alert-auto-resolution spec §3) · **Class:** DEFERRAL · **Effort:** M

`TILE_SERVER_RENDER_FAILED` is state-shaped but has no aggregation point: the alert row is deduped per (show, code) with `context.tileId` replaced on re-raise, so tile A's success cannot prove tile B is healthy. A per-tile-keyed redesign closes this structurally but was believed to require a schema change.

**Status:** ✅ RESOLVED — shipped by `docs/superpowers/specs/alerts/2026-07-24-alert-autoresolve-tile-and-report-family.md` §4. **No schema change was needed**: keying filters on the `context->>'tileId'` the row already carries, so the dedup index is untouched and no migration ships.

The entry's premise was also incomplete in a way that mattered. Keying on `tileId` alone is NOT sufficient, because permission gates live INSIDE the wrapped seam (`transportTileVisible`, `components/crew/sections/TravelSection.tsx:172-178`): different viewers execute different code for the same tileId, so a viewer who skips the failing path would clear an alert still live for the viewer who reaches it. Resolution is therefore keyed on the **(tile, observer)** pair, with `viewerKey = data.viewerId ?? "admin"`.

`WrappedSection` now records outcomes into a per-request ledger; `_CrewShell` owns that ledger and schedules one post-response sweep that raises for failed tiles and resolves clean ones for that observer only. The code is `hybrid`, not `auto` — catalog `resolution` stays `"manual"` so the button survives, because re-detection needs that specific observer to load the page again. Structural defense: `tests/crew/_metaTileProducerTopology.test.ts` bounds where sections may be constructed at all, which is what actually guarantees the ledger reaches the sweep. Row-state proof against real rows: `tests/db/tileAlertResolution.db.test.ts`.

---

## Test-safety hardening batch (3) — CLOSED on branch `test/safety-hardening-batch` (2026-07-25, PR #590)

Filed together under BACKLOG.md's §"Test-safety hardening (2026-07-05)", closed together, and graduated together on 2026-07-25. That section still holds its open remainder (`BL-SOURCE-NUL-BYTE-STEP3REVIEW`, `BL-PREPARE-INTERNAL-FAULT-KIND`, `BL-CRON-WORKBOOK-FAULT-CODE`, `BL-ROOM-DIMS-ONLY-NOVEL-HEADER`).

### BL-DBTEST-LOOPBACK-EVAL-GUARD — retrofit module-eval loopback guard onto pre-existing db tests

**Status:** CLOSED (2026-07-25, `test/safety-hardening-batch`) · **Severity:** low · **Class:** TEST SAFETY

**Shipped:** all 37 files reading `LOCAL_TEST_DATABASE_URL` now route it through `assertLocalDbUrl` (or `assertLocalDbUrlIfSet` for the one validation-capable suite, which is guarded on its LOCAL leg rather than exempted). The guard moved to the side-effect-free `tests/db/_localDbUrl.ts` and redacts DSN credentials. `tests/db/_metaLocalDbUrlGuard.test.ts` walks `tests/**` and fails any unguarded read, recognising bracket / parenthesized / `process["env"]` / aliased / destructured spellings; exempt set is empty and pinned by equality.

**Original report (historical — describes the tree BEFORE the fix above; its "Fix (when prioritized)" is superseded):** the finalize-resume-deadlock whole-diff R1 review surfaced (and fixed, for the 3 suites in that diff) a latent pattern shared by ~20 pre-existing `tests/onboarding/*.db.test.ts` files: `LOCAL_URL = process.env.LOCAL_TEST_DATABASE_URL ?? <loopback default>` is consumed by a probe `beforeAll` that opens `postgres(LOCAL_URL)` and sets `dbUp = true` BEFORE the loopback assertion (`expect(LOCAL_URL).toMatch(/127…/)`) runs in a later `beforeAll`. If `LOCAL_TEST_DATABASE_URL` is mispointed to a remote host (`TEST_DATABASE_URL` is the validation project), the probe connects remote and `dbUp` flips true; even when the later assertion throws, `afterAll`'s `if (dbUp)` teardown still issues DELETE/UPDATE against the remote. The default is loopback so this only bites on an explicit remote override, hence low severity. **Fix (when prioritized):** wrap each file's `LOCAL_URL` in `assertLocalDbUrl(...)` from `tests/db/_remediationHelpers.ts` (synchronous module-eval throw on non-loopback host, before any handle) — the proven pattern in `cleanupReapCrossSession.db.test.ts` + 7 others and now the 3 finalize-resume-deadlock suites. Consider a structural meta-test that fails any `*.db.test.ts` opening `postgres(...)` on a URL not passed through `assertLocalDbUrl`.

### BL-RESCAN-PREPARE-ERROR-GRANULARITY — distinguish parse vs Drive-fetch failure in re-scan fail-closed paths

**Status:** CLOSED (2026-07-25, `test/safety-hardening-batch`) · **Severity:** low · **Class:** TELEMETRY GRANULARITY

**Shipped:** `prepareOnboardingFiles` throws a discriminated `PrepareOnboardingFileError`, classified by error IDENTITY first — `WorkbookSynthesisError` (new, tagged at `synthesizeMarkdownFromXlsx`) is a parse fault even when raised inside the Drive export, which no call-site rule can see. Both fail-closed sites map `kind:"parse"` to the EXISTING `STAGED_PARSE_FAILED` row (no new §12.4 code), and the live first-seen retry route was swept for the same conflation. The row's copy was rewritten path-agnostically under the three-way lockstep. Deliberately NOT reclassified: post-parse internal helper faults (see `BL-PREPARE-INTERNAL-FAULT-KIND`).

**Original report (historical — describes the tree BEFORE the fix above; its "Fix (when prioritized)" is superseded, and no new §12.4 code was needed):** both re-scan fail-closed catch sites — the finalize inline auto-heal (`app/api/admin/onboarding/finalize/route.ts`, the `prepareOnboardingFiles` try/catch) and the standalone `rescanWizardSheet` (`lib/onboarding/rescanWizardSheet.ts:127`) — map ANY `prepareOnboardingFiles` throw to `DRIVE_FETCH_FAILED`. Because `prepareOnboardingFiles` does export AND parse, a parser/schema failure or malformed-workbook fault is reported to Doug as a Drive fetch failure, and telemetry loses the export-vs-parse distinction. The recovery path is identical (both demote fail-closed to the re-apply page), so this is a wrong-reason/observability issue, not a correctness bug — surfaced by whole-diff R5. **Fix (when prioritized):** have `prepareOnboardingFiles` throw a discriminated error (e.g. `{ kind: 'drive_fetch' | 'parse' }`) and map each to a distinct §12.4 code at BOTH call sites (new code needs the full 3-way lockstep + CI touchpoints). Deferred to keep the two sites consistent and avoid a new catalog code mid-feature.

### BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS — deletion-safety Link guard misses helper-built hrefs

**Status:** CLOSED (2026-07-25, `test/safety-hardening-batch`) · **Severity:** low · **Class:** TEST COVERAGE

**Shipped:** the same-line predicate is replaced by four layers over `app/` + `components/` + `lib/` + `next.config.ts` + `app/**/*.mdx` — an occurrence allow-list pinned by position KIND (so a ratified comment cannot become code at an unchanged count), AST resolution of `<Link>`/`<a>` hrefs through helpers, arrow helpers, consts, object properties, `+`, `join()` and `concat()`, an assembled-literal scan, and a raw scan for MDX. Primitives live in `tests/admin/stagedPageRefScan.ts` and are exercised against synthetic sources.

**Original report (historical — describes the tree BEFORE the fix above; its "Fix (when prioritized)" is superseded):** the Step-3 consolidation deletion-safety guard (`tests/admin/step3DeletionSafety.test.ts`, the "no in-app `<Link href>` out to the retired staged page" test) matches only a literal `/admin/onboarding/staged/` substring on the SAME source line as `href`. A helper-built href (`href={buildStagedUrl(id)}` where the path lives in a const or is assembled elsewhere) could reintroduce a link to the retired staged page without tripping the guard — surfaced by whole-diff R5 (LOW). A blanket "path appears anywhere" scan is NOT a clean fix: the path is LEGITIMATELY referenced by the finalize race-row `re_apply_url` builder and the `next.config.ts` 307 redirect source (both ratified in spec §4.6 — they now 307 to /admin), so a stricter guard false-positives on those. **Fix (when prioritized):** a JSX-aware check that resolves `<Link>`/`<a>` href expressions (including one-hop helper returns) to a URL and asserts none resolve under `/admin/onboarding/staged/`, while allow-listing the ratified non-Link string references. Low value + false-positive risk mid-feature, so deferred; the literal same-line guard plus the retired-import guard already cover the common regressions.

---

## BL-SHAREHUB-ARM-VIEWPORT-REVEAL — armed Archive confirm unreachable inside the overflow-clip modal panel

**Status:** ✅ RESOLVED — `feat/sharehub-archive-copy-reveal` (2026-07-24; spec `docs/superpowers/specs/2026-07-24-sharehub-viewport-popover-and-archive-copy.md`). · **Severity when open:** HIGH (was filed MEDIUM) · **Class:** clipped-overlay content stranding — the same class as `BL-HOVERHELP-PORTAL`, which the share hub was never migrated for.

**The original entry was wrong in two ways, both corrected here by measurement.**

It said the operator "CAN reach them by scrolling the modal panel manually (band and popover move up with it)". They cannot: `[data-review-modal-panel]` is `overflow: clip` (`components/admin/review/ReviewModalShell.tsx:623`), which is NOT a scroll container. It reports a `scrollHeight` (1854) larger than its `clientHeight` (476) — which is why it read as scrollable — but assigning `scrollTop` is a no-op, asserted directly by the probe (`panelIsScrollContainer: false`; a manual `scrollTop += overshoot` left it at 0). No ancestor between the popover and the viewport scrolls either: `body` is `overflow: hidden` under the modal scroll-lock and the wrapper is `fixed inset-0`. The popover's own scroller is the only one that exists, and its scrollport bottom is itself off-screen, so its last 108-261px of content is unreachable at ANY scroll position.

It also said "short phones". Measured unreachable at 390x844, 740, 667, 620 and 560 — every height swept, including the project's default mobile viewport. The geometry is structural, not viewport-specific bad luck: the hub anchor sits a constant 347px below the panel top, so fitting requires `347 + popoverHeight <= 0.85 * vh`, i.e. `vh >= 973px` while the 30rem cap binds, and never at all below 686px where the cap is 70vh.

So a destructive control could be ARMED and then neither confirmed nor cancelled (Cancel sits in the same off-screen band; Escape still dismissed).

**Fixed by** migrating the hub popover to the portal + `lib/popover/position.ts` placement stack already shipped for `HoverHelp`, rather than writing new placement math. Reachability at all five heights, plus containment, side selection, caret, focus and the armed-resize case, are pinned in `tests/e2e/admin-lifecycle-layout.spec.ts`.

---

## BL-TEST-PG-CLIENT-TEARDOWN — leak-proof postgres.js clients in DB tests (WITHDRAWN 2026-07-24, measured)

**Graduated:** 2026-07-25. Withdrawn on `fix/test-pg-client-teardown-stale` (PR #589), which is where the measurement below was taken and where the replacement guard `tests/cross-cutting/db-test-connection-hygiene.test.ts` landed. A withdrawal is a graduation: the entry left the open queue.

**Status:** WITHDRAWN — the premise did not survive measurement. Superseded by the structural guard at `tests/cross-cutting/db-test-connection-hygiene.test.ts`. Do not implement the `makeTestSql` migration described below; it is recorded only so a future reader does not re-derive it.

**What the entry claimed.** ~55 test files create module-level `postgres(DB_URL, { max, prepare: false })` clients with no `idle_timeout` and no `.end()`; since postgres.js leaves `idle_timeout` `null` (never auto-close), those pools hold their connections for the whole serial DB run and can exhaust local Postgres `max_connections` (~100) after a long session, surfacing as spurious "too many clients" failures on untouched code. The proposed fix was a shared `tests/db/testSql.ts` → `makeTestSql()` factory with `idle_timeout` plus an `endAllTestSql()` teardown, migrating ~55 files, hand-auditing the advisory-lock/concurrency tests that deliberately hold a connection, and a meta-test banning direct `postgres(` calls.

**What is actually true.** The counts were an artifact of `grep postgres(`, which matches both the loopback-guard regex literals several helpers declare (`/^postgres(?:ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1|\[::1\])/`) and mentions in comments. An AST walk gives the real figures: **155 constructions across 121 files**, 86 of them (64 files) with no `idle_timeout`, and **106 module-scope constructions across 101 files**. All 106 are bound to a name (102 declared and initialized in one statement, 4 assigned to a binding declared earlier), and **60 of them — across 59 files — are never `.end()`ed on that binding** — overwhelmingly the `probe` client DB tests open to read state back. So the entry was right that many clients are never explicitly closed. It was wrong about what happens next.

**The stated mechanism cannot fire.** Vitest runs each test file in its own worker and terminates that worker when the file finishes, closing its sockets — this is what `isolate: true` (the default) means, and it holds for the threads pool as much as for forks. Verified with a 3-file probe recording `process.pid`: 3 distinct pids. Note this is not a strict hand-off — vitest begins a worker's termination without awaiting it before scheduling the next file, so a slow-exiting worker can briefly overlap its successor. What it rules out is connections persisting across the run, not every instant of overlap.

A second reason the fear was misplaced: **postgres.js opens connections lazily.** `max: 6` is a ceiling, not a preallocation — a client running one query at a time holds one connection. So even the pools that exist are far smaller in practice than their configured maximum.

**Measurement (2026-07-24).** Full `pnpm test` — 1603 files, 17198 tests, 692s — sampling `pg_stat_activity` every 0.25s (2256 samples), filtering on `application_name = 'postgres.js'` (postgres.js 3.4.9 sets that by default at `node_modules/postgres/src/index.js:485`):

|                                   |             |
| --------------------------------- | ----------- |
| `max_connections` (local)         | 100         |
| Baseline backends / of them pg.js | 28 / 0      |
| Peak total backends               | 30          |
| **Peak held by postgres.js**      | **5**       |
| Mean pg.js while any were open    | 1.7         |
| Trend, first vs last third of run | 0.02 → 0.12 |

The trend matters more than the peak here: accumulation is a claim about growth over time, and a peak is a single sampled instant. Both thirds sit near zero and the difference between them (0.10 backends) is far below the ~5 a single file reaches, so the series carries no signal of accumulation — with means this close to zero, that is the whole of what it supports, not a growth rate and not literally "no growth". postgres.js backends were open in only 175 of 2256 samples, and no sample exceeded 5.

**Scope of what this establishes.** One execution, under the current config, on one machine. It rules out persistent cross-file accumulation — the mechanism the entry named. It does not measure the suite under `--fileParallelism`, under a future `isolate: false`, or running concurrently with other worktrees against the same Postgres, all of which are outside the withdrawn entry's claim but inside the space of things that could exhaust a pool.

An earlier pass at this measurement filtered on an EMPTY `application_name` and reported "peak 6" — those were background processes, which is why the figure sat at a constant 6 including at idle. The sampler's attribution was then validated directly: a file using the `max: 6` pool in `tests/db/_holdsHelpers.ts:47` shows up as 1-2 `postgres.js` backends, not 6, confirming both the filter and the lazy-connection behavior above.

A 64-file `idle_timeout` sweep would have bought nothing against these numbers, at the cost of churn plus real risk of dropping a held connection mid-test in the advisory-lock, deadlock, and concurrency tests — the files that deliberately hold a connection open across statements. (An earlier draft put that at "26 files" from an ad-hoc grep; the number is not reproducible from any stated classifier, so it is dropped rather than restated.)

**What replaced it.** The measurement holds only while the isolation does. `tests/cross-cutting/db-test-connection-hygiene.test.ts` reads the **resolved runtime config**, not the authored one: `isolate` directly, and file parallelism via `maxWorkers === 1` (the worker config does not carry `fileParallelism`, and a CLI `--fileParallelism` or `VITEST_MAX_WORKERS` is applied after project options — so a config-file check alone reads `false` while the run is concurrent). It also asserts the authored `serial.fileParallelism`, and scans `package.json`, workflow YAML, and every file under `scripts/` for any MENTION of the isolation knobs.

That scan deliberately does not parse values. Three rounds of matching harmful spellings precisely lost in both directions — `--isolate  false` with two spaces, `=+2`, `=0` and `=foo` (which `Number.parseInt` turns into 0/NaN and vitest resolves to default parallel workers) all evaded it, while benign `01`, `1e2`, and `--fileParallelism false` were wrongly rejected. A bare token scan cannot be beaten by a spelling, and when it fires wrongly it fires loudly. There are zero occurrences in those files today, so it costs nothing until someone reaches for a knob. Every file under `scripts/` is read regardless of extension, since an extension allowlist fails open for each launcher format it does not list.

Verified by 23 mutation injections — 22 turn the guard red, and the one that must not (a whole-line comment mentioning the flags) stays green. Each injection is checked for having actually landed before its result is read, after one silently-non-applying substitution produced a "green" indistinguishable from a guard failure.

An AST census of unclosed clients was tried and removed. It could not do its job: a wrapper teardown (`afterAll(() => closeSql(sql))`) leaves the count unchanged though the clients are genuinely closed, and moving construction behind a factory collapses it though nothing was closed — so it could neither confirm nor deny that the invariant still had subjects, while catching none of the configuration regressions the assertions do catch. The subject count above is a measured fact with a date on it, not something to re-derive on every run.

If disabling isolation ever becomes desirable, the `makeTestSql` work above becomes necessary again — that is the real trigger, not a connection count.

**`db:reset-pool` stays.** This measurement removes the DB test suite as the explanation the entry gave; it does not establish what the cause is, and it does not clear the suite under configurations it did not run. The plausible remaining source is concurrent load — one local Postgres shared across worktrees, dev servers, and `psql` sessions, on top of a baseline that is already 28 of 100 with no tests running — but that was not measured here.

---

## Nullcode batch-2 residual sweep — one item closed as obsolete

### BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y — quiet-link affordance family: no SR new-tab announcement

**Graduated:** 2026-07-25. Shipped on `fix/newtab-announcement-family` (PR #592) — 21 previously-silent external links now announce, three WCAG 2.5.3 label-in-name failures fixed, and a per-anchor AST guard keeps the family closed.

**Status:** CLOSED — shipped 2026-07-25 in PR #592 · **Severity:** low · **Class:** A11Y / RESPONSIVE

**Both halves are now done.** The tap-target half landed earlier (`min-h-tap-min`); the announcement half shipped as PR2 of the residual sweep. All 21 unannounced external anchors now announce, via a single `components/shared/NewTabHint.tsx` primitive (11 Group A sites), an extended `aria-label` (6 Group B sites), or an `action.external`-gated hint (4 Group C sites). Three WCAG 2.5.3 label-in-name failures found along the way were fixed too. A per-anchor TSX AST guard (`tests/styles/_metaNewTabAnnouncement.test.ts`, scanner in `_newTabScan.ts`) fails by default on any new external anchor — it has already caught one added by a sibling session mid-rebase. Close-out, including the impeccable dual-gate findings and dispositions, is in `docs/superpowers/handoffs/2026-07-25-newtab-announcement-handoff.md`. Two P3 residues are tracked in `DEFERRED.md` › `NEWTAB-A11Y-RESIDUE-1`.

The original analysis is kept below for provenance.

**Tap-target half is DONE.** The quiet-link affordance now carries `min-h-tap-min` (`components/admin/PerShowActionableWarnings.tsx:281`, the "Open in Sheet ↗" anchor), so the venue-floor thumb-target complaint no longer applies to it.

**New-tab-announcement half is still open, and the original path citations are stale.** `components/admin/PerShowAlertSection.tsx` no longer exists; the per-show alert action link now flows through the per-code registry `lib/adminAlerts/alertActions.ts`. Its three resolver call sites are `lib/admin/attentionItems.ts:307` (`resolveAlertAction`), `lib/admin/bellFeed.ts:133` (`resolveAlertActions`), and `components/admin/telemetry/HealthAlertsPanel.tsx:83` (`resolveAlertAction`) — but they reach **four** renderers, not three: `attentionItems.ts:307` feeds both `review/AttentionBanner.tsx:165` and `showpage/AttentionMenu.tsx` (which reads `item.alert.action` at `:183` and renders it at `:208-218`), while `bellFeed.ts` feeds `BellPanel.tsx:304` and the panel call feeds `HealthAlertsPanel.tsx:149`. The card shell itself is `components/admin/CompactAlertCard.tsx` (consumers: `NoteWarningCard.tsx:93`, `PerShowActionableWarnings.tsx:305`, `review/AttentionBanner.tsx:238`, `telemetry/HealthAlertsPanel.tsx:179`). `components/admin/showpage/StatusStrip.tsx` is NOT a consumer — it only carries the `#share-access` destination the registry links AT, and its sole textual match on `alertActions` is a comment at `:191`. So this is a wider family than the two surfaces the item named.

The defect: an external quiet link marks its `↗` `aria-hidden` (`PerShowActionableWarnings.tsx:283`) with no accessible-name suffix, so a screen reader hears "Open in Sheet" and never learns the link leaves the page. Two sites carry the established convention — an `aria-label` naming both destination and behavior (`wizard/Step3SheetCard.tsx:152`, `wizard/VenueMapTile.tsx:138`, e.g. `aria-label="Open the venue in Google Maps (opens in a new tab)"`). Note `rg "opens in a new tab" components/` returns **three** lines, not two: `Step3SheetCard.tsx:138` is a comment, not an accessible name.

**Census — count `_blank`, NOT `target="_blank"` (corrected 2026-07-25).** The literal-attribute grep finds 18 anchors across 12 files, but the real total is **22 across 16 files** (`grep -rn '_blank' components/`). The four it misses are the ones this item most cares about: the registry action renderers spread the attribute conditionally —

```
{...(action.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
```

— at `review/AttentionBanner.tsx:165`, `BellPanel.tsx:304`, `telemetry/HealthAlertsPanel.tsx:149`, and `showpage/AttentionMenu.tsx:211-213`. So **20 of 22 carry no announcement**, and a structural guard written against the literal attribute would leave the alert-action family — the exact subject of this item — unguarded. Any meta-test here MUST match the dynamic spread form too.

Whether each of the 20 is a real defect or a deliberate omission (crew-facing `SourceLink`, an already-labelled parent, the `aria-label={alt}` nameless-link guard at `step3ReviewSections.tsx:3575-3577`) is the scoping question the fix answers per site.

**Fix:** one family-wide pass applying the existing `aria-label` convention to every `target="_blank"` anchor that lacks it — not per-call-site divergence, and not a new mechanism when two surfaces already model one. Worth a structural meta-test asserting every `target="_blank"` in `components/` has either an `aria-label` containing "opens in a new tab" or an inline exemption, so the class closes instead of regressing. UI diff → invariant-8 impeccable dual-gate applies.

### BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC — WATCH_CHANNEL_ORPHANED renders a raw provider error string in the admin banner

**Graduated:** 2026-07-25. Closed as obsolete during the residual-sweep on `docs/nullcode-batch2-residual-hygiene` (PR #587) — nothing implemented it; the surface it described had already been deleted.

**Status:** CLOSED — OBSOLETE (verified 2026-07-24) · **Severity:** low · **Class:** INVARIANT-5 / UI COPY

**Closed because the rendering surface no longer exists.** The item described the `WATCH_CHANNEL_ORPHANED` expanded panel rendering `context.error_message` verbatim inside a `<code>` block in `components/admin/AlertBanner.tsx`. `AlertBanner.tsx` was deleted when the bell replaced it (`67ce6d082` — "feat(admin): mount bell in both chromes; retire AlertBanner (spec §7.1/§8)"), and the raw-string block did not survive the port: `rg error_message components/` matches nothing, so there is no user-visible render of the provider string on any surface. The invariant-5 tension the item recorded (raised as R9 F17 in the 2026-07-04 at-a-glance-identity Codex review) is therefore resolved incidentally, not by a deliberate fix.

Where the raw string still flows, and why that is in-policy: the field is `admin_alerts.context.error_message`, and its ONLY remaining consumer is `lib/drive/watchEscalation.ts:155`, which reads it into the escalation **email** body sent to configured admin recipients. Invariant 5 governs user-visible UI copy; an operator escalation email to the people who administer the Drive connection is the debug-only affordance the original item proposed keeping.

**Do not confuse this with `last_error_message`, which is a different field on a different table.** `pending_ingestions.last_error_message` carries parse/sync failure detail, written at **four** `insert into public.pending_ingestions` sites across three files: `lib/sync/applyStaged.ts:662` (wizard partition) and `:799` (live partition), `runScheduledCronSync.ts:1005`, `runOnboardingScan.ts:474`. The observe CLI reads it at `lib/observe/query/failures.ts` — the executable binding is `.from("pending_ingestions")` at `:31` and the redaction is `sanitizeIdentityString(r.last_error_message, …)` at `:61`; `:11-12` is only the projection string. The dev-tier fixture harness reads it at `app/admin/dev/actions.ts:325-327` (`.schema("dev").from("pending_ingestions")`, projection at `:329`), where the selected value is typed at `:342` but not rendered downstream. Raw display is prevented by the shape of `resolveIngestionCopy` (`lib/admin/needsAttention.ts:178-200`) plus caller discipline — not by a check, and **not** by a two-field boundary: its signature takes `code`, `driveFileName`, AND an optional `genericFallback?: string` that several branches return verbatim (`const generic = input.genericFallback ?? GENERIC_INGESTION_COPY; if (!code) return generic;`). No caller passes anything but an authored constant today, so there is no live leak, but the invariant-5 safety here rests on that caller discipline — a future caller forwarding a raw message through `genericFallback` would defeat it. `:163-168` is the JSDoc documenting the intent, not an executable guard. It has nothing to do with `WATCH_CHANNEL_ORPHANED`, and the `shows` table has no such column at all — its sync-failure column is `last_sync_error` (`supabase/migrations/20260501000000_initial_public_schema.sql:24`). `lib/adminAlerts/alertIdentityMap.ts:118` still carries a stale comment referring to "the pre-existing `error_message` `<code>` block" — harmless, but it is the one remaining reference to the retired surface.

**If the escalation-email exposure is ever re-scoped as a problem, file a new item** — this one is closed against a surface that is gone, and reopening it would re-argue a render path that no longer exists.
