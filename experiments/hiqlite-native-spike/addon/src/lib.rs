//! Feasibility spike: a napi-rs addon that links the `hiqlite` Rust crate and
//! exposes a single-node cache (`put`/`get`) to TypeScript.
//!
//! The whole point is that hiqlite runs IN-PROCESS on this addon's own tokio
//! runtime (provided by napi-rs's `tokio_rt` feature). When this `.node` is
//! loaded by a Node process that ALSO hosts Encore's Rust runtime, the two tokio
//! runtimes are isolated in separate dynamic libraries and coexist. This addon
//! proves that empirically. It is NOT production code.

use hiqlite::macros::CacheVariants;
use hiqlite::{Client, Node, NodeConfig};
use napi_derive::napi;
use tokio::sync::OnceCell;

/// hiqlite keys every cache value by a variant of a `CacheVariants` enum. One
/// logical cache is enough for the spike.
#[derive(Debug, CacheVariants)]
enum Cache {
    Poc,
}

/// The embedded hiqlite client, started once on first use and kept for the
/// lifetime of the process. Its Raft/API servers run as background tokio tasks
/// on the addon's runtime.
static CLIENT: OnceCell<Client> = OnceCell::const_new();

/// Lazily start a single-node, cache-only hiqlite instance bound to loopback.
async fn client() -> napi::Result<&'static Client> {
    CLIENT
        .get_or_try_init(|| async {
            // Isolated, wiped-on-start data dir. cache-only still persists its
            // Raft WAL/snapshots to disk by default (cache_storage_disk = true).
            let dir = std::env::temp_dir().join("hiqlite-napi-spike");
            let _ = std::fs::remove_dir_all(&dir);

            let config = NodeConfig {
                node_id: 1,
                nodes: vec![Node {
                    id: 1,
                    addr_raft: "127.0.0.1:8100".to_string(),
                    addr_api: "127.0.0.1:8200".to_string(),
                }],
                data_dir: dir.to_string_lossy().into_owned().into(),
                // Both secrets must be >= 16 chars (hiqlite validates this).
                secret_raft: "napi-spike-raft-secret".to_string(),
                secret_api: "napi-spike-api-secret0".to_string(),
                log_statements: false,
                ..NodeConfig::default()
            };

            hiqlite::start_node_with_cache::<Cache>(config).await
        })
        .await
        .map_err(|e| napi::Error::from_reason(format!("hiqlite init failed: {e}")))
}

/// Confirms the addon loaded and hiqlite started inside this process.
#[napi]
pub async fn health() -> napi::Result<String> {
    client().await?;
    Ok("hiqlite-native: ok (single-node, cache-only, in-process)".to_string())
}

/// Store a string value under `key` (no TTL).
#[napi]
pub async fn put(key: String, value: String) -> napi::Result<()> {
    let client = client().await?;
    client
        .put(Cache::Poc, key, &value, None)
        .await
        .map_err(|e| napi::Error::from_reason(format!("hiqlite put failed: {e}")))
}

/// Read the string value stored under `key`, or `null` if absent.
#[napi]
pub async fn get(key: String) -> napi::Result<Option<String>> {
    let client = client().await?;
    client
        .get::<Cache, String, String>(Cache::Poc, key)
        .await
        .map_err(|e| napi::Error::from_reason(format!("hiqlite get failed: {e}")))
}
