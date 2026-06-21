/**
 * Generate RS256 keypairs for local JWT signing.
 *
 *   npm run generate-keys   (from apps/api)
 *
 * Writes four PEM files into apps/api/keys/ (gitignored). lib/jwt.ts loads
 * these when the corresponding Encore secret is unset — the dev convenience
 * path. In production, set JWT_PRIVATE_KEY / JWT_PUBLIC_KEY /
 * JWT_REFRESH_PRIVATE_KEY / JWT_REFRESH_PUBLIC_KEY as Encore secrets instead.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Must match KEYS_DIR in lib/jwt.ts (process.cwd()/keys).
const KEYS_DIR = path.resolve(process.cwd(), "keys");

function genPair(prefix: string): void {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  fs.writeFileSync(path.join(KEYS_DIR, `${prefix}-private.pem`), privateKey, { mode: 0o600 });
  fs.writeFileSync(path.join(KEYS_DIR, `${prefix}-public.pem`), publicKey, { mode: 0o644 });
  console.log(`  wrote ${prefix}-private.pem, ${prefix}-public.pem`);
}

fs.mkdirSync(KEYS_DIR, { recursive: true });
console.log(`Generating RS256 keypairs in ${KEYS_DIR}`);
genPair("jwt");
genPair("jwt-refresh");
console.log("\nDone. Suggested CSRF_SECRET for your .env:");
console.log(`  CSRF_SECRET=${crypto.randomBytes(32).toString("base64")}`);
