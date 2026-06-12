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

import redisManager from "#private/lib/redis";
import { encrypt, decrypt } from "@server/lib/crypto";
import logger from "@server/logger";

/**
 * Returns a cached plaintext token from Redis if one exists and decrypts
 * cleanly, otherwise calls `createSession` to mint a fresh token, stores the
 * encrypted value in Redis with the given TTL, and returns it.
 *
 * Failures at the Redis layer are non-fatal – the function always falls
 * through to session creation so the caller is never blocked by a Redis outage.
 *
 * @param cacheKey   Unique Redis key, e.g. `"newt:token_cache:abc123"`
 * @param secret     Server secret used for AES encryption/decryption
 * @param ttlSeconds Cache TTL in seconds (should match session expiry)
 * @param createSession Factory that mints a new session and returns its raw token
 */
export async function getOrCreateCachedToken(
    cacheKey: string,
    secret: string,
    ttlSeconds: number,
    createSession: () => Promise<string>
): Promise<string> {
    if (redisManager.isRedisEnabled()) {
        try {
            const cached = await redisManager.get(cacheKey);
            if (cached) {
                const token = decrypt(cached, secret);
                if (token) {
                    logger.debug(`Token cache hit for key: ${cacheKey}`);
                    return token;
                }
                // Decryption produced an empty string – treat as a miss
                logger.warn(
                    `Token cache decryption returned empty string for key: ${cacheKey}, treating as miss`
                );
            }
        } catch (e) {
            logger.warn(
                `Token cache read/decrypt failed for key ${cacheKey}, falling through to session creation:`,
                e
            );
        }
    }

    const token = await createSession();

    if (redisManager.isRedisEnabled()) {
        try {
            const encrypted = encrypt(token, secret);
            await redisManager.set(cacheKey, encrypted, ttlSeconds);
            logger.debug(
                `Token cached in Redis for key: ${cacheKey} (TTL ${ttlSeconds}s)`
            );
        } catch (e) {
            logger.warn(
                `Token cache write failed for key ${cacheKey} (session was still created):`,
                e
            );
        }
    }

    return token;
}
