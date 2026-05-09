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
