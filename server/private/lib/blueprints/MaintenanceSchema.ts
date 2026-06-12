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

import { z } from "zod";

export const MaintenanceSchema = z.object({
    enabled: z.boolean().optional(),
    type: z.enum(["forced", "automatic"]).optional(),
    title: z.string().max(255).nullable().optional(),
    message: z.string().max(2000).nullable().optional(),
    "estimated-time": z.string().max(100).nullable().optional()
});
