/**
 * AC-15: no swap moved layout.
 *
 * The comparison is per ELEMENT, through the scanner, and NOT per source
 * occurrence: `components/admin/telemetry/EventFilters.tsx` carries three
 * `border` occurrences before the sweep (a dead fallback plus two call sites)
 * and one after, while the rendered element carries exactly one either way.
 *
 * The key is an ORDINAL, not a line. The sweep adds a `cn` import to that same
 * file, which shifts every element below it, and a line-keyed comparison would
 * report the correct repair as `<absent>` on both of its targets.
 *
 * Usage: `capture` before the repairs, `compare` after.
 */
import { readFileSync, writeFileSync } from "node:fs";
import {
  allStrings,
  scanInteractiveElements,
  type ScanOptions,
} from "../tests/styles/interactiveScanCore";

const WIDTH = /^(?:border|border-[tblrxy]|border-\d+|border-[tblrxy]-\d+)$/;
const WIDENED: ScanOptions = { textEntry: true, paintedChildren: true };

export function widthsByElement(root: string, opts: ScanOptions = WIDENED): Record<string, string> {
  const out: Record<string, string> = {};
  const seen = new Map<string, number>();
  for (const el of scanInteractiveElements(root, opts)) {
    const stem = `${el.file}:${el.tag}`;
    const n = seen.get(stem) ?? 0;
    seen.set(stem, n + 1);
    out[`${stem}#${n}`] = allStrings(el)
      .flatMap((s) => s.split(/\s+/))
      // The variant prefix is stripped deliberately: `max-sm:border` is a width
      // on a responsive skin and is compared like any other, which is what
      // `components/admin/ReSyncButton.tsx`'s mobile skin needs.
      .filter((t) => WIDTH.test(t.replace(/^[^:]*:/, "")))
      .sort()
      .join(" ");
  }
  return out;
}

export function compare(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(before)
    .filter((k) => (before[k] ?? "<absent>") !== (after[k] ?? "<absent>"))
    .map((k) => `${k}: before=[${before[k]}] after=[${after[k] ?? "<absent>"}]`);
}

const snapshot = process.argv[3] ?? "/tmp/ac15-widths.json";
if (process.argv[2] === "capture") {
  writeFileSync(snapshot, JSON.stringify(widthsByElement(process.cwd())));
  console.log(`captured ${Object.keys(widthsByElement(process.cwd())).length} elements`);
} else {
  const before = JSON.parse(readFileSync(snapshot, "utf8")) as Record<string, string>;
  const diffs = compare(before, widthsByElement(process.cwd()));
  console.log(`targets=${Object.keys(before).length} differences=${diffs.length}`);
  for (const d of diffs) console.log(`  ${d}`);
  if (diffs.length > 0) process.exitCode = 1;
}
