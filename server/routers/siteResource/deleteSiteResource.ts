import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db, newts, primaryDb, sites } from "@server/db";
import { siteResources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { eq, and } from "drizzle-orm";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import { rebuildClientAssociationsFromSiteResource } from "@server/lib/rebuildClientAssociations";

const deleteSiteResourceParamsSchema = z.strictObject({
    siteResourceId: z.coerce.number().int().positive()
});

export type DeleteSiteResourceResponse = {
    message: string;
};

registry.registerPath({
    method: "delete",
    path: "/site-resource/{siteResourceId}",
    description: "Delete a site resource.",
    tags: [OpenAPITags.PrivateResource],
    request: {
        params: deleteSiteResourceParamsSchema
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

export async function deleteSiteResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteSiteResourceParamsSchema.safeParse(
            req.params
        );
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { siteResourceId } = parsedParams.data;

        // Check if site resource exists
        const [existingSiteResource] = await db
            .select()
            .from(siteResources)
            .where(and(eq(siteResources.siteResourceId, siteResourceId)))
            .limit(1);

        if (!existingSiteResource) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Site resource not found")
            );
        }

        // Delete the site resource
        const [removedSiteResource] = await db
            .delete(siteResources)
            .where(eq(siteResources.siteResourceId, siteResourceId))
            .returning();

        // Run in the background after the response is sent. Wrapped in its
        // own transaction so it always executes on the primary — avoiding any
        // replica-lag issues while still allowing the HTTP response to return
        // early.
        rebuildClientAssociationsFromSiteResource(
            removedSiteResource,
            primaryDb
        ).catch((err) => {
            logger.error(
                `Error rebuilding client associations for site resource ${removedSiteResource!.siteResourceId}:`,
                err
            );
        });

        logger.info(`Deleted site resource ${siteResourceId}`);

        return response(res, {
            data: { message: "Site resource deleted successfully" },
            success: true,
            error: false,
            message: "Site resource deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error("Error deleting site resource:", error);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to delete site resource"
            )
        );
    }
}
