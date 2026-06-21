import { Service } from "encore.dev/service";

/**
 * `lib` is a no-endpoint service. It exists so Encore's tsparser will allow
 * `secret(...)` declarations at module top-level in `lib/secrets.ts` (Encore
 * requires secrets to be loaded from within a service directory).
 *
 * No `api()` endpoints live here. Cross-service code imports `lib/*` modules
 * directly via relative imports, not via `~encore/clients`.
 */
export default new Service("lib");
