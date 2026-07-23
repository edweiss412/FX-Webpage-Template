"use server";
/**
 * app/admin/_devCaptureAction.ts - §5 of the dev-modal-capture spec.
 * Developer-gated READ-ONLY telemetry pull for the capture bundle. Deliberately
 * NOT under app/admin/dev/ (that tree is build-gated aside in prod;
 * scripts/with-admin-dev-flag.mjs FILES list) - this surface ships to prod
 * for developer users. No lib/log import; no direct Supabase calls (read-core
 * only). Registered read-only in ADMIN_SURFACE_EXEMPTIONS (invariant 10).
 */
import { requireDeveloper } from "@/lib/auth/requireDeveloper";
import { queryEvents } from "@/lib/observe/query/events";
import { queryAlerts } from "@/lib/observe/query/alerts";
import { querySyncLog } from "@/lib/observe/query/syncLog";
import { queryStagedParses } from "@/lib/observe/query/staged";
import { queryIngestFailures } from "@/lib/observe/query/failures";

export type CaptureTelemetryRequest =
  | { kind: "published"; showId: string }
  | { kind: "staged"; driveFileId: string };
export type CaptureList<T> = { rows: T[]; truncated: boolean };
export type CaptureInfraError = { kind: "infra_error"; message: string };
export type CaptureSection<T> = CaptureList<T> | CaptureInfraError;
export type CaptureTelemetryResult =
  | { kind: "bad_request" }
  | {
      kind: "ok";
      commitSha: string | null;
      events?: CaptureSection<unknown>;
      alerts?: CaptureSection<unknown>;
      syncLog?: CaptureSection<unknown>;
      staged?: CaptureSection<unknown>;
      failures?: CaptureSection<unknown>;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA40_RE = /^[0-9a-f]{40}$/i;
const SINCE_HOURS = 168; // §10
const WARNINGS_CAP = 200; // §10

function parseRequest(input: unknown): CaptureTelemetryRequest | null {
  // Exact-shape guard: OWN keys must be exactly the union variant's keys (§5
  // fail-closed - extra keys, hybrid objects, and prototype-inherited matches
  // are all rejected).
  if (input === null || typeof input !== "object") return null;
  const r = input as Record<string, unknown>;
  const keys = Object.keys(r).sort();
  if (
    keys.length === 2 &&
    keys[0] === "kind" &&
    keys[1] === "showId" &&
    r["kind"] === "published" &&
    typeof r["showId"] === "string" &&
    UUID_RE.test(r["showId"])
  ) {
    return { kind: "published", showId: r["showId"] };
  }
  if (
    keys.length === 2 &&
    keys[0] === "driveFileId" &&
    keys[1] === "kind" &&
    r["kind"] === "staged" &&
    typeof r["driveFileId"] === "string" &&
    r["driveFileId"].length > 0 &&
    r["driveFileId"].length <= 128
  ) {
    return { kind: "staged", driveFileId: r["driveFileId"] };
  }
  return null;
}

function probeList<T>(rows: readonly T[], cap: number): CaptureList<T> {
  return { rows: rows.slice(0, cap) as T[], truncated: rows.length > cap };
}

/** §4.2: cap EXACTLY the enumerated nested arrays; the sibling marker is
 * `warningsTruncated` for both (staged `warnings`, failure `lastWarnings`). */
function capNestedWarnings(row: unknown, key: "warnings" | "lastWarnings"): unknown {
  if (row === null || typeof row !== "object") return row;
  const r = { ...(row as Record<string, unknown>) };
  const v = r[key];
  if (Array.isArray(v) && v.length > WARNINGS_CAP) {
    r[key] = v.slice(0, WARNINGS_CAP);
    r["warningsTruncated"] = true;
  }
  return r;
}

function envCommitSha(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  return sha !== undefined && SHA40_RE.test(sha) ? sha : null;
}

export async function captureShowTelemetry(
  request: CaptureTelemetryRequest,
): Promise<CaptureTelemetryResult> {
  await requireDeveloper();
  const parsed = parseRequest(request);
  if (parsed === null) return { kind: "bad_request" };
  if (parsed.kind === "published") {
    const [events, alerts, syncLog] = await Promise.all([
      queryEvents({ showId: parsed.showId, sinceHours: SINCE_HOURS }),
      queryAlerts({ openOnly: true, limit: 101, showIdOrGlobal: parsed.showId }),
      querySyncLog({ showId: parsed.showId, sinceHours: SINCE_HOURS, limit: 51 }),
    ]);
    return {
      kind: "ok",
      commitSha: envCommitSha(),
      events: events.kind === "ok" ? { rows: events.events, truncated: events.hasMore } : events,
      alerts: alerts.kind === "ok" ? probeList(alerts.alerts, 100) : alerts,
      syncLog: syncLog.kind === "ok" ? probeList(syncLog.rows, 50) : syncLog,
    };
  }
  const [staged, failures] = await Promise.all([
    queryStagedParses({ driveFileId: parsed.driveFileId, sinceHours: SINCE_HOURS, limit: 11 }),
    queryIngestFailures({ sinceHours: SINCE_HOURS, limit: 101, driveFileId: parsed.driveFileId }),
  ]);
  return {
    kind: "ok",
    commitSha: envCommitSha(),
    staged:
      staged.kind === "ok"
        ? probeList(
            staged.rows.map((r) => capNestedWarnings(r, "warnings")),
            10,
          )
        : staged,
    failures:
      failures.kind === "ok"
        ? probeList(
            failures.rows.map((r) => capNestedWarnings(r, "lastWarnings")),
            100,
          )
        : failures,
  };
}
