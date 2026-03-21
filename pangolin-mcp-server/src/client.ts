import type { PangolinConfig } from "./config.js";

export type HttpMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "PATCH"
    | "DELETE"
    | "HEAD"
    | "OPTIONS";

export type PangolinResponse<T = unknown> = {
    status: number;
    headers: Record<string, string>;
    data: T;
};

function toQueryString(
    query?: Record<string, string | number | boolean>
): string {
    if (!query || Object.keys(query).length === 0) {
        return "";
    }

    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        params.set(key, String(value));
    }
    return `?${params.toString()}`;
}

function normalizePath(path: string): string {
    if (!path.startsWith("/")) {
        return `/${path}`;
    }
    return path;
}

export class PangolinClient {
    constructor(private readonly config: PangolinConfig) {}

    async request<T = unknown>(
        method: HttpMethod,
        path: string,
        options?: {
            query?: Record<string, string | number | boolean>;
            body?: unknown;
            unauthenticated?: boolean;
        }
    ): Promise<PangolinResponse<T>> {
        const url = `${this.config.baseUrl}${normalizePath(path)}${toQueryString(options?.query)}`;
        const controller = new AbortController();
        const timer = setTimeout(
            () => controller.abort(),
            this.config.timeoutMs
        );

        const headers: Record<string, string> = {
            Accept: "application/json"
        };

        if (!options?.unauthenticated) {
            headers.Authorization = `Bearer ${this.config.apiKey}`;
        }

        let body: string | undefined;
        if (options?.body !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(options.body);
        }

        try {
            const response = await fetch(url, {
                method,
                headers,
                body,
                signal: controller.signal
            });

            const text = await response.text();
            let data: unknown;
            try {
                data = text ? JSON.parse(text) : null;
            } catch {
                data = text;
            }

            if (!response.ok) {
                const compact =
                    typeof data === "string"
                        ? data
                        : JSON.stringify(data, null, 2);
                throw new Error(
                    `Pangolin API ${response.status} on ${method} ${path}: ${compact}`
                );
            }

            const outHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                outHeaders[key] = value;
            });

            return {
                status: response.status,
                headers: outHeaders,
                data: data as T
            };
        } finally {
            clearTimeout(timer);
        }
    }
}
