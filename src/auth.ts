import { google } from "googleapis";
import type { OAuth2Client } from "google-auth-library";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/**
 * Returns an authenticated Google auth client.
 * Prefers GOOGLE_SERVICE_ACCOUNT_JSON (inline JSON) over
 * GOOGLE_APPLICATION_CREDENTIALS (file path), which is handled
 * automatically by the googleapis library.
 */
export function getAuthClient(): OAuth2Client {
  const inlineJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (inlineJson) {
    const credentials = JSON.parse(inlineJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: SCOPES,
    });
    // GoogleAuth is compatible with OAuth2Client for googleapis usage
    return auth as unknown as OAuth2Client;
  }

  // Falls back to GOOGLE_APPLICATION_CREDENTIALS env var (file path)
  const auth = new google.auth.GoogleAuth({
    scopes: SCOPES,
  });

  return auth as unknown as OAuth2Client;
}
