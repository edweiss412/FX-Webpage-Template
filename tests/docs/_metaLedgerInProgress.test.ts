// Guard over the IN-PROGRESS convention in the backlog/deferred ledgers.
//
// WHY THIS EXISTS. The ledgers record what is queued, blocked, and accepted —
// but nothing recorded what is being worked on RIGHT NOW. Across all four files
// there was no Status value and no field expressing it, so "is anyone on this?"
// was answerable only by asking a human or reading branch names. The convention
// this guard protects closes that gap:
//
//   **Status:** IN PROGRESS · **Branch:** feat/whatever
//   **Status:** IN PROGRESS · **PR:** #681
//
// The failure this catches, concretely: work starts, the entry is marked, the PR
// merges, and the marker is never cleared. Six weeks later the queue claims three
// things are in flight and none of them are. A stale IN PROGRESS is worse than no
// marker at all, because it makes the one honest signal in the file untrustworthy
// — and a reader who has been burned once stops believing the other five statuses
// too. So the marker has to point at something checkable, and this guard is what
// makes forgetting to clear it fail at CI time rather than rot quietly.
//
// SCOPE, and how it differs from the ratified boundary in
// _metaLedgerReferentialIntegrity.test.ts. That guard deliberately does NOT
// check field schemas, because the ledgers have no universal field set and a
// schema assertion there would be a rewrite rather than a guard. This one does
// not either: it asserts NOTHING about an entry that does not opt in. Every rule
// below is conditional on the entry already declaring in-progress (or already
// carrying one of its fields). An entry with no Status, no Branch, and no Owner
// is untouched — which is all 97 live entries as of this commit. The convention
// costs nothing until someone uses it, and becomes self-enforcing the moment
// they do.
//
// The ledger list is derived from the filesystem, not hardcoded, so a NEW ledger
// file is covered by default rather than silently exempt.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BRANCH_SHAPE,
  PR_SHAPE,
  flightFieldsOn,
  isInProgress,
  ledgerFiles,
  ledgerItems,
  type LedgerItem,
} from "@/scripts/lib/ledger-fields";

const ROOT = join(__dirname, "..", "..");

/** An archive file holds finished work; nothing in one can be in flight. */
const isArchive = (file: string) => /-archive\.md$/.test(file);

const readLedgers = () =>
  ledgerFiles().flatMap((f) => ledgerItems(f, readFileSync(join(ROOT, f), "utf8")));

describe("ledger IN PROGRESS convention", () => {
  const items = readLedgers();

  it("finds the ledgers and parses entries out of them", () => {
    // Guards the guard: a parser that silently matched nothing would make every
    // rule below vacuously true, which is the failure mode a conditional guard
    // is most exposed to.
    expect(ledgerFiles().length).toBeGreaterThanOrEqual(4);
    expect(items.length).toBeGreaterThan(100);
    expect(items.filter((i) => i.fields.Status !== undefined).length).toBeGreaterThan(20);
  });

  it("gives every in-progress entry a branch or a PR to point at", () => {
    const bad = items
      .filter(isInProgress)
      .filter((i) => !(i.fields.Branch || i.fields.PR))
      .map((i) => `${i.file}:${i.line} ${i.id}`);
    expect(bad, "IN PROGRESS with nothing to check it against — unactionable, and unfalsifiable when it goes stale").toEqual([]);
  });

  it("keeps in-progress out of the archives", () => {
    const bad = items
      .filter((i) => isArchive(i.file) && isInProgress(i))
      .map((i) => `${i.file}:${i.line} ${i.id}`);
    expect(bad, "archived work cannot be in flight").toEqual([]);
  });

  it("does not let a flight field appear without the status that explains it", () => {
    // The inverse rule, and the one that keeps prose and viewer agreeing: the
    // ledger viewer treats a bare **Branch:** as in-progress, so an entry
    // carrying one while its Status says something else renders as a state its
    // own prose denies.
    const bad = items
      .filter((i) => !isArchive(i.file))
      .filter((i) => flightFieldsOn(i).length > 0 && !isInProgress(i))
      .map((i) => `${i.file}:${i.line} ${i.id} has ${flightFieldsOn(i).join("/")} but Status=${JSON.stringify(i.fields.Status ?? null)}`);
    expect(bad, "flight fields without IN PROGRESS").toEqual([]);
  });

  it("requires branch and PR values to be shaped like real ones", () => {
    const bad: string[] = [];
    for (const i of items.filter(isInProgress)) {
      if (i.fields.Branch) {
        const b = i.fields.Branch.replace(/^`|`$/g, "").trim();
        if (!BRANCH_SHAPE.test(b)) bad.push(`${i.file}:${i.line} ${i.id} Branch=${JSON.stringify(b)}`);
      }
      if (i.fields.PR) {
        const p = i.fields.PR.replace(/^`|`$/g, "").trim();
        if (!PR_SHAPE.test(p)) bad.push(`${i.file}:${i.line} ${i.id} PR=${JSON.stringify(p)}`);
      }
    }
    expect(bad, "a branch or PR that cannot be resolved cannot go stale visibly").toEqual([]);
  });
});

describe("ledger IN PROGRESS staleness", () => {
  const live = readLedgers().filter((i) => !isArchive(i.file)).filter(isInProgress);

  it("has no in-progress entry whose branch is already gone", () => {
    // Scoped to entries that opted in, so with none declared this is a no-op and
    // contributes no flake surface. The moment one IS declared it becomes the
    // rule that actually enforces USAGE over time: a merged-and-deleted branch
    // still claimed as in-flight fails here, which is exactly the rot this
    // convention exists to prevent.
    if (live.length === 0) return;
    const branches = live
      .map((i) => ({ item: i, branch: (i.fields.Branch ?? "").replace(/^`|`$/g, "").trim() }))
      .filter((b) => b.branch.length > 0);
    if (branches.length === 0) return;

    // Deliberately NOT wrapped in a skip-on-failure: an entry declaring itself in
    // flight while the guard cannot check it is the case worth failing on.
    const remote = execFileSync("git", ["ls-remote", "--heads", "origin"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 30_000,
    });
    const known = new Set(
      remote
        .split("\n")
        .map((l) => l.split("refs/heads/")[1])
        .filter((x): x is string => !!x)
        .map((x) => x.trim()),
    );
    const stale = branches
      .filter((b) => !known.has(b.branch))
      .map((b) => `${b.item.file}:${b.item.line} ${b.item.id} → ${b.branch} (no such branch on origin)`);
    expect(stale, "in-progress marker left behind after its branch was merged or abandoned").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The rules above are conditional, and today every condition is false — so they
// would all pass against a parser that did nothing. These prove each rule
// actually catches its violation, on planted input rather than on the corpus.
describe("the guard catches what it claims to", () => {
  /**
   * One planted entry, and the length assertion is load-bearing rather than
   * ceremony: a fixture that failed to parse would return an empty array and
   * make every expectation below vacuous.
   */
  const plant = (body: string): LedgerItem => {
    const items = ledgerItems("BACKLOG.md", `## BL-PLANT — a planted entry\n\n${body}\n`);
    expect(items).toHaveLength(1);
    return items[0] as LedgerItem;
  };

  it("parses a meta line into separate fields rather than one greedy blob", () => {
    const it0 = plant("**Status:** IN PROGRESS · **Branch:** feat/x · **Severity:** low");
    expect(it0.fields.Status).toBe("IN PROGRESS");
    expect(it0.fields.Branch).toBe("feat/x");
    expect(it0.fields.Severity).toBe("low");
  });

  it("catches IN PROGRESS with no branch and no PR", () => {
    const it0 = plant("**Status:** IN PROGRESS · **Severity:** low");
    expect(isInProgress(it0)).toBe(true);
    expect(it0.fields.Branch || it0.fields.PR).toBeFalsy();
  });

  it("catches a bare Branch field on an entry whose status denies it", () => {
    const it0 = plant("**Status:** OPEN · **Branch:** feat/x");
    expect(isInProgress(it0)).toBe(false);
    expect(flightFieldsOn(it0)).toEqual(["Branch"]);
  });

  it("catches a malformed branch and a malformed PR", () => {
    expect(BRANCH_SHAPE.test("feat/real-branch")).toBe(true);
    expect(BRANCH_SHAPE.test("the auth one")).toBe(false);
    expect(BRANCH_SHAPE.test("main")).toBe(false);
    expect(PR_SHAPE.test("#681")).toBe(true);
    expect(PR_SHAPE.test("PR 681")).toBe(false);
  });

  it("does not fire on an entry that never opted in", () => {
    const it0 = plant("**Status:** OPEN · **Severity:** low · **Class:** CI");
    expect(isInProgress(it0)).toBe(false);
    expect(flightFieldsOn(it0)).toEqual([]);
  });

  it("reads in-flight and WIP as the same declaration, and does not sniff prose", () => {
    expect(isInProgress(plant("**Status:** IN-FLIGHT · **PR:** #1"))).toBe(true);
    expect(isInProgress(plant("**Status:** WIP · **PR:** #1"))).toBe(true);
    // An audit stamp is not somebody working on it. This is the exact shape that
    // made an inference-based reading of "in progress" indefensible.
    expect(isInProgress(plant("**Status:** OPEN\n\n**VERIFIED INCOMPLETE 2026-08-03 — do not archive.**"))).toBe(false);
  });

  it("sees a marker below the 12-line window", () => {
    // The live shape: chore/ledger-body-ids-enum-scan-widen appended its marker
    // ~17 lines below the heading, so the window could not see it — meaning this
    // guard could not validate a marker it was written to validate, and main
    // would have inherited it unchecked at merge.
    const body = ["**Status:** OPEN", ...Array<string>(15).fill("filler"),
      "**Status:** IN PROGRESS · **Branch:** chore/real-branch"].join("\n\n");
    const it0 = plant(body);
    expect(isInProgress(it0)).toBe(true);
    expect(it0.fields.Branch, "the union must reach fields, not just a helper").toBe("chore/real-branch");
  });

  it("does not let the window's Status mask a deeper one", () => {
    // fields.Status stays OPEN by the window-wins rule. A predicate reading it
    // would downgrade a live claim AND then fire a false flight-field violation.
    const body = ["**Status:** OPEN · **Severity:** low", ...Array<string>(15).fill("filler"),
      "**Status:** IN PROGRESS · **Branch:** feat/live"].join("\n\n");
    const it0 = plant(body);
    expect(it0.fields.Status).toBe("OPEN");
    expect(isInProgress(it0), "must scan lines, not read fields.Status").toBe(true);
    expect(flightFieldsOn(it0)).toEqual(["Branch"]);
  });

  it("subjects an out-of-window branch to the shape rule it used to escape", () => {
    const body = ["**Status:** OPEN", ...Array<string>(15).fill("filler"),
      "**Status:** IN PROGRESS · **Branch:** not a branch"].join("\n\n");
    const it0 = plant(body);
    expect(isInProgress(it0)).toBe(true);
    expect(BRANCH_SHAPE.test(it0.fields.Branch ?? ""), "now reachable by the shape rule").toBe(false);
  });

  it("ignores a **Branch:** quoted deep inside a long body", () => {
    const far = ["**Status:** OPEN", ...Array<string>(14).fill("filler paragraph"), "**Branch:** feat/quoted-in-discussion"].join("\n\n");
    expect(flightFieldsOn(plant(far))).toEqual([]);
  });

  it("discovers ledger files from disk, including a new one", () => {
    const files = ledgerFiles();
    expect(files).toContain("BACKLOG.md");
    expect(files).toContain("DEFERRED-archive.md");
  });
});
