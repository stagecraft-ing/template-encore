# Feasibility: hiqlite-in-Encore.ts via NAPI (native, in-process)

**Verdict: do not build now. Shape B (native Encore primitive) is structurally
disproportionate; Shape A (standalone napi-rs addon) is technically clean and was
proven buildable end to end, but it solves a value problem that does not yet
exist for tenant apps. Recommendation: neither as a near-term build, with Shape A
held in reserve behind a concrete shared-state requirement.**

Date: 2026-07-05. Spike is strategic/forward-looking; no live gap.

> **PoC executed.** A minimal Shape A PoC was built and run: a napi-rs addon
> linking `hiqlite` (single-node, cache-only) exposing `put`/`get`, called from
> one Encore.ts endpoint, verified under `encore run` AND inside an
> `encore build docker` image. It works. See
> `experiments/hiqlite-native-spike/` and its `RESULTS.md`. The mechanism working
> does not change the verdict: it proves Shape A is buildable, not that it is
> needed.

---

## TL;DR reasoning chain

1. The two-tokio-runtime worry (Q2) is **not** the blocker, and the PoC confirms
   it. hiqlite never creates its own runtime and pushes blocking I/O onto OS
   threads; a napi addon coexists with Encore's Rust runtime as an isolated
   second tokio in a separate dylib.
2. The real wall is **Q3, clustering under horizontal scale**. hiqlite's value
   in-process (shared cache / dlock / counters / listen_notify) exists **only**
   if replicas form one Raft group. That forces StatefulSet + static membership
   + headless-Service DNS into every tenant app, which fights Encore's
   autoscaled-Deployment deploy model and Raft's fixed-odd-quorum requirement.
3. If per-replica **local** state is enough instead, you do not need hiqlite at
   all: a plain in-process `Map` or the existing Postgres wins, and you dodge
   the port-persistence fragility axiomregent had to engineer around.
4. Shape B is a 4-surface fork (core runtime + js bridge + TS SDK + the Go CLI
   codegen) of an upstream that ships weekly. Disproportionate.
5. Shape A is the only viable shape, and the PoC shows it is buildable, but it is
   a delivery mechanism for a value proposition that is not proven for tenant
   apps today.

---

## Q1 - Encore runtime architecture

Confirmed napi-rs + tokio, two crates in `github.com/encoredev/encore`:

| Repo path | Crate | Role |
|---|---|---|
| `runtimes/js/` | `encore-js-runtime` | napi-rs 2.12.2 bridge, `crate-type=["cdylib"]` produces `encore-runtime.node` |
| `runtimes/core/` | `encore-runtime-core` | tokio 1.35.1 + pingora proxy; sqldb/pubsub/cache/objects subsystems |

- The tokio runtime is **owned and driven by Rust**, not Node's event loop. JS
  main thread only `await RT.runForever()`. Request path: pingora/tokio accept
  on Rust threads, a napi threadsafe function marshals the handler onto Node's JS
  thread, the returned Promise is resolved back into Rust.
- The native module is **not** vendored or on npm; the `encore` CLI fetches
  `encore-runtime.node` keyed by `(version, GOOS, GOARCH)` and injects it via
  `ENCORE_RUNTIME_LIB`. Confirmed in the PoC image:
  `ENCORE_RUNTIME_LIB=/encore/runtimes/js/encore-runtime.node`, and the build log
  shows `Downloading linux/arm64 encore-runtime.node`.
- **Extension point for Shape B: none.** Every primitive is a hardcoded
  `#[napi]` method on a global `Runtime` singleton; the set
  `{sqldb, pubsub, objects, cache, gateway, secrets}` is closed. A new primitive
  requires forking all of: `encore-runtime-core`, `encore-js-runtime`, the
  `encore.dev` TS SDK, **and the Go CLI** (it statically parses TS to detect
  primitives; an unrecognized one never lands in `runtime_config`).
- Encore already ships a **Redis-backed** Cache primitive
  (`encore.dev/storage/cache`, RESP via `bb8-redis`). hiqlite is not a Redis
  server, so it does not drop in behind that API without speaking RESP or
  rewriting `cache/client.rs`.
- License **MPL-2.0** (file-level copyleft). Release cadence weekly-to-biweekly.

## Q2 - Two tokio runtimes (Shape A) - CONFIRMED not a blocker

- hiqlite entry points (`start_node`, `start_node_with_cache`) are `async fn`
  that **assume an ambient tokio runtime and never create one**. Blocking work
  (WAL writer/reader, SQLite single-writer, KV/dlock handlers) runs on dedicated
  `std::thread` OS threads bridged by `flume` channels; it never occupies a tokio
  worker or Node's event loop.
- In Shape A the hiqlite addon is a **separate cdylib** (`*.node`) with its own
  tokio spun up by napi-rs's `tokio_rt` feature. hiqlite runs on the addon's
  runtime; Encore runs on Encore's. Two isolated runtimes in one process.
- **PoC result:** under `encore run`, `put`/`get` round-tripped through the
  Encore HTTP layer into napi into hiqlite with no contention, deadlock, or
  nested-runtime panic. Confirmed empirically.

## Q3 - Clustering under horizontal scaling - THE crux (unchanged by the PoC)

Reference reality, from the two existing embedders:

- **rauthy = real N-node Raft cluster**, but the clustering lives entirely in
  OAP's Helm chart, not rauthy's code: StatefulSet (`replicas: 3`) + headless
  Service (`clusterIP: None`, ports 8100/8200) + `HQL_NODE_ID_FROM=k8s` + a
  **static** `HQL_NODES` list computed at Helm-render time. No dynamic discovery.
- **axiomregent = single embedded node** (`node_id: 1`, `127.0.0.1`), explicitly
  "single-node mode, strictly local, suitable for a desktop agent," and it still
  needs a `.opc-hiqlite-ports.json` sidecar to keep the committed Raft address
  stable across restarts (else os-error-61 flood).

hiqlite facts that gate the value:
- With the `cache` feature, the cache is **Raft-replicated across the group**
  (not local-per-node). Shared cache implies clustering required.
- Membership is **static** (a `Vec<Node>` / `HQL_NODES`), not dynamic discovery.
- Quorum is vanilla Raft majority-of-N: N=1 no fault tolerance, N=2 no benefit
  over N=1, N=3 tolerates one loss. Odd counts wanted.

The tenant-app collision:
- Encore.ts tenant apps deploy as a single-arch amd64 **OCI image / Deployment**,
  not a StatefulSet with stable ordinals and a headless Service.
- A shared-cache embedding would require rebuilding every tenant app as a
  StatefulSet with rauthy-style Helm plumbing, and **static membership is
  fundamentally incompatible with an HPA autoscaling a Deployment**: every scale
  event needs an `HQL_NODES` re-render plus a coordinated rolling restart, and
  moving between even/odd replica counts breaks quorum math.

**Verdict on Q3: for tenant apps the honest default is per-replica isolation,
which means you probably do not need hiqlite. Shared cross-replica state is
possible but demands StatefulSet Raft clustering that fights Encore's deploy
model, a much bigger commitment than the language boundary the NAPI framing
dissolves.**

## Q4 - Native binary distribution - CONFIRMED works, with real costs

- Deploy target is a **single triple today**: `linux-x64-gnu` (Debian
  `node:24-slim`, `ubuntu-latest`, no musl / no multi-arch). Local dev adds
  `darwin-arm64`. Minimal 2-triple matrix.
- **PoC result:** `encore build docker` DID carry the addon `.node` into the
  image and it loaded at runtime (`put`/`get` worked in-container). But the real
  costs surfaced exactly where predicted:
  1. **You cross-build the addon per target yourself.** `encore build docker`
     bundles Rust output, it does not compile it. The host darwin `.node` will
     not load in a Linux container; a `linux-*-gnu` binary is a separate build
     step (a `rust:1-bookworm` container in the PoC; `aws-lc-sys` needs `cmake`).
  2. **Ship a real npm package with per-platform `optionalDependencies`**, not an
     npm `file:` symlink. In the PoC the symlink resolved only because
     `bundle_source: true` copied its target into the image; that is not a
     production pattern. The `lightningcss`/`rolldown` prebuilds already in this
     repo are the mechanism to copy.
  3. **`bundle_source` over an npm-workspace root bundles the whole repo.** The
     PoC image was 3.73 GB because Encore treated the workspace root as the
     bundle root and slurped root `node_modules`, `apps/web*`, and the addon's
     Rust `target/` dirs. A `.dockerignore` and a scoped bundle are mandatory.
  4. **Self-host gateway binds `:8080`**, not the infra `base_url` port.
- CI cost: cross-building for `linux-x64-gnu` from ubuntu is trivial;
  `darwin-arm64` needs a macOS runner. Modest.

## Q5 - Licensing

- hiqlite: **Apache-2.0**. Encore: **MPL-2.0** (file-level copyleft). OAP posture:
  **AGPL-3.0**.
- Shape A: an OAP-authored addon linking Apache-2.0 hiqlite is fine (Apache is
  AGPL-compatible; no Encore fork, so MPL never enters). Clean.
- Shape B: forking MPL-2.0 Encore means modified Encore files stay MPL and must be
  published. Manageable, but moot given Shape B is not recommended.

## Q6 - Upstream-tracking cost

- Shape B: **high.** Fork tracks a weekly-releasing upstream across 4 surfaces
  including the Go CLI codegen.
- Shape A: **modest.** Track hiqlite (Apache; published 0.13.2, 0.14 unreleased)
  and napi-rs.

## Version wrinkle

The local hiqlite checkout is `0.14.0-pre` (edition 2024, MSRV 1.95, rusqlite
0.40). Last **published** tag is `0.13.2` (edition 2024, MSRV 1.88). The PoC
pinned **`=0.13.2`** and built cleanly. OAP already deferred rusqlite 0.40 pending
a hiqlite owner bump (OAP memory: `project_rusqlite_hiqlite_deferral`).

---

## Recommendation

**Neither shape as a near-term build.**

- **Reject Shape B outright** on structure: no plugin seam, a 4-surface fork
  (including the Go CLI), tracking a weekly upstream, for ergonomics (declared /
  auto-provisioned infra) that do not justify the perpetual cost.
- **Hold Shape A in reserve.** The PoC proves it is technically clean and
  buildable (two-tokio safe, 2-triple distribution, compatible licenses), but it
  is a mechanism in search of a value case. Revisit **only** when a concrete
  requirement appears: tenant apps need a shared, low-latency cache / dlock /
  leader-election that Postgres serves poorly **and** the workload is deployed as
  a fixed-size StatefulSet (not an autoscaled Deployment). Absent that, in-process
  map or Postgres is the right answer and the `data-redis` to Postgres cleanup
  should proceed unblocked. Rate-limit stays Postgres regardless.

## PoC artifacts

`experiments/hiqlite-native-spike/` (throwaway, safe to delete):
- `addon/` : the napi-rs crate (`hiqlite-native`), single-node cache-only hiqlite.
- `poc-app/` : minimal standalone Encore.ts app with one service calling the addon.
- `RESULTS.md` : the full empirical run, commands, and caveats.
