export type PangolinConfig = {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
};

function required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export function loadConfig(): PangolinConfig {
    const baseUrl = required("PANGOLIN_API_BASE_URL").replace(/\/+$/, "");
    const apiKey = required("PANGOLIN_API_KEY");
    const timeoutMs = Number(process.env.PANGOLIN_API_TIMEOUT_MS ?? "30000");

    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error("PANGOLIN_API_TIMEOUT_MS must be a positive number");
    }

    return { baseUrl, apiKey, timeoutMs };
}
