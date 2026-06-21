#!/usr/bin/env node
// Production migration runner — applies SQL files from db/migrations/ to the
// database referenced by DATABASE_URL, in filename order.
//
// `encore run` and Encore Cloud deploys apply migrations automatically. This
// script exists for OUTSIDE-Encore paths:
//   - CI step that migrates a staging/prod DB before deploy
//   - Kubernetes Helm pre-install / pre-upgrade hook
//   - Manual recovery / restore drills
//
// It tracks state in its own schema_migrations table (separate from Encore's
// internal tracking). Use it only against databases NOT managed by `encore run`.
//
// File-naming convention matches Encore's: <n>_<slug>.up.sql.

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve("./db/migrations");

if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}
if (!fs.existsSync(MIGRATIONS_DIR)) {
  console.error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  process.exit(1);
}

function listMigrations() {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .map((f) => {
      const match = f.match(/^(\d+)_(.+)\.up\.sql$/);
      if (!match) throw new Error(`Bad migration filename: ${f}`);
      return { version: Number(match[1]), name: match[2], file: path.join(MIGRATIONS_DIR, f) };
    })
    .sort((a, b) => a.version - b.version);
}

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    BIGINT PRIMARY KEY,
        name       TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query(`SELECT version FROM schema_migrations`);
    const applied = new Set(rows.map((r) => Number(r.version)));
    const pending = listMigrations().filter((m) => !applied.has(m.version));

    if (pending.length === 0) {
      console.log("No pending migrations.");
      return;
    }

    for (const m of pending) {
      const sql = fs.readFileSync(m.file, "utf-8");
      console.log(`Applying ${m.version}_${m.name} ...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`,
          [m.version, m.name]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log(`Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
