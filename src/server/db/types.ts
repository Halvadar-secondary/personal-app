import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/** A Drizzle database over our schema; satisfied by both the node-postgres and PGlite drivers. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
