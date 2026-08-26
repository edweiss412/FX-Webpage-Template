// Live-corpus scan time and finding-set digest for ONE scanner module.
//
// `SCAN_MODULE=<path>` selects the module (default: the shipped scan.ts). The
// digest serialisation is the AC-5 one from the 2026-08-21 baseline-corpus probe,
// so the number printed here is comparable to the pinned
// 8ebe8b08d43e6308aa471112d9f086d0118e6238. Prints wall AND cpu (user+sys) per
// run and the medians: cpu is the figure to compare across runs on a machine
// whose heavy-slot queue is contended, wall is what a human waits for.
//
// `--runs N` (default 3). `--max-cpu-ratio R --baseline-cpu-ms B` turns it into a
// GATE: exit 1 when median cpu > R * B.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = resolve(import.meta.dirname, "../../../../../..");
const argv = process.argv.slice(2);
const flag = (name: string): string | null => {
  const at = argv.indexOf(name);
  return at === -1 ? null : (argv[at + 1] ?? null);
};
const runs = Number(flag("--runs") ?? 3);
const maxRatio = flag("--max-cpu-ratio");
const baselineCpu = flag("--baseline-cpu-ms");
/**
 * Measure the MERGE-BASE scanner in this same process and use it as the
 * baseline, instead of taking a number on the command line.
 *
 * Plan review round 1 finding 1: a `--baseline-cpu-ms <n>` gate cannot be a
 * red-then-green marker, because the GREEN step has to substitute the measured
 * number and that is a DIFFERENT command. With the baseline measured in-process
 * the command text is stable across the cycle, and the two figures come from one
 * session, so heavy-slot contention cancels — which is what AC-6 asks for
 * anyway.
 *
 * Before the repair lands, candidate and merge-base are the same bytes, so the
 * ratio is meaningless: it REFUSES rather than reporting a flattering 1.0.
 */
const fromMergeBase = argv.includes("--baseline-from-merge-base");

const TRACKED = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const modulePath = process.env.SCAN_MODULE ? resolve(process.env.SCAN_MODULE) : join(ROOT, TRACKED);
const { collectPsqlUsage } = (await import(pathToFileURL(modulePath).href)) as {
  collectPsqlUsage: (root: string) => Record<string, unknown>;
};
console.log(`scanner module: ${modulePath}`);
console.log(`root: ${ROOT}`);

const digestOf = (u: Record<string, unknown>): { digest: string; rows: number } => {
  const rows: string[] = [];
  for (const k of Object.keys(u)) {
    const v = u[k];
    if (!Array.isArray(v)) continue;
    for (const e of v as Array<Record<string, unknown>>) {
      const fields = Object.keys(e)
        .sort()
        .map((f) => {
          if (!(f in e)) return `${f}=<absent>`;
          if (e[f] === undefined) return `${f}=<undefined>`;
          return `${f}=${JSON.stringify(e[f])}`;
        })
        .join("\t");
      rows.push(`${k}\t${fields}`);
    }
  }
  rows.sort();
  return { digest: createHash("sha1").update(rows.join("\n") + "\n").digest("hex"), rows: rows.length };
};

/** Median of a sample. Declared before first use by both measurement paths. */
const median = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** Median CPU ms for one scanner module, measured in THIS process. */
const measureCpu = async (path: string, times: number): Promise<number> => {
  const { collectPsqlUsage: collect } = (await import(pathToFileURL(path).href)) as {
    collectPsqlUsage: (root: string) => Record<string, unknown>;
  };
  const samples: number[] = [];
  for (let r = 0; r < times; r++) {
    const cpu0 = process.cpuUsage();
    collect(ROOT);
    const cpu = process.cpuUsage(cpu0);
    samples.push((cpu.user + cpu.system) / 1000);
  }
  return median(samples);
};

let mergeBaseCpu: number | null = null;
if (fromMergeBase) {
  const baseSha = execFileSync("git", ["-C", ROOT, "merge-base", "origin/main", "HEAD"], {
    encoding: "utf8",
  }).trim();
  let baselineSource: string;
  try {
    baselineSource = execFileSync("git", ["-C", ROOT, "show", `${baseSha}:${TRACKED}`], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    console.error(`ABORT: cannot read ${TRACKED} at merge-base ${baseSha}: ${(error as Error).message}`);
    process.exit(2);
  }
  if (readFileSync(modulePath, "utf8") === baselineSource) {
    console.error(
      `FAIL: the candidate is byte-identical to ${TRACKED} at merge-base ${baseSha.slice(0, 12)}, so the ratio would compare the scanner with itself. Measure this AFTER the repair lands.`,
    );
    process.exit(1);
  }
  const dir = join(ROOT, "node_modules/.cache/bracecross-baseline");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `scan.${baseSha.slice(0, 12)}.timing.ts`);
  writeFileSync(path, baselineSource);
  mergeBaseCpu = await measureCpu(path, runs);
  console.log(`merge-base median cpu: ${mergeBaseCpu.toFixed(0)} ms (${baseSha.slice(0, 12)}, same session)`);
}

const walls: number[] = [];
const cpus: number[] = [];
let digest = "";
let rows = 0;
for (let r = 0; r < runs; r++) {
  const cpu0 = process.cpuUsage();
  const t0 = performance.now();
  const usage = collectPsqlUsage(ROOT);
  const wall = performance.now() - t0;
  const cpu = process.cpuUsage(cpu0);
  const cpuMs = (cpu.user + cpu.system) / 1000;
  walls.push(wall);
  cpus.push(cpuMs);
  const d = digestOf(usage);
  if (r === 0) {
    digest = d.digest;
    rows = d.rows;
  } else if (d.digest !== digest) {
    console.error(`ABORT: run ${r + 1} digested ${d.digest}, run 1 digested ${digest} — the scan is not deterministic`);
    process.exit(2);
  }
  console.log(`run ${r + 1}: wall ${wall.toFixed(0)} ms  cpu ${cpuMs.toFixed(0)} ms  sites ${(usage.sites as unknown[]).length} indirections ${(usage.indirections as unknown[]).length} unreadable ${(usage.unreadable as unknown[]).length}`);
}
console.log(`\nTOTAL ROWS: ${rows}`);
console.log(`DIGEST: ${digest}`);
console.log(`MEDIAN WALL MS: ${median(walls).toFixed(0)}`);
console.log(`MEDIAN CPU MS: ${median(cpus).toFixed(0)}`);
if (rows === 0) {
  console.error("ABORT: zero rows — the walk found nothing, so the timing describes nothing");
  process.exit(2);
}
const effectiveBaseline = mergeBaseCpu !== null ? String(mergeBaseCpu) : baselineCpu;
if (maxRatio !== null && effectiveBaseline !== null) {
  const limit = Number(maxRatio) * Number(effectiveBaseline);
  if (median(cpus) > limit) {
    console.error(`FAIL: median cpu ${median(cpus).toFixed(0)} ms exceeds ${maxRatio} x baseline ${Number(effectiveBaseline).toFixed(0)} ms = ${limit.toFixed(0)} ms`);
    process.exit(1);
  }
  console.log(`PASS: median cpu within ${maxRatio} x baseline ${Number(effectiveBaseline).toFixed(0)} ms`);
}
