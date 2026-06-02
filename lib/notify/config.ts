import { resolveSiteOrigin } from "@/lib/notify/siteOrigin";

export type ConfigResult = { ok: true; origin: string } | { ok: false };

export function configValid(env = process.env): ConfigResult {
  if (!env.RESEND_API_KEY?.trim()) return { ok: false };
  if (!env.EMAIL_FROM?.trim()) return { ok: false };
  const origin = resolveSiteOrigin(env.NEXT_PUBLIC_SITE_ORIGIN);
  if (!origin.ok) return { ok: false };
  return { ok: true, origin: origin.origin };
}
