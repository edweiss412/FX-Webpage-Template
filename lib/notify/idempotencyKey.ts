import { createHash, randomUUID } from "node:crypto";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export function baseKey(kind: string, dedupKey: string, recipient: string): string {
  return `fxav:${kind}:${sha(`${kind}:${dedupKey}:${recipient}`)}`;
}

/** Per-SUBMISSION nonce — a fresh value each call; NEVER derived from attempt_count (§3.2). */
export function reissueKey(kind: string, dedupKey: string, recipient: string): string {
  return `fxav:${kind}:${sha(`${kind}:${dedupKey}:${recipient}:r:${randomUUID()}`)}`;
}
