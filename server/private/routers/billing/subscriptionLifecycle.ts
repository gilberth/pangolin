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

import {
    freeLimitSet,
    tier1LimitSet,
    tier2LimitSet,
    tier3LimitSet,
    limitsService,
    LimitSet
} from "@server/lib/billing";
import { usageService } from "@server/lib/billing/usageService";
import { SubscriptionType } from "./hooks/getSubType";

function getLimitSetForSubscriptionType(
    subType: SubscriptionType | null
): LimitSet {
    switch (subType) {
        case "tier1":
            return tier1LimitSet;
        case "tier2":
            return tier2LimitSet;
        case "tier3":
            return tier3LimitSet;
        case "license":
            // License subscriptions use tier2 limits by default
            // This can be adjusted based on your business logic
            return tier2LimitSet;
        default:
            return freeLimitSet;
    }
}

export async function handleSubscriptionLifesycle(
    orgId: string,
    status: string,
    subType: SubscriptionType | null = null
) {
    switch (status) {
        case "active":
            const activeLimitSet = getLimitSetForSubscriptionType(subType);
            await limitsService.applyLimitSetToOrg(orgId, activeLimitSet);
            await usageService.checkLimitSet(orgId);
            break;
        case "canceled":
            // Subscription canceled - revert to free tier
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId);
            break;
        case "past_due":
            // Payment past due - keep current limits but notify customer
            // Limits will revert to free tier if it becomes unpaid
            break;
        case "unpaid":
            // Subscription unpaid - revert to free tier
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId);
            break;
        case "incomplete":
            // Payment incomplete - give them time to complete payment
            break;
        case "incomplete_expired":
            // Payment never completed - revert to free tier
            await limitsService.applyLimitSetToOrg(orgId, freeLimitSet);
            await usageService.checkLimitSet(orgId);
            break;
        default:
            break;
    }
}
