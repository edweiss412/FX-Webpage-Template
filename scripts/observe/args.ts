// scripts/observe/args.ts
import { parseArgs } from "node:util";
import type { AppEventFilters, AppEventLevel } from "@/lib/admin/telemetryTypes";
import {
  isUuid,
  type AlertFilters,
  type ChangeLogFilters,
  type StagedFilters,
  type FailureFilters,
  type PublishedWarningsFilters,
  type SyncLogFilters,
  type DeferredFilters,
  type WatchFilters,
} from "@/lib/observe/query";

export type ObserveCommand =
  | "events"
  | "alerts"
  | "cron"
  | "changes"
  | "codes"
  | "tail"
  | "help"
  | "staged"
  | "failures"
  | "warnings"
  | "synclog"
  | "deferred"
  | "watch";
const COMMANDS: ObserveCommand[] = [
  "events",
  "alerts",
  "cron",
  "changes",
  "codes",
  "tail",
  "help",
  "staged",
  "failures",
  "warnings",
  "synclog",
  "deferred",
  "watch",
];
const NEW_COMMANDS = new Set(["staged", "failures", "warnings", "synclog", "deferred", "watch"]);
const SINCE_TOKENS = new Set(["1h", "24h", "7d", "all"]);
const LEVELS: AppEventLevel[] = ["info", "warn", "error"];

export type ParsedArgs =
  | {
      kind: "ok";
      command: ObserveCommand;
      codeArg?: string;
      json: boolean;
      env?: string;
      follow: boolean;
      revealEmail: boolean;
      interval: number;
      limit?: number;
      full: boolean;
      eventFilters: AppEventFilters;
      alertFilters: AlertFilters;
      changeFilters: ChangeLogFilters;
      stagedFilters: StagedFilters;
      failureFilters: FailureFilters;
      warningsFilters: PublishedWarningsFilters;
      syncLogFilters: SyncLogFilters;
      deferredFilters: DeferredFilters;
      watchFilters: WatchFilters;
    }
  | { kind: "error"; message: string };

function cap(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = v.trim();
  return t.length === 0 || t.length > 200 ? undefined : t;
}
function sinceToHours(v: string | undefined): 1 | 24 | 168 | null | undefined {
  if (v === undefined) return undefined;
  if (v === "1h") return 1;
  if (v === "7d") return 168;
  if (v === "all") return null;
  return 24; // "24h" and anything else
}

// Fail-closed validator for the six new commands only — existing events/alerts/
// changes/tail keep their current drop/fallback posture (see the passing
// "existing events posture unchanged" test).
function requireValid(values: Record<string, unknown>): { kind: "error"; message: string } | null {
  const err = (m: string) => ({ kind: "error" as const, message: m });
  const bad = (v: unknown) =>
    typeof v === "string" && (v.trim().length === 0 || v.trim().length > 200);
  if (typeof values.session === "string" && !isUuid(values.session.trim()))
    return err("--session must be a UUID");
  if (typeof values.show === "string" && !isUuid(values.show.trim()))
    return err("--show must be a UUID");
  // New-command flags are SINGLE-VALUE by contract (comma lists are events/tail
  // only) — a comma would otherwise flow into a raw .eq() equality filter and
  // silently match nothing (Codex plan-R1 F2).
  const singleValue = (v: unknown) => typeof v === "string" && !v.includes(",");
  if (bad(values.file) || (typeof values.file === "string" && !singleValue(values.file)))
    return err("--file must be a single non-empty value (no commas) of at most 200 chars");
  if (bad(values.status) || (typeof values.status === "string" && !singleValue(values.status)))
    return err("--status must be a single non-empty value (no commas) of at most 200 chars");
  if (bad(values.code) || (typeof values.code === "string" && !singleValue(values.code)))
    return err("--code must be a single non-empty value (no commas) of at most 200 chars");
  if (typeof values.since === "string" && !SINCE_TOKENS.has(values.since))
    return err("--since must be 1h|24h|7d|all");
  return null;
}

export function parseObserveArgs(argv: string[]): ParsedArgs {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        level: { type: "string" },
        source: { type: "string" },
        code: { type: "string" },
        request: { type: "string" },
        q: { type: "string" },
        show: { type: "string" },
        since: { type: "string" },
        limit: { type: "string" },
        interval: { type: "string" },
        env: { type: "string" },
        session: { type: "string" },
        file: { type: "string" },
        status: { type: "string" },
        full: { type: "boolean", default: false },
        "warnings-only": { type: "boolean", default: false },
        open: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        follow: { type: "boolean", default: false },
        "reveal-email": { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (e) {
    return { kind: "error", message: e instanceof Error ? e.message : "bad arguments" };
  }
  const { values, positionals } = parsed;
  // `--help`/`-h`, or no subcommand, resolves to the help screen.
  const command = (values.help ? "help" : (positionals[0] ?? "help")) as string;
  if (!COMMANDS.includes(command as ObserveCommand)) {
    return {
      kind: "error",
      message: `unknown command "${command}" (expected ${COMMANDS.join("|")})`,
    };
  }

  if (NEW_COMMANDS.has(command)) {
    const invalid = requireValid(values as Record<string, unknown>);
    if (invalid) return invalid;
  }

  const levels = values.level
    ? values.level
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is AppEventLevel => (LEVELS as string[]).includes(s))
    : undefined;
  const show = cap(values.show);
  const showId = show && isUuid(show) ? show : undefined;
  const limitRaw = values.limit ? Number(values.limit) : undefined;
  const limit = limitRaw !== undefined && !Number.isNaN(limitRaw) ? limitRaw : undefined;
  const intervalRaw = values.interval ? Number(values.interval) : NaN;
  const interval = Number.isNaN(intervalRaw)
    ? 5
    : Math.max(1, Math.min(60, Math.trunc(intervalRaw)));

  // Capture each capped value once so TS narrows undefined out inside the truthy
  // branch (exactOptionalPropertyTypes forbids `key: string | undefined`).
  const codeVal = cap(values.code);
  const request = cap(values.request);
  const q = cap(values.q);
  const since = sinceToHours(values.since);

  // Comma-list split — events/tail only. Single token maps to the legacy
  // singular field (back-compat); 2+ tokens map to the plural field.
  const codeTokens = (values.code ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 200);
  const sourceTokens = (values.source ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length <= 200);

  const eventFilters: AppEventFilters = {
    ...(levels && levels.length ? { levels } : {}),
    ...(sourceTokens.length === 1 ? { source: sourceTokens[0]! } : {}),
    ...(sourceTokens.length > 1 ? { sources: sourceTokens } : {}),
    ...(codeTokens.length === 1 ? { code: codeTokens[0]! } : {}),
    ...(codeTokens.length > 1 ? { codes: codeTokens } : {}),
    ...(request ? { requestId: request } : {}),
    ...(q ? { q } : {}),
    ...(showId ? { showId } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
  };
  const revealEmail = values["reveal-email"] === true;
  const alertFilters: AlertFilters = {
    ...(values.open ? { openOnly: true } : {}),
    ...(codeVal ? { code: codeVal } : {}),
    ...(limit !== undefined ? { limit } : {}),
    includePii: revealEmail,
  };
  const changeFilters: ChangeLogFilters = {
    ...(showId ? { showId } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };

  const session = cap(values.session);
  const file = cap(values.file);
  const status = cap(values.status);
  const full = values.full === true;
  const warningsOnly = values["warnings-only"] === true;

  const stagedFilters: StagedFilters = {
    ...(session ? { sessionId: session } : {}),
    ...(file ? { driveFileId: file } : {}),
    ...(warningsOnly ? { warningsOnly: true } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
    ...(limit !== undefined ? { limit } : {}),
    includePii: revealEmail,
  };
  const failureFilters: FailureFilters = {
    ...(session ? { sessionId: session } : {}),
    ...(codeVal ? { code: codeVal } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
    ...(limit !== undefined ? { limit } : {}),
    includePii: revealEmail,
  };
  const warningsFilters: PublishedWarningsFilters = {
    ...(showId ? { showId } : {}),
    ...(limit !== undefined ? { limit } : {}),
    includePii: revealEmail,
  };
  const syncLogFilters: SyncLogFilters = {
    ...(showId ? { showId } : {}),
    ...(file ? { driveFileId: file } : {}),
    ...(status ? { status } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
    ...(limit !== undefined ? { limit } : {}),
    includePii: revealEmail,
  };
  const deferredFilters: DeferredFilters = {
    ...(limit !== undefined ? { limit } : {}),
    includePii: revealEmail,
  };
  const watchFilters: WatchFilters = {
    ...(limit !== undefined ? { limit } : {}),
  };

  return {
    kind: "ok",
    command: command as ObserveCommand,
    ...(positionals[1] ? { codeArg: positionals[1] } : {}),
    json: values.json ?? false,
    ...(values.env ? { env: values.env } : {}),
    follow: values.follow ?? false,
    revealEmail,
    interval,
    ...(limit !== undefined ? { limit } : {}),
    full,
    eventFilters,
    alertFilters,
    changeFilters,
    stagedFilters,
    failureFilters,
    warningsFilters,
    syncLogFilters,
    deferredFilters,
    watchFilters,
  };
}
