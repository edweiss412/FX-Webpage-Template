import { describe, expect, test } from "vitest";
import * as XLSX from "xlsx";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";

function workbookBuffer(
  sheets: Array<{
    name: string;
    rows: unknown[][];
    merges?: XLSX.Range[];
  }>,
): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    if (sheet.merges) worksheet["!merges"] = sheet.merges;
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  return XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
}

describe("synthesizeMarkdownFromXlsx", () => {
  test("emits a single GFM table with centered alignment delimiters", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([{ name: "INFO", rows: [["CLIENT", "EVENT"], ["ACME", "Forum"]] }]),
    );

    expect(markdown).toBe(
      ["| CLIENT | EVENT |", "| :---: | :---: |", "| ACME | Forum |"].join("\n"),
    );
  });

  test("keeps tabs and blank-row-separated blocks as separate table blocks", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "INFO",
          rows: [
            ["CLIENT", "EVENT"],
            ["ACME", "Forum"],
            [],
            ["DATE", "VENUE"],
            ["5/1/25", "Ballroom"],
          ],
        },
        { name: "CONTACTS", rows: [["NAME", "EMAIL"], ["Doug", "doug@example.com"]] },
      ]),
    );

    expect(markdown).toBe(
      [
        "| CLIENT | EVENT |",
        "| :---: | :---: |",
        "| ACME | Forum |",
        "",
        "| DATE | VENUE |",
        "| :---: | :---: |",
        "| 5/1/25 | Ballroom |",
        "",
        "| NAME | EMAIL |",
        "| :---: | :---: |",
        "| Doug | doug@example.com |",
      ].join("\n"),
    );
  });

  test("expands merged cells across the merged range", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "OLD PULL SHEET",
          rows: [["OLD PULL SHEET", "", ""], ["ITEM", "QTY", "NOTES"], ["Monitor", 2, ""]],
          merges: [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| OLD PULL SHEET | OLD PULL SHEET | OLD PULL SHEET |",
        "| :---: | :---: | :---: |",
        "| ITEM | QTY | NOTES |",
        "| Monitor | 2 |  |",
      ].join("\n"),
    );
  });

  test("escapes parser-significant characters and converts embedded newlines", () => {
    const markdown = synthesizeMarkdownFromXlsx(
      workbookBuffer([
        {
          name: "LIST",
          rows: [
            ["A|B", "#NUM!", "PATH", "NOTES"],
            ["x\\y", "ok!", "C:\\Temp", "line one\nline two"],
          ],
        },
      ]),
    );

    expect(markdown).toBe(
      [
        "| A\\|B | \\#NUM\\! | PATH | NOTES |",
        "| :---: | :---: | :---: | :---: |",
        "| x\\\\y | ok! | C:\\\\Temp | line one&#10;line two |",
      ].join("\n"),
    );
  });
});
