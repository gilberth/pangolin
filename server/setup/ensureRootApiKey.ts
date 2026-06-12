import { db, apiKeys } from "@server/db";
import { eq } from "drizzle-orm";
import { generateRandomString, RandomReader } from "@oslojs/crypto/random";
import moment from "moment";
import logger from "@server/logger";
import { hashPassword } from "@server/auth/password";

const random: RandomReader = {
    read(bytes: Uint8Array): void {
        crypto.getRandomValues(bytes);
    }
};

function validateApiKeyId(id: string): boolean {
    return /^[a-z0-9]{15}$/.test(id);
}

function validateApiKeySecret(secret: string): boolean {
    return secret.length > 0;
}

function showRootApiKey(apiKeyId: string, source: string): void {
    console.log(`=== ROOT API KEY ${source} ===`);
    console.log("API Key ID:", apiKeyId);
    console.log(
        "The root API key from PANGOLIN_ROOT_API_KEY has been applied."
    );
    console.log("Use the full key value (apiKeyId.apiKeySecret) in requests.");
    console.log("================================");
}

export async function ensureRootApiKey() {
    try {
        const envApiKey = process.env.PANGOLIN_ROOT_API_KEY;

        if (!envApiKey) {
            // logger.debug(
            //     "PANGOLIN_ROOT_API_KEY not set. Root API key from environment skipped."
            // );
            return;
        }

        const parts = envApiKey.split(".");
        if (parts.length !== 2) {
            throw new Error(
                "Invalid format for PANGOLIN_ROOT_API_KEY. Expected format: {apiKeyId}.{apiKeySecret}"
            );
        }

        const [apiKeyId, apiKeySecret] = parts;

        if (!validateApiKeyId(apiKeyId)) {
            throw new Error(
                "Invalid apiKeyId in PANGOLIN_ROOT_API_KEY. Must be 15 lowercase alphanumeric characters."
            );
        }

        if (!validateApiKeySecret(apiKeySecret)) {
            throw new Error(
                "Invalid apiKeySecret in PANGOLIN_ROOT_API_KEY. Secret must not be empty."
            );
        }

        const apiKeyHash = await hashPassword(apiKeySecret);
        const lastChars = apiKeySecret.slice(-4);
        const createdAt = moment().toISOString();

        const [existingKey] = await db
            .select()
            .from(apiKeys)
            .where(eq(apiKeys.apiKeyId, apiKeyId));

        if (existingKey) {
            if (!existingKey.isRoot) {
                console.warn(
                    `API key with ID ${apiKeyId} exists but is not a root key. Promoting to root and updating hash.`
                );
            } else {
                console.warn(
                    `Overwriting existing root API key hash since PANGOLIN_ROOT_API_KEY is set (apiKeyId: ${apiKeyId})`
                );
            }

            await db
                .update(apiKeys)
                .set({ apiKeyHash, lastChars, isRoot: true })
                .where(eq(apiKeys.apiKeyId, apiKeyId));

            showRootApiKey(apiKeyId, "UPDATED FROM ENVIRONMENT");
        } else {
            await db.insert(apiKeys).values({
                apiKeyId,
                name: "Root API Key (Environment)",
                apiKeyHash,
                lastChars,
                createdAt,
                isRoot: true
            });

            showRootApiKey(apiKeyId, "CREATED FROM ENVIRONMENT");
        }
    } catch (error) {
        console.error("Failed to ensure root API key:", error);
        throw error;
    }
}
