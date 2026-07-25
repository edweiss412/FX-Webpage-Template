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

  test("FirstSeenStagePrepareError for the export fault is built from firstSeenPrepareCodeFor", () => {
    const src = readFileSync(join(process.cwd(), ROUTE), "utf8");
    const sourceFile = ts.createSourceFile(
      ROUTE,
      src,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const codeArgs: string[] = [];
    const visit = (node: ts.Node): void => {
      if (
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "FirstSeenStagePrepareError"
      ) {
        const [first] = node.arguments ?? [];
        if (first) codeArgs.push(first.getText(sourceFile));
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);

    expect(codeArgs.length, "the route no longer constructs the prepare error").toBeGreaterThan(0);
    expect(
      codeArgs.some((arg) => arg.startsWith("firstSeenPrepareCodeFor(")),
      `no FirstSeenStagePrepareError is built from the classifier; args were: ${codeArgs.join(", ")}`,
    ).toBe(true);
  });

  test("the route imports the classifier", () => {
    const src = readFileSync(join(process.cwd(), ROUTE), "utf8");
    expect(src).toContain('from "@/lib/onboarding/firstSeenPrepareFault"');
  });
});
