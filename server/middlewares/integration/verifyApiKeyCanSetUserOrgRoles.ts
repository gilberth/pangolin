import { Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";
import logger from "@server/logger";
import { ActionsEnum } from "@server/auth/actions";
import { db } from "@server/db";
import { apiKeyActions } from "@server/db";
import { and, eq } from "drizzle-orm";

async function apiKeyHasAction(apiKeyId: string, actionId: ActionsEnum) {
    const [row] = await db
        .select()
        .from(apiKeyActions)
        .where(
            and(
                eq(apiKeyActions.apiKeyId, apiKeyId),
                eq(apiKeyActions.actionId, actionId)
            )
        );
    return !!row;
}

/**
 * Allows setUserOrgRoles on the key, or both addUserRole and removeUserRole.
 */
export function verifyApiKeyCanSetUserOrgRoles() {
    return async function (
        req: Request,
        res: Response,
        next: NextFunction
    ): Promise<any> {
        try {
            if (!req.apiKey) {
                return next(
                    createHttpError(
                        HttpCode.UNAUTHORIZED,
                        "API Key not authenticated"
                    )
                );
            }

            const keyId = req.apiKey.apiKeyId;

            if (await apiKeyHasAction(keyId, ActionsEnum.setUserOrgRoles)) {
                return next();
            }

            const hasAdd = await apiKeyHasAction(keyId, ActionsEnum.addUserRole);
            const hasRemove = await apiKeyHasAction(
                keyId,
                ActionsEnum.removeUserRole
            );

            if (hasAdd && hasRemove) {
                return next();
            }

            return next(
                createHttpError(
                    HttpCode.FORBIDDEN,
                    "Key does not have permission perform this action"
                )
            );
        } catch (error) {
            logger.error("Error verifying API key set user org roles:", error);
            return next(
                createHttpError(
                    HttpCode.INTERNAL_SERVER_ERROR,
                    "Error verifying key action access"
                )
            );
        }
    };
}
