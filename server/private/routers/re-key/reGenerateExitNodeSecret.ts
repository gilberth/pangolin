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

import { NextFunction, Request, Response } from "express";
import {
    db,
    exitNodes,
    exitNodeOrgs,
    ExitNode,
    ExitNodeOrg,
    RemoteExitNode
} from "@server/db";
import HttpCode from "@server/types/HttpCode";
import { z } from "zod";
import { remoteExitNodes } from "@server/db";
import createHttpError from "http-errors";
import response from "@server/lib/response";
import { fromError } from "zod-validation-error";
import { hashPassword } from "@server/auth/password";
import logger from "@server/logger";
import { and, eq } from "drizzle-orm";
import { OpenAPITags, registry } from "@server/openApi";
import { disconnectClient, sendToClient } from "#private/routers/ws";

export const paramsSchema = z.object({
    orgId: z.string()
});

const bodySchema = z.strictObject({
    remoteExitNodeId: z.string().length(15),
    secret: z.string().length(48),
    disconnect: z.boolean().optional().default(true)
});

export async function reGenerateExitNodeSecret(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = paramsSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedParams.error).toString()
                )
            );
        }

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }

        const { remoteExitNodeId, secret, disconnect } = parsedBody.data;

        const [existingRemoteExitNode] = await db
            .select()
            .from(remoteExitNodes)
            .where(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId));

        if (!existingRemoteExitNode) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    "Remote Exit Node does not exist"
                )
            );
        }

        const secretHash = await hashPassword(secret);

        await db
            .update(remoteExitNodes)
            .set({ secretHash })
            .where(eq(remoteExitNodes.remoteExitNodeId, remoteExitNodeId));

        // Only disconnect if explicitly requested
        if (disconnect) {
            const payload = {
                type: `remoteExitNode/terminate`,
                data: {}
            };
            // Don't await this to prevent blocking the response
            sendToClient(
                existingRemoteExitNode.remoteExitNodeId,
                payload
            ).catch((error) => {
                logger.error(
                    "Failed to send termination message to remote exit node:",
                    error
                );
            });

            disconnectClient(existingRemoteExitNode.remoteExitNodeId).catch(
                (error) => {
                    logger.error(
                        "Failed to disconnect remote exit node after re-key:",
                        error
                    );
                }
            );
        }

        return response(res, {
            data: null,
            success: true,
            error: false,
            message: "Remote Exit Node secret updated successfully",
            status: HttpCode.OK
        });
    } catch (e) {
        logger.error("Failed to update remoteExitNode", e);
        return next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Failed to update remoteExitNode"
            )
        );
    }
}
