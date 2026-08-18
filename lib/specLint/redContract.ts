/**
 * The red-contract arm (spec `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md` §4).
 *
 * The task-marker contract is red-then-green on the same command, and nothing
 * observed the redness: three merged filings measured `red=` commands that
 * already exit 0, markers never observably red, and commands that could never
 * go green. This module owns the v2 FIELD SEMANTICS — presence, validity, the
 * two same-extent advisories, gate markers, and which markers `--exec-red` may
 * run. RECOGNITION stays in `taskContract.ts` (spec §5: one grammar, one
 * owner), which is why `parseMarker` and `taskTopology` are imported rather
 * than re-implemented here.
 *
 * Two scopes, deliberately different (spec §1.1 item 7 / §4.3):
 *   - PRESENCE requirements bind per owned, well-formed marker INSIDE a
 *     `red-contract` region.
 *   - `RED_TARGET_INVALID` binds on EVERY well-formed v2 marker of a plan-kind
 *     doc that carries the field, region or not, because the citation pass no
 *     longer sees that span (spec §5) and this validation is its replacement.
 *
 * Pure: no `node:` imports (pinned by tests/specLint/_metaPureCore.test.ts).
 */

import { classifySpan } from "./citations";
import { parseDoc, type DocModel } from "./parse";
import { compareFindings, MARKER_ANY, parseMarker, type ParsedMarker } from "./taskContract";
import { taskTopology } from "./taskContract";
import type { ExecResults, FileResolver, Finding } from "./types";

const GATE_ANY = /^ {0,3}<!-- gate:/;
const GATE = /^ {0,3}<!-- gate: cmd=`([^`]*)`( probed=`([^`]*)`)? -->[ \t]*$/;
/** The retired-target shape: an exact tracked-path token moved or removed. */
const GIT_MOVE = /\bgit\s+(?:mv|rm)\b(.*)$/;

const fail = (
  code: string,
  docLine: number,
  column: number,
  message: string,
  detail?: string,
): Finding => {
  const f: Finding = { check: "taskContract", code, severity: "fail", docLine, column, message };
  if (detail !== undefined) f.detail = detail;
  return f;
};

const advise = (
  code: string,
  docLine: number,
  column: number,
  message: string,
  detail?: string,
): Finding => {
  const f: Finding = {
    check: "taskContract",
    code,
    severity: "advisory",
    docLine,
    column,
    message,
  };
  if (detail !== undefined) f.detail = detail;
  return f;
};

interface MarkerRecord {
  line: number;
  parsed: ParsedMarker;
}

/**
 * A gate-shaped line, classified once. Both the gate checks (§4.6) and the
 * parse plan (verdict-capability spec §3) read gate commands, and two scans of
 * the same grammar are two chances to disagree about what a gate IS.
 */
type GateRecord =
  | { line: number; malformed: true }
  | { line: number; malformed: false; command: string; probed: string | undefined };

/** Every gate-shaped line on a NON-fenced line, in doc order. */
function gateRecords(model: DocModel): GateRecord[] {
  const out: GateRecord[] = [];
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fencedInfo[i] !== undefined) continue;
    const line = model.lines[i]!;
    if (!GATE_ANY.test(line)) continue;
    const m = GATE.exec(line);
    if (!m) {
      out.push({ line: i + 1, malformed: true });
      continue;
    }
    out.push({ line: i + 1, malformed: false, command: m[1]!, probed: m[3] });
  }
  return out;
}

/** Every well-formed marker on a NON-fenced line, in doc order. */
function wellFormedMarkers(model: DocModel): MarkerRecord[] {
  const out: MarkerRecord[] = [];
  for (let i = 0; i < model.lines.length; i++) {
    if (model.fencedInfo[i] !== undefined) continue; // fenced markers are inert
    const line = model.lines[i]!;
    if (!MARKER_ANY.test(line)) continue;
    const parsed = parseMarker(line, i + 1);
    if (parsed === null || parsed === "malformed") continue; // taskContract owns that code
    // The line comes back OUT of the parse rather than being recomputed here:
    // two copies of the same number are two chances to disagree.
    out.push({ line: parsed.line, parsed });
  }
  return out;
}

/**
 * `${line}:${column}` for the `red-target=` capture of every well-formed v2
 * marker (spec §5). The orchestrator passes these to `checkCitations`, which
 * skips exactly those spans — the one capture that IS a citation and gets its
 * own verification below.
 */
export function redTargetSpans(model: DocModel): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const { line, parsed } of wellFormedMarkers(model)) {
    if (parsed.redTarget !== null) keys.add(`${line}:${parsed.redTarget.column}`);
  }
  return keys;
}

/**
 * Why a `red-target=` is invalid, or null when it is valid (spec §4.2/§4.3).
 * Verified through the same span classification as prose citations — but the
 * marker citation never enters `resolvedPaths` or the anchor list, so it can
 * neither anchor a prose shorthand nor be anchored by one.
 */
function targetProblem(raw: string, resolver: FileResolver, tracked: Set<string>): string | null {
  const cls = classifySpan(raw);
  if (cls.kind === "malformed") return cls.reason;
  if (cls.kind === "prose") return "not a file citation";
  if (cls.bare) return "bare-filename shorthand is not legal in a marker; use the full path";

  if (cls.start === undefined) {
    // Path-only form: it DECLARES an absent production file.
    return tracked.has(cls.path)
      ? `${cls.path} is tracked; cite the defective line instead of the bare path`
      : null;
  }
  if (!tracked.has(cls.path)) return `cited file not tracked: ${cls.path}`;
  const lines = resolver.readFileLines(cls.path);
  if (lines === null) return `cited file unreadable or a symlink: ${cls.path}`;
  const end = cls.end ?? cls.start;
  if (cls.start > lines.length || end > lines.length) {
    return `cited line beyond EOF in ${cls.path} (file has ${lines.length} lines)`;
  }
  if (cls.end !== undefined && cls.end < cls.start) return "inverted range";
  return null;
}

/** Tracked paths this extent's FENCED code moves or removes (spec §4.5). */
function retiredInExtent(
  model: DocModel,
  extent: { start: number; end: number },
  tracked: Set<string>,
): Set<string> {
  const retired = new Set<string>();
  const last = Math.min(extent.end, model.lines.length + 1);
  for (let n = extent.start; n < last; n++) {
    if (typeof model.fencedInfo[n - 1] !== "string") continue; // fence CONTENT only
    const m = GIT_MOVE.exec(model.lines[n - 1]!);
    if (!m) continue;
    const object = m[1]!
      .trim()
      .split(/\s+/)
      .find((token) => token !== "" && !token.startsWith("-"));
    if (object !== undefined && tracked.has(object)) retired.add(object);
  }
  return retired;
}

export function checkRedContract(
  model: DocModel,
  kind: "spec" | "plan",
  resolver: FileResolver,
): Finding[] {
  // Plan-kind only, like the task contract it extends: a marker- or gate-shaped
  // line in a spec is ordinary prose (spec §8 items 12-13).
  if (kind !== "plan") return [];

  const findings: Finding[] = [];
  const tracked = new Set(resolver.listTrackedFiles());
  const topology = taskTopology(model);
  const contractExtents = topology.extents.filter((e) => e.redContract);
  const presenceLines = new Set(contractExtents.flatMap((e) => topology.owned.get(e.start) ?? []));

  for (const { line, parsed } of wellFormedMarkers(model)) {
    if (presenceLines.has(line)) {
      if (parsed.redState === null) {
        findings.push(
          fail("RED_STATE_MISSING", line, 1, "marker has no `red-state=live|authored`"),
        );
      }
      if (parsed.why === null || parsed.why.trim() === "") {
        findings.push(fail("RED_WHY_MISSING", line, 1, "marker has no `why=` statement"));
      }
      if (parsed.redState === "authored" && parsed.redTarget === null) {
        findings.push(
          fail(
            "RED_TARGET_MISSING",
            line,
            1,
            "`red-state=authored` requires a `red-target=` naming the production surface",
          ),
        );
      }
    }

    if (parsed.redTarget !== null) {
      const problem = targetProblem(parsed.redTarget.raw, resolver, tracked);
      if (problem !== null) {
        findings.push(
          fail(
            "RED_TARGET_INVALID",
            line,
            parsed.redTarget.column,
            `invalid \`red-target=\`: ${problem}`,
            "fix the target: a tracked file with an in-range line, or an untracked path for a module the task creates",
          ),
        );
      }
    }

    // The two advisories are same-extent, red-contract-region shapes (§4.5).
    const extent = contractExtents.find((e) => line > e.start && line < e.end);
    if (extent === undefined) continue;
    if (parsed.red.includes("&&")) {
      findings.push(
        advise(
          "RED_CONJUNCTION",
          line,
          1,
          "`red=` conjoins commands with `&&`",
          "a failure in a non-final conjunct is never observed at red time; check which conjunct is red",
        ),
      );
    }
    const retired = retiredInExtent(model, extent, tracked);
    for (const token of parsed.red.split(/\s+/)) {
      if (!retired.has(token)) continue;
      findings.push(
        advise(
          "RED_TARGET_RETIRED",
          line,
          1,
          `\`red=\` names ${token}, which this task moves or removes`,
          "the same command usually cannot go green after the move; a negative-existence red is the legitimate exception",
        ),
      );
      break;
    }
  }

  // Gate markers are legal anywhere in a plan and are owned by no extent (§4.6).
  for (const gate of gateRecords(model)) {
    const n = gate.line;
    if (gate.malformed) {
      findings.push(
        fail("GATE_MALFORMED", n, 1, "gate line does not match ``cmd=`…` [probed=`…`]`` exactly"),
      );
      continue;
    }
    if (gate.command.trim() === "") {
      findings.push(fail("GATE_CMD_EMPTY", n, 1, "gate `cmd=` is empty"));
    }
    if (gate.probed === undefined || gate.probed.trim() === "") {
      findings.push(
        advise(
          "GATE_UNPROBED",
          n,
          1,
          "gate command carries no `probed=` note",
          "a gate that exits 0 on the failure it names is the fail-open shape; state what failing input it was probed against",
        ),
      );
    }
  }

  findings.sort(compareFindings);
  return findings;
}

/**
 * The parse-capability plan (verdict-capability spec §3): every command whose
 * SHAPE this contract checks with `sh -nc`, in doc order.
 *
 * Two populations, one plan. `red=` is GLOBAL over well-formed markers of the
 * doc — v1 and v2, inside a region or not — on the same validity-global
 * rationale as `RED_TARGET_INVALID`: a command the shell cannot parse expresses
 * no verdict anywhere, and the defect class predates the v2 grammar. Gate
 * `cmd=` joins it as the class-sweep peer, one grammar away.
 *
 * Blank commands are excluded from BOTH: `sh -nc ''` exits 0, so planning one
 * would manufacture a clean parse for a line that already carries
 * `TASK_RED_EMPTY` or `GATE_CMD_EMPTY`.
 */
export interface ParseCheckEntry {
  line: number;
  command: string;
  source: "red" | "gate";
}

export function parseCheckPlan(model: DocModel): ParseCheckEntry[] {
  const out: ParseCheckEntry[] = [];
  for (const { line, parsed } of wellFormedMarkers(model)) {
    if (parsed.red.trim() === "") continue;
    out.push({ line, command: parsed.red, source: "red" });
  }
  for (const gate of gateRecords(model)) {
    if (gate.malformed || gate.command.trim() === "") continue;
    out.push({ line: gate.line, command: gate.command, source: "gate" });
  }
  // Doc order across BOTH populations: the adapter spawns in this order and an
  // operator reads the report in it.
  out.sort((a, b) => a.line - b.line);
  return out;
}

/**
 * `parseDoc` + `parseCheckPlan`, so the adapter derives the parse plan from raw
 * text without importing the parser itself. Pure.
 */
export function parseCheckPlanForText(text: string): ParseCheckEntry[] {
  return parseCheckPlan(parseDoc(text));
}

/**
 * The `--exec-red` population (spec §4.4): live-declared markers OWNED by an
 * extent of a `red-contract` region, in doc order. Deliberately narrower than
 * the validity population — an outside-region marker is validated but never
 * executed — and blank commands are excluded because `sh -c ''` exits 0, which
 * would manufacture a misleading `RED_ALREADY_GREEN` on a line that already
 * carries `TASK_RED_EMPTY`.
 */
export function planExecutions(model: DocModel): { line: number; command: string }[] {
  const topology = taskTopology(model);
  const owned = new Set(
    topology.extents.filter((e) => e.redContract).flatMap((e) => topology.owned.get(e.start) ?? []),
  );
  return wellFormedMarkers(model)
    .filter(
      ({ line, parsed }) =>
        owned.has(line) && parsed.redState === "live" && parsed.red.trim() !== "",
    )
    .map(({ line, parsed }) => ({ line, command: parsed.red }));
}

/**
 * `parseDoc` + `planExecutions`, so the adapter can derive the execution plan
 * from raw text without importing the parser itself. Pure.
 */
export function planExecutionsForText(text: string): { line: number; command: string }[] {
  return planExecutions(parseDoc(text));
}

/**
 * Findings from outcomes the adapter observed (spec §4.4). A null map is the
 * static invocation: no `--exec-red`, no execution findings.
 *
 * Only exit 0 is hard. Everything unrunnable, killed, or timed out is advisory,
 * because none of it OBSERVES redness — and reading any of them as red is the
 * silent corruption this arm exists to prevent.
 */
export function synthesizeExecFindings(
  plan: { line: number; command: string }[],
  results: ExecResults | null,
): Finding[] {
  if (results === null) return [];
  const out: Finding[] = [];
  for (const { line, command } of plan) {
    const outcome = results.outcomes.get(line);
    if (outcome === undefined) continue;
    const tail = results.stderrTails.get(line) ?? "";
    const withTail = (base: string): string => (tail === "" ? base : `${base} · stderr: ${tail}`);

    if (outcome.kind === "exit") {
      if (outcome.code === 0) {
        out.push(
          fail(
            "RED_ALREADY_GREEN",
            line,
            1,
            "`red=` command already exits 0; the marker asserts it fails today",
            `command: ${command}`,
          ),
        );
      } else if (outcome.code === 126 || outcome.code === 127) {
        // The exit code rides the DETAIL as well as the message (spec §4.4):
        // an operator reading only the detail line still learns which of the
        // two unrunnable shapes this was.
        out.push(
          advise(
            "RED_EXEC_ERROR",
            line,
            1,
            `\`red=\` command is not runnable (exit ${outcome.code})`,
            withTail(`exit ${outcome.code} · command: ${command}`),
          ),
        );
      }
      continue; // any other non-zero exit is red observed
    }
    if (outcome.kind === "timeout") {
      out.push(
        advise(
          "RED_EXEC_TIMEOUT",
          line,
          1,
          "`red=` command hit the execution ceiling; redness unverified",
          `command: ${command}`,
        ),
      );
      continue;
    }
    const reason =
      outcome.kind === "signal"
        ? `terminated by ${outcome.signal}`
        : `spawn failed: ${outcome.message}`;
    out.push(
      advise(
        "RED_EXEC_ERROR",
        line,
        1,
        `\`red=\` command did not run to completion (${reason})`,
        withTail(`${reason} · command: ${command}`),
      ),
    );
  }
  return out;
}
