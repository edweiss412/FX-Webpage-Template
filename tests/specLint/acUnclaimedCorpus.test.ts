import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseDoc } from "../../lib/specLint/parse";
import { acAnalysis, acceptsDisposition, checkTaskContract } from "../../lib/specLint/taskContract";
import { premise, premiseHolds } from "../_shared/premise";
import { AC_UNCLAIMED_RESIDUE } from "./acUnclaimedResidue";
import { enrolledPlans } from "./acCorpusWalk";
import { AC_AMBIGUOUS_RECORD } from "./acAmbiguousRecord";

const key = (plan: string, id: string) => `${plan} ${id}`;
/** The owner words the classification rule looks for beside an id. */
const OWNER_WORD =
  /\b(?:[Tt]asks?|[Ss]teps?|[Pp]rocedures?|close-?out|closeout|the PR's last commit)\b/;
const ID_BOUNDARY = "(?![A-Za-z0-9-])(?!\\.[A-Za-z0-9.])";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Trailing sentence punctuation is not part of an owner (plan review R4 finding 1). */
const normaliseOwner = (owner: string) => owner.trim().replace(/[.,;]+$/, "");

describe("the AC arm over the live plans corpus (AC-6)", () => {
  const docs = enrolledPlans();
  // ONE pass: each plan is read once and parsed once. Reading twice cost the
  // sibling corpus test 56s against a 30s timeout, which measures the test.
  const unclaimed: string[] = [];
  const undeclared: string[] = [];
  const emissionDrift: string[] = [];
  let declinedLines = 0;
  let plansEmittingAcFindings = 0;
  let noCertain = 0;
  const declinedPlanPaths: string[] = [];
  for (const f of docs) {
    const model = parseDoc(readFileSync(f, "utf8"));
    // The ids come off the analysis STRUCTURE, not out of the finding message.
    // Recovering an id by regex from human-facing prose is a re-derivation
    // through a string nobody promised to keep stable, and it would report the
    // wrong set the day the wording changes.
    const ac = acAnalysis(model);
    for (const u of ac.unclaimed) unclaimed.push(key(f, u.id));
    for (const u of ac.undeclared) undeclared.push(key(f, u.id));
    declinedLines += ac.declined.length;
    if (ac.declined.length > 0) declinedPlanPaths.push(f);
    if (ac.certain.size === 0) noCertain += 1;
    // And the emission is pinned to that structure, which is what makes the
    // equalities above claims about what the ARM REPORTS rather than about a
    // classification only this file can see. `checkTaskContract` renders from
    // the same value, so any divergence is a defect in the renderer.
    const emitted = checkTaskContract(model, "plan");
    if (emitted.some((x) => x.code.startsWith("TASK_AC_UN"))) plansEmittingAcFindings += 1;
    // IDENTITY and LOCATION, not counts. A count comparison is satisfied by a
    // renderer that hardcodes an id, or one reporting the right NUMBER of
    // findings against the wrong lines — both measured as surviving in diff
    // review R2 finding 2. The id is read back out of the message deliberately:
    // that string is what a plan author sees, so pinning it here is what stops
    // the rendered id drifting from the analysed one.
    const rendered = (code: string) =>
      emitted
        .filter((x) => x.code === code)
        .map((x) => `${/`(AC-[^`]+)`/.exec(x.message)?.[1] ?? "?"}@${x.docLine}`)
        .sort()
        .join(" ");
    const analysed = (rows: readonly { id: string; line: number }[]) =>
      rows
        .map((u) => `${u.id}@${u.line}`)
        .sort()
        .join(" ");
    for (const [code, rows] of [
      ["TASK_AC_UNCLAIMED", ac.unclaimed],
      ["TASK_AC_UNDECLARED", ac.undeclared],
    ] as const) {
      const r = rendered(code);
      const a = analysed(rows);
      if (r !== a) emissionDrift.push(`${f}: ${code} rendered [${r}] vs analysis [${a}]`);
    }
  }

  it("AC-6: the unclaimed set equals the committed residue, exactly, both directions", () => {
    premise("enrolled plans walked from disk", docs.length, 90);
    expect(unclaimed.slice().sort()).toEqual(
      AC_UNCLAIMED_RESIDUE.map((r) => key(r.plan, r.id)).sort(),
    );
  });

  it("AC-6: what the arm EMITS matches the analysis it renders from, on every plan", () => {
    premise("enrolled plans walked from disk", docs.length, 90);
    // The premise this assertion actually rests on. `emissionDrift` is empty on
    // a corpus where the arm reports NOTHING as readily as on one where the
    // renderer is correct, so the comparison has discriminating power only while
    // some plan emits a finding for it to compare. The residue guarantees that
    // today, and if the residue ever reaches zero this premise says so out loud
    // instead of the assertion quietly becoming a tautology.
    premise(
      "plans emitting an AC finding for the drift check to compare",
      plansEmittingAcFindings,
      0,
    );
    // The single-owner rule, asserted rather than asserted-about. A renderer
    // that dropped or duplicated a finding would leave the equalities above
    // green, because they read the analysis directly.
    expect(emissionDrift).toEqual([]);
  });

  it("AC-6: the walk is COMPLETE, asserted against an independent enumerator", () => {
    // A document count proves the walk was not empty and nothing more: after the
    // migration, dropping one enrolled plan leaves every assertion above
    // unchanged while 107 documents still clear any threshold. `git ls-files` is
    // the repository index rather than a filesystem recursion, so it is what a
    // path-filter or recursion mistake actually breaks.
    const indexed = execFileSync("git", ["ls-files", "-z", "docs/superpowers/plans"], {
      encoding: "utf8",
    })
      .split("\0")
      .filter((p) => p.endsWith(".md"))
      .filter((p) => /<!-- tasks: depth=/.test(readFileSync(p, "utf8")))
      .sort();
    premise("enrolled plans in the repository index", indexed.length, 90);
    expect(docs.slice().sort()).toEqual(indexed);
  });

  it("AC-6: the live TASK_AC_UNDECLARED set is EMPTY, over a decline path proved live", () => {
    // An empty set is also what a dead code path produces. Two guards, both
    // required. Here: the declined set over the live corpus must be non-zero, so
    // the symmetric cut is observably doing work. And in
    // `taskContract.test.ts`: a cited id that is neither declared nor declined
    // MUST report — that case is the only thing an unconditionally-true decline
    // predicate fails, and it lives in a suite the mutation registry scores.
    premise("enrolled plans walked from disk", docs.length, 90);
    premise("declined lines on the live corpus", declinedLines, 0);
    expect(undeclared.slice().sort()).toEqual([]);
  });

  it("AC-11: every count the convention paragraph quotes is checked against this walk", () => {
    // `_metaSpecLintDocs` pins the two counts it can reach — the residue and the
    // record are committed modules it can import. The other two, `51 of the 108`
    // and `1089 rows across 97 plans`, are LIVE measurements, and nothing
    // checked them: changing them to `50 of 108` and `1088 rows across 96 plans`
    // satisfied every assertion (diff review R3 finding 3). They are checked
    // HERE because this is where the walk that produces them already happens.
    premise("enrolled plans walked from disk", docs.length, 90);
    const paragraph = readFileSync("docs/agents/writing-plans.md", "utf8")
      .split("\n")
      .filter((l) => l.includes("TASK_AC_UNCLAIMED"))
      .join(" ");
    premiseHolds("the convention paragraph was located", paragraph !== "");
    const declinedPlans = new Set(declinedPlanPaths).size;
    for (const [label, quoted] of [
      ["enrolled", `${docs.length} enrolled plans`],
      ["no-certain", `${noCertain} of the ${docs.length}`],
      ["declined", `${declinedLines} rows across ${declinedPlans} plans`],
      ["residue", `${AC_UNCLAIMED_RESIDUE.length} rows today`],
      ["ambiguous", `${AC_AMBIGUOUS_RECORD.length} lines today`],
    ] as const) {
      expect(`${label}: ${paragraph.includes(quoted)}`).toBe(`${label}: true`);
    }
  });

  it("AC-6: owner normalisation is asserted DIRECTLY, on the forms that flip", () => {
    // A residue plant cannot demonstrate this. The owner-on-line check above
    // fires first on any planted owner the quoted line does not contain, so the
    // normalisation is never reached and removing it changes nothing — which is
    // what diff review R1 finding 4 measured against the control this plan used
    // to claim tested it.
    //
    // And the form that control named was wrong anyway: `ident` is
    // `[A-Za-z0-9][A-Za-z0-9.-]*`, which PERMITS a trailing dot, so `Task 10.`
    // is expressible raw and a row naming it is refused either way. The forms
    // normalisation actually decides are the ones an author produces by copying
    // an owner out of a comma-separated clause.
    const raw = (o: string) => acceptsDisposition(`(discharged by ${o})`);
    const norm = (o: string) => acceptsDisposition(`(discharged by ${normaliseOwner(o)})`);
    for (const [owner, rawWant, normWant] of [
      ["Task 10", true, true], // unchanged by normalisation
      ["Task 10.", true, true], // the dot is INSIDE ident; not what this defends
      ["Task 10,", false, true], // flips — the reason normalisation exists
      ["Task 10;", false, true], // flips
      ["Step 4", false, false], // inexpressible either way: a real residue owner
    ] as const) {
      expect(`${owner} raw=${raw(owner)} norm=${norm(owner)}`).toBe(
        `${owner} raw=${rawWant} norm=${normWant}`,
      );
    }
  });

  it("AC-6: every residue row passes its KIND's predicate, not merely a quotation check", () => {
    premise("residue rows to check", AC_UNCLAIMED_RESIDUE.length, 0);
    // A quotation of at least this many characters. `toContain("")` is true of
    // every string, so an empty or erased evidence field satisfied every check
    // below until this floor existed (diff review R1 finding 2).
    const MIN_QUOTE = 12;
    for (const row of AC_UNCLAIMED_RESIDUE) {
      const text = readFileSync(row.plan, "utf8");
      const lines = text.replace(/\r\n/g, "\n").split("\n");
      // Fences are elided HERE TOO. `acAnalysis` elides them, so a settling
      // scan that reads fenced content is a different predicate from the arm's:
      // a documentation sample carrying an id beside "Task N" would make an
      // honest `unsettled` row fail. The corpus holds 20 such fenced lines
      // (diff review R1 finding 3).
      const fenced = parseDoc(text).fencedInfo;
      const at = row.kind === "unsettled" ? row.nearMissAt : row.quotedAt;
      const quote = row.kind === "unsettled" ? row.nearMiss : row.quote;

      // DERIVED, not enumerated: every string field on the row must carry
      // something. This is the whole class, and it took three diff rounds
      // because the first two repairs named fields one at a time. A blank field
      // makes every binding check below VACUOUS -- `line.includes("")` is true
      // of every line ever written -- so an empty field is a guard failing
      // OPEN, which is the one direction a residue row must never fail. R1
      // found it on `nearMiss` and `quote` and I repaired those two BY NAME;
      // R3 found the id unbound; R4 found `owner: ""` still passing on the
      // identical mechanism R1 had already named.
      //
      // So the check ranges over `Object.entries` rather than a field list. A
      // field added to `ResidueRow` later is covered the day it is added, which
      // is the property the enumerated form could not have: it re-opens the
      // class every time the record grows. `kind`, `plan` and `id` are swept in
      // too -- they are equally capable of being blank, and nothing is gained
      // by exempting them.
      for (const [field, value] of Object.entries(row)) {
        if (typeof value !== "string") continue;
        expect(`${row.kind} ${row.plan} ${row.id}: ${field} is non-empty`).toBe(
          `${row.kind} ${row.plan} ${row.id}: ${value.length > 0 ? field : `${field} IS BLANK`} is non-empty`,
        );
      }

      // The quotation is the reader's evidence: real, non-trivial, and at the
      // line the row names.
      expect(`${row.plan}:${at} quote length >= ${MIN_QUOTE}`).toBe(
        `${row.plan}:${at} quote length >= ${quote.length >= MIN_QUOTE ? MIN_QUOTE : quote.length}`,
      );
      expect(lines[at - 1] ?? "").toContain(quote);

      const idHit = new RegExp(`(?<![A-Za-z0-9.-])${escape(row.id)}${ID_BOUNDARY}`);
      const settling = lines
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(
          ({ l, n }) =>
            fenced[n - 1] === undefined &&
            !/^ {0,3}<!-- task/.test(l) &&
            idHit.test(l) &&
            OWNER_WORD.test(l),
        );

      if (row.kind === "unsettled") {
        // The predicate: NO line of the plan carries the id beside an owner word.
        // Without it this row is an allowlist entry — quoting a line that
        // ASSIGNS the criterion satisfies every receipt-style check.
        expect(`${row.plan} ${row.id} settled at [${settling.map((s) => s.n).join(",")}]`).toBe(
          `${row.plan} ${row.id} settled at []`,
        );
        premiseHolds(
          `${row.plan} ${row.id} has a searched note of substance`,
          row.searched.length >= MIN_QUOTE,
        );
      } else {
        // The mirror: the quoted line DOES settle it, it names the owner the row
        // claims, and the grammar rejects that owner.
        expect(settling.length > 0).toBe(true);
        // The quoted line must carry the ROW'S ID, not merely an owner word.
        // Without this, pointing the quotation at a DIFFERENT line that happens
        // to name the same owner passes every other check — the settling scan
        // is satisfied by the real line elsewhere in the plan, and the owner and
        // quotation are satisfied here. That is an ordinary mistake when
        // updating evidence:selecting the wrong same-owner occurrence (diff review R3
        // finding 1).
        expect(`${row.plan}:${at} carries ${row.id}`).toBe(
          `${row.plan}:${at} carries ${idHit.test(lines[at - 1] ?? "") ? row.id : "NO SUCH ID"}`,
        );
        expect(OWNER_WORD.test(lines[at - 1] ?? "")).toBe(true);
        // The owner must be ON the quoted line. Without this, a row naming an
        // owner that appears nowhere — `Step 5` where the plan says `Step 4` —
        // passes, because an absent owner is rejected by the grammar just as
        // readily as a real one (diff review R1 finding 1).
        expect(`${row.plan}:${at} names ${row.owner}`).toBe(
          `${row.plan}:${at} names ${(lines[at - 1] ?? "").includes(row.owner) ? row.owner : "SOMETHING ELSE"}`,
        );
        expect(
          `${row.owner} expressible=${acceptsDisposition(`(discharged by ${normaliseOwner(row.owner)})`)}`,
        ).toBe(`${row.owner} expressible=false`);
      }
    }
  });
}, 180_000);
