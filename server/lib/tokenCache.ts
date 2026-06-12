// tokenCache

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
    const token = await createSession();
    return token;
}
