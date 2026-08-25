import { describe, expect, it } from "vitest";

import { acCommandPlan, checkAcCoverage } from "../../lib/specLint/acCoverage";
import { premiseHolds } from "../_shared/premise";
import { viewOf } from "./acCoverageView";

/**
 * The AC coverage table of `feat/pane-compaction-send-auth`'s plan, at each of the
 * four blobs its review rounds examined, checked in as LITERAL text.
 *
 * Hermetic on purpose: reading them from git would make the suite a claim about
 * the repository's history rather than about the arm, and a history rewrite would
 * void it. The extraction command is in the spec's §1.2 for anyone re-deriving.
 */
const BLOBS = {
  _173bfccfe: `| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (re-targeted revalidate pins) | \`pnpm vitest run tests/paneCompaction/revalidate.test.ts\` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red record + Task 4 kill records | task commits carry the outputs |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | both red commands above |
| AC-6 (dry-run byte-exact, both address forms) | Task 2 (adapted hex-compare) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-7 (no \`\\x1b\`, both paths) | Task 2 (verbatim class; driver pins untouched) | \`pnpm vitest run tests/paneCompaction/driver.test.ts\` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | \`pnpm vitest run tests/paneCompaction/revalidate.test.ts\` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-11 (pass marker relocated; scan green) | Task 2 | \`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts\` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | \`pnpm heavy\` mutation run, backgrounded |
| AC-13 (docs no longer claim the fence) | Task 5 | \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + existing prose pin | adapter suite + meta-test |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 5 (prose pins) | both red commands |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | \`pnpm vitest run tests/paneCompaction/mintFault.test.ts\` |`,
  _b1db667e0: `| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (adapter-level instrumented-marker case; revalidate pins cover the core half) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts\` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red record + Task 4 kill records | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/authorization.test.ts\` — once as Task 2's recorded red against the fenced tree, once per weakened build under Task 4's template (non-zero exit + failure line naming the pin) |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | both red commands above |
| AC-6 (dry-run byte-exact: compact verbatim \`/compact\\r\`; checkpoint and resume in BOTH address forms) | Task 2 | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-7 (no \`\\x1b\`, both paths) | Task 2 (adapter-level live-send spy through main(); driver core pins updated in Task 1) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts\` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | \`pnpm vitest run tests/paneCompaction/revalidate.test.ts\` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows; fence-string-absence and no-flag source pin) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-11 (pass marker relocated; scan green) | Task 2 | \`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts\` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | \`pnpm heavy pnpm mutation:guards\`, backgrounded (bare \`pnpm heavy\` exits 2 — no child command; r2 F4) |
| AC-13 (docs no longer claim the fence) | Task 5 | \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + existing prose pin | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 2 (adapter live/dry-run address coverage incl. resume dry-run) + Task 5 (prose pins) | \`pnpm vitest run tests/paneCompaction/authorization.test.ts\`; \`pnpm vitest run tests/paneCompaction/adapter.test.ts\`; \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | \`pnpm vitest run tests/paneCompaction/mintFault.test.ts\` |`,
  _f921a138b: `| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (adapter-level instrumented-marker case; revalidate pins cover the core half) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts\` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red records (i)+(ii) + Task 4 kill records | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/authorization.test.ts\` — once against the fenced tree (record i), once against the fence-deleted uncommitted probe edit (record ii — the structural duplicate-read red), once per weakened build under Task 4's template |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | \`pnpm vitest run tests/paneCompaction/authorization.test.ts tests/paneCompaction/adapter.test.ts\` |
| AC-6 (dry-run byte-exact: compact verbatim \`/compact\\r\`; checkpoint and resume in BOTH address forms) | Task 2 | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-7 (no \`\\x1b\`, both paths) | Task 2 (adapter-level live-send spy through main(); driver core pins updated in Task 1) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts\` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | \`pnpm vitest run tests/paneCompaction/revalidate.test.ts\` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows; fence-string-absence and no-flag source pin) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-11 (pass marker relocated; scan green) | Task 2 | \`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts\` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | \`pnpm heavy pnpm mutation:guards\`, backgrounded (bare \`pnpm heavy\` exits 2 — no child command; r2 F4) |
| AC-13 (docs no longer claim the fence) | Task 5 | \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + existing prose pin | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 2 (adapter live/dry-run address coverage incl. resume dry-run) + Task 5 (prose pins) | \`pnpm vitest run tests/paneCompaction/authorization.test.ts\`; \`pnpm vitest run tests/paneCompaction/adapter.test.ts\`; \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | \`pnpm vitest run tests/paneCompaction/mintFault.test.ts\` |`,
  _b3705cebd: `| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (adapter-level instrumented-marker case; revalidate pins cover the core half) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts\` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red records (i)+(ii) + Task 4 kill records | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/authorization.test.ts\` — once against the fenced tree (record i), once against the fence-deleted uncommitted probe edit (record ii — the structural duplicate-read red), once per weakened build under Task 4's template |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | \`pnpm vitest run tests/paneCompaction/authorization.test.ts tests/paneCompaction/adapter.test.ts\` |
| AC-6 (dry-run byte-exact: compact verbatim \`/compact\\r\`; checkpoint and resume in BOTH address forms) | Task 2 | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-7 (no \`\\x1b\`, both paths) | Task 2 (adapter-level live-send spy through main(); driver core pins updated in Task 1) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts\` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | \`pnpm vitest run tests/paneCompaction/revalidate.test.ts\` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows; fence-string-absence and no-flag source pin) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-11 (pass marker relocated; scan green) | Task 2 | \`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts\` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | \`pnpm heavy pnpm mutation:guards\`, backgrounded (bare \`pnpm heavy\` exits 2 — no child command; r2 F4) |
| AC-13 (docs no longer claim the fence) | Task 5 | \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + the executable payload pin at tests/paneCompaction/driver.test.ts:72 (\`CHECKPOINT_TEXT\` contains "do not commit" — the adapter case compares sent bytes to the constant, so it cannot see the constant change; r4 F2) + existing prose pin | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 2 (adapter live/dry-run address coverage incl. resume dry-run) + Task 5 (prose pins) | \`pnpm vitest run tests/paneCompaction/authorization.test.ts\`; \`pnpm vitest run tests/paneCompaction/adapter.test.ts\`; \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | \`pnpm vitest run tests/paneCompaction/mintFault.test.ts\` |`,
  HEAD: `| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-2 (nonce from the pass's marker copy) | Task 2 (adapter-level instrumented-marker case; revalidate pins cover the core half) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/revalidate.test.ts\` |
| AC-3 (structural red-then-green; pins PROVEN) | Task 2 red records (i)+(ii) + Task 4 kill records | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/authorization.test.ts\` — once against the fenced tree (record i), once against the fence-deleted uncommitted probe edit (record ii — the structural duplicate-read red), once per weakened build under Task 4's template |
| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | \`pnpm vitest run tests/paneCompaction/authorization.test.ts tests/paneCompaction/adapter.test.ts\` |
| AC-6 (dry-run byte-exact: compact verbatim \`/compact\\r\`; checkpoint and resume in BOTH address forms) | Task 2 | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-7 (no \`\\x1b\`, both paths) | Task 2 (adapter-level live-send spy through main(); driver core pins updated in Task 1) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts\` |
| AC-8 (nonce single-use, consume before send) | Task 2 (re-targeted revalidate pins) | \`pnpm vitest run tests/paneCompaction/revalidate.test.ts\` |
| AC-9 (zero post-send reads) | Task 2 (new spy) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-10 (fence gone, no flag) | Task 2 (send cases execute §3 flows; fence-string-absence and no-flag source pin) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |
| AC-11 (pass marker relocated; scan green) | Task 2 | \`pnpm vitest run tests/paneCompaction/_metaSendAuthSingleRead.test.ts\` |
| AC-12 (score at floor, derived via shipped score()) | Task 6 | \`pnpm heavy pnpm mutation:guards\`, backgrounded (bare \`pnpm heavy\` exits 2 — no child command; r2 F4) |
| AC-13 (docs no longer claim the fence) | Task 5 | \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-14 (checkpoint never commits) | Task 2 (verbatim class) + the executable payload pin at tests/paneCompaction/driver.test.ts:72 (\`CHECKPOINT_TEXT\` contains "do not commit" — the adapter case compares sent bytes to the constant, so it cannot see the constant change; r4 F2) + existing prose pin | \`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-15 (address line pinned; bounded classes stated) | Task 1 (texts) + Task 2 (adapter live/dry-run address coverage incl. resume dry-run) + Task 5 (prose pins) | \`pnpm vitest run tests/paneCompaction/authorization.test.ts\`; \`pnpm vitest run tests/paneCompaction/adapter.test.ts\`; \`pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts\` |
| AC-16 (mint exhaustion is a named exit-2 fault) | Task 3 | \`pnpm vitest run tests/paneCompaction/mintFault.test.ts\` |`,
};

const DECL = "<!-- ac-coverage: command-col=3 -->\n\n";
const hardOf = (table: string): string[] =>
  checkAcCoverage(viewOf(DECL + table + "\n"), "plan")
    .filter((f) => f.severity === "fail")
    .map((f) => f.code);

describe("acCoverage — the incidents it was filed for", () => {
  it("reproduces the review rounds' shape: 4 / 1 / 0 / 0 hard", () => {
    // Read against the spec's §4: the FOUR at the authored blob are AC-3, AC-5,
    // AC-14 and AC-15 — three of r2 F4's four, plus the instance r3 F5 raised a
    // round LATER and which was already present. r2 F4's own fourth, AC-12, is an
    // accepted miss under L-1, and r4 F2 is L-2. A matching count is not a
    // matching set, which is what spec round 4 caught.
    expect({
      authored: hardOf(BLOBS._173bfccfe).length,
      r2repaired: hardOf(BLOBS._b1db667e0).length,
      r3repaired: hardOf(BLOBS._f921a138b).length,
      r4repaired: hardOf(BLOBS._b3705cebd).length,
    }).toEqual({ authored: 4, r2repaired: 1, r3repaired: 0, r4repaired: 0 });
  });

  it("names the four at the authored blob, so a coincidental count cannot pass", () => {
    premiseHolds(
      "the authored blob still carries the prose cells the rounds cited",
      BLOBS._173bfccfe.includes("task commits carry the outputs") &&
        BLOBS._173bfccfe.includes("both red commands above"),
    );
    expect(hardOf(BLOBS._173bfccfe)).toEqual([
      "AC_COMMAND_CELL_NOT_RUNNABLE",
      "AC_COMMAND_CELL_NOT_RUNNABLE",
      "AC_COMMAND_CELL_NOT_RUNNABLE",
      "AC_COMMAND_CELL_NOT_RUNNABLE",
    ]);
  });

  it("AC-12 is an accepted miss under L-1, and stays one", () => {
    // `\`pnpm heavy\` mutation run, backgrounded` carries a span that PARSES.
    // Whether it is THE producing command is a semantic claim only execution
    // settles. Pinned so a later widening that "fixes" it is a deliberate act.
    premiseHolds(
      "the authored blob still carries AC-12's span-bearing cell",
      BLOBS._173bfccfe.includes("mutation run, backgrounded"),
    );
    const codes = checkAcCoverage(viewOf(DECL + BLOBS._173bfccfe + "\n"), "plan");
    // The premise is the discriminator. Asserting only "no AC-12 finding" is
    // satisfied by an arm that emits NOTHING, which is the state this suite is
    // authored in, so the pin would be green before the mechanism exists and
    // green after — decoration either way. Requiring the arm to be emitting
    // makes the absence attributable.
    premiseHolds("the arm is emitting over this table at all", codes.length > 0);
    expect(codes.filter((f) => (f.detail ?? "").includes("pnpm heavy"))).toEqual([]);
  });

  it("the shipped table is clean", () => {
    expect(hardOf(BLOBS.HEAD)).toEqual([]);
  });
});

/**
 * Plant-both, on the shipped fixture (spec §5).
 *
 * Seven of the nine plants are review findings kept as regression cases; two are
 * REPAIRS of earlier plants rather than additions, and each says so inline. The
 * unplanted table scores nothing, so every plant's finding is the plant's.
 */
const PLANTS: { name: string; from: string; to: string; expect: "hard" | "advisory" }[] = [
  {
    name: "a_prose_cell",
    from: `| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |`,
    to: `| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | both red commands above |`,
    expect: "hard",
  },
  {
    name: "a2_comment_only_span",
    from: `| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |`,
    to: `| AC-1 (one read-once pass; read-member spy) | Task 2 structural cover | \`# both red commands above\` |`,
    expect: "hard",
  },
  {
    name: "b_pin_dropped",
    from: `\`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts\``,
    to: `\`pnpm vitest run tests/paneCompaction/adapter.test.ts tests/docs/_metaPaneCompactionContract.test.ts\``,
    expect: "advisory",
  },
  {
    name: "d_superstring_appended",
    from: `tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts\``,
    to: `tests/paneCompaction/driver.test.tsx tests/docs/_metaPaneCompactionContract.test.ts\``,
    expect: "advisory",
  },
  {
    name: "e_superstring_prepended",
    from: `tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts\``,
    to: `archive/tests/paneCompaction/driver.test.ts tests/docs/_metaPaneCompactionContract.test.ts\``,
    expect: "advisory",
  },
  {
    name: "f_prose_in_a_row_without_leading_pipe",
    from: `| AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | \`pnpm vitest run tests/paneCompaction/authorization.test.ts tests/paneCompaction/adapter.test.ts\` |`,
    to: `AC-5 (resume predicate; mode verdict gates) | Task 1 + Task 2 | both red commands above |`,
    expect: "hard",
  },
  {
    name: "g_backslash_parity",
    from: `| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`pnpm vitest run tests/paneCompaction/adapter.test.ts\` |`,
    to: `| AC-4 (refusals name the condition) | Task 2 (restored verbatim class) | \`echo a\\\\|true\` |`,
    expect: "hard",
  },
];

describe("acCoverage — plant-both", () => {
  it("the unplanted fixture scores nothing at all", () => {
    expect(checkAcCoverage(viewOf(DECL + BLOBS.HEAD + "\n"), "plan")).toEqual([]);
  });

  it.each(PLANTS)("$name moves the criterion, and for the reason it names", (plant) => {
    // Each plant proves its own premise on its OWN inputs: the anchor is unique,
    // so the edit is the one intended, and the unplanted form scores zero, so the
    // finding below is attributable to the plant rather than to the fixture.
    premiseHolds(
      `the anchor for ${plant.name} occurs exactly once`,
      BLOBS.HEAD.split(plant.from).length - 1 === 1,
    );
    // A REPLACER FUNCTION, not a replacement string: `String.replace` expands
    // `$&`, `$'`, `` $` `` and `$1` inside a runtime second argument, so a plant
    // whose `to` happened to contain one would splice the surrounding document
    // into the fixture and the case would assert against text nobody wrote. The
    // repo-wide judge enrolled 2026-08-24 reports this shape; a function argument
    // is substituted verbatim.
    const planted = BLOBS.HEAD.replace(plant.from, () => plant.to);
    premiseHolds(`the plant for ${plant.name} changed the table`, planted !== BLOBS.HEAD);

    const found = checkAcCoverage(viewOf(DECL + planted + "\n"), "plan");
    const wanted = found.filter((f) =>
      plant.expect === "hard" ? f.severity === "fail" : f.severity === "advisory",
    );
    expect(wanted.length).toBeGreaterThan(0);
  });

  it("c and c2 cover BOTH orderings of a broken span, because c alone was lucky", () => {
    // Round 1's plant broke the SECOND of two spans and survived the line-key
    // collision by accident. These two are the pair; they need the adapter's
    // outcomes to report, so here they assert the PLAN carries every span, which
    // is the half a line-keyed store would lose.
    const later = BLOBS.HEAD.replace(
      "`pnpm vitest run tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |",
      "`pnpm vitest run 'tests/paneCompaction/adapter.test.ts`; `pnpm vitest run tests/docs/_metaPaneCompactionContract.test.ts` |",
    );
    premiseHolds("the later-span plant changed the table", later !== BLOBS.HEAD);
    const ac15 = acCommandPlan(viewOf(DECL + later + "\n"), "plan").filter((e) => e.spanIndex > 0);
    expect(ac15.length).toBeGreaterThan(0);
  });
});
