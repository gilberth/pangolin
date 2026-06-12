import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.18.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        // Query existing targetHealthCheck data with joined siteId and orgId before
        // the transaction drops and recreates the table
        const existingHealthChecks = db
            .prepare(
                `SELECT
                    thc."targetHealthCheckId",
                    thc."targetId",
                    t."siteId",
                    s."orgId",
                    r."name" AS "resourceName",
                    t."ip",
                    t."port",
                    thc."hcEnabled",
                    thc."hcPath",
                    thc."hcScheme",
                    thc."hcMode",
                    thc."hcHostname",
                    thc."hcPort",
                    thc."hcInterval",
                    thc."hcUnhealthyInterval",
                    thc."hcTimeout",
                    thc."hcHeaders",
                    thc."hcFollowRedirects",
                    thc."hcMethod",
                    thc."hcStatus",
                    thc."hcHealth",
                    thc."hcTlsServerName"
                FROM 'targetHealthCheck' thc
                JOIN 'targets' t ON thc."targetId" = t."targetId"
                JOIN 'sites' s ON t."siteId" = s."siteId"
                JOIN 'resources' r ON t."resourceId" = r."resourceId"`
            )
            .all() as {
            targetHealthCheckId: number;
            targetId: number;
            siteId: number;
            orgId: string;
            resourceName: string;
            ip: string;
            port: number;
            hcEnabled: number;
            hcPath: string | null;
            hcScheme: string | null;
            hcMode: string | null;
            hcHostname: string | null;
            hcPort: number | null;
            hcInterval: number | null;
            hcUnhealthyInterval: number | null;
            hcTimeout: number | null;
            hcHeaders: string | null;
            hcFollowRedirects: number | null;
            hcMethod: string | null;
            hcStatus: number | null;
            hcHealth: string | null;
            hcTlsServerName: string | null;
        }[];

        console.log(
            `Found ${existingHealthChecks.length} existing targetHealthCheck row(s) to migrate`
        );

        // Query existing siteResources with siteId before the transaction recreates
        // the table without that column. We use this data below to create a dedicated
        // network for each resource.
        const existingSiteResourcesForNetwork = db
            .prepare(
                `SELECT sr."siteResourceId", sr."orgId", sr."siteId"
                 FROM 'siteResources' sr
                 WHERE sr."siteId" IS NOT NULL`
            )
            .all() as {
            siteResourceId: number;
            orgId: string;
            siteId: number;
        }[];

        console.log(
            `Found ${existingSiteResourcesForNetwork.length} existing siteResource(s) to migrate to networks`
        );

        db.transaction(() => {
            db.prepare(
                `
                CREATE TABLE 'alertEmailActions' (
                   	'emailActionId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'alertRuleId' integer NOT NULL,
                   	'enabled' integer DEFAULT true NOT NULL,
                   	'lastSentAt' integer,
                   	FOREIGN KEY ('alertRuleId') REFERENCES 'alertRules'('alertRuleId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'alertEmailRecipients' (
                   	'recipientId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'emailActionId' integer NOT NULL,
                   	'userId' text,
                   	'roleId' integer,
                   	'email' text,
                   	FOREIGN KEY ('emailActionId') REFERENCES 'alertEmailActions'('emailActionId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('userId') REFERENCES 'user'('id') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('roleId') REFERENCES 'roles'('roleId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'alertHealthChecks' (
                   	'alertRuleId' integer NOT NULL,
                   	'healthCheckId' integer NOT NULL,
                   	FOREIGN KEY ('alertRuleId') REFERENCES 'alertRules'('alertRuleId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('healthCheckId') REFERENCES 'targetHealthCheck'('targetHealthCheckId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'alertResources' (
                   	'alertRuleId' integer NOT NULL,
                   	'resourceId' integer NOT NULL,
                   	FOREIGN KEY ('alertRuleId') REFERENCES 'alertRules'('alertRuleId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('resourceId') REFERENCES 'resources'('resourceId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'alertRules' (
                   	'alertRuleId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'orgId' text NOT NULL,
                   	'name' text NOT NULL,
                   	'eventType' text NOT NULL,
                   	'enabled' integer DEFAULT true NOT NULL,
                   	'cooldownSeconds' integer DEFAULT 300 NOT NULL,
                   	'allSites' integer DEFAULT false NOT NULL,
                   	'allHealthChecks' integer DEFAULT false NOT NULL,
                   	'allResources' integer DEFAULT false NOT NULL,
                   	'lastTriggeredAt' integer,
                   	'createdAt' integer NOT NULL,
                   	'updatedAt' integer NOT NULL,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'alertSites' (
                   	'alertRuleId' integer NOT NULL,
                   	'siteId' integer NOT NULL,
                   	FOREIGN KEY ('alertRuleId') REFERENCES 'alertRules'('alertRuleId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'alertWebhookActions' (
                   	'webhookActionId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'alertRuleId' integer NOT NULL,
                   	'webhookUrl' text NOT NULL,
                   	'config' text,
                   	'enabled' integer DEFAULT true NOT NULL,
                   	'lastSentAt' integer,
                   	FOREIGN KEY ('alertRuleId') REFERENCES 'alertRules'('alertRuleId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'networks' (
    	'networkId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    	'niceId' text,
    	'name' text,
    	'scope' text DEFAULT 'global' NOT NULL,
    	'orgId' text NOT NULL,
    	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'siteNetworks' (
                   	'siteId' integer NOT NULL,
                   	'networkId' integer NOT NULL,
                   	FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('networkId') REFERENCES 'networks'('networkId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE 'statusHistory' (
                   	'id' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'entityType' text NOT NULL,
                   	'entityId' integer NOT NULL,
                   	'orgId' text NOT NULL,
                   	'status' text NOT NULL,
                   	'timestamp' integer NOT NULL,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            db.prepare(
                `
                CREATE INDEX 'idx_statusHistory_entity' ON 'statusHistory' ('entityType','entityId','timestamp');
            `
            ).run();
            db.prepare(
                `
                CREATE INDEX 'idx_statusHistory_org_timestamp' ON 'statusHistory' ('orgId','timestamp');
            `
            ).run();

            db.prepare(
                `
                CREATE TABLE '__new_siteResources' (
                   	'siteResourceId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'orgId' text NOT NULL,
                   	'networkId' integer,
                   	'defaultNetworkId' integer,
                   	'niceId' text NOT NULL,
                   	'name' text NOT NULL,
                   	'ssl' integer DEFAULT false NOT NULL,
                   	'mode' text NOT NULL,
                   	'scheme' text,
                   	'proxyPort' integer,
                   	'destinationPort' integer,
                   	'destination' text NOT NULL,
                   	'enabled' integer DEFAULT true NOT NULL,
                   	'alias' text,
                   	'aliasAddress' text,
                   	'tcpPortRangeString' text DEFAULT '*' NOT NULL,
                   	'udpPortRangeString' text DEFAULT '*' NOT NULL,
                   	'disableIcmp' integer DEFAULT false NOT NULL,
                   	'authDaemonPort' integer DEFAULT 22123,
                   	'authDaemonMode' text DEFAULT 'site',
                   	'domainId' text,
                   	'subdomain' text,
                   	'fullDomain' text,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('networkId') REFERENCES 'networks'('networkId') ON UPDATE no action ON DELETE set null,
                   	FOREIGN KEY ('defaultNetworkId') REFERENCES 'networks'('networkId') ON UPDATE no action ON DELETE restrict,
                   	FOREIGN KEY ('domainId') REFERENCES 'domains'('domainId') ON UPDATE no action ON DELETE set null
                );
            `
            ).run();
            db.prepare(
                `
                INSERT INTO '__new_siteResources'("siteResourceId", "orgId", "networkId", "defaultNetworkId", "niceId", "name", "ssl", "mode", "scheme", "proxyPort", "destinationPort", "destination", "enabled", "alias", "aliasAddress", "tcpPortRangeString", "udpPortRangeString", "disableIcmp", "authDaemonPort", "authDaemonMode", "domainId", "subdomain", "fullDomain") SELECT "siteResourceId", "orgId", NULL, NULL, "niceId", "name", 0, "mode", NULL, "proxyPort", "destinationPort", "destination", "enabled", "alias", "aliasAddress", COALESCE("tcpPortRangeString", '*'), COALESCE("udpPortRangeString", '*'), COALESCE("disableIcmp", 0), "authDaemonPort", "authDaemonMode", NULL, NULL, NULL FROM 'siteResources';
            `
            ).run();
            db.prepare(
                `
                DROP TABLE 'siteResources';
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE '__new_siteResources' RENAME TO 'siteResources';
            `
            ).run();
            db.prepare(
                `
                CREATE TABLE '__new_targetHealthCheck' (
                   	'targetHealthCheckId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                   	'targetId' integer,
                   	'orgId' text NOT NULL,
                   	'siteId' integer NOT NULL,
                   	'name' text,
                   	'hcEnabled' integer DEFAULT false NOT NULL,
                   	'hcPath' text,
                   	'hcScheme' text,
                   	'hcMode' text DEFAULT 'http',
                   	'hcHostname' text,
                   	'hcPort' integer,
                   	'hcInterval' integer DEFAULT 30,
                   	'hcUnhealthyInterval' integer DEFAULT 30,
                   	'hcTimeout' integer DEFAULT 5,
                   	'hcHeaders' text,
                   	'hcFollowRedirects' integer DEFAULT true,
                   	'hcMethod' text DEFAULT 'GET',
                   	'hcStatus' integer,
                   	'hcHealth' text DEFAULT 'unknown',
                   	'hcTlsServerName' text,
                   	'hcHealthyThreshold' integer DEFAULT 1,
                   	'hcUnhealthyThreshold' integer DEFAULT 1,
                   	FOREIGN KEY ('targetId') REFERENCES 'targets'('targetId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
                   	FOREIGN KEY ('siteId') REFERENCES 'sites'('siteId') ON UPDATE no action ON DELETE cascade
                );
            `
            ).run();
            // INSERT INTO '__new_targetHealthCheck'("targetHealthCheckId", "targetId", "orgId", "siteId", "name", "hcEnabled", "hcPath", "hcScheme", "hcMode", "hcHostname", "hcPort", "hcInterval", "hcUnhealthyInterval", "hcTimeout", "hcHeaders", "hcFollowRedirects", "hcMethod", "hcStatus", "hcHealth", "hcTlsServerName", "hcHealthyThreshold", "hcUnhealthyThreshold") SELECT "targetHealthCheckId", "targetId", "orgId", "siteId", "name", "hcEnabled", "hcPath", "hcScheme", "hcMode", "hcHostname", "hcPort", "hcInterval", "hcUnhealthyInterval", "hcTimeout", "hcHeaders", "hcFollowRedirects", "hcMethod", "hcStatus", "hcHealth", "hcTlsServerName", "hcHealthyThreshold", "hcUnhealthyThreshold" FROM 'targetHealthCheck';
            db.prepare(
                `
                DROP TABLE 'targetHealthCheck';
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE '__new_targetHealthCheck' RENAME TO 'targetHealthCheck';
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'subscriptions' ADD 'expiresAt' integer;
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'subscriptions' ADD 'trial' integer DEFAULT false;
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'requestAuditLog' ADD 'siteResourceId' integer;
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'sites' ADD 'networkId' integer REFERENCES networks(networkId);
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'resources' ADD 'health' text DEFAULT 'unknown';
            `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'resources' ADD 'wildcard' integer DEFAULT false NOT NULL;
            `
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        // Create a dedicated network for each existing siteResource and link the
        // old siteId via siteNetworks. Then set networkId and defaultNetworkId on
        // the siteResource row so the app can use the new network model.
        if (existingSiteResourcesForNetwork.length > 0) {
            const insertNetwork = db.prepare(
                `INSERT INTO 'networks' ("scope", "orgId") VALUES (?, ?)`
            );
            const insertSiteNetwork = db.prepare(
                `INSERT INTO 'siteNetworks' ("siteId", "networkId") VALUES (?, ?)`
            );
            const updateSiteResource = db.prepare(
                `UPDATE 'siteResources' SET "networkId" = ?, "defaultNetworkId" = ? WHERE "siteResourceId" = ?`
            );

            const migrateNetworks = db.transaction(() => {
                for (const sr of existingSiteResourcesForNetwork) {
                    const result = insertNetwork.run("resource", sr.orgId);
                    const networkId = result.lastInsertRowid as number;
                    insertSiteNetwork.run(sr.siteId, networkId);
                    updateSiteResource.run(
                        networkId,
                        networkId,
                        sr.siteResourceId
                    );
                }
            });

            migrateNetworks();

            console.log(
                `Migrated ${existingSiteResourcesForNetwork.length} siteResource(s) to networks`
            );
        }

        // Re-insert targetHealthCheck rows with corrected IDs:
        // targetHealthCheckId is set to the same integer as targetId (1:1 mapping),
        // siteId and orgId are populated from the associated target and site.
        //
        // Because targetHealthCheckId is AUTOINCREMENT, inserting explicit values is
        // allowed, but sqlite_sequence must be updated afterwards so future
        // auto-increments don't reuse or collide with these IDs.
        if (existingHealthChecks.length > 0) {
            const insertHealthCheck = db.prepare(
                `INSERT INTO 'targetHealthCheck' (
                    "targetHealthCheckId",
                    "targetId",
                    "orgId",
                    "siteId",
                    "name",
                    "hcEnabled",
                    "hcPath",
                    "hcScheme",
                    "hcMode",
                    "hcHostname",
                    "hcPort",
                    "hcInterval",
                    "hcUnhealthyInterval",
                    "hcTimeout",
                    "hcHeaders",
                    "hcFollowRedirects",
                    "hcMethod",
                    "hcStatus",
                    "hcHealth",
                    "hcTlsServerName"
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            const insertAll = db.transaction(() => {
                for (const hc of existingHealthChecks) {
                    insertHealthCheck.run(
                        hc.targetId, // targetHealthCheckId = targetId (explicit, non-sequential is fine)
                        hc.targetId,
                        hc.orgId,
                        hc.siteId,
                        `Resource ${hc.resourceName} - ${hc.ip}:${hc.port}`,
                        hc.hcEnabled,
                        hc.hcPath,
                        hc.hcScheme,
                        hc.hcMode,
                        hc.hcHostname,
                        hc.hcPort,
                        hc.hcInterval,
                        hc.hcUnhealthyInterval,
                        hc.hcTimeout,
                        hc.hcHeaders,
                        hc.hcFollowRedirects,
                        hc.hcMethod,
                        hc.hcStatus,
                        hc.hcHealth,
                        hc.hcTlsServerName
                    );
                }
            });

            insertAll();

            // Ensure sqlite_sequence reflects the true max so that future
            // AUTOINCREMENT inserts never reuse one of the explicitly-set IDs.
            // INSERT OR IGNORE handles the case where no auto-insert has happened
            // yet and the row doesn't exist in sqlite_sequence.
            db.prepare(
                `INSERT OR IGNORE INTO sqlite_sequence (name, seq) VALUES ('targetHealthCheck', 0)`
            ).run();
            db.prepare(
                `UPDATE sqlite_sequence
                 SET seq = MAX(seq, (SELECT COALESCE(MAX("targetHealthCheckId"), 0) FROM 'targetHealthCheck'))
                 WHERE name = 'targetHealthCheck'`
            ).run();

            console.log(
                `Migrated ${existingHealthChecks.length} targetHealthCheck row(s) with corrected IDs`
            );
        }

        console.log(`Migrated database`);

        // Seed statusHistory for all existing sites
        const allSites = db
            .prepare(`SELECT "siteId", "orgId", "online" FROM 'sites'`)
            .all() as { siteId: number; orgId: string; online: number }[];

        const insertSiteHistory = db.prepare(
            `INSERT INTO 'statusHistory' ("entityType", "entityId", "orgId", "status", "timestamp") VALUES (?, ?, ?, ?, ?)`
        );
        const now = Math.floor(Date.now() / 1000);
        const seedSites = db.transaction(() => {
            for (const site of allSites) {
                insertSiteHistory.run(
                    "site",
                    site.siteId,
                    site.orgId,
                    site.online ? "online" : "offline",
                    now
                );
            }
        });
        seedSites();
        console.log(`Seeded statusHistory for ${allSites.length} site(s)`);

        // Seed statusHistory for all existing resources
        const allResources = db
            .prepare(`SELECT "resourceId", "orgId", "health" FROM 'resources'`)
            .all() as {
            resourceId: number;
            orgId: string;
            health: string | null;
        }[];

        const insertResourceHistory = db.prepare(
            `INSERT INTO 'statusHistory' ("entityType", "entityId", "orgId", "status", "timestamp") VALUES (?, ?, ?, ?, ?)`
        );
        const seedResources = db.transaction(() => {
            for (const resource of allResources) {
                insertResourceHistory.run(
                    "resource",
                    resource.resourceId,
                    resource.orgId,
                    resource.health ?? "unknown",
                    now
                );
            }
        });
        seedResources();
        console.log(
            `Seeded statusHistory for ${allResources.length} resource(s)`
        );

        // Recompute resource health by aggregating across the resource's
        // targets' target health checks, then update resources.health.
        const resourceTargetHealthRows = db
            .prepare(
                `SELECT
                    r."resourceId" AS "resourceId",
                    thc."hcHealth" AS "hcHealth"
                 FROM 'resources' r
                 LEFT JOIN 'targets' t ON t."resourceId" = r."resourceId"
                 LEFT JOIN 'targetHealthCheck' thc ON thc."targetId" = t."targetId"`
            )
            .all() as {
            resourceId: number;
            hcHealth: string | null;
        }[];

        const resourceHealthMap = new Map<
            number,
            {
                hasHealthy: boolean;
                hasUnhealthy: boolean;
                hasUnknown: boolean;
            }
        >();
        for (const row of resourceTargetHealthRows) {
            const entry = resourceHealthMap.get(row.resourceId) ?? {
                hasHealthy: false,
                hasUnhealthy: false,
                hasUnknown: false
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
        const recomputeResourceHealth = db.transaction(() => {
            for (const [resourceId, flags] of resourceHealthMap.entries()) {
                let aggregated:
                    | "healthy"
                    | "unhealthy"
                    | "degraded"
                    | "unknown";
                if (flags.hasHealthy && flags.hasUnhealthy) {
                    aggregated = "degraded";
                } else if (flags.hasHealthy) {
                    aggregated = "healthy";
                } else if (flags.hasUnhealthy) {
                    aggregated = "unhealthy";
                } else {
                    aggregated = "unknown";
                }
                updateResourceHealth.run(aggregated, resourceId);
            }
        });
        recomputeResourceHealth();
        console.log(
            `Recomputed health for ${resourceHealthMap.size} resource(s) based on target health checks`
        );

        // Seed statusHistory for all existing health checks
        const allHealthChecks = db
            .prepare(
                `SELECT "targetHealthCheckId", "orgId", "hcHealth" FROM 'targetHealthCheck'`
            )
            .all() as {
            targetHealthCheckId: number;
            orgId: string;
            hcHealth: string | null;
        }[];

        const insertHealthCheckHistory = db.prepare(
            `INSERT INTO 'statusHistory' ("entityType", "entityId", "orgId", "status", "timestamp") VALUES (?, ?, ?, ?, ?)`
        );
        const seedHealthChecks = db.transaction(() => {
            for (const hc of allHealthChecks) {
                insertHealthCheckHistory.run(
                    "health_check",
                    hc.targetHealthCheckId,
                    hc.orgId,
                    hc.hcHealth ?? "unknown",
                    now
                );
            }
        });
        seedHealthChecks();
        console.log(
            `Seeded statusHistory for ${allHealthChecks.length} health check(s)`
        );
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
