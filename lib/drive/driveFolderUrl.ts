export function driveFolderUrl(folderId: string | null | undefined): string | null {
  if (!folderId) return null;
  return `https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`;
}
