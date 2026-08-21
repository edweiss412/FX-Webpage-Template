import { describe, expect, it } from "vitest";

import * as core from "@/scripts/lib/pane-compaction-core";
import {
  type AuthorizationDecision,
  type AuthorizationInput,
  CHECKPOINT_TEXT,
  type PaneReport,
  RESUME_TEXT,
  planSends,
} from "@/scripts/lib/pane-compaction-core";
import { premiseHolds } from "@/tests/_shared/premise";

/**
 * Task 1 — the authorization predicate and the addressed payloads
 * (spec 2026-08-21-pane-compaction-send-authorization, §3.1, §3.6; AC-1, AC-5, AC-15).
 *
 * Two properties are load-bearing about HOW this suite is written.
 *
 * 1. **The expected payload bytes are typed out here, not derived from the
 *    constants.** `expect(sent).toEqual(CHECKPOINT_TEXT.replace(...))` is
 *    satisfied by ANY value the constant happens to hold, including one that
 *    lost its address line — the pin would follow the defect. Spec §3.6 gives
 *    the literal texts precisely so a byte-exact assertion has an authority
 *    outside the module under test, and that authority is transcribed below.
 * 2. **`authorizeSend` is reached through the module NAMESPACE.** A named import
 *    of a symbol that does not exist yet fails at module load, and a collection
 *    crash is not a red this repo accepts (spec §8.2). Through the namespace its
 *    absence is a VALUE assertion — `expected undefined to be function` — which
 *    is the failure this task's red-contract records.
 */

const BRANCH = "feat/pane-compaction-send-auth";
const SESSION = "44b3665f-18ca-4d79-9fc2-86768abc6176";
const AS = "ea9199ad-9874-41bd-83bf-ff5bab60990f";
const OTHER = "c0ffee00-0000-4000-8000-000000000000";
const PANE = "wP:pC";
const NONCE = "0123456789abcdef0123456789abcdef";
const OTHER_NONCE = "fedcba9876543210fedcba9876543210";

// --------------------------------------------------------------------------
// The predicate, through the namespace. See the header note.
// --------------------------------------------------------------------------

type AuthorizeSend = (input: AuthorizationInput) => AuthorizationDecision;

function authorizeSend(input: AuthorizationInput): AuthorizationDecision {
  // `core.authorizeSend`, not a named import, and not a cast either. A named
  // import of a symbol that does not exist fails at MODULE LOAD, and a
  // collection crash is not a red this repo accepts. A cast through `unknown`
  // would hide the member from the premise scanner, which classifies a
  // namespace used with no statically known member as unresolved -- correctly,
  // since it cannot then follow the import edge. A plain member access is
  // undefined at runtime before the export lands, which is the VALUE assertion
  // below, and statically resolvable once it does.
  const fn: unknown = core.authorizeSend;
  expect(typeof fn, "the core must export an authorizeSend predicate").toBe("function");
  return (fn as AuthorizeSend)(input);
}

function refusalOf(d: AuthorizationDecision): string {
  expect(d.authorized, "expected a refusal, got an authorization").toBe(false);
  return d.authorized ? "" : d.message;
}

/**
 * A drivable pane's report: rule 10 (banding), verdict FORCE, in purview.
 *
 * Every case that wants a refusal moves exactly ONE field off this baseline, so
 * a refusal is attributable to the field the case names rather than to a
 * fixture that was never drivable in the first place.
 */
function aReport(over: Partial<PaneReport> = {}): PaneReport {
  return {
    paneId: PANE,
    branch: BRANCH,
    tenths: 8,
    verdict: "FORCE",
    rule: 10,
    position: { row: 8, cost: "Low" },
    inPurview: true,
    rejectedField: null,
    ...over,
  };
}

function anInput(over: Partial<AuthorizationInput> = {}): AuthorizationInput {
  return {
    mode: "checkpoint",
    paneId: PANE,
    as: AS,
    ownership: { kind: "owned" },
    report: aReport(),
    ...over,
  };
}

// --------------------------------------------------------------------------
// §3.6 — the literal payloads, transcribed from the spec
// --------------------------------------------------------------------------

const ADDRESS_WITH_SESSION = `For the session driving ${BRANCH} (session ${SESSION}) ONLY -- any other session must ignore`;
const ADDRESS_BRANCH_ONLY = `For the session driving ${BRANCH} ONLY -- any other session must ignore`;

const CHECKPOINT_BODY = [
  "this message entirely. Checkpoint before compaction. Do not commit. Update",
  ".claude/ship-state.json in your worktree: set `stage` to where you actually are, set `next`",
  "to the literal command or action that resumes this work, and set `checkpointNonce` to",
  `exactly ${NONCE}. Leave the working tree exactly as it is. Then stop.`,
];

const RESUME_BODY = [
  "this message entirely. Run `date` first; the shell clock is the only source of truth.",
  "Re-read .claude/ship-state.json in your worktree FIRST: if its blockedOn is non-empty, honor",
  "it and stop -- your marker outranks this message. Otherwise discard any stale blocked or",
  "standing-down framing from your conversation and resume the marker's `next` action",
  "immediately, in this turn. You were compacted by the orchestrator; approval already given,",
  "do not re-ask.",
];

const EXPECTED = {
  checkpointWithSession: [ADDRESS_WITH_SESSION, ...CHECKPOINT_BODY].join("\n"),
  checkpointBranchOnly: [ADDRESS_BRANCH_ONLY, ...CHECKPOINT_BODY].join("\n"),
  resumeWithSession: [ADDRESS_WITH_SESSION, ...RESUME_BODY].join("\n"),
  resumeBranchOnly: [ADDRESS_BRANCH_ONLY, ...RESUME_BODY].join("\n"),
};

// --------------------------------------------------------------------------

describe("authorizeSend — ownership (spec §3.1 step 2)", () => {
  it("authorizes an owned, drivable pane — the POSITIVE twin every refusal below is measured against", () => {
    expect(authorizeSend(anInput())).toEqual({ authorized: true });
  });

  it("refuses a pane claimed by another session, naming BOTH sessions", () => {
    const message = refusalOf(
      authorizeSend(anInput({ ownership: { kind: "owned-by-other", sessionId: OTHER } })),
    );
    expect(message).toContain(PANE);
    expect(message).toContain(OTHER);
    expect(message).toContain(AS);
  });

  it("refuses an unowned pane, naming the registry's own reason", () => {
    const reason = "stale row: claims fix/other, pane runs feat/pane-compaction-send-auth";
    const message = refusalOf(authorizeSend(anInput({ ownership: { kind: "unowned", reason } })));
    expect(message).toContain(PANE);
    expect(message).toContain(reason);
  });

  it("a CONTESTED pane is refused by rule 3, not by an ownership message — the classifier already saw it", () => {
    // resolveOwnership reports contested; observe() feeds that to rule 3, which
    // stops the pane as an OBSERVATION. Refusing it a second time in the
    // ownership step would name a condition the operator cannot distinguish
    // from a stale registry row.
    const message = refusalOf(
      authorizeSend(
        anInput({
          ownership: { kind: "contested", claimants: [AS, OTHER] },
          report: aReport({ verdict: "UNOWNED", rule: 3 }),
        }),
      ),
    );
    expect(message).toContain("rule 3");
  });
});

describe("authorizeSend — the rule 1-8 observation stop (spec §3.1 step 3, AC-5)", () => {
  const RULES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

  it.each(RULES)("rule %i stops every sending mode, and the refusal names the rule", (rule) => {
    for (const mode of ["checkpoint", "compact", "resume"] as const) {
      const message = refusalOf(
        authorizeSend(
          anInput({
            mode,
            report: aReport({ rule, verdict: "UNDETERMINED" }),
            nonce: { recorded: NONCE, marker: NONCE },
          }),
        ),
      );
      expect(message, `${mode} under rule ${rule}`).toContain(`rule ${rule}`);
    }
  });

  it("rule 9 is NOT an observation stop — the boundary is 8, approached from above", () => {
    // The twin of the case above: without it, a predicate that refused EVERY
    // rule would pass the whole `.each` block.
    premiseHolds("the drivable baseline sits at rule 10", aReport().rule === 10);
    expect(
      authorizeSend(anInput({ report: aReport({ rule: 9, verdict: "HOLD" }) })).authorized,
    ).toBe(false);
    // ...refused, but by the VERDICT gate rather than the observation stop.
    const message = refusalOf(
      authorizeSend(anInput({ report: aReport({ rule: 9, verdict: "HOLD" }) })),
    );
    expect(message).not.toContain("rule 9");
    expect(message).toContain("HOLD");
  });

  it("names the rejected field when rule 4 decided, so the operator learns WHICH observation was refused", () => {
    const message = refusalOf(
      authorizeSend(
        anInput({ report: aReport({ rule: 4, verdict: "UNDETERMINED", rejectedField: "status" }) }),
      ),
    );
    expect(message).toContain("status");
  });
});

describe("authorizeSend — the mode verdict gate (spec §3.1 step 3, AC-5)", () => {
  const UNDRIVABLE = ["HOLD", "WAIT"] as const;

  it.each(UNDRIVABLE)(
    "--checkpoint and --compact refuse a %s verdict; --resume does NOT require COMPACT/FORCE",
    (verdict) => {
      const report = aReport({ verdict, rule: 12 });
      for (const mode of ["checkpoint", "compact"] as const) {
        const message = refusalOf(
          authorizeSend(anInput({ mode, report, nonce: { recorded: NONCE, marker: NONCE } })),
        );
        expect(message, `${mode} under ${verdict}`).toContain(verdict);
      }
      expect(
        authorizeSend(anInput({ mode: "resume", report })),
        `--resume under ${verdict}`,
      ).toEqual({ authorized: true });
    },
  );

  it.each(["COMPACT", "FORCE"] as const)("%s is drivable by every mode", (verdict) => {
    for (const mode of ["checkpoint", "compact", "resume"] as const) {
      expect(
        authorizeSend(
          anInput({
            mode,
            report: aReport({ verdict, rule: 10 }),
            nonce: { recorded: NONCE, marker: NONCE },
          }),
        ),
        `${mode} under ${verdict}`,
      ).toEqual({ authorized: true });
    }
  });
});

describe("authorizeSend — nonce equality, --compact only (spec §3.1 step 4, AC-2)", () => {
  it("authorizes when the record and the pass's marker copy agree", () => {
    expect(
      authorizeSend(anInput({ mode: "compact", nonce: { recorded: NONCE, marker: NONCE } })),
    ).toEqual({ authorized: true });
  });

  const MISMATCHES: ReadonlyArray<readonly [string, string | null, string | null, string]> = [
    ["the record was never written", null, NONCE, "checkpointNonce"],
    ["the marker carries none", NONCE, null, "checkpointNonce"],
    ["they differ", NONCE, OTHER_NONCE, "not the one this command recorded"],
  ];

  it.each(MISMATCHES)("refuses when %s", (_label, recorded, marker, needle) => {
    const message = refusalOf(
      authorizeSend(anInput({ mode: "compact", nonce: { recorded, marker } })),
    );
    expect(message).toContain(needle);
  });

  it("--checkpoint and --resume do not consult the nonce at all", () => {
    for (const mode of ["checkpoint", "resume"] as const) {
      expect(
        authorizeSend(anInput({ mode, nonce: { recorded: null, marker: null } })),
        `${mode} must not gate on the nonce`,
      ).toEqual({ authorized: true });
    }
  });

  it("an observation stop outranks the nonce check — the refusal cannot name the wrong condition", () => {
    // The lying-refusal shape, as an ORDERING claim. Round 5's shipped defect
    // refused with "marker carries no checkpointNonce" while a matching nonce
    // sat in the marker; a predicate that checked the nonce first would report
    // the nonce for a pane rule 5 had already stopped.
    const message = refusalOf(
      authorizeSend(
        anInput({
          mode: "compact",
          report: aReport({ rule: 5, verdict: "UNDETERMINED" }),
          nonce: { recorded: NONCE, marker: null },
        }),
      ),
    );
    expect(message).toContain("rule 5");
    expect(message).not.toContain("checkpointNonce");
  });
});

describe("§3.6 — both payloads open with the address line", () => {
  it("CHECKPOINT_TEXT's first line is the address line, with both substitution tokens", () => {
    const first = CHECKPOINT_TEXT.split("\n")[0] ?? "";
    expect(first).toBe(
      "For the session driving <BRANCH> (session <SESSION>) ONLY -- any other session must ignore",
    );
  });

  it("RESUME_TEXT's first line is the same address line", () => {
    const first = RESUME_TEXT.split("\n")[0] ?? "";
    expect(first).toBe(
      "For the session driving <BRANCH> (session <SESSION>) ONLY -- any other session must ignore",
    );
  });

  it("RESUME_TEXT carries the marker-deference line verbatim — it closes the blockedOn decay class", () => {
    expect(RESUME_TEXT).toContain(
      "Re-read .claude/ship-state.json in your worktree FIRST: if its blockedOn is non-empty, honor",
    );
    expect(RESUME_TEXT).toContain("your marker outranks this message");
  });

  it("CHECKPOINT_TEXT keeps its pre-existing contract clauses", () => {
    expect(CHECKPOINT_TEXT.toLowerCase()).toContain("do not commit");
    expect(CHECKPOINT_TEXT).toContain("checkpointNonce");
    expect(CHECKPOINT_TEXT).toContain("<NONCE>");
  });

  it("neither payload uses an ESC byte", () => {
    for (const text of [CHECKPOINT_TEXT, RESUME_TEXT]) expect(text).not.toContain("\x1b");
  });
});

describe("planSends — <BRANCH>/<SESSION> substitution (AC-6, AC-15)", () => {
  it("--checkpoint with a session renders the addressed payload byte-exactly", () => {
    const plan = planSends({
      command: "checkpoint",
      nonce: NONCE,
      branch: BRANCH,
      session: SESSION,
    });
    expect(plan.sends).toEqual([EXPECTED.checkpointWithSession, "\r"]);
  });

  it("--checkpoint without a session omits the parenthetical WHOLE, byte-exactly", () => {
    const plan = planSends({ command: "checkpoint", nonce: NONCE, branch: BRANCH, session: null });
    expect(plan.sends).toEqual([EXPECTED.checkpointBranchOnly, "\r"]);
    expect(plan.sends[0]).not.toContain("(session");
  });

  it("--resume with a session renders the addressed payload byte-exactly", () => {
    const plan = planSends({ command: "resume", branch: BRANCH, session: SESSION });
    expect(plan.sends).toEqual([EXPECTED.resumeWithSession, "\r"]);
  });

  it("--resume without a session omits the parenthetical WHOLE, byte-exactly", () => {
    const plan = planSends({ command: "resume", branch: BRANCH, session: null });
    expect(plan.sends).toEqual([EXPECTED.resumeBranchOnly, "\r"]);
    expect(plan.sends[0]).not.toContain("(session");
  });

  it("--compact carries NO address — it is a slash command and its bytes are unchanged", () => {
    expect(planSends({ command: "compact" }).sends).toEqual(["/compact", "\r"]);
  });

  it("no substitution token survives into any rendered payload", () => {
    const plans = [
      planSends({ command: "checkpoint", nonce: NONCE, branch: BRANCH, session: SESSION }),
      planSends({ command: "checkpoint", nonce: NONCE, branch: BRANCH, session: null }),
      planSends({ command: "resume", branch: BRANCH, session: SESSION }),
      planSends({ command: "resume", branch: BRANCH, session: null }),
      planSends({ command: "compact" }),
    ];
    premiseHolds("every sending shape is covered", plans.length === 5);
    for (const plan of plans) {
      for (const s of plan.sends) {
        expect(s).not.toContain("<BRANCH>");
        expect(s).not.toContain("<SESSION>");
        expect(s).not.toContain("<NONCE>");
        expect(s).not.toContain("\x1b");
      }
    }
  });

  it("an addressed command refuses to render without the target's branch", () => {
    // Defaulting the branch to the empty string would ship a payload addressed
    // to nobody, which is the one thing the address line exists to prevent.
    expect(() => planSends({ command: "checkpoint", nonce: NONCE, session: SESSION })).toThrow(
      /branch/,
    );
    expect(() => planSends({ command: "resume", session: SESSION })).toThrow(/branch/);
  });
});
