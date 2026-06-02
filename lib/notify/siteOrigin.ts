export type SiteOriginResult = { ok: true; origin: string } | { ok: false };

/** Validated canonical origin for ABSOLUTE email links (§5.4). NEVER the localhost dev fallback. */
export function resolveSiteOrigin(
  raw: string | undefined = process.env.NEXT_PUBLIC_SITE_ORIGIN,
): SiteOriginResult {
  if (!raw || !raw.trim()) return { ok: false };

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false };
  if (!url.host) return { ok: false };
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return { ok: false };

  return { ok: true, origin: url.origin };
}
