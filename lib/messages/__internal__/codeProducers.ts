import { readFileSync } from "node:fs";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { stripLogEmissionCalls } from "@/lib/messages/__internal__/stripLogEmissionCalls";

// Shared §12.4 producer scan — the single source of truth used by BOTH the x1
// catalog-parity test (tests/cross-cutting/codes.test.ts) and the admin-outcome
// scanner-safety guard (tests/log/_metaAdminOutcomeContract.test.ts), so the two
// cannot drift. A "producer" is a quoted SHOUTY_SNAKE_CASE value assigned to a
// `code` property. `log.*` / `logAdminOutcome(...)` emission spans are stripped
// first (stripLogEmissionCalls) — their codes are free-form forensic app_events
// codes, NOT §12.4-gated user-facing producers.
export const ACTIVE_PRODUCER_ROOTS = ["app", "lib"] as const;
export const PRODUCER_RE = /\bcode:\s*["'`]([A-Z][A-Za-z0-9_-]*(?:_[A-Za-z0-9_-]+)+)["'`]/g;

export function codeProducerLiterals(): Set<string> {
  const codes = new Set<string>();
  for (const file of walkSourceFiles(ACTIVE_PRODUCER_ROOTS)) {
    if (file === "lib/messages/catalog.ts" || file.startsWith("lib/messages/__generated__/")) {
      continue;
    }
    const source = stripLogEmissionCalls(readFileSync(file, "utf8"));
    for (const match of source.matchAll(PRODUCER_RE)) {
      if (match[1]) codes.add(match[1]);
    }
  }
  return codes;
}
