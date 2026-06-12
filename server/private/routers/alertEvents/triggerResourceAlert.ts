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
import { resources } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { eq, and } from "drizzle-orm";
import {
    fireResourceHealthyAlert,
    fireResourceUnhealthyAlert,
    fireResourceDegradedAlert
} from "@server/lib/alerts";

const paramsSchema = z.strictObject({
    orgId: z.string().nonempty(),
    resourceId: z.coerce.number().int().positive()
});

const bodySchema = z.strictObject({
    eventType: z.enum([
        "resource_healthy",
        "resource_unhealthy",
        "resource_degraded",
        "resource_toggle"
    ])
});

export type TriggerResourceAlertResponse = {
    success: true;
};

export async function triggerResourceAlert(
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
        const { orgId, resourceId } = parsedParams.data;

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

        // Verify the resource exists and belongs to the org
        const [resource] = await db
            .select()
            .from(resources)
            .where(
                and(
                    eq(resources.resourceId, resourceId),
                    eq(resources.orgId, orgId)
                )
            )
            .limit(1);

        if (!resource) {
            return next(
                createHttpError(
                    HttpCode.NOT_FOUND,
                    `Resource ${resourceId} not found in organization ${orgId}`
                )
            );
        }

        if (eventType === "resource_healthy") {
            await fireResourceHealthyAlert(
                orgId,
                resourceId,
                resource.name ?? undefined
            );
        } else if (eventType === "resource_unhealthy") {
            await fireResourceUnhealthyAlert(
                orgId,
                resourceId,
                resource.name ?? undefined
            );
        } else if (eventType === "resource_degraded") {
            await fireResourceDegradedAlert(
                orgId,
                resourceId,
                resource.name ?? undefined
            );
        }

        return response<TriggerResourceAlertResponse>(res, {
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
