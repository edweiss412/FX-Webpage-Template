/**
 * lib/dev/materialize/env.ts
 * (spec 2026-07-20-attention-scenario-gallery §5.5)
 *
 * The materialize target gate: the only thing between a dev instrument that
 * writes synthetic alerts and a database nobody meant to write to. Pure — it
 * takes the environment as input rather than reading `process.env` — so every
 * refusal path is testable without mutating global state.
 *
 * Two rules carry the weight:
 *
 *   1. `local` means LOOPBACK, verified by parsing the URL and comparing its
 *      hostname. A substring check would accept `http://127.0.0.1.evil.test`.
 *   2. `validation` identity is DERIVED from the URL that will actually be
 *      connected to, never from the declared VALIDATION_SUPABASE_PROJECT_REF.
 *      A caller who set the ref correctly while pointing the URL elsewhere
 *      would otherwise be waved through to an unauthorized project. The
 *      declared ref still has to AGREE — a disagreement is its own refusal, so
 *      an internally inconsistent env is diagnosed rather than silently
 *      half-honored.
 *
 * Every refusal is a named code, not a boolean: "refused" without a reason
 * sends the operator env-var spelunking.
 */
import { projectRefFromUrl, VALIDATION_PROJECT_REF } from "@/lib/admin/validationDeployment";

export type TargetEnv = "local" | "validation";

export type EnvInput = {
  target: TargetEnv;
  /** Validation only: the operator explicitly acknowledged a remote write. */
  confirmed: boolean;
  localUrl: string | undefined;
  localKey: string | undefined;
  validationUrl: string | undefined;
  validationKey: string | undefined;
  validationRef: string | undefined;
};

export type RefusalCode =
  | "local_not_loopback"
  | "local_url_missing"
  | "local_key_missing"
  | "validation_unconfirmed"
  | "validation_triple_incomplete"
  | "validation_ref_mismatch"
  | "validation_ref_disagrees"
  | "unknown_target";

export type EnvResolution =
  | { kind: "ok"; url: string; key: string; target: TargetEnv }
  | { kind: "refused"; reason: RefusalCode };

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Hostname equality, never substring: `127.0.0.1.evil.test` is not loopback. */
function isLoopback(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Scheme is checked too: `ftp://localhost` and `file://localhost/...` parse
    // with a loopback hostname but make Supabase throw SYNCHRONOUSLY at client
    // construction, which is outside the caller's try and would escape the
    // promised MaterializeResult instead of returning a refusal.
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    return LOOPBACK_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

function present(v: string | undefined): v is string {
  return typeof v === "string" && v.length > 0;
}

export function resolveTarget(input: EnvInput): EnvResolution {
  if (input.target === "local") {
    if (!present(input.localUrl)) return { kind: "refused", reason: "local_url_missing" };
    if (!isLoopback(input.localUrl)) return { kind: "refused", reason: "local_not_loopback" };
    if (!present(input.localKey)) return { kind: "refused", reason: "local_key_missing" };
    return { kind: "ok", url: input.localUrl, key: input.localKey, target: "local" };
  }

  if (input.target === "validation") {
    // Consent is checked FIRST, before the triple: an operator who has not
    // confirmed should be told to confirm, not sent to debug an env var they
    // never got far enough to use.
    // Runtime-EXACT, not merely truthy. The two core actions are independently
    // exported server actions, so a caller can pass `"false"` or `1` past the
    // TypeScript signature; only `true` may authorize a remote write.
    if (input.confirmed !== true) return { kind: "refused", reason: "validation_unconfirmed" };
    if (
      !present(input.validationUrl) ||
      !present(input.validationKey) ||
      !present(input.validationRef)
    ) {
      return { kind: "refused", reason: "validation_triple_incomplete" };
    }
    // Derived identity wins. A null derived ref (unparseable URL, wrong host
    // shape) can never equal the constant, so this is fail-closed by default.
    const derived = projectRefFromUrl(input.validationUrl);
    if (derived !== VALIDATION_PROJECT_REF) {
      return { kind: "refused", reason: "validation_ref_mismatch" };
    }
    if (input.validationRef !== derived) {
      return { kind: "refused", reason: "validation_ref_disagrees" };
    }
    return { kind: "ok", url: input.validationUrl, key: input.validationKey, target: "validation" };
  }

  return { kind: "refused", reason: "unknown_target" };
}
