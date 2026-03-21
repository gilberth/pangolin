# Pangolin License Server (Mock)

Servidor de licencias propio para usar con un fork de Pangolin.

## Por qué necesitas un fork

Pangolin tiene la clave pública de Fossorial **hardcodeada** en el código. Sin la clave privada de Fossorial, no puedes generar JWTs válidos. Por eso necesitas:

1. Tu propio par de claves RSA (incluidas en este directorio)
2. Modificar Pangolin para usar tu clave pública
3. Este servidor para responder a las solicitudes de licencia

## Instalación

```bash
cd license-server
npm install
```

## Flujo de trabajo para el Fork

### Primera vez (setup inicial)

```bash
# 1. Fork del repositorio de Pangolin en GitHub

# 2. Clonar tu fork
git clone https://github.com/TU_USUARIO/pangolin.git
cd pangolin

# 3. Agregar upstream para actualizaciones
git remote add upstream https://github.com/fosrl/pangolin.git

# 4. Aplicar el parche de clave pública
cd license-server
./patch-license-key.sh

# 5. Build de la imagen Docker
cd ..
docker build -t mi-pangolin:latest .
```

### Cuando hay actualizaciones de Pangolin

```bash
# 1. Obtener cambios del repo original
git fetch upstream
git merge upstream/main

# 2. Si hay conflictos en license.ts, resolverlos
# 3. Volver a aplicar el parche
cd license-server
./patch-license-key.sh

# 4. Rebuild
docker build -t mi-pangolin:latest .
```

## Configuración del servidor de licencias

### En tu servidor (donde correrá el license-server)

```bash
cd license-server
npm start
```

El servidor correrá en el puerto 3456 (configurable via `PORT=XXXX`)

### En el servidor de Pangolin

Redirigir `api.fossorial.io` a tu servidor de licencias:

```bash
# Opción 1: /etc/hosts (simple)
echo "IP_DE_TU_LICENSE_SERVER api.fossorial.io" >> /etc/hosts

# Opción 2: DNS interno (mejor para producción)
# Configurar tu DNS para que api.fossorial.io apunte a tu servidor
```

**IMPORTANTE**: Pangolin usa HTTPS para conectar a `api.fossorial.io`. Necesitas:
- Un certificado SSL válido para `api.fossorial.io` en tu servidor, O
- Modificar el código para usar HTTP (no recomendado)

### Opción con proxy reverso (recomendada)

Usar nginx/traefik como proxy con SSL:

```nginx
server {
    listen 443 ssl;
    server_name api.fossorial.io;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3456;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Licencias Válidas por Defecto

- `PANGOLIN-ENTERPRISE-2024`
- `TEST-LICENSE-KEY-001`
- `GYTECH-PANGOLIN-001`

## API Endpoints

### Activar Licencia
```bash
curl -X POST http://localhost:3456/api/v1/license/enterprise/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey": "PANGOLIN-ENTERPRISE-2024", "instanceName": "my-instance"}'
```

### Validar Licencia (Phone Home)
```bash
curl -X POST http://localhost:3456/api/v1/license/enterprise/validate \
  -H "Content-Type: application/json" \
  -d '{"licenseKeys": [{"licenseKey": "PANGOLIN-ENTERPRISE-2024", "instanceId": "uuid-here"}], "instanceName": "my-instance"}'
```

### Ver/Agregar Licencias Válidas
```bash
# Listar
curl http://localhost:3456/api/v1/keys

# Agregar
curl -X POST http://localhost:3456/api/v1/keys \
  -H "Content-Type: application/json" \
  -d '{"key": "MI-NUEVA-LICENCIA"}'
```

## Configuración de Licencia

Editar `server.js` para cambiar los valores por defecto:

```javascript
const LICENSE_CONFIG = {
  validKeys: [
    'PANGOLIN-ENTERPRISE-2024',
    // Agregar más keys aquí
  ],
  defaults: {
    type: 'host',
    tier: 'enterprise',  // 'personal' o 'enterprise'
    maxUsers: 1000,      // Límite de usuarios
    maxSites: 100,       // Límite de sites
    validDays: 365       // Días de validez
  }
};
```

## Estructura del JWT

El servidor genera tokens JWT con esta estructura:

```json
{
  "valid": true,
  "type": "host",
  "tier": "enterprise",
  "quantity": 1000,
  "quantity_2": 100,
  "terminateAt": "2025-03-21T...",
  "iat": 1711036800,
  "exp": 1742572800
}
```
