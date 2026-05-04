import postgres from "postgres";

export type ShowAdvisoryLockMode = "try" | "block";

export class ShowAdvisoryLockUnavailableError extends Error {
  readonly code = "SHOW_ADVISORY_LOCK_UNAVAILABLE";

  constructor(showId: string) {
    super(`Could not acquire advisory lock for show ${showId}`);
    this.name = "ShowAdvisoryLockUnavailableError";
  }
}

export class ShowAdvisoryLockShowNotFoundError extends Error {
  readonly code = "SHOW_ADVISORY_LOCK_SHOW_NOT_FOUND";

  constructor(showId: string) {
    super(`Show ${showId} was not found`);
    this.name = "ShowAdvisoryLockShowNotFoundError";
  }
}

function databaseUrl(): string {
  return (
    process.env.TEST_DATABASE_URL ??
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  );
}

export async function withShowAdvisoryLock<T>(
  showId: string,
  mode: ShowAdvisoryLockMode,
  fn: () => T | Promise<T>,
): Promise<T> {
  const sql = postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 1,
    prepare: false,
  });

  try {
    const result = await sql.begin(async (tx) => {
      const [show] = await tx<{ drive_file_id: string }[]>`
        select drive_file_id
          from public.shows
         where id = ${showId}::uuid
         limit 1
      `;

      if (!show) {
        throw new ShowAdvisoryLockShowNotFoundError(showId);
      }

      if (mode === "try") {
        const [result] = await tx<{ locked: boolean }[]>`
          select pg_try_advisory_xact_lock(hashtext('show:' || ${show.drive_file_id})) as locked
        `;

        if (!result?.locked) {
          throw new ShowAdvisoryLockUnavailableError(showId);
        }
      } else {
        await tx`
          select pg_advisory_xact_lock(hashtext('show:' || ${show.drive_file_id}))
        `;
      }

      return await fn();
    });
    return result as T;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
