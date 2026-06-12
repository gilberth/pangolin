// Sanitizes

/**
 * Sanitize a string field before inserting into a database TEXT column.
 *
 * Two passes are applied:
 *
 * 1. Lone UTF-16 surrogates – JavaScript strings can hold unpaired surrogates
 *    (e.g. \uD800 without a following \uDC00-\uDFFF codepoint). These are
 *    valid in JS but cannot be encoded as UTF-8, triggering
 *    `report_invalid_encoding` in SQLite / Postgres. They are replaced with
 *    the Unicode replacement character U+FFFD so the data is preserved as a
 *    visible signal that something was malformed.
 *
 * 2. Null bytes and C0 control characters – SQLite stores TEXT as
 *    null-terminated C strings, so \x00 in a value causes
 *    `report_invalid_encoding`. Bots and scanners routinely inject null bytes
 *    into URLs (e.g. `/path\u0000.jpg`). All C0 control characters in the
 *    range \x00-\x1F are stripped except for the three that are legitimate in
 *    text payloads: HT (\x09), LF (\x0A), and CR (\x0D). DEL (\x7F) is also
 *    stripped.
 */
export function sanitizeString(value: string): string;
export function sanitizeString(
    value: string | null | undefined
): string | undefined;
export function sanitizeString(
    value: string | null | undefined
): string | undefined {
    if (value == null) return undefined;
    return (
        value
            // Replace lone high surrogates (not followed by a low surrogate)
            // and lone low surrogates (not preceded by a high surrogate).
            .replace(
                /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
                "\uFFFD"
            )
            // Strip null bytes, C0 control chars (except HT/LF/CR), and DEL.
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    );
}
