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

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { gzip as gzipCallback } from "zlib";
import { promisify } from "util";
import { randomUUID } from "crypto";
import logger from "@server/logger";
import { LogEvent, S3Config, S3PayloadFormat } from "../types";
import { LogDestinationProvider } from "./LogDestinationProvider";

const gzipAsync = promisify(gzipCallback);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time (ms) to wait for a single S3 PutObject response. */
const REQUEST_TIMEOUT_MS = 60_000;

/** Default payload format when none is specified in the config. */
const DEFAULT_FORMAT: S3PayloadFormat = "json_array";

// ---------------------------------------------------------------------------
// S3LogDestination
// ---------------------------------------------------------------------------

/**
 * Forwards a batch of log events to an S3-compatible object store by
 * uploading a single object per `send()` call.
 *
 * **Object key layout**
 * ```
 * {prefix}/{logType}/{YYYY}/{MM}/{DD}/{HH}-{mm}-{ss}-{uuid}.{ext}[.gz]
 * ```
 * - `prefix`  – from `config.prefix` (default: empty – key starts at logType)
 * - `logType` – one of "request", "action", "access", "connection"
 * - Date components are derived from the upload time (UTC)
 * - `ext`     – `json` | `ndjson` | `csv`
 * - `.gz`     – appended when `config.gzip` is true
 *
 * **Payload formats** (controlled by `config.format`):
 * - `json_array` (default) – body is a JSON array of event objects.
 * - `ndjson`               – one JSON object per line (newline-delimited).
 * - `csv`                  – RFC-4180 CSV with a header row; columns are the
 *                            union of all field names in the batch's event data.
 *
 * **Compression**: when `config.gzip` is `true` the body is gzip-compressed
 * before upload and `Content-Encoding: gzip` is set on the object.
 *
 * **Custom endpoint**: set `config.endpoint` to target any S3-compatible
 * storage service (e.g. MinIO, Cloudflare R2).
 */
export class S3LogDestination implements LogDestinationProvider {
    readonly type = "s3";

    private readonly config: S3Config;

    constructor(config: S3Config) {
        this.config = config;
    }

    // -----------------------------------------------------------------------
    // LogDestinationProvider implementation
    // -----------------------------------------------------------------------

    async send(events: LogEvent[]): Promise<void> {
        if (events.length === 0) return;

        const format = this.config.format ?? DEFAULT_FORMAT;
        const useGzip = this.config.gzip ?? false;
        const logType = events[0].logType;

        const rawBody = this.serialize(events, format);
        const bodyBuffer = Buffer.from(rawBody, "utf-8");

        let uploadBody: Buffer;
        let contentEncoding: string | undefined;

        if (useGzip) {
            uploadBody = (await gzipAsync(bodyBuffer)) as Buffer;
            contentEncoding = "gzip";
        } else {
            uploadBody = bodyBuffer;
        }

        const key = this.buildObjectKey(logType, format, useGzip);
        const contentType = this.contentType(format);

        const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
            region: this.config.region,
            credentials: {
                accessKeyId: this.config.accessKeyId,
                secretAccessKey: this.config.secretAccessKey
            },
            requestHandler: {
                requestTimeout: REQUEST_TIMEOUT_MS
            }
        };

        if (this.config.endpoint?.trim()) {
            clientConfig.endpoint = this.config.endpoint.trim();
        }

        const client = new S3Client(clientConfig);

        try {
            await client.send(
                new PutObjectCommand({
                    Bucket: this.config.bucket,
                    Key: key,
                    Body: uploadBody,
                    ContentType: contentType,
                    ...(contentEncoding
                        ? { ContentEncoding: contentEncoding }
                        : {})
                })
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(
                `S3LogDestination: failed to upload object "${key}" ` +
                    `to bucket "${this.config.bucket}" – ${msg}`
            );
        }
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Construct a unique S3 object key for the given log type and format.
     * Keys are partitioned by logType and date so they can be queried or
     * lifecycle-managed independently.
     */
    private buildObjectKey(
        logType: string,
        format: S3PayloadFormat,
        gzip: boolean
    ): string {
        const now = new Date();
        const year = now.getUTCFullYear();
        const month = String(now.getUTCMonth() + 1).padStart(2, "0");
        const day = String(now.getUTCDate()).padStart(2, "0");
        const hh = String(now.getUTCHours()).padStart(2, "0");
        const mm = String(now.getUTCMinutes()).padStart(2, "0");
        const ss = String(now.getUTCSeconds()).padStart(2, "0");
        const uid = randomUUID();

        const ext =
            format === "csv" ? "csv" : format === "ndjson" ? "ndjson" : "json";
        const fileName = `${hh}-${mm}-${ss}-${uid}.${ext}${gzip ? ".gz" : ""}`;

        const rawPrefix = (this.config.prefix ?? "").trim().replace(/\/+$/, "");
        const parts = [
            rawPrefix,
            logType,
            `${year}/${month}/${day}`,
            fileName
        ].filter((p) => p !== "");

        return parts.join("/");
    }

    private contentType(format: S3PayloadFormat): string {
        switch (format) {
            case "csv":
                return "text/csv; charset=utf-8";
            case "ndjson":
                return "application/x-ndjson";
            default:
                return "application/json";
        }
    }

    private serialize(events: LogEvent[], format: S3PayloadFormat): string {
        switch (format) {
            case "json_array":
                return JSON.stringify(events.map(toPayload));
            case "ndjson":
                return events
                    .map((e) => JSON.stringify(toPayload(e)))
                    .join("\n");
            case "csv":
                return toCsv(events);
        }
    }
}

// ---------------------------------------------------------------------------
// Payload helpers
// ---------------------------------------------------------------------------

function toPayload(event: LogEvent): unknown {
    return {
        event: event.logType,
        timestamp: new Date(event.timestamp * 1000).toISOString(),
        data: event.data
    };
}

/**
 * Convert a batch of events to RFC-4180 CSV.
 *
 * The column set is the union of `event`, `timestamp`, and all keys present in
 * `event.data` across the batch, preserving insertion order.  Values that
 * contain commas, double-quotes, or newlines are quoted and escaped.
 */
function toCsv(events: LogEvent[]): string {
    if (events.length === 0) return "";

    // Collect all unique data keys in stable order
    const keySet = new LinkedSet<string>();
    keySet.add("event");
    keySet.add("timestamp");
    for (const e of events) {
        for (const k of Object.keys(e.data)) {
            keySet.add(k);
        }
    }
    const headers = keySet.toArray();

    const rows: string[] = [headers.map(csvEscape).join(",")];

    for (const e of events) {
        const flat: Record<string, unknown> = {
            event: e.logType,
            timestamp: new Date(e.timestamp * 1000).toISOString(),
            ...e.data
        };
        rows.push(
            headers.map((h) => csvEscape(flattenValue(flat[h]))).join(",")
        );
    }

    return rows.join("\n");
}

/** Flatten a value to a plain string suitable for a CSV cell. */
function flattenValue(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
}

/** RFC-4180 CSV escaping. */
function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

// ---------------------------------------------------------------------------
// Minimal ordered set (preserves insertion order, deduplicates)
// ---------------------------------------------------------------------------

class LinkedSet<T> {
    private readonly map = new Map<T, true>();

    add(value: T): void {
        this.map.set(value, true);
    }

    toArray(): T[] {
        return Array.from(this.map.keys());
    }
}
