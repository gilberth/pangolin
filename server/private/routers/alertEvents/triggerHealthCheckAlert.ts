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

import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { db } from "@server/db";
import { targetHealthCheck } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq, and } from "drizzle-orm";
import {
    fireHealthCheckHealthyAlert,
    fireHealthCheckUnhealthyAlert
} from "@server/lib/alerts";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    healthCheckId: z.coerce.number().int().positive()
});

const bodySchema = z.strictObject({
    eventType: z.enum(["health_check_healthy", "health_check_unhealthy"])
});

export type TriggerHealthCheckAlertResponse = {
    success: true;
};

export async function triggerHealthCheckAlert(
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
        const { orgId, healthCheckId } = parsedParams.data;

        const parsedBody = bodySchema.safeParse(req.body);
        if (!parsedBody.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedBody.error).toString()
                )
            );
        }
        const { eventType } = parsedBody.data;

        // Verify the health check exists and belongs to the org
        const [healthCheck] = await db
            .select()
            .from(targetHealthCheck)
            .where(
                and(
                    eq(targetHealthCheck.targetHealthCheckId, healthCheckId),
                    eq(targetHealthCheck.orgId, orgId)
                )
            )
            .limit(1);

        if (!healthCheck) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Health check ${healthCheckId} not found in organization ${orgId}`
                )
            );
        }

        if (eventType === "health_check_healthy") {
            await fireHealthCheckHealthyAlert(
                orgId,
                healthCheckId,
                healthCheck.name ?? undefined
            );
        } else {
            await fireHealthCheckUnhealthyAlert(
                orgId,
                healthCheckId,
                healthCheck.name ?? undefined
            );
        }

        return response<TriggerHealthCheckAlertResponse>(res, {
            data: { success: true },
            success: true,
            error: false,
            message: "Alert triggered successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
