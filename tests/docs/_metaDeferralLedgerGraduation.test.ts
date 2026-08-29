// Structural guard over the deferral ledgers.
//
// Shipped as the class defense for a vector that recurred across two adversarial
// rounds of the 2026-07-24 dev-row copy close-out: a ledger/docs task with no
// genuine red state, only post-hoc checks that were already green. Rather than
// patch the prose a third time, the graduation itself became a test.
//
// 2026-08-01 (BL-LEDGER-GUARD-MDAST-REWRITE): the line-anchored regex lanes are
// gone — nine adversarial rounds (r22-r30) showed the CommonMark spelling
// stream they chased is open-ended, and the r30 ratification placed the whole
// grammar class with a remark/mdast port. tests/docs/_ledgerMdast.ts is that
// port: parsing, flattening, id extraction, and every terminal-claim lane live
// there behind one entry evaluator, so code blocks, HTML comments, links,
// and tables fall out of the tree instead of being chased per-spelling
// (inline-code TEXT is retained — the r15 backticked-value catch — with
// label recognition provenance-gated instead). The walker file's header carries the ratified-scope text
// (render-equivalent OBFUSCATION is review's failure class, not this
// tripwire's); the spec at
// docs/superpowers/specs/2026-08-01-ledger-guard-mdast-rewrite-design.md is
// canonical for the lane semantics (eleven review rounds, r11 APPROVE).
//
// SCOPE, and why it stops here. An earlier revision also asserted that every
// plan declaring an invariant-8 (impeccable) gate carries a §12 closeout. Three
// consecutive review rounds showed that claim cannot be made both
// fail-by-default and true: the plans tree is heterogeneous (33 flat `*.md`
// plans, 274 nested files, naming that includes `plan.md`, `00-plan.md`,
// `PLAN.md`, `<name>-closeout.md`), so there is no convention that locates a
// closeout for an arbitrary plan, and any registry-based version is an opt-in
// list rather than a default-deny guard. Enforcing it properly means first
// establishing that convention across ~300 documents, which is its own change.
// Filed as BL-INVARIANT8-CLOSEOUT-ENFORCEMENT and graduated 2026-08-01 via
// test/invariant8-closeout-enforcement: the assertion returned as its own
// guard, tests/docs/_metaInvariant8Closeout.test.ts (sound discovery +
// marker grammar). What remains HERE is the ledger half, enforceable and true.
//
// Spec: docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md §9 T8.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { LEDGER_FAMILIES, ledgerFiles, optsFor, type LedgerFamily } from "@/scripts/lib/ledger-fields";
import { premise } from "@/tests/_shared/premise";

import {
  entryTerminal,
  extractEntries,
  headingVerdicts,
  ledgerIds,
  type ExtractOpts,
  type LedgerEntry,
} from "./_ledgerMdast";

/**
 * Per-ledger extraction options. Heading level differs by ledger and is not
 * incidental: DEFERRED entries are level 3 and its level-2 headings are prose
 * sections, so widening there would pull in section titles; BACKLOG entries
 * appear at BOTH levels (`## BL-…` in the active queue, `###` for some
 * archived ones), and the `BL-` prefix requirement keeps prose out.
 */
const DEFERRED_OPTS: ExtractOpts = { requirePrefix: null, levels: [3] };
const BACKLOG_OPTS: ExtractOpts = { requirePrefix: "BL-", levels: [2, 3] };

/**
 * Deferrals graduated to the archive since this guard shipped. NOT a mirror of
 * the ~130 historical archive entries: those predate the guard and are covered
 * only by the no-overlap invariant below, not by per-id presence — and that
 * invariant reaches only headings that actually carry an id (see DEFERRAL_ID).
 */
const GRADUATED = [
  // feat/a11y-privacy-cluster (2026-08-07, arc A): the share-link scroll cue.
  // Un-deferred by the user into an arc that could own both requirements the
  // deferral named — a transition inventory for the new motion surface and a
  // reduced-motion arm — so it graduated by satisfying them, not by waiving them.
  "SHARELINK-CUE-VISIBILITY-1",
  "SETTINGS-DEVROW-GALLERY-RESIDUE-1",
  // feat/sharehub-archive-copy-reveal (2026-07-24). The first RESOLVED by the
  // popover placement migration; the second archived as REFUTED rather than
  // fixed, which is still a graduation — it left the open queue.
  "SHAREHUB-ARM-VIEWPORT-REVEAL-1",
  "SHAREHUB-ARCHIVE-GRAVITY-CUE-1",
] as const;

/**
 * Backlog entries graduated to the archive since this guard covered that pair.
 * Same contract as GRADUATED above: not a mirror of the historical archive.
 *
 * `provenance` is the string the archived section must contain — normally the
 * branch that resolved the entry. It is per-entry rather than one shared
 * constant because graduations arrive from different branches, and a single
 * literal would either be asserted against sections it has nothing to do with
 * or quietly dropped. Two entries did not graduate by being implemented: the
 * pg-client one was WITHDRAWN after measurement refuted its premise, and the
 * watch-diagnostic one closed as OBSOLETE against a deleted surface. Both still
 * left the open queue, which is what a graduation is, so both carry the branch
 * that recorded the finding.
 */
const BACKLOG_GRADUATED = [
  // fix/attention-panel-left-overflow (2026-08-29, PR #941): the attention menu
  // panel was sized against the VIEWPORT while right-anchored inside the review
  // modal's clip, so its left edge landed 36px outside that clip on BOTH review
  // modals at phone widths. It migrates onto the shared lib/popover placement
  // stack, whose x-clamp is the actual repair — a width cap is the wrong
  // mechanism at every width, since narrowing a right-anchored panel moves its
  // left edge further left. It was the LAST useFitWithinClip consumer, so that
  // hook and its suite retire with it.
  //
  // The row's own account of the defect was corrected in passing: it recorded
  // -18.85 on the wizard and -36.00 on the published menu and read the gap as the
  // shipped surface being worse. They are ONE defect measured at two animation
  // phases (343 * 0.95 = 325.85 against a right edge pinned by origin-top-right),
  // and at rest both surfaces overhang by 36px.
  //
  // Three spec decisions were reversed by implementation evidence and are
  // recorded in that spec's §3.1a rather than left for a reader to find by
  // diffing code against spec: no portal (it preserves the focus trap but breaks
  // sequential focus ORDER from the pill), the anchor is the panel's offset
  // parent and not the pill, and the CSS top/right fallback is load-bearing.
  //
  // One consequence is filed rather than fixed: containment necessarily places
  // the open menu over the published toggle at 375, which is an auto-open product
  // decision (BL-ATTENTION-MENU-AUTOOPEN-COVERS-TOGGLE-PHONE) and not geometry.
  {
    id: "BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW",
    provenance: "fix/attention-panel-left-overflow",
  },
  // fix/published-attention-escape-race (2026-08-28, PR #940): Escape could close the
  // whole published review modal whenever the attention panel was down for a frame,
  // losing the operator's scroll position and section. Both candidates the row named
  // were retired on measured evidence and its own supporting reading turned out to be
  // instrument error; the repair is a claim that outlives the panel and classifies a
  // transient unmount from an intentional dismissal. Two windows stay documented limits
  // with disjoint re-file signatures.
  {
    id: "BL-PUBLISHED-ATTENTION-ESCAPE-CLOSES-MODAL-RACE",
    provenance: "fix/published-attention-escape-race",
  },
  // fix/nearmiss-non-field-blocks (2026-08-28): the near-miss detector now fires only in
  // blocks shaped like field lists. Owner-ratified scope; the row's second candidate repair
  // (family matching) was declined for this arc and fenced in the spec rather than left
  // implicit, so a later reader does not re-derive it as an oversight.
  { id: "BL-NEARMISS-CANDIDACY-NON-FIELD-BLOCKS", provenance: "fix/nearmiss-non-field-blocks" },
  // perf/anchoredportal-measure-convergence (2026-08-27, PR #923): the portal's
  // three measures per open converge to two. The row deliberately did not assert
  // what the number should be; deciding it was the work.
  { id: "BL-ANCHOREDPORTAL-TRIPLE-MEASURE-PER-OPEN", provenance: "perf/anchoredportal-measure-convergence" },
  // feat/speclint-dispatch-gates (2026-08-26, PR #904): two bookkeeping rows,
  // neither of which shipped code. A graduation is leaving the open queue, not
  // necessarily an implementation — the BL-TEST-PG-CLIENT-TEARDOWN precedent.
  //
  // The orphaned-components row reached its terminal state 2026-08-03 and then
  // sat in the open queue for three weeks saying "a future sweep must not read
  // this row as unfinished work", which is the one place a future sweep does not
  // look. The nullcode row is a CONTAINER HEADING whose working order finished;
  // only the heading moved, and the five `###` sub-rows under it are still open
  // and in place, proved by heading set arithmetic in the archive entry.
  { id: "BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE", provenance: "feat/speclint-dispatch-gates" },
  { id: "BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS", provenance: "feat/speclint-dispatch-gates" },
  { id: "BL-NULLCODE-STAMP-BATCH-2", provenance: "feat/speclint-dispatch-gates" },
  // fix/supabase-upstream-fault-class (2026-08-25): the loader-class row and the
  // observability row it was descoped into, graduating together because the second is what
  // the first turned out to need. The class row closes on a recorded DISPOSITION rather than
  // a repair: all eleven of its failing attempts name one of seven RPCs, every one already
  // retryable, and none names anything else — but a failed write returns without logging, so
  // that is association and not causation, and no repair can be chosen for a failure whose
  // mechanism nobody can name. The two-way choice its first scheduled step posed is retired
  // as undecidable on current evidence, by orchestrator ruling, with the boot-and-seed
  // argument against bootstrap hardening explicitly WITHDRAWN as false: migrations apply over
  // a direct connection and the seed shells out to psql on 54322, so neither traverses the
  // gateway. The observability row ships in full, because unattributability is the thing the
  // observer removes. Residues stay as documented limits in the shipped spec §9 and §9a and
  // in the batch-2 spec's own limits section, per Eric's no-new-rows directive on this arc.
  { id: "BL-ADMIN-LOADER-CI-TRANSIENT", provenance: "fix/supabase-upstream-fault-class" },
  {
    id: "BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY",
    provenance: "fix/supabase-upstream-fault-class",
  },
  // fix/e2e-proof-retired-route-subpixel (2026-08-25): the two e2e-proof rows,
  // graduating together because one arc answered both and because their repairs
  // turned out to share a root — a real-browser proof reporting something other
  // than the contract it was written to guard. The empty-state row shipped MORE
  // than it filed: re-targeting the route was necessary and not sufficient, and
  // three further blockers (a picker cookie WebKit will not store over http, a
  // per-show tagged cache that swallows direct DB writes, and a "no dates" shape
  // that faults the shell) were only visible from real runs. The tap-target row
  // shipped the OPPOSITE of what it proposed: its named suspect, the half-pixel
  // tolerance, was refuted by measurement (537 of 546 reads bit-identical, every
  // outlier inside 120ms of the panel mounting) and no tolerance changed at all.
  // Residues stay as documented limits on their owning surfaces rather than as
  // new rows, per Eric's 2026-08-25 no-new-rows directive: the venue §8.3 gap in
  // the shipped spec §7.4, the dark-on-main window in the workflow header, and
  // the font-wait guard's blind spot in its own header.
  {
    id: "BL-E2E-EMPTY-STATE-REACHABILITY-RETIRED-ROUTE",
    provenance: "fix/e2e-proof-retired-route-subpixel",
  },
  {
    id: "BL-TAP-TARGET-LAYOUT-SUBPIXEL-TOLERANCE",
    provenance: "fix/e2e-proof-retired-route-subpixel",
  },
  // fix/speclint-prose-consistency-arms (2026-08-18): the two prose-consistency rows,
  // graduating together because one spec answered both — a universal-quantifier claim
  // standing away from its enumeration is the same structure the post-repair sweep keeps
  // missing, so one recognizer feeds an advisory for the cardinal case and an inventory
  // for the un-cardinalled one. Each row shipped the mechanism it named, and NEITHER
  // shipped the shape it guessed at: the parity row proposed a "restates a measurement"
  // output and got that ANDed with the no-probe condition, because the restatement half
  // alone measured as a flood; the forward-ref row imagined a per-bullet cross-check and
  // got INVENTORY, because out-of-scope bullets are three orders too many for a tripwire.
  // Residues stay as documented limits in the shipped spec §7 rather than as new rows.
  // BL-SPECLINT-BL-DISPOSITION-CLOSEOUT-ARM deliberately does NOT ride along: the arc was
  // asked to decide whether it shares this surface and recorded that it does not.
  { id: "BL-SPECLINT-ENUMERATED-UNIVERSAL-PARITY", provenance: "fix/speclint-prose-consistency-arms" },
  { id: "BL-SPECLINT-POSTREPAIR-FORWARD-REF-SWEEP", provenance: "fix/speclint-prose-consistency-arms" },
  // fix/modal-wait-skeleton-tolerant (2026-08-18): the two e2e waits the boundary
  // helper could not harden. Graduates as a full repair — a frame-REPORTING core plus a
  // boundary watchdog closed the mechanism the entry named (the skeleton wins a
  // modal-or-boundary race and converts a starve into a silent pass), and both sites
  // adopted. The entry's own residues stay as documented limits in the shipped spec §7,
  // not as new rows: the watchdog's FIRE path has no deterministic test, and the
  // deeplink skeleton-Esc path stays opportunistic exactly as it is today.
  { id: "BL-MODAL-WAIT-SKELETON-TOLERANT-SITES", provenance: "fix/modal-wait-skeleton-tolerant" },
  // chore/heavy-orphan-reaper (2026-08-16): the heavy semaphore bounds admission and
  // nothing bounded a worker's LIFETIME once its harness died. Graduates as a REPAIR that
  // shipped shape (a) of the entry's own three candidates, narrowed to an invoked reaper.
  // The entry's reporting residue does NOT ride along: it is fenced as documented limit L-9
  // and filed as BL-HEAVY-REAP-REPORT-OBSERVABILITY, and the orphans' PRODUCER stays open as
  // BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH under class-sweep exception (c).
  { id: "BL-HEAVY-ORPHAN-WORKER-LIFETIME", provenance: "chore/heavy-orphan-reaper" },
  // fix/modal-wait-candidate-contract (2026-08-17): the modal-wait census's TWO
  // precision rows, graduating together because they were one contract — the
  // site-association repair is unbuildable on the line unit (4 of the 12 live
  // Shape-N calls carry their label on a different physical line than the call),
  // so the aggregate-counts row structurally required the line-granularity one.
  // Both closed by CHANGING THE UNIT and DECLARING the association, which is the
  // repair direction each row ratified at filing, never by recognizer growth.
  { id: "BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION", provenance: "fix/modal-wait-candidate-contract" },
  { id: "BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS", provenance: "fix/modal-wait-candidate-contract" },
  // test/modal-wait-helper-adoption (2026-08-16): the peer-adoption sweep whose OWN
  // census the arc refuted. The row proposed two literal greps naming 7 + 7 specs;
  // both mis-census, and the larger gap is that a file-keyed literal grep cannot see
  // an open that is not a literal goto. Closed as CODE — a candidate enumeration over
  // five origins with a total disposition — rather than as a corrected prose table,
  // because four consecutive spec rounds proved that format does not converge.
  { id: "BL-MODAL-WAIT-BOUNDARY-HELPER-ADOPTION", provenance: "test/modal-wait-helper-adoption" },
  // fix/help-refanchor-a11y (2026-08-15): the /help/errors copy-link a11y row, all three
  // filed findings shipped in one arc. The entry left the tab-stop question open on
  // purpose; the owner ratified that the copy-links STAY tabbable, so it graduates with a
  // skip path rather than the tabindex removal a reader might have assumed.
  { id: "BL-HELP-REFANCHOR-A11Y-PASS", provenance: "fix/help-refanchor-a11y" },
  // fix/changes-feed-batch-flake (2026-08-15): the e2e flake row whose own filed theory was
  // refuted rather than confirmed — the repair is a wait helper that recovers once from the
  // admin error boundary, not the fixture isolation the entry proposed.
  { id: "BL-CHANGES-FEED-MODAL-BATCH-FLAKE", provenance: "fix/changes-feed-batch-flake" },
  // feat/diagram-viewing-polish (2026-08-11): the three diagram-viewing rows the
  // 2026-08-10 decision round bundled, each closing by a DIFFERENT route, which
  // is why they are three rows and not one. The progress-affordance row
  // graduates by SPEC AMENDMENT — it named two candidate shapes and said neither
  // was settled; the round settled it on the zoom gate and DECLINED the progress
  // affordance outright, so the alternative is a documented limit rather than a
  // successor entry. The blur row graduates on PROBE EVIDENCE with no code
  // change at all: it was filed INFERRED-NOT-PROBED, its own named probe was run,
  // and it refuted the premise. The failed-item row graduates as a REPAIR, and
  // the recovery affordance the repair deliberately omits is filed as
  // DIAGRAM-FAILURE-RECOVERY-1 rather than left implicit inside a closed entry.
  {
    id: "BL-LIGHTBOX-ORIGINAL-PROGRESS-AFFORDANCE",
    provenance: "feat/diagram-viewing-polish",
  },
  {
    id: "BL-DIAGRAM-BLUR-EDGE-SIZE",
    provenance: "feat/diagram-viewing-polish",
  },
  {
    id: "BL-GALLERY-FAILED-ITEM-FOCUS-AND-ANNOUNCE",
    provenance: "feat/diagram-viewing-polish",
  },
  // feat/crew-field-enrichment (2026-08-09): the two entries the corpus probe
  // closed together. The field-enrichment row graduates RESOLVED — its flight
  // bullet had already shipped (the entry's "not in the ShowForViewer
  // projection and renders no UI" claim was stale), and its Wi-Fi and room
  // bullets ship on this branch. The flight-leg row graduates OBSOLETE because
  // its own promotion prerequisite (a structured flight shape) shipped and made
  // the structured card the DEFAULT render, retiring the entry's scope. The
  // narrower raw-fallback path that stays reachable for date-only legs — which
  // DO parse, but carry no displayable field for the card to lay out — is
  // filed as its successor, BL-FLIGHT-UNSTRUCTURED-LEG-RAW-FALLBACK, rather than
  // left implicit inside a closed entry (diff review R2 F3).
  {
    id: "BL-CREW-FIELD-ENRICHMENT",
    provenance: "feat/crew-field-enrichment",
  },
  {
    id: "BL-FLIGHT-LEG-ORIENTATION",
    provenance: "feat/crew-field-enrichment",
  },
  // ci/unit-gate-exclusions (2026-08-09): closed on verification, no new code —
  // pg-cron-coverage and test-auth-gate were promoted back into the unit suite
  // by the ci-dark cluster (PR3 2026-07-26, PR-B 2026-07-31); the one remaining
  // exclusion (email-canonicalization) is execution-proven via the run-excluded
  // oracle registry, so every exclusion is gated elsewhere by construction.
  { id: "BL-CI-UNIT-GATE-EXCLUSIONS", provenance: "ci/unit-gate-exclusions" },
  // feat/speclint-prose-count-parity (2026-08-11): graduates RESOLVED by shipping
  // all three measured shapes as advisory spec:lint codes. One of the three is a
  // partial graduation stated as such rather than waived — shape (c)'s
  // wedge-remeasure anchor is not boundedly expressible (three probe-refuted
  // designs), so it stays covered by the RULE half of the entry's own filing and
  // is pinned as a NO-FLAG fixture. The archived section carries the corpus
  // measurement and the arms' documented limits.
  {
    id: "BL-SPECLINT-PROSE-COUNT-PARITY",
    provenance: "feat/speclint-prose-count-parity",
  },
  {
    id: "BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST",
    provenance: "test/libdata-call-boundary-metatest",
  },
  // chore/next-1630-wedge-remeasure (2026-08-09): upstream React replay-loss fix
  // confirmed by measurement: 0/20 wedged samples on next 16.3.0's vendored canary
  // cbb046ab-20260731 vs the 7/10 baseline on 3f0b9e61-20260317. Graduated by the
  // entry's OWN second watch signal ("an upstream React/Next bump once the replay
  // fix ships in a stable vendored canary"), not by waiving it; the archived
  // section carries the pre-stated decision rule and an un-archive contract that
  // returns the row on either trigger. That contract is artifact-bound, not
  // ambient: the archived entry states which future wedge shapes its sensor can
  // and cannot see (a self-recovered or retry-recovered wedge in a green PR run
  // uploads nothing), so re-measuring is a dispatch, not a wait.
  {
    id: "BL-PUBLISHED-TOGGLE-CLIENT-COMMIT-WEDGE",
    provenance: "chore/next-1630-wedge-remeasure",
  },
  // refactor/classname-array-join-cn (2026-08-09): the 36 array-join classNames the
  // canonical-class eslint rule could not traverse (37 by the time it merged — the final
  // rebase integrated a fifth site in OnboardingWizard.tsx). Migrated to a local `cn`
  // callee the plugin recognizes by default, which exposed 10 real Tailwind violations
  // that had been escaping CI. The census guard that BOUNDED the blind spot is replaced by
  // a zero-tolerance recognizer that closes it.
  {
    id: "BL-CLASSNAME-ARRAY-JOIN-MIGRATION",
    provenance: "refactor/classname-array-join-cn",
  },
  // fix/help-tour-hydration (2026-08-11): /help/tour's hydration mismatch, whose
  // filed cause (column-0 `<a>` wrapped in a `<p>`) was REFUTED by the compile
  // probe and replaced by the real one — own-line text children inside a JSX flow
  // element parse as markdown paragraphs. The archived section records both, so
  // the superseded hypothesis is preserved rather than quietly corrected. The
  // same PR spent the promotion the entry banked: help-pages.spec.ts is wired
  // into app-e2e.yml and off the coverage allowlist.
  {
    id: "BL-HELP-TOUR-HYDRATION-MISMATCH",
    provenance: "fix/help-tour-hydration",
  },
  { id: "BL-CODEX-GUARD-COMMONMARK-PARSE", provenance: "feat/review-infra-gates" },
  { id: "BL-PLAN-SNIPPET-FENCE-GATE", provenance: "feat/review-infra-gates" },
  // feat/backlog-quick-wins (2026-08-07, arc C): the retainRows asymmetry. The
  // fix retains the LIVE row rather than the held snapshot — copying the
  // siblings would have traded a false notice for a silent data revert — and the
  // probe gained a phoneAfter oracle that can tell those two apart.
  {
    id: "BL-CAPABILITY-LOSS-SURVIVING-ROW-FALSE-POSITIVE",
    provenance: "feat/backlog-quick-wins",
  },
  // feat/a11y-privacy-cluster (2026-08-07, arc A): the travel-date privacy leak.
  // Three of its four sites gated off the shipped `suppressesDates` predicate;
  // the fourth — a peer's attendance days on the roster — closed by an OWNER
  // RULING rather than a gate (coordination wins), which is still a graduation.
  {
    id: "BL-CREW-UNKNOWN-ASTERISK-TRAVEL-LEAK",
    provenance: "feat/a11y-privacy-cluster",
  },
  // feat/a11y-privacy-cluster (2026-08-07, arc A): the four PENDING live-region
  // sites the AST walk filed, all closed BY REPAIR rather than by dropping the
  // rows. The cross-component walk-blindness limit re-homed to the guard file's
  // own docblock, which is the owning surface's limits record.
  {
    id: "BL-LIVE-REGION-AST-WALK-RESIDUE",
    provenance: "feat/a11y-privacy-cluster",
  },
  // feat/a11y-privacy-cluster (2026-08-07, arc A): the five dead role="status"
  // attributes, stripped only after the per-site census the entry demanded —
  // which found the entry's own "nothing is lost at runtime" premise false at
  // four of the five sites, and wired those outcomes before stripping.
  {
    id: "BL-CHANNEL-ANNOUNCER-RESIDUAL-ROLE-STATUS",
    provenance: "feat/a11y-privacy-cluster",
  },
  // feat/needs-attention-holds-rollup (2026-08-03): the cross-show open-holds read
  // the entry was blocked on, plus the fourth needs-attention stream it unblocked.
  {
    id: "BL-NEEDS-ATTENTION-HOLDS-ROLLUP",
    provenance: "feat/needs-attention-holds-rollup",
  },
  // chore/scanner-precision-cluster (2026-08-03): one bug shape, two entries — a
  // static scanner opening too small a set of files while a hand-maintained
  // residue covers the gap and rots invisibly. Both residues had already rotted.
  {
    id: "BL-INTERNAL-CODE-ENUM-SCAN-WIDEN",
    provenance: "chore/scanner-precision-cluster",
  },
  {
    id: "BL-LEDGER-GUARD-BODY-DEFINED-IDS",
    provenance: "chore/scanner-precision-cluster",
  },
  // chore/close-mutation-autocorrect-drift (2026-08-03): a stale entry, not new work. The
  // re-bless it asked for shipped the same day it was filed (c5847a9f4, PR #548 — 2452 pure
  // fingerprint drifts, 0 new holes, 0 fixed holes) and nobody closed the entry. Provenance is
  // the branch that RESOLVED it, per this list's contract, not the one that archived it.
  {
    id: "BL-MUTATION-LEDGER-AUTOCORRECT-DRIFT",
    provenance: "chore/mutation-ledger-autocorrect-rebless",
  },
  // fix/onboarding-cas-source-anchors (2026-08-03): the existing-show re-onboard now threads the
  // scan's source_anchors through the shadow payload to the Phase-D apply. Archived with the
  // shipped mechanism, not the stale pre-lock-compute one the entry was filed with.
  {
    id: "BL-ONBOARDING-CAS-SOURCE-ANCHORS",
    provenance: "fix/onboarding-cas-source-anchors",
  },
  // test/parser-determinism-pair (2026-08-02): the venue typo-generator case. The entry's
  // recorded diagnosis was wrong — the generator has no RNG. The defect was order-coupled
  // sampling, and exhaustive enumeration of all 8453 neighbours found ZERO recovery gaps, so
  // the entry's open question is answered no.
  { id: "BL-PARSER-VENUE-TYPO-GENERATOR-SEED-FLAKE", provenance: "test/parser-determinism-pair" },
  // test/parser-determinism-pair (2026-08-02): the known-sections walker was already delivered
  // on 2026-07-06 by tests/parser/_metaKnownSectionsWalker.test.ts. This branch retired the
  // stale entry and the two source docstrings that still claimed the walker was unbuilt.
  { id: "BL-KNOWN-SECTIONS-WALKER", provenance: "test/parser-determinism-pair" },
  // test/agenda-fold-seeded-e2e (2026-08-02): the per-viewer agenda day fold exercised
  // through the REAL crew page — seeded agenda_links + two complementary date-restricted
  // viewers (email-matched Google sessions, one seeded show each) in
  // stage-restricted-crew-schedule.spec.ts, wired into crew-e2e.yml behind a run-command
  // wiring guard.
  { id: "BL-AGENDA-FOLD-NO-SEEDED-E2E", provenance: "test/agenda-fold-seeded-e2e" },
  // test/agenda-fold-seeded-e2e (2026-08-02): the fold's a11y proof on WebKit — grep-scoped
  // standalone-webkit-a11y project (exactly one test, structurally pinned) + webkit installs.
  { id: "BL-AGENDA-A11Y-WEBKIT-COVERAGE", provenance: "test/agenda-fold-seeded-e2e" },
  // fix/ledger-guard-terminal-claim (2026-08-03): the guard's own two blind spots,
  // found while verifying entries for archival. An intensifier after the heading
  // anchor, and a status marker before an opening claim, each hid a live closure.
  // Fixed in _ledgerMdast.ts, pinned by the M10 plants, spec §3.1.
  {
    id: "BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND",
    provenance: "fix/ledger-guard-terminal-claim",
  },
  // fix/admin-popover-overlay-cluster (2026-08-02): the six-item popover /
  // overlay-clip cluster, closed against the ratified spec
  // 2026-08-01-admin-popover-overlay-cluster.
  //
  // The hub backdrop (fixed inset-0 z-20) painted over its own NON-POSITIONED
  // triggers and swallowed their taps; closes with a three-term elevation gate
  // (open && !busy && !attentionMenuOpen), the menu term threaded
  // PublishedReviewModal -> StatusStrip -> ShareHub.
  { id: "BL-SHAREHUB-BACKDROP-COVERS-TRIGGERS", provenance: "fix/admin-popover-overlay-cluster" },
  // Filed as unverified-gap by the popover-overlay registry, then MEASURED: at
  // 390x560 the menu overhung the clipping panel by 55px with a 54px stranded
  // tail. The scroller took the shared useFitWithinClip and gained a named,
  // tabbable scrollable-region role. That hook was retired 2026-08-28
  // (BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW) when this same overlay migrated to
  // placeWithinVisibleViewport; the height cap now reaches the scroller through
  // the panel's fitted max-height. The role is unchanged.
  { id: "BL-ATTENTION-MENU-PANEL-CLIP", provenance: "fix/admin-popover-overlay-cluster" },
  // Same class on the anchored refusal banner (measured overhang 43.7px past a
  // 220px clip): capped against the clip edge, made a real scroll container,
  // and given a name plus tab reachability.
  { id: "BL-PUBLISHED-TOGGLE-OVERLAY-CLIP", provenance: "fix/admin-popover-overlay-cluster" },
  // The armed Archive confirm now names the show (owner-ratified copy), with a
  // blank-safe guard so every non-hub call site renders today's strings
  // byte-identically, and a no-truncation pin so a long title is never elided
  // on a destructive decision.
  { id: "BL-SHAREHUB-CONFIRM-NAMES-SHOW", provenance: "fix/admin-popover-overlay-cluster" },
  // Closed as a MEASURED ARTIFACT, not a product leak: the open-focus effect
  // makes jsdom run Selection._associateRange, which arms a setTimeout(0) that
  // fake timers never drain. No component change; the root cause is recorded at
  // the delta baseline so the next reader does not re-bisect it.
  { id: "BL-SHAREHUB-OPEN-TIMER-LEAK", provenance: "fix/admin-popover-overlay-cluster" },
  // The duplicated leading-edge rAF throttle extracted to
  // lib/popover/rafCoalescer.ts and adopted by both consumers, with an AST
  // adoption pin that resolves callees through the type checker so a same-named
  // local, a shadowing parameter, or a decoy-module import cannot satisfy it.
  { id: "BL-POPOVER-SHARED-RAF-COALESCER", provenance: "fix/admin-popover-overlay-cluster" },
  // test/redirect-guard-type-aware (2026-08-01): the self-redirect guard's
  // syntactic 19-spelling matcher replaced by two-prong type-checker resolution
  // (calls by resolved signature; every other reference type-decided, incl.
  // destructuring-assignment members and naked class-object flows). Sole
  // remaining type-erasure limit: string-mediated dynamic access (eval shape),
  // E-pinned; receiver laundering, widened keys, and Reflect.get are caught.
  { id: "BL-SOUND-REDIRECT-GUARD", provenance: "test/redirect-guard-type-aware" },
  // test/ci-cross-step-env-guard (2026-08-01): job-scoped cross-step
  // GITHUB_ENV/GITHUB_PATH state in both CI guard layers (census walker
  // splice + scanner per-job poison flag, closure families F1-F8).
  { id: "BL-CI-GITHUB-ENV-CROSS-STEP-STATE", provenance: "test/ci-cross-step-env-guard" },
  // test/ci-static-env-injection (2026-08-02): static env: blocks at every
  // scope refused via the value-pinned, governance-bound ENV_KEY_ALLOWLIST
  // shared by both CI guard layers (closure families S1-S8, bidirectional
  // pair-level + governance-equality hygiene).
  { id: "BL-CI-STATIC-ENV-INJECTION", provenance: "test/ci-static-env-injection" },
  // feat/card-copy-parity-sync-job-names (2026-08-01): §4.2 helpfulContext
  // byte-parity frozen for all 44 registry codes (rows 1-42 back-filled), and
  // the sync job's Doug-facing name unified to "Auto sync" across the catalog,
  // runSummary label, and the explainer mirror (§12.4 three-way lockstep).
  { id: "BL-CARD-COPY-HELPFULCONTEXT-PARITY", provenance: "feat/card-copy-parity-sync-job-names" },
  { id: "BL-SYNC-JOB-FOUR-NAMES", provenance: "feat/card-copy-parity-sync-job-names" },
  // test/invariant8-closeout-enforcement (2026-08-01): the closeout assertion
  // removed in a20b94457 returns as its own guard —
  // tests/docs/_metaInvariant8Closeout.test.ts (sound discovery, marker
  // grammar, frozen debt ledger).
  { id: "BL-INVARIANT8-CLOSEOUT-ENFORCEMENT", provenance: "test/invariant8-closeout-enforcement" },
  // test/pg-cron-mechanism-sabotage-probe (2026-08-01): mechanism-sabotage
  // probes for the pg-cron vacuity guard — an inert-case mutant must red the
  // suite by name (attribution) and via the aggregate branch (backstop).
  { id: "BL-PG-CRON-PER-CASE-QUERY-ATTRIBUTION", provenance: "test/pg-cron-mechanism-sabotage-probe" },
  // fix/announce-a11y-pass (2026-08-01): arm-expiry announcements on the 11
  // ARM_REVERT_MS surfaces (+ StagedReviewCard Apply disarm fix) and the
  // ShareHub remote-rotation live region.
  { id: "BL-DESTRUCT-ARM-STATE-ANNOUNCEMENTS", provenance: "fix/announce-a11y-pass" },
  { id: "BL-SHAREHUB-REMOTE-ROTATE-ANNOUNCE", provenance: "fix/announce-a11y-pass" },
  // test/ledger-guard-mdast-rewrite (2026-08-01): this guard's own rewrite —
  // the regex lanes replaced by the _ledgerMdast walker, the r22-r41
  // hardening restored, the r41 findings closed by probe. The walker
  // validates this very row (the guard polices its own graduation).
  { id: "BL-LEDGER-GUARD-MDAST-REWRITE", provenance: "test/ledger-guard-mdast-rewrite" },
  // fix/judgment-chip-newtab-suffix (2026-08-01, PR #640): judgment chip border-strong
  // outline; stripNewTabSuffix dedup at the three interpolated new-tab labels.
  { id: "BL-HEADER-JUDGMENT-CHIP-CONTRAST", provenance: "fix/judgment-chip-newtab-suffix" },
  { id: "BL-NEWTAB-DOUBLE-ANNOUNCE-USER-DATA", provenance: "fix/judgment-chip-newtab-suffix" },
  // feat/ci-dark-directive-resolver (2026-07-31): PR-C of the ci-dark descoped
  // close-out — the shared "use server" directive plugin (a parse-based, throw-on-
  // call resolver) closed the resolver-soundness item, and packlist-rescan-recovery
  // returned to the standalone config under it.
  { id: "BL-HARNESS-RESOLVER-POLICY", provenance: "feat/ci-dark-directive-resolver" },
  { id: "BL-HARNESS-PACKLIST-SERVER-GRAPH", provenance: "feat/ci-dark-directive-resolver" },
  // 2026-07-27 reconciliation: three shipped entries were annotated terminal
  // in place rather than moved — one as "CLOSED" in the heading, one as
  // "RESOLVED" in the heading, one as a SHIPPED status line. All three shapes
  // were invisible to the status-line check as it stood; the heading and
  // SHIPPED assertions below now cover them.
  { id: "BL-E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED", provenance: "feat/ci-lifecycle-gallery" },
  { id: "BL-HEADER-PROBE-RESIDUAL-VACUITY", provenance: "test/header-probe-residual-closure" },
  { id: "BL-AGENDA-PERDAY-VIEWER-FILTER", provenance: "feat/agenda-perday-viewer-fold" },
  // feat/scan-sse-null-code (2026-07-27, PR #621): PR4 of the BL-NULLCODE-STAMP-BATCH-2
  // residual sweep — the scan SSE terminal body now carries the cataloged code.
  { id: "BL-SCAN-SSE-BODY-NULL-CODE", provenance: "feat/scan-sse-null-code" },
  // feat/picker-tamper-alert (2026-07-27, PR #623): PR5 of the same sweep — the tamper
  // breadcrumb now raises a global admin alert.
  { id: "BL-PICKER-TAMPER-ADMIN-ALERT", provenance: "feat/picker-tamper-alert" },
  // test/alert-action-links-e2e (2026-07-27): PR6, the last of the sweep — live-app
  // e2e over every registered alert action link.
  { id: "BL-ALERT-ACTION-LINKS-E2E", provenance: "test/alert-action-links-e2e" },
  // feat/ci-dark-vitest-exclusion (2026-07-31): PR-B of the ci-dark descoped
  // close-out — every ENV_BOUND_EXCLUDES entry now proves execution via the
  // run-excluded oracle registry; test-auth-gate returned to unit-suite.
  { id: "BL-CI-VITEST-EXCLUSION-COVERAGE", provenance: "feat/ci-dark-vitest-exclusion" },
  // feat/driveid-guard-cluster (2026-07-27): the four soundness follow-ups the 2026-07-25
  // Drive-ID coverage guard filed, closed by the guard-cluster spec.
  { id: "BL-DRIVEID-CENSUS-QUERY-SELF-CHECK", provenance: "feat/driveid-guard-cluster" },
  { id: "BL-VALIDATION-PARITY-DEFINITION-MATCH", provenance: "feat/driveid-guard-cluster" },
  // fix/drive-api-call-timeouts (2026-08-01): the drive-timeout cluster — the
  // eight app/api Drive calls bounded, the GoogleAuth token POST bounded via
  // the URL-scoped TokenBoundGaxios, and the watch entry's last residual (the
  // credential fetch) closed with it. Spec:
  // docs/superpowers/specs/2026-07-31-drive-timeout-cluster-design.md.
  { id: "BL-DRIVE-API-CALLS-UNBOUNDED-APP-ROUTES", provenance: "fix/drive-api-call-timeouts" },
  { id: "BL-DRIVE-CREDENTIAL-FETCH-UNBOUNDED", provenance: "fix/drive-api-call-timeouts" },
  { id: "BL-WATCH-DRIVE-CALL-TIMEOUT", provenance: "fix/drive-api-call-timeouts" },
  { id: "BL-VALIDATION-TARGET-BINDING", provenance: "feat/driveid-guard-cluster" },
  { id: "BL-DRIVEID-BEHAVIORAL-COVERAGE", provenance: "feat/driveid-guard-cluster" },
  // fix/picker-flow-app-bugs (2026-07-25). The three app-behavior blockers
  // behind the skipped picker-flow e2e stubs, all fixed in that branch.
  // feat/watch-reconcile-backoff (2026-07-27): the deferred backoff half shipped
  // once the four lifecycle prerequisites cleared it.
  { id: "BL-WATCH-RECONCILE-BACKOFF", provenance: "feat/watch-reconcile-backoff" },
  { id: "BL-PICKER-BOOTSTRAP-HOST-FLIP", provenance: "fix/picker-flow-app-bugs" },
  { id: "BL-PICKER-GATE-SKIP-MISMATCH", provenance: "fix/picker-flow-app-bugs" },
  { id: "BL-PICKER-CLAIMED-ROW-NEXT-DROP", provenance: "fix/picker-flow-app-bugs" },
  // 2026-07-25 reconciliation: seven entries carried a terminal status
  // (CLOSED / WITHDRAWN / RESOLVED) while still sitting in the open queue,
  // which BACKLOG.md's own header forbids. Four of them landed after the
  // "Last reconciled: 2026-07-24" line, so the header was stale too.
  { id: "BL-HOVERHELP-VISUAL-VIEWPORT", provenance: "fix/hoverhelp-visual-viewport-tdd" },
  { id: "BL-TEST-PG-CLIENT-TEARDOWN", provenance: "fix/test-pg-client-teardown-stale" },
  {
    id: "BL-WATCH-ERROR-MESSAGE-RAW-DIAGNOSTIC",
    provenance: "docs/nullcode-batch2-residual-hygiene",
  },
  { id: "BL-DBTEST-LOOPBACK-EVAL-GUARD", provenance: "test/safety-hardening-batch" },
  { id: "BL-RESCAN-PREPARE-ERROR-GRANULARITY", provenance: "test/safety-hardening-batch" },
  { id: "BL-STEP3-STAGED-LINK-GUARD-HELPER-BYPASS", provenance: "test/safety-hardening-batch" },
  { id: "BL-SHAREHUB-ARM-VIEWPORT-REVEAL", provenance: "feat/sharehub-archive-copy-reveal" },
  // 2026-07-25: shipped, not reconciled -- PR #592 closed it by implementing it.
  { id: "BL-ADMIN-QUIET-LINK-AFFORDANCE-A11Y", provenance: "fix/newtab-announcement-family" },
  // feat/childless-growable-static-guard (2026-07-26): the guard shipped as
  // tests/styles/_childlessGrowableScan.ts + _metaChildlessGrowable.test.ts.
  {
    id: "BL-CHILDLESS-GROWABLE-STATIC-GUARD",
    provenance: "feat/childless-growable-static-guard",
  },
  // feat/section-header-rebuild-phantom-spacers (2026-07-25). The three
  // phantom-gap items, all repaid in that branch.
  {
    id: "BL-PHANTOM-GAP-CHROME-SPACER-CROWDED-ROW",
    provenance: "feat/section-header-rebuild-phantom-spacers",
  },
  {
    id: "BL-PHANTOM-GAP-BLANK-EYEBROW-TRAVELROW",
    provenance: "feat/section-header-rebuild-phantom-spacers",
  },
  {
    id: "BL-PHANTOM-GAP-PROBE-ARCHIVED-BUCKET",
    provenance: "feat/section-header-rebuild-phantom-spacers",
  },
  // 2026-07-27 sheet-icon-link close-out sweep: closed in place in a spelling
  // the terminal-status guard could not see (a bold opening claim) — the
  // guard was widened in the same branch. The three companion graduations
  // that sweep also caught (E2E-LIFECYCLE-INACTIVE-NOTICE-RETIRED,
  // HEADER-PROBE-RESIDUAL-VACUITY, AGENDA-PERDAY-VIEWER-FILTER) were
  // independently graduated by mainline #628 and are listed above with
  // mainline provenance.
  {
    id: "BL-HEADER-LINK-AFFORDANCE-CLASS",
    provenance: "feat/sheet-icon-link-affordance-class",
  },
  // BL-CI-STALE-BRANCH-PROTECTION-COMMENT is deliberately NOT here: this
  // branch graduated it, mainline #628 kept it in place the same day
  // (sub-entry of a still-open parent section), and the merge reverted the
  // graduation per #628's keep. It lives in HEADING_TERMINAL_EXEMPT instead.
  // fix/lifecycle-transitions-roundtrip-flake (2026-07-27). The round-trip
  // flake reached five consecutive CI greens; the spec is wired and its
  // allowlist row deleted.
  {
    id: "BL-E2E-LIFECYCLE-TRANSITIONS-ROUNDTRIP-FLAKE",
    provenance: "fix/lifecycle-transitions-roundtrip-flake",
  },
  // docs/citation-rot-financials-vocab (2026-08-02): the docs-hygiene batch —
  // 15 dangling citations to the seven retired e2e workflows rendered as
  // prose across 10 docs (class-swept), and the master spec's financials
  // prose reconciled to LEAD/FINANCIALS/admin entitlement (14 claims;
  // spec 2026-08-02-docs-hygiene-citation-rot-financials-vocab-design.md).
  {
    id: "BL-DANGLING-CITATIONS-RETIRED-WORKFLOW",
    provenance: "docs/citation-rot-financials-vocab",
  },
  {
    id: "BL-MASTERSPEC-FINANCIALS-VOCAB",
    provenance: "docs/citation-rot-financials-vocab",
  },
  // chore/copy-deadcode-sweep (2026-08-02): the copy-and-dead-code batch — the
  // §12.4 ROLE_FLAGS_NOTICE helpfulContext no longer claims either capability
  // role unlocks admin access (five-surface lockstep + the row's
  // longExplanation), the orphaned ParsePanel component is deleted behind a
  // zero-production-importer guard, and the per-show help prose names the Share
  // link button instead of the retired strip copy-link
  // (spec 2026-08-02-copy-deadcode-sweep-design.md).
  {
    id: "BL-ROLEFLAGS-NOTICE-HELPFULCONTEXT-OVERGRANT",
    provenance: "chore/copy-deadcode-sweep",
  },
  {
    id: "BL-ADMIN-PARSEPANEL-ORPHANED",
    provenance: "chore/copy-deadcode-sweep",
  },
  {
    id: "BL-HELP-STRIP-COPYLINK-STALE",
    provenance: "chore/copy-deadcode-sweep",
  },
  // docs/close-v1-override-wont-build (2026-08-03): closed WON'T BUILD, not
  // shipped. A force-classify override IS the approve-ambiguous path the
  // confidence gate exists to prevent, and the row's premise was false: a real
  // legacy-v1 sheet, once seen, is registrable via the marker-registration path
  // the gate spec already prescribes, like any other unregistered template.
  // Leaving the open queue is what a graduation is.
  {
    id: "BL-VERSION-AMBIGUOUS-V1-OVERRIDE",
    provenance: "docs/close-v1-override-wont-build",
  },
  // feat/help-report-surface (2026-08-09): the non-show recurrence-report
  // surface shipped as Option A of the owner-ratified design — the /help/errors
  // trailing mailto is replaced by the M8 report flow at surface "help",
  // show_id null. The entry's "API + storage. Decision needed" block was stale,
  // not open: reports.show_id has been nullable since the founding migration,
  // so no endpoint, table, or migration was needed and the effort resized L to S
  // (spec 2026-08-09-help-report-surface-design.md).
  {
    id: "BL-HELP-NON-SHOW-REPORT-SURFACE",
    provenance: "feat/help-report-surface",
  },
  // fix/promote-identity-validation (2026-08-10): promotion now validates the
  // required-NAME set (exact set + path binding, bounded deltas, post-commit
  // SNAPSHOT_PROMOTE_MANIFEST_MISMATCH emit) instead of comparing listing
  // lengths; the count SQL is deleted and the names SQL is realdb-pinned
  // through the composed promote-tx seam.
  {
    id: "BL-PROMOTE-VALIDATES-COUNTS-NOT-IDENTITIES",
    provenance: "fix/promote-identity-validation",
  },
  // feat/wifi-password-legibility (2026-08-15): two rows, closing by two
  // different routes, which is why they are two entries rather than one arc row.
  // The transcription row graduates as a BUILD — the affordance question it was
  // filed to settle got its owner decision (disambiguated type AND tap-to-copy),
  // and both halves shipped with the geometry measured in the production route
  // and a standalone harness. The trailing-prose row graduates on PROBE EVIDENCE
  // with NO parser change: it was filed INFERRED-NOT-PROBED, its own named
  // corpus sweep was run, and it found zero instances plus a third genuine
  // multi-token SSID — so every candidate rule is a recognizer calibrated on
  // nothing, and the limit is documented in the spec rather than left open.
  {
    id: "BL-SPECLINT-EXPECT-N-EXIT-STATUS",
    provenance: "feat/speclint-expect-n-exit-status",
  },
  {
    id: "BL-VENUE-WIFI-PASSWORD-TRANSCRIPTION-LEGIBILITY",
    provenance: "feat/wifi-password-legibility",
  },
  {
    id: "BL-WIFI-FLATTENED-TRAILING-PROSE",
    provenance: "feat/wifi-password-legibility",
  },
  // chore/guard-completeness-wave (2026-08-14): owner-ratified documented limit
  // (2026-08-10) demoted per the filing bar; the limits live in the guard's own
  // JSDoc block (tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:215-245).
  {
    id: "BL-CI-WIRING-GUARD-RESIDUAL-BYPASSES",
    provenance: "chore/guard-completeness-wave",
  },
  // chore/guard-completeness-wave (2026-08-15): the wave's three BUILD entries,
  // graduating together in the close-out commit. Each one's IN PROGRESS marker comes
  // off in this same commit, because the in-progress guard rejects an archived entry
  // that still declares itself in flight.
  {
    id: "BL-DESTRUCTIVE-GUARD-EXECUTION-SITE",
    provenance: "chore/guard-completeness-wave",
  },
  {
    id: "BL-LEDGER-GIT-TIMEOUT-CONSTANTS",
    provenance: "chore/guard-completeness-wave",
  },
  {
    id: "BL-PG-CRON-HOST-ASSERTION",
    provenance: "chore/guard-completeness-wave",
  },
  // docs/mutation-score-jurisdiction-gap (2026-08-24): re-scoped 2026-08-22 by
  // orchestrator ruling to admit a documented-limit close, then closed as one -
  // harness spec §7 L-11 plus the OPERATORS: disclosure arm on the dispatch gate.
  // Neither outcome the row's original close condition named was taken; both were
  // priced and declined in the archive entry.
  {
    id: "BL-MUTATION-SCORE-JURISDICTION-GAP-ARITHMETIC-BRANCH",
    provenance: "docs/mutation-score-jurisdiction-gap",
  },
  // feat/speclint-ac-unclaimed-arm (2026-08-27): graduates as a REPAIR, but not
  // the one the row asked for. The row's premise was refuted before any code was
  // written: it read the unclaimed pairs as "a criterion nobody scheduled", and
  // measured against this corpus ZERO were that. 28 of the flagged pairs are
  // discharged by a task outside the marker region with the plan saying so in
  // prose. The arm shipped is therefore built from the measurement rather than
  // the row's text, and the archive entry records the refutation first because a
  // reader who trusts the row's own words will misread everything after them.
  //
  // Residues stay documented limits and NOT rows, per the process mint freeze
  // and this arc's own no-new-rows constraint: the residue list itself IS the
  // limits record (spec §7 limit 8), a residue row making its plan
  // un-dispatchable through the lint gate is constraint 2 working rather than a
  // defect, and spec §4.3's own RETIRED example loses to the ratified count cut.
  { id: "BL-SPECLINT-AC-UNCLAIMED", provenance: "feat/speclint-ac-unclaimed-arm" },
  // The subscription-freshness repair. Archived with the transcript that was
  // the row's own done condition re-run against the shipped hook, and with the
  // three defects the row did not name that the arc found and fixed in branch.
  {
    id: "BL-FITWITHINCLIP-STALE-CLIP-SUBSCRIPTION",
    provenance: "fix/fitwithinclip-stale-clip-subscription",
  },
] as const;

/** The follow-up that branch filed when it descoped the bespoke origin gate. */
const ORIGIN_GATE_ID = "BL-SERVER-ACTION-ORIGIN-GATE";

// process.cwd() is the project root under vitest — the convention
// tests/cross-cutting/vitest-projects-partition.test.ts already uses.
// import.meta.url is NOT a file: URL under vitest's transform, so
// readFileSync(new URL(..., import.meta.url)) throws "The URL must be of scheme
// file" and every assertion fails for the wrong reason.
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

const idsIn = (rel: string): Set<string> => ledgerIds(read(rel), DEFERRED_OPTS);

const backlogIdsIn = (rel: string): Set<string> => ledgerIds(read(rel), BACKLOG_OPTS);

const backlogEntries = (rel: string): LedgerEntry[] => extractEntries(read(rel), BACKLOG_OPTS);

/**
 * A tracked blob at a revision, or null when the ref is not reachable in this checkout.
 *
 * `maxBuffer` is raised deliberately and is not defensive padding: `BACKLOG-archive.md` is over
 * twelve thousand lines, which exceeds Node's 1 MB default, and spawnSync then returns a NULL
 * status that is indistinguishable from "the ref does not exist". The first version of this
 * helper read that as an unreachable ref and skipped the check on a checkout where the ref was
 * perfectly reachable — a silent pass on the one arm that exists to catch a directive being
 * ignored.
 */
const gitShow = (spec: string): string | null => {
  const r = spawnSync("git", ["show", spec], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};

describe("deferral ledger graduation", () => {
  it("no id is both active and archived", () => {
    // The recurring shape: a graduation that copies the entry into the archive
    // without deleting it from the active queue, or a re-opened entry left
    // behind in the archive. Either way the ledgers disagree about what is open.
    const active = idsIn("DEFERRED.md");
    const archived = idsIn("DEFERRED-archive.md");
    const both = [...active].filter((id) => archived.has(id));
    expect(both).toEqual([]);
  });

  it("every graduated id is archive-only", () => {
    const active = idsIn("DEFERRED.md");
    const archived = idsIn("DEFERRED-archive.md");
    for (const id of GRADUATED) {
      expect(archived.has(id), `${id} missing from DEFERRED-archive.md`).toBe(true);
      expect(active.has(id), `${id} still in DEFERRED.md`).toBe(false);
    }
  });
});

describe("backlog ledger graduation", () => {
  it("no id is both active and archived", () => {
    // Same shape the DEFERRED pair guards, and the actual risk in a two-file
    // move: an entry copied into the archive without being deleted from the
    // active queue, or a re-opened entry left behind in the archive.
    const active = backlogIdsIn("BACKLOG.md");
    const archived = backlogIdsIn("BACKLOG-archive.md");
    const both = [...active].filter((id) => archived.has(id));
    expect(both).toEqual([]);
  });

  it("every graduated id is archive-only", () => {
    const active = backlogIdsIn("BACKLOG.md");
    const archived = backlogIdsIn("BACKLOG-archive.md");
    for (const { id } of BACKLOG_GRADUATED) {
      expect(archived.has(id), `${id} missing from BACKLOG-archive.md`).toBe(true);
      expect(active.has(id), `${id} still in BACKLOG.md`).toBe(false);
    }
  });

  it.each(BACKLOG_GRADUATED.map((e) => [e.id, e.provenance] as const))(
    "%s's archived section names the branch that resolved it",
    (id, provenance) => {
    // Provenance, scoped to the section rather than the whole archive: a global
    // substring match would pass on the branch name appearing anywhere in ~130
    // unrelated historical entries.
    const archive = read("BACKLOG-archive.md");
    // Anchor on the entry HEADING, not the first mention: review found
    // indexOf() landing on a summary bullet above the section, with an arbitrary
    // ±4000-character window that could source the branch name from neighbouring
    // material. The section runs from its heading to the next one.
    const heading = new RegExp(`^#{2,3} ~{0,2}${id}`, "m").exec(archive);
    expect(heading, `${id} has no heading in the archive`).not.toBeNull();
    const from = heading!.index;
    const rest = archive.slice(from);
    const nextHeading = rest.slice(1).search(/\n#{2,3} /);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
    expect(section).toContain(provenance);
    },
  );

  // Terminal-in-place exemptions (mainline #628): ids deliberately kept in
  // the open queue with a terminal marking, each carrying its rationale in
  // the entry body. Shared by the status/opening test and the heading test.
  const HEADING_TERMINAL_EXEMPT = new Set([
    // Sub-entry of the still-open "Descoped from the CI-dark coverage
    // cluster" section, kept in place deliberately — its entry records the
    // rationale ("sub-entry of a still-open parent section, not a
    // standalone item").
    "BL-CI-STALE-BRANCH-PROTECTION-COMMENT",
  ]);

  it("no active backlog entry carries a terminal status", () => {
    // The defect this reconciliation cleaned up, made structural. The
    // no-overlap invariant above cannot see it: an entry annotated CLOSED in
    // place never reaches the archive, so the two files never disagree and the
    // open queue silently turns into a changelog — exactly what BACKLOG.md's
    // header forbids.
    //
    // Scoped to the entry's OWN claims about itself — its heading suffix, its
    // opening line, and its field lines (Status/Resolution/Filed leads plus
    // bold-labeled fields anywhere on a line) — never to arbitrary body prose:
    // sections legitimately DISCUSS closure ("closes only as part of BL-…",
    // "partially closed", a quoted historical status). The lane semantics,
    // their input domains, and the word-position PARTIAL/negation veto live in
    // the walker (spec §3); entryTerminal is the ONE evaluator shared with the
    // plants test below, so removing a lane wiring breaks an executable plant.
    const offenders: string[] = [];
    for (const entry of backlogEntries("BACKLOG.md")) {
      // Mainline #628's deliberate keep: an exempted id may sit terminal in
      // place with its rationale in the entry (sub-entry of a still-open
      // parent). Same exemption set as the dedicated heading test below.
      if (HEADING_TERMINAL_EXEMPT.has(entry.id)) continue;
      if (entryTerminal(entry).length > 0) offenders.push(entry.id);
    }
    expect(offenders, "terminal-status entries belong in BACKLOG-archive.md").toEqual([]);
  });

  it("no active backlog entry heading carries a terminal status", () => {
    // 2026-07-27 reconciliation: two shipped entries sat in the open queue with
    // the terminal state in their HEADING ("— CLOSED 2026-07-26 …",
    // "— ✅ RESOLVED (…)"), which the status-line check above cannot see. Same
    // drift, different spelling, so the guard keeps a dedicated heading pass.
    // The ✅ lane is ANCHORED (spec §3, r30 form): `✅ RESOLVED` is a closure
    // claim, a decorative ✅ in an open entry's title is not — the bare
    // /✅/ predicate this replaces ordered "— align the ✅ icon" into the
    // archive.
    const offenders: string[] = [];
    for (const entry of backlogEntries("BACKLOG.md")) {
      if (HEADING_TERMINAL_EXEMPT.has(entry.id)) continue;
      if (headingVerdicts(entry.headingLine, entry.id).length > 0) offenders.push(entry.id);
    }
    expect(offenders, "terminal-heading entries belong in BACKLOG-archive.md").toEqual([]);
  });


  it("terminal matchers catch wrapped values and the ascii-hyphen heading form (r15)", () => {
    // The r21 plant corpus, re-targeted VERDICT-PRESERVING at the walker
    // (T2 of the mdast rewrite — this body referenced the deleted regex
    // lanes; the corpus EXTENSION lands in T3 as the single fixture owner).
    // Failure mode each plant pins: a closure spelled in a form an earlier
    // matcher generation missed, sitting green in the open queue.
    // Every plant runs through entryTerminal — the ONE evaluator the live
    // walk uses — so removing a lane WIRING breaks an executable plant, not
    // just a code-reading claim (r40 architecture). headingHit plants the
    // claim in the heading; entryHit plants it as the entry's body.
    const entryOf = (heading: string, body: string): LedgerEntry => {
      const [entry] = extractEntries(`${heading}\n\n${body}\n`, BACKLOG_OPTS);
      if (entry === undefined) throw new Error(`plant minted no entry: ${heading}`);
      return entry;
    };
    const headingHit = (heading: string): boolean =>
      entryTerminal(entryOf(heading, "neutral body prose.")).length > 0;
    const entryHit = (body: string): boolean =>
      entryTerminal(entryOf("## BL-PLANT — probe", body)).length > 0;
    const fieldHit = entryHit;
    const openingHit = entryHit;

    expect(headingHit("### BL-X - CLOSED")).toBe(true);
    expect(headingHit("## BL-X – RESOLVED (PR #612)")).toBe(true);
    expect(headingHit("### BL-X — **RESOLVED** (PR #612)")).toBe(true);
    // …but a terminal word as an ID SEGMENT is not a closure claim:
    expect(headingHit("### BL-CLOSED-LOOP-FIX — tighten detection")).toBe(false);
    expect(fieldHit("**Status:** **RESOLVED**")).toBe(true);
    expect(fieldHit("**Status:** _RESOLVED_")).toBe(true);
    expect(fieldHit("**Status:** `RESOLVED`")).toBe(true);
    expect(fieldHit("**Status:** ✅ **SHIPPED** in PR #610")).toBe(true);
    // narrative past a non-terminal value stays out of reach:
    expect(fieldHit("**Status:** Open — will land as RESOLVED via BL-X")).toBe(false);
    // strikethrough negates the claim (a reverted closure is an open entry) —
    // the delete subtree never reaches the claim flatten:
    expect(fieldHit("**Status:** ~~CLOSED~~ reopened 2026-07-28")).toBe(false);
    expect(fieldHit("**Filed:** `WITHDRAWN`")).toBe(true);
    expect(fieldHit("**Filed:** 2026-07-20. **Closed:** 2026-07-24.")).toBe(true);
    expect(openingHit("**_RESOLVED_** by the popover migration.")).toBe(true);
    expect(openingHit("_RESOLVED_ by the popover migration.")).toBe(true);
    expect(openingHit("Resolved only as part of BL-OTHER.")).toBe(false);
    // whole-diff r6 — a token straddling a strong edge is not a bold
    // opening claim in ANY split position:
    expect(openingHit("**Res**olved only as part of BL-OTHER.")).toBe(false);
    expect(openingHit("Re**sol**ved only as part of BL-OTHER.")).toBe(false);
    expect(openingHit("Res**olved** only as part of BL-OTHER.")).toBe(false);
    expect(openingHit("***Res***olved only as part of BL-OTHER.")).toBe(false);
    expect(openingHit("**Resolved** by the popover migration.")).toBe(true);
    // r16 — the colon rides either side of the closing emphasis:
    expect(fieldHit("**Status**: RESOLVED")).toBe(true);
    expect(fieldHit("**Filed**: CLOSED 2026-07-24")).toBe(true);
    // r16 — the PARTIAL veto is per matched word, not per line:
    expect(headingHit("### BL-PARTIAL-EDGE — CLOSED")).toBe(true);
    expect(fieldHit("**Status:** CLOSED — partial follow-up filed separately")).toBe(true);
    expect(openingHit("**CLOSED**; partial follow-up in BL-Y")).toBe(true);
    expect(fieldHit("**Status:** RESOLVED (was PARTIALLY CLOSED in June)")).toBe(true);
    // …while a genuinely PARTIAL claim stays open in every lane that can
    // reach one:
    expect(fieldHit("**Filed:** 2026-07-20. **Partially closed:** 2026-07-24.")).toBe(false);
    expect(fieldHit("**Status:** PARTIALLY CLOSED")).toBe(false);
    // r17 — per-OCCURRENCE in bold fields: a later bare claim counts even
    // when the first identical spelling is PARTIAL-modified…
    expect(fieldHit("**Filed:** x. **PARTIALLY CLOSED, then CLOSED:** y.")).toBe(true);
    // …and a heading whose partial claim precedes a second dash-anchored
    // terminal still flags:
    expect(headingHit("### BL-X — PARTIALLY CLOSED — RESOLVED (PR #9)")).toBe(true);
  });


  it("the descoped origin-gate follow-up is filed with its substance intact", () => {
    // The entry SHIPPED on fix/auth-picker-hardening (2026-08-15) and moved to
    // BACKLOG-archive.md. What this guard protects is the REASONING, not the
    // file it sits in: a closed entry that drops the residual it closed is just
    // as lossy as an open one that never carried it, and the archive is where a
    // future reader checks the closure against what was actually filed. So the
    // entry is resolved from whichever ledger holds it, and every substance
    // assertion below is unchanged and still runs against its body.
    const LEDGERS_FOR_ENTRY = ["BACKLOG.md", "BACKLOG-archive.md"] as const;
    const home = LEDGERS_FOR_ENTRY.find((rel) => backlogIdsIn(rel).has(ORIGIN_GATE_ID));
    expect(home, `${ORIGIN_GATE_ID} is in neither BACKLOG.md nor BACKLOG-archive.md`).toBeDefined();
    const backlog = read(home!);

    // A heading-only entry must fail: the whole point of filing it is to carry
    // the reasoning forward. Section body from this heading to the next.
    // Anchor on the HEADING, not the first mention: an earlier summary reference
    // would send this at another section — the same bug the provenance check above
    // already avoids.
    const headingMatch = new RegExp(`^#{2,3} ~{0,2}${ORIGIN_GATE_ID} `, "m").exec(backlog);
    expect(headingMatch, `${ORIGIN_GATE_ID} has no heading in ${home}`).not.toBeNull();
    const start = headingMatch!.index;
    const rest = backlog.slice(start);
    const nextHeading = rest.slice(1).search(/\n#{2,3} /);
    const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    expect(body.length).toBeGreaterThan(400);

    // Loose enough that a rewording passes, specific enough that padding does
    // not. Review found the previous version satisfiable by the id alone:
    // /Origin/i matches "BL-SERVER-ACTION-ORIGIN-GATE", so it asserted nothing.
    // Each pattern below therefore requires a PHRASE the entry cannot lose and
    // still carry its meaning.
    //
    // Generic keywords were not enough: review showed a 401-character entry with
    // "no Origin header", "logout", "no privilege", "trusted proxy" and "trigger"
    // passing while naming neither the action nor what a forced call actually
    // does. Each pattern below names a SUBJECT the entry cannot lose and stay
    // actionable.
    //
    // WHICH action is exposed:
    expect(body).toMatch(/clearIdentityAndSkip/);
    // that it is a Server Action, which is why the framework default is the gate:
    expect(body).toMatch(/Server Action/i);
    // the residual — a cross-site request arriving with no Origin header:
    expect(body).toMatch(/no\s+`?Origin`?\s+header|without\s+(that\s+|an?\s+)?`?Origin`?/i);
    // the blast radius, both halves: what it does...
    expect(body).toMatch(/picker[- ]?(cookie |envelope )?entry|picker entry/i);
    expect(body).toMatch(/signs?\s+the\s+victim|logout|sign(s|ed)?\s+out/i);
    // ...and what it does not:
    expect(body).toMatch(/no\s+(response\s+data|read)|no\s+privilege|no\s+escalation/i);
    // the open decision that has to come first:
    expect(body).toMatch(/trusted[- ]proxy/i);
    // and the pickup trigger, so it stays actionable:
    expect(body).toMatch(/trigger|pick this up|next\s+auth/i);
    // Three parts carry the actual reasoning and were still droppable:
    // that the framework already covers the mismatched-Origin case...
    expect(body).toMatch(/rejects?\s+a?\s*mismatched|built-in|framework/i);
    // ...that scope "local" is what bounds the impact to one device...
    expect(body).toMatch(/scope:?\s*"?local"?|one device|that device/i);
    // ...and WHY a bespoke gate is unsound, which is the whole reason it is filed.
    expect(body).toMatch(/forwarded|x-forwarded|spoof/i);
  });
});

/**
 * Plants corpus — T3 of the mdast rewrite, the single fixture owner for
 * every shape the eleven spec review rounds accumulated (spec §5). Every
 * plant runs through entryTerminal (the live walk's ONE evaluator), so a
 * deleted lane wiring breaks an executable plant. Each block names its
 * mutation family from the plan's closure set (M1–M9); a reviewer-proposed
 * NEW family is admissible only with a live escaping mutant.
 */
describe("plants corpus — walker verdicts (M1–M9)", () => {
  const entryOf = (heading: string, body: string): LedgerEntry => {
    const [entry] = extractEntries(`${heading}\n\n${body}\n`, BACKLOG_OPTS);
    if (entry === undefined) throw new Error(`plant minted no entry: ${heading}`);
    return entry;
  };
  const headingHit = (heading: string): boolean =>
    entryTerminal(entryOf(heading, "neutral body prose.")).length > 0;
  const entryHit = (body: string): boolean =>
    entryTerminal(entryOf("## BL-PLANT — probe", body)).length > 0;

  it("M1 — one discriminating plant per lane (deleting any wiring reds exactly its plant)", () => {
    // heading lane only:
    expect(headingHit("## BL-M1A — CLOSED 2026-08-01")).toBe(true);
    // opening lane only (bold, then bare ALL-CAPS):
    expect(entryHit("**CLOSED** by PR #9.")).toBe(true);
    expect(entryHit("RESOLVED by the popover migration.")).toBe(true);
    // line-leading value lane only (bare lead, no strong label, no separator
    // after the value):
    expect(entryHit("Status: CLOSED")).toBe(true);
    // mid-line field-label lane only (r2 F1 — the reordered multi-field row):
    expect(entryHit("**Class:** CI wiring · **Status:** CLOSED")).toBe(true);
    // terminal-label lane only (closure field after a non-field lead):
    expect(entryHit("**Effort:** M. **Resolved:** by PR #700.")).toBe(true);
    // bold non-label lane only (Status-led, un-labeled strong claim):
    expect(entryHit("**Status:** open — **CLOSED** later that week")).toBe(true);
    // bare-field lane only (particle chain to a colon, r39/r40):
    expect(entryHit("**Status:** open — CLOSED as of: 2026")).toBe(true);
  });

  it("M2 — every terminal word closes as a leading field value", () => {
    for (const word of [
      "CLOSED",
      "WITHDRAWN",
      "RESOLVED",
      "SUPERSEDED",
      "SHIPPED",
      "DONE",
      "OBSOLETE",
      "REFUTED",
    ]) {
      expect(entryHit(`**Status:** ${word}`), word).toBe(true);
    }
  });

  it("M3 — word-position veto: negations and qualifiers are open claims; sequenced closures still hit", () => {
    // r26 direct negations…
    expect(entryHit("**Filed:** 2026-07-01. **Not CLOSED:** still open.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **Never RESOLVED** — parked pending owner call.")).toBe(false);
    // …per-occurrence: a later bare claim counts, and CANNOT carries no bounded NOT:
    expect(entryHit("**Filed:** 2026. **Not closed at first, later CLOSED:** shipped.")).toBe(true);
    expect(entryHit("**Filed:** 2026. **CANNOT-CLOSE follow-up, RESOLVED:** shipped.")).toBe(true);
    // r27 — the veto window crosses the emphasis boundary:
    expect(entryHit("**Filed:** 2026. Not **CLOSED:** waiting.")).toBe(false);
    expect(entryHit("**Status:** open. Partially **SHIPPED** behind the flag.")).toBe(false);
    expect(entryHit("**Status:** was **NOT CLOSED** early; later **CLOSED** by PR #9.")).toBe(true);
    // r29 — multiword negations and historical qualifiers:
    expect(entryHit("**Filed:** 2026. **Not fully CLOSED:** two items remain.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **Not yet RESOLVED:** waiting on #700.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **Never completely SHIPPED:** flag still off.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **No longer CLOSED:** regression reopened it.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **Previously CLOSED:** reopened 2026-07-30.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **Reviewed, then CLOSED:** done.")).toBe(true);
    expect(entryHit("**Filed:** 2026. **was not the blocker, CLOSED:** shipped.")).toBe(true);
    expect(entryHit("Not CLOSED: still open")).toBe(false);
    expect(entryHit("**Status:** REOPENED 2026-07-30")).toBe(false);
  });

  it("M4 — dropped contexts stay silent; a flatten leak turns a plant into a hit", () => {
    // fenced code (the r30-removed countermeasure's motivating shape):
    expect(entryHit("```\n**Status:** CLOSED\n```")).toBe(false);
    // indented code:
    expect(entryHit("    **Status:** CLOSED")).toBe(false);
    // table cell:
    expect(entryHit("| Status |\n| --- |\n| CLOSED |")).toBe(false);
    // link label + autolinked URL:
    expect(entryHit("[**Status:** CLOSED](https://x.test)")).toBe(false);
    expect(entryHit("see https://x.test/CLOSED: now")).toBe(false);
    // image label:
    expect(entryHit("![CLOSED](https://x.test/i.png)")).toBe(false);
    // complete HTML comment:
    expect(entryHit("open <!-- Status: CLOSED --> entry")).toBe(false);
    // …but an UNTERMINATED comment stays prose and is caught (a strict
    // improvement over the r28-era same-line deletion, probed 2026-08-01):
    expect(entryHit("marker <!-- doc\n**Status:** CLOSED")).toBe(true);
    // block-HTML island (contents unscanned, spec §7):
    expect(entryHit("<div>\n**Status:** CLOSED\n</div>")).toBe(false);
    // inline island's prose SIBLINGS survive the tag drop (r2 F2 — a catch
    // gain; the enclosed text is scanned by the opening lane):
    expect(entryHit("<strong>CLOSED</strong> by PR #1")).toBe(true);
    // footnote prose (spec §7):
    expect(entryHit("[^h]: **Status:** CLOSED in the predecessor.")).toBe(false);
    // strikethrough negates (r15):
    expect(entryHit("**Status:** ~~CLOSED~~ reopened 2026-07-28")).toBe(false);
    // entity spellings cook and are CAUGHT (spec §7 promotion):
    expect(entryHit("**Status:** C&#76;OSED")).toBe(true);
    // lazy-continuation field value stays unscanned (line discipline, §7):
    expect(entryHit("> **Status:**\nCLOSED")).toBe(false);
    // whole-diff r5 — a multiline dropped node still ENDS its source line:
    // the next line's leading claim is caught, and a same-line bold claim
    // is not manufactured across the gap:
    expect(entryHit("prose [a\nb](https://x.test)\nStatus: CLOSED")).toBe(true);
    expect(entryHit("Status: OPEN [a\nb](https://x.test) **REFUTED** discussion")).toBe(false);
  });

  it("M5 — field-lane input domains: reordered rows caught, prose rows inert", () => {
    // P1/P2 (r41, reproduced by probe — the r40 line filters missed both):
    expect(entryHit("**Class:** CI wiring · **Status:** CLOSED")).toBe(true);
    expect(entryHit("**Effort:** M. **Resolved:** by PR #700.")).toBe(true);
    // the line-607 shape (r1 review probe): bold non-terminal labels plus
    // narrative REFUTED on a prose line — the confined scans never see it:
    expect(
      entryHit(
        "**Partial closure (2026-07-27):** shipped. **Header-aware segmentation** — details, a REFUTED: mention. **Residuals (still open):** more",
      ),
    ).toBe(false);
    // a second field closes a Status line (r39):
    expect(entryHit("**Status:** OPEN · **Closed:** 2026-07-30.")).toBe(true);
    expect(entryHit("**Status:** OPEN · Closed: 2026-07-30.")).toBe(true);
    expect(entryHit("**Filed:** 2026-07-01 · Closed - 2026-07-30.")).toBe(true);
    expect(entryHit("**Status:** OPEN — parked pending owner call.")).toBe(false);
    // bare/emphasis closure fields on field-led lines (r39):
    expect(entryHit("**Status:** open · *Closed:* 2026-07-30")).toBe(true);
    expect(entryHit("**Filed:** x · Resolved by: PR #621")).toBe(true);
    // label-noun metadata stays open in every spelling (r35/r36). The
    // plants sit BEHIND a neutral field line: as an entry's FIRST line a
    // bold terminal-led segment is the opening lane's claim in the regex
    // era too — the label rule was never the opening lane's (parity).
    expect(entryHit("**Filed:** 2026.\n\n**Shipped precedent:** PR #500 — this one remains open.")).toBe(false);
    expect(entryHit("**Filed:** 2026. **Superseded approach:** see below.")).toBe(false);
    expect(entryHit("**Filed:** 2026.\n\n**Shipped precedent**: PR #500 — this one remains open.")).toBe(false);
    expect(entryHit("**Filed:** 2026.\n\n**Shipped precedent** — PR #500, remains open.")).toBe(false);
    // preposition-chain claim labels close (r36/r38/r39):
    expect(entryHit("**Filed:** 2026. **Resolved by:** PR #621.")).toBe(true);
    expect(entryHit("**Shipped via:** PR #500.")).toBe(true);
    expect(entryHit("**Closed in:** the phase-2 sweep.")).toBe(true);
    expect(entryHit("**Filed:** 2026-07-31. **Closed after:** PR #700.")).toBe(true);
    expect(entryHit("**Superseded following:** the picker pivot.")).toBe(true);
    expect(entryHit("**Shipped without:** the optional knob.")).toBe(true);
    expect(entryHit("**Resolved for:** every adopter site.")).toBe(true);
    expect(entryHit("**Closed despite:** the flake noise.")).toBe(true);
    expect(entryHit("**Shipped alongside:** PR #700.")).toBe(true);
    expect(entryHit("**Closed notwithstanding:** the flake.")).toBe(true);
    // Resolution is the second status-valued label (r32):
    expect(entryHit("**Resolution:** Shipped per the recommended fix below.")).toBe(true);
    expect(entryHit("**Resolution:** pending owner call")).toBe(false);
    // dash separators in every width (r35), label and bare lanes (r40):
    expect(entryHit("**Status** — CLOSED")).toBe(true);
    expect(entryHit("**Resolution** – SHIPPED")).toBe(true);
    expect(entryHit("**Filed** - DONE")).toBe(true);
    expect(entryHit("**Status:** x · Closed — 2026-07-30")).toBe(true);
    expect(entryHit("**Status:** x · *Closed* – 2026")).toBe(true);
    expect(entryHit("**Status:** x · Resolved by — PR #700")).toBe(true);
  });

  it("M6 — token boundaries exclude ASCII hyphen on both sides (line-global maximality)", () => {
    // headings (P4/P5):
    expect(headingHit("## BL-M6A — RESOLVED-vs-CLOSED naming sweep")).toBe(false);
    expect(headingHit("## BL-M6B — DONE-state gallery polish")).toBe(false);
    // hyphenated ids on field lines (P6/P7 + r40 control):
    expect(entryHit("**Filed:** 2026-07-31, see BL-DRIVE-RESOLVED: details")).toBe(false);
    expect(entryHit("**Filed:** 2026, see BL-CLOSED-LOOP-FIX — details")).toBe(false);
    expect(entryHit("**Status:** see BL-CLOSED-LOOP-FIX for the shape")).toBe(false);
    // strong-edge straddling runs are ONE line-token (r5):
    expect(entryHit("re-**CLOSED**: discussion")).toBe(false);
    expect(entryHit("**CLOSED**-by: discussion")).toBe(false);
    expect(entryHit("**Status:** open, re-**CLOSED** discussion")).toBe(false);
    expect(entryHit("**Status:** open, **CLOSED**2 discussion")).toBe(false);
    expect(entryHit("**Status**2: CLOSED discussion")).toBe(false);
    // label word-splits the r40 rule false-positived on (r2 review probe):
    expect(entryHit("**re-CLOSED:** discussion")).toBe(false);
    expect(entryHit("**CLOSED2:** discussion")).toBe(false);
    expect(entryHit("**2CLOSED:** discussion")).toBe(false);
    expect(entryHit("**CLOSED-by:** discussion")).toBe(false);
    // intraword __ never renders bold and never claims (r28):
    expect(entryHit("**Filed:** 2026. Token foo__CLOSED__bar is still open.")).toBe(false);
    // whole-diff r2 — a bare hyphen is not a field separator, and a label
    // must itself be a maximal token:
    expect(entryHit("Status-CLOSED")).toBe(false);
    expect(entryHit("**Class:** x · **Status:**-CLOSED")).toBe(false);
    // …while the whitespace-delimited ASCII dash stays a separator (r35):
    expect(entryHit("Status - CLOSED")).toBe(true);
    // whole-diff r3 — one-SIDED dashes are not separators either:
    expect(entryHit("**Class:** x · **Status:**- CLOSED")).toBe(false);
    // (on a NON-field line — the one-sided dash must not mint a LABEL; a
    // Filed-led line would still hit via the r13 per-occurrence bold scan,
    // which is regex-era parity, asserted as the control below):
    expect(entryHit("**Effort:** M. **Resolved** -by later work.")).toBe(false);
    expect(entryHit("**Filed:** x. **Resolved** -by later work.")).toBe(true);
    expect(entryHit("**Filed** - DONE")).toBe(true);
    // intact controls:
    expect(entryHit("x **Closed:** 2026")).toBe(true);
    expect(headingHit("## BL-M6C — CLOSED 2026")).toBe(true);
  });

  it("M7 — container-quoted headings never open entries; container claims are the entry's own", () => {
    // a blockquote-QUOTED heading neither opens an entry nor claims for it:
    const md = "## BL-M7 — open\n\n> ## BL-QUOTED — CLOSED\n\nprose after the quote.\n";
    const entries = extractEntries(md, BACKLOG_OPTS);
    expect(entries.map((e) => e.id)).toEqual(["BL-M7"]);
    // (the quoted heading's own text is body prose — its CLOSED is a heading
    // shape, not a field/opening/heading claim of BL-M7):
    expect(entryTerminal(entries[0]!)).toEqual([]);
    // …while container-PREFIXED claims are the entry's own (r22–r24):
    expect(entryHit("- **Status:** CLOSED")).toBe(true);
    expect(entryHit("> Status: RESOLVED (PR #631)")).toBe(true);
    expect(entryHit("1. **Filed**: CLOSED 2026-07-24")).toBe(true);
    expect(entryHit("> > **CLOSED** by the merge.")).toBe(true);
    expect(entryHit("- RESOLVED by PR #631.")).toBe(true);
    expect(entryHit("- [x] **Status:** CLOSED")).toBe(true);
    expect(entryHit("1. [X] **Filed**: CLOSED 2026-07-24")).toBe(true);
    expect(entryHit("> - [x] **CLOSED** by PR #631.")).toBe(true);
    expect(entryHit("1234. [x] **Status:** CLOSED")).toBe(true);
    expect(entryHit("123456789. **Filed**: CLOSED 2026-07-24")).toBe(true);
    // the veto holds behind containers (r22/r23):
    expect(entryHit("- **Status:** PARTIALLY CLOSED")).toBe(false);
    expect(entryHit("- [ ] **Status:** PARTIALLY CLOSED")).toBe(false);
    // marker-only lines are not content — the claim BEHIND them opens (r26):
    expect(entryHit(">\n> **CLOSED** by PR #1.")).toBe(true);
    expect(entryHit("- [ ]\n- [x] **CLOSED** by PR #631.")).toBe(true);
    // __ is markdown's bold twin (r27), emphasis labels are honest (r29/r30):
    expect(entryHit("__Status:__ CLOSED")).toBe(true);
    expect(entryHit("__Filed:__ CLOSED 2026-07-24")).toBe(true);
    expect(entryHit("**Filed:** 2026. __Closed:__ 2026.")).toBe(true);
    expect(entryHit("__Resolved__ by PR #9.")).toBe(true);
    expect(entryHit("<!-- bookkeeping -->\n**CLOSED** by PR #1.")).toBe(true);
    expect(entryHit("*Status:* CLOSED")).toBe(true);
    expect(entryHit("*Status*: CLOSED")).toBe(true);
    expect(entryHit("_Status:_ RESOLVED (PR #631)")).toBe(true);
    expect(entryHit("_Status_: RESOLVED")).toBe(true);
    expect(entryHit("*Filed:* CLOSED 2026-07-24")).toBe(true);
    expect(entryHit("_Filed_: CLOSED 2026-07-24")).toBe(true);
    expect(entryHit("***Status:*** CLOSED")).toBe(true);
    expect(entryHit("___Status___: RESOLVED (PR #631)")).toBe(true);
    expect(entryHit("**_Filed_**: CLOSED 2026-07-24")).toBe(true);
    expect(entryHit("- [x] __Resolution:__ SHIPPED in PR #500")).toBe(true);
    // multiline strong nodes keep provenance on every touched line (r6):
    expect(entryHit("**preamble\nCLOSED:\ntail**")).toBe(true);
    expect(entryHit("**Status: OPEN, CLOSED discussion\ntail line\nend**")).toBe(true);
  });

  it("M9 — id-extraction source parity: formatted ids mint nothing, formatted prefixes mint", () => {
    const idsOf = (md: string, opts: ExtractOpts = BACKLOG_OPTS): string[] =>
      extractEntries(md, opts).map((e) => e.id);
    // formatted SHOUTY prose headings mint no id (r8):
    expect(idsOf("### **NOTES** — prose\n\nbody\n", DEFERRED_OPTS)).toEqual([]);
    expect(idsOf("### *NOTES* — prose\n\nbody\n", DEFERRED_OPTS)).toEqual([]);
    expect(idsOf("### \`NOTES\` — prose\n\nbody\n", DEFERRED_OPTS)).toEqual([]);
    // a formatted id behind a plain bracket prefix mints nothing (r9):
    expect(idsOf("## [P2] **BL-STRONG** — CLOSED\n\nbody\n")).toEqual([]);
    expect(idsOf("## [P2] *BL-EM* — CLOSED\n\nbody\n")).toEqual([]);
    expect(idsOf("## [P2] \`BL-CODE\` — CLOSED\n\nbody\n")).toEqual([]);
    // a FORMATTED prefix before a plain id mints, claims caught (r10):
    for (const [md, id] of [
      ["## [**P2**] BL-M9A — CLOSED\n\nbody\n", "BL-M9A"],
      ["## [*P2*] BL-M9B — CLOSED\n\nbody\n", "BL-M9B"],
      ["## [\`P2\`] BL-M9C — CLOSED\n\nbody\n", "BL-M9C"],
      ["## [~~P2~~] BL-M9D — CLOSED\n\nbody\n", "BL-M9D"],
      ["## [<b>P2</b>] BL-M9E — CLOSED\n\nbody\n", "BL-M9E"],
    ] as const) {
      const entries = extractEntries(md, BACKLOG_OPTS);
      expect(entries.map((e) => e.id), md).toEqual([id]);
      expect(entryTerminal(entries[0]!).length, md).toBeGreaterThan(0);
    }
    // plain + struck controls:
    expect(idsOf("## [P2] BL-M9F — open\n\nbody\n")).toEqual(["BL-M9F"]);
    expect(idsOf("## [P2] ~~BL-M9G~~ — open\n\nbody\n")).toEqual(["BL-M9G"]);
    // heading anchors scan strictly AFTER the id — pre-id anchors, a
    // duplicated id, and an id-substring in the prefix never claim (r3/r4):
    expect(headingHit("## [was — CLOSED once] BL-M9H — open")).toBe(false);
    expect(headingHit("## [was – CLOSED once] BL-M9I — open")).toBe(false);
    expect(headingHit("## [was - CLOSED once] BL-M9J — open")).toBe(false);
    expect(headingHit("## [✅ CLOSED prior arc] BL-M9K — open")).toBe(false);
    expect(headingHit("## [BL-M9L — CLOSED prior arc] BL-M9L — open")).toBe(false);
    expect(headingHit("## [XBL-M9MX — CLOSED prior arc] BL-M9M — open")).toBe(false);
    expect(headingHit("## [P2] BL-M9N — CLOSED 2026")).toBe(true);
    // whole-diff r1 — astral characters in the prefix must not skew the
    // provenance map (UTF-16-unit parity), and an EMPTY bracket is not a
    // prefix (legacy [^\]]+):
    expect(extractEntries("## [🚨] **B**L-X — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    {
      const es = extractEntries("## [🚨🚨🚨🚨] BL-M9S — **CLOSED**\n\nbody\n", BACKLOG_OPTS);
      expect(es.map((e) => e.id)).toEqual(["BL-M9S"]);
      expect(entryTerminal(es[0]!).length).toBeGreaterThan(0);
    }
    expect(extractEntries("## [] BL-M9T — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    // whole-diff r4 — delete is provenance-transparent over PLAIN text only;
    // any nested formatting under the tildes keeps fmt and mints nothing:
    expect(extractEntries("## ~~**BL-M9U**~~ — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## ~~*BL-M9V*~~ — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## ~~[BL-M9W](https://x.test)~~ — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## ~~<b>BL-M9X</b>~~ — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## ~~BL-**M9Y**~~ — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## ~~\`BL-M9Z\`~~ — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    // whole-diff r6/r7 — an UNPAIRED tilde run is literal text in mdast but
    // the legacy raw matcher consumed ~{0,2}; parity keeps these ids visible
    // to the no-overlap invariant, and the heading scan RELOCATES past them
    // so a bracket-prefix anchor is never the claim:
    for (const h of [
      "## ~BL-M9T2 — open",
      "## ~~BL-M9T3 — open",
      "## ~BL-M9T4~~ — open",
      "## [P2] ~BL-M9T5 — open",
    ]) {
      expect(extractEntries(`${h}\n\nbody\n`, BACKLOG_OPTS).map((e) => e.id), h).toHaveLength(1);
    }
    expect(headingHit("## [was — CLOSED once] ~BL-M9T6 — open")).toBe(false);
    expect(headingHit("## [✅ CLOSED prior] ~~BL-M9T7 — open")).toBe(false);
    expect(headingHit("## ~BL-M9T8 — CLOSED 2026")).toBe(true);
    // whole-diff r5 — zero-prose nodes occupy raw position (sentinel): a
    // dropped image/link/footnote-ref/whitespace-code at the heading start
    // never lets later plain text read as source-leading:
    expect(extractEntries("## ![x](https://y) BL-IMG — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## [](https://y) BL-EMPTY — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## \` \` BL-CODE — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## [P2] [^1] BL-FOOT — CLOSED\n\nbody\n\n[^1]: note\n", BACKLOG_OPTS)).toEqual([]);
    expect(extractEntries("## **![x](https://y)** BL-SW — CLOSED\n\nbody\n", BACKLOG_OPTS)).toEqual([]);
    // CommonMark heading surface the ^-anchored era missed (r30 gain set):
    expect(idsOf("   ## BL-INDENTED-ID — text\n\nbody\n")).toEqual(["BL-INDENTED-ID"]);
    expect(idsOf("##\tBL-TABBED-ID — text\n\nbody\n")).toEqual(["BL-TABBED-ID"]);
    expect(headingHit("   ## BL-M9O — CLOSED")).toBe(true);
    // setext heading (newly visible to every scan):
    expect(idsOf("BL-SETEXT — CLOSED\n---\n\nbody\n")).toEqual(["BL-SETEXT"]);
    expect(headingHit("BL-SETEXT — CLOSED\n---")).toBe(true);
    // anchored ✅ (r30): a claim, not a decoration:
    expect(headingHit("## BL-M9P — ✅ RESOLVED (PR #612)")).toBe(true);
    expect(headingHit("## BL-M9Q ✅ **DONE**")).toBe(true);
    expect(headingHit("## BL-M9R — align the ✅ icon")).toBe(false);
  });

  // M10 — the two spellings BL-LEDGER-GUARD-TERMINAL-CLAIM-BLIND was filed for.
  // Both were live mis-filings, not hypotheticals: BL-WIZARD-RESTAGE-FETCH-BEFORE-LOCK
  // sat in the open queue under (1) and BL-LINT-DEBT-PREEXISTING under (2), each
  // declaring its own closure in text a human reads as closed.
  //
  // The hazard in fixing them is over-reach: every negation plant in M3 that uses an
  // intensifier ("Not fully CLOSED", "Never completely SHIPPED") must STAY red, and so
  // must the nine live open entries the wider sweep found carrying a terminal word for
  // innocent reasons. Those are re-pinned at the bottom of this block.
  it("M10 — an intensifier before the terminal word, and a checkmark before an opening claim", () => {
    const entryOf = (heading: string, body: string): LedgerEntry => {
      const [entry] = extractEntries(`${heading}\n\n${body}\n`, BACKLOG_OPTS);
      if (entry === undefined) throw new Error(`plant minted no entry: ${heading}`);
      return entry;
    };
    const headingHit = (heading: string): boolean =>
      entryTerminal(entryOf(heading, "neutral body prose.")).length > 0;
    const entryHit = (body: string): boolean =>
      entryTerminal(entryOf("## BL-PLANT — probe", body)).length > 0;

    // (1) heading intensifier — the anchor consumed `— ✅ ` and then read FULLY,
    // which is not a terminal word, so the claim was invisible.
    expect(headingHit("## BL-M10A — ✅ FULLY CLOSED (both instances fixed)")).toBe(true);
    expect(headingHit("## BL-M10B — ✅ FULLY RESOLVED")).toBe(true);
    expect(headingHit("## BL-M10C — ✅ COMPLETELY DONE")).toBe(true);
    expect(headingHit("## BL-M10D — ✅ ALREADY SHIPPED")).toBe(true);
    expect(headingHit("## BL-M10E — NOW SUPERSEDED")).toBe(true);
    // an intensifier is skipped, not "any word": a non-intensifier still blocks.
    expect(headingHit("## BL-M10F — probably CLOSED")).toBe(false);

    // (1) must NOT swallow the negations — the intensifier sits behind one.
    expect(headingHit("## BL-M10G — NOT FULLY CLOSED")).toBe(false);
    expect(headingHit("## BL-M10H — PARTIALLY CLOSED")).toBe(false);
    expect(headingHit("## BL-M10I — NEVER COMPLETELY SHIPPED")).toBe(false);
    expect(headingHit("## BL-M10J — FULLY NOT CLOSED")).toBe(false);

    // (2) opening claim behind a checkmark. `**✅ RESOLVED:**` already closed via
    // the LABEL lane (trailing colon inside the strong span); adding a parenthetical
    // pushes the terminal word off the label's last token, and the opening lane then
    // refused it because a `✅` is not "nothing before the first token".
    expect(entryHit("**✅ RESOLVED (2026-06-21, `br`):** promotion prerequisite taken.")).toBe(true);
    expect(entryHit("**✅ RESOLVED (2026-06-21):** done.")).toBe(true);
    expect(entryHit("**✅ SHIPPED (2026-06-21):** done.")).toBe(true);
    expect(entryHit("**✅ CLOSED (PR #22):** done.")).toBe(true);
    expect(entryHit("**✅ DONE (2026-06-21):** done.")).toBe(true);
    expect(entryHit("✅ RESOLVED — done.")).toBe(true);
    // the pre-existing forms must not regress:
    expect(entryHit("**✅ RESOLVED:** done.")).toBe(true);
    expect(entryHit("**RESOLVED (2026-06-21):** done.")).toBe(true);

    // (2) must NOT swallow the negations either.
    expect(entryHit("**✅ NOT RESOLVED (2026-06-21):** still open.")).toBe(false);
    expect(entryHit("✅ Partially RESOLVED — one item remains.")).toBe(false);
    // a checkmark is the only allowed prefix; arbitrary prose is still not an opening claim.
    expect(entryHit("Mostly RESOLVED (2026-06-21): one item remains.")).toBe(false);

    // Regression set: the nine live open entries the 2026-08-02 sweep found carrying a
    // terminal word for innocent reasons. A tightening that closes any of these has
    // traded one blind spot for nine false closures.
    expect(entryHit("**Status:** PARTIALLY CLOSED 2026-07-26 (PR3 of the CI-dark cluster)")).toBe(false);
    expect(entryHit("Partial closure (2026-06-18, Phase 2 spec R16-HIGH): the shows_internal portion is done.")).toBe(false);
    expect(entryHit("**Status:** OPEN, raised by adversarial review of PR #517 (finding 2).")).toBe(false);
    expect(headingHit("## BL-M10K — re-run the closed-port protocol across the parallel project")).toBe(false);
    expect(headingHit('## BL-M10L — two alerts render "Mark resolved" where "Confirm" is correct')).toBe(false);
  });
});

describe("graduated entries carry no in-flight marker", () => {
  // AC-B5a. Deliberately NOT delegated to _metaLedgerInProgress.test.ts: that
  // guard scans only body lines 1-12 of an entry, and one of these two entries
  // carried its status at body line 13, so a missed transition passed both real
  // guards silently. This reads the archive directly.
  it("no archived entry is still marked IN PROGRESS", () => {
    const archive = read("BACKLOG-archive.md");
    expect(archive, "an in-flight marker survived graduation").not.toContain("IN PROGRESS");
  });

  it("each graduated entry's archived section still names the branch that resolved it", () => {
    // The marker was the section's only mention of the branch, so the transition
    // has to REPLACE it rather than delete it — deleting breaks provenance.
    const archive = read("BACKLOG-archive.md");
    for (const { id, provenance } of BACKLOG_GRADUATED) {
      // Anchor on the HEADING at either level, and terminate on the next heading
      // at either level. Terminating only on `\n## ` ran the slice straight
      // through following `### BL-*` entries, so two adjacent graduations from
      // one branch satisfied each other's provenance and a section that had lost
      // its own mention still passed (probed: removing the provenance from
      // BL-CREW-FIELD-ENRICHMENT alone left this assertion green).
      const heading = new RegExp(`^#{2,3} ~{0,2}${id}\\b`, "m").exec(archive);
      expect(heading, `${id} missing from the archive`).not.toBeNull();
      const start = heading!.index;
      const rest = archive.slice(start);
      const next = rest.slice(1).search(/\n#{2,3} /);
      const section = next === -1 ? rest : rest.slice(0, next + 1);
      expect(section, `${id}'s section does not name ${provenance}`).toContain(provenance);
    }
  });
});

// ---------------------------------------------------------------------------
// Within-file id uniqueness (BL-ARCHIVE-DUPLICATE-ENTRY-IDS, 2026-08-15).
//
// `ledgerIds()` returns a Set (_ledgerMdast.ts:426), so every cross-file lane
// in this suite is blind BY CONSTRUCTION to an id that appears twice inside one
// file. The archive had 43 such pairs — not union-merge duplicates (a pairwise
// body diff of all 43 measured a best similarity ratio of 0.12, i.e. zero
// verbatim pairs) but the archive's own resolution convention: a terminal
// record heading followed by the preserved original entry carrying a SECOND
// id-bearing heading. Both mint the same id, so every heading-extraction
// pipeline counts the entry twice.
//
// Spec: docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md
// Census transcript:
// docs/superpowers/plans/2026-08-15-archive-duplicate-ids/dup-census-2026-08-15.txt
//
// The repaired form (§2.3, the convention going forward): the terminal record
// keeps the id-bearing heading; the preserved original's heading becomes a bold
// PARAGRAPH line with identical text. A bold paragraph mints nothing — heading
// lanes see headings only, and body-defined-id minting requires a bold
// LIST-ITEM lead (_ledgerMdast.ts:360-375).
// ---------------------------------------------------------------------------

/** Every mdast heading depth. */
const ALL_DEPTHS: readonly number[] = [1, 2, 3, 4, 5, 6];

type Duplicate = { id: string; lines: number[] };

/**
 * Ids minted more than once within one ledger text.
 *
 * TWO passes, and the split is the whole design:
 *
 * - DOMAIN: the family's RATIFIED levels. This alone decides WHICH ids are
 *   judged, so a level-2 `## CI speedup …` prose heading in the null-prefix
 *   DEFERRED family (live at DEFERRED-archive.md, two of them) can never
 *   false-positive — `CI` is not a DEFERRED entry at level 3, so it is out of
 *   domain no matter how many times it appears.
 * - SCAN: EVERY depth, with the family's prefix rule. A duplicate parked at any
 *   depth collides with an in-domain id, including a one-character `####` typo
 *   — the shape that hid two live BACKLOG pairs from a levels-[2,3] scan. The
 *   wider scan adds no false-positive surface beyond what the family grammar
 *   already tolerates, because the domain pass alone bounds the judged set.
 *
 * Exported shape is a LIST, not a Set: `extractEntries` returns one row per
 * id-heading, which is exactly the visibility `ledgerIds` throws away.
 */
const duplicateIds = (text: string, familyOpts: ExtractOpts): Duplicate[] => {
  const domain = new Set(extractEntries(text, familyOpts).map((e) => e.id));
  const scan = extractEntries(text, {
    requirePrefix: familyOpts.requirePrefix,
    levels: ALL_DEPTHS,
  });
  const byId = new Map<string, number[]>();
  for (const entry of scan) {
    byId.set(entry.id, [...(byId.get(entry.id) ?? []), entry.line]);
  }
  return [...byId.entries()]
    .filter(([id, lines]) => lines.length > 1 && domain.has(id))
    .map(([id, lines]) => ({ id, lines }))
    .sort((a, b) => a.id.localeCompare(b.id));
};

/**
 * The whole lane, over a ROOT and a family registry — the live call and the
 * registry plant drive this same function.
 *
 * Parameterised deliberately (diff review R1 F2). An earlier revision inlined
 * the walk in the live `it` and handed `FUTURE_OPTS` straight to
 * `duplicateIds` in the plant. That plant proved `duplicateIds` honors the opts
 * it is given, but NOT that the live loop routes `optsFor(file)` per file — so
 * a one-line regression hardcoding `BACKLOG_OPTS` in the live walk would miss a
 * registered non-default-level family while every plant stayed green
 * (demonstrated by the reviewer against the shipped algorithm). Routing the
 * plant through `ledgerFiles` + `optsFor` puts the discovery and opts-resolution
 * wiring itself under the plant.
 *
 * ONE code path, by construction (diff review R3). The R1 repair took
 * `families?` and branched — `families ? f(root, families) : f(root)` — which
 * left the DEFAULT branch, the one production actually runs, unpinned: the
 * reviewer exhibited two mutations (dropping DEFERRED from default discovery,
 * and defaulting opts to `BACKLOG_OPTS`) that every plant survived because the
 * fixture only ever drove the explicit branch. Repaired by NARROWING rather
 * than by adding a second plant: `families` now DEFAULTS to `LEDGER_FAMILIES`
 * and both call sites take the same single path, so the divergent branch does
 * not exist to regress. `ledgerFiles(root, LEDGER_FAMILIES)` and
 * `optsFor(file, LEDGER_FAMILIES)` are exactly what the no-arg forms do
 * (`scripts/lib/ledger-fields.ts`), so behavior is unchanged — but a mutation
 * to this path now reds the live lane and the fixture plant together.
 */
const duplicatesUnder = (
  root: string,
  families: readonly LedgerFamily[] = LEDGER_FAMILIES,
): string[] => {
  const files = ledgerFiles(root, families);
  const offenders: string[] = [];
  for (const file of files) {
    const opts = optsFor(file, families);
    const text = readFileSync(join(root, file), "utf8");
    for (const { id, lines } of duplicateIds(text, opts)) {
      offenders.push(`${file}: ${id} at lines ${lines.join(", ")}`);
    }
  }
  return offenders;
};

describe("within-file ledger id uniqueness", () => {
  it("no ledger file mints the same id on more than one heading", () => {
    // Discovery through the REGISTRY (ledgerFiles + optsFor), never an
    // enumerated filename list: a family added to LEDGER_FAMILIES brings its
    // base+archive pair into this lane by default rather than going dark.
    premise(
      "ledger discovery reaches the registered families' files",
      ledgerFiles(process.cwd()).length,
      3,
    );

    const offenders = duplicatesUnder(process.cwd());
    expect(
      offenders,
      "an id is minted by more than one heading in the same ledger file — demote the " +
        "preserved original's heading to a bold line (spec §2.3, " +
        "docs/superpowers/specs/2026-08-15-archive-duplicate-ids-design.md)",
    ).toEqual([]);
  });

  it("plants: the lane fires on every duplicate shape and stays quiet on the rest", () => {
    // Executable plants through the SAME duplicateIds the live walk uses (the
    // r40 architecture): removing a lane's WIRING breaks a plant, not just a
    // code-reading claim. Unconditional execution — never inside `.each`.
    const FUTURE_OPTS: ExtractOpts = { requirePrefix: null, levels: [4] };
    const fires = (text: string, opts: ExtractOpts): string[] =>
      duplicateIds(text, opts).map((d) => d.id);

    // --- FIRE rows ---------------------------------------------------------
    // Same-level duplicate: the plain union-merge shape.
    expect(fires("## BL-X — a\n\nbody.\n\n## BL-X — b\n\nbody.\n", BACKLOG_OPTS)).toEqual(["BL-X"]);
    // Cross-level: terminal record at ##, preserved original at ###. The live
    // BACKLOG shape, 35 pairs of it.
    expect(fires("## BL-X — RESOLVED\n\nbody.\n\n### BL-X — original\n\nbody.\n", BACKLOG_OPTS)).toEqual(
      ["BL-X"],
    );
    // DEFERRED family: ## stub + ### original. Invisible to levels [3] alone,
    // which is why the SCAN pass spans depths — four live pairs.
    expect(
      fires("## DEF-STUB-1 — RESOLVED\n\nbody.\n\n### DEF-STUB-1 — original\n\nbody.\n", DEFERRED_OPTS),
    ).toEqual(["DEF-STUB-1"]);
    // A family registered at a NON-default level still fires. NOTE this row
    // only pins `duplicateIds` itself; the REGISTRY WIRING that would route
    // such a family's opts in the live walk is pinned separately by the
    // fixture-root plant below — handing FUTURE_OPTS in directly cannot see a
    // live loop that hardcodes BACKLOG_OPTS (R1 F2).
    expect(fires("#### FUT-1 — a\n\nbody.\n\n#### FUT-1 — b\n\nbody.\n", FUTURE_OPTS)).toEqual([
      "FUT-1",
    ]);
    // The one-character depth typo: `####` is outside BOTH families' ratified
    // levels, so a levels-[2,3] scan passes this silently. Without this plant a
    // revert to the narrower scan satisfies every other row here.
    expect(fires("## BL-X — RESOLVED\n\nbody.\n\n#### BL-X — original\n\nbody.\n", BACKLOG_OPTS)).toEqual(
      ["BL-X"],
    );

    // --- STAYS-QUIET rows, each with the pin it protects -------------------
    // PIN: the domain rule. Two `## CI …` prose section headings in the
    // null-prefix DEFERRED family — the LIVE shape (DEFERRED-archive.md has
    // exactly this pair). `CI` mints at level 2 only, never at the family's
    // ratified level 3, so it is out of domain. The premise makes the row
    // non-vacuous: without it, this passes even if the scan saw nothing at all.
    const ciText = "## CI speedup — phase 2\n\nbody.\n\n## CI unit-suite sharding\n\nbody.\n";
    premise(
      "the CI-prose plant reaches the scan pass (else the quiet row proves nothing)",
      extractEntries(ciText, { requirePrefix: null, levels: ALL_DEPTHS }).filter(
        (e) => e.id === "CI",
      ).length,
      1,
    );
    expect(fires(ciText, DEFERRED_OPTS)).toEqual([]);

    // PIN: the REPAIRED form. One heading plus the demoted bold paragraph line
    // carrying identical text. If a bold paragraph ever started minting an id,
    // this arc's 43 repairs would all reopen.
    const repaired = "## BL-X — RESOLVED\n\nbody.\n\n**BL-X — original**\n\nbody.\n";
    premise(
      "the repaired plant's survivor heading still mints (else the quiet row is vacuous)",
      extractEntries(repaired, { requirePrefix: "BL-", levels: ALL_DEPTHS }).length,
      0,
    );
    expect(fires(repaired, BACKLOG_OPTS)).toEqual([]);

    // PIN: distinct ids at the same level are not a collision.
    const twoIds = "## BL-X — a\n\nbody.\n\n## BL-Y — b\n\nbody.\n";
    premise(
      "the two-id plant mints both ids (else the quiet row is vacuous)",
      extractEntries(twoIds, { requirePrefix: "BL-", levels: ALL_DEPTHS }).length,
      1,
    );
    expect(fires(twoIds, BACKLOG_OPTS)).toEqual([]);
  });

  it("plant: a registered non-default-level family is covered through the real discovery path", () => {
    // The wiring plant (diff review R1 F2). Everything above hands opts to
    // `duplicateIds` directly, so none of it can observe HOW the live walk
    // obtains those opts. This row drives `duplicatesUnder` — the same function
    // the live `it` calls — against a throwaway root with a family registered
    // ONLY here, so `ledgerFiles(root, families)` must discover the pair and
    // `optsFor(file, families)` must resolve its levels for the row to pass.
    //
    // The kill this adds: hardcode `BACKLOG_OPTS` (or any fixed opts) in
    // `duplicatesUnder` and this row reds, because `FUT-1` sits at level 4 and
    // mints nothing under `{ requirePrefix: "BL-", levels: [2, 3] }`.
    //
    // `ledgerFiles`/`optsFor` take `families` as a parameter precisely so a
    // test can register a family against a fixture root without mutating
    // module state (`scripts/lib/ledger-fields.ts`), which is also what proves
    // the registry is consulted rather than a widened filename regex.
    const root = mkdtempSync(join(tmpdir(), "ledger-uniqueness-"));
    try {
      const dupe = "#### FUT-1 — terminal record\n\nbody.\n\n#### FUT-1 — original\n\nbody.\n";
      writeFileSync(join(root, "FUTURE.md"), "#### FUT-2 — solo\n\nbody.\n");
      writeFileSync(join(root, "FUTURE-archive.md"), dupe);
      const families = [
        { name: "FUTURE", opts: { requirePrefix: null, levels: [4] } },
      ] as const satisfies readonly LedgerFamily[];

      // PREMISE: discovery must actually reach BOTH fixture files, else a green
      // result below would mean "found nothing to look at", not "found nothing
      // wrong" — the exact vacuity this plant exists to rule out.
      premise(
        "the fixture root's registered family pair is discovered",
        ledgerFiles(root, families).length,
        1,
      );

      expect(duplicatesUnder(root, families)).toEqual([
        "FUTURE-archive.md: FUT-1 at lines 1, 5",
      ]);

      // Negative, same fixture: registered at the DEFERRED default level 3, the
      // level-4 headings mint nothing and the duplicate is out of domain. This
      // is what makes the positive attributable to opts ROUTING rather than to
      // discovery alone.
      const wrongLevel = [
        { name: "FUTURE", opts: { requirePrefix: null, levels: [3] } },
      ] as const satisfies readonly LedgerFamily[];
      expect(duplicatesUnder(root, wrongLevel)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * Two arms this arc owes beyond archive membership (supabase-upstream-fault-class plan §5).
 *
 * The first: an archived row's DOCUMENTED LIMITS must travel with it. A row that graduates
 * carrying only its heading loses the reason its residues were acceptable, and the next reader
 * re-derives it — or re-files it, which is what the no-new-rows directive exists to stop.
 *
 * The second: that directive itself, made checkable. It was given to an ARC rather than to the
 * repo, so nothing outlives the arc that was told it unless something asserts it. Compared
 * against `origin/main`'s TIP rather than a merge base, deliberately: `tests/docs/**` runs in the
 * parallel project, whose PR workflow checks out at depth one and fetches `origin/main` with
 * `--depth=1`, so the ancestry is grafted away and `git merge-base` cannot resolve where this
 * test actually runs. Set comparison against the tip needs no ancestry.
 */
describe("supabase-upstream-fault-class: graduation carries its limits, and mints nothing", () => {
  const ARC_IDS = [
    "BL-ADMIN-LOADER-CI-TRANSIENT",
    "BL-SUPABASE-UPSTREAM-FAULT-OBSERVABILITY",
  ] as const;

  it("each archived row carries the documented limits it graduated with", () => {
    const archive = read("BACKLOG-archive.md");
    for (const id of ARC_IDS) {
      const start = archive.indexOf(`## ${id}`);
      expect(start, `${id} must have a heading in the archive`).toBeGreaterThan(-1);
      const next = archive.indexOf("\n## ", start + 1);
      const body = next === -1 ? archive.slice(start) : archive.slice(start, next);
      // Keyed on the anchors rather than on prose, so a rewording does not red this and a
      // DELETION does. Both limits sections are what the arc promised to carry over.
      expect(body, `${id} must carry its documented limits`).toMatch(
        /documented limit|Documented limit/,
      );
      expect(body, `${id} must name its re-file trigger`).toMatch(/[Rr]e-file trigger/);
    }
  });

  it("introduces no new BL-/DEF- id anywhere, against origin/main's tip", () => {
    // The positive control lives HERE rather than in a transcript, because this branch
    // genuinely mints nothing: an implementation that always returned the empty set would pass
    // on the live comparison alone and keep passing forever.
    const novel = (base: string, head: string): string[] => {
      const b = ledgerIds(base, BACKLOG_OPTS);
      return [...ledgerIds(head, BACKLOG_OPTS)].filter((id) => !b.has(id));
    };
    expect(
      novel("## BL-ALPHA — a\n\nbody\n", "## BL-ALPHA — a\n\nbody\n\n## BL-BETA — b\n\nbody\n"),
      "the check must SEE a novel BL- id",
    ).toEqual(["BL-BETA"]);
    expect(
      novel("## BL-ALPHA — a\n\nbody\n", "## BL-ALPHA — a\n\nreworded body\n"),
      "and must not invent one from an edit",
    ).toEqual([]);

    // ALL FOUR ledgers, not just the BACKLOG pair. Round 3 probed the gap: the check called
    // itself "no new BL-/DEF- row ANYWHERE" and read only BACKLOG.md and BACKLOG-archive.md with
    // BACKLOG_OPTS, so a new row in DEFERRED.md or DEFERRED-archive.md was unguarded. The arc
    // does not mint one, which is precisely why the false claim would have survived: nothing it
    // failed to cover was ever exercised.
    const LEDGERS: ReadonlyArray<readonly [string, ExtractOpts]> = [
      ["BACKLOG.md", BACKLOG_OPTS],
      ["BACKLOG-archive.md", BACKLOG_OPTS],
      ["DEFERRED.md", DEFERRED_OPTS],
      ["DEFERRED-archive.md", DEFERRED_OPTS],
    ];
    const baseTexts = LEDGERS.map(([rel]) => gitShow(`origin/main:${rel}`));
    if (baseTexts.some((t) => t === null)) {
      // A checkout that cannot read origin/main at all is a fetch-shape problem rather than a
      // verdict, and saying so beats a green that means nothing. But a PARTIAL failure — one
      // blob readable and the other not — is never a fetch shape; it is this helper being
      // wrong, which is exactly what happened the first time (maxBuffer). Fail loudly on it.
      expect(
        baseTexts.map((t) => t === null),
        "origin/main must be either fully readable or fully unreachable",
      ).toEqual(LEDGERS.map(() => true));
      return;
    }
    // SCOPE (owner decision 2026-08-27): the directive was given to the graduating ARC, not to
    // the repo. Once both ARC_IDS are archived on origin/main that arc has merged and there is
    // no branch left for "this arc mints nothing" to bind; read repo-wide it reds EVERY later
    // filing, including the ones AGENTS.md's freeze admits (`invariant`, `product-blocked`),
    // which is what happened to the first owner-directed filing after it landed
    // (`docs/ledger-lim-mechanization-rows`; measured: zero ids reached main between the guard's
    // merge in #899 and that branch, so nothing was silently lost). The live comparison therefore
    // runs only while the graduation is still in flight; afterwards the arm asserts the state it
    // was written to reach and stops. The positive control above keeps the comparison honest.
    const archiveOnMain = baseTexts[1] as string;
    const graduatedOnMain = ARC_IDS.every((id) => archiveOnMain.includes(`## ${id}`));
    if (graduatedOnMain) {
      expect(ARC_IDS.map((id) => archiveOnMain.includes(`## ${id}`))).toEqual(
        ARC_IDS.map(() => true),
      );
      return;
    }
    const before = new Set(
      LEDGERS.flatMap(([, opts], i) => [...ledgerIds(baseTexts[i] as string, opts)]),
    );
    const after = new Set(LEDGERS.flatMap(([rel, opts]) => [...ledgerIds(read(rel), opts)]));
    expect(
      [...after].filter((id) => !before.has(id)),
      "this arc files NO new BL-/DEF- row of any facing",
    ).toEqual([]);
  });
});
