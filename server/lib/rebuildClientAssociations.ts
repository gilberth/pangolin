import {
    Client,
    clients,
    clientSiteResources,
    clientSiteResourcesAssociationsCache,
    clientSitesAssociationsCache,
    db,
    exitNodes,
    newts,
    olms,
    roleSiteResources,
    Site,
    SiteResource,
    siteNetworks,
    siteResources,
    sites,
    Transaction,
    userOrgRoles,
    userSiteResources
} from "@server/db";
import { and, count, eq, inArray, ne } from "drizzle-orm";

import { deletePeer as newtDeletePeer } from "@server/routers/newt/peers";
import {
    initPeerAddHandshake,
    deletePeer as olmDeletePeer
} from "@server/routers/olm/peers";
import { sendToExitNode } from "#dynamic/lib/exitNodes";
import logger from "@server/logger";
import {
    generateAliasConfig,
    generateRemoteSubnets,
    generateSubnetProxyTargetV2,
    parseEndpoint
} from "@server/lib/ip";
import {
    addPeerData,
    addTargets as addSubnetProxyTargets,
    removePeerData,
    removeTargets as removeSubnetProxyTargets
} from "@server/routers/client/targets";
import { lockManager } from "#dynamic/lib/lock";

// TTL for rebuild-association locks. These functions can fan out into many
// peer/proxy updates, so give them a generous window.
const REBUILD_ASSOCIATIONS_LOCK_TTL_MS = 120000;

export async function getClientSiteResourceAccess(
    siteResource: SiteResource,
    trx: Transaction | typeof db = db
) {
    // get all sites associated with this siteResource via its network
    const sitesList = siteResource.networkId
        ? await trx
              .select()
              .from(sites)
              .innerJoin(siteNetworks, eq(siteNetworks.siteId, sites.siteId))
              .where(eq(siteNetworks.networkId, siteResource.networkId))
              .then((rows) => rows.map((row) => row.sites))
        : [];

    logger.debug(
        `rebuildClientAssociations: [getClientSiteResourceAccess] siteResourceId=${siteResource.siteResourceId} networkId=${siteResource.networkId} siteCount=${sitesList.length} siteIds=[${sitesList.map((s) => s.siteId).join(", ")}]`
    );

    if (sitesList.length === 0) {
        logger.warn(
            `No sites found for siteResource ${siteResource.siteResourceId} with networkId ${siteResource.networkId}`
        );
    }

    const roleIds = await trx
        .select()
        .from(roleSiteResources)
        .where(
            eq(roleSiteResources.siteResourceId, siteResource.siteResourceId)
        )
        .then((rows) => rows.map((row) => row.roleId));

    const directUserIds = await trx
        .select()
        .from(userSiteResources)
        .where(
            eq(userSiteResources.siteResourceId, siteResource.siteResourceId)
        )
        .then((rows) => rows.map((row) => row.userId));

    // get all of the users in these roles
    const userIdsFromRoles = await trx
        .select({
            userId: userOrgRoles.userId
        })
        .from(userOrgRoles)
        .where(inArray(userOrgRoles.roleId, roleIds))
        .then((rows) => rows.map((row) => row.userId));

    const newAllUserIds = Array.from(
        new Set([...directUserIds, ...userIdsFromRoles])
    );

    const newAllClients = await trx
        .select({
            clientId: clients.clientId,
            pubKey: clients.pubKey,
            subnet: clients.subnet
        })
        .from(clients)
        .where(
            and(
                inArray(clients.userId, newAllUserIds),
                eq(clients.orgId, siteResource.orgId) // filter by org to prevent cross-org associations
            )
        );

    const allClientSiteResources = await trx // this is for if a client is directly associated with a resource instead of implicitly via a user
        .select()
        .from(clientSiteResources)
        .where(
            eq(clientSiteResources.siteResourceId, siteResource.siteResourceId)
        );

    const directClientIds = allClientSiteResources.map((row) => row.clientId);

    // Get full client details for directly associated clients
    const directClients =
        directClientIds.length > 0
            ? await trx
                  .select({
                      clientId: clients.clientId,
                      pubKey: clients.pubKey,
                      subnet: clients.subnet
                  })
                  .from(clients)
                  .where(
                      and(
                          inArray(clients.clientId, directClientIds),
                          eq(clients.orgId, siteResource.orgId) // filter by org to prevent cross-org associations
                      )
                  )
            : [];

    // Merge user-based clients with directly associated clients
    const allClientsMap = new Map(
        [...newAllClients, ...directClients].map((c) => [c.clientId, c])
    );
    const mergedAllClients = Array.from(allClientsMap.values());
    const mergedAllClientIds = mergedAllClients.map((c) => c.clientId);

    logger.debug(
        `rebuildClientAssociations: [getClientSiteResourceAccess] siteResourceId=${siteResource.siteResourceId} mergedClientCount=${mergedAllClientIds.length} clientIds=[${mergedAllClientIds.join(", ")}] (userBased=${newAllClients.length} direct=${directClients.length})`
    );

    return {
        sitesList,
        mergedAllClients,
        mergedAllClientIds
    };
}

export async function rebuildClientAssociationsFromSiteResource(
    siteResource: SiteResource,
    trx: Transaction | typeof db = db
): Promise<{
    mergedAllClients: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    }[];
}> {
    return await lockManager.withLock(
        `rebuild-client-associations:site-resource:${siteResource.siteResourceId}`,
        () => rebuildClientAssociationsFromSiteResourceImpl(siteResource, trx),
        REBUILD_ASSOCIATIONS_LOCK_TTL_MS
    );
}

async function rebuildClientAssociationsFromSiteResourceImpl(
    siteResource: SiteResource,
    trx: Transaction | typeof db = db
): Promise<{
    mergedAllClients: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    }[];
}> {
    logger.debug(
        `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] START siteResourceId=${siteResource.siteResourceId} networkId=${siteResource.networkId} orgId=${siteResource.orgId}`
    );

    const { sitesList, mergedAllClients, mergedAllClientIds } =
        await getClientSiteResourceAccess(siteResource, trx);

    logger.debug(
        `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] access resolved siteResourceId=${siteResource.siteResourceId} siteCount=${sitesList.length} siteIds=[${sitesList.map((s) => s.siteId).join(", ")}] mergedClientCount=${mergedAllClients.length} clientIds=[${mergedAllClientIds.join(", ")}]`
    );

    /////////// process the client-siteResource associations ///////////

    // get all of the clients associated with other site resources that share
    // any of the same sites as this site resource (via siteNetworks). We can't
    // simply filter by networkId since each site resource has its own network;
    // two site resources serving the same site typically belong to different
    // networks that both happen to include the site through siteNetworks.
    const sitesListSiteIds = sitesList.map((s) => s.siteId);
    const allUpdatedClientsFromOtherResourcesOnThisSite =
        sitesListSiteIds.length > 0
            ? await trx
                  .select({
                      clientId: clientSiteResourcesAssociationsCache.clientId,
                      siteId: siteNetworks.siteId
                  })
                  .from(clientSiteResourcesAssociationsCache)
                  .innerJoin(
                      siteResources,
                      eq(
                          clientSiteResourcesAssociationsCache.siteResourceId,
                          siteResources.siteResourceId
                      )
                  )
                  .innerJoin(
                      siteNetworks,
                      eq(siteNetworks.networkId, siteResources.networkId)
                  )
                  .where(
                      and(
                          inArray(siteNetworks.siteId, sitesListSiteIds),
                          ne(
                              siteResources.siteResourceId,
                              siteResource.siteResourceId
                          )
                      )
                  )
            : [];

    // Build a per-site map so the loop below can check by siteId rather than
    // across the entire network.
    const clientsFromOtherResourcesBySite = new Map<number, Set<number>>();
    for (const row of allUpdatedClientsFromOtherResourcesOnThisSite) {
        if (!clientsFromOtherResourcesBySite.has(row.siteId)) {
            clientsFromOtherResourcesBySite.set(row.siteId, new Set());
        }
        clientsFromOtherResourcesBySite.get(row.siteId)!.add(row.clientId);
    }

    const existingClientSiteResources = await trx
        .select({
            clientId: clientSiteResourcesAssociationsCache.clientId
        })
        .from(clientSiteResourcesAssociationsCache)
        .where(
            eq(
                clientSiteResourcesAssociationsCache.siteResourceId,
                siteResource.siteResourceId
            )
        );

    const existingClientSiteResourceIds = existingClientSiteResources.map(
        (row) => row.clientId
    );

    logger.debug(
        `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} existingResourceClientIds=[${existingClientSiteResourceIds.join(", ")}]`
    );

    // Get full client details for existing resource clients (needed for sending delete messages)
    const existingResourceClients =
        existingClientSiteResourceIds.length > 0
            ? await trx
                  .select({
                      clientId: clients.clientId,
                      pubKey: clients.pubKey,
                      subnet: clients.subnet
                  })
                  .from(clients)
                  .where(
                      inArray(clients.clientId, existingClientSiteResourceIds)
                  )
            : [];

    const clientSiteResourcesToAdd = mergedAllClientIds.filter(
        (clientId) => !existingClientSiteResourceIds.includes(clientId)
    );

    logger.debug(
        `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} resourceClients toAdd=[${clientSiteResourcesToAdd.join(", ")}]`
    );

    const clientSiteResourcesToInsert = clientSiteResourcesToAdd.map(
        (clientId) => ({
            clientId,
            siteResourceId: siteResource.siteResourceId
        })
    );

    if (clientSiteResourcesToInsert.length > 0) {
        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} inserting ${clientSiteResourcesToInsert.length} clientSiteResource association(s)`
        );
        await trx
            .insert(clientSiteResourcesAssociationsCache)
            .values(clientSiteResourcesToInsert)
            .returning();
        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} inserted clientSiteResource associations`
        );
    } else {
        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} no clientSiteResource associations to insert`
        );
    }

    const clientSiteResourcesToRemove = existingClientSiteResourceIds.filter(
        (clientId) => !mergedAllClientIds.includes(clientId)
    );

    logger.debug(
        `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} resourceClients toRemove=[${clientSiteResourcesToRemove.join(", ")}]`
    );

    if (clientSiteResourcesToRemove.length > 0) {
        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} deleting ${clientSiteResourcesToRemove.length} clientSiteResource association(s)`
        );
        await trx
            .delete(clientSiteResourcesAssociationsCache)
            .where(
                and(
                    eq(
                        clientSiteResourcesAssociationsCache.siteResourceId,
                        siteResource.siteResourceId
                    ),
                    inArray(
                        clientSiteResourcesAssociationsCache.clientId,
                        clientSiteResourcesToRemove
                    )
                )
            );
    }

    /////////// process the client-site associations ///////////

    logger.debug(
        `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteResourceId=${siteResource.siteResourceId} beginning client-site association loop over ${sitesList.length} site(s)`
    );

    for (const site of sitesList) {
        const siteId = site.siteId;

        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] processing siteId=${siteId} for siteResourceId=${siteResource.siteResourceId}`
        );

        const existingClientSites = await trx
            .select({
                clientId: clientSitesAssociationsCache.clientId
            })
            .from(clientSitesAssociationsCache)
            .where(eq(clientSitesAssociationsCache.siteId, siteId));

        const existingClientSiteIds = existingClientSites.map(
            (row) => row.clientId
        );

        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} existingClientSiteIds=[${existingClientSiteIds.join(", ")}]`
        );

        // Get full client details for existing clients (needed for sending delete messages)
        const existingClients =
            existingClientSiteIds.length > 0
                ? await trx
                      .select({
                          clientId: clients.clientId,
                          pubKey: clients.pubKey,
                          subnet: clients.subnet
                      })
                      .from(clients)
                      .where(inArray(clients.clientId, existingClientSiteIds))
                : [];

        const otherResourceClientIds =
            clientsFromOtherResourcesBySite.get(siteId) ?? new Set<number>();

        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} otherResourceClientIds=[${[...otherResourceClientIds].join(", ")}] mergedAllClientIds=[${mergedAllClientIds.join(", ")}]`
        );

        const clientSitesToAdd = mergedAllClientIds.filter(
            (clientId) =>
                !existingClientSiteIds.includes(clientId) &&
                !otherResourceClientIds.has(clientId) // dont add if already connected via another site resource
        );

        const clientSitesToInsert = clientSitesToAdd.map((clientId) => ({
            clientId,
            siteId
        }));

        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} clientSites toAdd=[${clientSitesToAdd.join(", ")}]`
        );

        if (clientSitesToInsert.length > 0) {
            logger.debug(
                `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} inserting ${clientSitesToInsert.length} clientSite association(s)`
            );
            await trx
                .insert(clientSitesAssociationsCache)
                .values(clientSitesToInsert)
                .returning();
            logger.debug(
                `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} inserted clientSite associations`
            );
        } else {
            logger.debug(
                `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} no clientSite associations to insert`
            );
        }

        // Now remove any client-site associations that should no longer exist
        const clientSitesToRemove = existingClientSiteIds.filter(
            (clientId) =>
                !mergedAllClientIds.includes(clientId) &&
                !otherResourceClientIds.has(clientId) // dont remove if there is still another connection for another site resource
        );

        logger.debug(
            `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} clientSites toRemove=[${clientSitesToRemove.join(", ")}]`
        );

        if (clientSitesToRemove.length > 0) {
            logger.debug(
                `rebuildClientAssociations: [rebuildClientAssociationsFromSiteResource] siteId=${siteId} deleting ${clientSitesToRemove.length} clientSite association(s)`
            );
            await trx
                .delete(clientSitesAssociationsCache)
                .where(
                    and(
                        eq(clientSitesAssociationsCache.siteId, siteId),
                        inArray(
                            clientSitesAssociationsCache.clientId,
                            clientSitesToRemove
                        )
                    )
                );
        }

        // Now handle the messages to add/remove peers on both the newt and olm sides
        await handleMessagesForSiteClients(
            site,
            siteId,
            mergedAllClients,
            existingClients,
            clientSitesToAdd,
            clientSitesToRemove,
            trx
        );
    }

    // Handle subnet proxy target updates for the resource associations
    await handleSubnetProxyTargetUpdates(
        siteResource,
        sitesList,
        mergedAllClients,
        existingResourceClients,
        clientSiteResourcesToAdd,
        clientSiteResourcesToRemove,
        trx
    );

    return {
        mergedAllClients
    };
}

async function handleMessagesForSiteClients(
    site: Site,
    siteId: number,
    allClients: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    }[],
    existingClients: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    }[],
    clientSitesToAdd: number[],
    clientSitesToRemove: number[],
    trx: Transaction | typeof db = db
): Promise<void> {
    if (!site.exitNodeId) {
        logger.warn(
            `Exit node ID not on site ${site.siteId} so there is no reason to update clients because it must be offline`
        );
        return;
    }

    // get the exit node for the site
    const [exitNode] = await trx
        .select()
        .from(exitNodes)
        .where(eq(exitNodes.exitNodeId, site.exitNodeId))
        .limit(1);

    if (!exitNode) {
        logger.warn(
            `Exit node not found for site ${site.siteId} so there is no reason to update clients because it must be offline`
        );
        return;
    }

    if (!site.publicKey) {
        logger.warn(
            `Site publicKey not set for site ${site.siteId} so cannot add peers to clients`
        );
        return;
    }

    const [newt] = await trx
        .select({
            newtId: newts.newtId
        })
        .from(newts)
        .where(eq(newts.siteId, siteId))
        .limit(1);
    if (!newt) {
        logger.warn(
            `Newt not found for site ${siteId} so cannot add peers to clients`
        );
        return;
    }

    const newtJobs: Promise<any>[] = [];
    const olmJobs: Promise<any>[] = [];
    const exitNodeJobs: Promise<any>[] = [];

    // Combine all clients that need processing (those being added or removed)
    const clientsToProcess = new Map<
        number,
        {
            clientId: number;
            pubKey: string | null;
            subnet: string | null;
        }
    >();

    // Add clients that are being added (from newAllClients)
    for (const client of allClients) {
        if (clientSitesToAdd.includes(client.clientId)) {
            clientsToProcess.set(client.clientId, client);
        }
    }

    // Add clients that are being removed (from existingClients)
    for (const client of existingClients) {
        if (clientSitesToRemove.includes(client.clientId)) {
            clientsToProcess.set(client.clientId, client);
        }
    }

    // get the number of sites on each of these clients so we can log it and make decisions about whether to send messages based on it
    const clientSiteCounts: Record<number, number> = {};
    if (clientsToProcess.size > 0) {
        const clientIdsToProcess = Array.from(clientsToProcess.keys());
        const siteCounts = await trx
            .select({
                clientId: clientSitesAssociationsCache.clientId,
                siteCount: count(clientSitesAssociationsCache.siteId)
            })
            .from(clientSitesAssociationsCache)
            .where(
                inArray(
                    clientSitesAssociationsCache.clientId,
                    clientIdsToProcess
                )
            )
            .groupBy(clientSitesAssociationsCache.clientId);

        for (const row of siteCounts) {
            clientSiteCounts[row.clientId] = Number(row.siteCount);
        }
    }

    for (const client of clientsToProcess.values()) {
        // UPDATE THE NEWT
        if (!client.subnet || !client.pubKey) {
            logger.debug("Client subnet, pubKey or endpoint is not set");
            continue;
        }

        // is this an add or a delete?
        const isAdd = clientSitesToAdd.includes(client.clientId);
        const isDelete = clientSitesToRemove.includes(client.clientId);

        if (!isAdd && !isDelete) {
            // nothing to do for this client
            continue;
        }

        const [olm] = await trx
            .select({
                olmId: olms.olmId
            })
            .from(olms)
            .where(eq(olms.clientId, client.clientId))
            .limit(1);
        if (!olm) {
            logger.warn(
                `Olm not found for client ${client.clientId} so cannot add/delete peers`
            );
            continue;
        }

        if (isDelete) {
            newtJobs.push(newtDeletePeer(siteId, client.pubKey, newt.newtId));
            olmJobs.push(
                olmDeletePeer(
                    client.clientId,
                    siteId,
                    site.publicKey,
                    olm.olmId
                )
            );
        }

        if (isAdd) {
            if (clientSiteCounts[client.clientId] > 250) {
                // skip adding the peer if we have more than 250 sites because we are in jit mode anyway
                logger.info(
                    `rebuildClientAssociations: Client ${client.clientId} has ${clientSiteCounts[client.clientId]} sites so skipping adding peer to newt and olm because it is likely in jit mode`
                );
                continue;
            }

            await initPeerAddHandshake(
                // this will kick off the add peer process for the client
                client.clientId,
                {
                    siteId,
                    exitNode: {
                        publicKey: exitNode.publicKey,
                        endpoint: exitNode.endpoint
                    }
                },
                olm.olmId
            );
        }

        exitNodeJobs.push(updateClientSiteDestinations(client, trx));
    }

    Promise.all(exitNodeJobs).catch((error) => {
        logger.error(
            `rebuildClientAssociations: Error updating client site destinations for site ${site.siteId}:`,
            error
        );
    });
    Promise.all(newtJobs).catch((error) => {
        logger.error(
            `rebuildClientAssociations: Error updating Newt peers for site ${site.siteId}:`,
            error
        );
    });
    Promise.all(olmJobs).catch((error) => {
        logger.error(
            `rebuildClientAssociations: Error updating Olm peers for site ${site.siteId}:`,
            error
        );
    });
}

interface PeerDestination {
    destinationIP: string;
    destinationPort: number;
}

// this updates the relay destinations for a client to point to all of the new sites
export async function updateClientSiteDestinations(
    client: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    },
    trx: Transaction | typeof db = db
): Promise<void> {
    let exitNodeDestinations: {
        reachableAt: string;
        exitNodeId: number;
        type: string;
        name: string;
        sourceIp: string;
        sourcePort: number;
        destinations: PeerDestination[];
    }[] = [];

    const sitesData = await trx
        .select()
        .from(sites)
        .innerJoin(
            clientSitesAssociationsCache,
            eq(sites.siteId, clientSitesAssociationsCache.siteId)
        )
        .leftJoin(exitNodes, eq(sites.exitNodeId, exitNodes.exitNodeId))
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    for (const site of sitesData) {
        if (!site.sites.subnet) {
            logger.warn(`Site ${site.sites.siteId} has no subnet, skipping`);
            continue;
        }

        if (!site.clientSitesAssociationsCache.endpoint) {
            // if this is a new association the endpoint is not set yet
            continue;
        }

        // Parse the endpoint properly for both IPv4 and IPv6
        const parsedEndpoint = parseEndpoint(
            site.clientSitesAssociationsCache.endpoint
        );
        if (!parsedEndpoint) {
            logger.warn(
                `Failed to parse endpoint ${site.clientSitesAssociationsCache.endpoint}, skipping`
            );
            continue;
        }

        // find the destinations in the array
        let destinations = exitNodeDestinations.find(
            (d) => d.reachableAt === site.exitNodes?.reachableAt
        );

        if (!destinations) {
            destinations = {
                reachableAt: site.exitNodes?.reachableAt || "",
                exitNodeId: site.exitNodes?.exitNodeId || 0,
                type: site.exitNodes?.type || "",
                name: site.exitNodes?.name || "",
                sourceIp: parsedEndpoint.ip,
                sourcePort: parsedEndpoint.port,
                destinations: [
                    {
                        destinationIP: site.sites.subnet.split("/")[0],
                        destinationPort: site.sites.listenPort || 1 // this satisfies gerbil for now but should be reevaluated
                    }
                ]
            };
        } else {
            // add to the existing destinations
            destinations.destinations.push({
                destinationIP: site.sites.subnet.split("/")[0],
                destinationPort: site.sites.listenPort || 1 // this satisfies gerbil for now but should be reevaluated
            });
        }

        // update it in the array
        exitNodeDestinations = exitNodeDestinations.filter(
            (d) => d.reachableAt !== site.exitNodes?.reachableAt
        );
        exitNodeDestinations.push(destinations);
    }

    for (const destination of exitNodeDestinations) {
        logger.info(
            `Updating destinations for exit node at ${destination.reachableAt}`
        );
        const payload = {
            sourceIp: destination.sourceIp,
            sourcePort: destination.sourcePort,
            destinations: destination.destinations
        };
        logger.debug(
            `Payload for update-destinations: ${JSON.stringify(payload, null, 2)}`
        );

        // Create an ExitNode-like object for sendToExitNode
        const exitNodeForComm = {
            exitNodeId: destination.exitNodeId,
            type: destination.type,
            reachableAt: destination.reachableAt,
            name: destination.name
        } as any; // Using 'as any' since we know sendToExitNode will handle this correctly

        await sendToExitNode(exitNodeForComm, {
            remoteType: "remoteExitNode/update-destinations",
            localPath: "/update-destinations",
            method: "POST",
            data: payload
        });
    }
}

async function handleSubnetProxyTargetUpdates(
    siteResource: SiteResource,
    sitesList: Site[],
    allClients: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    }[],
    existingClients: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
    }[],
    clientSiteResourcesToAdd: number[],
    clientSiteResourcesToRemove: number[],
    trx: Transaction | typeof db = db
): Promise<void> {
    const proxyJobs: Promise<any>[] = [];
    const olmJobs: Promise<any>[] = [];

    for (const siteData of sitesList) {
        const siteId = siteData.siteId;

        // Get the newt for this site
        const [newt] = await trx
            .select()
            .from(newts)
            .where(eq(newts.siteId, siteId))
            .limit(1);

        if (!newt) {
            logger.warn(
                `Newt not found for site ${siteId}, skipping subnet proxy target updates`
            );
            continue;
        }

        // Generate targets for added associations
        if (clientSiteResourcesToAdd.length > 0) {
            const addedClients = allClients.filter((client) =>
                clientSiteResourcesToAdd.includes(client.clientId)
            );

            if (addedClients.length > 0) {
                const targetsToAdd = await generateSubnetProxyTargetV2(
                    siteResource,
                    addedClients
                );

                if (targetsToAdd) {
                    proxyJobs.push(
                        addSubnetProxyTargets(
                            newt.newtId,
                            targetsToAdd,
                            newt.version
                        )
                    );
                }

                for (const client of addedClients) {
                    olmJobs.push(
                        addPeerData(
                            client.clientId,
                            siteId,
                            generateRemoteSubnets([siteResource]),
                            generateAliasConfig([siteResource])
                        )
                    );
                }
            }
        }

        // here we use the existingSiteResource from BEFORE we updated the destination so we dont need to worry about updating destinations here

        // Generate targets for removed associations
        if (clientSiteResourcesToRemove.length > 0) {
            const removedClients = existingClients.filter((client) =>
                clientSiteResourcesToRemove.includes(client.clientId)
            );

            if (removedClients.length > 0) {
                const targetsToRemove = await generateSubnetProxyTargetV2(
                    siteResource,
                    removedClients
                );

                if (targetsToRemove) {
                    proxyJobs.push(
                        removeSubnetProxyTargets(
                            newt.newtId,
                            targetsToRemove,
                            newt.version
                        )
                    );
                }

                for (const client of removedClients) {
                    if (!siteResource.destination) {
                        continue;
                    }
                    // Check if this client still has access to another resource
                    // on this specific site with the same destination. We scope
                    // by siteId (via siteNetworks) rather than networkId because
                    // removePeerData operates per-site - a resource on a different
                    // site sharing the same network should not block removal here.
                    const destinationStillInUse = await trx
                        .select()
                        .from(siteResources)
                        .innerJoin(
                            clientSiteResourcesAssociationsCache,
                            eq(
                                clientSiteResourcesAssociationsCache.siteResourceId,
                                siteResources.siteResourceId
                            )
                        )
                        .innerJoin(
                            siteNetworks,
                            eq(siteNetworks.networkId, siteResources.networkId)
                        )
                        .where(
                            and(
                                eq(
                                    clientSiteResourcesAssociationsCache.clientId,
                                    client.clientId
                                ),
                                eq(siteNetworks.siteId, siteId),
                                eq(
                                    siteResources.destination,
                                    siteResource.destination
                                ),
                                ne(
                                    siteResources.siteResourceId,
                                    siteResource.siteResourceId
                                )
                            )
                        );

                    // Only remove remote subnet if no other resource uses the same destination
                    const remoteSubnetsToRemove =
                        destinationStillInUse.length > 0
                            ? []
                            : generateRemoteSubnets([siteResource]);

                    olmJobs.push(
                        removePeerData(
                            client.clientId,
                            siteId,
                            remoteSubnetsToRemove,
                            generateAliasConfig([siteResource])
                        )
                    );
                }
            }
        }
    }

    await Promise.all(proxyJobs);
}

export async function rebuildClientAssociationsFromClient(
    client: Client,
    trx: Transaction | typeof db = db
): Promise<void> {
    return await lockManager.withLock(
        `rebuild-client-associations:client:${client.clientId}`,
        () => rebuildClientAssociationsFromClientImpl(client, trx),
        REBUILD_ASSOCIATIONS_LOCK_TTL_MS
    );
}

async function rebuildClientAssociationsFromClientImpl(
    client: Client,
    trx: Transaction | typeof db = db
): Promise<void> {
    let newSiteResourceIds: number[] = [];

    // 1. Direct client associations
    const directSiteResources = await trx
        .select({ siteResourceId: clientSiteResources.siteResourceId })
        .from(clientSiteResources)
        .innerJoin(
            siteResources,
            eq(siteResources.siteResourceId, clientSiteResources.siteResourceId)
        )
        .where(
            and(
                eq(clientSiteResources.clientId, client.clientId),
                eq(siteResources.orgId, client.orgId) // filter by org to prevent cross-org associations
            )
        );

    newSiteResourceIds.push(
        ...directSiteResources.map((r) => r.siteResourceId)
    );

    // 2. User-based and role-based access (if client has a userId)
    if (client.userId) {
        // Direct user associations
        const userSiteResourceIds = await trx
            .select({ siteResourceId: userSiteResources.siteResourceId })
            .from(userSiteResources)
            .innerJoin(
                siteResources,
                eq(
                    siteResources.siteResourceId,
                    userSiteResources.siteResourceId
                )
            )
            .where(
                and(
                    eq(userSiteResources.userId, client.userId),
                    eq(siteResources.orgId, client.orgId)
                )
            ); // this needs to be locked onto this org or else cross-org access could happen

        newSiteResourceIds.push(
            ...userSiteResourceIds.map((r) => r.siteResourceId)
        );

        // Role-based access
        const roleIds = await trx
            .select({ roleId: userOrgRoles.roleId })
            .from(userOrgRoles)
            .where(
                and(
                    eq(userOrgRoles.userId, client.userId),
                    eq(userOrgRoles.orgId, client.orgId)
                )
            ) // this needs to be locked onto this org or else cross-org access could happen
            .then((rows) => rows.map((row) => row.roleId));

        if (roleIds.length > 0) {
            const roleSiteResourceIds = await trx
                .select({ siteResourceId: roleSiteResources.siteResourceId })
                .from(roleSiteResources)
                .innerJoin(
                    siteResources,
                    eq(
                        siteResources.siteResourceId,
                        roleSiteResources.siteResourceId
                    )
                )
                .where(
                    and(
                        inArray(roleSiteResources.roleId, roleIds),
                        eq(siteResources.orgId, client.orgId) // filter by org to prevent cross-org associations
                    )
                );

            newSiteResourceIds.push(
                ...roleSiteResourceIds.map((r) => r.siteResourceId)
            );
        }
    }

    // Remove duplicates
    newSiteResourceIds = Array.from(new Set(newSiteResourceIds));

    // Get full siteResource details
    const newSiteResources =
        newSiteResourceIds.length > 0
            ? await trx
                  .select()
                  .from(siteResources)
                  .where(
                      inArray(siteResources.siteResourceId, newSiteResourceIds)
                  )
            : [];

    // Group by siteId for site-level associations - look up via siteNetworks since
    // siteResources no longer carries a direct siteId column.
    const networkIds = Array.from(
        new Set(
            newSiteResources
                .map((sr) => sr.networkId)
                .filter((id): id is number => id !== null)
        )
    );
    const newSiteIds =
        networkIds.length > 0
            ? await trx
                  .select({ siteId: siteNetworks.siteId })
                  .from(siteNetworks)
                  .where(inArray(siteNetworks.networkId, networkIds))
                  .then((rows) =>
                      Array.from(new Set(rows.map((r) => r.siteId)))
                  )
            : [];

    /////////// Process client-siteResource associations ///////////

    // Get existing resource associations
    const existingResourceAssociations = await trx
        .select({
            siteResourceId: clientSiteResourcesAssociationsCache.siteResourceId
        })
        .from(clientSiteResourcesAssociationsCache)
        .where(
            eq(clientSiteResourcesAssociationsCache.clientId, client.clientId)
        );

    const existingSiteResourceIds = existingResourceAssociations.map(
        (r) => r.siteResourceId
    );

    const resourcesToAdd = newSiteResourceIds.filter(
        (id) => !existingSiteResourceIds.includes(id)
    );

    const resourcesToRemove = existingSiteResourceIds.filter(
        (id) => !newSiteResourceIds.includes(id)
    );

    // Insert new associations
    if (resourcesToAdd.length > 0) {
        await trx.insert(clientSiteResourcesAssociationsCache).values(
            resourcesToAdd.map((siteResourceId) => ({
                clientId: client.clientId,
                siteResourceId
            }))
        );
    }

    // Remove old associations
    if (resourcesToRemove.length > 0) {
        await trx
            .delete(clientSiteResourcesAssociationsCache)
            .where(
                and(
                    eq(
                        clientSiteResourcesAssociationsCache.clientId,
                        client.clientId
                    ),
                    inArray(
                        clientSiteResourcesAssociationsCache.siteResourceId,
                        resourcesToRemove
                    )
                )
            );
    }

    /////////// Process client-site associations ///////////

    // Get existing site associations
    const existingSiteAssociations = await trx
        .select({ siteId: clientSitesAssociationsCache.siteId })
        .from(clientSitesAssociationsCache)
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));

    const existingSiteIds = existingSiteAssociations.map((s) => s.siteId);

    const sitesToAdd = newSiteIds.filter((id) => !existingSiteIds.includes(id));
    const sitesToRemove = existingSiteIds.filter(
        (id) => !newSiteIds.includes(id)
    );

    // Insert new site associations
    if (sitesToAdd.length > 0) {
        await trx.insert(clientSitesAssociationsCache).values(
            sitesToAdd.map((siteId) => ({
                clientId: client.clientId,
                siteId
            }))
        );
    }

    // Remove old site associations
    if (sitesToRemove.length > 0) {
        await trx
            .delete(clientSitesAssociationsCache)
            .where(
                and(
                    eq(clientSitesAssociationsCache.clientId, client.clientId),
                    inArray(clientSitesAssociationsCache.siteId, sitesToRemove)
                )
            );
    }

    /////////// Send messages ///////////

    // Handle messages for sites being added
    await handleMessagesForClientSites(client, sitesToAdd, sitesToRemove, trx);

    // Handle subnet proxy target updates for resources
    await handleMessagesForClientResources(
        client,
        newSiteResources,
        resourcesToAdd,
        resourcesToRemove,
        trx
    );
}

async function handleMessagesForClientSites(
    client: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
        userId: string | null;
        orgId: string;
    },
    sitesToAdd: number[],
    sitesToRemove: number[],
    trx: Transaction | typeof db = db
): Promise<void> {
    // Get the olm for this client
    const [olm] = await trx
        .select({ olmId: olms.olmId })
        .from(olms)
        .where(eq(olms.clientId, client.clientId))
        .limit(1);

    if (!olm) {
        logger.warn(
            `Olm not found for client ${client.clientId}, skipping peer updates`
        );
        return;
    }

    const olmId = olm.olmId;

    if (!client.subnet || !client.pubKey) {
        logger.warn(
            `Client ${client.clientId} missing subnet or pubKey, skipping peer updates`
        );
        return;
    }

    const allSiteIds = [...sitesToAdd, ...sitesToRemove];
    if (allSiteIds.length === 0) {
        return;
    }

    // Get site details for all affected sites
    const sitesData = await trx
        .select()
        .from(sites)
        .leftJoin(exitNodes, eq(sites.exitNodeId, exitNodes.exitNodeId))
        .leftJoin(newts, eq(sites.siteId, newts.siteId))
        .where(inArray(sites.siteId, allSiteIds));

    const newtJobs: Promise<any>[] = [];
    const olmJobs: Promise<any>[] = [];
    const exitNodeJobs: Promise<any>[] = [];

    const totalSitesOnClient = await trx
        .select({ count: count(clientSitesAssociationsCache.siteId) })
        .from(clientSitesAssociationsCache)
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId))
        .then((rows) => Number(rows[0].count));

    for (const siteData of sitesData) {
        const site = siteData.sites;
        const exitNode = siteData.exitNodes;
        const newt = siteData.newt;

        if (!site.publicKey) {
            logger.warn(
                `Site ${site.siteId} missing publicKey, skipping peer updates`
            );
            continue;
        }

        if (!newt) {
            logger.warn(
                `Newt not found for site ${site.siteId}, skipping peer updates`
            );
            continue;
        }

        const isAdd = sitesToAdd.includes(site.siteId);
        const isRemove = sitesToRemove.includes(site.siteId);

        if (isRemove) {
            // Remove peer from newt
            newtJobs.push(
                newtDeletePeer(site.siteId, client.pubKey, newt.newtId)
            );
            try {
                // Remove peer from olm
                olmJobs.push(
                    olmDeletePeer(
                        client.clientId,
                        site.siteId,
                        site.publicKey,
                        olmId
                    )
                );
            } catch (error) {
                // if the error includes not found then its just because the olm does not exist anymore or yet and its fine if we dont send
                if (
                    error instanceof Error &&
                    error.message.includes("not found")
                ) {
                    logger.debug(
                        `Olm data not found for client ${client.clientId}, skipping removal`
                    );
                } else {
                    throw error;
                }
            }
        }

        if (isAdd) {
            if (!exitNode) {
                logger.warn(
                    `Exit node not found for site ${site.siteId}, skipping peer add`
                );
                continue;
            }

            if (totalSitesOnClient > 250) {
                // skip adding the site if we have more than 250 because we are in jit mode anyway
                logger.info(
                    `rebuildClientAssociations: Client ${client.clientId} has ${totalSitesOnClient} sites so skipping adding peer to newt and olm because it is likely in jit mode`
                );
                continue;
            }

            await initPeerAddHandshake(
                // this will kick off the add peer process for the client
                client.clientId,
                {
                    siteId: site.siteId,
                    exitNode: {
                        publicKey: exitNode.publicKey,
                        endpoint: exitNode.endpoint
                    }
                },
                olmId
            );
        }

        // Update exit node destinations
        exitNodeJobs.push(
            updateClientSiteDestinations(
                {
                    clientId: client.clientId,
                    pubKey: client.pubKey,
                    subnet: client.subnet
                },
                trx
            )
        );
    }

    Promise.all(exitNodeJobs).catch((error) => {
        logger.error(
            `rebuildClientAssociations: Error updating client site destinations for client ${client.clientId}:`,
            error
        );
    });
    Promise.all(newtJobs).catch((error) => {
        logger.error(
            `rebuildClientAssociations: Error updating Newt peers for client ${client.clientId}:`,
            error
        );
    });
    Promise.all(olmJobs).catch((error) => {
        logger.error(
            `rebuildClientAssociations: Error updating Olm peers for client ${client.clientId}:`,
            error
        );
    });
}

async function handleMessagesForClientResources(
    client: {
        clientId: number;
        pubKey: string | null;
        subnet: string | null;
        userId: string | null;
        orgId: string;
    },
    allNewResources: SiteResource[],
    resourcesToAdd: number[],
    resourcesToRemove: number[],
    trx: Transaction | typeof db = db
): Promise<void> {
    const proxyJobs: Promise<any>[] = [];
    const olmJobs: Promise<any>[] = [];

    // Handle additions
    if (resourcesToAdd.length > 0) {
        const addedResources = allNewResources.filter((r) =>
            resourcesToAdd.includes(r.siteResourceId)
        );

        // Build (resource, siteId) pairs by looking up siteNetworks for each resource's networkId
        const addedNetworkIds = Array.from(
            new Set(
                addedResources
                    .map((r) => r.networkId)
                    .filter((id): id is number => id !== null)
            )
        );
        const addedSiteNetworkRows =
            addedNetworkIds.length > 0
                ? await trx
                      .select({
                          networkId: siteNetworks.networkId,
                          siteId: siteNetworks.siteId
                      })
                      .from(siteNetworks)
                      .where(inArray(siteNetworks.networkId, addedNetworkIds))
                : [];
        const addedNetworkToSites = new Map<number, number[]>();
        for (const row of addedSiteNetworkRows) {
            if (!addedNetworkToSites.has(row.networkId)) {
                addedNetworkToSites.set(row.networkId, []);
            }
            addedNetworkToSites.get(row.networkId)!.push(row.siteId);
        }

        // Group by site for proxy updates
        const addedBySite = new Map<number, SiteResource[]>();
        for (const resource of addedResources) {
            const siteIds =
                resource.networkId != null
                    ? (addedNetworkToSites.get(resource.networkId) ?? [])
                    : [];
            for (const siteId of siteIds) {
                if (!addedBySite.has(siteId)) {
                    addedBySite.set(siteId, []);
                }
                addedBySite.get(siteId)!.push(resource);
            }
        }

        // Add subnet proxy targets for each site
        for (const [siteId, resources] of addedBySite.entries()) {
            const [newt] = await trx
                .select({ newtId: newts.newtId, version: newts.version })
                .from(newts)
                .where(eq(newts.siteId, siteId))
                .limit(1);

            if (!newt) {
                logger.warn(
                    `Newt not found for site ${siteId}, skipping proxy updates`
                );
                continue;
            }

            for (const resource of resources) {
                const targets = await generateSubnetProxyTargetV2(resource, [
                    {
                        clientId: client.clientId,
                        pubKey: client.pubKey,
                        subnet: client.subnet
                    }
                ]);

                if (targets) {
                    proxyJobs.push(
                        addSubnetProxyTargets(
                            newt.newtId,
                            targets,
                            newt.version
                        )
                    );
                }

                try {
                    // Add peer data to olm
                    olmJobs.push(
                        addPeerData(
                            client.clientId,
                            siteId,
                            generateRemoteSubnets([resource]),
                            generateAliasConfig([resource])
                        )
                    );
                } catch (error) {
                    // if the error includes not found then its just because the olm does not exist anymore or yet and its fine if we dont send
                    if (
                        error instanceof Error &&
                        error.message.includes("not found")
                    ) {
                        logger.debug(
                            `Olm data not found for client ${client.clientId} and site ${siteId}, skipping addition`
                        );
                    } else {
                        throw error;
                    }
                }
            }
        }
    }

    // Handle removals
    if (resourcesToRemove.length > 0) {
        const removedResources = await trx
            .select()
            .from(siteResources)
            .where(inArray(siteResources.siteResourceId, resourcesToRemove));

        // Build (resource, siteId) pairs via siteNetworks
        const removedNetworkIds = Array.from(
            new Set(
                removedResources
                    .map((r) => r.networkId)
                    .filter((id): id is number => id !== null)
            )
        );
        const removedSiteNetworkRows =
            removedNetworkIds.length > 0
                ? await trx
                      .select({
                          networkId: siteNetworks.networkId,
                          siteId: siteNetworks.siteId
                      })
                      .from(siteNetworks)
                      .where(inArray(siteNetworks.networkId, removedNetworkIds))
                : [];
        const removedNetworkToSites = new Map<number, number[]>();
        for (const row of removedSiteNetworkRows) {
            if (!removedNetworkToSites.has(row.networkId)) {
                removedNetworkToSites.set(row.networkId, []);
            }
            removedNetworkToSites.get(row.networkId)!.push(row.siteId);
        }

        // Group by site for proxy updates
        const removedBySite = new Map<number, SiteResource[]>();
        for (const resource of removedResources) {
            const siteIds =
                resource.networkId != null
                    ? (removedNetworkToSites.get(resource.networkId) ?? [])
                    : [];
            for (const siteId of siteIds) {
                if (!removedBySite.has(siteId)) {
                    removedBySite.set(siteId, []);
                }
                removedBySite.get(siteId)!.push(resource);
            }
        }

        // Remove subnet proxy targets for each site
        for (const [siteId, resources] of removedBySite.entries()) {
            const [newt] = await trx
                .select({ newtId: newts.newtId, version: newts.version })
                .from(newts)
                .where(eq(newts.siteId, siteId))
                .limit(1);

            if (!newt) {
                logger.warn(
                    `Newt not found for site ${siteId}, skipping proxy updates`
                );
                continue;
            }

            for (const resource of resources) {
                const targets = await generateSubnetProxyTargetV2(resource, [
                    {
                        clientId: client.clientId,
                        pubKey: client.pubKey,
                        subnet: client.subnet
                    }
                ]);

                if (targets) {
                    proxyJobs.push(
                        removeSubnetProxyTargets(
                            newt.newtId,
                            targets,
                            newt.version
                        )
                    );
                }

                try {
                    if (!resource.destination) {
                        continue;
                    }
                    // Check if this client still has access to another resource
                    // on this specific site with the same destination. We scope
                    // by siteId (via siteNetworks) rather than networkId because
                    // removePeerData operates per-site - a resource on a different
                    // site sharing the same network should not block removal here.
                    const destinationStillInUse = await trx
                        .select()
                        .from(siteResources)
                        .innerJoin(
                            clientSiteResourcesAssociationsCache,
                            eq(
                                clientSiteResourcesAssociationsCache.siteResourceId,
                                siteResources.siteResourceId
                            )
                        )
                        .innerJoin(
                            siteNetworks,
                            eq(siteNetworks.networkId, siteResources.networkId)
                        )
                        .where(
                            and(
                                eq(
                                    clientSiteResourcesAssociationsCache.clientId,
                                    client.clientId
                                ),
                                eq(siteNetworks.siteId, siteId),
                                eq(
                                    siteResources.destination,
                                    resource.destination
                                ),
                                ne(
                                    siteResources.siteResourceId,
                                    resource.siteResourceId
                                )
                            )
                        );

                    // Only remove remote subnet if no other resource uses the same destination
                    const remoteSubnetsToRemove =
                        destinationStillInUse.length > 0
                            ? []
                            : generateRemoteSubnets([resource]);

                    // Remove peer data from olm
                    olmJobs.push(
                        removePeerData(
                            client.clientId,
                            siteId,
                            remoteSubnetsToRemove,
                            generateAliasConfig([resource])
                        )
                    );
                } catch (error) {
                    // if the error includes not found then its just because the olm does not exist anymore or yet and its fine if we dont send
                    if (
                        error instanceof Error &&
                        error.message.includes("not found")
                    ) {
                        logger.debug(
                            `Olm data not found for client ${client.clientId} and site ${siteId}, skipping removal`
                        );
                    } else {
                        throw error;
                    }
                }
            }
        }
    }

    await Promise.all([...proxyJobs, ...olmJobs]);
}

export type ClientAssociationsCacheVerification = {
    clientId: number;
    consistent: boolean;
    // What permissions say the cache should contain
    expectedSiteResourceIds: number[];
    expectedSiteIds: number[];
    // What the cache currently contains
    actualSiteResourceIds: number[];
    actualSiteIds: number[];
    // Diff
    missingSiteResourceIds: number[]; // present in expected, missing from cache
    extraSiteResourceIds: number[]; // present in cache, not in expected
    missingSiteIds: number[];
    extraSiteIds: number[];
};

// verifyClientAssociationsCache walks the same permission-derivation logic as
// rebuildClientAssociationsFromClient but does NOT modify the database. It
// returns the expected vs actual cache contents and a boolean indicating
// whether the cache is in sync with what permissions imply.
export async function verifyClientAssociationsCache(
    client: Client,
    trx: Transaction | typeof db = db
): Promise<ClientAssociationsCacheVerification> {
    let newSiteResourceIds: number[] = [];

    // 1. Direct client associations
    const directSiteResources = await trx
        .select({ siteResourceId: clientSiteResources.siteResourceId })
        .from(clientSiteResources)
        .innerJoin(
            siteResources,
            eq(siteResources.siteResourceId, clientSiteResources.siteResourceId)
        )
        .where(
            and(
                eq(clientSiteResources.clientId, client.clientId),
                eq(siteResources.orgId, client.orgId)
            )
        );

    newSiteResourceIds.push(
        ...directSiteResources.map((r) => r.siteResourceId)
    );

    // 2. User-based and role-based access (if client has a userId)
    if (client.userId) {
        const userSiteResourceIds = await trx
            .select({ siteResourceId: userSiteResources.siteResourceId })
            .from(userSiteResources)
            .innerJoin(
                siteResources,
                eq(
                    siteResources.siteResourceId,
                    userSiteResources.siteResourceId
                )
            )
            .where(
                and(
                    eq(userSiteResources.userId, client.userId),
                    eq(siteResources.orgId, client.orgId)
                )
            );

        newSiteResourceIds.push(
            ...userSiteResourceIds.map((r) => r.siteResourceId)
        );

        const roleIds = await trx
            .select({ roleId: userOrgRoles.roleId })
            .from(userOrgRoles)
            .where(
                and(
                    eq(userOrgRoles.userId, client.userId),
                    eq(userOrgRoles.orgId, client.orgId)
                )
            )
            .then((rows) => rows.map((row) => row.roleId));

        if (roleIds.length > 0) {
            const roleSiteResourceIds = await trx
                .select({ siteResourceId: roleSiteResources.siteResourceId })
                .from(roleSiteResources)
                .innerJoin(
                    siteResources,
                    eq(
                        siteResources.siteResourceId,
                        roleSiteResources.siteResourceId
                    )
                )
                .where(
                    and(
                        inArray(roleSiteResources.roleId, roleIds),
                        eq(siteResources.orgId, client.orgId)
                    )
                );

            newSiteResourceIds.push(
                ...roleSiteResourceIds.map((r) => r.siteResourceId)
            );
        }
    }

    newSiteResourceIds = Array.from(new Set(newSiteResourceIds));

    const newSiteResources =
        newSiteResourceIds.length > 0
            ? await trx
                  .select()
                  .from(siteResources)
                  .where(
                      inArray(siteResources.siteResourceId, newSiteResourceIds)
                  )
            : [];

    const networkIds = Array.from(
        new Set(
            newSiteResources
                .map((sr) => sr.networkId)
                .filter((id): id is number => id !== null)
        )
    );
    const newSiteIds =
        networkIds.length > 0
            ? await trx
                  .select({ siteId: siteNetworks.siteId })
                  .from(siteNetworks)
                  .where(inArray(siteNetworks.networkId, networkIds))
                  .then((rows) =>
                      Array.from(new Set(rows.map((r) => r.siteId)))
                  )
            : [];

    // Read the existing cache state
    const existingResourceAssociations = await trx
        .select({
            siteResourceId: clientSiteResourcesAssociationsCache.siteResourceId
        })
        .from(clientSiteResourcesAssociationsCache)
        .where(
            eq(clientSiteResourcesAssociationsCache.clientId, client.clientId)
        );
    const existingSiteResourceIds = existingResourceAssociations.map(
        (r) => r.siteResourceId
    );

    const existingSiteAssociations = await trx
        .select({ siteId: clientSitesAssociationsCache.siteId })
        .from(clientSitesAssociationsCache)
        .where(eq(clientSitesAssociationsCache.clientId, client.clientId));
    const existingSiteIds = existingSiteAssociations.map((s) => s.siteId);

    const expectedSiteResourceSet = new Set(newSiteResourceIds);
    const actualSiteResourceSet = new Set(existingSiteResourceIds);
    const expectedSiteSet = new Set(newSiteIds);
    const actualSiteSet = new Set(existingSiteIds);

    const missingSiteResourceIds = newSiteResourceIds.filter(
        (id) => !actualSiteResourceSet.has(id)
    );
    const extraSiteResourceIds = existingSiteResourceIds.filter(
        (id) => !expectedSiteResourceSet.has(id)
    );
    const missingSiteIds = newSiteIds.filter((id) => !actualSiteSet.has(id));
    const extraSiteIds = existingSiteIds.filter(
        (id) => !expectedSiteSet.has(id)
    );

    const consistent =
        missingSiteResourceIds.length === 0 &&
        extraSiteResourceIds.length === 0 &&
        missingSiteIds.length === 0 &&
        extraSiteIds.length === 0;

    return {
        clientId: client.clientId,
        consistent,
        expectedSiteResourceIds: Array.from(expectedSiteResourceSet).sort(
            (a, b) => a - b
        ),
        expectedSiteIds: Array.from(expectedSiteSet).sort((a, b) => a - b),
        actualSiteResourceIds: Array.from(actualSiteResourceSet).sort(
            (a, b) => a - b
        ),
        actualSiteIds: Array.from(actualSiteSet).sort((a, b) => a - b),
        missingSiteResourceIds: missingSiteResourceIds.sort((a, b) => a - b),
        extraSiteResourceIds: extraSiteResourceIds.sort((a, b) => a - b),
        missingSiteIds: missingSiteIds.sort((a, b) => a - b),
        extraSiteIds: extraSiteIds.sort((a, b) => a - b)
    };
}

// cleanupSiteAssociations efficiently removes all client associations for a
// site that is being deleted. Instead of calling
// rebuildClientAssociationsFromSiteResource once per site resource (which is
// O(resources) in DB round-trips and message fan-out), this function performs
// a single bulk lookup of affected clients and site resources, deletes all
// cache rows at once, and fires all peer/proxy removal messages in parallel.
//
// The caller is responsible for deleting the site row itself (and for sending
// the newt/wg/terminate signal to the newt process).
export async function cleanupSiteAssociations(
    site: Site,
    trx: Transaction | typeof db = db
): Promise<void> {
    const siteId = site.siteId;

    logger.debug(`cleanupSiteAssociations: START siteId=${siteId}`);

    // 1. Find every client currently cached against this site.
    const cachedSiteClientRows = await trx
        .select({ clientId: clientSitesAssociationsCache.clientId })
        .from(clientSitesAssociationsCache)
        .where(eq(clientSitesAssociationsCache.siteId, siteId));

    const cachedClientIds = cachedSiteClientRows.map((r) => r.clientId);

    // 2. Load full client details (needed for WireGuard public-key references).
    const allClients =
        cachedClientIds.length > 0
            ? await trx
                  .select({
                      clientId: clients.clientId,
                      pubKey: clients.pubKey,
                      subnet: clients.subnet
                  })
                  .from(clients)
                  .where(inArray(clients.clientId, cachedClientIds))
            : [];

    // 6. Bulk-delete all cache entries for this site.  Do this before sending
    //    destination-update messages so updateClientSiteDestinations computes
    //    the correct (post-deletion) set of destinations.
    await trx
        .delete(clientSitesAssociationsCache)
        .where(eq(clientSitesAssociationsCache.siteId, siteId));

    logger.debug(
        `cleanupSiteAssociations: siteId=${siteId} cache cleared. clients=${allClients.length}`
    );

    // 7. Fire all removal messages in parallel.
    const jobs: Promise<any>[] = [];

    for (const client of allClients) {
        // Tell each olm to drop the site's WireGuard peer.
        if (site.publicKey) {
            jobs.push(olmDeletePeer(client.clientId, siteId, site.publicKey));
        }

        // Recompute and push updated relay destinations (now excluding this site).
        if (client.pubKey && client.subnet) {
            jobs.push(updateClientSiteDestinations(client, trx));
        }
    }

    await Promise.all(jobs).catch((error) => {
        logger.error(
            `cleanupSiteAssociations: error sending cleanup messages for siteId=${siteId}:`,
            error
        );
    });

    logger.debug(`cleanupSiteAssociations: DONE siteId=${siteId}`);
}
