// scripts/observe/env.ts
function isLoopback(url: string | undefined): boolean {
  if (!url) return true; // unset → local default
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url);
}

export type TargetResult =
  | { kind: "ok"; envName: "local" | "validation" | "prod" }
  | { kind: "error"; message: string };

export function resolveTarget(
  env: string | undefined,
  ambient: Record<string, string | undefined> = process.env,
): TargetResult {
  const name = env ?? "local";
  const url = ambient.SUPABASE_URL;
  const hasKey = Boolean(ambient.SUPABASE_SECRET_KEY ?? ambient.SUPABASE_SERVICE_ROLE_KEY);
  if (name === "local") {
    if (!isLoopback(url)) {
      return {
        kind: "error",
        message:
          "refusing non-local SUPABASE_URL; pass --env validation|prod to confirm a remote target",
      };
    }
    return { kind: "ok", envName: "local" };
  }
  if (name === "validation" || name === "prod") {
    if (isLoopback(url)) {
      return { kind: "error", message: `--env ${name} requires a non-local SUPABASE_URL` };
    }
    if (!hasKey) {
      return {
        kind: "error",
        message: `--env ${name} requires SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)`,
      };
    }
    return { kind: "ok", envName: name };
  }
  return { kind: "error", message: `unknown --env "${name}"; expected local|validation|prod` };
}
