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
import { db, idpOidcConfig } from "@server/db";
import { idp, idpOrg, orgs, roles, userOrgRoles } from "@server/db";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import { and, eq, inArray, sql } from "drizzle-orm";
import logger from "@server/logger";
import { fromError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { ListUserAdminOrgIdpsResponse } from "@server/routers/orgIdp/types";

const querySchema = z.strictObject({
    limit: z
        .string()
        .optional()
        .default("1000")
        .transform(Number)
        .pipe(z.int().nonnegative()),
    offset: z
        .string()
        .optional()
        .default("0")
        .transform(Number)
        .pipe(z.int().nonnegative())
});

const paramsSchema = z.strictObject({
    userId: z.string().nonempty()
});

async function getOrgIdsWhereUserIsAdmin(userId: string): Promise<string[]> {
    const rows = await db
        .select({ orgId: userOrgRoles.orgId })
        .from(userOrgRoles)
        .innerJoin(roles, eq(userOrgRoles.roleId, roles.roleId))
        .where(and(eq(userOrgRoles.userId, userId), eq(roles.isAdmin, true)));
    return [...new Set(rows.map((r) => r.orgId))];
}

async function queryIdpsForOrgs(
    orgIds: string[],
    limit: number,
    offset: number
) {
    return db
        .select({
            idpId: idp.idpId,
            orgId: idpOrg.orgId,
            orgName: orgs.name,
            name: idp.name,
            type: idp.type,
            variant: idpOidcConfig.variant,
            tags: idp.tags
        })
        .from(idpOrg)
        .where(inArray(idpOrg.orgId, orgIds))
        .innerJoin(orgs, eq(orgs.orgId, idpOrg.orgId))
        .innerJoin(idp, eq(idp.idpId, idpOrg.idpId))
        .innerJoin(idpOidcConfig, eq(idpOidcConfig.idpId, idpOrg.idpId))
        .orderBy(sql`idp.name DESC`)
        .limit(limit)
        .offset(offset);
}

async function countIdpsForOrgs(orgIds: string[]) {
    const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(idpOrg)
        .innerJoin(idp, eq(idp.idpId, idpOrg.idpId))
        .innerJoin(idpOidcConfig, eq(idpOidcConfig.idpId, idpOrg.idpId))
        .where(inArray(idpOrg.orgId, orgIds));
    return count;
}

export async function listUserAdminOrgIdps(
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
        const { userId } = parsedParams.data;

        const parsedQuery = querySchema.safeParse(req.query);
        if (!parsedQuery.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromError(parsedQuery.error).toString()
                )
            );
        }
        const { limit, offset } = parsedQuery.data;

        const adminOrgIds = await getOrgIdsWhereUserIsAdmin(userId);

        if (adminOrgIds.length === 0) {
            return response<ListUserAdminOrgIdpsResponse>(res, {
                data: {
                    idps: [],
                    pagination: {
                        total: 0,
                        limit,
                        offset
                    }
                },
                success: true,
                error: false,
                message: "Org Idps retrieved successfully",
                status: HttpCode.OK
            });
        }

        const list = await queryIdpsForOrgs(adminOrgIds, limit, offset);
        const total = await countIdpsForOrgs(adminOrgIds);

        return response<ListUserAdminOrgIdpsResponse>(res, {
            data: {
                idps: list,
                pagination: {
                    total,
                    limit,
                    offset
                }
            },
            success: true,
            error: false,
            message: "Org Idps retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}
