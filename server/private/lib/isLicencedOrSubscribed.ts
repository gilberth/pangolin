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
import license from "#private/license/license";
import { isSubscribed } from "#private/lib/isSubscribed";
import { Tier } from "@server/types/Tiers";

export async function isLicensedOrSubscribed(
    orgId: string,
    tiers: Tier[]
): Promise<boolean> {
    if (build === "enterprise") {
        return await license.isUnlocked();
    }

    if (build === "saas") {
        return isSubscribed(orgId, tiers);
    }

    return false;
}
