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
