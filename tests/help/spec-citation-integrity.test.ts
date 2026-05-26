// Structural defense for the M11 spec's phantom-surface AC vector.
//
// HISTORY. Phase I Codex R1/R2/R3 each surfaced a phantom-surface AC — a
// spec acceptance criterion (or §3.6.2 row) naming a `file.ts:N` citation
// or a surface/flow that the shipped code didn't actually implement. The
// orchestrator's pre-R4 comprehensive sweep found 2 more. R4 hit the same
// vector a fifth time (an incomplete amendment leaving stale text in
// AC-11.38). Per AGENTS.md M12 structural-defense calibration:
//
//   > When the round AFTER comprehensive re-analysis still surfaces
//   > same-vector findings, ship structural defenses (meta-tests, registry
//   > entries, CI-time grep guards) in that round's repair commit — do NOT
//   > wait for another adversarial round to confirm the analysis was
//   > incomplete.
//
// CONTRACT. This test parses the M11 user-facing-docs spec markdown and
// extracts every `path/to/file.ts:N` (or `path/to/file.ts:N-M`) citation.
// For each citation, it verifies:
//
//   (a) the cited file exists at the named path, AND
//   (b) the file has at least max(N, M) lines.
//
// Citations buried inside amendment-history sentences ("Original wording
// named …", "original cited …", "drifted from …", "no longer exists", "no
// longer points", "no longer matches", "stale citation") are EXEMPTED —
// those are deliberate historical references, not load-bearing claims
// about current code state.
//
// SCOPE. This test guards
// `docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md`
// only. If the M12+ spec wants the same protection, copy
// this test and point it at the new spec. The pattern is general — but
// the historical-exemption phrasings here are tuned to the M11 amendment
// vocabulary.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SPEC_PATH = join(
  REPO_ROOT,
  "docs/superpowers/specs/v1-pre-deployment-amendments/2026-05-12-user-facing-docs-design.md",
);

// Extract `path/to/file.ext:N` or `path/to/file.ext:N-M` from any backtick
// span or bare text. Common project prefixes; expand if a citation lives
// elsewhere. The regex deliberately stops at characters that can't appear
// in valid relative paths so we don't pull in surrounding prose.
// Extension alternation orders longer-first so `.tsx` matches as `.tsx`
// not `.ts`-prefix-of-`.tsx`. Trailing `\b` requires word-boundary so
// `Screenshot.tsx` doesn't half-match as `Screenshot.ts`.
const CITATION_RE =
  /\b((?:app|lib|components|scripts|tests|supabase|fixtures)\/[\w./\-[\]]+\.(?:tsx|ts|mdx|md|sql|yml|yaml|json))\b:(\d+)(?:-(\d+))?/g;

// I.2 R5 finding 3 extension: bare file paths (no `:line`) also need
// existence checking. Phase I R5 surfaced 4 stale bare-path citations
// (test files moved or renamed). Match the same project prefixes + file
// extensions but with NO trailing `:digit`. Use a negative lookahead to
// avoid double-matching paths the CITATION_RE already picked up.
const BARE_PATH_RE =
  /\b((?:app|lib|components|scripts|tests|supabase|fixtures)\/[\w./\-[\]]+\.(?:tsx|ts|mdx|md|sql|yml|yaml|json))\b(?!:\d)/g;

// Phrasings that introduce a historical citation — the spec is explicitly
// referencing a past state of the code. Keep this list narrow; broadening
// it lets real phantom citations slip through.
const HISTORICAL_MARKERS = [
  "original wording",
  "original cited",
  "original cite",
  "originally named",
  "originally cited",
  "drifted from",
  "drifted to",
  "no longer exists",
  "no longer points",
  "no longer matches",
  "stale citation",
  "stale line",
  "deprecated reference",
  "moved from",
  "previously at",
  "at r8-write time",
  "at r10-write time",
];

function hasHistoricalContext(spec: string, citationIndex: number): boolean {
  // Look back ~400 chars for a historical-marker phrasing. The amendment
  // sentences in M11 typically introduce the historical citation within
  // 1-2 sentences ("**r14 amendment**: the original wording named …").
  const contextStart = Math.max(0, citationIndex - 400);
  const context = spec.slice(contextStart, citationIndex).toLowerCase();
  return HISTORICAL_MARKERS.some((marker) => context.includes(marker));
}

describe("M11 spec file:line citation integrity (Phase I Codex R4 structural defense)", () => {
  const spec = readFileSync(SPEC_PATH, "utf8");
  const violations: string[] = [];
  const skipped: string[] = [];

  for (const match of spec.matchAll(CITATION_RE)) {
    const fullMatch = match[0];
    const relPath = match[1]!;
    const startStr = match[2]!;
    const endStr = match[3];
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : start;
    const maxLine = Math.max(start, end);

    if (hasHistoricalContext(spec, match.index!)) {
      skipped.push(`${relPath}:${startStr}${endStr ? `-${endStr}` : ""}`);
      continue;
    }

    const absPath = join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) {
      violations.push(`Cited file does not exist: ${fullMatch}`);
      continue;
    }
    const lineCount = readFileSync(absPath, "utf8").split("\n").length;
    if (lineCount < maxLine) {
      violations.push(
        `Cited line out of range: ${fullMatch} (file has ${lineCount} lines)`,
      );
    }
  }

  // I.2 R5 extension: bare-path citations (no `:line`) get existence
  // checking only. Same historical-marker exemption applies — amendment
  // sentences referencing renamed/moved files explicitly are exempted.
  for (const match of spec.matchAll(BARE_PATH_RE)) {
    const fullMatch = match[0];
    const relPath = match[1]!;

    if (hasHistoricalContext(spec, match.index!)) {
      skipped.push(relPath);
      continue;
    }

    const absPath = join(REPO_ROOT, relPath);
    if (!existsSync(absPath)) {
      violations.push(`Cited bare path does not exist: ${fullMatch}`);
    }
  }

  it("every non-historical AC + §3.6.2 file:line citation resolves to a real file with enough lines", () => {
    expect(
      violations,
      [
        "Phantom-surface AC citations found.",
        "If a citation is intentionally historical (referring to a past",
        "code state inside an amendment-history sentence), introduce a",
        "HISTORICAL_MARKERS phrase like 'original wording named', 'drifted",
        "from', or 'no longer exists' in the same paragraph before the",
        "citation. Otherwise fix the citation to point at the current",
        "code state or remove the citation.",
        "",
        "Violations:",
        ...violations.map((v) => `  - ${v}`),
      ].join("\n"),
    ).toEqual([]);
  });

  it("captures at least one citation overall (sanity check the regex still matches)", () => {
    expect(violations.length + skipped.length).toBeGreaterThan(0);
  });
});
