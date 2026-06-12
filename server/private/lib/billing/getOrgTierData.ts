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

import { build } from "@server/build";
import { db, customers, subscriptions, orgs } from "@server/db";
import logger from "@server/logger";
import { Tier } from "@server/types/Tiers";
import { eq, and, ne } from "drizzle-orm";

export async function getOrgTierData(
    orgId: string
): Promise<{ tier: Tier | null; active: boolean; isTrial: boolean }> {
    let tier: Tier | null = null;
    let active = false;
    let isTrial = false;

    if (build !== "saas") {
        return { tier, active, isTrial };
    }

    try {
        const [org] = await db
            .select()
            .from(orgs)
            .where(eq(orgs.orgId, orgId))
            .limit(1);

        if (!org) {
            return { tier, active, isTrial };
        }

        let orgIdToUse = org.orgId;
        if (!org.isBillingOrg) {
            if (!org.billingOrgId) {
                logger.warn(
                    `Org ${orgId} is not a billing org and does not have a billingOrgId`
                );
                return { tier, active, isTrial };
            }
            orgIdToUse = org.billingOrgId;
        }

        // Get customer for org
        const [customer] = await db
            .select()
            .from(customers)
            .where(eq(customers.orgId, orgIdToUse))
            .limit(1);

        if (!customer) {
            return { tier, active, isTrial };
        }

        // Query for active subscriptions that are not license type
        const [subscription] = await db
            .select()
            .from(subscriptions)
            .where(
                and(
                    eq(subscriptions.customerId, customer.customerId),
                    eq(subscriptions.status, "active"),
                    ne(subscriptions.type, "license")
                )
            )
            .limit(1);

        if (subscription) {
            // Validate that subscription.type is one of the expected tier values
            if (
                subscription.type === "tier1" ||
                subscription.type === "tier2" ||
                subscription.type === "tier3" ||
                subscription.type === "enterprise"
            ) {
                tier = subscription.type;
                active = true;
            }

            isTrial = subscription.trial ?? false;
        }
    } catch (error) {
        // If org not found or error occurs, return null tier and inactive
        // This is acceptable behavior as per the function signature
    }

    return { tier, active, isTrial };
}
