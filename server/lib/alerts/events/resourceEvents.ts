import logger from "@server/logger";
import { processAlerts } from "#dynamic/lib/alerts";
import { db, logsDb, statusHistory, Transaction } from "@server/db";
import { invalidateStatusHistoryCache } from "@server/lib/statusHistory";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire a `resource_healthy` alert for the given resource.
 *
 * Call this after a previously-unhealthy resource has recovered so that any
 * matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId        - Organisation that owns the resource.
 * @param resourceId   - Numeric primary key of the resource.
 * @param resourceName - Human-readable name shown in notifications (optional).
 * @param extra        - Any additional key/value pairs to include in the payload.
 */
export async function fireResourceHealthyAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await logsDb.insert(statusHistory).values({
            entityType: "resource",
            entityId: resourceId,
            orgId: orgId,
            status: "healthy",
            timestamp: Math.floor(Date.now() / 1000)
        });
        await invalidateStatusHistoryCache("resource", resourceId);

        if (!send) {
            return;
        }

        await processAlerts({
            eventType: "resource_healthy",
            orgId,
            resourceId,
            data: {
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "resource_toggle",
            orgId,
            resourceId,
            data: {
                resourceId,
                status: "healthy",
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireResourceHealthyAlert: unexpected error for resourceId ${resourceId}`,
            err
        );
    }
}

/**
 * Fire a `resource_unhealthy` alert for the given resource.
 *
 * Call this after a resource has been detected as unhealthy so that any
 * matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId        - Organisation that owns the resource.
 * @param resourceId   - Numeric primary key of the resource.
 * @param resourceName - Human-readable name shown in notifications (optional).
 * @param extra        - Any additional key/value pairs to include in the payload.
 */
export async function fireResourceUnhealthyAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await logsDb.insert(statusHistory).values({
            entityType: "resource",
            entityId: resourceId,
            orgId: orgId,
            status: "unhealthy",
            timestamp: Math.floor(Date.now() / 1000)
        });
        await invalidateStatusHistoryCache("resource", resourceId);

        if (!send) {
            return;
        }

        await processAlerts({
            eventType: "resource_unhealthy",
            orgId,
            resourceId,
            data: {
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "resource_toggle",
            orgId,
            resourceId,
            data: {
                resourceId,
                status: "unhealthy",
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireResourceUnhealthyAlert: unexpected error for resourceId ${resourceId}`,
            err
        );
    }
}

/**
 * Fire a `resource_degraded` alert for the given resource.
 *
 * Call this after a resource has been detected as degraded so that any
 * matching `alertRules` can dispatch their email and webhook actions.
 *
 * @param orgId        - Organisation that owns the resource.
 * @param resourceId   - Numeric primary key of the resource.
 * @param resourceName - Human-readable name shown in notifications (optional).
 * @param extra        - Any additional key/value pairs to include in the payload.
 */
export async function fireResourceDegradedAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await logsDb.insert(statusHistory).values({
            entityType: "resource",
            entityId: resourceId,
            orgId: orgId,
            status: "degraded",
            timestamp: Math.floor(Date.now() / 1000)
        });
        await invalidateStatusHistoryCache("resource", resourceId);

        if (!send) {
            return;
        }

        await processAlerts({
            eventType: "resource_degraded",
            orgId,
            resourceId,
            data: {
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
        await processAlerts({
            eventType: "resource_toggle",
            orgId,
            resourceId,
            data: {
                resourceId,
                status: "degraded",
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireResourceDegradedAlert: unexpected error for resourceId ${resourceId}`,
            err
        );
    }
}

/**
 * Fire a `resource_unknown` alert for the given resource.
 *
 * Call this when all health checks on a resource are disabled so that the
 * resource status transitions to unknown.
 *
 * @param orgId        - Organisation that owns the resource.
 * @param resourceId   - Numeric primary key of the resource.
 * @param resourceName - Human-readable name shown in notifications (optional).
 * @param extra        - Any additional key/value pairs to include in the payload.
 */
export async function fireResourceUnknownAlert(
    orgId: string,
    resourceId: number,
    resourceName?: string | null,
    extra?: Record<string, unknown>,
    send: boolean = true,
    trx: Transaction | typeof db = db
): Promise<void> {
    try {
        await logsDb.insert(statusHistory).values({
            entityType: "resource",
            entityId: resourceId,
            orgId: orgId,
            status: "unknown",
            timestamp: Math.floor(Date.now() / 1000)
        });
        await invalidateStatusHistoryCache("resource", resourceId);

        if (!send) {
            return;
        }

        await processAlerts({
            eventType: "resource_toggle",
            orgId,
            resourceId,
            data: {
                resourceId,
                status: "unknown",
                ...(resourceName != null ? { resourceName } : {}),
                ...extra
            }
        });
    } catch (err) {
        logger.error(
            `fireResourceUnknownAlert: unexpected error for resourceId ${resourceId}`,
            err
        );
    }
}
