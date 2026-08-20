import { createHash } from "node:crypto";
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

type Hit = { file: string; line: number; text: string; index: number };

/** Every file under the walk root, discovered from DISK. No extension filter. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

type Sweep = {
  hits: Hit[];
  filesRead: number;
  bytesRead: number;
  unreadable: string[];
  sources: Map<string, string>;
};

/**
 * Ceiling VALUES this guard accepts, default-denying the entire complement.
 *
 * Round 3 probed two evasions of a `timeout:` PRESENCE check, and both are
 * value questions rather than grammar questions: `timeout: 0` and
 * `timeout: undefined` both carry the key and bound nothing — measured, a 200 ms
 * child under either ran to completion with status 0.
 *
 * A named constant is accepted only from this set, and each member is pinned
 * positive by its own derivation test — `BROWSER_MUTANT_TIMEOUT_MS` against the
 * probe's measured maximum, `WIRING_CHILD_TIMEOUT_MS` against the value observed
 * to be insufficient. Default-deny is what makes this closable: a new constant
 * name is not "unrecognized and therefore fine", it is refused until someone
 * adds it here and pins it.
 */
const CEILING_NAMES = ["BROWSER_MUTANT_TIMEOUT_MS", "WIRING_CHILD_TIMEOUT_MS"] as const;

/**
 * An ACCEPTED ceiling occurrence: a positive integer literal, or a named
 * constant from the accept-set above. `0`, a negative, `undefined` and `null`
 * are all refused by construction rather than by enumeration.
 */
/**
 * A stable digest of exactly the hit lines a NON-MEMBER row disposes of.
 *
 * Sorted, so line motion alone does not re-open a disposition; trimmed, so
 * reindentation does not either. Any CHANGE to what a disposed line says does.
 */
const digestOf = (hits: readonly Hit[]): string =>
  createHash("sha256")
    .update([...hits.map((h) => h.text)].sort().join("\n"))
    .digest("hex")
    .slice(0, 12);

const ceilingCount = (source: string): number => {
  const names = CEILING_NAMES.join("|");
  const literal = String.raw`0*[1-9][0-9_]*`;
  return [
    ...source.matchAll(new RegExp(String.raw`\btimeout\s*:\s*(?:${names}|${literal})\b`, "g")),
  ].length;
};

/**
 * The walk, WITH ITS INPUT ACCOUNTED FOR.
 *
 * An earlier version swallowed a failed read into an empty result, which is the
 * empty-population failure that no control on the OUTPUT can see: the count, and
 * any control over the count, are all downstream of the same broken read, and a
 * check that reports "no undispositioned sites" is indistinguishable from one
 * that read nothing at all. So the bytes and the file count come back with the
 * hits, and an unreadable file is REPORTED rather than skipped.
 */
function sweep(): Sweep {
  const files = walk(WALK_ROOT);
  const unreadable: string[] = [];
  let bytesRead = 0;
  let filesRead = 0;

  const sources = new Map<string, string>();

  const hits = files.flatMap((full) => {
    const file = relative(ROOT, full).split(sep).join("/");
    let source: string;
    try {
      source = readFileSync(full, "utf8");
    } catch (e) {
      unreadable.push(`${file}: ${String(e)}`);
      return [];
    }
    filesRead += 1;
    bytesRead += source.length;
    sources.set(file, source);

    const found: Hit[] = [];
    let offset = 0;
    for (const [i, text] of source.split("\n").entries()) {
      // EVERY match on the line, not the first. Round 3 probed the gap: the
      // sweep recorded at most one hit per line, so a second call added beside
      // an existing one was invisible to the count that disposes of the file.
      const seen = new Set<number>();
      for (const shape of SPAWN_SHAPES) {
        for (const m of text.matchAll(new RegExp(shape.source, "g"))) {
          const at = m.index + m[0].length - 1;
          if (seen.has(at)) continue;
          seen.add(at);
          found.push({ file, line: i + 1, text: text.trim(), index: offset + at });
        }
      }
      offset += text.length + 1;
    }
    return found;
  });

  return { hits, filesRead, bytesRead, unreadable, sources };
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
  /**
   * MEMBER: these hits ARE harness children of the filed class, and the row
   * claims they are bounded. The claim is CHECKED — every hit in the file must
   * carry an explicit ceiling — so a new unbounded spawn added here fails, and
   * so does removing a ceiling from an existing one.
   */
  | { kind: "file"; file: string; member: true; reason: string }
  /**
   * NON-MEMBER: these hits are not executed harness children at all — fixture
   * strings, comment prose, or the bounding mechanism itself. That claim cannot
   * be checked without telling a call from a string, which is a parser, and the
   * standing repair direction here is narrowing rather than recognizer growth.
   * So the row pins its HIT COUNT instead: a new hit re-opens the disposition
   * and fails by name, which is the property the count is for. Counting is not
   * recognizing.
   */
  | { kind: "file"; file: string; member: false; reason: string; hits: number; digest: string }
  | { kind: "site"; file: string; line: number; member: boolean; reason: string };

const DISPOSITIONS: readonly Disposition[] = [
  {
    kind: "file",
    file: "tests/mutation/source/spawnBounded.ts",
    member: false,
    reason:
      "NOT a member — this IS the bounding mechanism. Both calls take the shared " +
      "spawn options, whose `timeout` is the caller's ceiling or the module default.",
    hits: 2,
    digest: "a5348d5976fa",
  },
  {
    kind: "file",
    file: "tests/mutation/source/spawnBounded.live.test.ts",
    member: false,
    reason:
      "NOT a member — the live-integration suite deliberately launches unbounded, " +
      "detached and orphaned process trees as its FIXTURES. Bounding them would " +
      "delete the property under test.",
    hits: 6,
    digest: "ddb1bb452f12",
  },
  {
    kind: "file",
    file: "tests/mutation/source/runner.test.ts",
    member: false,
    reason:
      "NOT a member — deliberate timeout and hang fixtures for the source harness's " +
      "own ceiling, including a 600 s sleep whose whole purpose is to be killed. The " +
      "real calls here already carry an explicit ceiling; the rest are fixture strings.",
    hits: 3,
    digest: "5d87ce9a9050",
  },
  {
    kind: "file",
    file: "tests/mutation/source/premiseScan.test.ts",
    member: false,
    reason:
      "NOT a member — every hit is a source string inside a fixture template, never " +
      "an executed call. A pattern tight enough to exclude them by shape would have " +
      "been tight enough to miss a real site.",
    hits: 89,
    digest: "2ca5a6615b0f",
  },
  {
    kind: "file",
    file: "tests/mutation/source/premiseScan.ts",
    member: false,
    reason:
      "NOT a member — every hit is documentation prose naming the binding shape the " +
      "scanner reasons about. Nothing here launches anything.",
    hits: 4,
    digest: "8cfcd7a79fdc",
  },
  {
    kind: "file",
    file: "tests/mutation/browser/childLifetime.test.ts",
    member: false,
    reason:
      "NOT a member — the hit is a comment quoting the very call shape AC-1 rejects, " +
      "in the suite that rejects it.",
    hits: 1,
    digest: "21efc803cde9",
  },
  {
    kind: "file",
    file: "tests/mutation/_metaSpawnDisposition.test.ts",
    member: false,
    reason:
      "NOT a member — the hits are fixture strings in this guard's own matcher cases. " +
      "The guard reported itself on its first run, which is the guard working: it takes " +
      "no filename filter, so nothing exempts it from the walk it performs.",
    hits: 3,
    digest: "209e81631f36",
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
  const { hits, filesRead, bytesRead, unreadable, sources } = sweep();

  // Executable premise, asserted UPSTREAM of the count as well as on it.
  //
  // A walk that silently returned nothing would pass vacuously and would forever
  // — `BL-GUARD-PREMISE-REACHABILITY`'s exact shape. But a must-be-absent control
  // on the output cannot catch that, because it AGREES with total failure: a
  // check reading an empty corpus reports zero undispositioned sites and looks
  // correct. The load-bearing half is must-be-PRESENT, and the strongest form of
  // it is upstream of every count — prove the input was read at all.
  it("read a non-empty population before counting anything", () => {
    premiseHolds("the walk read at least one file", filesRead > 0);
    premiseHolds("the walk read a non-trivial number of bytes", bytesRead > 0);
    premiseHolds("the walk root holds at least one spawn site", hits.length > 0);

    // Raw counts, not a computed verdict: a verdict hides the difference between
    // "zero matches" and "the read is broken".
    expect({
      filesRead: filesRead > 0,
      bytesRead: bytesRead > 1000,
      hits: hits.length > 0,
    }).toEqual({ filesRead: true, bytesRead: true, hits: true });
  });

  // A file the walk could not read contributes no hits and would otherwise pass
  // unnoticed — the silent half of the same failure.
  it("could read every file it walked", () => {
    expect(unreadable).toEqual([]);
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

  // A file row used to dispose of EVERY hit in its file, forever, including one
  // added tomorrow — so the guard's advertised property ("a new site fails by
  // default") held only for files with NO row. Diff review round 1 probed it:
  // swapping the bounded `execFileSync` in `overlayWiring.test.ts` for an
  // unbounded `spawnSync` left the guard silent, because the file already had a
  // row. The row asserted a reason that nothing checked.
  //
  // The two cases below make each row's own claim executable, by the only means
  // available to each kind.
  // COUNTING, not attribution. Round 3 showed the forward bracket scan could be
  // fooled by an ordinary Node child whose ARGUMENT contains a paren inside a
  // string — the scan ran on and credited a LATER call's ceiling to the new
  // unbounded one. False certification. Teaching the scanner about string
  // literals is a lexer, and the standing repair direction on a recognizer here
  // is NARROWING, so the guard stops attributing options to calls at all: a
  // MEMBER file must carry one ACCEPTED ceiling per spawn hit. Adding an
  // unbounded call moves the hits and not the ceilings; removing a ceiling moves
  // the ceilings and not the hits. Neither needs the guard to know which options
  // belong to which call.
  it("a MEMBER row's claim is CHECKED — one accepted ceiling per spawn hit", () => {
    // BOTH row kinds, not just the file form. The finding was about file rows,
    // but a `site` row carries the same `member` claim and nothing checked it
    // either — the same shape one row-kind over, which is what the class sweep
    // is for rather than repairing the instance review happened to name.
    const memberRows = DISPOSITIONS.filter((row) => row.member);
    const isMemberHit = (hit: Hit) =>
      memberRows.some((row) =>
        row.kind === "file"
          ? row.file === hit.file
          : row.file === hit.file && row.line === hit.line,
      );

    // Must-be-PRESENT control, and it is the load-bearing half: an absent-only
    // assertion agrees with total failure, so prove there is something to check.
    premiseHolds("at least one MEMBER row exists to check", memberRows.length > 0);
    const checked = hits.filter(isMemberHit);
    premiseHolds("the member rows actually cover swept hits", checked.length > 0);

    const short = [...new Set(checked.map((hit) => hit.file))]
      .map((file) => ({
        file,
        spawns: checked.filter((h) => h.file === file).length,
        ceilings: ceilingCount(sources.get(file) ?? ""),
      }))
      .filter((r) => r.ceilings < r.spawns)
      // Raw numbers, never a computed verdict: "4 spawn hits, 3 accepted
      // ceilings" says what to do; "unbounded child detected" does not.
      .map((r) => `${r.file}: ${r.spawns} spawn hit(s), ${r.ceilings} accepted ceiling(s)`);

    expect(short).toEqual([]);
  });

  // A COUNT was round 3's third finding: swapping a comment hit for a real
  // executed child leaves the number unchanged, so the row went on disposing of
  // a line whose meaning had changed underneath it. The pin is therefore the
  // exact hit LINES, digested — which no swap survives, and which is still
  // counting rather than recognizing: the guard never decides what a line MEANS,
  // only that the lines it was told about are the lines that are there.
  it("a NON-MEMBER row pins a DIGEST of its hit lines, so a swap re-opens it", () => {
    const drifted = DISPOSITIONS.filter(
      (row): row is Extract<Disposition, { kind: "file"; member: false }> =>
        row.kind === "file" && !row.member,
    )
      .map((row) => ({
        file: row.file,
        declared: row.hits,
        declaredDigest: row.digest,
        actualDigest: digestOf(hits.filter((h) => h.file === row.file)),
        actual: hits.filter((h) => h.file === row.file).length,
      }))
      .filter((r) => r.declared !== r.actual || r.declaredDigest !== r.actualDigest)
      // Raw values, not a computed verdict: "declares 4/ab12, found 5/cd34" says
      // what to do; "drift detected" does not.
      .map(
        (r) =>
          `${r.file}: row declares ${r.declared}/${r.declaredDigest}, ` +
          `walk found ${r.actual}/${r.actualDigest}`,
      );

    expect(drifted).toEqual([]);
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
  const fileRow: Disposition = {
    kind: "file",
    file: "a/b.ts",
    member: false,
    reason: "x",
    hits: 1,
    digest: "0".repeat(12),
  };
  const siteRow: Disposition = { kind: "site", file: "c/d.ts", line: 7, member: true, reason: "y" };
  const match = (hit: Hit, rows: readonly Disposition[]) =>
    rows.filter((row) =>
      row.kind === "file" ? row.file === hit.file : row.file === hit.file && row.line === hit.line,
    );

  it("a file row covers every line in its file", () => {
    expect(match({ file: "a/b.ts", line: 99, text: "", index: 0 }, [fileRow])).toEqual([fileRow]);
  });

  it("a site row covers only its own line", () => {
    expect(match({ file: "c/d.ts", line: 7, text: "", index: 0 }, [siteRow])).toEqual([siteRow]);
    expect(match({ file: "c/d.ts", line: 8, text: "", index: 0 }, [siteRow])).toEqual([]);
  });

  it("an unmapped file matches nothing", () => {
    expect(match({ file: "e/f.ts", line: 1, text: "", index: 0 }, [fileRow, siteRow])).toEqual([]);
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
