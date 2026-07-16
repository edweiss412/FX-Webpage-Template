import { createHash, randomUUID } from "node:crypto";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function baseKey(kind: string, dedupKey: string, recipient: string): string {
  return `fxav:${kind}:${sha(`${kind}:${dedupKey}:${recipient}`)}`;
}

/** Per-SUBMISSION nonce — a fresh value each call; NEVER derived from attempt_count (§3.2). */
export function reissueKey(kind: string, dedupKey: string, recipient: string): string {
  return `fxav:${kind}:${sha(`${kind}:${dedupKey}:${recipient}:r:${randomUUID()}`)}`;
}

/** Batch membership identity (batching spec §2.2): sorted member dedup keys joined
 * with "|" (no member key can contain "|"). A single member is the identity, so an
 * N=1 batch's provider key is byte-identical to the historical per-candidate key. */
export function combinedDedupKey(dedupKeys: string[]): string {
  return [...dedupKeys].sort().join("|");
}
