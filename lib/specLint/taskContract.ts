import type { DocModel } from "./parse";
import type { Finding } from "./types";

/**
 * Declared task contract for plans (design §3.2–§3.4.1, as amended by the
 * 2026-08-09 multi-region design §2.2–§2.3).
 *
 * A plan may declare any number of SEQUENTIAL regions, each with its own depth.
 * Two passes. Pass 1 classifies lines mechanically, collects the regions, and
 * records marker-shaped lines WITHOUT judging them; pass 2 draws the
 * whole-document enrollment conclusion and only then classifies markers.
 *
 * The split is no longer a correctness REQUIREMENT — it is an implementation
 * choice. A region is final at its close and no later line can invalidate it,
 * because an opening seen while a region is open is inert (it draws
 * `TASK_ENROLL_DUPLICATE` and starts nothing) rather than disqualifying. What
 * still needs the whole document is the zero-well-formed-region conclusion,
 * which discards recorded markers unjudged.
 *
 * Pure: reads only `model.lines`, `model.fencedInfo` and `model.headings`.
 */

// The matching convention (§3.2) — identical prefix and suffix on all three
// forms. `model.lines` is already CRLF-normalised by `splitLines`.
// The optional ` red-contract` attribute (2026-08-15 arms spec §4.1) is an
// exact token in a fixed position: the accept-set is these two forms, and every
// other `tasks:` line stays TASK_ENROLL_MALFORMED.
const OPEN = /^ {0,3}<!-- tasks: depth=([1-6])( red-contract)? -->[ \t]*$/;
const END = /^ {0,3}<!-- tasks: end -->[ \t]*$/;
const TASKS_ANY = /^ {0,3}<!-- tasks:/;
/** Exported so the redContract module recognises markers through THIS grammar. */
export const MARKER_ANY = /^ {0,3}<!-- task:/;

// An AC id must end alphanumeric; punctuation may never repeat or trail. The
// tightening is what closes the aliasing — under a looser `AC-[A-Za-z0-9.-]+`
// the ids `AC-1.`, `AC-1..1`, `AC-1.-child` and `AC-1-` are all legal and each
// would be resolved by a wanted `AC-1`.
const ID = "AC-[A-Za-z0-9]+(?:[.-][A-Za-z0-9]+)*";
// The command group excludes backticks deliberately. `(.+)` would give the two
// empty-command spellings different codes; `(.*)` is greedy across backticks and
// silently re-opens every structure the "two fields, no other content" rule
// forbids. A command needing a nested backtick belongs in a script.
//
// The v2 fields (arms spec §4.2) widen this ONE grammar: fixed order, single
// spaces, every backticked capture `[^`]*` so blankness stays SEMANTIC (an
// empty `red=` is TASK_RED_EMPTY, not a grammar rejection — and each new field
// takes the same split). A marker-shaped line matching neither this nor the
// ac-absent variant below is TASK_MARKER_MALFORMED: there is no third form.
const V2_FIELDS = "( red-state=(live|authored))?( red-target=`([^`]*)`)?( why=`([^`]*)`)?";
const MARKER = new RegExp(
  `^ {0,3}<!-- task: red=\`([^\`]*)\`${V2_FIELDS} ac=(${ID}(?:,${ID})*) -->[ \\t]*$`,
);
// "Matches everything EXCEPT that `ac=` is absent or its list is empty" — the
// prerequisite is load-bearing. Both the omitted form and the explicit `ac=`
// form qualify, and the `red` command must itself be valid: a line carrying two
// defects at once is malformed, whatever else is also wrong with it, or the
// catch-all is unreachable for anything overlapping.
const MARKER_AC_ABSENT = new RegExp(
  `^ {0,3}<!-- task: red=\`([^\`]*)\`${V2_FIELDS}(?: ac=)? -->[ \\t]*$`,
);
/** The field prefix whose first occurrence locates the red-target capture. */
const RED_TARGET_PREFIX = "red-target=`";

export interface ParsedMarker {
  line: number;
  /** Raw `red=` capture; may be blank (semantic check, not a grammar one). */
  red: string;
  redState: "live" | "authored" | null;
  /** `column` = 1-based UTF-16 offset of the capture's first character. */
  redTarget: { raw: string; column: number } | null;
  why: string | null;
  /** null = `ac=` absent or explicitly empty. */
  acRaw: string | null;
}

/**
 * THE marker parse. `null` = not marker-shaped; `"malformed"` = marker-shaped
 * but matching neither the with-ac nor the ac-absent form of the grammar.
 *
 * Exported because `redContract` owns v2 FIELD SEMANTICS while this module owns
 * RECOGNITION (spec §5): two recognizers would drift.
 */
export function parseMarker(lineText: string, lineNo: number): ParsedMarker | "malformed" | null {
  if (!MARKER_ANY.test(lineText)) return null;
  const withAc = MARKER.exec(lineText);
  const m = withAc ?? MARKER_AC_ABSENT.exec(lineText);
  if (!m) return "malformed";
  const rawTarget = m[5];
  // The capture is delimited by backticks and `red=` cannot contain one, so the
  // first occurrence of the field prefix is this field's (a `why=` further
  // right can only follow it).
  const targetColumn = lineText.indexOf(RED_TARGET_PREFIX) + RED_TARGET_PREFIX.length + 1;
  return {
    line: lineNo,
    red: m[1]!,
    redState: (m[3] as "live" | "authored" | undefined) ?? null,
    redTarget: rawTarget === undefined ? null : { raw: rawTarget, column: targetColumn },
    why: m[7] ?? null,
    acRaw: withAc ? m[8]! : null,
  };
}

export interface TaskTopology {
  regions: { depth: number; start: number; end: number; redContract: boolean }[];
  extents: { start: number; end: number; redContract: boolean }[];
  /** extent start line -> owned marker lines, in doc order. */
  owned: Map<number, number[]>;
  orphaned: number[];
}

/**
 * §3.3 boundary rule. An id resolves only where it appears delimited, never as
 * a prefix of a longer id — and the naive "not adjacent to any id character" is
 * wrong, because `.` is legal INSIDE an id (`AC-1.1`) and is also the commonest
 * sentence terminator. A period continues an id only when something id-shaped
 * follows it.
 */
function resolvesId(id: string, lines: string[], markerLines: Set<number>): boolean {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![A-Za-z0-9.-])${esc}(?![A-Za-z0-9-])(?!\\.[A-Za-z0-9])`);
  for (let i = 0; i < lines.length; i++) {
    if (markerLines.has(i + 1)) continue; // an id cannot satisfy itself
    if (re.test(lines[i]!)) return true;
  }
  return false;
}

const fail = (code: string, docLine: number, message: string): Finding => ({
  check: "taskContract",
  code,
  severity: "fail",
  docLine,
  column: 1,
  message,
});

/**
 * Pass 1 + pass 2 STRUCTURE, shared by the checker and by `taskTopology`.
 *
 * Both consumers need the same regions, extents and ownership; deriving them
 * twice is how a topology and a report start disagreeing about which extent
 * owns which marker.
 */
function analyze(model: DocModel): {
  findings: Finding[];
  topology: TaskTopology;
  sawTasksLine: boolean;
  enrolled: boolean;
  markerShaped: Set<number>;
} {
  const findings: Finding[] = [];
  const nonFenced = (i: number) => model.fencedInfo[i] === undefined;

  // ---- pass 1 — line classification --------------------------------------
  type Region = { depth: number; start: number; end: number; redContract: boolean };
  const regions: Region[] = [];
  let open = false;
  let rejectedOpens = 0;
  let openDepth = 0;
  let openStart = 0;
  let openRedContract = false;
  let sawTasksLine = false;
  const markerLines: number[] = [];

  for (let i = 0; i < model.lines.length; i++) {
    if (!nonFenced(i)) continue;
    const line = model.lines[i]!;
    const n = i + 1;

    const om = OPEN.exec(line);
    if (om) {
      sawTasksLine = true;
      if (!open) {
        // A close has been seen (or none yet): this starts a new region.
        open = true;
        openDepth = Number(om[1]);
        openStart = n;
        openRedContract = om[2] !== undefined;
      } else {
        findings.push(
          fail("TASK_ENROLL_DUPLICATE", n, "task-region opening inside an unclosed region"),
        );
        rejectedOpens++;
      }
      continue;
    }

    if (END.test(line)) {
      sawTasksLine = true;
      if (open) {
        regions.push({ depth: openDepth, start: openStart, end: n, redContract: openRedContract });
        open = false;
      } else if (rejectedOpens > 0) {
        // Belongs to an opening already rejected as a duplicate. Consuming it
        // silently is what stops one authoring error manufacturing a second,
        // misleading finding.
        rejectedOpens--;
      } else {
        findings.push(
          fail("TASK_ENROLL_MALFORMED", n, "task-region close with no matching opening"),
        );
      }
      continue;
    }

    if (TASKS_ANY.test(line)) {
      sawTasksLine = true;
      findings.push(
        fail(
          "TASK_ENROLL_MALFORMED",
          n,
          "malformed task-region line; expected `depth=<1-6>` or `end`",
        ),
      );
      continue;
    }

    if (MARKER_ANY.test(line)) markerLines.push(n);
  }
  // A marker-shaped line inside a fence is inert (AC-9), so it must not resolve
  // a real marker's ac= either — otherwise a documentation example silently
  // satisfies a citation that has no genuine occurrence. Recorded separately
  // from `markerLines`, which drives ownership and must stay non-fenced.
  const markerShaped = new Set(markerLines);
  for (let i = 0; i < model.lines.length; i++) {
    if (MARKER_ANY.test(model.lines[i]!)) markerShaped.add(i + 1);
  }
  // End of document closes an unclosed region. Only the LAST region can be
  // unclosed, because an opening seen while open never starts one.
  if (open) {
    regions.push({
      depth: openDepth,
      start: openStart,
      end: model.lines.length + 1,
      redContract: openRedContract,
    });
  }

  const empty: TaskTopology = { regions, extents: [], owned: new Map(), orphaned: [] };
  // ---- pass 2 — whole-document conclusion --------------------------------
  if (!sawTasksLine) {
    return { findings: [], topology: empty, sawTasksLine, enrolled: false, markerShaped };
  }
  // No well-formed region, so enrollment is not established: pass-1 findings
  // stand and every recorded marker is discarded unjudged.
  if (regions.length === 0) {
    return { findings, topology: empty, sawTasksLine, enrolled: false, markerShaped };
  }

  // Regions are disjoint and every extent is clipped to its own region, so the
  // combined list stays unambiguous for the marker ownership pass below.
  const extents: { start: number; end: number; redContract: boolean }[] = [];
  for (const region of regions) {
    const regionTasks = model.headings.filter(
      (h) => h.depth === region.depth && h.line > region.start && h.line < region.end,
    );
    if (regionTasks.length === 0) {
      findings.push(
        fail(
          "TASK_ENROLL_EMPTY",
          region.start,
          `task region selects no depth-${region.depth} heading`,
        ),
      );
      // NOT an early return. TASK_ENROLL_EMPTY and per-marker classification
      // are independent: with zero extents every recorded marker lies outside
      // all of them and is orphaned. Returning here silently dropped markers
      // before, inside, and after the region. (A `continue` would be harmless
      // rather than wrong: it advances to the next region, and the extent loop
      // below is already a no-op over an empty `regionTasks`.)
    }

    // A task's extent runs to the next heading of ITS region's depth or
    // shallower, that region's close, or end of document — whichever is first.
    for (const t of regionTasks) {
      let end = region.end;
      for (const h of model.headings) {
        if (h.line > t.line && h.depth <= region.depth) {
          end = Math.min(end, h.line);
          break;
        }
      }
      extents.push({ start: t.line, end, redContract: region.redContract });
    }
  }

  const owned = new Map<number, number[]>(extents.map((e) => [e.start, []]));
  const orphaned: number[] = [];
  for (const line of markerLines) {
    const e = extents.find((x) => line > x.start && line < x.end);
    if (!e) {
      orphaned.push(line);
      findings.push(fail("TASK_MARKER_ORPHANED", line, "task marker outside every task extent"));
      continue;
    }
    owned.get(e.start)!.push(line);
  }

  return {
    findings,
    topology: { regions, extents, owned, orphaned },
    sawTasksLine,
    enrolled: true,
    markerShaped,
  };
}

/** The region / extent / ownership structure alone (spec §5: one owner). */
export function taskTopology(model: DocModel): TaskTopology {
  return analyze(model).topology;
}

export function checkTaskContract(model: DocModel, kind: "spec" | "plan"): Finding[] {
  if (kind !== "plan") return [];

  const { findings, topology, sawTasksLine, enrolled, markerShaped } = analyze(model);
  if (!sawTasksLine) return [];
  if (!enrolled) return findings;

  const markerSet = markerShaped;
  const { extents, owned } = topology;

  for (const e of extents) {
    const ms = owned.get(e.start)!;
    if (ms.length === 0) {
      findings.push(
        fail("TASK_MARKER_MISSING", e.start, "task has no `<!-- task: ... -->` marker"),
      );
      continue;
    }
    // Cardinality is independent of classification: a defective marker still
    // occupies the slot, and still counts toward duplication.
    if (ms.length > 1) {
      findings.push(
        fail("TASK_MARKER_DUPLICATE", ms[1]!, "task extent holds more than one marker"),
      );
    }
    // Every marker is then classified on its own. Cardinality and
    // classification are separate groups, so a defective marker in a
    // two-marker extent draws BOTH its own code and the duplicate.
    for (const line of ms) {
      const parsed = parseMarker(model.lines[line - 1]!, line);

      // Precedence (§3.3): first match wins, exactly one code per line. The
      // parse is THE grammar (spec §5), so classification reads its fields
      // rather than re-running a regex of its own.
      if (parsed === null || parsed === "malformed") {
        findings.push(
          fail("TASK_MARKER_MALFORMED", line, "marker does not match ``red=`…` ac=AC-…`` exactly"),
        );
        continue;
      }
      if (parsed.acRaw !== null && parsed.red.trim() === "") {
        findings.push(fail("TASK_RED_EMPTY", line, "marker `red=` command is empty"));
        continue;
      }
      if (parsed.acRaw === null) {
        // Precedence rule 2 requires an OTHERWISE well-formed marker, so a line
        // that ALSO has an empty `red` is malformed rather than AC_MISSING.
        if (parsed.red.trim() !== "") {
          findings.push(fail("TASK_AC_MISSING", line, "marker has no `ac=` list"));
        } else {
          findings.push(
            fail(
              "TASK_MARKER_MALFORMED",
              line,
              "marker does not match ``red=`…` ac=AC-…`` exactly",
            ),
          );
        }
        continue;
      }
      for (const id of parsed.acRaw.split(",")) {
        if (!resolvesId(id, model.lines, markerSet)) {
          findings.push(
            fail("TASK_AC_UNRESOLVED", line, `\`${id}\` has no occurrence in this plan's own text`),
          );
        }
      }
    }
  }

  findings.sort(compareFindings);
  return findings;
}

/**
 * Report order for task-contract findings: line, then code, then message.
 *
 * The message is the third key because the first two do not separate every
 * pair — two findings on one line sharing a code compared EQUAL, and an
 * inconsistent comparator's result is implementation-defined in ECMA-262. In
 * practice V8's stable sort left them in push order, which is a fact about the
 * engine rather than about this report; feed the same two findings in the other
 * order and the human-facing output changes. With the message as a tiebreak the
 * comparator is total over the fields a `Finding` actually varies in, so the
 * report is a function of the findings rather than of how they were collected.
 *
 * Exported so the ordering RELATION can be tested directly. Asserting the sorted
 * output of `checkTaskContract` would test the comparator only through whatever
 * pairs a fixture happens to produce (BL-TASKCONTRACT-SORT-COMPARATOR-EQUALKEY).
 */
export function compareFindings(
  a: Pick<Finding, "docLine" | "code" | "message">,
  b: Pick<Finding, "docLine" | "code" | "message">,
): number {
  if (a.docLine !== b.docLine) return a.docLine - b.docLine;
  if (a.code !== b.code) return a.code < b.code ? -1 : 1;
  if (a.message !== b.message) return a.message < b.message ? -1 : 1;
  return 0;
}
