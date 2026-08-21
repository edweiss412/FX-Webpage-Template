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
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CHECKPOINT_TEXT,
  RESUME_TEXT,
  addressPayload,
  classifyGh,
} from "@/scripts/lib/pane-compaction-core";
import {
  MALFORMED_MARKER,
  NON_READ_MEMBERS,
  SendFailed,
  unknownBucketOf,
  type Surface,
  main,
  parseAgentGet,
  realSurface,
  rejectedFieldOf,
} from "@/scripts/pane-compaction";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { gaugeFor } from "@/tests/paneCompaction/fixtures";
import { SEND_AUTH_SURFACES } from "@/tests/paneCompaction/sendAuthScan";

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

/** The seven fields §4.3 requires of a marker that EXISTS. */
const MARKER_REQUIRED_FIELDS = [
  "branch",
  "stage",
  "tasksRemaining",
  "next",
  "blockedOn",
  "cronJobId",
  "sessionId",
] as const;

/**
 * Cases that DELIBERATELY hand over an incomplete marker, by title suffix.
 *
 * Diff round 1 found three cases whose partial fixture refused at RULE 4 -- an
 * accept-set rejection -- long before reaching the nonce, the rule-7 stop, or
 * the live send each of them named. They passed while asserting nothing about
 * their own subject, and the no-ESC loop's premise counted refusal LINES as
 * sufficient, so all three modes "passed" having sent nothing at all.
 *
 * A LIST of those three would have been the wrong repair: my own static sweep
 * for the shape missed a fourth, because its fixture was a named const the
 * regex did not match. This is the derived cover instead -- it runs on every
 * marker any case hands the adapter, whatever syntax produced it -- and it
 * caught SIX, two of which are genuinely deliberate and are named here.
 */
const INCOMPLETE_MARKER_IS_THE_POINT: readonly string[] = [
  // Its subject IS the missing field.
  "a marker that EXISTS but omits a required field is untrusted, not actionable",
  // Hands over the frozen MALFORMED_MARKER sentinel; corruption is the subject.
  "AC-4: a marker that is present but corrupt is UNDETERMINED, and is not driven",
];

function assertMarkerComplete(marker: Record<string, unknown> | null, caseName: string): void {
  if (marker === null) return; // an ABSENT marker is a supported observation (AC-20)
  // By SUFFIX: `currentTestName` carries the describe path ahead of the title.
  if (INCOMPLETE_MARKER_IS_THE_POINT.some((t) => caseName.endsWith(t))) return;
  const missing = MARKER_REQUIRED_FIELDS.filter((f) => !(f in marker));
  if (missing.length === 0) return;
  throw new Error(
    `fixture defect in "${caseName}": the marker omits ${missing.join(", ")}, so this case ` +
      `refuses at RULE 4 (accept-set) before reaching what its title names. Build it with ` +
      `fullMarker(), or add the title to INCOMPLETE_MARKER_IS_THE_POINT if the incompleteness ` +
      `IS the subject.`,
  );
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
    // Mirrors the real surface: spends the authorized grant and ONLY that one.
    //
    // An UNSEEDED store trusts the read. Many cases stub `nonceRead` to a
    // literal without ever writing the map, and a default that compared against
    // the empty map would refuse every one of them for a reason the case is not
    // about. A case that seeds a DIFFERENT value still gets the refusal, and
    // the strict compare itself is pinned where it belongs -- on the real
    // surface, by the newer-grant case below and by `revalidate.test.ts`'s
    // false-consume twin. Re-reading `nonceRead` here would have been the other
    // way to stay consistent, and it would have broken the once-per-member
    // counts by adding a second read outside the pass.
    nonceConsume: (sessionId, paneId, expected) => {
      const key = `${sessionId} ${paneId}`;
      const held = nonces.has(key) ? nonces.get(key) : expected;
      if (held !== expected) return false;
      nonces.delete(key);
      return true;
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
  // The guard sits on the SURFACE, so it sees whatever any case actually hands
  // the adapter -- an inline literal, a named const, or a closure -- rather
  // than whatever a static scan of this file can recognise.
  const declared = surface.marker;
  surface.marker = (cwd: string): Record<string, unknown> | null => {
    const marker = declared(cwd);
    assertMarkerComplete(marker, expect.getState().currentTestName ?? "(unknown case)");
    return marker;
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

describe("--dry-run shows the refusal it would hit, and spends nothing", () => {
  it("--compact --dry-run refuses on an absent nonce instead of printing /compact", () => {
    // AC-19. A dry run that prints the command when the real one would exit 1
    // tells an operator it is ready to go, which is worse than no dry run.
    // COMPLETE marker (diff r1 F1): the partial literal here omitted
    // tasksRemaining, next and cronJobId, so this refused at RULE 4 and never
    // reached the nonce its title is about. The nonce is absent because
    // `nonceRead` defaults to null -- which is the condition under test.
    const run = drive(["--compact", "wM:p1", "--as", "sess-1", "--dry-run"], {
      marker: () => fullMarker({ checkpointNonce: "n1" }),
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
    premiseHolds("the dry run really did produce the prompt", run.raw.join("").length > 0);
    expect(written).toEqual([]);
    expect(run.sent).toEqual([]);
  });

  it("--compact --dry-run does not CONSUME the nonce it checked", () => {
    // Reading and comparing is the gate; spending it is the side effect. A dry
    // run that consumed would make the real --compact that follows it fail.
    const consumed: string[] = [];
    const { surface, run } = fakeSurface({
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
      nonceConsume: (sessionId, paneId, expected) => {
        consumed.push(`${sessionId}/${paneId}/${expected}`);
        return true;
      },
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1", "--dry-run"], surface);
    expect(code).toBe(0);
    expect(run.raw.join("")).toContain("/compact");
    expect(consumed).toEqual([]);
    expect(run.sent).toEqual([]);
  });

  it("a NEWER grant landing between the decision and the spend is not destroyed", () => {
    // Diff round 2, core finding 1 (P1). The equality lives in `authorizeSend`,
    // but the EFFECT was never tied to the value that authorized it:
    // `nonceConsume(sessionId, paneId)` never RECEIVED the nonce, so it could
    // not compare and deleted whatever was there. A stale `--compact` whose
    // grant was replaced mid-flight exited 0 and silently destroyed a newer
    // one-shot grant nobody had authorized -- worse than what §7 limit 1 states
    // its own worst case is, and silent, which the consequence bound forbids.
    const store = new Map<string, string>([["sess-1 wM:p1", "old"]]);
    const { surface, run } = fakeSurface({
      marker: () => fullMarker({ checkpointNonce: "old" }),
      nonceRead: (sessionId, paneId) => {
        const held = store.get(`${sessionId} ${paneId}`) ?? null;
        // A concurrent `--checkpoint` lands exactly here, replacing the grant.
        store.set(`${sessionId} ${paneId}`, "new");
        return held;
      },
      nonceConsume: (sessionId, paneId, expected) => {
        const key = `${sessionId} ${paneId}`;
        if (store.get(key) !== expected) return false;
        store.delete(key);
        return true;
      },
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    premiseHolds(
      "the decision really was taken on the OLD grant, so this exercises the window",
      store.get("sess-1 wM:p1") === "new",
    );
    // The newer grant is not ours to spend and not ours to destroy.
    expect(store.get("sess-1 wM:p1")).toBe("new");
    expect(run.sent).toEqual([]);
    expect(code).toBe(1);
    expect(run.lines.join("\n")).toContain("not the one this command recorded");
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
      marker: () => fullMarker({ blockedOn: "waiting on CI" }),
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
      marker: () => fullMarker({ surpriseKey: 1 }),
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

  it("AC-13: a purview transferred IN the pass refuses, having sent nothing", () => {
    // ADAPTED (spec §8.1 class 2). The pre-fence case injected the transfer
    // BETWEEN two reads -- `premiseHolds("the purview was actually re-read
    // after the first observation", reads > 1)` -- because that is how "changed
    // between observation and send" had to be expressed against two-pass code.
    // There is no second read to ride on now, so the transfer moves INTO the
    // pass's own single read and the claim becomes: ownership is derived from
    // that read, and a pane owned by someone else refuses.
    //
    // Everything else is deliberately authorized -- the verdict is COMPACT and
    // the nonce MATCHES -- so the refusal is attributable to ownership alone
    // and cannot be credited to a pane that was never drivable.
    // Kill target (Task 4): the ownership-check-deleted build.
    const row = {
      paneId: "wM:p1",
      agentName: "feat/alpha",
      branch: "feat/alpha",
      dispatchedAt: "2026-08-16T00:00:00Z",
    };
    let reads = 0;
    const sent: Array<{ target: string; text: string }> = [];
    const { surface, run: r } = fakeSurface({
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
      purview: () => {
        reads += 1;
        // Singly claimed, and therefore still COMPACT-shaped -- by SOMEONE ELSE.
        return [{ sessionId: "sess-other", rows: [row] }];
      },
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    premiseHolds("the purview was read at all, so the refusal is about ownership", reads > 0);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
    const out = r.lines.join("\n");
    expect(out).toContain("claimed by sess-other");
    // NOT a nonce reason: the nonce matches, and naming it would send an
    // operator to re-checkpoint a pane they do not own.
    expect(out).not.toContain("checkpointNonce");
  });

  // RETIRED (spec §8.1 class 3): the pre-fence `it.each(["--checkpoint",
  // "--resume"])("%s revalidates before sending, like --compact does")` pair.
  // Its premise WAS the second read -- `premiseHolds("the marker was re-read
  // for revalidation", reads > 1)` -- and §3.2 deletes the second read, so the
  // premise can no longer hold and the case would fail as an environment
  // error rather than as a defect. Its INTENT, that every sending mode derives
  // its stop from THIS invocation's own state, is carried by the structural
  // cover's set-equality and two-invocation freshness cases below, and by the
  // rule 1-8 pins in `authorization.test.ts`.

  it("a pane absent from the pass's roster refuses with THAT reason, not a nonce reason", () => {
    // ADAPTED (spec §8.1 class 2), and the LYING-REFUSAL pin is the part that
    // survives unchanged. Diff round 5, finding 4 (P1) was a defect in the
    // round-4 repair: disappearance was encoded as a stale report with a null
    // nonce, so the refusal read "marker carries no checkpointNonce" while a
    // MATCHING nonce sat in the marker, sending an operator to re-checkpoint a
    // pane that no longer existed.
    //
    // The pre-fence case injected the disappearance between two roster reads.
    // Under one pass there is ONE roster read, so the pane is simply not in it:
    // herdr resolves the target, the pass's roster does not carry it, and the
    // refusal must still name THAT and not the nonce. The nonce is deliberately
    // present and matching, which is what gives the second assertion its force.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface, run: r } = fakeSurface({
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
      resolveTarget: () => ({ paneId: "wM:pGONE" }),
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    premiseHolds(
      "the marker really does carry a matching nonce, so a nonce refusal would be a LIE",
      surface.marker("/w/alpha")?.["checkpointNonce"] === "n1" &&
        surface.nonceRead("sess-1", "wM:p1") === "n1",
    );
    expect(code).toBe(1);
    expect(sent).toEqual([]);
    const out = r.lines.join("\n");
    expect(out).toContain("not on the roster");
    expect(out).not.toContain("checkpointNonce");
  });

  it("AC-17: a marker session that does not match the live pane refuses, nonce intact", () => {
    // ADAPTED (spec §8.1 class 2) -- the MARKER side of rule 5's comparison.
    // Diff round 4, finding 1 (P0) was the fourth appearance of one class: the
    // marker was read twice, once inside revalidation's observe and once by the
    // nonce thunk, and a takeover that changed `sessionId` between those reads
    // while PRESERVING the nonce passed rule 5 on the stale copy and sent.
    //
    // With one read there are no two copies to straddle, so the mismatch moves
    // into the pass itself: the marker the pass read names a session that is
    // not the one living in the pane. The nonce is deliberately intact, so
    // only rule 5 can produce this refusal.
    // Kill target (Task 4): the rule-1-8-stop-deleted build.
    let markerReads = 0;
    const sent: Array<{ target: string; text: string }> = [];
    const { surface, run: r } = fakeSurface({
      nonceRead: () => "n1",
      marker: () => {
        markerReads += 1;
        // The roster fixture's wM:p1 lives at `agentSession: "sess-target"`.
        return fullMarker({ sessionId: "sess-successor", checkpointNonce: "n1" });
      },
      send: (target, text) => sent.push({ target, text }),
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    premiseHolds("the marker was read, so rule 5 had something to compare", markerReads > 0);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
    expect(r.lines.join("\n")).toContain("rule 5");
  });

  it("AC-17: a takeover visible in the pass's roster refuses, having sent nothing", () => {
    // ADAPTED (spec §8.1 class 2) -- the ROSTER side of rule 5's comparison,
    // and the twin of the case above. Both are kept because rule 5 compares TWO
    // sources and a build that dropped either one would still pass the other's
    // case. Diff round 3, finding 1 (P0): revalidation re-observed but reused
    // the ORIGINAL roster, so every roster-derived rule (1, 2, 5, 7) was frozen
    // and a takeover swapping `agent_session` was invisible.
    //
    // The old case asserted `rosterReads > 1`, which is exactly what §3.2
    // deletes. The takeover now sits in the pass's only roster read.
    // Kill target (Task 4): the rule-1-8-stop-deleted build.
    let rosterReads = 0;
    const sent: Array<{ target: string; text: string }> = [];
    const { surface, run: r } = fakeSurface({
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
      send: (target, text) => sent.push({ target, text }),
    });
    const base = surface.roster();
    const patched: Surface = {
      ...surface,
      roster: () => {
        rosterReads += 1;
        // A successor session already holds the pane; the marker still names
        // its predecessor, which is what AC-17 asks rule 5 to catch.
        return base.map((p) =>
          p.paneId === "wM:p1" ? { ...p, agentSession: "sess-successor" } : p,
        );
      },
    };
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], patched);
    premiseHolds("the roster was read, so rule 5 had something to compare", rosterReads > 0);
    expect(code).toBe(1);
    expect(sent).toEqual([]);
    expect(r.lines.join("\n")).toContain("rule 5");
  });

  it("herdr agent get returning literal null is a named fault, not a crash", () => {
    // Diff round 3, finding 2 (P0), second half. `JSON.parse("null")` succeeds
    // and `typeof null === "object"`, so the property reads threw instead of
    // faulting. A malformed reply from a subprocess is ordinary operation.
    const out = parseAgentGet({ exitCode: 0, stdout: "null", stderr: "" });
    expect("fault" in out).toBe(true);
  });

  it("a gh table containing a null row is a named rejection, not a crash", () => {
    expect(unknownBucketOf({ exitCode: 0, stdout: "[null]", stderr: "" })).toBe("(missing)");
  });

  it("a marker whose known key holds the wrong TYPE is not driven", () => {
    // Diff round 2, finding 1 (P0), end to end.
    const sent: Array<{ target: string; text: string }> = [];
    // COMPLETE apart from the bad TYPE (diff r1 F1, one instance past the three
    // the reviewer named): `{ sessionId: 123 }` alone omits six required
    // fields, and the required-presence check runs FIRST, so this refused for
    // MISSINGNESS while claiming to be about the type.
    const { surface } = fakeSurface({
      marker: () => fullMarker({ sessionId: 123 }),
      send: (target, text) => sent.push({ target, text }),
    });
    expect(main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface)).toBe(1);
    expect(sent).toEqual([]);
  });

  it("an unrecognized gh bucket is not driven", () => {
    // Diff round 2, finding 2 (P0), end to end.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface } = fakeSurface({
      gh: () => ({ exitCode: 0, stdout: '[{"bucket":"mystery"}]', stderr: "" }),
      send: (target, text) => sent.push({ target, text }),
    });
    expect(main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface)).toBe(1);
    expect(sent).toEqual([]);
  });

  it("a corpus whose only verdict row has an unparsable timestamp is not driven", () => {
    // Diff round 2, finding 3 (P0), end to end.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface } = fakeSurface({
      corpus: () => [{ status: "verdict", verdict: "APPROVE", endedAt: "not-a-date" }],
      send: (target, text) => sent.push({ target, text }),
    });
    expect(main(["--checkpoint", "wM:p1", "--as", "sess-1"], surface)).toBe(1);
    expect(sent).toEqual([]);
  });

  it("a second positional target is refused, never silently ignored", () => {
    // Diff round 2, finding 5 (P1), end to end. Refused BEFORE any observation.
    const sent: Array<{ target: string; text: string }> = [];
    const { surface, run: r } = fakeSurface({
      send: (target, text) => sent.push({ target, text }),
    });
    expect(main(["--checkpoint", "wM:p1", "wM:p2", "--as", "sess-1"], surface)).toBe(1);
    expect(sent).toEqual([]);
    expect(r.lines.join("\n")).toContain("single target");
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
      marker: () => fullMarker({ checkpointNonce: "n1" }),
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

  it("--checkpoint sends the ADDRESSED text with the minted nonce substituted", () => {
    // ADAPTED (spec §8.1 class 2): the payload gains §3.6's address line. The
    // fixture's pane runs `feat/alpha` and its marker names `sess-target`, so
    // this is the WITH-SESSION form; the branch-only form is below.
    const run = drive(["--checkpoint", "wM:p1", "--as", "sess-1"]);
    expect(run.code).toBe(0);
    const text = run.sent.map((s) => s.text).join("");
    expect(text).toContain("nonce-fresh");
    expect(text).toContain(
      addressPayload(CHECKPOINT_TEXT, { branch: "feat/alpha", session: "sess-target" }).replace(
        "<NONCE>",
        "nonce-fresh",
      ),
    );
    expect(run.sent.every((s) => s.target === "wM:p1")).toBe(true);
  });

  it("--checkpoint addresses by BRANCH ALONE when the pass's marker names no session", () => {
    // The other address form, and the only way to reach it: §4.3 requires
    // `sessionId` of a marker that EXISTS, so a session-less marker is a rule-4
    // rejection. An ABSENT marker is the supported state that produces a
    // session-less address (AC-20), and the case above it pins that such a pane
    // still drives.
    const run = drive(["--checkpoint", "wM:p1", "--as", "sess-1"], { marker: () => null });
    expect(run.code).toBe(0);
    const text = run.sent.map((s) => s.text).join("");
    expect(text).toContain(
      addressPayload(CHECKPOINT_TEXT, { branch: "feat/alpha", session: null }).replace(
        "<NONCE>",
        "nonce-fresh",
      ),
    );
    // The parenthetical is omitted WHOLE -- `(session )` addresses nobody while
    // looking like it addresses someone.
    expect(text).not.toContain("(session");
  });

  it("--resume sends the ADDRESSED resume text, carrying the marker-deference line", () => {
    const run = drive(["--resume", "wM:p1", "--as", "sess-1"], {
      screen: () => gaugeFor(2),
    });
    const text = run.sent.map((s) => s.text).join("");
    expect(text).toContain(
      addressPayload(RESUME_TEXT, { branch: "feat/alpha", session: "sess-target" }),
    );
    // The round-3 repair, asserted on the BYTES that leave rather than on the
    // constant: the recipient's own marker outranks this message.
    expect(text).toContain("your marker outranks this message");
  });

  it("--resume --dry-run prints the addressed bytes, in the branch-only form too", () => {
    const withSession = drive(["--resume", "wM:p1", "--as", "sess-1", "--dry-run"], {
      screen: () => gaugeFor(2),
    });
    expect(withSession.code).toBe(0);
    expect(withSession.raw.join("")).toBe(
      `${addressPayload(RESUME_TEXT, { branch: "feat/alpha", session: "sess-target" })}\r`,
    );
    expect(withSession.sent).toEqual([]);

    const branchOnly = drive(["--resume", "wM:p1", "--as", "sess-1", "--dry-run"], {
      screen: () => gaugeFor(2),
      marker: () => null,
    });
    expect(branchOnly.code).toBe(0);
    expect(branchOnly.raw.join("")).toBe(
      `${addressPayload(RESUME_TEXT, { branch: "feat/alpha", session: null })}\r`,
    );
    expect(branchOnly.sent).toEqual([]);
  });

  it("--resume refuses when an OBSERVATION stopped the pane, not merely when banding says WAIT", () => {
    // Rule 7 (a non-empty blockedOn) and rules 11/12 (banding) both yield WAIT,
    // so a verdict-based gate cannot tell them apart and would drive a pane an
    // observation had stopped. The rule number is what discriminates.
    // COMPLETE (diff r1 F1): the partial literal refused at RULE 4, so rule 7 --
    // the rule this case exists to distinguish from banding -- never fired.
    const blocked = fullMarker({ blockedOn: "waiting on a human" });
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
    expect(run.raw.join("")).toContain("nonce-fresh");
  });

  it("AC-6: --compact --dry-run emits the live bytes EXACTLY, hex-compared", () => {
    // Diff round 3, finding 4 (P1). The dry run routed `\r` through the
    // line-oriented `out`, so `/compact\r` printed as `/compact\n\r\n`
    // (2f636f6d706163740a0d0a) where the live path sends 2f636f6d706163740d. A
    // dry run whose bytes differ from the real ones previews nothing -- and
    // this surface's entire contract is which bytes reach another session.
    //
    // Hex, because the difference is invisible in a rendered string.
    const dry = drive(["--compact", "wM:p1", "--as", "sess-1", "--dry-run"], {
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
    });
    const live = drive(["--compact", "wM:p1", "--as", "sess-1"], {
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
    });
    premiseHolds("the live path actually sent something", live.sent.length > 0);
    const hex = (s: string): string => Buffer.from(s, "utf8").toString("hex");
    expect(hex(dry.raw.join(""))).toBe(hex(live.sent.map((x) => x.text).join("")));
    expect(dry.sent).toEqual([]);
  });

  it("emits no ESC byte on the live send path, across every command", () => {
    for (const cmd of ["--checkpoint", "--compact", "--resume"]) {
      // COMPLETE marker and a matching nonce record (diff r1 F1). The partial
      // literal refused at RULE 4, so every mode sent NOTHING -- and the old
      // premise counted refusal LINES as sufficient, which let a live-path
      // assertion pass having observed no live path at all.
      const run = drive([cmd, "wM:p1", "--as", "sess-1"], {
        marker: () => fullMarker({ checkpointNonce: "n1" }),
        nonceRead: () => "n1",
      });
      premiseHolds(`${cmd} reached the LIVE send path`, run.sent.length > 0);
      for (const s of run.sent) expect(s.text).not.toContain("\x1b");
      for (const l of run.lines) expect(l).not.toContain("\x1b");
    }
  });
});

// ---------------------------------------------------------------------------
// The read-member set, DERIVED from the enrolment row rather than hand-listed
// ---------------------------------------------------------------------------

/**
 * A read member is any `Surface` member that is NOT a declared sink, effect or
 * ambient source. The complement is taken against the SAME enrolment row the
 * send-auth scanner consumes, so the runtime cover and the static one cannot
 * disagree about what a read is, and a member added to `Surface` lands in this
 * set by default rather than being silently exempt.
 */
const SEND_AUTH_ROW = SEND_AUTH_SURFACES.find((r) => r.module === "scripts/pane-compaction.ts");

function derivedReadMembers(): string[] {
  if (SEND_AUTH_ROW === undefined) {
    throw new Error("scripts/pane-compaction.ts is not enrolled in SEND_AUTH_SURFACES");
  }
  const notRead = new Set<string>([
    ...SEND_AUTH_ROW.sinks,
    ...SEND_AUTH_ROW.effects,
    ...SEND_AUTH_ROW.ambient,
  ]);
  return Object.keys(fakeSurface().surface).filter((k) => !notRead.has(k));
}

const READ_MEMBERS = derivedReadMembers();

const SENDING_MODES = ["--checkpoint", "--compact", "--resume"] as const;

/**
 * Which read members each mode's pass consults.
 *
 * Declared per mode INDEPENDENTLY of the run, so the cover is set equality
 * rather than at-most-one -- a build that cached a zero-read value would
 * satisfy "at most one call" while reading nothing at all. The union is
 * asserted against the derived set below, so a new read member cannot be
 * omitted from every mode's expectation and vanish.
 */
const EXPECTED_READS: Record<(typeof SENDING_MODES)[number], readonly string[]> = {
  // roster + resolveTarget resolve the target; purview + branches build the
  // cache; marker, screen, gh, git and corpus are the observation.
  "--checkpoint": [
    "roster",
    "resolveTarget",
    "purview",
    "branches",
    "marker",
    "screen",
    "gh",
    "git",
    "corpus",
  ],
  // ...plus the outstanding-nonce record, which only --compact compares.
  "--compact": [
    "roster",
    "resolveTarget",
    "purview",
    "branches",
    "marker",
    "screen",
    "gh",
    "git",
    "corpus",
    "nonceRead",
  ],
  "--resume": [
    "roster",
    "resolveTarget",
    "purview",
    "branches",
    "marker",
    "screen",
    "gh",
    "git",
    "corpus",
  ],
};

/** Fixtures that make each mode reach its send, so a refusal cannot pass as a pass. */
const DRIVABLE: Partial<Surface> = {
  marker: () => fullMarker({ checkpointNonce: "n1" }),
  nonceRead: () => "n1",
};

/** Every read member wrapped in a counter. Sinks, effects and ambient are untouched. */
function countingSurface(over: Partial<Surface> = {}): {
  surface: Surface;
  run: Run;
  counts: Map<string, number>;
} {
  const { surface, run } = fakeSurface(over);
  const counts = new Map<string, number>();
  const spied: Record<string, unknown> = { ...(surface as unknown as Record<string, unknown>) };
  for (const member of READ_MEMBERS) {
    const original = (surface as unknown as Record<string, (...a: never[]) => unknown>)[member];
    if (typeof original !== "function") throw new Error(`read member ${member} is not callable`);
    spied[member] = (...args: never[]): unknown => {
      counts.set(member, (counts.get(member) ?? 0) + 1);
      return original(...args);
    };
  }
  return { surface: spied as unknown as Surface, run, counts };
}

describe("one read-once pass per sending invocation (AC-1, AC-2)", () => {
  it("the adapter's exclusion set is exactly the enrolment row's non-read members", () => {
    // The pass is built from `NON_READ_MEMBERS`; the scanner reasons from the
    // enrolment row. Two copies of one fact drift, and the drift would be
    // invisible in the direction that matters: a member the adapter treats as
    // non-read but the row calls a read would sit outside the pass while the
    // static arm reported nothing.
    const rowNonRead = [
      ...(SEND_AUTH_ROW?.sinks ?? []),
      ...(SEND_AUTH_ROW?.effects ?? []),
      ...(SEND_AUTH_ROW?.ambient ?? []),
    ].sort();
    premise("the row declares non-read members to compare against", rowNonRead.length, 0);
    expect([...NON_READ_MEMBERS].sort()).toEqual(rowNonRead);
  });

  it("the derived read set is non-empty and excludes every declared sink, effect and ambient", () => {
    // The cover's own premise. A complement that came back empty -- or that
    // still contained `send` -- would make every assertion below vacuous, and
    // it would look exactly like a clean result.
    premise("the complement found read members", READ_MEMBERS.length, 0);
    for (const excluded of [
      ...(SEND_AUTH_ROW?.sinks ?? []),
      ...(SEND_AUTH_ROW?.effects ?? []),
      ...(SEND_AUTH_ROW?.ambient ?? []),
    ]) {
      expect(READ_MEMBERS).not.toContain(excluded);
    }
    // The two members the six chains actually named. If either fell out of the
    // set the cover would go quiet on the defect it exists for.
    expect(READ_MEMBERS).toContain("marker");
    expect(READ_MEMBERS).toContain("roster");
  });

  it("the expected-read table covers the whole derived set — no member is unaccounted for", () => {
    const union = new Set(Object.values(EXPECTED_READS).flat());
    expect([...union].sort()).toEqual([...READ_MEMBERS].sort());
  });

  it.each(SENDING_MODES)("%s reads exactly its declared set, each member exactly once", (mode) => {
    // Chain 4's structural cover, and the shared cover for chains 1-5. Against
    // the shipped two-pass `drive()` this fails on DUPLICATES -- the marker at
    // entry and again inside `authorize()`, the roster in both passes, and
    // purview/branches/screen/gh/git/corpus once per pass.
    const { surface, run, counts } = countingSurface(DRIVABLE);
    const code = main([mode, "wM:p1", "--as", "sess-1"], surface);
    premiseHolds(
      `${mode} reached its send rather than refusing`,
      code === 0 && run.sent.length > 0,
    );
    const expected = Object.fromEntries(EXPECTED_READS[mode].map((m) => [m, 1]));
    expect(Object.fromEntries([...counts].sort())).toEqual(expected);
  });

  it.each(SENDING_MODES)("%s reads every member FRESHLY on a second invocation", (mode) => {
    // AC-1's second clause: no decision input is carried from outside the
    // invocation. A memo that outlived one command would make the second run
    // read nothing -- and would be a decision built on another command's world.
    const { surface, counts } = countingSurface(DRIVABLE);
    expect(main([mode, "wM:p1", "--as", "sess-1"], surface)).toBe(0);
    const first = Object.fromEntries([...counts].sort());
    counts.clear();
    expect(main([mode, "wM:p1", "--as", "sess-1"], surface)).toBe(0);
    premiseHolds(
      "the first invocation read something to compare against",
      Object.keys(first).length > 0,
    );
    expect(Object.fromEntries([...counts].sort())).toEqual(first);
  });

  it("AC-2: --compact's nonce comes from the pass's single marker read", () => {
    // The marker changes AFTER the pass has read it. Under one pass the change
    // is not observable, so the decision stands on the value the pass holds and
    // the command sends. Under the shipped two-pass code the second read sees
    // `n2` and the command refuses -- which is what makes this a red there.
    //
    // The window this leaves is the declared residual (spec §7 limit 1), priced
    // there by the addressed payload rather than claimed closed.
    let markerReads = 0;
    const { surface, run } = fakeSurface({
      nonceRead: () => "n1",
      marker: () => {
        markerReads += 1;
        return fullMarker({ checkpointNonce: markerReads === 1 ? "n1" : "n2" });
      },
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    premiseHolds("the fixture would answer differently on a second read", markerReads >= 1);
    expect(markerReads).toBe(1);
    expect(code).toBe(0);
    expect(run.sent.map((x) => x.text).join("")).toContain("/compact");
  });
});

describe("NOTHING precedes the pass, and the roster is its LAST read (diff r1 F1)", () => {
  /** Records the ORDER of read-member calls, and flips the live session mid-run. */
  function ordered(flipDuring: "resolveTarget" | "screen"): {
    surface: Surface;
    run: Run;
    order: string[];
    liveNow: () => string;
  } {
    const order: string[] = [];
    let live = "sess-target";
    const { surface: base, run } = fakeSurface({
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
    });
    const spied: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
    for (const member of READ_MEMBERS) {
      const original = (base as unknown as Record<string, (...a: never[]) => unknown>)[member];
      if (typeof original !== "function") throw new Error(`read member ${member} is not callable`);
      spied[member] = (...args: never[]): unknown => {
        order.push(member);
        if (member === flipDuring) live = "sess-successor";
        // The roster answers with the session live WHEN IT IS READ, which is
        // the whole point: a roster captured earlier cannot show a takeover
        // that happened since.
        if (member === "roster") {
          return (original(...args) as ReturnType<Surface["roster"]>).map((r) =>
            r.paneId === "wM:p1" ? { ...r, agentSession: live } : r,
          );
        }
        return original(...args);
      };
    }
    return { surface: spied as unknown as Surface, run, order, liveNow: () => live };
  }

  it.each(SENDING_MODES)("%s resolves the target BEFORE reading the roster", (mode) => {
    // Ordering, not counting -- and that distinction IS the finding. The
    // set-equality cover asserts each member is read exactly once, and it is
    // SATISFIED by a read taken at the wrong time: round 1 found `main()`
    // reading the roster on the raw surface before the pass existed, once.
    //
    // Resolution picks WHICH pane and feeds no rule. The roster feeds rules 1,
    // 2, 5 and 7, so it is read LAST, closest to the decision.
    const { surface, order } = ordered("screen");
    expect(main([mode, "wM:p1", "--as", "sess-1"], surface)).toBe(0);
    premiseHolds(
      "both members were actually read",
      order.includes("resolveTarget") && order.includes("roster"),
    );
    expect(order.indexOf("resolveTarget")).toBeLessThan(order.indexOf("roster"));
  });

  it("a takeover landing DURING target resolution refuses by rule 5, having sent nothing", () => {
    // The round-1 reviewer's probe, as a regression pin. Against the shipped
    // structure this exited 0 and sent both `/compact` bytes to the successor:
    // the roster had been captured before the takeover, so rule 5 compared the
    // marker's `sessionId` against a stale `agent_session` and matched.
    const { surface, run } = ordered("resolveTarget");
    expect(main(["--compact", "wM:p1", "--as", "sess-1"], surface)).toBe(1);
    expect(run.sent).toEqual([]);
    expect(run.lines.join("\n")).toContain("rule 5");
  });

  it("DECLARED LIMIT: a takeover AFTER the roster read is not observed, and still sends", () => {
    // Spec §7 limit 1, pinned as a CLAIM rather than left to an absence. This
    // asserts the gap EXISTS, so nobody later reads its silence as closure, and
    // so that closing it would fail loudly here and be a deliberate act.
    //
    // The pass is not an instant: two DIFFERENT members are read at two
    // instants and nothing observes a change between them. Priced there per
    // decay class; for `/compact` the worst case is a compaction the operator
    // no longer wanted, which auto-compaction produces on its own schedule.
    const { surface, run, liveNow } = ordered("screen");
    expect(main(["--compact", "wM:p1", "--as", "sess-1"], surface)).toBe(0);
    premiseHolds(
      "the takeover really did land after the roster read",
      liveNow() === "sess-successor",
    );
    expect(run.sent.map((x) => x.text)).toEqual(["/compact", "\r"]);
  });
});

describe("nothing is read AFTER the send (AC-9)", () => {
  it.each(SENDING_MODES)("%s performs no read once the sink has fired", (mode) => {
    // Spec §3.3: the tool takes no post-send reads and prints no echo. A
    // read-back would be a SECOND read of `screen`, which the classifier
    // already consumes, and the first step toward classifying display strings.
    // Delivery evidence is the operator's own pane read, documented as
    // procedure in the write-up.
    const afterSend: string[] = [];
    let sent = false;
    const { surface: base, run } = fakeSurface({
      ...DRIVABLE,
      send: () => {
        sent = true;
      },
    });
    const watched: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
    for (const member of READ_MEMBERS) {
      const original = (base as unknown as Record<string, (...a: never[]) => unknown>)[member];
      if (typeof original !== "function") throw new Error(`read member ${member} is not callable`);
      watched[member] = (...args: never[]): unknown => {
        if (sent) afterSend.push(member);
        return original(...args);
      };
    }
    const code = main([mode, "wM:p1", "--as", "sess-1"], watched as unknown as Surface);
    premiseHolds(`${mode} actually reached the sink`, sent);
    expect(code).toBe(0);
    expect(afterSend).toEqual([]);
    void run;
  });
});

describe("the live send path, observed through main()", () => {
  it.each(SENDING_MODES)("%s emits no \\x1b byte on the LIVE path (AC-7)", (mode) => {
    // The driver suite iterates `planSends` arrays and cannot see an escape the
    // ADAPTER adds on its way to the sink. This spy watches what `send`
    // actually receives.
    const run = drive([mode, "wM:p1", "--as", "sess-1"], DRIVABLE);
    premiseHolds(`${mode} actually sent bytes to inspect`, run.sent.length > 0);
    for (const s of run.sent) expect(s.text).not.toContain("\x1b");
  });

  it.each(["--checkpoint", "--resume"] as const)(
    "%s's first sent line is the address line naming this target (AC-15)",
    (mode) => {
      const run = drive([mode, "wM:p1", "--as", "sess-1"], DRIVABLE);
      premiseHolds(`${mode} actually sent a prompt`, run.sent.length > 0);
      const firstLine = (run.sent[0]?.text ?? "").split("\n")[0];
      expect(firstLine).toBe(
        "For the session driving feat/alpha (session sess-target) ONLY -- any other session must ignore",
      );
    },
  );

  it("--compact sends no address line — its bytes are exactly /compact then \\r", () => {
    // A prefix line would strip `/compact` of its status as a slash command and
    // deliver prose. Spec §3.6 makes it address-exempt by construction.
    const run = drive(["--compact", "wM:p1", "--as", "sess-1"], DRIVABLE);
    expect(run.sent.map((x) => x.text)).toEqual(["/compact", "\r"]);
  });
});

describe("a refusal never burns the checkpoint (AC-8)", () => {
  it("a refused --compact leaves the outstanding record for a retry", () => {
    // Re-targeted from `revalidate.test.ts`'s "revalidates BEFORE consuming"
    // case (spec §8.1 class 3): that case injected a failing revalidation
    // CALLBACK, and §3.2 deletes the callback. The property it protected is
    // real and now structural -- the authorization refuses before the effect
    // runs at all -- so it is pinned here, on the effect, rather than on a
    // parameter that no longer exists.
    const consumed: string[] = [];
    const { surface, run } = fakeSurface({
      // Owned by someone else: refused at authorization step 1, before any effect.
      purview: () => [
        {
          sessionId: "sess-other",
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
      marker: () => fullMarker({ checkpointNonce: "n1" }),
      nonceRead: () => "n1",
      nonceConsume: (sessionId, paneId, expected) => {
        consumed.push(`${sessionId}/${paneId}/${expected}`);
        return true;
      },
    });
    const code = main(["--compact", "wM:p1", "--as", "sess-1"], surface);
    expect(code).toBe(1);
    expect(consumed).toEqual([]);
    expect(run.sent).toEqual([]);
  });
});

describe("the fence is gone, and nothing replaces it (AC-10)", () => {
  const SOURCE = readFileSync(join(ROOT, "scripts", "pane-compaction.ts"), "utf8");

  it("the fence's refusal is absent from the adapter's source", () => {
    premise("the adapter source was actually read", SOURCE.length, 10_000);
    expect(SOURCE).not.toContain("disabled in this release");
  });

  it("no environment gate stands in for the fence", () => {
    // The fence is removed WHOLE, not converted into a toggle: a boolean with
    // one write path and no product read path is the zombie-flag shape. This
    // pins the environment half mechanically; that each mode actually executes
    // its flow is carried by the send cases above, not claimed here.
    expect(SOURCE).not.toContain("process.env");
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
