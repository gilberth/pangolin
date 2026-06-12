export type DomainType = "organization" | "provided" | "provided-search";

export const SINGLE_LABEL_RE = /^[\p{L}\p{N}-]+$/u; // provided-search (no dots)
export const MULTI_LABEL_RE = /^[\p{L}\p{N}-]+(\.[\p{L}\p{N}-]+)*$/u; // ns/wildcard
export const SINGLE_LABEL_STRICT_RE =
    /^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u; // start/end alnum

/**
 * A wildcard subdomain is either bare "*" or "*.label1.label2…" where every
 * label after the dot is a valid hostname label. This mirrors the shape that
 * the server's `wildcardSubdomainSchema` accepts.
 */
export const WILDCARD_SUBDOMAIN_RE =
    /^\*(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;

export function isWildcardSubdomain(input: string): boolean {
    return WILDCARD_SUBDOMAIN_RE.test(input);
}

export function sanitizeInputRaw(input: string, allowWildcard = false): string {
    if (!input) return "";
    // When wildcard mode is active, preserve a leading "* " / "*." prefix and
    // only sanitize the remainder so the user can type "*.level1" naturally.
    if (allowWildcard && input.startsWith("*")) {
        const rest = input.slice(1);
        const sanitizedRest = rest
            .toLowerCase()
            .normalize("NFC")
            .replace(/[^\p{L}\p{N}.-]/gu, "");
        return "*" + sanitizedRest;
    }
    return input
        .toLowerCase()
        .normalize("NFC") // normalize Unicode
        .replace(/[^\p{L}\p{N}.-]/gu, ""); // allow Unicode letters, numbers, dot, hyphen
}

export function finalizeSubdomainSanitize(
    input: string,
    allowWildcard = false
): string {
    if (!input) return "";

    // If the input is a valid wildcard and the caller permits it, keep it as-is
    // (just lowercase the non-wildcard labels).
    if (allowWildcard && input.startsWith("*")) {
        const rest = input.slice(1); // everything after the leading "*"
        const sanitizedRest = rest
            .toLowerCase()
            .normalize("NFC")
            .replace(/[^\p{L}\p{N}.-]/gu, "")
            .replace(/\.{2,}/g, ".")
            .replace(/^-+|-+$/g, "")
            .replace(/(\.-)|(-\.)/g, ".");
        const candidate = "*" + sanitizedRest;
        // Return only if it still forms a valid wildcard after sanitizing
        return isWildcardSubdomain(candidate) ? candidate : "";
    }

    return input
        .toLowerCase()
        .normalize("NFC")
        .replace(/[^\p{L}\p{N}.-]/gu, "") // allow Unicode
        .replace(/\.{2,}/g, ".") // collapse multiple dots
        .replace(/^-+|-+$/g, "") // strip leading/trailing hyphens
        .replace(/^\.+|\.+$/g, "") // strip leading/trailing dots
        .replace(/(\.-)|(-\.)/g, "."); // fix illegal dot-hyphen combos
}

export function validateByDomainType(
    subdomain: string,
    domainType: {
        type: "provided-search" | "organization";
        domainType?: "ns" | "cname" | "wildcard";
        allowWildcard?: boolean;
    }
): boolean {
    if (!domainType) return false;

    if (domainType.type === "provided-search") {
        return SINGLE_LABEL_RE.test(subdomain);
    }

    if (domainType.type === "organization") {
        if (domainType.domainType === "cname") {
            return subdomain === "";
        } else if (
            domainType.domainType === "ns" ||
            domainType.domainType === "wildcard"
        ) {
            if (subdomain === "") return true;

            // Wildcard subdomain validation (only when caller opts in)
            if (domainType.allowWildcard && subdomain.startsWith("*")) {
                return isWildcardSubdomain(subdomain);
            }

            if (!MULTI_LABEL_RE.test(subdomain)) return false;
            const labels = subdomain.split(".");
            return labels.every(
                (l) =>
                    l.length >= 1 && l.length <= 63 && SINGLE_LABEL_RE.test(l)
            );
        }
    }
    return false;
}

export const isValidSubdomainStructure = (
    input: string,
    allowWildcard = false
): boolean => {
    if (!input) return false;

    // A valid wildcard subdomain is structurally valid when the caller allows it
    if (allowWildcard && input.startsWith("*")) {
        return isWildcardSubdomain(input);
    }

    const regex = /^(?!-)([\p{L}\p{N}-]{1,63})(?<!-)$/u;

    if (input.includes("..")) return false;

    return input.split(".").every((label) => regex.test(label));
};
