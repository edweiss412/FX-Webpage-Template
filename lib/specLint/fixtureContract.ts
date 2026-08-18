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
import type { Finding } from "./types";

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
