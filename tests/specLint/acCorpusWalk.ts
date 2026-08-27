import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PLANS = "docs/superpowers/plans";
const ENROLLED = /<!-- tasks: depth=/;

/** Every `.md` under the plans tree, recursively. */
export function walkPlans(dir: string = PLANS): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walkPlans(p));
    else if (p.endsWith(".md")) out.push(p);
  }
  return out;
}

/**
 * The enrolled plans, sorted. Shared by both corpus tests so the two cannot walk
 * different corpora and disagree about what "every enrolled plan" means.
 */
export function enrolledPlans(): string[] {
  return walkPlans()
    .filter((f) => ENROLLED.test(readFileSync(f, "utf8")))
    .sort();
}
