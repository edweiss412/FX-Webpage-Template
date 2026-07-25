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
const DEFERRAL_ID = /^### ~{0,2}([A-Z0-9][A-Z0-9/-]*)~{0,2}/gm;
const BACKLOG_ID = /^#{2,3} ~{0,2}(BL-[A-Z0-9/-]+)~{0,2}/gm;

/**
 * Deferrals graduated to the archive since this guard shipped. NOT a mirror of
 * the ~130 historical archive entries: those predate the guard and are covered
 * only by the no-overlap invariant below, not by per-id presence.
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
 */
const BACKLOG_GRADUATED = [
  // fix/picker-flow-app-bugs (2026-07-25). The three app-behavior blockers
  // behind the skipped picker-flow e2e stubs, all fixed in that branch.
  "BL-PICKER-BOOTSTRAP-HOST-FLIP",
  "BL-PICKER-GATE-SKIP-MISMATCH",
  "BL-PICKER-CLAIMED-ROW-NEXT-DROP",
] as const;

/** The follow-up that branch filed when it descoped the bespoke origin gate. */
const ORIGIN_GATE_ID = "BL-SERVER-ACTION-ORIGIN-GATE";

// process.cwd() is the project root under vitest — the convention
// tests/cross-cutting/vitest-projects-partition.test.ts already uses.
// import.meta.url is NOT a file: URL under vitest's transform, so
// readFileSync(new URL(..., import.meta.url)) throws "The URL must be of scheme
// file" and every assertion fails for the wrong reason.
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

const idsIn = (rel: string): Set<string> =>
  new Set(Array.from(read(rel).matchAll(DEFERRAL_ID), (m) => m[1]!));

const backlogIdsIn = (rel: string): Set<string> =>
  new Set(Array.from(read(rel).matchAll(BACKLOG_ID), (m) => m[1]!));

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
    for (const id of BACKLOG_GRADUATED) {
      expect(archived.has(id), `${id} missing from BACKLOG-archive.md`).toBe(true);
      expect(active.has(id), `${id} still in BACKLOG.md`).toBe(false);
    }
  });

  it("the archived picker-flow section names the branch that resolved it", () => {
    // Provenance, scoped to the section rather than the whole archive: a global
    // substring match would pass on the branch name appearing anywhere in ~130
    // unrelated historical entries.
    const archive = read("BACKLOG-archive.md");
    // Anchor on the entry HEADING, not the first mention: review found
    // indexOf() landing on a summary bullet above the section, with an arbitrary
    // ±4000-character window that could source the branch name from neighbouring
    // material. The section runs from its heading to the next one.
    const heading = new RegExp(`^#{2,3} ~{0,2}${BACKLOG_GRADUATED[0]}`, "m").exec(archive);
    expect(heading, `${BACKLOG_GRADUATED[0]} has no heading in the archive`).not.toBeNull();
    const from = heading!.index;
    const rest = archive.slice(from);
    const nextHeading = rest.slice(1).search(/\n#{2,3} /);
    const section = nextHeading === -1 ? rest : rest.slice(0, nextHeading + 1);
    expect(section).toContain("fix/picker-flow-app-bugs");
  });

  it("the descoped origin-gate follow-up is filed with its substance intact", () => {
    const backlog = read("BACKLOG.md");
    expect(backlogIdsIn("BACKLOG.md").has(ORIGIN_GATE_ID)).toBe(true);

    // A heading-only entry must fail: the whole point of filing it is to carry
    // the reasoning forward. Section body from this heading to the next.
    const start = backlog.indexOf(ORIGIN_GATE_ID);
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
  });
});
