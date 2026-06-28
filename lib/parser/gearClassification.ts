/**
 * Closed-vocabulary gear classification (spec §3.2 / D3).
 *
 * The GEAR date-grid lists equipment line-items grouped under "package" headers
 * (SOUND SYSTEM PACKAGE / STAGE LIGHTING PACKAGE / (LED) UPLIGHTING PACKAGE). We
 * classify each item into one of five disciplines using a CLOSED allow-list per
 * discipline (audio / video / lighting / scenic), with the active package bucket
 * as a FALLBACK only for items no allow-list recognizes, and "other" as the final
 * catch-all. No open-ended prose heuristics — every classification keyword is a
 * registered, collision-checked literal (see tests/parser/gearClassificationRegistry).
 */

export type GearDiscipline = "audio" | "video" | "lighting" | "scenic" | "other";

const AUDIO = [
  "SPEAKER",
  "CONSOLE",
  "MIXER",
  "SOUND SYSTEM",
  "MICROPHONE",
  "MIC",
  "SNAKE",
  "ANTENNA",
  "QU32",
  "QU24",
  "QU16",
  "AB168",
  "KLA",
  "K8",
  "K10",
  "GOOSNECK",
  "GOOSENECK",
  "AUDIO",
];
const VIDEO = [
  "PROJECTOR",
  "SCREEN",
  "MONITOR",
  "SWITCHER",
  "LAPTOP",
  "CAMERA",
  "EIKI",
  "BARCO",
  "POINTER",
  "MATRIX",
  "COUNTDOWN CLOCK",
  "CONFIDENCE MONITOR",
  "DLP",
];
const LIGHTING = [
  "LEKO",
  "UPLIGHT",
  "LED BAR",
  "DMX",
  "LIGHTRONICS",
  "LIGHTING",
  "BLIZZARD",
  "ROCKVILLE",
];
const SCENIC = ["SPANDEX", "LOGO", "BRANDING", "BACKDROP", "SCENIC", "TRUSS PODIUM", "PODIUM"];
const ALLOW: ReadonlyArray<[Exclude<GearDiscipline, "other">, readonly string[]]> = [
  ["audio", AUDIO],
  ["video", VIDEO],
  ["lighting", LIGHTING],
  ["scenic", SCENIC],
];

export function gearBucketFor(text: string): "audio" | "lighting" | null {
  if (/SOUND SYSTEM/i.test(text)) return "audio";
  if (/STAGE LIGHTING/i.test(text) || /UPLIGHTING/i.test(text)) return "lighting";
  return null;
}

// Grouping-only = a recognized bucket-setter that ALSO ends in PACKAGE (structural
// header, not emitted). NOT a blanket /PACKAGE$/ — ZOOM LAPTOP PACKAGE / PTZ CAMERA
// PACKAGE are real gear (gearBucketFor === null) and must be emitted (R5-HIGH).
export function isGroupingOnly(text: string): boolean {
  return gearBucketFor(text) !== null && /PACKAGE\s*$/i.test(text.trim());
}

export function classifyGearItem(
  text: string,
  activeBucket: "audio" | "lighting" | null,
): GearDiscipline {
  const u = text.toUpperCase();
  for (const [disc, kws] of ALLOW) if (kws.some((k) => u.includes(k))) return disc;
  return activeBucket ?? "other";
}

export const SENSITIVE_KEY_TOKENS: ReadonlySet<string> = new Set([
  "budget",
  "po",
  "purchase",
  "proposal",
  "invoice",
  "cost",
  "price",
  "quote",
  "estimate",
  "internal",
]);

// Robust permission-boundary guard (R6/R7). toCanonicalKey strips punctuation and
// collapses spaces to "_", so PO appears as po / p_o / po_number / ponumber /
// p_o_number across "PO#", "P.O. Number", "P/O #", "P O Number", "PONumber",
// "P.O.Number". To close ALL of these in ONE place: (1) MERGE consecutive
// single-char tokens (p,o -> po) so separated variants collapse; (2) match each
// token against the multi-char roots OR a PO-word regex that requires a real word
// boundary (so podium/polling/power/position/report do NOT over-match).
export function isSensitiveCanonicalKey(key: string): boolean {
  const merged: string[] = [];
  for (const t of key.toLowerCase().split("_")) {
    const prev = merged[merged.length - 1];
    if (t.length === 1 && prev !== undefined && prev.length <= 1)
      merged[merged.length - 1] = prev + t;
    else merged.push(t);
  }
  return merged.some((t) => SENSITIVE_KEY_TOKENS.has(t) || /^po(num(ber)?|s)?$/.test(t));
}

// Exposed for the collision tripwire:
export const __ALLOW_LISTS__ = {
  audio: AUDIO,
  video: VIDEO,
  lighting: LIGHTING,
  scenic: SCENIC,
} as const;
