// Normalizes

/**
 * Normalizes a post-authentication path for safe use when building redirect URLs.
 * Returns a path that starts with / and does not allow open redirects (no //, no :).
 */
export function normalizePostAuthPath(path: string | null | undefined): string | null {
    if (path == null || typeof path !== "string") {
        return null;
    }
    const trimmed = path.trim();
    if (trimmed === "") {
        return null;
    }
    // Reject protocol-relative (//) or scheme (:) to avoid open redirect
    if (trimmed.includes("//") || trimmed.includes(":")) {
        return null;
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
