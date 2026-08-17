/**
 * tests/docs/interactionTimingScan.test.ts
 *
 * Unit contract for `scripts/scan-interaction-timings.ts`.
 *
 * WHY THIS FILE EXISTS, stated plainly because it is the interesting part: the
 * scanner was enrolled in the source-mutation registry BEFORE its first review
 * round, exactly as the guard-gate rule requires, and the gate answered 0.607
 * against a 0.95 floor. The parity test alone exercises the scanner only through
 * one path — the live repo — so a mutation to a form the repo does not currently
 * contain changes nothing observable, and roughly two mutants in five survived.
 *
 * A recognizer's contract is the set of forms it recognizes, so that set is what
 * gets asserted here: one case per form, plus the boundaries between them. The
 * parity test remains the integration half and keeps DESIGN.md §5.5 honest; this
 * is the half that says what the scanner MEANS.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";

import { premiseHolds } from "@/tests/_shared/premise";
import {
  EXCLUDED_PREFIXES,
  EXPLICIT_INCLUDES,
  inventoryRows,
  RESOLVER_PATH_ALIASES,
  scanRepo,
  scanTimingSites,
  universeFiles,
  UNIVERSE_ROOTS,
} from "@/scripts/scan-interaction-timings";

const F = "components/Probe.tsx";
const scan = (src: string) => scanTimingSites(src, F);
const kinds = (src: string) => scan(src).map((s) => `${s.kind}:${s.name ?? s.value}`);

describe("form 1 — timer delays", () => {
  test("setTimeout and setInterval literals, bare and globally prefixed", () => {
    expect(kinds("setTimeout(f, 250);")).toEqual(["timer-literal:250"]);
    expect(kinds("setInterval(f, 1000);")).toEqual(["timer-literal:1000"]);
    expect(kinds("window.setTimeout(f, 30);")).toEqual(["timer-literal:30"]);
    expect(kinds("globalThis.setInterval(f, 40);")).toEqual(["timer-literal:40"]);
  });

  test("a numeric separator is a number, not a string", () => {
    expect(scan("setTimeout(f, 30_000);")[0]?.value).toBe(30000);
  });

  test("a delay-less call contributes nothing — there is no delay to classify", () => {
    expect(kinds("setTimeout(f);")).toEqual([]);
  });

  test("an unrelated `setTimeout` member call is not a timer", () => {
    expect(kinds("scheduler.setTimeout(f, 10);")).toEqual([]);
  });
});

describe("form 2 — named timing bindings", () => {
  test("const, let, and both casing conventions", () => {
    expect(kinds("const CLOSE_DELAY_MS = 120;")).toEqual(["named-constant:CLOSE_DELAY_MS"]);
    expect(kinds("let hoverDelay = 90;")).toEqual(["named-constant:hoverDelay"]);
    expect(kinds("const WINDOW_SECONDS = 60;")).toEqual(["named-constant:WINDOW_SECONDS"]);
    expect(kinds("const fadeDuration = 3;")).toEqual(["named-constant:fadeDuration"]);
    expect(kinds("const requestTimeout = 5;")).toEqual(["named-constant:requestTimeout"]);
  });

  test("module-local counts — an export-only reading cannot see its own seed cases", () => {
    // CLOSE_DELAY_MS, COPY_FEEDBACK_RESET_MS and DEBOUNCE_MS are all
    // non-exported, and they are the very constants the entry named.
    expect(kinds("const DEBOUNCE_MS = 100;")).toEqual(["named-constant:DEBOUNCE_MS"]);
    expect(kinds("export const DEBOUNCE_MS = 100;")).toEqual(["named-constant:DEBOUNCE_MS"]);
  });

  test("default parameters, positional AND destructured", () => {
    expect(kinds("function f(waitMs = 20) { return waitMs; }")).toEqual([
      "named-constant:waitMs",
    ]);
    // The spec's own seed case is the destructured one, which a Parameter-only
    // reading misses entirely.
    expect(kinds("function f({ submitTimeoutMs = 30_000 }) { return submitTimeoutMs; }")).toEqual([
      "named-constant:submitTimeoutMs",
    ]);
  });

  test("a numeric class property with a timing name", () => {
    expect(kinds("class C { retryDelayMs = 15; }")).toEqual(["named-constant:retryDelayMs"]);
  });

  test("a class property whose name is QUOTED counts, like its unquoted twin", () => {
    // `pushNamed` reads a BindingName, which is identifiers only; the quoted
    // spelling is the same declaration and was silently uninventoried.
    expect(kinds('class C { "ttlMs" = 17000; }')).toEqual(["named-constant:ttlMs"]);
    expect(kinds('class C { "notATiming" = 5; }')).toEqual([]);
  });

  test("the name must END in a timing word, and the value must be numeric", () => {
    expect(kinds("const msPerFrame = 16;")).toEqual([]); // starts with, does not end with
    expect(kinds("const SOMETHING_ELSE = 3;")).toEqual([]);
    expect(kinds('const CLOSE_DELAY_MS = "120";')).toEqual([]);
    expect(kinds("const CLOSE_DELAY_MS = compute();")).toEqual([]);
  });

  test("a negative or explicitly-signed value keeps its sign", () => {
    expect(scan("const backOffMs = -5;")[0]?.value).toBe(-5);
    expect(scan("const backOffMs = +5;")[0]?.value).toBe(5);
  });
});

describe("form 3 — motion durations", () => {
  test("a numeric `duration:` property, integer or fractional", () => {
    expect(kinds("const m = { duration: 0.22 };")).toEqual(["motion-duration:0.22"]);
    expect(kinds("const m = { duration: 2 };")).toEqual(["motion-duration:2"]);
  });

  // CONTRACT FLIPPED by BL-TIMING-SCAN-PROPERTY-TOTALITY. This case used to
  // assert that a non-numeric `duration` produced NOTHING, which is the false
  // negative the arc closes: the value is still not inventoriable, but it is
  // now NAMED so a disposition has to account for it.
  test("a non-numeric duration is REPORTED, not dropped", () => {
    expect(kinds('const m = { duration: "fast" };')).toEqual(['unclassified:"fast"']);
    expect(kinds("const m = { duration: token };")).toEqual(["unclassified:token"]);
  });

  test("any timing-named property key, not only `duration`", () => {
    // An options object at a call site is the other place a person writes a
    // timing, and hardcoding the option is easier than declaring a constant —
    // the accidental shape this guard targets.
    expect(kinds("useAnnounceLog({ ttlMs: 17000 });")).toEqual(["motion-duration:17000"]);
    expect(kinds("f({ closeDelay: 120 });")).toEqual(["motion-duration:120"]);
    expect(kinds("f({ notATiming: 5 });")).toEqual([]);
  });

  test("a JSX prop with a numeric timing value counts", () => {
    // A prop is where a call-site option ends up when the consumer is a
    // component — at least as ordinary as the options-object form.
    expect(kinds("const el = <Log ttlMs={17000} />;")).toEqual(["motion-duration:17000"]);
    expect(kinds("const el = <Log notATiming={5} />;")).toEqual([]);
    // Same contract flip: a non-numeric prop value is named, not dropped.
    expect(kinds("const el = <Log ttlMs={token} />;")).toEqual(["unclassified:token"]);
  });

  test("a COMPUTED key is a documented limit, not a site", () => {
    // Declaring a fixed timing through a computed key is not a spelling an
    // ordinary contributor reaches for, and the threat model is accidental
    // mistakes rather than evasion. Pinned so the limit is a decision on record
    // rather than an unnoticed hole.
    expect(kinds('const m = { ["ttlMs"]: 17000 };')).toEqual([]);
    expect(kinds('class C { ["ttlMs"] = 17000; }')).toEqual([]);
  });

  test("a STRING-LITERAL key counts, exactly as the identifier form does", () => {
    // `{ "ttlMs": 17000 }` is ordinary formatting, not obfuscation — an
    // identifier-only reading left it silently uninventoried while the
    // identical unquoted key was caught.
    expect(kinds('useAnnounceLog({ "ttlMs": 17000 });')).toEqual(["motion-duration:17000"]);
    expect(kinds('const m = { "duration": 0.22 };')).toEqual(["motion-duration:0.22"]);
    expect(kinds('f({ "notATiming": 5 });')).toEqual([]);
  });
});

describe("totality — every delay argument is literal, resolved, or NAMED", () => {
  test("an identifier delay is reported so the caller can resolve it", () => {
    const sites = scan("setTimeout(f, ttlMs);");
    expect(sites.map((s) => s.kind)).toEqual(["unclassified"]);
    expect(sites[0]?.name).toBe("ttlMs");
  });

  test("an expression delay is reported by its text, not silently dropped", () => {
    const sites = scan("setTimeout(f, base + BUFFER_MS);");
    expect(sites).toHaveLength(1);
    expect(sites[0]?.kind).toBe("unclassified");
    expect(sites[0]?.name).toContain("+");
  });

  test("an identifier that names a covered binding resolves and stops being residual", () => {
    // Resolution is a whole-universe question, so it happens in scanRepo; the
    // per-file pass records the reference either way.
    const sites = scan("const WAIT_MS = 5;\nsetTimeout(f, WAIT_MS);");
    expect(sites.map((s) => s.kind)).toEqual(["named-constant", "unclassified"]);
  });

  test("comments are not sites — the AST is read, not the text", () => {
    expect(kinds("// setTimeout(f, 250) and const CLOSE_DELAY_MS = 120\nconst x = 1;")).toEqual([]);
  });
});

describe("the universe and its fences", () => {
  const files = universeFiles(process.cwd());

  test("it walks the declared roots and finds real files", () => {
    expect(files.length).toBeGreaterThan(50);
    for (const root of UNIVERSE_ROOTS) {
      expect(files.some((f) => f.startsWith(`${root}/`))).toBe(true);
    }
  });

  test("the excluded prefixes are actually excluded", () => {
    for (const prefix of EXCLUDED_PREFIXES) {
      expect(files.filter((f) => f.startsWith(prefix))).toEqual([]);
    }
  });

  test("every explicit include is present and carries a reason", () => {
    for (const include of EXPLICIT_INCLUDES) {
      expect(files).toContain(include.file);
      expect(include.reason.trim().length).toBeGreaterThan(20);
    }
  });

  test("only scannable extensions are walked", () => {
    expect(files.every((f) => f.endsWith(".ts") || f.endsWith(".tsx"))).toBe(true);
  });
});

describe("scanRepo and the inventory it produces", () => {
  const result = scanRepo(process.cwd());

  test("it resolves identifier delays against the constants it found", () => {
    // If resolution were dropped, every covered-name reference would show up as
    // residual and the parity test would fail with a list of names that are in
    // fact inventoried.
    const residualNames = result.unclassified.map((s) => s.name);
    expect(residualNames).not.toContain("ARM_REVERT_MS");
    expect(residualNames).not.toContain("SHARE_LINK_FLASH_MS");
  });

  test("rows carry a value and an owning file, and are unique per timing", () => {
    const rows = inventoryRows(result);
    expect(rows.length).toBeGreaterThan(10);
    for (const row of rows) {
      expect(row.file.length).toBeGreaterThan(0);
      expect(Number.isFinite(row.value)).toBe(true);
    }
    const keys = rows.map((r) => `${r.file}::${r.label}::${r.value}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("residuals never reach the inventory — a row must have a value", () => {
    const rows = inventoryRows(result);
    expect(rows.some((r) => Number.isNaN(r.value))).toBe(false);
  });

  test("the scan is sorted by file then line, so its output is diffable", () => {
    const sites = [...result.sites];
    const sorted = [...sites].sort((a, b) =>
      a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1,
    );
    expect(sites.map((s) => `${s.file}:${s.line}`)).toEqual(
      sorted.map((s) => `${s.file}:${s.line}`),
    );
  });

  test("it reports how many files it read", () => {
    expect(result.filesScanned).toBe(universeFiles(process.cwd()).length);
  });
});

/**
 * Fixture-tree suite.
 *
 * `scanRepo` takes a root, so the whole pipeline can be driven against a
 * synthetic tree instead of the live repo — which is what the live-repo-only
 * tests could not do, and why the source-mutation gate reported survivors here
 * at 0.797: a branch the real repo never exercises is a branch no assertion
 * reaches. Each case below names the mutant it kills.
 */
describe("scanRepo over a synthetic tree", () => {
  const write = (root: string, rel: string, body: string): void => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  };

  function tree(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "timing-scan-"));
    for (const [rel, body] of Object.entries(files)) write(root, rel, body);
    return root;
  }

  test("node_modules and dot-directories are not walked", () => {
    // Kills the `node_modules || startsWith(".")` skip and its `continue`:
    // without them, these two constants join the population.
    const root = tree({
      "components/Real.tsx": "const REAL_MS = 1;",
      "components/node_modules/Dep.tsx": "const DEP_MS = 2;",
      "components/.cache/Hidden.tsx": "const HIDDEN_MS = 3;",
    });
    try {
      const names = inventoryRows(scanRepo(root)).map((r) => r.label);
      expect(names).toContain("REAL_MS");
      expect(names).not.toContain("DEP_MS");
      expect(names).not.toContain("HIDDEN_MS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a directory is recursed, and never listed as a file — even when named like one", () => {
    // Kills the directory branch's trailing `continue`. Removing it falls
    // through to the extension test, which for ordinary directory names is
    // false and so `continue`s anyway — the mutant SURVIVES a plain nested
    // tree, which is exactly what a hand-mutation run showed. It only bites
    // when a DIRECTORY is named like a source file, so that is the fixture:
    // `Widget.tsx/` must be walked into, never emitted as a path to read.
    const root = tree({
      "app/deep/nested/Timer.tsx": "const NESTED_MS = 7;",
      "components/Widget.tsx/Inner.tsx": "const INNER_MS = 8;",
    });
    try {
      const files = universeFiles(root);
      expect(files).not.toContain("components/Widget.tsx");
      expect(files).toContain("components/Widget.tsx/Inner.tsx");
      const labels = inventoryRows(scanRepo(root)).map((r) => r.label);
      expect(labels).toContain("NESTED_MS");
      expect(labels).toContain("INNER_MS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an unreadable file is skipped, not fatal", () => {
    // Kills the catch's `continue`: without it, `source` is never assigned and
    // the scan throws instead of skipping the file.
    const root = tree({
      "components/Ok.tsx": "const OK_MS = 4;",
      "components/Locked.tsx": "const LOCKED_MS = 5;",
    });
    try {
      chmodSync(join(root, "components/Locked.tsx"), 0o000);
      const names = inventoryRows(scanRepo(root)).map((r) => r.label);
      expect(names).toContain("OK_MS");
    } finally {
      chmodSync(join(root, "components/Locked.tsx"), 0o644);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("the reported line is the site's own, one-based", () => {
    // Kills `line + 1` -> `line + 2`.
    const root = tree({ "components/L.tsx": "\n\nconst THIRD_LINE_MS = 9;\n" });
    try {
      const site = scanRepo(root).sites.find((s) => s.name === "THIRD_LINE_MS");
      expect(site?.line).toBe(3);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an unresolvable delay expression is reported, truncated at 60 characters", () => {
    // Kills `slice(0, 60)` -> `slice(0, 61)`.
    const long = `someObject.someProperty.someOtherProperty.andAnotherOne.plusMore.andYetMore`;
    const root = tree({ "components/E.tsx": `setTimeout(f, ${long});` });
    try {
      const residual = scanRepo(root).unclassified;
      expect(residual).toHaveLength(1);
      expect(residual[0]?.name).toHaveLength(60);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("only NAMED CONSTANTS resolve an identifier delay", () => {
    // Kills the `kind === "named-constant"` filter flipped to `!==`: under the
    // flip the covered set is built from the OTHER kinds, so this delay stops
    // resolving and reappears as residual.
    const root = tree({
      "components/R.tsx": "const RESOLVES_MS = 12;\nsetTimeout(f, RESOLVES_MS);\n",
    });
    try {
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("one row per distinct timing, even when a file states it twice", () => {
    // Kills both halves of the dedupe: dropping the `seen.has` guard or the
    // `seen.add` yields two rows for one timing.
    const root = tree({
      "components/D.tsx": "setTimeout(f, 250);\nsetInterval(g, 250);\n",
    });
    try {
      const rows = inventoryRows(scanRepo(root)).filter((r) => r.value === 250);
      expect(rows).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("files come back in a stable, name-sorted order", () => {
    const root = tree({
      "components/b.tsx": "const B_MS = 1;",
      "components/a.tsx": "const A_MS = 2;",
      "app/c.tsx": "const C_MS = 3;",
    });
    try {
      const files = universeFiles(root).filter((f) => f.startsWith("components/"));
      expect(files).toEqual(["components/a.tsx", "components/b.tsx"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── shared fixture bodies ────────────────────────────────────────────────────
  // The covered constant lives under `components/`, which is a UNIVERSE_ROOT, so
  // no case depends on EXPLICIT_INCLUDES existing in a temp tree.

  const COVERED = [
    "export const COPY_FEEDBACK_RESET_MS = 1600;",
    "export const OTHER_DELAY_MS = 400;",
    "",
  ].join("\n");


  // ── case 1: module-level shadow (FIRES — AC-1) ──────────────────────────────
  test("a module-level binding that shadows a covered constant's spelling is REPORTED", () => {
    // Kills the resolution step reverting to name equality: under the name
    // filter this site is deleted before the caller sees it, so the scan reports
    // nothing at all for this file. Resolution keyed on the DECLARATION reports
    // it, because the local binding produced no named-constant row.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/Shadow.tsx": [
        "const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();",
        "setTimeout(fn, COPY_FEEDBACK_RESET_MS);",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the shadowing file is in the scan universe",
        universeFiles(root).includes("components/Shadow.tsx"),
      );
      const residual = scanRepo(root).unclassified;
      expect(residual.map((s) => [s.file, s.name])).toContainEqual([
        "components/Shadow.tsx",
        "COPY_FEEDBACK_RESET_MS",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 2: inner-scope shadow + precision (FIRES — AC-2) ───────────────────
  test("only the SHADOWED call reports; the unshadowed call in the same file stays resolved", () => {
    // Kills a repair that reports every identifier delay: a blanket reporter
    // passes case 1 and fails here, because the second call resolves to the
    // imported covered constant and must stay silent.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/Mixed.tsx": [
        'import { COPY_FEEDBACK_RESET_MS } from "@/components/timings";',
        "function inner() {",
        "  const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();",
        "  setTimeout(fn, COPY_FEEDBACK_RESET_MS);",
        "}",
        "setTimeout(fn, COPY_FEEDBACK_RESET_MS);",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the mixed file is in the scan universe",
        universeFiles(root).includes("components/Mixed.tsx"),
      );
      const residual = scanRepo(root).unclassified.filter(
        (s) => s.file === "components/Mixed.tsx",
      );
      // Exactly one — the shadowed call on line 4. The module-scope call on
      // line 6 resolves, so a second row here is the precision failure.
      expect(residual).toHaveLength(1);
      expect(residual[0]?.line).toBe(4);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 3: parameter shadow (FIRES — AC-3) ─────────────────────────────────
  test("a PARAMETER shadowing a covered constant is REPORTED", () => {
    // Kills a resolver that only walks variable declarations: a parameter is a
    // binding like any other, and the checker models it as one.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/Param.tsx": [
        'import { COPY_FEEDBACK_RESET_MS } from "@/components/timings";',
        "export function schedule(COPY_FEEDBACK_RESET_MS) {",
        "  setTimeout(fn, COPY_FEEDBACK_RESET_MS);",
        "}",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the parameter file is in the scan universe",
        universeFiles(root).includes("components/Param.tsx"),
      );
      const residual = scanRepo(root).unclassified;
      expect(residual.map((s) => [s.file, s.name])).toContainEqual([
        "components/Param.tsx",
        "COPY_FEEDBACK_RESET_MS",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 4: legit local (QUIET — AC-5) ──────────────────────────────────────
  test("a legit same-file constant resolves — no residual", () => {
    // Kills a repair that reports any identifier whose declaration is local:
    // locality is not the discriminator, being a COVERED ROW is.
    const root = tree({
      "components/Local.tsx": ["const CLOSE_DELAY_MS = 220;", "setTimeout(fn, CLOSE_DELAY_MS);", ""].join(
        "\n",
      ),
    });
    try {
      premiseHolds(
        "the local-constant file is in the scan universe",
        universeFiles(root).includes("components/Local.tsx"),
      );
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 5: direct import (QUIET — AC-5) ────────────────────────────────────
  test("a covered constant imported directly resolves — no residual", () => {
    // Kills a resolver that never follows an import alias: the reference's
    // symbol is an Alias, and without getAliasedSymbol its declaration is the
    // import specifier rather than the covered binding.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/Direct.tsx": [
        'import { COPY_FEEDBACK_RESET_MS } from "@/components/timings";',
        "setTimeout(fn, COPY_FEEDBACK_RESET_MS);",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the importing file is in the scan universe",
        universeFiles(root).includes("components/Direct.tsx"),
      );
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 6: aliased import (FIRES-to-quiet — AC-5) ──────────────────────────
  test("an ALIASED import resolves — the one residual this arc removes", () => {
    // The only fires-to-quiet row in the arc: `localAliasMs` ends in `Ms`, so
    // today it is emitted unclassified and the name set has no such name to
    // suppress it. Kills a resolver that keys on the LOCAL spelling.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/Aliased.tsx": [
        'import { OTHER_DELAY_MS as localAliasMs } from "@/components/timings";',
        "setTimeout(fn, localAliasMs);",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the aliasing file is in the scan universe",
        universeFiles(root).includes("components/Aliased.tsx"),
      );
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 7: barrel re-export (QUIET — AC-5) ─────────────────────────────────
  test("a covered constant reached through a barrel re-export resolves", () => {
    // Kills a one-hop hand-rolled import resolution (the rejected §4 item 5
    // design): `export *` needs the compiler's own module semantics.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/barrel.ts": 'export * from "@/components/timings";\n',
      "components/ViaBarrel.tsx": [
        'import { COPY_FEEDBACK_RESET_MS } from "@/components/barrel";',
        "setTimeout(fn, COPY_FEEDBACK_RESET_MS);",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the barrel consumer is in the scan universe",
        universeFiles(root).includes("components/ViaBarrel.tsx"),
      );
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 8: same-line neighbour (REGRESSION PIN — AC-12) ────────────────────
  test("a binding declared on the same LINE as a covered constant does not inherit its coverage", () => {
    // REGRESSION PIN, not a RED: green on the current tree (probe P16), red only
    // against the rejected line-keyed design (probe P10). Kills a covered set
    // keyed `${file}:${line}` — under that key `other` shares CLOSE_DELAY_MS's
    // key and is suppressed, one binding wearing another's coverage.
    const root = tree({
      "components/SameLine.tsx": [
        "const CLOSE_DELAY_MS = 220, other = readConfig();",
        "setTimeout(fn, other);",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the same-line file is in the scan universe",
        universeFiles(root).includes("components/SameLine.tsx"),
      );
      const residual = scanRepo(root).unclassified;
      expect(residual.map((s) => [s.file, s.name])).toContainEqual([
        "components/SameLine.tsx",
        "other",
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });


  // ── case 9: property-value shadow (FIRES — AC-4) ────────────────────────────
  test("a timing-named PROPERTY whose value shadows a covered constant is REPORTED, with its key", () => {
    // Kills the surviving `coveredNames` filter on the property path: written as
    // an explicit `key: value` pair so the shorthand path cannot satisfy it.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/PropShadow.tsx": [
        "const COPY_FEEDBACK_RESET_MS = readDelayFromRuntimeConfig();",
        "const opts = { ttlMs: COPY_FEEDBACK_RESET_MS };",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the property-shadow file is in the scan universe",
        universeFiles(root).includes("components/PropShadow.tsx"),
      );
      const residual = scanRepo(root).unclassified.filter(
        (s) => s.file === "components/PropShadow.tsx",
      );
      expect(residual).toHaveLength(1);
      expect(residual[0]?.name).toBe("COPY_FEEDBACK_RESET_MS");
      expect(residual[0]?.propertyKey).toBe("ttlMs");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 10: live-shaped pass-through (QUIET — AC-4) ────────────────────────
  test("a timing-named property whose value is the COVERED import resolves — the live ttlMs shape", () => {
    // The discriminator is the BINDING, not the key spelling: same `ttlMs` key
    // as case 9, covered import instead of a shadow. Kills a property-path
    // repair that reports every identifier-valued timing property.
    const root = tree({
      "components/timings.ts": COVERED,
      "components/PropOk.tsx": [
        'import { COPY_FEEDBACK_RESET_MS } from "@/components/timings";',
        "const opts = { ttlMs: COPY_FEEDBACK_RESET_MS };",
        "",
      ].join("\n"),
    });
    try {
      premiseHolds(
        "the pass-through file is in the scan universe",
        universeFiles(root).includes("components/PropOk.tsx"),
      );
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  // ── case 11: shorthand resolves (QUIET — pins probe P12's API choice) ───────
  // NOT in the spec's original eleven. Added on measured evidence: the in-process
  // survivor probe showed the shorthand branch's guards UNPINNED — neither the
  // landed suite nor the live `{ duration }` at CrewSectionTransition.tsx kills
  // them. This case kills two of them. It is a declared 11 -> 12 meta-test
  // inventory delta and must be recorded in the plan/closeout.
  test("a shorthand timing property whose value binding IS covered resolves — no residual", () => {
    // Kills the shorthand branch reverting to getSymbolAtLocation, which returns
    // the ShorthandPropertyAssignment's OWN symbol — declared at the property,
    // not at the value binding — so the covered key never matches and the site
    // reports forever (probe P12).
    const root = tree({
      "components/Short.tsx": ["const duration = 300;", "const opts = { duration };", ""].join("\n"),
    });
    try {
      premiseHolds(
        "the shorthand file is in the scan universe",
        universeFiles(root).includes("components/Short.tsx"),
      );
      expect(scanRepo(root).unclassified).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

});

// ── Property totality: a timing-named property whose value is not a literal ──
//
// The scanner reported such a property as NOTHING. That is a false negative on
// the guard's own contract — "classified or named, never silently absent" — and
// it is the direction that does not announce itself: six live interaction
// timings sat uninventoried while the suite was green
// (BL-TIMING-SCAN-PROPERTY-TOTALITY).
//
// The key predicate on these NEW paths is boundary-aware, deliberately unlike
// the bare-suffix `TIMING_NAME` the numeric paths keep. Measured: the bare
// suffix yields 48 live candidates because ordinary names end in `ms`
// (`items`, `rooms`, `searchParams`), which would bury the 8 real ones.

describe("form 3 totality — non-literal timing property values", () => {
  const unclassified = (src: string) =>
    scan(src)
      .filter((s) => s.kind === "unclassified")
      .map((s) => `${s.propertyKey}=${s.name}`);

  test.each([
    ["a ternary value", `const o = { duration: cond ? 0 : 0.22 };`, "duration=cond ? 0 : 0.22"],
    ["a call value", `const o = { duration: emblaDuration(reduced) };`, "duration=emblaDuration(reduced)"],
    ["an identifier value", `const o = { duration: motionDuration };`, "duration=motionDuration"],
  ])("PropertyAssignment with %s", (_label, src, expected) => {
    expect(unclassified(src)).toEqual([expected]);
  });

  test("ShorthandPropertyAssignment — the value IS the identifier", () => {
    expect(unclassified(`const o = { duration };`)).toEqual(["duration=duration"]);
  });

  test("JsxAttribute with a non-numeric expression container", () => {
    expect(unclassified(`const el = <Thing ttlMs={ttl} />;`)).toEqual(["ttlMs=ttl"]);
  });

  test("an EMPTY JSX expression container yields no site", () => {
    // Repays a surviving logical-connector mutant on the string-value fallback:
    // with `||` in place of `&&`, `<Thing ttlMs={} />` falls through to the
    // fallback, which then hands back the JsxExpression itself and reports the
    // container text as if it were a value.
    expect(unclassified(`const el = <Thing ttlMs={} />;`)).toEqual([]);
  });

  test("a VALUELESS JSX attribute yields no site", () => {
    // `<Thing ttlMs />` is the boolean-prop spelling: there is no value, so
    // there is no timing. Whole-diff R1 #5 — this is also the input that
    // distinguishes the initializer narrowing: with `||` in place of `&&`,
    // `ts.isJsxExpression(undefined)` is evaluated and THROWS, so the site the
    // registry called equivalent is a crash on an ordinary prop spelling.
    expect(unclassified(`const el = <Thing ttlMs />;`)).toEqual([]);
    expect(scan(`const el = <Thing ttlMs />;`)).toEqual([]);
  });

  test("JsxAttribute with a string value that does not parse as a number", () => {
    expect(unclassified(`const el = <Thing ttlMs="soon" />;`)).toEqual(["ttlMs=soon"]);
  });

  // EVERY accept-set form, not only the spellings the census happens to contain.
  test.each([
    ["bare duration", "duration"],
    ["whole-word timeout", "timeout"],
    ["camel ttlMs", "ttlMs"],
    ["snake deadline_ms", "deadline_ms"],
    ["camel suffix fooTimeout", "fooTimeout"],
    ["camel suffix retrySeconds", "retrySeconds"],
    // Repays a surviving integer-literal mutant on the `before` slice: a
    // leading-underscore key is the one shape where slicing from index 1
    // instead of 0 loses the boundary character and flips the verdict.
    ["a bare snake prefix _ms", "_ms"],
  ])("the boundary predicate ACCEPTS %s", (_label, key) => {
    expect(unclassified(`const o = { ${key}: someExpr };`)).toEqual([`${key}=someExpr`]);
  });

  // The boundary is the whole point: these end in `ms` and are not timings.
  test.each([["items"], ["rooms"], ["searchParams"], ["diagrams"], ["problems"]])(
    "the boundary predicate REJECTS %s",
    (key) => {
      expect(unclassified(`const o = { ${key}: someExpr };`)).toEqual([]);
    },
  );

  // Whole-diff R1 #4: the boundary rule was suffix arithmetic, so a timing word
  // buried inside the FINAL WORD read as no boundary at all. `TIMING_NAME`
  // accepts `timeoutMilliseconds` and the numeric path inventories it, while
  // the non-literal path dropped it in silence — the two halves of one property
  // disagreeing is exactly the totality break this entry exists to close.
  test.each([
    ["a unit-suffixed timeout", "timeoutMilliseconds"],
    ["the bare unit word", "milliseconds"],
    ["a snake unit", "retry_milliseconds"],
    ["the micro unit", "retryMicroseconds"],
    ["the nano unit", "frameNanoseconds"],
  ])("the boundary predicate ACCEPTS %s", (_label, key) => {
    expect(unclassified(`const o = { ${key}: someExpr };`)).toEqual([`${key}=someExpr`]);
  });

  // The units are a NAMED, closed family — sub-second only. `min` and `sec` are
  // left out because they are `minimum` and `section` at least as often as they
  // are time, and a flooded report is not read.
  test.each([["colMin"], ["widthMinimum"], ["pageSections"], ["totalItems"]])(
    "the unit family does not widen to %s",
    (key) => {
      expect(unclassified(`const o = { ${key}: someExpr };`)).toEqual([]);
    },
  );

  test("a SINGULAR unit spelling is dropped by BOTH halves, so totality holds", () => {
    // The accept-set carries no singular unit, and that is not an omission: the
    // boundary predicate is only consulted for a key `TIMING_NAME` already
    // accepted, and `oneMillisecond` does not end in `seconds`. Listing it
    // would be an accept-set entry no input can reach. What totality requires
    // is that the two halves AGREE, which this pins in both directions.
    expect(scan(`const o = { oneMillisecond: 250 };`)).toEqual([]);
    expect(unclassified(`const o = { oneMillisecond: someExpr };`)).toEqual([]);
  });

  test("every key the numeric path inventories reaches the non-literal path too", () => {
    // The class, stated as a property rather than a list: for each accepted key
    // form, the SAME key must be visible whether its value is a literal or not.
    // A predicate that widens on one side only re-opens the silent drop.
    const keys = ["duration", "ttlMs", "deadline_ms", "fooTimeout", "timeoutMilliseconds"];
    const numeric = keys.filter((k) => scan(`const o = { ${k}: 250 };`).length > 0);
    const nonLiteral = keys.filter((k) => unclassified(`const o = { ${k}: someExpr };`).length > 0);
    expect(nonLiteral).toEqual(numeric);
  });

  test("a numeric-literal property is UNCHANGED — still motion-duration", () => {
    expect(kinds(`const o = { duration: 0.22 };`)).toEqual(["motion-duration:0.22"]);
    expect(scan(`const o = { duration: 0.22 };`).map((s) => s.kind)).not.toContain("unclassified");
  });

  test("the reported name is whitespace-collapsed and truncated like a delay", () => {
    const long = "someVeryLongCallExpression(" + "argument, ".repeat(12) + "last)";
    const [site] = scan(`const o = {\n  duration:\n    ${long}\n};`).filter(
      (s) => s.kind === "unclassified",
    );
    expect(site?.name?.length).toBeLessThanOrEqual(60);
    expect(site?.name).not.toMatch(/\n/);
  });

  test("an unclassified site carries no numeric value, so no §5.5 row can represent it", () => {
    const [site] = scan(`const o = { duration: cond ? 0 : 0.22 };`).filter(
      (s) => s.kind === "unclassified",
    );
    expect(site?.value).toBeNull();
  });
});

describe("the resolver's module-alias assumption", () => {
  test("matches tsconfig.json's compilerOptions.paths, and tsconfig declares no baseUrl", () => {
    // Failure mode: the repo adopts a second alias or renames `@/`, every
    // `@/`-specified import silently stops resolving, and 17 live sites
    // quietly become unclassified. A paths-only assertion misses the baseUrl
    // half — adding `"baseUrl": "./src"` mis-resolves every `@/…` specifier
    // while the paths map still matches.
    // tsconfig.json is plain JSON on this repo (zero `//` occurrences), so it
    // parses directly — no comment stripping, and no dependency on a helper
    // that would itself need pinning.
    const raw = readFileSync(join(process.cwd(), "tsconfig.json"), "utf8");
    const compilerOptions = (
      JSON.parse(raw) as { compilerOptions: Record<string, unknown> }
    ).compilerOptions;
    expect(compilerOptions.paths).toEqual(RESOLVER_PATH_ALIASES);
    // The baseUrl half is load-bearing and a paths-only assertion misses it:
    // the resolver pins `baseUrl: repoRoot`, so adding `"baseUrl": "./src"`
    // here mis-resolves every `@/…` specifier while `paths` still matches.
    expect(compilerOptions).not.toHaveProperty("baseUrl");
  });
});
