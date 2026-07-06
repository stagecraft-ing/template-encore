# Spike results: hiqlite-in-Encore.ts via NAPI (Shape A)

Run: 2026-07-05, host = Apple Silicon (aarch64-apple-darwin), Docker daemon up,
`encore v1.57.9`, `rustc 1.95.0` (host) / `1.96.1` (linux builder container),
`@napi-rs/cli 3.1.5`, `hiqlite =0.13.2` (`default-features=false,
features=["cache","macros"]`, so no SQLite/rusqlite C dependency).

**Bottom line: the Shape A mechanism works end to end. A napi-rs addon that links
hiqlite runs in-process under both `encore run` and inside an `encore build
docker` image, and `put`/`get` round-trips. The real costs are all in native
distribution, not in the runtime coexistence.**

## What was proven

### 1. Addon builds and hiqlite runs inside a plain Node process
`napi build --platform --release` linked the full hiqlite tree (openraft, rustls,
reqwest, axum, aws-lc-sys, cryptr, hiqlite-wal) into a 9.9 MB
`hiqlite-native.darwin-arm64.node` in 2m06s. `node sanity.mjs`: hiqlite elected
itself and started in ~2.5s, `put`/`get` round-tripped, absent key returned
`null`.

### 2. Q2 - two tokio runtimes coexist (CONFIRMED)
Under a normal `encore run`, `GET /hiq/health`, `POST /hiq/put`,
`GET /hiq/get/:key` all worked:
```
GET  /hiq/health          -> {"status":"hiqlite-native: ok (single-node, cache-only, in-process)"}
POST /hiq/put  spike=...   -> {"ok":true}
GET  /hiq/get/spike        -> {"value":"through encore -> napi -> hiqlite","key":"spike"}
GET  /hiq/get/absent       -> {"value":null,"key":"absent"}
```
hiqlite's tokio (inside the addon's own `.node`) and Encore's Rust runtime (inside
`encore-runtime.node`) ran in the same Node process with no contention, deadlock,
or nested-runtime panic. The two runtimes are isolated in separate dynamic
libraries; hiqlite never creates a runtime, it uses the one napi-rs's `tokio_rt`
feature provides for the addon.

### 3. Q4 - `encore build docker` bundles and loads the native addon (CONFIRMED)
Cross-built the Linux binary natively in a `rust:1-bookworm` container (Debian
glibc, matches `node:24-slim`): `hiqlite-native.linux-arm64-gnu.node` (10.1 MB,
ELF aarch64). `aws-lc-sys` compiled fine on arm64 linux once `cmake` was
installed.

`encore build docker --config infra.config.json --base node:24-slim --arch arm64
hiqlite-poc:latest` produced a runnable image. Inside the running container:
```
GET  /hiq/health           -> 200 {"status":"hiqlite-native: ok (single-node, cache-only, in-process)"}
POST /hiq/put in-docker=... -> {"ok":true}
GET  /hiq/get/in-docker    -> {"value":"hiqlite native, bundled + loaded in the encore image","key":"in-docker"}
GET  /hiq/get/nope         -> {"value":null,"key":"nope"}
```
The Linux `.node` was carried into the image, loaded at runtime, and hiqlite
started in-process inside the container.

## Caveats and real costs (these are the findings that matter)

1. **You must cross-build the addon per deploy target yourself.** `encore build
   docker` does NOT compile Rust; it bundles whatever `.node` is present at build
   time. The host `.node` is darwin-arm64 and will not load in a Linux container.
   Producing the `linux-*-gnu` binary is a separate build step (here: a
   `rust:1-bookworm` container). This is the #1 real cost of Shape A and matches
   the report's Q4 "native distribution" analysis. In CI the target is
   `linux-x64-gnu` (amd64); the same recipe applies with the triple swapped.

2. **The `file:` dependency worked only by accident of `bundle_source`.**
   `node_modules/hiqlite-native` is an npm `file:` symlink to `../addon`. It
   resolved in the image ONLY because `bundle_source: true` copied the whole
   source tree (including `addon/`) so the symlink target existed inside the
   image. A production setup should ship the addon as a real npm package with
   per-platform `optionalDependencies` (the same mechanism `lightningcss` /
   `rolldown` already use in this repo), not a `file:` symlink.

3. **`bundle_source` over an npm-workspace root bundles far too much.** Because
   `template-encore`'s root `package.json` declares workspaces, `encore build
   docker` treated the workspace root as the bundle root and slurped the entire
   repo: root `node_modules`, `apps/web*`, AND the addon's Rust `target/` +
   `target-linux/` dirs (1.4 GB of build artifacts). Result: a 3.73 GB image /
   886 MB content. A real integration needs a `.dockerignore` (or to keep Rust
   build output out of the bundled tree) and a scoped bundle. Not a blocker, but
   a required hygiene step.

4. **The gateway binds `0.0.0.0:8080` in the self-host image**, not the
   `base_url` port from the infra config. Map `-p <host>:8080`. (Cost me one
   confused "connection reset" before I read the container logs.)

5. **Cold-start timing.** The first request after boot can reset while hiqlite is
   still electing/starting (~2.5s). A real integration should start hiqlite at
   service init (or gate readiness) rather than lazily on first request.

## What this does NOT change

The mechanism working does not move the strategic verdict. Per
`docs/analysis/hiqlite-napi-feasibility.md`, the value proposition for tenant apps
still hinges on Q3 (shared cross-replica cache requires StatefulSet Raft
clustering that fights Encore's autoscaled-Deployment model). This spike proves
Shape A is *buildable*, not that it is *needed*. It stays in reserve behind a
concrete shared-state requirement.

## Reproduce

```bash
cd experiments/hiqlite-native-spike/addon
napi build --platform --release            # host .node
node sanity.mjs                            # plain-Node round-trip

cd ../poc-app && npm install
encore run                                 # then: curl localhost:4000/hiq/health

# Linux .node (arm64 shown; use x86_64-unknown-linux-gnu triple for amd64/CI):
cd ../addon
docker run --rm -v "$PWD":/work -v "$HOME/.cargo/registry":/usr/local/cargo/registry \
  -e CARGO_TARGET_DIR=/work/target-linux -w /work rust:1-bookworm \
  bash -c "apt-get update -qq && apt-get install -y -qq cmake && cargo build --release"
cp target-linux/release/libhiqlite_native.so hiqlite-native.linux-arm64-gnu.node

cd ../poc-app
encore build docker --config infra.config.json --base node:24-slim --arch arm64 hiqlite-poc:latest
docker run -d --name hiqlite-poc-run -p 4000:8080 hiqlite-poc:latest
curl localhost:4000/hiq/health
```
