// tests/mutation/guardSurfaces.shard6.test.ts
// One LPT slice of the enrolled source-mutation surfaces (wall-clock spec §3.2).
// Runs ONLY in the env-gated `mutation` vitest project. All shard files are this
// same template with only the SOURCE_SHARD literal and this filename differing --
// pinned byte-for-byte by tests/mutation/_metaSourceShardIntegrity.test.ts.
//
// Filtering goes through `surfacesForShard`, the one definition the gates file
// also proves total and disjoint. A shard file never writes its own filter.
import { surfacesForShard } from "./source/shardPartition";
import { registerSurfaceCases } from "./source/surfaceCases";

const SOURCE_SHARD = 6;

registerSurfaceCases(surfacesForShard(SOURCE_SHARD));
