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
const HAS_LOWERCASE = /[a-z]/;

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
  // fix/picker-flow-app-bugs (2026-07-25). The three app-behavior blockers
  // behind the skipped picker-flow e2e stubs, all fixed in that branch.
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
    const TERMINAL = /^\s*(?:\*\*)?(?:Status|Filed):?(?:\*\*)?[^\n]*?\b(CLOSED|WITHDRAWN|RESOLVED)\b/;
    const offenders: string[] = [];
    const headings = [...backlog.matchAll(/^#{2,3} ~{0,2}(BL-[A-Z0-9/-]+)/gm)];
    for (const [i, h] of headings.entries()) {
      const start = h.index!;
      const end = i + 1 < headings.length ? headings[i + 1]!.index! : backlog.length;
      const section = backlog.slice(start, end);
      // PARTIALLY CLOSED / PARTIAL closure is a real open state — the entry
      // records what shipped and what did not. Only a bare terminal counts.
      const statusLine = section.split("\n").find((l) => /^\s*(?:\*\*)?Status/.test(l)) ?? "";
      if (/PARTIAL/i.test(statusLine)) continue;
      if (TERMINAL.test(statusLine)) offenders.push(h[1]!);
    }
    expect(offenders, "terminal-status entries belong in BACKLOG-archive.md").toEqual([]);
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
