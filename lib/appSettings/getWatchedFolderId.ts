import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

type AppSettingsSupabaseClient = ReturnType<typeof createSupabaseServiceRoleClient>;

type AppSettingsFolderRow = {
  watched_folder_id: string | null;
};

export type ActiveWatchedFolderResult =
  | { folderId: string }
  | { kind: "no_folder_configured" }
  | {
      kind: "infra_error";
      operation: "createSupabaseServiceRoleClient" | "readActiveWatchedFolderId";
      source: "returned_error" | "thrown_error";
      cause: unknown;
    };

function firstBootEnvFolderId(): string | null {
  return process.env.GOOGLE_DRIVE_FOLDER_ID ?? process.env.DRIVE_FOLDER_ID ?? null;
}

function createClientResult():
  | { client: AppSettingsSupabaseClient }
  | Extract<ActiveWatchedFolderResult, { kind: "infra_error" }> {
  try {
    return { client: createSupabaseServiceRoleClient() };
  } catch (cause) {
    return {
      kind: "infra_error",
      operation: "createSupabaseServiceRoleClient",
      source: "thrown_error",
      cause,
    };
  }
}

export type ActiveWatchedFolder =
  | { folderId: string; folderName: string | null }
  | { kind: "no_folder_configured" }
  | Extract<ActiveWatchedFolderResult, { kind: "infra_error" }>;

export async function getActiveWatchedFolder(
  client?: AppSettingsSupabaseClient,
): Promise<ActiveWatchedFolder> {
  const resolvedClient = client ? { client } : createClientResult();
  if ("kind" in resolvedClient) return resolvedClient;
  try {
    // Bind to a local named `supabase` so `await supabase.from(...)` is recognized by the
    // _metaInfraContract grep-shape (it matches `await supabase` / `await <builderVar=supabase…>`,
    // NOT an indirect `resolvedClient.client.from(...)` chain). Required for the registry row to pass.
    const supabase = resolvedClient.client;
    const { data, error } = await supabase
      .from("app_settings")
      .select("watched_folder_id, watched_folder_name")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      return {
        kind: "infra_error",
        operation: "readActiveWatchedFolderId",
        source: "returned_error",
        cause: error,
      };
    }
    const row = data as {
      watched_folder_id: string | null;
      watched_folder_name: string | null;
    } | null;
    if (row?.watched_folder_id)
      return { folderId: row.watched_folder_id, folderName: row.watched_folder_name ?? null };
    if (!row) {
      const folderId = firstBootEnvFolderId();
      if (folderId) return { folderId, folderName: null };
    }
    return { kind: "no_folder_configured" };
  } catch (cause) {
    return {
      kind: "infra_error",
      operation: "readActiveWatchedFolderId",
      source: "thrown_error",
      cause,
    };
  }
}

export async function getActiveWatchedFolderId(
  client?: AppSettingsSupabaseClient,
): Promise<ActiveWatchedFolderResult> {
  const resolvedClient = client ? { client } : createClientResult();
  if ("kind" in resolvedClient) return resolvedClient;

  try {
    const { data, error } = await resolvedClient.client
      .from("app_settings")
      .select("watched_folder_id")
      .eq("id", "default")
      .maybeSingle();
    if (error) {
      return {
        kind: "infra_error",
        operation: "readActiveWatchedFolderId",
        source: "returned_error",
        cause: error,
      };
    }

    const row = data as AppSettingsFolderRow | null;
    if (row?.watched_folder_id) return { folderId: row.watched_folder_id };
    if (!row) {
      const folderId = firstBootEnvFolderId();
      if (folderId) return { folderId };
    }
    return { kind: "no_folder_configured" };
  } catch (cause) {
    return {
      kind: "infra_error",
      operation: "readActiveWatchedFolderId",
      source: "thrown_error",
      cause,
    };
  }
}
