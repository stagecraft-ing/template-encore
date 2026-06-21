import jwt, { type SignOptions } from "jsonwebtoken";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  jwtPrivateKey,
  jwtPublicKey,
  jwtRefreshPrivateKey,
  jwtRefreshPublicKey,
  csrfSecret,
} from "./secrets";

/**
 * RS256 JWT signing + verification for the auth flow.
 *
 * Key sources, in order:
 *   1. Encore secret() bindings (production — from the secrets manager).
 *   2. PEM files in apps/api/keys/ (dev — created by `npm run generate-keys`).
 *
 * If both are absent, signing throws at first use with a clear error.
 *
 * The access token carries the full role set (`roles: string[]`) so the auth
 * handler can populate AuthData without a DB round-trip on every request —
 * this preserves the Express app's multi-role model (AuthUser.roles).
 */

const KEYS_DIR = path.resolve(process.cwd(), "keys");

function loadKey(secretFn: () => string, filename: string): string {
  // 1. Encore secret takes precedence — a non-empty PEM means production wiring.
  try {
    const fromSecret = secretFn();
    if (fromSecret && fromSecret.startsWith("-----BEGIN")) return fromSecret;
  } catch {
    // Encore throws if the secret is unset; fall through to PEM file lookup.
  }
  // 2. PEM file in apps/api/keys/ (dev convenience).
  const keyPath = path.join(KEYS_DIR, filename);
  if (fs.existsSync(keyPath)) {
    return fs.readFileSync(keyPath, "utf-8");
  }
  return "";
}

const ACCESS_PRIVATE = () => loadKey(jwtPrivateKey, "jwt-private.pem");
const ACCESS_PUBLIC = () => loadKey(jwtPublicKey, "jwt-public.pem");
const REFRESH_PRIVATE = () => loadKey(jwtRefreshPrivateKey, "jwt-refresh-private.pem");
const REFRESH_PUBLIC = () => loadKey(jwtRefreshPublicKey, "jwt-refresh-public.pem");

const JWT_ISSUER = "vue-encore-template";
const JWT_AUDIENCE = "vue-encore-template-api";

const JWT_ACCESS_EXPIRES_SECONDS = 15 * 60;
const JWT_REFRESH_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  roles: string[];
}

export function signAccessToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: JWT_ACCESS_EXPIRES_SECONDS,
    algorithm: "RS256",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      roles: payload.roles,
    },
    ACCESS_PRIVATE(),
    options
  );
}

export function signRefreshToken(userId: string): string {
  const options: SignOptions = {
    expiresIn: JWT_REFRESH_EXPIRES_SECONDS,
    algorithm: "RS256",
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  };
  return jwt.sign({ sub: userId, type: "refresh" }, REFRESH_PRIVATE(), options);
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, ACCESS_PUBLIC(), {
    algorithms: ["RS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayload & { roles?: string[] };
  // Tolerate tokens minted without a roles claim — treat as no roles.
  return { ...decoded, roles: decoded.roles ?? [] };
}

export function verifyRefreshToken(token: string): { sub: string; type: string } {
  return jwt.verify(token, REFRESH_PUBLIC(), {
    algorithms: ["RS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as { sub: string; type: string };
}

/** sha256(token) — used to hash refresh tokens before storing in the DB. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Random 32-byte hex token — OAuth state, refresh-token IDs, etc. */
export function generateRandomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Generate a CSRF token: `<hmacSig>.<timestamp>`, signed with CSRF_SECRET.
 * The middleware compares the token verbatim to the cookie value via
 * crypto.timingSafeEqual.
 */
export function generateCsrfToken(sessionId?: string): string {
  const timestamp = Date.now().toString();
  const id = sessionId || crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", csrfSecret())
    .update(id + timestamp)
    .digest("hex");
  return `${signature}.${timestamp}`;
}

/** Re-export the keys dir so generate-keys.ts writes where the loader reads. */
export const JWT_KEYS_DIR = KEYS_DIR;
