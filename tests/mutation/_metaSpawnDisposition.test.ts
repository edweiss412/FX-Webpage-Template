import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";

/**
 * Every spawn site under `tests/mutation/` is DISPOSED OF, and a new one fails
 * by default.
 *
 * The class this covers is "a mutation-harness child spawned with no lifetime
 * bound." The sweep that found it was authored as a table in a plan, and a
 * committed table re-opens the moment somebody adds a spawn site — the
 * enumeration failure the class-sweep rule names by name, and the reason the
 * first version of that sweep was unsound (it excluded `*.test.ts` by FILENAME
 * before inspecting any hit, so it could not have established its own
 * conclusion). This is the derived form: the cover is the WALK ROOT plus the
 * call SHAPE, never a name and never a list.
 *
 * Reproducible by hand — this suite's hit set is what this prints:
 *
 *   rg -n 'execFileSync\(|spawnSync\(|\bspawn\(' tests/mutation/
 *
 * The scan is deliberately DUMB: it is a text match, so it also returns comment
 * prose and fixture strings that merely quote the shape. Teaching it to tell a
 * call from a string would grow a recognizer one grammar corner at a time, which
 * is the ratchet this repo has measured at 20 review rounds with a flat finding
 * rate. The reasons live in the registry instead, where a human wrote them down.
 */

const ROOT = resolve(__dirname, "..", "..");
const WALK_ROOT = join(ROOT, "tests", "mutation");

/**
 * The call shapes, as regexes.
 *
 * Written with escaped parentheses so this file's own source does NOT contain
 * the literal text they match — otherwise the guard would report itself, and
 * silencing that would need the filename filter the guard exists without.
 */
const SPAWN_SHAPES = [/execFileSync\s*\(/, /spawnSync\s*\(/, /\bspawn\s*\(/];

type Hit = { file: string; line: number; text: string };

/** Every file under the walk root, discovered from DISK. No extension filter. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function sweep(): Hit[] {
  return walk(WALK_ROOT).flatMap((full) => {
    let source: string;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      return [];
    }
    const file = relative(ROOT, full).split(sep).join("/");
    return source
      .split("\n")
      .map((text, i) => ({ file, line: i + 1, text: text.trim() }))
      .filter((hit) => SPAWN_SHAPES.some((shape) => shape.test(hit.text)));
  });
}

/**
 * The disposition registry — IN THE SUITE, because a table no guard reads is
 * decoration.
 *
 * A `file` row carries one reason that applies to every hit in that file; a
 * `site` row disposes of one `file:line`. Both forms are checked, and a hit
 * matched by both is an error rather than a preference — "exactly one row" is
 * what makes a reason attributable.
 *
 * Line-keyed rows are used only where a file's hits genuinely differ, because a
 * line number is a moving target in a file anyone may edit. Every row here is
 * file-keyed for that reason; the site form is exercised by the unit cases
 * below so it is not untested machinery.
 */
type Disposition =
  | { kind: "file"; file: string; member: boolean; reason: string }
  | { kind: "site"; file: string; line: number; member: boolean; reason: string };

const DISPOSITIONS: readonly Disposition[] = [
  {
    kind: "file",
    file: "tests/mutation/source/spawnBounded.ts",
    member: false,
    reason:
      "NOT a member — this IS the bounding mechanism. Both calls take the shared " +
      "spawn options, whose `timeout` is the caller's ceiling or the module default.",
  },
  {
    kind: "file",
    file: "tests/mutation/source/spawnBounded.live.test.ts",
    member: false,
    reason:
      "NOT a member — the live-integration suite deliberately launches unbounded, " +
      "detached and orphaned process trees as its FIXTURES. Bounding them would " +
      "delete the property under test.",
  },
  {
    kind: "file",
    file: "tests/mutation/source/runner.test.ts",
    member: false,
    reason:
      "NOT a member — deliberate timeout and hang fixtures for the source harness's " +
      "own ceiling, including a 600 s sleep whose whole purpose is to be killed. The " +
      "real calls here already carry an explicit ceiling; the rest are fixture strings.",
  },
  {
    kind: "file",
    file: "tests/mutation/source/premiseScan.test.ts",
    member: false,
    reason:
      "NOT a member — every hit is a source string inside a fixture template, never " +
      "an executed call. A pattern tight enough to exclude them by shape would have " +
      "been tight enough to miss a real site.",
  },
  {
    kind: "file",
    file: "tests/mutation/source/premiseScan.ts",
    member: false,
    reason:
      "NOT a member — every hit is documentation prose naming the binding shape the " +
      "scanner reasons about. Nothing here launches anything.",
  },
  {
    kind: "file",
    file: "tests/mutation/browser/childLifetime.test.ts",
    member: false,
    reason:
      "NOT a member — the hit is a comment quoting the very call shape AC-1 rejects, " +
      "in the suite that rejects it.",
  },
  {
    kind: "file",
    file: "tests/mutation/_metaSpawnDisposition.test.ts",
    member: false,
    reason:
      "NOT a member — the hits are fixture strings in this guard's own matcher cases. " +
      "The guard reported itself on its first run, which is the guard working: it takes " +
      "no filename filter, so nothing exempts it from the walk it performs.",
  },
  {
    kind: "file",
    file: "tests/mutation/browser/overlayWiring.test.ts",
    member: true,
    reason:
      "MEMBER, REPAIRED in-branch under AC-8 — four wiring children, each now given an " +
      "explicit ceiling and an untrappable kill signal. That file carries its own " +
      "derived scan, so a site added there fails there too.",
  },
];

function rowsFor(hit: Hit): Disposition[] {
  return DISPOSITIONS.filter((row) =>
    row.kind === "file" ? row.file === hit.file : row.file === hit.file && row.line === hit.line,
  );
}

describe("every spawn site under tests/mutation/ is disposed of", () => {
  const hits = sweep();

  // Executable premise. A walk that silently returned nothing would pass
  // vacuously and would forever — `BL-GUARD-PREMISE-REACHABILITY`'s exact shape,
  // and the reason this is asserted rather than assumed.
  it("the walk actually found spawn sites", () => {
    premiseHolds("the walk root holds at least one spawn site", hits.length > 0);
    expect(hits.length).toBeGreaterThan(0);
  });

  // THE DIRECTION THAT MATTERS. The strictly weaker guard asserts only that the
  // registry's rows still resolve to real sites — which passes happily while a
  // NEW undispositioned site sits uncovered, an enumeration failure wearing a
  // guard's clothes. This is the one that must fail on a new site.
  it("every SWEPT site maps to a disposition row", () => {
    const undispositioned = hits
      .filter((hit) => rowsFor(hit).length === 0)
      // Fails BY NAME, with the matched text, so the repair is obvious.
      .map((hit) => `${hit.file}:${hit.line} — ${hit.text.slice(0, 90)}`);

    expect(undispositioned).toEqual([]);
  });

  it("no site is claimed by more than one row", () => {
    const doubled = hits.filter((hit) => rowsFor(hit).length > 1).map((h) => `${h.file}:${h.line}`);
    expect(doubled).toEqual([]);
  });

  // The other direction, so a row left behind by a deleted call site is caught
  // rather than quietly disposing of nothing.
  it("every disposition row resolves to at least one real site", () => {
    const stale = DISPOSITIONS.filter((row) => !hits.some((hit) => rowsFor(hit).includes(row))).map(
      (row) => (row.kind === "file" ? row.file : `${row.file}:${row.line}`),
    );

    expect(stale).toEqual([]);
  });

  it("every row states a reason", () => {
    expect(DISPOSITIONS.filter((row) => row.reason.trim().length < 20)).toEqual([]);
  });
});

describe("the matcher itself", () => {
  // The site form is used by no live row today — every file's hits share one
  // reason — so it is exercised here rather than shipped untested.
  const fileRow: Disposition = { kind: "file", file: "a/b.ts", member: false, reason: "x" };
  const siteRow: Disposition = { kind: "site", file: "c/d.ts", line: 7, member: true, reason: "y" };
  const match = (hit: Hit, rows: readonly Disposition[]) =>
    rows.filter((row) =>
      row.kind === "file" ? row.file === hit.file : row.file === hit.file && row.line === hit.line,
    );

  it("a file row covers every line in its file", () => {
    expect(match({ file: "a/b.ts", line: 99, text: "" }, [fileRow])).toEqual([fileRow]);
  });

  it("a site row covers only its own line", () => {
    expect(match({ file: "c/d.ts", line: 7, text: "" }, [siteRow])).toEqual([siteRow]);
    expect(match({ file: "c/d.ts", line: 8, text: "" }, [siteRow])).toEqual([]);
  });

  it("an unmapped file matches nothing", () => {
    expect(match({ file: "e/f.ts", line: 1, text: "" }, [fileRow, siteRow])).toEqual([]);
  });

  it("the shapes match calls and not neighbouring identifiers", () => {
    const matches = (text: string) => SPAWN_SHAPES.some((shape) => shape.test(text));
    expect(matches("const r = spawnSync(cmd, args);")).toBe(true);
    expect(matches("execFileSync(file, args, {});")).toBe(true);
    expect(matches("const c = spawn(node, argv);")).toBe(true);
    // The bounded wrapper is not a raw spawn, and must not be swept as one.
    expect(matches("spawnBounded([file, ...args], options);")).toBe(false);
    expect(matches("const spawned = spawnedAt;")).toBe(false);
  });
});
