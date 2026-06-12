import { db } from "@server/db/pg/driver";
import { sql } from "drizzle-orm";

const version = "1.18.3";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    // Query existing targetHealthCheck data with joined siteId and orgId before
    // the transaction adds the new columns (which start NULL for existing rows).
    // We will delete all rows and reinsert them with targetHealthCheckId = targetId
    // so the two IDs form a stable 1:1 mapping.
    const healthChecksQuery = await db.execute(
        sql`SELECT
                thc."targetHealthCheckId",
                thc."targetId",
                t."siteId",
                s."orgId",
                r."name" AS "resourceName",
                t."ip",
                t."port"
            FROM "targetHealthCheck" thc
            JOIN "targets" t ON thc."targetId" = t."targetId"
            JOIN "sites" s ON t."siteId" = s."siteId"
            JOIN "resources" r ON t."resourceId" = r."resourceId"
            WHERE thc."name" IS NULL OR thc."name" = ''`
    );

    const existingHealthChecks = healthChecksQuery.rows as {
        targetHealthCheckId: number;
        targetId: number;
        siteId: number;
        orgId: string;
        resourceName: string;
        ip: string;
        port: number;
    }[];

    console.log(
        `Found ${existingHealthChecks.length} existing targetHealthCheck row(s) to migrate`
    );

    try {
        await db.execute(sql`BEGIN`);

        await db.execute(sql`
            CREATE TABLE IF NOT EXISTS "trialNotifications" (
               	"notificationId" serial PRIMARY KEY NOT NULL,
               	"subscriptionId" varchar(255) NOT NULL,
               	"notificationType" varchar(50) NOT NULL,
               	"sentAt" bigint NOT NULL
            );
        `);

        await db.execute(sql`COMMIT`);
        console.log("Migrated database");
    } catch (e) {
        await db.execute(sql`ROLLBACK`);
        console.log("Unable to migrate database");
        console.log(e);
        throw e;
    }

    if (existingHealthChecks.length > 0) {
        // fix the name column
        try {
            for (const hc of existingHealthChecks) {
                await db.execute(sql`
                    UPDATE "targetHealthCheck"
                    SET "name" = ${`Resource ${hc.resourceName} - ${hc.ip}:${hc.port}`}
                    WHERE "targetHealthCheckId" = ${hc.targetHealthCheckId}
                `);
            }

            console.log(
                `Updated names for ${existingHealthChecks.length} existing targetHealthCheck row(s)`
            );
        } catch (e) {
            console.error("Error while migrating targetHealthCheck rows:", e);
            throw e;
        }
    }

    // Recompute resource health by aggregating across the resource's targets'
    // target health checks, then update the resources.health column to match.
    try {
        const resourceTargetHealthQuery = await db.execute(
            sql`SELECT
                    r."resourceId" AS "resourceId",
                    r."orgId" AS "orgId",
                    r."health" AS "currentHealth",
                    thc."hcHealth" AS "hcHealth"
                FROM "resources" r
                LEFT JOIN "targets" t ON t."resourceId" = r."resourceId"
                LEFT JOIN "targetHealthCheck" thc ON thc."targetId" = t."targetId"`
        );
        const resourceTargetHealthRows = resourceTargetHealthQuery.rows as {
            resourceId: number;
            orgId: string;
            currentHealth: string | null;
            hcHealth: string | null;
        }[];

        const resourceHealthMap = new Map<
            number,
            {
                hasHealthy: boolean;
                hasUnhealthy: boolean;
                hasUnknown: boolean;
                orgId: string;
                currentHealth: string | null;
            }
        >();
        for (const row of resourceTargetHealthRows) {
            const entry = resourceHealthMap.get(row.resourceId) ?? {
                hasHealthy: false,
                hasUnhealthy: false,
                hasUnknown: false,
                orgId: row.orgId,
                currentHealth: row.currentHealth
            };
            const status = row.hcHealth ?? "unknown";
            if (status === "healthy") entry.hasHealthy = true;
            else if (status === "unhealthy") entry.hasUnhealthy = true;
            else entry.hasUnknown = true;
            resourceHealthMap.set(row.resourceId, entry);
        }

        const now = Math.floor(Date.now() / 1000);
        let updatedResourceCount = 0;
        for (const [resourceId, entry] of resourceHealthMap.entries()) {
            let aggregated: "healthy" | "unhealthy" | "degraded" | "unknown";
            if (entry.hasHealthy && entry.hasUnhealthy) {
                aggregated = "degraded";
            } else if (entry.hasHealthy) {
                aggregated = "healthy";
            } else if (entry.hasUnhealthy) {
                aggregated = "unhealthy";
            } else {
                aggregated = "unknown";
            }

            if (entry.currentHealth !== aggregated) {
                await db.execute(sql`
                    UPDATE "resources"
                    SET "health" = ${aggregated}
                    WHERE "resourceId" = ${resourceId}
                `);
                await db.execute(sql`
                    INSERT INTO "statusHistory" ("entityType", "entityId", "orgId", "status", "timestamp")
                    VALUES ('resource', ${resourceId}, ${entry.orgId}, ${aggregated}, ${now})
                `);
                updatedResourceCount++;
            }
        }

        console.log(
            `Recomputed health for ${updatedResourceCount} resource(s) based on target health checks`
        );
    } catch (e) {
        console.error(
            "Error while recomputing resource health from target health checks:",
            e
        );
        throw e;
    }

    console.log(`${version} migration complete`);
}
