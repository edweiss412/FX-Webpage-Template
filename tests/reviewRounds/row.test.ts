import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  adoptionBoundary,
  COUNTED_STAGES,
  ROUND_THRESHOLD,
  STAGES,
} from "../../lib/reviewRounds/constants";
import { appendRow, parseRow, serializeRow, type ReviewRoundRow } from "../../lib/reviewRounds/row";

const ROW: ReviewRoundRow = {
  stage: "diff",
  round: 3,
  branch: "feat/foo",
  baseSha: "20fccb1f3a0c",
  label: "guard-scope",
  status: "verdict",
  verdict: "BLOCKING",
  failureReason: null,
  findingCount: 5,
  startedAt: "2026-08-04T14:02:11.000Z",
  endedAt: "2026-08-04T14:19:40.000Z",
  briefPath: ".review/foo-r3/brief.md",
  outDir: ".review/foo-r3",
  guardVersion: 1,
  recoveredFrom: null,
};

describe("review-round constants (spec §4.3)", () => {
  it("pins the canonical threshold and the counted-stage subset", () => {
    expect(ROUND_THRESHOLD).toBe(4);
    expect([...STAGES]).toEqual(["spec", "plan", "diff", "task"]);
    // Failure caught: `task` leaking into the counted set, which would let four
    // non-review dispatches manufacture a filing obligation out of nothing.
    expect([...COUNTED_STAGES]).toEqual(["spec", "plan", "diff"]);
    expect(COUNTED_STAGES).not.toContain("task");
  });
});

describe("adoption boundary (spec §9)", () => {
  // Failure caught: a ref-less `git log`, which walks HEAD. On the branch that
  // ADDS the constants module HEAD's first-parent history already contains that
  // addition, so the query answers with the branch-local commit's date - a
  // boundary EARLIER than the merge. Early is the unsafe direction: every arc
  // that merged between that commit and the real merge is then printed as a
  // silent arc, as fact. Adoption is a fact about main, and this case is the
  // one that fails when the `main` ref is dropped from the argv.
  it("is null until the module is on main, then is the merge commit's date", () => {
    const repo = mkdtempSync(join(tmpdir(), "boundary-"));
    const git = (...args: string[]): string =>
      execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");
    writeFileSync(join(repo, "seed.txt"), "seed\n");
    git("add", "seed.txt");
    git("commit", "-qm", "seed");

    git("checkout", "-q", "-b", "feat/adopting");
    const constants = join(repo, "lib", "reviewRounds", "constants.ts");
    mkdirSync(dirname(constants), { recursive: true });
    writeFileSync(constants, "export const ROUND_THRESHOLD = 4;\n");
    git("add", "lib/reviewRounds/constants.ts");
    git("commit", "-qm", "feat: constants");

    // The file IS reachable from HEAD here, and the answer must still be null:
    // nothing has adopted anything until the merge lands.
    expect(adoptionBoundary(repo)).toBeNull();

    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "-m", "merge feat/adopting", "feat/adopting");
    // Derived from the fixture repo's own log, never a literal: the boundary IS
    // the committer date of the first-parent merge that put the file on main.
    const mergeDate = git("log", "-1", "--first-parent", "--format=%cI", "main");
    expect(adoptionBoundary(repo)).toBe(mergeDate);
  });
});

describe("row serialization (spec §5.3)", () => {
  it("round-trips every field through one newline-terminated line", () => {
    const line = serializeRow(ROW);
    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd()).not.toContain("\n");
    const parsed = parseRow(line);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.row).toEqual(ROW);
  });

  // Failure caught: a row that grows unbounded. Spec §5.3 - all scalars, no
  // array field, no free-text field, so a row is bounded by construction.
  it("holds no array or object field", () => {
    for (const [key, value] of Object.entries(ROW)) {
      expect(Array.isArray(value), `${key} is an array`).toBe(false);
      expect(typeof value === "object" && value !== null, `${key} is an object`).toBe(false);
    }
  });

  // Failure caught: a malformed row swallowed as an empty corpus, which reads
  // as "this arc ran no rounds" - an obliged arc reported compliant.
  it.each([
    ["not json at all", "{nope"],
    ["missing stage", JSON.stringify({ ...ROW, stage: undefined })],
    ["stage outside the accept-set", JSON.stringify({ ...ROW, stage: "review" })],
    ["round below 1", JSON.stringify({ ...ROW, round: 0 })],
    ["non-integer round", JSON.stringify({ ...ROW, round: 1.5 })],
    // An UNSAFE integer is integral, so `Number.isInteger` admits it - and the
    // JSON parse has already rounded it, so the value on the row is one no
    // author ever wrote. The wrapper refuses it at the flag now; this is the
    // boundary that catches a corpus written by anything else.
    // Built by TEXT substitution, not object spread: `{...ROW, round: <literal>}`
    // rounds in JS before `JSON.stringify` ever runs, so the fixture would not
    // contain the unsafe digits it is named for.
    ["unsafe-integer round", JSON.stringify(ROW).replace(/"round":3/, '"round":9007199254740993')],
    ["status outside the two literals", JSON.stringify({ ...ROW, status: "wrapper_error" })],
  ])("rejects %s with a problem string", (_name, line) => {
    const parsed = parseRow(line);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.problem.length).toBeGreaterThan(0);
  });

  // The boundary, so the rejection above is not "reject anything large".
  it("accepts MAX_SAFE_INTEGER as a round", () => {
    const parsed = parseRow(JSON.stringify({ ...ROW, round: Number.MAX_SAFE_INTEGER }));
    expect(parsed.ok).toBe(true);
  });

  // The unsafe-integer defect recurred THREE times across three review rounds -
  // `--round`, then the declared count, then `findingCount` here - because each
  // repair fixed the named site and the sweep stopped there. So this closes the
  // CLASS instead of the instance: the field list is derived from the fixture,
  // so a numeric field added later is covered by default rather than silently
  // exempt, which is the same fail-by-default posture the corpus walk uses.
  const NUMERIC_FIELDS = Object.entries(ROW)
    .filter(([, v]) => typeof v === "number")
    .map(([k]) => k);

  it("covers every numeric field on the row", () => {
    // Guards the derivation itself: a fixture that stopped populating one of
    // these would shrink the table silently and the suite would still pass.
    expect(NUMERIC_FIELDS.sort()).toEqual(["findingCount", "guardVersion", "round"]);
  });

  it.each(NUMERIC_FIELDS)("rejects an unsafe integer in %s", (field) => {
    // TEXT substitution: `{...ROW, [field]: <literal>}` rounds in JS before
    // `JSON.stringify` runs, so the fixture would not carry the unsafe digits.
    const line = JSON.stringify(ROW).replace(
      new RegExp(`"${field}":\\d+`),
      () => `"${field}":9007199254740993`,
    );
    expect(line).toContain("9007199254740993");
    expect(parseRow(line).ok).toBe(false);
  });

  it.each(NUMERIC_FIELDS)("still accepts a safe integer in %s", (field) => {
    const line = JSON.stringify(ROW).replace(
      new RegExp(`"${field}":\\d+`),
      () => `"${field}":${Number.MAX_SAFE_INTEGER}`,
    );
    expect(parseRow(line).ok).toBe(true);
  });

  // Failure caught: `null` findingCount rejected as malformed, which would make
  // every reviewer that omits the declared line poison its own corpus.
  it("accepts a null findingCount and a non-null failureReason together", () => {
    const recovered = { ...ROW, findingCount: null, failureReason: "attempts_exhausted" };
    const parsed = parseRow(serializeRow(recovered));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.row).toEqual(recovered);
  });
});

describe("append (spec §5.2)", () => {
  it("creates missing parent directories and appends without rewriting", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-rounds-"));
    const file = join(dir, "feat", "foo", "20fccb1f3a0c.jsonl");
    expect(appendRow(file, ROW).ok).toBe(true);
    expect(appendRow(file, { ...ROW, round: 4 }).ok).toBe(true);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    // Derived from what was written, not from a literal.
    expect(lines.map((l) => (parseRow(l) as { row: ReviewRoundRow }).row.round)).toEqual([3, 4]);
  });

  // Failure caught: telemetry breaking a review. A corpus that cannot be
  // written must degrade to a reported problem, never an exception.
  it("returns a problem instead of throwing when the file is unwritable", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-rounds-ro-"));
    const file = join(dir, "locked.jsonl");
    writeFileSync(file, "");
    chmodSync(file, 0o444);
    const result = appendRow(file, ROW);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problem.length).toBeGreaterThan(0);
  });

  // Failure caught: a previous row without a trailing newline silently merging
  // with the next one, producing a single unparseable line. This is the
  // `echo >>` defect class the project rule names.
  it("recovers when the existing file lacks a trailing newline", () => {
    const dir = mkdtempSync(join(tmpdir(), "review-rounds-nl-"));
    const file = join(dir, "arc.jsonl");
    writeFileSync(file, serializeRow(ROW).trimEnd());
    expect(appendRow(file, { ...ROW, round: 4 }).ok).toBe(true);
    const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => parseRow(l).ok)).toBe(true);
  });
});
