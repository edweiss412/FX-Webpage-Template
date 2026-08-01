// Structural guard over the deferral ledgers.
//
// Shipped as the class defense for a vector that recurred across two adversarial
// rounds of the 2026-07-24 dev-row copy close-out: a ledger/docs task with no
// genuine red state, only post-hoc checks that were already green. Rather than
// patch the prose a third time, the graduation itself became a test.
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

/**
 * Entry-heading matchers, ONE PER LEDGER — deliberately not a single widened
 * regex.
 *
 * DEFERRED entries are level 3 (`### SOME-ID — text`). BACKLOG entries are
 * `BL-`-prefixed and appear at BOTH levels (`## BL-…` in the active queue,
 * `###` for some archived ones). Widening the DEFERRED regex to `##|###` would
 * misclassify prose section headings as ids — `## CREWWARN instance
 * discriminator`, `## CI speedup — …`, `## CI unit-suite sharding`,
 * `## BLOCKRES — BlockedRowResolver`, `## INFO-tab data-fidelity audit`. Note
 * that requiring a following em-dash does not filter those: `## BLOCKRES — …`
 * has that shape too. The `BL-` prefix is what makes the backlog matcher
 * ledger-specific.
 */
// Optional `~~strikethrough~~` around the id, and `/` inside it: review found
// `### ~~MODAL-CLOSE-EXIT-ANIM-1~~` skipped entirely and `### FLOW4-2/3-POLISH`
// truncated to `FLOW4-2`, which collides with the distinct real `FLOW4-2` entry —
// so a reopened struck-through id could slip past the no-overlap invariant and two
// different entries could be conflated.
// Ids are SHOUTY tokens, optionally struck through, optionally behind a bracketed
// priority prefix (`### [P2] SOME-ID — …`).
//
// Length is NOT the discriminator. A 3-character floor looked like a clean way to
// skip the four prose headings (`### [P2] Bulk ignore produced two polite
// announcements …`), but review found it also excluded nine genuine ids — `D1`
// through `D9` — so reopening one of those would have gone unnoticed by the
// no-overlap invariant. What actually separates an id from prose is what FOLLOWS
// it: a real entry heading is `ID — text` or `ID -` or ends there, while prose
// continues in lower case ("Bulk ignore …" would yield "B" followed by "ulk").
// So the token must be followed by a dash, an em dash, a bracket, or end of line.
// Ids are SHOUTY. The token is captured INCLUDING any lowercase, then rejected in
// code if it contains lowercase — no lookahead, so there is nothing to backtrack.
//
// Two previous attempts both failed for the same reason. A terminator list made `-`
// both an id character and a terminator, so `### SHAREHUB-FIDELITY "…"` backtracked
// to `SHAREHUB`. Replacing it with a negative lookahead moved the problem rather
// than fixing it: `### BL-something` still backtracked to `BL`, and `### ABC/def` to
// `ABC`, because giving back the `-` or `/` satisfies the lookahead. Capturing
// greedily over a class that INCLUDES lowercase removes the escape route — the
// match cannot end early at a boundary character, so the whole word is judged.
/**
 * The archive-bound terminal states, ONE union for every matcher in this file
 * (r13 added OBSOLETE + REFUTED; r14 hoisted it to module scope after the
 * dedicated heading test was found repeating the literal — the exact
 * per-matcher drift the union exists to prevent).
 */
const TERMINAL_WORDS = "CLOSED|WITHDRAWN|RESOLVED|SUPERSEDED|SHIPPED|DONE|OBSOLETE|REFUTED";

const HAS_LOWERCASE = /[a-z]/;

/**
 * Markdown emphasis a terminal value may be wrapped in (r15 — review found
 * `**Status:** **RESOLVED**`, `_RESOLVED_`, and a backticked value all green
 * because every matcher required the terminal word IMMEDIATELY after its
 * anchor). Strikethrough is deliberately NOT here: `~~CLOSED~~` negates the
 * claim — a reverted closure is an OPEN entry, and flagging it would order
 * that entry into the archive.
 */
const WRAP = "(?:[*_`]|✅|\\s)*";

/*
 * One definition per matcher, module-scoped (r14 hoisted TERMINAL_WORDS after
 * per-matcher drift; r15 hoists the matchers themselves — the status test and
 * the dedicated heading test carried separately-spelled copies of the heading
 * regex — and exercises them directly in the spelling-plants test below).
 *
 * STATUS_TERMINAL / FILED_TERMINAL: the terminal word is the line's own
 * VALUE — anchored to the prefix (a mid-line /i match fires on narrative:
 * "NARROWED — NOT closed", both live false positives when unanchored was
 * tried, r5/r6), optionally ✅-ed and emphasis-wrapped (r15). Case-insensitive
 * (r6: `**Status:** Shipped` is the same claim in titlecase). The wrapper
 * class cannot cross a letter, so narrative past a non-terminal value stays
 * out of reach.
 *
 * FILED_FIELD_TERMINAL (r13): the closure can arrive as a second bold FIELD
 * later on the Filed line (`**Filed:** … **Closed:** …`); a bold segment
 * containing a terminal word anywhere on that line counts.
 *
 * HEADING_TERMINAL: closure spelled as a heading suffix. Em dash, en dash, or
 * the documented ASCII form (r15 — shoutyIds' own doc names `ID - text` an
 * entry-heading shape, so `### BL-X - CLOSED` must not need the em dash; the
 * ASCII hyphen requires preceding whitespace so a terminal word INSIDE an id,
 * `BL-CLOSED-LOOP-FIX`, is not a closure claim).
 *
 * OPENING_TERMINAL_BOLD / _BARE (whole-diff r3; r6 casing split): a bold
 * opening claim matches any case; a bare one ALL-CAPS only, so narrating
 * prose ("Resolved only as part of BL-…") cannot false-positive. Both accept
 * the r15 wrappers.
 */
// NOT `\b` after the word: a closing `_RESOLVED_` wrapper is a word char, so
// `\b` sees no boundary there — exactly the spelling r15 is closing. Letters
// and digits are what would make it a different word.
const AFTER = "(?![A-Za-z0-9])";
// Both bold conventions carry the colon differently — `**Status:** X` and
// `**Status**: X` are the same field label (r16), so the colon is accepted on
// either side of the closing emphasis.
const STATUS_TERMINAL = new RegExp(
  `^\\s*(?:\\*\\*)?Status(?:\\*\\*)?\\s*:?${WRAP}(${TERMINAL_WORDS})${AFTER}`,
  "i",
);
const FILED_TERMINAL = new RegExp(
  `^\\s*(?:\\*\\*)?Filed(?:\\*\\*)?\\s*:?${WRAP}(${TERMINAL_WORDS})${AFTER}`,
  "i",
);
// The bold-FIELD Filed lane (r13's `**Filed:** … **Closed:** …` shape) lives
// in boldFieldTerminalHit below — per-occurrence since r17.
const HEADING_TERMINAL = new RegExp(`(?:[—–]|(?<=\\s)-)${WRAP}(${TERMINAL_WORDS})${AFTER}`, "i");
const OPENING_TERMINAL_BOLD = new RegExp(`^\\s*\\*\\*${WRAP}(${TERMINAL_WORDS})${AFTER}`, "i");
const OPENING_TERMINAL_BARE = new RegExp(`^\\s*${WRAP}(${TERMINAL_WORDS})${AFTER}`);

/**
 * A terminal claim counts only when the CAPTURED word is not directly
 * modified by a preceding PARTIAL/PARTIALLY (r16 — the previous line-wide
 * /PARTIAL/i veto suppressed unrelated terminal claims: an id containing
 * PARTIAL in `### BL-PARTIAL-EDGE — CLOSED`, a trailing "partial follow-up"
 * clause after a bare CLOSED). Returns null when the matcher finds no claim
 * at all, false when the claim stands (a hit), true when it is
 * PARTIAL-modified (an open state). Word-position, not line-wide: `RESOLVED
 * (was PARTIALLY CLOSED)` is still a hit on RESOLVED.
 */
const PARTIAL_BEFORE = /PARTIAL(?:LY)?[\s*_`:—–-]*$/i;

function partialModified(line: string, matcher: RegExp): boolean | null {
  const m = matcher.exec(line);
  if (m === null) return null;
  const wordAt = m.index + m[0].indexOf(m[1]!);
  return PARTIAL_BEFORE.test(line.slice(0, wordAt));
}

const terminalHit = (line: string, matcher: RegExp): boolean =>
  partialModified(line, matcher) === false;

/**
 * Every terminal word inside every bold segment of a Filed line, each with
 * the per-word PARTIAL veto (r17 — a single exec associated the capture with
 * the FIRST identical spelling, so `**PARTIALLY CLOSED, then CLOSED**` read
 * as wholly partial; iterating occurrences lets a later bare claim count).
 */
function boldFieldTerminalHit(line: string): boolean {
  for (const seg of line.match(/\*\*[^*\n]+\*\*/g) ?? []) {
    const word = new RegExp(`(?<![A-Za-z0-9])(${TERMINAL_WORDS})(?![A-Za-z0-9])`, "gi");
    for (let m = word.exec(seg); m !== null; m = word.exec(seg)) {
      if (!PARTIAL_BEFORE.test(seg.slice(0, m.index))) return true;
    }
  }
  return false;
}

/**
 * Ids from one ledger: SHOUTY tokens only, so prose headings yield nothing.
 *
 * Heading level differs by ledger and is not incidental. DEFERRED entries are
 * level 3, and its level-2 headings are prose sections, so widening there would
 * pull in section titles. BACKLOG entries appear at BOTH levels (`## BL-…` in the
 * active queue, `###` for some archived ones), and its `BL-` prefix requirement is
 * what keeps prose out.
 */
function shoutyIds(text: string, requirePrefix: string | null): Set<string> {
  const level = requirePrefix === null ? "###" : "#{2,3}";
  const re = new RegExp(
    `^${level} (?:\\[[^\\]]+\\]\\s*)?~{0,2}([A-Za-z0-9][A-Za-z0-9/-]*)~{0,2}`,
    "gm",
  );
  const out = new Set<string>();
  for (const m of text.matchAll(re)) {
    const token = m[1]!;
    if (HAS_LOWERCASE.test(token)) continue;
    if (requirePrefix !== null && !token.startsWith(requirePrefix)) continue;
    out.add(token);
  }
  return out;
}


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

const idsIn = (rel: string): Set<string> => shoutyIds(read(rel), null);

const backlogIdsIn = (rel: string): Set<string> => shoutyIds(read(rel), "BL-");

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
    // Scoped to the STATUS line, not the whole section. Sections legitimately
    // discuss closure ("closes only as part of BL-…", "partially closed",
    // "SUPERSEDED 2026-07-25 by …", a quoted historical status), so a
    // section-wide substring match fires on entries that are genuinely open.
    // The status line is the entry's own claim about itself.
    const backlog = read("BACKLOG.md");
    // SUPERSEDED and SHIPPED are terminal too — BACKLOG.md's header names
    // "Resolved / shipped / superseded" as the archive-bound states (r5;
    // mainline #628 added SHIPPED independently the same day — BL-AGENDA-
    // PERDAY-VIEWER-FILTER sat as "**Status:** ✅ SHIPPED in PR #610").
    // One union for every matcher (r13 — the lists had drifted per-matcher,
    // and two states this very file documents as graduations were missing
    // from all of them: OBSOLETE and REFUTED). Whole-diff r3: scanning ONLY
    // the Status line let two other spellings of the same claim through — a
    // heading suffix and a bold opening claim; both are still the entry's own
    // claim about itself. Deeper body lines stay out of scope (entries
    // legitimately DISCUSS closure). Matcher definitions and their rationale
    // live at module scope with TERMINAL_WORDS (r15).
    const offenders: string[] = [];
    // r6: priority-prefixed headings (`### [P1] BL-X — …`) are entries too —
    // same optional bracket the shoutyIds matcher already accepts.
    const headings = [...backlog.matchAll(/^#{2,3} (?:\[[^\]]+\]\s*)?~{0,2}(BL-[A-Z0-9/-]+)/gm)];
    for (const [i, h] of headings.entries()) {
      const start = h.index!;
      const end = i + 1 < headings.length ? headings[i + 1]!.index! : backlog.length;
      const section = backlog.slice(start, end);
      const lines = section.split("\n");
      const headingLine = lines[0] ?? "";
      const openingLine = lines.slice(1).find((l) => l.trim() !== "") ?? "";
      // PARTIALLY CLOSED is a real open state — but the veto is per matched
      // WORD (partialModified, r16), not per line: a trailing "partial
      // follow-up" clause no longer shields a bare terminal claim.
      // Mainline #628's deliberate keep: an exempted id may sit terminal in
      // place with its rationale in the entry (sub-entry of a still-open
      // parent). Same exemption set as the dedicated heading test below.
      if (HEADING_TERMINAL_EXEMPT.has(h[1]!)) continue;
      // ALL status/filed lines, not the first (r17 — an appended second
      // `Status: SHIPPED` after a stale `Status: OPEN` was never inspected).
      const statusLines = lines.filter((l) => /^\s*(?:\*\*)?Status/i.test(l));
      const filedLines = lines.filter((l) => /^\s*(?:\*\*)?Filed/i.test(l));
      const statusHit = statusLines.some((l) => terminalHit(l, STATUS_TERMINAL));
      const filedHit = filedLines.some(
        (l) => terminalHit(l, FILED_TERMINAL) || boldFieldTerminalHit(l),
      );
      const headingHit = terminalHit(headingLine, HEADING_TERMINAL);
      const openingHit =
        terminalHit(openingLine, OPENING_TERMINAL_BOLD) ||
        terminalHit(openingLine, OPENING_TERMINAL_BARE);
      if (statusHit || filedHit || headingHit || openingHit) offenders.push(h[1]!);
    }
    expect(offenders, "terminal-status entries belong in BACKLOG-archive.md").toEqual([]);
  });

  it("no active backlog entry heading carries a terminal status", () => {
    // 2026-07-27 reconciliation: two shipped entries sat in the open queue with
    // the terminal state in their HEADING ("— CLOSED 2026-07-26 …",
    // "— ✅ RESOLVED (…)"), which the status-line check above cannot see. Same
    // drift, different spelling, so the guard grows a heading pass.
    const backlog = read("BACKLOG.md");
    const offenders: string[] = [];
    // Priority-prefixed headings (`### [P1] BL-X — …`) are entries too (r15 —
    // the status test's discovery gained the bracket group at r6; this walk
    // never did, so a prefixed heading was invisible HERE specifically).
    for (const h of backlog.matchAll(/^#{2,3} (?:\[[^\]]+\]\s*)?~{0,2}(BL-[A-Z0-9/-]+)[^\n]*/gm)) {
      const id = h[1]!;
      if (HEADING_TERMINAL_EXEMPT.has(id)) continue;
      const heading = h[0]!;
      // Union of both 2026-07-27 passes: the dash-anchored any-case form
      // (module-scoped, shared with the status-line test — r15; per-word
      // PARTIAL veto since r16) plus a bare ✅ anywhere in the heading.
      if (terminalHit(heading, HEADING_TERMINAL) || /✅/.test(heading)) offenders.push(id);
    }
    expect(offenders, "terminal-heading entries belong in BACKLOG-archive.md").toEqual([]);
  });

  it("terminal matchers catch wrapped values and the ascii-hyphen heading form (r15)", () => {
    // Failure mode each plant pins: a closure spelled in a form the r14
    // matchers required an em dash or an unwrapped adjacent word for, sitting
    // green in the open queue.
    expect(HEADING_TERMINAL.test("### BL-X - CLOSED")).toBe(true);
    expect(HEADING_TERMINAL.test("## BL-X – RESOLVED (PR #612)")).toBe(true);
    expect(HEADING_TERMINAL.test("### BL-X — **RESOLVED** (PR #612)")).toBe(true);
    // …but a terminal word as an ID SEGMENT is not a closure claim:
    expect(HEADING_TERMINAL.test("### BL-CLOSED-LOOP-FIX — tighten detection")).toBe(false);
    expect(STATUS_TERMINAL.test("**Status:** **RESOLVED**")).toBe(true);
    expect(STATUS_TERMINAL.test("**Status:** _RESOLVED_")).toBe(true);
    expect(STATUS_TERMINAL.test("**Status:** `RESOLVED`")).toBe(true);
    expect(STATUS_TERMINAL.test("**Status:** ✅ **SHIPPED** in PR #610")).toBe(true);
    // narrative past a non-terminal value stays out of reach — the wrapper
    // class cannot cross a letter:
    expect(STATUS_TERMINAL.test("**Status:** Open — will land as RESOLVED via BL-X")).toBe(false);
    // strikethrough negates the claim (a reverted closure is an open entry):
    expect(STATUS_TERMINAL.test("**Status:** ~~CLOSED~~ reopened 2026-07-28")).toBe(false);
    expect(FILED_TERMINAL.test("**Filed:** `WITHDRAWN`")).toBe(true);
    expect(boldFieldTerminalHit("**Filed:** 2026-07-20. **Closed:** 2026-07-24.")).toBe(true);
    expect(OPENING_TERMINAL_BOLD.test("**_RESOLVED_** by the popover migration.")).toBe(true);
    expect(OPENING_TERMINAL_BARE.test("_RESOLVED_ by the popover migration.")).toBe(true);
    expect(OPENING_TERMINAL_BARE.test("Resolved only as part of BL-OTHER.")).toBe(false);
    // r16 — the colon rides either side of the closing emphasis:
    expect(STATUS_TERMINAL.test("**Status**: RESOLVED")).toBe(true);
    expect(FILED_TERMINAL.test("**Filed**: CLOSED 2026-07-24")).toBe(true);
    // r16 — the PARTIAL veto is per matched word, not per line:
    expect(terminalHit("### BL-PARTIAL-EDGE — CLOSED", HEADING_TERMINAL)).toBe(true);
    expect(terminalHit("**Status:** CLOSED — partial follow-up filed separately", STATUS_TERMINAL)).toBe(
      true,
    );
    expect(terminalHit("**CLOSED**; partial follow-up in BL-Y", OPENING_TERMINAL_BOLD)).toBe(true);
    expect(
      terminalHit("**Status:** RESOLVED (was PARTIALLY CLOSED in June)", STATUS_TERMINAL),
    ).toBe(true);
    // …while a genuinely PARTIAL claim stays open in every lane that can
    // reach one:
    expect(boldFieldTerminalHit("**Filed:** 2026-07-20. **Partially closed:** 2026-07-24.")).toBe(
      false,
    );
    expect(terminalHit("**Status:** PARTIALLY CLOSED", STATUS_TERMINAL)).toBe(false);
    // r17 — per-OCCURRENCE in bold fields: a later bare claim counts even
    // when the first identical spelling is PARTIAL-modified…
    expect(boldFieldTerminalHit("**Filed:** x. **PARTIALLY CLOSED, then CLOSED:** y.")).toBe(true);
    // …and a heading whose partial claim precedes a second dash-anchored
    // terminal still flags (exec matches at the first POSITION that fits,
    // not the first dash):
    expect(terminalHit("### BL-X — PARTIALLY CLOSED — RESOLVED (PR #9)", HEADING_TERMINAL)).toBe(
      true,
    );
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
