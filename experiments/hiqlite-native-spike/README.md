# Spike: hiqlite-in-Encore.ts via NAPI (native, in-process)

**Status: throwaway feasibility spike. Not production. Safe to delete.**

Proves the "Shape A" mechanism from `docs/analysis/hiqlite-napi-feasibility.md`:
a napi-rs addon that links the `hiqlite` Rust crate (single-node, cache-only)
and exposes `put`/`get` to TypeScript, called from one Encore.ts endpoint.

Two things this spike settles empirically:

1. **Q2 (two tokio runtimes).** hiqlite's tokio (inside this addon's own
   `.node`) coexists with Encore's Rust runtime in one Node process under a
   normal `encore run`.
2. **Q4 (native distribution).** Whether `encore build docker` carries a native
   `.node` addon into the production image and loads it at runtime.

## Layout

- `addon/` : the napi-rs Rust crate (`hiqlite-native`), builds to a `.node`.
- `poc-app/` : a minimal standalone Encore.ts app with one endpoint that calls
  the addon. Deliberately separate from `apps/api` so the mechanism question is
  not entangled with that app's auth/secrets/Postgres boot path.

## Findings

See `RESULTS.md` (written as the spike runs) and the full report at
`docs/analysis/hiqlite-napi-feasibility.md`.
