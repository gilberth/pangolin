# Pangolin Self-Hosted (Custom License Server)

This repository is a fork of Pangolin prepared to run with a self-hosted Enterprise license server.

Goal:
- Keep your existing Pangolin config and data
- Replace upstream license validation with your own license server
- Build and deploy custom images from your fork
- Update safely when upstream Pangolin releases new code

## Current environment

- Fork repo: `https://github.com/gilberth/pangolin`
- Upstream repo: `https://github.com/fosrl/pangolin`
- Production host: `ubuntu@10.0.1.96`
- App directory on server: `/home/ubuntu`
- Pangolin URL: `https://pangolin.gytech.com.pe/`

## Architecture

Containers in production:
- `pangolin` -> custom image built from this fork (`pangolin-custom:latest`)
- `pangolin-license-server` -> local license API (`pangolin-license-server:latest`)
- `gerbil` -> upstream image (`fosrl/gerbil:1.3.0`)
- `traefik` -> upstream image (`traefik:v3.6`)

Important runtime setting:
- `PANGOLIN_LICENSE_SERVER_URL=http://license-server:3456`

Important persistence:
- Keep `license-keys` volume to preserve RSA keys (`/app/keys`) used by license signing.

## What was changed in code

Main license patch is in:
- `server/private/license/license.ts`

Changes:
- Enterprise license base URL now uses env var:
  - `PANGOLIN_LICENSE_SERVER_URL` (default `http://license-server:3456`)
- Embedded public key was replaced to match the active self-hosted license server key

## License server

Project files:
- `license-server/server.js`
- `license-server/Dockerfile`
- `license-server/docker-entrypoint.sh`
- `license-server/docker-compose.yml`
- `license-server/patch-license-key.sh`

Supported test keys (default in server.js):
- `PANGOLIN-ENTERPRISE-2024`
- `TEST-LICENSE-KEY-001`
- `GYTECH-PANGOLIN-001`

## Deploy from scratch (server)

### 1) Build Pangolin custom image

Run on your server:

```bash
docker build --build-arg BUILD=enterprise -t pangolin-custom:latest \
  https://github.com/gilberth/pangolin.git#main
```

### 2) Build license-server image

If needed, copy `license-server/` to server and then:

```bash
cd ~/license-server-complete
docker build -t pangolin-license-server:latest .
```

### 3) Use this compose file (`/home/ubuntu/docker-compose.yml`)

```yaml
name: pangolin
services:
  license-server:
    image: pangolin-license-server:latest
    container_name: pangolin-license-server
    restart: unless-stopped
    volumes:
      - license-keys:/app/keys
    environment:
      - NODE_ENV=production
      - PORT=3456
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3456/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 10s

  pangolin:
    image: pangolin-custom:latest
    container_name: pangolin
    restart: unless-stopped
    depends_on:
      license-server:
        condition: service_healthy
    environment:
      - PANGOLIN_LICENSE_SERVER_URL=http://license-server:3456
    volumes:
      - ./config:/app/config
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/"]
      interval: "10s"
      timeout: "10s"
      retries: 15

  gerbil:
    image: docker.io/fosrl/gerbil:1.3.0
    container_name: gerbil
    restart: unless-stopped
    depends_on:
      pangolin:
        condition: service_healthy
    command:
      - --reachableAt=http://gerbil:3004
      - --generateAndSaveKeyTo=/var/config/key
      - --remoteConfig=http://pangolin:3001/api/v1/
    volumes:
      - ./config/:/var/config
    cap_add:
      - NET_ADMIN
      - SYS_MODULE
    ports:
      - 51820:51820/udp
      - 21820:21820/udp
      - 443:443
      - 80:80

  traefik:
    image: docker.io/traefik:v3.6
    container_name: traefik
    restart: unless-stopped
    network_mode: service:gerbil
    depends_on:
      pangolin:
        condition: service_healthy
    command:
      - --configFile=/etc/traefik/traefik_config.yml
    volumes:
      - ./config/traefik:/etc/traefik:ro
      - ./config/letsencrypt:/letsencrypt
      - ./config/traefik/logs:/var/log/traefik

volumes:
  license-keys:
    driver: local
```

### 4) Start stack

```bash
cd /home/ubuntu
docker compose up -d
```

### 5) Validate

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker logs --tail 100 pangolin
docker logs --tail 100 pangolin-license-server
```

## Upgrade workflow (recommended)

Use the automation script from repo root:
- `update-custom-pangolin.sh`

What it does:
1. Fetches `origin/main` and `fork/main`
2. Merges upstream main into local main
3. Pulls active key from remote `pangolin-license-server`
4. Patches `server/private/license/license.ts`
5. Commits and pushes if key changed
6. Builds remote Pangolin image with `BUILD=enterprise`
7. Redeploys `pangolin`

Run:

```bash
cd /Users/gilberth/Documents/DEV/pangolin
./update-custom-pangolin.sh
```

Optional env vars:
- `SSH_TARGET` (default `ubuntu@10.0.1.96`)
- `REMOTE_APP_DIR` (default `/home/ubuntu`)
- `BRANCH` (default `main`)
- `FORK_REPO_URL` (default `https://github.com/gilberth/pangolin.git`)

## GitHub Actions automation

Two workflows are available:

- `.github/workflows/build-pangolin.yml`
  - Builds and publishes images to GHCR
  - Pangolin image is built with `BUILD=enterprise`

- `.github/workflows/custom-update-and-deploy.yml`
  - Manual workflow (`workflow_dispatch`)
  - Can merge upstream `fosrl/main` into fork `main`
  - Can pull active license public key from production and patch `license.ts`
  - Pushes fork `main`, builds enterprise image, and optionally deploys to production

Required GitHub repository secrets for `custom-update-and-deploy.yml`:

- `PROD_SSH_HOST` (example: `10.0.1.96`)
- `PROD_SSH_USER` (example: `ubuntu`)
- `PROD_SSH_PRIVATE_KEY` (private key for SSH)
- `PROD_APP_DIR` (example: `/home/ubuntu`)
- `GHCR_USER` (GitHub username with package pull access)
- `GHCR_TOKEN` (PAT with `read:packages`)

## Important notes

- Always build Pangolin with `BUILD=enterprise`.
- Do not delete `license-keys` volume in production.
- If keys rotate, you must sync public key in Pangolin and rebuild image.
- If UI shows `Invalid signature`, key mismatch is the first thing to verify.

## Troubleshooting

### Error: `Invalid signature`

Root cause:
- Pangolin embedded public key does not match current private key used by license server.

Fix:
1. Read active key from server:
   ```bash
   ssh ubuntu@10.0.1.96 "docker exec pangolin-license-server cat /app/keys/public.pem"
   ```
2. Update `server/private/license/license.ts` public key
3. Rebuild Pangolin image with `BUILD=enterprise`
4. Restart `pangolin`

### Pangolin starts but unhealthy

Check:
```bash
docker logs --tail 200 pangolin
```

Most common causes:
- Build type was `oss` instead of `enterprise`
- DB schema mismatch from wrong branch/version
- Broken `config` mount

## Git branches used

- `main`: active branch for deployment in this fork
- `release-1.16.2-license`: compatibility branch used during fix process

## Maintainer flow summary

For every upstream update:
1. Run `./update-custom-pangolin.sh`
2. Wait for remote build and restart
3. Validate container health and UI access
4. Activate/check license only if needed
