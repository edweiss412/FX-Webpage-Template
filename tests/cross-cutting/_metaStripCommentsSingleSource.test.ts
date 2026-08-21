import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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
  if (/\\\/\\\*(\[\\s\\S\]|\[\^\]|\.)\*\?/.test(strippedSrc))
    hits.push({ family: "block-regex-literal", marker: "/*" });
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
  ...(["/*", "*/"] as const).map((marker) => ({
    file: "tests/specLint/declaredLimitPins.test.ts",
    family: "two-char-literal" as const,
    marker,
    reason:
      "NOT comment handling. Both markers are FIXTURE DATA. The arm must parse a " +
      "suite's RAW text BEFORE blanking it, and the only way to assert that ordering " +
      "is to feed it script text carrying a real block comment whose interior line is " +
      "test-SHAPED: a pin title inside `/* ... */` must NOT read as a live pin. " +
      "Removing the markers removes the input under test. The stripping itself is done " +
      "by the shared module -- scripts/spec-lint.ts calls stripCommentsSafely -- so " +
      "this suite implements none of its own.",
  })),
  ...(["/*", "*/"] as const).map((marker) => ({
    file: "tests/specLint/declaredLimitPinsCli.test.ts",
    family: "two-char-literal" as const,
    marker,
    reason:
      "NOT comment handling. Both markers are FIXTURE DATA for the adapter's " +
      "parse-before-blank proof (AC-10 step 1). One case feeds a terminated block " +
      "comment; the other feeds an UNTERMINATED `/*`, which is the load-bearing one -- " +
      "a generic syntax error passes under either ordering, while an unterminated " +
      "comment is diagnosable ONLY if diagnostics were taken from the raw text. The " +
      "adapter delegates the actual stripping to the shared module.",
  })),
  ...(["/*", "*/"] as const).map((marker) => ({
    file: "tests/ci/_metaModalWaitHelper.test.ts",
    family: "two-char-literal" as const,
    marker,
    reason:
      "NOT comment handling. Both markers are FIXTURE DATA: the modal-wait guard's " +
      "premise proof builds a throwaway spec containing a BLOCK-COMMENTED " +
      "`page.goto('/admin?show=…')` and asserts the guard stays quiet on it. That " +
      "case exists because the guard DID flag commented-out navigations — probed, " +
      "two false violations — which is the false-positive direction its threat " +
      "fence protects, and because a block-comment INTERIOR line need not begin " +
      "with `*`, so only a real parse classifies it. Removing the markers removes " +
      "the input under test. The stripping itself is delegated: " +
      "tests/ci/modalWaitHelper/scan.ts imports stripCommentsForFile from this " +
      "very module's subject, which is what made the fixture necessary.",
  })),
  ...(["//", "/*", "*/"] as const).map((marker) => ({
    file: "tests/specLint/numerics.test.ts",
    family: "two-char-literal" as const,
    marker,
    reason:
      "NOT comment handling. All three markers are FIXTURE DATA for shape (a)'s " +
      "lexical scan of a JavaScript file: `readableScriptLines` must blank a " +
      "declaration-SHAPED line that sits inside a comment, so the cases feed it " +
      "script text containing literal `//`, `/*` and `*/` and assert the exact " +
      "line-for-line output. Removing the markers removes the input under test. " +
      "The stripping itself lives in lib/specLint/numerics.ts, which cannot import " +
      "a test helper (tests/specLint/_metaPureCore.test.ts pins the module's " +
      "purity) and must track comments, all three quote forms, templates with " +
      "nested interpolation, and regex literals in ONE pass — separate passes " +
      "invert the state rather than lose it, which whole-diff review refuted three " +
      "times (R6, R8, R9).",
  })),
  {
    file: "tests/planFences/readCore.test.ts",
    family: "two-char-literal",
    marker: "//",
    reason:
      "NOT comment handling. The `//` is FIXTURE DATA: the plan-fence read-core " +
      "must not fire UNCHECKED_INDEX on an index expression that appears inside a " +
      "comment, so the case feeds it a fence body containing the literal line " +
      "`// rows[0].name is the shape we mean`. Removing the marker would remove the " +
      "very input under test. The comment stripping this file exercises lives in " +
      "lib/planFences, which does its own single-pass masking of comments, strings " +
      "and template interpolations together — a chain of separate passes is " +
      "order-dependent and was wrong three different ways (arc B diff review R6).",
  },
  {
    file: "tests/styles/fontFeatureAvailability.test.ts",
    family: "startswith-filter",
    marker: "--",
    reason:
      "NOT comment handling. `--` opens a comment in SQL, but here it is the CSS " +
      'CUSTOM PROPERTY prefix: the guard checks `prop.startsWith("--")` to decide ' +
      "whether a declaration is a custom property that might CARRY a font-variant " +
      "keyword (`--tw-numeric-figure: oldstyle-nums`, or any other name — see the " +
      "inter-numeral-disambiguation spec §12.21). This file already imports " +
      "stripCommentsForFile from tests/_shared for its actual comment stripping.",
  },
  {
    file: "tests/ci/_workflowCoverageScan.ts",
    family: "name-family",
    marker: "stripCommentLines",
    reason:
      "cross-step-env-guard spec §2.0: YAML/shell full-line-# drop feeding the env-poison predicate and spelling refusal — same never-executes grammar class as the census's registered marker-skip-regex row; scanner-local because the module is a pure scanner with no dependency on tests/_shared (it imports only the yaml parser)",
  },
  {
    file: "tests/styles/_newTabScan.ts",
    family: "name-family",
    marker: "commentRanges",
    reason: "A1 compat re-export delegating to shared (old arity, TSX-bound)",
  },
  {
    file: "tests/styles/_newTabScan.ts",
    family: "name-family",
    marker: "stripCommentsSafely",
    reason: "A1 compat re-export delegating to shared (old arity, TSX-bound)",
  },
  {
    file: "tests/drive/watch.test.ts",
    family: "name-family",
    marker: "codeOf",
    reason:
      "telemetry-record filter (const codeOf = (code) => logRecords.filter(...)), not comment handling — name-family false positive",
  },
  {
    file: "tests/auth/oauth-flow.test.ts",
    family: "two-char-literal",
    marker: "//",
    reason: "E12: protocol-relative-URL assertion string",
  },
  {
    file: "tests/auth/oauth-flow.test.ts",
    family: "startswith-filter",
    marker: "//",
    reason: "E12: protocol-relative-URL assertion, not comment handling",
  },
  {
    file: "tests/cross-cutting/db-test-connection-hygiene.test.ts",
    family: "two-char-literal",
    marker: "//",
    reason: "E7: marker literal in the documented loud-error design (its lines 110-114)",
  },
  {
    file: "tests/components/admin/sheetIconLinkContainment.test.ts",
    family: "startswith-filter",
    marker: "#",
    reason:
      "bareSpecifierOffense leading-# package-subpath-import telltale (r15), not comment handling — detector false positive",
  },
  {
    file: "tests/cross-cutting/db-test-connection-hygiene.test.ts",
    family: "startswith-filter",
    marker: "#",
    reason: "E7: documented loud-error trailing-comment design, YAML half",
  },
  {
    file: "tests/cross-cutting/db-test-connection-hygiene.test.ts",
    family: "startswith-filter",
    marker: "//",
    reason: "E7: same documented design, JS half",
  },
  {
    file: "tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts",
    family: "marker-skip-regex",
    marker: "--",
    reason: "E8: loop-integrated SQL doc-line skips (two sites, one row)",
  },
  {
    file: "tests/cross-cutting/unit-suite-shard-topology.test.ts",
    family: "marker-skip-regex",
    marker: "#",
    reason: "E6: YAML # directives filter",
  },
  {
    file: "tests/ci/_metaSpecRegistration.test.ts",
    family: "marker-skip-regex",
    marker: "#",
    reason:
      "shell-grammar classifier, not comment stripping: the invocation census skips full-line " +
      "# lines because they never EXECUTE (and routes inline # to the fail-closed registry) — " +
      "same class as the E5/E6 YAML rows",
  },
  {
    file: "tests/cross-cutting/vitest-projects-partition.test.ts",
    family: "startswith-filter",
    marker: "#",
    reason: "E5: YAML # line filter",
  },
  {
    file: "tests/cross-cutting/psqlStartupFiles/scan.ts",
    family: "two-char-literal",
    marker: "*/",
    reason:
      "comment-READER, same class as the tests/log/mutationSurface/exemptions.ts rows: the block " +
      "terminator locates where a comment ENDS while carrying quote state across lines, so a " +
      "`psql-startup-files-ok:` exemption is honored only from inside a real comment and never " +
      "from a multi-line string that contains the marker (review R3 probe)",
  },
  {
    file: "tests/cross-cutting/psqlStartupFiles/scan.ts",
    family: "startswith-filter",
    marker: "--",
    reason:
      "psql's LONG-OPTION detection (`token.startsWith('--')` in argvSuppressesStartupFiles), not " +
      "comment handling — `--` is psql's end-of-options marker and the prefix of --no-psqlrc. " +
      "Detector false positive, same shape as the tests/db/_localDbUrl.ts row",
  },
  {
    file: "tests/db/_localDbUrl.ts",
    family: "line-replace-idiom",
    marker: "//",
    reason:
      "DSN credential redaction (its line 31), not comment handling — detector false positive (plan-review R2 F2)",
  },
  {
    file: "tests/drive/loadLocalEnv.ts",
    family: "startswith-filter",
    marker: "#",
    reason: "E10: dotenv # grammar",
  },
  {
    file: "tests/log/mutationSurface/exemptions.ts",
    family: "two-char-literal",
    marker: "//",
    reason: "E9: marker literal in the comment-READER",
  },
  {
    file: "tests/log/mutationSurface/exemptions.ts",
    family: "startswith-filter",
    marker: "//",
    reason: "E9: comment-READER — searches leading comments for the no-telemetry marker",
  },
];

/** Necessary-condition prefilter built ONLY from contiguous match fragments:
 *  f1 regex bodies, f2's `/--`|`/\/\/` regex heads plus `.replace(`, f3/f4a quoted
 *  markers, f4b skip-regex bodies, f5 identifier names. */
export function mayContainIdiom(raw: string): boolean {
  return (
    /(\[\\s\\S\]|\[\^\]|\.)\*\?/.test(raw) ||
    (raw.includes(".replace(") && /\/(\\\/\\\/|--)/.test(raw)) ||
    /["'`](\/\/|\/\*|\*\/)["'`]/.test(raw) ||
    (raw.includes("startsWith(") && /["'`](\/\/|--|#|\/\*|\*)["'`]/.test(raw)) ||
    /\/\^\\s\*(--|#|\\\/\\\/)\//.test(raw) ||
    /\b(strip\w*[Cc]omment\w*|commentRanges|stripNonCode|stripCodeNoise|codeOf)\b/.test(raw)
  );
}

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
    // Sound fast path (whole-diff R1 F1 replaced the raw-first shortcut, which was
    // UNSOUND: blanking turns comments into spaces, so gap-tolerant patterns like
    // `.replace(\s*/--` can match STRIPPED text they never matched raw). This
    // prefilter uses only CONTIGUOUS fragments — substrings a match must contain
    // with no whitespace gap, which therefore appear verbatim in raw whenever they
    // appear in stripped. Zero fragment hits -> the TS parse cannot find anything.
    if (!mayContainIdiom(src)) continue;
    const stripped = stripCommentsForFile(src, rel);
    const residual = detectCommentIdioms(stripped).filter(
      (h) =>
        !standing.some((r) => r.file === rel && r.family === h.family && r.marker === h.marker),
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
  it(
    "no walked test file implements its own comment handling outside the shared module",
    { timeout: 60_000 },
    () => {
      const entries: ScanEntry[] = walk(TESTS_DIR).map((abs) => ({
        rel: relative(ROOT, abs),
        src: readFileSync(abs, "utf8"),
      }));
      const offenders = offendersOf(entries, STANDING_ALLOWLIST, []);
      expect(
        offenders,
        `local comment-handling idioms found — import tests/_shared/stripComments, or add a reasoned STANDING_ALLOWLIST row:\n${offenders.join("\n")}`,
      ).toEqual([]);
    },
  );

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
    const entries = plant(
      "a.ts",
      'function stripComments(s: string) { return s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ""); }\n',
    );
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
  it("(b) RENAMED char-loop copy is caught (spec R2 F2 evasion)", () => {
    const entries = plant(
      "b.ts",
      'function removeNoise(s: string) { const two = s.slice(0, 2); if (two === "//") return ""; return s; }\n',
    );
    expect(offendersOf(entries, [], []).join("")).toContain("two-char-literal");
  });
  it("(c) alternate-spelling inline chain is caught", () => {
    const entries = plant(
      "c.ts",
      'export const x = (s: string) => s.replace(/\\/\\*[^]*?\\*\\//g, "");\n',
    );
    expect(offendersOf(entries, [], []).length).toBe(1);
  });
  it("(d) line-start skip filter is caught", () => {
    const entries = plant(
      "d.ts",
      'export const l = (s: string) => s.split("\\n").filter((x) => !x.trim().startsWith("//"));\n',
    );
    expect(offendersOf(entries, [], []).join("")).toContain("startswith-filter");
  });
  it("(f) comment-gap evasion is caught (whole-diff R1 F1 — the case that killed the raw-first shortcut)", () => {
    const entries = plant(
      "f.ts",
      'export const g = (sql: string) => sql.replace(/* gap */ /--.*$/gm, "");\n',
    );
    expect(offendersOf(entries, [], []).join("")).toContain("line-replace-idiom");
    expect(mayContainIdiom(entries[0]?.src ?? "")).toBe(true);
  });

  it("(e) SQL line-comment replace idiom is caught (spec R3 F1)", () => {
    const entries = plant(
      "e.ts",
      'export const y = (sql: string) => sql.replace(/--.*$/gm, "");\n',
    );
    expect(offendersOf(entries, [], []).join("")).toContain("line-replace-idiom");
  });

  it("standing rows are SITE-granular: an unlisted idiom in an allowlisted file still fails (A16/D1 case)", () => {
    const src =
      'function stripYamlComments(y: string) { return y.split("\\n").filter((l) => !l.trim().startsWith("#")).join("\\n"); }\nconst two = "//";\n';
    const entries: ScanEntry[] = [{ rel: "planted/mixed.ts", src }];
    const standing: StandingRow[] = [
      {
        file: "planted/mixed.ts",
        family: "name-family",
        marker: "stripYamlComments",
        reason: "plant",
      },
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
