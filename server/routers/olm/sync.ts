import {
    Client,
    db,
    exitNodes,
    Olm,
    sites,
    clientSitesAssociationsCache
} from "@server/db";
import { buildSiteConfigurationForOlmClient } from "./buildConfiguration";
import { sendToClient } from "#dynamic/routers/ws";
import logger from "@server/logger";
import { count, eq, inArray } from "drizzle-orm";
import config from "@server/lib/config";
import { canCompress } from "@server/lib/clientVersionChecks";
import { build } from "@server/build";

export async function sendOlmSyncMessage(olm: Olm, client: Client) {
    // Get all sites data
    const sitesCountResult = await db
        .select({ count: count() })
        .from(sites)
        .innerJoin(
            clientSitesAssociationsCache,
            eq(sites.siteId, clientSitesAssociationsCache.siteId)
        )
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    // Extract the count value from the result array
    const sitesCount =
        sitesCountResult.length > 0 ? sitesCountResult[0].count : 0;

    // Prepare an array to store site configurations
    logger.debug(
        `[handleOlmRegisterMessage] Found ${sitesCount} sites for client ${client.clientId}`,
        { orgId: client.orgId }
    );

    let jitMode = false;
    if (sitesCount > 250 && build == "saas") {
        // THIS IS THE MAX ON THE BUSINESS TIER
        // we have too many sites
        // If we have too many sites we need to drop into fully JIT mode by not sending any of the sites
        logger.info(
            `[handleOlmRegisterMessage] Too many sites (${sitesCount}), dropping into JIT mode`,
            { orgId: client.orgId }
        );
        jitMode = true;
    }

    // NOTE: WE ARE HARDCODING THE RELAY PARAMETER TO FALSE HERE BUT IN THE REGISTER MESSAGE ITS DEFINED BY THE CLIENT
    const siteConfigurations = await buildSiteConfigurationForOlmClient(
        client,
        client.pubKey,
        false,
        jitMode
    );

    // Get all exit nodes from sites where the client has peers
    const clientSites = await db
        .select()
        .from(clientSitesAssociationsCache)
        .innerJoin(sites, eq(sites.siteId, clientSitesAssociationsCache.siteId))
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    // Extract unique exit node IDs
    const exitNodeIds = Array.from(
        new Set(
            clientSites
                .map(({ sites: site }) => site.exitNodeId)
                .filter((id): id is number => id !== null)
        )
    );

    let exitNodesData: {
        publicKey: string;
        relayPort: number;
        endpoint: string;
        siteIds: number[];
    }[] = [];

    if (exitNodeIds.length > 0) {
        const allExitNodes = await db
            .select()
            .from(exitNodes)
            .where(inArray(exitNodes.exitNodeId, exitNodeIds));

        // Map exitNodeId to siteIds
        const exitNodeIdToSiteIds: Record<number, number[]> = {};
        for (const { sites: site } of clientSites) {
            if (site.exitNodeId !== null) {
                if (!exitNodeIdToSiteIds[site.exitNodeId]) {
                    exitNodeIdToSiteIds[site.exitNodeId] = [];
                }
                exitNodeIdToSiteIds[site.exitNodeId].push(site.siteId);
            }
        }

        exitNodesData = allExitNodes.map((exitNode) => {
            return {
                publicKey: exitNode.publicKey,
                relayPort: config.getRawConfig().gerbil.clients_start_port,
                endpoint: exitNode.endpoint,
                siteIds: exitNodeIdToSiteIds[exitNode.exitNodeId] ?? []
            };
        });
    }

    logger.debug("sendOlmSyncMessage: sending sync message");

    await sendToClient(
        olm.olmId,
        {
            type: "olm/sync",
            data: {
                sites: siteConfigurations,
                exitNodes: exitNodesData
            }
        },
        {
            compress: canCompress(olm.version, "olm")
        }
    ).catch((error) => {
        logger.warn(`Error sending olm sync message:`, error);
    });
}
