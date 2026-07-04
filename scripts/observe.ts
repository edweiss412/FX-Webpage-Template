// scripts/observe.ts
import { pathToFileURL } from "node:url";
import { MESSAGE_CATALOG, isMessageCode, type MessageCatalogEntry } from "@/lib/messages/lookup";
import { parseObserveArgs } from "./observe/args";
import { resolveTarget } from "./observe/env";
import { collectEvents } from "./observe/collect";
import {
  formatEvents,
  formatEventLineNdjson,
  formatAlerts,
  formatCron,
  formatChanges,
} from "./observe/format";
import { queryEvents as realQueryEvents } from "@/lib/observe/query/events";
import { getCronHealth as realGetCronHealth } from "@/lib/observe/query/cronHealth";
import { queryAlerts as realQueryAlerts } from "@/lib/observe/query/alerts";
import { queryChangeLog as realQueryChangeLog } from "@/lib/observe/query/changeLog";
import { clampLimit } from "@/lib/observe/query";

// Infra/usage errors: JSON object on stderr when --json (agent-parseable), else plain text.
function fail(
  message: string,
  json: boolean,
): { stdout: string; stderr: string; exitCode: number } {
  return { stdout: "", stderr: json ? JSON.stringify({ error: message }) : message, exitCode: 1 };
}

export function resolveCodeText(code: string | undefined): string {
  if (code === undefined) {
    return Object.keys(MESSAGE_CATALOG)
      .map((c) => {
        const e = MESSAGE_CATALOG[c as keyof typeof MESSAGE_CATALOG];
        return `${c}  ${e.title ?? e.dougFacing ?? ""}`.trimEnd();
      })
      .join("\n");
  }
  if (!isMessageCode(code)) {
    return `Code "${code}" is not in the message catalog (may be a forensic log-only code).`;
  }
  // Widened type: a const entry lacking a `severity` key is still assignable to
  // MessageCatalogEntry (severity is optional), making `.severity` type-safe.
  const e: MessageCatalogEntry = MESSAGE_CATALOG[code];
  const lines = [
    code,
    e.title ? `title: ${e.title}` : "",
    e.severity ? `severity: ${e.severity}` : "",
    e.dougFacing ? `admin: ${e.dougFacing}` : "",
    e.crewFacing ? `crew: ${e.crewFacing}` : "",
    e.helpfulContext ? `context: ${e.helpfulContext}` : "",
    e.helpHref ? `help: ${e.helpHref}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

type ObserveDeps = {
  queryEvents: typeof realQueryEvents;
  getCronHealth: typeof realGetCronHealth;
  queryAlerts: typeof realQueryAlerts;
  queryChangeLog: typeof realQueryChangeLog;
  env: Record<string, string | undefined>;
  nowMs: number;
};

export async function runObserve(
  argv: string[],
  deps: ObserveDeps,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const parsed = parseObserveArgs(argv);
  if (parsed.kind === "error") return fail(parsed.message, argv.includes("--json"));
  const { command } = parsed;

  if (command === "help") {
    return { stdout: USAGE, stderr: "", exitCode: 0 };
  }
  if (command === "codes") {
    return { stdout: resolveCodeText(parsed.codeArg), stderr: "", exitCode: 0 };
  }

  // All DB commands go through the --env guardrail first.
  const target = resolveTarget(parsed.env, deps.env);
  if (target.kind === "error") return fail(target.message, parsed.json);

  if (command === "cron") {
    const r = await deps.getCronHealth();
    if (r.kind === "infra_error") return fail(r.message, parsed.json);
    return { stdout: formatCron(r.jobs, parsed.json, deps.nowMs), stderr: "", exitCode: 0 };
  }
  if (command === "alerts") {
    const r = await deps.queryAlerts(parsed.alertFilters);
    if (r.kind === "infra_error") return fail(r.message, parsed.json);
    return { stdout: formatAlerts(r.alerts, parsed.json), stderr: "", exitCode: 0 };
  }
  if (command === "changes") {
    const r = await deps.queryChangeLog(parsed.changeFilters);
    if (r.kind === "infra_error") return fail(r.message, parsed.json);
    return { stdout: formatChanges(r.changes, parsed.json), stderr: "", exitCode: 0 };
  }
  if (command === "events" || command === "tail") {
    // Clamp to the CLI contract (1..500; command-specific default). collectEvents
    // does not clamp, so the clamp MUST happen here (Codex whole-diff finding).
    const limit = clampLimit(parsed.limit, command === "tail" ? 20 : 100);
    // tail --follow is handled by the entry runner (loop); here we do one poll.
    const r = await collectEvents(deps.queryEvents, parsed.eventFilters, limit);
    if (r.kind === "infra_error") return fail(r.message, parsed.json);
    if (command === "tail" && parsed.json) {
      return { stdout: r.events.map(formatEventLineNdjson).join(""), stderr: "", exitCode: 0 };
    }
    return { stdout: formatEvents(r.events, parsed.json), stderr: "", exitCode: 0 };
  }
  return fail(`unhandled command ${command}`, parsed.json);
}

const USAGE = `pnpm observe <events|alerts|cron|changes|codes|tail> [flags]
  events   [--show <uuid>] [--level info,warn,error] [--code C] [--source S] [--request R] [--q text] [--since 1h|24h|7d|all] [--limit N] [--json] [--env local|validation|prod]
  alerts   [--open] [--code C] [--limit N] [--json] [--env …]
  cron     [--json] [--env …]
  changes  [--show <uuid>] [--since …] [--limit N] [--json] [--env …]
  codes    [CODE]                (offline; --env ignored)
  tail     [--follow] [--interval S] [events filters…] [--json] [--env …]`;

// ---- Direct-run entry (not exercised by unit tests) ----
const isEntry = (() => {
  const a = process.argv[1];
  if (!a) return false;
  try {
    return import.meta.url === pathToFileURL(a).href;
  } catch {
    return false;
  }
})();

if (isEntry) {
  const deps: ObserveDeps = {
    queryEvents: realQueryEvents,
    getCronHealth: realGetCronHealth,
    queryAlerts: realQueryAlerts,
    queryChangeLog: realQueryChangeLog,
    env: process.env,
    nowMs: Date.now(),
  };
  const argv = process.argv.slice(2);
  const parsed = parseObserveArgs(argv);
  const follow = parsed.kind === "ok" && parsed.command === "tail" && parsed.follow;
  if (follow) {
    void runTailFollow(argv, deps);
  } else {
    void runObserve(argv, deps).then((r) => {
      if (r.stdout) process.stdout.write(r.stdout + "\n");
      if (r.stderr) process.stderr.write(r.stderr + "\n");
      process.exit(r.exitCode);
    });
  }
}

async function runTailFollow(argv: string[], deps: ObserveDeps): Promise<void> {
  const parsed = parseObserveArgs(argv);
  if (parsed.kind !== "ok") {
    process.stderr.write(parsed.message + "\n");
    process.exit(1);
  }
  const target = resolveTarget(parsed.env, deps.env);
  if (target.kind === "error") {
    process.stderr.write(target.message + "\n");
    process.exit(1);
  }
  const seen = new Set<string>();
  let high: { occurredAt: string; id: string } | null = null;
  const intervalMs = parsed.interval * 1000;
  // First poll prints the most-recent `limit` rows as the baseline (default 20 for tail);
  // thereafter only genuinely-new rows (Codex whole-diff finding — was printing the full page).
  const baseline = clampLimit(parsed.limit, 20);
  let first = true;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const r = await deps.queryEvents(parsed.eventFilters);
    if (r.kind === "infra_error") {
      process.stderr.write(`[tail] ${r.message}\n`);
    } else {
      const chrono = [...r.events].reverse();
      const rows = first ? chrono.slice(-baseline) : chrono;
      for (const e of rows) {
        if (seen.has(e.id)) continue;
        const newer =
          !high ||
          e.occurredAt > high.occurredAt ||
          (e.occurredAt === high.occurredAt && e.id > high.id);
        if (first || newer) {
          process.stdout.write(
            parsed.json ? formatEventLineNdjson(e) : formatEvents([e], false) + "\n",
          );
          seen.add(e.id);
          if (seen.size > 1000) seen.delete(seen.values().next().value as string);
          high = { occurredAt: e.occurredAt, id: e.id };
        }
      }
    }
    first = false;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
