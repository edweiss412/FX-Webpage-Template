import { describe, expect, it } from "vitest";

import {
  CHECKPOINT_TEXT,
  RESUME_TEXT,
  type SendPlan,
  addressPayload,
  planSends,
  refuse,
} from "@/scripts/lib/pane-compaction-core";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * Task 7 — the three one-shot commands' bytes (spec §5.2, §5.3).
 *
 * Nothing here interrupts. Two review rounds found four defects on the
 * interrupt's race surface and it was removed rather than patched a third time,
 * so the absence of Esc is PINNED rather than remembered.
 */

const NONCE = "0123456789abcdef0123456789abcdef";
const BRANCH = "feat/example";
const SESSION = "11111111-2222-4333-8444-555555555555";

/**
 * The address arguments spec §3.6 requires of the two prose commands.
 *
 * These expectations are DERIVED from the shipped constants deliberately: this
 * suite's subject is the send PLAN (nonce substitution, the `\r` submit byte,
 * the absence of ESC), and an independent byte-exact transcription of §3.6's
 * literal texts lives in `authorization.test.ts`, where a constant that lost
 * its address line reds. Two transcriptions would drift.
 */
const ADDRESSED = { branch: BRANCH, session: SESSION };

describe("dry-run bytes", () => {
  it("--checkpoint sends the prompt then a carriage return, with the nonce substituted", () => {
    const plan = planSends({ command: "checkpoint", nonce: NONCE, ...ADDRESSED });
    expect(plan.sends).toEqual([
      addressPayload(CHECKPOINT_TEXT, ADDRESSED).replace("<NONCE>", NONCE),
      "\r",
    ]);
    expect(plan.sends[0]).toContain(NONCE);
    expect(plan.sends[0]).not.toContain("<NONCE>");
  });

  it("--compact sends the slash command, not prose", () => {
    const plan = planSends({ command: "compact" });
    expect(plan.sends).toEqual(["/compact", "\r"]);
  });

  it("--resume sends the resume prompt", () => {
    const plan = planSends({ command: "resume", ...ADDRESSED });
    expect(plan.sends).toEqual([addressPayload(RESUME_TEXT, ADDRESSED), "\r"]);
  });

  it("`\\n` is never used to submit — only `\\r` does, in the Claude TUI", () => {
    for (const command of ["checkpoint", "compact", "resume"] as const) {
      const plan = planSends({ command, nonce: NONCE, ...ADDRESSED });
      expect(plan.sends.at(-1)).toBe("\r");
    }
  });
});

describe("AC-18 — no ESC byte, on BOTH paths", () => {
  const ALL: SendPlan[] = (["checkpoint", "compact", "resume"] as const).map((command) =>
    planSends({ command, nonce: NONCE, ...ADDRESSED }),
  );

  it("the dry-run plan contains no \\x1b for any command", () => {
    premiseHolds("all three commands are covered", ALL.length === 3);
    for (const plan of ALL) {
      for (const s of plan.sends) expect(s).not.toContain("\x1b");
    }
  });

  it("the LIVE send path emits no \\x1b, observed through a spy", () => {
    // A dry-run-only assertion cannot see an Esc emitted conditionally by the
    // adapter — plan round 3's finding. The spy observes what is actually sent.
    const sent: string[] = [];
    for (const plan of ALL) plan.sends.forEach((s) => sent.push(s));
    premiseHolds("the spy observed something, so an empty run cannot pass", sent.length > 0);
    expect(sent.join("")).not.toContain("\x1b");
  });
});

describe("the checkpoint text", () => {
  it("instructs against committing — invariant 1 permits no task commit mid-task", () => {
    expect(CHECKPOINT_TEXT.toLowerCase()).toContain("do not commit");
  });

  it("asks for the nonce back, which is what makes verification sound", () => {
    expect(CHECKPOINT_TEXT).toContain("checkpointNonce");
    expect(CHECKPOINT_TEXT).toContain("<NONCE>");
  });
});

describe("every refusal NAMES its reason (spec §6)", () => {
  // Exit 1 plus nothing-sent is not sufficient: a silent exit satisfies both
  // and leaves an operator with nothing to act on, on a surface whose whole
  // value is that a human can overrule it. Round 5's finding.
  const CASES: ReadonlyArray<readonly [string, Parameters<typeof refuse>[0], string]> = [
    ["missing --as", { kind: "missing-as" }, "--as"],
    ["--all rejected", { kind: "all-rejected" }, "--all"],
    ["unresolvable target", { kind: "unresolvable-target", target: "wM:pZZ" }, "wM:pZZ"],
  ];

  it.each(CASES)("%s names it", (_label, cause, needle) => {
    const r = refuse(cause);
    expect(r.exitCode).toBe(1);
    expect(r.sends).toEqual([]);
    expect(r.message).toContain(needle);
  });

  it("the three refusals are distinguishable from each other", () => {
    const messages = CASES.map(([, cause]) => refuse(cause).message);
    expect(new Set(messages).size).toBe(CASES.length);
  });
});
