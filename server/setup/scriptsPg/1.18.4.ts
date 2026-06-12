import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.18.4";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            ALTER TABLE "connectionAuditLog" ADD COLUMN "clientEndpoint" text;
        `);

        await db.execute(sql`
            ALTER TABLE "eventStreamingDestinations" ADD COLUMN "lastError" text;
        `);

        await db.execute(sql`
            ALTER TABLE "eventStreamingDestinations" ADD COLUMN "lastErrorAt" bigint;
        `);

        await db.execute(sql`COMMIT`);
        console.log("Migrated database");
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
