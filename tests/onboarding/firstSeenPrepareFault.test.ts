/**
 * tests/onboarding/firstSeenPrepareFault.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §4.3, §5 test 16)
 *
 * Class sweep: the live first-seen retry route carried the SAME conflation as the
 * wizard re-scan. Its export helper synthesizes the workbook internally, so a
 * corrupt xlsx threw inside a call the route labelled "Drive fetch".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, test } from "vitest";

import { WorkbookSynthesisError } from "@/lib/drive/exportSheetToMarkdown";
import { DriveFetchError } from "@/lib/drive/fetch";
import { firstSeenPrepareCodeFor } from "@/lib/onboarding/firstSeenPrepareFault";

describe("live first-seen retry prepare-fault classification (spec §4.3)", () => {
  test("a workbook fault reports the sheet-content code", () => {
    expect(firstSeenPrepareCodeFor(new WorkbookSynthesisError("bad zip"))).toBe(
      "STAGED_PARSE_FAILED",
    );
  });

  test("a Drive transport fault keeps the Drive code", () => {
    expect(firstSeenPrepareCodeFor(new DriveFetchError("revision changed"))).toBe(
      "DRIVE_FETCH_FAILED",
    );
  });

  test("anything unrecognized stays on today's code (conservative default)", () => {
    expect(firstSeenPrepareCodeFor(new Error("socket hang up"))).toBe("DRIVE_FETCH_FAILED");
    expect(firstSeenPrepareCodeFor("boom")).toBe("DRIVE_FETCH_FAILED");
    expect(firstSeenPrepareCodeFor(undefined)).toBe("DRIVE_FETCH_FAILED");
  });
});

describe("the retry route is actually WIRED to the classifier (whole-diff finding 7)", () => {
  // Testing the helper alone leaves the named regression open: hardcoding
  // "DRIVE_FETCH_FAILED" back into the route's catch keeps every unit above green
  // while corrupt workbooks regress to the old 502 Drive response. This asserts the
  // route's export-fault catch constructs its error FROM the classifier.
  const ROUTE = "app/api/admin/pending-ingestions/[id]/retry/route.ts";

  test("the EXPORT catch specifically builds its error from the classifier", () => {
    // "SOME constructor uses the classifier" is not enough: the export catch could
    // regress to a hardcoded Drive code while an unrelated constructor kept it
    // (whole-diff R2 finding 6). This finds the try/catch that wraps the export call
    // and reads THAT catch's throw. The enrich catch further down legitimately
    // hardcodes DRIVE_FETCH_FAILED (a Drive-pin fetch really is a Drive fault), so a
    // blanket "no literal anywhere" rule would be wrong.
    const src = readFileSync(join(process.cwd(), ROUTE), "utf8");
    const sourceFile = ts.createSourceFile(
      ROUTE,
      src,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    let exportCatchCode: string | null = null;
    const visit = (node: ts.Node): void => {
      if (ts.isTryStatement(node) && node.catchClause) {
        const tryText = node.tryBlock.getText(sourceFile);
        if (tryText.includes("fetchSheetMarkdownAndBytesAtRevision")) {
          const catchText = node.catchClause.block.getText(sourceFile);
          const match = /new FirstSeenStagePrepareError\(\s*([^,]+),/.exec(catchText);
          exportCatchCode = match ? (match[1] ?? "").trim() : `<no construction: ${catchText}>`;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    expect(
      exportCatchCode,
      "no try/catch in the route wraps fetchSheetMarkdownAndBytesAtRevision",
    ).not.toBeNull();
    expect(
      exportCatchCode,
      "the export catch no longer classifies the fault; a corrupt workbook would " +
        "regress to the Drive 502 with check-your-share-settings guidance",
    ).toBe("firstSeenPrepareCodeFor(cause)");
  });

  test("the route imports the classifier", () => {
    const src = readFileSync(join(process.cwd(), ROUTE), "utf8");
    expect(src).toContain('from "@/lib/onboarding/firstSeenPrepareFault"');
  });
});
