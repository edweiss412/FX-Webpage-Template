// AGENTS.md points at `docs/agents/orchestrator-pane-compaction.md`, and the two
// must not drift. This does NOT model the prose; it pins the specific sentences
// that can drift, one per edit — the shape of _metaAgentsMarkerContract.test.ts.
//
// The pins are chosen by what a later editor is most likely to "simplify":
// the no-interrupt decision (four defects were found on the interrupt's race
// surface before it was removed), the no-commit contract (invariant 1), and the
// band values (three copies would drift; there are deliberately two).
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise, premiseHolds } from "@/tests/_shared/premise";

const ROOT = join(__dirname, "..", "..");
const AGENTS = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
const WRITEUP_PATH = "docs/agents/orchestrator-pane-compaction.md";
const WRITEUP = readFileSync(join(ROOT, WRITEUP_PATH), "utf8");
const SEND_AUTH_SPEC_PATH = "docs/superpowers/specs/2026-08-21-pane-compaction-send-authorization.md";
const SEND_AUTH_SPEC = readFileSync(join(ROOT, SEND_AUTH_SPEC_PATH), "utf8");
const DESIGN_2026_08_16_PATH =
  "docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md";
const DESIGN_2026_08_16 = readFileSync(join(ROOT, DESIGN_2026_08_16_PATH), "utf8");

describe("pane-compaction contract", () => {
  it("both documents are substantial, so an emptied file cannot pass", () => {
    // The guard's own premise: a truncated write-up would satisfy every
    // `not.toMatch` below while satisfying nothing a reader needs.
    premise("the write-up has content", WRITEUP.length, 2000);
    premise("AGENTS.md has content", AGENTS.length, 10000);
    premise("the send-auth spec has content", SEND_AUTH_SPEC.length, 10000);
    premise("the 2026-08-16 design has content", DESIGN_2026_08_16.length, 10000);
  });

  it("AGENTS.md points at the write-up by path", () => {
    expect(AGENTS).toContain(WRITEUP_PATH);
  });

  it("AGENTS.md does not restate the write-up's detail", () => {
    // Two copies drift. The pointer carries the decision, the write-up carries
    // the mechanism — so the band arithmetic must live in exactly one of them.
    expect(AGENTS).not.toContain("2 × full + half");
  });

  it("the write-up states that nothing interrupts", () => {
    expect(WRITEUP).toMatch(/never interrupt|nothing here ever interrupts|no interrupt/i);
  });

  it("both documents state the ESC pin, which is the sentence most likely to be dropped", () => {
    expect(AGENTS).toContain("\\x1b");
    expect(WRITEUP).toContain("\\x1b");
  });

  it("the write-up states the checkpoint's no-commit contract", () => {
    expect(WRITEUP.toLowerCase()).toContain("never commits");
  });

  it("neither document contradicts the spec's band values", () => {
    // The spec is canonical (invariant 7). A write-up that says 0.5 or 0.8 has
    // reverted to the float fraction the spec deliberately replaced.
    for (const [name, doc] of [["AGENTS.md", AGENTS], [WRITEUP_PATH, WRITEUP]] as const) {
      expect(doc, `${name} carries a float band value`).not.toMatch(/f\s*[<>=]+\s*0\.[58]/);
    }
    expect(WRITEUP).toContain("t < 5");
    expect(WRITEUP).toContain("t >= 8");
  });
});

describe("the send path ships ENABLED, and the docs say so (AC-13)", () => {
  it("the write-up carries no fence banner", () => {
    // The banner told a reader the three modes refuse immediately. Leaving it
    // in place after the fence is removed is worse than never having had it:
    // an operator would not reach for a command the canonical document says
    // does not work.
    expect(WRITEUP).not.toContain("The sending modes are disabled in this release");
    expect(WRITEUP).not.toContain("it is not what the shipped binary does today");
  });

  it("AGENTS.md's bullet no longer says the three modes ship disabled", () => {
    expect(AGENTS).not.toContain("The three sending modes ship DISABLED");
    expect(AGENTS).not.toContain("the design the fenced modes will implement");
  });

  it("AGENTS.md keeps its four load-bearing rules", () => {
    // The positive twin. A bullet rewritten to say "enabled" and nothing else
    // would satisfy every `not.toContain` above while dropping the rules that
    // are the reason the bullet exists.
    for (const rule of [
      "nothing ever interrupts",
      "single-use nonce",
      "`--resume` has its own predicate",
      "`--as <sessionId>` is always explicit",
    ]) {
      expect(AGENTS, `AGENTS.md must keep: ${rule}`).toContain(rule);
    }
  });

  it("the write-up documents the operator's post-send pane read as PROCEDURE", () => {
    // Spec §3.3: the tool takes no post-send reads and prints no echo, because
    // a read-back would be a second `screen` read inside the pass and the first
    // step toward classifying display strings. The evidence the field notes
    // measured -- a send that returns ok is not a send -- is real, and it lives
    // here as operator procedure instead.
    expect(WRITEUP).toContain("herdr pane read");
    expect(WRITEUP.toLowerCase()).toContain("describes the transport");
    expect(WRITEUP.toLowerCase()).toContain("empty queue");
  });

  it("the 2026-08-16 design's fence limit is annotated as superseded, not deleted", () => {
    // A dated record of the fence decision. Deleting it would erase why the
    // modes were ever disabled, which is the context the next reader needs to
    // judge whether this arc's replacement was the right one.
    expect(DESIGN_2026_08_16).toContain("[SHIPPED DISABLED]");
    expect(DESIGN_2026_08_16).toContain("2026-08-21-pane-compaction-send-authorization");
    expect(DESIGN_2026_08_16).toContain("SUPERSEDED 2026-08-21");
  });
});

describe("the bounded decay classes are stated as BOUNDED (AC-15)", () => {
  // Round 4 caught an earlier draft claiming the addressed payloads closed more
  // than they do. The address line closes the WRONG-RECIPIENT class and the
  // resume payload's deference closes the `blockedOn` class; a verdict or
  // purview change with branch, session and blockedOn unchanged is invisible to
  // the recipient BY CONSTRUCTION and is priced as a bounded consequence.
  //
  // Pinned in prose because no test can observe a claim the code does not make:
  // the overclaim was a sentence, so the guard is a sentence.
  it("the spec prices verdict/purview decay as bounded, not closed", () => {
    expect(SEND_AUTH_SPEC).toContain("**[bounded], not closed**");
    expect(SEND_AUTH_SPEC).toContain("the `blockedOn` decay class and NO OTHER");
  });

  it("the write-up says the same, so the two cannot disagree", () => {
    // SENTENCES, not substrings. This asserted `toContain("bounded")` and
    // `toContain("blockedOn")`, and passed on occurrences that had nothing to
    // do with decay: "bounded" appears three times in the write-up (position
    // inference, purview locking) and "blockedOn" twice (a field list, a
    // timestamp hazard). Probed at diff round 1 — the write-up did not state
    // the decay split, the address-line mechanism, or the verdict/purview class
    // AT ALL, and the guard was green throughout. Same weak-substring shape as
    // the nonce-refusal needle the mutation gate caught a commit earlier.
    expect(WRITEUP).toContain("**BOUNDED, NOT CLOSED.**");
    expect(WRITEUP).toContain("verdict or purview decayed");
    expect(WRITEUP).toContain("ADDRESS LINE naming the target's branch");
    expect(WRITEUP).toContain("re-read its own");
  });

  it("the SUPERSEDED design is scoped at the TOP, so its stale claims cannot be read as live", () => {
    // Diff round 3, suites finding 2 (P2). The two cases above compare the spec
    // and the write-up, and the design document was read only for its fence
    // annotation -- so a THIRD document could contradict both while this file
    // stayed green, which is exactly what it did. It still says the driver
    // "never [sends] on a stale verdict" and that each command "revalidates
    // immediately before it sends", both false of the shipped tool.
    //
    // The repair is scope, not sentence-editing: the supersession note lived at
    // line 630 inside a §7 limit, where a reader arriving at §1.1 or §5.2 never
    // meets it. A banner is only load-bearing if it is met FIRST, so its
    // position is asserted, not just its presence.
    const lines = DESIGN_2026_08_16.split("\n");
    const banner = lines.findIndex((l) => l.includes("SUPERSEDED 2026-08-21 for the SEND PATH"));
    expect(banner).toBeGreaterThanOrEqual(0);
    expect(banner).toBeLessThan(12);

    // It must name the authority and the direction of the correction, so the
    // reader is sent somewhere rather than merely warned off.
    const scope = lines.slice(banner, banner + 24).join("\n");
    expect(scope).toContain("2026-08-21-pane-compaction-send-authorization");
    expect(scope).toContain("bounded, not closed");

    // And it must precede every stale claim it exists to scope -- derived from
    // the document, not from a list someone kept up to date.
    const stale = lines
      .map((l, i) => ({ i, l }))
      .filter(({ l }) => /revalidat|never .*stale verdict/i.test(l))
      .filter(({ i }) => i !== banner);
    premiseHolds("the stale claims this banner scopes are still present", stale.length > 0);
    for (const { i, l } of stale) {
      expect(banner, `stale claim above the banner at line ${i + 1}: ${l.trim()}`).toBeLessThan(i);
    }
  });

  it("every needle this file pins occurs EXACTLY ONCE in its document", () => {
    // The derived guard behind the case above, and the general form of that
    // defect: a needle occurring more than once may be matching something else
    // entirely, which is how a pin goes green while its subject is absent.
    // Occurrence COUNT is the discriminator here, not needle length.
    const pinned: ReadonlyArray<readonly [string, string, string]> = [
      ["write-up", WRITEUP, "**BOUNDED, NOT CLOSED.**"],
      ["write-up", WRITEUP, "verdict or purview decayed"],
      ["write-up", WRITEUP, "ADDRESS LINE naming the target's branch"],
      ["write-up", WRITEUP, "herdr pane read"],
      // Cased as the document writes it: the sibling assertion above matches
      // case-insensitively, and a uniqueness count must not silently disagree
      // with it about what it is counting.
      ["write-up", WRITEUP, "EMPTY queue"],
      ["spec", SEND_AUTH_SPEC, "**[bounded], not closed**"],
      ["spec", SEND_AUTH_SPEC, "the `blockedOn` decay class and NO OTHER"],
    ];
    premise("the pin table is populated", pinned.length, 0);
    for (const [name, doc, needle] of pinned) {
      expect(doc.split(needle).length - 1, `${name}: ${needle}`).toBe(1);
    }
  });

  it("neither document claims the address line closes every decay class", () => {
    for (const [name, doc] of [
      [SEND_AUTH_SPEC_PATH, SEND_AUTH_SPEC],
      [WRITEUP_PATH, WRITEUP],
    ] as const) {
      expect(doc, `${name} overclaims the address line`).not.toMatch(
        /address line clos(es|ing) (every|all)/i,
      );
    }
  });
});
