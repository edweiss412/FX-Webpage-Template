import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseDoc } from "../../lib/specLint/parse";
import { acAnalysis } from "../../lib/specLint/taskContract";
import { premise } from "../_shared/premise";
import { AC_AMBIGUOUS_RECORD } from "./acAmbiguousRecord";
import { enrolledPlans } from "./acCorpusWalk";

const key = (plan: string, line: number, ids: string[]) => `${plan}:${line} ${ids.join(" ")}`;

describe("the AMBIGUOUS declaring lines over the live corpus (AC-10)", () => {
  const docs = enrolledPlans();
  const live: string[] = [];
  for (const f of docs) {
    for (const a of acAnalysis(parseDoc(readFileSync(f, "utf8"))).ambiguous) {
      live.push(key(f, a.line, a.ids));
    }
  }

  it("AC-10: the live ambiguous set equals the committed record, exactly, both directions", () => {
    premise("enrolled plans walked from disk", docs.length, 90);
    // A record and a live set that are BOTH empty satisfy this, which is why the
    // `red=` for this task also runs `tests/specLint/taskContract.test.ts`: the
    // cases there pin that a two-id line is declined and recorded at all, so a
    // dropped accumulator cannot hide behind an empty record.
    premise("ambiguous lines in the committed record", AC_AMBIGUOUS_RECORD.length, 0);
    expect(live.slice().sort()).toEqual(
      AC_AMBIGUOUS_RECORD.map((r) => key(r.plan, r.line, r.ids)).sort(),
    );
  });

  it("AC-10: the walk is COMPLETE, asserted against an independent enumerator", () => {
    // The same guard Task 4 defines, for the same reason: dropping
    // `2026-08-07-ops-log-code-emits.md` from a recursion leaves this equality
    // unchanged, because its line 56 repeats one distinct id and is not
    // ambiguous at all. A document count cannot see that; the repository index
    // can.
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

  it("AC-10: every recorded line still carries every id the record claims for it", () => {
    premise("recorded lines to check", AC_AMBIGUOUS_RECORD.length, 0);
    for (const row of AC_AMBIGUOUS_RECORD) {
      const lines = readFileSync(row.plan, "utf8").replace(/\r\n/g, "\n").split("\n");
      for (const id of row.ids) {
        expect(`${row.plan}:${row.line} carries ${id}`).toBe(
          `${row.plan}:${row.line} carries ${lines[row.line - 1]?.includes(id) ? id : "NOTHING"}`,
        );
      }
    }
  });
}, 180_000);
