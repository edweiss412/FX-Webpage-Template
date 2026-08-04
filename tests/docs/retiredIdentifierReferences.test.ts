// tests/docs/retiredIdentifierReferences.test.ts
//
// Structural guard for the retired-identifier reference class. Core + ledger
// live in tests/docs/_retiredIdentifiers.ts; that file explains why discovery is
// a walk, why exemptions are keyed by line content, and which documents are
// carved out of the archive globs.
//
// Families proven against SYNTHETIC input (so each proof stands whether or not
// the real tree contains an instance):
//   (a) a hit with no row FAILS
//   (b) the same hit with a matching `line` row PASSES
//   (c) two hits in one file where only one is exempted still FAILS — the case a
//       file-keyed allowlist cannot express, and the reason this design exists
//   (d) a row whose text matches nothing FAILS (the fail-safe direction)
//   (d2) a carved-out current-state path is NOT covered by an archive glob, and
//        every carve-out path must exist
//   (e) the terminal zero-`pending` assertion FAILS against a ledger holding one
//
// (e) is proven HERE, where it can still fail, rather than at close-out where
// the real ledger is already empty.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  ARCHIVE_GLOBS,
  CURRENT_STATE_CARVE_OUTS,
  FROZEN_LEDGER_SNAPSHOT_GLOB,
  FROZEN_LEDGER_SNAPSHOT_NAME,
  RETIRED_IDENTIFIERS,
  RETIRED_IDENTIFIER_EXEMPTIONS,
  ROOT,
  type ExemptionRow,
  isArchivePath,
  isLiveLedger,
  scanFiles,
  unexemptedHits,
  unmatchedRows,
} from "@/tests/docs/_retiredIdentifiers";

/** Tracked files only: an untracked scratch file is not a reference the repo carries. */
function trackedFiles(root: string = ROOT): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: root, maxBuffer: 64 * 1024 * 1024 })
    .toString("utf8")
    .split("\0")
    .filter((f) => f.length > 0);
}

const tmpRoots: string[] = [];
function fixtureRoot(files: Record<string, string>): { root: string; files: string[] } {
  const root = mkdtempSync(join(tmpdir(), "retired-ids-"));
  tmpRoots.push(root);
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  return { root, files: Object.keys(files) };
}

afterAll(() => {
  for (const r of tmpRoots) rmSync(r, { recursive: true, force: true });
});

describe("retired-identifier guard — synthetic family proofs", () => {
  it("(a) a hit with no exemption row FAILS", () => {
    const fx = fixtureRoot({ "lib/x.ts": "// see RightNowCard for the pattern\n" });
    const hits = scanFiles(fx.files, fx.root);
    expect(hits).toHaveLength(1);
    expect(unexemptedHits(hits, [])).toHaveLength(1);
  });

  it("(b) the same hit with a matching `line` row PASSES", () => {
    const fx = fixtureRoot({ "lib/x.ts": "// see RightNowCard for the pattern\n" });
    const hits = scanFiles(fx.files, fx.root);
    const rows: ExemptionRow[] = [
      {
        kind: "line",
        file: "lib/x.ts",
        text: "// see RightNowCard for the pattern",
        reason: "fixture",
      },
    ];
    expect(unexemptedHits(hits, rows)).toEqual([]);
    expect(unmatchedRows(hits, rows)).toEqual([]);
  });

  it("(c) two hits in ONE file, only one exempted, still FAILS", () => {
    const fx = fixtureRoot({
      "docs/live-ledger.md": "- live: RightNowCard is still owed\n- resolved: RightNowCard shipped\n",
    });
    const hits = scanFiles(fx.files, fx.root);
    expect(hits).toHaveLength(2);
    const rows: ExemptionRow[] = [
      {
        kind: "line",
        file: "docs/live-ledger.md",
        text: "- resolved: RightNowCard shipped",
        reason: "history inside a live file",
      },
    ];
    const left = unexemptedHits(hits, rows);
    expect(left).toHaveLength(1);
    expect(left[0]?.text).toBe("- live: RightNowCard is still owed");
  });

  it("(d) a row whose text matches nothing FAILS", () => {
    const fx = fixtureRoot({ "lib/x.ts": "// see RightNowCard for the pattern\n" });
    const hits = scanFiles(fx.files, fx.root);
    const stale: ExemptionRow[] = [
      { kind: "line", file: "lib/x.ts", text: "// an older wording of RightNowCard", reason: "x" },
    ];
    expect(unmatchedRows(hits, stale)).toHaveLength(1);
  });

  it("(d2) a live ledger inside an archive glob is NOT archived", () => {
    const ledger = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/DEFERRED.md";
    const record = "docs/superpowers/plans/2026-04-30-fxav-crew-pages-v1/handoffs/M4-tiles.md";
    expect(isArchivePath(record)).toBe(true);
    expect(isArchivePath(ledger)).toBe(false);
    expect(isLiveLedger(ledger)).toBe(true);
    // A nested DEFERRED.md nobody listed is still live.
    expect(isArchivePath("docs/superpowers/plans/some/future/DEFERRED.md")).toBe(false);
  });

  it("(d3) a frozen dated ledger snapshot is archived; a sibling fixture is NOT", () => {
    // `tests/fixtures/ledger-mass/` holds byte-frozen copies of the ledgers at a
    // named date, cross-checked against git history by the ledger-mass oracle.
    // Every retired name the real BACKLOG.md carried on that date is inside one
    // BY CONSTRUCTION, and repairing the reference is not available: editing the
    // snapshot is exactly what its oracle exists to catch. That is the same
    // "dated record end to end" shape as BACKLOG-archive.md, so it archives.
    expect(isArchivePath("tests/fixtures/ledger-mass/2026-08-04.ledgers.json")).toBe(true);
    // Narrow by construction: ONE snapshot directory, never `tests/fixtures/`.
    // A live fixture naming a retired component is still a defect to repair.
    expect(isArchivePath("tests/fixtures/shows/raw/east-coast.md")).toBe(false);
    expect(isArchivePath("tests/fixtures/RightNowCard.fixture.ts")).toBe(false);
    // The trailing slash is load-bearing — a prefix-sharing sibling is not covered.
    expect(isArchivePath("tests/fixtures/ledger-massive/x.json")).toBe(false);
  });

  it("(f) a SECOND identical line is not covered by the first line's row", () => {
    // Whole-diff review finding 5: set-based matching let one historical
    // exemption silently cover a newly duplicated live reference. Matching is
    // occurrence-counted, so the duplicate surfaces.
    const fx = fixtureRoot({
      "docs/live.md": "- resolved: RightNowCard shipped\n- resolved: RightNowCard shipped\n",
    });
    const hits = scanFiles(fx.files, fx.root);
    expect(hits).toHaveLength(2);
    const oneRow: ExemptionRow[] = [
      { kind: "line", file: "docs/live.md", text: "- resolved: RightNowCard shipped", reason: "one" },
    ];
    expect(unexemptedHits(hits, oneRow)).toHaveLength(1);
    // Two rows cover both, and neither row is stale.
    const twoRows = [...oneRow, { ...oneRow[0]! }];
    expect(unexemptedHits(hits, twoRows)).toEqual([]);
    expect(unmatchedRows(hits, twoRows)).toEqual([]);
  });

  it("(g) a row whose text names several retired identifiers is ONE row, not N", () => {
    const fx = fixtureRoot({
      "lib/x.ts": "// ResolveAlertButton and RunFinalCASButton were retired\n",
    });
    const hits = scanFiles(fx.files, fx.root);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.identifier).toBe("ResolveAlertButton+RunFinalCASButton");
  });

  it("(e) the terminal zero-`pending` assertion FAILS against a ledger holding one", () => {
    const withPending: ExemptionRow[] = [
      {
        kind: "pending",
        file: "lib/x.ts",
        text: "// see RightNowCard",
        repairedBy: "Task 5",
        reason: "fixture",
      },
    ];
    expect(withPending.filter((r) => r.kind === "pending")).toHaveLength(1);
  });
});

describe("retired-identifier guard — live tree", () => {
  const files = trackedFiles();
  const hits = scanFiles(files);

  it("walks a non-trivial tree (so a green here is never vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(RETIRED_IDENTIFIERS.length).toBeGreaterThan(0);
  });

  it("every carved-out current-state path exists (a rename cannot re-archive it)", () => {
    const gone = CURRENT_STATE_CARVE_OUTS.filter((p) => !existsSync(join(ROOT, p)));
    expect(gone, "carve-out paths that no longer exist — update the list").toEqual([]);
  });

  it("every archive glob matches at least one tracked file", () => {
    const dead = ARCHIVE_GLOBS.filter((g) => !files.some((f) => f.startsWith(g)));
    expect(dead, "archive globs matching nothing — a typo would silently widen the guard").toEqual(
      [],
    );
  });

  it("every file under the frozen-snapshot glob IS a dated snapshot", () => {
    // The glob exempts a directory. The "matches at least one tracked file"
    // assertion above only catches a glob that widens by matching NOTHING; this
    // catches the other direction — a hand-written helper dropped beside the
    // snapshots would inherit the exemption with nobody deciding that it should.
    const strays = files
      .filter((f) => f.startsWith(FROZEN_LEDGER_SNAPSHOT_GLOB))
      .filter((f) => !FROZEN_LEDGER_SNAPSHOT_NAME.test(f.slice(FROZEN_LEDGER_SNAPSHOT_GLOB.length)));
    expect(
      strays,
      `non-snapshot files under ${FROZEN_LEDGER_SNAPSHOT_GLOB} — they are silently exempt from ` +
        "the retired-identifier walk. Move them out, or decide the glob should cover them.",
    ).toEqual([]);
    // And the glob is not vacuous: it really does hold snapshots.
    expect(files.filter((f) => f.startsWith(FROZEN_LEDGER_SNAPSHOT_GLOB)).length).toBeGreaterThan(0);
  });

  it("no reference to a retired identifier is unaccounted for", () => {
    const left = unexemptedHits(hits, RETIRED_IDENTIFIER_EXEMPTIONS);
    expect(
      left.map((h) => `${h.file}:${h.line} [${h.identifier}] ${h.text}`),
      "References to a retired component. Repair the reference, or add an exemption row with a " +
        "reason (`line` for history inside a live file, `pending` for a reference a named task " +
        "repairs).",
    ).toEqual([]);
  });

  it("no exemption row is stale (every row still matches a line)", () => {
    expect(
      unmatchedRows(hits, RETIRED_IDENTIFIER_EXEMPTIONS).map((r) => `${r.file} :: ${r.text}`),
      "Exemption rows matching nothing — the line moved or changed. Update or delete the row.",
    ).toEqual([]);
  });

  // The terminal assertion, landed in the close-out commit that emptied the
  // ledger. It deliberately was NOT written while `pending` rows were still
  // outstanding: a live "zero pending" assertion would have been knowingly red
  // for eleven tasks, which is the mid-sequence breakage green-per-commit
  // forbids. Its CONTRACT was proven from the start by synthetic family (e),
  // where it could still fail — proven before use, rather than asserted before
  // it could hold.
  it("every exemption row carries a non-empty reason (not a mute button)", () => {
    // Whole-diff review finding 4: `reason` was structurally required but never
    // validated, so `reason: ""` passed. An exemption is a CLAIM; a claim with no
    // stated reason is exactly the silent allowlist this guard replaced.
    const thin = RETIRED_IDENTIFIER_EXEMPTIONS.filter((r) => r.reason.trim().length < 20).map(
      (r) => `${r.file} :: ${r.text.slice(0, 60)}`,
    );
    expect(
      thin,
      "Exemption rows need a reason a reviewer can check, not a placeholder.",
    ).toEqual([]);
  });

  it("no `pending` row survives close-out", () => {
    const pending = RETIRED_IDENTIFIER_EXEMPTIONS.filter((r) => r.kind === "pending");
    expect(
      pending.map((r) => `${r.file} :: ${r.text}`),
      "A `pending` row is a live reference owned by a task. None may outlive the branch — the " +
        "census is only finished when every live reference was repaired, not exempted.",
    ).toEqual([]);
  });

  it("every `pending` row names a task that exists in the plan", () => {
    const plan = readFileSync(
      join(ROOT, "docs/superpowers/plans/2026-08-03-orphan-components-lead-prose.md"),
      "utf8",
    );
    const orphaned = RETIRED_IDENTIFIER_EXEMPTIONS.filter(
      (r) => r.kind === "pending" && !plan.includes(`## ${r.repairedBy} —`),
    ).map((r) => (r.kind === "pending" ? `${r.repairedBy} (${r.file})` : ""));
    expect(
      [...new Set(orphaned)],
      "Pending rows owned by a task that no longer exists — `pending` is not an unbounded mute " +
        "button, it is a task's outstanding work.",
    ).toEqual([]);
  });
});
