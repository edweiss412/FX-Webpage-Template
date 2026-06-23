import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { synthesizeMarkdownFromXlsx } from "@/lib/drive/exportSheetToMarkdown";
import { parseSheet } from "@/lib/parser";

// Pin the production exporter against FROZEN xlsx snapshots. Each committed
// fixtures/shows/exporter-xlsx/<show>.xlsx is a Drive xlsx export of that show
// (trimmed to values + merges — the only inputs the synthesis reads), and
// synthesizeMarkdownFromXlsx(it) must equal the committed <show>.md. This catches a
// synthesis-code regression — the 2026-06-18 "restore DETAILS value column" /
// "skip OLD tabs" class that silently diverged production from the fixtures — in the
// normal unit-suite, with NO live-Drive access and NO secret.
//
// Deliberately creds-free against a frozen snapshot, NOT the live sheet: the live
// fxav-test-shows sheets must stay freely editable for exercising the app's sync /
// change-detection behavior (a different test surface), and a live-byte guard would
// red-flag those intentional edits. (The .md is the production renderer, NOT
// fixtures/shows/raw/*.md — the older Drive-MCP renderer; see that dir's README.)
//
// When synthesizeMarkdownFromXlsx changes intentionally, OR you re-snapshot a sheet:
// regenerate BOTH <show>.xlsx and <show>.md together (per exporter-xlsx/README.md)
// and update the parser fixtures' expectations in lockstep.
const SHOWS = [
  "redefining-fi",
  "consultants",
  "fintech",
  "east-coast",
  "ria",
  "fixed-income",
  "rpas",
] as const;

const DIR = join(process.cwd(), "fixtures/shows/exporter-xlsx");

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

describe("production exporter fixtures: xlsx → markdown round trip (frozen snapshots)", () => {
  test.each(SHOWS)("%s: synthesizeMarkdownFromXlsx(committed .xlsx) === committed .md", (show) => {
    const xlsx = readFileSync(join(DIR, `${show}.xlsx`));
    const committedMarkdown = readFileSync(join(DIR, `${show}.md`), "utf8");

    const synthesized = synthesizeMarkdownFromXlsx(toArrayBuffer(xlsx));

    expect(synthesized).toBe(committedMarkdown);
    // Belt-and-suspenders: the structural parse must also match (distinguishes a
    // whitespace-only synthesis change from a semantic one in the failure output).
    expect(parseSheet(synthesized, `${show}.md`)).toEqual(
      parseSheet(committedMarkdown, `${show}.md`),
    );
  });
});
