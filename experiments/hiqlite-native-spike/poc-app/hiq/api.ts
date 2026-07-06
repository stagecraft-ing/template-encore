import { api } from "encore.dev/api";
// The native addon (CJS napi-rs module). Default-import then destructure is the
// safest ESM<-CJS interop for napi's generated index.js.
import hiqlite from "hiqlite-native";

// GET /hiq/health : confirms the addon loaded and hiqlite started in-process,
// i.e. hiqlite's tokio runtime is running alongside Encore's Rust runtime.
export const health = api(
  { expose: true, method: "GET", path: "/hiq/health" },
  async (): Promise<{ status: string }> => ({ status: await hiqlite.health() }),
);

interface PutParams {
  key: string;
  value: string;
}

// POST /hiq/put : write a value into the embedded hiqlite cache.
export const put = api(
  { expose: true, method: "POST", path: "/hiq/put" },
  async ({ key, value }: PutParams): Promise<{ ok: true }> => {
    await hiqlite.put(key, value);
    return { ok: true };
  },
);

interface GetResponse {
  key: string;
  value: string | null;
}

// GET /hiq/get/:key : read it back through the same in-process client.
export const get = api(
  { expose: true, method: "GET", path: "/hiq/get/:key" },
  async ({ key }: { key: string }): Promise<GetResponse> => ({
    key,
    value: await hiqlite.get(key),
  }),
);
