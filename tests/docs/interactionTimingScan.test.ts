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
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import {
  EXCLUDED_PREFIXES,
  EXPLICIT_INCLUDES,
  inventoryRows,
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

  test("a non-numeric duration is not a timing", () => {
    expect(kinds('const m = { duration: "fast" };')).toEqual([]);
    expect(kinds("const m = { duration: token };")).toEqual([]);
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
});
