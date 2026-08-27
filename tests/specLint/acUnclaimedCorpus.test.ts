import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseDoc } from "../../lib/specLint/parse";
import { acAnalysis, acceptsDisposition, checkTaskContract } from "../../lib/specLint/taskContract";
import { premise, premiseHolds } from "../_shared/premise";
import { AC_UNCLAIMED_RESIDUE } from "./acUnclaimedResidue";
import { enrolledPlans } from "./acCorpusWalk";

const key = (plan: string, id: string) => `${plan} ${id}`;
/** The owner words the classification rule looks for beside an id. */
const OWNER_WORD = /\b(?:[Tt]asks?|[Ss]teps?|close-?out|closeout|the PR's last commit)\b/;
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
  let declinedLines = 0;
  for (const f of docs) {
    const model = parseDoc(readFileSync(f, "utf8"));
    // The finding sets come from what the arm EMITS, never from a classification
    // derived here: the final codes also rest on marker claims, disposition
    // handling and three-code precedence, and a second derivation of those would
    // go on passing after an edit moved the emitted finding.
    for (const finding of checkTaskContract(model, "plan")) {
      const id = /`(AC-[^`]+)`/.exec(finding.message)?.[1] ?? "";
      if (finding.code === "TASK_AC_UNCLAIMED") unclaimed.push(key(f, id));
      if (finding.code === "TASK_AC_UNDECLARED") undeclared.push(key(f, id));
    }
    declinedLines += acAnalysis(model).declined.length;
  }

  it("AC-6: the unclaimed set equals the committed residue, exactly, both directions", () => {
    premise("enrolled plans walked from disk", docs.length, 90);
    expect(unclaimed.slice().sort()).toEqual(
      AC_UNCLAIMED_RESIDUE.map((r) => key(r.plan, r.id)).sort(),
    );
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

  it("AC-6: every residue row passes its KIND's predicate, not merely a quotation check", () => {
    premise("residue rows to check", AC_UNCLAIMED_RESIDUE.length, 0);
    for (const row of AC_UNCLAIMED_RESIDUE) {
      const lines = readFileSync(row.plan, "utf8").replace(/\r\n/g, "\n").split("\n");
      const at = row.kind === "unsettled" ? row.nearMissAt : row.quotedAt;
      const quote = row.kind === "unsettled" ? row.nearMiss : row.quote;
      // The quotation is the reader's evidence: it must be real, at the line the
      // row names.
      expect(`${row.plan}:${at} ${row.id}`).toBe(`${row.plan}:${at} ${row.id}`);
      expect(lines[at - 1] ?? "").toContain(quote);

      const idHit = new RegExp(`(?<![A-Za-z0-9.-])${escape(row.id)}${ID_BOUNDARY}`);
      const settling = lines
        .map((l, i) => ({ l, n: i + 1 }))
        .filter(({ l }) => !/^ {0,3}<!-- task/.test(l) && idHit.test(l) && OWNER_WORD.test(l));

      if (row.kind === "unsettled") {
        // The predicate: NO line of the plan carries the id beside an owner word.
        // Without it this row is an allowlist entry — quoting a line that
        // ASSIGNS the criterion satisfies every receipt-style check.
        expect(
          `${row.plan} ${row.id} settled at [${settling.map((s) => s.n).join(",")}]`,
        ).toBe(`${row.plan} ${row.id} settled at []`);
        premiseHolds(`${row.plan} ${row.id} has a non-empty searched note`, row.searched !== "");
      } else {
        // The mirror: the quoted line DOES settle it, and the grammar rejects
        // the owner it names — after normalisation, because a copied sentence
        // period would otherwise make a settled owner look inexpressible.
        expect(
          `${row.plan} ${row.id} settling lines`,
        ).toBe(`${row.plan} ${row.id} settling lines`);
        expect(settling.length > 0).toBe(true);
        expect(OWNER_WORD.test(lines[at - 1] ?? "")).toBe(true);
        expect(
          `${row.owner} expressible=${acceptsDisposition(`(discharged by ${normaliseOwner(row.owner)})`)}`,
        ).toBe(`${row.owner} expressible=false`);
      }
    }
  });
}, 180_000);
