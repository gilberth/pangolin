#!/usr/bin/env bash

set -euo pipefail

# End-to-end updater for self-hosted Pangolin fork with custom license server.
#
# What it does:
# 1) Sync local main with upstream (origin/main)
# 2) Pull active public.pem from remote license-server container
# 3) Patch Pangolin enterprise license verifier with that key
# 4) Commit/push patch to fork/main (if key changed)
# 5) Rebuild and redeploy Pangolin container on remote server

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRANCH="${BRANCH:-main}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-origin}"
FORK_REMOTE="${FORK_REMOTE:-fork}"

SSH_TARGET="${SSH_TARGET:-ubuntu@10.0.1.96}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-/home/ubuntu}"
REMOTE_LICENSE_CONTAINER="${REMOTE_LICENSE_CONTAINER:-pangolin-license-server}"
REMOTE_LICENSE_PUBLIC_KEY_PATH="${REMOTE_LICENSE_PUBLIC_KEY_PATH:-/app/keys/public.pem}"

FORK_REPO_URL="${FORK_REPO_URL:-https://github.com/gilberth/pangolin.git}"
REMOTE_IMAGE_NAME="${REMOTE_IMAGE_NAME:-pangolin-custom:latest}"

LICENSE_FILE="${REPO_DIR}/server/private/license/license.ts"
TMP_KEY_FILE="$(mktemp)"

cleanup() {
  rm -f "$TMP_KEY_FILE"
}
trap cleanup EXIT

log() {
  printf '[INFO] %s\n' "$*"
}

fail() {
  printf '[ERROR] %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

require_cmd git
require_cmd ssh
require_cmd python3

cd "$REPO_DIR"

if [[ ! -f "$LICENSE_FILE" ]]; then
  fail "License file not found: $LICENSE_FILE"
fi

# Avoid committing unrelated untracked files; only block tracked modifications.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  fail "Tracked local changes detected. Commit/stash first, then retry."
fi

log "Fetching remotes..."
git fetch "$UPSTREAM_REMOTE" "$BRANCH"
git fetch "$FORK_REMOTE" "$BRANCH"

log "Checking out ${BRANCH}..."
git checkout "$BRANCH"

log "Merging ${UPSTREAM_REMOTE}/${BRANCH} into local ${BRANCH}..."
git merge --no-edit "${UPSTREAM_REMOTE}/${BRANCH}" || fail "Merge conflict detected. Resolve manually and rerun."

log "Reading active public key from remote license server..."
ssh "$SSH_TARGET" "docker exec ${REMOTE_LICENSE_CONTAINER} cat ${REMOTE_LICENSE_PUBLIC_KEY_PATH}" > "$TMP_KEY_FILE"

if ! grep -q "BEGIN PUBLIC KEY" "$TMP_KEY_FILE"; then
  fail "Did not receive a valid public key from ${REMOTE_LICENSE_CONTAINER}"
fi

log "Patching ${LICENSE_FILE}..."
python3 - "$LICENSE_FILE" "$TMP_KEY_FILE" << 'PY'
import pathlib
import re
import sys

license_path = pathlib.Path(sys.argv[1])
key_path = pathlib.Path(sys.argv[2])

content = license_path.read_text(encoding="utf-8")
key = key_path.read_text(encoding="utf-8").strip()

server_url_re = re.compile(
    r'private serverBaseUrl =\s*"[^"]+";',
    re.MULTILINE,
)

server_url_repl = (
    'private serverBaseUrl =\n'
    '        process.env.PANGOLIN_LICENSE_SERVER_URL || "http://license-server:3456";'
)

public_key_re = re.compile(
    r'private publicKey = `-----BEGIN PUBLIC KEY-----.*?-----END PUBLIC KEY-----`;',
    re.DOTALL,
)

new_content = server_url_re.sub(server_url_repl, content)
new_content = public_key_re.sub(f"private publicKey = `{key}`;", new_content)

if new_content == content:
    print("UNCHANGED")
else:
    license_path.write_text(new_content, encoding="utf-8")
    print("UPDATED")
PY

if ! git diff --quiet -- "$LICENSE_FILE"; then
  log "Committing updated key patch..."
  git add "$LICENSE_FILE"
  git commit -m "Sync enterprise public key with running self-hosted license server"
else
  log "No key changes detected; skipping commit."
fi

log "Pushing ${BRANCH} to ${FORK_REMOTE}..."
git push "$FORK_REMOTE" "$BRANCH"

log "Building remote Pangolin image from fork/${BRANCH}..."
ssh "$SSH_TARGET" "docker build --build-arg BUILD=enterprise -t ${REMOTE_IMAGE_NAME} ${FORK_REPO_URL}#${BRANCH}"

log "Redeploying pangolin service..."
ssh "$SSH_TARGET" "cd ${REMOTE_APP_DIR} && docker compose up -d pangolin && docker ps --format 'table {{.Names}}\\t{{.Image}}\\t{{.Status}}'"

log "Done."
