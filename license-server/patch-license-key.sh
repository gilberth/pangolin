#!/bin/bash
# patch-license-key.sh
# Script para reemplazar la clave pública de licencia en Pangolin
# Ejecutar después de git pull y antes de docker build

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LICENSE_FILE="$SCRIPT_DIR/../server/private/license/license.ts"
PUBLIC_KEY_FILE="$SCRIPT_DIR/public.pem"

# Verificar que existan los archivos
if [ ! -f "$LICENSE_FILE" ]; then
    echo "ERROR: No se encontró $LICENSE_FILE"
    exit 1
fi

if [ ! -f "$PUBLIC_KEY_FILE" ]; then
    echo "ERROR: No se encontró $PUBLIC_KEY_FILE"
    exit 1
fi

# Leer la clave pública (sin los delimitadores BEGIN/END para el reemplazo)
PUBLIC_KEY_CONTENT=$(cat "$PUBLIC_KEY_FILE")

# Crear el bloque de reemplazo
NEW_KEY_BLOCK="    private publicKey = \`$PUBLIC_KEY_CONTENT\`;"

# Hacer backup
cp "$LICENSE_FILE" "$LICENSE_FILE.backup"

# Reemplazar usando sed con un patrón multilínea
# Busca desde "private publicKey = " hasta el cierre de backtick
python3 << EOF
import re

with open("$LICENSE_FILE", "r") as f:
    content = f.read()

# Patrón para encontrar la clave pública (multilínea)
pattern = r'private publicKey = \`-----BEGIN PUBLIC KEY-----.*?-----END PUBLIC KEY-----\`;'

new_key = '''private publicKey = \`$PUBLIC_KEY_CONTENT\`;'''

# Reemplazar
new_content = re.sub(pattern, new_key.replace('\n', '\\n'), content, flags=re.DOTALL)

with open("$LICENSE_FILE", "w") as f:
    f.write(new_content)

print("Clave pública reemplazada exitosamente")
EOF

echo ""
echo "=== Verificación ==="
grep -A 8 "private publicKey" "$LICENSE_FILE" | head -10

echo ""
echo "Backup guardado en: $LICENSE_FILE.backup"
echo "Listo para build!"
