import { messageFor, plainCatalogText, type MessageCode } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { resolveIngestionCopy } from "@/lib/admin/needsAttention";
import { escapeHtml, assertNoUnresolvedPlaceholder } from "./escapeHtml";

export type RealtimeInput =
  | {
      kind: "show";
      origin: string;
      slug: string;
      showTitle: string | null;
      code: string;
      contextSheetName: string | null;
    }
  | { kind: "global"; origin: string }
  | {
      kind: "ingestion";
      origin: string;
      driveFileName: string | null;
      lastErrorCode: string | null;
    };

export type RenderedEmail = { subject: string; html: string; text: string };

/**
 * Returns the catalog `dougFacing` template for `code` with its KNOWN `<sheet-name>`
 * slot stripped, so the placeholder guard catches any OTHER unfilled catalog token
 * WITHOUT false-positiving on user-supplied values (a show title containing `<x>`
 * must render escaped, not throw — AC-B3.9b vs the HTML-escaping AC).
 */
function guardTemplate(code: string): void {
  const tmpl = MESSAGE_CATALOG[code as keyof typeof MESSAGE_CATALOG]?.dougFacing ?? "";
  assertNoUnresolvedPlaceholder(tmpl.replaceAll("<sheet-name>", ""));
}

/**
 * Realtime sync-problem email (§5.1, §8). Copy comes from the catalog `dougFacing`
 * via `messageFor` (X.2 no-raw-codes) / `resolveIngestionCopy` (shared fallback).
 * `<sheet-name>` resolves from `context.sheet_name` then the joined show title, with
 * a non-empty fallback so the slot is always filled. Dynamic values are HTML-escaped
 * in the body; subjects are em-dash-free; ALL links are ABSOLUTE via the injected origin.
 */
export function renderRealtimeProblem(input: RealtimeInput): RenderedEmail {
  let bodyText: string;
  let subjectShow: string;
  let href: string;

  if (input.kind === "show") {
    href = `${input.origin}/admin/show/${input.slug}`;
    subjectShow = input.showTitle ?? "a show";
    guardTemplate(input.code);
    // Non-empty sheet name so the <sheet-name> slot is always filled (never leaks it).
    const sheetName = input.contextSheetName ?? input.showTitle ?? "this show";
    // plainCatalogText strips the catalog's Markdown emphasis markers
    // (`*<sheet-name>*`, `_<sheet-name>_`) off the template before filling the
    // name — email is plaintext/escaped-HTML with no Markdown renderer.
    const template = messageFor(input.code as MessageCode).dougFacing;
    bodyText = template
      ? plainCatalogText(template, { sheet_name: sheetName })
      : `${subjectShow} has a sync problem.`;
  } else if (input.kind === "ingestion") {
    href = `${input.origin}/admin`;
    subjectShow = input.driveFileName ?? "a new sheet";
    // Shared resolver guarantees a placeholder-free string: unknown / null-dougFacing /
    // crew-only / unresolved-placeholder codes fall back to generic copy. Never a raw
    // code; never throws.
    bodyText = resolveIngestionCopy({
      code: input.lastErrorCode,
      driveFileName: input.driveFileName,
    });
  } else {
    href = `${input.origin}/admin`;
    subjectShow = "syncing";
    guardTemplate("SYNC_STALLED");
    const stalled = MESSAGE_CATALOG.SYNC_STALLED.dougFacing;
    // Defensive strip for consistency with the other paths (SYNC_STALLED is
    // marker-free today, so this is a no-op unless the copy gains emphasis).
    bodyText = stalled ? plainCatalogText(stalled) : "Syncing is stalled.";
  }

  const subject = `FXAV · ${subjectShow}: sync problem`;
  const text = `${bodyText}\n\nOpen the dashboard: ${href}`;
  const html = `<p>${escapeHtml(bodyText)}</p><p><a href="${escapeHtml(href)}">Open the dashboard</a></p>`;
  return { subject, html, text };
}
