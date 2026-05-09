import { google, type drive_v3 } from "googleapis";

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export class DriveConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DriveConfigError";
  }
}

type GoogleAuthOptions = NonNullable<ConstructorParameters<typeof google.auth.GoogleAuth>[0]>;
type ServiceAccountCredentials = NonNullable<GoogleAuthOptions["credentials"]>;

function readServiceAccountCredentials(): ServiceAccountCredentials {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new DriveConfigError("GOOGLE_SERVICE_ACCOUNT_JSON is required for Drive sync");
  }

  try {
    return JSON.parse(raw) as ServiceAccountCredentials;
  } catch (cause) {
    throw new DriveConfigError(
      `GOOGLE_SERVICE_ACCOUNT_JSON must be valid service-account JSON: ${
        cause instanceof Error ? cause.message : "invalid JSON"
      }`,
    );
  }
}

export function getDriveClient(): drive_v3.Drive {
  const auth = getDriveAuth();

  return google.drive({ version: "v3", auth });
}

export function getDriveAuth(): InstanceType<typeof google.auth.GoogleAuth> {
  return new google.auth.GoogleAuth({
    credentials: readServiceAccountCredentials(),
    scopes: GOOGLE_DRIVE_SCOPES,
  });
}

export async function getDriveAccessToken(): Promise<string> {
  const token = await getDriveAuth().getAccessToken();
  if (!token) {
    throw new DriveConfigError("Google service account did not return an access token");
  }

  return token;
}
