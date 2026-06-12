import { db } from "@server/db";
import { MessageHandler } from "@server/routers/ws";
import { clients } from "@server/db";
import { eq, sql } from "drizzle-orm";
import logger from "@server/logger";

interface PeerBandwidth {
    publicKey: string;
    bytesIn: number;
    bytesOut: number;
}

interface BandwidthAccumulator {
    bytesIn: number;
    bytesOut: number;
}

// Retry configuration for deadlock handling
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 50;

// How often to flush accumulated bandwidth data to the database
const FLUSH_INTERVAL_MS = 120_000; // 120 seconds

// In-memory accumulator: publicKey -> { bytesIn, bytesOut }
let accumulator = new Map<string, BandwidthAccumulator>();

/**
 * Check if an error is a deadlock error
 */
function isDeadlockError(error: any): boolean {
    return (
        error?.code === "40P01" ||
        error?.cause?.code === "40P01" ||
        (error?.message && error.message.includes("deadlock"))
    );
}

/**
 * Execute a function with retry logic for deadlock handling
 */
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

/**
 * Flush all accumulated bandwidth data to the database.
 *
 * Swaps out the accumulator before writing so that any bandwidth messages
 * received during the flush are captured in the new accumulator rather than
 * being lost or causing contention. Entries that fail to write are re-queued
 * back into the accumulator so they will be retried on the next flush.
 *
 * This function is exported so that the application's graceful-shutdown
 * cleanup handler can call it before the process exits.
 */
export async function flushBandwidthToDb(): Promise<void> {
    if (accumulator.size === 0) {
        return;
    }

    // Atomically swap out the accumulator so new data keeps flowing in
    // while we write the snapshot to the database.
    const snapshot = accumulator;
    accumulator = new Map<string, BandwidthAccumulator>();

    const currentTime = new Date().toISOString();

    // Sort by publicKey for consistent lock ordering across concurrent
    // writers - this is the same deadlock-prevention strategy used in the
    // original per-message implementation.
    const sortedEntries = [...snapshot.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
    );

    logger.debug(
        `Flushing accumulated bandwidth data for ${sortedEntries.length} client(s) to the database`
    );

    for (const [publicKey, { bytesIn, bytesOut }] of sortedEntries) {
        try {
            await withDeadlockRetry(async () => {
                // Use atomic SQL increment to avoid the SELECT-then-UPDATE
                // anti-pattern and the races it would introduce.
                await db
                    .update(clients)
                    .set({
                        // Note: bytesIn from peer goes to megabytesOut (data
                        // sent to client) and bytesOut from peer goes to
                        // megabytesIn (data received from client).
                        megabytesOut: sql`COALESCE(${clients.megabytesOut}, 0) + ${bytesIn}`,
                        megabytesIn: sql`COALESCE(${clients.megabytesIn}, 0) + ${bytesOut}`,
                        lastBandwidthUpdate: currentTime
                    })
                    .where(eq(clients.pubKey, publicKey));
            }, `flush bandwidth for client ${publicKey}`);
        } catch (error) {
            logger.error(
                `Failed to flush bandwidth for client ${publicKey}:`,
                error
            );

            // Re-queue the failed entry so it is retried on the next flush
            // rather than silently dropped.
            const existing = accumulator.get(publicKey);
            if (existing) {
                existing.bytesIn += bytesIn;
                existing.bytesOut += bytesOut;
            } else {
                accumulator.set(publicKey, { bytesIn, bytesOut });
            }
        }
    }
}

const flushTimer = setInterval(async () => {
    try {
        await flushBandwidthToDb();
    } catch (error) {
        logger.error("Unexpected error during periodic bandwidth flush:", error);
    }
}, FLUSH_INTERVAL_MS);

// Calling unref() means this timer will not keep the Node.js event loop alive
// on its own - the process can still exit normally when there is no other work
// left.  The graceful-shutdown path (see server/cleanup.ts) will call
// flushBandwidthToDb() explicitly before process.exit(), so no data is lost.
flushTimer.unref();

export const handleReceiveBandwidthMessage: MessageHandler = async (
    context
) => {
    const { message } = context;

    if (!message.data.bandwidthData) {
        logger.warn("No bandwidth data provided");
        return;
    }

    const bandwidthData: PeerBandwidth[] = message.data.bandwidthData;

    if (!Array.isArray(bandwidthData)) {
        throw new Error("Invalid bandwidth data");
    }

    // Accumulate the incoming data in memory; the periodic timer (and the
    // shutdown hook) will take care of writing it to the database.
    for (const { publicKey, bytesIn, bytesOut } of bandwidthData) {
        // Skip peers that haven't transferred any data - writing zeros to the
        // database would be a no-op anyway.
        if (bytesIn <= 0 && bytesOut <= 0) {
            continue;
        }

        const existing = accumulator.get(publicKey);
        if (existing) {
            existing.bytesIn += bytesIn;
            existing.bytesOut += bytesOut;
        } else {
            accumulator.set(publicKey, { bytesIn, bytesOut });
        }
    }
};
