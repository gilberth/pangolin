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
    getLicensePriceSet,
} from "@server/lib/billing/licenses";
import {
    getTier1FeaturePriceSet,
    getTier2FeaturePriceSet,
    getTier3FeaturePriceSet,
} from "@server/lib/billing/features";
import Stripe from "stripe";
import { Tier } from "@server/types/Tiers";

export type SubscriptionType = Tier | "license";

export function getSubType(fullSubscription: Stripe.Response<Stripe.Subscription>): SubscriptionType | null {
    // Determine subscription type by checking subscription items
    if (!Array.isArray(fullSubscription.items?.data) || fullSubscription.items.data.length === 0) {
        return null;
    }

    for (const item of fullSubscription.items.data) {
        const priceId = item.price.id;

        // Check if price ID matches any license price
        const licensePrices = Object.values(getLicensePriceSet());
        if (licensePrices.includes(priceId)) {
            return "license";
        }

        // Check if price ID matches home lab tier
        const homeLabPrices = Object.values(getTier1FeaturePriceSet());
        if (homeLabPrices.includes(priceId)) {
            return "tier1";
        }

        // Check if price ID matches tier2 tier
        const tier2Prices = Object.values(getTier2FeaturePriceSet());
        if (tier2Prices.includes(priceId)) {
            return "tier2";
        }

        // Check if price ID matches tier3 tier
        const tier3Prices = Object.values(getTier3FeaturePriceSet());
        if (tier3Prices.includes(priceId)) {
            return "tier3";
        }
    }

    return null;
}
