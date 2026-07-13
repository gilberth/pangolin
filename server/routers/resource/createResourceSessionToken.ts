import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { resources, users, userOrgs } from "@server/db";
import { eq, and } from "drizzle-orm";
import { createResourceSession } from "@server/auth/sessions/resource";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { fromError } from "zod-validation-error";
import logger from "@server/logger";
import { createSession, generateSessionToken } from "@server/auth/sessions/app";
import { response } from "@server/lib/response";

const createResourceSessionTokenParams = z.strictObject({
    resourceId: z.coerce.number().int().positive()
});

const createResourceSessionTokenBody = z.strictObject({
    userId: z.string().nonempty(),
    idpId: z.coerce.number().int().positive().optional()
});

export type CreateResourceSessionTokenResponse = {
    requestToken: string;
};

export async function createResourceSessionToken(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = createResourceSessionTokenParams.safeParse(
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

        const parsedBody = createResourceSessionTokenBody.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { resourceId } = parsedParams.data;
        const { userId, idpId } = parsedBody.data;

        const [resource] = await db
            .select()
            .from(resources)
            .where(eq(resources.resourceId, resourceId))
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource with ID ${resourceId} not found`
                )
            );
        }

        const candidates = await db
            .select({ userId: users.userId })
            .from(userOrgs)
            .innerJoin(users, eq(userOrgs.userId, users.userId))
            .where(
                and(
                    eq(users.userId, userId),
                    eq(userOrgs.orgId, resource.orgId)
                )
            );

        if (candidates.length === 0) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `User not found in the organization that owns this resource`
                )
            );
        }

        if (candidates.length > 1) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    "Multiple users match this username (external users from different identity providers). Specify idpId to disambiguate."
                )
            );
        }

        const targetUserId = candidates[0].userId;

        const appSessionToken = generateSessionToken();
        const appSession = await createSession(appSessionToken, targetUserId);

        const requestToken = generateSessionToken();
        await createResourceSession({
            resourceId,
            token: requestToken,
            userSessionId: appSession.sessionId,
            isRequestToken: true,
            expiresAt: Date.now() + 1000 * 30, // 30 seconds
            sessionLength: 1000 * 30,
            doNotExtend: true
        });

        logger.debug("Resource session token created successfully");

        return response<CreateResourceSessionTokenResponse>(res, {
            data: { requestToken },
            success: true,
            error: false,
            message: "Resource session token created successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
