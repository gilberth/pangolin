import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { PangolinClient, type HttpMethod } from "./client.js";

const config = loadConfig();
const client = new PangolinClient(config);

const server = new McpServer({
    name: "pangolin-mcp-server",
    version: "1.0.0"
});

const methodSchema = z.enum([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS"
]);

server.registerTool(
    "pangolin_health",
    {
        title: "Pangolin Health",
        description: "Checks Pangolin Integration API health at /.",
        inputSchema: {},
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    async () => {
        const response = await client.request("GET", "/", {
            unauthenticated: true
        });
        return {
            content: [
                { type: "text", text: JSON.stringify(response.data, null, 2) }
            ],
            structuredContent: response.data as Record<string, unknown>
        };
    }
);

server.registerTool(
    "pangolin_request",
    {
        title: "Pangolin API Request",
        description:
            "Generic request to Pangolin Integration API. Use this to access any endpoint not covered by dedicated tools.",
        inputSchema: {
            method: methodSchema.describe("HTTP method"),
            path: z
                .string()
                .min(1)
                .describe(
                    "Path under Integration API base URL, e.g. /orgs or /org/{orgId}/sites"
                ),
            query: z
                .record(z.union([z.string(), z.number(), z.boolean()]))
                .optional()
                .describe("Optional query parameters"),
            body: z.unknown().optional().describe("Optional JSON body")
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true
        }
    },
    async ({ method, path, query, body }) => {
        const response = await client.request(method as HttpMethod, path, {
            query: query as
                | Record<string, string | number | boolean>
                | undefined,
            body
        });

        return {
            content: [
                { type: "text", text: JSON.stringify(response.data, null, 2) }
            ],
            structuredContent: {
                status: response.status,
                data: response.data
            }
        };
    }
);

server.registerTool(
    "pangolin_list_orgs",
    {
        title: "List Organizations",
        description:
            "Lists all organizations available to the API key via GET /orgs.",
        inputSchema: {},
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    async () => {
        const response = await client.request("GET", "/orgs");
        return {
            content: [
                { type: "text", text: JSON.stringify(response.data, null, 2) }
            ],
            structuredContent: response.data as Record<string, unknown>
        };
    }
);

server.registerTool(
    "pangolin_list_sites",
    {
        title: "List Sites",
        description:
            "Lists sites for an organization via GET /org/{orgId}/sites.",
        inputSchema: {
            orgId: z.string().min(1).describe("Organization ID")
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    async ({ orgId }) => {
        const response = await client.request("GET", `/org/${orgId}/sites`);
        return {
            content: [
                { type: "text", text: JSON.stringify(response.data, null, 2) }
            ],
            structuredContent: response.data as Record<string, unknown>
        };
    }
);

server.registerTool(
    "pangolin_list_resources",
    {
        title: "List Resources",
        description:
            "Lists resources for an organization via GET /org/{orgId}/resources.",
        inputSchema: {
            orgId: z.string().min(1).describe("Organization ID")
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    async ({ orgId }) => {
        const response = await client.request("GET", `/org/${orgId}/resources`);
        return {
            content: [
                { type: "text", text: JSON.stringify(response.data, null, 2) }
            ],
            structuredContent: response.data as Record<string, unknown>
        };
    }
);

server.registerTool(
    "pangolin_create_resource",
    {
        title: "Create Resource",
        description:
            "Creates a resource in an organization via PUT /org/{orgId}/resource. Pass the payload exactly as expected by your Pangolin version.",
        inputSchema: {
            orgId: z.string().min(1).describe("Organization ID"),
            payload: z
                .record(z.unknown())
                .describe("JSON body for PUT /org/{orgId}/resource")
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true
        }
    },
    async ({ orgId, payload }) => {
        const response = await client.request("PUT", `/org/${orgId}/resource`, {
            body: payload
        });

        return {
            content: [
                { type: "text", text: JSON.stringify(response.data, null, 2) }
            ],
            structuredContent: response.data as Record<string, unknown>
        };
    }
);

server.registerTool(
    "pangolin_attach_resource_to_all_sites",
    {
        title: "Attach Resource To All Sites",
        description:
            "Loops all org sites and calls PUT /resource/{resourceId}/target for each site. Provide targetTemplate and the field name that should receive the site ID.",
        inputSchema: {
            orgId: z.string().min(1).describe("Organization ID"),
            resourceId: z.string().min(1).describe("Resource ID"),
            targetTemplate: z
                .record(z.unknown())
                .describe("Base payload for target creation/update."),
            siteIdField: z
                .string()
                .default("siteId")
                .describe(
                    "Field name in payload where site ID will be injected."
                )
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true
        }
    },
    async ({ orgId, resourceId, targetTemplate, siteIdField }) => {
        const sitesResponse = await client.request<unknown>(
            "GET",
            `/org/${orgId}/sites`
        );
        const sitesData = sitesResponse.data as Record<string, unknown>;

        const candidates = [
            (sitesData.data as unknown) ?? null,
            (sitesData.sites as unknown) ?? null,
            sitesData
        ];

        let sites: Array<Record<string, unknown>> = [];
        for (const candidate of candidates) {
            if (Array.isArray(candidate)) {
                sites = candidate as Array<Record<string, unknown>>;
                break;
            }
            if (
                candidate &&
                typeof candidate === "object" &&
                Array.isArray((candidate as Record<string, unknown>).items)
            ) {
                sites = (candidate as Record<string, unknown>).items as Array<
                    Record<string, unknown>
                >;
                break;
            }
        }

        const results: Array<Record<string, unknown>> = [];
        for (const site of sites) {
            const siteId =
                (site.id as string | undefined) ??
                (site.siteId as string | undefined) ??
                (site.site_id as string | undefined);

            if (!siteId) {
                results.push({
                    ok: false,
                    site,
                    error: "Site object missing id/siteId/site_id"
                });
                continue;
            }

            const payload: Record<string, unknown> = {
                ...targetTemplate,
                [siteIdField]: siteId
            };

            try {
                const response = await client.request(
                    "PUT",
                    `/resource/${resourceId}/target`,
                    {
                        body: payload
                    }
                );
                results.push({
                    ok: true,
                    siteId,
                    response: response.data
                });
            } catch (error) {
                results.push({
                    ok: false,
                    siteId,
                    error:
                        error instanceof Error ? error.message : String(error)
                });
            }
        }

        const summary = {
            totalSites: results.length,
            successful: results.filter((x) => x.ok).length,
            failed: results.filter((x) => !x.ok).length,
            results
        };

        return {
            content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
            structuredContent: summary
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
