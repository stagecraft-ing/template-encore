import { gatewayOAuthClientId, gatewayOAuthClientSecret } from "../lib/secrets";
import { env } from "../lib/env";
import logger from "../lib/logger";

/**
 * OAuth client-credentials token cache for the BFF→private-backend hop.
 *
 * Ports the Express token-cache.service.ts: acquires, caches, and refreshes
 * S2S tokens, deduplicating concurrent fetches to avoid a thundering herd on
 * refresh. Client id/secret are Encore secrets; tenant/scope/token-URL are env.
 */

interface CachedToken {
  accessToken: string;
  expiresAt: number; // ms epoch
}

const EXPIRY_BUFFER_MS = 60_000;

let cachedToken: CachedToken | null = null;
let fetchPromise: Promise<string> | null = null;

function tokenEndpoint(): string {
  return (
    env.GATEWAY_OAUTH_TOKEN_URL ||
    `https://login.microsoftonline.com/${env.GATEWAY_OAUTH_TENANT_ID}/oauth2/v2.0/token`
  );
}

/** True when every S2S OAuth input + the private backend URL is configured. */
export function isGatewayConfigured(): boolean {
  try {
    return !!(
      gatewayOAuthClientId() &&
      gatewayOAuthClientSecret() &&
      env.GATEWAY_OAUTH_SCOPE &&
      env.PRIVATE_API_BASE_URL &&
      (env.GATEWAY_OAUTH_TOKEN_URL || env.GATEWAY_OAUTH_TENANT_ID)
    );
  } catch {
    return false;
  }
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return cachedToken.accessToken;
  }
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetchToken().finally(() => {
    fetchPromise = null;
  });
  return fetchPromise;
}

async function fetchToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: gatewayOAuthClientId(),
    client_secret: gatewayOAuthClientSecret(),
    scope: env.GATEWAY_OAUTH_SCOPE ?? "",
  });

  const response = await fetch(tokenEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("OAuth token request failed", {
      status: response.status,
      body: errorText.slice(0, 500),
    });
    throw new Error(`OAuth token request failed: ${response.status}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  logger.info("Gateway OAuth token acquired", { expiresIn: data.expires_in });
  return data.access_token;
}

export function clearTokenCache(): void {
  cachedToken = null;
  fetchPromise = null;
}
