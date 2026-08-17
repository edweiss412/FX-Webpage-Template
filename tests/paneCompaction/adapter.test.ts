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

import { classifyGh } from "@/scripts/lib/pane-compaction-core";
import {
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
/** `raw` is separate from `lines` so a case can assert BYTES, which is what AC-6 is about. */
type Run = {
  code: number;
  lines: string[];
  raw: string[];
  sent: Array<{ target: string; text: string }>;
};

/**
 * A surface whose every read is a fixture. No case shares one: a shared surface
 * is how a case ends up proving something about its neighbour's inputs.
 */
/**
 * A COMPLETE §4.3 marker. All seven fields are required of a marker that
 * exists, so a partial literal is a rule-4 rejection -- which would silently
 * turn any case using one into a rejection case instead of what it names.
 * Cases that deliberately test rejection build their literal inline.
 */
function fullMarker(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    branch: "feat/alpha",
    stage: "x",
    tasksRemaining: 0,
    next: "n",
    blockedOn: "",
    cronJobId: "c",
    sessionId: "sess-target",
    ...over,
  };
}

function fakeSurface(over: Partial<Surface> = {}): { surface: Surface; run: Run } {
  const run: Run = { code: 0, lines: [], raw: [], sent: [] };
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
    // COMPLETE: §4.3 requires all seven fields of a PRESENT marker, so a
    // partial fixture would now be UNDETERMINED and every drivable case here
    // would be testing the rejection path instead of what it names.
    marker: () => ({
      branch: "feat/alpha",
      stage: "x",
      tasksRemaining: 0,
      next: "n",
      blockedOn: "",
      cronJobId: "c",
      sessionId: "sess-target",
    }),
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
    outRaw: (bytes) => run.raw.push(bytes),
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
  // COMPLETE markers: §4.3 requires all seven fields of a marker that EXISTS,
  // so a partial fixture would be rejected by rule 4 and every case below would
  // silently become a rule-4 case instead of the rule-5 case it names.
  const markerFor = (sessionId: string): Record<string, unknown> => ({
    branch: "feat/alpha",
    stage: "x",
    tasksRemaining: 0,
    next: "n",
    blockedOn: "",
    cronJobId: "c",
    sessionId,
  });

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

  it("no-ops when there is NO marker at all — absent cannot mismatch (AC-20)", () => {
    // AC-20 is about an ABSENT marker, and the fixture used to express that as a
    // marker missing `sessionId`. Those are different things: §4.3 requires all
    // seven fields of a marker that exists, so the old fixture is now a rule-4
    // rejection and would have made this case pass for the wrong reason.
    const run = drive(["--check", "--as", "sess-1"], {
      marker: () => null,
      screen: () => gaugeFor(6),
    });
    expect(run.code).toBe(1);
  });

  it("a marker that EXISTS but omits a required field is untrusted, not actionable", () => {
    // The other half of the same distinction, and spec §9's round-1 precedence
    // case: a below-band pane with a missing marker field is UNDETERMINED, not
    // HOLD. A partial write is ordinary here -- `--checkpoint` asks targets to
    // rewrite this very file.
    const run = drive(["--check", "--as", "sess-1"], {
      marker: () => ({ branch: "feat/alpha" }),
      screen: () => gaugeFor(6),
    });
    expect(run.code).toBe(2);
  });
});

describe("every refusal NAMES its reason", () => {
  it("--check without --as exits 1 and says so", () => {
    const run = drive(["--check"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("--as");
  });

  it("--all is rejected by name rather than silently ignored", () => {
    // Reached through a NON-sending mode now: the send fence returns before
    // argv is validated further, so `--compact --all` reports the fence. That
    // ordering is deliberate -- "this command is disabled" is the more relevant
    // truth than "and also --all is not accepted".
    const run = drive(["--all", "--check", "--as", "sess-1"]);
    expect(run.code).toBe(1);
    expect(run.lines.join("\n")).toContain("--all");
  });
});

describe("the send fence refuses the COMMAND, without observing the pane", () => {
  // The send path is deferred to its own arc
  // (BL-PANE-COMPACTION-SEND-AUTHORIZATION) after five review rounds produced a
  // P0 in every one, all of them here from round 3 on.
  //
  // These cases assert something STRONGER than the ones they replace: not just
  // that nothing is sent, but that nothing is READ. That is the property which
  // makes the refusal message true. One of the defects being fenced was a
  // refusal that named the wrong condition -- "marker carries no
  // checkpointNonce" while a matching nonce sat in the marker -- and a fence
  // placed after observation could reproduce exactly that, refusing a disabled
  // command by citing whatever pane state it happened to find.
  const MODES = ["--checkpoint", "--compact", "--resume"] as const;

  it.each(MODES)("%s refuses and reads NOTHING", (mode) => {
    const reads: string[] = [];
    const { surface, run } = fakeSurface();
    const watched: Surface = {
      ...surface,
      roster: () => {
        reads.push("roster");
        return surface.roster();
      },
      marker: (cwd) => {
        reads.push("marker");
        return surface.marker(cwd);
      },
      gh: (cwd) => {
        reads.push("gh");
        return surface.gh(cwd);
      },
      screen: (id) => {
        reads.push("screen");
        return surface.screen(id);
      },
      purview: () => {
        reads.push("purview");
        return surface.purview();
      },
      resolveTarget: (t) => {
        reads.push("resolveTarget");
        return surface.resolveTarget(t);
      },
    };
    const code = main([mode, "wM:p1", "--as", "sess-1"], watched);
    expect(code).toBe(2);
    expect(reads).toEqual([]);
    expect(run.sent).toEqual([]);
  });

  it.each(MODES)("%s --dry-run is fenced too, and prints no bytes", (mode) => {
    // A dry run of a disabled command must not print the payload it would have
    // sent: that reads as "ready to go" for a command that cannot run.
    const { surface, run } = fakeSurface();
    const code = main([mode, "wM:p1", "--as", "sess-1", "--dry-run"], surface);
    expect(code).toBe(2);
    expect(run.raw).toEqual([]);
    expect(run.sent).toEqual([]);
  });

  it("says WHY, and does not blame the pane", () => {
    const { surface, run } = fakeSurface();
    main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    const out = run.lines.join("\n");
    expect(out).toContain("disabled in this release");
    expect(out).toContain("BL-PANE-COMPACTION-SEND-AUTHORIZATION");
    // The message must not imply anything was inspected.
    expect(out).toContain("nothing was observed");
  });

  it("the read-only surfaces still work", () => {
    // The fence must not take the shipped half with it: the report and --check
    // are what this release delivers.
    expect(drive([]).code).toBe(0);
    expect([0, 1, 2]).toContain(drive(["--check", "--as", "sess-1"]).code);
    expect(drive(["--json"]).code).toBe(0);
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
      // COMPLETE apart from the extra key: the required-presence check runs
      // first, so a partial literal here would report a MISSING field and this
      // case would pass while asserting nothing about undeclared keys.
      marker: fullMarker({ surpriseKey: 1 }),
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
