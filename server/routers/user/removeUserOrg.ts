import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
    db,
    orgs,
    resources,
    siteResources,
    sites,
    UserOrg,
    userSiteResources,
    primaryDb
} from "@server/db";
import { userOrgs, userResources, users, userSites } from "@server/db";
import { and, count, eq, exists, inArray } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { usageService } from "@server/lib/billing/usageService";
import { FeatureId } from "@server/lib/billing";
import { build } from "@server/build";
import { UserType } from "@server/types/UserTypes";
import { calculateUserClientsForOrgs } from "@server/lib/calculateUserClientsForOrgs";
import { removeUserFromOrg } from "@server/lib/userOrg";

const removeUserSchema = z.strictObject({
    userId: z.string(),
    orgId: z.string()
});

registry.registerPath({
    method: "delete",
    path: "/org/{orgId}/user/{userId}",
    description: "Remove a user from an organization.",
    tags: [OpenAPITags.User],
    request: {
        params: removeUserSchema
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

export async function removeUserOrg(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = removeUserSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const { userId, orgId } = parsedParams.data;

        // get the user first
        const [user] = await db
            .select()
            .from(userOrgs)
            .where(and(eq(userOrgs.userId, userId), eq(userOrgs.orgId, orgId)));

        if (!user) {
            return next(createHttpError(HttpCode.NOT_FOUND, "User not found"));
        }

        if (user.isOwner) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Cannot remove owner from org"
                )
            );
        }

        const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (!org) {
            return next(
                createHttpError(HttpCode.NOT_FOUND, "Organization not found")
            );
        }

        await db.transaction(async (trx) => {
            await removeUserFromOrg(org, userId, trx);
        });

        calculateUserClientsForOrgs(userId, primaryDb).catch((e) => {
            logger.error(
                `Failed to calculate user clients after removing user ${userId} from org ${orgId}: ${e}`
            );
        });

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "User removed from org successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
