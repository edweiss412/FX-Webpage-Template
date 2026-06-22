/**
 * §7 release-gate artifact. Reads each affected show's
 * `shows_internal.run_of_show` from the validation/prod Supabase (via the
 * established `supabase db query --linked` / `TEST_DATABASE_URL` mechanism —
 * the same surgical-apply path used for migrations), decodes via
 * decodeRunOfShow, and asserts a PER-SHOW, PER-ISO coverage map. FAILS
 * (exit 1) if ANY recoverable show day lacks its expected populated field —
 * NOT "≥1 day" (closes adversarial R8 finding 14). Run as:
 *     pnpm verify-resync-scheduletimes
 * after the forced re-sync (§7 step 1). Rollout is "complete" ONLY when green.
 */
import postgres from "postgres";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";
import type { RunOfShow } from "@/lib/parser/types";

/** Per recoverable show day: which ScheduleDay field MUST be populated. */
type DayExpectation =
  | { field: "entries" }          // titled run-of-show (Consultants, RPAS, FinTech)
  | { field: "window" }           // bare-window span (RIA, Asset-Mgmt)
  | { field: "showStart" }        // leading-start fragment (Redefining-FI Day 1)
  | { field: "unparsed" };        // deliberate end-only → expected SCHEDULE_TIME_UNPARSED, NOT a decoded day

/** drive_file_id → { isoDate → expectation }. CANONICAL live Drive IDs (gsheets-MCP
 *  recon 2026-06-22) + per-ISO field derived from each show's live DATES TIME cells.
 *  Each ISO is a member of that show's show.dates.showDays. East Coast (v1, no DATES
 *  TIME column — schedule rides the AGENDA grid) is intentionally EXCLUDED; it is not
 *  affected by this change. VB01–VB10/DRILL are Consultants clones (same ISOs) — add
 *  rows for any that are live-synced at deploy time. */
const EXPECTED: Record<string, Record<string, DayExpectation>> = {
  // Consultants Roundtable 2025 — titled both show days
  "1XQ44uxc44pToYxQnYw4OG9V6DjE7bC5EU08o5iFpxz4": {
    "2025-10-08": { field: "entries" }, // "7:15am - Registration … 5:35pm - Meeting Concludes"
    "2025-10-09": { field: "entries" }, // "7:30am - Reg & Breakfast … 4:30pm - Meeting Concludes"
  },
  // Redefining Fixed Income / Private Credit 2025 — Day 1 leading-start fragment, Day 2 end-only
  "1HHw7vqCpnuxeDQDU5Gyxl70kyYV5-q6OFhcH_slXTcg": {
    "2025-05-13": { field: "showStart" }, // "GS: 8:00 AM -"
    "2025-05-14": { field: "unparsed" },  // "GS: ... - 6:00 PM" — deliberate end-only
  },
  // RIA Investment Forum - Central 2025 — bare windows both days
  "1Ll_fx6Q24y6aTSqIV7YiruDKrYtezkkKrVCXVc4Cwkw": {
    "2025-06-25": { field: "window" }, // "7:30am - 5:50pm"
    "2025-06-26": { field: "window" }, // "7:45am - 12:15pm"
  },
  // Retirement Plan Advisor Institute (RPAS) Central 2026 — titled both show days
  "1vyZMRTqeFAJgocbSJM2_HDDMsUUJFBiLKk6WKq-dUYo": {
    "2026-03-24": { field: "entries" }, // 16-line agenda
    "2026-03-25": { field: "entries" },
  },
  // FinTech Forum CTO Summit 2026 — titled three show days
  "1v856gW02Xx-RmefruhqBdjZlYqoFCnvYld1p3v0iVvY": {
    "2026-05-04": { field: "entries" },
    "2026-05-05": { field: "entries" },
    "2026-05-06": { field: "entries" },
  },
  // Fixed Income Trading Summit 2025 — Day 1 empty TIME (no per-day data, not recoverable → omit),
  // Day 2 single terminal token "4:15pm - Meeting Concludes" → entry kept (showStart guarded null)
  "1xBbpHi_InDDC3V7Urg4LzA3NMD0qXOxJF0bKbw7Yt-4": {
    "2025-10-21": { field: "entries" },
  },
};

/** VB01–VB10 + DRILL are Consultants byte-clones synced from the same folder
 *  (plan-review R2 finding 5 — the gate MUST cover them, not leave them as a
 *  deploy-time TODO). Their show-day dates can drift from edits, so we don't
 *  hardcode per-ISO fields; instead we FAIL-CLOSED: each MUST have a non-null,
 *  decode-clean run_of_show with ≥1 ScheduleDay carrying a populated field
 *  (proving the per-day capture ran on the clone). Drive IDs from the 2026-06-22
 *  folder enumeration. */
const REQUIRED_CLONE_IDS: string[] = [
  "1f2mV_cq0jdmJhrL-lD5Hn7PVnSRTkLyVjZMLGEbbh7k", // DRILL Consultants Fresh Copy
  "1kIA-qj_Uwj-y9pMbZxg_4ei_6fTixpgP0vpTfOaTjbY", // VB01
  "13j9ErFcM1BeUVy5vLD6S4-TYshM0QMgvm3KCvMj0Vo0", // VB02
  "17kPwZFyEt59qYcYyNNlm2iVQ2IpLzgQw-vopRtsZZJI", // VB03
  "1yj6DAnn3nSo3PFXW6vxNu7Y2IWtV8PySsUtjui1PKPc", // VB04
  "1Wvs2STSWJnoDxrhFMSd0qJmP0IR8tg3SbAk6-OxquAo", // VB05
  "1xOLemFr6cf-Su1i_wNIwkOT27RmqTU2G1BTaXBCcUB4", // VB06
  "1OcBwfeBkqbC5PEJi9xyPl2CkdiPS8wCQd8Oz2B_5eZg", // VB07
  "1YMi8tmiBeuf8DpQ3qhfnjMsrlwroRtzxbYDpZg20loo", // VB08
  "1TmaQkl0mgaCa97v5QDCe9vR1Q63xNk4aioCX3IRr_so", // VB09
  "1oV7SdkZvhnQZ3sN7vuDLVutGnUaDhFMzm3X8TArElUs", // VB10
];

function dayHasExpectedField(day: RunOfShow[string] | undefined, exp: DayExpectation): boolean {
  if (exp.field === "unparsed") return day === undefined; // must be ABSENT from runOfShow
  if (day === undefined) return false;
  switch (exp.field) {
    case "entries": return day.entries.length > 0;
    case "window": return day.window != null;
    case "showStart": return day.showStart != null;
  }
}

/** parse_warnings is a jsonb array of ParseWarning; the SCHEDULE_TIME_UNPARSED message
 *  embeds the ISO (Task 1 constructor), so an end-only day is "confirmed unparsed" only
 *  when BOTH (a) it is absent from run_of_show AND (b) its warning is present — a missing
 *  warning must NOT silently pass (plan-review finding 4). */
function hasUnparsedWarning(warnings: Array<{ code?: string; message?: string }>, iso: string): boolean {
  return warnings.some((w) => w.code === "SCHEDULE_TIME_UNPARSED" && (w.message ?? "").includes(iso));
}

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) { console.error("TEST_DATABASE_URL unset"); process.exit(2); }
  const sql = postgres(url, { prepare: false });
  let anyFail = false;
  const rows: Array<{ show: string; iso: string; expect: string; got: string; pass: boolean }> = [];

  for (const [driveId, dayMap] of Object.entries(EXPECTED)) {
    const [rec] = await sql<{ run_of_show: unknown; parse_warnings: unknown }[]>`
      SELECT si.run_of_show, si.parse_warnings
      FROM shows_internal si
      JOIN shows s ON s.id = si.show_id
      WHERE s.drive_file_id = ${driveId}
    `;
    const { value } = decodeRunOfShow(rec?.run_of_show ?? null);
    const decoded: RunOfShow = (value as RunOfShow) ?? {};
    const warnings = (Array.isArray(rec?.parse_warnings) ? rec!.parse_warnings : []) as Array<{
      code?: string; message?: string;
    }>;
    for (const [iso, exp] of Object.entries(dayMap)) {
      // For an `unparsed` day, BOTH the absence AND the expected warning must hold.
      const pass =
        exp.field === "unparsed"
          ? dayHasExpectedField(decoded[iso], exp) && hasUnparsedWarning(warnings, iso)
          : dayHasExpectedField(decoded[iso], exp);
      if (!pass) anyFail = true;
      rows.push({
        show: driveId, iso, expect: exp.field,
        got:
          exp.field === "unparsed"
            ? (decoded[iso] ? "PRESENT(!)" : "absent") + (hasUnparsedWarning(warnings, iso) ? "+warn" : "+NO-warn(!)")
            : decoded[iso] ? JSON.stringify(decoded[iso]).slice(0, 60) : "ABSENT",
        pass,
      });
    }
  }

  // Clone copies (VB/DRILL) — FAIL-CLOSED presence + recovered-something check
  // (R2 finding 5: the gate must not pass while required clones are unverified).
  for (const driveId of REQUIRED_CLONE_IDS) {
    const [rec] = await sql<{ run_of_show: unknown }[]>`
      SELECT si.run_of_show
      FROM shows_internal si
      JOIN shows s ON s.id = si.show_id
      WHERE s.drive_file_id = ${driveId}
    `;
    const { value, corrupt } = decodeRunOfShow(rec?.run_of_show ?? null);
    const decoded: RunOfShow = (value as RunOfShow) ?? {};
    const recoveredSomething = Object.values(decoded).some(
      (d) => d.entries.length > 0 || d.showStart != null || d.window != null,
    );
    const pass = rec !== undefined && !corrupt && recoveredSomething;
    if (!pass) anyFail = true;
    rows.push({
      show: driveId, iso: "(clone)", expect: "present+recovered",
      got: rec === undefined ? "NO-ROW(!)" : corrupt ? "CORRUPT(!)" : recoveredSomething ? "ok" : "EMPTY(!)",
      pass,
    });
  }

  // Per-show / per-day PASS/FAIL table.
  console.table(rows);
  await sql.end();
  if (anyFail) { console.error("verify-resync-scheduletimes: FAIL — recoverable day(s) missing, unparsed warning absent, or a required clone unverified"); process.exit(1); }
  console.log("verify-resync-scheduletimes: PASS — all recoverable days + required clones covered");
}

main().catch((e) => { console.error(e); process.exit(2); });
