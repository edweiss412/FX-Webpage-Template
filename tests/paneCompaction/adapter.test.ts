/**
 * The CLI adapter — argv, dispatch, exit codes, and the real entry point.
 *
 * WHY THIS FILE EXISTS. `cli.test.ts` proves the three core functions and then
 * asserts `package.json` names the adapter; it never runs it. A stub adapter
 * that imported those functions and did nothing satisfied every assertion in
 * this suite while `pnpm panes:compact` printed nothing and exited 0 — the
 * shipped tool was inert and the green suite could not see it. That is the
 * suite-level false-premise shape: proof the CORE works, treated as proof the
 * TOOL works.
 *
 * So the assertions here are on `main` — argv in, exit code and emitted lines
 * out — plus one case that SPAWNS the real entry point through the shipped
 * `pnpm` alias. The spawned case deliberately uses a refusal path that needs no
 * herdr, git or gh, so it is hermetic while still proving the file parses argv
 * and sets a non-zero exit.
 */
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

import { CHECKPOINT_TEXT, RESUME_TEXT, classifyGh } from "@/scripts/lib/pane-compaction-core";
import {
  MALFORMED_MARKER,
  SendFailed,
  type Surface,
  main,
  parseAgentGet,
  realSurface,
  rejectedFieldOf,
} from "@/scripts/pane-compaction";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { gaugeFor } from "@/tests/paneCompaction/fixtures";

const ROOT = process.cwd();

/** Lines the adapter emitted, in order. */
type Run = { code: number; lines: string[]; sent: Array<{ target: string; text: string }> };

/**
 * A surface whose every read is a fixture. No case shares one: a shared surface
 * is how a case ends up proving something about its neighbour's inputs.
 */
function fakeSurface(over: Partial<Surface> = {}): { surface: Surface; run: Run } {
  const run: Run = { code: 0, lines: [], sent: [] };
  // In memory, so no case can reach ~/.claude/pane-nonces on the real machine.
  const nonces = new Map<string, string>();
  const surface: Surface = {
    // Default: every label the roster carries resolves to a worktree branch, so
    // existing cases keep classifying their panes as arcs. AC-16's behaviour is
    // asserted by cases that OVERRIDE this, never by the default -- a default
    // that resolved nothing would make every case a NOT-AN-ARC case by accident.
    branches: () => {
      const names = new Set<string>();
      for (const r of surface.roster()) if (r.agentName !== null) names.add(r.agentName);
      return names;
    },
    nonceRead: (sessionId, paneId) => nonces.get(`${sessionId} ${paneId}`) ?? null,
    nonceWrite: (sessionId, paneId, nonce) => nonces.set(`${sessionId} ${paneId}`, nonce),
    nonceConsume: (sessionId, paneId) => {
      nonces.delete(`${sessionId} ${paneId}`);
    },
    roster: () => [
      {
        paneId: "wM:p1",
        agentName: "feat/alpha",
        cwd: "/w/alpha",
        status: "working",
        agentSession: "sess-target",
      },
      {
        paneId: "wM:p2",
        agentName: "feat/beta",
        cwd: "/w/beta",
        status: "idle",
        agentSession: "sess-target",
      },
    ],
    screen: () => gaugeFor(6),
    send: (target, text) => run.sent.push({ target, text }),
    purview: () => [
      {
        sessionId: "sess-1",
        rows: [
          {
            paneId: "wM:p1",
            agentName: "feat/alpha",
            branch: "feat/alpha",
            dispatchedAt: "2026-08-16T00:00:00Z",
          },
          {
            paneId: "wM:p2",
            agentName: "feat/beta",
            branch: "feat/beta",
            dispatchedAt: "2026-08-16T00:00:00Z",
          },
        ],
      },
    ],
    marker: () => ({ branch: "feat/alpha", stage: "x", sessionId: "sess-target", blockedOn: "" }),
    git: () => ({ clean: true, lastCommitAt: 1_000 }),
    gh: () => ({ exitCode: 1, stdout: "", stderr: "no pull requests found for branch" }),
    corpus: () => [],
    // Stands in for `herdr agent get`: resolves a pane id or a label, and says
    // NOT FOUND for anything else — the same three-way the real one returns.
    resolveTarget: (target) => {
      const hit = surface.roster().find((r) => r.paneId === target || r.agentName === target);
      return hit === undefined ? { notFound: true } : { paneId: hit.paneId };
    },
    now: () => 100_000_000,
    random: () => "nonce-fresh",
    out: (line) => run.lines.push(line),
    ...over,
  };
  return { surface, run };
}

const drive = (argv: string[], over: Partial<Surface> = {}): Run => {
  const { surface, run } = fakeSurface(over);
  run.code = main(argv, surface);
  return run;
};

describe("the report", () => {
  it("renders one row per roster pane, each carrying verdict and position evidence", () => {
    const run = drive([]);
    const rows = run.lines.filter((l) => l.includes("wM:p"));
    premise("the fixture roster has two panes to cover", rows.length, 1);
    expect(rows).toHaveLength(2);
    // AC-1: not coverage alone — the evidence has to be on the row.
    for (const r of rows) expect(r).toMatch(/row\s*\d+\s+(HardWait|High|Low|Lowest)/);
  });

  it("--json emits the envelope, uncapped, with every pane", () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      paneId: `wM:p${i}`,
      agentName: `feat/a${i}`,
      cwd: `/w/${i}`,
      status: "idle" as const,
      agentSession: null,
    }));
    const run = drive(["--json"], { roster: () => many });
    const payload: unknown = JSON.parse(run.lines.join("\n"));
    const env = payload as { status: number; degraded: string[]; panes: unknown[] };
    premise("the fixture exceeds any plausible display cap", many.length, 100);
    expect(env.panes).toHaveLength(250);
    expect(env.status).toBe(0);
  });
});

describe("the network read is per WORKTREE, not per pane", () => {
  it("calls gh once for panes that share a cwd", () => {
    // `gh pr checks` is a network call on a budget the whole batch of arcs
    // shares. A dozen panes in one worktree must not spend a dozen requests.
    const cwds: string[] = [];
    const run = drive([], {
      roster: () => [
        {
          paneId: "wM:p1",
          agentName: "feat/alpha",
          cwd: "/w/same",
          status: "working",
          agentSession: null,
        },
        {
          paneId: "wM:p2",
          agentName: "feat/beta",
          cwd: "/w/same",
          status: "idle",
          agentSession: null,
        },
        {
          paneId: "wM:p3",
          agentName: "feat/gamma",
          cwd: "/w/other",
          status: "idle",
          agentSession: null,
        },
      ],
      gh: (cwd) => {
        cwds.push(cwd);
        return { exitCode: 1, stdout: "", stderr: "no pull requests found for branch" };
      },
    });
    premise(
      "three panes were classified, so a per-pane call would show three",
      run.lines.length,
      2,
    );
    expect(cwds).toEqual(["/w/same", "/w/other"]);
  });
});

describe("--check aggregation", () => {
  it("exits 2 when a purview pane is UNDETERMINED", () => {
    // An unparseable gauge is outside the §4.3 accept-set, so rule 4 fires.
    const run = drive(["--check", "--as", "sess-1"], { screen: () => "no gauge here" });
    expect(run.code).toBe(2);
  });

  it("exits 0 when nothing in purview is actionable", () => {
    const run = drive(["--check", "--as", "sess-1"], { screen: () => gaugeFor(2) });
    expect(run.code).toBe(0);
  });

  it("exits 1 when a purview pane is COMPACT", () => {
    const run = drive(["--check", "--as", "sess-1"], { screen: () => gaugeFor(6) });
    expect(run.code).toBe(1);
  });

  it("EXCLUDES panes outside the invoking orchestrator's purview", () => {
    // Same actionable pressure, but the registry belongs to someone else.
    const run = drive(["--check", "--as", "sess-OTHER"], { screen: () => gaugeFor(6) });
    expect(run.code).toBe(0);
  });
});

describe("rule 5 compares the marker against the PANE's session, not against --as", () => {
  // The orchestrator is a different session from every pane it watches, so
  // comparing the marker's sessionId against `--as` would fire rule 5 on
  // essentially every arc pane carrying a marker. The question rule 5 actually
  // asks is whether the session that WROTE the marker still lives in the pane —
  // the supersession a takeover creates (§4.5 rule 5, AC-17).
  const markerFor = (sessionId: string | null): Record<string, unknown> =>
    sessionId === null
      ? { branch: "feat/alpha", stage: "x", blockedOn: "" }
      : { branch: "feat/alpha", stage: "x", sessionId, blockedOn: "" };

  it("does NOT fire merely because the orchestrator differs from the target", () => {
    // `--as sess-1` owns the purview, so the pane stays IN purview and its
    // verdict actually reaches the exit code — while the marker names
    // `sess-target`, which is not `--as`. Under the old comparison that
    // difference alone made the pane UNDETERMINED (exit 2). Isolating it from
    // purview is the point: a different `--as` would drop the pane out of the
    // aggregation entirely and produce exit 0 for a reason that has nothing to
    // do with rule 5.
    const run = drive(["--check", "--as", "sess-1"], {
      marker: () => markerFor("sess-target"),
      screen: () => gaugeFor(6),
    });
    premiseHolds(
      "the marker's session really does differ from --as, or this proves nothing",
      markerFor("sess-target")["sessionId"] !== "sess-1",
    );
    // Actionable, not UNDETERMINED: exit 1 rather than 2.
    expect(run.code).toBe(1);
  });

  it("fires when the marker names a session the pane no longer runs", () => {
    const run = drive(["--check", "--as", "sess-1"], {
      roster: () => [
        {
          paneId: "wM:p1",
          agentName: "feat/alpha",
          cwd: "/w/alpha",
          status: "working",
          agentSession: "sess-SUCCESSOR",
        },
      ],
      purview: () => [
        {
          sessionId: "sess-1",
          rows: [
            {
              paneId: "wM:p1",
              agentName: "feat/alpha",
              branch: "feat/alpha",
              dispatchedAt: "2026-08-16T00:00:00Z",
            },
          ],
        },
      ],
      marker: () => markerFor("sess-SUPERSEDED"),
      screen: () => gaugeFor(6),
    });
    expect(run.code).toBe(2);
  });

  it("fires when the marker names a session and the pane reports NONE", () => {
    // §3.9's probe table measured exactly this on a live pane.
    const run = drive(["--check", "--as", "sess-1"], {
      roster: () => [
        {
          paneId: "wM:p1",
          agentName: "feat/alpha",
          cwd: "/w/alpha",
          status: "working",
          agentSession: null,
        },
      ],
      purview: () => [
        {
          sessionId: "sess-1",
          rows: [
            {
              paneId: "wM:p1",
              agentName: "feat/alpha",
              branch: "feat/alpha",
              dispatchedAt: "2026-08-16T00:00:00Z",
            },
          ],
        },
      ],
      marker: () => markerFor("sess-anything"),
      screen: () => gaugeFor(6),
    });
    expect(run.code).toBe(2);
  });

  it("no-ops when the marker names no session at all — absent cannot mismatch (AC-20)", () => {
    const run = drive(["--check", "--as", "sess-1"], {
      marker: () => markerFor(null),
      screen: () => gaugeFor(6),
    });
    premiseHolds(
      "the fixture marker really carries no sessionId",
      !("sessionId" in markerFor(null)),
    );
    expect(run.code).toBe(1);
  });
});

describe("--dry-run shows the refusal it would hit, and spends nothing", () => {
  it("--compact --dry-run refuses on an absent nonce instead of printing /compact", () => {
    // AC-19. A dry run that prints the command when the real one would exit 1
    // tells an operator it is ready to go, which is worse than no dry run.
    const run = drive(["--compact", "wM:p1", "--as", "sess-1", "--dry-run"], {
      marker: () => ({
        branch: "feat/alpha",
        stage: "x",
        sessionId: "sess-target",
        blockedOn: "",
        checkpointNonce: "n1",
      }),
    });
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).not.toContain("/compact");
    expect(run.sent).toEqual([]);
  });

  it("--checkpoint --dry-run does not WRITE a nonce", () => {
    // The mirror of the consume case, and the more dangerous of the two: a dry
    // run that stored a freshly minted nonce would overwrite the record, and the
    // target — which never saw this prompt — could then never satisfy the real
    // --compact that follows.
    const written: string[] = [];
    const { surface, run } = fakeSurface({
      nonceWrite: (sessionId, paneId, nonce) => written.push(`${sessionId}/${paneId}/${nonce}`),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1", "--dry-run"], surface);
    expect(code).toBe(0);
    premiseHolds("the dry run really did produce the prompt", run.lines.join("").length > 0);
    expect(written).toEqual([]);
    expect(run.sent).toEqual([]);
  });

  it("--compact --dry-run does not CONSUME the nonce it checked", () => {
    // Reading and comparing is the gate; spending it is the side effect. A dry
    // run that consumed would make the real --compact that follows it fail.
    const consumed: string[] = [];
    const { surface, run } = fakeSurface({
      marker: () => ({
        branch: "feat/alpha",
        stage: "x",
        sessionId: "sess-target",
        blockedOn: "",
        checkpointNonce: "n1",
      }),
      nonceRead: () => "n1",
      nonceConsume: (sessionId, paneId) => consumed.push(`${sessionId}/${paneId}`),
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1", "--dry-run"], surface);
    expect(code).toBe(0);
    expect(run.lines.join("\n")).toContain("/compact");
    expect(consumed).toEqual([]);
    expect(run.sent).toEqual([]);
  });
});

describe("every refusal NAMES its reason", () => {
  it("--check without --as exits 1 and says so", () => {
    const run = drive(["--check"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("--as");
  });

  it("--as followed by a flag is a MISSING --as, not an orchestrator named --dry-run", () => {
    // Swallowing the flag would invent an identity AND drop the option behind
    // it. §6 turns on --as being explicit and never inferred.
    const run = drive(["--checkpoint", "wM:p1", "--as", "--dry-run"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("--as");
    expect(run.sent).toEqual([]);
  });

  it("--all is rejected by name rather than silently ignored", () => {
    const run = drive(["--compact", "--all", "--as", "sess-1"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("--all");
  });

  it("an unresolvable target exits 1 naming it, and sends nothing", () => {
    const run = drive(["--compact", "wM:pZZ", "--as", "sess-1"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("wM:pZZ");
    expect(run.sent).toEqual([]);
  });

  it("a herdr FAULT is not reported as a missing target", () => {
    // `herdr agent get` exits 0 for a missing target and puts the answer in a
    // structured code, so a fault and a typo are distinguishable only by that
    // code. Calling a broken tool "not found" sends an operator to check their
    // spelling while the tool is what is wrong — and it is exit 2, untrusted,
    // not exit 1.
    const run = drive(["--compact", "wM:p1", "--as", "sess-1"], {
      resolveTarget: () => ({ fault: "herdr server unreachable" }),
    });
    expect(run.code).toBe(2);
    expect(run.lines.join("\n")).toContain("herdr server unreachable");
    expect(run.lines.join("\n")).not.toContain("agent_not_found");
    expect(run.sent).toEqual([]);
  });

  it("a target herdr resolves but the roster does not carry gets its OWN reason", () => {
    // A pane closing between the roster read and the resolve. Neither a typo nor
    // a fault, so it says what actually happened.
    const run = drive(["--compact", "wM:p1", "--as", "sess-1"], {
      resolveTarget: () => ({ paneId: "wM:pGONE" }),
    });
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("wM:pGONE");
    expect(run.sent).toEqual([]);
  });

  it("accepts a target only herdr can resolve — a terminal id, not a pane id or label", () => {
    // The gap that matching the roster ourselves would leave: herdr resolves
    // terminal ids and agent names too, and rejecting them would tell a user a
    // legitimate target does not exist.
    const run = drive(["--checkpoint", "term_65931c3", "--as", "sess-1"], {
      resolveTarget: () => ({ paneId: "wM:p1" }),
    });
    expect(run.code).toBe(0);
    expect(run.sent.map((x) => x.target)).toContain("wM:p1");
  });

  it("a sending mode with NO target says so, rather than blaming --as or the resolver", () => {
    // Absent is not unresolvable, and neither is a missing --as. A refusal that
    // named the wrong condition would send an operator to fix the wrong thing.
    const run = drive(["--compact", "--as", "sess-1"]);
    expect(run.code).toBe(1);
    const text = run.lines.join("\n");
    expect(text).toContain("target");
    expect(text).not.toContain("--as");
    expect(text).not.toContain("agent_not_found");
    expect(run.sent).toEqual([]);
  });

  it("a driving command without --as exits 1 rather than inferring an orchestrator", () => {
    const run = drive(["--checkpoint", "wM:p1"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("--as");
    expect(run.sent).toEqual([]);
  });
});

describe("the three commands", () => {
  it("--resume refused by an observation names the RULE, not COMPACT-or-FORCE", () => {
    // Diff round 1, finding 7 (P1). Every rule 1-8 stop printed "verdict is X,
    // which is not COMPACT or FORCE" -- false for an observation stop, and
    // flatly wrong for --resume, whose whole point is that it requires neither
    // verdict. An operator told the wrong reason debugs the wrong thing.
    const { surface, run: r } = fakeSurface({
      marker: () => ({ sessionId: "sess-target", blockedOn: "waiting on CI" }),
    });
    const code = main(["--resume", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    const out = r.lines.join("\n");
    expect(out).toContain("rule 7");
    expect(out).not.toContain("not COMPACT or FORCE");
  });

  it("a rule 4 refusal names the offending field (AC-4)", () => {
    // "UNDETERMINED naming the offending field" is the whole clause; a refusal
    // that cannot say which field does not satisfy it.
    const { surface, run: r } = fakeSurface({
      marker: () => ({ sessionId: "sess-target", surpriseKey: 1 }),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    expect(r.lines.join("\n")).toContain("marker.surpriseKey");
  });

  it("the default report does not call a singly-claimed pane UNOWNED", () => {
    // Diff round 1, finding 5 (P1). Report mode passes "" as the caller, and
    // `resolveOwnership` treated "not you" as unowned, so the plain report --
    // the one used between protocol steps -- labelled every claimed pane UNOWNED.
    const { surface, run: r } = fakeSurface();
    const code = main([], surface);
    expect(code).toBe(0);
    const row = r.lines.find((l) => l.includes("wM:p1")) ?? "";
    expect(row).not.toContain("UNOWNED");
  });

  it("a pane claimed by another orchestrator is refused BY NAME, not driven", () => {
    // The hole the fix above could have opened: rule 3 no longer fires for a
    // pane someone else claims, so the drive gate must refuse it itself. Named
    // as its own condition rather than folded into `not-drivable`, because
    // "someone else owns this" and "this pane is not ready" are different things
    // for an operator to act on.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface, run: r } = fakeSurface({
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "not-the-owner"], surface);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
    expect(r.lines.join("\n")).toContain("claimed by");
  });

  it("a refused send is a named fault, not a silent success", () => {
    // Diff round 1, finding 4 (P1). `send` discarded the exit code and the
    // command returned 0 regardless, so a refused send reported success. An
    // injected throwing send also escaped `main` entirely.
    const { surface, run: r } = fakeSurface({
      send: (target) => {
        throw new SendFailed(target, "no such pane");
      },
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(2);
    expect(r.lines.join("\n")).toContain("failed");
  });

  it("a refused --compact says the checkpoint must be re-minted", () => {
    // The consequence an operator cannot infer: --compact consumes the nonce
    // BEFORE sending, so the obvious retry refuses. Without this line the tool
    // reports a failure whose only remedy looks like the thing that just failed.
    const { surface, run: r } = fakeSurface({
      marker: () => ({ sessionId: "sess-target", checkpointNonce: "n1" }),
      nonceRead: () => "n1",
      send: (target) => {
        throw new SendFailed(target, "pane closed");
      },
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(2);
    expect(r.lines.join("\n")).toContain("re-run --checkpoint");
  });

  it("a corpus tie for newest verdict is UNDETERMINED, and is not driven", () => {
    // Diff round 1, finding 6 (P1). Spec §3.5 and the §9 table both say a tie
    // yields UNDETERMINED; nothing implemented it, so the winner was whichever
    // row was read first. Position feeds the band, so that arbitrary pick chose
    // between row 4 (triage pending, High) and row 6 (verdict recorded, Low) --
    // between holding a pane and compacting it.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface } = fakeSurface({
      corpus: () => [
        { status: "verdict", verdict: "APPROVE", endedAt: "2026-01-01T00:00:00Z" },
        { status: "verdict", verdict: "NEEDS-ATTENTION", endedAt: "2026-01-01T00:00:00Z" },
      ],
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
  });

  it("AC-4: exit-zero gh with an unparseable table is UNDETERMINED, and is not driven", () => {
    // Diff round 1, finding 2 (P0), end to end. The reviewer's probe was exactly
    // this: `exitCode:0, stdout:"{"` exited 0 and SENT both checkpoint bytes.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface } = fakeSurface({
      gh: () => ({ exitCode: 0, stdout: "{", stderr: "" }),
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
  });

  it("AC-4: a marker that is present but corrupt is UNDETERMINED, and is not driven", () => {
    // The absent-versus-malformed collapse, the half that is not about gh.
    // `readJson` returned null for both, and absent is a SUPPORTED state
    // (AC-20), so a half-written marker read as "no marker" and drove on.
    // `--checkpoint` asks the target to rewrite this very file, so the adapter
    // creates the interleaving itself.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface } = fakeSurface({
      marker: () => MALFORMED_MARKER,
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
  });

  it("an ABSENT marker still drives, so the fix did not swallow the supported case", () => {
    // The discrimination is the point: if malformed and absent both refused, the
    // bug would read as fixed while the tool stopped working on every pane whose
    // worktree has no marker yet.
    const { run: r } = fakeSurface();
    const out = drive(["--checkpoint", "wM:p1", "--as", "sess-1"], { marker: () => null });
    expect(out.code).toBe(0);
    expect(out.sent.length).toBeGreaterThan(0);
    void r;
  });

  it("AC-16: a labelled pane that resolves to no worktree branch is NOT-AN-ARC", () => {
    // Diff round 1, finding 1 (P0). The adapter took the label's mere EXISTENCE
    // as proof of an arc, so the orchestrator panes -- labelled precisely
    // because they dispatch arcs rather than being one -- classified as
    // drivable. The reviewer probed `bl-mediums-orchestrator` and a checkpoint
    // was SENT to it. Spec §3.6 names that pane and `smalls-batch-orchestrator`
    // as the two live cases; `git worktree list` resolves neither.
    //
    // The override is the point: the fake's DEFAULT resolves every roster label,
    // so this case must remove one to say anything at all.
    const { surface, run: r } = fakeSurface({ branches: () => new Set(["feat/beta"]) });
    const code = main([], surface);
    expect(code).toBe(0);
    // wM:p1 carries `feat/alpha`, which the branch set above deliberately omits.
    const row = r.lines.find((l) => l.includes("wM:p1")) ?? "";
    expect(row).toContain("NOT-AN-ARC");
    // The RAW label still shows, so an operator can see WHY it is not an arc.
    expect(row).toContain("feat/alpha");
  });

  it("AC-16: a pane that is not an arc is never driven", () => {
    const sent: Array<{ target: string; text: string }> = [];
    const { surface } = fakeSurface({
      branches: () => new Set(["feat/beta"]),
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
  });

  it("--checkpoint sends the spec text with the minted nonce substituted", () => {
    const run = drive(["--checkpoint", "wM:p1", "--as", "sess-1"]);
    expect(run.code).toBe(0);
    const text = run.sent.map((s) => s.text).join("");
    expect(text).toContain("nonce-fresh");
    expect(text).toContain(CHECKPOINT_TEXT.replace("<NONCE>", "nonce-fresh"));
    expect(run.sent.every((s) => s.target === "wM:p1")).toBe(true);
  });

  it("--resume sends the resume text", () => {
    const run = drive(["--resume", "wM:p1", "--as", "sess-1"], {
      screen: () => gaugeFor(2),
    });
    expect(run.sent.map((s) => s.text).join("")).toContain(RESUME_TEXT);
  });

  it("--resume refuses when an OBSERVATION stopped the pane, not merely when banding says WAIT", () => {
    // Rule 7 (a non-empty blockedOn) and rules 11/12 (banding) both yield WAIT,
    // so a verdict-based gate cannot tell them apart and would drive a pane an
    // observation had stopped. The rule number is what discriminates.
    const blocked = {
      branch: "feat/alpha",
      stage: "x",
      sessionId: "sess-target",
      blockedOn: "waiting on a human",
    };
    // The premise is about the FIXTURE, read off the fixture — not a restatement
    // of the thing under test.
    premiseHolds("the fixture carries a blockedOn for rule 7 to fire on", blocked.blockedOn !== "");
    // Pressure that would otherwise band to COMPACT, so the refusal cannot be
    // credited to a quiet pane.
    const run = drive(["--resume", "wM:p1", "--as", "sess-1"], {
      marker: () => blocked,
      screen: () => gaugeFor(6),
    });
    expect(run.code).toBe(1);
    expect(run.sent).toEqual([]);
  });

  it("--dry-run prints the bytes and sends NOTHING", () => {
    const run = drive(["--checkpoint", "wM:p1", "--as", "sess-1", "--dry-run"]);
    expect(run.code).toBe(0);
    expect(run.sent).toEqual([]);
    expect(run.lines.join("\n")).toContain("nonce-fresh");
  });

  it("emits no ESC byte on the live send path, across every command", () => {
    for (const cmd of ["--checkpoint", "--compact", "--resume"]) {
      const run = drive([cmd, "wM:p1", "--as", "sess-1"], {
        marker: () => ({
          branch: "feat/alpha",
          stage: "x",
          sessionId: "sess-1",
          blockedOn: "",
          checkpointNonce: "n1",
        }),
      });
      premiseHolds(`${cmd} produced output to inspect`, run.sent.length + run.lines.length > 0);
      for (const s of run.sent) expect(s.text).not.toContain("\x1b");
      for (const l of run.lines) expect(l).not.toContain("\x1b");
    }
  });
});

describe("an unreadable roster degrades, rather than crashing or reading as empty", () => {
  const unreadable = (): never => {
    throw new Error("herdr pane list did not return JSON");
  };

  it("exits 2 — untrusted — and names the reason, instead of 0 for an empty roster", () => {
    // A report of NO PANES and a report of NO ANSWER look identical to a reader,
    // and on --check the first says 0, meaning "nothing needs you".
    const run = drive(["--check", "--as", "sess-1"], { roster: unreadable });
    expect(run.code).toBe(2);
    expect(run.lines.join("\n")).toContain("herdr");
  });

  it("--json puts the reason in the envelope's degraded channel", () => {
    const run = drive(["--json"], { roster: unreadable });
    const env = JSON.parse(run.lines.join("\n")) as { degraded: string[]; panes: unknown[] };
    expect(env.panes).toEqual([]);
    premiseHolds("the degraded channel is populated, not merely present", env.degraded.length > 0);
    expect(env.degraded[0]).toContain("herdr roster unreadable");
  });
});

describe("the accept-set keeps classify's unreachable branch unreachable", () => {
  // `classify` throws "unreachable: a null gauge is rejected by rule 4" if it
  // ever reaches banding with no pressure. That is only safe because the
  // adapter guarantees the pairing: a null gauge ALWAYS yields a named field.
  // Nothing pinned that guarantee, and it is one edit away from being false.
  it("names a field whenever the gauge is unreadable", () => {
    expect(rejectedFieldOf({ status: "idle", tenths: null, marker: null })).not.toBeNull();
  });

  it("names the STATUS first when both the status and the gauge are bad", () => {
    // Ordering matters for the message an operator reads: an unknown status is
    // the more specific complaint, and the gauge of a pane in a bad state is
    // not evidence of anything.
    const field = rejectedFieldOf({ status: "wedged", tenths: null, marker: null });
    expect(field).toContain("agent_status");
  });

  it("admits every declared marker field, including the optional checkpointNonce", () => {
    // §5.2 adds checkpointNonce and §4.3 admits it; rejecting it would stop the
    // protocol at its own first command.
    const marker = {
      branch: "feat/x",
      stage: "s",
      tasksRemaining: 0,
      next: "n",
      blockedOn: "",
      cronJobId: "c",
      sessionId: "id",
      checkpointNonce: "n1",
    };
    expect(rejectedFieldOf({ status: "idle", tenths: 6, marker })).toBeNull();
  });

  it("names an UNDECLARED marker key rather than ignoring it", () => {
    const field = rejectedFieldOf({
      status: "idle",
      tenths: 6,
      marker: { branch: "feat/x", surpriseKey: 1 },
    });
    expect(field).toBe("marker.surpriseKey");
  });
});

describe("herdr agent get answers on EITHER stream, and both are read", () => {
  // Probed against live herdr: a hit exits 0 with JSON on stdout; a MISS exits 1
  // with JSON on STDERR. Reading stdout alone turns every not-found into a parse
  // failure — a fault, exit 2 — which reports a real answer as a broken tool.
  it("reads a not-found off stderr, not as a parse failure", () => {
    const miss = parseAgentGet({
      exitCode: 1,
      stdout: "",
      stderr: '{"error":{"code":"agent_not_found","message":"agent target x not found"}}',
    });
    expect(miss).toEqual({ notFound: true });
  });

  it("reads a hit off stdout", () => {
    const hit = parseAgentGet({
      exitCode: 0,
      stdout: '{"result":{"agent":{"pane_id":"wQ:pE"}}}',
      stderr: "",
    });
    expect(hit).toEqual({ paneId: "wQ:pE" });
  });

  it("keeps a DIFFERENT structured error a fault, rather than folding it into not-found", () => {
    const other = parseAgentGet({
      exitCode: 1,
      stdout: "",
      stderr: '{"error":{"code":"server_unreachable"}}',
    });
    expect(other).toEqual({ fault: "server_unreachable" });
  });

  it("calls unparseable output a fault, naming the exit code", () => {
    const junk = parseAgentGet({ exitCode: 127, stdout: "", stderr: "herdr: command not found" });
    premiseHolds("the fixture really is unparseable", !"herdr: command not found".startsWith("{"));
    expect(junk).toEqual({ fault: "herdr agent get did not return JSON (exit 127)" });
  });
});

describe("a pane with no cwd is answered, never guessed at", () => {
  it("reads unknown rather than spawning in the orchestrator's own directory", () => {
    // A plain shell pane carries no cwd. Spawning with an empty cwd would run in
    // whatever directory the orchestrator happens to be in and report THAT
    // worktree's git and PR state as the pane's. These guards return before any
    // spawn, which is also what makes them safe to assert here.
    const real = realSurface();
    expect(real.git("")).toEqual({ clean: false, lastCommitAt: null });
    expect(real.marker("")).toBeNull();
    // Not a check state and not the no-PR signature, so rule 6 reports
    // UNDETERMINED rather than letting a missing cwd read as "no PR".
    expect(classifyGh(real.gh("")).kind).toBe("fault");
  });
});

describe("the shipped entry point actually runs", () => {
  it("parses argv and exits non-zero on a refusal, through the pnpm alias", () => {
    // Hermetic: this path refuses before any herdr, git or gh read. A stub that
    // imports the core and does nothing exits 0 with no output and fails here.
    let code = 0;
    let out = "";
    try {
      out = execFileSync("pnpm", ["panes:compact", "--check"], {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      const err = e as { status?: number; stdout?: string; stderr?: string };
      code = err.status ?? 0;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    expect(code).toBe(1);
    expect(out).toContain("--as");
  }, 120_000);
});
