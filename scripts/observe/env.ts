// scripts/observe/env.ts
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "../lib/validation-target";

function isLoopback(url: string | undefined): boolean {
  if (!url) return true; // unset → local default
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/i.test(url);
}

export type TargetResult =
  | { kind: "ok"; envName: "local" | "validation" | "prod"; url?: string; key?: string }
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
  if (name === "validation") {
    const vUrl = ambient.VALIDATION_SUPABASE_URL;
    const vKey = ambient.VALIDATION_SUPABASE_SECRET_KEY;
    if (!vUrl || isLoopback(vUrl) || !vKey) {
      return {
        kind: "error",
        message:
          "--env validation requires VALIDATION_SUPABASE_URL (hosted https) + VALIDATION_SUPABASE_SECRET_KEY (+ matching VALIDATION_SUPABASE_PROJECT_REF) in .env.local; use --env prod for an explicit ambient remote target",
      };
    }
    try {
      assertProdEquivalentTarget(vUrl, false);
      assertSupabaseTargetMatchesProjectRef(vUrl, ambient.VALIDATION_SUPABASE_PROJECT_REF, false);
    } catch (e) {
      return {
        kind: "error",
        message: e instanceof Error ? e.message : "validation target binding failed",
      };
    }
    return { kind: "ok", envName: "validation", url: vUrl, key: vKey };
  }
  if (name === "prod") {
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

export function applyResolvedTarget(
  target: TargetResult,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (target.kind !== "ok" || !target.url || !target.key) return;
  env.SUPABASE_URL = target.url;
  env.SUPABASE_SECRET_KEY = target.key;
}
