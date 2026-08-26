/**
 * The shared ledger parser, moved out of `tests/docs/_metaLedgerInProgress.test.ts`
 * so a script can consume it without importing a vitest module whose top-level
 * `describe`/`it` would run on import.
 *
 * The entry set comes from the authoritative walker (`extractEntries`), never a
 * local heading regex — the retired one required an em dash after the id, which
 * `## BL-NULLCODE-STAMP-BATCH-2 residuals (2026-07-03)` does not have, so a marker
 * on that entry was attributed to the preceding one with every vacuity gate
 * satisfied.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { extractEntries } from "@/tests/docs/_ledgerMdast";
import { ledgerFiles, ledgerItems, optsFor } from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
const LEDGERS = ["BACKLOG.md", "BACKLOG-archive.md", "DEFERRED.md", "DEFERRED-archive.md"] as const;

describe("ledgerFiles", () => {
  it("discovers the four ledgers from disk", () => {
    expect(ledgerFiles(ROOT)).toEqual([...LEDGERS].sort());
  });
});

describe("optsFor", () => {
  it("maps each ledger to its own ExtractOpts", () => {
    // Applying the backlog opts to a deferred file yields ZERO entries, which is
    // a whole ledger disappearing silently — the per-file vacuity gate exists
    // for exactly this, but only if the mapping is right in the first place.
    expect(optsFor("DEFERRED.md")).toEqual({ requirePrefix: null, levels: [3] });
    expect(optsFor("DEFERRED-archive.md")).toEqual({ requirePrefix: null, levels: [3] });
    expect(optsFor("BACKLOG.md")).toEqual({ requirePrefix: "BL-", levels: [2, 3] });
    expect(optsFor("BACKLOG-archive.md")).toEqual({ requirePrefix: "BL-", levels: [2, 3] });
  });
});

describe("ledgerItems", () => {
  it("returns exactly the authoritative entry set, per ledger", () => {
    // Asserted against extractEntries itself rather than a hardcoded count, which
    // would rot as the corpus grows. Catches two mutants that pass every
    // per-entry assertion below: a grammar that drops the live struck heading in
    // DEFERRED-archive.md, and a `levels: [2]` mutant that drops every H3 entry
    // in BACKLOG-archive.md while leaving the file non-empty.
    for (const f of LEDGERS) {
      const text = read(f);
      const want = extractEntries(text, optsFor(f)).map((e) => e.id);
      expect(want.length, `${f} fixture premise: it has entries`).toBeGreaterThan(0);
      expect(
        ledgerItems(f, text).map((i) => i.id),
        `${f} entry set drifted`,
      ).toEqual(want);
    }
  });

  it("points each entry at the line its own heading is on", () => {
    // Positivity and monotonicity are both survivable by a mutant that adds one
    // to every line, which would shift every span and drop hunks landing on a
    // heading. Asserting the line's CONTENT names the id is what that fails.
    for (const f of LEDGERS) {
      const text = read(f);
      const lines = text.split("\n");
      const items = ledgerItems(f, text);
      items.forEach((it, n) => {
        const heading = lines[it.line - 1] ?? "";
        // Matched as a markdown heading (2-3 hashes then space), not via a
        // startsWith("#") idiom, which the comment-handling guard reads as
        // comment stripping — and which would also accept "#tag".
        expect(heading, `${f}:${it.line} is not a heading`).toMatch(/^#{2,3}\s/);
        expect(heading, `${f}:${it.line} does not name ${it.id}`).toContain(it.id);
        if (n > 0) expect(it.line, `${f} spans not increasing`).toBeGreaterThan(items[n - 1]!.line);
      });
    }
  });

  it("resolves the entries whose heading shapes broke the retired recognizer", () => {
    // DERIVED, not pinned to one id. This assertion used to name
    // BL-NULLCODE-STAMP-BATCH-2 as its no-em-dash example, and archiving that
    // entry in #904 broke it — the SHAPE was still present in the corpus, but
    // the one row standing in for it had graduated. A guard over a shape should
    // fail when the shape stops resolving, not when a particular row moves.
    //
    // The premise makes it non-vacuous: if the corpus ever contains no
    // em-dash-free entry heading at all, this reports that rather than passing
    // on an empty set.
    const emDashFree = ledgerFiles().flatMap((f) => {
      const lines = read(f).split("\n");
      return ledgerItems(f, read(f))
        .filter((i) => !(lines[i.line - 1] ?? "").includes("\u2014"))
        .map((i) => `${f}:${i.id}`);
    });
    expect(
      emDashFree.length,
      "no em-dash-free entry heading anywhere in the ledgers — this guard now proves nothing",
    ).toBeGreaterThan(0);

    // The struck-id shape, still pinned by id because DEFERRED-archive.md is a
    // frozen historical file: nothing graduates out of it.
    expect(
      ledgerItems("DEFERRED-archive.md", read("DEFERRED-archive.md")).map((i) => i.id),
    ).toContain("MODAL-CLOSE-EXIT-ANIM-1"); // struck id
  });

  it("undo announcement channel entries are visible, having lived at an invisible depth", () => {
    // DEFERRED.md is walked at `levels: [3]`, so the three impeccable-critique
    // deferrals from `feat/sync-feed-undo-announce` were dark to EVERY
    // walker-built guard while they sat as bold runs under one `##` section
    // heading: uncounted by the census, unreachable by the claim reader, and
    // unsizeable by the sizing guard. Content invisible to the walker is content
    // no guard can hold, which is why the ids are asserted here rather than the
    // section's prose.
    const ids = ledgerItems("DEFERRED.md", read("DEFERRED.md")).map((i) => i.id);
    for (const id of ["UNDO-DIALOG-LABEL-CONSTANT-1"]) {
      expect(ids, `${id} is invisible to the DEFERRED.md walker`).toContain(id);
    }

    // UNDO-FAILURE-REANNOUNCE-1 graduated to DEFERRED-archive.md on 2026-08-06
    // (L-wave: a documented limit its own spec had already ratified). It stays
    // asserted, moved rather than deleted, because the claim this test makes is
    // about WALKER VISIBILITY, not about which file the entry sits in — an
    // archived entry that no walker can see is the same defect in a quieter
    // place. Deleting the row would have retired the assertion at the exact
    // moment it started covering new ground: the archive move first wrote a
    // `##` heading, which DEFERRED's `levels: [3]` walk cannot see, and this
    // shape of assertion is what catches that.
    const archived = ledgerItems("DEFERRED-archive.md", read("DEFERRED-archive.md")).map(
      (i) => i.id,
    );
    expect(
      archived,
      "UNDO-FAILURE-REANNOUNCE-1 is invisible to the DEFERRED-archive.md walker",
    ).toContain("UNDO-FAILURE-REANNOUNCE-1");
    // UNDO-UNCATALOGUED-CODE-CARD-1 graduated to DEFERRED-archive.md on
    // 2026-08-10 (M-wave 2 W-DOCS filing-bar demotion) — same move-not-delete
    // treatment as the row above, for the same reason.
    expect(
      archived,
      "UNDO-UNCATALOGUED-CODE-CARD-1 is invisible to the DEFERRED-archive.md walker",
    ).toContain("UNDO-UNCATALOGUED-CODE-CARD-1");
  });

  it("gives every entry a span ending before the next entry starts", () => {
    for (const f of LEDGERS) {
      const items = ledgerItems(f, read(f));
      items.forEach((it, n) => {
        expect(it.endLine).toBeGreaterThanOrEqual(it.line);
        const next = items[n + 1];
        if (next) expect(it.endLine, `${f}:${it.id} span overruns`).toBeLessThan(next.line);
      });
    }
  });

  it("parses a meta line into separate fields rather than one greedy blob", () => {
    const [entry] = ledgerItems(
      "BACKLOG.md",
      "## BL-PLANT — planted\n\n**Status:** OPEN · **Branch:** feat/x · **Severity:** low\n",
    );
    expect(entry?.fields.Status).toBe("OPEN");
    expect(entry?.fields.Branch).toBe("feat/x");
    expect(entry?.fields.Severity).toBe("low");
  });
});

describe("the spawn seam is structural, not merely conventional", () => {
  // Whole-diff review F9 / mutation family M9: a recorder wrapping GitSurface
  // cannot see a mutant that imports node:child_process directly inside the
  // core, so the ban is asserted at the source level. Follows the P5-noio
  // precedent that already keeps node:fs out of _ledgerMdast.ts.
  it.each([
    "scripts/lib/ledger-fields.ts",
    "scripts/lib/ledger-claims-core.ts",
    "scripts/lib/ledger-check.ts",
  ])("%s spawns nothing", (rel) => {
    const src = readFileSync(join(ROOT, rel), "utf8");
    expect(src, `${rel} must not import node:child_process`).not.toMatch(
      /from\s+["']node:child_process["']|require\(["']node:child_process["']\)/,
    );
  });

  it("ledger-git.ts is the module that DOES spawn, so the ban above is meaningful", () => {
    // Without this, deleting every spawn everywhere would satisfy the bans.
    const src = readFileSync(join(ROOT, "scripts/lib/ledger-git.ts"), "utf8");
    expect(src).toMatch(/from\s+["']node:child_process["']/);
  });
});

describe("no assertion in this diff is silently vacuous", () => {
  // Two escaping mutants in this branch came from shell quoting, not reasoning:
  // a literal U+0008 where `\b` was meant, which made two regexes match nothing,
  // and a heredoc-mangled fixture. Neither was visible by reading the test.
  //
  // A control character inside a regex or string literal is never intentional
  // here, and it is exactly the shape that turns an assertion into a no-op while
  // still looking correct in review.
  it("contains no stray control characters in any file this branch adds", () => {
    // CI checks out a single branch with no `origin/main` ref, so the diff that
    // scopes this locally exits 128 with "unknown revision" there, and the guard
    // dies rather than running.
    //
    // Resolution order: the ref if present, else fetch main and diff against
    // what came back. The last resort is this branch's OWN surface, listed
    // explicitly -- NOT "every tracked source file", which was tried and is
    // wrong: tests/adminAlerts/projectIdentityContext.test.ts:102 embeds a
    // U+0007 deliberately, as input to the sanitizer it tests. A guard that
    // fails on a legitimate control character elsewhere in the repo gets turned
    // off, and then it catches nothing at all.
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 60_000 })
        .split("\n")
        .map((f) => f.trim())
        // .ts and .mjs only. This branch's surface is scripts and tests, so no
        // component files are in range -- and the component extension's literal
        // name cannot appear here at all: the spawn-convention guard under
        // tests/cross-cutting/ matches it lexically, and any file naming it
        // alongside a spawn call is required to reference the absolute bin.
        .filter((f) => f !== "");
    // Unfiltered vs in-range, recorded from the SAME invocation so the two can
    // never diverge — and so no second `git diff` is needed. A three-dot diff
    // throws on the shallow CI checkout, which is the whole reason the fetch
    // fallback below uses two dots.
    const inRange = (all: string[]) => all.filter((f) => /\.(ts|mjs)$/.test(f));

    let files: string[];
    // The base actually used, recorded as it is chosen. The previous version
    // fetched the explicit ref `main`, which updates FETCH_HEAD and NOT
    // origin/main, then tried to resolve origin/main again to decide whether
    // the base equalled HEAD -- so on a main push, where the diff is correctly
    // empty, it fell through to the anti-vacuity failure (whole-diff R14 F2).
    let base: string | null = null;
    const rev = (r: string) =>
      execFileSync("git", ["rev-parse", r], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 30_000,
      }).trim();
    try {
      git(["rev-parse", "--verify", "origin/main"]);
      base = rev("origin/main");
      files = git(["diff", "--name-only", "origin/main...HEAD"]);
    } catch {
      try {
        const shallow =
          execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
            cwd: ROOT,
            encoding: "utf8",
            timeout: 30_000,
          }).trim() === "true";
        // --depth=1 ONLY when the checkout is ALREADY shallow: passing it to a
        // full clone converts that clone to shallow and breaks ancestry for
        // every later command in the worktree.
        execFileSync(
          "git",
          ["fetch", "--no-tags", ...(shallow ? ["--depth=1"] : []), "origin", "main"],
          { cwd: ROOT, timeout: 60_000 },
        );
        base = rev("FETCH_HEAD");
        // Two-dot against the fetched tip: --depth=1 leaves no common history,
        // so a three-dot merge-base would fail exactly where this runs.
        files = git(["diff", "--name-only", "FETCH_HEAD"]);
      } catch {
        files = git(["ls-files", "scripts/lib", "scripts", "tests/scripts", "tests/docs"]).filter(
          (f) => /ledger|preflight/.test(f),
        );
      }
    }

    // Zero files is the CORRECT answer in two cases, and the vacuity check must
    // excuse both or it fails branches doing nothing wrong.
    //
    //  1. A main push, where the base IS HEAD -- this suite runs on `push: main`,
    //     so demanding a non-empty set would fail the guard on every merge.
    //  2. A branch whose diff is NON-EMPTY but contains no file this guard scans.
    //     The helper above deliberately narrows to `.ts`/`.mjs`, reasoning that
    //     "this branch's surface is scripts and tests". True of the branch that
    //     wrote it; not true in general, because this guard runs on EVERY branch
    //     and a component-only branch legitimately has nothing in range. Conflating
    //     "changed nothing I scan" with "the guard is broken" failed
    //     `fix/identity-chip-sr-separator-mechanism`, whose entire diff is one
    //     component and its test — neither of which this guard scans.
    //
    // What remains is the check worth having: an EMPTY diff where base and HEAD
    // differ means the diff resolution itself went wrong. Proven by mutant --
    // forcing rawDiffCount to 0 makes this fire again.
    const rawDiffCount = files.length;
    files = inRange(files);
    const legitimatelyEmpty =
      files.length === 0 && base !== null && (base === rev("HEAD") || rawDiffCount > 0);
    if (!legitimatelyEmpty) {
      expect(files.length, "no source files to scan — the guard would be vacuous").toBeGreaterThan(
        0,
      );
    }

    const offenders: string[] = [];
    for (const rel of files) {
      let text: string;
      try {
        text = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        continue; // deleted in this diff
      }
      text.split("\n").forEach((line, n) => {
        // \t is legitimate; everything else below 0x20 is not.
        const hit = [...line].find((c) => c.charCodeAt(0) < 32 && c !== "\t");
        if (hit)
          offenders.push(
            `${rel}:${n + 1} contains U+${hit.charCodeAt(0).toString(16).padStart(4, "0")}`,
          );
      });
    }
    expect(offenders, "a control character here makes an assertion match nothing").toEqual([]);
  });
});
