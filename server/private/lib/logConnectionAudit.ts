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

import { logsDb, connectionAuditLog } from "@server/db";
import logger from "@server/logger";
import { and, eq, lt } from "drizzle-orm";
import { calculateCutoffTimestamp } from "@server/lib/cleanupLogs";

// ---------------------------------------------------------------------------
// Retry configuration for deadlock handling
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

// ---------------------------------------------------------------------------
// Buffer / flush configuration
// ---------------------------------------------------------------------------

/** How often to flush accumulated connection log data to the database. */
const FLUSH_INTERVAL_MS = 30_000; // 30 seconds

/** Maximum number of records to buffer before forcing a flush. */
const MAX_BUFFERED_RECORDS = 500;

/** Maximum number of records to insert in a single database batch. */
const INSERT_BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConnectionLogRecord {
    sessionId: string;
    siteResourceId: number;
    orgId: string;
    siteId: number;
    clientId: number | null;
    clientEndpoint: string | null;
    userId: string | null;
    sourceAddr: string;
    destAddr: string;
    protocol: string;
    startedAt: number; // epoch seconds
    endedAt: number | null;
    bytesTx: number | null;
    bytesRx: number | null;
}

// ---------------------------------------------------------------------------
// In-memory buffer
// ---------------------------------------------------------------------------

let buffer: ConnectionLogRecord[] = [];

// ---------------------------------------------------------------------------
// Deadlock helpers
// ---------------------------------------------------------------------------

function isDeadlockError(error: any): boolean {
    return (
        error?.code === "40P01" ||
        error?.cause?.code === "40P01" ||
        (error?.message && error.message.includes("deadlock"))
    );
}

async function withDeadlockRetry<T>(
    operation: () => Promise<T>,
    context: string
): Promise<T> {
    let attempt = 0;
    while (true) {
        try {
            return await operation();
        } catch (error: any) {
            if (isDeadlockError(error) && attempt < MAX_RETRIES) {
                attempt++;
                const baseDelay = Math.pow(2, attempt - 1) * BASE_DELAY_MS;
                const jitter = Math.random() * baseDelay;
                const delay = baseDelay + jitter;
                logger.warn(
                    `Deadlock detected in ${context}, retrying attempt ${attempt}/${MAX_RETRIES} after ${delay.toFixed(0)}ms`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

/**
 * Flush all buffered connection log records to the database.
 *
 * Swaps out the buffer before writing so that any records added during the
 * flush are captured in the new buffer rather than being lost. Entries that
 * fail to write are re-queued back into the buffer so they will be retried
 * on the next flush.
 *
 * This function is exported so that the application's graceful-shutdown
 * cleanup handler can call it before the process exits.
 */
export async function flushConnectionLogToDb(): Promise<void> {
    if (buffer.length === 0) {
        return;
    }

    // Atomically swap out the buffer so new data keeps flowing in
    const snapshot = buffer;
    buffer = [];

    logger.debug(
        `Flushing ${snapshot.length} connection log record(s) to the database`
    );

    for (let i = 0; i < snapshot.length; i += INSERT_BATCH_SIZE) {
        const batch = snapshot.slice(i, i + INSERT_BATCH_SIZE);

        try {
            await withDeadlockRetry(async () => {
                await logsDb.insert(connectionAuditLog).values(batch);
            }, `flush connection log batch (${batch.length} records)`);
        } catch (error) {
            logger.error(
                `Failed to flush connection log batch of ${batch.length} records:`,
                error
            );

            // Re-queue the failed batch so it is retried on the next flush
            buffer = [...batch, ...buffer];

            // Cap buffer to prevent unbounded growth if the DB is unreachable
            const hardLimit = MAX_BUFFERED_RECORDS * 5;
            if (buffer.length > hardLimit) {
                const dropped = buffer.length - hardLimit;
                buffer = buffer.slice(0, hardLimit);
                logger.warn(
                    `Connection log buffer overflow, dropped ${dropped} oldest records`
                );
            }

            // Stop processing further batches from this snapshot - they will
            // be picked up via the re-queued records on the next flush.
            const remaining = snapshot.slice(i + INSERT_BATCH_SIZE);
            if (remaining.length > 0) {
                buffer = [...remaining, ...buffer];
            }
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// Periodic flush timer
// ---------------------------------------------------------------------------

const flushTimer = setInterval(async () => {
    try {
        await flushConnectionLogToDb();
    } catch (error) {
        logger.error(
            "Unexpected error during periodic connection log flush:",
            error
        );
    }
}, FLUSH_INTERVAL_MS);

// Calling unref() means this timer will not keep the Node.js event loop alive
// on its own - the process can still exit normally when there is no other work
// left. The graceful-shutdown path will call flushConnectionLogToDb() explicitly
// before process.exit(), so no data is lost.
flushTimer.unref();

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanUpOldLogs(
    orgId: string,
    retentionDays: number
): Promise<void> {
    const cutoffTimestamp = calculateCutoffTimestamp(retentionDays);

    try {
        await logsDb
            .delete(connectionAuditLog)
            .where(
                and(
                    lt(connectionAuditLog.startedAt, cutoffTimestamp),
                    eq(connectionAuditLog.orgId, orgId)
                )
            );
    } catch (error) {
        logger.error("Error cleaning up old connection audit logs:", error);
    }
}

// ---------------------------------------------------------------------------
// Public logging entry-point
// ---------------------------------------------------------------------------

/**
 * Buffer a single connection log record for eventual persistence.
 *
 * Records are written to the database in batches either when the buffer
 * reaches MAX_BUFFERED_RECORDS or when the periodic flush timer fires.
 */
export function logConnectionAudit(record: ConnectionLogRecord): void {
    buffer.push(record);

    if (buffer.length >= MAX_BUFFERED_RECORDS) {
        // Fire and forget - errors are handled inside flushConnectionLogToDb
        flushConnectionLogToDb().catch((error) => {
            logger.error(
                "Unexpected error during size-triggered connection log flush:",
                error
            );
        });
    }
}
