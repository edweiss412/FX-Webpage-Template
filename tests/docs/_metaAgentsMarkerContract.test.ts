// AGENTS.md states invariant 12's marker contract in THREE places, and an edit
// to one that leaves the others contradicting it is the drift this pins.
//
// The failure is not hypothetical: reviews caught it twice by hand on this very
// change — once where the invariant paragraph moved marker removal pre-merge
// while the Stage 4.4 lifecycle bullet still ordered it after the `0  0` check,
// and once where the new reading rule's own prose paraphrased the retired
// merge-time ordering it was replacing.
//
// The assertions are literal and narrow on purpose. This does not model the
// prose; it pins the specific sentences that drifted, one per edit.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const AGENTS = readFileSync(join(__dirname, "..", "..", "AGENTS.md"), "utf8");

/** The Stage 4.4 bullet of the pane/agent lifecycle list, isolated. */
function stage44Bullet(): string {
  const start = AGENTS.indexOf("- **Stage 4.4**");
  expect(start, "AGENTS.md no longer has a Stage 4.4 lifecycle bullet").toBeGreaterThan(-1);
  const next = AGENTS.indexOf("\n- ", start + 1);
  return AGENTS.slice(start, next === -1 ? AGENTS.length : next);
}

describe("AGENTS.md marker contract", () => {
  it("6.1 — states that claims are read from origin's branches, and names the reader", () => {
    expect(AGENTS).toMatch(/ledger:claims/);
    expect(AGENTS).toMatch(/read from origin's branches/i);
  });

  it("6.1 — never asserts the marker reaches main at merge", () => {
    // A paraphrase walks straight past the retired-phrase checks below, which is
    // how this survived a round: the reading rule's own prose restated the
    // ordering it was replacing.
    expect(AGENTS, "some sentence still says the marker reaches main at merge")
      .not.toMatch(/reaches `?origin\/main`? only (at|when) (the )?merge/i);
  });

  it("6.2 — Stage 0 names both the check command and the push", () => {
    // Both halves. The check without the push leaves the marker invisible to
    // every other session, which is the defect the whole mechanism closes.
    expect(AGENTS).toMatch(/ledger:claims --check/);
    expect(AGENTS).toMatch(/push the branch/i);
  });

  it("6.3 — neither retired ordering survives", () => {
    expect(AGENTS).not.toContain("after the `0  0` check, removes it");
    expect(AGENTS).not.toContain("the moment the PR merges, the marker goes away with it");
  });

  it("6.3 — positively states removal happens in the PR's last commit", () => {
    // Absence alone is satisfiable by deleting both retired strings and adding
    // nothing, which would leave AGENTS.md saying nowhere when the marker comes
    // off — silently deleting half the writer contract.
    expect(AGENTS).toMatch(/last commit, before the merge/i);
  });

  it("6.4 — the Stage 4.4 bullet no longer orders marker clearing", () => {
    const bullet = stage44Bullet();
    expect(bullet, "Stage 4.4 still mentions the marker").not.toMatch(/IN PROGRESS marker/i);
    // ...and it must still do its own job, so the fix cannot be deleting it.
    expect(bullet).toMatch(/herdr pane rename/);
    expect(bullet).toMatch(/herdr agent rename/);
  });

  it("6.5 — the archive parenthetical is gone", () => {
    // It was already false: tests/docs/_metaLedgerInProgress.test.ts rejects
    // in-progress entries in archives, so an entry following it into an archive
    // carrying the marker fails before the PR can merge.
    expect(AGENTS).not.toContain("takes its marker with it by construction");
  });

  it("6.6 — the pipeline sentence marks the ledger BEFORE spec and plan", () => {
    // The only ordering assertion in the set, and the one that matters most:
    // marking after two full review cycles reopens the hours-long window the
    // 2026-08-03 collision measured.
    const line = AGENTS.split("\n").find((l) => l.includes("drive the full autonomous pipeline"));
    expect(line, "the autonomous-pipeline sentence is gone").toBeDefined();
    const marker = line!.search(/mark the ledger entries/i);
    const spec = line!.search(/spec → self-review/i);
    expect(marker, "pipeline sentence no longer marks the ledger").toBeGreaterThan(-1);
    expect(spec, "pipeline sentence no longer names the spec stage").toBeGreaterThan(-1);
    expect(marker, "the marker must be written before the spec stage, not after").toBeLessThan(spec);
  });
});
