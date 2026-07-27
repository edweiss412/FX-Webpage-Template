import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();
const TESTS_DIR = join(ROOT, "tests");
const SHARED_MODULE = "tests/_shared/stripComments.ts";
// The module's own self-test necessarily contains idiom-shaped fixture strings
// (e.g. CSS `content: "/*"`), so it is part of the single source's excluded surface.
const SHARED_SELF_TEST = "tests/_shared/stripComments.test.ts";
const SELF = "tests/cross-cutting/_metaStripCommentsSingleSource.test.ts";

export type IdiomHit = { family: string; marker: string };

/** Five detector families (spec §4) on comment-STRIPPED source. Markers are normalized
 *  so standing rows can pin exact sites — never whole files. */
export function detectCommentIdioms(strippedSrc: string): IdiomHit[] {
  const hits: IdiomHit[] = [];
  // 1. Block-comment regex literals — [\s\S], [^], and .*? spellings.
  if (/\\\/\\\*(\[\\s\\S\]|\[\^\]|\.)\*\?/.test(strippedSrc)) hits.push({ family: "block-regex-literal", marker: "/*" });
  // 2. Line-comment replace idioms — // or -- to EOL inside .replace(/.../).
  for (const m of strippedSrc.matchAll(/\.replace\(\s*\/(\\\/\\\/|--)/g)) {
    hits.push({ family: "line-replace-idiom", marker: m[1] === "--" ? "--" : "//" });
  }
  // 3. Two-char scanner literals: any hand-rolled scanner must name its markers.
  for (const m of strippedSrc.matchAll(/["'`](\/\/|\/\*|\*\/)["'`]/g)) {
    hits.push({ family: "two-char-literal", marker: m[1] ?? "" });
  }
  // 4. Line-start skip filters.
  for (const m of strippedSrc.matchAll(/startsWith\(\s*["'`](\/\/|--|#|\/\*|\*)["'`]\s*\)/g)) {
    hits.push({ family: "startswith-filter", marker: m[1] ?? "" });
  }
  for (const m of strippedSrc.matchAll(/\/\^\\s\*(--|#|\\\/\\\/)\/[gmiy]*/g)) {
    hits.push({ family: "marker-skip-regex", marker: m[1] === "\\/\\/" ? "//" : (m[1] ?? "") });
  }
  // 5. Name family — old names stay tripwires after renames (spec §5.3b).
  for (const m of strippedSrc.matchAll(
    /\b(?:function|const)\s+(strip\w*[Cc]omment\w*|commentRanges|stripNonCode|stripCodeNoise|codeOf)\b/g,
  )) {
    hits.push({ family: "name-family", marker: m[1] ?? "" });
  }
  return hits;
}

export type StandingRow = { file: string; family: string; marker: string; reason: string };

/** Site-granular permanent exemptions (spec §2 Tier D1/E rows + verified detector
 *  false positives). NEVER file-wide: an unlisted (family, marker) in the same file
 *  still fails. This list is EXACTLY the plan-time simulation's offender set. */
export const STANDING_ALLOWLIST: StandingRow[] = [
  { file: "tests/styles/_newTabScan.ts", family: "name-family", marker: "commentRanges", reason: "A1 compat re-export delegating to shared (old arity, TSX-bound)" },
  { file: "tests/styles/_newTabScan.ts", family: "name-family", marker: "stripCommentsSafely", reason: "A1 compat re-export delegating to shared (old arity, TSX-bound)" },
  { file: "tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts", family: "name-family", marker: "stripYamlComments", reason: "D1: YAML # stripper — different grammar, quote-aware, block-safe (renamed from stripComments in A16)" },
  { file: "tests/auth/oauth-flow.test.ts", family: "two-char-literal", marker: "//", reason: "E12: protocol-relative-URL assertion string" },
  { file: "tests/auth/oauth-flow.test.ts", family: "startswith-filter", marker: "//", reason: "E12: protocol-relative-URL assertion, not comment handling" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", family: "two-char-literal", marker: "//", reason: "E7: marker literal in the documented loud-error design (its lines 110-114)" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", family: "startswith-filter", marker: "#", reason: "E7: documented loud-error trailing-comment design, YAML half" },
  { file: "tests/cross-cutting/db-test-connection-hygiene.test.ts", family: "startswith-filter", marker: "//", reason: "E7: same documented design, JS half" },
  { file: "tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts", family: "marker-skip-regex", marker: "--", reason: "E8: loop-integrated SQL doc-line skips (two sites, one row)" },
  { file: "tests/cross-cutting/unit-suite-shard-topology.test.ts", family: "marker-skip-regex", marker: "#", reason: "E6: YAML # directives filter" },
  { file: "tests/cross-cutting/vitest-projects-partition.test.ts", family: "startswith-filter", marker: "#", reason: "E5: YAML # line filter" },
  { file: "tests/db/_localDbUrl.ts", family: "line-replace-idiom", marker: "//", reason: "DSN credential redaction (its line 31), not comment handling — detector false positive (plan-review R2 F2)" },
  { file: "tests/drive/loadLocalEnv.ts", family: "startswith-filter", marker: "#", reason: "E10: dotenv # grammar" },
  { file: "tests/log/mutationSurface/exemptions.ts", family: "two-char-literal", marker: "//", reason: "E9: marker literal in the comment-READER" },
  { file: "tests/log/mutationSurface/exemptions.ts", family: "startswith-filter", marker: "//", reason: "E9: comment-READER — searches leading comments for the no-telemetry marker" },
];

/** Migration-window scaffold (file-granular is CORRECT here: a migration commit clears
 *  a whole file at once — spec §5.3a). Task 47 deletes the emptied constant. */
export const PENDING_MIGRATIONS: string[] = [
  "tests/cross-cutting/no-vestigial-middleware.test.ts",
  "tests/components/admin/bellRetainsCutCodes.test.tsx",
  "tests/messages/showScopedCopy.test.ts",
  "tests/onboarding/finalizeNoDriveExport.test.ts",
  "tests/admin/dev/filesMembership.test.ts",
  "tests/sync/_phase2ArgsParityContract.test.ts",
  "tests/auth/_metaInfraContract.test.ts",
  "tests/e2e/pendingDiscardReal.layout.spec.ts",
  "tests/components/admin/showpage/shareHubFlashTransitions.test.ts",
  "tests/styles/_metaDestructiveConfirm.test.ts",
  "tests/cross-cutting/test-fast-deferred.test.ts",
  "tests/admin/parseAndStage-auth.test.ts",
  "tests/sync/jsonbBoundaryRepresentation.meta.test.ts",
];

export type ScanEntry = { rel: string; src: string };

/** Pure core: detection + precedence, no filesystem. Both the real walk and the plant
 *  suites go through this, so precedence semantics are themselves under test. */
export function offendersOf(
  entries: ScanEntry[],
  standing: StandingRow[],
  pendingFiles: string[],
): string[] {
  const pending = new Set(pendingFiles);
  const offenders: string[] = [];
  for (const { rel, src } of entries) {
    if (rel === SHARED_MODULE || rel === SHARED_SELF_TEST || rel === SELF) continue;
    if (pending.has(rel)) continue; // migration window: whole file deferred
    // Fast path: hits on RAW source are a superset of hits on stripped source
    // (stripping only removes text). Zero raw hits -> skip the TS parse entirely.
    if (detectCommentIdioms(src).length === 0) continue;
    const stripped = stripCommentsForFile(src, rel);
    const residual = detectCommentIdioms(stripped).filter(
      (h) => !standing.some((r) => r.file === rel && r.family === h.family && r.marker === h.marker),
    );
    if (residual.length > 0)
      offenders.push(`${rel}: ${residual.map((h) => `${h.family}(${h.marker})`).join(", ")}`);
  }
  return offenders;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|cts)$/.test(e) ? [p] : [];
  });
}

describe("single-source comment stripping (spec §4)", () => {
  it("no walked test file implements its own comment handling outside the shared module", { timeout: 60_000 }, () => {
    const entries: ScanEntry[] = walk(TESTS_DIR).map((abs) => ({
      rel: relative(ROOT, abs),
      src: readFileSync(abs, "utf8"),
    }));
    const offenders = offendersOf(entries, STANDING_ALLOWLIST, PENDING_MIGRATIONS);
    expect(
      offenders,
      `local comment-handling idioms found — import tests/_shared/stripComments, or add a reasoned STANDING_ALLOWLIST row:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("every STANDING_ALLOWLIST row still matches a live hit (no stale rows)", () => {
    for (const row of STANDING_ALLOWLIST) {
      const src = readFileSync(join(ROOT, row.file), "utf8");
      const hits = detectCommentIdioms(stripCommentsForFile(src, row.file));
      expect(
        hits.some((h) => h.family === row.family && h.marker === row.marker),
        `${row.file} no longer trips ${row.family}(${row.marker}) — delete the stale row`,
      ).toBe(true);
    }
  });

  it("the shared module exports the full API", async () => {
    const mod = await import("../_shared/stripComments");
    for (const name of [
      "commentRanges",
      "stripCommentsSafely",
      "stripCommentsForFile",
      "stripMdxComments",
      "stripSqlComments",
      "stripCssComments",
    ]) {
      expect(typeof (mod as Record<string, unknown>)[name], name).toBe("function");
    }
  });
});

describe("detector negative proofs — through the WALK pipeline (spec §4 plants a–e)", () => {
  const tmp = mkdtempSync(join(tmpdir(), "stripcomments-plants-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const plant = (name: string, src: string): ScanEntry[] => {
    const dir = join(tmp, name.replace(/\W/g, "_"));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), src);
    return walk(dir).map((p) => ({ rel: `planted/${name}`, src: readFileSync(p, "utf8") }));
  };

  it("(a) naive regex stripper in a walked file fails by default", () => {
    const entries = plant("a.ts", 'function stripComments(s: string) { return s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ""); }\n');
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
  it("(b) RENAMED char-loop copy is caught (spec R2 F2 evasion)", () => {
    const entries = plant("b.ts", 'function removeNoise(s: string) { const two = s.slice(0, 2); if (two === "//") return ""; return s; }\n');
    expect(offendersOf(entries, [], []).join("")).toContain("two-char-literal");
  });
  it("(c) alternate-spelling inline chain is caught", () => {
    const entries = plant("c.ts", 'export const x = (s: string) => s.replace(/\\/\\*[^]*?\\*\\//g, "");\n');
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
  it("(d) line-start skip filter is caught", () => {
    const entries = plant("d.ts", 'export const l = (s: string) => s.split("\\n").filter((x) => !x.trim().startsWith("//"));\n');
    expect(offendersOf(entries, [], []).join("")).toContain("startswith-filter");
  });
  it("(e) SQL line-comment replace idiom is caught (spec R3 F1)", () => {
    const entries = plant("e.ts", 'export const y = (sql: string) => sql.replace(/--.*$/gm, "");\n');
    expect(offendersOf(entries, [], []).join("")).toContain("line-replace-idiom");
  });

  it("standing rows are SITE-granular: an unlisted idiom in an allowlisted file still fails (A16/D1 case)", () => {
    const src = 'function stripYamlComments(y: string) { return y.split("\\n").filter((l) => !l.trim().startsWith("#")).join("\\n"); }\nconst two = "//";\n';
    const entries: ScanEntry[] = [{ rel: "planted/mixed.ts", src }];
    const standing: StandingRow[] = [
      { file: "planted/mixed.ts", family: "name-family", marker: "stripYamlComments", reason: "plant" },
      { file: "planted/mixed.ts", family: "startswith-filter", marker: "#", reason: "plant" },
    ];
    const offenders = offendersOf(entries, standing, []);
    expect(offenders.join("")).toContain("two-char-literal");
    expect(offenders.join("")).not.toContain("name-family");
  });

  it("a pending row suppresses its file only during the window", () => {
    const entries: ScanEntry[] = [
      { rel: "planted/p.ts", src: 'const s = (x: string) => x.replace(/--.*$/gm, "");' },
    ];
    expect(offendersOf(entries, [], ["planted/p.ts"])).toEqual([]);
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
});
