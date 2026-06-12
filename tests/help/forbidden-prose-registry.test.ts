/**
 * Structural defense — forbidden-prose registry for help MDX + live
 * Doug-facing catalog strings.
 *
 * Class this catches: Doug-facing prose (in help MDX or in the live
 * §12.4 catalog rendered by admin UI controls via getDougFacing) that
 * implies a UI affordance which does NOT exist in shipped code. The
 * R13 sibling test (`backlog-label-annotation.test.ts`) catches LABEL-
 * level drift (e.g., a bolded `**Copy share link**` button name). This
 * registry catches PROSE-level drift — phrasings that don't name a
 * button by label but still tell Doug to perform an action the UI
 * cannot perform.
 *
 * Coverage extended in R17 to scan the §12.4 catalog as well, since
 * R17 surfaced that the `ADMIN_LINK_*` entries' dougFacing / followUp
 * / helpfulContext / longExplanation strings are rendered LIVE by
 * the retired signed-link controls through getDougFacing.
 * Per AGENTS.md, class-sweep + structural defense at the same time:
 * the registry now treats catalog string fields as in-scope surfaces.
 *
 * R14 root cause + Codex recommendation (2026-05-23): "Add a structural
 * grep/registry guard for copy-link and preview-links prose across all
 * help MDX, not just labels in UI_LABEL_EXCEPTIONS." This test is that
 * guard. Each entry pins a known-phantom phrasing surfaced by adversarial
 * review; future drift gets caught at CI time rather than waiting for the
 * next adversarial round.
 *
 * Convention: a forbidden-phrase entry is added to FORBIDDEN_PROSE only
 * AFTER a reviewer (cross-model adversarial or human) has ratified the
 * phrasing as misleading. Each entry MUST cite the round + the shipped
 * surface that proves the claim is wrong.
 *
 * M12.13 (spec §7 registry-narrowing table): the auto-publish undo now
 * ships on every install (per-show in-app Undo button on the live token
 * window) and via email when `alert_on_auto_publish` is enabled. Two
 * entries move with that delivery: `24-hour-undo-email` RETIRES (its
 * factual basis — "no surface ships" — has ended), and
 * `email-delivery-of-action-link` NARROWS via a per-entry `allow`
 * carve-out so truthful undo-email references pass while phantom claims
 * for OTHER (non-existent) action-link channels still fail.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

const PROJECT_ROOT = resolve(__dirname, "..", "..");
const HELP_ROOT = resolve(PROJECT_ROOT, "app/help");

const CATALOG_CHECKED_FIELDS = [
  "dougFacing",
  "followUp",
  "helpfulContext",
  "longExplanation",
] as const;

type ForbiddenProseEntry = {
  /** Regex that catches the phantom phrasing. Match is case-insensitive by default. */
  pattern: RegExp;
  /** Short identifier for failure messages. */
  id: string;
  /** Why this phrasing is phantom; what shipped surface contradicts it. */
  rationale: string;
  /**
   * Optional carve-out. When the surrounding text matches `allow`, a `pattern`
   * hit is NOT a violation — the phrasing is truthful for a shipped surface.
   * Used to narrow a class entry whose factual basis became partially true
   * (M12.13: the auto-publish undo email now ships, so truthful references to
   * IT must pass while phantom claims for OTHER action links still fail).
   */
  allow?: RegExp;
};

const FORBIDDEN_PROSE: readonly ForbiddenProseEntry[] = [
  {
    id: "copy-each-persons-link",
    pattern: /copy each person['']s link/i,
    rationale:
      "R14 finding 1 (tour.mdx:68). No copy-URL affordance ships in PerShowCrewSection. The retired signed-link controls did not expose a copyable URL. Until a one-tap copy button ships, Doug shares URLs through his usual channel — prose must reflect that.",
  },
  {
    id: "copy-each-crew-members-link",
    pattern: /copy each crew member['']s link/i,
    rationale: "Paraphrase variant of copy-each-persons-link. Same shipped-state reasoning.",
  },
  {
    id: "dashboard-row-action",
    pattern: /(?:via|from|using|through)\s+the\s+dashboard['']?s?\s+row\s+actions?/i,
    rationale:
      "R14 finding 2 (per-show-panel.mdx:19). Dashboard show rows (live ShowsTable, components/admin/ShowsTable.tsx — previously the deleted ActiveShowsPanel) are link + dates + crew count + last-sync status, no in-row actions. Help must point Doug to Drive directly or to the per-show panel — never to a phantom dashboard row action.",
  },
  {
    id: "active-shows-row-actions-column",
    pattern:
      /\b(?:Active\s+shows[^.]{0,120}\bActions\b|\bActions\b\s+column\b)[^.]{0,120}\b(?:Open|Preview as|Re-sync|Archive)\b/i,
    rationale:
      "R13 finding 2 (dashboard.mdx). The dashboard shows table (live ShowsTable — previously the deleted ActiveShowsPanel) does not render an Actions column. Pattern requires the column/Active-shows context so legitimate prose mentioning admin write actions (like FINALIZE_OWNED_SHOW.helpfulContext) does not false-positive.",
  },
  {
    id: "yellow-warnings-badge",
    pattern: /\bYellow\s+warnings?\s+badge\b/i,
    rationale:
      "R13 finding 2 (dashboard.mdx). The live sync column maps last_sync_status through syncStatusBucket (lib/admin/syncStatus.ts) to one dot+label pill per row — there is no separate warnings-count badge in the row. (Same was true of the deleted ActiveShowsPanel's statusGlyph set.)",
  },
  {
    id: "preview-links-list",
    pattern: /\bpreview[- ]links\s+list\b/i,
    rationale:
      "R15 finding 2 (daily-rhythm.mdx + whats-different.mdx). The per-show panel exposes a crew section with Issue/Revoke link controls and a separate Preview-as-a-crew-member admin-impersonation section; there is no copyable preview-links list affordance. Doug issues each link via per-row controls and shares the URL through his usual channel.",
  },
  // RETIRED (M12.13, spec §7 registry-narrowing table): the `24-hour-undo-email`
  // entry banned any "24-hour … undo" / "undo … within 24 hours" phrasing because
  // no delivery surface shipped. That factual basis has ended — the auto-publish
  // undo now ships on EVERY install via the per-show in-app Undo button on the live
  // token window, and via email when `alert_on_auto_publish` is enabled. The promise
  // is true; the ban is deleted. (Truthful undo-email references are additionally
  // carved out of the `email-delivery-of-action-link` class below.)
  {
    id: "confirmation-email",
    pattern: /confirmation\s+email/i,
    rationale:
      "R15 finding 1 corollary. No email-send infrastructure ships in v1 (no sendgrid / resend / nodemailer / SMTP code path). Any 'confirmation email' phrasing implies a delivery channel that does not exist.",
  },
  {
    id: "email-delivery-of-action-link",
    pattern: /\b(?:link|button|URL)\b[^.]{0,40}\b(?:in|from)\s+your\s+email\b/i,
    // M12.13 (spec §7) NARROW: the auto-publish undo email now ships
    // (lib/notify auto_publish_undo template + per-recipient delivery, gated by
    // the `alert_on_auto_publish` toggle), so a truthful reference to the UNDO
    // link in that email is no longer phantom. The carve-out admits only
    // undo/unpublish-scoped phrasings; every OTHER "<link|button|URL> in your
    // email" claim (a confirmation link, a sign-in link, a preview link, …)
    // still has no delivery channel and stays banned. A truthful undo reference
    // passes; a phantom claim for a DIFFERENT action link still fails (proven by
    // the negative-regression below).
    allow:
      /\b(?:undo|unpublish)\b[^.]{0,60}\b(?:link|button|URL)\b[^.]{0,40}\b(?:in|from)\s+your\s+email\b|\b(?:link|button|URL)\b[^.]{0,40}\bto\s+(?:undo|unpublish)\b/i,
    rationale:
      "R18 finding 1 root, NARROWED in M12.13 (spec §7). UNPUBLISH_TOKEN_CONSUMED once claimed 'the unpublish link in your email' as a phantom — but the auto-publish undo email now ships (lib/notify auto_publish_undo + per-recipient delivery, toggle-gated). The class still bans any '<link|button|URL> in/from your email' phrasing for a channel that does NOT ship (confirmation email, sign-in link, preview-link email, …); the `allow` carve-out exempts ONLY undo/unpublish-scoped references, which are now truthful.",
  },
  {
    id: "share-the-url-channel",
    pattern: /share\s+the\s+(?:crew\s+page\s+)?URL\s+(?:through|with)\s+(?:whatever|the\s+crew)/i,
    rationale:
      "R16 finding 1 root + R17 catalog extension. The phantom-affordance class extends to the URL-distribution channel itself: no production action surface exposes a copyable crew URL. Doug literally cannot extract a URL from the shipped UI, so 'share the URL through whatever channel' / 'share the crew page URL with the crew member' is structurally false. Per the M11 user-direction ('describe only what's shipped'), help docs and live §12.4 catalog strings must acknowledge URL distribution runs through a developer-built handoff in v1 until the post-M11 picker model lands.",
  },
  {
    id: "send-each-their-link",
    pattern: /send\s+each\s+(?:crew\s+member\s+)?their\s+(?:link|personal\s+link)\s+from/i,
    rationale:
      "R16 corollary. Same root as share-the-url-channel: 'send each their link from <surface>' implies Doug has a sendable URL extracted from <surface>. He doesn't. Whitelist legitimate paraphrases by adjusting this pattern only after confirming a URL surface ships.",
  },
];

/**
 * A `pattern` hit is a violation UNLESS the same text satisfies the entry's
 * `allow` carve-out (a truthful, shipped reference). Returns the matched text
 * when it is a genuine violation, otherwise `null`.
 */
function violatingMatch(entry: ForbiddenProseEntry, text: string): string | null {
  const m = text.match(entry.pattern);
  if (!m) return null;
  if (entry.allow && entry.allow.test(text)) return null;
  return m[0];
}

function helpMdxFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name.startsWith(".") || ent.name === "node_modules") continue;
        walk(full);
      } else if (ent.isFile() && ent.name.endsWith(".mdx")) {
        out.push(full);
      }
    }
  };
  try {
    statSync(HELP_ROOT);
    walk(HELP_ROOT);
  } catch {
    // help root missing in some snapshots; fine.
  }
  return out;
}

describe("Forbidden-prose registry (R14 structural defense)", () => {
  it("no help MDX file matches a known phantom-affordance phrase", () => {
    const violations: string[] = [];
    for (const file of helpMdxFiles()) {
      const src = readFileSync(file, "utf8");
      for (const entry of FORBIDDEN_PROSE) {
        const hit = violatingMatch(entry, src);
        if (hit) {
          const idx = src.indexOf(hit);
          const lineNum = src.slice(0, idx).split("\n").length;
          violations.push(
            `${relative(PROJECT_ROOT, file)}:${lineNum} matches forbidden pattern "${entry.id}": "${hit}". ` +
              `Rationale: ${entry.rationale}`,
          );
        }
      }
    }
    expect(violations, violations.join("\n  → ")).toEqual([]);
  });

  it("rejects synthetic MDX containing a phantom copy-link claim (negative regression)", () => {
    const synthetic =
      "# Tour\n\nThe sharing tools let you copy each person's link one row at a time.\n";
    const matched = FORBIDDEN_PROSE.find((e) => e.pattern.test(synthetic));
    expect(matched?.id).toBe("copy-each-persons-link");
  });

  it("rejects synthetic MDX claiming a dashboard row action (negative regression)", () => {
    const synthetic =
      "# Per-show panel\n\nOpen the sheet in the same tab via the dashboard's row action, fix it, and re-sync.\n";
    const matched = FORBIDDEN_PROSE.find((e) => e.pattern.test(synthetic));
    expect(matched?.id).toBe("dashboard-row-action");
  });

  it("no live §12.4 catalog string matches a known phantom-affordance phrase (R17 extension)", () => {
    // R17 root: ADMIN_LINK_ISSUED_OK / ADMIN_LINK_REVOKED_OK /
    // ADMIN_LINK_NO_LIVE_LINK carried "share the URL" / "send fresh
    // URL" / "newly-minted JWT" phrasing that the retired signed-link
    // controls rendered LIVE via getDougFacing. The MDX
    // sweep was insufficient. This assertion treats every catalog
    // string field as a forbidden-prose surface.
    const violations: string[] = [];
    for (const [code, entry] of Object.entries(MESSAGE_CATALOG)) {
      for (const field of CATALOG_CHECKED_FIELDS) {
        const value = (entry as Record<string, unknown>)[field];
        if (typeof value !== "string") continue;
        for (const fp of FORBIDDEN_PROSE) {
          const hit = violatingMatch(fp, value);
          if (hit) {
            violations.push(
              `${code}.${field} matches forbidden pattern "${fp.id}": "${hit}". ` +
                `Rationale: ${fp.rationale}`,
            );
          }
        }
      }
    }
    expect(violations, violations.join("\n  → ")).toEqual([]);
  });

  it("rejects a synthetic catalog entry whose followUp invokes the share-the-url phantom (negative regression)", () => {
    const syntheticFollowUp =
      "Doug → share the crew page URL with the crew member via your usual channel";
    const matched = FORBIDDEN_PROSE.find((e) => e.pattern.test(syntheticFollowUp));
    expect(matched?.id).toBe("share-the-url-channel");
  });

  // ── M12.13 registry-narrowing negative pins (spec §7) ────────────────────
  // The `email-delivery-of-action-link` class was NARROWED, not deleted. These
  // pin BOTH required properties: (a) a phantom claim for a DIFFERENT action
  // link still FAILS the registry; (b) a truthful undo-email reference PASSES.

  const emailLinkEntry = () => {
    const entry = FORBIDDEN_PROSE.find((e) => e.id === "email-delivery-of-action-link");
    expect(
      entry,
      "email-delivery-of-action-link entry must still exist (narrowed, not deleted)",
    ).toBeDefined();
    return entry!;
  };

  it("still FAILS a phantom claim for a DIFFERENT (non-undo) action link (negative regression)", () => {
    // A confirmation/sign-in link in your email is still phantom — no such
    // delivery channel ships. The carve-out must NOT swallow it.
    const phantom = "Tap the confirmation link in your email to finish setting up your account";
    expect(violatingMatch(emailLinkEntry(), phantom)).not.toBeNull();
  });

  it("PASSES a truthful reference to the auto-publish undo email (carve-out)", () => {
    // The undo email now ships; a truthful reference to ITS link must not fire.
    const truthful =
      "If a show publishes itself, we email you a button to undo it — open the undo link in your email within 24 hours.";
    expect(violatingMatch(emailLinkEntry(), truthful)).toBeNull();
  });

  it("the carve-out is scoped to undo/unpublish — a generic 'link in your email' with no undo context still FAILS", () => {
    // Defends against an over-broad allow regex that would let any
    // email-delivery claim through. No undo/unpublish token → still a violation.
    const generic = "Click the link in your email to view the report";
    expect(violatingMatch(emailLinkEntry(), generic)).not.toBeNull();
  });

  it("the retired 24-hour-undo-email entry is gone (the promise now ships everywhere)", () => {
    expect(FORBIDDEN_PROSE.find((e) => e.id === "24-hour-undo-email")).toBeUndefined();
  });

  it("the generic confirmation-email entry is preserved unchanged", () => {
    const entry = FORBIDDEN_PROSE.find((e) => e.id === "confirmation-email");
    expect(entry).toBeDefined();
    expect(entry!.allow).toBeUndefined();
    expect(
      violatingMatch(entry!, "Watch for a confirmation email after you submit"),
    ).not.toBeNull();
  });
});
