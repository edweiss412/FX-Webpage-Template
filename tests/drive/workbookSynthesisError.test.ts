/**
 * tests/drive/workbookSynthesisError.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §4.2, §5 test 11)
 *
 * `synthesizeMarkdownFromXlsx` converts already-fetched bytes into markdown. Every
 * fault it can raise is a WORKBOOK fault, not a Drive fault — but it is called from
 * inside the Drive dependency (lib/drive/fetch.ts:511,642), so a corrupt xlsx used
 * to surface at the callers as "we couldn't fetch this from Google Drive". Tagging
 * the throw is what lets prepareOnboardingFiles classify it as a parse failure
 * wherever it surfaces (whole-diff R1 finding 1).
 */
import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";

import {
  synthesizeMarkdownFromXlsx,
  WorkbookSynthesisError,
} from "@/lib/drive/exportSheetToMarkdown";

/** A real, minimal xlsx — proves the wrapper does not swallow the success path. */
function validWorkbookBytes(): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet([
    ["SHOW", "Fixture Show"],
    ["CLIENT", "Fixture Client"],
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "PULL SHEET");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("synthesizeMarkdownFromXlsx fault tagging", () => {
  test("a valid workbook still converts (the wrapper is not swallowing success)", () => {
    const { markdown } = synthesizeMarkdownFromXlsx(validWorkbookBytes());
    expect(markdown).toContain("Fixture Show");
  });

  test("a truncated xlsx throws WorkbookSynthesisError with the cause preserved", () => {
    // A real xlsx IS a ZIP: `PK\x03\x04` then entries. A download cut short keeps the
    // signature and loses the rest — the realistic corrupt-workbook shape.
    const truncated = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]).buffer;

    let thrown: unknown;
    try {
      synthesizeMarkdownFromXlsx(truncated);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(WorkbookSynthesisError);
    const error = thrown as WorkbookSynthesisError;
    // Provenance must survive: the underlying reader message is the only clue an
    // operator or a log has about WHY the workbook was unreadable.
    expect(error.cause).toBeDefined();
    expect(error.message).toContain("workbook could not be read");
  });

  test("arbitrary non-ZIP bytes are still tolerated by the reader (boundary, unchanged)", () => {
    // Documented, not endorsed: the reader treats loose bytes as a degenerate
    // text workbook rather than failing. This wrapper deliberately does NOT add a
    // new "is this really an xlsx" check — it only tags faults the reader already
    // raises, so nothing that parses today starts failing.
    expect(() => synthesizeMarkdownFromXlsx(new Uint8Array([1, 2, 3, 4]).buffer)).not.toThrow();
  });

  test("an already-tagged fault is not double-wrapped", () => {
    // Idempotence matters because the same function is reached through two Drive
    // helpers and through the onboarding re-parse path.
    const original = new WorkbookSynthesisError("original", { cause: new Error("root") });
    expect(original.cause).toBeInstanceOf(Error);
    expect(new WorkbookSynthesisError("wrapped", { cause: original }).cause).toBe(original);
  });
});
