export function driveFolderUrl(folderId: string | null | undefined): string | null {
  if (!folderId) return null;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}

/**
 * Extract the Drive folder id a URL refers to, or null if it is not a
 * recognizable Drive folder link. The inverse of `driveFolderUrl`, and the
 * single source of truth for "what folder does this URL mean" — shared by the
 * onboarding scan route (which reserves the scan against this id) and the Step-2
 * UI (which decides whether the typed link still refers to the scanned folder).
 *
 * Accepts every form that names the same folder — bare `/folders/<id>`, a
 * `?usp=sharing` share link, a `/u/<n>/folders/<id>` account-scoped link, and the
 * `?id=<id>` query form — so identity comparison is robust to URL formatting.
 */
export function parseDriveFolderId(folderUrl: unknown): string | null {
  if (typeof folderUrl !== "string") return null;
  let url: URL;
  try {
    // No inline .trim() here: lib/drive is audited by the no-inline-email-
    // normalization guard (AGENTS.md §1.3), and the WHATWG URL parser already
    // strips surrounding whitespace and throws on an empty/blank string — so a
    // blank input falls through to the catch and returns null all the same.
    url = new URL(folderUrl);
  } catch {
    return null;
  }
  if (!/^(drive|docs)\.google\.com$/.test(url.hostname)) return null;

  const folderPathMatch = /^\/drive\/(?:u\/\d+\/)?folders\/([^/?#]+)/.exec(url.pathname);
  const id = folderPathMatch?.[1] ?? url.searchParams.get("id");
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}
