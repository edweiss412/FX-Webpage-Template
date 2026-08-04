/**
 * The shared ledger parser, moved out of `tests/docs/_metaLedgerInProgress.test.ts`
 * so a script can consume it without importing a vitest module whose top-level
 * `describe`/`it` would run on import.
 *
 * The entry set comes from the authoritative walker (`extractEntries`), never a
 * local heading regex — the retired one required an em dash after the id, which
 * `## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)` does not have, so a marker
 * on that entry was attributed to the preceding one with every vacuity gate
 * satisfied.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractEntries } from "@/tests/docs/_ledgerMdast";
import { ledgerFiles, ledgerItems, optsFor } from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const LEDGERS = ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"] as const;

describe("ledgerFiles", () => {
  it("discovers the four ledgers from disk", () => {
    expect(ledgerFiles(ROOT)).toEqual([...LEDGERS].sort());
  });
});

describe("optsFor", () => {
  it("maps each ledger to its own ExtractOpts", () => {
    // Applying the backlog opts to a deferred file yields ZERO entries, which is
    // a whole ledger disappearing silently — the per-file vacuity gate exists
    // for exactly this, but only if the mapping is right in the first place.
    expect(optsFor("DEFERRED.md")).toEqual({ requirePrefix: null, levels: [3] });
    expect(optsFor("DEFERRED-archive.md")).toEqual({ requirePrefix: null, levels: [3] });
    expect(optsFor("BACKLOG.md")).toEqual({ requirePrefix: "BL-", levels: [2, 3] });
    expect(optsFor("BACKLOG-archive.md")).toEqual({ requirePrefix: "BL-", levels: [2, 3] });
  });
});

describe("ledgerItems", () => {
  it("returns exactly the authoritative entry set, per ledger", () => {
    // Asserted against extractEntries itself rather than a hardcoded count, which
    // would rot as the corpus grows. Catches two mutants that pass every
    // per-entry assertion below: a grammar that drops the live struck heading in
    // DEFERRED-archive.md, and a `levels: [2]` mutant that drops every H3 entry
    // in BACKLOG-archive.md while leaving the file non-empty.
    for (const f of LEDGERS) {
      const text = read(f);
      const want = extractEntries(text, optsFor(f)).map((e) => e.id);
      expect(want.length, `${f} fixture premise: it has entries`).toBeGreaterThan(0);
      expect(
        ledgerItems(f, text).map((i) => i.id),
        `${f} entry set drifted`,
      ).toEqual(want);
    }
  });

  it("points each entry at the line its own heading is on", () => {
    // Positivity and monotonicity are both survivable by a mutant that adds one
    // to every line, which would shift every span and drop hunks landing on a
    // heading. Asserting the line's CONTENT names the id is what that fails.
    for (const f of LEDGERS) {
      const text = read(f);
      const lines = text.split("\n");
      const items = ledgerItems(f, text);
      items.forEach((it, n) => {
        const heading = lines[it.line - 1] ?? "";
        expect(heading.startsWith("#"), `${f}:${it.line} is not a heading`).toBe(true);
        expect(heading, `${f}:${it.line} does not name ${it.id}`).toContain(it.id);
        if (n > 0) expect(it.line, `${f} spans not increasing`).toBeGreaterThan(items[n - 1]!.line);
      });
    }
  });

  it("resolves the entries whose heading shapes broke the retired recognizer", () => {
    expect(ledgerItems("BACKLOG.md", read("BACKLOG.md")).map((i) => i.id)).toContain(
      "BL-NULLCODE-STAMP-BATCH-2",
    ); // no em dash
    expect(
      ledgerItems("DEFERRED-archive.md", read("DEFERRED-archive.md")).map((i) => i.id),
    ).toContain("MODAL-CLOSE-EXIT-ANIM-1"); // struck id
  });

  it("gives every entry a span ending before the next entry starts", () => {
    for (const f of LEDGERS) {
      const items = ledgerItems(f, read(f));
      items.forEach((it, n) => {
        expect(it.endLine).toBeGreaterThanOrEqual(it.line);
        const next = items[n + 1];
        if (next) expect(it.endLine, `${f}:${it.id} span overruns`).toBeLessThan(next.line);
      });
    }
  });

  it("parses a meta line into separate fields rather than one greedy blob", () => {
    const [entry] = ledgerItems(
      "BACKLOG.md",
      "## BL-PLANT — planted\n\n**Status:** OPEN · **Branch:** feat/x · **Severity:** low\n",
    );
    expect(entry?.fields.Status).toBe("OPEN");
    expect(entry?.fields.Branch).toBe("feat/x");
    expect(entry?.fields.Severity).toBe("low");
  });
});
