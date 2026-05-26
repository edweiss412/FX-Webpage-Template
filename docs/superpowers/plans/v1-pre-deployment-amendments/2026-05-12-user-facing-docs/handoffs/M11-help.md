# Handoff — M11: User-facing docs (`/help/*`)

**Handed off:** 2026-05-23 by Eric Weiss (orchestrator: Claude Opus)
**Implementer:** split-mode across the milestone — Phases A–G + H mostly Codex with Opus carve-outs for UI work per ROUTING.md; Phase I (close-out) Opus / Claude Code
**Adversarial reviewer:** Codex CLI (cross-CLI) via `codex-companion adversarial-review`
**Plan file:** `docs/superpowers/plans/v1-pre-deployment-amendments/2026-05-12-user-facing-docs/00-overview.md` + phases A–I
**Per-phase handoffs:** `handoffs/A-foundation.md` … `handoffs/G-affordance-retrofit.md`

---

## 0. Implementer split

M11 was a 9-phase milestone (A foundation → I close-out). Phases A–G shipped per-phase handoffs and per-phase Codex adversarial review cycles; each closed independently before the next phase opened. Phase H (auth + integration tests) was a mostly-mechanical Codex run with one Opus carve-out for chrome-link tap-targets that landed in the UI hard rule (per ROUTING.md). Phase I (close-out) ran in this Claude Code session.

### Per-phase routing (already closed before I.1 opened)

- Phase A (foundation, sidebar/header/breadcrumb chrome) — Codex, R-cycle closed in per-phase handoff.
- Phase B (catalog extension, `title` + `longExplanation` + `helpHref` fields) — Codex.
- Phase C (time utility, frozen-clock gating) — Codex.
- Phase D (MDX components — `<Callout>`, `<Step>`, `<Screenshot>`, `<RefAnchor>`, `<TipFromSheets>`) — Codex with the D.5 `<RefAnchor>` catalog-vs-chapter anchor split spec-amended after R4 MEDIUM (handoff D §12).
- Phase E (13 page bodies — adoption + capability reference + tour + errors) — Codex; 10-round Codex convergence on content.
- Phase F (screenshot harness — Playwright manifest + sharp encoder + CI drift gate) — Codex with one Opus rescue at R3 for the byte-comparison CI gates discipline that became `feedback_byte_comparison_ci_gates_pin_capture_environment.md`.
- Phase G (affordance retrofit — testids + `Learn more` links into M3/M9/M10 components) — Codex with Opus carve-outs for the M3/M9/M10 source-file edits per ROUTING.md UI hard rule. Phase G handoff at `handoffs/G-affordance-retrofit.md`.
- Phase H (auth + integration tests) — Codex committed e509472 (H.5 lint sweep, 4187 tests passed). H.4 mobile-layout chrome-link tap-target work carved to Opus per ROUTING.md (Header.tsx + Breadcrumb.tsx `inline-flex min-h-tap-min items-center px-2 -mx-2` retrofit + WCAG 2.5.5 inline-prose exception ratification in PRODUCT.md:59 + corresponding test exemption in `tests/e2e/help-mobile.spec.ts`).

### Phase I (close-out, this session)

- I.1 — `/impeccable critique` + `/impeccable audit` per page (Opus, this session).
- I.2 — Cross-model adversarial review with Codex, iterated until APPROVE-equivalent (Opus dispatcher, Codex reviewer; this session, R1–R18 plus a narrowed R20).
- I.3 — This handoff doc (Opus, this session).

---

## 1. Spec sections in scope

The full spec is `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md` (canonical) with companion HTML. M11 implements every §-section in scope; the close-out review verified §§1–14.

- §1 — Goal + reader model (Doug Larson)
- §2 — IA + page inventory (13 pages: 4 adoption-track + 7 capability-reference + tour + errors)
- §3 — Routing + auth gate
- §4 — Visual language (chrome, callouts, screenshots)
- §5 — Components (Sidebar / Header / Breadcrumb / Callout / Step / Screenshot / RefAnchor / TipFromSheets) + §5.6 affordance matrix
- §6 — MDX pipeline + `<picture>` contract + RefAnchor catalog-vs-chapter split (D.5 amendment)
- §7 — 17 unit/integration tests + the CI drift gate
- §8 — Catalog extensions (`title` + `longExplanation` + `helpHref`)
- §9 — §9.0.1 deep-link affordance contract (testids + Learn-more)
- §10 — Server time / frozen clock harness gating
- §11 — `/help/errors` rendering rules + admin-log-only filter
- §12 — `/help/tour` orientation rules
- §13 — Acceptance criteria (AC-11.1 through AC-11.39 + ratified amendments)
- §14 — Out-of-scope items routed to BACKLOG.md / DEFERRED.md

## 2. Acceptance criteria

All AC-11.1 through AC-11.39 satisfied. The ones surfaced in adversarial review and explicitly verified during close-out:

- AC-11.5 — catalog meta-test (§12.4 parity)
- AC-11.6 — `/help/errors` filters info-severity
- AC-11.11 — `/help/errors` mailto deferred to BL-HELP-NON-SHOW-REPORT-SURFACE (M11-I-D-1)
- AC-11.22 — sequencing dependency on M10 (verified at plan-time; M10 closed before M11 opened)
- AC-11.27 — setup-project pattern in screenshot harness
- AC-11.29 — frozen-clock 4-context coverage (extended from 3 in R19 spec amendment)
- AC-11.33 — per-capture sign-in for the harness
- AC-11.35 — admin-log-only code filter via `dougFacing: null`
- AC-11.36 — affordance-matrix regex contract (split into single-testid + family + crew-negative rows per spec R4 finding 4)
- AC-11.38 — page.tsx:646 retraction (R14 spec amendment per E.10)
- All 17 §7.1 tests pass green.
- The CI drift gate passes (post-F.6 Docker image pin + arm64 host-architecture pin per `feedback_byte_comparison_ci_gates_pin_capture_environment.md`).

## 3. Spec amendments in scope

M11 carries one ratified spec amendment (M11 Amendment 1) and inherits the three §13.2.3 amendments only insofar as they constrain the report-pipeline §11 references that `/help/errors` enumerates.

- [x] **M11 Amendment 1 (commit 4263c0a — parse-warning testid family collapse).** The §5.6 affordance matrix's parse-warning row was collapsed from a per-code testid set to a single `help-affordance--parse-warning--*` family with the row's regex constrained accordingly. Ratified during Phase E adversarial review.
- [ ] §13.2.3 Amendment 1 — N/A (report-pipeline; only `/help/errors` enumerates the catalog).
- [ ] §13.2.3 Amendment 2 — N/A.
- [ ] §13.2.3 Amendment 3 — N/A.

Two additional amendments landed during Phase I close-out (this session) and are documented in §13 of the spec body:

- **R15 amendment (Amendment 9 framing relaxation).** The original Amendment 9 ratification framed the auto-publish path with a "24h unpublish-undo email" promise. Phase I R15 surfaced that no email-send infrastructure ships in v1; the framing was relaxed to drop the email-undo promise while keeping the auto-publish discipline intact. Test `tests/help/page-review-queues.test.tsx` updated to drop the positive "24-hour" assertion with inline rationale.
- **R16 amendment (honest-disclosure for the URL-distribution gap).** User-ratified 2026-05-23 via AskUserQuestion: the per-person signed-link controls (`IssueLinkButton`, `RevokeAllLinksButton`) rotate token state server-side but no shipped UI surface exposes a sendable URL (`signLinkJwt` exists in `lib/auth/jwt.ts:123` but is never called by any production action). Phase I R16 rewrote `sharing-links.mdx`, `tour.mdx`, `daily-rhythm.mdx`, `whats-different.mdx`, and the §12.4 catalog entries `ADMIN_LINK_ISSUED_OK` / `ADMIN_LINK_REVOKED_OK` / `ADMIN_LINK_NO_LIVE_LINK` / `UNPUBLISH_TOKEN_CONSUMED` / `UNPUBLISH_TOKEN_EXPIRED` / `FINALIZE_OWNED_SHOW` / `LIVE_ROW_REQUIRED` to align with the honest-disclosure framing. See §10 convergence log for the per-round trail.

## 4. Pre-handoff state

- [x] Previous milestone(s) committed: M0–M10, M9.5, X.1–X.6, X-closeout.
- [x] Tests passing: `pnpm test` returns 4200 passed / 6 skipped at HEAD `65c9087` (post-R18 repair).
- [x] Specific files present: `PRODUCT.md`, `DESIGN.md`, all M3 / M9 / M9.5 / M10 components referenced by §5.6 affordance matrix.
- [x] Specific env vars set in `.env.local`: `ENABLE_TEST_AUTH` gating documented; `X-Screenshot-Frozen-Now` request-scoped header.
- [x] Database migrations applied: all migrations through M10.

## 5. Plan-wide invariants that apply (from AGENTS.md §1)

- [x] **TDD per task** — applied throughout. Every Phase E content commit + every Phase F harness commit landed with its corresponding test.
- [ ] **Per-show advisory lock** — N/A; M11 is read-only docs.
- [x] **Email canonicalization at boundary** — N/A on M11's own surface (no external email reads), BUT the close-out scrubbed every help reference to "confirmation email" / "in your email" via the R15 + R18 forbidden-prose registry entries — those references promised an email-send infrastructure that doesn't ship in v1. Test: `tests/help/forbidden-prose-registry.test.ts`.
- [x] **No global cursor** — N/A on M11's own surface.
- [x] **No raw error codes in UI** — `/help/errors` renders catalog entries via `messageFor()`; M11 docs and components route every Doug-facing string through `lib/messages/lookup.ts` per §11. Test: `tests/cross-cutting/no-raw-codes.test.ts` + `tests/e2e/no-raw-codes.spec.ts`.
- [x] **Commit per task** — applied throughout. Phase G commits + Phase H commits + Phase I commits all conventional.
- [x] **UI quality gate (impeccable v3)** — see §12.
- [x] **Supabase call-boundary discipline** — N/A on M11's own surface (no Supabase mutation paths).

## 6. Watchpoints from prior adversarial review

These surfaces broke or were close to breaking during M11's per-phase review cycles, and pre-emptively flagged before any future re-work touches them:

- **Spec citation drift (file:line + bare-path)** — Phase E R10 introduced the structural meta-test `tests/help/spec-citation-integrity.test.ts` (137 lines) parsing every project-prefixed file:line + bare-path citation in the spec; `HISTORICAL_MARKERS` exemption list documented inline. Phase G's affordance retrofit added 7 new entries to that exemption list. Any future spec edit naming code paths gets caught at CI time.
- **Tailwind v4 + `align-items: stretch`** — Phase D D.5 RefAnchor positioning hit this: Tailwind v4 does not default `.flex` to `align-items: stretch`, which broke the touch-hover-button alignment in the catalog-vs-chapter split. Mitigation: every help component's flex/grid relationship explicitly states `items-stretch` or equivalent. See `memory/feedback_tailwind_v4_flex_items_stretch.md`.
- **Byte-comparison CI gates** — Phase F R3 (image-bytes drift) + R5 (x64/arm64 host-architecture drift on the same pinned Docker image) caught this class. Mitigation: pin `mcr.microsoft.com/playwright:vN.M.K-jammy` AND regenerate baselines via `--platform linux/amd64` from arm64 dev hosts. See `memory/feedback_byte_comparison_ci_gates_pin_capture_environment.md`.
- **Phantom-affordance prose drift** — Phase I R10–R18 surfaced 5 sub-classes (file:line drift, bare-path drift, semantic-content drift, conceptual prose phantoms, Doug-facing MDX content drift). Mitigation: two structural defense tests in `tests/help/`: `backlog-label-annotation.test.ts` (R13, label-level catch) and `forbidden-prose-registry.test.ts` (R14+R17+R18, phrase-level catch extended to catalog fields). Class-sweep discipline AGENTS.md §1 invariant.
- **Doug-facing copy ↔ shipped UI** — the recurring R10–R18 class that ultimately drove the R16 user-ratified discipline shift to honest-disclosure (describe only what's shipped). Any future doc work that ratifies copy ahead of UI MUST file a fresh DEFERRED entry + add the exemption via the structural meta-test path (which currently has zero entries — discipline by exception, not by default).
- **Live-code citation discipline** — R10–R14 spent multiple rounds on file:line claims that were wrong against shipped code (`signLinkJwt` not called by any action; `Actions` column phantom on dashboard; `Action required` card title phantom on per-show panel). Mitigation: every new file:line claim verified via grep before drafting. See `memory/feedback_live_code_citation_before_drafting.md`.

## 7. Test commands

- Unit / integration: `pnpm test < /dev/null` — expect 4200 passed / 6 skipped at HEAD.
- TypeScript: `pnpm typecheck < /dev/null` — clean.
- Lint: `NODE_OPTIONS=--max-old-space-size=8192 pnpm lint < /dev/null` — 7-warning baseline (pre-existing carry-forward; M11 introduced zero new warnings).
- Playwright (help-docs): `pnpm exec playwright test --config=playwright.screenshots.config.ts --project=help-docs < /dev/null` — 27 passed.
- After screenshot Playwright runs, restore baselines: `git restore public/help/screenshots/` (host-architecture bytes leak otherwise per `memory/feedback_byte_comparison_ci_gates_pin_capture_environment.md`).

## 8. Exit criteria

- [x] All tasks in plan files A–I checked off (per-phase handoffs confirm A–G; this handoff confirms H + I).
- [x] All AC-11.x IDs from §2 have at least one test asserting them.
- [x] Adversarial review ran to convergence — see §10 (R20 returned NEEDS-ATTENTION but with all findings out of M11 scope; effectively converged).
- [x] All commits follow conventional `<area>(<scope>): <summary>` format.
- [x] `pnpm lint && pnpm typecheck && pnpm test` clean at HEAD `65c9087`.
- [x] Playwright help-docs suite 27/27 green.
- [x] No new `// TODO` or `// FIXME` lines beyond what existed pre-M11.
- [x] §12 impeccable dual-gate APPROVED (19/20 critique findings, 0 P0/P1 audit findings).

## 9. Sandbox / git protocol

- [x] **Claude Code (orchestrator + Phase I):** commits run in-session, no sandbox issue.
- [x] **Codex CLI (Phases A–H implementer):** ran with relaxed sandbox per the standing M11 routing brief. Verified per-phase via Phase handoffs.

## 10. Adversarial review handoff — convergence log

The M11 close-out adversarial review (Task I.2) ran 20 rounds via `codex-companion adversarial-review --background --base 1812f9a --scope branch` against the M11 base SHA `1812f9a` and HEAD `65c9087` (684–690 commits spanned). Each round used a fresh Codex thread with explicit "EXPLICITLY DO NOT RELITIGATE" focus text per `memory/feedback_disagreement_loop_preempts_work.md`.

### Per-round trail (Phase I only — per-phase R-cycles in their own handoff files)

| Round | Verdict | Severity | Finding(s) | Fix commit |
|---|---|---|---|---|
| R1 | NEEDS-ATTENTION | 1 HIGH + 2 MED | e2e WebP drift; aria-label entry mismatch; /help/errors mailto | `4187…` etc. (see commit log) |
| R2–R8 | NEEDS-ATTENTION | spec-citation precision rounds | catalog.ts line drift, signed-link controls page.tsx line drift, AlertBanner line drift, etc. | spec amendments r12–r18 in spec.md §13 |
| R9 | NEEDS-ATTENTION | 1 MED | spec/master-spec count mismatches (5 show-wide states → 6; 9 aliases per R-combo → 11; "all four smokes" → 5) — closed via single-source-of-truth pattern | spec amendment r19 |
| R10 | NEEDS-ATTENTION | 2 MED | per-show-panel.mdx + UI label exception notes — first Doug-facing MDX content drift round | repair commit + DECLARED_UI_LABELS note refresh |
| R11 | NEEDS-ATTENTION | 1 MED + 1 LOW | per-show-panel incompleteness (preview-as section vs crew section) + DECLARED_UI_LABELS still claimed M9-deferred for M9.5-shipped labels | `e93fe55` |
| R12 | NEEDS-ATTENTION | 3 findings | onboarding-wizard Step 2 Verify-and-scan button flow + Step 3 8-status inventory + tour Preview-as-crew framing | `b703d10` |
| R13 | NEEDS-ATTENTION | 2 MED + USER-DIRECTION | docs scrubbed of internal milestone IDs; described shipped behaviour only; UI_LABEL_EXCEPTIONS emptied; new structural meta-test `tests/help/backlog-label-annotation.test.ts` shipped per AGENTS.md "Structural-defense calibration" | `15c39b5` |
| R14 | NEEDS-ATTENTION | 2 MED | tour Sharing-crew-links copy-each-persons-link phantom + per-show-panel dashboard-row-action phantom — new `tests/help/forbidden-prose-registry.test.ts` shipped per Codex R14 recommendation | `e679e6a` |
| R15 | NEEDS-ATTENTION | 1 HIGH + 1 MED | SHOW_FIRST_PUBLISHED unrendered (no email-send infra in v1) + preview-links-list phantom in 2 pages — Amendment 9 framing relaxed; test fixture amended; forbidden-prose registry extended | `cb79699` |
| R16 | NEEDS-ATTENTION | 1 HIGH | M9.5 signed-link controls have no shipped URL surface — `signLinkJwt` exists but never called by any production action — USER-RATIFIED honest-disclosure framing via AskUserQuestion | `d30aa1d` |
| R17 | NEEDS-ATTENTION | 1 HIGH | catalog ADMIN_LINK_* entries still claimed phantom URL/share flow — class-sweep extended to MESSAGE_CATALOG fields; surfaced 3 additional drift sites (UNPUBLISH_TOKEN_EXPIRED, FINALIZE_OWNED_SHOW, LIVE_ROW_REQUIRED) all fixed in same commit | `6a14427` |
| R18 | NEEDS-ATTENTION | 1 MED | UNPUBLISH_TOKEN_CONSUMED "in your email" — broader email-delivery-of-action-link pattern added; class-sweep returns zero further hits | `65c9087` |
| R19 | NEEDS-ATTENTION (out-of-scope) | 2 findings entirely in `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md` | Routed to picker-pivot workstream; not M11 scope. | — |
| R20 | NEEDS-ATTENTION (out-of-scope) | 1 HIGH in M10 wizard route (`app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts`) from May 17 M10 R-cycle | Routed to user for M10 triage; not M11 scope. | — |
| — | **M11 converged at R18** | M11 surface returns zero adversarial-review findings on R19 + R20 (both rounds break scope to other workstreams). | — | — |

### Convergence interpretation

Conservative reading: the loop did not return a literal "APPROVE" on the M11 surface. Practical reading: after R18, the last two adversarial-review cycles — R19 (broad scope) and R20 (narrowed M11-only scope) — could not find any finding inside M11's actual surface (help MDX, catalog, M11 tests, M11 docs). R19's two findings landed entirely on the parallel post-M11 picker-pivot spec; R20's one HIGH landed on an M10 wizard infrastructure file untouched by M11. The structural defenses (label-annotation + forbidden-prose registry + MESSAGE_CATALOG scan) catch the recurrent Doug-facing-content-drift class at CI time without further adversarial rounds. Per AGENTS.md "Structural-defense calibration (M12 plan R5 amendment)," the structural close is the convergence path once same-vector recurrence is structurally pinned.

User decision 2026-05-23 (AskUserQuestion): declare M11 converged; surface out-of-scope findings to workstream owners; author this handoff.

### Out-of-scope findings surfaced for routing

1. **R19 F1 (HIGH) — pivot spec PostgREST DML lockdown for `shows.picker_epoch*`** at `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md:374-376`. Routed to picker-pivot workstream R5 cycle.
2. **R19 F2 (MEDIUM) — pivot spec viewer kind `crew_link`** at `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md:131-137`; should be `crew` per live `lib/data/getShowForViewer.ts`. Routed to picker-pivot workstream R5 cycle.
3. **R20 F1 (HIGH) — M10 wizard defer/ignore does not update `onboarding_scan_manifest.status`** at `app/api/admin/onboarding/pending_ingestions/[id]/retry/route.ts:257-260` (companion routes likely affected). Finalize gate would be permanently blocked by a defer/ignore that the user thought succeeded. Routed to user for M10 triage.

## 11. Cross-milestone dependencies

- **M10 dependency:** AC-11.22 sequencing constraint — M11 plan execution started after M10 close-out. Verified pre-handoff. No M10 surfaces were modified by M11 (the §5.6 affordance retrofit added `data-testid` attributes to M3/M9/M10 components per ROUTING.md UI hard rule, but these were additive and reviewed in Phase G's own handoff).
- **M9.5 dependency:** Three of the four §5.6 affordance-matrix rows for signed-link controls were ratified post-M9.5 — labels (`Issue first link`, `Issue new link`, `Revoke all links`) shipped via M9.5 tagged `m9.5-completed` (SHA `ad4826e`). M11 Phase E R10 reflected this in the DECLARED_UI_LABELS registry.
- **PRODUCT.md owner determination (2026-05-23):** the per-person signed-link model is being replaced post-M11 by a one-link-per-show + crew-picker model. M11 docs describe the current shipped model in flight per the owner determination; the picker pivot is a separate post-M11 milestone with its own spec (`docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-23-crew-auth-pivot-show-link-picker.md`) and adversarial-review cycle (currently at R4 repair). The M9.5 code is NOT to be deleted in M11 close-out.

## 12. Impeccable evaluation (UI quality gate — AGENTS.md §1 invariant 8)

Per AGENTS.md invariant 8 + `memory/feedback_impeccable_external_attestation_required.md`, both gates were dispatched as fresh subagents (the implementing Opus session does NOT self-attest). Round 1 returned APPROVE-WITH-FIXES; the fix dispositions resolved every HIGH + actionable MEDIUM, and Round 2 (re-verification) returned APPROVE clean.

### Round 1 — initial gate

| Gate | Subagent (fresh) | Verdict | Findings |
|---|---|---|---|
| `/impeccable critique` | external | APPROVE-WITH-FIXES | 1 P0 anchor-heading consistency + 3 MED + 5 LOW + 1 explicit cut-now (tour redesign) |
| `/impeccable audit` | external | APPROVE-WITH-FIXES | 0 CRITICAL, 2 P1, 1 MEDIUM, 1 LOW |

### Dispositions

| Finding | Gate | Sev | Disposition |
|---|---|---|---|
| Anchor-heading consistency (D.5 catalog-vs-chapter split) | critique | P0 | FIXED — `RefAnchor` restricted to SCREAMING_SNAKE / MI-prefixed; chapter pages use raw h2 kebab-case. Spec §6.3 r15 amendment closed |
| RefAnchor touch-hover button alignment | critique | P3 | FIXED — `md:opacity-0 md:group-hover:opacity-100` + `items-stretch` per Tailwind v4 trap |
| `text-text-subtle` minor token cleanup | critique | LOW | FIXED — single token swap |
| Tour redesigned now (cut from current scope decision) | critique | DEC | FIXED — tour redesigned in-session as 3-group card grid (Daily / When show is live / Once per environment) |
| Callout warning role `alert → note` | audit | P1-A | FIXED — `Callout.tsx` role swap |
| Tip callout `bg-stale-tint → bg-info-bg` | audit | P1-B | FIXED — token swap |
| Sidebar mobile-tap-target floor verification | audit | P2-A | FIXED — verified `--spacing-tap-min: 44px` in `app/globals.css` covers all sidebar links |

### Round 2 — re-verification

| Gate | Subagent (fresh) | Verdict |
|---|---|---|
| `/impeccable critique` | external | **APPROVE** — no new findings; all dispositions land cleanly |
| `/impeccable audit` | external | **APPROVE** — all prior dispositions verified clean; no new CRITICAL/P0/P1 findings |

Invariant 8 satisfied for the M11 UI surfaces (every `/help/*` page + Sidebar / Header / Breadcrumb / Callout / Step / Screenshot / RefAnchor / TipFromSheets).

## 13. Meta-test inventory (AGENTS.md writing-plans rule)

M11 created or extended the following structural meta-tests:

- **CREATE** `tests/help/_metaUiLabelCrosswalk.test.ts` — Phase E meta-test. Walks every `.mdx` under `app/help/**` (plus `app/help/errors/page.tsx`), extracts candidate UI labels from bolded strings and backticked spans, asserts each label is in production source OR in `UI_LABEL_EXCEPTIONS` with a `deferredId` + rationale. With UI_LABEL_EXCEPTIONS now empty (R13 user-direction), this is in strict mode — every documented label must exist in shipped code.
- **CREATE** `tests/help/_uiLabelExceptions.ts` — Registry for the crosswalk test. Holds `DECLARED_UI_LABELS` (the per-page label declarations) + `UI_LABEL_EXCEPTIONS` (now empty per the R13 discipline).
- **CREATE** `tests/help/spec-citation-integrity.test.ts` — Phase E R10 structural meta-test. Parses every project-prefixed file:line + bare-path citation in the spec body; asserts each cited file exists. HISTORICAL_MARKERS exemption list inline.
- **CREATE** `tests/help/backlog-label-annotation.test.ts` — Phase I R13 structural defense. Asserts any future `UI_LABEL_EXCEPTIONS` entry whose label appears in MDX must be within a backlog-marker annotation (Callout / "backlog" / "not yet shipped" / "not yet built" / "M11-E-D*" / "BL-*").
- **CREATE** `tests/help/forbidden-prose-registry.test.ts` — Phase I R14 structural defense + R17 catalog extension + R18 email-delivery extension. Phrase-level regression registry for Doug-facing prose claims. Scans both help MDX AND MESSAGE_CATALOG fields (`dougFacing`, `followUp`, `helpfulContext`, `longExplanation`). Current registry: 8 patterns (copy-each-persons-link, copy-each-crew-members-link, dashboard-row-action, active-shows-row-actions-column, yellow-warnings-badge, preview-links-list, 24-hour-undo-email, confirmation-email, email-delivery-of-action-link, share-the-url-channel, send-each-their-link).
- **EXTEND** `tests/messages/_metaCatalogCompleteness.test.ts` — Phase B added the `title` + `longExplanation` + `helpHref` fields and extended the meta-test to enforce shape parity with master-spec.
- **EXTEND** `tests/cross-cutting/no-raw-codes.test.ts` — Phase E (no new entries needed for /help routes specifically; they go through `messageFor()`).

The forbidden-prose registry is the primary structural defense added in Phase I — without it, the 5-round same-vector Doug-facing-content-drift class would have driven adversarial rounds indefinitely. Per AGENTS.md "Structural-defense calibration (M12 plan R5 amendment)," the structural close in Phase I is the convergence path.

---

## Field discipline notes

- M11 is a docs milestone with a small surface (no DB writes, no auth boundaries, no advisory locks) but the convergence was dominated by content-vs-shipped drift findings (R10–R18 surfaced 9 findings in this class across 4 sub-vectors). The phantom-affordance class is now structurally pinned; future docs work that introduces any unshipped-claim phrasing fails at CI time.
- The PRODUCT.md owner determination 2026-05-23 effectively reshapes how `/help/admin/sharing-links` will eventually be re-authored once the picker model ships. Until then, the honest-disclosure framing keeps the docs aligned with the current shipped state.

---

## Convergence log (final)

- **2026-05-23 — Phase I R1–R18 (Codex):** see §10 table. 18 rounds of fix-then-reverify; converged via structural defense in R13 + R14 + R17 + R18 (label-annotation registry, forbidden-prose registry, MESSAGE_CATALOG scan extension, email-delivery pattern extension).
- **2026-05-23 — Phase I R19 (Codex, broad scope):** 2 findings entirely in parallel picker-pivot spec; routed.
- **2026-05-23 — Phase I R20 (Codex, narrowed M11-only scope):** 1 HIGH in M10 wizard infrastructure (out of scope); routed.
- **Converged 2026-05-23.** M11 surface returns zero adversarial-review findings on the last two rounds (one broad, one narrowed). Structural defenses pin the recurrent drift class at CI time. User declared M11 converged via AskUserQuestion. Ready for I.3 handoff close (this doc).
