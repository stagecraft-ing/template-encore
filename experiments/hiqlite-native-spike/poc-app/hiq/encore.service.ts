import { Service } from "encore.dev/service";

// One service, one endpoint set. No middleware, no auth: the spike only needs a
// reachable handler that calls into the native hiqlite addon.
export default new Service("hiq");
