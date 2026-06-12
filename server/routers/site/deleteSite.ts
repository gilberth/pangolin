import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { newts, sites } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { deletePeer } from "../gerbil/peers";
import { fromError } from "zod-validation-error";
import { sendToClient } from "#dynamic/routers/ws";
import { OpenAPITags, registry } from "@server/openApi";
import { cleanupSiteAssociations } from "@server/lib/rebuildClientAssociations";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing";

const deleteSiteSchema = z.strictObject({
    siteId: z.coerce.number().int().positive()
});

registry.registerPath({
    method: "delete",
    path: "/site/{siteId}",
    description: "Delete a site and all its associated data.",
    tags: [OpenAPITags.Site],
    request: {
        params: deleteSiteSchema
    },
    responses: {
        200: {
            description: "Successful response",
            content: {
                "application/json": {
                    schema: z.object({
                        data: z.record(z.string(), z.any()).nullable(),
                        success: z.boolean(),
                        error: z.boolean(),
                        message: z.string(),
                        status: z.number()
                    })
                }
            }
        }
    }
});

export async function deleteSite(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteSiteSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { siteId } = parsedParams.data;

        const [site] = await db
            .select()
            .from(sites)
            .where(eq(sites.siteId, siteId))
            .limit(1);

        if (!site) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Site with ID ${siteId} not found`
                )
            );
        }

        const [deletedNewt] = await db
            .select()
            .from(newts)
            .where(eq(newts.siteId, siteId))
            .limit(1);

        await db.transaction(async (trx) => {
            if (site.type == "wireguard") {
                if (site.pubKey) {
                    await deletePeer(site.exitNodeId!, site.pubKey);
                }
            } else if (site.type == "newt") {
                // Clean up all client associations and send peer/proxy removal
                // messages in a single efficient pass before deleting the row.
                await cleanupSiteAssociations(site, trx);
            }

            await trx.delete(sites).where(eq(sites.siteId, siteId));
            await usageService.add(site.orgId, FeatureId.SITES, -1, trx);
        });

        // Send termination message outside of transaction to prevent blocking
        if (deletedNewt) {
            const payload = {
                type: `newt/wg/terminate`,
                data: {}
            };
            // Don't await this to prevent blocking the response
            sendToClient(deletedNewt.newtId, payload).catch((error) => {
                logger.error(
                    "Failed to send termination message to newt:",
                    error
                );
            });
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Site deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
