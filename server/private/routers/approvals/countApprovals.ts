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

import logger from "@server/logger";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import type { Request, Response, NextFunction } from "express";
import { approvals, db, type Approval } from "@server/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import response from "@server/lib/response";

const paramsSchema = z.strictObject({
    orgId: z.string()
});

const querySchema = z.strictObject({
    approvalState: z
        .enum(["pending", "approved", "denied", "all"])
        .optional()
        .default("all")
        .catch("all")
});

export type CountApprovalsResponse = {
    count: number;
};

export async function countApprovals(
    req: Request,
    res: Response,
    next: NextFunction
) {
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

        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }

        const { approvalState } = parsedQuery.data;
        const { orgId } = parsedParams.data;

        let state: Array<Approval["decision"]> = [];
        switch (approvalState) {
            case "pending":
                state = ["pending"];
                break;
            case "approved":
                state = ["approved"];
                break;
            case "denied":
                state = ["denied"];
                break;
            default:
                state = ["approved", "denied", "pending"];
        }

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(approvals)
            .where(
                and(
                    eq(approvals.orgId, orgId),
                    inArray(approvals.decision, state)
                )
            );

        return response<CountApprovalsResponse>(res, {
            data: {
                count
            },
            success: true,
            error: false,
            message: "Approval count retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
