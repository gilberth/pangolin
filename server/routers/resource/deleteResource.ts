import { eq, inArray } from "drizzle-orm";
import {
    db,
    newts,
    resourcePolicies,
    resources,
    sites,
    targetHealthCheck,
    targets
} from "@server/db";
import response from "@server/lib/response";
import logger from "@server/logger";
import { OpenAPITags, registry } from "@server/openApi";
import HttpCode from "@server/types/HttpCode";
import { NextFunction, Request, Response } from "express";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";
import { removeTargets } from "../newt/targets";

// Define Zod schema for request parameters validation
const deleteResourceSchema = z.strictObject({
    resourceId: z.coerce.number().int().positive()
});

registry.registerPath({
    method: "delete",
    path: "/resource/{resourceId}",
    description: "Delete a resource.",
    tags: [OpenAPITags.PublicResource],
    request: {
        params: deleteResourceSchema
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

export async function deleteResource(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = deleteResourceSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;

        const targetsToBeRemoved = await db
            .select()
            .from(targets)
            .where(eq(targets.resourceId, resourceId));

        const healthChecksToBeRemoved = await db
            .select()
            .from(targetHealthCheck)
            .where(
                inArray(
                    targetHealthCheck.targetId,
                    targetsToBeRemoved.map((t) => t.targetId)
                )
            );

        const [deletedResource] = await db
            .delete(resources)
            .where(eq(resources.resourceId, resourceId))
            .returning();

        if (!deletedResource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        for (const target of targetsToBeRemoved) {
            const [site] = await db
                .select()
                .from(sites)
                .where(eq(sites.siteId, target.siteId))
                .limit(1);

            if (!site) {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Site with ID ${target.siteId} not found`
                    )
                );
            }

            if (site.pubKey) {
                if (site.type == "newt") {
                    // get the newt on the site by querying the newt table for siteId
                    const [newt] = await db
                        .select()
                        .from(newts)
                        .where(eq(newts.siteId, site.siteId))
                        .limit(1);

                    await removeTargets(
                        newt.newtId,
                        // [target],
                        [], // deleting the target from newt causes issues because we cant unbind the port. this needs to be fixed in newt before we can do this
                        healthChecksToBeRemoved,
                        deletedResource.mode === "udp" ? "udp" : "tcp",
                        newt.version
                    );
                }
            }
        }

        // Also delete default resource policy
        if (deletedResource.defaultResourcePolicyId) {
            await db
                .delete(resourcePolicies)
                .where(
                    eq(
                        resourcePolicies.resourcePolicyId,
                        deletedResource.defaultResourcePolicyId
                    )
                );
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Resource deleted successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
