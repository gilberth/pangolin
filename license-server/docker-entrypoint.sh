#!/bin/sh
set -e

# Generate RSA keys if they don't exist
if [ ! -f /app/keys/private.pem ]; then
    echo "Generating RSA key pair..."
    mkdir -p /app/keys
    openssl genrsa -out /app/keys/private.pem 2048
    openssl rsa -in /app/keys/private.pem -pubout -out /app/keys/public.pem
    echo "RSA keys generated successfully"
    echo ""
    echo "=========================================="
    echo "IMPORTANT: Copy this public key to patch Pangolin:"
    echo "=========================================="
    cat /app/keys/public.pem
    echo "=========================================="
fi

# Create symlinks to keys in app directory for server.js
ln -sf /app/keys/private.pem /app/private.pem
ln -sf /app/keys/public.pem /app/public.pem

exec "$@"
