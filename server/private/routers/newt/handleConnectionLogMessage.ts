/*
 * This file is part of a proprietary work.
 *
 * Copyright (c) 2025-2026 Fossorial, Inc.
 * All rights reserved.
 *
 * This file is licensed under the Fossorial Commercial License.
 * You may not use this file except in compliance with the License.
 * Unauthorized use, copying, modification, or distribution is strictly prohibited.
 *
 * This file is not licensed under the AGPLv3.
 */

import { clientSitesAssociationsCache, db } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { sites, Newt, clients, orgs } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import logger from "@server/logger";
import { inflate } from "zlib";
import { promisify } from "util";
import {
    logConnectionAudit,
    flushConnectionLogToDb,
    cleanUpOldLogs
} from "#private/lib/logConnectionAudit";

export { flushConnectionLogToDb, cleanUpOldLogs };

const zlibInflate = promisify(inflate);

interface ConnectionSessionData {
    sessionId: string;
    resourceId: number;
    sourceAddr: string;
    destAddr: string;
    protocol: string;
    startedAt: string; // ISO 8601 timestamp
    endedAt?: string; // ISO 8601 timestamp
    bytesTx?: number;
    bytesRx?: number;
}

/**
 * Decompress a base64-encoded zlib-compressed string into parsed JSON.
 */
async function decompressConnectionLog(
    compressed: string
): Promise<ConnectionSessionData[]> {
    const compressedBuffer = Buffer.from(compressed, "base64");
    const decompressed = await zlibInflate(compressedBuffer);
    const jsonString = decompressed.toString("utf-8");
    const parsed = JSON.parse(jsonString);

    if (!Array.isArray(parsed)) {
        throw new Error("Decompressed connection log data is not an array");
    }

    return parsed;
}

/**
 * Convert an ISO 8601 timestamp string to epoch seconds.
 * Returns null if the input is falsy.
 */
function toEpochSeconds(isoString: string | undefined | null): number | null {
    if (!isoString) {
        return null;
    }
    const ms = new Date(isoString).getTime();
    if (isNaN(ms)) {
        return null;
    }
    return Math.floor(ms / 1000);
}

export const handleConnectionLogMessage: MessageHandler = async (context) => {
    const { message, client } = context;
    const newt = client as Newt;

    if (!newt) {
        logger.warn("Connection log received but no newt client in context");
        return;
    }

    if (!newt.siteId) {
        logger.warn("Connection log received but newt has no siteId");
        return;
    }

    if (!message.data?.compressed) {
        logger.warn("Connection log message missing compressed data");
        return;
    }

    // Look up the org for this site and check retention settings
    const [site] = await db
        .select({
            orgId: sites.orgId,
            orgSubnet: orgs.subnet,
            settingsLogRetentionDaysConnection:
                orgs.settingsLogRetentionDaysConnection
        })
        .from(sites)
        .innerJoin(orgs, eq(sites.orgId, orgs.orgId))
        .where(eq(sites.siteId, newt.siteId));

    if (!site) {
        logger.warn(
            `Connection log received but site ${newt.siteId} not found in database`
        );
        return;
    }

    const orgId = site.orgId;

    if (site.settingsLogRetentionDaysConnection === 0) {
        logger.debug(
            `Connection log retention is disabled for org ${orgId}, skipping`
        );
        return;
    }

    // Extract the CIDR suffix (e.g. "/16") from the org subnet so we can
    // reconstruct the exact subnet string stored on each client record.
    const cidrSuffix = site.orgSubnet?.includes("/")
        ? site.orgSubnet.substring(site.orgSubnet.indexOf("/"))
        : null;

    let sessions: ConnectionSessionData[];
    try {
        sessions = await decompressConnectionLog(message.data.compressed);
    } catch (error) {
        logger.error("Failed to decompress connection log data:", error);
        return;
    }

    if (sessions.length === 0) {
        return;
    }

    logger.debug(`Sessions: ${JSON.stringify(sessions)}`);

    // Build a map from sourceAddr → { clientId, userId } by querying clients
    // whose subnet field matches exactly. Client subnets are stored with the
    // org's CIDR suffix (e.g. "100.90.128.5/16"), so we reconstruct that from
    // each unique sourceAddr + the org's CIDR suffix and do a targeted IN query.
    const ipToClient = new Map<
        string,
        {
            clientId: number;
            userId: string | null;
            clientEndpoint: string | null;
        }
    >();

    if (cidrSuffix) {
        // Collect unique source addresses so we only query for what we need
        const uniqueSourceAddrs = new Set<string>();
        for (const session of sessions) {
            if (session.sourceAddr) {
                uniqueSourceAddrs.add(session.sourceAddr);
            }
        }

        if (uniqueSourceAddrs.size > 0) {
            // Construct the exact subnet strings as stored in the DB
            const subnetQueries = Array.from(uniqueSourceAddrs).map((addr) => {
                // Strip port if present (e.g. "100.90.128.1:38004" → "100.90.128.1")
                const ip = addr.includes(":") ? addr.split(":")[0] : addr;
                return `${ip}${cidrSuffix}`;
            });

            logger.debug(`Subnet queries: ${JSON.stringify(subnetQueries)}`);

            const matchedClients = await db
                .select({
                    clientId: clients.clientId,
                    userId: clients.userId,
                    subnet: clients.subnet,
                    clientEndpoint: clientSitesAssociationsCache.endpoint
                })
                .from(clients)
                .leftJoin(
                    // this should be one to one
                    clientSitesAssociationsCache,
                    and(
                        eq(
                            clients.clientId,
                            clientSitesAssociationsCache.clientId
                        ),
                        eq(clientSitesAssociationsCache.siteId, newt.siteId)
                    )
                )
                .where(
                    and(
                        eq(clients.orgId, orgId),
                        inArray(clients.subnet, subnetQueries)
                    )
                );

            for (const c of matchedClients) {
                const ip = c.subnet.split("/")[0];
                logger.debug(
                    `Client ${c.clientId} subnet ${c.subnet} matches ${ip}`
                );
                ipToClient.set(ip, {
                    clientId: c.clientId,
                    userId: c.userId,
                    clientEndpoint: c.clientEndpoint
                });
            }
        }
    }

    // Convert to DB records and hand off to the audit logger
    for (const session of sessions) {
        // Validate required fields
        if (
            !session.sessionId ||
            !session.resourceId ||
            !session.sourceAddr ||
            !session.destAddr ||
            !session.protocol
        ) {
            logger.debug(
                `Skipping connection log session with missing required fields: ${JSON.stringify(session)}`
            );
            continue;
        }

        const startedAt = toEpochSeconds(session.startedAt);
        if (startedAt === null) {
            logger.debug(
                `Skipping connection log session with invalid startedAt: ${session.startedAt}`
            );
            continue;
        }

        // Match the source address to a client. The sourceAddr is the
        // client's IP on the WireGuard network, which corresponds to the IP
        // portion of the client's subnet CIDR (e.g. "100.90.128.5/24").
        // Strip port if present (e.g. "100.90.128.1:38004" → "100.90.128.1")
        const sourceIp = session.sourceAddr.includes(":")
            ? session.sourceAddr.split(":")[0]
            : session.sourceAddr;
        const clientInfo = ipToClient.get(sourceIp) ?? null;

        logConnectionAudit({
            sessionId: session.sessionId,
            siteResourceId: session.resourceId,
            orgId,
            siteId: newt.siteId,
            clientId: clientInfo?.clientId ?? null,
            clientEndpoint: clientInfo?.clientEndpoint ?? null,
            userId: clientInfo?.userId ?? null,
            sourceAddr: session.sourceAddr,
            destAddr: session.destAddr,
            protocol: session.protocol,
            startedAt,
            endedAt: toEpochSeconds(session.endedAt),
            bytesTx: session.bytesTx ?? null,
            bytesRx: session.bytesRx ?? null
        });
    }

    logger.debug(
        `Buffered ${sessions.length} connection log session(s) from newt ${newt.newtId} (site ${newt.siteId})`
    );
};
