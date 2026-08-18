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
import type { ExecResults, FileResolver, Finding, ParseResults } from "./types";

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
function ownedContractLines(model: DocModel): ReadonlySet<number> {
  const topology = taskTopology(model);
  return new Set(
    topology.extents.filter((e) => e.redContract).flatMap((e) => topology.owned.get(e.start) ?? []),
  );
}

export function planExecutions(model: DocModel): { line: number; command: string }[] {
  const owned = ownedContractLines(model);
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

/** The rendered ceiling on a stderr tail (verdict-capability spec §3). */
const STDERR_TAIL = 200;

/**
 * Findings from parse outcomes the adapter observed (verdict-capability spec
 * §3). A null map is an invocation with no parse pass: no findings.
 *
 * Only a completed non-zero exit is hard, and WHICH hard code is decided by the
 * plan entry's source — a gate defect reported as a red defect sends the author
 * to the wrong line's wrong field. Everything not completed is advisory: a
 * parse check that timed out, was signalled, or never spawned observed no
 * capability at all, and reading it as either verdict is the corruption this
 * arm exists to prevent.
 *
 * The tail is trimmed HERE as well as in the adapter. Two trims are not
 * redundant belt: the adapter's bounds what the core is handed, and this one
 * bounds what an operator's report line renders, so no future caller can
 * smuggle an unbounded detail through this function.
 */
export function synthesizeParseFindings(
  plan: readonly ParseCheckEntry[],
  results: ParseResults | null,
): Finding[] {
  if (results === null) return [];
  const out: Finding[] = [];
  for (const { line, command, source } of plan) {
    const outcome = results.outcomes.get(line);
    if (outcome === undefined) continue;
    const tail = (results.stderrTails.get(line) ?? "").slice(-STDERR_TAIL);
    const withTail = (base: string): string => (tail === "" ? base : `${base} · stderr: ${tail}`);

    if (outcome.kind === "exit") {
      if (outcome.code === 0) continue; // parseable: the only clean result
      out.push(
        source === "gate"
          ? fail(
              "GATE_CMD_UNPARSEABLE",
              line,
              1,
              "gate `cmd=` is not parseable by the executing shell",
              withTail(`command: ${command}`),
            )
          : fail(
              "RED_UNPARSEABLE",
              line,
              1,
              "`red=` command is not parseable by the executing shell; it can express no verdict",
              withTail(`command: ${command}`),
            ),
      );
      continue;
    }
    const reason =
      outcome.kind === "timeout"
        ? "timeout"
        : outcome.kind === "signal"
          ? `terminated by ${outcome.signal}`
          : `spawn failed: ${outcome.message}`;
    out.push(
      advise(
        "RED_PROBE_UNVERIFIED",
        line,
        1,
        `parse check did not complete (${reason}); command capability unverified`,
        withTail(`parse probe: ${reason} · command: ${command}`),
      ),
    );
  }
  return out;
}

// ---- collection probes (verdict-capability spec §5.1) ----------------------

/**
 * The vitest shape, ANCHORED at the command start (spec §1.1 item 6): optional
 * `NAME=value` env assignments, an optional measured runner prefix, then the
 * token pair `vitest run`. A `vitest run` appearing only mid-command — under a
 * `pnpm heavy` wrapper, say — is deliberately not this shape: a probe derived
 * from it would be a heavy phase, and the wrapper's own semantics are unread.
 */
const VITEST_SHAPE =
  /^((?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*)(pnpm exec |pnpm |npx )?(vitest)(\s+)(run)(?=\s|$)/;

/**
 * Tokens whose presence declines the probe. The derived probe runs through
 * `sh -c`, so ANY trailing clause would execute verbatim — which for an
 * authored marker is exactly the "never run authored reds" violation the arms
 * spec §1.2 fences. Quotes are deliberately not parsed: a quoted operator
 * over-declines, which is the conservative direction.
 */
const CONTROL_TOKENS = ["&&", "||", ";", "|", "$(", "`"] as const;

/**
 * A name-filter token is PRESENT. Broader than the strip grammar on purpose —
 * presence is what forces a decline when the strip cannot read it — and still
 * a token match: `-ts.ts` and `--reporter` are not filters.
 */
const FILTER_PRESENT = /(?:^|\s)(--testNamePattern|-t(?![A-Za-z0-9]))/;

/** The declared strip grammar (spec §5.1). Never widened in review. */
const FILTER_STRIP =
  /(?:^|\s)(?:--testNamePattern|-t)(?:=(?:'[^']*'|"[^"]*"|\S*)|\s+(?:'[^']*'|"[^"]*"|\S+))/;

const TEST_FILE_SUFFIXES = [".test.ts", ".test.tsx"] as const;

export type ProbeDerivation =
  | { kind: "none" }
  | { kind: "skipped"; skipped: "compound-command" | "unstrippable-filter"; detail: string }
  | { kind: "probe"; probe: string };

export type CollectionProbeEntry =
  | {
      line: number;
      state: "live" | "authored";
      probe: string;
      trackedTestArgs: string[];
      untrackedTestArgs: string[];
    }
  | {
      line: number;
      state: "live" | "authored";
      skipped: "compound-command" | "unstrippable-filter";
      detail: string;
    };

/**
 * One command's probe, or the reason there is none (spec §5.1).
 *
 * A declined derivation carries NO probe text at all — the guarantee is
 * structural rather than a promise not to spawn: nothing downstream can run
 * what does not exist.
 *
 * Live markers keep their filters (live means observable today); authored
 * markers have them stripped, because the authored case's named test is future
 * by declaration and a name filter would mask the file-level question "can this
 * command ever collect the suite".
 */
export function deriveCollectionProbe(
  command: string,
  state: "live" | "authored",
): ProbeDerivation {
  const m = VITEST_SHAPE.exec(command);
  if (m === null) return { kind: "none" };

  const control = CONTROL_TOKENS.find((token) => command.includes(token));
  if (control !== undefined) {
    return {
      kind: "skipped",
      skipped: "compound-command",
      detail: `command carries the control/substitution token ${control}; probing it would run its other clauses`,
    };
  }

  // First token pair only: a later literal `vitest run` inside a pattern is an
  // argument, not the runner, and must ride through byte-identical.
  const end = m[0].length;
  const rewritten = command.slice(0, end - m[5]!.length) + "list" + command.slice(end);
  if (state === "live") return { kind: "probe", probe: rewritten };

  let stripped = rewritten;
  while (FILTER_STRIP.test(stripped)) stripped = stripped.replace(FILTER_STRIP, "");
  const leftover = FILTER_PRESENT.exec(stripped);
  if (leftover !== null) {
    return {
      kind: "skipped",
      skipped: "unstrippable-filter",
      detail: `name filter ${leftover[1]} does not match the strip grammar; declining rather than guessing`,
    };
  }
  return { kind: "probe", probe: stripped };
}

/**
 * The command's test-file tokens, split by tracked-set membership (spec §5.2).
 * Keyed on MEMBERSHIP, the same exact-token-against-tracked-set device
 * `RED_TARGET_RETIRED` uses: tracked ones are membership-checked against the
 * collected output (hard on absence), untracked ones are surfaced by name
 * (advisory — a future file and a typo are indistinguishable statically).
 */
function partitionTestArgs(
  command: string,
  tracked: ReadonlySet<string>,
): { trackedTestArgs: string[]; untrackedTestArgs: string[] } {
  const trackedTestArgs: string[] = [];
  const untrackedTestArgs: string[] = [];
  for (const token of command.split(/\s+/)) {
    if (token === "") continue;
    if (!TEST_FILE_SUFFIXES.some((suffix) => token.endsWith(suffix))) continue;
    if (tracked.has(token)) trackedTestArgs.push(token);
    else untrackedTestArgs.push(token);
  }
  return { trackedTestArgs, untrackedTestArgs };
}

/**
 * The collection-probe plan (spec §5.2): one entry per OWNED, v2, vitest-shaped
 * marker of a `red-contract` region, in doc order.
 *
 * `excludeLines` is the parse-failed set (spec §3): executing a command the
 * shell cannot parse observes nothing, and executing one whose parseability was
 * never observed is the same gamble. Ownership binds the declines too — an
 * unowned marker draws nothing at all, not an unauthorized advisory.
 */
export function collectionProbePlan(
  model: DocModel,
  tracked: ReadonlySet<string>,
  excludeLines: ReadonlySet<number>,
): CollectionProbeEntry[] {
  const owned = ownedContractLines(model);
  const out: CollectionProbeEntry[] = [];
  for (const { line, parsed } of wellFormedMarkers(model)) {
    if (!owned.has(line)) continue;
    if (excludeLines.has(line)) continue;
    const state = parsed.redState;
    if (state === null) continue; // v1: no declared state to probe against
    if (parsed.red.trim() === "") continue;

    const derived = deriveCollectionProbe(parsed.red, state);
    if (derived.kind === "none") continue;
    if (derived.kind === "skipped") {
      out.push({ line, state, skipped: derived.skipped, detail: derived.detail });
      continue;
    }
    out.push({ line, state, probe: derived.probe, ...partitionTestArgs(parsed.red, tracked) });
  }
  return out;
}
