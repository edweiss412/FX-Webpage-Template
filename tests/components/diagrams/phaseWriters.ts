/**
 * One brace-matching extractor over the retry-phase setter, shared by every
 * suite that reasons about the writer set.
 *
 * It lived inside retryWriterSetPin.test.ts until the transition audit needed
 * the same walk to decide §8's unreachable rows. A second copy would have been
 * the exact failure gallery.transitions.test.tsx already records against
 * itself: a recognizer over source text is only as durable as the spelling it
 * was written against, and two copies drift apart at the first rename while
 * both keep reporting clean.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

/**
 * The setter this arc converted to a Map. Named once: every assertion in every
 * consuming suite keys on it, and a rename that missed one would pass silently.
 */
export const PHASE_SETTER = "setRetryPhase";

/** Both retry regions. The phase machine is shared, so the walk is too. */
export const PHASE_COMPONENTS = [
  "components/diagrams/Gallery.tsx",
  "components/diagrams/GalleryLightbox.tsx",
] as const;

export type Writer = { file: string; line: number; body: string };

/** Every `setRetryPhase((prev) => { ... })` call in one file, with its body. */
export function phaseWriters(file: string): Writer[] {
  const src = readFileSync(join(ROOT, file), "utf8");
  const out: Writer[] = [];
  const opener = new RegExp(`${PHASE_SETTER}\\(\\s*\\(prev\\)\\s*=>`, "g");
  for (const m of src.matchAll(opener)) {
    const start = m.index ?? 0;
    // Brace-match forward from the arrow so a nested object or closure inside the
    // updater cannot truncate the body. A regex terminator cannot do this, and a
    // truncated body would silently exempt whatever sits past the cut.
    const braceAt = src.indexOf("{", start + m[0].length - 1);
    let depth = 0;
    let end = braceAt;
    for (let i = braceAt; i < src.length; i += 1) {
      if (src[i] === "{") depth += 1;
      else if (src[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    out.push({
      file,
      line: src.slice(0, start).split("\n").length,
      body: src.slice(braceAt, end + 1),
    });
  }
  return out;
}

/**
 * The phase literals one writer body WRITES, in source order.
 *
 * Keyed on `next.set(`, so a body that merely reads a phase in a guard does not
 * count as writing it. That distinction is the whole content of §8's
 * unreachable rows: `restarting` is guarded on in two places and written in
 * one, and a recognizer that could not tell those apart would report two
 * entries into a state that has one.
 */
export function phasesWritten(body: string): string[] {
  return [...body.matchAll(/next\.set\([^,]+,\s*"([a-z-]+)"\s*\)/g)].map((m) => m[1] as string);
}

/** The phase literals one writer body READS in a guard, deduplicated. */
export function phasesGuardedOn(body: string): string[] {
  const seen = new Set<string>();
  for (const m of body.matchAll(/[=!]==\s*"([a-z-]+)"/g)) seen.add(m[1] as string);
  return [...seen];
}
