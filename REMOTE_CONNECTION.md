# Conectarse al servidor MCP remoto (Koofr WebDAV)

Este servidor corre desplegado en Railway y expone el protocolo MCP sobre
**Streamable HTTP** (un único endpoint `/mcp`), protegido con **OAuth 2.1**
(authorization code + PKCE, con Dynamic Client Registration). Esto es lo que
permite agregarlo como "Connector" en Claude Code / claude.ai con solo pegar
la URL — sin editar `.mcp.json` a mano ni pasar credenciales por header.

Es un servidor **single-user**: hay un único "usuario" (definido por
`AUTH_USERNAME` / `AUTH_PASSWORD` en el entorno del servidor), que se
autentica una vez vía un formulario de login en el navegador. Esas
credenciales **no son las de Koofr** — son propias de este servidor.

## Endpoints expuestos

| Endpoint | Método | Propósito |
|---|---|---|
| `/mcp` | GET / POST / DELETE | Endpoint MCP (Streamable HTTP). Requiere `Authorization: Bearer <token>`. |
| `/.well-known/oauth-authorization-server` | GET | Metadata de discovery OAuth (RFC 8414). |
| `/.well-known/oauth-protected-resource/mcp` | GET | Metadata de recurso protegido (RFC 9728). |
| `/register` | POST | Dynamic Client Registration (RFC 7591). |
| `/authorize` | GET | Inicio del flujo de autorización — redirige al login. |
| `/login` | GET / POST | Formulario de login contra `AUTH_USERNAME` / `AUTH_PASSWORD`. |
| `/token` | POST | Intercambio de código de autorización (o refresh token) por access token. |
| `/health` | GET | Healthcheck simple, sin protocolo MCP ni auth. |

## Conectar desde Claude Code / claude.ai (Connector)

1. En Claude Code o claude.ai, andá a la configuración de Connectors / MCP
   servers y agregá uno nuevo con la URL base del servidor, por ejemplo:
   ```
   https://<tu-host>.up.railway.app
   ```
2. El cliente descubre automáticamente los endpoints OAuth (`/.well-known/...`),
   se auto-registra vía `/register`, y abre el navegador en `/authorize`.
3. Iniciás sesión con `AUTH_USERNAME` / `AUTH_PASSWORD` en el formulario que
   aparece.
4. El cliente recibe el token y queda conectado — las tools quedan
   disponibles con el prefijo del connector, por ejemplo
   `webdav-koofr__webdav_list_remote_directory`.

No hace falta editar `.mcp.json` a mano para este flujo; el "Add OAuth Client
ID" que pide la UI cuando falla el registro automático ya no es necesario una
vez que el servidor implementa DCR (`/register`).

### Alternativa: `.mcp.json` manual

Si preferís (o tu cliente no soporta el flujo OAuth interactivo), podés
generar un access token manualmente siguiendo el flujo de abajo y pegarlo
como header:

```json
{
  "mcpServers": {
    "webdav-koofr": {
      "type": "http",
      "url": "https://<tu-host>.up.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer <access_token>"
      }
    }
  }
}
```

Tené en cuenta que los access tokens expiran (1 hora por defecto) y no hay
refresco automático fuera del flujo OAuth completo — para uso prolongado,
preferí el Connector nativo.

## Conectar desde un bot (Telegram, WhatsApp, etc.)

WhatsApp y Telegram no hablan MCP nativamente. El bot actúa como
intermediario: recibe el mensaje del usuario, se lo pasa a un cliente/LLM
que sí entiende MCP, y ese cliente es quien se autentica y llama a este
servidor.

Para un bot de producción, la forma correcta es que el bot use el
`@modelcontextprotocol/sdk` del lado cliente (`Client` +
`StreamableHTTPClientTransport`), que ya implementa el flujo OAuth completo
(discovery, DCR, PKCE, refresh). El bot hace el login una sola vez (por
ejemplo, corriendo el flujo interactivo una vez al desplegar, o exponiendo
un endpoint de callback propio) y guarda el `refresh_token` para renovar el
access token sin volver a pedir credenciales.

Flujo manual de referencia (para debugging o para bots muy simples que
prefieren no traer el SDK completo):

```javascript
import { createHash, randomBytes } from 'node:crypto';

const BASE = 'https://<tu-host>.up.railway.app';

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 1. Registrar un cliente (una sola vez, guardar el client_id resultante)
const client = await fetch(`${BASE}/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    redirect_uris: ['http://localhost:9999/callback'],
    client_name: 'my-bot',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none'
  })
}).then(r => r.json());

// 2. Armar la URL de autorización con PKCE y abrirla en un navegador
//    (esto requiere interacción humana una sola vez)
const codeVerifier = base64url(randomBytes(32));
const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());

const authUrl = new URL(`${BASE}/authorize`);
authUrl.searchParams.set('client_id', client.client_id);
authUrl.searchParams.set('redirect_uri', 'http://localhost:9999/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
// abrir authUrl.toString() en un navegador, hacer login, capturar ?code=... en el callback

// 3. Intercambiar el code por tokens (guardar refresh_token de forma segura)
const tokens = await fetch(`${BASE}/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code /* capturado en el paso 2 */,
    redirect_uri: 'http://localhost:9999/callback',
    client_id: client.client_id,
    code_verifier: codeVerifier
  })
}).then(r => r.json());

// 4. Llamar al servidor MCP
async function mcpCall(body, sessionId) {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': `Bearer ${tokens.access_token}`
  };
  if (sessionId) headers['mcp-session-id'] = sessionId;
  const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, sessionId: res.headers.get('mcp-session-id'), text: await res.text() };
}

const init = await mcpCall({
  jsonrpc: '2.0', id: 1, method: 'initialize',
  params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'my-bot', version: '1.0' } }
});
await mcpCall({ jsonrpc: '2.0', method: 'notifications/initialized' }, init.sessionId);
await mcpCall({
  jsonrpc: '2.0', id: 2, method: 'tools/call',
  params: { name: 'webdav_list_remote_directory', arguments: { path: '/' } }
}, init.sessionId);

// 5. Cuando el access_token expira, renovarlo con el refresh_token guardado:
const refreshed = await fetch(`${BASE}/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: client.client_id
  })
}).then(r => r.json());
```

## Tools disponibles

Ver [README.md](README.md#available-mcp-tools) para la lista completa. Las
más relevantes para un vault de Obsidian:

- `webdav_list_remote_directory` — listar carpetas/notas
- `webdav_get_remote_file` — leer una nota
- `webdav_create_remote_file` — crear una nota nueva
- `webdav_update_remote_file` — modificar una nota existente
- `webdav_delete_remote_item` — borrar una nota o carpeta
- `webdav_move_remote_item` / `webdav_copy_remote_item` — reorganizar notas

Todas las rutas son relativas al `WEBDAV_ROOT_PATH` configurado en el
servidor (ej. la carpeta del vault dentro de Koofr).

## Subir o leer archivos binarios (PDFs, imágenes, etc.)

`webdav_create_remote_file`, `webdav_update_remote_file` y
`webdav_get_remote_file` aceptan un parámetro opcional `encoding`, con
valores `"utf8"` (default) o `"base64"`.

El transporte MCP es JSON, que solo puede llevar texto — con `encoding:
"utf8"` (el default) el `content` se escribe literal como string. Para
notas Markdown esto es exactamente lo que querés. Para binarios (PDFs,
imágenes, adjuntos con bytes fuera del rango ASCII/UTF-8 válido), escribir
esos bytes como si fueran texto los corrompe: se re-codifican y el archivo
resultante no vuelve a abrir. La solución es pasar `encoding: "base64"`, que
hace que el servidor decodifique el string como base64 a bytes crudos antes
de escribirlo — y análogamente en la lectura, devuelve el archivo como
string base64 en vez de intentar decodificarlo como texto.

Ejemplo, subiendo un PDF:

```javascript
import { readFileSync } from 'node:fs';

const pdfBytes = readFileSync('documento.pdf');

await mcpCall({
  jsonrpc: '2.0', id: 10, method: 'tools/call',
  params: {
    name: 'webdav_create_remote_file',
    arguments: {
      path: '/documento.pdf',
      content: pdfBytes.toString('base64'),
      encoding: 'base64'
    }
  }
});
```

Y bajándolo de vuelta:

```javascript
const result = await mcpCall({
  jsonrpc: '2.0', id: 11, method: 'tools/call',
  params: { name: 'webdav_get_remote_file', arguments: { path: '/documento.pdf', encoding: 'base64' } }
});

const base64Content = result.parsed.result.content[0].text;
const pdfBytes = Buffer.from(base64Content, 'base64'); // idéntico byte a byte al original
```

No hace falta ningún parche manual de bytes ni renombrar archivos a `.txt`
— `encoding: "base64"` cubre el caso general para cualquier archivo binario,
sin importar cuántos bytes no-ASCII tenga.

## Variables de entorno relevantes

| Variable | Propósito |
|---|---|
| `AUTH_ENABLED` | `true` para requerir OAuth en `/mcp`. Si es `false`, `/mcp` queda sin protección — no usar así en producción. |
| `AUTH_USERNAME` / `AUTH_PASSWORD` | Credenciales del único usuario, usadas en el formulario de `/login`. `AUTH_PASSWORD` acepta un hash bcrypt con prefijo `{bcrypt}`. |
| `PUBLIC_URL` | URL pública del servidor, usada como issuer/resource OAuth. En Railway se infiere de `RAILWAY_PUBLIC_DOMAIN` si no se define explícitamente. |
| `SERVER_PORT` | Puerto local de escucha (Railway inyecta `PORT`, que tiene prioridad). |

## Troubleshooting

- **"Couldn't register with ... sign-in service" / pide un OAuth Client ID
  manual**: el cliente intentó Dynamic Client Registration contra `/register`
  y falló. Confirmá que `AUTH_ENABLED=true` y que `PUBLIC_URL` (o
  `RAILWAY_PUBLIC_DOMAIN`) resuelve a la URL pública real y accesible por
  HTTPS — un `issuer`/`resource` mal armado hace que el discovery falle.
- **401 en `/mcp`**: falta el header `Authorization: Bearer <token>`, o el
  token expiró (1 hora) — hay que renovarlo con el refresh token o rehacer
  el login.
- **502 / connection refused**: el servidor no está escuchando en el puerto
  que el host espera. En Railway, la app debe leer `process.env.PORT`
  (inyectada automáticamente), no un puerto fijo.
- **400 en `/mcp`**: revisar que se esté mandando `mcp-session-id` en todas
  las requests después del `initialize`, y que el body sea JSON válido.
