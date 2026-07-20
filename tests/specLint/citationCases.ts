import type { SpanClass } from "../../lib/specLint/citations";

export interface CitationCase {
  content: string;
  expected: SpanClass;
}

const prose = (content: string): CitationCase => ({ content, expected: { kind: "prose" } });
const malformed = (content: string, reason: string): CitationCase => ({
  content,
  expected: { kind: "malformed", reason },
});

/**
 * Canonical classification table (spec §4 / §8 citation-domain matrix).
 * Task 2's classification test and Task 3's malformed-wiring test BOTH iterate
 * this export — classification and end-to-end wiring can never drift.
 */
export const CITATION_CASES: CitationCase[] = [
  // prose
  prose("12:30"),
  prose("3:1"),
  prose("feat/spec-lint"),
  prose("some words"),
  prose("lib/specLint/**"),
  prose("v1.2"),
  prose("—"),
  prose("\\n"),
  prose("/\\b\\d+(?:\\.\\d+)?\\b/"),
  prose("k=2"),
  // malformed — backslash / drive branch
  malformed("dir\\file.ts:12", "windows-style path"),
  malformed("dir\\file.ts:L12", "windows-style path"),
  malformed("dir/sub\\file.ts:", "windows-style path"),
  malformed("dir\\sub/file.ts", "windows-style path"),
  malformed("C:dir\\file.ts", "windows-style path"), // spec §4 named case — colon, path-only drive-relative
  malformed("C:\\dir\\file.ts:12", "windows-style path"),
  malformed("C:/dir/file.ts:12", "windows-style path"),
  malformed("\\\\server\\share\\file.ts:abc", "windows-style path"),
  // malformed — colon form
  malformed(":22", "empty path"),
  malformed("Foo.ts:L12", "invalid line coordinates"),
  malformed("Foo.ts:", "invalid line coordinates"),
  malformed("x.ts:12,34", "invalid line coordinates"),
  malformed("x.ts:12:14", "invalid line coordinates"),
  malformed("x.ts:0", "invalid line coordinates"),
  malformed("x.ts:01", "invalid line coordinates"),
  malformed("/abs/x.ts:12", "illegal path"),
  malformed("a/../x.ts:12", "illegal path"),
  malformed("C:file.ts", "drive-relative path"),
  malformed("C:dir/file.ts:12", "drive-relative path"),
  malformed("C:file.ts:L12", "drive-relative path"), // spec §4 named case — single-letter drive prefix
  malformed("example.com:", "invalid line coordinates"),
  // malformed — path-only forms failing the path rule
  malformed("/abs/x.ts", "illegal path"),
  malformed("a/../x.ts", "illegal path"),
  // citations
  {
    content: "lib/x.ts:12",
    expected: { kind: "citation", path: "lib/x.ts", bare: false, start: 12 },
  },
  {
    content: "lib/x.ts:12-14",
    expected: { kind: "citation", path: "lib/x.ts", bare: false, start: 12, end: 14 },
  },
  {
    content: "example.com:8080",
    expected: { kind: "citation", path: "example.com", bare: true, start: 8080 },
  },
  { content: "AGENTS.md", expected: { kind: "citation", path: "AGENTS.md", bare: true } },
  {
    content: "PerShowAlertSection.tsx",
    expected: { kind: "citation", path: "PerShowAlertSection.tsx", bare: true },
  },
  {
    content: "lib/messages/lookup.ts",
    expected: { kind: "citation", path: "lib/messages/lookup.ts", bare: false },
  },
  {
    content: "app/(admin)/x.tsx:12",
    expected: { kind: "citation", path: "app/(admin)/x.tsx", bare: false, start: 12 },
  },
  {
    content: ".github/workflows/unit-suite.yml:80",
    expected: {
      kind: "citation",
      path: ".github/workflows/unit-suite.yml",
      bare: false,
      start: 80,
    },
  },
  {
    content: "foo..bar.ts:12",
    expected: { kind: "citation", path: "foo..bar.ts", bare: true, start: 12 },
  },
];

export const MALFORMED_CASES: CitationCase[] = CITATION_CASES.filter(
  (c) => c.expected.kind === "malformed",
);
