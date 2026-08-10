/**
 * lib/admin/archiveCopy.ts — the copy contract two archive surfaces share.
 *
 * The per-show page's ArchiveShowButton and the dashboard row's ⋮ menu both
 * read these strings, so both derive their expectations from this module: that
 * is the point of the module, and it is also why the SURFACE tests cannot pin
 * the wording — expected and actual would come from the same place. This file
 * is where the sentences are pinned as literals, once, so an accidental edit
 * reds here instead of shipping two surfaces saying something new.
 *
 * Typographic apostrophes and quotes are part of the contract (the mechanical
 * UI checklist bans the straight forms in user-visible copy).
 */
import { describe, expect, it } from "vitest";
import {
  ARCHIVE_GENERIC_ERROR_COPY,
  ARCHIVE_NOT_FOUND_COPY,
  archiveConsequenceProse,
  classifyArchiveFailure,
} from "@/lib/admin/archiveCopy";

describe("archive copy contract", () => {
  it("pins the not-found refresh prompt verbatim", () => {
    expect(ARCHIVE_NOT_FOUND_COPY).toBe(
      "We couldn’t find this show anymore. Refresh the page and try again.",
    );
  });

  it("pins the generic retry prose verbatim", () => {
    expect(ARCHIVE_GENERIC_ERROR_COPY).toBe(
      "Archiving didn’t go through. Try again in a moment; if it keeps failing, contact the developer.",
    );
  });

  it("uses typographic punctuation, never the straight forms", () => {
    for (const s of [
      ARCHIVE_NOT_FOUND_COPY,
      ARCHIVE_GENERIC_ERROR_COPY,
      archiveConsequenceProse("Spring Gala"),
      archiveConsequenceProse(null),
    ]) {
      expect(s).not.toContain("'");
      expect(s).not.toContain('"');
      // No em dash in user-visible copy (DESIGN.md:381).
      expect(s).not.toContain("—");
    }
  });

  it("names the show in the consequence prose when one is known", () => {
    expect(archiveConsequenceProse("Spring Gala")).toBe(
      "Crew links for “Spring Gala” stop working now and won’t come back until you re-publish and issue a new link.",
    );
  });

  it("degrades to the unnamed sentence for absent, empty or whitespace-only names", () => {
    const unnamed =
      "Crew links stop working now and won’t come back until you re-publish and issue a new link.";
    for (const input of [null, undefined, "", "   "]) {
      expect(archiveConsequenceProse(input)).toBe(unnamed);
    }
  });

  it("classifies every refusal shape the shipped action can return", () => {
    // The two lowercase sentinels (app/admin/show/[slug]/_actions/shared.ts and
    // archive.ts) are NOT §12.4 codes and must never reach messageFor.
    expect(classifyArchiveFailure("show_not_found")).toEqual({ kind: "not_found" });
    expect(classifyArchiveFailure("infra_error")).toEqual({ kind: "generic" });
    // The catalog-backed refusals.
    expect(classifyArchiveFailure("FINALIZE_OWNED_SHOW")).toEqual({
      kind: "catalog",
      code: "FINALIZE_OWNED_SHOW",
    });
    expect(classifyArchiveFailure("SHOW_ARCHIVED_IMMUTABLE")).toEqual({
      kind: "catalog",
      code: "SHOW_ARCHIVED_IMMUTABLE",
    });
    // Anything unmapped falls to generic prose rather than leaking a raw code:
    // ADMIN_LINK_SHOW_NOT_FOUND is retired and must NOT resolve to catalog.
    expect(classifyArchiveFailure("ADMIN_LINK_SHOW_NOT_FOUND")).toEqual({ kind: "generic" });
    expect(classifyArchiveFailure("SOMETHING_NEW")).toEqual({ kind: "generic" });
  });
});
