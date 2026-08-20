// TEMPORARY scoping file — scores ONE surface. Deleted immediately after the run;
// never committed. `_metaSourceShardIntegrity` pins the four committed shard
// files byte-for-byte and would red while this exists.
import { GUARD_SURFACES } from "./source/registry";
import { registerSurfaceCases } from "./source/surfaceCases";

registerSurfaceCases(GUARD_SURFACES.filter((s) => s.id === "sendAuthScan"));
