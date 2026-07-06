# Feasibility: hiqlite-in-Encore.ts via NAPI (native, in-process)

**Verdict: do not build now. Shape B (native Encore primitive) is structurally
disproportionate; Shape A (standalone napi-rs addon) is technically clean but
solves a value problem that does not yet exist. Recommendation: neither, with
Shape A held in reserve behind a concrete shared-state requirement.**

Date: 2026-07-05. Spike is strategic/forward-looking; no live gap.

---

## TL;DR reasoning chain

1. The two-tokio-runtime worry (Q2) is **not** the blocker. hiqlite never
   creates its own runtime and pushes blocking I/O onto OS threads; a napi
   addon coexists with Encore's Rust runtime as an isolated second tokio in a
   separate dylib. Standard, safe.
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
5. Shape A is the only viable shape, but it is a delivery mechanism for a value
   proposition that is not proven for tenant apps today.

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
  thread, the returned Promise is resolved back into Rust. Encore forked
  napi-rs's threadsafe_function to capture handler return values.
- The native module is **not** vendored or on npm; the `encore` CLI fetches
  `encore-runtime.node` keyed by `(version, GOOS, GOARCH)` and injects it via
  `ENCORE_RUNTIME_LIB`. `encore.dev@1.57.9` ships no `.node`.
- **Extension point for Shape B: none.** Every primitive is a hardcoded
  `#[napi]` method on a global `Runtime` singleton; the set
  `{sqldb, pubsub, objects, cache, gateway, secrets}` is closed and enumerated
  in three must-agree places (core subsystem, napi method, auto-generated
  `napi.d.cts`). A new primitive requires forking all of: `encore-runtime-core`,
  `encore-js-runtime`, the `encore.dev` TS SDK, **and the Go CLI** (it statically
  parses TS to detect primitives; an unrecognized one never lands in
  `runtime_config`, so the accessor resolves to nothing). Confirmed high
  confidence from code plus Encore docs steering custom infra to "external
  resource."
- Encore already ships a **Redis-backed** Cache primitive
  (`encore.dev/storage/cache`, RESP via `bb8-redis`). hiqlite is not a Redis
  server, so it does not drop in behind that API without speaking RESP or
  rewriting `cache/client.rs`. hiqlite maps more naturally onto SQLDatabase than
  Cache, an even deeper swap.
- License **MPL-2.0** (file-level copyleft; publish modified Encore files, not
  your new ones). Release cadence weekly-to-biweekly (v1.57.1 to v1.57.9 in ~6
  weeks); `runtimes/js/src` target files churn every 1 to 3 months.

## Q2 - Two tokio runtimes (Shape A) - NOT a blocker

- hiqlite entry points (`start_node`, `start_node_with_cache`) are `async fn`
  that **assume an ambient tokio runtime and never create one**. Full-tree grep:
  the only `#[tokio::main]` is in the feature-gated `server` binary, not the
  library path.
- Blocking work (WAL writer/reader, SQLite single-writer, KV/dlock handlers) runs
  on dedicated `std::thread` OS threads bridged by `flume` channels; it never
  occupies a tokio worker or Node's event loop.
- In Shape A the hiqlite addon is a **separate cdylib** (`*.node`) with its own
  statically-linked tokio spun up by napi-rs's `tokio_rt` feature. hiqlite runs
  on the addon's runtime; Encore runs on Encore's. Two isolated runtimes in one
  process is a well-supported pattern (thread pools plus executors, no shared
  global to contend). The classic "runtime within a runtime" panic does not apply
  because hiqlite nests nothing.
- Idiomatic surface: expose `#[napi] async fn put/get(...)`; napi-rs drives them
  on the addon runtime and returns JS promises. Clean.
- **This is sound in theory and trivially confirmed by the PoC.**

## Q3 - Clustering under horizontal scaling - THE crux

Reference reality, from the two existing embedders:

- **rauthy = real N-node Raft cluster**, but the clustering lives entirely in
  OAP's Helm chart, not rauthy's code: StatefulSet (`replicas: 3`) + headless
  Service (`clusterIP: None`, ports 8100/8200) + `HQL_NODE_ID_FROM=k8s`
  (derives node id from pod ordinal) + a **static** `HQL_NODES` list computed at
  Helm-render time from replica count and per-ordinal DNS
  (`<sts>-<i>.<headless>:8100`). Scaling replicas means re-render `HQL_NODES`
  plus a rolling restart. No gossip / DNS-SRV / dynamic join.
- **axiomregent = single embedded node** (`node_id: 1`, `127.0.0.1`, OS-assigned
  ports), explicitly "single-node mode, strictly local, suitable for a desktop
  agent." Its complexity budget goes into a `.opc-hiqlite-ports.json` sidecar
  that persists the port pair so the committed Raft address stays stable across
  restarts; otherwise the in-process client flood-dials a stale unbound port
  (os error 61). Even a **single** hiqlite node carries this operational scar.

hiqlite facts that gate the value:
- With the `cache` feature, the cache is **Raft-replicated across the group**
  (not local-per-node). Shared cache implies clustering required.
- Membership is **static** (a `Vec<Node>` / `HQL_NODES`), not dynamic discovery.
- Quorum is vanilla Raft majority-of-N: N=1 no fault tolerance, N=2 no benefit
  over N=1, N=3 tolerates one loss. Odd counts wanted.

The tenant-app collision:
- Encore.ts tenant apps deploy as a single-arch amd64 **OCI image** via
  `encore build docker` on `ubuntu-latest`, the standard Deployment shape, not
  a StatefulSet with stable ordinals and a headless Service.
- A shared-cache embedding would require rebuilding every tenant app as a
  StatefulSet with rauthy-style Helm plumbing, and **static membership is
  fundamentally incompatible with an HPA autoscaling a Deployment**: every scale
  event needs an `HQL_NODES` re-render plus a coordinated rolling restart, and
  moving between even/odd replica counts breaks quorum math.
- So the shared-cache case imposes a real distributed-systems tax on every
  tenant; the local-state case makes hiqlite unnecessary (in-process map or
  Postgres wins).

**Verdict on Q3: for tenant apps the honest default is per-replica isolation,
which means you probably do not need hiqlite. Shared cross-replica state is
possible but demands StatefulSet Raft clustering that fights Encore's deploy
model, a much bigger commitment than the language boundary the NAPI framing
dissolves.**

## Q4 - Native binary distribution

- Deploy target is a **single triple today**: `linux-x64-gnu` (Debian
  `node:24-slim`, `ubuntu-latest`, no musl, no multi-arch anywhere). Local dev
  adds `darwin-arm64` for `encore run` on Apple Silicon. Minimal 2-triple matrix.
- Distribution precedent already in-tree: the app pulls transitive napi-rs
  `.node` binaries (lightningcss, rolldown, fsevents) via npm `os`/`cpu`
  optionalDependencies. A hiqlite addon can reuse that exact mechanism.
- **Open unknown (the #1 Shape-A risk):** does `encore build docker` carry a
  native runtime `node_module` into the production image, and can the compiled
  `main.mjs` `require` it at runtime? The known transitive `.node` deps are
  dev/build-time-only for the SPA; they do not prove the API container ships a
  runtime-required addon. This is exactly what a PoC de-risks.
- CI cost: cross-building a Rust napi addon for `linux-x64-gnu` from ubuntu is
  trivial; `darwin-arm64` needs a macOS runner or cross toolchain. Modest.

## Q5 - Licensing

- hiqlite: **Apache-2.0** (confirmed LICENSE plus manifest). Clean.
- Encore: **MPL-2.0** (file-level copyleft).
- OAP posture: **AGPL-3.0**.
- Shape A: an OAP-authored addon linking Apache-2.0 hiqlite is fine. Apache-2.0
  is AGPL-compatible; the addon is AGPL, hiqlite stays Apache. No Encore fork, so
  MPL never enters. Shipping prebuilt binaries inside tenant products is fine
  under AGPL (offer source for the addon). Clean.
- Shape B: forking MPL-2.0 Encore means modified Encore files stay MPL and must
  be published (new files can be AGPL). Manageable legally, but moot given Shape
  B is not recommended.

## Q6 - Upstream-tracking cost

- Shape B: **high.** Fork tracks a weekly-releasing upstream across 4 surfaces
  including the Go CLI codegen; target files change every 1 to 3 months.
- Shape A: **modest.** Track hiqlite (Apache; published 0.13.2, 0.14
  unreleased) and napi-rs. Note the version wrinkle below.

## Version wrinkle

The local hiqlite checkout is `0.14.0-pre` (edition 2024, MSRV 1.95, rusqlite
0.40, openraft 0.9.21). Last **published** tag is `0.13.2`. The cache-only
"no data_dir" and `learner_only` features are only in the unreleased pre-version.
OAP already deferred rusqlite 0.40 pending a hiqlite owner bump
(project memory: `project_rusqlite_hiqlite_deferral`). Pin **0.13.2** for any
spike. rauthy uses `0.13` (cache/counters/listen_notify_local/macros); axiomregent
uses `~0.13` (sqlite/dlock/listen_notify_local/auto-heal, cache transitive).

---

## Recommendation

**Neither shape as a near-term build.**

- **Reject Shape B outright** on structure: no plugin seam, a 4-surface fork
  (including the Go CLI), tracking a weekly upstream, for ergonomics (declared /
  auto-provisioned infra) that do not justify the perpetual cost. If Encore-native
  DX is ever wanted, the smaller door is contributing/forking the existing Cache
  primitive's backend, not a brand-new primitive, and that is still a core-runtime
  fork.
- **Hold Shape A in reserve.** It is technically clean (two-tokio safe, 2-triple
  distribution, compatible licenses) but it is a mechanism in search of a value
  case. Revisit **only** when a concrete requirement appears: tenant apps need a
  shared, low-latency cache / dlock / leader-election that Postgres serves poorly
  **and** the workload is deployed as a fixed-size StatefulSet (not an autoscaled
  Deployment). Absent that, in-process map or Postgres is the right answer and the
  `data-redis` to Postgres cleanup should proceed unblocked. Rate-limit stays
  Postgres regardless.

## If you want to de-risk cheaply anyway (optional PoC)

The one genuinely uncertain, cheap-to-settle thing is the Shape-A **mechanism**,
not the value case. A minimal PoC would prove, in roughly half a day:

1. A napi-rs addon (`default-features=false, features=["cache","macros"]`,
   single-node `Node{id:1,127.0.0.1}`) exposing `#[napi] async fn put/get`.
2. Called from **one** Encore.ts endpoint under a normal `encore run`
   (confirms Q2 two-tokio coexistence empirically).
3. Then `encore build docker` and run the image (confirms Q4: does the addon
   `.node` survive into the container and load at runtime, the real unknown).

Scope stays single-node/local; it answers "can this even be wired," not "should
we." It does not touch the rate-limit path and does not block the redis cleanup.
