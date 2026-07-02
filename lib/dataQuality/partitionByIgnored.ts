import type { ParseWarning } from "@/lib/parser/types";
import { warningFingerprint } from "./warningFingerprint";

export function partitionByIgnored(
  warnings: readonly ParseWarning[],
  ignoredFps: ReadonlySet<string>,
): { active: ParseWarning[]; ignored: ParseWarning[] } {
  const active: ParseWarning[] = [];
  const ignored: ParseWarning[] = [];
  for (const w of warnings) {
    const fp = warningFingerprint(w);
    if (fp !== null && ignoredFps.has(fp)) ignored.push(w);
    else active.push(w);
  }
  return { active, ignored };
}
