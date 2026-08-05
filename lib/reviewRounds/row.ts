import { appendFileSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname } from "node:path";

import { isStage, type Stage } from "./constants";

/** Spec §5.3. All scalars - no array field, no free-text field, so a row is
 *  bounded by construction rather than by truncation logic. */
export type ReviewRoundRow = {
  stage: Stage;
  round: number;
  branch: string;
  baseSha: string;
  label: string | null;
  status: "verdict" | "no_verdict";
  verdict: string | null;
  failureReason: string | null;
  findingCount: number | null;
  startedAt: string | null;
  endedAt: string | null;
  briefPath: string;
  outDir: string;
  /** `GUARD_VERSION` is a number in the wrapper (scripts/codex-guard.mjs:21). */
  guardVersion: number | null;
  recoveredFrom: string | null;
};

export type ParseResult = { ok: true; row: ReviewRoundRow } | { ok: false; problem: string };

export function serializeRow(row: ReviewRoundRow): string {
  return JSON.stringify(row) + "\n";
}

const STRING_OR_NULL = [
  "label",
  "verdict",
  "failureReason",
  "startedAt",
  "endedAt",
  "recoveredFrom",
] as const;

export function parseRow(line: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (e) {
    return { ok: false, problem: `not valid JSON: ${(e as Error).message}` };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, problem: "row is not a JSON object" };
  }
  const r = parsed as Record<string, unknown>;

  if (!isStage(r.stage))
    return { ok: false, problem: `stage not in accept-set: ${String(r.stage)}` };
  // SAFE integer: an unsafe one has already been rounded by the JSON parse, so
  // `Number.isInteger` admits a round number no author wrote. The wrapper now
  // refuses it at the flag too; this is the boundary that catches a corpus
  // written by anything else.
  if (typeof r.round !== "number" || !Number.isSafeInteger(r.round) || r.round < 1) {
    return { ok: false, problem: `round must be an integer >= 1: ${String(r.round)}` };
  }
  if (r.status !== "verdict" && r.status !== "no_verdict") {
    return { ok: false, problem: `status must be "verdict" or "no_verdict": ${String(r.status)}` };
  }
  for (const k of ["branch", "baseSha", "briefPath", "outDir"] as const) {
    if (typeof r[k] !== "string" || r[k] === "") {
      return { ok: false, problem: `${k} must be a non-empty string` };
    }
  }
  for (const k of STRING_OR_NULL) {
    if (r[k] !== null && typeof r[k] !== "string") {
      return { ok: false, problem: `${k} must be a string or null` };
    }
  }
  // `null` means NOT DECLARED, never "none found" (spec §5.3). Folding it into
  // zero would state a false total in every report.
  if (
    r.findingCount !== null &&
    (typeof r.findingCount !== "number" ||
      !Number.isSafeInteger(r.findingCount) ||
      r.findingCount < 0)
  ) {
    return { ok: false, problem: `findingCount must be a non-negative integer or null` };
  }
  if (r.guardVersion !== null && !Number.isSafeInteger(r.guardVersion)) {
    return { ok: false, problem: `guardVersion must be a number or null` };
  }
  return { ok: true, row: r as unknown as ReviewRoundRow };
}

export type AppendResult = { ok: true } | { ok: false; problem: string };

/**
 * Appends one row. NEVER throws: this is telemetry attached to a review that
 * has already happened, and a corpus that cannot be written must not change
 * the wrapper's exit code or lose the result.json (spec §11.1).
 */
export function appendRow(file: string, row: ReviewRoundRow): AppendResult {
  try {
    mkdirSync(dirname(file), { recursive: true });
    // A prior writer that died mid-line, or a hand-edit that stripped the final
    // newline, would otherwise merge two rows into one unparseable line.
    let prefix = "";
    try {
      if (statSync(file).size > 0) {
        const existing = readFileSync(file, "utf8");
        if (!existing.endsWith("\n")) prefix = "\n";
      }
    } catch {
      /* file does not exist yet - no prefix needed */
    }
    appendFileSync(file, prefix + serializeRow(row));
    return { ok: true };
  } catch (e) {
    return { ok: false, problem: `could not append to ${file}: ${(e as Error).message}` };
  }
}
