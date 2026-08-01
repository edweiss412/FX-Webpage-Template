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
// there behind one entry evaluator, so code blocks, inline code, HTML
// comments, links, and tables fall out of the tree instead of being chased
// per-spelling. The walker file's header carries the ratified-scope text
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
// Filed as BL-INVARIANT8-CLOSEOUT-ENFORCEMENT in BACKLOG.md with the
// measurements. What remains here is enforceable and true.
//
// Spec: docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md §9 T8.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

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
    const backlog = read("BACKLOG.md");
    expect(backlogIdsIn("BACKLOG.md").has(ORIGIN_GATE_ID)).toBe(true);

    // A heading-only entry must fail: the whole point of filing it is to carry
    // the reasoning forward. Section body from this heading to the next.
    // Anchor on the HEADING, not the first mention: an earlier summary reference
    // would send this at another section — the same bug the provenance check above
    // already avoids.
    const headingMatch = new RegExp(`^#{2,3} ~{0,2}${ORIGIN_GATE_ID}`, "m").exec(backlog);
    expect(headingMatch, `${ORIGIN_GATE_ID} has no heading in BACKLOG.md`).not.toBeNull();
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
