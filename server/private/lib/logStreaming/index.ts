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
import { LogStreamingManager } from "./LogStreamingManager";

/**
 * Module-level singleton.  Importing this module is sufficient to start the
 * streaming manager – no explicit init call required by the caller.
 *
 * The manager registers a non-blocking timer (unref'd) so it will not keep
 * the Node.js event loop alive on its own.  Call `logStreamingManager.shutdown()`
 * during graceful shutdown to drain any in-progress poll and release resources.
 */
export const logStreamingManager = new LogStreamingManager();

if (build !== "saas") {
    // this is handled separately in the saas build, so we don't want to start it here
    logStreamingManager.start();
}

export { LogStreamingManager } from "./LogStreamingManager";
export type { LogDestinationProvider } from "./providers/LogDestinationProvider";
export { HttpLogDestination } from "./providers/HttpLogDestination";
export * from "./types";
