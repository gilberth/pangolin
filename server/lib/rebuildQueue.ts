import logger from "@server/logger";

export type RebuildJobType = "site-resource" | "client";

export interface RebuildJob {
    type: RebuildJobType;
    id: number;
}

export interface RebuildJobHandlers {
    onSiteResource(siteResourceId: number): Promise<void>;
    onClient(clientId: number): Promise<void>;
}

export interface RebuildQueueManager {
    enqueue(job: RebuildJob): Promise<void>;
    startProcessing(handlers: RebuildJobHandlers): void;
    isQueued(job: RebuildJob): Promise<boolean>;
}

// In-process FIFO used when there is no Redis to back a distributed queue
// (OSS build, or Redis unavailable). A job that loses the per-resource
// rebuild lock race lands here instead of being silently dropped, and gets
// retried shortly after against fresh DB state.
const POLL_INTERVAL_MS = 500;
const BATCH_SIZE = 5;

function dedupeKey(job: RebuildJob): string {
    return `${job.type}:${job.id}`;
}

class InMemoryRebuildQueue implements RebuildQueueManager {
    private queue: RebuildJob[] = [];
    private queuedSet = new Set<string>();
    private processing = false;
    private processingStarted = false;
    private handlers: RebuildJobHandlers | null = null;

    async isQueued(job: RebuildJob): Promise<boolean> {
        return this.queuedSet.has(dedupeKey(job));
    }

    async enqueue(job: RebuildJob): Promise<void> {
        const key = dedupeKey(job);
        if (this.queuedSet.has(key)) {
            logger.debug(
                `Rebuild queue: skipped duplicate queued job ${job.type}:${job.id}`
            );
            return;
        }
        this.queuedSet.add(key);
        this.queue.push(job);
        logger.debug(
            `Rebuild queue: enqueued ${job.type}:${job.id} (queue position: tail)`
        );
    }

    startProcessing(handlers: RebuildJobHandlers): void {
        if (this.processingStarted) return;
        this.processingStarted = true;
        this.handlers = handlers;

        setInterval(() => {
            this.tryProcessBatch().catch((err) => {
                logger.error(
                    "Rebuild queue: unhandled error in process loop:",
                    err
                );
            });
        }, POLL_INTERVAL_MS);

        logger.info("Rebuild queue processor started (in-memory)");
    }

    private async tryProcessBatch(): Promise<void> {
        if (this.processing || !this.handlers || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        try {
            for (let i = 0; i < BATCH_SIZE; i++) {
                const job = this.queue.shift();
                if (!job) break; // queue drained

                // Remove from the dedupe set once dequeued so the same job
                // can be re-queued while this one is in progress.
                this.queuedSet.delete(dedupeKey(job));

                logger.debug(
                    `Rebuild queue: processing ${job.type}:${job.id}`
                );

                try {
                    if (job.type === "site-resource") {
                        await this.handlers.onSiteResource(job.id);
                    } else if (job.type === "client") {
                        await this.handlers.onClient(job.id);
                    } else {
                        logger.warn(
                            `Rebuild queue: unknown job type "${(job as any).type}", discarding`
                        );
                    }

                    logger.debug(
                        `Rebuild queue: completed ${job.type}:${job.id}`
                    );
                } catch (err) {
                    logger.error(
                        `Rebuild queue: job ${job.type}:${job.id} threw an error:`,
                        err
                    );
                }
            }
        } finally {
            this.processing = false;
        }
    }
}

export const rebuildQueue: RebuildQueueManager = new InMemoryRebuildQueue();
