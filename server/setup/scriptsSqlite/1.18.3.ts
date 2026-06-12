import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.18.3";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            db.prepare(
                `
                    CREATE TABLE IF NOT EXISTS 'trialNotifications' (
                       	'notificationId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                       	'subscriptionId' text NOT NULL,
                       	'notificationType' text NOT NULL,
                       	'sentAt' integer NOT NULL,
                       	FOREIGN KEY ('subscriptionId') REFERENCES 'subscriptions'('subscriptionId') ON UPDATE no action ON DELETE cascade
                    );
            `
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        console.log("Migrated database");

        // Fix names for health checks that don't have one
        const healthChecksWithoutName = db
            .prepare(
                `SELECT
                    thc."targetHealthCheckId",
                    r."name" AS "resourceName",
                    t."ip",
                    t."port"
                FROM 'targetHealthCheck' thc
                JOIN 'targets' t ON thc."targetId" = t."targetId"
                JOIN 'resources' r ON t."resourceId" = r."resourceId"
                WHERE thc."name" IS NULL OR thc."name" = ''`
            )
            .all() as {
            targetHealthCheckId: number;
            resourceName: string;
            ip: string;
            port: number;
        }[];

        console.log(
            `Found ${healthChecksWithoutName.length} targetHealthCheck row(s) with missing names`
        );

        if (healthChecksWithoutName.length > 0) {
            const updateName = db.prepare(
                `UPDATE 'targetHealthCheck' SET "name" = ? WHERE "targetHealthCheckId" = ?`
            );
            const updateAllNames = db.transaction(() => {
                for (const hc of healthChecksWithoutName) {
                    updateName.run(
                        `Resource ${hc.resourceName} - ${hc.ip}:${hc.port}`,
                        hc.targetHealthCheckId
                    );
                }
            });
            updateAllNames();
            console.log(
                `Updated names for ${healthChecksWithoutName.length} targetHealthCheck row(s)`
            );
        }

        // Recompute resource health by aggregating across the resource's
        // targets' target health checks, then update resources.health and
        // insert a statusHistory entry for any resource whose health changed.
        const resourceTargetHealthRows = db
            .prepare(
                `SELECT
                    r."resourceId" AS "resourceId",
                    r."orgId" AS "orgId",
                    r."health" AS "currentHealth",
                    thc."hcHealth" AS "hcHealth"
                 FROM 'resources' r
                 LEFT JOIN 'targets' t ON t."resourceId" = r."resourceId"
                 LEFT JOIN 'targetHealthCheck' thc ON thc."targetId" = t."targetId"`
            )
            .all() as {
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

        const updateResourceHealth = db.prepare(
            `UPDATE 'resources' SET "health" = ? WHERE "resourceId" = ?`
        );
        const insertResourceHistory = db.prepare(
            `INSERT INTO 'statusHistory' ("entityType", "entityId", "orgId", "status", "timestamp") VALUES (?, ?, ?, ?, ?)`
        );

        const now = Math.floor(Date.now() / 1000);
        let updatedResourceCount = 0;

        const recomputeAll = db.transaction(() => {
            for (const [resourceId, entry] of resourceHealthMap.entries()) {
                let aggregated:
                    | "healthy"
                    | "unhealthy"
                    | "degraded"
                    | "unknown";
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
                    updateResourceHealth.run(aggregated, resourceId);
                    insertResourceHistory.run(
                        "resource",
                        resourceId,
                        entry.orgId,
                        aggregated,
                        now
                    );
                    updatedResourceCount++;
                }
            }
        });
        recomputeAll();
        console.log(
            `Recomputed health for ${updatedResourceCount} resource(s) based on target health checks`
        );
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
