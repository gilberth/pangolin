# pangolin-mcp-server

MCP server for Pangolin Integration API.

This server exposes practical tools for:
- Health checks
- Listing orgs, sites, and resources
- Generic Pangolin API requests
- Creating resources
- Attaching one resource to all sites (automation helper)

## Requirements

- Node.js 20+
- Pangolin Integration API enabled (`/v1`)
- Pangolin API key with required permissions

## Environment variables

- `PANGOLIN_API_BASE_URL` (example: `https://pangolin.gytech.com.pe/v1`)
- `PANGOLIN_API_KEY` (Bearer API key)
- `PANGOLIN_API_TIMEOUT_MS` (optional, default `30000`)

## Install

```bash
cd pangolin-mcp-server
npm install
npm run build
```

## Run

```bash
PANGOLIN_API_BASE_URL="https://pangolin.gytech.com.pe/v1" \
PANGOLIN_API_KEY="your_api_key" \
node dist/index.js
```

## Available tools

- `pangolin_health`
- `pangolin_request`
- `pangolin_list_orgs`
- `pangolin_list_sites`
- `pangolin_list_resources`
- `pangolin_create_resource`
- `pangolin_attach_resource_to_all_sites`

## Notes

- `pangolin_request` is the fallback for full API coverage when a dedicated tool does not exist yet.
- `pangolin_attach_resource_to_all_sites` expects `targetTemplate` compatible with your current Pangolin API version.
- Prefer least-privilege API keys.
