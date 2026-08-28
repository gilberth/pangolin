import logger from "@server/logger";

/**
 * Build the customRequestHeaders middleware definition for a resource's
 * custom headers + setHostHeader config. Returns null when there are no
 * headers to set, so the caller can skip attaching the middleware.
 */
export function buildCustomHeadersMiddleware(
    headers: string | null | undefined,
    setHostHeader: string | null | undefined,
    resourceId: number
): { headers: { customRequestHeaders: { [key: string]: string } } } | null {
    const headersObj: { [key: string]: string } = {};

    if (headers) {
        let headersArr: { name: string; value: string }[] = [];
        try {
            headersArr = JSON.parse(headers) as {
                name: string;
                value: string;
            }[];
        } catch (e) {
            logger.warn(
                `Failed to parse headers for resource ${resourceId}: ${e}`
            );
        }

        headersArr.forEach((header) => {
            headersObj[header.name] = header.value;
        });
    }

    if (setHostHeader) {
        headersObj["Host"] = setHostHeader;
    }

    if (Object.keys(headersObj).length === 0) {
        return null;
    }

    return {
        headers: {
            customRequestHeaders: headersObj
        }
    };
}
