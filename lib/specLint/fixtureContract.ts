/**
 * The fixture-satisfiability arm (spec
 * `docs/superpowers/specs/2026-08-18-planlint-fixture-satisfiability.md`).
 *
 * A plan embeds a test block, constructs a fixture inside it, names a live
 * production function, and asserts what that function emits. Nothing executes
 * the block, so the assertion is a claim about the parser rather than an
 * observation of it. This arm makes such a block DECLARE itself with an
 * adjacent marker (§3) and, under `--exec-red`, RUNS it against the live tree
 * (§4).
 *
 * Declared, never inferred (spec §1.1 item 3): a block is enrolled by its
 * marker and by nothing else. No recognizer over block bodies ships, at any
 * severity, so an unenrolled block is checked by nothing.
 *
 * Pure: no `node:` imports, no filesystem, no spawning (pinned by
 * `tests/specLint/_metaPureCore.test.ts`, which walks the core tree
 * recursively). The adapter owns the splice directory, the vitest run and the
 * JSON read; this module derives the splice plan and classifies the outcomes
 * the adapter hands back.
 */

import type { DocModel } from "./parse";
import type { Finding, FixtureResults } from "./types";

/** Marker-SHAPED, so a mangled marker is a finding rather than silence. */
const FIXTURE_ANY = /^ {0,3}<!-- fixture:/;
/** The exact grammar (spec §3.1), in the shape of the shipped gate marker
 * (`lib/specLint/redContract.ts:37`): backtick-delimited, `why=` the only field. */
const FIXTURE = /^ {0,3}<!-- fixture: why=`([^`]*)` -->[ \t]*$/;

/**
 * The measured accepted set (spec §2.1, §3.1): those three info strings carry
 * every self-contained vitest block in the corpus. A new runner is an
 * accept-set change with its own corpus numbers, not a review round (§8/12).
 */
const ACCEPTED_INFO: ReadonlySet<string> = new Set(["ts", "tsx", "typescript"]);

const fail = (code: string, docLine: number, message: string, detail?: string): Finding => {
  const f: Finding = { check: "taskContract", code, severity: "fail", docLine, column: 1, message };
  if (detail !== undefined) f.detail = detail;
  return f;
};

/**
 * Reads the info token off a line `parseDoc` has ALREADY classified as a fence
 * delimiter (`model.fencedInfo[i] === null`). This decides nothing about
 * fence-ness — that decision is `parseDoc`'s and is read from the model, per
 * spec §5's "no new fence parsing" — it only strips the delimiter run and
 * applies the same first-token, lowercased rule as `lib/specLint/parse.ts:107`,
 * so the two cannot disagree about what the info string IS. Read from the
 * delimiter rather than from the fence's inside lines because an EMPTY fence
 * has no inside line, and an empty `ts` block is attached: its emptiness is
 * settled by execution (spec §4.3), not by pretending it opened no fence.
 */
function infoOfDelimiter(line: string): string {
  const m = /^ {0,3}(?:`{3,}|~{3,})(.*)$/.exec(line);
  if (m === null) return "";
  return (m[1]!.trim().toLowerCase().split(/\s+/)[0] ?? "").trim();
}

/** One scanned marker. `fenceIndex` is the 0-based opening-delimiter index when attached. */
interface ScannedMarker {
  /** 1-based marker line. */
  line: number;
  finding: Finding | null;
  fenceIndex: number | null;
}

/**
 * The ONE enrolment derivation, shared by the static arm and the splice plan so
 * the two can never disagree about which markers are enrolled.
 *
 * Emits AT MOST ONE finding per marker, in the precedence
 * `FIXTURE_MALFORMED` > `FIXTURE_WHY_EMPTY` > `FIXTURE_UNATTACHED`. The same
 * reasoning `FIXTURE_MALFORMED` is one code for three malformations (spec
 * §3.2): the author's next edit is the earlier repair in every case, and a
 * one-finding-per-marker rule makes the splice exclusion in §4.1 total by
 * construction rather than by a second traversal.
 */
function scanMarkers(model: DocModel, kind: "spec" | "plan"): ScannedMarker[] {
  if (kind !== "plan") return [];
  const out: ScannedMarker[] = [];
  for (let i = 0; i < model.lines.length; i++) {
    // Marker-shaped lines inside a fence are inert (arms spec §8 items 12-13).
    if (model.fencedInfo[i] !== undefined) continue;
    const text = model.lines[i]!;
    if (!FIXTURE_ANY.test(text)) continue;
    const docLine = i + 1;

    const m = FIXTURE.exec(text);
    if (m === null) {
      out.push({
        line: docLine,
        finding: fail(
          "FIXTURE_MALFORMED",
          docLine,
          "fixture marker does not match the declared grammar",
          "expected exactly `<!-- fixture: why=`…` -->`; got: " + text.trim(),
        ),
        fenceIndex: null,
      });
      continue;
    }

    if (m[1]!.trim() === "") {
      out.push({
        line: docLine,
        finding: fail(
          "FIXTURE_WHY_EMPTY",
          docLine,
          "fixture marker has an empty why=",
          "why= states the premise this block demonstrates; an empty one declares nothing",
        ),
        fenceIndex: null,
      });
      continue;
    }

    // Attachment: the IMMEDIATELY following line opens a ts/tsx/typescript
    // fence. The marker line is unfenced, so a `null` next line is necessarily
    // an OPENING delimiter — a closing one is unreachable from outside a fence.
    const k = i + 1;
    if (k >= model.lines.length) {
      out.push({
        line: docLine,
        finding: fail(
          "FIXTURE_UNATTACHED",
          docLine,
          "fixture marker is not attached to a block",
          "next line is: (end of document)",
        ),
        fenceIndex: null,
      });
      continue;
    }
    const next = model.lines[k]!;
    const opensFence = model.fencedInfo[k] === null;
    if (!opensFence || !ACCEPTED_INFO.has(infoOfDelimiter(next))) {
      out.push({
        line: docLine,
        finding: fail(
          "FIXTURE_UNATTACHED",
          docLine,
          "fixture marker is not attached to a block",
          "next line is: " + next,
        ),
        fenceIndex: null,
      });
      continue;
    }

    out.push({ line: docLine, finding: null, fenceIndex: k });
  }
  return out;
}

/**
 * The static arm (spec §3.2). Plan-kind docs only, anchored at the marker line,
 * column 1, all `check: "taskContract"`. Zero spawns: pure text checks on the
 * parsed model, so they run on the DEFAULT invocation and `codex-guard
 * --lint-doc` inherits them without passing `--exec-red`.
 */
export function checkFixtureContract(model: DocModel, kind: "spec" | "plan"): Finding[] {
  return scanMarkers(model, kind)
    .map((s) => s.finding)
    .filter((f): f is Finding => f !== null);
}

/** One block the adapter will splice and run. `line` is its marker's 1-based line. */
export interface FixtureSpliceEntry {
  line: number;
  block: string;
}

/**
 * The splice plan (spec §4.1): one entry per attached, well-formed marker, in
 * doc order, block text VERBATIM — blank lines and trailing whitespace
 * preserved byte for byte, because what runs must be what the author reads.
 *
 * Markers that drew a static finding are excluded: splicing a block whose
 * declaration the linter has already rejected runs code for no verdict.
 * Exclusion is by "the marker has a finding", not by code, so an empty `why=`
 * excludes exactly as a mangled delimiter does.
 *
 * The body is read from the model's own fence classification — the lines
 * between the opening delimiter and the next delimiter — so this module never
 * decides where a block ends (spec §5).
 */
export function spliceFixturePlan(model: DocModel, kind: "spec" | "plan"): FixtureSpliceEntry[] {
  const out: FixtureSpliceEntry[] = [];
  for (const marker of scanMarkers(model, kind)) {
    if (marker.finding !== null || marker.fenceIndex === null) continue;
    const body: string[] = [];
    for (let j = marker.fenceIndex + 1; j < model.lines.length; j++) {
      // A string is an inside line; `null` closes the fence. An unclosed fence
      // runs to end of document, which is what the author wrote and so what
      // runs.
      if (typeof model.fencedInfo[j] !== "string") break;
      body.push(model.lines[j]!);
    }
    out.push({ line: marker.line, block: body.join("\n") });
  }
  return out;
}

/**
 * The premise sentinel (`tests/_shared/premise.ts:29`, `:38`). Its own header
 * states the contract this arm mechanizes: "a premise failure and an ordinary
 * assertion failure call for opposite responses". Vitest's JSON reporter
 * carries the message verbatim, so no new helper and no parsing of test bodies
 * is needed.
 */
const SENTINEL = "premise not met: ";

const advise = (code: string, docLine: number, message: string, detail: string): Finding => ({
  check: "taskContract",
  code,
  severity: "advisory",
  docLine,
  column: 1,
  message,
  detail,
});

/**
 * Every premise description in one failure message, in order.
 *
 * The helper's shape is `premise not met: <description>. <boilerplate>`, so the
 * description ends at the first sentence boundary. A description spanning two
 * sentences is truncated at the first — a documented cosmetic limit of the
 * DETAIL only: the sentinel decides the verdict, and truncation cannot change
 * which verdict fires.
 */
function premiseDescriptions(message: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = message.indexOf(SENTINEL, from);
    if (at === -1) return out;
    const rest = message.slice(at + SENTINEL.length);
    const end = rest.search(/\.(\s|$)/);
    out.push((end === -1 ? rest : rest.slice(0, end)).trim());
    from = at + SENTINEL.length;
  }
}

/**
 * The classification ladder (spec §4.3), in precedence order, drawing from a
 * closed claim set of exactly three statements. Each enrolled block gets
 * EXACTLY ONE outcome.
 *
 * There is deliberately NO clean-observation branch. Four versions of one
 * existed and each was measured unsound: absence of failures does not mean
 * anything executed (§2.3, §2.5), a non-failed file does not mean the file
 * succeeded (§2.6), a failed assertion does not mean an assertion failed
 * (§2.7), and a passing test does not mean anything was asserted (§2.8).
 * Nothing the JSON report carries establishes that a premise was EVALUATED,
 * because `premiseHolds` throws on failure and is silent on success. Silence
 * from this arm means "no premise failure observed", never "this block is
 * good".
 */
export function synthesizeFixtureFindings(
  plan: readonly FixtureSpliceEntry[],
  results: FixtureResults | null,
): Finding[] {
  // A static invocation ran nothing, so there is nothing to classify.
  if (results === null || results === undefined) return [];
  const out: Finding[] = [];
  for (const entry of plan) {
    const outcome = results.files.get(entry.line);

    // 1. A premise failed. Tested FIRST and over BOTH channels, because a
    //    module-scope premise fails during collection and surfaces with zero
    //    test cases and a file-level message (spec §2.9). Any other order
    //    reports that block as never having run and suppresses the one verdict
    //    this arm exists to emit — the live corpus instance included.
    if (outcome !== undefined) {
      const descriptions = [...outcome.failureMessages, outcome.fileMessage].flatMap(
        premiseDescriptions,
      );
      if (descriptions.length > 0) {
        out.push({
          check: "taskContract",
          code: "FIXTURE_UNSATISFIABLE",
          severity: "fail",
          docLine: entry.line,
          column: 1,
          message: "a stated premise of this fixture did not hold against the live tree",
          detail: "premise not met: " + [...new Set(descriptions)].join("; "),
        });
        continue;
      }
    }

    // 2. The report carries no test case for this block. Never an
    //    interpretation of an entry — the report's own statement that none
    //    existed.
    if (results.unavailable !== undefined) {
      out.push(
        advise(
          "FIXTURE_PROBE_UNVERIFIED",
          entry.line,
          "this fixture block was not observed",
          results.unavailable,
        ),
      );
      continue;
    }
    if (outcome === undefined) {
      out.push(
        advise(
          "FIXTURE_PROBE_UNVERIFIED",
          entry.line,
          "this fixture block was not observed",
          "the report carries no file for this block",
        ),
      );
      continue;
    }
    if (outcome.assertions.length === 0) {
      out.push(
        advise(
          "FIXTURE_PROBE_UNVERIFIED",
          entry.line,
          "this fixture block was not observed",
          "the report carries a file for this block with no test case in it" +
            (outcome.fileMessage === "" ? "" : ": " + outcome.fileMessage),
        ),
      );
      continue;
    }

    // 3. Otherwise nothing. The report carries at least one test case and no
    //    premise failure in either channel. This does NOT say the bodies ran.
  }
  return out;
}
