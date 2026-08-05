// BL-CODE-ENUM-PROVENANCE-COMMENT-BLIND — a doc comment rewrites generated
// provenance.
//
// `extract-internal-code-enums` decides whether a file's codes claim
// `admin_alerts.code` provenance by regexing the RAW source for
// `admin_alerts` / `upsertAdminAlert`. That test cannot tell code from prose, so
// a comment that merely NAMES the writer — explaining why an emit does NOT
// belong at some point, which is exactly the comment the apply/undo branch
// added — flips provenance for EVERY code in that file. Six §12.4 codes widened
// to claim `admin_alerts.code` on one regeneration without any of them gaining a
// write site.
//
// It was benign as shipped (no consumer keys on that field), and that is the
// reason to fix it rather than to shrug: a generated artifact's provenance field
// that prose can rewrite cannot be used as evidence of a write site, and the
// next person to rely on it will not know that.
//
// ANTI-TAUTOLOGY. The fixture whose only mention is in a comment is the whole
// point — a predicate that just got narrower in some unrelated way would still
// pass a "real call is detected" check. Both directions are pinned: prose must
// NOT claim provenance, and every real call shape still must. The string-literal
// case is included because the Work section asks for literals too, and a
// recognizer that stripped only comments would pass every comment case while
// leaving the same hole one quote-mark away.
import { describe, expect, it } from "vitest";

import { claimsAdminAlertProvenance } from "@/scripts/extract-internal-code-enums";

describe("provenance is decided by code, not by prose", () => {
  it("a comment naming the writer does NOT claim provenance", () => {
    // The exact shape that caused the incident: a comment explaining why an
    // emit does not belong here.
    const src = [
      "// This is POST-COMMIT and deliberately does not call upsertAdminAlert —",
      "// the outer transaction still holds the lock at this point.",
      'const code = "SOME_CODE";',
    ].join("\n");
    expect(claimsAdminAlertProvenance(src)).toBe(false);
  });

  it("a block comment and a JSDoc naming it are equally inert", () => {
    expect(claimsAdminAlertProvenance("/* see upsertAdminAlert */\nconst a = 1;")).toBe(false);
    expect(claimsAdminAlertProvenance("/** admin_alerts provenance note */\nconst a = 1;")).toBe(
      false,
    );
  });

  it("a mention inside a string literal DOES still claim — a documented limit", () => {
    // The entry's Work section asked for literals to be stripped too. That was
    // tried and reverted: a literal is often the write site itself
    // (`sb.from("admin_alerts")`), so blanking literals blinds the scan to two of
    // the four real call shapes below. Pinned as the limit it is, rather than
    // left as an unstated gap — it is strictly narrower than the comment case
    // that caused the incident, and separating a table reference from a sentence
    // is not something stripping can do.
    expect(claimsAdminAlertProvenance('const msg = "call upsertAdminAlert here";')).toBe(true);
  });

  it("a REAL call still claims provenance — every shape the scan relies on", () => {
    expect(claimsAdminAlertProvenance("await upsertAdminAlert({ code: 'X' });")).toBe(true);
    expect(claimsAdminAlertProvenance("import { upsertAdminAlert } from '@/lib/x';")).toBe(true);
    // The table name reached through a Supabase builder, not the helper.
    expect(claimsAdminAlertProvenance('await sb.from("admin_alerts").insert(row);')).toBe(true);
    // The RPC spelling.
    expect(claimsAdminAlertProvenance('await sb.rpc("upsert_admin_alert", args);')).toBe(true);
  });

  it("a real call SURVIVES a comment that also names it", () => {
    // The mixed file is the case a naive "strip then test" gets right and a
    // naive "if any comment mentions it, ignore the file" gets catastrophically
    // wrong — that would drop provenance from files that genuinely write.
    const src = [
      "// upsertAdminAlert is called below for the infra-fault path.",
      "await upsertAdminAlert({ code: 'Y' });",
    ].join("\n");
    expect(claimsAdminAlertProvenance(src)).toBe(true);
  });
});
