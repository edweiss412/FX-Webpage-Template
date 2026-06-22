export const SOURCE_LINK_ALLOWLIST = ["INFO", "AGENDA", "GEAR", "TRAVEL", "PULL SHEET"] as const;
export type AllowedTabTitle = (typeof SOURCE_LINK_ALLOWLIST)[number];
export type SourceAnchor = { title: string; gid: number; a1?: string };

function isAllowed(title: string): boolean {
  return (SOURCE_LINK_ALLOWLIST as readonly string[]).includes(title);
}

export function buildSheetDeepLink(
  driveFileId: string | null | undefined,
  anchor?: SourceAnchor | null,
): string | null {
  if (!driveFileId) return null; // null OR empty string → omit
  const base = `https://docs.google.com/spreadsheets/d/${driveFileId}/edit`;
  if (!anchor || !isAllowed(anchor.title) || typeof anchor.gid !== "number") return base;
  let url = `${base}#gid=${anchor.gid}`; // gid===0 emitted literally
  if (anchor.a1) url += `&range=${encodeURIComponent(anchor.a1)}`;
  return url;
}
