// Plain-Node sanity check: load the addon, start hiqlite in-process, round-trip.
import { health, put, get } from "./index.js";

const t0 = Date.now();
console.log("health:", await health());
console.log(`  (hiqlite started in ${Date.now() - t0}ms)`);

await put("greeting", "hello from hiqlite via napi");
const v = await get("greeting");
console.log("get greeting:", JSON.stringify(v));

const miss = await get("does-not-exist");
console.log("get missing:", JSON.stringify(miss));

if (v !== "hello from hiqlite via napi" || miss !== null) {
  console.error("FAIL: round-trip mismatch");
  process.exit(1);
}
console.log("PASS: put/get round-trip through embedded hiqlite");
process.exit(0);
