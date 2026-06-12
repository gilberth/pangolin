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
import { Org, orgs } from "@server/db";
import { eq } from "drizzle-orm";
import response from "@server/lib/response";
import HttpCode from "@server/types/HttpCode";
import createHttpError from "http-errors";
import logger from "@server/logger";
import { fromZodError } from "zod-validation-error";
import { OpenAPITags, registry } from "@server/openApi";
import { GetOrgSubscriptionResponse } from "@server/routers/billing/types";
import { usageService } from "@server/lib/billing/usageService";
import { build } from "@server/build";

// Import tables for billing
import {
    customers,
    subscriptions,
    subscriptionItems,
    Subscription,
    SubscriptionItem
} from "@server/db";

const getOrgSchema = z.strictObject({
    orgId: z.string()
});

export async function getOrgSubscriptions(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<any> {
    try {
        const parsedParams = getOrgSchema.safeParse(req.params);
        if (!parsedParams.success) {
            return next(
                createHttpError(
                    HttpCode.BAD_REQUEST,
                    fromZodError(parsedParams.error)
                )
            );
        }

        const { orgId } = parsedParams.data;

        let subscriptions = null;
        try {
            subscriptions = await getOrgSubscriptionsData(orgId);
        } catch (err) {
            if ((err as Error).message === "Not found") {
                return next(
                    createHttpError(
                        HttpCode.NOT_FOUND,
                        `Organization with ID ${orgId} not found`
                    )
                );
            }
            throw err;
        }

        let limitsExceeded = false;
        if (build === "saas") {
            try {
                limitsExceeded = await usageService.checkLimitSet(orgId);
            } catch (err) {
                logger.error("Error checking limits for org %s: %s", orgId, err);
            }
        }

        return response<GetOrgSubscriptionResponse>(res, {
            data: {
                subscriptions,
                ...(build === "saas" ? { limitsExceeded } : {})
            },
            success: true,
            error: false,
            message: "Organization and subscription retrieved successfully",
            status: HttpCode.OK
        });
    } catch (error) {
        logger.error(error);
        return next(
            createHttpError(HttpCode.INTERNAL_SERVER_ERROR, "An error occurred")
        );
    }
}

export async function getOrgSubscriptionsData(
    orgId: string
): Promise<Array<{ subscription: Subscription; items: SubscriptionItem[] }>> {
    const org = await db
        .select()
        .from(orgs)
        .where(eq(orgs.orgId, orgId))
        .limit(1);

    if (org.length === 0) {
        throw new Error(`Not found`);
    }

    const billingOrgId = org[0].billingOrgId || org[0].orgId;

    // Get customer for org
    const customer = await db
        .select()
        .from(customers)
        .where(eq(customers.orgId, billingOrgId))
        .limit(1);

    const subscriptionsWithItems: Array<{
        subscription: Subscription;
        items: SubscriptionItem[];
    }> = [];

    if (customer.length > 0) {
        // Get all subscriptions for customer
        const subs = await db
            .select()
            .from(subscriptions)
            .where(eq(subscriptions.customerId, customer[0].customerId));

        for (const subscription of subs) {
            // Get subscription items for each subscription
            const items = await db
                .select()
                .from(subscriptionItems)
                .where(
                    eq(
                        subscriptionItems.subscriptionId,
                        subscription.subscriptionId
                    )
                );

            subscriptionsWithItems.push({
                subscription,
                items
            });
        }
    }

    return subscriptionsWithItems;
}
