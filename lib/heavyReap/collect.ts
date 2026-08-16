import { execFileSync } from "node:child_process";
import type { ProcRow } from "./classify";

/** AC-8: every subprocess this tool runs is bounded, so `;` in the heavy script cannot hang. */
export const PS_TIMEOUT_MS = 10_000;

/** Test seam only; production reads plain `ps` from PATH. */
export const psBinFromEnv = (env: NodeJS.ProcessEnv = process.env): string =>
  env.FX_REAP_PS_BIN ?? "ps";

export type CollectResult =
  | { ok: true; rows: ProcRow[] }
  | { ok: false; problem: "ps-unavailable" | "ps-failed" | "ps-timeout"; detail: string };

/** `[[D-]HH:]MM:SS`, ps(1)'s elapsed-time forms. Null when it is none of them. */
export function parseEtime(raw: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(raw.trim());
  if (m === null) return null;
  const [, d, h, mm, ss] = m;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0);
}

/**
 * `ps -o lstart=`'s shape under the C locale: `Sun Aug 16 09:35:23 2026`, five tokens.
 *
 * `lstart` is strftime's `%c`, which is LOCALE-DEPENDENT, so the five-token shape belongs to the
 * locale and not to `ps` - `LC_ALL=zh_CN.UTF-8` yields four tokens on this machine. Every `ps`
 * here is invoked with `LC_ALL=C` for that reason; this check is the guard that the pin worked,
 * and a row that fails it declines under R1 rather than being parsed at a shifted offset.
 */
const LSTART = /^[A-Z][a-z]{2} [A-Z][a-z]{2} +\d{1,2} \d{2}:\d{2}:\d{2} \d{4}$/;

export function parsePsOutput(text: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const parts = line.trim().split(/\s+/);
    const [rawPid, rawPpid, rawEtime] = parts;
    const pid = Number(rawPid);
    if (rawPid === undefined || !Number.isInteger(pid)) {
      rows.push({ kind: "unparsable", raw: line, problem: "no numeric pid" });
      continue;
    }
    const ppid = Number(rawPpid);
    // `lstart` occupies a FIXED five-token window before the command. That is why it is requested
    // before `command` rather than after: its value contains spaces, and only a known offset makes
    // it parseable without quoting. Probed over 400 live rows with zero failures.
    const lstart = parts.slice(3, 8).join(" ");
    if (!LSTART.test(lstart)) {
      // The layout is UNKNOWN, not merely missing a field: `lstart` is five tokens wide, so if it
      // does not validate we cannot say where `command` begins. Emitting a parsed row would put a
      // date fragment in `command`, where it silently becomes `argv[0]` and the row declines as
      // not-a-worker - the right verdict for the wrong reason (round 14). Under the LC_ALL=C pin
      // this should never occur, which is exactly why it is worth reporting when it does.
      rows.push({
        kind: "unparsable",
        raw: line,
        problem: "lstart did not parse; row layout unknown",
      });
      continue;
    }
    rows.push({
      kind: "parsed",
      pid,
      ppid: rawPpid !== undefined && Number.isInteger(ppid) ? ppid : null,
      etimeSeconds: rawEtime === undefined ? null : parseEtime(rawEtime),
      startedAt: lstart,
      command: parts.slice(8).join(" "),
    });
  }
  return rows;
}

export function collect(psBin: string = psBinFromEnv()): CollectResult {
  let text: string;
  try {
    text = execFileSync(psBin, ["-eo", "pid=,ppid=,etime=,lstart=,command="], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: PS_TIMEOUT_MS,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string; signal?: string | null };
    if (err.code === "ETIMEDOUT" || err.signal === "SIGTERM") {
      return { ok: false, problem: "ps-timeout", detail: `ps exceeded ${PS_TIMEOUT_MS}ms` };
    }
    return {
      ok: false,
      problem: err.code === "ENOENT" ? "ps-unavailable" : "ps-failed",
      detail: err.message ?? String(err.status ?? "unknown"),
    };
  }
  return { ok: true, rows: parsePsOutput(text) };
}
