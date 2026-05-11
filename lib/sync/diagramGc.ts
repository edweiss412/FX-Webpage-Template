export type DiagramGcShow = {
  showId: string;
  archived: boolean;
  currentRevisionId: string | null;
  snapshotStatus: "complete" | "partial_failure" | "partial_failure_restage_required";
  retainedRevisionIds: string[];
  cutoffDays: number;
};

export type DiagramGcPendingRow = {
  id: string;
  showId: string;
  tempPrefix: string;
  snapshotRevisionId: string;
  pendingRevisionId: string | null;
  claimToken: string;
};

export type DiagramGcTx = {
  listShows(): Promise<DiagramGcShow[]>;
  claimPendingRows(now: Date): Promise<DiagramGcPendingRow[]>;
  deletePendingRow(id: string, claimToken: string): Promise<void>;
  deletePromotedRows(now: Date): Promise<number>;
};

export type DiagramGcStorage = {
  list(prefix: string): Promise<string[]>;
  remove(path: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
};

export type DiagramGcResult = {
  orphanBlobsDeleted: number;
  pendingPrefixesDeleted: number;
  promotedRowsDeleted: number;
};

export type RunDiagramGcArgs = {
  now?: Date;
  tx: DiagramGcTx;
  storage: DiagramGcStorage;
};

function showPrefix(showId: string): string {
  return `diagram-snapshots/shows/${showId}/`;
}

function revisionFromPath(showId: string, path: string): string | null {
  const prefix = showPrefix(showId);
  if (!path.startsWith(prefix)) return null;
  const [revision] = path.slice(prefix.length).split("/");
  return revision || null;
}

function suppressOrphanDeletion(show: DiagramGcShow): boolean {
  return (
    show.snapshotStatus === "partial_failure" ||
    show.snapshotStatus === "partial_failure_restage_required"
  );
}

const noopTx: DiagramGcTx = {
  async listShows() {
    return [];
  },
  async claimPendingRows() {
    return [];
  },
  async deletePendingRow() {
    return undefined;
  },
  async deletePromotedRows() {
    return 0;
  },
};

const noopStorage: DiagramGcStorage = {
  async list() {
    return [];
  },
  async remove() {
    return undefined;
  },
  async removePrefix() {
    return undefined;
  },
};

export async function runDiagramGc(args?: Partial<RunDiagramGcArgs>): Promise<DiagramGcResult> {
  const tx = args?.tx ?? noopTx;
  const storage = args?.storage ?? noopStorage;
  const now = args?.now ?? new Date();
  let orphanBlobsDeleted = 0;
  let pendingPrefixesDeleted = 0;

  for (const show of await tx.listShows()) {
    if (suppressOrphanDeletion(show)) continue;
    const retained = new Set([
      show.currentRevisionId,
      ...show.retainedRevisionIds,
    ].filter((revision): revision is string => Boolean(revision)));
    const paths = await storage.list(showPrefix(show.showId));
    for (const path of paths) {
      const revision = revisionFromPath(show.showId, path);
      if (!revision || revision === "_pending" || retained.has(revision)) continue;
      await storage.remove(path);
      orphanBlobsDeleted += 1;
    }
  }

  for (const row of await tx.claimPendingRows(now)) {
    if (row.pendingRevisionId === row.snapshotRevisionId) continue;
    await storage.removePrefix(row.tempPrefix);
    await tx.deletePendingRow(row.id, row.claimToken);
    pendingPrefixesDeleted += 1;
  }

  const promotedRowsDeleted = await tx.deletePromotedRows(now);

  return {
    orphanBlobsDeleted,
    pendingPrefixesDeleted,
    promotedRowsDeleted,
  };
}
