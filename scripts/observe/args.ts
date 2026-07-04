// scripts/observe/args.ts
import { parseArgs } from "node:util";
import type { AppEventFilters, AppEventLevel } from "@/lib/admin/telemetryTypes";
import { isUuid, type AlertFilters, type ChangeLogFilters } from "@/lib/observe/query";

export type ObserveCommand = "events" | "alerts" | "cron" | "changes" | "codes" | "tail" | "help";
const COMMANDS: ObserveCommand[] = ["events", "alerts", "cron", "changes", "codes", "tail", "help"];
const LEVELS: AppEventLevel[] = ["info", "warn", "error"];

export type ParsedArgs =
  | {
      kind: "ok";
      command: ObserveCommand;
      codeArg?: string;
      json: boolean;
      env?: string;
      follow: boolean;
      interval: number;
      limit?: number;
      eventFilters: AppEventFilters;
      alertFilters: AlertFilters;
      changeFilters: ChangeLogFilters;
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
        open: { type: "boolean", default: false },
        json: { type: "boolean", default: false },
        follow: { type: "boolean", default: false },
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
  const source = cap(values.source);
  const codeVal = cap(values.code);
  const request = cap(values.request);
  const q = cap(values.q);
  const since = sinceToHours(values.since);

  const eventFilters: AppEventFilters = {
    ...(levels && levels.length ? { levels } : {}),
    ...(source ? { source } : {}),
    ...(codeVal ? { code: codeVal } : {}),
    ...(request ? { requestId: request } : {}),
    ...(q ? { q } : {}),
    ...(showId ? { showId } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
  };
  const alertFilters: AlertFilters = {
    ...(values.open ? { openOnly: true } : {}),
    ...(codeVal ? { code: codeVal } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };
  const changeFilters: ChangeLogFilters = {
    ...(showId ? { showId } : {}),
    ...(since !== undefined ? { sinceHours: since } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };

  return {
    kind: "ok",
    command: command as ObserveCommand,
    ...(positionals[1] ? { codeArg: positionals[1] } : {}),
    json: values.json ?? false,
    ...(values.env ? { env: values.env } : {}),
    follow: values.follow ?? false,
    interval,
    ...(limit !== undefined ? { limit } : {}),
    eventFilters,
    alertFilters,
    changeFilters,
  };
}
