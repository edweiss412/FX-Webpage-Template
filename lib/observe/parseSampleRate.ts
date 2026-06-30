// Clamp a Sentry sample-rate env value into [0,1]; any malformed input → 0 (errors-only).
export function parseSampleRate(raw: string | undefined): number {
  if (raw == null || raw.trim() === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 1 ? 1 : n;
}
