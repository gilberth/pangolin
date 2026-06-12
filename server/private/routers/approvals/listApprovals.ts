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
import { build } from "@server/build";
import {
    approvals,
    clients,
    db,
    users,
    olms,
    currentFingerprint,
    type Approval
} from "@server/db";
import { eq, isNull, sql, not, and, desc, gte, lte } from "drizzle-orm";
import response from "@server/lib/response";
import { getUserDeviceName } from "@server/db/names";

const paramsSchema = z.strictObject({
    orgId: z.string()
});

const querySchema = z.strictObject({
    limit: z.coerce
        .number<string>() // for prettier formatting
        .int()
        .positive()
        .optional()
        .catch(20)
        .default(20),
    cursorPending: z.coerce // pending cursor
        .number<string>()
        .int()
        .max(1) // 0 means non pending
        .min(0) // 1 means pending
        .optional()
        .catch(undefined),
    cursorTimestamp: z.coerce
        .number<string>()
        .int()
        .positive()
        .optional()
        .catch(undefined),
    approvalState: z
        .enum(["pending", "approved", "denied", "all"])
        .optional()
        .default("all")
        .catch("all"),
    clientId: z
        .string()
        .optional()
        .transform((val) => (val ? Number(val) : undefined))
        .pipe(z.number().int().positive().optional())
});

async function queryApprovals({
    orgId,
    limit,
    approvalState,
    cursorPending,
    cursorTimestamp,
    clientId
}: {
    orgId: string;
    limit: number;
    approvalState: z.infer<typeof querySchema>["approvalState"];
    cursorPending?: number;
    cursorTimestamp?: number;
    clientId?: number;
}) {
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

    const conditions = [
        eq(approvals.orgId, orgId),
        sql`${approvals.decision} in ${state}`
    ];

    if (clientId) {
        conditions.push(eq(approvals.clientId, clientId));
    }

    const pendingSortKey = sql`CASE ${approvals.decision} WHEN 'pending' THEN 1 ELSE 0 END`;

    if (cursorPending != null && cursorTimestamp != null) {
        // https://stackoverflow.com/a/79720298/10322846
        // composite cursor, next data means (pending, timestamp) <= cursor
        conditions.push(
            lte(pendingSortKey, cursorPending),
            lte(approvals.timestamp, cursorTimestamp)
        );
    }

    const res = await db
        .select({
            approvalId: approvals.approvalId,
            orgId: approvals.orgId,
            clientId: approvals.clientId,
            decision: approvals.decision,
            type: approvals.type,
            user: {
                name: users.name,
                userId: users.userId,
                username: users.username,
                email: users.email
            },
            clientName: clients.name,
            niceId: clients.niceId,
            deviceModel: currentFingerprint.deviceModel,
            fingerprintPlatform: currentFingerprint.platform,
            fingerprintOsVersion: currentFingerprint.osVersion,
            fingerprintKernelVersion: currentFingerprint.kernelVersion,
            fingerprintArch: currentFingerprint.arch,
            fingerprintSerialNumber: currentFingerprint.serialNumber,
            fingerprintUsername: currentFingerprint.username,
            fingerprintHostname: currentFingerprint.hostname,
            timestamp: approvals.timestamp
        })
        .from(approvals)
        .innerJoin(users, and(eq(approvals.userId, users.userId)))
        .leftJoin(
            clients,
            and(
                eq(approvals.clientId, clients.clientId),
                not(isNull(clients.userId)) // only user devices
            )
        )
        .leftJoin(olms, eq(clients.clientId, olms.clientId))
        .leftJoin(currentFingerprint, eq(olms.olmId, currentFingerprint.olmId))
        .where(and(...conditions))
        .orderBy(desc(pendingSortKey), desc(approvals.timestamp))
        .limit(limit + 1); // the `+1` is used for the cursor

    // Process results to format device names and build fingerprint objects
    const approvalsList = res.slice(0, limit).map((approval) => {
        const model = approval.deviceModel || null;
        const deviceName = approval.clientName
            ? getUserDeviceName(model, approval.clientName)
            : null;

        // Build fingerprint object if any fingerprint data exists
        const hasFingerprintData =
            approval.fingerprintPlatform ||
            approval.fingerprintOsVersion ||
            approval.fingerprintKernelVersion ||
            approval.fingerprintArch ||
            approval.fingerprintSerialNumber ||
            approval.fingerprintUsername ||
            approval.fingerprintHostname ||
            approval.deviceModel;

        const fingerprint = hasFingerprintData
            ? {
                  platform: approval.fingerprintPlatform ?? null,
                  osVersion: approval.fingerprintOsVersion ?? null,
                  kernelVersion: approval.fingerprintKernelVersion ?? null,
                  arch: approval.fingerprintArch ?? null,
                  deviceModel: approval.deviceModel ?? null,
                  serialNumber: approval.fingerprintSerialNumber ?? null,
                  username: approval.fingerprintUsername ?? null,
                  hostname: approval.fingerprintHostname ?? null
              }
            : null;

        const {
            clientName,
            deviceModel,
            fingerprintPlatform,
            fingerprintOsVersion,
            fingerprintKernelVersion,
            fingerprintArch,
            fingerprintSerialNumber,
            fingerprintUsername,
            fingerprintHostname,
            ...rest
        } = approval;

        return {
            ...rest,
            deviceName,
            fingerprint,
            niceId: approval.niceId || null
        };
    });
    let nextCursorPending: number | null = null;
    let nextCursorTimestamp: number | null = null;
    if (res.length > limit) {
        const lastItem = res[limit];
        nextCursorPending = lastItem.decision === "pending" ? 1 : 0;
        nextCursorTimestamp = lastItem.timestamp;
    }
    return {
        approvalsList,
        nextCursorPending,
        nextCursorTimestamp
    };
}

export type ListApprovalsResponse = {
    approvals: NonNullable<
        Awaited<ReturnType<typeof queryApprovals>>
    >["approvalsList"];
    pagination: {
        total: number;
        limit: number;
        cursorPending: number | null;
        cursorTimestamp: number | null;
    };
};

export async function listApprovals(
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
        const {
            limit,
            cursorPending,
            cursorTimestamp,
            approvalState,
            clientId
        } = parsedQuery.data;

        const { orgId } = parsedParams.data;

        const { approvalsList, nextCursorPending, nextCursorTimestamp } =
            await queryApprovals({
                orgId: orgId.toString(),
                limit,
                cursorPending,
                cursorTimestamp,
                approvalState,
                clientId
            });

        const [{ count }] = await db
            .select({ count: sql<number>`count(*)` })
            .from(approvals);

        return response<ListApprovalsResponse>(res, {
            data: {
                approvals: approvalsList,
                pagination: {
                    total: count,
                    limit,
                    cursorPending: nextCursorPending,
                    cursorTimestamp: nextCursorTimestamp
                }
            },
            success: true,
            error: false,
            message: "Approvals retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
