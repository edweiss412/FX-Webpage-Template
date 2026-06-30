// Phase 4 Task 6 spot-checks: pin the non-trivial server-migration decisions (source convention,
// Error→reserved field, bracket-strip, console.log→log.info) at the source level. The exhaustive
// "no stray console" guarantee is in tests/cross-cutting/no-console-exemptions.test.ts; these pin
// that the migrated CALLS carry the right source + shape (a mechanical-transform contract check).
import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("server console.* → lib/log migration (spot)", () => {
  test("(a) api.admin.sync — log.error with source + Error in the reserved `error` field (not console)", () => {
    const src = read("app/api/admin/sync/[slug]/route.ts");
    expect(src).not.toMatch(/console\.(error|warn|log)\(/);
    expect(src).toContain("import { log }");
    expect(src).toMatch(/log\.error\(/);
    expect(src).toContain('source: "api.admin.sync"');
    // the caught error flows via the reserved `error` field (lib/log serializes it), not concatenated
    expect(src).toMatch(/error:\s*\w+/);
  });

  test("(b) agenda.extract — source set + the [agenda-extract] bracket prefix stripped from messages", () => {
    const src = read("lib/agenda/extractAgendaSchedule.ts");
    expect(src).not.toMatch(/console\.(error|warn|log)\(/);
    expect(src).toContain('source: "agenda.extract"');
    // the bracket prefix is now the source, not the message text
    expect(src).not.toContain("[agenda-extract]");
  });

  test("(c) sync.enrichAgenda — console.log → log.info with source", () => {
    const src = read("lib/sync/enrichAgenda.ts");
    expect(src).not.toMatch(/console\.(error|warn|log)\(/);
    expect(src).toMatch(/log\.info\(/);
    expect(src).toContain('source: "sync.enrichAgenda"');
  });
});
