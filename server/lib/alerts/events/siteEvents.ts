import logger from "@server/logger";
import { processAlerts } from "#dynamic/lib/alerts";
import {
    db,
    logsDb,
    statusHistory,
    targetHealthCheck,
    Transaction
} from "@server/db";
import { invalidateStatusHistoryCache } from "@server/lib/statusHistory";
import { and, eq, inArray } from "drizzle-orm";
import { fireHealthCheckUnhealthyAlert } from "./healthCheckEvents";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire a `site_online` alert for the given site.
 *
 * Call this after the site has been confirmed reachable / connected so that
 * any matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId    - Organisation that owns the site.
 * @param siteId   - Numeric primary key of the site.
 * @param siteName - Human-readable name shown in notifications (optional).
 * @param extra    - Any additional key/value pairs to include in the payload.
 */
export async function fireSiteOnlineAlert(
    orgId: string,
    siteId: number,
    siteName?: string,
    extra?: Record<string, unknown>,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await logsDb.insert(statusHistory).values({
            entityType: "site",
            entityId: siteId,
            orgId: orgId,
            status: "online",
            timestamp: Math.floor(Date.now() / 1000)
        });
        await invalidateStatusHistoryCache("site", siteId);

        await processAlerts({
            eventType: "site_online",
            orgId,
            siteId,
            data: {
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "site_toggle",
            orgId,
            siteId,
            data: {
                siteId,
                status: "online",
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireSiteOnlineAlert: unexpected error for siteId ${siteId}`,
            err
        );
    }
}

/**
 * Fire a `site_offline` alert for the given site.
 *
 * Call this after the site has been detected as unreachable / disconnected so
 * that any matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId    - Organisation that owns the site.
 * @param siteId   - Numeric primary key of the site.
 * @param siteName - Human-readable name shown in notifications (optional).
 * @param extra    - Any additional key/value pairs to include in the payload.
 */
export async function fireSiteOfflineAlert(
    orgId: string,
    siteId: number,
    siteName?: string,
    extra?: Record<string, unknown>,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await logsDb.insert(statusHistory).values({
            entityType: "site",
            entityId: siteId,
            orgId: orgId,
            status: "offline",
            timestamp: Math.floor(Date.now() / 1000)
        });
        await invalidateStatusHistoryCache("site", siteId);

        const unhealthyHealthChecks = await trx
            .update(targetHealthCheck)
            .set({ hcHealth: "unhealthy" })
            .where(
                and(
                    eq(targetHealthCheck.orgId, orgId),
                    eq(targetHealthCheck.siteId, siteId),
                    eq(targetHealthCheck.hcEnabled, true) // only effect the ones that are enabled
                )
            )
            .returning();

        for (const healthCheck of unhealthyHealthChecks) {
            logger.info(
                `Marking health check ${healthCheck.targetHealthCheckId} unhealthy due to site ${siteId} being marked offline`
            );

            await fireHealthCheckUnhealthyAlert(
                healthCheck.orgId,
                healthCheck.targetHealthCheckId,
                healthCheck.name,
                healthCheck.targetId, // for the resource if we have one
                undefined,
                true,
                trx
            );
        }

        await processAlerts({
            eventType: "site_offline",
            orgId,
            siteId,
            data: {
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "site_toggle",
            orgId,
            siteId,
            data: {
                siteId,
                status: "offline",
                ...(siteName != null ? { siteName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireSiteOfflineAlert: unexpected error for siteId ${siteId}`,
            err
        );
    }
}
